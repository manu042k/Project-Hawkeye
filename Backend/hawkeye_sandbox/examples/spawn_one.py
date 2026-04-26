import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from hawkeye_sandbox import SandboxConfig, SandboxManager  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://example.com")
    ap.add_argument("--browser", default="chromium")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--record", action="store_true", help="Record to artifacts/spawn_one.mp4")
    args = ap.parse_args()

    mgr = SandboxManager()

    with mgr.managed(
        SandboxConfig(
            url=args.url,
            browser=args.browser,
            width=args.width,
            height=args.height,
        )
    ) as handle:
        if args.record:
            os.makedirs("artifacts", exist_ok=True)
            handle = mgr.start_recording(handle, width=args.width, height=args.height)

        print("noVNC:", handle.novnc_url)
        print("CDP:", handle.cdp_url or "-")
        print("container:", handle.container_name)
        input("Press Enter to stop the container... ")

        if args.record:
            mgr.stop_recording(handle)
            out = mgr.fetch_recording(handle, host_path=os.path.join("artifacts", "spawn_one.mp4"))
            print("recording:", out)


if __name__ == "__main__":
    main()

