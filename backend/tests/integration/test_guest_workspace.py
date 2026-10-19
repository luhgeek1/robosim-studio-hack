"""The guest uses exactly the same project → calculation → simulation → report API."""

import asyncio
import json
from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

import openpyxl
import pytest
from httpx import AsyncClient
from sqlalchemy import func, select, update

from app.core.config import Settings
from app.db.models import Job, Project, Source, StoredFile, User
from app.db.session import Database
from app.db.uow import UnitOfWork
from app.domain.jobs import JobStatus, JobType
from app.infra.importers.limits import GUEST_FILE_BYTES
from app.service.auth.guests import purge_expired_guests
from tests.conftest import bearer, login

pytestmark = pytest.mark.integration


async def guest(client: AsyncClient, *, web: bool = False) -> dict:
    response = await client.post("/api/v1/auth/guest", headers={"X-Client": "web" if web else "mobile"})
    assert response.status_code == 200, response.text
    return response.json()


async def project(client: AsyncClient, headers: dict, key: str | None = "warehouse_demo_01") -> dict:
    kind = "hospital" if key and key.startswith("hospital") else "warehouse"
    if key and key.startswith("airport"):
        kind = "airport"
    response = await client.post(
        "/api/v1/projects",
        headers=headers,
        json={
            "name": "Гостевой объект",
            "object_type": kind,
            "init": {"mode": "demo", "demo_key": key} if key else {"mode": "blank"},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def scenario(client: AsyncClient, project_id: str, headers: dict) -> str:
    matching = await client.get(f"/api/v1/projects/{project_id}/matching", headers=headers)
    assert matching.status_code == 200, matching.text
    transport = next(p for p in matching.json()["processes"] if p["process_key"] == "pallet_transport")
    product_id = next(c["product"]["id"] for c in transport["candidates"] if "H1500" in c["product"]["name"])
    response = await client.post(
        f"/api/v1/projects/{project_id}/scenarios",
        headers=headers,
        json={
            "name": "Гостевые паллеты",
            "kind": "purchase",
            "items": [{"process_key": "pallet_transport", "product_id": product_id}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


@pytest.mark.parametrize("key", ["warehouse_demo_01", "hospital_demo_01", "airport_demo_01"])
async def test_demo_copies_are_editable_and_isolated(client: AsyncClient, key: str) -> None:
    one, two = await guest(client), await guest(client)
    a, b = bearer(one["access_token"]), bearer(two["access_token"])
    original, other = await project(client, a, key), await project(client, b, key)
    assert original["id"] != other["id"]
    path = f"/api/v1/projects/{original['id']}"
    assert (await client.get(path, headers=b)).status_code == 404
    assert (await client.patch(path, json={"name": "Чужая правка"}, headers=b)).status_code == 404
    assert (await client.post(f"{path}/copy", json={}, headers=b)).status_code == 404
    for suffix in ("params", "layout", "scenarios", "export.json", "reports"):
        assert (await client.get(f"{path}/{suffix}", headers=b)).status_code == 404
    changed = await client.patch(path, json={"name": "Мой эксперимент"}, headers=a)
    assert changed.status_code == 200
    clean = await project(client, a, key)
    assert clean["name"] == "Гостевой объект"
    assert (await client.get("/api/v1/projects", headers=b)).json()["total"] == 1
    assert (await client.get(f"{path}/layout", headers=a)).json()["nodes"]


def upload(kind: str) -> tuple[str, bytes]:
    values = {"area_m2": 24000, "shift_hours": 8}
    if kind == "json":
        return "object.json", json.dumps(values).encode()
    if kind == "csv":
        return "object.csv", b"key;value\narea_m2;24000\nshift_hours;8\n"
    workbook = openpyxl.Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.append(["key", "value"])
    for key, value in values.items():
        sheet.append([key, value])
    out = BytesIO()
    workbook.save(out)
    return "object.xlsx", out.getvalue()


@pytest.mark.parametrize("kind", ["xlsx", "csv", "json"])
async def test_guest_imports_into_own_blank_project(client: AsyncClient, kind: str) -> None:
    headers = bearer((await guest(client))["access_token"])
    own = await project(client, headers, None)
    path = f"/api/v1/projects/{own['id']}"
    name, content = upload(kind)
    parsed = await client.post(f"{path}/import", headers=headers, files={"file": (name, content)})
    assert parsed.status_code == 200, parsed.text
    assert {r["key"] for r in parsed.json()["mapped"]} == {"area_m2", "shift_hours"}
    applied = await client.post(f"{path}/import/{parsed.json()['import_id']}/apply", headers=headers, json={})
    assert applied.status_code == 200, applied.text
    values = {p["key"]: p for p in applied.json()["params"]}
    assert values["area_m2"]["value"] == 24000
    assert values["area_m2"]["provenance"]["status"] == "imported"
    edited = await client.patch(f"{path}/params/area_m2", headers=headers, json={"value": 25000})
    assert edited.status_code == 200
    assert edited.json()["value"] == 25000


async def imported_project(client: AsyncClient, headers: dict) -> str:
    source = await project(client, headers)
    exported = (await client.get(f"/api/v1/projects/{source['id']}/export.json", headers=headers)).json()
    own = await project(client, headers, None)
    project_id = own["id"]
    parsed = await client.post(
        f"/api/v1/projects/{project_id}/import",
        headers=headers,
        files={"file": ("my-object.json", json.dumps(exported["params"]).encode())},
    )
    assert parsed.status_code == 200, parsed.text
    applied = await client.post(
        f"/api/v1/projects/{project_id}/import/{parsed.json()['import_id']}/apply", headers=headers, json={}
    )
    assert applied.status_code == 200, applied.text
    generated = await client.post(f"/api/v1/projects/{project_id}/layout/generate", headers=headers, json={})
    assert generated.status_code == 200, generated.text
    return project_id


async def test_guest_cjm_calculation_simulation_risks_comparison_and_real_reports(
    client: AsyncClient,
) -> None:
    headers = bearer((await guest(client))["access_token"])
    project_id = await imported_project(client, headers)
    scenario_id = await scenario(client, project_id, headers)
    calculated = await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)
    assert calculated.status_code == 200, calculated.text
    assert calculated.json()["metrics"]["capex_rub"] > 0
    assert calculated.json()["sizing"][0]["count"]["analytic"] > 0
    raas = await client.post(f"/api/v1/scenarios/{scenario_id}/copy", headers=headers, json={"kind": "raas"})
    assert raas.status_code == 201, raas.text
    assert (await client.get(f"/api/v1/projects/{project_id}/comparison", headers=headers)).status_code == 200
    sensitivity = await client.post(f"/api/v1/scenarios/{scenario_id}/sensitivity", headers=headers, json={})
    assert sensitivity.status_code == 200, sensitivity.text
    assert sensitivity.json()["items"]
    mc = await client.post(f"/api/v1/scenarios/{scenario_id}/monte-carlo", headers=headers, json={"n": 100})
    assert mc.status_code == 200, mc.text
    run = await client.post(
        f"/api/v1/scenarios/{scenario_id}/simulations", headers=headers, json={"mode": "peak", "seed": 5}
    )
    assert run.status_code == 202, run.text
    run_id = run.json()["id"]
    completed = (await client.get(f"/api/v1/simulations/{run_id}", headers=headers)).json()
    assert completed["status"] == "done", completed
    assert completed["summary"]["completed"] > 0
    assert completed["events_count"] > 0
    replay = (await client.get(f"/api/v1/simulations/{run_id}/replay", headers=headers)).json()
    assert replay["events"]
    assert replay["robots"]
    assert replay["layout"]["nodes"]
    intruder = bearer((await guest(client))["access_token"])
    for path in (f"/scenarios/{scenario_id}", f"/simulations/{run_id}", f"/simulations/{run_id}/replay"):
        assert (await client.get(f"/api/v1{path}", headers=intruder)).status_code == 404
    for fmt, signature in (("pdf", b"%PDF"), ("xlsx", b"PK")):
        report = await client.post(
            f"/api/v1/projects/{project_id}/reports", headers=headers, json={"format": fmt}
        )
        assert report.status_code == 202, report.text
        report_id = report.json()["id"]
        downloaded = await client.get(f"/api/v1/reports/{report_id}/download", headers=headers)
        assert downloaded.status_code == 200, downloaded.text[:500]
        assert downloaded.content.startswith(signature)
        assert (
            await client.get(f"/api/v1/reports/{report_id}/download", headers=intruder)
        ).status_code == 404


@pytest.mark.parametrize("action", ["register", "login"])
async def test_auth_keeps_guest_work_and_revokes_guest_identity(client: AsyncClient, action: str) -> None:
    pair = await guest(client, web=True)
    headers = bearer(pair["access_token"])
    own = await project(client, headers)
    scenario_id = await scenario(client, own["id"], headers)
    calculated = await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)
    assert calculated.status_code == 200, calculated.text
    report = await client.post(
        f"/api/v1/projects/{own['id']}/reports", headers=headers, json={"format": "json"}
    )
    report_id = report.json()["id"]
    downloaded = await client.get(f"/api/v1/reports/{report_id}/download", headers=headers)
    assert downloaded.status_code == 200, downloaded.text
    csrf = client.cookies["csrf_token"]
    expiry = pair["user"]["guest_expires_at"]
    refreshed = await client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf}, json={})
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["user"]["guest_expires_at"] == expiry
    csrf = client.cookies["csrf_token"]
    body = {"email": "saved@example.org", "password": "SafePassword123", "name": "Эксперт"}
    if action == "login":
        body = {"email": "user@robomera.demo", "password": "Demo12345!"}
    saved = await client.post(f"/api/v1/auth/{action}", json=body, headers={"X-Keep-Guest-CSRF": csrf})
    assert saved.status_code in {200, 201}, saved.text
    assert saved.json()["user"]["role"] == "user"
    assert saved.json()["user"]["guest_expires_at"] is None
    kept = await client.get(f"/api/v1/projects/{own['id']}", headers=bearer(saved.json()["access_token"]))
    assert kept.status_code == 200, kept.text
    assert kept.json()["owner_id"] == saved.json()["user"]["id"]
    new_headers = bearer(saved.json()["access_token"])
    kept_report = await client.get(f"/api/v1/reports/{report_id}/download", headers=new_headers)
    assert kept_report.content == downloaded.content
    kept_calc = await client.get(f"/api/v1/calculations/{calculated.json()['id']}", headers=new_headers)
    assert kept_calc.status_code == 200
    report_status = await client.get(f"/api/v1/reports/{report_id}", headers=new_headers)
    file_url = report_status.json()["file"]["url"]
    assert (await client.get(file_url, headers=new_headers)).status_code == 200
    assert (await client.get(f"/api/v1/projects/{own['id']}", headers=headers)).status_code == 401


async def test_guest_attach_needs_csrf_and_guest_cannot_use_privileged_features(client: AsyncClient) -> None:
    pair = await guest(client, web=True)
    headers = bearer(pair["access_token"])
    own = await project(client, headers)
    bad = await client.post(
        "/api/v1/auth/login",
        json={"email": "user@robomera.demo", "password": "Demo12345!"},
        headers={"X-Keep-Guest-CSRF": "wrong"},
    )
    assert bad.status_code == 403
    assert (await client.get(f"/api/v1/projects/{own['id']}", headers=headers)).status_code == 200
    for path, body in (
        ("/organizations", {"name": "Команда"}),
        ("/me/api-keys", {"name": "key", "scopes": []}),
    ):
        assert (await client.post(f"/api/v1{path}", headers=headers, json=body)).status_code == 403
    assert (await client.get("/api/v1/admin/users", headers=headers)).status_code == 403
    assert (await client.post("/api/v1/auth/guest")).status_code == 422


async def test_expiry_and_reset_delete_projects_jobs_files_but_keep_accounts(
    client: AsyncClient, settings: Settings
) -> None:
    pair = await guest(client, web=True)
    headers = bearer(pair["access_token"])
    own = await project(client, headers)
    imported = await client.post(
        f"/api/v1/projects/{own['id']}/import",
        headers=headers,
        files={"file": ("private.json", b'{"area_m2": 24000}')},
    )
    assert imported.status_code == 200
    applied = await client.post(
        f"/api/v1/projects/{own['id']}/import/{imported.json()['import_id']}/apply", headers=headers, json={}
    )
    assert applied.status_code == 200
    assert (
        await client.patch(
            f"/api/v1/projects/{own['id']}/params/area_m2", headers=headers, json={"value": 25000}
        )
    ).status_code == 200
    account = bearer((await login(client, "user@robomera.demo"))["access"])
    permanent = await project(client, account)
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            guest_id = UUID(pair["user"]["id"])
            await uow.session.execute(
                update(User)
                .where(User.id == guest_id)
                .values(guest_expires_at=datetime.now(UTC) - timedelta(seconds=1))
            )
            uow.session.add(Job(owner_id=guest_id, type=JobType.REPORT, status=JobStatus.DONE, payload={}))
            uow.session.add(
                StoredFile(
                    owner_id=guest_id,
                    project_id=UUID(own["id"]),
                    purpose="report",
                    filename="test",
                    content_type="text/plain",
                    size_bytes=1,
                    data=b"x",
                )
            )
            await uow.commit()
        assert (await client.get(f"/api/v1/projects/{own['id']}", headers=headers)).status_code == 401
        expired_refresh = await client.post(
            "/api/v1/auth/refresh", headers={"X-CSRF-Token": client.cookies["csrf_token"]}, json={}
        )
        assert expired_refresh.status_code == 401
        await purge_expired_guests(db)
        async with UnitOfWork(db.session()) as uow:
            assert await uow.users.get(guest_id) is None
            assert (
                await uow.session.scalar(
                    select(func.count())
                    .select_from(Source)
                    .where(Source.note == f"Загружен {pair['user']['email']}")
                )
                == 0
            )
            for model in (Project, Job, StoredFile):
                assert (
                    await uow.session.scalar(
                        select(func.count()).select_from(model).where(model.owner_id == guest_id)
                    )
                    == 0
                )
        assert (await client.get(f"/api/v1/projects/{permanent['id']}", headers=account)).status_code == 200
        another = await guest(client)
        next_headers = bearer(another["access_token"])
        await project(client, next_headers)
        assert (await client.delete("/api/v1/auth/guest", headers=next_headers)).status_code == 204
        assert (await client.get("/api/v1/projects", headers=next_headers)).status_code == 401
        assert (await client.delete("/api/v1/auth/guest", headers=account)).status_code == 403
    finally:
        await db.dispose()


async def test_limits_reject_large_files_zip_bombs_and_expensive_simulations(client: AsyncClient) -> None:
    headers = bearer((await guest(client))["access_token"])
    own = await project(client, headers)
    path = f"/api/v1/projects/{own['id']}"
    too_big = await client.post(
        f"{path}/import", headers=headers, files={"file": ("x.json", b" " * (GUEST_FILE_BYTES + 1))}
    )
    assert too_big.status_code == 413
    bomb = BytesIO()
    with ZipFile(bomb, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("xl/worksheets/sheet1.xml", b"0" * (26 * 1024 * 1024))
    assert (
        await client.post(f"{path}/import", headers=headers, files={"file": ("x.xlsx", bomb.getvalue())})
    ).status_code == 413
    scenario_id = await scenario(client, own["id"], headers)
    for payload in (
        {"mode": "normal", "duration_hours": 168},
        {"mode": "peak", "fleet_override": [{"process_key": "pallet_transport", "count": 100_000}]},
    ):
        response = await client.post(
            f"/api/v1/scenarios/{scenario_id}/simulations", headers=headers, json=payload
        )
        assert response.status_code == 422, response.text
    mc = await client.post(f"/api/v1/scenarios/{scenario_id}/monte-carlo", headers=headers, json={"n": 10000})
    assert mc.status_code == 422


async def test_project_quota_serializes_concurrent_guest_requests(client: AsyncClient) -> None:
    headers = bearer((await guest(client))["access_token"])
    payload = {"name": "Пустой", "object_type": "warehouse", "init": {"mode": "blank"}}
    for _ in range(9):
        assert (await client.post("/api/v1/projects", headers=headers, json=payload)).status_code == 201
    responses = await asyncio.gather(
        *[client.post("/api/v1/projects", headers=headers, json=payload) for _ in range(2)]
    )
    assert sorted(r.status_code for r in responses) == [201, 429]


async def test_session_creation_is_limited_by_ip(client: AsyncClient) -> None:
    for _ in range(10):
        await guest(client)
    response = await client.post("/api/v1/auth/guest", headers={"X-Client": "mobile"})
    assert response.status_code == 429


@pytest.mark.parametrize(
    ("key", "process_key"),
    [
        ("warehouse_demo_01", "pallet_transport"),
        ("warehouse_showcase_24x7", "pallet_transport"),
        ("hospital_demo_01", "meal_delivery"),
        ("airport_demo_01", "baggage_handling"),
    ],
)
async def test_every_guest_preset_supports_real_simulation(
    client: AsyncClient, key: str, process_key: str
) -> None:
    headers = bearer((await guest(client))["access_token"])
    own = await project(client, headers, key)
    matching = (await client.get(f"/api/v1/projects/{own['id']}/matching", headers=headers)).json()
    candidates = next(p for p in matching["processes"] if p["process_key"] == process_key)["candidates"]
    product_id = candidates[0]["product"]["id"]
    created = await client.post(
        f"/api/v1/projects/{own['id']}/scenarios",
        headers=headers,
        json={
            "name": "Проверка готового объекта",
            "kind": "purchase",
            "items": [{"process_key": process_key, "product_id": product_id}],
        },
    )
    assert created.status_code == 201, created.text
    scenario_id = created.json()["id"]
    calculated = await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)
    assert calculated.status_code == 200, calculated.text
    response = await client.post(
        f"/api/v1/scenarios/{scenario_id}/simulations",
        headers=headers,
        json={"mode": "peak", "record_events": True},
    )
    assert response.status_code == 202, response.text
    run = (await client.get(f"/api/v1/simulations/{response.json()['id']}", headers=headers)).json()
    assert run["status"] == "done", run
    assert run["events_count"] > 0
    assert process_key not in run["summary"]["skipped_processes"]


async def test_active_jobs_limit_and_save_wait_do_not_lose_guest_work(
    client: AsyncClient, settings: Settings
) -> None:
    pair = await guest(client, web=True)
    headers = bearer(pair["access_token"])
    own = await project(client, headers)
    scenario_id = await scenario(client, own["id"], headers)
    owner_id = UUID(pair["user"]["id"])
    db = Database(settings)
    try:
        async with UnitOfWork(db.session()) as uow:
            for _ in range(2):
                uow.session.add(Job(owner_id=owner_id, type=JobType.SIMULATION, status=JobStatus.QUEUED))
            await uow.commit()
        blocked = await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)
        assert blocked.status_code == 429
        registering = await client.post(
            "/api/v1/auth/register",
            json={"email": "wait@example.org", "password": "SafePassword123", "name": "Эксперт"},
            headers={"X-Keep-Guest-CSRF": client.cookies["csrf_token"]},
        )
        assert registering.status_code == 409
        assert (await client.get(f"/api/v1/projects/{own['id']}", headers=headers)).status_code == 200
        async with UnitOfWork(db.session()) as uow:
            assert not await uow.users.email_exists("wait@example.org")
            await uow.session.execute(
                update(Job).where(Job.owner_id == owner_id).values(status=JobStatus.DONE)
            )
            await uow.commit()
        allowed = await client.post(f"/api/v1/scenarios/{scenario_id}/calculate", headers=headers)
        assert allowed.status_code == 200, allowed.text
    finally:
        await db.dispose()
