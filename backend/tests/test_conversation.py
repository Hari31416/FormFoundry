from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "created_by": "conversation-test",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def test_next_question_groups_related_required_fields(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.get(f"/api/v1/cases/{case_id}/conversation/next-question")

    assert response.status_code == 200
    payload = response.json()
    assert payload["field_path"] == "complainant.full_name"
    assert payload["field_paths"] == [
        "complainant.full_name",
        "complainant.phone",
        "complainant.address",
    ]
    assert payload["priority"] == 1


def test_conversation_turn_creates_chat_evidence_and_advances_question(
    client: TestClient,
) -> None:
    case_id = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": (
                "My name is Priya Sharma. Phone number is 9876543210. "
                "I live at 14 Residency Road, Bengaluru."
            ),
            "created_by": "conversation-test",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user_turn"]["related_field_path"] == "complainant.full_name"
    assert payload["next_question"]["field_path"] != "complainant.full_name"

    schema_response = client.get(f"/api/v1/cases/{case_id}/schema-state")
    assert schema_response.status_code == 200
    by_path = {
        field_state["field_path"]: field_state
        for field_state in schema_response.json()["field_states"]
    }
    assert by_path["complainant.full_name"]["status"] == "proposed"


def test_conversation_stream_returns_sse_payload(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.get(f"/api/v1/cases/{case_id}/conversation/stream")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: question" in response.text


def test_short_boolean_answer_advances_past_repeated_question(
    client: TestClient,
) -> None:
    case_id = create_case(client)

    first_response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": (
                "My name is Priya Sharma. Phone number is 9876543210. "
                "I live at 14 Residency Road, Bengaluru."
            ),
            "created_by": "conversation-test",
        },
    )
    assert first_response.status_code == 200

    second_response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": (
                "The incident happened on 2026-04-17 at 21:15 near MG Road. "
                "Ashok Nagar Police Station should receive it. "
                "It was a theft. Incident summary: Her phone was stolen near MG Road."
            ),
            "created_by": "conversation-test",
        },
    )
    assert second_response.status_code == 200
    assert (
        second_response.json()["next_question"]["field_path"]
        == "accused.known_to_complainant"
    )

    boolean_response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={"message": "No", "created_by": "conversation-test"},
    )
    assert boolean_response.status_code == 200
    assert (
        boolean_response.json()["user_turn"]["related_field_path"]
        == "accused.known_to_complainant"
    )
    assert (
        boolean_response.json()["next_question"]["field_path"]
        != "accused.known_to_complainant"
    )

    schema_response = client.get(f"/api/v1/cases/{case_id}/schema-state")
    assert schema_response.status_code == 200
    by_path = {
        field_state["field_path"]: field_state
        for field_state in schema_response.json()["field_states"]
    }
    assert by_path["accused.known_to_complainant"]["status"] == "proposed"
    assert by_path["accused.known_to_complainant"]["resolved_value"] is False
