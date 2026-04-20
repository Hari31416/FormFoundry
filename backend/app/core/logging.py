from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from app.core.request_id import get_request_id

RESERVED_LOG_RECORD_FIELDS = set(logging.makeLogRecord({}).__dict__.keys()) | {
    "asctime",
    "message",
}


def _normalize_log_value(value: Any) -> Any:
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _normalize_log_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_normalize_log_value(item) for item in value]
    return str(value)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": get_request_id(),
        }
        context = {
            key: _normalize_log_value(value)
            for key, value in record.__dict__.items()
            if key not in RESERVED_LOG_RECORD_FIELDS and not key.startswith("_")
        }
        if context:
            payload["context"] = context
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack_info"] = self.formatStack(record.stack_info)
        return json.dumps(payload)


def configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
