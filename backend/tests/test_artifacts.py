from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "artifact-test",
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
    assert artifact["artifact_type"] == "pdf"
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


def test_custom_template_generates_pdf_without_template_asset(
    client: TestClient,
) -> None:
    import uuid

    template_id = f"custom-intake-{uuid.uuid4()}"

    # 1. Create a custom template with NO template_asset in renderer_config
    template_payload = {
        "template_id": template_id,
        "template_version": 1,
        "name": "Custom Test Template",
        "domain": "custom",
        "description": "A dynamic custom template for checking artifacts.",
        "schema": [
            {
                "path": "complainant.full_name",
                "label": "Full Name",
                "type": "string",
                "required": True,
                "default_question": "What is the name?",
                "clarification_question": "Please verify name.",
            }
        ],
        "field_groups": [
            {
                "group_id": "complainant",
                "label": "Complainant Details",
                "field_paths": ["complainant.full_name"],
            }
        ],
        "supported_artifacts": ["pdf"],
        "renderer_config": {
            "artifact_type": "pdf",
            "pdf_title": "Custom Test Intake PDF Report",
        },
    }
    create_template_response = client.post("/api/v1/templates", json=template_payload)
    assert create_template_response.status_code == 201

    # 2. Create a case under this new template
    create_case_response = client.post(
        "/api/v1/cases",
        json={
            "template_id": template_id,
            "created_by": "custom-artifact-test",
        },
    )
    assert create_case_response.status_code == 201
    case_id = create_case_response.json()["case_id"]

    # 3. Fill required field
    fill_response = client.post(
        f"/api/v1/cases/{case_id}/fields/complainant.full_name/edit",
        json={"value": "Jane Doe", "edited_by": "custom-artifact-test"},
    )
    assert fill_response.status_code == 200

    # 4. Approve case
    approve_response = client.post(f"/api/v1/cases/{case_id}/approve")
    assert approve_response.status_code == 200

    # 5. Generate PDF artifact (should automatically create template and fill PDF successfully)
    artifact_response = client.post(f"/api/v1/cases/{case_id}/artifacts")
    assert artifact_response.status_code == 201
    artifact = artifact_response.json()
    assert artifact["artifact_type"] == "pdf"
    assert artifact["status"] == "generated"

    # 6. Verify downloadable file matches PDF signature
    download_response = client.get(
        f"/api/v1/cases/{case_id}/artifacts/{artifact['artifact_id']}/download"
    )
    assert download_response.status_code == 200
    assert download_response.content.startswith(b"%PDF")


def test_approved_case_generates_downloadable_json_export(client: TestClient) -> None:
    case_id = create_case(client)
    fill_required_fields(client, case_id)

    approve_response = client.post(f"/api/v1/cases/{case_id}/approve")
    assert approve_response.status_code == 200

    artifact_response = client.post(
        f"/api/v1/cases/{case_id}/artifacts",
        json={"artifact_type": "json_export"},
    )
    assert artifact_response.status_code == 201
    artifact = artifact_response.json()
    assert artifact["artifact_type"] == "json_export"
    assert artifact["status"] == "generated"

    list_response = client.get(f"/api/v1/cases/{case_id}/artifacts")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    download_response = client.get(
        f"/api/v1/cases/{case_id}/artifacts/{artifact['artifact_id']}/download"
    )
    assert download_response.status_code == 200
    assert download_response.headers["content-type"].startswith("application/json")
    exported_data = download_response.json()
    assert exported_data["complainant"]["full_name"] == "Priya Sharma"
