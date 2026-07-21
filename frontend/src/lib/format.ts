import type { Department } from "@/lib/types";

const COVER_TONES: Record<Department, [string, string]> = {
  textbooks: ["#1a4a42", "#3d7a6e"],
  stationery: ["#2c3e50", "#5d7a8c"],
  gifts: ["#4a3728", "#8b6b4a"],
};

export function coverGradient(department: Department) {
  const [a, b] = COVER_TONES[department] ?? COVER_TONES.stationery;
  return `linear-gradient(145deg, ${a} 0%, ${b} 100%)`;
}

export function formatPrice(price: number) {
  // Default USD formatting for non-React callers; UI should prefer useCurrency().
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(price);
}

/** Resolve product image paths (relative API uploads or absolute URLs). */
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const value = path.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }
  const base =
    process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:5000";
  return value.startsWith("/") ? `${base}${value}` : `${base}/${value}`;
}

export function departmentLabel(department: Department) {
  switch (department) {
    case "textbooks":
      return "Textbooks";
    case "stationery":
      return "Stationery";
    case "gifts":
      return "Gifts";
    default:
      return department;
  }
}
