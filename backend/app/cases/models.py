from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import JSON, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.templates.models import TemplateDefinition, TemplateFieldGroup


class CaseStatus(StrEnum):
    DRAFT = "draft"
    COLLECTING_INPUT = "collecting_input"
    EXTRACTING = "extracting"
    RESOLVING = "resolving"
    AWAITING_USER = "awaiting_user"
    READY_FOR_REVIEW = "ready_for_review"
    APPROVED = "approved"
    ARTIFACT_GENERATING = "artifact_generating"
    COMPLETED = "completed"
    FAILED = "failed"


class ReviewStatus(StrEnum):
    NOT_READY = "not_ready"
    NEEDS_REVIEW = "needs_review"
    APPROVED = "approved"


class FieldStateStatus(StrEnum):
    MISSING = "missing"
    PROPOSED = "proposed"
    CONFIRMED = "confirmed"
    CONFLICTED = "conflicted"
    INVALID = "invalid"
    WAIVED = "waived"


class ArtifactStatus(StrEnum):
    PENDING = "pending"
    GENERATED = "generated"
    FAILED = "failed"


class FieldStatePayload(BaseModel):
    field_path: str
    resolved_value: Any | None = None
    status: FieldStateStatus
    confidence: float = 0.0
    candidate_ids: list[str] = Field(default_factory=list)
    source_evidence_ids: list[str] = Field(default_factory=list)
    last_updated_by: str
    last_updated_at: datetime


class CaseCreateRequest(BaseModel):
    template_id: str
    template_version: int | None = None
    created_by: str = "local-user"
    metadata: dict[str, Any] = Field(default_factory=dict)


class CaseTitleUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=160)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        title = " ".join(value.split())
        if not title:
            raise ValueError("Title cannot be blank")
        return title


class CaseFilePayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    case_id: str
    template_id: str
    template_version: int
    status: CaseStatus
    created_by: str
    current_schema_state: dict[str, Any]
    review_status: ReviewStatus
    approved_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime
    completion_pct: float = 0.0
    fields_confirmed: int = 0
    fields_collected: int = 0
    fields_waived: int = 0
    fields_total: int = 0


class CaseDetail(CaseFilePayload):
    template: TemplateDefinition
    field_states: list[FieldStatePayload]


class SchemaStateResponse(BaseModel):
    case_id: str
    template_id: str
    template_version: int
    current_schema_state: dict[str, Any]
    field_states: list[FieldStatePayload]
    field_groups: list[TemplateFieldGroup]


class ArtifactCreateRequest(BaseModel):
    artifact_type: str = "pdf"


class ArtifactPayload(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    artifact_id: str
    case_id: str
    artifact_type: str
    status: str
    storage_uri: str | None = None
    renderer_version: str
    artifact_metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata")


class ArtifactRecord(Base):
    __tablename__ = "artifacts"

    artifact_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False
    )
    artifact_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ArtifactStatus.PENDING
    )
    storage_uri: Mapped[str | None] = mapped_column(String(500), nullable=True)
    renderer_version: Mapped[str] = mapped_column(
        String(50), nullable=False, default="v1"
    )
    artifact_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, default=dict
    )


class CaseFileRecord(Base):
    __tablename__ = "cases"

    case_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    template_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    template_version: Mapped[int] = mapped_column(nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=CaseStatus.DRAFT
    )
    created_by: Mapped[str] = mapped_column(
        String(100), nullable=False, default="local-user"
    )
    current_schema_state: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    review_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=ReviewStatus.NOT_READY
    )
    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    case_metadata: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSON, default=dict
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class FieldStateRecord(Base):
    __tablename__ = "field_states"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False
    )
    field_path: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    resolved_value: Mapped[Any | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=FieldStateStatus.MISSING
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    candidate_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_evidence_ids: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    last_updated_by: Mapped[str] = mapped_column(
        String(100), nullable=False, default="system"
    )
    last_updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
