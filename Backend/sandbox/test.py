import os
import time

from playwright.sync_api import sync_playwright


def main() -> None:
    display = os.environ.get("DISPLAY", ":99")
    os.environ["DISPLAY"] = display
    print(f"[test.py] Using DISPLAY={display}")
    print("[test.py] Launching headed Chromium...")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        print("[test.py] Navigating to Wikipedia...")
        page.goto("https://www.wikipedia.org", wait_until="networkidle")
        page.wait_for_timeout(2000)

        print("[test.py] Starting slow scroll loop...")
        for idx in range(12):
            page.mouse.wheel(0, 350)
            print(f"[test.py] Scroll step {idx + 1}/12")
            time.sleep(0.75)

        print("[test.py] Holding page for visual verification...")
        page.wait_for_timeout(5000)

        print("[test.py] Closing browser.")
        browser.close()


if __name__ == "__main__":
    main()
