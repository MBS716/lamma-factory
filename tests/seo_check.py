"""Check what Google and link previews see on a published copy of the site.
Usage: python tests/seo_check.py <site url> <out folder> [expected canonical url]"""
import sys, json, re, os, urllib.request, html as H
from xml.etree import ElementTree as ET
URL = sys.argv[1].rstrip('/') + '/'; OUT = sys.argv[2]; CANON = sys.argv[3] if len(sys.argv) > 3 else URL
os.makedirs(OUT, exist_ok=True); R = {"url": URL, "checks": []}
def check(ok, msg): R["checks"].append(("OK " if ok else "FAIL ") + msg); print(R["checks"][-1]); return ok
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r: return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), b""
    except Exception as e: return 0, {}, str(e).encode()
def run():
    global page
    st, hd, body = get(URL); page = body.decode("utf-8", "replace")
    check(st == 200, f"page answers 200 ({st})")
    xr = {k.lower(): v for k, v in hd.items()}.get("x-robots-tag", "")
    check("noindex" not in xr.lower(), f"no X-Robots-Tag noindex header ({xr or 'none'})")
    meta = lambda attr, name: (re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', page) or [None, None])[1]
    title = (re.search(r"<title>([^<]*)</title>", page) or [None, ""])[1]
    check(title == "لمّة | ألعاب جماعية ومسابقات مباشرة", f"title: {title}")
    d = meta("name", "description") or ""; check(70 <= len(d) <= 170, f"description {len(d)} characters")
    rb = meta("name", "robots") or ""; check("noindex" not in rb and "index" in rb, f"robots meta: {rb}")
    can = (re.search(r'<link rel="canonical" href="([^"]+)"', page) or [None, ""])[1]; check(can == CANON, f"canonical: {can}")
    check('<html lang="ar" dir="rtl">' in page, "html lang=ar dir=rtl")
    for p in ("og:title", "og:description", "og:url", "og:image", "og:type", "og:locale", "og:site_name"):
        check(bool(meta("property", p)), f"{p}: {(meta('property', p) or '')[:70]}")
    check(meta("name", "twitter:card") == "summary_large_image", "twitter card: large image")
    gv = os.environ.get("GSV", "")
    if gv: check(meta("name", "google-site-verification") == gv, f"Search Console verification tag present: {meta('name', 'google-site-verification')}")
    lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', page, re.S)
    try:
        data = json.loads(lds[0]); types = [x["@type"] for x in data]
        check(set(types) >= {"WebSite", "WebApplication"}, f"structured data parses: {types}")
    except Exception as e: check(False, f"structured data: {e}")
    # files a crawler or a chat app will fetch
    for f, kind in (("og-image.png", "image/png"), ("favicon.ico", ""), ("favicon-32.png", "image/png"), ("apple-touch-icon.png", "image/png"),
                    ("icon-192.png", "image/png"), ("icon-512.png", "image/png"), ("site.webmanifest", ""), ("sitemap.xml", ""), ("robots.txt", "text/plain")):
        s, h, b = get(URL + f); ct = {k.lower(): v for k, v in h.items()}.get("content-type", "")
        check(s == 200 and len(b) > 50 and (not kind or kind in ct), f"{f}: {s}, {len(b)} bytes, {ct}")
        if f == "og-image.png" and s == 200:
            open(f"{OUT}/og-image.png", "wb").write(b)
            w, hh = int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big"); check((w, hh) == (1200, 630), f"preview image size {w}x{hh}")
        if f == "sitemap.xml" and s == 200:
            locs = [e.text for e in ET.fromstring(b).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]; check(locs == [CANON], f"sitemap lists {locs}")
    # Google reads robots.txt only at the root of the host
    root = re.match(r"https?://[^/]+/", URL).group(0)
    s, h, b = get(root + "robots.txt"); txt = b.decode("utf-8", "replace")
    blocked = any(re.match(r"(?i)disallow:\s*/\s*$", l.strip()) for l in txt.splitlines())
    R["host_robots"] = {"status": s, "body": txt[:400]}
    check(s in (200, 404) and not blocked, f"host robots.txt ({root}robots.txt): {s}, {'blocks everything' if blocked else 'does not block the site'}")
try: run()
except Exception as e:
    import traceback; R["exception"] = traceback.format_exc()[-1500:]; check(False, f"check crashed: {e}")
R["PASS"] = all(c.startswith("OK") for c in R["checks"])
json.dump(R, open(f"{OUT}/seo.json", "w"), ensure_ascii=False, indent=1); sys.exit(0 if R["PASS"] else 1)
