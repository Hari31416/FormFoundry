"""Composable analysis stages with lazy access to original media and page images."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass, field
from typing import Protocol

from app.documents.models import DocumentKind, StageResult
from app.extraction.parsers.pdf import render_pdf_pages_to_png

logger = logging.getLogger(__name__)


@dataclass
class DocumentContext:
    evidence_id: str
    text: str
    declared: DocumentKind | None
    content_type: str
    load_bytes: Callable[[], Awaitable[bytes]]
    max_pages: int = 10
    _original: bytes | None = field(default=None, init=False, repr=False)
    _pages: list[bytes] | None = field(default=None, init=False, repr=False)

    async def original(self) -> bytes:
        if self._original is None:
            self._original = await self.load_bytes()
        return self._original

    async def pages(self) -> list[bytes]:
        if self._pages is None:
            payload = await self.original()
            self._pages = (
                await asyncio.to_thread(
                    render_pdf_pages_to_png, payload, max_pages=self.max_pages
                )
                if self.content_type == "application/pdf"
                else [payload]
            )
        return self._pages


class DocumentStage(Protocol):
    name: str
    version: str

    async def analyze(
        self, context: DocumentContext, previous: tuple[StageResult, ...]
    ) -> StageResult:
        """Read prior outputs and inspect text, original media, or rendered pages."""
        ...


async def run_stages(
    context: DocumentContext,
    stages: Sequence[DocumentStage],
    *,
    timeout_seconds: float = 60,
) -> list[StageResult]:
    names = [stage.name for stage in stages]
    if len(names) != len(set(names)):
        raise ValueError("Document stage names must be unique")
    results: list[StageResult] = []
    for stage in stages:
        try:
            result = await asyncio.wait_for(
                stage.analyze(context, tuple(results)), timeout_seconds
            )
            if result.stage != stage.name or result.version != stage.version:
                raise ValueError("Stage result identity does not match adapter")
        except Exception as exc:
            # Never include document text or provider exception details in public results.
            logger.warning(
                "documents.stage.failed",
                extra={
                    "evidence_id": context.evidence_id,
                    "stage": stage.name,
                    "error_type": type(exc).__name__,
                },
            )
            result = StageResult(
                stage=stage.name,
                version=stage.version,
                status="error",
                error_code=(
                    "timeout" if isinstance(exc, TimeoutError) else "analysis_failed"
                ),
            )
        results.append(result)
    return results
