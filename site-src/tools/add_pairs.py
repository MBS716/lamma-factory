"""Add factory pairs that passed the per-difference review to spotlib/.

  python tools/add_pairs.py <full dir> <replay.json> <run.json> <replay out dir> <kind photo|painting>

A = <full>/<id>a.jpg (the untouched picture), B = <replay out>/<id>_final_b.jpg (after review and repairs).
Only pairs with status "ok" are added; their differences are the reviewed ones."""
import json, os, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
full, replay, runf, rdir, kind = sys.argv[1:6]
import re
THEME_AR = json.loads(re.search(r"const THEME_AR = (\{.*?\});", open(os.path.join(ROOT, "src/app.js"), encoding="utf-8").read()).group(1))
THEME_AR.update({"campsite": "مخيم", "toys": "ألعاب ودمى", "bicycles parked street": "دراجات", "souk": "سوق شعبي", "boats harbour": "مرفأ",
            "old house facade": "واجهة بيت قديم", "painting": "لوحة فنية"})
lib = json.load(open(os.path.join(ROOT, "spotlib/pairs.json"), encoding="utf-8")); have = {p["id"] for p in lib}
rep = json.load(open(replay))["pairs"]; log = {x["photo"]: x for x in json.load(open(runf))["log"]}
added = 0
for pid, r in rep.items():
    if r["status"] != "ok": continue
    nid = ("p-" if kind == "painting" else "c-") + pid
    if nid in have: continue
    l = log[pid]
    for k, src in (("a", os.path.join(full, pid + "a.jpg")), ("b", os.path.join(rdir, pid + "_final_b.jpg"))):
        Image.open(src).convert("RGB").save(os.path.join(ROOT, "spotlib", nid + k + ".webp"), "WEBP", quality=88, method=5)
    lv = r.get("level_measured", 1)
    diffs = [{"x": int(d["x"]), "y": int(d["y"]), "rx": int(d["rx"]), "ry": int(d["ry"])} for d in r["diffs"]]
    lic = l.get("licence", ""); lurl = l.get("licence_url", "")
    lib.append({"id": nid, "a": nid + "a.webp", "b": nid + "b.webp", "w": 1280, "h": 853, "level": int(lv),
                "title": THEME_AR.get(l.get("theme"), "صورة"), "diffs": diffs, "kind": kind,
                "credit": [l.get("credit", ""), l.get("url", ""), lic, lurl]})
    added += 1
json.dump(lib, open(os.path.join(ROOT, "spotlib/pairs.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("added", added, "library", len(lib))
