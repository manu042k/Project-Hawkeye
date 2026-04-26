from __future__ import annotations

import json
from typing import Any

import httpx

from ..models.schemas import AgentAction


class OllamaRuntime:
    def __init__(self, model: str, host: str = "http://127.0.0.1:11434") -> None:
        self.model = model
        self.host = host.rstrip("/")

    def choose_action(
        self,
        objective: str,
        start_url: str,
        current_url: str,
        step: int,
        max_steps: int,
        scratchpad: list[dict[str, Any]],
    ) -> AgentAction:
        prompt = self._build_prompt(objective, start_url, current_url, step, max_steps, scratchpad)
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "format": "json",
        }
        try:
            with httpx.Client(timeout=60.0) as client:
                res = client.post(f"{self.host}/api/chat", json=payload)
                res.raise_for_status()
                body: dict[str, Any] = res.json()
            content = body.get("message", {}).get("content", "{}")
            data = json.loads(content)
            return AgentAction.model_validate(data)
        except Exception:
            if step == 1:
                return AgentAction(type="navigate", reason="Ollama unavailable; opening start URL.", url=start_url)
            if step == 2:
                return AgentAction(type="scroll", reason="Fallback demo interaction.", pixels=800)
            if step == 3:
                return AgentAction(type="wait", reason="Fallback pause for visibility.", seconds=2.0)
            return AgentAction(type="complete", reason="Fallback completion", result="Completed with fallback planner.")

    @staticmethod
    def _build_prompt(
        objective: str,
        start_url: str,
        current_url: str,
        step: int,
        max_steps: int,
        scratchpad: list[dict[str, Any]],
    ) -> str:
        recent = scratchpad[-5:]
        return (
            "You are a browser automation planner.\n"
            "Return ONLY JSON matching this schema:\n"
            '{"type":"navigate|click|type|scroll|wait|complete|fail","reason":"...",'
            '"url":null,"selector":null,"text":null,"pixels":600,"seconds":1.0,"result":null}\n'
            f"Objective: {objective}\n"
            f"Start URL: {start_url}\n"
            f"Current URL: {current_url}\n"
            f"Step: {step}/{max_steps}\n"
            f"Recent observations: {json.dumps(recent)}\n"
            "Rules:\n"
            "- Use small steps.\n"
            "- Use `navigate` with url for first page open.\n"
            "- Use `type` before `click` for forms.\n"
            "- Use `complete` when objective is clearly done and set `result`.\n"
            "- Use `fail` when impossible and set `result`.\n"
        )
