from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

import app.extraction.service as extraction
from app.templates.models import TemplateDefinition
from scripts.generate_identity_samples import generate_samples
from tests.test_document_template import create_document_case, mock_document_processing


def test_identity_upload_skips_user_only_choice_extractor(
    client, monkeypatch, tmp_path
):
    mock_document_processing(monkeypatch)
    bad_generic_response = AsyncMock(return_value={})
    monkeypatch.setattr(extraction, "generate_json", bad_generic_response)
    case_id = create_document_case(client)
    aadhaar = generate_samples(tmp_path)[0]
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": "aadhaar"},
        files={"file": (aadhaar.name, aadhaar.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    assert response.json()["job"]["status"] == "completed"
    assert bad_generic_response.await_count == 0
    state = client.get(f"/api/v1/cases/{case_id}").json()["current_schema_state"]
    assert state["aadhaar"]["full_name"] == "Kavya Sample"
    assert state.get("applicant", {}).get("include_driving_licence") is None


def test_malformed_envelope_is_retried_with_explicit_empty_array_contract(
    client, monkeypatch
):
    template = TemplateDefinition.model_validate(
        client.get("/api/v1/templates/indian-document-intake").json()
    )
    model = AsyncMock(side_effect=[{}, {"candidates": []}])
    monkeypatch.setattr(extraction, "generate_json", model)
    result = asyncio.run(
        extraction.extract_candidates_with_llm(template, "No applicable details")
    )
    assert result == []
    assert model.await_count == 2
    assert '"candidates": []' in model.await_args.kwargs["system_prompt"]


def test_persistently_malformed_envelope_is_not_silently_accepted(client, monkeypatch):
    template = TemplateDefinition.model_validate(
        client.get("/api/v1/templates/indian-document-intake").json()
    )
    model = AsyncMock(return_value={})
    monkeypatch.setattr(extraction, "generate_json", model)
    with pytest.raises(RuntimeError, match="missing the candidates list"):
        asyncio.run(extraction.extract_candidates_with_llm(template, "Evidence"))
    assert model.await_count == 2


def test_grounded_fields_survive_failure_in_another_extraction_stage(
    client, monkeypatch, tmp_path
):
    mock_document_processing(monkeypatch)
    definition = client.get("/api/v1/templates/indian-document-intake").json()
    definition["template_id"] = "mixed-document-extraction"
    next(
        field
        for field in definition["schema"]
        if field["path"] == "applicant.include_driving_licence"
    )["allow_document_extraction"] = True
    assert client.post("/api/v1/templates", json=definition).status_code == 201
    case = client.post(
        "/api/v1/cases",
        json={"template_id": definition["template_id"], "template_version": 1},
    ).json()
    case_id = case["case_id"]
    monkeypatch.setattr(extraction, "generate_json", AsyncMock(return_value={}))
    aadhaar = generate_samples(tmp_path)[0]
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": "aadhaar"},
        files={"file": (aadhaar.name, aadhaar.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 422
    state = client.get(f"/api/v1/cases/{case_id}").json()["current_schema_state"]
    assert state["aadhaar"]["document_number"] == "XXXX XXXX 4826"
    candidates = client.get(f"/api/v1/cases/{case_id}/candidates").json()
    assert candidates and all(
        item["extractor_type"] == "document_field" for item in candidates
    )
    assert client.get(f"/api/v1/cases/{case_id}/jobs").json()[0]["status"] == "failed"
