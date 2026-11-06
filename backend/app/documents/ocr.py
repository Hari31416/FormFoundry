"""Current text-based adapter. Layout/CV adapters implement the same protocol."""

from app.documents.models import DocumentObservation, StageResult
from app.documents.pipeline import DocumentContext
from app.documents.registry import DEFINITIONS
from app.llm import generate_json
from app.prompts import render_prompt


class OCRDocumentStage:
    name = "ocr_document"
    version = "1"

    async def analyze(
        self, context: DocumentContext, previous: tuple[StageResult, ...]
    ) -> StageResult:
        response = await generate_json(
            system_prompt=render_prompt("document_system.jinja2"),
            user_prompt=render_prompt(
                "document_user.jinja2",
                definitions=[item.model_dump() for item in DEFINITIONS],
                text=context.text,
            ),
        )
        observation = DocumentObservation.model_validate(response)
        return StageResult(
            stage=self.name, version=self.version, observation=observation
        )
