"""Ground observations and run deterministic checks without asserting authenticity."""

from __future__ import annotations

import re
from datetime import date

from app.core.config import get_settings
from app.documents.models import (
    CheckOutcome,
    DocumentAnalysis,
    DocumentCheck,
    DocumentField,
    DocumentKind,
    StageResult,
)
from app.documents.ocr import OCRDocumentStage
from app.documents.pipeline import DocumentContext, DocumentStage, run_stages
from app.documents.registry import get_definition
from app.extraction.provenance import quote_is_supported


def get_document_stages() -> tuple[DocumentStage, ...]:
    """Register future layout, CV, and API adapters here in dependency order."""
    return (OCRDocumentStage(),)


def compact(value: str) -> str:
    return re.sub(r"\s+", "", value).casefold()


def number_outcome(kind: DocumentKind, value: str) -> CheckOutcome:
    number = re.sub(r"[\s-]", "", value).upper()
    if kind.document_type == "pan":
        return "pass" if re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", number) else "fail"
    if kind.document_type == "aadhaar":
        return (
            "pass"
            if re.fullmatch(r"(?:[2-9][0-9]{11}|[X*]{8}[0-9]{4})", number)
            else "fail"
        )
    if kind.document_type == "driving_licence":
        # Older state formats vary. Unrecognized formats need review, not rejection.
        return "pass" if re.fullmatch(r"[A-Z]{2}[0-9]{13}", number) else "inconclusive"
    return "inconclusive"


def check_fields(
    kind: DocumentKind, fields: dict[str, DocumentField]
) -> list[DocumentCheck]:
    checks: list[DocumentCheck] = []
    for key, item in fields.items():
        outcome: CheckOutcome = "pass"
        if key == "document_number":
            outcome = number_outcome(kind, item.value)
        elif key in {"date_of_birth", "issue_date", "expiry_date"}:
            value = item.value.strip()
            try:
                if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
                    date.fromisoformat(value)
                elif match := re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", value):
                    day, month, year = map(int, match.groups())
                    date(year, month, day)
                else:
                    outcome = "inconclusive"
            except ValueError:
                outcome = "fail"
        elif key == "year_of_birth":
            outcome = (
                "pass"
                if re.fullmatch(r"\d{4}", item.value.strip())
                and 1900 <= int(item.value) <= date.today().year
                else "fail"
            )
        else:
            continue
        checks.append(
            DocumentCheck(
                code="field_format", scope="format", outcome=outcome, field=key
            )
        )
    return checks


def summarize(context: DocumentContext, stages: list[StageResult]) -> DocumentAnalysis:
    checks = [check for stage in stages for check in stage.checks]
    checks.append(
        DocumentCheck(
            code="authenticity_not_checked", scope="authenticity", outcome="skipped"
        )
    )
    analysis = DocumentAnalysis(
        declared=context.declared, status="needs_review", stages=stages, checks=checks
    )
    checks = analysis.checks
    observations = [
        stage.observation
        for stage in stages
        if stage.status == "completed" and stage.observation is not None
    ]
    if any(stage.status == "error" for stage in stages):
        analysis.status = "error"
    if not observations:
        return analysis
    # Classification is owned by the first observation-producing stage. Subsequent
    # adapters contribute checks and regions, rather than silently overwriting it.
    observation = observations[0]
    kind = observation.detected
    if kind is None or observation.confidence < 0.8 or get_definition(kind) is None:
        checks.append(
            DocumentCheck(
                code="document_unrecognized",
                scope="classification",
                outcome="inconclusive",
            )
        )
        return analysis
    definition = get_definition(kind)
    assert definition is not None
    type_quote = " ".join(observation.type_quote.casefold().split())
    has_indicator = any(
        re.search(rf"(?<!\w){re.escape(indicator.casefold())}(?!\w)", type_quote)
        for indicator in definition.type_indicators
    )
    if (
        not quote_is_supported(observation.type_quote, context.text)
        or not has_indicator
    ):
        checks.append(
            DocumentCheck(
                code="type_evidence_missing",
                scope="classification",
                outcome="inconclusive",
            )
        )
        return analysis
    analysis.detected = kind
    analysis.classification_confidence = observation.confidence
    analysis.type_source_quote = observation.type_quote
    for key, item in observation.fields.items():
        if (
            key not in definition.fields
            or not quote_is_supported(item.source_quote, context.text)
            or compact(item.value) not in compact(item.source_quote)
        ):
            checks.append(
                DocumentCheck(
                    code="field_evidence_missing",
                    scope="extraction",
                    outcome="inconclusive",
                    field=key,
                )
            )
        else:
            analysis.fields[key] = item
            if item.confidence < 0.8:
                checks.append(
                    DocumentCheck(
                        code="field_low_confidence",
                        scope="extraction",
                        outcome="inconclusive",
                        field=key,
                    )
                )
    for key in definition.required_fields:
        checks.append(
            DocumentCheck(
                code="required_field",
                scope="extraction",
                outcome="pass" if key in analysis.fields else "inconclusive",
                field=key,
            )
        )
    checks.extend(check_fields(kind, analysis.fields))
    type_matches = context.declared is None or context.declared == kind
    checks.append(
        DocumentCheck(
            code="document_type",
            scope="classification",
            outcome="pass" if type_matches else "fail",
        )
    )
    # Publish only grounded fields; raw provider output must not leak into results.
    for stage in stages:
        stage.observation = None
    if analysis.status == "error":
        return analysis
    if not type_matches:
        analysis.status = "mismatch"
    elif any(check.outcome in {"fail", "inconclusive", "error"} for check in checks):
        analysis.status = "needs_review"
    else:
        analysis.status = "matched" if context.declared else "detected"
    return analysis


async def analyze_document(context: DocumentContext) -> DocumentAnalysis:
    if not context.text.strip():
        return DocumentAnalysis(
            declared=context.declared,
            status="needs_review",
            checks=[
                DocumentCheck(
                    code="document_unreadable",
                    scope="extraction",
                    outcome="inconclusive",
                ),
                DocumentCheck(
                    code="authenticity_not_checked",
                    scope="authenticity",
                    outcome="skipped",
                ),
            ],
        )
    settings = get_settings()
    if len(context.text) > settings.document_text_max_chars:
        return DocumentAnalysis(
            declared=context.declared,
            status="error",
            stages=[
                StageResult(
                    stage="document_input",
                    version="1",
                    status="error",
                    error_code="text_limit_exceeded",
                )
            ],
            checks=[
                DocumentCheck(
                    code="authenticity_not_checked",
                    scope="authenticity",
                    outcome="skipped",
                )
            ],
        )
    stages = await run_stages(
        context,
        get_document_stages(),
        timeout_seconds=settings.document_stage_timeout_seconds,
    )
    result = summarize(context, stages)
    # Even unsuccessful classifications must discard ungrounded model output.
    for stage in result.stages:
        stage.observation = None
    return result
