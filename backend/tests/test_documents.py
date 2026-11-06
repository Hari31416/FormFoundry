from __future__ import annotations

import asyncio

import pytest
from fastapi.testclient import TestClient

import app.documents.ocr as ocr
import app.extraction.service as extraction
from app.core.config import get_settings
from app.documents.models import DocumentCheck, DocumentKind, StageResult
from app.documents.pipeline import DocumentContext, run_stages
from app.documents.service import analyze_document
from tests.test_intake import create_case

PAN_TEXT = "INCOME TAX DEPARTMENT\nPermanent Account Number\nABCDE1234F\nPriya Sharma\n01/02/1990"


def observation(document_type="pan", **updates):
    payload = {
        "detected": {"country": "IN", "document_type": document_type},
        "confidence": 0.95,
        "type_quote": "INCOME TAX DEPARTMENT",
        "fields": {
            "document_number": {
                "value": "ABCDE1234F",
                "source_quote": "ABCDE1234F",
                "confidence": 0.98,
            },
            "full_name": {
                "value": "Priya Sharma",
                "source_quote": "Priya Sharma",
                "confidence": 0.95,
            },
            "date_of_birth": {
                "value": "01/02/1990",
                "source_quote": "01/02/1990",
                "confidence": 0.9,
            },
        },
    }
    return {**payload, **updates}


async def no_media() -> bytes:
    raise AssertionError("Text-only stage must not load original media")


def context(text=PAN_TEXT, declared="pan"):
    return DocumentContext(
        evidence_id="evidence-1",
        text=text,
        declared=(
            DocumentKind(country="IN", document_type=declared) if declared else None
        ),
        content_type="image/png",
        load_bytes=no_media,
    )


def mock_observation(monkeypatch, payload):
    async def generate(**kwargs):
        # Declaration must never bias classification.
        assert "declared" not in kwargs["user_prompt"]
        return payload

    monkeypatch.setattr(ocr, "generate_json", generate)


@pytest.mark.asyncio
async def test_classification_and_extraction_are_grounded(monkeypatch):
    mock_observation(monkeypatch, observation())
    result = await analyze_document(context())
    assert result.status == "matched"
    assert result.fields["full_name"].value == "Priya Sharma"
    assert result.authenticity_checked is False
    assert all(stage.observation is None for stage in result.stages)
    assert (
        next(check for check in result.checks if check.scope == "authenticity").outcome
        == "skipped"
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "declared,status", [("aadhaar", "mismatch"), (None, "detected")]
)
async def test_declared_type_is_compared_after_independent_classification(
    monkeypatch, declared, status
):
    mock_observation(monkeypatch, observation())
    assert (await analyze_document(context(declared=declared))).status == status


@pytest.mark.asyncio
async def test_hallucinated_fields_and_wrong_value_quotes_are_removed(monkeypatch):
    payload = observation()
    payload["fields"]["full_name"]["value"] = "Another Person"
    payload["fields"]["address"] = {
        "value": "Mumbai",
        "source_quote": "Mumbai",
        "confidence": 1,
    }
    mock_observation(monkeypatch, payload)
    result = await analyze_document(context())
    assert result.status == "needs_review"
    assert "full_name" not in result.fields
    assert "address" not in result.fields
    assert "Another Person" not in result.model_dump_json()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "updates",
    [
        {"confidence": 0.5},
        {"type_quote": "Priya Sharma"},
        {"type_quote": "Forged unseen header"},
        {"detected": {"country": "US", "document_type": "pan"}},
        {"detected": None, "fields": {}},
    ],
)
async def test_uncertain_or_unsupported_classification_is_not_accepted(
    monkeypatch, updates
):
    mock_observation(monkeypatch, observation(**updates))
    result = await analyze_document(context())
    assert result.status == "needs_review"
    assert result.detected is None
    assert result.fields == {}


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "text,number,status",
    [
        ("UIDAI Aadhaar\nXXXX XXXX 1234\nPriya Sharma", "XXXX XXXX 1234", "matched"),
        ("UIDAI Aadhaar\n123\nPriya Sharma", "123", "needs_review"),
    ],
)
async def test_masked_aadhaar_and_invalid_number(monkeypatch, text, number, status):
    payload = observation("aadhaar", type_quote="UIDAI Aadhaar")
    payload["fields"].pop("date_of_birth")
    payload["fields"]["document_number"].update(value=number, source_quote=number)
    mock_observation(monkeypatch, payload)
    assert (
        await analyze_document(context(text=text, declared="aadhaar"))
    ).status == status


@pytest.mark.asyncio
async def test_invalid_date_needs_review(monkeypatch):
    payload = observation()
    payload["fields"]["date_of_birth"].update(
        value="31/02/1990", source_quote="31/02/1990"
    )
    mock_observation(monkeypatch, payload)
    result = await analyze_document(
        context(text=PAN_TEXT.replace("01/02/1990", "31/02/1990"))
    )
    assert result.status == "needs_review"
    assert any(
        check.field == "date_of_birth" and check.outcome == "fail"
        for check in result.checks
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        None,
        {"confidence": 4},
        {"detected": None, "confidence": 0, "fields": {"x": {"value": "x"}}},
    ],
)
async def test_malformed_provider_results_are_safe_errors(monkeypatch, payload):
    mock_observation(monkeypatch, payload)
    result = await analyze_document(context())
    assert result.status == "error"
    assert result.stages[0].error_code == "analysis_failed"


@pytest.mark.asyncio
async def test_future_cv_stage_gets_original_media_and_prior_results():
    reads = 0

    async def load():
        nonlocal reads
        reads += 1
        return b"original image"

    ctx = context()
    ctx.load_bytes = load

    class TextStage:
        name = "text"
        version = "1"

        async def analyze(self, ctx, previous):
            assert previous == ()
            return StageResult(stage=self.name, version=self.version)

    class CVStage:
        name = "layout"
        version = "2"

        async def analyze(self, ctx, previous):
            assert previous[0].stage == "text"
            assert await ctx.original() == b"original image"
            assert await ctx.pages() == [b"original image"]
            return StageResult(
                stage=self.name,
                version=self.version,
                checks=[
                    DocumentCheck(code="layout", scope="classification", outcome="pass")
                ],
            )

    results = await run_stages(ctx, [TextStage(), CVStage()])
    assert reads == 1
    assert results[1].checks[0].code == "layout"


@pytest.mark.asyncio
async def test_stage_timeout_does_not_stop_subsequent_stages():
    class SlowStage:
        name = "slow"
        version = "1"

        async def analyze(self, ctx, previous):
            await asyncio.sleep(1)
            return StageResult(stage=self.name, version=self.version)

    result = await run_stages(context(), [SlowStage()], timeout_seconds=0.01)
    assert result[0].status == "error"
    assert result[0].error_code == "timeout"


def test_declared_upload_roundtrip_and_cross_case_isolation(
    client: TestClient, monkeypatch
):
    mock_observation(monkeypatch, observation())
    case_id = create_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": "pan"},
        files={"file": ("document.png", PAN_TEXT.encode(), "image/png")},
    )
    assert response.status_code == 201, response.text
    evidence = response.json()["evidence"]
    assert evidence["document_analysis"]["status"] == "matched"
    endpoint = (
        f"/api/v1/cases/{case_id}/evidence/{evidence['evidence_id']}/document-analysis"
    )
    analysis = client.get(endpoint)
    assert analysis.status_code == 200
    assert analysis.json() == evidence["document_analysis"]
    assert (
        client.get(f"/api/v1/cases/{case_id}/evidence").json()[0]["document_analysis"]
        == analysis.json()
    )
    other_case = create_case(client)
    assert client.get(endpoint.replace(case_id, other_case)).status_code == 404
    assert (
        client.get(endpoint, headers={"Authorization": "Bearer invalid"}).status_code
        == 401
    )
    catalog = client.get("/api/v1/documents/types").json()
    assert {item["document_type"] for item in catalog} == {
        "aadhaar",
        "pan",
        "driving_licence",
    }


def test_mismatch_does_not_populate_case_fields(client: TestClient, monkeypatch):
    mock_observation(monkeypatch, observation())
    case_id = create_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": "aadhaar"},
        files={
            "file": (
                "aadhaar.png",
                (PAN_TEXT + "\nComplainant name is Priya Sharma").encode(),
                "image/png",
            )
        },
    )
    assert response.status_code == 201
    assert response.json()["evidence"]["document_analysis"]["status"] == "mismatch"
    assert client.get(f"/api/v1/cases/{case_id}/candidates").json() == []


@pytest.mark.parametrize(
    "data",
    [
        {"document_type": "passport"},
        {"document_type": "pan", "document_country": "US"},
        {"document_country": "US"},
    ],
)
def test_invalid_declarations_rejected_before_storage(client, data):
    case_id = create_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data=data,
        files={"file": ("id.png", b"image", "image/png")},
    )
    assert response.status_code == 422
    assert client.get(f"/api/v1/cases/{case_id}/evidence").json() == []


def test_upload_size_limit_rejects_before_storage(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "upload_max_bytes", 4)
    case_id = create_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        files={"file": ("large.png", b"12345", "image/png")},
    )
    assert response.status_code == 413
    assert client.get(f"/api/v1/cases/{case_id}/evidence").json() == []


@pytest.mark.asyncio
async def test_empty_text_does_not_call_model(monkeypatch):
    async def fail(**kwargs):
        raise AssertionError("Model must not be called")

    monkeypatch.setattr(ocr, "generate_json", fail)
    result = await analyze_document(context(text=""))
    assert result.status == "needs_review"
    assert result.checks[0].code == "document_unreadable"


@pytest.mark.asyncio
async def test_text_limit_does_not_call_model(monkeypatch):
    monkeypatch.setattr(get_settings(), "document_text_max_chars", 3)

    async def fail(**kwargs):
        raise AssertionError("Model must not be called")

    monkeypatch.setattr(ocr, "generate_json", fail)
    result = await analyze_document(context())
    assert result.status == "error"
    assert result.stages[0].error_code == "text_limit_exceeded"


def test_ocr_failure_persists_document_error(client, monkeypatch):
    async def fail(*args, **kwargs):
        raise RuntimeError("OCR unavailable")

    monkeypatch.setattr(extraction, "extract_text_from_image_bytes", fail)
    case_id = create_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": "pan"},
        files={"file": ("pan.png", b"image", "image/png")},
    )
    assert response.status_code == 422
    evidence = client.get(f"/api/v1/cases/{case_id}/evidence").json()[0]
    assert evidence["document_analysis"]["status"] == "error"
    assert evidence["document_analysis"]["stages"][0]["error_code"] == "ocr_failed"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "number,status", [("KA0120200012345", "matched"), ("KA/01/OLD/123", "needs_review")]
)
async def test_driving_licence_formats_and_optional_reverse_side_fields(
    monkeypatch, number, status
):
    text = f"Driving Licence\n{number}\nPriya Sharma"
    payload = observation("driving_licence", type_quote="Driving Licence")
    payload["fields"].pop("date_of_birth")
    payload["fields"]["document_number"].update(value=number, source_quote=number)
    mock_observation(monkeypatch, payload)
    result = await analyze_document(context(text=text, declared="driving_licence"))
    assert result.status == status
    assert "address" not in result.fields
