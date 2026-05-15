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
    screenshot_b64: str | None = None  # base64 PNG captured at observe time
    # Timing breakdown (ms)
    wait_for_stable_ms: int = 0
    tool_execution_latency_ms: int = 0
    total_step_latency_ms: int = 0
    # Cost
    estimated_cost_usd: float = 0.0


# Pricing per million tokens. Ollama/vLLM models are local/free → $0.00.
MODEL_PRICING: dict[str, dict[str, float]] = {
    # Groq / OpenRouter hosted models
    "openai/gpt-oss-120b":          {"input_per_mtok": 0.90,  "output_per_mtok": 0.90},
    "openai/gpt-oss-20b":           {"input_per_mtok": 0.10,  "output_per_mtok": 0.10},
    "openai/gpt-4o-mini":           {"input_per_mtok": 0.15,  "output_per_mtok": 0.60},
    "openai/gpt-4o":                {"input_per_mtok": 2.50,  "output_per_mtok": 10.00},
    "llama-3.3-70b-versatile":      {"input_per_mtok": 0.59,  "output_per_mtok": 0.79},
    "llama-3.1-8b-instant":         {"input_per_mtok": 0.05,  "output_per_mtok": 0.08},
    # NVIDIA NIM models
    "moonshotai/kimi-k2.6":         {"input_per_mtok": 0.50,  "output_per_mtok": 2.50},
    "meta/llama-3.1-70b-instruct":  {"input_per_mtok": 0.35,  "output_per_mtok": 0.40},
    "meta/llama-3.1-8b-instruct":   {"input_per_mtok": 0.05,  "output_per_mtok": 0.05},
    "nvidia/llama-3.1-nemotron-70b-instruct": {"input_per_mtok": 0.35, "output_per_mtok": 0.40},
    "mistralai/mistral-large-2-instruct":     {"input_per_mtok": 2.00, "output_per_mtok": 6.00},
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
    # Local models (Ollama / vLLM) are free. Ollama = "ollama:<name>" or bare "<name>:<tag>"
    # with no slash. vLLM = "vllm:<name>".
    for _local_prefix in ("ollama:", "vllm:"):
        if model.startswith(_local_prefix):
            return 0.0
    # Bare "name:tag" with no slash → Ollama local model.
    if "/" not in model and ":" in model:
        return 0.0

    # Strip provider prefix to get the bare model name for pricing lookup.
    lookup = model
    for _prefix in ("groq:", "openrouter:", "nvidia:", "openai:"):
        if lookup.startswith(_prefix):
            lookup = lookup.removeprefix(_prefix)
            break

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

    # Screenshot state — updated each OBSERVE cycle.
    current_screenshot: bytes | None
    screenshot_b64: str | None
    step_screenshots: list[bytes]
