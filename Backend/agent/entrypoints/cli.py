from __future__ import annotations

import argparse

from ..core.service import AgentRunConfig, AgentService


def main() -> int:
    ap = argparse.ArgumentParser(prog="hawkeye-agent")
    ap.add_argument("--input-json", help="Path to JSON test plan input.")
    ap.add_argument("--objective", help="Task objective for the agent.")
    ap.add_argument("--url", help="Initial URL to open in sandbox browser.")
    ap.add_argument("--model", default="qwen2.5:7b")
    ap.add_argument("--max-steps", type=int, default=12)
    ap.add_argument("--output-dir", default="artifacts/agent-runs")
    ap.add_argument("--browser", default="chromium", choices=["chromium", "chrome", "msedge"])
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--image", default="project-hawkeye-hawkeye-sandbox:latest")
    ap.add_argument("--ollama-host", default="http://127.0.0.1:11434")
    ap.add_argument("--startup-wait-seconds", type=float, default=5.0, help="Delay test start so you can open noVNC.")
    ap.add_argument("--post-run-wait-seconds", type=float, default=0.0, help="Keep container alive after tests for noVNC viewing.")
    args = ap.parse_args()

    svc = AgentService(ollama_host=args.ollama_host)

    if args.input_json:
        summary = svc.run_from_json(
            args.input_json,
            output_dir=args.output_dir,
            image=args.image,
            startup_wait_seconds=args.startup_wait_seconds,
            post_run_wait_seconds=args.post_run_wait_seconds,
        )
    else:
        if not args.objective or not args.url:
            raise SystemExit("Either --input-json or both --objective and --url are required.")
        summary = svc.run(
            AgentRunConfig(
                objective=args.objective,
                start_url=args.url,
                model=args.model,
                max_steps=args.max_steps,
                output_dir=args.output_dir,
                browser=args.browser,
                width=args.width,
                height=args.height,
                image=args.image,
                startup_wait_seconds=args.startup_wait_seconds,
                post_run_wait_seconds=args.post_run_wait_seconds,
            )
        )
    print(f"[agent] status={summary.status}")
    print(f"[agent] noVNC={summary.novnc_url}")
    print(f"[agent] steps={len(summary.steps)}")
    print(f"[agent] final={summary.final_message}")
    return 0 if summary.status == "success" else 1


if __name__ == "__main__":
    raise SystemExit(main())
