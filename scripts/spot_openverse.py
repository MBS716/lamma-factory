"""«اكتشف الفرق» — small trial of a second picture source: Openverse (openverse.org, run by WordPress), which indexes
Creative Commons photos from Flickr and other sites. Same licences as our Commons pictures, so credits work the same way.
  python scripts/spot_openverse.py sheets <out> <themes.txt> [per_theme]  -> contact sheets + candidates.json (previews only)
  python scripts/spot_openverse.py fetch  <out> id,id,...                  -> full pictures (2400 px wide) of chosen candidates
Licences kept: CC0, public domain mark, CC BY, CC BY-SA (commercial use and changes allowed). Wikimedia results are left out
(already searched). Anonymous API use (no key or secret). Nothing here touches the game, the site or Firebase."""
import sys, os, json, io, re, urllib.parse
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from spot_sources2 import get, dhash, ham, BADCAT
API = "https://api.openverse.org/v1/images/"
LIC = {"by": "CC BY", "by-sa": "CC BY-SA", "cc0": "CC0", "pdm": "Public domain"}

def search(q, n=20):
    p = {"q": q, "license": "by,by-sa,cc0,pdm", "category": "photograph", "size": "large", "aspect_ratio": "wide",
         "mature": "false", "excluded_source": "wikimedia", "page_size": n}
    return get(API + "?" + urllib.parse.urlencode(p)).get("results", [])

def keep(r, min_w=2400):
    w, h = r.get("width") or 0, r.get("height") or 0
    if w and (w < min_w or not (1.2 <= w / max(1, h) <= 1.9)): return None
    lic = LIC.get(r.get("license"))
    if not lic or not r.get("creator") or not r.get("url"): return None
    tags = " ".join(t.get("name", "") for t in (r.get("tags") or []))
    if BADCAT.search((r.get("title") or "") + " " + tags): return None
    v = r.get("license_version") or ""
    return {"id": "o" + r["id"].replace("-", "")[:12], "ov": r["id"], "title": r.get("title") or "", "w": w, "h": h,
            "thumb": r.get("thumbnail"), "url": r["url"], "page": r.get("foreign_landing_url"), "artist": r["creator"][:80],
            "licence": (lic + " " + v).strip() if lic.startswith("CC BY") else lic, "licence_url": r.get("license_url"),
            "source": r.get("source"), "kind": "photo"}

def sheets(out, themes_file, per=6):
    os.makedirs(out, exist_ok=True)
    old = json.load(open(f"{out}/candidates.json")) if os.path.exists(f"{out}/candidates.json") else []
    seen = {c["id"] for c in old}; hashes = [c["dh"] for c in old if c.get("dh")]; new = []
    for t in [l.strip() for l in open(themes_file, encoding="utf-8") if l.strip() and not l.startswith("#")]:
        got = 0
        try: res = search(t)
        except Exception as e: print("search failed", t, e); res = []
        for r in res:
            c = keep(r)
            if not c or c["id"] in seen: continue
            try: im = Image.open(io.BytesIO(get(c["thumb"], True))).convert("RGB")
            except Exception as e: print("thumb failed", c["id"], e); continue
            if not c["w"]: c["w"], c["h"] = 0, 0
            hsh = dhash(im)
            if any(ham(hsh, x) <= 10 for x in hashes): continue
            c.update(theme=t, dh=hsh); im.thumbnail((470, 300)); c["_im"] = im
            seen.add(c["id"]); hashes.append(hsh); new.append(c); got += 1
            if got >= per: break
        print(f"{t:40} {got}", flush=True)
    start = len(old)
    for s in range(0, len(new), 12):
        sheet = Image.new("RGB", (4 * 480, 3 * 340), "white"); d = ImageDraw.Draw(sheet)
        for k, c in enumerate(new[s:s + 12]):
            x, y = (k % 4) * 480, (k // 4) * 340; sheet.paste(c["_im"], (x + 5, y + 34))
            d.text((x + 6, y + 4), f"{start + s + k}: {c['id']} {c['theme'][:26]} {c['w']}x{c['h']}", fill="black")
            d.text((x + 6, y + 18), f"{c['licence']} | {c['source']} | {c['artist'][:30]}", fill=(90, 90, 90))
        sheet.save(f"{out}/sheet_{(start + 11) // 12 + s // 12:03d}.jpg", quality=82)
    for c in new: c.pop("_im", None)
    json.dump(old + new, open(f"{out}/candidates.json", "w"), ensure_ascii=False, indent=1)
    print(len(new), "new candidates,", len(old) + len(new), "in all")

def fetch(out, ids, width=2400):
    cands = {c["id"]: c for c in json.load(open(f"{out}/candidates.json"))}
    os.makedirs(f"{out}/full", exist_ok=True)
    for i in ids:
        c = cands[i]
        try:
            r = get(API + c["ov"] + "/")                       # licence checked again at fetch time
            if r.get("license") not in LIC: print("licence changed, skipped", i, r.get("license")); continue
            im = Image.open(io.BytesIO(get(r["url"], True))).convert("RGB")
            if im.size[0] < width: print("too small, skipped", i, im.size); continue
            im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
            im.save(f"{out}/full/{i}.jpg", quality=94); print(i, im.size, r.get("license"), r.get("source"))
        except Exception as e: print("failed", i, e)

if __name__ == "__main__":
    if sys.argv[1] == "sheets": sheets(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 6)
    elif sys.argv[1] == "fetch": fetch(sys.argv[2], sys.argv[3].split(","))
