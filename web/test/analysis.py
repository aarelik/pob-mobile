#!/usr/bin/env python3
"""Calcs grid with a breakdown, compare with another saved build, party import, custom mods, node power."""
import sys
from common import Phone
ph = Phone(sys.argv[1], open(sys.argv[3]).read().strip())   # first build: comparison target
pg, dlg = ph.pg, ph.dlg
pg.get_by_role("button", name="All builds").click(); pg.wait_for_timeout(400)
pg.get_by_role("button", name="Import").first.click(); pg.locator("textarea").fill(open(sys.argv[2]).read().strip())
dlg.get_by_role("button", name="Import").click(); pg.get_by_text("Main skill").wait_for(timeout=60000)
print("strip:", ph.strip())
ph.tab("Calcs")
pg.get_by_role("button", name="Calculations").click(); pg.locator("section.sec").first.wait_for(timeout=20000); pg.wait_for_timeout(500)
print("calc sections:", pg.locator("section.sec").count())
ph.shot("a1-calcs")
pg.locator("td.tap").nth(3).click(); pg.wait_for_timeout(2500)
ph.shot("a2-cell-breakdown"); dlg.get_by_role("button", name="Close").click()
pg.get_by_role("button", name="Compare").click(); pg.wait_for_timeout(300)
pg.get_by_role("button", name="Choose a build").click()
dlg.locator(".rowbtn").first.click(); pg.locator(".srow").nth(2).wait_for(timeout=30000); pg.wait_for_timeout(400)
print("compare rows:", pg.locator(".srow").count()); ph.shot("a3-compare")
pg.locator(".chips.seg .chip", has_text="Items").click(); pg.wait_for_timeout(800); ph.shot("a4-compare-items")
pg.get_by_role("button", name="Party").click(); pg.wait_for_timeout(500); ph.shot("a5-party")
ph.tab("Config")
cm = pg.locator("section.blk textarea").first
cm.fill("+1000 to maximum Life\nthis is nonsense"); cm.blur(); ph.idle(800)
print("after custom mods:", ph.strip(), "| flagged:", pg.locator("section.blk .bad li").count())
ph.shot("a6-custom")
ph.tab("Tree"); pg.wait_for_timeout(1500)
pg.get_by_role("button", name="Node power").click(); dlg.locator("select").wait_for(); pg.wait_for_timeout(300)
dlg.get_by_role("button", name="3", exact=True).click()
import time; t = time.time()
dlg.get_by_role("button", name="Calculate").click()
pg.get_by_role("dialog", name="Node power").locator(".rowbtn").first.wait_for(timeout=500000)
print("power took %.1fs; top:" % (time.time() - t), pg.get_by_role("dialog").locator(".rowbtn").first.inner_text().replace("\n", " "))
ph.shot("a7-power-list"); dlg.get_by_role("button", name="Close").click(); pg.wait_for_timeout(500); ph.shot("a8-heatmap")
ph.close()
