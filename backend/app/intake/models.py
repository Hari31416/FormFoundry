from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.documents.models import DocumentAnalysis
from app.jobs.models import JobPayload
from app.models.base import Base


class EvidenceSourceType(StrEnum):
    USER_TEXT = "user_text"
    CHAT_ANSWER = "chat_answer"
    PDF_UPLOAD = "pdf_upload"
    IMAGE_UPLOAD = "image_upload"
    FIELD_EDIT = "field_edit"


class EvidencePayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    evidence_id: str
    case_id: str
    source_type: EvidenceSourceType
    source_subtype: str
    storage_uri: str
    raw_text: str | None = None
    parsed_payload: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    document_analysis: DocumentAnalysis | None = None
    source_refs: list[dict[str, Any]] = Field(default_factory=list)
    created_by: str
    created_at: datetime


class EvidenceIntakeResponse(BaseModel):
    evidence: EvidencePayload
    job: JobPayload


class TextEvidenceRequest(BaseModel):
    text: str
    created_by: str = "local-user"
    metadata: dict[str, Any] = Field(default_factory=dict)


class EvidenceRecord(Base):
    __tablename__ = "evidence"

    evidence_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False
    )
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_subtype: Mapped[str] = mapped_column(String(100), nullable=False)
    storage_uri: Mapped[str] = mapped_column(String(500), nullable=False)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    parsed_payload: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    evidence_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, default=dict
    )
    source_refs: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    created_by: Mapped[str] = mapped_column(
        String(100), nullable=False, default="local-user"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
