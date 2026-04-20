from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "created_by": "resolver-test",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def test_resolution_updates_case_schema_state(client: TestClient) -> None:
    case_id = create_case(client)

    intake_response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={
            "text": (
                "Complainant name is Priya Sharma. Incident summary: "
                "Her phone was stolen near MG Road. This is a theft complaint."
            ),
            "created_by": "resolver-test",
        },
    )
    assert intake_response.status_code == 201

    case_response = client.get(f"/api/v1/cases/{case_id}")
    assert case_response.status_code == 200
    case_payload = case_response.json()
    assert case_payload["status"] == "awaiting_user"

    schema_response = client.get(f"/api/v1/cases/{case_id}/schema-state")
    assert schema_response.status_code == 200
    schema_payload = schema_response.json()
    by_path = {
        field_state["field_path"]: field_state
        for field_state in schema_payload["field_states"]
    }
    assert by_path["complainant.full_name"]["status"] == "proposed"
    assert by_path["incident.category"]["status"] == "proposed"
    assert schema_payload["current_schema_state"]["incident"]["summary"] is not None

    unresolved_response = client.get(
        f"/api/v1/cases/{case_id}/schema-state",
        params=[("status", "missing"), ("status", "conflicted")],
    )
    assert unresolved_response.status_code == 200
    unresolved_paths = {
        field_state["field_path"]
        for field_state in unresolved_response.json()["field_states"]
    }
    assert "incident.date" in unresolved_paths


def test_resolution_marks_conflicts_when_candidates_disagree(
    client: TestClient,
) -> None:
    case_id = create_case(client)

    first_response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={"text": "Complainant name is Priya Sharma.", "created_by": "source-one"},
    )
    second_response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={"text": "Complainant name is Jordan Sharma.", "created_by": "source-two"},
    )

    assert first_response.status_code == 201
    assert second_response.status_code == 201

    schema_response = client.get(
        f"/api/v1/cases/{case_id}/schema-state", params={"status": "conflicted"}
    )
    assert schema_response.status_code == 200
    conflicted_fields = {
        field_state["field_path"]: field_state
        for field_state in schema_response.json()["field_states"]
    }
    assert conflicted_fields["complainant.full_name"]["status"] == "conflicted"
    assert conflicted_fields["complainant.full_name"]["resolved_value"] is None
