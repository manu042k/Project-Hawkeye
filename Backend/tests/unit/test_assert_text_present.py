"""Unit tests for assert_text_present (pure function)."""
from __future__ import annotations

from orchestrator.tools.assert_text_present import assert_text_present


class TestExactText:
    def test_text_found_returns_passed(self):
        r = assert_text_present(page_snapshot="Hello world", text="world")
        assert r.passed is True
        assert r.status == "passed"

    def test_text_not_found_returns_failed(self):
        r = assert_text_present(page_snapshot="Hello world", text="goodbye")
        assert r.passed is False
        assert r.status == "failed"
        assert "goodbye" in r.details

    def test_case_sensitive_fails_wrong_case(self):
        r = assert_text_present(page_snapshot="Hello World", text="hello", case_sensitive=True)
        assert r.passed is False

    def test_case_insensitive_passes_wrong_case(self):
        r = assert_text_present(page_snapshot="Hello World", text="hello", case_sensitive=False)
        assert r.passed is True

    def test_empty_snapshot_returns_failed(self):
        r = assert_text_present(page_snapshot="", text="anything")
        assert r.passed is False
        assert r.status == "failed"

    def test_full_match_still_passes(self):
        r = assert_text_present(page_snapshot="exact", text="exact")
        assert r.passed is True


class TestRegexPattern:
    def test_pattern_found_returns_passed(self):
        r = assert_text_present(page_snapshot="Order #AB123", pattern=r"Order #[A-Z0-9]+")
        assert r.passed is True
        assert r.status == "passed"

    def test_pattern_not_found_returns_failed(self):
        r = assert_text_present(page_snapshot="Order #AB123", pattern=r"Invoice #\d+")
        assert r.passed is False
        assert r.status == "failed"

    def test_invalid_regex_returns_error_not_raises(self):
        r = assert_text_present(page_snapshot="some text", pattern="[unclosed")
        assert r.passed is False
        assert r.status == "error"
        assert r.details is not None
        assert "Invalid regex" in r.details

    def test_case_insensitive_regex(self):
        r = assert_text_present(
            page_snapshot="Artificial Intelligence",
            pattern=r"artificial intelligence",
            case_sensitive=False,
        )
        assert r.passed is True

    def test_empty_snapshot_with_pattern(self):
        r = assert_text_present(page_snapshot="", pattern=r"\w+")
        assert r.passed is False


class TestEdgeCases:
    def test_neither_text_nor_pattern_returns_error(self):
        r = assert_text_present(page_snapshot="some text")
        assert r.passed is False
        assert r.status == "error"

    def test_multiline_snapshot(self):
        snapshot = "Line 1\nLine 2\nLine 3\nArtificial intelligence section"
        r = assert_text_present(page_snapshot=snapshot, text="Artificial intelligence")
        assert r.passed is True

    def test_unicode_text(self):
        r = assert_text_present(page_snapshot="Café menu", text="Café")
        assert r.passed is True
