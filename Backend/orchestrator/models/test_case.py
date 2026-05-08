from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class TestCaseValidationError(ValueError):
    """Raised when a test case fails schema validation."""


class Viewport(BaseModel):
    width: int = 1280
    height: int = 720
    device_scale_factor: float = 1.0


class Auth(BaseModel):
    method: Literal["cookie_inject", "login_flow", "token_header", "none"] = "none"
    credentials_ref: str | None = None


class Target(BaseModel):
    url: str
    browser: str = "chromium"
    viewport: Viewport | None = None
    locale: str | None = None
    timezone: str | None = None
    auth: Auth | None = None
    extra_headers: dict[str, str] | None = None
    block_urls: list[str] = Field(default_factory=list)

    @field_validator("browser")
    @classmethod
    def _validate_browser(cls, v: str) -> str:
        allowed = {"chromium", "firefox", "webkit", "chrome", "msedge"}
        if v not in allowed:
            raise ValueError(f"browser must be one of {sorted(allowed)!r}, got {v!r}")
        return v


class Checkpoint(BaseModel):
    id: str
    description: str
    success_signal: str
    data: dict[str, Any] | None = None


class Steps(BaseModel):
    mode: Literal["guided", "strict", "unordered"] = "guided"
    checkpoints: list[Checkpoint] = Field(default_factory=list)


class Assertion(BaseModel):
    id: str
    type: str
    description: str
    params: dict[str, Any] = Field(default_factory=dict)


class Constraints(BaseModel):
    max_steps: int = 30
    timeout_seconds: int = 180
    max_retries_per_action: int = 2
    navigation_policy: Literal["interact_only", "explicit_urls_allowed"] = "interact_only"
    forbidden_actions: list[str] = Field(default_factory=list)
    required_behaviors: list[str] = Field(default_factory=list)


class Context(BaseModel):
    app_description: str | None = None
    hints: list[str] = Field(default_factory=list)
    known_issues: list[str] = Field(default_factory=list)
    page_type: Literal["static", "ssr", "spa", "streaming"] = "spa"


class OnFailure(BaseModel):
    capture: dict[str, bool] = Field(
        default_factory=lambda: {
            "screenshot": True,
            "dom_snapshot": True,
            "network_log": True,
            "console_log": True,
            "agent_trace": True,
            "video": False,
        }
    )
    notify: dict[str, Any] = Field(default_factory=dict)


class TestCase(BaseModel):
    id: str
    name: str
    goal: str
    target: Target
    suite: str | None = None
    priority: Literal["P0", "P1", "P2", "P3"] = "P1"
    tags: list[str] = Field(default_factory=list)
    created_by: str | None = None
    created_at: str | None = None
    steps: Steps | None = None
    assertions: list[Assertion] = Field(default_factory=list)
    constraints: Constraints = Field(default_factory=Constraints)
    context: Context = Field(default_factory=Context)
    on_failure: OnFailure = Field(default_factory=OnFailure)
