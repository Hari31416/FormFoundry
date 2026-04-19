from __future__ import annotations

import json
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import CaseDetail, FieldStateStatus
from app.cases.service import get_case_detail
from app.conversation.models import (
    ConversationTurnPayload,
    ConversationTurnRecord,
    ConversationTurnRequest,
    ConversationTurnResponse,
    NextQuestionPayload,
)
from app.intake.service import create_chat_answer_evidence


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


def choose_next_question(detail: CaseDetail) -> NextQuestionPayload | None:
    field_states_by_path = {
        field_state.field_path: field_state for field_state in detail.field_states
    }

    ordered_candidates: list[tuple[int, str, str, str]] = []
    for template_field in detail.template.template_schema:
        field_state = field_states_by_path[template_field.path]
        if template_field.required and field_state.status == FieldStateStatus.MISSING:
            ordered_candidates.append(
                (
                    1,
                    field_state.field_path,
                    template_field.default_question,
                    "Required field is missing.",
                )
            )
        elif field_state.status == FieldStateStatus.CONFLICTED:
            ordered_candidates.append(
                (
                    2,
                    field_state.field_path,
                    template_field.clarification_question,
                    "High-confidence evidence conflicts for this field.",
                )
            )
        elif (
            template_field.required
            and field_state.status == FieldStateStatus.PROPOSED
            and field_state.confidence < 0.9
        ):
            ordered_candidates.append(
                (
                    3,
                    field_state.field_path,
                    template_field.clarification_question,
                    "Required field is still low-confidence.",
                )
            )
        elif (
            not template_field.required
            and field_state.status == FieldStateStatus.MISSING
        ):
            ordered_candidates.append(
                (
                    4,
                    field_state.field_path,
                    template_field.default_question,
                    "Optional field is still empty.",
                )
            )

    if not ordered_candidates:
        return None

    priority, field_path, question, reason = min(
        ordered_candidates, key=lambda item: item[0]
    )
    return NextQuestionPayload(
        field_path=field_path,
        question=question,
        reason=reason,
        priority=priority,
    )


async def get_next_question(
    session: AsyncSession, case_id: str
) -> NextQuestionPayload | None:
    detail = await get_case_detail(session, case_id)
    return choose_next_question(detail)


async def record_turn(
    session: AsyncSession,
    *,
    case_id: str,
    role: str,
    message: str,
    related_field_path: str | None = None,
    metadata: dict[str, str] | None = None,
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


async def submit_conversation_turn(
    session: AsyncSession, case_id: str, payload: ConversationTurnRequest
) -> ConversationTurnResponse:
    next_question = await get_next_question(session, case_id)
    user_turn = await record_turn(
        session,
        case_id=case_id,
        role="user",
        message=payload.message,
        related_field_path=next_question.field_path if next_question else None,
        metadata={"created_by": payload.created_by},
    )
    await create_chat_answer_evidence(
        session,
        case_id,
        text=payload.message,
        created_by=payload.created_by,
        metadata={
            "related_field_path": next_question.field_path if next_question else ""
        },
    )
    refreshed_question = await get_next_question(session, case_id)
    assistant_turn = None
    if refreshed_question is not None:
        assistant_turn = await record_turn(
            session,
            case_id=case_id,
            role="assistant",
            message=refreshed_question.question,
            related_field_path=refreshed_question.field_path,
            metadata={"reason": refreshed_question.reason},
        )
    return ConversationTurnResponse(
        user_turn=user_turn,
        assistant_turn=assistant_turn,
        next_question=refreshed_question,
    )


async def stream_next_question_event(
    session: AsyncSession, case_id: str
) -> AsyncGenerator[str, None]:
    question = await get_next_question(session, case_id)
    payload = {"next_question": question.model_dump() if question else None}
    yield f"event: question\ndata: {json.dumps(payload)}\n\n"
