import os
import time

from playwright.sync_api import sync_playwright


def run_validation_flow(browser_name: str, browser, scroll_steps: int = 12) -> None:
    print(f"[test.py] [{browser_name}] Launching headed browser...")
    page = browser.new_page(viewport={"width": 1280, "height": 720})

    print(f"[test.py] [{browser_name}] Navigating to Wikipedia...")
    page.goto("https://www.wikipedia.org", wait_until="networkidle")
    page.wait_for_timeout(2000)

    print(f"[test.py] [{browser_name}] Starting slow scroll loop...")
    for idx in range(scroll_steps):
        page.mouse.wheel(0, 350)
        print(f"[test.py] [{browser_name}] Scroll step {idx + 1}/{scroll_steps}")
        time.sleep(0.75)

    print(f"[test.py] [{browser_name}] Holding page for visual verification...")
    page.wait_for_timeout(5000)
    page.close()


def main() -> None:
    display = os.environ.get("DISPLAY", ":99")
    os.environ["DISPLAY"] = display
    print(f"[test.py] Using DISPLAY={display}")

    requested = os.environ.get("BROWSERS", "chromium,firefox,webkit")
    browser_order = [name.strip().lower() for name in requested.split(",") if name.strip()]
    valid_names = {"chromium", "firefox", "webkit"}
    browser_order = [name for name in browser_order if name in valid_names]
    if not browser_order:
        browser_order = ["chromium", "firefox", "webkit"]

    with sync_playwright() as p:
        for browser_name in browser_order:
            browser_type = getattr(p, browser_name)
            browser = browser_type.launch(headless=False)
            try:
                run_validation_flow(browser_name, browser)
            finally:
                print(f"[test.py] [{browser_name}] Closing browser.")
                browser.close()


if __name__ == "__main__":
    main()
