from datetime import UTC, datetime

from fastapi.testclient import TestClient

from app.cases.models import CaseFileRecord, FieldStateRecord
from app.cases.service import _completion_from_states, serialize_case
from app.templates.models import TemplateDefinitionRecord


def state(path: str, status: str, value=None) -> FieldStateRecord:
    return FieldStateRecord(field_path=path, status=status, resolved_value=value)


def test_progress_counts_captured_values_without_confirmation() -> None:
    states = [
        state("name", "proposed", "Hari"),
        state("consent", "proposed", False),
        state("amount", "proposed", 0),
        state("confirmed", "confirmed", "yes"),
        state("waived", "waived"),
        state("missing", "missing"),
        state("conflict", "conflicted", "ambiguous"),
        state("invalid", "invalid", "bad"),
        state("empty", "proposed", ""),
        state("null", "proposed"),
    ]
    assert _completion_from_states(states) == (50.0, 1, 10, 4, 1)
    assert _completion_from_states([]) == (0.0, 0, 0, 0, 0)


def test_progress_excludes_inactive_conditional_fields() -> None:
    case = CaseFileRecord(
        case_id="test",
        template_id="custom",
        template_version=1,
        status="awaiting_user",
        created_by="test",
        review_status="not_ready",
        case_metadata={},
        current_schema_state={"present": False},
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    template = TemplateDefinitionRecord(
        schema=[
            {
                "path": "present",
                "label": "Present",
                "type": "boolean",
                "default_question": "?",
                "clarification_question": "?",
            },
            {
                "path": "details",
                "label": "Details",
                "type": "string",
                "default_question": "?",
                "clarification_question": "?",
                "conditions": {"depends_on": "present", "equals": True},
            },
        ]
    )
    payload = serialize_case(
        case,
        [state("present", "proposed", False), state("details", "missing")],
        template,
    )
    assert payload.fields_total == 1
    assert payload.fields_collected == 1
    assert payload.fields_confirmed == 0
    assert payload.completion_pct == 100


def test_list_and_detail_include_unconfirmed_answers(client: TestClient) -> None:
    created = client.post("/api/v1/cases", json={"template_id": "fir-report-intake"})
    assert created.status_code == 201
    case_id = created.json()["case_id"]
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={"text": "My name is Priya Sharma. Phone number is 9876543210."},
    )
    assert response.status_code == 201
    detail = client.get(f"/api/v1/cases/{case_id}").json()
    listed = client.get("/api/v1/cases").json()[0]
    assert detail["fields_collected"] >= 2
    assert detail["fields_confirmed"] == 0
    assert 0 < detail["completion_pct"] < 100
    for field in (
        "fields_total",
        "fields_collected",
        "fields_confirmed",
        "completion_pct",
    ):
        assert listed[field] == detail[field]
