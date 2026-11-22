#!/usr/bin/env python3
"""Gem editing: add a group, add gems, change part, replace and remove a gem."""
import sys
from common import Phone
ph = Phone(sys.argv[1], open(sys.argv[2]).read().strip())
pg, dlg = ph.pg, ph.dlg
ph.tab("Skills"); ph.shot("s1-skills")
n0 = pg.locator("section.group").count()
pg.get_by_role("button", name="Group", exact=True).click()
dlg.get_by_placeholder("Gem name or tag").fill("cyclone"); pg.wait_for_timeout(700)
dlg.locator(".res .rowbtn", has_text="Cyclone").first.click(); ph.idle()
print("groups", n0, "->", pg.locator("section.group").count(), [pg.locator("section.group").nth(i).locator(".name").inner_text() for i in range(pg.locator("section.group").count())])
last = pg.locator("section.group").last
last.get_by_role("button", name="Add gem").click()
dlg.get_by_role("button", name="Supports").click()
dlg.get_by_role("button", name="Sort by DPS").click()
pg.wait_for_timeout(8000)
ph.shot("s2-picker-dps")
print("top supports:", dlg.locator(".res").first.inner_text().replace("\n"," "), "| dd count", dlg.locator(".res .dd").count())
dlg.locator(".res .rowbtn").first.click(); ph.idle()
print("last group gems:", last.locator(".gname").all_inner_texts())
last.locator(".star").click(); ph.idle()
print("strip with new main skill:", ph.strip())
last.locator(".gem").nth(1).click(); dlg.locator(".tt").wait_for(timeout=10000)
ph.shot("s3-gem-sheet")
dlg.get_by_role("button", name="Replace").click()
dlg.get_by_placeholder("Gem name or tag").fill("brutality"); pg.wait_for_timeout(700)
dlg.locator(".res .rowbtn", has_text="Brutality").first.click(); ph.idle()
print("after replace:", last.locator(".gname").all_inner_texts(), ph.strip())
last.locator(".gem").nth(1).click(); dlg.get_by_role("button", name="Remove").click(); ph.idle()
print("after remove:", last.locator(".gname").all_inner_texts())
last.locator(".title").click(); pg.wait_for_timeout(400); ph.shot("s4-group-sheet")
dlg.get_by_role("button", name="Duplicate").click(); ph.idle()
print("groups after duplicate:", pg.locator("section.group").count())
# skill with parts: Blade Flurry
pg.get_by_role("button", name="Group", exact=True).click()
dlg.get_by_placeholder("Gem name or tag").fill("blade flurry"); pg.wait_for_timeout(1500); ph.shot("s5a")
dlg.locator(".res .rowbtn", has_text="Blade Flurry").first.click(); ph.idle()
g = pg.locator("section.group").last
g.locator(".star").click(); ph.idle(); g.locator(".title").click(); pg.wait_for_timeout(500)
opts = dlg.locator("select").last.locator("option").all_inner_texts(); print("blade flurry parts:", opts)
dlg.locator("select").last.select_option(index=len(opts) - 1); ph.idle()
print("strip after part change:", ph.strip()); ph.shot("s5-parts")
dlg.get_by_role("button", name="Delete").click() if False else None
ph.close()
