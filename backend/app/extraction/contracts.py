from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class FieldCandidate(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    candidate_id: str
    case_id: str
    field_path: str
    candidate_value: Any
    confidence: float
    source_evidence_ids: list[str] = Field(default_factory=list)
    source_refs: list[dict[str, Any]] = Field(default_factory=list)
    extractor_type: str
    rationale: str
    created_at: datetime
