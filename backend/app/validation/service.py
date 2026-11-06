from __future__ import annotations

import copy
import json
import logging
import re
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

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
from app.conversation.documents import choose_document_upload_question
from app.extraction.models import FieldCandidateRecord
from app.intake.models import EvidenceRecord, EvidenceSourceType
from app.intake.service import list_case_evidence
from app.resolution.service import assign_nested_value
from app.storage.s3 import get_storage_service
from app.templates.models import TemplateDefinitionRecord, TemplateField
from app.templates.runtime import is_field_active
from app.validation.models import (
    FieldConfirmRequest,
    FieldEditRequest,
    FieldRejectRequest,
    ReviewResponse,
    ValidationIssuePayload,
    ValidationIssueRecord,
)

logger = logging.getLogger(__name__)


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


def validate_nested_value(
    parent_path: str,
    field: TemplateField,
    value: Any,
    add_issue_callback,
) -> None:
    if value in (None, "", []):
        return

    if field.type == "list_of_objects":
        if not isinstance(value, list):
            add_issue_callback(
                field_path=parent_path,
                rule_id="type_mismatch",
                message="Value must be a list of objects.",
            )
            return

        object_helper_field = field.model_copy(update={"type": "object"})
        for item in value:
            validate_nested_value(
                parent_path=parent_path,
                field=object_helper_field,
                value=item,
                add_issue_callback=add_issue_callback,
            )
        return

    if field.type == "object":
        if not isinstance(value, dict):
            add_issue_callback(
                field_path=parent_path,
                rule_id="type_mismatch",
                message="Value must be an object.",
            )
            return

        nested_schema = field.nested_schema or []
        for sub_field in nested_schema:
            sub_key = sub_field.path
            leaf_key = sub_key.split(".")[-1]

            sub_val = None
            for k in [sub_key, leaf_key]:
                if k in value:
                    sub_val = value[k]
                    break

            if sub_field.required and (sub_val in (None, "", [])):
                add_issue_callback(
                    field_path=parent_path,
                    rule_id="required",
                    message=f"[{sub_field.label}] Required field is missing.",
                    suggested_fix=sub_field.default_question,
                )
                continue

            if sub_val in (None, "", []):
                continue

            items_to_validate = (
                sub_val
                if sub_field.repeated and isinstance(sub_val, list)
                else [sub_val]
            )

            for val in items_to_validate:
                if sub_field.type == "enum" and val not in sub_field.enum_options:
                    msg = f"[{sub_field.label}] Value '{val}' is not in the allowed enum set."
                    add_issue_callback(
                        field_path=parent_path,
                        rule_id="enum",
                        message=msg,
                        suggested_fix=f"Choose one of: {', '.join(sub_field.enum_options)}",
                    )
                elif sub_field.type == "date" and not re.match(
                    r"^\d{4}-\d{2}-\d{2}$", str(val)
                ):
                    add_issue_callback(
                        field_path=parent_path,
                        rule_id="date",
                        message=f"[{sub_field.label}] Date must use YYYY-MM-DD format.",
                    )
                elif sub_field.type == "boolean" and not isinstance(val, bool):
                    add_issue_callback(
                        field_path=parent_path,
                        rule_id="boolean",
                        message=f"[{sub_field.label}] Value must be true or false.",
                    )
                elif sub_field.type == "integer" and not isinstance(val, int):
                    add_issue_callback(
                        field_path=parent_path,
                        rule_id="integer",
                        message=f"[{sub_field.label}] Value must be an integer.",
                    )
                elif sub_field.type == "number" and not isinstance(val, (int, float)):
                    add_issue_callback(
                        field_path=parent_path,
                        rule_id="number",
                        message=f"[{sub_field.label}] Value must be numeric.",
                    )
                elif sub_field.type in ("object", "list_of_objects"):
                    validate_nested_value(
                        parent_path=parent_path,
                        field=sub_field,
                        value=val,
                        add_issue_callback=add_issue_callback,
                    )

                for rule_ref in sub_field.validation_refs:
                    if (
                        rule_ref == "email"
                        and val
                        and not re.match(r"^[^@]+@[^@]+\.[^@]+$", str(val))
                    ):
                        add_issue_callback(
                            field_path=parent_path,
                            rule_id="email",
                            message=f"[{sub_field.label}] Email format is invalid.",
                        )
                    elif (
                        rule_ref == "phone"
                        and val
                        and not re.match(r"^[0-9+()\- ]{10,15}$", str(val))
                    ):
                        add_issue_callback(
                            field_path=parent_path,
                            rule_id="phone",
                            message=f"[{sub_field.label}] Phone format is invalid.",
                        )
                    elif rule_ref.startswith("regex:"):
                        pattern = rule_ref.split(":", maxsplit=1)[1]
                        try:
                            compiled = re.compile(pattern)
                            if val and not compiled.match(str(val)):
                                add_issue_callback(
                                    field_path=parent_path,
                                    rule_id="regex",
                                    message=f"[{sub_field.label}] Field format is invalid.",
                                )
                        except re.error:
                            pass
                    elif rule_ref.startswith("min:") and isinstance(val, (int, float)):
                        threshold = float(rule_ref.split(":", maxsplit=1)[1])
                        if float(val) < threshold:
                            add_issue_callback(
                                field_path=parent_path,
                                rule_id="min",
                                message=f"[{sub_field.label}] Value must be at least {threshold}.",
                            )
                    elif rule_ref.startswith("min_length:"):
                        threshold = int(rule_ref.split(":", maxsplit=1)[1])
                        if len(str(val).strip()) < threshold:
                            msg = (
                                f"[{sub_field.label}] Value must be at "
                                f"least {threshold} characters long."
                            )
                            add_issue_callback(
                                field_path=parent_path,
                                rule_id="min_length",
                                message=msg,
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

        if template_field.type in ("object", "list_of_objects"):
            validate_nested_value(field_path, template_field, value, add_issue)
            continue

        items_to_validate = (
            value if template_field.repeated and isinstance(value, list) else [value]
        )

        for val in items_to_validate:
            if template_field.type == "enum" and val not in template_field.enum_options:
                add_issue(
                    field_path=field_path,
                    rule_id="enum",
                    message="Value is not in the allowed enum set.",
                    suggested_fix="Choose one of the allowed options.",
                )
            if template_field.type == "date" and not re.match(
                r"^\d{4}-\d{2}-\d{2}$", str(val)
            ):
                add_issue(
                    field_path=field_path,
                    rule_id="date",
                    message="Date must use YYYY-MM-DD format.",
                )
            if template_field.type == "boolean" and not isinstance(val, bool):
                add_issue(
                    field_path=field_path,
                    rule_id="boolean",
                    message="Value must be true or false.",
                )
            if template_field.type == "integer" and not isinstance(val, int):
                add_issue(
                    field_path=field_path,
                    rule_id="integer",
                    message="Value must be an integer.",
                )
            if template_field.type == "number" and not isinstance(val, (int, float)):
                add_issue(
                    field_path=field_path,
                    rule_id="number",
                    message="Value must be numeric.",
                )

            for rule_ref in template_field.validation_refs:
                if (
                    rule_ref == "email"
                    and val
                    and not re.match(r"^[^@]+@[^@]+\.[^@]+$", str(val))
                ):
                    add_issue(
                        field_path=field_path,
                        rule_id="email",
                        message="Email format is invalid.",
                    )
                if (
                    rule_ref == "phone"
                    and val
                    and not re.match(r"^[0-9+()\- ]{10,15}$", str(val))
                ):
                    add_issue(
                        field_path=field_path,
                        rule_id="phone",
                        message="Phone format is invalid.",
                    )
                if rule_ref.startswith("regex:"):
                    pattern = rule_ref.split(":", maxsplit=1)[1]
                    try:
                        compiled = re.compile(pattern)
                        if val and not compiled.match(str(val)):
                            add_issue(
                                field_path=field_path,
                                rule_id="regex",
                                message="Field format is invalid.",
                            )
                    except re.error:
                        pass
                if rule_ref.startswith("min:") and isinstance(val, (int, float)):
                    threshold = float(rule_ref.split(":", maxsplit=1)[1])
                    if float(val) < threshold:
                        add_issue(
                            field_path=field_path,
                            rule_id="min",
                            message=f"Value must be at least {threshold}.",
                        )
                if rule_ref.startswith("min_length:"):
                    threshold = int(rule_ref.split(":", maxsplit=1)[1])
                    if len(str(val).strip()) < threshold:
                        add_issue(
                            field_path=field_path,
                            rule_id="min_length",
                            message=f"Value must be at least {threshold} characters long.",
                        )

    session.add_all(issue_records)
    await session.commit()
    blocking_count = sum(1 for r in issue_records if r.blocking)
    logger.info(
        "validation.issues.refreshed",
        extra={
            "case_id": case_id,
            "total_issues": len(issue_records),
            "blocking_count": blocking_count,
            "non_blocking_count": len(issue_records) - blocking_count,
        },
    )
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

    # Coerce the edited value using the template schema definition if available
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is not None:
        from app.templates.service import get_template, serialize_template

        template_record = await get_template(
            session, case_record.template_id, case_record.template_version
        )
        if template_record is not None:
            template = serialize_template(template_record)
            target_field = next(
                (f for f in template.template_schema if f.path == field_path), None
            )
            if target_field is not None:
                from app.extraction.service import coerce_candidate_value

                payload.value = coerce_candidate_value(target_field, payload.value)

    storage = get_storage_service()
    if isinstance(payload.value, (dict, list)):
        rendered_value = json.dumps(payload.value, ensure_ascii=True)
    else:
        rendered_value = str(payload.value)
    raw_text = f"Manual edit: {field_path} = {rendered_value}"
    object_key = f"cases/{case_id}/edits/{uuid4()}-{payload.edited_by}-field-edit.txt"
    stored = await storage.store_bytes(
        object_key=object_key,
        payload=raw_text.encode("utf-8"),
        content_type="text/plain",
    )
    record = EvidenceRecord(
        case_id=case_id,
        source_type=EvidenceSourceType.FIELD_EDIT,
        source_subtype="manual_edit",
        storage_uri=stored.storage_uri,
        raw_text=raw_text,
        parsed_payload={"field_path": field_path, "value": payload.value},
        evidence_metadata={"content_type": stored.content_type},
        source_refs=[],
        created_by=payload.edited_by,
    )
    session.add(record)
    await session.flush()

    existing_ids = list(field_state.source_evidence_ids or [])
    field_state.source_evidence_ids = [
        record.evidence_id,
        *[eid for eid in existing_ids if eid != record.evidence_id],
    ]
    field_state.resolved_value = payload.value
    field_state.status = FieldStateStatus.CONFIRMED
    field_state.confidence = 1.0
    field_state.last_updated_by = payload.edited_by
    field_state.last_updated_at = datetime.now(UTC)

    from app.resolution.service import resolve_case_fields

    await resolve_case_fields(session, case_id)
    await session.refresh(field_state)
    await session.commit()
    logger.info(
        "validation.field.edited",
        extra={
            "case_id": case_id,
            "field_path": field_path,
            "edited_by": payload.edited_by,
            "payload_size": len(raw_text),
        },
    )
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
    logger.info(
        "validation.field.confirmed",
        extra={
            "case_id": case_id,
            "field_path": field_path,
            "confirmed_by": payload.confirmed_by,
        },
    )
    return field_state


async def reject_field(
    session: AsyncSession, case_id: str, field_path: str, payload: FieldRejectRequest
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
    if field_state.status != FieldStateStatus.PROPOSED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only proposed fields can be rejected",
        )

    await session.execute(
        delete(FieldCandidateRecord).where(
            FieldCandidateRecord.case_id == case_id,
            FieldCandidateRecord.field_path == field_path,
        )
    )

    field_state.resolved_value = None
    field_state.status = FieldStateStatus.MISSING
    field_state.confidence = 0.0
    field_state.candidate_ids = []
    field_state.source_evidence_ids = []
    field_state.last_updated_by = payload.rejected_by
    field_state.last_updated_at = datetime.now(UTC)

    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )
    schema_state = copy.deepcopy(case_record.current_schema_state)
    assign_nested_value(schema_state, field_path, None)
    case_record.current_schema_state = schema_state
    case_record.status = CaseStatus.AWAITING_USER
    case_record.review_status = ReviewStatus.NOT_READY

    await session.commit()
    logger.info(
        "validation.field.rejected",
        extra={
            "case_id": case_id,
            "field_path": field_path,
            "rejected_by": payload.rejected_by,
        },
    )
    return field_state


async def approve_case(session: AsyncSession, case_id: str) -> CaseFilePayload:
    if await choose_document_upload_question(
        session, await get_case_detail(session, case_id)
    ):
        raise HTTPException(409, "Required documents must be uploaded before approval.")
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

    # Ensure all active fields are confirmed
    template_record = (
        await session.execute(
            select(TemplateDefinitionRecord).where(
                TemplateDefinitionRecord.template_id == case_record.template_id,
                TemplateDefinitionRecord.template_version
                == case_record.template_version,
            )
        )
    ).scalar_one()

    template_fields = [
        TemplateField.model_validate(item) for item in template_record.schema
    ]
    required_active_field_paths = {
        tf.path
        for tf in template_fields
        if tf.required and is_field_active(tf, case_record.current_schema_state)
    }

    field_states = (
        (
            await session.execute(
                select(FieldStateRecord).where(FieldStateRecord.case_id == case_id)
            )
        )
        .scalars()
        .all()
    )

    unconfirmed_active = [
        fs.field_path
        for fs in field_states
        if fs.field_path in required_active_field_paths
        and fs.status != FieldStateStatus.CONFIRMED
    ]

    if unconfirmed_active:
        detail = (
            "All required active fields must be confirmed before approval. "
            f"Unconfirmed: {', '.join(unconfirmed_active)}"
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )

    case_record.status = CaseStatus.APPROVED
    case_record.review_status = ReviewStatus.APPROVED
    approved_at = datetime.now(UTC)
    case_record.approved_at = approved_at
    await session.commit()
    logger.info(
        "validation.case.approved",
        extra={
            "case_id": case_id,
            "approved_at": approved_at.isoformat(),
        },
    )
    return serialize_case(
        case_record, field_states=field_states, template=template_record
    )
