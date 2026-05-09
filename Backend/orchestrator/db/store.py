"""Data-access layer for Hawkeye PostgreSQL persistence."""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from orchestrator.db.connection import get_pool

logger = logging.getLogger(__name__)


async def upsert_test_case(test_case) -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO test_cases (id, name, suite, priority, tags, spec, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, NOW())
                ON CONFLICT (id) DO UPDATE
                  SET name=EXCLUDED.name, suite=EXCLUDED.suite,
                      priority=EXCLUDED.priority, tags=EXCLUDED.tags,
                      spec=EXCLUDED.spec, updated_at=NOW()
                """,
                test_case.id,
                test_case.name,
                test_case.suite,
                test_case.priority,
                json.dumps(test_case.tags),
                json.dumps(test_case.model_dump()),
            )
    except Exception as exc:
        logger.warning("DB upsert_test_case failed (non-fatal): %s", exc)


async def create_run(run_id: str, test_case_id: str, browser: str, model: str,
                     novnc_url: str = "", container_name: str = "") -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO test_runs
                  (id, test_case_id, status, browser, model, novnc_url, container_name)
                VALUES ($1, $2, 'running', $3, $4, $5, $6)
                ON CONFLICT (id) DO NOTHING
                """,
                run_id, test_case_id, browser, model, novnc_url, container_name,
            )
    except Exception as exc:
        logger.warning("DB create_run failed (non-fatal): %s", exc)


async def update_run_status(run_id: str, status: str, duration_ms: int,
                             total_steps: int, total_tokens: int,
                             total_tool_calls: int, estimated_cost_usd: float,
                             steps_completed: list, termination_reason: str | None) -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE test_runs SET
                  status=$2, finished_at=NOW(), duration_ms=$3,
                  total_steps=$4, total_tokens=$5, total_tool_calls=$6,
                  estimated_cost_usd=$7, steps_completed=$8, termination_reason=$9
                WHERE id=$1
                """,
                run_id, status, duration_ms, total_steps, total_tokens,
                total_tool_calls, estimated_cost_usd,
                json.dumps(steps_completed), termination_reason,
            )
    except Exception as exc:
        logger.warning("DB update_run_status failed (non-fatal): %s", exc)


async def insert_step_trace(run_id: str, trace) -> None:
    try:
        pool = await get_pool()
        tool_input = json.dumps(trace.tool_input) if trace.tool_input else None
        tool_output = (trace.tool_output or "")[:8000]  # cap at 8KB
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO agent_traces (
                  id, run_id, step_number, checkpoint_id, timestamp, completed_at,
                  model, input_tokens, output_tokens, total_tokens,
                  llm_latency_ms, tool_execution_latency_ms, wait_for_stable_ms,
                  total_step_latency_ms, tool_name, tool_source,
                  tool_input, tool_output, tool_success, tool_error,
                  page_url, page_title, estimated_cost_usd
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                  $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
                  $21, $22, $23
                )
                ON CONFLICT (id) DO NOTHING
                """,
                str(uuid.uuid4()), run_id, trace.step_number,
                getattr(trace, "checkpoint_id", None),
                datetime.fromtimestamp(trace.timestamp, tz=timezone.utc),
                datetime.fromtimestamp(trace.completed_at, tz=timezone.utc) if trace.completed_at else None,
                getattr(trace, "model", None),
                trace.input_tokens, trace.output_tokens,
                trace.input_tokens + trace.output_tokens,
                int(trace.llm_latency_ms), int(trace.tool_execution_latency_ms),
                int(trace.wait_for_stable_ms),
                int(trace.total_step_latency_ms) if trace.total_step_latency_ms else 0,
                trace.tool_name, trace.tool_source,
                tool_input, tool_output, trace.tool_success,
                trace.tool_error,
                trace.page_url, trace.page_title,
                trace.estimated_cost_usd,
            )
    except Exception as exc:
        logger.warning("DB insert_step_trace failed (non-fatal): %s", exc)


async def insert_assertion_results(run_id: str, results: list) -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            for r in results:
                await conn.execute(
                    """
                    INSERT INTO test_results
                      (id, run_id, assertion_id, assertion_type, description, passed, details)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id) DO NOTHING
                    """,
                    str(uuid.uuid4()), run_id,
                    r.assertion_id, r.type, r.description,
                    r.passed, r.details,
                )
    except Exception as exc:
        logger.warning("DB insert_assertion_results failed (non-fatal): %s", exc)


async def insert_run_summary(run_id: str, summary) -> None:
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO run_traces_summary (
                  run_id, total_input_tokens, total_output_tokens, total_tokens,
                  total_llm_calls, total_tool_calls, total_mcp_tool_calls,
                  total_custom_tool_calls, failed_tool_calls,
                  total_run_duration_ms, total_llm_latency_ms, total_tool_latency_ms,
                  avg_step_latency_ms, total_estimated_cost_usd, peak_context_tokens
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                  $11, $12, $13, $14, $15
                )
                ON CONFLICT (run_id) DO UPDATE SET
                  total_input_tokens=EXCLUDED.total_input_tokens,
                  total_output_tokens=EXCLUDED.total_output_tokens,
                  total_tokens=EXCLUDED.total_tokens,
                  total_estimated_cost_usd=EXCLUDED.total_estimated_cost_usd
                """,
                run_id,
                summary.total_input_tokens, summary.total_output_tokens,
                summary.total_input_tokens + summary.total_output_tokens,
                summary.total_steps,  # llm_calls approximated as total_steps
                summary.mcp_tool_calls + summary.custom_tool_calls,
                summary.mcp_tool_calls, summary.custom_tool_calls,
                summary.error_count,
                int(summary.duration_s * 1000),
                int(getattr(summary, "total_llm_latency_ms", 0)),
                int(getattr(summary, "total_tool_latency_ms", 0)),
                int(getattr(summary, "avg_step_latency_ms", 0)),
                summary.total_cost_usd,
                getattr(summary, "peak_context_tokens", 0),
            )
    except Exception as exc:
        logger.warning("DB insert_run_summary failed (non-fatal): %s", exc)
