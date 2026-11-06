from __future__ import annotations

from app.core.config import get_settings
from app.db import get_session_maker
from app.main import lifespan
from app.templates import service
from app.templates.models import TemplateDefinitionCreate


def template_payload(template_id: str = "database-only") -> dict:
    return {
        "template_id": template_id,
        "template_version": 1,
        "name": "Database template",
        "domain": "test",
        "description": "Stored in the database",
        "schema": [],
        "field_groups": [],
    }


def test_template_crud_never_changes_config_files(client, monkeypatch, tmp_path):
    config = tmp_path / "database-only_v1.json"
    config.write_text("original config", encoding="utf-8")
    monkeypatch.setattr(get_settings(), "template_config_dir", tmp_path)
    monkeypatch.setattr(get_settings(), "environment", "development")
    before = {path.name: path.read_bytes() for path in tmp_path.glob("*.json")}
    payload = template_payload()
    assert client.post("/api/v1/templates", json=payload).status_code == 201
    payload["name"] = "Edited in database"
    endpoint = "/api/v1/templates/database-only/versions/1"
    assert client.put(endpoint, json=payload).status_code == 200
    assert (
        client.get("/api/v1/templates/database-only").json()["name"] == payload["name"]
    )
    assert config.read_text(encoding="utf-8") == "original config"
    assert client.delete(endpoint).status_code == 204
    assert config.read_text(encoding="utf-8") == "original config"
    assert client.get("/api/v1/templates/database-only").status_code == 404
    assert (
        client.post("/api/v1/templates", json=template_payload("new-file")).status_code
        == 201
    )
    assert not (tmp_path / "new-file_v1.json").exists()
    assert {p.name: p.read_bytes() for p in tmp_path.glob("*.json")} == before


def test_restart_preserves_created_edited_and_deleted_templates(client, monkeypatch):
    payload = template_payload()
    assert client.post("/api/v1/templates", json=payload).status_code == 201
    payload["name"] = "Edited database template"
    assert (
        client.put(
            "/api/v1/templates/database-only/versions/1", json=payload
        ).status_code
        == 200
    )
    seeded = client.get("/api/v1/templates/fir-report-intake").json()
    seeded["name"] = "Locally edited example"
    version = seeded["template_version"]
    assert (
        client.put(
            f"/api/v1/templates/fir-report-intake/versions/{version}", json=seeded
        ).status_code
        == 200
    )
    assert (
        client.delete(
            f"/api/v1/templates/fir-report-intake/versions/{version}"
        ).status_code
        == 204
    )

    def fail_if_loaded():
        raise AssertionError("Startup must not read template config files")

    monkeypatch.setattr(service, "load_template_configs", fail_if_loaded)

    async def restart():
        async with lifespan(client.app):
            pass

    client.portal.call(restart)
    assert (
        client.get("/api/v1/templates/database-only").json()["name"] == payload["name"]
    )
    assert (
        client.get(
            f"/api/v1/templates/fir-report-intake?template_version={version}"
        ).status_code
        == 404
    )


def test_explicit_seed_only_inserts_missing_versions(client, monkeypatch):
    payload = template_payload()
    assert client.post("/api/v1/templates", json=payload).status_code == 201
    changed = {**payload, "name": "Should not overwrite"}
    missing = template_payload("missing-example")
    monkeypatch.setattr(
        service,
        "load_template_configs",
        lambda: [
            TemplateDefinitionCreate.model_validate(changed),
            TemplateDefinitionCreate.model_validate(
                {**missing, "name": "Earlier example"}
            ),
            TemplateDefinitionCreate.model_validate(missing),
        ],
    )

    async def seed():
        async with get_session_maker()() as session:
            await service.ensure_seed_templates(session)

    client.portal.call(seed)
    client.portal.call(seed)
    assert (
        client.get("/api/v1/templates/database-only").json()["name"] == payload["name"]
    )
    assert (
        client.get("/api/v1/templates/missing-example").json()["name"]
        == missing["name"]
    )
    assert client.get("/api/v1/templates/fir-report-intake").status_code == 200
