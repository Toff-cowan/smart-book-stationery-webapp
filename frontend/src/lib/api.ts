import type {
  ApiItemResponse,
  ApiListResponse,
  AuthLoginResponse,
  Department,
  InventoryItem,
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
  page?: number;
  per_page?: number;
};

export function fetchInventory(query: InventoryQuery = {}) {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.department) params.set("department", query.department);
  if (query.page) params.set("page", String(query.page));
  params.set("per_page", String(query.per_page ?? 24));

  const qs = params.toString();
  return request<ApiListResponse<InventoryItem>>(
    `/api/inventory${qs ? `?${qs}` : ""}`,
  );
}

export function fetchInventoryItem(id: number) {
  return request<ApiItemResponse<InventoryItem>>(`/api/inventory/${id}`);
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

export { API_BASE };
