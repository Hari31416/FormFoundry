from fastapi.testclient import TestClient


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={"template_id": "household-assistance-intake", "created_by": "test-user"},
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def test_text_evidence_creates_record_and_job(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={
            "text": "Applicant name is Jamie Rivera and they request housing assistance.",
            "created_by": "intake-agent",
            "metadata": {"channel": "paste"},
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["evidence"]["source_type"] == "user_text"
    assert payload["evidence"]["storage_uri"].startswith("local://cases/")
    assert payload["evidence"]["metadata"]["channel"] == "paste"
    assert payload["job"]["status"] == "completed"
    assert payload["job"]["job_type"] == "extract_case_evidence"

    evidence_response = client.get(f"/api/v1/cases/{case_id}/evidence")
    assert evidence_response.status_code == 200
    evidence_items = evidence_response.json()
    assert len(evidence_items) == 1
    assert evidence_items[0]["raw_text"].startswith("Applicant name is Jamie Rivera")

    job_response = client.get(f"/api/v1/cases/{case_id}/jobs")
    assert job_response.status_code == 200
    assert job_response.json()[0]["status"] == "completed"

    candidates_response = client.get(f"/api/v1/cases/{case_id}/candidates")
    assert candidates_response.status_code == 200
    candidate_fields = {
        candidate["field_path"] for candidate in candidates_response.json()
    }
    assert "applicant.full_name" in candidate_fields
    assert "benefits.requested_program" in candidate_fields


def test_upload_evidence_stores_file_and_queues_job(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"created_by": "uploader"},
        files={
            "file": (
                "supporting-note.png",
                b"Applicant name is Jamie Rivera and monthly income is 2100",
                "image/png",
            )
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["evidence"]["source_type"] == "image_upload"
    assert payload["evidence"]["parsed_payload"]["filename"] == "supporting-note.png"
    assert payload["job"]["triggering_event"] == "evidence.upload.created"
    assert payload["job"]["status"] == "completed"

    candidates_response = client.get(f"/api/v1/cases/{case_id}/candidates")
    assert candidates_response.status_code == 200
    candidate_fields = {
        candidate["field_path"] for candidate in candidates_response.json()
    }
    assert "applicant.full_name" in candidate_fields
