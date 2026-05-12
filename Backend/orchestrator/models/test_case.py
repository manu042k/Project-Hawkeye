from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class TestCaseValidationError(ValueError):
    """Raised when a test case fails schema validation."""


class Viewport(BaseModel):
    width: int = 1280
    height: int = 720
    device_scale_factor: float = 1.0


class VaultEntry(BaseModel):
    key: str
    value: str


class Target(BaseModel):
    url: str
    browser: str = "chromium"
    viewport: Viewport | None = None
    page_type: Literal["static", "ssr", "spa", "streaming"] = "spa"
    app_description: str | None = None
    vault: list[VaultEntry] = Field(default_factory=list)
    locale: str | None = None
    timezone: str | None = None
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


class Goal(BaseModel):
    objective: str
    constraints: Constraints = Field(default_factory=Constraints)
    extra_details: str | None = None
    steps: Steps | None = None


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
    goal: Goal
    target: Target
    suite: str | None = None
    priority: Literal["P0", "P1", "P2", "P3"] = "P1"
    tags: list[str] = Field(default_factory=list)
    save_record: bool = False
    created_by: str | None = None
    project: str | None = None
    created_at: str | None = None
    assertions: list[Assertion] = Field(default_factory=list)
    on_failure: OnFailure = Field(default_factory=OnFailure)
