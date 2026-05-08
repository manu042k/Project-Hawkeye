"""Assembles and compiles the Hawkeye agent StateGraph."""
from __future__ import annotations

import functools
from pathlib import Path
from typing import TYPE_CHECKING

from langgraph.graph import END, START, StateGraph

from orchestrator.agent.edges.route_after_act import route_after_act
from orchestrator.agent.edges.route_after_error import route_after_error
from orchestrator.agent.edges.route_after_goal_check import route_after_goal_check
from orchestrator.agent.edges.route_after_reason import route_after_reason
from orchestrator.models.run_state import AgentState

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from orchestrator.assertions.engine import AssertionEngine
    from orchestrator.cdp.session import CdpSession
    from orchestrator.mcp.client import PlaywrightMcpClient
    from orchestrator.tools.tool_registry import ToolRegistry
    from orchestrator.trace.collector import TraceCollector


def build_graph(
    *,
    llm: BaseChatModel,
    mcp_client: PlaywrightMcpClient,
    cdp_session: CdpSession | None,
    tool_registry: ToolRegistry,
    assertion_engine: AssertionEngine,
    collector: TraceCollector,
    mcp_tools: list,
    custom_tools: list,
    model_name: str,
    output_dir: Path,
):
    """Build and compile the agent StateGraph.

    All dependencies are injected here so each node is a pure closure
    with no global state. The compiled graph is reusable across test runs
    of the same configuration.
    """
    from orchestrator.agent.nodes.observe import observe_node
    from orchestrator.agent.nodes.reason import reason_node
    from orchestrator.agent.nodes.act import act_node
    from orchestrator.agent.nodes.goal_check import goal_check_node
    from orchestrator.agent.nodes.error_handler import error_handler_node
    from orchestrator.agent.nodes.finalize import finalize_node

    # Bind runtime dependencies into each node via functools.partial.
    observe = functools.partial(
        observe_node,
        mcp_client=mcp_client,
        cdp_session=cdp_session,
        collector=collector,
    )
    reason = functools.partial(
        reason_node,
        llm=llm,
        mcp_tools=mcp_tools,
        custom_tools=custom_tools,
        collector=collector,
        model_name=model_name,
    )
    act = functools.partial(
        act_node,
        mcp_client=mcp_client,
        cdp_session=cdp_session,
        tool_registry=tool_registry,
        collector=collector,
    )
    error_handler = functools.partial(
        error_handler_node,
        mcp_client=mcp_client,
    )
    finalize = functools.partial(
        finalize_node,
        assertion_engine=assertion_engine,
        cdp_session=cdp_session,
        collector=collector,
        output_dir=output_dir,
    )

    builder = StateGraph(AgentState)

    builder.add_node("observe",        observe)
    builder.add_node("reason",         reason)
    builder.add_node("act",            act)
    builder.add_node("goal_check",     goal_check_node)
    builder.add_node("error_handler",  error_handler)
    builder.add_node("finalize",       finalize)

    builder.add_edge(START, "observe")
    builder.add_edge("observe", "reason")

    builder.add_conditional_edges(
        "reason",
        route_after_reason,
        {"act": "act", "goal_check": "goal_check", "error": "error_handler"},
    )
    builder.add_conditional_edges(
        "act",
        route_after_act,
        {"goal_check": "goal_check", "error": "error_handler"},
    )
    builder.add_conditional_edges(
        "goal_check",
        route_after_goal_check,
        {"finalize": "finalize", "observe": "observe"},
    )
    builder.add_conditional_edges(
        "error_handler",
        route_after_error,
        {"observe": "observe", "finalize": "finalize"},
    )
    builder.add_edge("finalize", END)

    return builder.compile()
