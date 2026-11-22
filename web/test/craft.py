#!/usr/bin/env python3
"""Crafting: make a rare body armour from a base, roll affixes, check life moves; tree jewel sockets."""
import sys
from common import Phone
ph = Phone(sys.argv[1], open(sys.argv[2]).read().strip())
pg, dlg = ph.pg, ph.dlg
ph.tab("Items")
print("before:", ph.strip())
pg.locator(".slot", has_text="Body Armour").click()
pg.wait_for_timeout(800)
if dlg.get_by_role("button", name="Change").count(): dlg.get_by_role("button", name="Change").click()
dlg.get_by_role("button", name="Craft").click()
dlg.get_by_placeholder("Search bases").fill("glorious")
dlg.locator(".pick", has_text="Glorious Plate").click()
pg.get_by_role("dialog", name="Craft item").wait_for(timeout=20000)
ed = pg.get_by_role("dialog", name="Craft item")
ed.locator(".affix select").first.wait_for(timeout=20000); ph.idle()
ph.shot("c1-editor")
print("after base:", ph.strip())
sel = ed.locator(".affix select").first
labels = sel.locator("option").all_inner_texts()
life = next(i for i, t in enumerate(labels) if "maximum Life" in t and "/" not in t)
sel.select_option(index=life); ph.idle(800)
print("prefix 1:", ed.locator(".affix .value").first.inner_text(), "|", ph.strip())
rng = ed.locator(".affix input[type=range]").first
rng.evaluate("e => { e.value = '0.2'; e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true})); }"); ph.idle(800)
print("rolled down:", ed.locator(".affix .tier").first.inner_text(), ed.locator(".affix .value").first.inner_text(), "|", ph.strip())
suf = ed.locator(".affix select").nth(3)
labels = suf.locator("option").all_inner_texts()
fr = next(i for i, t in enumerate(labels) if "Fire Resistance" in t)
suf.select_option(index=fr); ph.idle(800)
ph.shot("c2-affixes")
ed.get_by_role("button", name="More").click(); pg.wait_for_timeout(800)
ed.get_by_role("button", name="Shaper").click(); ph.idle(500)
ph.shot("c3-more")
ed.get_by_role("button", name="Text").click(); pg.wait_for_timeout(300)
print("raw:", ed.locator("textarea").input_value().replace("\n", " | ")[:400])
ed.get_by_role("button", name="Close").click(); pg.wait_for_timeout(500)
ph.shot("c4-after")
# Tree jewel sockets listed
print("jewel rows:", pg.locator(".slot .label", has_text="Socket").count())
ph.close()
