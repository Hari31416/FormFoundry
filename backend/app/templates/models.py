from __future__ import annotations

from datetime import UTC, datetime
from string import Formatter
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import JSON, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.documents.models import DocumentFieldSource, DocumentKind
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
    "document",
]


class DocumentExtraction(BaseModel):
    field: str
    key: str = Field(pattern=r"^[A-Za-z][A-Za-z0-9_]{0,63}$")


class DocumentConfiguration(DocumentKind):
    extractions: list[DocumentExtraction] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_extractions(self) -> DocumentConfiguration:
        definition = get_definition(self)
        if definition is None:
            raise ValueError("Unsupported document type")
        keys = [item.key for item in self.extractions]
        if len(set(keys)) != len(keys):
            raise ValueError("Document dictionary keys must be unique")
        if any(item.field not in definition.fields for item in self.extractions):
            raise ValueError("Unsupported extraction field for this document")
        return self


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
    allow_document_extraction: bool = True
    document_source: DocumentFieldSource | None = None
    document: DocumentConfiguration | None = None
    calculation: str | None = None
    nested_schema: list[TemplateField] | None = Field(
        default=None, alias="schema", serialization_alias="schema"
    )

    @model_validator(mode="after")
    def validate_document_source(self) -> TemplateField:
        if self.type == "document":
            if self.document is None:
                raise ValueError("Document fields require a document configuration")
            if self.repeated or self.calculation or self.document_source:
                raise ValueError(
                    "Document fields cannot be lists, calculations, or scalar bindings"
                )
            self.nested_schema = [
                TemplateField(
                    path=item.key,
                    label=item.key.replace("_", " ").title(),
                    type=(
                        "integer"
                        if item.field == "year_of_birth"
                        else (
                            "date"
                            if item.field
                            in {"date_of_birth", "issue_date", "expiry_date"}
                            else "string"
                        )
                    ),
                    default_question="",
                    clarification_question="",
                    sensitivity="sensitive",
                )
                for item in self.document.extractions
            ]
        elif self.document is not None:
            raise ValueError("Only Document fields can have document configuration")
        if any(child.type == "document" for child in self.nested_schema or []):
            raise ValueError("Document fields must be top-level fields")
        if any(child.document_source is not None for child in self.nested_schema or []):
            raise ValueError(
                "Document sources are supported only on top-level scalar fields"
            )
        if self.document_source is not None:
            if not self.allow_document_extraction:
                raise ValueError("Document-bound fields must allow document extraction")
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


def title_field_catalog(
    fields: list[TemplateField], prefix: str = ""
) -> dict[str, TemplateField]:
    result: dict[str, TemplateField] = {}
    for field in fields:
        path = (
            field.path
            if not prefix or field.path.startswith(prefix + ".")
            else f"{prefix}.{field.path}"
        )
        result[path] = field
        if field.type in {"object", "document"}:
            result.update(title_field_catalog(field.nested_schema or [], path))
    return result


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
        fields = title_field_catalog(self.template_schema)
        for _, path, spec, conversion in Formatter().parse(pattern):
            if path is None:
                continue
            if path not in fields or spec or conversion:
                raise ValueError(
                    "Title placeholders must use schema field paths without formatting"
                )
            if fields[path].type in ("object", "list_of_objects", "document"):
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
