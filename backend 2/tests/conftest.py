import os
import tempfile

import pytest

os.environ["ROBOSCOPE_DATABASE_URL"] = f"sqlite:///{tempfile.mkdtemp()}/test.db"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def project(client):
    p = client.post("/api/projects", json={"name": "Test warehouse", "object_type": "warehouse"}).json()
    r = client.post(f"/api/projects/{p['id']}/import/demo")
    assert r.status_code == 200, r.text
    return p
