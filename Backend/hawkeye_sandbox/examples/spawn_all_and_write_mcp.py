import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from hawkeye_sandbox import SandboxManager, write_mcp_json  # noqa: E402


def main() -> None:
    mgr = SandboxManager()
    results = mgr.spawn_all(url="https://example.com", width=1366, height=768)

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


if __name__ == "__main__":
    main()

