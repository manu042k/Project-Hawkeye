"""Shared pytest fixtures for all test layers."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure the Backend directory is on the path so both `orchestrator` and
# `hawkeye_sandbox` are importable regardless of install state.
_BACKEND = Path(__file__).parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@pytest.fixture
def minimal_test_case_dict() -> dict:
    return {
        "id": "TC-TEST",
        "name": "Minimal test case",
        "goal": "Do something useful",
        "target": {"url": "https://example.com"},
    }


@pytest.fixture
def full_test_case_dict() -> dict:
    return {
        "id": "TC-FULL",
        "name": "Full test case",
        "goal": "Search and verify",
        "suite": "smoke",
        "priority": "P1",
        "tags": ["search", "smoke"],
        "target": {
            "url": "https://example.com",
            "browser": "chromium",
            "viewport": {"width": 1280, "height": 720},
        },
        "steps": {
            "mode": "guided",
            "checkpoints": [
                {
                    "id": "S1",
                    "description": "Load homepage",
                    "success_signal": "Homepage visible",
                }
            ],
        },
        "assertions": [
            {
                "id": "A1",
                "type": "content",
                "description": "Title present",
                "params": {"check": "text_present", "text": "Example"},
            }
        ],
        "constraints": {
            "max_steps": 15,
            "timeout_seconds": 90,
            "navigation_policy": "explicit_urls_allowed",
        },
        "context": {
            "page_type": "ssr",
            "hints": ["The search box is at the top"],
        },
    }
