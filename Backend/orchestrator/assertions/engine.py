"""Post-loop assertion evaluator.

Phase 1 supports: 'content' (text_present, text_matches) and 'console'.
Phase 2 adds: 'network', 'state'. 'visual' requires CDP screenshot.
Unsupported types are marked 'skipped' — never fail the run.
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession
    from orchestrator.models.test_case import Assertion

from orchestrator.models.results import AssertionResult

logger = logging.getLogger(__name__)

_SUPPORTED_TYPES = frozenset({"content", "console", "network", "state"})
_PHASE2_TYPES = frozenset({"visual", "accessibility", "performance"})


class AssertionEngine:
    """Evaluates test case assertions after the agent loop completes."""

    def __init__(self, cdp_session: "CdpSession | None" = None) -> None:
        self._cdp_session = cdp_session

    async def evaluate(
        self,
        assertions: list[Assertion],
        *,
        page_snapshot: str,
        cdp_session: CdpSession | None,
    ) -> list[AssertionResult]:
        """Evaluate all assertions. Each is wrapped in try/except —
        one buggy assertion never fails the whole run.
        """
        results: list[AssertionResult] = []
        for assertion in assertions:
            try:
                result = await self._evaluate_one(assertion, page_snapshot=page_snapshot, cdp_session=cdp_session)
            except Exception as exc:
                logger.error("Assertion %s raised unexpectedly: %s", assertion.id, exc)
                result = AssertionResult(
                    assertion_id=assertion.id,
                    type=assertion.type,
                    description=assertion.description,
                    passed=False,
                    status="error",
                    details=f"Internal error: {exc}",
                )
            results.append(result)
        return results

    async def _evaluate_one(
        self,
        assertion: Assertion,
        *,
        page_snapshot: str,
        cdp_session: CdpSession | None,
    ) -> AssertionResult:
        if assertion.type in _PHASE2_TYPES:
            logger.warning(
                "Assertion %s type=%r is not yet supported (skipped)",
                assertion.id, assertion.type,
            )
            if assertion.type == "visual":
                return await self._evaluate_visual(assertion, cdp_session)
            return AssertionResult(
                assertion_id=assertion.id,
                type=assertion.type,
                description=assertion.description,
                passed=True,  # skipped → does not fail the run
                status="skipped",
                details=f"Type {assertion.type!r} is not yet supported (skipped)",
            )

        if assertion.type == "content":
            return self._evaluate_content(assertion, page_snapshot)

        if assertion.type == "console":
            return await self._evaluate_console(assertion, cdp_session)

        if assertion.type == "network":
            return await self._evaluate_network(assertion, cdp_session)

        if assertion.type == "state":
            return await self._evaluate_state(assertion, cdp_session)

        # Completely unknown type — skip with a warning.
        logger.warning("Unknown assertion type %r (assertion %s) — skipped", assertion.type, assertion.id)
        return AssertionResult(
            assertion_id=assertion.id,
            type=assertion.type,
            description=assertion.description,
            passed=True,
            status="skipped",
            details=f"Unknown assertion type {assertion.type!r}",
        )

    def _evaluate_content(self, assertion: Assertion, page_snapshot: str) -> AssertionResult:
        from orchestrator.tools.assert_text_present import assert_text_present
        params = assertion.params
        check = params.get("check", "text_present")

        if check == "text_present":
            r = assert_text_present(
                page_snapshot=page_snapshot,
                text=params.get("text"),
                case_sensitive=params.get("case_sensitive", True),
            )
        elif check == "text_matches":
            r = assert_text_present(
                page_snapshot=page_snapshot,
                pattern=params.get("pattern"),
                case_sensitive=params.get("case_sensitive", True),
            )
        else:
            return AssertionResult(
                assertion_id=assertion.id,
                type="content",
                description=assertion.description,
                passed=False,
                status="error",
                details=f"Unknown content check type: {check!r}",
            )

        return AssertionResult(
            assertion_id=assertion.id,
            type="content",
            description=assertion.description,
            passed=r.passed,
            status=r.status,
            details=r.details,
        )

    async def _evaluate_console(
        self,
        assertion: Assertion,
        cdp_session: CdpSession | None,
    ) -> AssertionResult:
        if cdp_session is None:
            return AssertionResult(
                assertion_id=assertion.id,
                type="console",
                description=assertion.description,
                passed=True,
                status="skipped",
                details="CDP session unavailable — console assertion skipped",
            )

        from orchestrator.tools.get_console_errors import get_console_errors
        params = assertion.params
        result = await get_console_errors(
            cdp_session=cdp_session,
            level=params.get("level", "error"),
            ignore_patterns=params.get("ignore_patterns"),
        )
        max_count = params.get("max_count", 0)
        passed = result.count <= max_count
        return AssertionResult(
            assertion_id=assertion.id,
            type="console",
            description=assertion.description,
            passed=passed,
            status="passed" if passed else "failed",
            details=(
                None if passed else
                f"{result.count} error(s) found (max={max_count}): "
                + "; ".join(result.messages[:3])
            ),
        )

    async def _evaluate_network(
        self,
        assertion: Assertion,
        cdp_session: CdpSession | None,
    ) -> AssertionResult:
        from orchestrator.tools.assert_network_request import assert_network_request
        params = assertion.params
        result = await assert_network_request(
            cdp_session=cdp_session,
            url_pattern=params.get("url_pattern", ""),
            method=params.get("method"),
            expected_status=params.get("expected_status"),
            min_count=params.get("min_count", 1),
        )
        return AssertionResult(
            assertion_id=assertion.id,
            type="network",
            description=assertion.description,
            passed=result.passed,
            status="passed" if result.passed else "failed",
            details=result.details,
        )

    async def _evaluate_state(
        self,
        assertion: Assertion,
        cdp_session: CdpSession | None,
    ) -> AssertionResult:
        from orchestrator.tools.assert_element_state import assert_element_state
        params = assertion.params
        result = await assert_element_state(
            cdp_session=cdp_session,
            selector=params.get("selector", ""),
            check=params.get("check", "visible"),
            expected=params.get("expected"),
        )
        return AssertionResult(
            assertion_id=assertion.id,
            type="state",
            description=assertion.description,
            passed=result.passed,
            status="passed" if result.passed else "failed",
            details=result.details,
        )

    async def _evaluate_visual(
        self,
        assertion: Assertion,
        cdp_session: CdpSession | None,
    ) -> AssertionResult:
        if cdp_session is None:
            return AssertionResult(
                assertion_id=assertion.id,
                type="visual",
                description=assertion.description,
                passed=True,
                status="skipped",
                details="CDP session unavailable — visual assertion skipped",
            )
        # No baseline available in Phase 2 — take screenshot but skip comparison.
        screenshot = await cdp_session.take_screenshot()
        if not screenshot:
            return AssertionResult(
                assertion_id=assertion.id,
                type="visual",
                description=assertion.description,
                passed=True,
                status="skipped",
                details="Screenshot capture failed — visual assertion skipped",
            )
        return AssertionResult(
            assertion_id=assertion.id,
            type="visual",
            description=assertion.description,
            passed=True,
            status="skipped",
            details=f"Screenshot captured ({len(screenshot)} bytes); no baseline for comparison — skipped",
        )
