"""Unit tests for the system prompt builder."""
from __future__ import annotations

import pytest

from orchestrator.agent.prompt_builder import build_system_prompt
from orchestrator.models.test_case import (
    Checkpoint,
    Constraints,
    Context,
    Steps,
    Target,
    TestCase,
)


def _make_tc(**kwargs) -> TestCase:
    base = dict(
        id="TC-001",
        name="Test",
        goal="Accomplish something meaningful",
        target=Target(url="https://example.com"),
    )
    base.update(kwargs)
    return TestCase(**base)


class TestPromptStructure:
    def test_returns_non_empty_string(self):
        tc = _make_tc()
        prompt = build_system_prompt(tc)
        assert isinstance(prompt, str)
        assert len(prompt) > 100

    def test_goal_present_in_prompt(self):
        tc = _make_tc(goal="Navigate to the checkout page")
        prompt = build_system_prompt(tc)
        assert "Navigate to the checkout page" in prompt

    def test_goal_complete_signal_instruction_present(self):
        tc = _make_tc()
        prompt = build_system_prompt(tc)
        assert "<GOAL_COMPLETE>" in prompt

    def test_goal_blocked_signal_instruction_present(self):
        tc = _make_tc()
        prompt = build_system_prompt(tc)
        assert "<GOAL_BLOCKED>" in prompt

    def test_browser_snapshot_instruction_present(self):
        tc = _make_tc()
        prompt = build_system_prompt(tc)
        assert "browser_snapshot" in prompt


class TestGuidedSection:
    def test_checkpoints_present_when_steps_defined(self):
        tc = _make_tc(
            steps=Steps(
                mode="guided",
                checkpoints=[
                    Checkpoint(id="S1", description="Load page", success_signal="Page is loaded"),
                    Checkpoint(id="S2", description="Click button", success_signal="Modal opened"),
                ],
            )
        )
        prompt = build_system_prompt(tc)
        assert "[S1]" in prompt
        assert "Load page" in prompt
        assert "Page is loaded" in prompt
        assert "[S2]" in prompt
        assert "[S1 complete]" in prompt

    def test_unguided_omits_checkpoints_section(self):
        tc = _make_tc(steps=None)
        prompt = build_system_prompt(tc)
        assert "[S1]" not in prompt
        assert "Steps (guided checkpoints)" not in prompt

    def test_strict_mode_is_embedded(self):
        tc = _make_tc(
            steps=Steps(
                mode="strict",
                checkpoints=[Checkpoint(id="S1", description="Step", success_signal="Done")],
            )
        )
        prompt = build_system_prompt(tc)
        assert "strict" in prompt


class TestConstraints:
    def test_interact_only_policy_detail_present(self):
        tc = _make_tc(
            constraints=Constraints(navigation_policy="interact_only")
        )
        prompt = build_system_prompt(tc)
        assert "interact_only" in prompt
        # The human-readable detail must explain what it means
        assert "clicking" in prompt.lower() or "UI elements" in prompt

    def test_explicit_urls_allowed_policy_detail_present(self):
        tc = _make_tc(
            constraints=Constraints(navigation_policy="explicit_urls_allowed")
        )
        prompt = build_system_prompt(tc)
        assert "explicit_urls_allowed" in prompt

    def test_max_steps_embedded(self):
        tc = _make_tc(constraints=Constraints(max_steps=42))
        prompt = build_system_prompt(tc)
        assert "42" in prompt

    def test_forbidden_actions_embedded(self):
        tc = _make_tc(
            constraints=Constraints(
                forbidden_actions=["proceed to checkout", "enter payment info"]
            )
        )
        prompt = build_system_prompt(tc)
        assert "proceed to checkout" in prompt
        assert "enter payment info" in prompt

    def test_required_behaviors_embedded(self):
        tc = _make_tc(
            constraints=Constraints(
                required_behaviors=["verify cart contents"]
            )
        )
        prompt = build_system_prompt(tc)
        assert "verify cart contents" in prompt

    def test_empty_forbidden_actions_shows_none(self):
        tc = _make_tc(constraints=Constraints(forbidden_actions=[]))
        prompt = build_system_prompt(tc)
        # Should say "(none)" or equivalent
        assert "none" in prompt.lower()


class TestContextSection:
    def test_app_description_embedded(self):
        tc = _make_tc(
            context=Context(app_description="An e-commerce SPA built with React.")
        )
        prompt = build_system_prompt(tc)
        assert "e-commerce SPA built with React" in prompt

    def test_hints_rendered_as_bullet_list(self):
        tc = _make_tc(
            context=Context(hints=["The search box has id=search", "Dismiss cookie banner first"])
        )
        prompt = build_system_prompt(tc)
        assert "The search box has id=search" in prompt
        assert "Dismiss cookie banner first" in prompt
        # Both should appear as list items
        assert "- The search box" in prompt or "\nThe search box" in prompt

    def test_no_hints_section_when_empty(self):
        tc = _make_tc(context=Context(hints=[]))
        prompt = build_system_prompt(tc)
        assert "## Hints" not in prompt

    def test_known_issues_embedded(self):
        tc = _make_tc(
            context=Context(known_issues=["Staging shows stale cache banner"])
        )
        prompt = build_system_prompt(tc)
        assert "stale cache banner" in prompt

    def test_no_known_issues_section_when_empty(self):
        tc = _make_tc(context=Context(known_issues=[]))
        prompt = build_system_prompt(tc)
        assert "Known issues" not in prompt

    def test_page_type_embedded(self):
        tc = _make_tc(context=Context(page_type="ssr"))
        prompt = build_system_prompt(tc)
        assert "ssr" in prompt


class TestDeterminism:
    def test_same_input_produces_identical_output(self):
        tc = _make_tc(
            goal="Search for headphones",
            steps=Steps(
                mode="guided",
                checkpoints=[
                    Checkpoint(id="S1", description="Search", success_signal="Results shown"),
                ],
            ),
            context=Context(hints=["Use the search bar"], page_type="spa"),
            constraints=Constraints(max_steps=20, forbidden_actions=["checkout"]),
        )
        results = {build_system_prompt(tc) for _ in range(10)}
        assert len(results) == 1, "build_system_prompt is not deterministic"
