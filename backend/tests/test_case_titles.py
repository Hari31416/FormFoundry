from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.cases.models import CaseFileRecord, FieldStateRecord
from app.cases.titles import refresh_case_title
from app.templates.models import TemplateDefinitionRecord


def state(path: str, status: str, value=None) -> FieldStateRecord:
    return FieldStateRecord(field_path=path, status=status, resolved_value=value)


def create_case(client: TestClient, template_id="fir-report-intake") -> str:
    response = client.post("/api/v1/cases", json={"template_id": template_id})
    assert response.status_code == 201
    assert "title" not in response.json()["metadata"]
    return response.json()["case_id"]


def answer(client: TestClient, case_id: str, text: str) -> None:
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text", json={"text": text}
    )
    assert response.status_code == 201
    assert response.json()["job"]["status"] == "completed"


def test_ai_title_saved_once_and_rename_stops_generation(
    client: TestClient, monkeypatch
) -> None:
    generate = AsyncMock(return_value={"title": "Phone theft near MG Road"})
    monkeypatch.setattr("app.cases.titles.generate_json", generate)
    case_id = create_case(client)
    answer(client, case_id, "My name is Priya Sharma. Phone number is 9876543210.")
    detail = client.get(f"/api/v1/cases/{case_id}").json()
    assert detail["metadata"]["title"] == "Phone theft near MG Road"
    assert detail["metadata"]["title_source"] == "ai"
    listed = client.get("/api/v1/cases").json()[0]
    assert listed["metadata"]["title"] == detail["metadata"]["title"]
    answer(client, case_id, "Incident summary: Her phone was stolen near MG Road.")
    assert generate.await_count == 1
    renamed = client.put(
        f"/api/v1/cases/{case_id}/title", json={"title": "  Follow up   tomorrow  "}
    )
    assert renamed.status_code == 200
    assert renamed.json()["metadata"]["title"] == "Follow up tomorrow"
    answer(client, case_id, "This is a theft complaint.")
    assert (
        client.get(f"/api/v1/cases/{case_id}").json()["metadata"]["title_source"]
        == "manual"
    )
    assert (
        client.get("/api/v1/cases").json()[0]["metadata"]["title"]
        == "Follow up tomorrow"
    )
    assert generate.await_count == 1


def test_pattern_waits_for_fields_and_respects_manual_title(
    client: TestClient, monkeypatch
) -> None:
    generate = AsyncMock(side_effect=AssertionError("Patterns must not call AI"))
    monkeypatch.setattr("app.cases.titles.generate_json", generate)
    template = client.get("/api/v1/templates/fir-report-intake").json()
    template["template_id"] = "pattern-intake"
    template["conversation_config"][
        "title_pattern"
    ] = "{complainant.full_name} · {incident.category}"
    assert client.post("/api/v1/templates", json=template).status_code == 201
    case_id = create_case(client, "pattern-intake")
    answer(client, case_id, "My name is Priya Sharma.")
    assert not client.get(f"/api/v1/cases/{case_id}").json()["metadata"].get("title")
    answer(client, case_id, "This is a theft complaint.")
    assert (
        client.get(f"/api/v1/cases/{case_id}").json()["metadata"]["title"]
        == "Priya Sharma · theft"
    )
    client.put(f"/api/v1/cases/{case_id}/title", json={"title": "My title"})
    answer(client, case_id, "Phone number is 9876543210.")
    assert (
        client.get(f"/api/v1/cases/{case_id}").json()["metadata"]["title"] == "My title"
    )
    generate.assert_not_awaited()


@pytest.mark.parametrize(
    "pattern",
    [
        "{unknown.path}",
        "{complainant.full_name!r}",
        "{complainant.full_name",
        12,
        "x" * 201,
    ],
)
def test_invalid_title_patterns_rejected(client: TestClient, pattern) -> None:
    template = client.get("/api/v1/templates/fir-report-intake").json()
    template["template_id"] = "invalid-pattern"
    template["conversation_config"]["title_pattern"] = pattern
    assert client.post("/api/v1/templates", json=template).status_code == 422


@pytest.mark.parametrize("title", ["", "   ", "x" * 161])
def test_invalid_rename_rejected(client: TestClient, title: str) -> None:
    case_id = create_case(client)
    assert (
        client.put(f"/api/v1/cases/{case_id}/title", json={"title": title}).status_code
        == 422
    )


def test_missing_case_rename_returns_404(client: TestClient) -> None:
    assert (
        client.put("/api/v1/cases/missing/title", json={"title": "Test"}).status_code
        == 404
    )


async def test_generation_failure_and_sensitive_fields(monkeypatch) -> None:
    generate = AsyncMock(side_effect=RuntimeError("Unavailable"))
    monkeypatch.setattr("app.cases.titles.generate_json", generate)
    case = CaseFileRecord(case_id="test", case_metadata={}, current_schema_state={})
    template = TemplateDefinitionRecord(
        name="Any schema",
        conversation_config={},
        schema=[
            {
                "path": path,
                "label": path,
                "type": "string",
                "default_question": "?",
                "clarification_question": "?",
                "sensitivity": sensitivity,
            }
            for path, sensitivity in [("topic", "standard"), ("secret", "sensitive")]
        ],
    )
    session = AsyncMock()
    await refresh_case_title(
        session,
        case,
        template,
        [
            state("topic", "proposed", "Repair request"),
            state("secret", "proposed", "private-value"),
        ],
    )
    assert not case.case_metadata.get("title")
    assert "private-value" not in generate.call_args.kwargs["user_prompt"]
    assert generate.await_count == 1
