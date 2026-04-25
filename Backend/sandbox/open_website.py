import os

from playwright.sync_api import sync_playwright


def main() -> None:
    url = os.getenv("URL", "https://example.com/")
    display = os.getenv("DISPLAY", ":99")
    hold_ms = int(os.getenv("HOLD_MS", "30000"))

    # Render the headed browser into the Xvfb display that VNC is streaming.
    os.environ["DISPLAY"] = display

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=False,
            args=[
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-first-run",
                "--no-default-browser-check",
                "--window-size=1280,720",
            ],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 720})
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(hold_ms)
        browser.close()


if __name__ == "__main__":
    main()

