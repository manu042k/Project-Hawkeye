from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


ActionType = Literal["navigate", "click", "type", "scroll", "wait", "complete", "fail"]
RunStatus = Literal["running", "success", "failed", "max_steps", "runtime_error"]
TestStatus = Literal["passed", "failed", "error"]
AssertionType = Literal["url_contains", "text_present", "selector_visible", "title_contains"]


class AgentAction(BaseModel):
    type: ActionType
    reason: str | None = ""
    url: str | None = None
    selector: str | None = None
    text: str | None = None
    pixels: int = 600
    seconds: float = 1.0
    result: str | None = None
    instruction: str | None = None


class JsonAction(BaseModel):
    type: ActionType
    selector: str | None = None
    text: str | None = None
    url: str | None = None
    pixels: int = 600
    seconds: float = 1.0
    reason: str | None = None
    instruction: str | None = None


class JsonAssertion(BaseModel):
    type: AssertionType | None = None
    target: str | None = None
    value: str | None = None
    instruction: str | None = None


class JsonTestCase(BaseModel):
    test_id: str
    test_name: str
    assertions: list[JsonAssertion] = Field(default_factory=list)
    actions: list[JsonAction] = Field(default_factory=list)
    additional_context: dict[str, Any] = Field(default_factory=dict)


class JsonViewport(BaseModel):
    width: int = 1366
    height: int = 768


class JsonRunInput(BaseModel):
    url_to_test: str
    browser: Literal["chromium", "chrome", "msedge"] = "chromium"
    viewport: JsonViewport | None = None
    test_cases: list[JsonTestCase]


class StepEvent(BaseModel):
    step: int
    test_id: str | None = None
    test_name: str | None = None
    action: AgentAction
    ok: bool
    observation: str
    data: dict[str, Any] = Field(default_factory=dict)


class AssertionResult(BaseModel):
    type: str
    passed: bool
    detail: str


class TestCaseResult(BaseModel):
    test_id: str
    test_name: str
    status: TestStatus
    reason: str = ""
    actions: list[StepEvent] = Field(default_factory=list)
    assertions: list[AssertionResult] = Field(default_factory=list)
    redacted_context: dict[str, Any] = Field(default_factory=dict)


class RunSummary(BaseModel):
    run_id: str
    status: RunStatus
    objective: str = ""
    start_url: str
    novnc_url: str
    cdp_url: str | None = None
    steps: list[StepEvent] = Field(default_factory=list)
    final_message: str = ""
    browser: str = "chromium"
    viewport: JsonViewport = Field(default_factory=JsonViewport)
    test_results: list[TestCaseResult] = Field(default_factory=list)
    browser_logs: dict[str, list[dict[str, Any]]] = Field(
        default_factory=lambda: {"console": [], "page_errors": [], "request_failed": [], "response_errors": []}
    )
    sandbox_logs: str = ""
