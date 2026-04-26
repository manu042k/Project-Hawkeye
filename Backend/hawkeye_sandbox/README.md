# Hawkeye Sandbox

Spawn isolated, viewable browser sandboxes (one container per run).

Each sandbox container boots:
- an XFCE desktop on Xvfb
- a **view-only** VNC stream bridged to **noVNC**
- a headed Playwright browser (`chromium`, `firefox`, `webkit`, plus `chrome`/`msedge` aliases)

The API returns a **noVNC URL** you can open in your host browser to watch the run.

## Prereqs

- Docker Desktop running
- `docker` CLI available

## Build the sandbox image (once)

From repo root:

```bash
docker compose build hawkeye-sandbox
```

## Example: spawn one sandbox

```bash
python Backend/hawkeye_sandbox/examples/spawn_one.py --url "https://example.com"
```

It prints a `noVNC` URL you can open.

Record a short MP4 (saved under `artifacts/`):

```bash
python Backend/hawkeye_sandbox/examples/spawn_one.py --url "https://example.com" --record
```

## Example: spawn all supported browsers

```bash
python Backend/hawkeye_sandbox/examples/spawn_all.py --url "https://example.com"
```

Record one MP4 per container (saved under `artifacts/`):

```bash
python Backend/hawkeye_sandbox/examples/spawn_all.py --url "https://example.com" --record
```

## MCP (control multiple spawned containers)

When you spawn **multiple** containers, each one gets a different **CDP URL** (random host port).
To control them all without clashes, generate a per-container MCP config file:

```bash
python Backend/hawkeye_sandbox/examples/spawn_all_and_write_mcp.py
```

This writes `Backend/hawkeye_sandbox/generated.mcp.sandboxes.json` with entries like:
- `chrome-devtools-<container>`
- `playwright-<container>`

Then in Cursor (local dev), copy its `mcpServers` block into your Cursor MCP settings, or into
your own `.cursor/mcp.json`. In deployment, you can load this JSON from your service and
use it to start MCP servers programmatically.

## CLI

Spawn one sandbox:

```bash
python -m Backend.hawkeye_sandbox.cli --url "https://example.com" --browser chromium
```

Spawn one sandbox + record to `artifacts/sandbox-run.mp4`:

```bash
python -m Backend.hawkeye_sandbox.cli --url "https://example.com" --browser chromium --record
```

Spawn all:

```bash
python -m Backend.hawkeye_sandbox.cli --url "https://example.com" --all
```

## Recording notes

- Recording uses `ffmpeg` inside the container to capture `DISPLAY=:99` to an MP4.
- Works only if the sandbox image includes `ffmpeg` (it does by default in this repo).

## Notes

- **CDP URL** is only returned for chromium-family browsers (`chromium`, `chrome`, `msedge`).
- On Linux Arm64, Playwright cannot run the real `chrome`/`msedge` channel binaries; those
  values **fall back to bundled Chromium** automatically.

