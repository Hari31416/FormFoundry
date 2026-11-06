"""Versioned, provider-independent document analysis contracts."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

CheckOutcome = Literal["pass", "fail", "inconclusive", "skipped", "error"]


class DocumentKind(BaseModel):
    country: str = Field(pattern=r"^[A-Z]{2}$")
    document_type: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")


class DocumentFieldSource(DocumentKind):
    field: str


class DocumentDefinition(DocumentKind):
    type_indicators: list[str]
    fields: list[str]
    required_fields: list[str]
    version: str = "1"


class DocumentField(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str = Field(min_length=1, max_length=2000)
    source_quote: str = Field(min_length=1, max_length=3000)
    confidence: float = Field(ge=0, le=1)


class DocumentObservation(BaseModel):
    """Untrusted model output, validated and grounded before publication."""

    model_config = ConfigDict(extra="forbid")

    detected: DocumentKind | None
    confidence: float = Field(ge=0, le=1)
    type_quote: str = Field(default="", max_length=3000)
    fields: dict[str, DocumentField] = Field(default_factory=dict, max_length=30)


class DocumentCheck(BaseModel):
    code: str
    scope: Literal["classification", "extraction", "format", "authenticity", "holder"]
    outcome: CheckOutcome
    field: str | None = None


class Region(BaseModel):
    """Normalized page coordinates for future layout / detection adapters."""

    page: int = Field(ge=1)
    x0: float = Field(ge=0, le=1)
    y0: float = Field(ge=0, le=1)
    x1: float = Field(ge=0, le=1)
    y1: float = Field(ge=0, le=1)
    label: str
    confidence: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def ordered_coordinates(self) -> Region:
        if self.x1 < self.x0 or self.y1 < self.y0:
            raise ValueError("Region coordinates must be ordered")
        return self


class StageResult(BaseModel):
    stage: str
    version: str
    status: Literal["completed", "error"] = "completed"
    observation: DocumentObservation | None = None
    checks: list[DocumentCheck] = Field(default_factory=list)
    regions: list[Region] = Field(default_factory=list)
    error_code: str | None = None


class DocumentAnalysis(BaseModel):
    schema_version: Literal[1] = 1
    analysis_id: str = Field(default_factory=lambda: str(uuid4()))
    analyzed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    declared: DocumentKind | None
    detected: DocumentKind | None = None
    classification_confidence: float | None = Field(default=None, ge=0, le=1)
    type_source_quote: str | None = None
    status: Literal["matched", "detected", "mismatch", "needs_review", "error"]
    fields: dict[str, DocumentField] = Field(default_factory=dict)
    checks: list[DocumentCheck] = Field(default_factory=list)
    stages: list[StageResult] = Field(default_factory=list)
    authenticity_checked: bool = False
