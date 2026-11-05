"""Bounded conversation context shared by extraction and question generation."""

from __future__ import annotations

import json
from asyncio import Lock
from weakref import WeakValueDictionary

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.conversation.models import ConversationTurnRecord

_case_locks: WeakValueDictionary[str, Lock] = WeakValueDictionary()


def case_lock(case_id: str) -> Lock:
    """Serialize a case's local requests so polling cannot interrupt a turn."""
    lock = _case_locks.get(case_id)
    if lock is None:
        lock = Lock()
        _case_locks[case_id] = lock
    return lock


async def load_conversation_context(session: AsyncSession, case_id: str) -> str:
    records = (
        (
            await session.execute(
                select(ConversationTurnRecord)
                .where(ConversationTurnRecord.case_id == case_id)
                .order_by(ConversationTurnRecord.created_at.desc())
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    return json.dumps(
        [
            {
                "role": turn.role,
                "message": str(
                    turn.turn_metadata.get(
                        "english_translation"
                        if turn.role == "user"
                        else "original_english"
                    )
                    or turn.message
                )[:2000],
            }
            for turn in reversed(records)
        ],
        ensure_ascii=False,
    )
