from __future__ import annotations

import argparse
import os

from .sandbox import SandboxConfig, SandboxManager


def main() -> int:
    ap = argparse.ArgumentParser(prog="hawkeye-sandbox")
    ap.add_argument("--url", required=True)
    ap.add_argument("--browser", default="chromium", choices=["chromium", "chrome", "msedge", "firefox", "webkit"])
    ap.add_argument("--all", action="store_true", help="Spawn one container per supported browser")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--image", default="project-hawkeye-hawkeye-sandbox:latest")
    ap.add_argument("--record", action="store_true", help="Record display to artifacts/sandbox-run.mp4")
    ap.add_argument("--record-fps", type=int, default=20)
    args = ap.parse_args()

    mgr = SandboxManager()
    if args.all:
        handles = mgr.spawn_all(url=args.url, width=args.width, height=args.height, image=args.image)
        for browser, h in handles:
            print(f"{browser} {h.novnc_url} {h.cdp_url or '-'}")
    else:
        cfg = SandboxConfig(
            url=args.url,
            browser=args.browser,
            width=args.width,
            height=args.height,
            image=args.image,
        )
        with mgr.managed(cfg) as handle:
            if args.record:
                handle = mgr.start_recording(handle, width=args.width, height=args.height, fps=args.record_fps)
                print("recording: started")
            print(handle.novnc_url)
            if handle.cdp_url:
                print(handle.cdp_url)
            if args.record:
                # Keep alive briefly so recording captures something.
                import time

                time.sleep(5)
                mgr.stop_recording(handle)
                out = mgr.fetch_recording(handle, host_path=os.path.join("artifacts", "sandbox-run.mp4"))
                print(f"recording: saved {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

