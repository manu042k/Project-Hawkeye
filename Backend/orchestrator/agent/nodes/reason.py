"""REASON node — calls the LLM with the merged tool list and page state."""
from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from orchestrator.mcp.client import McpToolSchema, PlaywrightMcpClient
    from orchestrator.models.run_state import AgentState, ErrorInfo
    from orchestrator.trace.collector import TraceCollector

logger = logging.getLogger(__name__)

_BACKOFF_DELAYS = [2.0, 4.0, 8.0]         # standard 429/500/503 retries (Groq)
_SOFT_RATE_LIMIT_DELAYS = [15.0, 30.0, 60.0]  # upstream congestion (OpenRouter free tier)
# Context limits tuned for 8K-token models on Groq free tier.
# Increase CONTEXT_CHAR_LIMIT for models with larger context windows (e.g. llama 128K).
_CONTEXT_CHAR_LIMIT = 24_000   # ~6K tokens; trim history above this
_KEEP_TAIL_PAIRS = 3           # keep last 3 turn-pairs after trimming
_MAX_SNAPSHOT_CHARS = 6_000    # ~2K tokens; fits within 6K TPM budget with system+tools overhead


async def reason_node(
    state: AgentState,
    *,
    llm: BaseChatModel,
    mcp_tools: list,           # list[StructuredTool] from MCP
    custom_tools: list,        # list[StructuredTool] for custom tools
    collector: TraceCollector,
    model_name: str,
) -> dict:
    """REASON: invoke the LLM with the full tool list and current page state.

    Injects the current page snapshot as a HumanMessage observation before
    calling the LLM. Handles rate limits with exponential backoff.
    Returns partial state dict. Never raises.
    """
    from orchestrator.models.run_state import ErrorInfo, compute_step_cost

    all_tools = mcp_tools + custom_tools
    messages = list(state["messages"])

    # Inject current page state as the latest user observation.
    observation = _build_observation(state)
    messages = messages + [HumanMessage(content=observation)]

    # Context window management: trim history if too long.
    total_chars = sum(len(str(m.content)) for m in messages)
    if total_chars > _CONTEXT_CHAR_LIMIT:
        messages = _trim_messages(messages, _KEEP_TAIL_PAIRS)
        logger.info(
            "Context trimmed: %d chars -> %d chars",
            total_chars, sum(len(str(m.content)) for m in messages),
        )

    # Bind tools to the LLM.
    llm_with_tools = llm.bind_tools(all_tools) if all_tools else llm

    # Invoke with retry for rate limits.
    start_ms = time.monotonic()
    ai_message: AIMessage | None = None
    last_error: ErrorInfo | None = None

    _delays: list[float] = [0.0] + _BACKOFF_DELAYS
    attempt = 0
    while attempt < len(_delays):
        delay = _delays[attempt]
        if delay > 0:
            logger.info("REASON: rate-limit backoff %.1fs (attempt %d)", delay, attempt)
            await asyncio.sleep(delay)
        try:
            # Use ainvoke() — both ChatOllama and ChatOpenAI support async.
            response = await llm_with_tools.ainvoke(messages)
            ai_message = response
            break
        except Exception as exc:
            exc_str = str(exc)
            attempt += 1
            logger.warning("REASON: LLM call attempt %d failed: %s", attempt + 1, exc_str[:200])

            # Connection failures are fatal — no point retrying if Ollama/Groq is unreachable.
            if any(k in exc_str.lower() for k in (
                "connection attempts failed", "connection refused", "connection error",
                "connecterror", "no route to host", "name or service not known",
                "failed to connect",
            )):
                logger.error("REASON: LLM connection failed — terminating: %s", exc_str)
                return {
                    "status": "errored",
                    "goal_complete": True,
                    "termination_reason": f"LLM unreachable: {exc_str[:200]}",
                    "last_error": ErrorInfo(
                        error_type="llm_auth_error",
                        message=exc_str[:200],
                        step_number=state["step_number"],
                        recoverable=False,
                    ),
                }

            # Auth / access errors: do not retry.
            if any(k in exc_str.lower() for k in ("401", "403", "unauthorized", "invalid api key", "blocked at", "forbidden", "not allowed", "access denied")):
                logger.error("REASON: auth/access error — terminating: %s", exc_str)
                return {
                    "status": "errored",
                    "goal_complete": True,
                    "termination_reason": f"LLM access error: {exc_str[:200]}",
                    "last_error": ErrorInfo(
                        error_type="llm_auth_error",
                        message=exc_str[:200],
                        step_number=state["step_number"],
                        recoverable=False,
                    ),
                }
            if any(k in exc_str.lower() for k in ("401", "unauthorized", "invalid api key")):  # kept for clarity
                logger.error("REASON: LLM auth error — terminating: %s", exc_str)
                return {
                    "status": "errored",
                    "goal_complete": True,
                    "termination_reason": f"LLM auth error: {exc_str[:200]}",
                    "last_error": ErrorInfo(
                        error_type="llm_auth_error",
                        message=exc_str[:200],
                        step_number=state["step_number"],
                        recoverable=False,
                    ),
                }

            # Context window overflow (413): trim aggressively and retry once.
            if "413" in exc_str or "too large" in exc_str.lower() or "reduce the length" in exc_str.lower():
                if attempt == 0 and len(messages) > 4:
                    # Emergency trim: keep only system prompt + last 1 pair
                    messages = _trim_messages(messages, 1)
                    logger.warning("REASON: 413 context overflow — emergency trim to 1 pair, retrying")
                    continue
                last_error = ErrorInfo(
                    error_type="llm_auth_error",  # non-recoverable: not a transient error
                    message=f"Context window exceeded (413): {exc_str[:200]}",
                    step_number=state["step_number"],
                    recoverable=False,
                )
                break

            # Upstream congestion on free-tier models (OpenRouter).
            # Switch to longer delays and keep retrying.
            if "temporarily rate-limited" in exc_str.lower() or "please retry shortly" in exc_str.lower():
                if _delays == [0.0] + _BACKOFF_DELAYS:
                    _delays = [0.0] + _SOFT_RATE_LIMIT_DELAYS
                    attempt = 1  # restart with new delay schedule
                last_error = ErrorInfo(
                    error_type="llm_rate_limit",
                    message=exc_str[:200],
                    step_number=state["step_number"],
                    recoverable=True,
                )
                if attempt < len(_delays):
                    continue

            # Daily/account hard rate limit: no point retrying.
            if "tokens per day" in exc_str.lower() or ("tpd" in exc_str.lower() and "429" in exc_str):
                last_error = ErrorInfo(
                    error_type="llm_rate_limit",
                    message=exc_str[:200],
                    step_number=state["step_number"],
                    recoverable=False,
                )
                break

            # Standard rate limit or server errors: retry with short backoff.
            if any(k in exc_str for k in ("429", "500", "503", "rate", "overloaded")):
                last_error = ErrorInfo(
                    error_type="llm_rate_limit",
                    message=exc_str[:200],
                    step_number=state["step_number"],
                    recoverable=True,
                )
                if attempt < len(_delays):
                    continue

            # Other errors — treat as recoverable for one retry, then give up.
            last_error = ErrorInfo(
                error_type="llm_rate_limit",
                message=exc_str[:200],
                step_number=state["step_number"],
                recoverable=attempt < len(_delays),
            )
            break

    if ai_message is None:
        if last_error:
            logger.error("REASON: LLM failed (recoverable=%s): %s", last_error.recoverable, last_error.message)
            collector.on_error(
                error_type=last_error.error_type,
                message=last_error.message,
                recoverable=last_error.recoverable,
            )
        return {
            "last_error": last_error,
            "error_history": state.get("error_history", []) + ([last_error] if last_error else []),
        }

    # Extract usage metadata. LangChain providers use different attribute names:
    # - ChatOllama / most providers: AIMessage.usage_metadata (dataclass or dict)
    # - langchain-openai (Groq): AIMessage.response_metadata["token_usage"]
    usage = {}
    if hasattr(ai_message, "usage_metadata") and ai_message.usage_metadata:
        meta = ai_message.usage_metadata
        if isinstance(meta, dict):
            usage = {
                "input_tokens": meta.get("input_tokens", 0),
                "output_tokens": meta.get("output_tokens", 0),
            }
        else:
            usage = {
                "input_tokens": getattr(meta, "input_tokens", 0),
                "output_tokens": getattr(meta, "output_tokens", 0),
            }
    if not any(usage.values()) and hasattr(ai_message, "response_metadata"):
        token_usage = (ai_message.response_metadata or {}).get("token_usage", {})
        if token_usage:
            usage = {
                "input_tokens": token_usage.get("prompt_tokens", 0),
                "output_tokens": token_usage.get("completion_tokens", 0),
            }

    latency_ms = int((time.monotonic() - start_ms) * 1000)
    cost = compute_step_cost(model_name, usage)

    stop_reason = "tool_use" if ai_message.tool_calls else "end_turn"

    # Extract any text content the agent produced.
    agent_text: str | None = None
    if isinstance(ai_message.content, str):
        agent_text = ai_message.content or None
    elif isinstance(ai_message.content, list):
        texts = [
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in ai_message.content
            if not isinstance(block, dict) or block.get("type") != "tool_use"
        ]
        agent_text = " ".join(t for t in texts if t) or None

    collector.on_reason(
        model=model_name,
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        latency_ms=latency_ms,
        stop_reason=stop_reason,
        agent_text=agent_text,
        cost_usd=cost,
    )

    return {
        "messages": [HumanMessage(content=observation), ai_message],
        "last_tool_name": None,
        "last_tool_result": None,
        "last_error": None,
    }


def _build_observation(state: AgentState) -> str:
    """Build the user-turn observation message injected before the LLM call."""
    url = state.get("current_url", "(unknown)")
    title = state.get("page_title", "")
    snapshot = state.get("page_snapshot", "")
    step = state.get("step_number", 0)
    checkpoint = state.get("current_checkpoint")
    completed = state.get("completed_checkpoints", [])

    # Truncate very large accessibility trees to avoid LLM context overflow.
    # The first 40K chars capture the above-the-fold content and interactive
    # elements, which is sufficient for navigation decisions.
    if len(snapshot) > _MAX_SNAPSHOT_CHARS:
        snapshot = (
            snapshot[:_MAX_SNAPSHOT_CHARS]
            + f"\n... [accessibility tree truncated: showing first "
            f"{_MAX_SNAPSHOT_CHARS:,} of {len(snapshot):,} chars]"
        )

    parts = [f"[Step {step}] Current page: {url}"]
    if title:
        parts.append(f"Title: {title}")

    # Always show progress summary so the agent remembers its state even after
    # context trimming removes earlier messages.
    tc = state.get("test_case")
    if tc and tc.steps:
        all_checkpoints = [cp.id for cp in tc.steps.checkpoints]
        remaining = [c for c in all_checkpoints if c not in completed]
        if completed:
            parts.append(f"PROGRESS: Completed checkpoints: {', '.join(completed)} of {', '.join(all_checkpoints)}")
        if remaining:
            next_cp = remaining[0]
            # Find the checkpoint description
            cp_desc = next(
                (cp.description for cp in tc.steps.checkpoints if cp.id == next_cp), ""
            )
            parts.append(f"NEXT: [{next_cp}] {cp_desc}")
        elif completed:
            parts.append("ALL CHECKPOINTS DONE — write <GOAL_COMPLETE> now.")
    elif checkpoint and checkpoint not in completed:
        parts.append(f"Active checkpoint: {checkpoint}")

    parts.append(f"\nPage accessibility tree:\n{snapshot}")
    return "\n".join(parts)


def _trim_messages(messages: list, keep_tail_pairs: int) -> list:
    """Trim the message list, keeping the system prompt and the last N tool pairs.

    Structure: [SystemMessage, ...history...]
    After trimming: [SystemMessage, HumanMessage(summary), ...last N pairs...]
    """
    from langchain_core.messages import SystemMessage

    if not messages:
        return messages

    system = [m for m in messages if isinstance(m, SystemMessage)]
    rest = [m for m in messages if not isinstance(m, SystemMessage)]

    # Keep last N*2 messages (pairs: human/ai or ai/tool)
    tail = rest[-(keep_tail_pairs * 2):] if len(rest) > keep_tail_pairs * 2 else rest

    summary = HumanMessage(
        content=(
            f"[Context trimmed — {len(rest) - len(tail)} earlier messages omitted to fit context window.]"
        )
    )
    return system + [summary] + tail
