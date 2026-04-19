from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db import dispose_engine
from app.main import create_app


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    database_path = tmp_path / "formfoundry-test.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{database_path}"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["LOCAL_STORAGE_PATH"] = str(tmp_path / "storage")
    get_settings.cache_clear()

    with TestClient(create_app()) as test_client:
        yield test_client

    asyncio.run(dispose_engine())
    get_settings.cache_clear()
    os.environ.pop("DATABASE_URL", None)
    os.environ.pop("ENVIRONMENT", None)
    os.environ.pop("LOCAL_STORAGE_PATH", None)
