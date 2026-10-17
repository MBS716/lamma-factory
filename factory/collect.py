"""Photo supply with a persistent registry so a photo is never used twice.
   Commons: Wikimedia Commons "Quality images" (free licences, no key) - the production source.
   Pexels: kept for reference (needs an API key and written permission for bulk use)."""
import os, json, time, hashlib, io, random, urllib.request, urllib.parse
import numpy as np
from PIL import Image

# scene searches that give rich, detailed photos (rotated so the library stays varied)
THEMES = [  # rotated one or two photos at a time so consecutive rounds never look alike
    # streets and cities
    "old town street", "narrow alley", "city street shops", "market square", "street cafe terrace", "shopping street",
    "harbour town", "canal houses", "bridge city river", "tram street", "bicycles parked street", "night street lights",
    # food and drink
    "cafe interior", "restaurant interior", "bakery display", "market stall vegetables", "spice market", "fruit market",
    "food stall", "kitchen interior", "tea house", "bar interior bottles", "cheese shop", "fish market",
    # homes and interiors
    "living room interior", "library interior", "bookshop", "antique shop", "workshop tools", "pottery",
    "museum hall exhibits", "museum showcase", "palace interior", "church interior", "train station hall", "shop window",
    # historic places
    "castle courtyard", "old house facade", "historic building facade", "mosque courtyard", "souk", "medina",
    "village houses", "windmill", "lighthouse", "old farm", "monastery", "fortress walls",
    # gardens, nature, outdoors
    "garden flowers bench", "botanical garden", "park benches", "playground", "beach umbrellas", "boats harbour",
    "fishing boats", "marina", "mountain village", "lake boats", "orchard", "vineyard",
    "farm animals", "autumn park", "snow village", "desert oasis", "campsite", "allotment garden",
    # things and collections
    "toys", "musical instruments", "vintage cars", "bicycles", "clocks", "hats shop",
    "flower shop", "ceramics shop", "lanterns", "hardware store", "flea market", "christmas market",
]

class Registry:
    """Remembers every Pexels photo ever considered and a perceptual hash of every one used."""
    def __init__(self, path):
        self.path = path
        self.d = {"seen": [], "used_hash": [], "theme_page": {}, "theme_i": 0}
        if os.path.exists(path): self.d.update(json.load(open(path)))
        self.seen = set(map(str, self.d["seen"])); self.hashes = [int(h, 16) for h in self.d["used_hash"]]
    def save(self):
        self.d["seen"] = sorted(map(str, self.seen)); self.d["used_hash"] = [f"{h:016x}" for h in self.hashes]
        tmp = self.path + ".tmp"; json.dump(self.d, open(tmp, "w")); os.replace(tmp, self.path)
    def near_duplicate(self, h, maxbits=6):
        return any(bin(h ^ o).count("1") <= maxbits for o in self.hashes)

def dhash(img):
    g = np.asarray(Image.fromarray(img).convert("L").resize((9, 8), Image.BILINEAR), np.int16)
    bits = (g[:, 1:] > g[:, :-1]).ravel(); return int("".join("1" if b else "0" for b in bits), 2)

class Pexels:
    API = "https://api.pexels.com/v1/search"
    def __init__(self, key, registry, per_page=80):
        self.key, self.reg, self.per_page = key, registry, per_page
        self.requests = 0; self.remaining = None
    def _get(self, url, binary=False, auth=True, tries=3):
        for t in range(tries):
            try:
                req = urllib.request.Request(url, headers={"Authorization": self.key, "User-Agent": "lamma-factory/1.0"} if auth else {"User-Agent": "lamma-factory/1.0"})
                with urllib.request.urlopen(req, timeout=40) as r:
                    if auth:
                        self.requests += 1
                        self.remaining = r.headers.get("X-Ratelimit-Remaining", self.remaining)
                    data = r.read()
                    return data if binary else json.loads(data)
            except Exception as e:
                if getattr(e, "code", None) == 429: raise RuntimeError("pexels_rate_limited")
                if t == tries - 1: raise
                time.sleep(2 * (t + 1))
    def photos(self, min_w=1600):
        """Yields fresh landscape photos forever (until the API runs dry or hits its limit)."""
        d = self.reg.d
        while True:
            theme = THEMES[d["theme_i"] % len(THEMES)]; d["theme_i"] += 1
            page = d["theme_page"].get(theme, 1)
            q = urllib.parse.urlencode({"query": theme, "orientation": "landscape", "size": "large", "per_page": self.per_page, "page": page})
            res = self._get(f"{self.API}?{q}")
            d["theme_page"][theme] = page + 1
            items = res.get("photos", [])
            if not items: d["theme_page"][theme] = 1; continue
            random.shuffle(items)
            for p in items:
                if str(p["id"]) in self.reg.seen or p["width"] < min_w: continue
                self.reg.seen.add(str(p["id"]))
                yield {"provider": "pexels", "id": p["id"], "theme": theme, "url": p["url"], "photographer": p["photographer"],
                       "photographer_url": p["photographer_url"], "alt": p.get("alt", ""), "src": p["src"]["large2x"]}
    def download(self, ph):
        data = self._get(ph["src"], binary=True, auth=False)
        return np.array(Image.open(io.BytesIO(data)).convert("RGB"))

import re, html as _html
# licences that allow editing and redistribution of the edited picture (credit shown in the game; -SA pairs stay under CC BY-SA)
FREE_LIC = re.compile(r"^(cc0|public domain|pd|cc by(-sa)? [1-4]\.[05]( [a-z]{2,})?)$", re.I)
def _plain(h): return _html.unescape(re.sub(r"<[^>]+>", "", h or "")).strip()

class Commons:
    """Wikimedia Commons, only files in Category:Quality_images (community-reviewed, high resolution).
    Polite client per the Wikimedia robot policy: identifying User-Agent, one connection, a pause between calls."""
    API = "https://commons.wikimedia.org/w/api.php"
    UA = "LammaFactory/1.0 (https://github.com/MBS716/lamma-factory) python-urllib"
    def __init__(self, registry, batch=50, pause=1.0, width=1920):
        self.reg, self.batch, self.pause, self.width = registry, batch, pause, width
        self.requests = 0; self.remaining = None; self.skipped = {}
    def _get(self, url, binary=False, tries=4):
        for t in range(tries):
            try:
                time.sleep(self.pause)
                req = urllib.request.Request(url, headers={"User-Agent": self.UA, "Accept-Encoding": "identity"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    self.requests += 1; data = r.read()
                    return data if binary else json.loads(data)
            except Exception as e:
                code = getattr(e, "code", None)
                if t == tries - 1: raise
                time.sleep((30 if code in (429, 503) else 3) * (t + 1))
    def skip(self, why): self.skipped[why] = self.skipped.get(why, 0) + 1
    def photos(self, min_w=2000, per_visit=2):
        """Round-robin over THEMES, at most `per_visit` photos per theme before moving to the next one."""
        d = self.reg.d; queue = {}
        while True:
            theme = THEMES[d["theme_i"] % len(THEMES)]; d["theme_i"] += 1
            q = queue.setdefault(theme, [])
            if not q:
                q.extend(self._fetch(theme, min_w))
            for _ in range(per_visit):
                if not q: break
                ph = q.pop(0)
                if ph["id"] in self.reg.seen: continue
                self.reg.seen.add(ph["id"]); yield ph

    def _fetch(self, theme, min_w):
        d = self.reg.d; found = []
        for _ in range(3):
            off = d["theme_page"].get("c:" + theme, 0)
            q = {"action": "query", "format": "json", "formatversion": 2, "generator": "search",
                 "gsrsearch": f'incategory:"Quality images" filetype:bitmap {theme}', "gsrnamespace": 6,
                 "gsrlimit": self.batch, "gsroffset": off, "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata",
                 "iiurlwidth": self.width, "iiextmetadatafilter": "LicenseShortName|LicenseUrl|AttributionRequired|Copyrighted|Artist|Credit|Restrictions|UsageTerms"}
            res = self._get(self.API + "?" + urllib.parse.urlencode(q))
            pages = (res.get("query") or {}).get("pages", [])
            nxt = (res.get("continue") or {}).get("gsroffset")
            d["theme_page"]["c:" + theme] = nxt if nxt and nxt < 9900 else 0
            random.shuffle(pages)
            for p in pages:
                pid = "w" + str(p["pageid"])
                if pid in self.reg.seen: continue
                ii = (p.get("imageinfo") or [{}])[0]; m = ii.get("extmetadata", {})
                lic = _plain(m.get("LicenseShortName", {}).get("value"))
                w, h = ii.get("width", 0), ii.get("height", 0)
                if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"): self.skip("not_photo"); continue
                if w < min_w or not (1.3 <= w / max(1, h) <= 2.0): self.skip("size_or_shape"); continue
                if not FREE_LIC.match(lic): self.skip("licence"); continue
                if "personality" in _plain(m.get("Restrictions", {}).get("value")).lower(): self.skip("personality_rights"); continue
                artist = _plain(m.get("Artist", {}).get("value"))[:80]
                if not artist: self.skip("no_author"); continue
                lic_url = _plain(m.get("LicenseUrl", {}).get("value"))
                if lic.lower().startswith("cc by") and not lic_url: self.skip("licence_unclear"); continue
                found.append({"provider": "commons", "id": pid, "theme": theme, "url": ii.get("descriptionurl", ""),
                       "photographer": artist, "photographer_url": ii.get("descriptionurl", ""), "licence": lic, "licence_url": lic_url,
                       "share_alike": "-sa" in lic.lower(), "attribution": _plain(m.get("AttributionRequired", {}).get("value")) != "false",
                       "alt": p.get("title", ""), "src": ii.get("thumburl") or ii.get("url")})
            if found or not nxt: break
        return found
    def download(self, ph):
        data = self._get(ph["src"], binary=True)
        return np.array(Image.open(io.BytesIO(data)).convert("RGB"))

ART_CATS = [  # public-domain painters with busy, family-friendly scenes (every picture is still reviewed by eye)
    "Paintings by Carl Larsson", "Paintings by Hendrick Avercamp", "Paintings by Pieter Bruegel the Elder",
    "Paintings by Pieter Brueghel the Younger", "Paintings by Jan Brueghel the Elder", "Paintings by Canaletto",
    "Paintings by Bernardo Bellotto", "Paintings by Francesco Guardi", "Paintings by Ludwig Deutsch",
    "Paintings by Rudolf Ernst", "Paintings by Childe Hassam", "Paintings by Camille Pissarro",
]
class CommonsArt(Commons):
    """Public-domain paintings from Wikimedia Commons (rich, hand-made scenes for the illustrated pairs)."""
    def photos(self, min_w=1500, per_visit=2):
        d = self.reg.d; queue = {}
        while True:
            cat = ART_CATS[d.get("art_i", 0) % len(ART_CATS)]; d["art_i"] = d.get("art_i", 0) + 1
            q = queue.setdefault(cat, [])
            if not q: q.extend(self._fetch_cat(cat, min_w))
            for _ in range(per_visit):
                if not q: break
                ph = q.pop(0)
                if ph["id"] in self.reg.seen: continue
                self.reg.seen.add(ph["id"]); yield ph
    def _fetch_cat(self, cat, min_w):
        d = self.reg.d; found = []; d.setdefault("theme_page", {})
        off = d["theme_page"].get("a:" + cat, 0)
        q = {"action": "query", "format": "json", "formatversion": 2, "generator": "search",
             "gsrsearch": f'incategory:"{cat}" filetype:bitmap', "gsrnamespace": 6, "gsrlimit": self.batch, "gsroffset": off,
             "prop": "imageinfo", "iiprop": "url|size|mime|extmetadata", "iiurlwidth": self.width,
             "iiextmetadatafilter": "LicenseShortName|LicenseUrl|Artist|Restrictions"}
        res = self._get(self.API + "?" + urllib.parse.urlencode(q))
        pages = (res.get("query") or {}).get("pages", []); nxt = (res.get("continue") or {}).get("gsroffset")
        d["theme_page"]["a:" + cat] = nxt if nxt and nxt < 9900 else 0
        random.shuffle(pages)
        for p in pages:
            ii = (p.get("imageinfo") or [{}])[0]; m = ii.get("extmetadata", {})
            lic = _plain(m.get("LicenseShortName", {}).get("value")); w, h = ii.get("width", 0), ii.get("height", 0)
            if ii.get("mime") not in ("image/jpeg", "image/png", "image/webp"): self.skip("not_image"); continue
            if w < min_w or not (1.25 <= w / max(1, h) <= 2.1): self.skip("size_or_shape"); continue
            if not re.match(r"^(public domain|pd|cc0)", lic, re.I): self.skip("licence"); continue
            artist = cat.replace("Paintings by ", "")
            found.append({"provider": "commons", "id": "w" + str(p["pageid"]), "theme": "painting", "url": ii.get("descriptionurl", ""),
                   "photographer": artist, "photographer_url": ii.get("descriptionurl", ""), "licence": "Public domain", "licence_url": "",
                   "share_alike": False, "attribution": False, "alt": p.get("title", ""), "src": ii.get("thumburl") or ii.get("url")})
        return found

class Folder:
    """Local photos (for offline tests). Credit fields are filled from the file name."""
    def __init__(self, folder, registry):
        self.files = sorted(f for f in os.listdir(folder) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")))
        self.folder, self.reg = folder, registry
    def photos(self, min_w=0):
        for f in self.files:
            pid = "local-" + hashlib.md5(f.encode()).hexdigest()[:10]
            if pid in self.reg.seen: continue
            self.reg.seen.add(pid)
            yield {"provider": "local", "id": pid, "theme": "local", "url": "", "photographer": "", "photographer_url": "", "alt": f, "src": os.path.join(self.folder, f)}
    def download(self, ph): return np.array(Image.open(ph["src"]).convert("RGB"))
