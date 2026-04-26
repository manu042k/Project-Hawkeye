from __future__ import annotations

import dataclasses
import json
import subprocess
import time
import uuid
from typing import Any

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from Backend.hawkeye_sandbox.sandbox import SandboxConfig, SandboxManager

from ..models.schemas import (
    AgentAction,
    AssertionResult,
    JsonAssertion,
    JsonRunInput,
    RunSummary,
    StepEvent,
    TestCaseResult,
)
from ..storage.artifacts import write_artifacts
from ..utils.redaction import redact_dict
from .ollama_runtime import OllamaRuntime


@dataclasses.dataclass
class AgentRunConfig:
    objective: str
    start_url: str
    model: str = "qwen2.5:7b"
    max_steps: int = 12
    output_dir: str = "artifacts/agent-runs"
    browser: str = "chromium"
    width: int = 1366
    height: int = 768
    image: str = "project-hawkeye-hawkeye-sandbox:latest"
    startup_wait_seconds: float = 5.0
    post_run_wait_seconds: float = 0.0


class AgentService:
    def __init__(self, ollama_host: str = "http://127.0.0.1:11434") -> None:
        self.ollama_host = ollama_host

    def run_from_json(
        self,
        json_path: str,
        *,
        output_dir: str = "artifacts/agent-runs",
        image: str = "project-hawkeye-hawkeye-sandbox:latest",
        startup_wait_seconds: float = 5.0,
        post_run_wait_seconds: float = 0.0,
    ) -> RunSummary:
        payload = JsonRunInput.model_validate(json.loads(open(json_path, "r", encoding="utf-8").read()))
        viewport = payload.viewport
        width = viewport.width if viewport else 1366
        height = viewport.height if viewport else 768

        cfg = AgentRunConfig(
            objective="json_test_plan_execution",
            start_url=payload.url_to_test,
            output_dir=output_dir,
            browser=payload.browser,
            width=width,
            height=height,
            image=image,
            startup_wait_seconds=startup_wait_seconds,
            post_run_wait_seconds=post_run_wait_seconds,
        )
        return self._run_test_cases(cfg, payload)

    def run(self, cfg: AgentRunConfig) -> RunSummary:
        payload = JsonRunInput(
            url_to_test=cfg.start_url,
            browser=cfg.browser,  # type: ignore[arg-type]
            viewport={"width": cfg.width, "height": cfg.height},
            test_cases=[
                {
                    "test_id": "legacy-1",
                    "test_name": cfg.objective,
                    "assertions": [],
                    "actions": [
                        {"type": "navigate", "url": cfg.start_url},
                        {"type": "scroll", "pixels": 800},
                        {"type": "wait", "seconds": 1.5},
                    ],
                    "additional_context": {},
                }
            ],
        )
        return self._run_test_cases(cfg, payload)

    def _run_test_cases(self, cfg: AgentRunConfig, payload: JsonRunInput) -> RunSummary:
        run_id = f"run-{uuid.uuid4().hex[:10]}"
        sandbox_cfg = SandboxConfig(
            url=cfg.start_url,
            browser=cfg.browser,
            width=cfg.width,
            height=cfg.height,
            image=cfg.image,
        )
        mgr = SandboxManager()

        with mgr.managed(sandbox_cfg) as handle:
            print(f"[agent] noVNC stream: {handle.novnc_url}")
            if not handle.cdp_url:
                raise RuntimeError("CDP URL unavailable. Use chromium/chrome/msedge browser for automation.")
            print(f"[agent] CDP endpoint: {handle.cdp_url}")
            print(f"[agent] Open this in your browser to watch live: {handle.novnc_url}")
            if cfg.startup_wait_seconds > 0:
                print(f"[agent] Waiting {cfg.startup_wait_seconds:.1f}s before starting tests...")
                time.sleep(cfg.startup_wait_seconds)
            llm = OllamaRuntime(model=cfg.model, host=self.ollama_host)
            browser_logs: dict[str, list[dict[str, Any]]] = {
                "console": [],
                "page_errors": [],
                "request_failed": [],
                "response_errors": [],
            }
            all_steps: list[StepEvent] = []
            test_results: list[TestCaseResult] = []

            with sync_playwright() as p:
                browser = self._connect_over_cdp_with_retry(p, handle.cdp_url)
                context = browser.contexts[0] if browser.contexts else browser.new_context()
                page = context.pages[0] if context.pages else context.new_page()

                for extra_page in context.pages[1:]:
                    try:
                        extra_page.close()
                    except Exception:
                        pass
                if page.is_closed():
                    page = context.new_page()
                page.goto(cfg.start_url, wait_until="domcontentloaded", timeout=15000)
                page.wait_for_timeout(800)

                page.on(
                    "console",
                    lambda msg: browser_logs["console"].append(
                        {"type": msg.type, "text": msg.text, "location": msg.location}
                    ),
                )
                page.on("pageerror", lambda exc: browser_logs["page_errors"].append({"error": str(exc)}))
                page.on(
                    "requestfailed",
                    lambda req: browser_logs["request_failed"].append({"url": req.url, "method": req.method, "error": req.failure}),
                )
                page.on(
                    "response",
                    lambda res: browser_logs["response_errors"].append(
                        {"url": res.url, "status": res.status, "ok": res.ok}
                    )
                    if res.status >= 400
                    else None,
                )

                def execute(action: AgentAction, test_id: str, test_name: str, step_index: int) -> StepEvent:
                    try:
                        if action.type == "navigate":
                            if not action.url:
                                return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=False, observation="navigate requires url", data={})
                            page.goto(action.url, wait_until="domcontentloaded", timeout=15000)
                            page.wait_for_timeout(700)
                            return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=True, observation=f"navigated to {page.url}", data={"url": page.url})
                        if action.type == "click":
                            if not action.selector:
                                return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=False, observation="click requires selector", data={})
                            page.locator(action.selector).first.click(timeout=8000)
                            page.wait_for_timeout(700)
                            return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=True, observation=f"clicked {action.selector}", data={"url": page.url})
                        if action.type == "type":
                            if not action.selector:
                                return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=False, observation="type requires selector", data={})
                            page.locator(action.selector).first.fill(action.text or "", timeout=8000)
                            page.wait_for_timeout(700)
                            return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=True, observation=f"typed into {action.selector}", data={"url": page.url})
                        if action.type == "scroll":
                            page.mouse.wheel(0, action.pixels)
                            page.wait_for_timeout(700)
                            return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=True, observation=f"scrolled {action.pixels}px", data={"url": page.url})
                        if action.type == "wait":
                            page.wait_for_timeout(int(action.seconds * 1000))
                            return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=True, observation=f"waited {action.seconds:.1f}s", data={"url": page.url})
                        if action.type == "complete":
                            return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=True, observation=action.result or "completed", data={"url": page.url})
                        if action.type == "fail":
                            return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=False, observation=action.result or "failed", data={"url": page.url})
                        return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=False, observation=f"unsupported action {action.type}", data={})
                    except PlaywrightTimeoutError as exc:
                        return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=False, observation=f"timeout: {exc}", data={"url": page.url})
                    except Exception as exc:
                        return StepEvent(step=step_index, test_id=test_id, test_name=test_name, action=action, ok=False, observation=f"error: {exc}", data={"url": page.url})

                total_step = 0
                for test_case in payload.test_cases:
                    case_steps: list[StepEvent] = []
                    status: str = "passed"
                    reason = ""

                    for action_spec in test_case.actions:
                        total_step += 1
                        action = AgentAction.model_validate(action_spec.model_dump())
                        if action.instruction and not action.selector and action.type in ("click", "type"):
                            action = llm.choose_action(
                                objective=f"{test_case.test_name} | {action.instruction}",
                                start_url=payload.url_to_test,
                                current_url=page.url,
                                step=total_step,
                                max_steps=max(cfg.max_steps, total_step + 1),
                                scratchpad=[{"observation": s.observation} for s in case_steps[-5:]],
                            )
                        event = execute(action, test_case.test_id, test_case.test_name, total_step)
                        case_steps.append(event)
                        all_steps.append(event)
                        if not event.ok:
                            status = "failed"
                            reason = event.observation
                            break

                    assertion_results: list[AssertionResult] = []
                    if status == "passed":
                        for assertion in test_case.assertions:
                            passed, detail = self._evaluate_assertion(page, assertion)
                            assertion_results.append(AssertionResult(type=assertion.type or "instruction", passed=passed, detail=detail))
                            if not passed:
                                status = "failed"
                                reason = detail

                    test_results.append(
                        TestCaseResult(
                            test_id=test_case.test_id,
                            test_name=test_case.test_name,
                            status=status,  # type: ignore[arg-type]
                            reason=reason,
                            actions=case_steps,
                            assertions=assertion_results,
                            redacted_context=redact_dict(test_case.additional_context),
                        )
                    )

            sandbox_logs = self._collect_sandbox_logs(handle.container_name)
            passed_count = sum(1 for item in test_results if item.status == "passed")
            run_status = "success" if passed_count == len(test_results) else "failed"
            summary = RunSummary(
                run_id=run_id,
                status=run_status,  # type: ignore[arg-type]
                objective=cfg.objective,
                start_url=cfg.start_url,
                novnc_url=handle.novnc_url,
                cdp_url=handle.cdp_url,
                steps=all_steps,
                final_message=f"Passed {passed_count}/{len(test_results)} test cases.",
                browser=payload.browser,
                viewport={"width": cfg.width, "height": cfg.height},
                test_results=test_results,
                browser_logs=browser_logs,
                sandbox_logs=sandbox_logs,
            )
            write_artifacts(summary, cfg.output_dir)
            if cfg.post_run_wait_seconds > 0:
                print(
                    f"[agent] Run complete. Keeping container alive for "
                    f"{cfg.post_run_wait_seconds:.1f}s for noVNC inspection..."
                )
                time.sleep(cfg.post_run_wait_seconds)
            return summary

    @staticmethod
    def _evaluate_assertion(page: Any, assertion: JsonAssertion) -> tuple[bool, str]:
        if assertion.type == "url_contains":
            needle = assertion.value or ""
            ok = needle in page.url
            return ok, f"url_contains('{needle}') on '{page.url}'"
        if assertion.type == "text_present":
            needle = assertion.value or ""
            ok = page.get_by_text(needle).first.is_visible(timeout=2000)
            return ok, f"text_present('{needle}')"
        if assertion.type == "selector_visible":
            selector = assertion.target or ""
            ok = page.locator(selector).first.is_visible(timeout=2000)
            return ok, f"selector_visible('{selector}')"
        if assertion.type == "title_contains":
            needle = assertion.value or ""
            title = page.title()
            ok = needle in title
            return ok, f"title_contains('{needle}') in '{title}'"
        if assertion.instruction:
            return False, f"unsupported instruction assertion: {assertion.instruction}"
        return False, "invalid assertion definition"

    @staticmethod
    def _collect_sandbox_logs(container_name: str) -> str:
        res = subprocess.run(
            ["docker", "logs", container_name],
            capture_output=True,
            check=False,
        )
        stdout = (res.stdout or b"").decode("utf-8", errors="replace")
        stderr = (res.stderr or b"").decode("utf-8", errors="replace")
        return f"{stdout}\n{stderr}".strip()

    @staticmethod
    def _connect_over_cdp_with_retry(playwright: Any, cdp_url: str, retries: int = 10) -> Any:
        last_error: Exception | None = None
        for _ in range(retries):
            try:
                return playwright.chromium.connect_over_cdp(cdp_url)
            except Exception as exc:
                last_error = exc
                time.sleep(0.5)
        raise RuntimeError(f"Unable to connect to CDP endpoint: {cdp_url}") from last_error
