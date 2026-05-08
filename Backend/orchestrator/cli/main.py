"""Hawkeye CLI — agentic test runner."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import click

# Ensure Backend is on path for hawkeye_sandbox import.
_BACKEND = Path(__file__).parent.parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@click.group()
def cli() -> None:
    """Hawkeye — AI-powered agentic test runner."""


@cli.command()
@click.option("--test", "test_path", required=True, type=click.Path(exists=True),
              help="Path to YAML or JSON test case file.")
@click.option("--model", default="ollama:qwen3.5:2b", show_default=True,
              help="LLM model: 'ollama:<name>', 'groq:<name>', or 'openrouter:<provider/model>'.")
@click.option("--ollama-host", default="http://localhost:11434", show_default=True,
              envvar="OLLAMA_HOST", help="Ollama base URL.")
@click.option("--browser", default=None,
              help="Override browser from test case (chromium|firefox|webkit).")
@click.option("--max-steps", default=None, type=int,
              help="Override max_steps from test case.")
@click.option("--timeout", default=None, type=int,
              help="Override timeout_seconds from test case.")
@click.option("--sandbox-image", default="project-hawkeye-hawkeye-sandbox:latest",
              show_default=True, help="Docker image for the sandbox container.")
@click.option("--no-sandbox", is_flag=True, default=False,
              help="Skip container spawn; reads CDP URL from HAWKEYE_CDP_URL env var.")
@click.option("--output-dir", default="artifacts", show_default=True,
              help="Directory for trace output and evidence.")
@click.option("--verbose", "-v", is_flag=True, default=False,
              help="Enable verbose output (show LLM reasoning, full snapshots).")
def run(
    test_path: str,
    model: str,
    ollama_host: str,
    browser: str | None,
    max_steps: int | None,
    timeout: int | None,
    sandbox_image: str,
    no_sandbox: bool,
    output_dir: str,
    verbose: bool,
) -> None:
    """Run a single test case."""
    from orchestrator.loader.yaml_loader import load_test_case
    from orchestrator.models.test_case import TestCaseValidationError
    from orchestrator.llm.provider import get_llm
    from orchestrator.runner.run_manager import RunManager
    from hawkeye_sandbox import SandboxManager

    # Load and validate test case.
    try:
        test_case = load_test_case(test_path)
    except (FileNotFoundError, TestCaseValidationError) as exc:
        click.echo(f"[error] {exc}", err=True)
        sys.exit(3)
    except Exception as exc:
        click.echo(f"[error] Failed to parse test case: {exc}", err=True)
        sys.exit(3)

    # Build LLM.
    try:
        groq_key = os.environ.get("GROQ_API_KEY")
        openrouter_key = os.environ.get("OPENROUTER_API_KEY")
        llm = get_llm(
            model,
            ollama_host=ollama_host,
            groq_api_key=groq_key,
            openrouter_api_key=openrouter_key,
        )
    except ValueError as exc:
        click.echo(f"[error] {exc}", err=True)
        sys.exit(3)

    cdp_url_override = os.environ.get("HAWKEYE_CDP_URL") if no_sandbox else None

    manager = RunManager(
        llm=llm,
        sandbox_manager=SandboxManager(),
        sandbox_image=sandbox_image,
        model_name=model,
        verbose=verbose,
    )

    result = asyncio.run(
        manager.run(
            test_case,
            browser_override=browser,
            max_steps_override=max_steps,
            timeout_override=timeout,
            output_dir=Path(output_dir),
            cdp_url_override=cdp_url_override,
        )
    )

    # Exit code reflects test outcome.
    status = result.status
    if status == "passed":
        sys.exit(0)
    elif status in ("failed", "blocked"):
        sys.exit(1)
    else:  # errored, timed_out
        sys.exit(2)


@cli.command()
@click.option("--test", "test_path", required=True, type=click.Path(exists=True),
              help="Path to YAML or JSON test case file.")
def validate(test_path: str) -> None:
    """Validate a test case file without running it."""
    from orchestrator.loader.yaml_loader import load_test_case
    from orchestrator.models.test_case import TestCaseValidationError

    try:
        tc = load_test_case(test_path)
        click.echo(f"[ok] {tc.id}: {tc.name}")
        click.echo(f"     target:      {tc.target.url}  (browser={tc.target.browser})")
        click.echo(f"     goal:        {tc.goal[:80].strip()!r}")
        click.echo(f"     steps:       {'guided (' + str(len(tc.steps.checkpoints)) + ' checkpoints)' if tc.steps else 'unguided'}")
        click.echo(f"     assertions:  {len(tc.assertions)}")
        click.echo(f"     constraints: max_steps={tc.constraints.max_steps}, "
                   f"timeout={tc.constraints.timeout_seconds}s")
    except (FileNotFoundError, TestCaseValidationError) as exc:
        click.echo(f"[invalid] {exc}", err=True)
        sys.exit(3)


@cli.command("list-tools")
@click.option("--model", default="ollama:qwen3.5:2b", help="LLM model (for tool schema display).")
def list_tools(model: str) -> None:
    """Print all available tools (MCP + custom) and their descriptions."""
    from orchestrator.tools.schemas import ALL_CUSTOM_SCHEMAS
    from orchestrator.mcp.tool_adapter import DEFAULT_ALLOWLIST

    click.echo("\n=== Custom Orchestrator Tools ===")
    for schema in ALL_CUSTOM_SCHEMAS:
        click.echo(f"  {schema['name']}")
        click.echo(f"    {schema['description'][:100]}")

    click.echo(f"\n=== Playwright MCP Tools (allowlist: {len(DEFAULT_ALLOWLIST)}) ===")
    for name in sorted(DEFAULT_ALLOWLIST):
        click.echo(f"  {name}")

    click.echo(f"\nTotal: {len(ALL_CUSTOM_SCHEMAS)} custom + {len(DEFAULT_ALLOWLIST)} MCP tools")
