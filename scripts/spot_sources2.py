"""«اكتشف الفرق» v5 — source pictures for the large production (Wikimedia Commons, free licences only).
  python scripts/spot_sources2.py sheets <out> <themes.txt> [per_theme]  -> contact sheets + candidates.json (previews only)
  python scripts/spot_sources2.py fetch  <out> id,id,...                  -> full pictures (2400 px wide) of chosen candidates
Photos only, from Commons «Quality images» (community-reviewed). Licences: CC0, public domain, CC BY, CC BY-SA.
Pictures already used or tried (scripts/spot_exclude.json) and near-duplicates (difference hash) are left out.
Nothing here touches the game, the site or Firebase. No key or secret is used."""
import sys, os, json, time, io, re, html, urllib.request, urllib.parse
from PIL import Image, ImageDraw
API = "https://commons.wikimedia.org/w/api.php"
UA = "LammaFactory/1.0 (https://github.com/MBS716/lamma-factory) python-urllib"
FREE = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? [1-4]\.[05]( [a-z]{2,})?)$", re.I)
plain = lambda h: html.unescape(re.sub(r"<[^>]+>", "", h or "")).strip()
norm = lambda u: urllib.parse.unquote(u or "").split("File:")[-1].replace(" ", "_").lower()

def get(url, binary=False, tries=4):
    for t in range(tries):
        try:
            time.sleep(0.6)
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=60) as r: data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:
            if t == tries - 1: raise
            time.sleep((30 if getattr(e, "code", None) in (429, 503) else 3) * (t + 1))

def search(q, limit, offset=0, width=480):
    p = {"action": "query", "format": "json", "formatversion": 2, "generator": "search", "gsrsearch": q, "gsrnamespace": 6,
         "gsrlimit": limit, "gsroffset": offset, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": width,
         "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Restrictions|Categories"}
    return (get(API + "?" + urllib.parse.urlencode(p)).get("query") or {}).get("pages", [])

def keep(p, min_w=2400):
    ii = (p.get("imageinfo") or [{}])[0]; m = ii.get("extmetadata", {})
    lic = plain(m.get("LicenseShortName", {}).get("value")); w, h = ii.get("width", 0), ii.get("height", 0)
    if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"): return None
    if w < min_w or not (1.2 <= w / max(1, h) <= 1.9): return None          # landscape, fits a phone held sideways or two pictures stacked
    if not FREE.match(lic) or "personality" in plain(m.get("Restrictions", {}).get("value")).lower(): return None
    artist = plain(m.get("Artist", {}).get("value"))[:80]
    if not artist: return None
    return {"id": "w" + str(p["pageid"]), "title": p["title"], "w": w, "h": h, "thumb": ii.get("thumburl"), "url": ii.get("url"),
            "page": ii.get("descriptionurl"), "artist": artist, "licence": lic, "licence_url": plain(m.get("LicenseUrl", {}).get("value"))}

def dhash(im):
    g = im.convert("L").resize((9, 8), Image.LANCZOS); px = list(g.getdata())
    return "%016x" % sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])
ham = lambda a, b: bin(int(a, 16) ^ int(b, 16)).count("1")

def sheets(out, themes_file, per=12):
    os.makedirs(out, exist_ok=True)
    old = json.load(open(f"{out}/candidates.json")) if os.path.exists(f"{out}/candidates.json") else []
    ex = json.load(open(os.path.join(os.path.dirname(__file__), "spot_exclude.json")))
    seen = {c["id"] for c in old} | set(ex.get("ids", [])); pages = {norm(c["page"]) for c in old} | set(ex.get("pages", []))
    hashes = [c["dh"] for c in old if c.get("dh")] + ex.get("hashes", [])
    new = []
    themes = [l.strip() for l in open(themes_file, encoding="utf-8") if l.strip() and not l.startswith("#")]
    for t in themes:
        got = 0
        try: res = search(f'incategory:"Quality images" filetype:bitmap {t}', 50)
        except Exception as e: print("search failed", t, e); continue
        for p in res:
            c = keep(p)
            if not c or c["id"] in seen or norm(c["page"]) in pages: continue
            try: im = Image.open(io.BytesIO(get(c["thumb"], True))).convert("RGB")
            except Exception as e: print("thumb failed", c["id"], e); continue
            h = dhash(im)
            if any(ham(h, x) <= 10 for x in hashes): print("near-duplicate", c["id"]); continue
            c.update(kind="photo", theme=t, dh=h); im.thumbnail((470, 300)); c["_im"] = im
            seen.add(c["id"]); pages.add(norm(c["page"])); hashes.append(h); new.append(c); got += 1
            if got >= per: break
        print(f"{t:40} {got}", flush=True)
    start = len(old)
    for s in range(0, len(new), 12):
        sheet = Image.new("RGB", (4 * 480, 3 * 340), "white"); d = ImageDraw.Draw(sheet)
        for k, c in enumerate(new[s:s + 12]):
            x, y = (k % 4) * 480, (k // 4) * 340; sheet.paste(c["_im"], (x + 5, y + 34))
            d.text((x + 6, y + 4), f"{start + s + k}: {c['id']} {c['theme'][:26]} {c['w']}x{c['h']}", fill="black")
            d.text((x + 6, y + 18), f"{c['licence']} | {c['artist'][:40]}", fill=(90, 90, 90))
        sheet.save(f"{out}/sheet_{(start + s) // 12:03d}.jpg", quality=82)
    for c in new: c.pop("_im", None)
    json.dump(old + new, open(f"{out}/candidates.json", "w"), ensure_ascii=False, indent=1)
    print(len(new), "new candidates,", len(old) + len(new), "in all")

def fetch(out, ids, width=2400):
    cands = {c["id"]: c for c in json.load(open(f"{out}/candidates.json"))}
    os.makedirs(f"{out}/full", exist_ok=True)
    for i in ids:
        c = cands[i]
        try:
            p = {"action": "query", "format": "json", "formatversion": 2, "titles": c["title"], "prop": "imageinfo", "iiprop": "url|size|extmetadata",
                 "iiurlwidth": width, "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Restrictions"}
            pg = get(API + "?" + urllib.parse.urlencode(p))["query"]["pages"][0]; ii = pg["imageinfo"][0]; m = ii.get("extmetadata", {})
            lic = plain(m.get("LicenseShortName", {}).get("value"))
            if not FREE.match(lic): print("licence changed, skipped", i, lic); continue
            im = Image.open(io.BytesIO(get(ii.get("thumburl") or ii["url"], True))).convert("RGB")
            if im.size[0] > width: im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
            im.save(f"{out}/full/{i}.jpg", quality=94); print(i, im.size, lic)
        except Exception as e: print("failed", i, e)

if __name__ == "__main__":
    if sys.argv[1] == "sheets": sheets(sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 12)
    else: fetch(sys.argv[2], [x for x in sys.argv[3].split(",") if x])
