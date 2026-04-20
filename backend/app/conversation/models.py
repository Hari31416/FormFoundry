from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ConversationTurnPayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    turn_id: str
    case_id: str
    role: str
    message: str
    related_field_path: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ConversationTurnRequest(BaseModel):
    message: str
    created_by: str = "local-user"


class NextQuestionPayload(BaseModel):
    field_path: str
    field_paths: list[str] = Field(default_factory=list)
    field_labels: list[str] = Field(default_factory=list)
    question: str
    reason: str
    priority: int


class ConversationTurnResponse(BaseModel):
    user_turn: ConversationTurnPayload
    assistant_turn: ConversationTurnPayload | None = None
    next_question: NextQuestionPayload | None = None


class ConversationTurnRecord(Base):
    __tablename__ = "conversation_turns"

    turn_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    related_field_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    turn_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
