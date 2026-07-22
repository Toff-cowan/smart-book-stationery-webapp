/** Staff / customer role helpers (matches backend roles). */

export type UserRole = "customer" | "owner" | "employee" | "admin" | string;

const STAFF_ROLES = new Set(["owner", "employee", "admin"]);
const OWNER_ROLES = new Set(["owner", "admin"]);

export function isStaff(role: string | null | undefined): boolean {
  return STAFF_ROLES.has((role || "").trim().toLowerCase());
}

export function isOwner(role: string | null | undefined): boolean {
  return OWNER_ROLES.has((role || "").trim().toLowerCase());
}

export function isEmployee(role: string | null | undefined): boolean {
  return (role || "").trim().toLowerCase() === "employee";
}

export function roleLabel(role: string | null | undefined): string {
  switch ((role || "").trim().toLowerCase()) {
    case "owner":
    case "admin":
      return "Owner";
    case "employee":
      return "Employee";
    case "customer":
      return "Customer";
    default:
      return role || "Unknown";
  }
}
