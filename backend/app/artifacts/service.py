from __future__ import annotations

import html
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cases.models import ArtifactPayload, ArtifactRecord, CaseFileRecord, CaseStatus
from app.core.config import get_settings
from app.jobs.queue import enqueue_job
from app.storage.minio import get_storage_service
from app.templates.models import TemplateDefinitionRecord


def serialize_artifact(record: ArtifactRecord) -> ArtifactPayload:
    return ArtifactPayload(
        artifact_id=record.artifact_id,
        case_id=record.case_id,
        artifact_type=record.artifact_type,
        status=record.status,
        storage_uri=record.storage_uri,
        renderer_version=record.renderer_version,
        metadata=record.artifact_metadata,
    )


def flatten_schema(payload: dict, prefix: str = "") -> dict[str, str]:
    flattened: dict[str, str] = {}
    for key, value in payload.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            flattened.update(flatten_schema(value, path))
        elif value is not None:
            flattened[path] = str(value)
    return flattened


def ensure_pdf_template(
    template_path: Path, title: str, field_names: list[str]
) -> None:
    if template_path.exists():
        return
    template_path.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(template_path), pagesize=letter)
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(72, 760, title)
    pdf.setFont("Helvetica", 10)
    form = pdf.acroForm
    top = 720
    for index, field_name in enumerate(field_names):
        y = top - index * 30
        pdf.drawString(72, y + 12, field_name.replace("_", " ").title())
        form.textfield(
            name=field_name,
            tooltip=field_name,
            x=240,
            y=y,
            borderStyle="underlined",
            width=260,
            height=18,
            fontSize=10,
        )
    pdf.save()


def build_renderer_map(template_record: TemplateDefinitionRecord) -> dict[str, str]:
    renderer_config = template_record.renderer_config or {}
    field_map = {
        field["path"]: field["render_targets"][0]
        for field in template_record.schema
        if field.get("render_targets")
    }
    # Fallback: if render_targets is not set, map each field's path to an underscored name
    for field in template_record.schema:
        path = field["path"]
        if path not in field_map:
            field_map[path] = path.replace(".", "_")

    field_map.update(renderer_config.get("field_map", {}))
    return field_map


def resolve_template_asset_path(template_record: TemplateDefinitionRecord) -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    renderer_config = template_record.renderer_config or {}
    template_asset = renderer_config.get("template_asset")
    if not template_asset:
        t_id = template_record.template_id
        t_ver = template_record.template_version
        template_asset = f"assets/pdfs/{t_id}_v{t_ver}.pdf"
    template_path = Path(template_asset)
    if not template_path.is_absolute():
        template_path = backend_root / template_path
    return template_path


def escape_text(val: Any) -> str:
    if val is None:
        return ""
    return html.escape(str(val))


def get_field_value_by_path(payload: dict | None, path: str) -> Any:
    if not payload:
        return None
    parts = path.split(".")
    current = payload
    for part in parts:
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def format_field_value(field_def: dict, raw_val: Any) -> str:
    if (
        raw_val is None
        or raw_val == ""
        or (isinstance(raw_val, list) and len(raw_val) == 0)
    ):
        return "<font color='#64748b'><i>Not provided</i></font>"

    if field_def.get("repeated") or isinstance(raw_val, list):
        if not isinstance(raw_val, list):
            raw_val = [raw_val]
        items_html = [f"&bull; {escape_text(item)}" for item in raw_val]
        return "<br/>".join(items_html)

    if field_def.get("type") == "boolean" or isinstance(raw_val, bool):
        if raw_val is True:
            return "Yes"
        elif raw_val is False:
            return "No"

    return escape_text(raw_val)


async def generate_pdf_artifact(session: AsyncSession, case_id: str) -> ArtifactPayload:
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )
    if case_record.status != CaseStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Case must be approved first"
        )
    template_record = (
        await session.execute(
            select(TemplateDefinitionRecord).where(
                TemplateDefinitionRecord.template_id == case_record.template_id,
                TemplateDefinitionRecord.template_version
                == case_record.template_version,
            )
        )
    ).scalar_one_or_none()
    if template_record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Template definition is missing for this case.",
        )

    job = await enqueue_job(
        session,
        case_id=case_id,
        job_type="generate_artifact",
        triggering_event="artifact.generate.requested",
    )
    renderer_map = build_renderer_map(template_record)
    if not renderer_map:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Template renderer field mapping is missing.",
        )

    renderer_config = template_record.renderer_config or {}
    template_path = resolve_template_asset_path(template_record)
    pdf_title = renderer_config.get("pdf_title", template_record.name)

    storage_root = get_settings().local_storage_path
    slug = re.sub(r"[^a-z0-9]+", "-", template_record.template_id.lower()).strip("-")
    output_path = storage_root / "artifacts" / f"{case_id}-{slug}.pdf"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 1. Initialize SimpleDocTemplate
    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=54,
        bottomMargin=54,
        title=pdf_title,
    )

    # Canvas header/footer callback
    def draw_decorations(
        canvas_obj: canvas.Canvas, document_obj: SimpleDocTemplate
    ) -> None:
        canvas_obj.saveState()
        canvas_obj.setTitle(pdf_title)
        # Top line
        canvas_obj.setStrokeColor(colors.HexColor("#e2e8f0"))
        canvas_obj.setLineWidth(0.75)
        canvas_obj.line(36, 750, 576, 750)

        # Header text
        canvas_obj.setFont("Helvetica-Bold", 8)
        canvas_obj.setFillColor(colors.HexColor("#64748b"))
        canvas_obj.drawString(36, 756, "FORMFOUNDRY DOCUMENT OUTFLOW")

        # Bottom line
        canvas_obj.line(36, 45, 576, 45)
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.drawString(
            36, 30, "Generated automatically by FormFoundry • Confidential Report"
        )
        canvas_obj.drawRightString(576, 30, f"Page {document_obj.page}")
        canvas_obj.restoreState()

    story = []
    styles = getSampleStyleSheet()

    # Style definitions
    title_style = ParagraphStyle(
        name="DocTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#1e3a8a"),
        spaceAfter=15,
    )

    meta_label_style = ParagraphStyle(
        name="MetaLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#64748b"),
    )

    meta_val_style = ParagraphStyle(
        name="MetaValue",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=11,
        textColor=colors.HexColor("#1e293b"),
    )

    group_title_style = ParagraphStyle(
        name="GroupTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e3a8a"),
        spaceBefore=12,
        spaceAfter=4,
        keepWithNext=True,
    )

    group_desc_style = ParagraphStyle(
        name="GroupDesc",
        parent=styles["Normal"],
        fontName="Helvetica-Oblique",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#475569"),
        spaceAfter=8,
        keepWithNext=True,
    )

    field_label_style = ParagraphStyle(
        name="FieldLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
    )

    field_val_style = ParagraphStyle(
        name="FieldVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#0f172a"),
    )

    long_text_label_style = ParagraphStyle(
        name="LongTextLabel",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#1e3a8a"),
        spaceAfter=3,
        keepWithNext=True,
    )

    long_text_val_style = ParagraphStyle(
        name="LongTextVal",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#0f172a"),
    )

    # Render top-level title and metadata card
    header_left = [
        Paragraph(pdf_title, title_style),
        Paragraph(
            template_record.description or "Intake report summary.",
            ParagraphStyle(
                name="HeaderDesc",
                parent=styles["Normal"],
                fontName="Helvetica-Oblique",
                fontSize=10,
                leading=14,
                textColor=colors.HexColor("#475569"),
            ),
        ),
    ]

    status_text = f"<font color='#16a34a'><b>{case_record.status.upper()}</b></font>"
    meta_card_data = [
        [
            Paragraph("Case Reference", meta_label_style),
            Paragraph(case_id, meta_val_style),
        ],
        [
            Paragraph("Template Type", meta_label_style),
            Paragraph(
                f"{template_record.template_id} (v{template_record.template_version})",
                meta_val_style,
            ),
        ],
        [
            Paragraph("Generated On", meta_label_style),
            Paragraph(datetime.now().strftime("%Y-%m-%d %H:%M"), meta_val_style),
        ],
        [
            Paragraph("Case Status", meta_label_style),
            Paragraph(status_text, meta_val_style),
        ],
    ]

    meta_table = Table(meta_card_data, colWidths=[90, 150])
    meta_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
                ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#f1f5f9")),
            ]
        )
    )

    top_table = Table([[header_left, meta_table]], colWidths=[280, 260])
    top_table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 15),
            ]
        )
    )

    story.append(top_table)
    story.append(Spacer(1, 15))

    # Field group compile
    fields_by_path = {f["path"]: f for f in template_record.schema}

    grouped_paths = set()
    for group in template_record.field_groups:
        for p in group.get("field_paths", []):
            grouped_paths.add(p)

    orphan_paths = [
        f["path"] for f in template_record.schema if f["path"] not in grouped_paths
    ]

    groups = list(template_record.field_groups or [])
    if orphan_paths:
        groups.append(
            {
                "group_id": "other_details",
                "label": "Additional Information",
                "description": "Remaining fields from the intake report.",
                "field_paths": orphan_paths,
            }
        )

    for group in groups:
        group_fields = []
        for path in group.get("field_paths", []):
            if path in fields_by_path:
                group_fields.append(fields_by_path[path])

        if not group_fields:
            continue

        story.append(Paragraph(group.get("label", "Section"), group_title_style))
        if group.get("description"):
            story.append(Paragraph(group["description"], group_desc_style))

        regular_table_data = []
        long_wells = []

        for field in group_fields:
            path = field["path"]
            raw_val = get_field_value_by_path(case_record.current_schema_state, path)
            formatted_val = format_field_value(field, raw_val)

            is_long = False
            raw_str = str(raw_val) if raw_val is not None else ""
            if field.get("repeated") or isinstance(raw_val, list):
                is_long = True
            elif "\n" in raw_str:
                is_long = True
            elif len(raw_str) > 150:
                is_long = True

            if is_long:
                long_wells.append((field["label"], formatted_val))
            else:
                regular_table_data.append(
                    [
                        Paragraph(field["label"], field_label_style),
                        Paragraph(formatted_val, field_val_style),
                    ]
                )

        if regular_table_data:
            t = Table(regular_table_data, colWidths=[160, 380])
            t.setStyle(
                TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                        ("TOPPADDING", (0, 0), (-1, -1), 6),
                        ("LEFTPADDING", (0, 0), (-1, -1), 8),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                        (
                            "LINEBELOW",
                            (0, 0),
                            (-1, -1),
                            0.5,
                            colors.HexColor("#e2e8f0"),
                        ),
                    ]
                )
            )
            for idx in range(len(regular_table_data)):
                bg_color = colors.HexColor("#f8fafc") if idx % 2 == 0 else colors.white
                t.setStyle(TableStyle([("BACKGROUND", (0, idx), (-1, idx), bg_color)]))
            story.append(t)
            story.append(Spacer(1, 10))

        for label, val in long_wells:
            well_data = [
                [Paragraph(f"<b>{escape_text(label)}</b>", long_text_label_style)],
                [Paragraph(val, long_text_val_style)],
            ]
            well_table = Table(well_data, colWidths=[540])
            well_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f1f5f9")),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, 0), 8),
                        ("BOTTOMPADDING", (0, 0), (-1, 0), 2),
                        ("TOPPADDING", (0, 1), (-1, 1), 2),
                        ("BOTTOMPADDING", (0, 1), (-1, 1), 8),
                        ("LEFTPADDING", (0, 0), (-1, -1), 12),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                    ]
                )
            )
            story.append(Spacer(1, 6))
            story.append(KeepTogether([well_table]))
            story.append(Spacer(1, 10))

    doc.build(story, onFirstPage=draw_decorations, onLaterPages=draw_decorations)

    storage = get_storage_service()
    stored = await storage.store_bytes(
        object_key=f"cases/{case_id}/artifacts/{output_path.name}",
        payload=output_path.read_bytes(),
        content_type="application/pdf",
    )
    artifact = ArtifactRecord(
        case_id=case_id,
        artifact_type="pdf",
        status="generated",
        storage_uri=stored.storage_uri,
        renderer_version="v1",
        artifact_metadata={
            "job_id": job.job_id,
            "template_path": str(template_path),
            "field_map": renderer_map,
            "template_id": template_record.template_id,
            "template_version": template_record.template_version,
        },
    )
    session.add(artifact)
    await session.commit()
    return serialize_artifact(artifact)


async def generate_json_artifact(
    session: AsyncSession, case_id: str
) -> ArtifactPayload:
    case_record = await session.get(CaseFileRecord, case_id)
    if case_record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Case not found"
        )
    if case_record.status != CaseStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Case must be approved first"
        )
    template_record = (
        await session.execute(
            select(TemplateDefinitionRecord).where(
                TemplateDefinitionRecord.template_id == case_record.template_id,
                TemplateDefinitionRecord.template_version
                == case_record.template_version,
            )
        )
    ).scalar_one_or_none()
    if template_record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Template definition is missing for this case.",
        )

    job = await enqueue_job(
        session,
        case_id=case_id,
        job_type="generate_artifact",
        triggering_event="artifact.generate.requested",
    )

    schema_state_json = json.dumps(case_record.current_schema_state, indent=2)
    schema_state_bytes = schema_state_json.encode("utf-8")

    storage_root = get_settings().local_storage_path
    slug = re.sub(r"[^a-z0-9]+", "-", template_record.template_id.lower()).strip("-")
    output_path = storage_root / "artifacts" / f"{case_id}-{slug}.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(schema_state_bytes)

    storage = get_storage_service()
    stored = await storage.store_bytes(
        object_key=f"cases/{case_id}/artifacts/{output_path.name}",
        payload=schema_state_bytes,
        content_type="application/json",
    )

    artifact = ArtifactRecord(
        case_id=case_id,
        artifact_type="json_export",
        status="generated",
        storage_uri=stored.storage_uri,
        renderer_version="v1",
        artifact_metadata={
            "job_id": job.job_id,
            "template_id": template_record.template_id,
            "template_version": template_record.template_version,
        },
    )
    session.add(artifact)
    await session.commit()
    return serialize_artifact(artifact)


async def list_artifacts(session: AsyncSession, case_id: str) -> list[ArtifactPayload]:
    records = (
        (
            await session.execute(
                select(ArtifactRecord)
                .where(ArtifactRecord.case_id == case_id)
                .order_by(ArtifactRecord.artifact_id)
            )
        )
        .scalars()
        .all()
    )
    return [serialize_artifact(record) for record in records]


async def get_artifact_download_response(
    session: AsyncSession, case_id: str, artifact_id: str
) -> Response:
    artifact = (
        await session.execute(
            select(ArtifactRecord).where(
                ArtifactRecord.case_id == case_id,
                ArtifactRecord.artifact_id == artifact_id,
            )
        )
    ).scalar_one_or_none()
    if artifact is None or artifact.storage_uri is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found"
        )

    storage = get_storage_service()
    download_url = await storage.get_download_url(artifact.storage_uri)

    if download_url.startswith("local://"):
        local_path = get_settings().local_storage_path / download_url.replace(
            "local://", ""
        )
        media_type = (
            "application/json"
            if artifact.artifact_type == "json_export"
            else "application/pdf"
        )
        return FileResponse(local_path, media_type=media_type, filename=local_path.name)

    return RedirectResponse(download_url)
