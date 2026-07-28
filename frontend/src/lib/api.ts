import type {
  ApiItemResponse,
  ApiListResponse,
  AuthLoginResponse,
  Department,
  GradeFilter,
  InventoryItem,
  BooklistSchool,
  ProductRating,
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

export type OcrTitleLine = {
  id: string;
  text: string;
  title?: string;
  author?: string | null;
  confidence: number;
  raw?: string;
};

export type BookMatchSuggestion = {
  product_id: number;
  name: string;
  author: string | null;
  isbn?: string | null;
  price: number;
  stock: number;
  school: string | null;
  grades: string[];
  confidence: number;
  did_you_mean: string | null;
};

export type BookMatchResult = {
  query: string;
  author?: string | null;
  status: "matched" | "suggested" | "unmatched";
  match: BookMatchSuggestion | null;
  suggestions: BookMatchSuggestion[];
  message: string | null;
};

export async function scanBooklistImage(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/api/booklists/scan`, {
    method: "POST",
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (body as { message?: string }).message ||
        `Scan failed (${res.status})`,
      res.status,
    );
  }
  return body as {
    success: boolean;
    data: {
      lines: OcrTitleLine[];
      count: number;
      preview_jpeg_base64: string | null;
      message: string;
      grade?: string | null;
      school?: string | null;
      engine?: string;
      model?: string;
    };
  };
}

export function matchBooklistTitles(payload: {
  grade?: string | null;
  titles: Array<string | { text: string; title?: string; author?: string | null }>;
}) {
  return request<{
    success: boolean;
    data: {
      results: BookMatchResult[];
      catalog: InventoryItem[];
      school: string | null;
      grade: string | null;
      catalog_count: number;
    };
  }>("/api/booklists/match", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchInventoryItem(id: number) {
  return request<ApiItemResponse<InventoryItem>>(`/api/inventory/${id}`);
}

export function fetchProductRatings(id: number) {
  return request<{
    success: boolean;
    data: ProductRating[];
    summary: {
      rating_stars: number | null;
      rating_count: number;
    };
  }>(`/api/inventory/${id}/ratings`);
}

export function submitProductRating(
  id: number,
  payload: { stars: number; comment?: string | null },
  token: string,
) {
  return request<{
    success: boolean;
    message?: string;
    data: ProductRating;
    product: InventoryItem;
  }>(
    `/api/inventory/${id}/ratings`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteProductRating(id: number, token: string) {
  return request<{
    success: boolean;
    message?: string;
    product: InventoryItem;
  }>(`/api/inventory/${id}/ratings`, { method: "DELETE" }, token);
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
  return request<{
    success: boolean;
    message?: string;
    emailed?: boolean;
    data: unknown;
  }>("/api/newsletter/subscribe", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export type NewsletterSubscriber = {
  id: number;
  email: string;
  created_at: string | null;
};

export function fetchAdminNewsletterSubscribers(token: string) {
  return request<ApiListResponse<NewsletterSubscriber> & { count?: number }>(
    "/api/admin/newsletter/subscribers",
    {},
    token,
  );
}

export async function broadcastAdminNewsletter(
  payload: {
    subject: string;
    message: string;
    include_registered_customers?: boolean;
    image?: File | null;
  },
  token: string,
) {
  const form = new FormData();
  form.append("subject", payload.subject);
  form.append("message", payload.message);
  form.append(
    "include_registered_customers",
    payload.include_registered_customers ? "true" : "false",
  );
  if (payload.image) {
    form.append("file", payload.image);
  }

  const res = await fetch(`${API_BASE}/api/admin/newsletter/broadcast`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (body as { message?: string }).message ||
        `Broadcast failed (${res.status})`,
      res.status,
    );
  }
  return body as {
    success: boolean;
    message?: string;
    data: { sent: number; failed: number; total: number };
  };
}

export function login(email: string, password: string) {
  return request<AuthLoginResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function loginWithGoogle(accessToken: string) {
  return request<AuthLoginResponse>("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken }),
  });
}

export function register(name: string, email: string, password: string) {
  return request<ApiItemResponse<User>>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function fetchMe(token: string) {
  return request<ApiItemResponse<User>>("/api/auth/me", {}, token);
}

export function updateProfile(
  payload: { name?: string; email?: string; phone?: string | null },
  token: string,
) {
  return request<ApiItemResponse<User> & { message?: string }>(
    "/api/auth/me",
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function uploadAvatar(file: File, token: string) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/auth/me/avatar`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (body as { message?: string }).message ||
        `Avatar upload failed (${res.status})`,
      res.status,
    );
  }
  return body as ApiItemResponse<User> & { message?: string };
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
  contact_email?: string | null;
  contact_phone?: string | null;
};

export function addToCartBulk(
  items: Array<{ product_id: number; quantity: number }>,
  token: string,
) {
  return request<{
    success: boolean;
    message?: string;
    added: number;
    skipped: Array<{ product_id?: number; name?: string; reason: string }>;
    data: Cart;
  }>(
    "/api/cart/items/bulk",
    {
      method: "POST",
      body: JSON.stringify({ items }),
    },
    token,
  );
}

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
  options: {
    notes?: string;
    fulfillment_type?: "pickup" | "reserve";
    contact_email: string;
    contact_phone: string;
  },
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
        contact_email: options.contact_email,
        contact_phone: options.contact_phone,
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
  contact_email?: string | null;
  contact_phone?: string | null;
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
  contact_email?: string | null;
  contact_phone?: string | null;
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

export type AdminUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  phone?: string | null;
  last_login_at?: string | null;
  last_admin_login_at?: string | null;
  created_at?: string | null;
};

export type HeroSlideRecord = {
  id: number;
  subtitle: string;
  primary_label: string;
  primary_href: string;
  secondary_label: string;
  secondary_href: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export function fetchAdminOrders(
  token: string,
  params: {
    bucket?: "outstanding" | "completed" | "cancelled";
    status?: string;
  } = {},
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
  return request<
    ApiItemResponse<AdminOrder> & {
      message?: string;
      emailed?: boolean;
      emailed_to?: string | null;
    }
  >(
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
    emailed_to?: string | null;
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

export function fetchAdminUsers(
  token: string,
  params: { role?: string } = {},
) {
  const qs = new URLSearchParams();
  if (params.role) qs.set("role", params.role);
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<ApiListResponse<AdminUser>>(
    `/api/admin/users${suffix}`,
    {},
    token,
  );
}

export function createAdminStaffUser(
  payload: {
    name: string;
    email: string;
    password: string;
    role: "employee" | "owner";
  },
  token: string,
) {
  return request<ApiItemResponse<AdminUser> & { message?: string }>(
    "/api/admin/users",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteAdminStaffUser(userId: number, token: string) {
  return request<ApiItemResponse<{ id: number }> & { message?: string }>(
    `/api/admin/users/${userId}`,
    { method: "DELETE" },
    token,
  );
}

export function fetchHeroSlides() {
  return request<ApiListResponse<HeroSlideRecord>>("/api/hero-slides");
}

export function fetchAdminHeroSlides(token: string) {
  return request<ApiListResponse<HeroSlideRecord>>(
    "/api/admin/hero-slides",
    {},
    token,
  );
}

export function createAdminHeroSlide(
  payload: {
    subtitle: string;
    primary_label?: string;
    primary_href?: string;
    secondary_label?: string;
    secondary_href?: string;
    sort_order?: number;
    is_active?: boolean;
  },
  token: string,
) {
  return request<ApiItemResponse<HeroSlideRecord> & { message?: string }>(
    "/api/admin/hero-slides",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateAdminHeroSlide(
  slideId: number,
  payload: Partial<{
    subtitle: string;
    primary_label: string;
    primary_href: string;
    secondary_label: string;
    secondary_href: string;
    sort_order: number;
    is_active: boolean;
  }>,
  token: string,
) {
  return request<ApiItemResponse<HeroSlideRecord> & { message?: string }>(
    `/api/admin/hero-slides/${slideId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteAdminHeroSlide(slideId: number, token: string) {
  return request<ApiItemResponse<{ id: number }> & { message?: string }>(
    `/api/admin/hero-slides/${slideId}`,
    { method: "DELETE" },
    token,
  );
}

export async function uploadAdminHeroSlideImage(
  slideId: number,
  file: File,
  token: string,
) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/api/admin/hero-slides/${slideId}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (body as { message?: string }).message ||
        `Carousel image upload failed (${res.status})`,
      res.status,
    );
  }
  return body as ApiItemResponse<HeroSlideRecord> & { message?: string };
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
    vendor: string | null;
    isbn: string | null;
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

export function deleteAdminInventoryItem(itemId: number, token: string) {
  return request<ApiItemResponse<{ id: number }>>(
    `/api/admin/inventory/${itemId}`,
    { method: "DELETE" },
    token,
  );
}

export async function uploadAdminInventoryImage(
  itemId: number,
  file: File,
  token: string,
) {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/admin/inventory/${itemId}/image`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  } catch {
    throw new ApiError(
      `Cannot reach API at ${API_BASE}. Is the backend running?`,
      0,
    );
  }

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (body as { message?: string }).message ||
        `Image upload failed (${res.status})`,
      res.status,
    );
  }
  return body as ApiItemResponse<InventoryItem> & { message?: string };
}

export type CustomerOrderItem = {
  id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type CustomerOrder = {
  id: number;
  status: string;
  title: string | null;
  fulfillment_type: string | null;
  notes: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  grand_total: number;
  submitted_at: string | null;
  items: CustomerOrderItem[];
};

export type AppNotification = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  booklist_id: number | null;
  is_read: boolean;
  created_at: string | null;
};

export function fetchCustomerOrders(token: string) {
  return request<ApiListResponse<CustomerOrder>>(
    "/api/booklists/orders",
    {},
    token,
  );
}

export function deleteCustomerOrder(orderId: number, token: string) {
  return request<{
    success: boolean;
    message?: string;
    emailed?: boolean;
    data: CustomerOrder;
  }>(`/api/booklists/orders/${orderId}`, { method: "DELETE" }, token);
}

export function fetchNotifications(token: string) {
  return request<ApiListResponse<AppNotification>>(
    "/api/notifications",
    {},
    token,
  );
}

export function markNotificationRead(
  notificationId: number,
  token: string,
) {
  return request<ApiItemResponse<AppNotification>>(
    `/api/notifications/${notificationId}/read`,
    { method: "POST" },
    token,
  );
}

export function markAllNotificationsRead(token: string) {
  return request<{ success: boolean; message?: string }>(
    "/api/notifications/read-all",
    { method: "POST" },
    token,
  );
}

export { API_BASE };
