"""Photo supply with a persistent registry so a photo is never used twice.
   Commons: Wikimedia Commons "Quality images" (free licences, no key) - the production source.
   Pexels: kept for reference (needs an API key and written permission for bulk use)."""
import os, json, time, hashlib, io, random, urllib.request, urllib.parse
import numpy as np
from PIL import Image

# scene searches that give rich, detailed photos (rotated so the library stays varied)
THEMES = [
    "old market", "souk", "bazaar stalls", "spice market", "street market", "fruit stall", "flower market",
    "flea market", "antique shop", "bookshop interior", "library interior", "cafe interior", "restaurant interior",
    "bakery shop", "kitchen interior", "living room interior", "cozy room", "workshop tools", "pottery shop",
    "carpet shop", "lantern shop", "toy shop", "street food stall", "harbor boats", "fishing village",
    "old town street", "narrow alley", "colorful street", "city street cars", "rooftops city", "balcony plants",
    "window flowers", "village houses", "farm market", "garden with bench", "park playground", "beach umbrellas",
    "camping site", "train station", "museum hall", "art gallery wall", "supermarket shelves", "hardware store",
    "bicycle street", "desk with objects", "office interior", "classroom", "music instruments shop",
    "vintage interior", "shelves with jars", "tea shop", "coffee roastery", "fish market", "textile shop",
    "desert camp", "festival street", "night market", "old house facade", "castle courtyard", "marina",
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
    def photos(self, min_w=2000):
        d = self.reg.d
        while True:
            theme = THEMES[d["theme_i"] % len(THEMES)]; d["theme_i"] += 1
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
                self.reg.seen.add(pid)
                artist = _plain(m.get("Artist", {}).get("value"))[:80]
                if not artist: self.skip("no_author"); continue
                lic_url = _plain(m.get("LicenseUrl", {}).get("value"))
                if lic.lower().startswith("cc by") and not lic_url: self.skip("licence_unclear"); continue
                yield {"provider": "commons", "id": pid, "theme": theme, "url": ii.get("descriptionurl", ""),
                       "photographer": artist, "photographer_url": ii.get("descriptionurl", ""), "licence": lic, "licence_url": lic_url,
                       "share_alike": "-sa" in lic.lower(), "attribution": _plain(m.get("AttributionRequired", {}).get("value")) != "false",
                       "alt": p.get("title", ""), "src": ii.get("thumburl") or ii.get("url")}
    def download(self, ph):
        data = self._get(ph["src"], binary=True)
        return np.array(Image.open(io.BytesIO(data)).convert("RGB"))

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
