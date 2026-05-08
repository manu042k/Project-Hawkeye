"""Unit tests for orchestrator data models."""
from __future__ import annotations

import time
import warnings
from dataclasses import fields as dc_fields

import pytest

from orchestrator.models.test_case import (
    Assertion,
    Checkpoint,
    Constraints,
    Context,
    Target,
    TestCase,
    TestCaseValidationError,
)
from orchestrator.models.run_state import (
    MODEL_PRICING,
    ErrorInfo,
    RunStatus,
    StepTrace,
    compute_step_cost,
)
from orchestrator.models.results import AssertionResult, RunResult


# ---------------------------------------------------------------------------
# TestCase model
# ---------------------------------------------------------------------------

class TestTestCaseDefaults:
    def test_minimal_construction(self):
        tc = TestCase(
            id="TC-001",
            name="Test",
            goal="Do something",
            target=Target(url="https://example.com"),
        )
        assert tc.priority == "P1"
        assert tc.tags == []
        assert tc.steps is None
        assert tc.assertions == []
        assert tc.constraints.max_steps == 30
        assert tc.constraints.timeout_seconds == 180
        assert tc.constraints.navigation_policy == "interact_only"
        assert tc.context.page_type == "spa"

    def test_browser_default_is_chromium(self):
        tc = TestCase(
            id="TC-001", name="T", goal="G",
            target=Target(url="https://example.com"),
        )
        assert tc.target.browser == "chromium"

    def test_invalid_browser_raises(self):
        with pytest.raises(Exception):
            Target(url="https://example.com", browser="ie11")

    def test_invalid_priority_raises(self):
        with pytest.raises(Exception):
            TestCase(
                id="TC-001", name="T", goal="G",
                target=Target(url="https://example.com"),
                priority="P5",  # type: ignore[arg-type]
            )

    def test_invalid_navigation_policy_raises(self):
        with pytest.raises(Exception):
            Constraints(navigation_policy="unrestricted")  # type: ignore[arg-type]

    def test_on_failure_capture_defaults(self):
        tc = TestCase(
            id="TC-001", name="T", goal="G",
            target=Target(url="https://example.com"),
        )
        assert tc.on_failure.capture["screenshot"] is True
        assert tc.on_failure.capture["video"] is False

    def test_constraints_forbidden_actions_default_empty(self):
        c = Constraints()
        assert c.forbidden_actions == []
        assert c.required_behaviors == []


# ---------------------------------------------------------------------------
# ErrorInfo dataclass
# ---------------------------------------------------------------------------

class TestErrorInfo:
    def test_recoverable_default_true(self):
        err = ErrorInfo(error_type="tool_error", message="failed", step_number=3)
        assert err.recoverable is True

    def test_timestamp_auto_set(self):
        before = time.time()
        err = ErrorInfo(error_type="mcp_disconnect", message="lost", step_number=1)
        after = time.time()
        assert before <= err.timestamp <= after

    def test_non_recoverable_can_be_set(self):
        err = ErrorInfo(
            error_type="llm_auth_error",
            message="401",
            step_number=2,
            recoverable=False,
        )
        assert err.recoverable is False

    def test_tool_name_default_none(self):
        err = ErrorInfo(error_type="tool_error", message="x", step_number=1)
        assert err.tool_name is None


# ---------------------------------------------------------------------------
# StepTrace dataclass
# ---------------------------------------------------------------------------

class TestStepTrace:
    def test_numeric_defaults_are_zero(self):
        trace = StepTrace(step_number=1, timestamp=1.0)
        assert trace.input_tokens == 0
        assert trace.output_tokens == 0
        assert trace.llm_latency_ms == 0
        assert trace.wait_for_stable_ms == 0
        assert trace.tool_execution_latency_ms == 0
        assert trace.total_step_latency_ms == 0
        assert trace.estimated_cost_usd == 0.0

    def test_string_defaults_are_empty(self):
        trace = StepTrace(step_number=1, timestamp=1.0)
        assert trace.model == ""
        assert trace.page_url == ""
        assert trace.page_title == ""

    def test_optional_fields_default_none(self):
        trace = StepTrace(step_number=1, timestamp=1.0)
        assert trace.completed_at is None
        assert trace.checkpoint_id is None
        assert trace.tool_name is None
        assert trace.tool_source is None
        assert trace.tool_error is None
        assert trace.agent_output_text is None
        assert trace.stop_reason is None

    def test_tool_success_default_true(self):
        trace = StepTrace(step_number=1, timestamp=1.0)
        assert trace.tool_success is True

    def test_checkpoint_completed_default_false(self):
        trace = StepTrace(step_number=1, timestamp=1.0)
        assert trace.checkpoint_completed is False


# ---------------------------------------------------------------------------
# compute_step_cost
# ---------------------------------------------------------------------------

class TestComputeStepCost:
    def test_ollama_model_tag_format_returns_zero(self):
        assert compute_step_cost("qwen3.5:2b", {"input_tokens": 1000, "output_tokens": 500}) == 0.0

    def test_ollama_prefix_returns_zero(self):
        assert compute_step_cost("ollama:qwen3.5:2b", {"input_tokens": 9999, "output_tokens": 9999}) == 0.0

    def test_bare_model_name_no_slash_returns_zero(self):
        # e.g. "llama3" without a tag or slash
        assert compute_step_cost("llama3", {"input_tokens": 1000, "output_tokens": 500}) == 0.0

    def test_known_groq_model_correct_calculation(self):
        # openai/gpt-oss-120b: input $0.90/mtok, output $0.90/mtok
        # 1_000_000 input + 1_000_000 output = $1.80
        cost = compute_step_cost(
            "openai/gpt-oss-120b",
            {"input_tokens": 1_000_000, "output_tokens": 1_000_000},
        )
        assert abs(cost - 1.80) < 1e-9

    def test_groq_prefix_stripped(self):
        cost_with = compute_step_cost(
            "groq:openai/gpt-oss-120b",
            {"input_tokens": 1_000_000, "output_tokens": 0},
        )
        cost_without = compute_step_cost(
            "openai/gpt-oss-120b",
            {"input_tokens": 1_000_000, "output_tokens": 0},
        )
        assert cost_with == cost_without

    def test_unknown_groq_model_warns_and_uses_fallback(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            cost = compute_step_cost(
                "openai/some-future-model",
                {"input_tokens": 1_000_000, "output_tokens": 0},
            )
        assert len(caught) == 1
        assert "Unknown model" in str(caught[0].message)
        # Fallback to most expensive known model — cost must be > 0
        assert cost > 0.0

    def test_zero_tokens_returns_zero(self):
        assert compute_step_cost("openai/gpt-oss-120b", {}) == 0.0
        assert compute_step_cost("openai/gpt-oss-120b", {"input_tokens": 0, "output_tokens": 0}) == 0.0

    def test_prompt_tokens_alias_accepted(self):
        # Some LangChain models return usage with prompt_tokens/completion_tokens keys
        cost_alias = compute_step_cost(
            "openai/gpt-oss-120b",
            {"prompt_tokens": 1_000_000, "completion_tokens": 1_000_000},
        )
        cost_standard = compute_step_cost(
            "openai/gpt-oss-120b",
            {"input_tokens": 1_000_000, "output_tokens": 1_000_000},
        )
        assert cost_alias == cost_standard


# ---------------------------------------------------------------------------
# AssertionResult & RunResult
# ---------------------------------------------------------------------------

class TestResults:
    def test_assertion_result_construction(self):
        r = AssertionResult(
            assertion_id="A1",
            type="content",
            description="Text present",
            passed=True,
            status="passed",
        )
        assert r.details is None
        assert r.passed is True

    def test_run_result_construction(self):
        from pathlib import Path
        r = RunResult(
            run_id="run-001",
            test_id="TC-001",
            test_name="Wiki search",
            status="passed",
            steps_completed=["S1", "S2"],
            assertion_results=[],
            total_steps=6,
            duration_s=34.2,
            total_input_tokens=12000,
            total_output_tokens=600,
            estimated_cost_usd=0.014,
        )
        assert r.termination_reason is None
        assert r.trace_path is None
        assert r.error_count == 0
        assert r.tool_call_count == 0

    def test_assertion_result_failed_status(self):
        r = AssertionResult(
            assertion_id="A2",
            type="content",
            description="Pattern match",
            passed=False,
            status="failed",
            details="Pattern not found in snapshot",
        )
        assert r.status == "failed"
        assert "not found" in r.details
