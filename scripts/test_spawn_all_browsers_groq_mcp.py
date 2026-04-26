#!/usr/bin/env python3
"""
Spawn sandbox browsers, then run a small MCP-driven action flow.

What it does:
- Spawns sandbox container(s) using Backend/hawkeye_sandbox
- For chromium-family sandboxes (chromium/chrome/msedge), connects via Playwright MCP over CDP
- Uses Groq (OpenAI-compatible) to plan MCP tool calls (navigate -> scroll -> screenshot)

Prereqs:
- Docker Desktop running
- Node.js + npx available
- GROQ_API_KEY set in environment

Run:
  python scripts/test_spawn_all_browsers_groq_mcp.py --url "https://example.com" --out-dir artifacts --browser chromium
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple


# Allow running from repo root without installation.
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(REPO_ROOT, "Backend"))

from hawkeye_sandbox import SandboxConfig, SandboxManager  # noqa: E402


MCP_PROTOCOL_VERSION = "2024-11-05"

def log(msg: str) -> None:
    print(msg, flush=True)

def load_dotenv_if_present(repo_root: str) -> None:
    """
    Lightweight .env loader (no external deps).
    Only sets keys that are not already present in the environment.
    """
    path = os.path.join(repo_root, ".env")
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith("#") or "=" not in s:
                    continue
                k, v = s.split("=", 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        # Best-effort; script will still fail if key is missing.
        return


def maybe_open(target: str) -> None:
    """Open a URL/file on macOS; no-op elsewhere."""
    if sys.platform == "darwin":
        subprocess.run(["open", target], check=False)


def groq_chat(
    api_key: str,
    model: str,
    messages: List[Dict[str, str]],
    base_url: str = "https://api.groq.com/openai/v1",
    timeout_s: int = 180,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    data = json.dumps(
        {
            "model": model,
            "messages": messages,
            "temperature": 0,
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "hawkeye-sandbox-test/0.1",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
        raise RuntimeError(f"Groq HTTP {e.code}: {body[:800].strip()}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Groq connection error: {e}") from e

    return payload["choices"][0]["message"]["content"]


def extract_first_json_object(text: str) -> Dict[str, Any]:
    start = text.find("{")
    if start == -1:
        raise ValueError(f"No JSON found in LLM output:\n{text}")
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
        else:
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(text[start : i + 1])
    raise ValueError("Unterminated JSON in LLM output.")


class McpStdioClient:
    def __init__(self, command: List[str]) -> None:
        self._proc = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        assert self._proc.stdin and self._proc.stdout
        self._stdin = self._proc.stdin
        self._stdout = self._proc.stdout
        self._stderr = self._proc.stderr
        self._next_id = 1

    def close(self) -> None:
        if self._proc.poll() is None:
            self._proc.terminate()
            try:
                self._proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._proc.kill()

    def _request(self, method: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        rid = self._next_id
        self._next_id += 1
        msg: Dict[str, Any] = {"jsonrpc": "2.0", "id": rid, "method": method}
        if params is not None:
            msg["params"] = params
        self._stdin.write(json.dumps(msg) + "\n")
        self._stdin.flush()

        while True:
            line = self._stdout.readline()
            if not line:
                err = ""
                if self._stderr:
                    try:
                        err = self._stderr.read() or ""
                    except Exception:
                        err = ""
                raise RuntimeError(f"MCP server exited unexpectedly.\nstderr:\n{err}")
            try:
                resp = json.loads(line)
            except json.JSONDecodeError:
                continue
            if resp.get("id") == rid:
                if "error" in resp:
                    raise RuntimeError(f"MCP error calling {method}: {resp['error']}")
                return resp["result"]

    def initialize(self) -> None:
        self._request(
            "initialize",
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "hawkeye-sandbox-test", "version": "0.1.0"},
            },
        )
        self._stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
        self._stdin.flush()

    def list_tools(self) -> List[Dict[str, Any]]:
        res = self._request("tools/list", {})
        return res.get("tools", [])

    def call_tool(self, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        return self._request("tools/call", {"name": name, "arguments": arguments})


def tool_brief(tools: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for t in tools:
        out.append(
            {
                "name": t.get("name"),
                "description": (t.get("description") or "")[:200],
                "inputSchema": t.get("inputSchema"),
            }
        )
    return out


def run_llm_planned_mcp_flow(*, cdp_url: str, target_url: str, screenshot_path: str, groq_key: str, model: str) -> None:
    log(f"[mcp] starting Playwright MCP against CDP {cdp_url}")
    cmd = ["npx", "-y", "@playwright/mcp@latest", f"--cdp-endpoint={cdp_url}"]
    client = McpStdioClient(cmd)
    try:
        client.initialize()
        log("[mcp] initialized")
        tools = client.list_tools()
        log(f"[mcp] tools available: {len(tools)}")

        prompt = f"""
You control a browser via Playwright MCP tools.

Goal:
1) Navigate to: {target_url}
2) Scroll down a few times.
3) Take a screenshot saved to: {screenshot_path}

Return ONLY JSON in this shape:
{{"calls":[{{"tool":"<tool_name>","arguments":{{...}}}}, ...]}}

Available tools:
{json.dumps(tool_brief(tools), indent=2)}
""".strip()

        log(f"[llm] requesting plan from Groq model={model}")
        llm_text = groq_chat(
            api_key=groq_key,
            model=model,
            messages=[
                {"role": "system", "content": "Return JSON only. No markdown."},
                {"role": "user", "content": prompt},
            ],
        )
        log(f"[llm] received response ({len(llm_text)} chars), parsing JSON plan")
        plan = extract_first_json_object(llm_text)
        calls = plan.get("calls", [])
        if not isinstance(calls, list) or not calls:
            raise RuntimeError(f"Bad plan from LLM:\n{llm_text}")
        log(f"[llm] plan steps: {len(calls)}")

        for step in calls:
            tool = step.get("tool")
            args = step.get("arguments", {})
            if not isinstance(tool, str) or not isinstance(args, dict):
                raise RuntimeError(f"Bad step: {step}")

            # Ensure screenshot has a path.
            if "screenshot" in tool.lower() and not any(k in args for k in ("path", "file", "filename", "outputPath")):
                args = dict(args)
                args["path"] = screenshot_path

            log(f"[mcp] call {tool}({args})")
            client.call_tool(tool, args)
        log(f"[mcp] done; expected screenshot at {screenshot_path}")
    finally:
        client.close()
        log("[mcp] closed")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out-dir", default="artifacts")
    ap.add_argument("--model", default="openai/gpt-oss-20b")
    ap.add_argument("--browser", default="chromium", choices=["chromium", "chrome", "msedge"])
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--open", action="store_true", help="Auto-open noVNC URL and screenshot (macOS)")
    args = ap.parse_args()

    # Make the script usable without manual `source .env`.
    load_dotenv_if_present(REPO_ROOT)

    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise SystemExit(
            "Missing GROQ_API_KEY. Put it in repo-root .env or export it before running."
        )

    out_dir = os.path.abspath(args.out_dir)
    os.makedirs(out_dir, exist_ok=True)

    mgr = SandboxManager()
    log(f"[spawn] spawning browser={args.browser} url={args.url}")
    handle = mgr.spawn(
        cfg=SandboxConfig(
            url=args.url,
            browser=args.browser,
            width=args.width,
            height=args.height,
        )
    )
    log(f"[spawn] container={handle.container_name}")
    log(f"[spawn] noVNC={handle.novnc_url}")
    log(f"[spawn] CDP={handle.cdp_url or '-'}")
    if args.open:
        maybe_open(handle.novnc_url)

    if not handle.cdp_url:
        raise SystemExit("This browser did not expose a CDP URL; choose chromium/chrome/msedge.")

    shot = os.path.join(out_dir, f"{args.browser}.png")
    run_llm_planned_mcp_flow(
        cdp_url=handle.cdp_url,
        target_url=args.url,
        screenshot_path=shot,
        groq_key=groq_key,
        model=args.model,
    )
    log(f"[ok] saved screenshot: {shot}")
    if args.open:
        maybe_open(shot)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

