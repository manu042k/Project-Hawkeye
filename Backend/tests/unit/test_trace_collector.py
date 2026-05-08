"""Unit tests for TraceCollector and related helpers."""
from __future__ import annotations

import warnings
from pathlib import Path

import pytest

from orchestrator.models.run_state import StepTrace, compute_step_cost
from orchestrator.models.results import AssertionResult
from orchestrator.trace.collector import TraceCollector, _percentiles, RunTracesSummary


def _make_collector(**kwargs) -> TraceCollector:
    defaults = dict(
        run_id="run-test",
        test_id="TC-001",
        test_name="Test",
        model="qwen3.5:2b",
        browser="chromium",
    )
    defaults.update(kwargs)
    return TraceCollector(**defaults)


class TestPercentiles:
    def test_empty_list_returns_zeros(self):
        assert _percentiles([]) == (0, 0, 0)

    def test_single_element(self):
        p50, p95, p99 = _percentiles([42])
        assert p50 == 42
        assert p95 == 42
        assert p99 == 42

    def test_known_values(self):
        values = sorted(range(100))  # 0..99
        p50, p95, p99 = _percentiles(values)
        assert p50 == 50
        assert p95 == 95
        assert p99 == 99

    def test_two_elements(self):
        p50, p95, p99 = _percentiles([10, 20])
        assert p50 in (10, 20)  # acceptable for 2-element list
        assert p99 in (10, 20)


class TestGetSummary:
    def test_empty_trace_summary(self):
        c = _make_collector()
        s = c.get_summary(status="passed")
        assert s.total_steps == 0
        assert s.total_input_tokens == 0
        assert s.total_output_tokens == 0
        assert s.total_cost_usd == 0.0
        assert s.mcp_tool_calls == 0
        assert s.custom_tool_calls == 0
        assert s.steps_completed == []
        assert s.error_count == 0

    def test_accumulates_token_counts(self):
        c = _make_collector()
        c.on_step_start(1, "S1")
        c.on_reason(
            model="qwen3.5:2b",
            input_tokens=1000,
            output_tokens=200,
            latency_ms=1200,
            stop_reason="tool_use",
            agent_text=None,
            cost_usd=0.0,
        )
        c.on_step_start(2, "S2")
        c.on_reason(
            model="qwen3.5:2b",
            input_tokens=2000,
            output_tokens=300,
            latency_ms=1500,
            stop_reason="end_turn",
            agent_text=None,
            cost_usd=0.0,
        )
        s = c.get_summary(status="passed")
        assert s.total_input_tokens == 3000
        assert s.total_output_tokens == 500
        assert s.total_steps == 2

    def test_mcp_vs_custom_tool_counts(self):
        c = _make_collector()
        c.on_step_start(1, None)
        c.on_act(
            tool_name="browser_click", tool_source="mcp",
            tool_input={}, tool_output="ok", latency_ms=100,
            success=True, error=None, retries=0,
        )
        c.on_step_start(2, None)
        c.on_act(
            tool_name="wait_for_stable", tool_source="custom",
            tool_input={}, tool_output="ok", latency_ms=50,
            success=True, error=None, retries=0,
        )
        c.on_step_start(3, None)
        c.on_act(
            tool_name="browser_snapshot", tool_source="mcp",
            tool_input={}, tool_output="tree", latency_ms=200,
            success=True, error=None, retries=0,
        )
        s = c.get_summary(status="passed")
        assert s.mcp_tool_calls == 2
        assert s.custom_tool_calls == 1

    def test_error_count_increments_on_failure(self):
        c = _make_collector()
        c.on_step_start(1, None)
        c.on_act(
            tool_name="browser_click", tool_source="mcp",
            tool_input={}, tool_output="", latency_ms=100,
            success=False, error="Element not found", retries=1,
        )
        s = c.get_summary(status="failed")
        assert s.error_count == 1


class TestWriteJson:
    def test_writes_valid_json(self, tmp_path):
        import json
        c = _make_collector()
        c.on_step_start(1, "S1")
        c.on_act(
            tool_name="browser_navigate", tool_source="mcp",
            tool_input={"url": "https://example.com"}, tool_output="OK",
            latency_ms=300, success=True, error=None, retries=0,
        )
        path = c.write_json(tmp_path, status="passed")
        assert path.exists()
        data = json.loads(path.read_text())
        assert data["run_id"] == "run-test"
        assert data["status"] == "passed"
        assert len(data["steps"]) == 1
        assert data["steps"][0]["tool_name"] == "browser_navigate"

    def test_creates_run_subdirectory(self, tmp_path):
        c = _make_collector(run_id="run-abc123")
        path = c.write_json(tmp_path, status="failed")
        assert path.parent.name == "run-abc123"
        assert path.name == "trace.json"
