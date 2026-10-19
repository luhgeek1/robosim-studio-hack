from app.domain.auth import Permission, Role, has_permission, scopes_allowed


def test_guest_can_work_with_temporary_projects_without_privileged_permissions() -> None:
    assert has_permission(Role.GUEST, Permission.CATALOG_READ)
    assert has_permission(Role.GUEST, Permission.DEMO_USE)
    assert has_permission(Role.GUEST, Permission.PROJECTS_OWN)
    assert not has_permission(Role.GUEST, Permission.API_KEYS_MANAGE)
    assert not has_permission(Role.GUEST, Permission.CATALOG_WRITE)


def test_admin_has_every_permission() -> None:
    assert all(has_permission(Role.ADMIN, permission) for permission in Permission)


def test_vendor_proposes_but_does_not_write_catalog() -> None:
    assert has_permission(Role.VENDOR, Permission.CATALOG_PROPOSE)
    assert not has_permission(Role.VENDOR, Permission.CATALOG_WRITE)


def test_api_key_scopes_bounded_by_role() -> None:
    assert scopes_allowed(Role.USER, ["projects:write"])
    assert not scopes_allowed(Role.USER, ["catalog:write"])
    assert not scopes_allowed(Role.ADMIN, ["unknown:scope"])
