import pytest
from jinja2 import UndefinedError

from app.prompts import render_prompt


def test_prompt_renderer_requires_explicit_variables() -> None:
    with pytest.raises(UndefinedError):
        render_prompt("ocr_user.jinja2")
    assert "PDF page 2" in render_prompt("ocr_user.jinja2", context_label="PDF page 2")


def test_extraction_prompt_preserves_evidence_boundary() -> None:
    prompt = render_prompt(
        "extraction_user.jinja2",
        template_name="Movie",
        field_catalog="movie.genre",
        conversation_context='[{"role": "user", "message": "Fantasy"}]',
        source_text="2025",
    )
    assert prompt.index("Fantasy") < prompt.index("Source text:")
    assert prompt.endswith("2025")
    system = render_prompt("extraction_system.jinja2")
    assert "Do not invent missing date components" in system
