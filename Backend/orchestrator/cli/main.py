"""Hawkeye CLI — agentic test runner."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

import click


@click.group()
def cli() -> None:
    """Hawkeye — AI-powered agentic test runner."""

# Ensure Backend is on path for hawkeye_sandbox import.
_BACKEND = Path(__file__).parent.parent.parent
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))


@cli.command()
@click.option("--test", "test_path", required=True, type=click.Path(exists=True),
              help="Path to YAML or JSON test case file.")
@click.option("--model", default="nvidia:moonshotai/kimi-k2.6", show_default=True,
              help=("LLM model string: 'nvidia:<name>', 'openrouter:<name>', "
                    "'ollama:<name>', 'vllm:<name>', 'groq:<name>'. "
                    "Examples: nvidia:moonshotai/kimi-k2.6, ollama:llama3.2, "
                    "vllm:Qwen/Qwen2.5-VL-3B-Instruct."))
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
@click.option("--record", is_flag=True, default=False,
              help="Record the browser session to MP4 in the output directory.")
@click.option("--db-url", default=None, envvar="HAWKEYE_DB_URL",
              help="PostgreSQL DSN for persistence (postgres://user:pass@host/db). Also reads HAWKEYE_DB_URL env var.")
@click.option("--figma-url", default=None, envvar="FIGMA_URL",
              help="Figma file URL for visual design diff (Pass 2).")
@click.option("--figma-token", default=None, envvar="FIGMA_TOKEN",
              help="Figma personal access token.")
@click.option("--phoenix-endpoint", default=None, envvar="PHOENIX_COLLECTOR_ENDPOINT",
              help=(
                  "Arize Phoenix OTLP collector URL (e.g. http://localhost:6006). "
                  "Set PHOENIX_COLLECTOR_ENDPOINT env var to enable tracing. "
                  "Requires: uv pip install 'project-hawkeye[eval]'"
              ))
@click.option("--rate-limit", default=None, type=int, envvar="HAWKEYE_RATE_LIMIT",
              help=(
                  "Max LLM requests per minute. Auto-set to 40 for nvidia: models. "
                  "Set 0 to disable. Also reads HAWKEYE_RATE_LIMIT env var."
              ))
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
    record: bool,
    db_url: str | None,
    figma_url: str | None,
    figma_token: str | None,
    phoenix_endpoint: str | None,
    rate_limit: int | None,
) -> None:
    """Run a single test case."""
    from orchestrator.loader.yaml_loader import load_test_case
    from orchestrator.models.test_case import TestCaseValidationError
    from orchestrator.llm.provider import get_llm
    from orchestrator.llm.rate_limiter import auto_configure_for_model, configure as configure_rl
    from orchestrator.runner.run_manager import RunManager
    from hawkeye_sandbox import SandboxManager

    if db_url:
        os.environ["HAWKEYE_DB_URL"] = db_url
    if figma_token:
        os.environ["FIGMA_TOKEN"] = figma_token
    if figma_url:
        os.environ["FIGMA_URL"] = figma_url
    if phoenix_endpoint:
        os.environ["PHOENIX_COLLECTOR_ENDPOINT"] = phoenix_endpoint

    # Configure rate limiter before any LLM calls.
    if rate_limit is not None and rate_limit > 0:
        configure_rl(rate_limit)
        click.echo(f"[info] Rate limit: {rate_limit} RPM")
    elif rate_limit != 0:
        limiter = auto_configure_for_model(model)
        if limiter:
            click.echo(f"[info] Rate limit: {limiter.requests_per_minute} RPM (auto-detected for {model.split(':')[0]})")

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
        llm = get_llm(model, ollama_host=ollama_host, groq_api_key=groq_key)
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
        record=record,
        figma_url=figma_url,
        figma_token=figma_token,
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
        click.echo(f"     goal:        {tc.goal.objective[:80].strip()!r}")
        click.echo(f"     steps:       {'guided (' + str(len(tc.goal.steps.checkpoints)) + ' checkpoints)' if tc.goal.steps else 'unguided'}")
        click.echo(f"     assertions:  {len(tc.assertions)}")
        click.echo(f"     constraints: max_steps={tc.goal.constraints.max_steps}, "
                   f"timeout={tc.goal.constraints.timeout_seconds}s")
    except (FileNotFoundError, TestCaseValidationError) as exc:
        click.echo(f"[invalid] {exc}", err=True)
        sys.exit(3)


@cli.command("list-tools")
@click.option("--model", default="openrouter:openai/gpt-4o", help="LLM model (for tool schema display).")
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


@cli.command("eval")
@click.option(
    "--benchmark",
    type=click.Choice(["webvoyager", "mind2web", "custom"]),
    default="custom",
    show_default=True,
    help="Public benchmark dataset to evaluate against, or 'custom' for local YAML files.",
)
@click.option(
    "--test", "test_paths",
    multiple=True,
    type=click.Path(exists=True),
    help="YAML test case paths (required when --benchmark custom). May be repeated.",
)
@click.option("--model", default="nvidia:google/gemma-4-31b-it", show_default=True,
              help="LLM model string (same format as 'run' command).")
@click.option("--runs", "repetitions", default=1, show_default=True, type=int,
              help="Number of repetitions per task.")
@click.option("--limit", default=None, type=int,
              help="Max tasks to load from the benchmark dataset (WebVoyager / Mind2Web).")
@click.option("--sites", default=None,
              help="Comma-separated site filter for WebVoyager (e.g. 'BBC News,GitHub,ArXiv').")
@click.option("--domains", default=None,
              help="Comma-separated domain filter for Mind2Web (e.g. 'travel,shopping').")
@click.option("--mind2web-split", default="test", show_default=True,
              help="Mind2Web dataset split: train | test | test_domain | test_task | test_website.")
@click.option("--max-steps", default=None, type=int,
              help="Override max_steps for all tasks.")
@click.option("--timeout", default=None, type=int,
              help="Override timeout_seconds for all tasks.")
@click.option("--sandbox-image", default="project-hawkeye-hawkeye-sandbox:latest",
              show_default=True, help="Docker image for sandbox containers.")
@click.option("--output-dir", default="eval_results", show_default=True,
              help="Directory for eval.jsonl and per-run artifacts.")
@click.option("--cache-dir", default=None,
              help="Directory to cache downloaded dataset files.")
@click.option("--rate-limit", default=None, type=int, envvar="HAWKEYE_RATE_LIMIT",
              help=(
                  "Max LLM requests per minute. Auto-set to 40 for nvidia: models. "
                  "Set 0 to disable. Also reads HAWKEYE_RATE_LIMIT env var."
              ))
@click.option("--ollama-host", default="http://localhost:11434", show_default=True,
              envvar="OLLAMA_HOST")
@click.option("--verbose", "-v", is_flag=True, default=False)
def eval_cmd(
    benchmark: str,
    test_paths: tuple[str, ...],
    model: str,
    repetitions: int,
    limit: int | None,
    sites: str | None,
    domains: str | None,
    mind2web_split: str,
    max_steps: int | None,
    timeout: int | None,
    sandbox_image: str,
    output_dir: str,
    cache_dir: str | None,
    rate_limit: int | None,
    ollama_host: str,
    verbose: bool,
) -> None:
    """Evaluate the Hawkeye agent against a benchmark dataset.

    \b
    Examples:
      # Run custom eval-dataset-v1 test cases with NVIDIA Gemma 4:
      python -m orchestrator eval --benchmark custom \\
        --test orchestrator/test_cases/hackernews_comments.yaml \\
        --test orchestrator/test_cases/todomvc_react.yaml

      # Run 10 WebVoyager tasks filtered to BBC News and GitHub:
      python -m orchestrator eval --benchmark webvoyager \\
        --limit 10 --sites "BBC News,GitHub"

      # Run 20 Mind2Web test tasks, 2 repetitions each:
      python -m orchestrator eval --benchmark mind2web \\
        --limit 20 --runs 2 --mind2web-split test
    """
    import asyncio
    import os
    from pathlib import Path as _Path

    from orchestrator.eval.runner import EvalRunner
    from orchestrator.eval.report import print_summary_table, write_jsonl
    from orchestrator.llm.provider import get_llm
    from orchestrator.llm.rate_limiter import auto_configure_for_model, configure as configure_rl
    from orchestrator.models.test_case import TestCase

    # ------------------------------------------------------------------
    # Rate limiter — must be configured before any LLM calls
    # ------------------------------------------------------------------
    if rate_limit is not None and rate_limit > 0:
        configure_rl(rate_limit)
        click.echo(f"[info] Rate limit: {rate_limit} RPM (explicit)")
    elif rate_limit != 0:
        limiter = auto_configure_for_model(model)
        if limiter:
            click.echo(
                f"[info] Rate limit: {limiter.requests_per_minute} RPM "
                f"(auto-detected for {model.split(':')[0]}:) "
                f"— min {limiter.min_interval_s:.1f}s between LLM calls"
            )

    # ------------------------------------------------------------------
    # Build LLM
    # ------------------------------------------------------------------
    try:
        groq_key = os.environ.get("GROQ_API_KEY")
        llm = get_llm(model, ollama_host=ollama_host, groq_api_key=groq_key)
    except ValueError as exc:
        click.echo(f"[error] {exc}", err=True)
        sys.exit(3)

    cache_path = _Path(cache_dir) if cache_dir else _Path(output_dir) / ".cache"

    # ------------------------------------------------------------------
    # Load test cases
    # ------------------------------------------------------------------
    test_cases: list[TestCase] = []

    if benchmark == "custom":
        if not test_paths:
            click.echo(
                "[error] --benchmark custom requires at least one --test <yaml> argument.",
                err=True,
            )
            sys.exit(3)
        from orchestrator.loader.yaml_loader import load_test_case
        from orchestrator.models.test_case import TestCaseValidationError
        for p in test_paths:
            try:
                test_cases.append(load_test_case(p))
            except (FileNotFoundError, TestCaseValidationError) as exc:
                click.echo(f"[error] {exc}", err=True)
                sys.exit(3)

    elif benchmark == "webvoyager":
        from orchestrator.eval.adapters.webvoyager import fetch_tasks
        from orchestrator.eval.adapters.base import to_test_case as _to_tc
        site_filter = [s.strip() for s in sites.split(",")] if sites else None
        tasks = fetch_tasks(
            cache_path=cache_path / "webvoyager_tasks.json",
            limit=limit,
            sites=site_filter,
        )
        if not tasks:
            click.echo("[error] No WebVoyager tasks matched the given filters.", err=True)
            sys.exit(1)
        test_cases = [_to_tc(t, max_steps=max_steps or 20, timeout=timeout or 180) for t in tasks]

    elif benchmark == "mind2web":
        from orchestrator.eval.adapters.mind2web import fetch_tasks
        from orchestrator.eval.adapters.base import to_test_case as _to_tc
        domain_filter = [d.strip() for d in domains.split(",")] if domains else None
        try:
            tasks = fetch_tasks(
                split=mind2web_split,
                limit=limit,
                domains=domain_filter,
                cache_dir=cache_path,
            )
        except ImportError as exc:
            click.echo(f"[error] {exc}", err=True)
            sys.exit(3)
        if not tasks:
            click.echo("[error] No Mind2Web tasks matched the given filters.", err=True)
            sys.exit(1)
        test_cases = [_to_tc(t, max_steps=max_steps or 25, timeout=timeout or 240) for t in tasks]

    click.echo(f"[info] Loaded {len(test_cases)} task(s) for benchmark '{benchmark}'.")

    # ------------------------------------------------------------------
    # Run eval
    # ------------------------------------------------------------------
    runner = EvalRunner(
        llm=llm,
        model_name=model,
        sandbox_image=sandbox_image,
        output_dir=_Path(output_dir),
        verbose=verbose,
        max_steps_override=max_steps,
        timeout_override=timeout,
    )

    result = asyncio.run(
        runner.run_benchmark(benchmark, test_cases, repetitions=repetitions)
    )

    # ------------------------------------------------------------------
    # Report
    # ------------------------------------------------------------------
    print_summary_table(result)
    jsonl_path = write_jsonl(result, _Path(output_dir))
    click.echo(f"\n[ok] Results written to {jsonl_path}")

    # Exit 1 if overall pass rate is 0 (all tasks failed).
    if result.overall_pass_rate == 0.0 and result.total_runs > 0:
        sys.exit(1)


@cli.command("init-db")
@click.option("--db-url", required=True, envvar="HAWKEYE_DB_URL",
              help="PostgreSQL DSN (postgres://user:pass@host/db).")
def init_db(db_url: str) -> None:
    """Apply schema.sql to the database."""
    import asyncio
    import asyncpg
    schema = (Path(__file__).parent.parent / "db" / "schema.sql").read_text()

    async def _apply() -> None:
        conn = await asyncpg.connect(db_url)
        await conn.execute(schema)
        await conn.close()
        click.echo("[ok] Schema applied.")

    asyncio.run(_apply())
