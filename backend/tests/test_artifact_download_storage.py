from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

import app.artifacts.service as artifacts
from app.cases.models import ArtifactRecord
from app.db import get_session_maker
from tests.test_artifacts import create_case


def seed_artifact(case_id: str, kind: str = "pdf") -> str:
    async def insert():
        async with get_session_maker()() as session:
            extension = "json" if kind == "json_export" else "pdf"
            record = ArtifactRecord(
                case_id=case_id,
                artifact_type=kind,
                status="generated",
                storage_uri=f"s3://bucket/artifacts/report.{extension}",
                renderer_version="test",
                artifact_metadata={},
            )
            session.add(record)
            await session.commit()
            return record.artifact_id

    return asyncio.run(insert())


@pytest.mark.parametrize(
    "kind,media_type,payload",
    [
        ("pdf", "application/pdf", b"%PDF-1.4 synthetic test"),
        ("json_export", "application/json", b'{"test": true}'),
    ],
)
def test_s3_download_is_authenticated_api_response_without_redirect(
    client, monkeypatch, kind, media_type, payload
):
    case_id = create_case(client)
    artifact_id = seed_artifact(case_id, kind)
    storage = AsyncMock()
    storage.read_bytes.return_value = payload
    monkeypatch.setattr(artifacts, "get_storage_service", lambda: storage)
    url = f"/api/v1/cases/{case_id}/artifacts/{artifact_id}/download"
    response = client.get(
        url, follow_redirects=False, headers={"Origin": "http://localhost:5173"}
    )
    assert response.status_code == 200
    assert response.content == payload
    assert response.headers["content-type"].startswith(media_type)
    assert "attachment" in response.headers["content-disposition"]
    assert "Content-Disposition" in response.headers["access-control-expose-headers"]
    assert "location" not in response.headers
    storage.get_download_url.assert_not_called()
    assert (
        client.get(url, headers={"Authorization": "Bearer invalid"}).status_code == 401
    )
    other_case = create_case(client)
    assert client.get(url.replace(case_id, other_case)).status_code == 404


def test_missing_storage_file_returns_404(client, monkeypatch):
    case_id = create_case(client)
    artifact_id = seed_artifact(case_id)
    storage = AsyncMock()
    storage.read_bytes.side_effect = FileNotFoundError("gone")
    monkeypatch.setattr(artifacts, "get_storage_service", lambda: storage)
    assert (
        client.get(
            f"/api/v1/cases/{case_id}/artifacts/{artifact_id}/download"
        ).status_code
        == 404
    )
