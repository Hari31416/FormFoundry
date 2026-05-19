from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.cases.models import CaseFilePayload, FieldStatePayload
from app.intake.models import EvidencePayload
from app.models.base import Base


class ValidationIssuePayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    issue_id: str
    case_id: str
    field_path: str
    severity: str
    rule_id: str
    message: str
    suggested_fix: str | None = None
    blocking: bool
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class ValidationIssueRecord(Base):
    __tablename__ = "validation_issues"

    issue_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False
    )
    field_path: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(50), nullable=False)
    rule_id: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    suggested_fix: Mapped[str | None] = mapped_column(Text, nullable=True)
    blocking: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    issue_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class FieldEditRequest(BaseModel):
    value: Any
    edited_by: str = "local-user"


class FieldConfirmRequest(BaseModel):
    confirmed_by: str = "local-user"


class FieldRejectRequest(BaseModel):
    rejected_by: str = "local-user"


class BulkFieldRejectRequest(BaseModel):
    field_paths: list[str] = Field(min_length=1)
    rejected_by: str = "local-user"


class ReviewResponse(BaseModel):
    case: CaseFilePayload
    field_states: list[FieldStatePayload]
    evidence: list[EvidencePayload]
    validation_issues: list[ValidationIssuePayload]
