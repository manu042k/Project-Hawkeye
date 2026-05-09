"""Generate Markdown and HTML run reports from RunResult + traces."""
from __future__ import annotations
import base64
from pathlib import Path
from orchestrator.models.results import RunResult


def write_screenshot_files(traces: list, output_dir: Path) -> None:
    """Write per-step screenshots as individual PNG files under screenshots/."""
    screenshots_dir = output_dir / "screenshots"
    for t in traces:
        b64 = getattr(t, "screenshot_b64", None)
        if not b64:
            continue
        screenshots_dir.mkdir(parents=True, exist_ok=True)
        step = getattr(t, "step_number", 0)
        dest = screenshots_dir / f"step_{step:02d}.png"
        dest.write_bytes(base64.b64decode(b64))


def generate_markdown_report(result: RunResult, traces: list, output_dir: Path) -> Path:
    """Write <output_dir>/<run_id>_report.md and return the path."""
    lines = [
        f"# Hawkeye Test Report — {result.test_name}",
        "",
        f"**Run ID:** {result.run_id}  ",
        f"**Status:** {result.status.upper()}  ",
        f"**Duration:** {result.duration_s:.1f}s  ",
        f"**Cost:** ${result.estimated_cost_usd:.4f}  ",
        f"**Steps:** {result.total_steps}  ",
        f"**Tokens:** {result.total_input_tokens + result.total_output_tokens:,}  ",
        "",
        "## Assertions",
        "",
        "| ID | Type | Description | Result |",
        "|----|----|----|----||",
    ]
    for a in result.assertion_results:
        status = "✅ PASSED" if a.passed else "❌ FAILED"
        lines.append(f"| {a.assertion_id} | {a.type} | {a.description} | {status} |")
        if not a.passed and a.details:
            lines.append(f"|   |   | _{a.details}_ |   |")

    if traces:
        lines += [
            "",
            "## Step Timeline",
            "",
            "| Step | Tool | Latency | Tokens | Cost |",
            "|------|------|---------|--------|------|",
        ]
        for t in traces:
            tool = t.tool_name or "—"
            latency = f"{t.tool_execution_latency_ms:.0f}ms"
            tokens = t.input_tokens + t.output_tokens
            cost = f"${t.estimated_cost_usd:.4f}"
            lines.append(f"| {t.step_number} | {tool} | {latency} | {tokens:,} | {cost} |")

    if result.termination_reason:
        lines += ["", "## Termination", "", result.termination_reason]

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "report.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    return path


def generate_html_report(result: RunResult, traces: list, output_dir: Path) -> Path:
    """Write <output_dir>/<run_id>_report.html (self-contained) and return the path."""
    status_color = {
        "passed": "#22c55e", "failed": "#ef4444", "blocked": "#f97316",
        "errored": "#dc2626", "timed_out": "#f59e0b",
    }.get(result.status, "#6b7280")

    assertion_rows = ""
    for a in result.assertion_results:
        icon = "✅" if a.passed else "❌"
        details = f"<br><small style='color:#6b7280'>{a.details}</small>" if not a.passed and a.details else ""
        assertion_rows += (
            f"<tr><td>{a.assertion_id}</td><td>{a.type}</td>"
            f"<td>{a.description}{details}</td><td>{icon}</td></tr>\n"
        )

    step_rows = ""
    for t in traces:
        tool = t.tool_name or "—"
        latency = f"{t.tool_execution_latency_ms:.0f}ms"
        tokens = t.input_tokens + t.output_tokens
        cost = f"${t.estimated_cost_usd:.4f}"
        img_html = ""
        if getattr(t, "screenshot_b64", None):
            img_html = (
                f'<br><img src="data:image/png;base64,{t.screenshot_b64}" '
                f'style="max-width:100%;border-radius:6px;margin-top:6px;border:1px solid #e5e7eb" '
                f'loading="lazy">'
            )
        step_rows += (
            f"<tr><td>{t.step_number}</td><td>{tool}</td>"
            f"<td>{latency}</td><td>{tokens:,}</td><td>{cost}</td>"
            f"<td>{img_html}</td></tr>\n"
        )

    total_tokens = result.total_input_tokens + result.total_output_tokens
    termination_section = (
        f"<h2>Termination</h2><p>{result.termination_reason}</p>"
        if result.termination_reason else ""
    )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hawkeye Report — {result.test_name}</title>
<style>
  body {{ font-family: system-ui, sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1f2937; }}
  h1 {{ font-size: 1.5rem; margin-bottom: 4px; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 9999px; color: #fff; font-weight: 600; font-size: 0.85rem; background: {status_color}; }}
  .meta {{ color: #6b7280; font-size: 0.9rem; margin: 8px 0 24px; }}
  .meta span {{ margin-right: 16px; }}
  table {{ width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.875rem; }}
  th {{ text-align: left; padding: 8px 10px; background: #f3f4f6; border-bottom: 2px solid #e5e7eb; }}
  td {{ padding: 7px 10px; border-bottom: 1px solid #e5e7eb; }}
  tr:hover td {{ background: #f9fafb; }}
  h2 {{ font-size: 1.1rem; margin-top: 32px; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; }}
</style>
</head>
<body>
<h1>{result.test_name} <span class="badge">{result.status.upper()}</span></h1>
<div class="meta">
  <span>Run: <code>{result.run_id}</code></span>
  <span>Duration: {result.duration_s:.1f}s</span>
  <span>Steps: {result.total_steps}</span>
  <span>Tokens: {total_tokens:,}</span>
  <span>Cost: ${result.estimated_cost_usd:.4f}</span>
</div>

<h2>Assertions</h2>
<table>
<thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Result</th></tr></thead>
<tbody>{assertion_rows}</tbody>
</table>

<h2>Step Timeline</h2>
<table>
<thead><tr><th>Step</th><th>Tool</th><th>Latency</th><th>Tokens</th><th>Cost</th><th>Screenshot</th></tr></thead>
<tbody>{step_rows}</tbody>
</table>
{termination_section}
</body>
</html>"""

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "report.html"
    path.write_text(html, encoding="utf-8")
    return path
