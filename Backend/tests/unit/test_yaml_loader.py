"""Unit tests for the YAML/JSON test case loader."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml

from orchestrator.loader.yaml_loader import load_test_case
from orchestrator.models.test_case import TestCaseValidationError


@pytest.fixture
def tmp_yaml(tmp_path):
    """Helper: write a dict to a .yaml file and return its path."""
    def _write(data: dict, filename: str = "tc.yaml") -> Path:
        p = tmp_path / filename
        p.write_text(yaml.dump(data), encoding="utf-8")
        return p
    return _write


@pytest.fixture
def tmp_json(tmp_path):
    """Helper: write a dict to a .json file and return its path."""
    def _write(data: dict, filename: str = "tc.json") -> Path:
        p = tmp_path / filename
        p.write_text(json.dumps(data), encoding="utf-8")
        return p
    return _write


@pytest.fixture
def minimal(tmp_yaml):
    return tmp_yaml({
        "id": "TC-001",
        "name": "Minimal",
        "goal": "Do something",
        "target": {"url": "https://example.com"},
    })


class TestMinimalValidCase:
    def test_loads_without_error(self, minimal):
        tc = load_test_case(minimal)
        assert tc.id == "TC-001"
        assert tc.name == "Minimal"
        assert tc.goal == "Do something"
        assert tc.target.url == "https://example.com"

    def test_defaults_applied(self, minimal):
        tc = load_test_case(minimal)
        assert tc.target.browser == "chromium"
        assert tc.constraints.max_steps == 30
        assert tc.constraints.timeout_seconds == 180
        assert tc.constraints.navigation_policy == "interact_only"
        assert tc.steps is None
        assert tc.assertions == []
        assert tc.priority == "P1"
        assert tc.tags == []


class TestFullValidCase:
    def test_full_case_round_trips(self, tmp_yaml, full_test_case_dict):
        tc = load_test_case(tmp_yaml(full_test_case_dict))
        assert tc.id == "TC-FULL"
        assert tc.suite == "smoke"
        assert tc.steps is not None
        assert len(tc.steps.checkpoints) == 1
        assert tc.steps.checkpoints[0].id == "S1"
        assert len(tc.assertions) == 1
        assert tc.assertions[0].id == "A1"
        assert tc.constraints.max_steps == 15
        assert tc.constraints.timeout_seconds == 90
        assert tc.context.page_type == "ssr"
        assert tc.context.hints == ["The search box is at the top"]

    def test_json_file_parses_correctly(self, tmp_json, full_test_case_dict):
        tc = load_test_case(tmp_json(full_test_case_dict))
        assert tc.id == "TC-FULL"
        assert tc.target.browser == "chromium"


class TestMissingRequiredFields:
    def test_missing_id_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError) as exc_info:
            load_test_case(tmp_yaml({"name": "T", "goal": "G", "target": {"url": "https://x.com"}}))
        assert "id" in str(exc_info.value)

    def test_missing_name_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError):
            load_test_case(tmp_yaml({"id": "TC", "goal": "G", "target": {"url": "https://x.com"}}))

    def test_missing_goal_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError):
            load_test_case(tmp_yaml({"id": "TC", "name": "T", "target": {"url": "https://x.com"}}))

    def test_missing_target_url_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError) as exc_info:
            load_test_case(tmp_yaml({"id": "TC", "name": "T", "goal": "G", "target": {}}))
        assert "url" in str(exc_info.value)

    def test_missing_target_entirely_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError) as exc_info:
            load_test_case(tmp_yaml({"id": "TC", "name": "T", "goal": "G"}))
        assert "target" in str(exc_info.value)


class TestInvalidFieldValues:
    def test_invalid_priority_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError) as exc_info:
            load_test_case(tmp_yaml({
                "id": "TC", "name": "T", "goal": "G",
                "target": {"url": "https://x.com"},
                "priority": "P5",
            }))
        assert "priority" in str(exc_info.value)

    def test_invalid_navigation_policy_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError) as exc_info:
            load_test_case(tmp_yaml({
                "id": "TC", "name": "T", "goal": "G",
                "target": {"url": "https://x.com"},
                "constraints": {"navigation_policy": "unrestricted"},
            }))
        assert "navigation_policy" in str(exc_info.value)

    def test_invalid_browser_raises(self, tmp_yaml):
        with pytest.raises(TestCaseValidationError):
            load_test_case(tmp_yaml({
                "id": "TC", "name": "T", "goal": "G",
                "target": {"url": "https://x.com", "browser": "ie11"},
            }))


class TestFileErrors:
    def test_nonexistent_file_raises_file_not_found(self, tmp_path):
        with pytest.raises(FileNotFoundError):
            load_test_case(tmp_path / "does_not_exist.yaml")

    def test_malformed_yaml_raises_yaml_error(self, tmp_path):
        bad = tmp_path / "bad.yaml"
        bad.write_text("id: TC\nname: [unclosed", encoding="utf-8")
        with pytest.raises(yaml.YAMLError):
            load_test_case(bad)

    def test_yaml_that_is_not_a_dict_raises(self, tmp_path):
        f = tmp_path / "list.yaml"
        f.write_text("- item1\n- item2\n", encoding="utf-8")
        with pytest.raises(TestCaseValidationError):
            load_test_case(f)


class TestOptionalSections:
    def test_no_steps_field_sets_none(self, tmp_yaml):
        tc = load_test_case(tmp_yaml({
            "id": "TC", "name": "T", "goal": "G",
            "target": {"url": "https://x.com"},
        }))
        assert tc.steps is None

    def test_empty_assertions_list_is_valid(self, tmp_yaml):
        tc = load_test_case(tmp_yaml({
            "id": "TC", "name": "T", "goal": "G",
            "target": {"url": "https://x.com"},
            "assertions": [],
        }))
        assert tc.assertions == []

    def test_absent_constraints_uses_all_defaults(self, tmp_yaml):
        tc = load_test_case(tmp_yaml({
            "id": "TC", "name": "T", "goal": "G",
            "target": {"url": "https://x.com"},
        }))
        assert tc.constraints.max_steps == 30
        assert tc.constraints.timeout_seconds == 180
        assert tc.constraints.max_retries_per_action == 2
