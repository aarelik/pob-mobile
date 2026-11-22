"""Shared helpers for the Playwright checks: a phone-sized page with an imported build."""
import os
from playwright.sync_api import sync_playwright

OUT = os.path.join(os.path.dirname(__file__), "screens")
os.makedirs(OUT, exist_ok=True)


class Phone:
    def __init__(self, url, code=None):
        self.p = sync_playwright().start()
        self.b = self.p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        self.ctx = self.b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        self.pg = self.ctx.new_page()
        self.errors = []
        self.pg.on("pageerror", lambda e: self.errors.append(str(e)))
        self.pg.on("console", lambda m: m.type == "error" and self.errors.append(m.text))
        self.pg.goto(url)
        self.pg.get_by_role("heading", name="Builds").wait_for(timeout=90000)
        if code:
            self.pg.get_by_role("button", name="Import").first.click()
            self.pg.locator("textarea").fill(code)
            self.pg.get_by_role("dialog").get_by_role("button", name="Import").click()
            self.pg.get_by_text("Main skill").wait_for(timeout=60000)

    @property
    def dlg(self):
        return self.pg.get_by_role("dialog")

    def tab(self, name):
        self.pg.locator("nav").get_by_role("button", name=name).click()
        self.pg.wait_for_timeout(700)

    def shot(self, name):
        self.pg.screenshot(path=os.path.join(OUT, f"{name}.png"))
        print("  screenshot", name)

    def strip(self):
        return " | ".join(self.pg.locator(".strip .cell").nth(i).inner_text().replace("\n", " ") for i in range(4))

    def idle(self, ms=500):
        self.pg.wait_for_function("() => !document.querySelector('.busy')", timeout=30000)
        self.pg.wait_for_timeout(ms)

    def close(self):
        print("errors:", self.errors or "none")
        self.b.close()
        self.p.stop()
