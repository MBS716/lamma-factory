"""Check every spot-the-difference pair of a built site, on the real image files.

  python tools/verify_spot.py dist [report.json]

For each pair in spot/catalog: both images exist, decode, have the stated size; every listed difference really changes
the picture inside its box; and nothing noticeable changes outside the boxes (an unlisted difference would make a
player lose points for a correct tap). Prints counts per level of the pairs that pass."""
import json, os, sys
import numpy as np
from PIL import Image

root = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else None
idx = json.load(open(os.path.join(root, "spot/catalog/index.json")))
rows, ok_lv = [], [0, 0, 0]
for sh in idx["shards"]:
    for e in json.load(open(os.path.join(root, "spot/catalog", sh["name"]))):
        r = {"id": e["id"], "level": e["l"], "kind": e.get("k", "photo"), "diffs": len(e["d"]), "problems": []}
        try:
            A = np.asarray(Image.open(os.path.join(root, "spot/pairs", e["id"] + "a.webp")).convert("RGB")).astype(int)
            B = np.asarray(Image.open(os.path.join(root, "spot/pairs", e["id"] + "b.webp")).convert("RGB")).astype(int)
        except Exception as ex:
            r["problems"].append(f"image missing or unreadable: {ex}"); rows.append(r); continue
        if A.shape[:2] != (e["h"], e["w"]) or B.shape != A.shape: r["problems"].append(f"size {A.shape[:2]} / {B.shape[:2]} != {e['h']}x{e['w']}")
        d = np.abs(A - B).sum(2) > 60
        inside = np.zeros(d.shape, bool); weak = []
        for i, (x, y, rx, ry) in enumerate(e["d"]):
            x0, x1, y0, y1 = max(0, x - rx), min(e["w"], x + rx), max(0, y - ry), min(e["h"], y + ry)
            inside[y0:y1, x0:x1] = True
            box = d[y0:y1, x0:x1]
            if box.sum() < 150: weak.append(f"#{i + 1} only {int(box.sum())} px changed")
        if weak: r["problems"].append("difference not visible: " + ", ".join(weak))
        # changes outside every box: count connected blobs bigger than a fingertip-sized speck
        out_mask = d & ~inside
        from scipy import ndimage
        lab, n = ndimage.label(ndimage.binary_opening(out_mask, iterations=1))
        sizes = ndimage.sum(out_mask, lab, range(1, n + 1)) if n else []
        big = [int(s) for s in sizes if s >= 250]
        if big: r["problems"].append(f"unlisted change outside the boxes ({len(big)} spot(s), up to {max(big)} px)")
        r["ok"] = not r["problems"]
        if r["ok"]: ok_lv[e["l"]] += 1
        rows.append(r)
summary = {"pairs_in_catalog": idx["total"], "playable": sum(ok_lv), "playable_by_level": dict(zip(["easy", "medium", "hard"], ok_lv)),
           "playable_by_kind": {k: sum(1 for r in rows if r.get("ok") and r["kind"] == k) for k in ("photo", "painting", "art")}}
print(json.dumps(summary, ensure_ascii=False))
for r in rows:
    if not r.get("ok"): print("REJECT", r["id"], r["level"], r["problems"])
if out: json.dump({"summary": summary, "pairs": rows}, open(out, "w"), ensure_ascii=False, indent=1)
sys.exit(0 if summary["playable"] == summary["pairs_in_catalog"] else 1)
