from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from hashlib import sha256
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseDetail, CaseFileRecord, FieldStateStatus
from app.cases.service import get_case_detail
from app.conversation.context import case_lock, load_conversation_context
from app.conversation.documents import choose_document_upload_question
from app.conversation.models import (
    ConversationTurnPayload,
    ConversationTurnRecord,
    ConversationTurnRequest,
    ConversationTurnResponse,
    NextQuestionPayload,
)
from app.intake.models import EvidenceRecord, EvidenceSourceType
from app.intake.service import create_chat_answer_evidence
from app.languages.manager import get_language_manager
from app.languages.utils import process_incoming_text, process_outgoing_text
from app.llm import generate_json
from app.prompts import render_prompt
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
        if template_field.type == "document":
            continue
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
    conversation_context: str = "[]",
) -> str:
    field_lines: list[str] = []
    for candidate in selected_fields:
        desc = format_conversation_field_description(candidate.field)
        field_lines.append(f"{desc} (Reason to ask: {candidate.reason})")

    field_details = "\n".join(field_lines)
    response = await generate_json(
        system_prompt=render_prompt("conversation_system.jinja2"),
        user_prompt=render_prompt(
            "conversation_user.jinja2",
            template_name=detail.template.name,
            tone=detail.template.conversation_config.get("tone", "clear and direct"),
            field_details=field_details,
            field_state=json.dumps(
                [state.model_dump(mode="json") for state in detail.field_states]
            ),
            conversation_context=conversation_context,
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


async def choose_next_question(
    detail: CaseDetail, conversation_context: str = "[]"
) -> NextQuestionPayload | None:
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

    question = await generate_grouped_question(
        detail, grouped_candidates, conversation_context
    )
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


async def question_state(session: AsyncSession, detail: CaseDetail) -> str:
    latest_user_id = (
        await session.execute(
            select(ConversationTurnRecord.turn_id)
            .where(
                ConversationTurnRecord.case_id == detail.case_id,
                ConversationTurnRecord.role == "user",
            )
            .order_by(ConversationTurnRecord.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    state = {
        "template": detail.template.model_dump(mode="json"),
        "fields": [field.model_dump(mode="json") for field in detail.field_states],
        "schema_state": detail.current_schema_state,
        "user_turn": latest_user_id,
    }
    if any(
        field.document_source or field.type == "document"
        for field in detail.template.template_schema
    ):
        records = (
            (
                await session.execute(
                    select(EvidenceRecord)
                    .where(
                        EvidenceRecord.case_id == detail.case_id,
                        EvidenceRecord.source_type.in_(
                            [
                                EvidenceSourceType.PDF_UPLOAD,
                                EvidenceSourceType.IMAGE_UPLOAD,
                            ]
                        ),
                    )
                    .order_by(EvidenceRecord.evidence_id)
                )
            )
            .scalars()
            .all()
        )
        state["documents"] = [
            {
                "evidence_id": record.evidence_id,
                "analysis": (record.parsed_payload or {}).get("document_analysis"),
            }
            for record in records
        ]
    return sha256(json.dumps(state, sort_keys=True).encode()).hexdigest()


async def latest_question_turn(
    session: AsyncSession, case_id: str
) -> ConversationTurnRecord | None:
    return (
        await session.execute(
            select(ConversationTurnRecord)
            .where(
                ConversationTurnRecord.case_id == case_id,
                ConversationTurnRecord.role == "assistant",
            )
            .order_by(ConversationTurnRecord.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def get_next_question(
    session: AsyncSession, case_id: str, translate: bool = True
) -> NextQuestionPayload | None:
    turn = await record_active_question_turn(session, case_id)
    if turn is None:
        return None
    payload = NextQuestionPayload.model_validate(turn.metadata["question_payload"])
    payload.question_turn_id = turn.turn_id
    if translate:
        payload.question = turn.message
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


async def record_active_question_turn(
    session: AsyncSession, case_id: str, *, force: bool = False
) -> ConversationTurnPayload | None:
    async with case_lock(case_id):
        return await _record_active_question_turn(session, case_id, force=force)


async def _record_active_question_turn(
    session: AsyncSession,
    case_id: str,
    *,
    force: bool = False,
) -> ConversationTurnPayload | None:
    detail = await get_case_detail(session, case_id)
    fingerprint = await question_state(session, detail)
    latest_turn = await latest_question_turn(session, case_id)
    preferred_lang = detail.metadata.get("preferred_language", "en")
    if latest_turn and latest_turn.turn_metadata.get("question_state") == fingerprint:
        if not force and latest_turn.turn_metadata.get("language") == preferred_lang:
            return serialize_turn(latest_turn)
        question_en = NextQuestionPayload.model_validate(
            latest_turn.turn_metadata["question_payload"]
        )
    else:
        try:
            question_en = await choose_document_upload_question(session, detail)
            if question_en is None:
                question_en = await choose_next_question(
                    detail, await load_conversation_context(session, case_id)
                )
        except QuestionGenerationError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Unable to generate the next question.",
            ) from exc
    previous_upload = bool(
        latest_turn
        and latest_turn.turn_metadata.get("question_payload", {}).get("kind")
        == "document_upload"
    )
    if (
        previous_upload
        and latest_turn
        and (question_en is None or question_en.kind != "document_upload")
    ):
        previous_metadata = dict(latest_turn.turn_metadata)
        previous_payload = dict(previous_metadata["question_payload"])
        previous_payload["pending_documents"] = []
        previous_metadata.update(status="completed", question_payload=previous_payload)
        latest_turn.turn_metadata = previous_metadata
        await session.flush()
    if question_en is None:
        await session.commit()
        return None
    if previous_upload and latest_turn and question_en.kind == "document_upload":
        original = NextQuestionPayload.model_validate(
            latest_turn.turn_metadata["question_payload"]
        )
        keys = {(item.country, item.document_type) for item in original.documents}
        question_en.documents = original.documents + [
            item
            for item in question_en.documents
            if (item.country, item.document_type) not in keys
        ]
        question_en.question = original.question
    question = question_en.model_copy()
    if preferred_lang != "en":
        question.question = await process_outgoing_text(
            question_en.question, preferred_lang
        )
    metadata = {
        "kind": "question",
        "status": "active",
        "reason": question.reason,
        "field_paths": question.field_paths,
        "field_labels": question.field_labels,
        "original_english": question_en.question,
        "language": preferred_lang,
        "question_state": fingerprint,
        "question_payload": question_en.model_dump(),
    }
    if latest_turn and (
        (not force and latest_turn.turn_metadata.get("question_state") == fingerprint)
        or (previous_upload and question_en.kind == "document_upload")
    ):
        latest_turn.message = question.question
        latest_turn.turn_metadata = metadata
        latest_turn.related_field_path = question.field_path
        await session.commit()
        return serialize_turn(latest_turn)
    return await record_turn(
        session,
        case_id=case_id,
        role="assistant",
        message=question.question,
        related_field_path=question.field_path,
        metadata=metadata,
    )


async def submit_conversation_turn(
    session: AsyncSession, case_id: str, payload: ConversationTurnRequest
) -> ConversationTurnResponse:
    async with case_lock(case_id):
        return await _submit_conversation_turn(session, case_id, payload)


async def _submit_conversation_turn(
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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )

    active_question = await _record_active_question_turn(session, case_id)
    if (
        active_question
        and active_question.metadata.get("question_payload", {}).get("kind")
        == "document_upload"
    ):
        raise HTTPException(
            409,
            "This question requires a document upload. Text replies are not accepted.",
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

    active_turn = await latest_question_turn(session, case_id)
    next_question = None
    if active_turn is not None and active_turn.related_field_path:
        metadata = active_turn.turn_metadata
        next_question = NextQuestionPayload(
            field_path=active_turn.related_field_path,
            field_paths=metadata.get("field_paths", [active_turn.related_field_path]),
            field_labels=metadata.get("field_labels", []),
            question=metadata.get("original_english", active_turn.message),
            reason=metadata.get("reason", ""),
            priority=metadata.get("question_payload", {}).get("priority", 1),
        )

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
    assistant_turn = await _record_active_question_turn(session, case_id, force=True)
    refreshed_question = None
    if assistant_turn is not None:
        refreshed_question = NextQuestionPayload.model_validate(
            assistant_turn.metadata["question_payload"]
        )
        refreshed_question.question = assistant_turn.message
        refreshed_question.question_turn_id = assistant_turn.turn_id

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
