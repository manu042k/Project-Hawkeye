"""Multi-signal page readiness detection."""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from orchestrator.cdp.session import CdpSession

logger = logging.getLogger(__name__)

_MUTATION_OBSERVER_JS = """
(function() {
  if (window.__hawkeyeMutationCount === undefined) {
    window.__hawkeyeMutationCount = 0;
    window.__hawkeyeMutationObserver = new MutationObserver(function(mutations) {
      window.__hawkeyeMutationCount += mutations.length;
    });
    window.__hawkeyeMutationObserver.observe(document.body || document.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true
    });
  }
  return window.__hawkeyeMutationCount;
})()
""".strip()

_GET_MUTATION_COUNT_JS = "window.__hawkeyeMutationCount || 0"


@dataclass
class WaitForStableResult:
    stable: bool
    wait_duration_ms: int
    signals: dict = field(default_factory=dict)  # {"network": bool, "dom": bool}


async def wait_for_stable(
    *,
    cdp_session: CdpSession,
    page_type: str = "spa",
    timeout_ms: int = 8000,
    network_idle_ms: int = 300,
    dom_settle_ms: int = 500,
) -> WaitForStableResult:
    """Wait until the page is stable enough for reliable interaction.

    Phase 1 implements two signals:
    1. Network quiescence: zero in-flight XHR/fetch for ``network_idle_ms`` ms.
    2. DOM mutation rate: injection of a MutationObserver that counts changes.
       Stable when the count doesn't increase for ``dom_settle_ms`` ms.

    page_type overrides:
    - ``static``: returns immediately after 200ms (no dynamic content).
    - ``ssr``:     network quiescence only (DOM is server-rendered, stable on load).
    - ``spa``:     both signals.
    - ``streaming``: DOM settle threshold is relaxed (accepts up to 20 mutations/s).

    Always returns — never raises. Returns ``stable=False`` on timeout.
    """
    start = time.monotonic()
    signals: dict[str, bool] = {"network": False, "dom": False}

    if page_type == "static":
        await asyncio.sleep(0.2)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        return WaitForStableResult(stable=True, wait_duration_ms=elapsed_ms, signals={"network": True, "dom": True})

    deadline = start + timeout_ms / 1000
    check_interval = 0.1  # 100ms polling interval

    # --- Network quiescence ---
    if page_type != "streaming":  # streaming skips network signal
        try:
            idle_start: float | None = None
            while time.monotonic() < deadline:
                if cdp_session.pending_request_count == 0:
                    if idle_start is None:
                        idle_start = time.monotonic()
                    elif (time.monotonic() - idle_start) * 1000 >= network_idle_ms:
                        signals["network"] = True
                        break
                else:
                    idle_start = None
                await asyncio.sleep(check_interval)
        except Exception as exc:
            logger.debug("wait_for_stable: network signal error: %s", exc)
        # If we hit deadline without network idle, mark False but continue
        if not signals["network"]:
            logger.debug("wait_for_stable: network did not quiesce within %dms", timeout_ms)
    else:
        signals["network"] = True  # streaming: skip network signal

    # --- DOM mutation settle (spa and streaming) ---
    if page_type in ("spa", "streaming"):
        try:
            # Inject the mutation observer (idempotent)
            await cdp_session.evaluate_js(_MUTATION_OBSERVER_JS, timeout_ms=3000)
            mutation_threshold = 20 if page_type == "streaming" else 3

            last_count = await cdp_session.evaluate_js(_GET_MUTATION_COUNT_JS, timeout_ms=2000) or 0
            settle_start: float | None = None

            while time.monotonic() < deadline:
                await asyncio.sleep(check_interval)
                current = await cdp_session.evaluate_js(_GET_MUTATION_COUNT_JS, timeout_ms=2000) or 0
                delta = current - last_count
                last_count = current

                rate_per_s = delta / check_interval
                if rate_per_s < mutation_threshold:
                    if settle_start is None:
                        settle_start = time.monotonic()
                    elif (time.monotonic() - settle_start) * 1000 >= dom_settle_ms:
                        signals["dom"] = True
                        break
                else:
                    settle_start = None
        except Exception as exc:
            logger.debug("wait_for_stable: DOM signal error (fallback 300ms): %s", exc)
            # Graceful fallback: fixed 300ms wait when CDP Runtime unavailable
            await asyncio.sleep(0.3)
            signals["dom"] = True
    else:
        # ssr: DOM is server-rendered, mark as stable
        signals["dom"] = True

    elapsed_ms = int((time.monotonic() - start) * 1000)
    stable = signals["network"] and signals["dom"]
    if not stable:
        logger.debug(
            "wait_for_stable: timeout after %dms (network=%s, dom=%s)",
            elapsed_ms, signals["network"], signals["dom"],
        )
    return WaitForStableResult(stable=stable, wait_duration_ms=elapsed_ms, signals=signals)
