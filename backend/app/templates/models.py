from __future__ import annotations

from datetime import UTC, datetime
from string import Formatter
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import JSON, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.documents.models import DocumentFieldSource
from app.documents.registry import get_definition
from app.models.base import Base

FieldType = Literal[
    "string",
    "date",
    "enum",
    "boolean",
    "integer",
    "number",
    "object",
    "list_of_objects",
]


class TemplateField(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    path: str
    label: str
    type: FieldType
    required: bool = False
    repeated: bool = False
    enum_options: list[str] = Field(default_factory=list)
    default_question: str
    clarification_question: str
    help_text: str = ""
    sensitivity: str = "standard"
    validation_refs: list[str] = Field(default_factory=list)
    render_targets: list[str] = Field(default_factory=list)
    conditions: dict[str, Any] = Field(default_factory=dict)
    document_source: DocumentFieldSource | None = None
    calculation: str | None = None
    nested_schema: list[TemplateField] | None = Field(
        default=None, alias="schema", serialization_alias="schema"
    )

    @model_validator(mode="after")
    def validate_document_source(self) -> TemplateField:
        if any(child.document_source is not None for child in self.nested_schema or []):
            raise ValueError(
                "Document sources are supported only on top-level scalar fields"
            )
        if self.document_source is not None:
            definition = get_definition(self.document_source)
            if (
                definition is None
                or self.document_source.field not in definition.fields
            ):
                raise ValueError(
                    "Document source must reference a supported document field"
                )
            if self.type in {"object", "list_of_objects"} or self.calculation:
                raise ValueError(
                    "Document sources require a scalar field without a calculation"
                )
        return self


class TemplateFieldGroup(BaseModel):
    group_id: str
    label: str
    description: str = ""
    field_paths: list[str]


class TemplateDefinitionBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    template_id: str
    template_version: int
    name: str
    domain: str
    description: str
    template_schema: list[TemplateField] = Field(
        alias="schema", serialization_alias="schema"
    )
    field_groups: list[TemplateFieldGroup]
    validation_rules: list[dict[str, Any]] = Field(default_factory=list)
    conversation_config: dict[str, Any] = Field(default_factory=dict)
    supported_artifacts: list[str] = Field(default_factory=list)
    renderer_config: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_title_pattern(self) -> TemplateDefinitionBase:
        pattern = self.conversation_config.get("title_pattern", "")
        if not isinstance(pattern, str) or len(pattern) > 200:
            raise ValueError("Title pattern must be a string of at most 200 characters")
        fields = {field.path: field for field in self.template_schema}
        for _, path, spec, conversion in Formatter().parse(pattern):
            if path is None:
                continue
            if path not in fields or spec or conversion:
                raise ValueError(
                    "Title placeholders must use schema field paths without formatting"
                )
            if fields[path].type in ("object", "list_of_objects"):
                raise ValueError("Title placeholders must reference scalar fields")
        if "{{" in pattern or "}}" in pattern:
            raise ValueError("Use single braces around title field paths")
        return self


class TemplateDefinitionCreate(TemplateDefinitionBase):
    pass


class TemplateDefinition(TemplateDefinitionBase):
    model_config = ConfigDict(from_attributes=True)

    created_at: datetime
    updated_at: datetime


class TemplateDefinitionRecord(Base):
    __tablename__ = "template_definitions"
    __table_args__ = (
        UniqueConstraint("template_id", "template_version", name="uq_template_version"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    template_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    schema: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    field_groups: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    validation_rules: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    conversation_config: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
    )
    supported_artifacts: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    renderer_config: Mapped[dict[str, Any]] = mapped_column(
        JSON, nullable=False, default=dict
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


TemplateField.model_rebuild()
