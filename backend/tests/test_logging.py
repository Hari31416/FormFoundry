from __future__ import annotations

import json
import logging

from app.core.logging import JsonFormatter


def test_json_formatter_includes_structured_extra_context() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="app.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=42,
        msg="Extraction complete for %s",
        args=("case-123",),
        exc_info=None,
    )
    record.case_id = "case-123"
    record.metrics = {"chunk_count": 3, "candidate_count": 8}

    payload = json.loads(formatter.format(record))

    assert payload["message"] == "Extraction complete for case-123"
    assert payload["request_id"] == "-"
    assert payload["context"]["case_id"] == "case-123"
    assert payload["context"]["metrics"]["chunk_count"] == 3
    assert payload["context"]["metrics"]["candidate_count"] == 8
