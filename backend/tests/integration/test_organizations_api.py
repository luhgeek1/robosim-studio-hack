import asyncio

import pytest
from httpx import AsyncClient

from tests.conftest import bearer, login

pytestmark = pytest.mark.integration

ORGS = "/api/v1/organizations"
PROJECTS = "/api/v1/projects"
INVITATIONS = "/api/v1/me/invitations"
OWNER = "user@robomera.demo"
INVITEE = "vendor@robomera.demo"
STRANGER = "admin@robomera.demo"


async def _auth(client: AsyncClient, email: str) -> dict[str, str]:
    return bearer((await login(client, email))["access"])


async def _org_with_member(client: AsyncClient) -> tuple[dict, dict[str, str], dict[str, str]]:
    owner = await _auth(client, OWNER)
    invitee = await _auth(client, INVITEE)
    org = (await client.post(ORGS, json={"name": "Логистика Север"}, headers=owner)).json()
    await client.post(f"{ORGS}/{org['id']}/invitations", json={"email": INVITEE}, headers=owner)
    invitation = (await client.get(INVITATIONS, headers=invitee)).json()["items"][0]
    accepted = await client.post(f"{INVITATIONS}/{invitation['id']}/accept", headers=invitee)
    assert accepted.status_code == 200, accepted.text
    return org, owner, invitee


async def test_create_invite_accept_share_projects(client: AsyncClient) -> None:
    owner = await _auth(client, OWNER)
    created = await client.post(ORGS, json={"name": "Логистика Север"}, headers=owner)
    assert created.status_code == 201
    org = created.json()
    assert org["role"] == "owner"
    assert org["members_count"] == 1

    invited = await client.post(f"{ORGS}/{org['id']}/invitations", json={"email": INVITEE}, headers=owner)
    assert invited.status_code == 201
    assert invited.json()["invitee_registered"] is True
    again = await client.post(f"{ORGS}/{org['id']}/invitations", json={"email": INVITEE}, headers=owner)
    assert again.status_code == 409

    invitee = await _auth(client, INVITEE)
    incoming = (await client.get(INVITATIONS, headers=invitee)).json()["items"]
    assert [i["organization_name"] for i in incoming] == ["Логистика Север"]
    assert (await client.get(f"{ORGS}/{org['id']}", headers=invitee)).status_code == 404

    accepted = await client.post(f"{INVITATIONS}/{incoming[0]['id']}/accept", headers=invitee)
    assert accepted.json()["role"] == "member"
    assert (await client.get(INVITATIONS, headers=invitee)).json()["items"] == []

    shared = await client.post(
        PROJECTS,
        json={"name": "Общий склад", "object_type": "warehouse", "organization_id": org["id"]},
        headers=owner,
    )
    assert shared.json()["organization_id"] == org["id"]
    personal = await client.post(
        PROJECTS, json={"name": "Мой склад", "object_type": "warehouse"}, headers=owner
    )

    listed = (await client.get(PROJECTS, params={"organization_id": org["id"]}, headers=invitee)).json()
    assert [p["name"] for p in listed["items"]] == ["Общий склад"]
    assert (await client.get(PROJECTS, headers=invitee)).json()["total"] == 0
    assert (await client.get(f"{PROJECTS}/{shared.json()['id']}", headers=invitee)).status_code == 200
    assert (await client.get(f"{PROJECTS}/{personal.json()['id']}", headers=invitee)).status_code == 404
    owner_personal = (await client.get(PROJECTS, headers=owner)).json()
    assert [p["name"] for p in owner_personal["items"]] == ["Мой склад"]

    detail = (await client.get(f"{ORGS}/{org['id']}", headers=invitee)).json()
    assert {m["email"] for m in detail["members"]} == {OWNER, INVITEE}
    assert detail["projects_count"] == 1


async def test_organization_name_is_trimmed_and_not_blank(client: AsyncClient) -> None:
    owner = await _auth(client, OWNER)
    blank = await client.post(ORGS, json={"name": "  \t"}, headers=owner)
    assert blank.status_code == 422

    created = await client.post(ORGS, json={"name": "  Логистика Север  "}, headers=owner)
    assert created.status_code == 201
    org = created.json()
    assert org["name"] == "Логистика Север"

    renamed = await client.patch(f"{ORGS}/{org['id']}", json={"name": "  \n"}, headers=owner)
    assert renamed.status_code == 422
    detail = await client.get(f"{ORGS}/{org['id']}", headers=owner)
    assert detail.json()["name"] == "Логистика Север"


async def test_outsider_cannot_see_or_create_in_organization(client: AsyncClient) -> None:
    owner = await _auth(client, OWNER)
    org = (await client.post(ORGS, json={"name": "Закрытая"}, headers=owner)).json()
    stranger = await _auth(client, INVITEE)
    listed = await client.get(PROJECTS, params={"organization_id": org["id"]}, headers=stranger)
    assert listed.status_code == 404
    payload = {"name": "x", "object_type": "warehouse", "organization_id": org["id"]}
    assert (await client.post(PROJECTS, json=payload, headers=stranger)).status_code == 404
    assert (await client.get(ORGS, headers=stranger)).json()["items"] == []


async def test_decline_and_revoke(client: AsyncClient) -> None:
    owner = await _auth(client, OWNER)
    invitee = await _auth(client, INVITEE)
    org = (await client.post(ORGS, json={"name": "Отказ"}, headers=owner)).json()
    first = (
        await client.post(f"{ORGS}/{org['id']}/invitations", json={"email": INVITEE}, headers=owner)
    ).json()
    assert (await client.post(f"{INVITATIONS}/{first['id']}/decline", headers=invitee)).status_code == 204
    assert (await client.post(f"{INVITATIONS}/{first['id']}/accept", headers=invitee)).status_code == 404

    second = (
        await client.post(f"{ORGS}/{org['id']}/invitations", json={"email": INVITEE}, headers=owner)
    ).json()
    revoked = await client.delete(f"{ORGS}/{org['id']}/invitations/{second['id']}", headers=owner)
    assert revoked.status_code == 204
    assert (await client.get(INVITATIONS, headers=invitee)).json()["items"] == []


async def test_unregistered_email_is_invited(client: AsyncClient) -> None:
    owner = await _auth(client, OWNER)
    org = (await client.post(ORGS, json={"name": "Будущие"}, headers=owner)).json()
    invited = await client.post(
        f"{ORGS}/{org['id']}/invitations", json={"email": "new.person@example.com"}, headers=owner
    )
    assert invited.json()["invitee_registered"] is False
    detail = (await client.get(f"{ORGS}/{org['id']}", headers=owner)).json()
    assert [i["email"] for i in detail["invitations"]] == ["new.person@example.com"]


async def test_concurrent_duplicate_invitation_returns_conflict(client: AsyncClient) -> None:
    owner = await _auth(client, OWNER)
    org = (await client.post(ORGS, json={"name": "Параллельные приглашения"}, headers=owner)).json()
    responses = await asyncio.gather(
        client.post(f"{ORGS}/{org['id']}/invitations", json={"email": INVITEE}, headers=owner),
        client.post(f"{ORGS}/{org['id']}/invitations", json={"email": INVITEE}, headers=owner),
    )
    assert sorted(response.status_code for response in responses) == [201, 409]


async def test_invitation_is_case_insensitive_and_private(client: AsyncClient) -> None:
    owner = await _auth(client, OWNER)
    invitee = await _auth(client, INVITEE)
    stranger = await _auth(client, STRANGER)
    org = (await client.post(ORGS, json={"name": "Адресат"}, headers=owner)).json()
    invited = await client.post(
        f"{ORGS}/{org['id']}/invitations", json={"email": "VENDOR@ROBOMERA.DEMO"}, headers=owner
    )
    invitation = invited.json()
    assert invitation["email"] == INVITEE
    assert invitation["invitee_registered"] is True
    assert (
        await client.post(f"{INVITATIONS}/{invitation['id']}/accept", headers=stranger)
    ).status_code == 404
    assert (
        await client.post(f"{INVITATIONS}/{invitation['id']}/decline", headers=stranger)
    ).status_code == 404
    assert (await client.post(f"{INVITATIONS}/{invitation['id']}/accept", headers=invitee)).status_code == 200


async def test_member_rights_leave_and_last_owner(client: AsyncClient) -> None:
    org, owner, invitee = await _org_with_member(client)
    owner_id = next(
        m["user_id"]
        for m in (await client.get(f"{ORGS}/{org['id']}", headers=owner)).json()["members"]
        if m["email"] == OWNER
    )
    invite = await client.post(f"{ORGS}/{org['id']}/invitations", json={"email": "a@b.ru"}, headers=invitee)
    assert invite.status_code == 403
    assert (await client.patch(f"{ORGS}/{org['id']}", json={"name": "x"}, headers=invitee)).status_code == 403
    assert (await client.delete(f"{ORGS}/{org['id']}/members/{owner_id}", headers=invitee)).status_code == 403
    assert (await client.delete(f"{ORGS}/{org['id']}/members/{owner_id}", headers=owner)).status_code == 409

    shared = await client.post(
        PROJECTS,
        json={"name": "Общий", "object_type": "warehouse", "organization_id": org["id"]},
        headers=owner,
    )
    project_id = shared.json()["id"]
    assert (await client.delete(f"{PROJECTS}/{project_id}", headers=invitee)).status_code == 403

    me = (await client.get("/api/v1/me", headers=invitee)).json()
    assert (await client.delete(f"{ORGS}/{org['id']}/members/{me['id']}", headers=invitee)).status_code == 204
    assert (await client.get(f"{PROJECTS}/{project_id}", headers=invitee)).status_code == 404


async def test_move_project_between_workspaces(client: AsyncClient) -> None:
    org, owner, invitee = await _org_with_member(client)
    project = (
        await client.post(PROJECTS, json={"name": "Личный", "object_type": "warehouse"}, headers=owner)
    ).json()
    assert (await client.get(f"{PROJECTS}/{project['id']}", headers=invitee)).status_code == 404

    moved = await client.patch(
        f"{PROJECTS}/{project['id']}", json={"organization_id": org["id"]}, headers=owner
    )
    assert moved.json()["organization_id"] == org["id"]
    assert (await client.get(f"{PROJECTS}/{project['id']}", headers=invitee)).status_code == 200
    edited = await client.patch(
        f"{PROJECTS}/{project['id']}", json={"name": "Изменён участником"}, headers=invitee
    )
    assert edited.status_code == 200
    assert edited.json()["name"] == "Изменён участником"
    back = await client.patch(f"{PROJECTS}/{project['id']}", json={"organization_id": None}, headers=invitee)
    assert back.status_code == 403

    copied = await client.post(f"{PROJECTS}/{project['id']}/copy", headers=invitee)
    assert copied.json()["organization_id"] == org["id"]
    assert (await client.delete(f"{PROJECTS}/{copied.json()['id']}", headers=owner)).status_code == 204


async def test_delete_organization_removes_its_projects(client: AsyncClient) -> None:
    org, owner, invitee = await _org_with_member(client)
    shared = await client.post(
        PROJECTS,
        json={"name": "Общий", "object_type": "warehouse", "organization_id": org["id"]},
        headers=invitee,
    )
    assert (await client.delete(f"{ORGS}/{org['id']}", headers=invitee)).status_code == 403
    assert (await client.delete(f"{ORGS}/{org['id']}", headers=owner)).status_code == 204
    assert (await client.get(f"{PROJECTS}/{shared.json()['id']}", headers=owner)).status_code == 404
    assert (await client.get(ORGS, headers=invitee)).json()["items"] == []
