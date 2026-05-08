"""Test case YAML/JSON loader with full validation."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from pydantic import ValidationError

from orchestrator.models.test_case import TestCase, TestCaseValidationError


def load_test_case(path: str | Path) -> TestCase:
    """Load and validate a test case from a YAML or JSON file.

    Applies all defaults from the TestCase schema. Required fields:
    ``id``, ``name``, ``goal``, ``target.url``.

    Raises:
        FileNotFoundError: if the path does not exist.
        yaml.YAMLError: if the file is syntactically invalid YAML.
        TestCaseValidationError: if required fields are missing or values
            fail schema validation (wraps Pydantic's ValidationError with
            a human-readable message containing the field path).
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Test case file not found: {path}")

    raw_text = path.read_text(encoding="utf-8")

    if path.suffix.lower() == ".json":
        try:
            data: Any = json.loads(raw_text)
        except json.JSONDecodeError as exc:
            raise yaml.YAMLError(f"Invalid JSON: {exc}") from exc
    else:
        # Treat everything else as YAML (.yaml, .yml, or bare).
        # yaml.safe_load raises yaml.YAMLError on syntax errors.
        data = yaml.safe_load(raw_text)

    if not isinstance(data, dict):
        raise TestCaseValidationError(
            f"Test case file must contain a YAML/JSON object (dict), got {type(data).__name__!r}"
        )

    try:
        return TestCase.model_validate(data)
    except ValidationError as exc:
        # Convert Pydantic v2 error into a human-readable TestCaseValidationError.
        lines = []
        for error in exc.errors():
            loc = " -> ".join(str(p) for p in error["loc"])
            msg = error["msg"]
            lines.append(f"  [{loc}] {msg}")
        detail = "\n".join(lines)
        raise TestCaseValidationError(
            f"Test case validation failed:\n{detail}"
        ) from exc
