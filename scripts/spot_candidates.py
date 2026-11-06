"""Spot-the-difference redesign, stage 1: find candidate pictures on Wikimedia Commons for the 15-pair sample.
Free licences only (CC0, public domain, CC BY, CC BY-SA). Photos come from community-reviewed Quality/Featured images;
illustrations from professional open productions (Pepper&Carrot by David Revoy, Blender open movies), all CC BY.

  python scripts/spot_candidates.py sheets <out>          -> contact sheets + candidates.json (small previews only)
  python scripts/spot_candidates.py fetch <out> id,id,... -> full pictures (2400 px wide) of the chosen candidates

Nothing here touches the game, the site or Firebase."""
import sys, os, json, time, io, re, html, urllib.request, urllib.parse
from PIL import Image, ImageDraw

API = "https://commons.wikimedia.org/w/api.php"
UA = "LammaFactory/1.0 (https://github.com/MBS716/lamma-factory) python-urllib"
FREE = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? [1-4]\.[05]( [a-z]{2,})?)$", re.I)
plain = lambda h: html.unescape(re.sub(r"<[^>]+>", "", h or "")).strip()

PHOTO = ["market stall", "spice market", "souk", "fruit vegetables market", "fish market", "flower market", "bazaar",
         "restaurant interior", "cafe interior", "kitchen interior", "bakery", "living room interior", "library interior",
         "toy shop", "antique shop", "workshop tools", "harbour boats", "fishing boats", "old town street", "village",
         "castle", "palace courtyard", "mosque", "farm animals", "zoo animals", "birds", "garden", "beach", "desk",
         "musical instruments", "shelves", "camping"]
ART = [("Pepper&Carrot", 'deepcat:"Pepper&Carrot" filetype:bitmap'),
       ("Big Buck Bunny", '"Big Buck Bunny" filetype:bitmap'),
       ("Sintel", 'intitle:Sintel filetype:bitmap'),
       ("Elephants Dream", '"Elephants Dream" filetype:bitmap'),
       ("Spring (Blender)", '"Blender Animation Studio" Spring filetype:bitmap'),
       ("Sprite Fright", '"Sprite Fright" filetype:bitmap'),
       ("Cosmos Laundromat", '"Cosmos Laundromat" filetype:bitmap'),
       ("Coffee Run", '"Coffee Run" Blender filetype:bitmap'),
       ("David Revoy", 'deepcat:"David Revoy" filetype:bitmap')]

def get(url, binary=False, tries=4):
    for t in range(tries):
        try:
            time.sleep(1.0)
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=60) as r: data = r.read()
            return data if binary else json.loads(data)
        except Exception as e:
            if t == tries - 1: raise
            time.sleep((30 if getattr(e, "code", None) in (429, 503) else 3) * (t + 1))

def search(q, limit, width=480):
    p = {"action": "query", "format": "json", "formatversion": 2, "generator": "search", "gsrsearch": q, "gsrnamespace": 6,
         "gsrlimit": limit, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": width,
         "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Restrictions|ImageDescription"}
    return (get(API + "?" + urllib.parse.urlencode(p)).get("query") or {}).get("pages", [])

def keep(p, min_w):
    ii = (p.get("imageinfo") or [{}])[0]; m = ii.get("extmetadata", {})
    lic = plain(m.get("LicenseShortName", {}).get("value")); w, h = ii.get("width", 0), ii.get("height", 0)
    if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"): return None
    if w < min_w or not (1.25 <= w / max(1, h) <= 2.0): return None
    if not FREE.match(lic) or "personality" in plain(m.get("Restrictions", {}).get("value")).lower(): return None
    artist = plain(m.get("Artist", {}).get("value"))[:80]
    if not artist: return None
    return {"id": "w" + str(p["pageid"]), "title": p["title"], "w": w, "h": h, "thumb": ii.get("thumburl"), "url": ii.get("url"),
            "page": ii.get("descriptionurl"), "artist": artist, "licence": lic, "licence_url": plain(m.get("LicenseUrl", {}).get("value"))}

def sheets(out):
    os.makedirs(out, exist_ok=True); cands, seen = [], set()
    groups = [("photo", t, f'incategory:"Quality images" filetype:bitmap {t}', 2400, 7) for t in PHOTO] + \
             [("art", n, q, 1600, 14) for n, q in ART]
    for kind, name, q, min_w, n in groups:
        try: pages = search(q, 50)
        except Exception as e: print("search failed", name, e); continue
        got = 0
        for p in pages:
            c = keep(p, min_w)
            if not c or c["id"] in seen: continue
            seen.add(c["id"]); c.update(kind=kind, theme=name); cands.append(c); got += 1
            if got >= n: break
        print(f"{kind:5} {name:28} {got}")
    # contact sheets: 12 previews each, numbered
    for s in range(0, len(cands), 12):
        sheet = Image.new("RGB", (4 * 480, 3 * 340), "white"); d = ImageDraw.Draw(sheet)
        for k, c in enumerate(cands[s:s + 12]):
            try: im = Image.open(io.BytesIO(get(c["thumb"], True))).convert("RGB"); im.thumbnail((470, 300))
            except Exception as e: print("thumb failed", c["id"], e); continue
            x, y = (k % 4) * 480, (k // 4) * 340; sheet.paste(im, (x + 5, y + 34))
            d.text((x + 6, y + 4), f"{s + k}: {c['id']} {c['kind']} {c['theme'][:18]} {c['w']}x{c['h']}", fill="black")
            d.text((x + 6, y + 18), f"{c['licence']} | {c['artist'][:40]}", fill=(90, 90, 90))
        sheet.save(f"{out}/sheet_{s // 12:02d}.jpg", quality=80)
    json.dump(cands, open(f"{out}/candidates.json", "w"), ensure_ascii=False, indent=1)
    print(len(cands), "candidates")

def fetch(out, ids, width=2400):
    cands = {c["id"]: c for c in json.load(open(f"{out}/candidates.json"))}
    os.makedirs(f"{out}/full", exist_ok=True)
    for i in ids:
        c = cands[i]
        p = {"action": "query", "format": "json", "formatversion": 2, "titles": c["title"], "prop": "imageinfo", "iiprop": "url", "iiurlwidth": min(width, c["w"])}
        u = get(API + "?" + urllib.parse.urlencode(p))["query"]["pages"][0]["imageinfo"][0]["thumburl"]
        im = Image.open(io.BytesIO(get(u, True))).convert("RGB"); im.save(f"{out}/full/{i}.jpg", quality=94)
        print(i, im.size)

def fetch_list(out, listfile, width=2400):
    """the pictures of the 46 pairs of the current site, again from Commons at full size (with their licence data)"""
    os.makedirs(f"{out}/full", exist_ok=True); meta = []
    for c in json.load(open(listfile)):
        p = {"action": "query", "format": "json", "formatversion": 2, "titles": c["title"], "prop": "imageinfo", "iiprop": "url|size|extmetadata",
             "iiurlwidth": width, "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Restrictions"}
        try:
            pg = get(API + "?" + urllib.parse.urlencode(p))["query"]["pages"][0]; ii = pg["imageinfo"][0]; m = ii.get("extmetadata", {})
            u = ii.get("thumburl") if ii.get("width", 0) > width else ii["url"]
            im = Image.open(io.BytesIO(get(u, True))).convert("RGB")
            if im.size[0] > width: im = im.resize((width, round(im.size[1] * width / im.size[0])), Image.LANCZOS)
            im.save(f"{out}/full/{c['id']}.jpg", quality=94)
            meta.append({**c, "w": im.size[0], "h": im.size[1], "orig_w": ii.get("width"), "licence_now": plain(m.get("LicenseShortName", {}).get("value")),
                         "artist_now": plain(m.get("Artist", {}).get("value"))[:80], "restrictions": plain(m.get("Restrictions", {}).get("value"))})
            print(c["id"], im.size)
        except Exception as e: meta.append({**c, "error": str(e)}); print("failed", c["id"], e)
    json.dump(meta, open(f"{out}/old46.json", "w"), ensure_ascii=False, indent=1)

if __name__ == "__main__":
    if sys.argv[1] == "sheets": sheets(sys.argv[2])
    elif sys.argv[1] == "list": fetch_list(sys.argv[2], sys.argv[3])
    else: fetch(sys.argv[2], [x for x in sys.argv[3].split(",") if x])
