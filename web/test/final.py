#!/usr/bin/env python3
"""Build search, tree jewel socket button, first tree open after the background warm-up."""
import sys, time
from common import Phone
ph = Phone(sys.argv[1], open(sys.argv[2]).read().strip())
pg, dlg = ph.pg, ph.dlg
pg.wait_for_timeout(4000)  # the tree warms up while the overview shows
t = time.time(); ph.tab("Tree")
pg.wait_for_function("() => window.__pobTree && window.__pobTree.allocated().length > 10", timeout=30000)
print("tree ready in %.2fs after tab tap, draw %.1f ms" % (time.time() - t, pg.evaluate("window.__pobTree.drawMs()")))
pg.get_by_role("button", name="Search this build").click()
dlg.get_by_placeholder("Passives, items, gems, options, stats").fill("resolute")
dlg.locator(".rowbtn").first.wait_for(timeout=15000); pg.wait_for_timeout(500)
print("search kinds:", sorted(set(dlg.locator(".rowbtn .kind").all_inner_texts())), "| first:", dlg.locator(".rowbtn").first.inner_text().replace("\n", " ")[:80])
ph.shot("f1-search")
dlg.locator(".rowbtn", has=pg.locator(".kind", has_text="Passive")).first.click(); pg.wait_for_timeout(1500)
print("tree panel:", pg.locator(".panel .name").inner_text() if pg.locator(".panel .name").count() else None)
ph.shot("f2-search-to-tree")
# socket
pg.locator(".panel").get_by_role("button", name="Close").click(); pg.wait_for_timeout(300)
pg.evaluate("window.__pobTree.focus(26725, 0.5)"); pg.wait_for_timeout(400)
p = pg.evaluate("window.__pobTree.screen(26725)"); pg.mouse.click(p["x"], p["y"]); pg.wait_for_timeout(1500)
ph.shot("f3-socket")
btn = pg.get_by_role("button", name="Change jewel")
print("socket button:", btn.count())
if btn.count():
    btn.click(); pg.wait_for_timeout(1500)
    print("items sheet:", dlg.locator("h2").inner_text() if dlg.count() else None)
    ph.shot("f4-jewel-slot")
ph.close()
