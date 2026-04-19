from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "household-assistance-intake",
            "created_by": "artifact-test",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def fill_required_fields(client: TestClient, case_id: str) -> None:
    required_updates = {
        "applicant.full_name": "Jamie Rivera",
        "applicant.date_of_birth": "1990-01-01",
        "applicant.phone": "5551234567",
        "applicant.address.street": "12 Harbor Ave",
        "applicant.address.city": "Oakland",
        "applicant.address.state": "CA",
        "applicant.address.postal_code": "94607",
        "applicant.has_dependents": False,
        "employment.currently_employed": False,
        "employment.monthly_income": 2100,
        "benefits.requested_program": "housing_assistance",
        "benefits.has_prior_application": False,
        "identity.ssn_last4": "4321",
    }
    for field_path, value in required_updates.items():
        response = client.post(
            f"/api/v1/cases/{case_id}/fields/{field_path}/edit",
            json={"value": value, "edited_by": "artifact-test"},
        )
        assert response.status_code == 200


def test_approved_case_generates_downloadable_pdf(client: TestClient) -> None:
    case_id = create_case(client)
    fill_required_fields(client, case_id)

    approve_response = client.post(f"/api/v1/cases/{case_id}/approve")
    assert approve_response.status_code == 200

    artifact_response = client.post(f"/api/v1/cases/{case_id}/artifacts")
    assert artifact_response.status_code == 201
    artifact = artifact_response.json()
    assert artifact["artifact_type"] == "fillable_pdf"
    assert artifact["status"] == "generated"

    list_response = client.get(f"/api/v1/cases/{case_id}/artifacts")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    download_response = client.get(
        f"/api/v1/cases/{case_id}/artifacts/{artifact['artifact_id']}/download"
    )
    assert download_response.status_code == 200
    assert download_response.headers["content-type"].startswith("application/pdf")
    assert download_response.content.startswith(b"%PDF")
