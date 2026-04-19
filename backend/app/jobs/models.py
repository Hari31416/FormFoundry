from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class JobPayload(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    job_id: str
    case_id: str
    job_type: str
    status: JobStatus
    triggering_event: str
    error_summary: str | None = None
    job_metadata: dict[str, Any] = Field(default_factory=dict, alias="metadata")
    started_at: datetime | None = None
    finished_at: datetime | None = None
    created_at: datetime


class JobRecord(Base):
    __tablename__ = "jobs"

    job_id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    case_id: Mapped[str] = mapped_column(
        ForeignKey("cases.case_id", ondelete="CASCADE"), index=True, nullable=False
    )
    job_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default=JobStatus.QUEUED
    )
    triggering_event: Mapped[str] = mapped_column(String(150), nullable=False)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
