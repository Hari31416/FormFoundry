from __future__ import annotations

import re
from pathlib import Path

from fastapi import HTTPException, Response, status
from fastapi.responses import FileResponse, RedirectResponse
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
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
    ensure_pdf_template(template_path, pdf_title, list(renderer_map.values()))

    flattened = flatten_schema(case_record.current_schema_state)
    fill_values = {
        target: flattened.get(source, "") for source, target in renderer_map.items()
    }

    reader = PdfReader(str(template_path))
    writer = PdfWriter()
    writer.append(reader)
    for page in writer.pages:
        writer.update_page_form_field_values(page, fill_values)

    storage_root = get_settings().local_storage_path
    slug = re.sub(r"[^a-z0-9]+", "-", template_record.template_id.lower()).strip("-")
    output_path = storage_root / "artifacts" / f"{case_id}-{slug}.pdf"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        writer.write(handle)

    storage = get_storage_service()
    stored = await storage.store_bytes(
        object_key=f"cases/{case_id}/artifacts/{output_path.name}",
        payload=output_path.read_bytes(),
        content_type="application/pdf",
    )
    artifact = ArtifactRecord(
        case_id=case_id,
        artifact_type="fillable_pdf",
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
        return FileResponse(
            local_path, media_type="application/pdf", filename=local_path.name
        )

    return RedirectResponse(download_url)
