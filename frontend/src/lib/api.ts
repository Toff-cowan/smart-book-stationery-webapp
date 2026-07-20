import type {
  ApiItemResponse,
  ApiListResponse,
  AuthLoginResponse,
  Department,
  GradeFilter,
  InventoryItem,
  BooklistSchool,
  SchoolFilter,
  User,
} from "./types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:5000";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (body as { message?: string }).message || `Request failed (${res.status})`,
      res.status,
    );
  }
  return body as T;
}

export type InventoryQuery = {
  q?: string;
  department?: Department | "";
  school?: string;
  grade?: string;
  page?: number;
  per_page?: number;
};

export function fetchInventory(query: InventoryQuery = {}) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.department) params.set("department", query.department);
  if (query.school?.trim()) params.set("school", query.school.trim());
  if (query.grade?.trim()) params.set("grade", query.grade.trim());
  if (query.page) params.set("page", String(query.page));
  params.set("per_page", String(query.per_page ?? 24));

  const qs = params.toString();
  return request<ApiListResponse<InventoryItem>>(
    `/api/inventory${qs ? `?${qs}` : ""}`,
  );
}

export function fetchSchools() {
  return request<ApiListResponse<SchoolFilter>>("/api/inventory/schools");
}

export function fetchGrades() {
  return request<ApiListResponse<GradeFilter>>("/api/inventory/grades");
}

export function fetchBooklistSchools(q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  const qs = params.toString();
  return request<ApiListResponse<BooklistSchool>>(
    `/api/booklists/schools${qs ? `?${qs}` : ""}`,
  );
}

export function fetchInventoryItem(id: number) {
  return request<ApiItemResponse<InventoryItem>>(`/api/inventory/${id}`);
}

export function fetchBestsellers(limit = 8) {
  return request<ApiListResponse<InventoryItem>>(
    `/api/inventory/bestsellers?limit=${limit}`,
  );
}

export function fetchRecommended(limit = 8) {
  return request<ApiListResponse<InventoryItem>>(
    `/api/inventory/recommended?limit=${limit}`,
  );
}

export function subscribeNewsletter(email: string) {
  return request<{ success: boolean; message?: string; data: unknown }>(
    "/api/newsletter/subscribe",
    {
      method: "POST",
      body: JSON.stringify({ email }),
    },
  );
}

export function login(email: string, password: string) {
  return request<AuthLoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function register(name: string, email: string, password: string) {
  return request<ApiItemResponse<User>>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function addToCart(
  productId: number,
  quantity: number,
  token: string,
) {
  return request(
    "/api/cart/items",
    {
      method: "POST",
      body: JSON.stringify({ product_id: productId, quantity }),
    },
    token,
  );
}

export type CartItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url?: string | null;
  department?: Department | null;
  stock?: number | null;
  author?: string | null;
};

export type Cart = {
  id: number;
  grand_total: number;
  items: CartItem[];
  status?: string;
  notes?: string | null;
};

export function fetchCart(token: string) {
  return request<ApiItemResponse<Cart>>("/api/cart", {}, token);
}

export function updateCartItem(
  itemId: number,
  quantity: number,
  token: string,
) {
  return request<ApiItemResponse<Cart>>(
    `/api/cart/items/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ quantity }),
    },
    token,
  );
}

export function removeCartItem(itemId: number, token: string) {
  return request<ApiItemResponse<Cart>>(
    `/api/cart/items/${itemId}`,
    { method: "DELETE" },
    token,
  );
}

export function submitCartRequest(
  token: string,
  options: { notes?: string; fulfillment_type?: "pickup" | "reserve" } = {},
) {
  return request<{
    success: boolean;
    message?: string;
    emailed?: boolean;
    data: Cart;
  }>(
    "/api/cart/checkout",
    {
      method: "POST",
      body: JSON.stringify({
        fulfillment_type: options.fulfillment_type ?? "pickup",
        notes: options.notes ?? null,
        title: "Cart request",
      }),
    },
    token,
  );
}

export async function uploadBooklistFile(
  file: File,
  options: { school: string; token?: string | null; notes?: string },
) {
  const form = new FormData();
  form.append("file", file);
  form.append("school", options.school.trim());
  if (options.notes?.trim()) form.append("notes", options.notes.trim());

  const headers: HeadersInit = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const res = await fetch(`${API_BASE}/api/booklists/upload`, {
    method: "POST",
    headers,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (body as { message?: string }).message || `Upload failed (${res.status})`,
      res.status,
    );
  }
  return body as { success: boolean; message?: string; data: unknown };
}

export type AdminOrderCustomer = {
  id: number;
  name: string;
  email: string;
};

export type AdminOrderItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type AdminOrder = {
  id: number;
  user_id: number;
  status: string;
  title: string | null;
  fulfillment_type: string | null;
  notes: string | null;
  grand_total: number;
  submitted_at: string | null;
  item_count?: number;
  customer: AdminOrderCustomer | null;
  items: AdminOrderItem[];
};

export type SalesPoint = {
  date: string;
  order_count: number;
  revenue: number;
};

export type AdminSummary = {
  outstanding: number;
  completed: number;
  cancelled: number;
  revenue: number;
};

export function fetchAdminOrders(
  token: string,
  params: { bucket?: "outstanding" | "completed"; status?: string } = {},
) {
  const qs = new URLSearchParams();
  if (params.bucket) qs.set("bucket", params.bucket);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<ApiListResponse<AdminOrder>>(
    `/api/admin/orders${suffix}`,
    {},
    token,
  );
}

export function fetchAdminOrder(orderId: number, token: string) {
  return request<ApiItemResponse<AdminOrder>>(
    `/api/admin/orders/${orderId}`,
    {},
    token,
  );
}

export function updateAdminOrderStatus(
  orderId: number,
  status: string,
  token: string,
) {
  return request<ApiItemResponse<AdminOrder>>(
    `/api/admin/orders/${orderId}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status }),
    },
    token,
  );
}

export function notifyAdminOrderCustomer(
  orderId: number,
  payload: {
    message: string;
    confirmed_total?: number;
    ready_at?: string;
  },
  token: string,
) {
  return request<{
    success: boolean;
    message?: string;
    emailed?: boolean;
    data: AdminOrder;
  }>(
    `/api/admin/orders/${orderId}/notify`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function fetchAdminSummary(token: string) {
  return request<ApiItemResponse<AdminSummary>>(
    "/api/admin/stats/summary",
    {},
    token,
  );
}

export function fetchAdminSales(token: string, days = 30) {
  return request<ApiListResponse<SalesPoint>>(
    `/api/admin/stats/sales?days=${days}`,
    {},
    token,
  );
}

export function fetchAdminInventory(token: string) {
  return request<ApiListResponse<InventoryItem>>(
    "/api/admin/inventory",
    {},
    token,
  );
}

export function updateAdminInventoryItem(
  itemId: number,
  payload: Partial<{
    quantity: number;
    price: number;
    is_active: boolean;
    name: string;
    department: Department;
    description: string | null;
    author: string | null;
    publisher: string | null;
    image_url: string | null;
  }>,
  token: string,
) {
  return request<ApiItemResponse<InventoryItem>>(
    `/api/admin/inventory/${itemId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export { API_BASE };
