"""JSON Schema definitions for all custom orchestrator tools.

These are passed to the LLM alongside Playwright MCP tool schemas so the
agent can call them. The REASON node merges MCP schemas + these schemas.
"""
from __future__ import annotations

from typing import Any


WAIT_FOR_STABLE_SCHEMA: dict[str, Any] = {
    "name": "wait_for_stable",
    "description": (
        "Wait until the page is stable and ready for interaction. "
        "Call this after navigation or after clicking something that triggers "
        "a page load or dynamic content update. Returns when network is idle "
        "and DOM mutations have settled."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "timeout_ms": {
                "type": "integer",
                "description": "Maximum wait time in milliseconds. Default: 8000.",
                "default": 8000,
            }
        },
        "required": [],
    },
}

ASSERT_TEXT_PRESENT_SCHEMA: dict[str, Any] = {
    "name": "assert_text_present",
    "description": (
        "Assert that specific text or a regex pattern exists on the current page. "
        "Provide either 'text' (exact substring) or 'pattern' (regex), not both. "
        "Returns a pass/fail result."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "text": {
                "type": "string",
                "description": "Exact text substring to search for in the page.",
            },
            "pattern": {
                "type": "string",
                "description": "Python regex pattern to search for in the page.",
            },
            "case_sensitive": {
                "type": "boolean",
                "description": "Whether the match is case-sensitive. Default: true.",
                "default": True,
            },
        },
        "required": [],
    },
}

GET_CONSOLE_ERRORS_SCHEMA: dict[str, Any] = {
    "name": "get_console_errors",
    "description": (
        "Retrieve browser console errors or warnings captured since the test started. "
        "Use to check for JavaScript errors that may indicate a broken page."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "level": {
                "type": "string",
                "enum": ["error", "warning", "all"],
                "description": "Which console levels to return. Default: 'error'.",
                "default": "error",
            },
            "ignore_patterns": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Substrings to exclude from results (e.g. 'favicon', 'analytics').",
            },
        },
        "required": [],
    },
}

REPORT_STEP_RESULT_SCHEMA: dict[str, Any] = {
    "name": "report_step_result",
    "description": (
        "Log the outcome of a test step or assertion. "
        "Call this to record that a checkpoint has passed or failed before "
        "signalling <GOAL_COMPLETE> or <GOAL_BLOCKED>."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "step_id": {
                "type": "string",
                "description": "The step or assertion ID (e.g. 'S1', 'A2').",
            },
            "status": {
                "type": "string",
                "enum": ["passed", "failed", "blocked"],
                "description": "Outcome of the step.",
            },
            "summary": {
                "type": "string",
                "description": "One-sentence description of what happened.",
            },
        },
        "required": ["step_id", "status", "summary"],
    },
}

GET_NETWORK_LOG_SCHEMA: dict[str, Any] = {
    "name": "get_network_log",
    "description": "Return buffered HTTP/XHR network requests captured since the test started. Filter by URL pattern, method, or status code range.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url_pattern": {"type": "string", "description": "Substring or glob pattern to match request URLs."},
            "method": {"type": "string", "description": "HTTP method filter (GET, POST, etc.)"},
            "status_gte": {"type": "integer", "description": "Minimum HTTP status code."},
            "status_lte": {"type": "integer", "description": "Maximum HTTP status code."},
            "limit": {"type": "integer", "description": "Max requests to return (default 50)."},
        },
    },
}

ASSERT_NETWORK_REQUEST_SCHEMA: dict[str, Any] = {
    "name": "assert_network_request",
    "description": "Assert that a network request matching url_pattern was made during the test. Optionally filter by method and expected HTTP status.",
    "input_schema": {
        "type": "object",
        "properties": {
            "url_pattern": {"type": "string", "description": "URL substring or glob pattern to match."},
            "method": {"type": "string", "description": "Expected HTTP method."},
            "expected_status": {"type": "integer", "description": "Expected HTTP status code."},
            "min_count": {"type": "integer", "description": "Minimum number of matching requests required (default 1)."},
        },
        "required": ["url_pattern"],
    },
}

ASSERT_ELEMENT_STATE_SCHEMA: dict[str, Any] = {
    "name": "assert_element_state",
    "description": "Assert the state of a DOM element using a CSS selector. Checks: visible, enabled, checked, text_equals, value_equals.",
    "input_schema": {
        "type": "object",
        "properties": {
            "selector": {"type": "string", "description": "CSS selector for the element."},
            "check": {"type": "string", "description": "Check type: visible | enabled | checked | text_equals | value_equals"},
            "expected": {"type": "string", "description": "Expected value for text_equals and value_equals checks."},
        },
        "required": ["selector", "check"],
    },
}

SCROLL_PAGE_SCHEMA: dict[str, Any] = {
    "name": "scroll_page",
    "description": (
        "Scroll the current page smoothly in one tool call instead of pressing PageDown "
        "multiple times. Use this for reading long articles, finding content below the fold, "
        "or completing scroll-based test steps. Returns scroll position and whether the "
        "bottom of the page has been reached."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "direction": {
                "type": "string",
                "enum": ["down", "up", "top", "bottom"],
                "description": (
                    "'down' scroll down, 'up' scroll up, "
                    "'top' jump to page top, 'bottom' jump to page bottom."
                ),
                "default": "down",
            },
            "times": {
                "type": "integer",
                "description": "Number of viewport heights to scroll (default 1, max 10). Ignored for 'top'/'bottom'.",
                "default": 1,
                "minimum": 1,
                "maximum": 10,
            },
        },
        "required": [],
    },
}

# All custom tool schemas in one list — used by the REASON node.
ALL_CUSTOM_SCHEMAS: list[dict[str, Any]] = [
    WAIT_FOR_STABLE_SCHEMA,
    ASSERT_TEXT_PRESENT_SCHEMA,
    GET_CONSOLE_ERRORS_SCHEMA,
    REPORT_STEP_RESULT_SCHEMA,
    GET_NETWORK_LOG_SCHEMA,
    ASSERT_NETWORK_REQUEST_SCHEMA,
    ASSERT_ELEMENT_STATE_SCHEMA,
    SCROLL_PAGE_SCHEMA,
]
