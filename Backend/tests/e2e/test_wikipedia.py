"""E2E test: TC-001 Wikipedia search + scroll.

Requires:
  - Docker running with 'project-hawkeye-hawkeye-sandbox:latest' image built.
  - Ollama running locally with qwen3.5:2b pulled (or set HAWKEYE_MODEL env var).

Run:
  pytest tests/e2e/test_wikipedia.py -v -m e2e -s

  # With Groq fallback:
  GROQ_API_KEY=<key> pytest tests/e2e/test_wikipedia.py -v -m e2e -s \
    --model groq:openai/gpt-oss-120b
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from orchestrator.llm.provider import get_llm
from orchestrator.loader.yaml_loader import load_test_case
from orchestrator.runner.run_manager import RunManager

_TEST_CASE_PATH = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases" / "wikipedia_search.yaml"
_MODEL = os.environ.get("HAWKEYE_MODEL", "ollama:qwen3.5:2b")
_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")


@pytest.mark.e2e
@pytest.mark.timeout(180)
async def test_wikipedia_search_passes():
    """TC-001: Wikipedia search + scroll must complete with status='passed'."""
    test_case = load_test_case(_TEST_CASE_PATH)
    llm = get_llm(_MODEL, ollama_host=_OLLAMA_HOST)
    manager = RunManager(llm=llm, model_name=_MODEL)

    result = await manager.run(test_case, output_dir=Path("artifacts"))

    assert result.status == "passed", (
        f"Expected status='passed', got {result.status!r}. "
        f"Reason: {result.termination_reason}. "
        f"Steps completed: {result.steps_completed}"
    )
    assert "S1" in result.steps_completed, "S1 (search) was not completed"
    assert "S2" in result.steps_completed, "S2 (open article) was not completed"
    assert "S3" in result.steps_completed, "S3 (scroll) was not completed"

    a1_results = [r for r in result.assertion_results if r.assertion_id == "A1"]
    assert a1_results, "Assertion A1 was not evaluated"
    assert a1_results[0].passed, (
        f"A1 (text presence) failed: {a1_results[0].details}"
    )
