"""«اكتشف الفرق» — limited trial of Pexels as a picture source (owner approval 20 Nov 2026: 30 source pictures only).
  python scripts/spot_pexels.py sheets <out> <themes.txt> [per_theme] [max_total] -> contact sheets + candidates.json
  python scripts/spot_pexels.py fetch  <out> id,id,...                            -> chosen pictures, 2400 px wide
The key comes only from the environment variable PEXELS_API_KEY (a GitHub Actions secret set by the owner); it is never
printed or written to a file. Official API only (no scraping); default limits 200 requests/hour, so a trial needs < 60.
Pexels License (pexels.com/license, terms §5): use, copy, modify or adapt for commercial or non-commercial purposes;
no standalone resale/redistribution; not misleading; no bulk/systematic copying; no use for machine learning; no
replicating Pexels. We credit the photographer and link the Pexels page, as the API guidelines ask.
Pictures are not added to any game bank by this script."""
import sys, os, json, io, urllib.request, urllib.parse, time
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
from spot_sources2 import dhash, ham, BADCAT
API = "https://api.pexels.com/v1/"
MAX_TOTAL_FETCH = 30                                   # trial cap from the owner: 30 source pictures

def _key():
    k = os.environ.get("PEXELS_API_KEY", "").strip()
    if not k: sys.exit("PEXELS_API_KEY is not set (add it as a repository secret); nothing done.")
    return k

def api(path, **q):
    req = urllib.request.Request(API + path + ("?" + urllib.parse.urlencode(q) if q else ""),
                                 headers={"Authorization": _key(), "User-Agent": "lamma-spot-trial/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        left = r.headers.get("X-Ratelimit-Remaining")
        if left is not None and int(left) < 20: sys.exit(f"rate limit nearly reached ({left} left); stopping")
        return json.loads(r.read())

def raw(url):
    req = urllib.request.Request(url, headers={"User-Agent": "lamma-spot-trial/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r: return r.read()

def cand(p, theme):
    w, h = p.get("width") or 0, p.get("height") or 0
    if w < 2400 or not (1.25 <= w / max(1, h) <= 1.9): return None
    if BADCAT.search((p.get("alt") or "") + " " + (p.get("url") or "")): return None
    return {"id": f"x{p['id']}", "px": p["id"], "title": p.get("alt") or "", "w": w, "h": h, "theme": theme,
            "page": p.get("url"), "artist": (p.get("photographer") or "")[:80], "artist_url": p.get("photographer_url"),
            "licence": "Pexels License", "licence_url": "https://www.pexels.com/license/", "source": "pexels",
            "kind": "photo", "thumb": p["src"].get("medium")}

def sheets(out, themes_file, per=8, max_total=120):
    os.makedirs(out, exist_ok=True)
    old = json.load(open(f"{out}/candidates.json")) if os.path.exists(f"{out}/candidates.json") else []
    seen = {c["id"] for c in old}; hashes = [c["dh"] for c in old if c.get("dh")]; new = []
    for t in [l.strip() for l in open(themes_file, encoding="utf-8") if l.strip() and not l.startswith("#")]:
        if len(new) >= max_total: break
        got = 0
        try: res = api("search", query=t, orientation="landscape", size="large", per_page=30).get("photos", [])
        except SystemExit: raise
        except Exception as e: print("search failed:", t, type(e).__name__); res = []
        for p in res:
            c = cand(p, t)
            if not c or c["id"] in seen: continue
            try: im = Image.open(io.BytesIO(raw(c["thumb"]))).convert("RGB")
            except Exception as e: print("preview failed", c["id"], type(e).__name__); continue
            hsh = dhash(im)
            if any(ham(hsh, x) <= 10 for x in hashes): continue
            c["dh"] = hsh; im.thumbnail((470, 300)); c["_im"] = im
            seen.add(c["id"]); hashes.append(hsh); new.append(c); got += 1
            if got >= per or len(new) >= max_total: break
        print(f"{t:40} {got}", flush=True); time.sleep(1)
    start = len(old)
    for s in range(0, len(new), 12):
        sheet = Image.new("RGB", (4 * 480, 3 * 340), "white"); d = ImageDraw.Draw(sheet)
        for k, c in enumerate(new[s:s + 12]):
            x, y = (k % 4) * 480, (k // 4) * 340; sheet.paste(c["_im"], (x + 5, y + 34))
            d.text((x + 6, y + 4), f"{start + s + k}: {c['id']} {c['theme'][:26]} {c['w']}x{c['h']}", fill="black")
            d.text((x + 6, y + 18), f"{c['artist'][:40]}", fill=(90, 90, 90))
        sheet.save(f"{out}/sheet_{(start + 11) // 12 + s // 12:03d}.jpg", quality=82)
    for c in new: c.pop("_im", None)
    json.dump(old + new, open(f"{out}/candidates.json", "w"), ensure_ascii=False, indent=1)
    print(len(new), "new candidates,", len(old) + len(new), "in all")

def fetch(out, ids, width=2400):
    """ids: x<pexels id>, ...  Works from the API record alone (the candidates file stays on Claude's side)."""
    os.makedirs(f"{out}/full", exist_ok=True)
    if len(ids) > MAX_TOTAL_FETCH: sys.exit(f"trial cap: {len(ids)} asked > {MAX_TOTAL_FETCH}")
    meta = []
    for i in ids:
        try:
            p = api(f"photos/{int(i.lstrip('x'))}")             # fresh record: photographer and size checked again
            im = Image.open(io.BytesIO(raw(p["src"]["original"]))).convert("RGB")
            if im.size[0] < width: print("too small, skipped", i, im.size); continue
            im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
            im.save(f"{out}/full/{i}.jpg", quality=94)
            meta.append({"id": i, "page": p.get("url"), "artist": (p.get("photographer") or "")[:80],
                         "artist_url": p.get("photographer_url"), "title": p.get("alt") or "",
                         "licence": "Pexels License", "licence_url": "https://www.pexels.com/license/"})
            print(i, im.size); time.sleep(1)
        except SystemExit: raise
        except Exception as e: print("failed", i, type(e).__name__)
    json.dump(meta, open(f"{out}/meta.json", "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    if sys.argv[1] == "sheets": sheets(sys.argv[2], sys.argv[3], *(int(a) for a in sys.argv[4:6]))
    elif sys.argv[1] == "fetch": fetch(sys.argv[2], sys.argv[3].split(","))
