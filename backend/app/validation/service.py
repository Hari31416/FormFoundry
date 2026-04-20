from __future__ import annotations

import re
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import (
    CaseFilePayload,
    CaseFileRecord,
    CaseStatus,
    FieldStateRecord,
    FieldStateStatus,
    ReviewStatus,
)
from app.cases.service import get_case_detail, serialize_case
from app.intake.service import list_case_evidence
from app.resolution.service import assign_nested_value
from app.templates.models import TemplateDefinitionRecord, TemplateField
from app.templates.runtime import is_field_active
from app.validation.models import (
    FieldConfirmRequest,
    FieldEditRequest,
    ReviewResponse,
    ValidationIssuePayload,
    ValidationIssueRecord,
)


def serialize_issue(record: ValidationIssueRecord) -> ValidationIssuePayload:
    return ValidationIssuePayload(
        issue_id=record.issue_id,
        case_id=record.case_id,
        field_path=record.field_path,
        severity=record.severity,
        rule_id=record.rule_id,
        message=record.message,
        suggested_fix=record.suggested_fix,
        blocking=record.blocking,
        metadata=record.issue_metadata,
        created_at=record.created_at,
    )


async def refresh_validation_issues(
    session: AsyncSession, case_id: str
) -> list[ValidationIssuePayload]:
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )

    template_record = (
        await session.execute(
            select(TemplateDefinitionRecord).where(
                TemplateDefinitionRecord.template_id == case_record.template_id,
                TemplateDefinitionRecord.template_version
                == case_record.template_version,
            )
        )
    ).scalar_one()
    field_states = (
        (
            await session.execute(
                select(FieldStateRecord)
                .where(FieldStateRecord.case_id == case_id)
                .order_by(FieldStateRecord.field_path)
            )
        )
        .scalars()
        .all()
    )
    field_map = {field_state.field_path: field_state for field_state in field_states}
    template_fields = {
        field.path: field
        for field in [
            TemplateField.model_validate(item) for item in template_record.schema
        ]
    }

    await session.execute(
        delete(ValidationIssueRecord).where(ValidationIssueRecord.case_id == case_id)
    )
    issue_records: list[ValidationIssueRecord] = []

    def add_issue(
        *,
        field_path: str,
        rule_id: str,
        message: str,
        blocking: bool = True,
        severity: str = "error",
        suggested_fix: str | None = None,
    ) -> None:
        issue_records.append(
            ValidationIssueRecord(
                case_id=case_id,
                field_path=field_path,
                severity=severity,
                rule_id=rule_id,
                message=message,
                suggested_fix=suggested_fix,
                blocking=blocking,
                issue_metadata={},
            )
        )

    for field_path, template_field in template_fields.items():
        field_state = field_map[field_path]
        if not is_field_active(template_field, case_record.current_schema_state):
            continue

        value = field_state.resolved_value
        if template_field.required and value in (None, "", []):
            add_issue(
                field_path=field_path,
                rule_id="required",
                message="Required field is missing.",
                suggested_fix=template_field.default_question,
            )
            continue
        if value in (None, "", []):
            continue

        if template_field.type == "enum" and value not in template_field.enum_options:
            add_issue(
                field_path=field_path,
                rule_id="enum",
                message="Value is not in the allowed enum set.",
                suggested_fix="Choose one of the allowed options.",
            )
        if template_field.type == "date" and not re.match(
            r"^\d{4}-\d{2}-\d{2}$", str(value)
        ):
            add_issue(
                field_path=field_path,
                rule_id="date",
                message="Date must use YYYY-MM-DD format.",
            )
        if template_field.type == "boolean" and not isinstance(value, bool):
            add_issue(
                field_path=field_path,
                rule_id="boolean",
                message="Value must be true or false.",
            )
        if template_field.type == "integer" and not isinstance(value, int):
            add_issue(
                field_path=field_path,
                rule_id="integer",
                message="Value must be an integer.",
            )
        if template_field.type == "number" and not isinstance(value, (int, float)):
            add_issue(
                field_path=field_path,
                rule_id="number",
                message="Value must be numeric.",
            )

        for rule_ref in template_field.validation_refs:
            if (
                rule_ref == "email"
                and value
                and not re.match(r"^[^@]+@[^@]+\.[^@]+$", str(value))
            ):
                add_issue(
                    field_path=field_path,
                    rule_id="email",
                    message="Email format is invalid.",
                )
            if (
                rule_ref == "phone"
                and value
                and not re.match(r"^[0-9+()\- ]{10,15}$", str(value))
            ):
                add_issue(
                    field_path=field_path,
                    rule_id="phone",
                    message="Phone format is invalid.",
                )
            if rule_ref.startswith("min:") and isinstance(value, (int, float)):
                threshold = float(rule_ref.split(":", maxsplit=1)[1])
                if float(value) < threshold:
                    add_issue(
                        field_path=field_path,
                        rule_id="min",
                        message=f"Value must be at least {threshold}.",
                    )
            if rule_ref.startswith("min_length:"):
                threshold = int(rule_ref.split(":", maxsplit=1)[1])
                if len(str(value).strip()) < threshold:
                    add_issue(
                        field_path=field_path,
                        rule_id="min_length",
                        message=f"Value must be at least {threshold} characters long.",
                    )

    session.add_all(issue_records)
    await session.commit()
    return [serialize_issue(record) for record in issue_records]


async def get_validation_issues(
    session: AsyncSession, case_id: str
) -> list[ValidationIssuePayload]:
    return await refresh_validation_issues(session, case_id)


async def get_review_payload(session: AsyncSession, case_id: str) -> ReviewResponse:
    detail = await get_case_detail(session, case_id)
    issues = await refresh_validation_issues(session, case_id)
    evidence = await list_case_evidence(session, case_id)
    return ReviewResponse(
        case=CaseFilePayload.model_validate(
            detail.model_dump(exclude={"template", "field_states"})
        ),
        field_states=detail.field_states,
        evidence=evidence,
        validation_issues=issues,
    )


async def edit_field(
    session: AsyncSession, case_id: str, field_path: str, payload: FieldEditRequest
) -> FieldStateRecord:
    field_state = (
        await session.execute(
            select(FieldStateRecord).where(
                FieldStateRecord.case_id == case_id,
                FieldStateRecord.field_path == field_path,
            )
        )
    ).scalar_one_or_none()
    if field_state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Field not found"
        )

    field_state.resolved_value = payload.value
    field_state.status = FieldStateStatus.CONFIRMED
    field_state.confidence = 1.0
    field_state.last_updated_by = payload.edited_by
    field_state.last_updated_at = datetime.now(UTC)

    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )
    schema_state = dict(case_record.current_schema_state)
    assign_nested_value(schema_state, field_path, payload.value)
    case_record.current_schema_state = schema_state
    await session.commit()
    return field_state


async def confirm_field(
    session: AsyncSession, case_id: str, field_path: str, payload: FieldConfirmRequest
) -> FieldStateRecord:
    field_state = (
        await session.execute(
            select(FieldStateRecord).where(
                FieldStateRecord.case_id == case_id,
                FieldStateRecord.field_path == field_path,
            )
        )
    ).scalar_one_or_none()
    if field_state is None or field_state.resolved_value is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Field is not ready to confirm",
        )
    field_state.status = FieldStateStatus.CONFIRMED
    field_state.last_updated_by = payload.confirmed_by
    field_state.last_updated_at = datetime.now(UTC)
    await session.commit()
    return field_state


async def approve_case(session: AsyncSession, case_id: str) -> CaseFilePayload:
    issues = await refresh_validation_issues(session, case_id)
    if any(issue.blocking for issue in issues):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Blocking validation issues must be resolved before approval.",
        )

    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )
    case_record.status = CaseStatus.APPROVED
    case_record.review_status = ReviewStatus.APPROVED
    case_record.approved_at = datetime.now(UTC)
    await session.commit()
    return serialize_case(case_record)
