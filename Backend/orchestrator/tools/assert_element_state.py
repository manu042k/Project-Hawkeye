"""Tool: assert_element_state — checks a DOM element's state via CDP JS evaluation."""
from __future__ import annotations
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession

_JS_CHECKS = {
    "visible": """
        (function(sel){
            var el = document.querySelector(sel);
            if (!el) return "not_found";
            var r = el.getBoundingClientRect();
            var style = window.getComputedStyle(el);
            return (r.width > 0 && r.height > 0 && style.visibility !== "hidden"
                    && style.display !== "none") ? "visible" : "hidden";
        })("{selector}")
    """,
    "enabled": """
        (function(sel){
            var el = document.querySelector(sel);
            if (!el) return "not_found";
            return el.disabled ? "disabled" : "enabled";
        })("{selector}")
    """,
    "checked": """
        (function(sel){
            var el = document.querySelector(sel);
            if (!el) return "not_found";
            return el.checked ? "checked" : "unchecked";
        })("{selector}")
    """,
    "text_equals": """
        (function(sel, exp){
            var el = document.querySelector(sel);
            if (!el) return "not_found";
            return (el.textContent.trim() === exp) ? "match" : "no_match:" + el.textContent.trim().slice(0,80);
        })("{selector}", "{expected}")
    """,
    "value_equals": """
        (function(sel, exp){
            var el = document.querySelector(sel);
            if (!el) return "not_found";
            return (el.value === exp) ? "match" : "no_match:" + (el.value||"").slice(0,80);
        })("{selector}", "{expected}")
    """,
}


@dataclass
class AssertElementResult:
    passed: bool
    details: str


async def assert_element_state(
    *,
    cdp_session: "CdpSession | None",
    selector: str,
    check: str,
    expected: str | None = None,
) -> AssertElementResult:
    if cdp_session is None:
        return AssertElementResult(passed=False, details="CDP session not available")
    if check not in _JS_CHECKS:
        return AssertElementResult(passed=False, details=f"Unknown check type '{check}'")

    js = _JS_CHECKS[check].replace("{selector}", selector.replace('"', '\\"'))
    if expected:
        js = js.replace("{expected}", expected.replace('"', '\\"'))

    try:
        result = await cdp_session.evaluate_js(js.strip())
    except Exception as exc:
        return AssertElementResult(passed=False, details=f"JS evaluation failed: {exc}")

    result_str = str(result or "")
    expected_value = {
        "visible": "visible", "enabled": "enabled",
        "checked": "checked", "text_equals": "match", "value_equals": "match",
    }[check]
    passed = result_str == expected_value
    detail = f"Selector '{selector}' check='{check}': got '{result_str}' (expected '{expected_value}')"
    return AssertElementResult(passed=passed, details=detail)
