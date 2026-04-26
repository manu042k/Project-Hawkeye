import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from hawkeye_sandbox import SandboxConfig, SandboxManager  # noqa: E402


def main() -> None:
    mgr = SandboxManager()

    handle = mgr.spawn(
        SandboxConfig(
            url="https://example.com",
            browser="chromium",
            width=1366,
            height=768,
        )
    )

    print("noVNC:", handle.novnc_url)
    print("CDP:", handle.cdp_url or "-")
    print("container:", handle.container_name)


if __name__ == "__main__":
    main()

