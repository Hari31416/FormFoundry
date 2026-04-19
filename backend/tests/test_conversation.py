from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "household-assistance-intake",
            "created_by": "conversation-test",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def test_next_question_prioritizes_first_required_missing_field(
    client: TestClient,
) -> None:
    case_id = create_case(client)

    response = client.get(f"/api/v1/cases/{case_id}/conversation/next-question")

    assert response.status_code == 200
    payload = response.json()
    assert payload["field_path"] == "applicant.full_name"
    assert payload["priority"] == 1


def test_conversation_turn_creates_chat_evidence_and_advances_question(
    client: TestClient,
) -> None:
    case_id = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": "Applicant name is Jamie Rivera.",
            "created_by": "conversation-test",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user_turn"]["related_field_path"] == "applicant.full_name"
    assert payload["next_question"]["field_path"] != "applicant.full_name"

    schema_response = client.get(f"/api/v1/cases/{case_id}/schema-state")
    assert schema_response.status_code == 200
    by_path = {
        field_state["field_path"]: field_state
        for field_state in schema_response.json()["field_states"]
    }
    assert by_path["applicant.full_name"]["status"] == "proposed"


def test_conversation_stream_returns_sse_payload(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.get(f"/api/v1/cases/{case_id}/conversation/stream")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert "event: question" in response.text
