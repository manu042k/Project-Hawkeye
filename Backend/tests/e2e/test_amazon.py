"""E2E test: TC-002 Amazon search, add to cart, verify cart.

Requires:
  - Docker running with 'project-hawkeye-hawkeye-sandbox:latest' image built.
  - Ollama running locally with qwen3.5:2b pulled (or set HAWKEYE_MODEL env var).

Note: Amazon may show CAPTCHAs or require login. If the test returns
'blocked', check the agent trace for a CAPTCHA explanation.

Run:
  pytest tests/e2e/test_amazon.py -v -m e2e -s
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

from orchestrator.llm.provider import get_llm
from orchestrator.loader.yaml_loader import load_test_case
from orchestrator.runner.run_manager import RunManager

_TEST_CASE_PATH = Path(__file__).parent.parent.parent / "orchestrator" / "test_cases" / "amazon_add_to_cart.yaml"
_MODEL = os.environ.get("HAWKEYE_MODEL", "ollama:qwen3.5:2b")
_OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")


@pytest.mark.e2e
@pytest.mark.timeout(300)
async def test_amazon_add_to_cart_passes():
    """TC-002: Amazon add-to-cart must complete with status='passed'."""
    test_case = load_test_case(_TEST_CASE_PATH)
    llm = get_llm(_MODEL, ollama_host=_OLLAMA_HOST)
    manager = RunManager(llm=llm, model_name=_MODEL)

    result = await manager.run(test_case, output_dir=Path("artifacts"))

    # Amazon may show CAPTCHA — treat 'blocked' as an infrastructure issue,
    # not a code defect, so we skip rather than fail.
    if result.status == "blocked" and result.termination_reason and "captcha" in result.termination_reason.lower():
        pytest.skip(f"Amazon CAPTCHA blocked the run: {result.termination_reason}")

    assert result.status == "passed", (
        f"Expected status='passed', got {result.status!r}. "
        f"Reason: {result.termination_reason}. "
        f"Steps completed: {result.steps_completed}"
    )
    assert "S3" in result.steps_completed, "S3 (add to cart) was not completed"
    assert "S5" in result.steps_completed, "S5 (verify cart) was not completed"

    a1_results = [r for r in result.assertion_results if r.assertion_id == "A1"]
    assert a1_results, "Assertion A1 was not evaluated"
    assert a1_results[0].passed, (
        f"A1 (headphones in cart) failed: {a1_results[0].details}"
    )
