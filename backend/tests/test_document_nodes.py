from __future__ import annotations

import pytest

from scripts.generate_identity_samples import generate_samples
from tests.test_document_template import mock_document_processing


def definition(title="Intake - {identity.legal_name}"):
    return {
        "template_id": "document-node-test",
        "template_version": 1,
        "name": "Document node test",
        "domain": "identity",
        "description": "Document upload field",
        "schema": [
            {
                "path": "identity",
                "label": "PAN upload",
                "type": "document",
                "required": True,
                "default_question": "Upload PAN",
                "clarification_question": "Upload PAN",
                "document": {
                    "country": "IN",
                    "document_type": "pan",
                    "extractions": [
                        {"field": "full_name", "key": "legal_name"},
                        {"field": "date_of_birth", "key": "birth_date"},
                    ],
                },
            }
        ],
        "field_groups": [
            {"group_id": "identity", "label": "Identity", "field_paths": ["identity"]}
        ],
        "conversation_config": {"title_pattern": title},
        "supported_artifacts": ["pdf", "json_export"],
    }


def create_case(client, payload):
    response = client.post("/api/v1/templates", json=payload)
    assert response.status_code == 201, response.text
    response = client.post(
        "/api/v1/cases",
        json={"template_id": payload["template_id"], "template_version": 1},
    )
    assert response.status_code == 201, response.text
    return response.json()["case_id"]


def test_one_document_node_keeps_file_and_multiple_renamed_values(
    client, monkeypatch, tmp_path
):
    mock_document_processing(monkeypatch)
    payload = definition()
    case_id = create_case(client, payload)
    question = client.get(f"/api/v1/cases/{case_id}/conversation/next-question").json()
    assert question["kind"] == "document_upload"
    assert question["field_paths"] == ["identity"]
    pan = generate_samples(tmp_path)[1]
    response = client.post(
        f"/api/v1/cases/{case_id}/evidence/upload",
        data={"document_type": "pan"},
        files={"file": (pan.name, pan.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 201, response.text
    evidence_id = response.json()["evidence"]["evidence_id"]
    case = client.get(f"/api/v1/cases/{case_id}").json()
    assert [field["field_path"] for field in case["field_states"]] == ["identity"]
    assert case["template"]["schema"][0]["type"] == "document"
    value = case["current_schema_state"]["identity"]
    assert value["_file"] == {"evidence_id": evidence_id, "filename": pan.name}
    assert value["legal_name"] == "Kavya Sample"
    assert value["birth_date"] == "1994-07-12"
    assert "full_name" not in value
    assert case["metadata"]["title"] == "Intake - Kavya Sample"
    assert client.get(f"/api/v1/cases/{case_id}/validation").json() == []
    assert (
        client.post(
            f"/api/v1/cases/{case_id}/fields/identity/confirm", json={}
        ).status_code
        == 200
    )
    assert client.post(f"/api/v1/cases/{case_id}/approve").status_code == 200
    artifact = client.post(
        f"/api/v1/cases/{case_id}/artifacts", json={"artifact_type": "json_export"}
    ).json()
    exported = client.get(
        f"/api/v1/cases/{case_id}/artifacts/{artifact['artifact_id']}/download"
    ).json()
    assert exported["identity"] == value
    pdf = client.post(
        f"/api/v1/cases/{case_id}/artifacts", json={"artifact_type": "pdf"}
    )
    assert pdf.status_code == 201


def test_upload_only_document_and_replacement_do_not_create_conflicts(
    client, monkeypatch, tmp_path
):
    mock_document_processing(monkeypatch)
    payload = definition("")
    payload["schema"][0]["document"]["extractions"] = []
    case_id = create_case(client, payload)
    pan = generate_samples(tmp_path)[1]
    endpoint = f"/api/v1/cases/{case_id}/evidence/upload"
    first = client.post(
        endpoint,
        data={"document_type": "pan"},
        files={"file": ("first.pdf", pan.read_bytes(), "application/pdf")},
    )
    assert first.status_code == 201
    client.post(f"/api/v1/cases/{case_id}/fields/identity/confirm", json={})
    second = client.post(
        endpoint,
        data={"document_type": "pan"},
        files={"file": ("replacement.pdf", pan.read_bytes(), "application/pdf")},
    )
    assert second.status_code == 201
    case = client.get(f"/api/v1/cases/{case_id}").json()
    assert case["field_states"][0]["status"] == "proposed"
    assert (
        case["current_schema_state"]["identity"]["_file"]["filename"]
        == "replacement.pdf"
    )
    assert len(client.get(f"/api/v1/cases/{case_id}/candidates").json()) == 1
    assert len(client.get(f"/api/v1/cases/{case_id}/evidence").json()) == 2


@pytest.mark.parametrize(
    "mappings",
    [
        [{"field": "address", "key": "address"}],
        [{"field": "full_name", "key": "_file"}],
        [{"field": "full_name", "key": "person.name"}],
        [
            {"field": "full_name", "key": "name"},
            {"field": "father_name", "key": "name"},
        ],
    ],
)
def test_invalid_extraction_dictionaries_are_rejected(client, mappings):
    payload = definition("")
    payload["schema"][0]["document"]["extractions"] = mappings
    assert client.post("/api/v1/templates", json=payload).status_code == 422


def test_title_uses_only_configured_dictionary_keys(client):
    assert (
        client.post(
            "/api/v1/templates", json=definition("{identity.birth_date}")
        ).status_code
        == 201
    )
    for pattern in [
        "{identity.full_name}",
        "{identity._file.evidence_id}",
        "{identity}",
        "{identity.legal_name:>10}",
    ]:
        assert (
            client.post("/api/v1/templates", json=definition(pattern)).status_code
            == 422
        )


def test_typed_text_cannot_create_an_uploaded_file(client):
    case_id = create_case(client, definition())
    client.post(
        f"/api/v1/cases/{case_id}/fields/identity/edit",
        json={
            "value": {
                "_file": {"evidence_id": "not-an-upload", "filename": "pan.pdf"},
                "legal_name": "Invented",
            }
        },
    )
    issues = client.get(f"/api/v1/cases/{case_id}/validation").json()
    assert any(issue["rule_id"] == "document_upload" for issue in issues)
    assert client.post(f"/api/v1/cases/{case_id}/approve").status_code == 409
