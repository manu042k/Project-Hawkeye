from __future__ import annotations

from pydantic import BaseModel, Field

_MODEL_HELP = (
    "Inference provider + model in 'provider:model' format. "
    "Providers: "
    "'nvidia:<name>' (NVIDIA NIM, requires NVIDIA_API_KEY), "
    "'openrouter:<name>' (requires OPENROUTER_API_KEY), "
    "'ollama:<name>' (local Ollama, default host localhost:11434), "
    "'vllm:<name>' (local vLLM, default host localhost:8001), "
    "'groq:<name>' (requires GROQ_API_KEY). "
    "Examples: 'nvidia:moonshotai/kimi-k2.6', 'ollama:llama3.2', "
    "'openrouter:google/gemma-4-31b-it:free', 'vllm:Qwen/Qwen2.5-VL-3B-Instruct'."
)


class RunRequest(BaseModel):
    test_case_path: str = Field(default="", description="Filename under orchestrator/test_cases/ or absolute path.")
    test_case_id: str | None = Field(default=None, description="DB test case ID (Phase 5A). Takes precedence over test_case_path.")
    model: str = Field(default="nvidia:moonshotai/kimi-k2.6", description=_MODEL_HELP)
    browser: str | None = Field(default=None, description="Override browser: chromium | firefox | webkit.")
    record: bool = Field(default=False, description="Record MP4 of the browser session.")
    figma_url: str | None = Field(default=None, description="Figma file URL for visual diff (Pass 2).")
    figma_token: str | None = Field(default=None, description="Figma personal access token.")
    max_steps: int | None = Field(default=None, description="Override max steps from test case.")
    timeout: int | None = Field(default=None, description="Override timeout seconds from test case.")
    triggered_by: str | None = Field(default=None, description="Email / identity of the user who triggered this run.")
    environment_id: str | None = Field(default=None, description="Environment ID to use for this run.")


class RunResponse(BaseModel):
    run_id: str
    status: str
    test_name: str | None = None
    triggered_by: str | None = None
    created_at: str
    duration_s: float | None = None
    total_steps: int | None = None
    estimated_cost_usd: float | None = None
    termination_reason: str | None = None
    output_dir: str | None = None
    novnc_url: str | None = None
    assertion_results: list[dict] | None = None
    error_message: str | None = None
    steps_completed: list[str] | None = None
    total_input_tokens: int | None = None
    total_output_tokens: int | None = None
    error_count: int | None = None
    tool_call_count: int | None = None
    artifact_manifest: list[dict] | None = None
    browser_used: str | None = None
    model_used: str | None = None
    recording: bool | None = None
    max_steps_override: int | None = None
    timeout_override: int | None = None
    viewport: dict | None = None


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
