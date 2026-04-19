from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ResolutionAuditRecord(Base):
    __tablename__ = "resolution_audits"

    audit_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False
    )
    field_path: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    decision: Mapped[str] = mapped_column(String(100), nullable=False)
    resolved_value: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    candidate_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_evidence_ids: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
