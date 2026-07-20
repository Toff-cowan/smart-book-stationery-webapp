export type Department = "textbooks" | "stationery" | "gifts";

export type InventoryItem = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  quantity: number;
  department: Department;
  author: string | null;
  publisher: string | null;
  rating_stars: number | null;
  rating_count: number;
  image_url: string | null;
  is_active: boolean;
  category_id: number | null;
  school: string | null;
  grades: string[];
  units_sold?: number;
  order_count?: number;
};

export type SchoolFilter = {
  name: string;
  count: number;
};

export type GradeFilter = {
  name: string;
  count: number;
};

export type Pagination = {
  page: number;
  per_page: number;
  total: number;
  pages: number;
};

export type ApiListResponse<T> = {
  success: boolean;
  data: T[];
  pagination?: Pagination;
  message?: string;
};

export type ApiItemResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

export type User = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export type AuthLoginResponse = {
  success: boolean;
  token: string;
  user: User;
  message?: string;
};
