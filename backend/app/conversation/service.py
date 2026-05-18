from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseDetail, CaseFileRecord, FieldStateStatus
from app.cases.service import get_case_detail
from app.conversation.models import (
    ConversationTurnPayload,
    ConversationTurnRecord,
    ConversationTurnRequest,
    ConversationTurnResponse,
    NextQuestionPayload,
)
from app.intake.service import create_chat_answer_evidence
from app.languages.manager import get_language_manager
from app.languages.utils import process_incoming_text
from app.llm import generate_json
from app.templates.models import TemplateField
from app.templates.runtime import is_field_active


@dataclass(slots=True)
class QuestionCandidate:
    priority: int
    field: TemplateField
    question: str
    reason: str
    order: int


def serialize_turn(record: ConversationTurnRecord) -> ConversationTurnPayload:
    return ConversationTurnPayload(
        turn_id=record.turn_id,
        case_id=record.case_id,
        role=record.role,
        message=record.message,
        related_field_path=record.related_field_path,
        metadata=record.turn_metadata,
        created_at=record.created_at,
    )


def format_labels(labels: list[str]) -> str:
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    return f"{', '.join(labels[:-1])}, and {labels[-1]}"


def get_group_id(detail: CaseDetail, field_path: str) -> str | None:
    for group in detail.template.field_groups:
        if field_path in group.field_paths:
            return group.group_id
    return None


def build_question_candidates(detail: CaseDetail) -> list[QuestionCandidate]:
    field_states_by_path = {
        field_state.field_path: field_state for field_state in detail.field_states
    }

    candidates: list[QuestionCandidate] = []
    for index, template_field in enumerate(detail.template.template_schema):
        if not is_field_active(template_field, detail.current_schema_state):
            continue

        field_state = field_states_by_path[template_field.path]
        if template_field.required and field_state.status == FieldStateStatus.MISSING:
            candidates.append(
                QuestionCandidate(
                    priority=1,
                    field=template_field,
                    question=template_field.default_question,
                    reason="Required field is missing.",
                    order=index,
                )
            )
        elif field_state.status == FieldStateStatus.CONFLICTED:
            candidates.append(
                QuestionCandidate(
                    priority=2,
                    field=template_field,
                    question=template_field.clarification_question,
                    reason="High-confidence evidence conflicts for this field.",
                    order=index,
                )
            )
        elif (
            template_field.required
            and field_state.status == FieldStateStatus.PROPOSED
            and field_state.confidence < 0.9
        ):
            candidates.append(
                QuestionCandidate(
                    priority=3,
                    field=template_field,
                    question=template_field.clarification_question,
                    reason="Required field is still low-confidence.",
                    order=index,
                )
            )
        elif (
            not template_field.required
            and field_state.status == FieldStateStatus.MISSING
        ):
            candidates.append(
                QuestionCandidate(
                    priority=4,
                    field=template_field,
                    question=template_field.default_question,
                    reason="Optional field is still empty.",
                    order=index,
                )
            )

    return sorted(candidates, key=lambda item: (item.priority, item.order))


async def generate_grouped_question(
    detail: CaseDetail,
    selected_fields: list[QuestionCandidate],
) -> str | None:
    field_lines: list[str] = []
    for candidate in selected_fields:
        help_text = (
            f" Help: {candidate.field.help_text}" if candidate.field.help_text else ""
        )
        enum_text = (
            f" Allowed values: {', '.join(candidate.field.enum_options)}"
            if candidate.field.enum_options
            else ""
        )
        field_lines.append(
            f"- {candidate.field.label}: {candidate.question}{help_text}{enum_text}"
        )

    field_details = "\n".join(field_lines)
    response = await generate_json(
        system_prompt=(
            "You write one concise follow-up question for a conversational form-filling assistant. "
            "Combine related missing or unclear fields into a single question. "
            'Return JSON only with the shape {"question": "..."}.'
        ),
        user_prompt=(
            f"Template: {detail.template.name}\n"
            f"Tone: {detail.template.conversation_config.get('tone', 'clear and direct')}\n"
            f"Fields to ask about:\n{field_details}"
        ),
    )
    if not response:
        return None

    question = response.get("question")
    if not isinstance(question, str):
        return None
    question = question.strip()
    return question or None


def build_fallback_grouped_question(selected_fields: list[QuestionCandidate]) -> str:
    if len(selected_fields) == 1:
        return selected_fields[0].question

    labels = [candidate.field.label.lower() for candidate in selected_fields]
    priority = selected_fields[0].priority
    if priority == 1:
        intro = "Please share these remaining required FIR details together"
    elif priority == 2:
        intro = "Please clarify these related FIR details together"
    elif priority == 3:
        intro = "Please confirm these related FIR details together"
    else:
        intro = "If available, please share these additional FIR details together"

    hints: list[str] = []
    if any(candidate.field.path == "incident.date" for candidate in selected_fields):
        hints.append("Use YYYY-MM-DD for the date")
    if any(
        candidate.field.path == "incident.category" for candidate in selected_fields
    ):
        hints.append("use the closest incident category")

    question = f"{intro}: {format_labels(labels)}."
    if hints:
        question = f"{question} {'; '.join(hints)}."
    return question


async def choose_next_question(detail: CaseDetail) -> NextQuestionPayload | None:
    candidates = build_question_candidates(detail)
    if not candidates:
        return None

    anchor = candidates[0]
    anchor_group_id = get_group_id(detail, anchor.field.path)
    max_grouped_fields = int(
        detail.template.conversation_config.get("max_grouped_fields", 3)
    )

    grouped_candidates = [anchor]
    if anchor_group_id and max_grouped_fields > 1:
        for candidate in candidates[1:]:
            if len(grouped_candidates) >= max_grouped_fields:
                break
            if candidate.priority != anchor.priority:
                continue
            if get_group_id(detail, candidate.field.path) != anchor_group_id:
                continue
            grouped_candidates.append(candidate)

    question = await generate_grouped_question(detail, grouped_candidates)
    if question is None:
        question = build_fallback_grouped_question(grouped_candidates)

    field_paths = [candidate.field.path for candidate in grouped_candidates]
    field_labels = [candidate.field.label for candidate in grouped_candidates]
    reason = (
        f"{grouped_candidates[0].reason} Related fields: {format_labels(field_labels)}."
        if len(grouped_candidates) > 1
        else grouped_candidates[0].reason
    )
    return NextQuestionPayload(
        field_path=field_paths[0],
        field_paths=field_paths,
        field_labels=field_labels,
        question=question,
        reason=reason,
        priority=grouped_candidates[0].priority,
    )


async def get_next_question(
    session: AsyncSession, case_id: str, translate: bool = True
) -> NextQuestionPayload | None:
    detail = await get_case_detail(session, case_id)
    payload = await choose_next_question(detail)
    if payload is not None:
        # Check if we have already saved any assistant turn in this case
        stmt = (
            select(ConversationTurnRecord)
            .where(
                ConversationTurnRecord.case_id == case_id,
                ConversationTurnRecord.role == "assistant",
            )
            .limit(1)
        )
        res = await session.execute(stmt)
        has_assistant_turn = res.scalar() is not None

        if not has_assistant_turn:
            # First question ever generated for this case! Persist it to history.
            original_english = payload.question
            await record_turn(
                session,
                case_id=case_id,
                role="assistant",
                message=original_english,
                related_field_path=payload.field_path,
                metadata={
                    "reason": payload.reason,
                    "field_paths": payload.field_paths,
                    "original_english": original_english,
                },
            )

        if translate:
            preferred_lang = detail.metadata.get("preferred_language", "en")
            if preferred_lang != "en":
                from app.languages.utils import process_outgoing_text

                payload.question = await process_outgoing_text(
                    payload.question, preferred_lang
                )
    return payload


async def record_turn(
    session: AsyncSession,
    *,
    case_id: str,
    role: str,
    message: str,
    related_field_path: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> ConversationTurnPayload:
    record = ConversationTurnRecord(
        case_id=case_id,
        role=role,
        message=message,
        related_field_path=related_field_path,
        turn_metadata=metadata or {},
    )
    session.add(record)
    await session.commit()
    return serialize_turn(record)


def is_refusal_or_dont_know(text: str) -> bool:
    normalized = text.strip().lower().strip("?!.,\"'")
    keywords = {
        "don't know",
        "dont know",
        "do not know",
        "no idea",
        "no clue",
        "have no idea",
        "have no clue",
        "refuse to answer",
        "skip",
        "not sure",
        "unsure",
        "i don't have",
        "i dont have",
        "cannot answer",
        "cant answer",
        "na",
        "n/a",
        "none",
        "skip question",
        "skip this",
        "i do not have",
        "don't want to",
        "dont want to",
    }
    if normalized in keywords:
        return True
    for phrase in keywords:
        if phrase in normalized:
            return True
    return False


async def submit_conversation_turn(
    session: AsyncSession, case_id: str, payload: ConversationTurnRequest
) -> ConversationTurnResponse:
    # 1. Fetch CaseFileRecord to get/set preferred language
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )

    preferred_lang = case_record.case_metadata.get("preferred_language", "en")

    # 2. Determine active language for this turn
    if payload.language:
        active_lang = payload.language
    else:
        # Dynamically detect language from the user's message
        manager = get_language_manager()
        active_lang = await manager.detect_language(payload.message)

    # 3. Update persistent preferred language if a change is detected
    if active_lang != preferred_lang:
        metadata = dict(case_record.case_metadata or {})
        metadata["preferred_language"] = active_lang
        case_record.case_metadata = metadata
        preferred_lang = active_lang

    # 4. Translate incoming user message from active_lang to English
    english_message = await process_incoming_text(payload.message, active_lang)

    next_question = await get_next_question(session, case_id, translate=False)

    user_was_refusing = False
    refused_mandatory_field_label = None

    if next_question and is_refusal_or_dont_know(english_message):
        from app.templates.service import get_template_definition

        template = await get_template_definition(
            session, case_record.template_id, case_record.template_version
        )
        if template:
            field_lookup = {f.path: f for f in template.template_schema}
            for path in next_question.field_paths:
                field = field_lookup.get(path)
                if field:
                    if not field.required:
                        # OPTIONAL field: save "NA" with 1.0 confidence
                        from app.extraction.models import FieldCandidateRecord

                        candidate = FieldCandidateRecord(
                            case_id=case_id,
                            field_path=path,
                            candidate_value="NA",
                            confidence=1.0,
                            source_evidence_ids=[],
                            source_refs=[{"refusal_handler": True}],
                            extractor_type="refusal_handler",
                            rationale=(
                                "User stated they do not know or "
                                "want to skip this optional field."
                            ),
                        )
                        session.add(candidate)
                    else:
                        # REQUIRED field: mark that user is refusing a mandatory field
                        user_was_refusing = True
                        refused_mandatory_field_label = field.label

            await session.flush()
            from app.resolution.service import resolve_case_fields

            await resolve_case_fields(session, case_id)

    user_turn = await record_turn(
        session,
        case_id=case_id,
        role="user",
        message=payload.message,
        related_field_path=next_question.field_path if next_question else None,
        metadata={
            "created_by": payload.created_by,
            "field_paths": next_question.field_paths if next_question else [],
            "detected_language": active_lang,
            "english_translation": english_message,
        },
    )
    await create_chat_answer_evidence(
        session,
        case_id,
        text=english_message,
        created_by=payload.created_by,
        metadata={
            "related_field_path": next_question.field_path if next_question else "",
            "related_field_paths": next_question.field_paths if next_question else [],
            "related_question": next_question.question if next_question else "",
            "related_field_labels": next_question.field_labels if next_question else [],
        },
    )
    refreshed_question_en = await get_next_question(session, case_id, translate=False)
    refreshed_question = await get_next_question(session, case_id, translate=True)
    assistant_turn = None
    if refreshed_question is not None:
        translated_question = refreshed_question.question
        original_english = (
            refreshed_question_en.question
            if refreshed_question_en
            else translated_question
        )

        if user_was_refusing:
            label_text = (
                refused_mandatory_field_label or refreshed_question.field_labels[0]
            )
            next_q_text = (
                refreshed_question_en.question
                if refreshed_question_en
                else refreshed_question.question
            )
            original_english = (
                f"I understand, but '{label_text}' is "
                f"mandatory to complete the intake. {next_q_text}"
            )
            if preferred_lang != "en":
                from app.languages.utils import process_outgoing_text

                translated_question = await process_outgoing_text(
                    original_english, preferred_lang
                )
            else:
                translated_question = original_english
            refreshed_question.question = translated_question

        assistant_turn = await record_turn(
            session,
            case_id=case_id,
            role="assistant",
            message=translated_question,
            related_field_path=refreshed_question.field_path,
            metadata={
                "reason": refreshed_question.reason,
                "field_paths": refreshed_question.field_paths,
                "original_english": original_english,
            },
        )

    return ConversationTurnResponse(
        user_turn=user_turn,
        assistant_turn=assistant_turn,
        next_question=refreshed_question,
    )


async def stream_next_question_event(
    session: AsyncSession, case_id: str
) -> AsyncGenerator[str, None]:
    question = await get_next_question(session, case_id, translate=True)
    payload = {"next_question": question.model_dump() if question else None}
    yield f"event: question\ndata: {json.dumps(payload)}\n\n"


async def get_conversation_history(
    session: AsyncSession, case_id: str
) -> list[ConversationTurnPayload]:
    result = await session.execute(
        select(ConversationTurnRecord)
        .where(ConversationTurnRecord.case_id == case_id)
        .order_by(ConversationTurnRecord.created_at.asc())
    )
    records = result.scalars().all()
    return [serialize_turn(record) for record in records]
