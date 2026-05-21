from __future__ import annotations

import json
import logging

import pytest

from app.core.logging import JsonFormatter, configure_logging


def test_root_logger_json_stream_handler(capsys: pytest.CaptureFixture[str]) -> None:
    # Set up logging configuration to intercept root and third-party loggers
    configure_logging()

    test_logger = logging.getLogger("app.test_structured_logging")
    test_logger.info(
        "Structured log message test", extra={"user_id": "usr_99", "score": 9.5}
    )

    # Capture standard error output where StreamHandler writes
    captured = capsys.readouterr()
    log_output = captured.err.strip()

    # Verify output is valid JSON
    assert log_output != ""
    lines = log_output.split("\n")

    # We find the line containing our test message, since there might be other startup logs
    target_line = None
    for line in lines:
        if "Structured log message test" in line:
            target_line = line
            break

    assert (
        target_line is not None
    ), f"Expected log not found in captured stderr: {log_output}"

    payload = json.loads(target_line)
    assert payload["level"] == "INFO"
    assert payload["logger"] == "app.test_structured_logging"
    assert payload["message"] == "Structured log message test"
    assert "timestamp" in payload
    assert "request_id" in payload
    assert "context" in payload
    assert payload["context"]["user_id"] == "usr_99"
    assert payload["context"]["score"] == 9.5


def test_third_party_logger_routing(capsys: pytest.CaptureFixture[str]) -> None:
    configure_logging()

    # Test that third-party logs are routed and structured as JSON
    for lib_logger_name in ("uvicorn", "sqlalchemy", "minio"):
        lib_logger = logging.getLogger(lib_logger_name)
        # Ensure logger has INFO level set so it actually emits the log
        lib_logger.setLevel(logging.INFO)
        lib_logger.info(
            f"Test logger output from {lib_logger_name}",
            extra={"library": lib_logger_name},
        )

    captured = capsys.readouterr()
    log_output = captured.err.strip()
    lines = log_output.split("\n")

    for lib_logger_name in ("uvicorn", "sqlalchemy", "minio"):
        target_line = None
        for line in lines:
            if f"Test logger output from {lib_logger_name}" in line:
                target_line = line
                break

        assert (
            target_line is not None
        ), f"Third-party log for {lib_logger_name} not routed correctly"
        payload = json.loads(target_line)
        assert payload["level"] == "INFO"
        assert payload["logger"] == lib_logger_name
        assert payload["context"]["library"] == lib_logger_name


def test_reserved_log_record_fields_excluded_from_context() -> None:
    formatter = JsonFormatter()
    record = logging.LogRecord(
        name="app.test",
        level=logging.WARNING,
        pathname="some_file.py",
        lineno=100,
        msg="Test message with %s",
        args=("params",),
        exc_info=None,
    )
    # Injecting standard attributes that should be filtered out
    record.filename = "some_file.py"
    record.name = "app.test"
    record.levelname = "WARNING"
    record.msg = "Test message with %s"

    # Custom custom context
    record.custom_attribute = "custom_val"

    payload = json.loads(formatter.format(record))
    assert payload["level"] == "WARNING"
    assert payload["logger"] == "app.test"
    assert "custom_attribute" in payload["context"]
    assert payload["context"]["custom_attribute"] == "custom_val"

    # Reserved fields must NOT be present in context
    assert "filename" not in payload["context"]
    assert "name" not in payload["context"]
    assert "levelname" not in payload["context"]
    assert "msg" not in payload["context"]
    assert "asctime" not in payload["context"]
