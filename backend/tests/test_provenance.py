from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from app.extraction.provenance import quote_is_supported, source_refs_are_supported


@pytest.mark.parametrize(
    ("quote", "text", "expected"),
    [
        ("Hari", "hari, 22 july 1995", True),
        ("User answer: No", "No", True),
        ("22 july 1995", "22  July\n1995", True),
        ("hari", "fever", False),
        ("male", "female", False),
        ("Sci-Fi", "Fantasy", False),
        ("", "No", False),
        (None, "No", False),
    ],
)
def test_quote_requires_current_evidence(quote, text, expected) -> None:
    assert quote_is_supported(quote, text) is expected


def create_case(client: TestClient) -> str:
    response = client.post(
        "/api/v1/cases",
        json={"template_id": "fir-report-intake", "created_by": "provenance-test"},
    )
    assert response.status_code == 201
    return response.json()["case_id"]


def candidate(value: str, quote: str | None, confidence: float = 0.99) -> dict:
    return {
        "field_path": "complainant.full_name",
        "candidate_value": value,
        "source_quote": quote,
        "confidence": confidence,
        "rationale": "Extracted name.",
    }


def get_name_state(client: TestClient, case_id: str) -> dict:
    states = client.get(f"/api/v1/cases/{case_id}").json()["field_states"]
    return next(
        state for state in states if state["field_path"] == "complainant.full_name"
    )


def test_history_and_question_quotes_cannot_become_current_chat_sources(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.extraction.service as extraction_service

    case_id = create_case(client)
    extractor = AsyncMock(
        side_effect=[
            {"candidates": [candidate("Priya Sharma", "Priya Sharma")]},
            {
                "candidates": [
                    candidate("Priya Sharma", "Priya Sharma"),
                    candidate("Invented name", None),
                    candidate("Assistant example", "Complainant full name"),
                ]
            },
        ]
    )
    monkeypatch.setattr(extraction_service, "generate_json", extractor)
    url = f"/api/v1/cases/{case_id}/conversation/turns"
    assert (
        client.post(url, json={"message": "Priya Sharma", "language": "en"}).status_code
        == 200
    )
    initial_sources = get_name_state(client, case_id)["source_evidence_ids"]
    assert len(initial_sources) == 1
    assert (
        client.post(url, json={"message": "fever", "language": "en"}).status_code == 200
    )
    state = get_name_state(client, case_id)
    assert state["resolved_value"] == "Priya Sharma"
    assert state["source_evidence_ids"] == initial_sources
    candidates = client.get(f"/api/v1/cases/{case_id}/candidates").json()
    assert len(candidates) == 1


def test_selected_value_excludes_losing_candidate_provenance(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.extraction.service as extraction_service

    case_id = create_case(client)
    monkeypatch.setattr(
        extraction_service,
        "generate_json",
        AsyncMock(
            side_effect=[
                {"candidates": [candidate("Priya Sharma", "Priya Sharma", 0.99)]},
                {"candidates": [candidate("Jordan Sharma", "Jordan Sharma", 0.80)]},
            ]
        ),
    )
    url = f"/api/v1/cases/{case_id}/evidence/text"
    first = client.post(url, json={"text": "Priya Sharma"}).json()["evidence"]
    client.post(url, json={"text": "Jordan Sharma"})
    state = get_name_state(client, case_id)
    assert state["resolved_value"] == "Priya Sharma"
    assert state["source_evidence_ids"] == [first["evidence_id"]]


async def test_resolver_repairs_legacy_history_citations_without_deleting_them(
    client: TestClient,
) -> None:
    from sqlalchemy import select

    from app.db import get_session_maker
    from app.extraction.models import FieldCandidateRecord
    from app.intake.models import EvidenceRecord, EvidenceSourceType
    from app.resolution.service import resolve_case_fields

    case_id = create_case(client)
    response = client.post(
        f"/api/v1/cases/{case_id}/conversation/turns",
        json={"message": "My name is Priya Sharma.", "language": "en"},
    )
    assert response.status_code == 200
    initial_sources = get_name_state(client, case_id)["source_evidence_ids"]
    async with get_session_maker()() as session:
        evidence = EvidenceRecord(
            case_id=case_id,
            source_type=EvidenceSourceType.CHAT_ANSWER,
            source_subtype="conversation_turn",
            storage_uri="local://test",
            raw_text="fever",
            created_by="test",
        )
        session.add(evidence)
        await session.flush()
        invalid = FieldCandidateRecord(
            case_id=case_id,
            field_path="complainant.full_name",
            candidate_value="Priya Sharma",
            confidence=1.0,
            source_evidence_ids=[evidence.evidence_id],
            source_refs=[{"source_quote": "Priya Sharma"}],
            extractor_type="litellm",
            rationale="Copied from history.",
        )
        session.add(invalid)
        await session.flush()
        await resolve_case_fields(session, case_id)
        await session.commit()
        assert (
            await session.execute(
                select(FieldCandidateRecord).where(
                    FieldCandidateRecord.candidate_id == invalid.candidate_id
                )
            )
        ).scalar_one() is not None
    state = get_name_state(client, case_id)
    assert state["resolved_value"] == "Priya Sharma"
    assert state["source_evidence_ids"] == initial_sources
    assert invalid.candidate_id not in state["candidate_ids"]


def test_merged_quotes_must_all_exist_in_evidence() -> None:
    assert source_refs_are_supported([{"source_quote": "Hari | 1995"}], "Hari, 1995")
    assert not source_refs_are_supported([{"source_quote": "Hari | 1995"}], "fever")
