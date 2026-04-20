from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
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
