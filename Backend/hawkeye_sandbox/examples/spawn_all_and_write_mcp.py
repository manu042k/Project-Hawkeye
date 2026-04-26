import argparse
import os
import sys
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from hawkeye_sandbox import SandboxManager, write_mcp_json  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://example.com")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--record", action="store_true", help="Record each CDP-capable container to artifacts/mcp-<browser>.mp4")
    args = ap.parse_args()

    mgr = SandboxManager()
    results = mgr.spawn_all(url=args.url, width=args.width, height=args.height)

    handles = [h for _, h in results if h.cdp_url]
    # Default to writing inside the package so it's deployable outside Cursor.
    out_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "generated.mcp.sandboxes.json")
    )
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    write_mcp_json(out_path, handles)

    print("Wrote:", out_path)
    for browser, h in results:
        print(browser, h.novnc_url, h.cdp_url or "-")

    if args.record:
        os.makedirs("artifacts", exist_ok=True)
        for browser, h in results:
            if not h.cdp_url:
                continue
            hh = mgr.start_recording(h, width=args.width, height=args.height)
            time.sleep(5)
            mgr.stop_recording(hh)
            out = mgr.fetch_recording(hh, host_path=os.path.join("artifacts", f"mcp-{browser}.mp4"))
            print("recording:", browser, out)
        # Stop all containers we spawned.
        for _, h in results:
            mgr.stop(h)


if __name__ == "__main__":
    main()

