"""Build the two outputs from src/:
   dist/index.html    standalone site (GitHub Pages) with Firebase live connection
   dist/artifact.html Claude artifact version (live connection through Claude)"""
import os, json
ROOT = os.path.dirname(os.path.abspath(__file__))
S = lambda f: open(os.path.join(ROOT, 'src', f), encoding='utf-8').read()

FIREBASE = {
  "apiKey": "AIzaSyDYeFUK0RhwmFUUwuGNkjH_0cnrsDP0EOA",
  "authDomain": "lamma-b3804.firebaseapp.com",
  "databaseURL": "https://lamma-b3804-default-rtdb.europe-west1.firebasedatabase.app",
  "projectId": "lamma-b3804",
  "storageBucket": "lamma-b3804.firebasestorage.app",
  "messagingSenderId": "75949188252",
  "appId": "1:75949188252:web:f2e58971af02071b8a7959",
}
ARTIFACT_URL = "https://claude.ai/artifact/ETLdZz3fT57pSaQAd6bkBS"
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lalezar&family=IBM+Plex+Sans+Arabic:wght@400;500;700&display=swap">\n')
QR = '<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>\n'
FB = ('<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>\n'
      '<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>\n')
RESET = ('*,*::before,*::after{box-sizing:border-box}\n'
         'html{-webkit-text-size-adjust:100%;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}\n'
         'body{margin:0}\nimg{max-width:100%}\n[hidden]{display:none!important}\n')

import glob, shutil, hashlib
DIST = os.path.join(ROOT, 'dist')
os.makedirs(DIST, exist_ok=True)

def spot_catalog():
    """Spot-the-difference library -> dist/spot/catalog (index + shards) and dist/spot/pairs (images).
    The page downloads only the index and the shards it needs, so the library can grow to thousands of pairs."""
    pairs = json.load(open(os.path.join(ROOT, 'spotlib', 'pairs.json'), encoding='utf-8'))
    out = os.path.join(DIST, 'spot'); shutil.rmtree(out, ignore_errors=True)
    os.makedirs(os.path.join(out, 'pairs')); os.makedirs(os.path.join(out, 'catalog'))
    ents = []
    for p in pairs:
        for k in ('a', 'b'): shutil.copy(os.path.join(ROOT, 'spotlib', p[k]), os.path.join(out, 'pairs', p['id'] + k + '.webp'))
        ents.append({'id': p['id'], 'l': p['level'], 'w': p['w'], 'h': p['h'], 't': p.get('title', ''), 'k': p.get('kind', 'photo'),
                     'd': [[d['x'], d['y'], d['rx'], d['ry']] for d in p['diffs']], 'c': p.get('credit')})
    for f in ('thumb_a.webp', 'thumb_b.webp'): shutil.copy(os.path.join(ROOT, 'spotlib', f), os.path.join(out, f))
    SH = 400; shards = []
    for i in range(0, len(ents), SH):
        part = ents[i:i + SH]; name = f'shard-{i // SH:04d}.json'
        json.dump(part, open(os.path.join(out, 'catalog', name), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        shards.append({'name': name, 'count': len(part), 'levels': [sum(e['l'] == l for e in part) for l in range(3)]})
    idx = {'total': len(ents), 'levels': [sum(e['l'] == l for e in ents) for l in range(3)], 'shards': shards}
    json.dump(idx, open(os.path.join(out, 'catalog', 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return idx
SPOT_IDX = spot_catalog()

def banks():
    """Question banks (validated by tools/banks.py) -> dist/data/*.json, loaded only when a game starts."""
    out = os.path.join(DIST, 'data'); shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    emb, h = {}, hashlib.md5()
    for name in ('quiz', 'letters'):
        f = os.path.join(ROOT, 'data', name + '.json')
        if not os.path.exists(f): continue
        raw = open(f, 'rb').read(); h.update(raw); shutil.copy(f, os.path.join(out, name + '.json'))
        emb[name] = json.loads(raw)
    return emb, h.hexdigest()[:10]
EMB, BANKV = banks()

def js(firebase, base, spot_cdn='spot/', embed=False):
    code = '\n'.join([S('data.js'), S('photo.js'), S('draw.js'), S('app.js')])
    if embed: code = 'window.EMBED_BANKS = ' + json.dumps(EMB, ensure_ascii=False, separators=(',', ':')) + ';\n' + code
    code = code.replace('/*@@FIREBASE@@*/null', json.dumps(firebase, ensure_ascii=False) if firebase else 'null')
    code = code.replace('/*@@BASE@@*/""', json.dumps(base))
    code = code.replace('/*@@SPOTCDN@@*/"spot/"', json.dumps(os.environ.get('SPOT_CDN', spot_cdn)))
    code = code.replace('/*@@BANKV@@*/""', json.dumps(BANKV))
    # "use strict" must lead the script
    code = '"use strict";\n' + code.replace('"use strict";\n', '')
    return code

title = '<title>لمّة للألعاب الجماعية</title>\n'

# ---------------- search engines and link previews ----------------
# One place for the public address: a custom domain later only needs LAMMA_SITE_URL (and LAMMA_CNAME) changed.
SITE_URL = os.environ.get('LAMMA_SITE_URL', 'https://mbs716.github.io/lamma/').rstrip('/') + '/'
CNAME = os.environ.get('LAMMA_CNAME', '')                       # e.g. lamma.example.com when a domain is bought
SITE_NAME = 'لمّة | ألعاب جماعية ومسابقات مباشرة'
SITE_DESC = ('العب مع أصدقائك من جوالاتكم بكود واحد: سباق الحروف، وعجلة التحديات، وتحدي الأسئلة، واكتشف الفرق، '
             'والصورة الملخبطة. المقدّم على الشاشة والنتائج لحظية، مجانًا وبدون تسجيل.')
GAMES_LIST = ['سباق الحروف', 'عجلة التحديات', 'تحدي الأسئلة', 'اكتشف الفرق', 'الصورة الملخبطة']
BRAND = os.path.join(ROOT, 'assets', 'brand')
for f in os.listdir(BRAND): shutil.copy(os.path.join(BRAND, f), os.path.join(DIST, f))
# Search Console: either a meta tag value in assets/google-verification.txt, or Google's own googleXXXX.html file in assets/
VERIFY = ''
vf = os.path.join(ROOT, 'assets', 'google-verification.txt')
if os.path.exists(vf):
    VERIFY = open(vf, encoding='utf-8').read().strip()
for f in os.listdir(os.path.join(ROOT, 'assets')):
    if f.startswith('google') and f.endswith('.html'): shutil.copy(os.path.join(ROOT, 'assets', f), os.path.join(DIST, f))
from datetime import date
TODAY = os.environ.get('LAMMA_DATE', date.today().isoformat())
ld = [{
    "@context": "https://schema.org", "@type": "WebSite", "name": "لمّة", "alternateName": SITE_NAME,
    "url": SITE_URL, "inLanguage": "ar", "description": SITE_DESC},
  {"@context": "https://schema.org", "@type": "WebApplication", "name": "لمّة", "alternateName": SITE_NAME, "url": SITE_URL,
    "description": SITE_DESC, "inLanguage": "ar", "applicationCategory": "GameApplication", "applicationSubCategory": "ألعاب جماعية",
    "operatingSystem": "Android, iOS, Windows, macOS", "browserRequirements": "يتطلب متصفحًا حديثًا واتصالًا بالإنترنت",
    "isAccessibleForFree": True, "offers": {"@type": "Offer", "price": "0", "priceCurrency": "SAR"},
    "featureList": GAMES_LIST, "image": SITE_URL + "og-image.png",
    "publisher": {"@type": "Organization", "name": "TIGER"}}]
SEO_HEAD = ('<title>' + SITE_NAME + '</title>\n'
  f'<meta name="description" content="{SITE_DESC}">\n'
  '<meta name="robots" content="index,follow,max-image-preview:large">\n'
  f'<link rel="canonical" href="{SITE_URL}">\n'
  '<meta name="application-name" content="لمّة">\n<meta name="apple-mobile-web-app-title" content="لمّة">\n'
  '<link rel="icon" href="favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">\n'
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<link rel="manifest" href="site.webmanifest">\n'
  '<meta property="og:type" content="website">\n<meta property="og:locale" content="ar_SA">\n'
  f'<meta property="og:site_name" content="لمّة">\n<meta property="og:title" content="{SITE_NAME}">\n'
  f'<meta property="og:description" content="{SITE_DESC}">\n<meta property="og:url" content="{SITE_URL}">\n'
  f'<meta property="og:image" content="{SITE_URL}og-image.png">\n<meta property="og:image:width" content="1200">\n'
  '<meta property="og:image:height" content="630">\n<meta property="og:image:type" content="image/png">\n'
  '<meta property="og:image:alt" content="شعار لمّة وأسماء الألعاب الخمس">\n'
  '<meta name="twitter:card" content="summary_large_image">\n'
  f'<meta name="twitter:title" content="{SITE_NAME}">\n<meta name="twitter:description" content="{SITE_DESC}">\n'
  f'<meta name="twitter:image" content="{SITE_URL}og-image.png">\n'
  + (f'<meta name="google-site-verification" content="{VERIFY}">\n' if VERIFY else '')
  + '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + '</script>\n')
open(os.path.join(DIST, 'robots.txt'), 'w').write(f'User-agent: *\nAllow: /\n\nSitemap: {SITE_URL}sitemap.xml\n')
open(os.path.join(DIST, 'sitemap.xml'), 'w', encoding='utf-8').write(
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  f'  <url><loc>{SITE_URL}</loc><lastmod>{TODAY}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>\n</urlset>\n')
json.dump({"name": SITE_NAME, "short_name": "لمّة", "description": SITE_DESC, "lang": "ar", "dir": "rtl",
           "start_url": "./", "scope": "./", "display": "standalone", "background_color": "#0f1430", "theme_color": "#0f1430",
           "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
                     {"src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]},
          open(os.path.join(DIST, 'site.webmanifest'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if CNAME: open(os.path.join(DIST, 'CNAME'), 'w').write(CNAME + '\n')
import base64
css, body = S('style.css'), S('body.html')
VERSION = os.environ.get('LAMMA_VERSION', 'v2.0')
body = body.replace('@@VER@@', 'لمّة ' + VERSION)
TIGER_B64 = 'data:image/webp;base64,' + base64.b64encode(open(os.path.join(ROOT, 'assets', 'tiger.webp'), 'rb').read()).decode()
shutil.copy(os.path.join(ROOT, 'assets', 'tiger.webp'), os.path.join(DIST, 'tiger.webp'))   # separate file: the page itself stays small
body_site = body.replace('@@TIGER@@', 'tiger.webp')
body = body.replace('@@TIGER@@', TIGER_B64)

standalone = ('<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0f1430">\n'
  + SEO_HEAD + FONTS + '<style>\n' + RESET + css + '</style>\n</head>\n<body>\n' + body_site + QR + FB
  + '<script>\n' + js(FIREBASE, '') + '\n</script>\n</body>\n</html>\n')
open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8').write(standalone)

artifact = (title + '<meta name="claude:viewport-fit-sides" content="cover">\n' + FONTS + '<style>\n' + css + '</style>\n' + body + QR
  + '<script>\n' + js(None, ARTIFACT_URL, 'https://mbs716.github.io/lamma/spot/', True) + '\n</script>\n')
open(os.path.join(ROOT, 'dist', 'artifact.html'), 'w', encoding='utf-8').write(artifact)
print('built', len(standalone), len(artifact), 'spot', SPOT_IDX['total'], SPOT_IDX['levels'], 'banks', {k: len(v) for k, v in EMB.items()})
