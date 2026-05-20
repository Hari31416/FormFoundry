from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "validation-test",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def fill_required_fields(client: TestClient, case_id: str) -> None:
    required_updates = {
        "complainant.full_name": "Priya Sharma",
        "complainant.phone": "9876543210",
        "complainant.address": "14 Residency Road, Bengaluru",
        "incident.date": "2026-04-17",
        "incident.time": "21:15",
        "incident.location": "MG Road, Bengaluru",
        "incident.police_station": "Ashok Nagar Police Station",
        "incident.category": "theft",
        "incident.summary": "The complainant's phone was stolen near MG Road.",
        "accused.known_to_complainant": False,
        "witnesses.present": False,
    }
    for field_path, value in required_updates.items():
        response = client.post(
            f"/api/v1/cases/{case_id}/fields/{field_path}/edit",
            json={"value": value, "edited_by": "validation-test"},
        )
        assert response.status_code == 200


def test_edit_field_updates_source_provenance(client: TestClient) -> None:
    case_id = create_case(client)
    field_path = "complainant.full_name"
    edit_response = client.post(
        f"/api/v1/cases/{case_id}/fields/{field_path}/edit",
        json={"value": "Priya Sharma", "edited_by": "validation-test"},
    )
    assert edit_response.status_code == 200
    field_state = edit_response.json()
    evidence_ids = field_state["source_evidence_ids"]
    assert evidence_ids

    evidence_response = client.get(f"/api/v1/cases/{case_id}/evidence")
    assert evidence_response.status_code == 200
    evidence_map = {item["evidence_id"]: item for item in evidence_response.json()}
    evidence = evidence_map[evidence_ids[0]]
    assert evidence["source_type"] == "field_edit"
    assert evidence["source_subtype"] == "manual_edit"
    assert field_path in (evidence.get("raw_text") or "")


def test_validation_and_review_show_blocking_issues(client: TestClient) -> None:
    case_id = create_case(client)

    validation_response = client.get(f"/api/v1/cases/{case_id}/validation")
    review_response = client.get(f"/api/v1/cases/{case_id}/review")

    assert validation_response.status_code == 200
    issues = validation_response.json()
    assert any(issue["field_path"] == "complainant.full_name" for issue in issues)
    assert review_response.status_code == 200
    assert len(review_response.json()["validation_issues"]) >= len(issues)

    approve_response = client.post(f"/api/v1/cases/{case_id}/approve")
    assert approve_response.status_code == 409


def test_confirm_and_approve_flow(client: TestClient) -> None:
    case_id = create_case(client)

    evidence_response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={
            "text": "Complainant name is Priya Sharma.",
            "created_by": "validation-test",
        },
    )
    assert evidence_response.status_code == 201

    confirm_response = client.post(
        f"/api/v1/cases/{case_id}/fields/complainant.full_name/confirm",
        json={"confirmed_by": "validation-test"},
    )
    assert confirm_response.status_code == 200
    assert confirm_response.json()["status"] == "confirmed"

    fill_required_fields(client, case_id)

    validation_response = client.get(f"/api/v1/cases/{case_id}/validation")
    assert validation_response.status_code == 200
    assert validation_response.json() == []

    approve_response = client.post(f"/api/v1/cases/{case_id}/approve")
    assert approve_response.status_code == 200
    assert approve_response.json()["status"] == "approved"


def test_reject_match_requeues_field_for_questioning(client: TestClient) -> None:
    case_id = create_case(client)

    evidence_response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={
            "text": "Complainant name is Priya Sharma.",
            "created_by": "validation-test",
        },
    )
    assert evidence_response.status_code == 201

    case_response = client.get(f"/api/v1/cases/{case_id}")
    assert case_response.status_code == 200
    field_states = {
        field["field_path"]: field for field in case_response.json()["field_states"]
    }
    assert field_states["complainant.full_name"]["status"] == "proposed"

    reject_response = client.post(
        f"/api/v1/cases/{case_id}/fields/complainant.full_name/reject",
        json={"rejected_by": "validation-test"},
    )
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "missing"
    assert reject_response.json()["resolved_value"] is None

    refreshed_case_response = client.get(f"/api/v1/cases/{case_id}")
    assert refreshed_case_response.status_code == 200
    refreshed_states = {
        field["field_path"]: field
        for field in refreshed_case_response.json()["field_states"]
    }
    assert refreshed_states["complainant.full_name"]["status"] == "missing"
    assert refreshed_case_response.json()["status"] == "awaiting_user"

    next_question_response = client.get(
        f"/api/v1/cases/{case_id}/conversation/next-question"
    )
    assert next_question_response.status_code == 200
    assert next_question_response.json()["field_path"] == "complainant.full_name"
