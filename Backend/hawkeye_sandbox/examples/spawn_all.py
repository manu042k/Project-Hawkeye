import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from hawkeye_sandbox import SandboxManager  # noqa: E402


def main() -> None:
    mgr = SandboxManager()
    results = mgr.spawn_all(url="https://example.com", width=1366, height=768)

    for browser, handle in results:
        print(browser)
        print("  noVNC:", handle.novnc_url)
        print("  CDP:", handle.cdp_url or "-")
        print("  container:", handle.container_name)


if __name__ == "__main__":
    main()

