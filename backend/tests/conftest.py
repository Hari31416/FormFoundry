from __future__ import annotations

import asyncio
import os
import re
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.db import dispose_engine
from app.main import create_app


async def fake_generate_json(*, system_prompt: str, user_prompt: str) -> dict:
    lowered_prompt = user_prompt.lower()

    if "field catalog:" in lowered_prompt:
        # History is context, not new evidence for this extraction.
        lowered_prompt = lowered_prompt.split("source text:\n", 1)[-1]
        candidates: list[dict] = []

        name_match = re.search(
            r"(?:complainant name|my name is|i am)\s*(?:is|:)?\s*([a-z]+ [a-z]+)",
            lowered_prompt,
        )
        if name_match:
            candidates.append(
                {
                    "field_path": "complainant.full_name",
                    "candidate_value": name_match.group(1).title(),
                    "confidence": 0.92,
                    "rationale": "Detected complainant name.",
                    "source_quote": name_match.group(0),
                }
            )

        phone_match = re.search(r"(9876543210|9988776655|9123456789)", lowered_prompt)
        if phone_match:
            candidates.append(
                {
                    "field_path": "complainant.phone",
                    "candidate_value": phone_match.group(1),
                    "confidence": 0.91,
                    "rationale": "Detected phone number.",
                    "source_quote": phone_match.group(1),
                }
            )

        if "14 residency road, bengaluru" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "complainant.address",
                    "candidate_value": "14 Residency Road, Bengaluru",
                    "confidence": 0.89,
                    "rationale": "Detected complainant address.",
                    "source_quote": "14 residency road, bengaluru",
                }
            )

        if "2026-04-17" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "incident.date",
                    "candidate_value": "2026-04-17",
                    "confidence": 0.9,
                    "rationale": "Detected incident date.",
                    "source_quote": "2026-04-17",
                }
            )

        if "21:15" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "incident.time",
                    "candidate_value": "21:15",
                    "confidence": 0.9,
                    "rationale": "Detected incident time.",
                    "source_quote": "21:15",
                }
            )

        if "mg road" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "incident.location",
                    "candidate_value": "MG Road, Bengaluru",
                    "confidence": 0.88,
                    "rationale": "Detected incident location.",
                    "source_quote": "mg road",
                }
            )

        if "ashok nagar police station" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "incident.police_station",
                    "candidate_value": "Ashok Nagar Police Station",
                    "confidence": 0.88,
                    "rationale": "Detected police station.",
                    "source_quote": "ashok nagar police station",
                }
            )

        if "theft" in lowered_prompt or "stolen" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "incident.category",
                    "candidate_value": "theft",
                    "confidence": 0.93,
                    "rationale": "Detected theft category.",
                    "source_quote": "theft",
                }
            )

        summary_match = re.search(r"incident summary:\s*([^\n]+)", lowered_prompt)
        if summary_match:
            candidates.append(
                {
                    "field_path": "incident.summary",
                    "candidate_value": summary_match.group(1).strip().capitalize(),
                    "confidence": 0.9,
                    "rationale": "Detected incident summary.",
                    "source_quote": summary_match.group(0),
                }
            )

        if "unknown accused" in lowered_prompt or "accused not known" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "accused.known_to_complainant",
                    "candidate_value": False,
                    "confidence": 0.9,
                    "rationale": "Detected that accused is unknown.",
                    "source_quote": "unknown accused",
                }
            )

        if "no witnesses" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "witnesses.present",
                    "candidate_value": False,
                    "confidence": 0.9,
                    "rationale": "Detected no witnesses.",
                    "source_quote": "no witnesses",
                }
            )

        if (
            "relevant fields: accused known to complainant" in lowered_prompt
            and re.search(r"user answer:\s*yes\s*(?:\n|$)", lowered_prompt)
        ) or (
            "question asked: is the accused known to the complainant?" in lowered_prompt
            and re.search(r"user answer:\s*yes\s*(?:\n|$)", lowered_prompt)
        ):
            candidates.append(
                {
                    "field_path": "accused.known_to_complainant",
                    "candidate_value": True,
                    "confidence": 0.95,
                    "rationale": "Mapped affirmative answer to accused-known boolean.",
                    "source_quote": "user answer: yes",
                }
            )

        if (
            "relevant fields: accused known to complainant" in lowered_prompt
            and re.search(r"user answer:\s*no\s*(?:\n|$)", lowered_prompt)
        ) or (
            "question asked: is the accused known to the complainant?" in lowered_prompt
            and re.search(r"user answer:\s*no\s*(?:\n|$)", lowered_prompt)
        ):
            candidates.append(
                {
                    "field_path": "accused.known_to_complainant",
                    "candidate_value": False,
                    "confidence": 0.95,
                    "rationale": "Mapped negative answer to accused-known boolean.",
                    "source_quote": "user answer: no",
                }
            )

        if (
            "relevant fields: witnesses present" in lowered_prompt
            and re.search(r"user answer:\s*yes\s*(?:\n|$)", lowered_prompt)
        ) or (
            "question asked: were any witnesses present?" in lowered_prompt
            and re.search(r"user answer:\s*yes\s*(?:\n|$)", lowered_prompt)
        ):
            candidates.append(
                {
                    "field_path": "witnesses.present",
                    "candidate_value": True,
                    "confidence": 0.95,
                    "rationale": "Mapped affirmative answer to witnesses-present boolean.",
                    "source_quote": "user answer: yes",
                }
            )

        if (
            "relevant fields: witnesses present" in lowered_prompt
            and re.search(r"user answer:\s*no\s*(?:\n|$)", lowered_prompt)
        ) or (
            "question asked: were any witnesses present?" in lowered_prompt
            and re.search(r"user answer:\s*no\s*(?:\n|$)", lowered_prompt)
        ):
            candidates.append(
                {
                    "field_path": "witnesses.present",
                    "candidate_value": False,
                    "confidence": 0.95,
                    "rationale": "Mapped negative answer to witnesses-present boolean.",
                    "source_quote": "user answer: no",
                }
            )

        if "skip this" in lowered_prompt:
            candidates.append(
                {
                    "field_path": "loss.estimated_value_in_inr",
                    "candidate_value": "NA",
                    "confidence": 1.0,
                    "rationale": "User explicitly said to skip.",
                    "source_quote": "skip this",
                }
            )
            candidates.append(
                {
                    "field_path": "accused.details",
                    "candidate_value": "NA",
                    "confidence": 1.0,
                    "rationale": "User explicitly said to skip.",
                    "source_quote": "skip this",
                }
            )
            candidates.append(
                {
                    "field_path": "accused.known_to_complainant",
                    "candidate_value": "NA",
                    "confidence": 1.0,
                    "rationale": "User explicitly said to skip.",
                    "source_quote": "skip this",
                }
            )

        return {"candidates": candidates}

    labels = re.findall(r"- ([^:]+):", user_prompt)
    if labels:
        joined = ", ".join(label.lower() for label in labels)
        return {"question": f"Please share {joined}."}

    return {"question": "Please share the remaining FIR details."}


async def fake_extract_text_from_image_bytes(
    payload: bytes,
    *,
    content_type: str,
    context_label: str = "uploaded image",
) -> str:
    try:
        return payload.decode("utf-8")
    except UnicodeDecodeError:
        return (
            f"OCR extracted text from {context_label}. "
            "Complainant name is Priya Sharma and phone number is 9876543210."
        )


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    database_path = tmp_path / "formfoundry-test.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{database_path}"
    os.environ["ENVIRONMENT"] = "test"
    os.environ["LOCAL_STORAGE_PATH"] = str(tmp_path / ".storage")
    os.environ["STORAGE_BACKEND"] = "local"
    get_settings.cache_clear()

    import app.conversation.service as conversation_service
    import app.extraction.service as extraction_service

    monkeypatch.setattr(conversation_service, "generate_json", fake_generate_json)
    monkeypatch.setattr(extraction_service, "generate_json", fake_generate_json)
    monkeypatch.setattr(
        extraction_service,
        "extract_text_from_image_bytes",
        fake_extract_text_from_image_bytes,
    )

    with TestClient(create_app()) as test_client:
        yield test_client

    asyncio.run(dispose_engine())
    get_settings.cache_clear()
    os.environ.pop("DATABASE_URL", None)
    os.environ.pop("ENVIRONMENT", None)
    os.environ.pop("LOCAL_STORAGE_PATH", None)
    os.environ.pop("STORAGE_BACKEND", None)
