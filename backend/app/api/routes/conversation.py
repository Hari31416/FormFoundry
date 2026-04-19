from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversation.models import (
    ConversationTurnRequest,
    ConversationTurnResponse,
    NextQuestionPayload,
)
from app.conversation.service import (
    get_next_question,
    stream_next_question_event,
    submit_conversation_turn,
)
from app.db import get_db_session

router = APIRouter()
DBSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.get(
    "/cases/{case_id}/conversation/next-question",
    response_model=NextQuestionPayload | None,
)
async def get_next_question_route(
    case_id: str, session: DBSession
) -> NextQuestionPayload | None:
    return await get_next_question(session, case_id)


@router.post(
    "/cases/{case_id}/conversation/turns", response_model=ConversationTurnResponse
)
async def submit_conversation_turn_route(
    case_id: str,
    payload: ConversationTurnRequest,
    session: DBSession,
) -> ConversationTurnResponse:
    return await submit_conversation_turn(session, case_id, payload)


@router.get("/cases/{case_id}/conversation/stream")
async def stream_next_question_route(
    case_id: str, session: DBSession
) -> StreamingResponse:
    generator = stream_next_question_event(session, case_id)
    return StreamingResponse(generator, media_type="text/event-stream")
