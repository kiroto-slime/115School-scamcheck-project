import os
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
_TMP = Path(tempfile.mkdtemp(prefix="scamcheck_test_"))
os.environ.update({
    "DATABASE_URL": f"sqlite:///{(_TMP / 'boot.db').as_posix()}",
    "UPLOAD_TMP_DIR": str(_TMP / "uploads"),
    "COFACTS_APP_ID": "", "COFACTS_APP_SECRET": "",
    "AI_PROVIDER": "disabled", "RESEARCH_MODE": "simulation",
    "ADMIN_USERNAME": "admin", "SECRET_KEY": "test-secret-key-only-for-tests",
})
from app.security import hash_password  # noqa: E402

TEST_PASSWORD = "test-password-123"
os.environ["ADMIN_PASSWORD_HASH"] = hash_password(TEST_PASSWORD, iterations=1000)

from fastapi.testclient import TestClient  # noqa: E402

from app import database  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402
from app.security import limiter  # noqa: E402


@pytest.fixture()
def settings():
    s = get_settings()
    snapshot = s.model_dump()
    yield s
    for k, v in snapshot.items():
        setattr(s, k, v)


@pytest.fixture()
def client(tmp_path, settings):
    database.configure_engine(f"sqlite:///{(tmp_path / 'test.db').as_posix()}")
    limiter.reset()
    with TestClient(app) as c:
        yield c
    database.engine.dispose()


@pytest.fixture()
def db(client):
    s = database.SessionLocal()
    yield s
    s.close()


@pytest.fixture()
def admin_headers(client):
    r = client.post("/api/admin/login", json={"username": "admin", "password": TEST_PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def tmp_upload_files(settings) -> list:
    p = Path(settings.upload_tmp_dir)
    return list(p.iterdir()) if p.exists() else []
