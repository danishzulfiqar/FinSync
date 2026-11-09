"""Capture marketing screenshots of the seeded demo account.

Logs into the running dev frontend as the demo user and saves retina
screenshots of the key pages into frontend/public/shots/. Run with the dev
server (5173) and backend (8000) up and the demo account seeded.

    python scripts/capture_demo_shots.py
"""

from __future__ import annotations

from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = Path(__file__).resolve().parent.parent.parent / "frontend" / "public" / "shots"
OUT.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("/", "dashboard"),
    ("/transactions", "transactions"),
    ("/accounts", "accounts"),
    ("/predictions", "predictions"),
    ("/categories", "categories"),
]


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
        )
        page = ctx.new_page()

        # Sign in through the UI.
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill('input[placeholder="you@example.com"]', "demo@finsync.app")
        page.fill('input[placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"]', "finsyncdemo")
        page.click('button:has-text("Sign in")')
        page.wait_for_url(f"{BASE}/", timeout=20000)
        page.wait_for_timeout(2500)

        for route, name in PAGES:
            page.goto(f"{BASE}{route}", wait_until="networkidle")
            page.wait_for_timeout(2200)  # let charts animate in
            page.screenshot(path=str(OUT / f"{name}.png"))
            print(f"saved {name}.png")

        ctx.close()
        browser.close()


if __name__ == "__main__":
    main()
