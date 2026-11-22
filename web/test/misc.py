#!/usr/bin/env python3
"""Undo/redo across tabs, set pickers, share sheet, settings, themes, backup and restore."""
import sys, os
from common import Phone, OUT
ph = Phone(sys.argv[1], open(sys.argv[2]).read().strip())
pg, dlg = ph.pg, ph.dlg
print("start:", ph.strip())
ph.tab("Config")
pg.get_by_placeholder("Search options").fill("boss"); pg.wait_for_timeout(600)
ph.shot("m0-config")
sel = pg.locator("select").first
sel.select_option(index=sel.locator("option").count() - 1); ph.idle()
print("after config change:", ph.strip())
ph.tab("Skills")
pg.locator("section.group").first.locator(".switch").click(); ph.idle()
print("after disabling group:", ph.strip())
pg.get_by_role("button", name="Undo").click(); ph.idle()
print("undo 1:", ph.strip())
pg.get_by_role("button", name="Undo").click(); ph.idle()
print("undo 2:", ph.strip(), "| undo enabled:", pg.get_by_role("button", name="Undo").is_enabled())
pg.get_by_role("button", name="Redo").click(); ph.idle()
print("redo:", ph.strip())
# skill set picker
pg.get_by_role("button", name="Skill set: Default").click()
dlg.get_by_role("button", name="New skill set").click() if False else None
pg.on("dialog", lambda d: d.accept("Mapping"))
dlg.get_by_role("button", name="New skill set").click(); ph.idle()
print("skill sets:", dlg.locator(".set .t").all_inner_texts())
dlg.get_by_role("button", name="Close").click()
ph.tab("Tree"); pg.wait_for_timeout(1500); ph.shot("m1-tree-bar")
# share
pg.get_by_role("button", name="Share build code").click(); pg.wait_for_timeout(1500); ph.shot("m2-share")
with pg.expect_download() as d:
    dlg.get_by_role("button", name="Download .xml for desktop Path of Building").click()
print("xml download:", d.value.suggested_filename)
dlg.get_by_role("button", name="Upload to pobb.in").click(); pg.wait_for_timeout(1500)
print("toast:", pg.locator(".toast").inner_text() if pg.locator(".toast").count() else None)
dlg.get_by_role("button", name="Close").click()
# builds screen settings
pg.get_by_role("button", name="All builds").click(); pg.wait_for_timeout(500)
pg.get_by_role("button", name="Settings").click(); pg.wait_for_timeout(800)
dlg.get_by_role("button", name="Wraeclast").click(); pg.wait_for_timeout(300)
ph.shot("m3-settings-wraeclast")
with pg.expect_download() as d:
    dlg.get_by_role("button", name="Back up all").click()
path = os.path.join(OUT, "backup.json"); d.value.save_as(path); print("backup:", d.value.suggested_filename, os.path.getsize(path))
n0 = pg.locator(".build").count()
pg.locator("input[type=file]").set_input_files(path); pg.wait_for_timeout(1500)
print("builds after restore:", n0, "->", pg.locator(".build").count())
dlg.get_by_role("button", name="Close").click(); pg.wait_for_timeout(300)
pg.get_by_role("button", name="Import").first.click()
dlg.get_by_role("button", name="From my account").click(); pg.wait_for_timeout(300)
dlg.get_by_placeholder("Account name, e.g. Name#1234").fill("Someone#1234"); dlg.get_by_placeholder("Character name").fill("MyChar")
pg.wait_for_timeout(300); ph.shot("m4-account")
dlg.get_by_role("button", name="Close").click()
pg.get_by_role("button", name="Settings").click(); dlg.get_by_role("button", name="Light").click(); pg.wait_for_timeout(300)
dlg.get_by_role("button", name="Close").click(); pg.locator(".build .main").first.click(); pg.wait_for_timeout(3000)
ph.tab("Items"); pg.locator(".slot").first.click(); pg.wait_for_timeout(1200); ph.shot("m5-light-item")
ph.close()
