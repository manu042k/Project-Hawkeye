from __future__ import annotations

from pydantic import BaseModel


class RunRequest(BaseModel):
    test_case_path: str
    model: str = "openrouter:openai/gpt-oss-120b:free"
    browser: str | None = None
    record: bool = False
    figma_url: str | None = None
    figma_token: str | None = None
    max_steps: int | None = None
    timeout: int | None = None


class RunResponse(BaseModel):
    run_id: str
    status: str
    test_name: str | None = None
    created_at: str
    duration_s: float | None = None
    total_steps: int | None = None
    estimated_cost_usd: float | None = None
    termination_reason: str | None = None
    output_dir: str | None = None
    novnc_url: str | None = None
    assertion_results: list[dict] | None = None


class RunListResponse(BaseModel):
    runs: list[RunResponse]
    total: int


class TestCaseInfo(BaseModel):
    id: str
    name: str
    path: str
    goal: str
    browser: str
    assertions: int


class TestCaseListResponse(BaseModel):
    test_cases: list[TestCaseInfo]


class TraceEvent(BaseModel):
    run_id: str
    event_type: str
    step_number: int | None = None
    data: dict
    timestamp: str
