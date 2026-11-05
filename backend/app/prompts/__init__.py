"""Shared rendering for the application's LLM prompt templates."""

from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined

_environment = Environment(
    loader=FileSystemLoader(Path(__file__).parent),
    undefined=StrictUndefined,
    autoescape=False,
    keep_trailing_newline=False,
)


def render_prompt(name: str, **context: Any) -> str:
    return _environment.get_template(name).render(**context).strip()
