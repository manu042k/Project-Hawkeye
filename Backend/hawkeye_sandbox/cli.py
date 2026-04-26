from __future__ import annotations

import argparse

from .sandbox import SandboxConfig, SandboxManager


def main() -> int:
    ap = argparse.ArgumentParser(prog="hawkeye-sandbox")
    ap.add_argument("--url", required=True)
    ap.add_argument("--browser", default="chromium", choices=["chromium", "chrome", "msedge", "firefox", "webkit"])
    ap.add_argument("--all", action="store_true", help="Spawn one container per supported browser")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--image", default="project-hawkeye-hawkeye-sandbox:latest")
    args = ap.parse_args()

    mgr = SandboxManager()
    if args.all:
        handles = mgr.spawn_all(url=args.url, width=args.width, height=args.height, image=args.image)
        for browser, h in handles:
            print(f"{browser} {h.novnc_url} {h.cdp_url or '-'}")
    else:
        handle = mgr.spawn(
            SandboxConfig(
                url=args.url,
                browser=args.browser,
                width=args.width,
                height=args.height,
                image=args.image,
            )
        )
        print(handle.novnc_url)
        if handle.cdp_url:
            print(handle.cdp_url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

