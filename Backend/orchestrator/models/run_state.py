from __future__ import annotations

import time
import warnings
from dataclasses import dataclass, field
from typing import Annotated, Any, Literal, Optional
from typing import TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

# Direct import required: LangGraph calls get_type_hints(AgentState) at runtime
# to build its channel schema. TYPE_CHECKING-only imports leave unresolvable
# forward references that crash StateGraph.__init__.
from orchestrator.models.test_case import TestCase  # noqa: E402

RunStatus = Literal["running", "passed", "failed", "errored", "timed_out", "blocked"]


@dataclass
class ErrorInfo:
    error_type: str  # llm_rate_limit|tool_error|browser_crash|mcp_disconnect|llm_auth_error
    message: str
    step_number: int
    tool_name: str | None = None
    recoverable: bool = True
    timestamp: float = field(default_factory=time.time)


@dataclass
class StepTrace:
    step_number: int
    timestamp: float
    completed_at: float | None = None
    checkpoint_id: str | None = None
    checkpoint_completed: bool = False
    # LLM fields
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    llm_latency_ms: int = 0
    # Tool fields
    tool_name: str | None = None
    tool_source: str | None = None  # "mcp" | "custom"
    tool_input: dict | None = None
    tool_output: Any = None
    tool_success: bool = True
    tool_error: str | None = None
    tool_retries: int = 0
    # Agent reasoning
    agent_output_text: str | None = None
    stop_reason: str | None = None
    # Page context at time of step
    page_url: str = ""
    page_title: str = ""
    # Timing breakdown (ms)
    wait_for_stable_ms: int = 0
    tool_execution_latency_ms: int = 0
    total_step_latency_ms: int = 0
    # Cost
    estimated_cost_usd: float = 0.0


# Groq API pricing per million tokens. Ollama models are local/free → $0.00.
MODEL_PRICING: dict[str, dict[str, float]] = {
    "openai/gpt-oss-120b":     {"input_per_mtok": 0.90, "output_per_mtok": 0.90},
    "openai/gpt-oss-20b":      {"input_per_mtok": 0.10, "output_per_mtok": 0.10},
    "llama-3.3-70b-versatile": {"input_per_mtok": 0.59, "output_per_mtok": 0.79},
    "llama-3.1-8b-instant":    {"input_per_mtok": 0.05, "output_per_mtok": 0.08},
}

_MOST_EXPENSIVE = max(
    MODEL_PRICING,
    key=lambda k: MODEL_PRICING[k]["input_per_mtok"] + MODEL_PRICING[k]["output_per_mtok"],
)


def compute_step_cost(model: str, usage: dict) -> float:
    """Compute the API cost in USD for a single LLM call.

    Returns 0.0 for Ollama models (local inference is free).
    If the model string is unrecognized and non-Ollama, falls back to the most
    expensive known Groq pricing and logs a WARNING so the caller notices.
    """
    # Ollama models have the format "name:tag" (e.g. "qwen3.5:2b") or "ollama:name:tag".
    # They do NOT contain "/", which is the separator used in Groq model IDs.
    # Also catch explicit "ollama:" prefix.
    normalized = model.removeprefix("ollama:")
    if "/" not in normalized:
        # Bare name like "qwen3.5:2b" or "llama3" — Ollama local model.
        return 0.0

    # Groq models: strip "groq:" prefix if present, then look up.
    lookup = normalized.removeprefix("groq:")
    pricing = MODEL_PRICING.get(lookup)
    if pricing is None:
        warnings.warn(
            f"Unknown model {model!r} for cost computation; "
            f"using {_MOST_EXPENSIVE!r} pricing as conservative estimate.",
            stacklevel=2,
        )
        pricing = MODEL_PRICING[_MOST_EXPENSIVE]

    input_tokens = usage.get("input_tokens", 0) or usage.get("prompt_tokens", 0)
    output_tokens = usage.get("output_tokens", 0) or usage.get("completion_tokens", 0)
    return (
        input_tokens * pricing["input_per_mtok"] / 1_000_000
        + output_tokens * pricing["output_per_mtok"] / 1_000_000
    )


class AgentState(TypedDict):
    # Test case context — set once at start, never modified during run.
    test_case: TestCase
    run_id: str
    container_host: str
    mcp_url: str
    cdp_url: Optional[str]

    # Conversation history — accumulated via LangGraph add_messages reducer.
    messages: Annotated[list[BaseMessage], add_messages]

    # Step tracking
    step_number: int
    current_checkpoint: Optional[str]
    completed_checkpoints: list[str]

    # Page state — updated each OBSERVE cycle.
    current_url: str
    page_title: str
    page_snapshot: str

    # Tool execution tracking
    last_tool_name: Optional[str]
    last_tool_result: Any
    last_tool_success: bool

    # Error tracking
    consecutive_errors: int
    last_error: Optional[ErrorInfo]
    error_history: list[ErrorInfo]

    # Per-step trace accumulator
    traces: list[StepTrace]
    current_trace: Optional[StepTrace]

    # Termination state
    status: RunStatus
    goal_complete: bool
    termination_reason: Optional[str]

    # Guard-rails state
    guard_blocked: bool

    # Wall-clock start time for timeout checks
    run_start_time: float
