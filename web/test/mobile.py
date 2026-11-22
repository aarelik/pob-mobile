#!/usr/bin/env python3
"""End-to-end check at a phone viewport: boot, import a build code, visit every
tab, open a breakdown and an item, change a config option, reload and confirm
the build was saved. Screenshots go to test/screens/.

    python3 web/test/mobile.py http://localhost:4173/ build-code.txt
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173/"
code = open(sys.argv[2]).read().strip() if len(sys.argv) > 2 else None
out = os.path.join(os.path.dirname(__file__), "screens")
os.makedirs(out, exist_ok=True)

errors = []


def shot(page, name):
    page.screenshot(path=os.path.join(out, f"{name}.png"))
    print("  screenshot", name)


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on("console", lambda m: m.type == "error" and errors.append(m.text))
    page.on("pageerror", lambda e: errors.append(str(e)))

    t0 = time.time()
    page.goto(url)
    shot(page, "01-boot")
    page.get_by_role("heading", name="Builds").wait_for(timeout=120_000)
    print(f"booted in {time.time() - t0:.1f}s (first visit, includes download)")
    shot(page, "02-builds-empty")

    page.get_by_role("button", name="Import").first.click()
    page.locator("textarea").fill(code)
    shot(page, "03-import-sheet")
    t1 = time.time()
    page.get_by_role("dialog").get_by_role("button", name="Import").click()
    page.get_by_text("Main skill").wait_for(timeout=60_000)
    page.wait_for_timeout(800)
    print(f"imported in {time.time() - t1:.1f}s")
    shot(page, "04-overview")
    page.locator("main").evaluate("e => e.scrollTo(0, 99999)")
    page.wait_for_timeout(300)
    shot(page, "05-overview-bottom")

    page.get_by_text("Main skill").click()
    page.wait_for_timeout(300)
    shot(page, "06-main-skill-sheet")
    page.keyboard.press("Escape")

    nav = page.locator("nav")
    nav.get_by_role("button", name="Skills").click()
    page.wait_for_timeout(500)
    shot(page, "07-skills")
    page.locator(".gem").first.click()
    page.get_by_role("dialog").locator(".tt").wait_for(timeout=10_000)
    shot(page, "08-gem-sheet")
    page.keyboard.press("Escape")

    nav.get_by_role("button", name="Items").click()
    page.wait_for_timeout(500)
    shot(page, "09-items")
    page.locator(".slot:not([disabled])").first.click()
    page.get_by_role("dialog").locator(".tt").wait_for(timeout=10_000)
    page.wait_for_timeout(200)
    shot(page, "10-item-sheet")
    page.keyboard.press("Escape")

    nav.get_by_role("button", name="Config").click()
    page.wait_for_timeout(800)
    shot(page, "11-config")
    before = page.locator(".strip .cell").first.inner_text()
    # Toggle the first switch in the config list and watch the headline numbers.
    page.locator(".opt .switch").first.click()
    page.wait_for_timeout(1500)
    after = page.locator(".strip .cell").first.inner_text()
    print("config toggle: DPS cell", repr(before), "->", repr(after))
    shot(page, "12-config-changed")

    nav.get_by_role("button", name="Calcs").click()
    page.wait_for_timeout(600)
    shot(page, "13-calcs")
    page.locator(".row.tap").first.click()
    page.get_by_role("dialog").locator("section, .text").first.wait_for(timeout=10_000)
    page.wait_for_timeout(200)
    shot(page, "14-breakdown")
    page.keyboard.press("Escape")

    # Reload: the build should come back from IndexedDB, with the config change.
    page.wait_for_timeout(1500)
    t2 = time.time()
    page.reload()
    page.get_by_text("Main skill").wait_for(timeout=120_000)
    print(f"reopened after reload in {time.time() - t2:.1f}s (cached data)")
    page.wait_for_timeout(800)
    reloaded = page.locator(".strip .cell").first.inner_text()
    print("after reload: DPS cell", repr(reloaded))
    page.locator("header").get_by_role("button", name="All builds").click()
    page.wait_for_timeout(400)
    shot(page, "15-builds-list")

    browser.close()

print("console errors:", errors if errors else "none")
sys.exit(1 if errors else 0)
