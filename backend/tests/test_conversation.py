import pytest
from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "conversation-test",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def test_case_creation_fails_without_llm_question(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.conversation.service as conversation_service

    async def missing_question(*, system_prompt: str, user_prompt: str) -> dict:
        return {}

    monkeypatch.setattr(conversation_service, "generate_json", missing_question)

    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "conversation-test",
        },
    )

    assert response.status_code == 503
    assert response.json()["detail"] == "Unable to generate the next question."


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


def test_get_conversation_turns_history(client: TestClient) -> None:
    case_id = create_case(client)

    # Submit a conversation turn
    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": """My name is Priya Sharma. Phone number is 9876543210.
            I live at 14 Residency Road, Bengaluru.""",
            "created_by": "conversation-test",
        },
    )
    assert response.status_code == 200

    # Get conversation turns list
    history_response = client.get(f"/api/v1/cases/{case_id}/conversation/turns")
    assert history_response.status_code == 200
    history = history_response.json()

    # We should have 3 turns: initial assistant question,
    # user's response, and assistant's follow-up
    assert len(history) >= 3
    assert history[0]["role"] == "assistant"
    assert history[1]["role"] == "user"
    assert "Priya Sharma" in history[1]["message"]
    assert history[2]["role"] == "assistant"


def test_next_question_read_does_not_duplicate_history(client: TestClient) -> None:
    case_id = create_case(client)

    initial_history_response = client.get(f"/api/v1/cases/{case_id}/conversation/turns")
    assert initial_history_response.status_code == 200
    initial_history = initial_history_response.json()
    assert len(initial_history) == 1
    assert initial_history[0]["role"] == "assistant"

    for _ in range(3):
        response = client.get(f"/api/v1/cases/{case_id}/conversation/next-question")
        assert response.status_code == 200

    final_history_response = client.get(f"/api/v1/cases/{case_id}/conversation/turns")
    assert final_history_response.status_code == 200
    assert final_history_response.json() == initial_history


def test_parse_date_robustness() -> None:
    from app.extraction.service import parse_date

    assert parse_date("7 November 2014") == "2014-11-07"
    assert parse_date("Nov 7th, 2014") == "2014-11-07"
    assert parse_date("07-11-2014") == "2014-11-07"
    assert parse_date("7/11/2014") == "2014-11-07"
    assert parse_date("2014-11-07") == "2014-11-07"
    assert parse_date("not a date") is None


def test_optional_field_refusal_marks_na(client: TestClient) -> None:
    case_id = create_case(client)

    # First, satisfy the required complainant details
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

    # Satisfy incident details except optional field
    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": (
                "The incident happened on 2026-04-17 at 21:15 near MG Road. "
                "Ashok Nagar Police Station should receive it. It was a theft. "
                "Incident summary: Her phone was stolen."
            ),
            "created_by": "conversation-test",
        },
    )
    assert response.status_code == 200

    # The next question should be a required or optional field. Let's refuse it.
    next_q = response.json()["next_question"]
    assert next_q is not None

    refuse_response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": "No idea, skip this",
            "created_by": "conversation-test",
        },
    )
    assert refuse_response.status_code == 200

    # Verify that the field got resolved to "NA" in the schema state
    schema_response = client.get(f"/api/v1/cases/{case_id}/schema-state")
    assert schema_response.status_code == 200
    schema_state = schema_response.json()
    by_path = {
        field_state["field_path"]: field_state
        for field_state in schema_state["field_states"]
    }

    known_field = by_path.get("accused.known_to_complainant")
    assert known_field is not None
    assert known_field["status"] == "proposed"
    assert known_field["resolved_value"] == "NA"

    details_field = by_path.get("accused.details")
    assert details_field is not None
    assert details_field["status"] == "proposed"
    assert details_field["resolved_value"] == "NA"


def test_required_field_refusal_reasks_without_deterministic_warning(
    client: TestClient,
) -> None:
    case_id = create_case(client)

    # Complainant name is required. Say "I don't know" to the complainant name question
    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={
            "message": "I don't know, skip this field",
            "created_by": "conversation-test",
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["assistant_turn"] is not None
    assert payload["next_question"]["field_path"] == "complainant.full_name"
