from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from pypdf import PdfReader

import app.documents.ocr as document_ocr
import app.extraction.service as extraction
from app.storage.s3 import get_storage_service
from app.templates.models import TemplateField
from app.templates.runtime import is_field_active
from scripts.generate_identity_samples import EXPECTED, SAMPLES, generate_samples

TEMPLATE_ID = "indian-document-intake"


def create_document_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases", json={"template_id": TEMPLATE_ID, "template_version": 1}
    )
    assert response.status_code == 201, response.text
    return response.json()["case_id"]


def mock_document_processing(monkeypatch):
    async def extract_pdf(record):
        payload = await get_storage_service().read_bytes(record.storage_uri)
        return "\n".join(
            page.extract_text() for page in PdfReader(BytesIO(payload)).pages
        )

    async def classify(*, user_prompt, **kwargs):
        text = user_prompt.split("OCR text:\n", 1)[1]
        if "INCOME TAX DEPARTMENT" in text:
            kind, quote = "pan", "INCOME TAX DEPARTMENT"
        elif "UIDAI" in text:
            kind, quote = "aadhaar", "UIDAI"
        else:
            kind, quote = "driving_licence", "DRIVING LICENCE"
        fields = {
            key: {
                "value": (
                    str(value)
                    if key != "date_of_birth" and key != "expiry_date"
                    else {"1994-07-12": "12/07/1994", "2044-01-14": "14/01/2044"}[value]
                ),
                "source_quote": (
                    str(value)
                    if key != "date_of_birth" and key != "expiry_date"
                    else {"1994-07-12": "12/07/1994", "2044-01-14": "14/01/2044"}[value]
                ),
                "confidence": 0.98,
            }
            for key, value in EXPECTED[kind].items()
        }
        return {
            "detected": {"country": "IN", "document_type": kind},
            "confidence": 0.99,
            "type_quote": quote,
            "fields": fields,
        }

    async def adversarial_unbound_extract(*, user_prompt, **kwargs):
        catalog = user_prompt.split("Field catalog:\n", 1)[1].split(
            "Recent conversation", 1
        )[0]
        assert "Document source:" not in catalog
        # A second model call must not bypass explicit document bindings.
        return {
            "candidates": [
                {
                    "field_path": "aadhaar.date_of_birth",
                    "candidate_value": "1994-07-12",
                    "confidence": 1,
                    "rationale": "Incorrectly copied from PAN",
                }
            ]
        }

    monkeypatch.setattr(extraction, "extract_evidence_text", extract_pdf)
    monkeypatch.setattr(document_ocr, "generate_json", classify)
    monkeypatch.setattr(extraction, "generate_json", adversarial_unbound_extract)


def test_new_schema_is_seeded_with_document_bindings(client):
    response = client.get(f"/api/v1/templates/{TEMPLATE_ID}")
    assert response.status_code == 200
    template = response.json()
    assert template["name"] == "Indian document intake"
    fields = {item["path"]: item for item in template["schema"]}
    assert fields["aadhaar.document_number"]["document_source"] == {
        "country": "IN",
        "document_type": "aadhaar",
        "field": "document_number",
    }
    assert fields["aadhaar.date_of_birth"]["required"] is False
    assert fields["driving_licence.expiry_date"]["conditions"] == {
        "depends_on": "applicant.include_driving_licence",
        "equals": True,
    }
    grouped = [
        path for group in template["field_groups"] for path in group["field_paths"]
    ]
    assert set(grouped) == set(fields)
    assert len(grouped) == len(fields)


def test_generated_samples_have_expected_pages_text_and_bundle(tmp_path):
    paths = generate_samples(tmp_path)
    assert len(paths) == 3
    for path, sample in zip(paths, SAMPLES, strict=True):
        reader = PdfReader(path)
        assert len(reader.pages) == len(sample.pages)
        for page in reader.pages:
            assert "SAMPLE / NOT VALID" in page.extract_text()
            assert sample.heading in page.extract_text()
        assert reader.get_fields() is None
    aadhaar = "\n".join(page.extract_text() for page in PdfReader(paths[0]).pages)
    assert "1994" in aadhaar
    assert "12/07/1994" not in aadhaar
    with ZipFile(tmp_path / "sample-documents.zip") as archive:
        assert set(archive.namelist()) == {
            *(path.name for path in paths),
            "README.md",
            "expected-fields.json",
        }


@pytest.mark.parametrize("declare_type", [True, False])
def test_samples_populate_only_their_bound_fields_with_provenance(
    client, monkeypatch, tmp_path, declare_type
):
    mock_document_processing(monkeypatch)
    paths = generate_samples(tmp_path)
    case_id = create_document_case(client)
    evidence_ids = {}
    for path, kind in zip(paths, ["aadhaar", "pan", "driving_licence"], strict=True):
        response = client.post(
            f"/api/v1/cases/{case_id}/evidence/upload",
            data={"document_type": kind} if declare_type else {},
            files={"file": (path.name, path.read_bytes(), "application/pdf")},
        )
        assert response.status_code == 201, response.text
        assert response.json()["evidence"]["document_analysis"]["status"] == (
            "matched" if declare_type else "detected"
        )
        evidence_ids[kind] = response.json()["evidence"]["evidence_id"]
    candidates = client.get(f"/api/v1/cases/{case_id}/candidates").json()
    assert not any(item["field_path"] == "aadhaar.date_of_birth" for item in candidates)
    assert not any(
        item["field_path"] == "applicant.include_driving_licence" for item in candidates
    )
    assert all(item["extractor_type"] == "document_field" for item in candidates)
    for item in candidates:
        kind = item["field_path"].split(".")[0]
        assert item["source_evidence_ids"] == [evidence_ids[kind]]
        assert item["source_refs"][0]["analysis_id"]
        assert item["source_refs"][0]["document_source"]["document_type"] == kind
    client.post(
        f"/api/v1/cases/{case_id}/fields/applicant.include_driving_licence/edit",
        json={"value": True},
    )
    state = client.get(f"/api/v1/cases/{case_id}").json()["current_schema_state"]
    for kind, values in EXPECTED.items():
        for key, value in values.items():
            assert state[kind][key] == value
    assert state["aadhaar"].get("date_of_birth") is None


def test_mismatched_document_creates_no_bound_candidates(client, monkeypatch, tmp_path):
    mock_document_processing(monkeypatch)
    pan_path = generate_samples(tmp_path)[1]
    case_id = create_document_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": "aadhaar"},
        files={"file": ("aadhaar.pdf", pan_path.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201
    assert response.json()["evidence"]["document_analysis"]["status"] == "mismatch"
    assert client.get(f"/api/v1/cases/{case_id}/candidates").json() == []


def test_optional_driving_fields_do_not_block_validation(client):
    case_id = create_document_case(client)
    template = client.get(f"/api/v1/templates/{TEMPLATE_ID}").json()
    fields = [
        TemplateField.model_validate(item)
        for item in template["schema"]
        if item["path"].startswith("driving_licence.")
    ]
    assert all(
        not is_field_active(field, {"applicant": {"include_driving_licence": False}})
        for field in fields
    )
    assert all(
        is_field_active(field, {"applicant": {"include_driving_licence": True}})
        for field in fields
    )
    client.post(
        f"/api/v1/cases/{case_id}/fields/applicant.include_driving_licence/edit",
        json={"value": False},
    )
    issues = client.get(f"/api/v1/cases/{case_id}/validation").json()
    assert not any(
        issue["field_path"].startswith("driving_licence.") for issue in issues
    )
    client.post(
        f"/api/v1/cases/{case_id}/fields/applicant.include_driving_licence/edit",
        json={"value": True},
    )
    issues = client.get(f"/api/v1/cases/{case_id}/validation").json()
    assert {
        issue["field_path"]
        for issue in issues
        if issue["field_path"].startswith("driving_licence.")
    } == {
        "driving_licence.full_name",
        "driving_licence.document_number",
        "driving_licence.expiry_date",
    }


@pytest.mark.parametrize(
    "source",
    [
        {"country": "IN", "document_type": "pan", "field": "address"},
        {"country": "US", "document_type": "pan", "field": "document_number"},
    ],
)
def test_invalid_document_bindings_are_rejected(source):
    with pytest.raises(ValidationError):
        TemplateField(
            path="test",
            label="Test",
            type="string",
            default_question="Test?",
            clarification_question="Test?",
            document_source=source,
        )
