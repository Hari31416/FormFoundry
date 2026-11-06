from fastapi.testclient import TestClient


def test_case_creation_persists_empty_field_states(client: TestClient) -> None:
    create_response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "test-user",
            "metadata": {"intake_channel": "manual"},
        },
    )

    assert create_response.status_code == 201
    case_payload = create_response.json()
    assert case_payload["template_id"] == "fir-report-intake"
    assert case_payload["status"] == "collecting_input"
    assert case_payload["created_by"] == "test-user"
    assert case_payload["metadata"] == {"intake_channel": "manual"}
    assert all(field["status"] == "missing" for field in case_payload["field_states"])
    assert case_payload["completion_pct"] == 0.0
    assert case_payload["fields_confirmed"] == 0
    assert case_payload["fields_total"] == len(case_payload["field_states"])

    case_id = case_payload["case_id"]
    schema_state_response = client.get(f"/api/v1/cases/{case_id}/schema-state")

    assert schema_state_response.status_code == 200
    schema_payload = schema_state_response.json()
    assert schema_payload["current_schema_state"]["complainant"]["full_name"] is None
    assert schema_payload["current_schema_state"]["incident"]["summary"] is None
    assert any(
        group["group_id"] == "accused" for group in schema_payload["field_groups"]
    )


def test_update_case_preferred_language(client: TestClient) -> None:
    # 1. Create a case
    create_response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "test-user",
            "metadata": {"intake_channel": "manual"},
        },
    )
    assert create_response.status_code == 201
    case_payload = create_response.json()
    case_id = case_payload["case_id"]

    # 2. Update language to 'hi'
    update_response = client.put(
        f"/api/v1/cases/{case_id}/language",
        json={"language": "hi"},
    )
    assert update_response.status_code == 200
    updated_payload = update_response.json()
    assert updated_payload["metadata"]["preferred_language"] == "hi"

    # 3. Retrieve case detail to verify persistence
    get_response = client.get(f"/api/v1/cases/{case_id}")
    assert get_response.status_code == 200
    get_payload = get_response.json()
    assert get_payload["metadata"]["preferred_language"] == "hi"


def test_delete_case(client: TestClient) -> None:
    # 1. Create a case
    create_response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "test-user",
            "metadata": {"intake_channel": "manual"},
        },
    )
    assert create_response.status_code == 201
    case_payload = create_response.json()
    case_id = case_payload["case_id"]

    # 2. Verify retrieval works
    get_response = client.get(f"/api/v1/cases/{case_id}")
    assert get_response.status_code == 200

    # 3. Delete the case
    delete_response = client.delete(f"/api/v1/cases/{case_id}")
    assert delete_response.status_code == 204

    # 4. Verify case no longer exists
    get_again_response = client.get(f"/api/v1/cases/{case_id}")
    assert get_again_response.status_code == 404


def test_list_cases_includes_completion(client: TestClient) -> None:
    create_response = client.post(
        "/api/v1/cases",
        json={"template_id": "fir-report-intake", "template_version": 1},
    )
    assert create_response.status_code == 201
    list_response = client.get(
        "/api/v1/cases", params={"template_id": "fir-report-intake"}
    )
    assert list_response.status_code == 200
    rows = list_response.json()
    assert rows and "completion_pct" in rows[0] and "fields_total" in rows[0]
