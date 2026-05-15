"""Generate Markdown and HTML run reports from RunResult + traces."""
from __future__ import annotations
import base64
from pathlib import Path
from orchestrator.models.results import RunResult


def _step_summary(t) -> str:
    """Generate a one-sentence natural-language summary of what happened in a step.

    Uses agent_output_text when available (model reasoned aloud), otherwise
    derives the summary from tool name, inputs, and outcome.
    """
    agent_text = (getattr(t, "agent_output_text", "") or "").strip()
    tool = getattr(t, "tool_name", None) or ""
    tool_input = getattr(t, "tool_input", None) or {}
    tool_success = getattr(t, "tool_success", True)
    tool_error = (getattr(t, "tool_error", "") or "").strip()
    page_url = (getattr(t, "page_url", "") or "").strip()
    page_title = (getattr(t, "page_title", "") or "").strip()

    # If the model emitted reasoning text, use the first sentence of it.
    if agent_text:
        first_line = agent_text.split("\n")[0].strip()
        # Strip any trailing tool-call markers or tags
        for marker in ("<GOAL_COMPLETE>", "<GOAL_BLOCKED>", "Tool call:", "```"):
            first_line = first_line.split(marker)[0].strip()
        if first_line:
            return first_line[:200]

    # Derive summary from tool + inputs
    if isinstance(tool_input, str):
        try:
            import ast
            tool_input = ast.literal_eval(tool_input)
        except Exception:
            tool_input = {}

    location = f'on "{page_title or page_url}"' if (page_title or page_url) else ""

    if tool == "browser_navigate":
        url = tool_input.get("url", "")
        verdict = "succeeded" if tool_success else f"failed ({tool_error[:60]})"
        return f"Navigated to {url} — {verdict}."

    if tool == "browser_type":
        text = tool_input.get("text", "")
        target = tool_input.get("target", "")
        if tool_success:
            return f'Typed "{text}" into field {target} {location}.'
        return f'Tried to type "{text}" into {target} {location} — timed out or element not found.'

    if tool == "browser_press_key":
        key = tool_input.get("key", "")
        if tool_success:
            return f"Pressed {key} {location}."
        return f"Pressed {key} but got an error: {tool_error[:80]}"

    if tool == "browser_click":
        target = tool_input.get("target", "")
        if tool_success:
            return f"Clicked {target} {location}."
        return f"Click on {target} failed: {tool_error[:80]}"

    if tool == "browser_snapshot":
        if tool_success:
            return f"Captured accessibility snapshot {location}."
        return f"Snapshot failed: {tool_error[:80]}"

    if tool == "browser_scroll":
        direction = tool_input.get("direction", "")
        return f"Scrolled {direction} {location}."

    if tool == "browser_wait_for":
        return f"Waited for page condition {location}."

    if tool == "report_step_result":
        step_id = tool_input.get("step_id", "")
        status = tool_input.get("status", "")
        summary = tool_input.get("summary", "")
        return f"Reported step {step_id} as {status.upper()}: {summary[:100]}"

    if tool == "wait_for_stable":
        return f"Waited for page to stabilise {location}."

    if tool == "assert_text_present":
        text = tool_input.get("text", "")
        return f'Asserted text "{text}" is present {location}.'

    if tool == "get_console_errors":
        return f"Checked browser console for errors {location}."

    if tool:
        verdict = "succeeded" if tool_success else f"failed ({tool_error[:60]})"
        return f"Called {tool} — {verdict}."

    return "Observation step — no tool call."


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


def generate_html_report(
    result: RunResult,
    traces: list,
    output_dir: Path,
    *,
    test_case=None,
) -> Path:
    """Write <output_dir>/report.html (self-contained) and return the path."""

    STATUS_COLORS = {
        "passed": "#22c55e", "failed": "#ef4444", "blocked": "#f97316",
        "errored": "#dc2626", "timed_out": "#f59e0b",
    }
    status_color = STATUS_COLORS.get(result.status, "#6b7280")
    total_tokens = result.total_input_tokens + result.total_output_tokens

    # ── Test plan: goal + checkpoints ────────────────────────────────────────
    plan_html = ""
    checkpoints = []  # list of Checkpoint objects from test case
    if test_case and test_case.goal:
        objective = test_case.goal.objective.strip().replace("\n", "<br>")
        plan_html += f'<div class="goal-text">{objective}</div>\n'
        steps = test_case.goal.steps
        if steps and steps.checkpoints:
            checkpoints = steps.checkpoints
            cp_cards = ""
            for cp in checkpoints:
                done = cp.id in result.steps_completed
                state_cls = "cp-done" if done else "cp-pending"
                icon = "✓" if done else "○"
                desc = cp.description.strip().replace("\n", " ")
                sig = cp.success_signal.strip().replace("\n", " ")
                cp_cards += f"""
<div class="cp-card {state_cls}">
  <div class="cp-header"><span class="cp-icon">{icon}</span><strong>{cp.id}</strong></div>
  <div class="cp-desc">{desc}</div>
  <div class="cp-sig">✔ {sig}</div>
</div>"""
            plan_html += f'<div class="cp-grid">{cp_cards}</div>\n'

    # ── Assertions ────────────────────────────────────────────────────────────
    assertion_rows = ""
    for a in result.assertion_results:
        icon = "✅" if a.passed else "❌"
        details = (
            f"<br><small class='muted'>{a.details}</small>"
            if not a.passed and a.details else ""
        )
        assertion_rows += (
            f"<tr><td>{a.assertion_id}</td><td><code>{a.type}</code></td>"
            f"<td>{a.description}{details}</td><td>{icon}</td></tr>\n"
        )
    assertions_section = ""
    if assertion_rows:
        assertions_section = f"""
<h2>Assertions</h2>
<table>
<thead><tr><th>ID</th><th>Type</th><th>Description</th><th>Result</th></tr></thead>
<tbody>{assertion_rows}</tbody>
</table>"""

    # ── Step cards ────────────────────────────────────────────────────────────
    # Build checkpoint id → definition lookup
    cp_lookup = {cp.id: cp for cp in checkpoints}

    step_cards = ""
    for t in traces:
        cp_id = getattr(t, "checkpoint_id", None)
        cp_completed = getattr(t, "checkpoint_completed", False)
        page_url = getattr(t, "page_url", "") or ""
        page_title = getattr(t, "page_title", "") or ""
        agent_text = getattr(t, "agent_output_text", "") or ""
        tool_input = getattr(t, "tool_input", None)
        tool_output = getattr(t, "tool_output", "") or ""
        tool_success = getattr(t, "tool_success", True)
        tool_error = getattr(t, "tool_error", "") or ""
        screenshot_b64 = getattr(t, "screenshot_b64", None)
        tokens = t.input_tokens + t.output_tokens

        # Checkpoint badge
        cp_badge = ""
        if cp_id:
            cp_def = cp_lookup.get(cp_id)
            cp_label = cp_def.description.split("\n")[0][:60] if cp_def else cp_id
            cp_badge = f'<span class="step-cp">{cp_id}: {cp_label}{"…" if cp_def and len(cp_def.description) > 60 else ""}</span>'
            if cp_completed:
                cp_badge += ' <span class="step-cp-done">✓ completed</span>'

        # Screenshot
        img_html = ""
        if screenshot_b64:
            img_id = f"img-step-{t.step_number}"
            img_html = f"""
<div class="step-screenshot" onclick="openLightbox('{img_id}')">
  <img id="{img_id}" src="data:image/png;base64,{screenshot_b64}"
       alt="Step {t.step_number} screenshot" loading="lazy">
  <div class="screenshot-hint">click to enlarge</div>
</div>"""

        # Tool result (truncated)
        tool_status_cls = "tool-ok" if tool_success else "tool-err"
        tool_out_preview = (tool_output or tool_error)[:300].replace("<", "&lt;").replace(">", "&gt;")
        if len(tool_output) > 300:
            tool_out_preview += "…"

        tool_input_str = ""
        if tool_input:
            ti = str(tool_input)[:200].replace("<", "&lt;").replace(">", "&gt;")
            tool_input_str = f'<div class="tool-input">{ti}</div>'

        # Natural-language step summary (always shown)
        summary_text = _step_summary(t).replace("<", "&lt;").replace(">", "&gt;")
        summary_cls = "step-summary-err" if not tool_success else "step-summary"

        # Agent reasoning (full text, collapsible — only shown when model emitted text)
        reasoning_html = ""
        if agent_text:
            safe_text = agent_text[:1000].replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")
            if len(agent_text) > 1000:
                safe_text += "…"
            reasoning_html = f"""
<details class="reasoning">
  <summary>Full reasoning</summary>
  <div class="reasoning-body">{safe_text}</div>
</details>"""

        step_cards += f"""
<div class="step-card">
  <div class="step-header">
    <span class="step-num">Step {t.step_number}</span>
    {cp_badge}
    <span class="step-url muted" title="{page_url}">{page_title or page_url[:60]}</span>
  </div>
  <div class="{summary_cls}">{summary_text}</div>
  <div class="step-body">
    {img_html}
    <div class="step-info">
      <div class="tool-row {tool_status_cls}">
        <strong>{t.tool_name or "—"}</strong>
        {"✓" if tool_success else "✗"}
      </div>
      {tool_input_str}
      <div class="tool-output">{tool_out_preview}</div>
      <div class="step-meta">
        <span>{t.input_tokens:,} in / {t.output_tokens:,} out tokens</span>
        <span>{t.tool_execution_latency_ms:.0f}ms</span>
        <span>${t.estimated_cost_usd:.4f}</span>
      </div>
      {reasoning_html}
    </div>
  </div>
</div>"""

    termination_section = (
        f'<h2>Termination</h2><p class="muted">{result.termination_reason}</p>'
        if result.termination_reason else ""
    )

    # ── Full HTML ─────────────────────────────────────────────────────────────
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Hawkeye Report — {result.test_name}</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; }}
  body {{ font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 40px auto; padding: 0 20px; color: #1f2937; background: #f9fafb; }}
  h1 {{ font-size: 1.4rem; margin-bottom: 4px; }}
  h2 {{ font-size: 1rem; font-weight: 600; margin: 28px 0 10px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }}
  .badge {{ display: inline-block; padding: 3px 10px; border-radius: 9999px; color: #fff; font-weight: 600; font-size: 0.8rem; background: {status_color}; vertical-align: middle; }}
  .meta {{ color: #6b7280; font-size: 0.875rem; margin: 8px 0 20px; display: flex; flex-wrap: wrap; gap: 16px; }}
  .muted {{ color: #9ca3af; font-size: 0.82rem; }}

  /* Goal */
  .goal-text {{ background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 16px; font-size: 0.9rem; line-height: 1.6; margin-bottom: 14px; }}

  /* Checkpoints grid */
  .cp-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; margin-bottom: 8px; }}
  .cp-card {{ border-radius: 8px; padding: 12px 14px; border: 1px solid; font-size: 0.82rem; }}
  .cp-done  {{ background: #f0fdf4; border-color: #86efac; }}
  .cp-pending {{ background: #fafafa; border-color: #e5e7eb; }}
  .cp-header {{ display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }}
  .cp-icon {{ font-size: 1rem; }}
  .cp-done .cp-icon {{ color: #22c55e; }}
  .cp-desc {{ color: #374151; line-height: 1.4; margin-bottom: 4px; }}
  .cp-sig {{ color: #6b7280; font-style: italic; }}

  /* Assertions table */
  table {{ width: 100%; border-collapse: collapse; font-size: 0.85rem; background: #fff; border-radius: 8px; overflow: hidden; border: 1px solid #e5e7eb; margin-bottom: 8px; }}
  th {{ text-align: left; padding: 8px 12px; background: #f3f4f6; border-bottom: 2px solid #e5e7eb; }}
  td {{ padding: 7px 12px; border-bottom: 1px solid #f3f4f6; }}
  tr:last-child td {{ border-bottom: none; }}

  /* Step cards */
  .step-card {{ background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; margin-bottom: 14px; overflow: hidden; }}
  .step-header {{ display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 14px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; }}
  .step-summary {{ padding: 8px 14px; font-size: 0.85rem; color: #1f2937; background: #f0f9ff; border-bottom: 1px solid #bae6fd; }}
  .step-summary-err {{ padding: 8px 14px; font-size: 0.85rem; color: #7f1d1d; background: #fff1f2; border-bottom: 1px solid #fecdd3; }}
  .step-num {{ font-weight: 700; color: #1e40af; background: #dbeafe; padding: 2px 8px; border-radius: 12px; font-size: 0.8rem; }}
  .step-cp {{ background: #fef9c3; color: #92400e; padding: 2px 8px; border-radius: 12px; font-size: 0.78rem; }}
  .step-cp-done {{ color: #15803d; font-size: 0.78rem; }}
  .step-url {{ margin-left: auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 260px; }}
  .step-body {{ display: flex; gap: 0; }}

  /* Screenshot */
  .step-screenshot {{ flex: 0 0 280px; border-right: 1px solid #e5e7eb; cursor: zoom-in; position: relative; overflow: hidden; background: #000; max-height: 220px; }}
  .step-screenshot img {{ width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; transition: opacity .15s; }}
  .step-screenshot:hover img {{ opacity: 0.9; }}
  .screenshot-hint {{ position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,.5); color: #fff; text-align: center; font-size: 0.72rem; padding: 3px; opacity: 0; transition: opacity .2s; }}
  .step-screenshot:hover .screenshot-hint {{ opacity: 1; }}

  /* Step info */
  .step-info {{ flex: 1; padding: 12px 14px; font-size: 0.83rem; display: flex; flex-direction: column; gap: 6px; }}
  .tool-row {{ font-size: 0.9rem; }}
  .tool-ok {{ color: #15803d; }}
  .tool-err {{ color: #dc2626; }}
  .tool-input {{ color: #6b7280; font-family: monospace; font-size: 0.78rem; background: #f8fafc; padding: 4px 6px; border-radius: 4px; word-break: break-all; }}
  .tool-output {{ color: #374151; font-size: 0.8rem; background: #f3f4f6; padding: 6px 8px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; max-height: 100px; overflow-y: auto; }}
  .step-meta {{ display: flex; gap: 14px; color: #9ca3af; font-size: 0.78rem; margin-top: 2px; }}

  /* Agent reasoning */
  details.reasoning {{ margin-top: 4px; }}
  details.reasoning summary {{ cursor: pointer; color: #6b7280; font-size: 0.8rem; user-select: none; }}
  .reasoning-body {{ margin-top: 6px; padding: 8px 10px; background: #fafafa; border-radius: 6px; font-size: 0.8rem; line-height: 1.5; color: #374151; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }}

  /* Lightbox */
  #lightbox {{ display: none; position: fixed; inset: 0; background: rgba(0,0,0,.85); z-index: 9999; align-items: center; justify-content: center; cursor: zoom-out; }}
  #lightbox.open {{ display: flex; }}
  #lightbox img {{ max-width: 90vw; max-height: 90vh; border-radius: 6px; box-shadow: 0 25px 60px rgba(0,0,0,.5); }}

  @media (max-width: 600px) {{
    .step-body {{ flex-direction: column; }}
    .step-screenshot {{ flex: none; max-height: 180px; border-right: none; border-bottom: 1px solid #e5e7eb; }}
  }}
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
  <span>Errors: {result.error_count}</span>
  <span>Tool calls: {result.tool_call_count}</span>
</div>

<h2>Test Plan</h2>
{plan_html}
{assertions_section}

<h2>Steps ({result.total_steps})</h2>
{step_cards}
{termination_section}

<!-- Lightbox -->
<div id="lightbox" onclick="closeLightbox()">
  <img id="lightbox-img" src="" alt="screenshot">
</div>

<script>
function openLightbox(imgId) {{
  var src = document.getElementById(imgId).src;
  document.getElementById('lightbox-img').src = src;
  document.getElementById('lightbox').classList.add('open');
}}
function closeLightbox() {{
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}}
document.addEventListener('keydown', function(e) {{
  if (e.key === 'Escape') closeLightbox();
}});
</script>
</body>
</html>"""

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "report.html"
    path.write_text(html, encoding="utf-8")
    return path
