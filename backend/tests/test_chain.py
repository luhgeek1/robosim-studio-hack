def test_import_report(client, project):
    conf = client.get(f"/api/projects/{project['id']}/confidence").json()
    assert 80 <= conf["score"] <= 100
    assert conf["recognized"] >= 35 and conf["missing"]


def test_parameters_and_validation(client, project):
    r = client.get(f"/api/projects/{project['id']}/parameters").json()
    assert r["validation"] == []
    keys = {p["key"]: p for p in r["parameters"]}
    assert keys["aisle_width_m"]["value"] == 2.8
    assert keys["floor_flatness_mm"]["value"] == 3


def test_matching_excludes_by_hard_constraints(client, project):
    ms = client.get(f"/api/projects/{project['id']}/matching").json()
    assert ms[0]["eligible"] and ms[0]["robot"]["short_name"] == "Ronavi H1500"
    amr800 = next(m for m in ms if m["robot"]["short_name"] == "AMR 800")
    assert not amr800["eligible"] and any("Грузоподъёмность" in r for r in amr800["risks"])
    stacker = next(m for m in ms if "штабел" in m["robot"]["short_name"].lower())
    assert not stacker["eligible"]


def test_configurations_recommend_minimum_meeting_sla(client, project):
    cf = client.get(f"/api/projects/{project['id']}/configurations").json()
    assert cf["recommended_count"] == 3
    by = {c["count"]: c for c in cf["configurations"]}
    assert by[2]["normal"]["sla"] < 95 <= by[3]["normal"]["sla"] <= by[4]["normal"]["sla"]
    assert by[2]["normal"]["queue_avg"] > by[3]["normal"]["queue_avg"] > by[4]["normal"]["queue_avg"]
    assert by[3]["econ"]["roi_5y"] > by[4]["econ"]["roi_5y"]
    assert by[3]["econ"]["capex_mln"] <= 15
    assert set(cf["explanations"]) == {"why", "not_fewer", "not_more"}


def test_peak_is_harder_than_normal(client, project):
    cf = client.get(f"/api/projects/{project['id']}/configurations").json()
    for c in cf["configurations"]:
        assert c["peak"]["utilization"] >= c["normal"]["utilization"]
        assert c["peak"]["sla"] <= c["normal"]["sla"] + 0.1


def test_scenarios_and_recommendation(client, project):
    cf = client.get(f"/api/projects/{project['id']}/configurations").json()
    rid = cf["robot"]["id"]
    sc = client.get(f"/api/projects/{project['id']}/scenarios", params={"robot_id": rid, "count": 3}).json()
    assert [s["id"] for s in sc] == ["current", "purchase", "raas"]
    assert sum(1 for s in sc if s["recommended"]) == 1
    assert len(sc[1]["curve"]) == 61 and sc[1]["curve"][0] < 0 < sc[1]["curve"][-1]
    rec = client.get(f"/api/projects/{project['id']}/recommendation").json()
    assert rec["verdict"] == "recommended" and rec["count"] == 3
    rec2 = client.get(f"/api/projects/{project['id']}/recommendation", params={"robot_id": rid, "count": 2}).json()
    assert rec2["user_choice_note"] and "2 ×" in rec2["user_choice_note"]


def test_simulation_events_are_deterministic(client, project):
    cf = client.get(f"/api/projects/{project['id']}/configurations").json()
    rid = cf["robot"]["id"]
    a = client.get(f"/api/projects/{project['id']}/simulation", params={"robot_id": rid, "count": 3, "load": "peak"}).json()
    b = client.get(f"/api/projects/{project['id']}/simulation", params={"robot_id": rid, "count": 3, "load": "peak"}).json()
    assert a == b and a["events"] and {"time", "robot_id", "state", "from", "to", "queue"} <= set(a["events"][0])


def test_parameter_edit_bumps_version_and_recomputes(client, project):
    before = client.get(f"/api/projects/{project['id']}").json()["version"]
    r = client.patch(f"/api/projects/{project['id']}/parameters", json={"values": {"budget_mln": 9}})
    assert r.status_code == 200
    after = client.get(f"/api/projects/{project['id']}").json()
    assert after["version"] == before + 1
    cf = client.get(f"/api/projects/{project['id']}/configurations").json()
    assert cf["recommended_count"] is None or cf["configurations"][0]["econ"]["capex_mln"] > 0
    client.patch(f"/api/projects/{project['id']}/parameters", json={"values": {"budget_mln": 15}})


def test_unsupported_object_type_exposes_parameters_only(client):
    p = client.post("/api/projects", json={"name": "Airport", "object_type": "airport"}).json()
    r = client.post(f"/api/projects/{p['id']}/import/demo")
    assert r.status_code == 200 and r.json()["recognized"] > 15
    assert client.get(f"/api/projects/{p['id']}/matching").status_code == 409


def test_upload_xlsx_dataset(client):
    from app.config import settings

    p = client.post("/api/projects", json={"name": "Dataset warehouse", "object_type": "warehouse"}).json()
    with open(settings.dataset_xlsx, "rb") as f:
        r = client.post(f"/api/projects/{p['id']}/import", files={"file": ("dataset.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert r.status_code == 200, r.text
    assert r.json()["recognized"] >= 30
    cf = client.get(f"/api/projects/{p['id']}/configurations").json()
    assert cf["recommended_count"] is not None
