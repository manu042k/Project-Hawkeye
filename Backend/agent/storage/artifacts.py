from __future__ import annotations

import json
from pathlib import Path

from ..models.schemas import RunSummary


def write_artifacts(summary: RunSummary, output_dir: str) -> tuple[str, str]:
    root = Path(output_dir).resolve()
    run_dir = root / summary.run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    json_path = run_dir / "summary.json"
    md_path = run_dir / "summary.md"
    actions_path = run_dir / "agent_actions.jsonl"
    browser_logs_path = run_dir / "browser_logs.json"
    sandbox_logs_path = run_dir / "sandbox_logs.txt"

    json_path.write_text(summary.model_dump_json(indent=2), encoding="utf-8")

    with actions_path.open("w", encoding="utf-8") as actions_file:
        for step in summary.steps:
            actions_file.write(
                json.dumps(
                    {
                        "step": step.step,
                        "test_id": step.test_id,
                        "test_name": step.test_name,
                        "action": step.action.model_dump(),
                        "ok": step.ok,
                        "observation": step.observation,
                        "data": step.data,
                    }
                )
                + "\n"
            )
    browser_logs_path.write_text(json.dumps(summary.browser_logs, indent=2), encoding="utf-8")
    sandbox_logs_path.write_text(summary.sandbox_logs or "", encoding="utf-8")

    md = (
        f"# Agent Run {summary.run_id}\n\n"
        f"- status: `{summary.status}`\n"
        f"- objective: {summary.objective}\n"
        f"- start_url: {summary.start_url}\n"
        f"- browser: {summary.browser}\n"
        f"- viewport: {summary.viewport.width}x{summary.viewport.height}\n"
        f"- noVNC: {summary.novnc_url}\n"
        f"- cdp: {summary.cdp_url or '-'}\n\n"
        f"## Final message\n\n{summary.final_message}\n\n"
        "## Test cases\n\n"
    )
    for case in summary.test_results:
        md += f"- `{case.test_id}` {case.test_name}: `{case.status}`"
        if case.reason:
            md += f" ({case.reason})"
        md += "\n"
    md += "\n## Steps\n\n"
    for step in summary.steps:
        md += f"- step {step.step} [{step.test_id or '-'}]: `{step.action.type}` -> {step.observation}\n"
    md_path.write_text(md, encoding="utf-8")

    return str(json_path), str(md_path)
