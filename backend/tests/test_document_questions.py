from __future__ import annotations

import app.documents.ocr as document_ocr
from scripts.generate_identity_samples import generate_samples
from tests.test_document_template import create_document_case, mock_document_processing


def next_question(client, case_id):
    response = client.get(f"/api/v1/cases/{case_id}/conversation/next-question")
    assert response.status_code == 200
    return response.json()


def upload(client, case_id, path, kind):
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": kind},
        files={"file": (path.name, path.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_document_question_precedes_name_questions_and_reuses_turn(client):
    case_id = create_document_case(client)
    question = next_question(client, case_id)
    assert question["kind"] == "document_upload"
    assert question["priority"] == 0
    assert question["documents"] == [
        {"country": "IN", "document_type": "aadhaar"},
        {"country": "IN", "document_type": "pan"},
    ]
    assert "Please upload" in question["question"]
    assert next_question(client, case_id) == question
    history = client.get(f"/api/v1/cases/{case_id}/conversation/turns").json()
    assert len(history) == 1
    assert history[0]["metadata"]["question_payload"]["kind"] == "document_upload"


def test_text_reply_and_note_are_rejected_without_recording_evidence(client):
    case_id = create_document_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={"message": "My name is Kavya Sample", "language": "en"},
    )
    assert response.status_code == 409
    assert "requires a document upload" in response.json()["detail"]
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/text", json={"text": "I'll type instead"}
    )
    assert response.status_code == 409
    approval = client.post(f"/api/v1/cases/{case_id}/approve")
    assert approval.status_code == 409
    assert "documents must be uploaded" in approval.json()["detail"]
    assert client.get(f"/api/v1/cases/{case_id}/evidence").json() == []
    assert len(client.get(f"/api/v1/cases/{case_id}/conversation/turns").json()) == 1


def test_documents_advance_individually_then_request_fields(
    client, monkeypatch, tmp_path
):
    mock_document_processing(monkeypatch)
    aadhaar, pan, dl = generate_samples(tmp_path)
    case_id = create_document_case(client)
    upload(client, case_id, aadhaar, "aadhaar")
    assert next_question(client, case_id)["documents"] == [
        {"country": "IN", "document_type": "pan"}
    ]
    upload(client, case_id, pan, "pan")
    question = next_question(client, case_id)
    assert question["kind"] == "field"
    assert question["field_path"] == "applicant.include_driving_licence"
    client.post(
        f"/api/v1/cases/{case_id}/fields/applicant.include_driving_licence/edit",
        json={"value": True},
    )
    assert next_question(client, case_id)["documents"] == [
        {"country": "IN", "document_type": "driving_licence"}
    ]
    upload(client, case_id, dl, "driving_licence")
    assert (next_question(client, case_id) or {}).get("kind") != "document_upload"


def test_type_mismatch_does_not_satisfy_upload_question(client, monkeypatch, tmp_path):
    mock_document_processing(monkeypatch)
    pan = generate_samples(tmp_path)[1]
    case_id = create_document_case(client)
    response = upload(client, case_id, pan, "aadhaar")
    assert response["evidence"]["document_analysis"]["status"] == "mismatch"
    assert len(next_question(client, case_id)["documents"]) == 2


def test_recognized_partial_document_allows_later_field_questions(
    client, monkeypatch, tmp_path
):
    mock_document_processing(monkeypatch)
    original = document_ocr.generate_json

    async def missing_names(**kwargs):
        result = await original(**kwargs)
        result["fields"].pop("full_name")
        return result

    monkeypatch.setattr(document_ocr, "generate_json", missing_names)
    aadhaar, pan, _ = generate_samples(tmp_path)
    case_id = create_document_case(client)
    assert (
        upload(client, case_id, aadhaar, "aadhaar")["evidence"]["document_analysis"][
            "status"
        ]
        == "needs_review"
    )
    upload(client, case_id, pan, "pan")
    question = next_question(client, case_id)
    assert question["kind"] == "field"
    assert question["field_path"] == "aadhaar.full_name"


def test_manually_filled_fields_do_not_replace_required_uploads(client):
    case_id = create_document_case(client)
    client.post(
        f"/api/v1/cases/{case_id}/fields/aadhaar.full_name/edit",
        json={"value": "Kavya Sample"},
    )
    assert next_question(client, case_id)["documents"][0]["document_type"] == "aadhaar"
