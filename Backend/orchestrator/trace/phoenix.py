"""Arize Phoenix OTEL tracing integration — opt-in via PHOENIX_COLLECTOR_ENDPOINT env var."""
from __future__ import annotations

import json
import logging
import os
import time
import warnings
from typing import Any

logger = logging.getLogger(__name__)

try:
    from opentelemetry import trace as otel_trace
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.trace import SpanKind, Status, StatusCode, NonRecordingSpan
    from openinference.semconv.trace import SpanAttributes
    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False


def _provider_from_model(model: str) -> str:
    """Extract provider name from a model string like 'openrouter:openai/gpt-4o'."""
    if ":" in model:
        return model.split(":", 1)[0]
    return "unknown"


def _serialize_messages(messages: list[Any]) -> str:
    """Serialize LangChain messages to a compact JSON string for span attributes."""
    out = []
    for m in messages:
        role = type(m).__name__.replace("Message", "").lower()
        content = m.content
        if isinstance(content, list):
            text_parts = [
                b.get("text", "") if isinstance(b, dict) else str(b)
                for b in content
                if not (isinstance(b, dict) and b.get("type") == "image_url")
            ]
            content = " ".join(p for p in text_parts if p)
        entry: dict[str, Any] = {"role": role, "content": str(content)[:800]}
        tool_calls = getattr(m, "tool_calls", None)
        if tool_calls:
            entry["tool_calls"] = [
                {"name": tc.get("name", ""), "args": tc.get("args", {})}
                for tc in tool_calls
            ]
        out.append(entry)
    try:
        return json.dumps(out, ensure_ascii=False)
    except Exception:
        return str(out)[:2000]


class PhoenixTracer:
    """Sends OTEL spans to Arize Phoenix via OTLP/HTTP.

    Reads PHOENIX_COLLECTOR_ENDPOINT from env at construction time.
    All public methods are no-ops when the endpoint is absent or when
    opentelemetry/openinference packages are not installed.

    Span hierarchy per run:
        hawkeye.run   (root, CHAIN)
          hawkeye.step  (per step, CHAIN)
            hawkeye.observe  (CHAIN)
            hawkeye.reason   (LLM — model, provider, messages, tokens, latency, cost)
            hawkeye.act      (TOOL — tool name/input/output, latency, success)
    """

    def __init__(self) -> None:
        self._enabled = False
        self._tracer: Any = None
        self._provider: Any = None
        self._run_span: Any = None
        self._step_span: Any = None
        self._observe_span: Any = None
        self._reason_span: Any = None
        self._act_span: Any = None
        self._run_start_ns: int = 0
        self._step_start_ns: int = 0

        endpoint = os.environ.get("PHOENIX_COLLECTOR_ENDPOINT", "").strip()
        if not endpoint:
            return
        if not _OTEL_AVAILABLE:
            warnings.warn(
                "PHOENIX_COLLECTOR_ENDPOINT is set but opentelemetry/openinference packages "
                "are not installed. Install with: uv pip install 'project-hawkeye[eval]'",
                stacklevel=2,
            )
            return

        try:
            resource = Resource(attributes={"service.name": "hawkeye-orchestrator"})
            exporter = OTLPSpanExporter(endpoint=f"{endpoint.rstrip('/')}/v1/traces")
            processor = BatchSpanProcessor(exporter)
            self._provider = TracerProvider(resource=resource)
            self._provider.add_span_processor(processor)
            self._tracer = self._provider.get_tracer("hawkeye")
            self._enabled = True
            logger.info("PhoenixTracer: connected to %s", endpoint)
        except Exception as exc:
            logger.warning("PhoenixTracer: init failed (tracing disabled): %s", exc)

    # ------------------------------------------------------------------
    # Run-level spans
    # ------------------------------------------------------------------

    def start_run(
        self,
        run_id: str,
        test_id: str,
        test_name: str,
        model: str,
        browser: str,
    ) -> None:
        if not self._enabled:
            return
        try:
            self._run_start_ns = time.time_ns()
            span = self._tracer.start_span(
                "hawkeye.run",
                kind=SpanKind.INTERNAL,
                start_time=self._run_start_ns,
                attributes={
                    SpanAttributes.OPENINFERENCE_SPAN_KIND: "CHAIN",
                    "hawkeye.run_id": run_id,
                    "hawkeye.test_id": test_id,
                    "hawkeye.test_name": test_name,
                    SpanAttributes.LLM_MODEL_NAME: model,
                    "llm.provider": _provider_from_model(model),
                    "hawkeye.browser": browser,
                },
            )
            self._run_span = span
        except Exception as exc:
            logger.warning("PhoenixTracer.start_run failed: %s", exc)

    def end_run(self, status: str, total_steps: int = 0, total_cost_usd: float = 0.0) -> None:
        if not self._enabled or self._run_span is None:
            return
        try:
            end_ns = time.time_ns()
            elapsed_ms = (end_ns - self._run_start_ns) // 1_000_000
            span_status = Status(StatusCode.OK) if status == "passed" else Status(StatusCode.ERROR)
            self._run_span.set_status(span_status)
            self._run_span.set_attribute("hawkeye.run_status", status)
            self._run_span.set_attribute("hawkeye.total_steps", total_steps)
            self._run_span.set_attribute("hawkeye.total_cost_usd", total_cost_usd)
            self._run_span.set_attribute("hawkeye.elapsed_ms", elapsed_ms)
            self._run_span.end(end_time=end_ns)
            self._run_span = None
            if self._provider:
                self._provider.force_flush(timeout_millis=5000)
        except Exception as exc:
            logger.warning("PhoenixTracer.end_run failed: %s", exc)

    # ------------------------------------------------------------------
    # Step-level spans
    # ------------------------------------------------------------------

    def start_step(self, step_number: int) -> None:
        if not self._enabled or self._run_span is None:
            return
        try:
            self._step_start_ns = time.time_ns()
            ctx = otel_trace.set_span_in_context(self._run_span)
            span = self._tracer.start_span(
                "hawkeye.step",
                context=ctx,
                kind=SpanKind.INTERNAL,
                start_time=self._step_start_ns,
                attributes={
                    SpanAttributes.OPENINFERENCE_SPAN_KIND: "CHAIN",
                    "hawkeye.step_number": step_number,
                },
            )
            self._step_span = span
        except Exception as exc:
            logger.warning("PhoenixTracer.start_step failed: %s", exc)

    def end_step(self) -> None:
        if not self._enabled or self._step_span is None:
            return
        try:
            end_ns = time.time_ns()
            elapsed_ms = (end_ns - self._step_start_ns) // 1_000_000
            self._step_span.set_attribute("hawkeye.step_elapsed_ms", elapsed_ms)
            self._step_span.end(end_time=end_ns)
            self._step_span = None
        except Exception as exc:
            logger.warning("PhoenixTracer.end_step failed: %s", exc)

    # ------------------------------------------------------------------
    # Observe-level spans
    # ------------------------------------------------------------------

    def start_observe(self, url: str, title: str) -> None:
        if not self._enabled or self._step_span is None:
            return
        try:
            ctx = otel_trace.set_span_in_context(self._step_span)
            start_ns = time.time_ns()
            span = self._tracer.start_span(
                "hawkeye.observe",
                context=ctx,
                kind=SpanKind.INTERNAL,
                start_time=start_ns,
                attributes={
                    SpanAttributes.OPENINFERENCE_SPAN_KIND: "CHAIN",
                    "hawkeye.url": url,
                    "hawkeye.page_title": title,
                },
            )
            span.set_attribute("_start_ns", start_ns)
            self._observe_span = span
        except Exception as exc:
            logger.warning("PhoenixTracer.start_observe failed: %s", exc)

    def end_observe(self, wait_ms: int, snapshot_chars: int) -> None:
        if not self._enabled or self._observe_span is None:
            return
        try:
            end_ns = time.time_ns()
            self._observe_span.set_attribute("hawkeye.wait_for_stable_ms", wait_ms)
            self._observe_span.set_attribute("hawkeye.snapshot_chars", snapshot_chars)
            self._observe_span.set_attribute("hawkeye.observe_elapsed_ms", wait_ms)
            self._observe_span.end(end_time=end_ns)
            self._observe_span = None
        except Exception as exc:
            logger.warning("PhoenixTracer.end_observe failed: %s", exc)

    # ------------------------------------------------------------------
    # Reason-level spans  (LLM call)
    # ------------------------------------------------------------------

    def start_reason(self, model: str, start_time_ns: int) -> None:
        """Open the reason span with a backdated start time (before the LLM call)."""
        if not self._enabled or self._step_span is None:
            return
        try:
            ctx = otel_trace.set_span_in_context(self._step_span)
            span = self._tracer.start_span(
                "hawkeye.reason",
                context=ctx,
                kind=SpanKind.CLIENT,
                start_time=start_time_ns,
                attributes={
                    SpanAttributes.OPENINFERENCE_SPAN_KIND: "LLM",
                    SpanAttributes.LLM_MODEL_NAME: model,
                    "llm.provider": _provider_from_model(model),
                },
            )
            self._reason_span = span
        except Exception as exc:
            logger.warning("PhoenixTracer.start_reason failed: %s", exc)

    def end_reason(
        self,
        *,
        input_tokens: int,
        output_tokens: int,
        latency_ms: int,
        cost_usd: float,
        agent_text: str | None,
        input_messages: list[Any] | None,
        tool_calls: list[dict] | None,
        end_time_ns: int,
    ) -> None:
        """Close the reason span with full LLM telemetry."""
        if not self._enabled or self._reason_span is None:
            return
        try:
            self._reason_span.set_attribute(SpanAttributes.LLM_TOKEN_COUNT_PROMPT, input_tokens)
            self._reason_span.set_attribute(SpanAttributes.LLM_TOKEN_COUNT_COMPLETION, output_tokens)
            self._reason_span.set_attribute(SpanAttributes.LLM_TOKEN_COUNT_TOTAL, input_tokens + output_tokens)
            self._reason_span.set_attribute("hawkeye.llm_latency_ms", latency_ms)
            self._reason_span.set_attribute("hawkeye.cost_usd", cost_usd)

            if agent_text:
                self._reason_span.set_attribute(SpanAttributes.LLM_OUTPUT_MESSAGES, agent_text[:4000])

            if input_messages:
                self._reason_span.set_attribute(
                    "llm.input_messages", _serialize_messages(input_messages)[:8000]
                )

            if tool_calls:
                try:
                    self._reason_span.set_attribute(
                        "llm.tool_calls",
                        json.dumps([
                            {"name": tc.get("name", ""), "args": tc.get("args", {})}
                            for tc in tool_calls
                        ], ensure_ascii=False)[:4000],
                    )
                    self._reason_span.set_attribute("llm.tool_call_count", len(tool_calls))
                except Exception:
                    pass

            self._reason_span.end(end_time=end_time_ns)
            self._reason_span = None
        except Exception as exc:
            logger.warning("PhoenixTracer.end_reason failed: %s", exc)

    # ------------------------------------------------------------------
    # Act-level spans  (tool execution)
    # ------------------------------------------------------------------

    def start_act(
        self, tool_name: str, tool_source: str, tool_input: dict, start_time_ns: int
    ) -> None:
        """Open the act span with a backdated start time (before tool execution)."""
        if not self._enabled or self._step_span is None:
            return
        try:
            ctx = otel_trace.set_span_in_context(self._step_span)
            span = self._tracer.start_span(
                "hawkeye.act",
                context=ctx,
                kind=SpanKind.INTERNAL,
                start_time=start_time_ns,
                attributes={
                    SpanAttributes.OPENINFERENCE_SPAN_KIND: "TOOL",
                    "tool.name": tool_name,
                    "tool.source": tool_source,
                    "tool.input": _safe_json(tool_input)[:2000],
                },
            )
            self._act_span = span
        except Exception as exc:
            logger.warning("PhoenixTracer.start_act failed: %s", exc)

    def end_act(
        self,
        *,
        success: bool,
        latency_ms: int,
        error: str | None,
        tool_output: str | None,
        end_time_ns: int,
    ) -> None:
        if not self._enabled or self._act_span is None:
            return
        try:
            self._act_span.set_attribute("tool.success", success)
            self._act_span.set_attribute("tool.latency_ms", latency_ms)
            if tool_output:
                self._act_span.set_attribute("tool.output", tool_output[:2000])
            if error:
                self._act_span.set_attribute("tool.error", error[:500])
                self._act_span.set_status(Status(StatusCode.ERROR, error[:200]))
            self._act_span.end(end_time=end_time_ns)
            self._act_span = None
        except Exception as exc:
            logger.warning("PhoenixTracer.end_act failed: %s", exc)


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _safe_json(obj: Any) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return str(obj)
