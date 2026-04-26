import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from hawkeye_sandbox import SandboxManager  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://example.com")
    ap.add_argument("--width", type=int, default=1366)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--record", action="store_true", help="Record each container to artifacts/spawn_all-<browser>.mp4")
    args = ap.parse_args()

    mgr = SandboxManager()
    with mgr.managed_all(url=args.url, width=args.width, height=args.height) as results:
        if args.record:
            os.makedirs("artifacts", exist_ok=True)
            results = [
                (b, mgr.start_recording(h, width=args.width, height=args.height))
                for (b, h) in results
            ]
        for browser, handle in results:
            print(browser)
            print("  noVNC:", handle.novnc_url)
            print("  CDP:", handle.cdp_url or "-")
            print("  container:", handle.container_name)
        input("Press Enter to stop all containers... ")
        if args.record:
            for browser, handle in results:
                mgr.stop_recording(handle)
                out = mgr.fetch_recording(handle, host_path=os.path.join("artifacts", f"spawn_all-{browser}.mp4"))
                print("recording:", browser, out)


if __name__ == "__main__":
    main()

