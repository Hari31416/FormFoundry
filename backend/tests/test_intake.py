from io import BytesIO
from types import SimpleNamespace

from fastapi.testclient import TestClient
from reportlab.pdfgen import canvas

import app.extraction.service as extraction_service
import app.storage.minio as storage_module
from app.intake.models import EvidenceSourceType


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={
            "template_id": "fir-report-intake",
            "template_version": 1,
            "created_by": "test-user",
        },
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def test_text_evidence_creates_record_and_job(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text",
        json={
            "text": (
                "Complainant name is Priya Sharma. Incident summary: "
                "Her phone was stolen near MG Road. This is a theft complaint."
            ),
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
    assert evidence_items[0]["raw_text"].startswith("Complainant name is Priya Sharma")

    job_response = client.get(f"/api/v1/cases/{case_id}/jobs")
    assert job_response.status_code == 200
    assert job_response.json()[0]["status"] == "completed"

    candidates_response = client.get(f"/api/v1/cases/{case_id}/candidates")
    assert candidates_response.status_code == 200
    candidate_fields = {
        candidate["field_path"] for candidate in candidates_response.json()
    }
    assert "complainant.full_name" in candidate_fields
    assert "incident.category" in candidate_fields


def test_upload_evidence_stores_file_and_queues_job(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"created_by": "uploader"},
        files={
            "file": (
                "supporting-note.png",
                b"Complainant name is Priya Sharma and phone number is 9876543210",
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
    assert "complainant.full_name" in candidate_fields
    assert "complainant.phone" in candidate_fields


def build_pdf(page_count: int) -> bytes:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer)
    for page_number in range(1, page_count + 1):
        pdf.drawString(72, 720, f"Page {page_number}")
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def test_pdf_upload_records_page_count_and_extracts(client: TestClient) -> None:
    case_id = create_case(client)

    async def fake_pdf_extract_text(record: object) -> str:
        return (
            "Complainant name is Priya Sharma. Incident summary: "
            "Her phone was stolen near MG Road. This is a theft complaint."
        )

    original = extraction_service.extract_evidence_text
    extraction_service.extract_evidence_text = fake_pdf_extract_text
    try:
        response = client.post(
            f"/api/v1/cases/{case_id}/evidence/upload",
            data={"created_by": "uploader"},
            files={"file": ("evidence.pdf", build_pdf(2), "application/pdf")},
        )
    finally:
        extraction_service.extract_evidence_text = original

    assert response.status_code == 201
    payload = response.json()
    assert payload["evidence"]["source_type"] == "pdf_upload"
    assert payload["evidence"]["parsed_payload"]["page_count"] == 2
    assert payload["job"]["status"] == "completed"

    candidates_response = client.get(f"/api/v1/cases/{case_id}/candidates")
    assert candidates_response.status_code == 200
    candidate_fields = {
        candidate["field_path"] for candidate in candidates_response.json()
    }
    assert "complainant.full_name" in candidate_fields
    assert "incident.category" in candidate_fields


def test_pdf_upload_rejects_more_than_ten_pages(client: TestClient) -> None:
    case_id = create_case(client)

    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"created_by": "uploader"},
        files={"file": ("too-many-pages.pdf", build_pdf(11), "application/pdf")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded PDF exceeds the 10-page limit."


def test_extract_evidence_reads_from_s3_storage(monkeypatch) -> None:
    evidence = SimpleNamespace(
        raw_text=None,
        source_type=EvidenceSourceType.IMAGE_UPLOAD,
        storage_uri="s3://formfoundry-assets/cases/example/image.png",
        evidence_metadata={"content_type": "image/png"},
        case_id="case-1",
        evidence_id="evidence-1",
    )

    class FakeStorage:
        async def read_bytes(self, storage_uri: str) -> bytes:
            assert storage_uri == evidence.storage_uri
            return b"mock image bytes"

    async def fake_ocr(
        payload: bytes, *, content_type: str, context_label: str = "uploaded image"
    ) -> str:
        assert payload == b"mock image bytes"
        assert content_type == "image/png"
        return "Complainant name is Priya Sharma"

    monkeypatch.setattr(storage_module, "get_storage_service", lambda: FakeStorage())
    monkeypatch.setattr(
        extraction_service, "get_storage_service", lambda: FakeStorage()
    )
    monkeypatch.setattr(extraction_service, "extract_text_from_image_bytes", fake_ocr)
    import asyncio

    result = asyncio.run(extraction_service.extract_evidence_text(evidence))

    assert result == "Complainant name is Priya Sharma"
