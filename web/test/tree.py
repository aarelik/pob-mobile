#!/usr/bin/env python3
"""Tree tab at a phone viewport: open, tap an unallocated neighbour, allocate it,
undo, search. Screenshots go to test/screens/."""
import os, sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]; code = open(sys.argv[2]).read().strip()
out = os.path.join(os.path.dirname(__file__), "screens"); os.makedirs(out, exist_ok=True)
errors = []
shot = lambda pg, n: (pg.screenshot(path=os.path.join(out, f"{n}.png")), print("  screenshot", n))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.goto(url)
    pg.get_by_role("heading", name="Builds").wait_for(timeout=60000)
    pg.get_by_role("button", name="Import").first.click(); pg.locator("textarea").fill(code)
    pg.get_by_role("dialog").get_by_role("button", name="Import").click()
    pg.get_by_text("Main skill").wait_for(timeout=60000)
    pg.locator("nav").get_by_role("button", name="Tree").click()
    pg.wait_for_function("window.__pobTree && window.__pobTree.allocated().length > 10", timeout=30000)
    pg.wait_for_timeout(500)
    shot(pg, "t1-tree")
    before = len(pg.evaluate("__pobTree.allocated()"))
    nb = pg.evaluate("__pobTree.neighbours()")
    target = nb[0]
    pg.evaluate(f"__pobTree.focus({target}, 0.3)"); pg.wait_for_timeout(300)
    shot(pg, "t2-zoomed")
    pos = pg.evaluate(f"__pobTree.screen({target})")
    pg.mouse.click(pos["x"], pos["y"])
    pg.locator(".panel").wait_for(timeout=10000); pg.wait_for_timeout(1200)
    shot(pg, "t3-node-panel")
    dps0 = pg.locator(".strip .cell").first.inner_text()
    btn = pg.locator(".panel .btn.primary")
    if btn.count():
        btn.click()
        pg.wait_for_function(f"__pobTree.allocated().length > {before}", timeout=15000)
        pg.wait_for_timeout(800)
        print("allocated: nodes", before, "->", len(pg.evaluate("__pobTree.allocated()")), "| DPS", dps0.replace("\n", " "), "->", pg.locator(".strip .cell").first.inner_text().replace("\n", " "))
        shot(pg, "t4-allocated")
        pg.get_by_role("button", name="Undo").click()
        pg.wait_for_function(f"__pobTree.allocated().length == {before}", timeout=15000)
        print("undo ok")
    else:
        print("panel had no allocate button:", pg.locator(".panel").inner_text()[:200])
    pg.get_by_role("button", name="Search the tree").click()
    pg.locator(".search input").fill("life")
    pg.wait_for_timeout(1500)
    print("search:", pg.locator(".search .btn").inner_text() if pg.locator(".search .btn").count() else "no results")
    pg.locator(".panel .icon-btn").click() if pg.locator(".panel").count() else None
    pg.get_by_role("button", name="Show my tree").click(); pg.wait_for_timeout(400)
    shot(pg, "t5-search")
    # pinch: synthesise two-finger zoom via CDP touch events
    cdp = ctx.new_cdp_session(pg)
    def touch(kind, pts): cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": [{"x": x, "y": y, "id": i} for i, (x, y) in enumerate(pts)]})
    touch("touchStart", [(170, 420), (220, 470)])
    for k in range(1, 9): touch("touchMove", [(170 - k * 12, 420 - k * 12), (220 + k * 12, 470 + k * 12)])
    touch("touchEnd", [])
    pg.wait_for_timeout(400)
    shot(pg, "t6-pinched")
    b.close()
print("errors:", errors or "none")
sys.exit(1 if errors else 0)
