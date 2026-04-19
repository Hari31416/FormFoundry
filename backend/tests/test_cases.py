from fastapi.testclient import TestClient


def test_case_creation_persists_empty_field_states(client: TestClient) -> None:
    create_response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "household-assistance-intake",
            "created_by": "test-user",
            "metadata": {"intake_channel": "manual"},
        },
    )

    assert create_response.status_code == 201
    case_payload = create_response.json()
    assert case_payload["template_id"] == "household-assistance-intake"
    assert case_payload["status"] == "collecting_input"
    assert case_payload["created_by"] == "test-user"
    assert case_payload["metadata"] == {"intake_channel": "manual"}
    assert all(field["status"] == "missing" for field in case_payload["field_states"])

    case_id = case_payload["case_id"]
    schema_state_response = client.get(f"/api/v1/cases/{case_id}/schema-state")

    assert schema_state_response.status_code == 200
    schema_payload = schema_state_response.json()
    assert schema_payload["current_schema_state"]["applicant"]["full_name"] is None
    assert (
        schema_payload["current_schema_state"]["employment"]["monthly_income"] is None
    )
    assert any(
        group["group_id"] == "benefits" for group in schema_payload["field_groups"]
    )
