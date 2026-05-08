"""Converts MCP tool schemas into LangChain StructuredTools."""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import StructuredTool

from orchestrator.mcp.client import McpToolSchema, PlaywrightMcpClient

logger = logging.getLogger(__name__)

# Tools exposed to the LLM. Others are available in the MCP server but
# hidden to keep the tool list lean and reduce the system prompt size.
# Confirmed present in @playwright/mcp@latest (verified via list-tools warning log).
# Removed: browser_scroll, browser_screenshot, browser_go_back,
#           browser_tab_new, browser_tab_close, browser_tab_list
DEFAULT_ALLOWLIST: frozenset[str] = frozenset({
    "browser_navigate",
    "browser_click",
    "browser_type",
    "browser_snapshot",
    "browser_press_key",
    "browser_wait_for",
    "browser_hover",
    "browser_select_option",
})


def mcp_tools_to_langchain(
    client: PlaywrightMcpClient,
    mcp_schemas: list[McpToolSchema],
    *,
    allowlist: frozenset[str] | set[str] | None = None,
) -> list[StructuredTool]:
    """Wrap each MCP tool schema as a LangChain StructuredTool.

    The tool function is an async coroutine that calls client.call_tool().
    If ``allowlist`` is provided, only tools whose names are in the set are
    included. Defaults to DEFAULT_ALLOWLIST.
    """
    effective_allowlist = DEFAULT_ALLOWLIST if allowlist is None else allowlist

    available_names = {schema.name for schema in mcp_schemas}
    missing_from_mcp = sorted(effective_allowlist - available_names)
    hidden_from_llm = sorted(available_names - effective_allowlist)
    if missing_from_mcp:
        logger.warning(
            "Allowlisted tools NOT available in MCP server (update DEFAULT_ALLOWLIST): %s",
            missing_from_mcp,
        )
    if hidden_from_llm:
        logger.debug(
            "MCP tools hidden from LLM by allowlist: %s",
            hidden_from_llm,
        )

    tools: list[StructuredTool] = []
    for schema in mcp_schemas:
        if schema.name not in effective_allowlist:
            continue
        tools.append(_make_tool(client, schema))

    logger.info(
        "Built %d LangChain tools from %d MCP schemas (allowlist=%d, missing=%d)",
        len(tools), len(mcp_schemas), len(effective_allowlist), len(missing_from_mcp),
    )
    return tools


def _make_tool(client: PlaywrightMcpClient, schema: McpToolSchema) -> StructuredTool:
    """Build one StructuredTool that proxies calls through the MCP client."""
    tool_name = schema.name
    tool_description = schema.description or tool_name
    input_schema = schema.input_schema or {"type": "object", "properties": {}}

    # Build a Pydantic model class from the JSON Schema so LangChain can
    # validate and serialize arguments.
    args_schema = _json_schema_to_pydantic(tool_name, input_schema)

    async def _run(**kwargs: Any) -> str:
        result = await client.call_tool(tool_name, kwargs)
        if result.is_error:
            return f"[ERROR] {result.error_message or result.content}"
        return result.content or "(no output)"

    return StructuredTool(
        name=tool_name,
        description=tool_description,
        args_schema=args_schema,
        coroutine=_run,
    )


def _json_schema_to_pydantic(tool_name: str, schema: dict) -> type:
    """Dynamically build a Pydantic BaseModel class from a JSON Schema dict.

    Only handles flat object schemas (no nested $ref resolution) which covers
    all Playwright MCP tool inputs in practice.
    """
    from pydantic import BaseModel, Field, create_model
    from typing import Any, Optional

    properties = schema.get("properties", {})
    required_fields = set(schema.get("required", []))

    field_definitions: dict[str, Any] = {}
    for prop_name, prop_schema in properties.items():
        python_type = _json_type_to_python(prop_schema)
        if prop_name in required_fields:
            field_definitions[prop_name] = (python_type, Field(description=prop_schema.get("description", "")))
        else:
            field_definitions[prop_name] = (Optional[python_type], Field(default=None, description=prop_schema.get("description", "")))

    if not field_definitions:
        # Tool takes no arguments — create an empty model.
        field_definitions["__dummy__"] = (Optional[str], Field(default=None, exclude=True))

    model_name = "".join(w.capitalize() for w in tool_name.split("_")) + "Args"
    return create_model(model_name, **field_definitions)  # type: ignore[call-overload]


def _json_type_to_python(schema: dict) -> type:
    """Map a JSON Schema type string to a Python type annotation."""
    t = schema.get("type", "string")
    if t == "string":
        return str
    if t == "integer":
        return int
    if t == "number":
        return float
    if t == "boolean":
        return bool
    if t == "array":
        return list
    if t == "object":
        return dict
    return Any
