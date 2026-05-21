from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, status
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

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class QuestionCandidate:
    priority: int
    field: TemplateField
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


class QuestionGenerationError(RuntimeError):
    pass


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
                    reason="Required field is missing.",
                    order=index,
                )
            )
        elif field_state.status == FieldStateStatus.CONFLICTED:
            candidates.append(
                QuestionCandidate(
                    priority=2,
                    field=template_field,
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
                    reason="Optional field is still empty.",
                    order=index,
                )
            )

    sorted_candidates = sorted(candidates, key=lambda item: (item.priority, item.order))
    logger.info(
        "conversation.question_candidates.generated",
        extra={
            "case_id": detail.case_id,
            "candidate_count": len(sorted_candidates),
            "priority_counts": {
                "p1": sum(1 for c in sorted_candidates if c.priority == 1),
                "p2": sum(1 for c in sorted_candidates if c.priority == 2),
                "p3": sum(1 for c in sorted_candidates if c.priority == 3),
                "p4": sum(1 for c in sorted_candidates if c.priority == 4),
            },
        },
    )
    return sorted_candidates


def format_conversation_field_description(field: TemplateField, indent: int = 0) -> str:
    indent_str = "  " * indent
    help_text = f" Help: {field.help_text}" if field.help_text else ""
    enum_text = (
        f" Allowed values: {', '.join(field.enum_options)}"
        if field.enum_options
        else ""
    )
    desc = f"{indent_str}- {field.label} ({field.path}, {field.type}){help_text}{enum_text}"
    nested_schema = field.nested_schema or []
    if field.type in ("object", "list_of_objects") and nested_schema:
        lines = [desc]
        lines.append(f"{indent_str}  Properties for {field.path}:")
        for sub in nested_schema:
            lines.append(format_conversation_field_description(sub, indent + 2))
        return "\n".join(lines)
    return desc


async def generate_grouped_question(
    detail: CaseDetail,
    selected_fields: list[QuestionCandidate],
) -> str:
    field_lines: list[str] = []
    for candidate in selected_fields:
        desc = format_conversation_field_description(candidate.field)
        field_lines.append(f"{desc} (Reason to ask: {candidate.reason})")

    field_details = "\n".join(field_lines)
    response = await generate_json(
        system_prompt=(
            "You write one concise follow-up question for a conversational form-filling assistant. "
            "Combine related missing or unclear fields into a single question. "
            "Do not use canned wording; write the final user-facing question yourself. "
            'Return JSON only with the shape {"question": "..."}.'
        ),
        user_prompt=(
            f"Template: {detail.template.name}\n"
            f"Tone: {detail.template.conversation_config.get('tone', 'clear and direct')}\n"
            f"Fields to ask about:\n{field_details}"
        ),
    )
    if not response:
        raise QuestionGenerationError("LLM did not return a question payload.")

    question = response.get("question")
    if not isinstance(question, str):
        raise QuestionGenerationError("LLM question payload is missing question text.")
    question = question.strip()
    if not question:
        raise QuestionGenerationError("LLM returned empty question text.")
    return question


async def choose_next_question(detail: CaseDetail) -> NextQuestionPayload | None:
    candidates = build_question_candidates(detail)
    if not candidates:
        logger.info(
            "conversation.next_question.empty",
            extra={"case_id": detail.case_id},
        )
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
    field_paths = [candidate.field.path for candidate in grouped_candidates]
    field_labels = [candidate.field.label for candidate in grouped_candidates]
    reason = (
        f"{grouped_candidates[0].reason} Related fields: {format_labels(field_labels)}."
        if len(grouped_candidates) > 1
        else grouped_candidates[0].reason
    )
    logger.info(
        "conversation.next_question.generated",
        extra={
            "case_id": detail.case_id,
            "field_path": field_paths[0],
            "field_paths": field_paths,
            "question": question,
            "priority": grouped_candidates[0].priority,
        },
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
    try:
        payload = await choose_next_question(detail)
    except QuestionGenerationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to generate the next question.",
        ) from exc
    if payload is not None:
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
    commit: bool = True,
) -> ConversationTurnPayload:
    record = ConversationTurnRecord(
        case_id=case_id,
        role=role,
        message=message,
        related_field_path=related_field_path,
        turn_metadata=metadata or {},
    )
    session.add(record)
    if commit:
        await session.commit()
    else:
        await session.flush()
    logger.info(
        "conversation.turn.recorded",
        extra={
            "case_id": case_id,
            "role": role,
            "message_chars": len(message),
            "related_field_path": related_field_path,
            "metadata_keys": list(metadata.keys()) if metadata else [],
            "commit": commit,
        },
    )
    return serialize_turn(record)


def field_paths_match(left: list[str] | None, right: list[str] | None) -> bool:
    return list(left or []) == list(right or [])


async def record_active_question_turn(
    session: AsyncSession,
    case_id: str,
    *,
    force: bool = False,
) -> ConversationTurnPayload | None:
    question_en = await get_next_question(session, case_id, translate=False)
    if question_en is None:
        return None
    question = await get_next_question(session, case_id, translate=True)
    if question is None:
        return None

    latest_turn = (
        await session.execute(
            select(ConversationTurnRecord)
            .where(ConversationTurnRecord.case_id == case_id)
            .order_by(ConversationTurnRecord.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if (
        latest_turn is not None
        and latest_turn.role == "assistant"
        and not force
        and field_paths_match(
            latest_turn.turn_metadata.get("field_paths"), question_en.field_paths
        )
    ):
        if latest_turn.message != question.question:
            metadata = dict(latest_turn.turn_metadata or {})
            metadata.update(
                {
                    "kind": "question",
                    "status": "active",
                    "reason": question.reason,
                    "field_paths": question.field_paths,
                    "field_labels": question.field_labels,
                    "original_english": question_en.question,
                }
            )
            latest_turn.message = question.question
            latest_turn.turn_metadata = metadata
            await session.commit()
        return serialize_turn(latest_turn)

    return await record_turn(
        session,
        case_id=case_id,
        role="assistant",
        message=question.question,
        related_field_path=question.field_path,
        metadata={
            "kind": "question",
            "status": "active",
            "reason": question.reason,
            "field_paths": question.field_paths,
            "field_labels": question.field_labels,
            "original_english": question_en.question,
        },
    )


async def submit_conversation_turn(
    session: AsyncSession, case_id: str, payload: ConversationTurnRequest
) -> ConversationTurnResponse:
    logger.info(
        "conversation.turn.submitted",
        extra={
            "case_id": case_id,
            "created_by": payload.created_by,
            "message_chars": len(payload.message),
            "payload_language": payload.language,
        },
    )
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

    logger.info(
        "conversation.turn.language_resolved",
        extra={
            "case_id": case_id,
            "detected_lang": active_lang,
            "preferred_lang": preferred_lang,
        },
    )

    # 4. Translate incoming user message from active_lang to English
    english_message = await process_incoming_text(payload.message, active_lang)

    logger.info(
        "conversation.turn.translation_completed",
        extra={
            "case_id": case_id,
            "english_translation_chars": len(english_message),
        },
    )

    next_question = await get_next_question(session, case_id, translate=False)

    user_turn = await record_turn(
        session,
        case_id=case_id,
        role="user",
        message=payload.message,
        related_field_path=next_question.field_path if next_question else None,
        metadata={
            "kind": "answer",
            "created_by": payload.created_by,
            "field_paths": next_question.field_paths if next_question else [],
            "field_labels": next_question.field_labels if next_question else [],
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

        assistant_turn = await record_turn(
            session,
            case_id=case_id,
            role="assistant",
            message=translated_question,
            related_field_path=refreshed_question.field_path,
            metadata={
                "kind": "question",
                "status": "active",
                "reason": refreshed_question.reason,
                "field_paths": refreshed_question.field_paths,
                "field_labels": refreshed_question.field_labels,
                "original_english": original_english,
            },
        )

    logger.info(
        "conversation.turn.assistant_response_resolved",
        extra={
            "case_id": case_id,
            "has_next_question": refreshed_question is not None,
            "next_question_field": (
                refreshed_question.field_path if refreshed_question else None
            ),
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
