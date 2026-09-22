from enum import StrEnum


class Role(StrEnum):
    GUEST = "guest"
    USER = "user"
    ADMIN = "admin"
    VENDOR = "vendor"


class Permission(StrEnum):
    CATALOG_READ = "catalog:read"
    DEMO_USE = "demo:use"
    PROJECTS_OWN = "projects:own"
    API_KEYS_MANAGE = "api_keys:manage"
    CATALOG_WRITE = "catalog:write"
    CATALOG_PROPOSE = "catalog:propose"
    NORMS_WRITE = "norms:write"
    USERS_MANAGE = "users:manage"
    ANALYTICS_READ = "analytics:read"


_GUEST = frozenset({Permission.CATALOG_READ, Permission.DEMO_USE})
_USER = _GUEST | {Permission.PROJECTS_OWN, Permission.API_KEYS_MANAGE}

ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.GUEST: _GUEST,
    Role.USER: _USER,
    Role.VENDOR: _USER | {Permission.CATALOG_PROPOSE},
    Role.ADMIN: frozenset(Permission),
}


def has_permission(role: Role, permission: Permission) -> bool:
    return permission in ROLE_PERMISSIONS[role]


API_KEY_SCOPE_PERMISSIONS: dict[str, Permission] = {
    "projects:write": Permission.PROJECTS_OWN,
    "catalog:write": Permission.CATALOG_WRITE,
    "norms:write": Permission.NORMS_WRITE,
}


def scopes_allowed(role: Role, scopes: list[str]) -> bool:
    """An API key can never grant more than its owner's role."""
    return all(
        scope in API_KEY_SCOPE_PERMISSIONS and has_permission(role, API_KEY_SCOPE_PERMISSIONS[scope])
        for scope in scopes
    )
