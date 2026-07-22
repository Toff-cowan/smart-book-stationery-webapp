"""Staff role helpers for owner / employee access control."""

STAFF_ROLES = frozenset({"owner", "employee", "admin"})  # admin = legacy alias
OWNER_ROLES = frozenset({"owner", "admin"})  # admin treated as owner during transition


def normalize_role(role: str | None) -> str:
    return (role or "").strip().lower()


def is_staff(role: str | None) -> bool:
    return normalize_role(role) in STAFF_ROLES


def is_owner(role: str | None) -> bool:
    return normalize_role(role) in OWNER_ROLES


def is_employee(role: str | None) -> bool:
    return normalize_role(role) == "employee"
