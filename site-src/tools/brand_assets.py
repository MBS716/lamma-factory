"""Draw the site icons and the link-preview image from the existing Lamma mark (gold hexagon with «ل»).

  python tools/brand_assets.py <folder with lalezar-arabic-400-normal.woff2 and ibm-plex-sans-arabic-arabic-*.woff2>
Writes assets/brand/: favicon.ico, favicon-32.png, apple-touch-icon.png (180), icon-192.png, icon-512.png, og-image.png (1200x630)."""
import asyncio, base64, os, sys, io
from PIL import Image
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FD = sys.argv[1]; OUT = os.path.join(ROOT, "assets", "brand"); os.makedirs(OUT, exist_ok=True)
b64 = lambda f: base64.b64encode(open(os.path.join(FD, f), "rb").read()).decode()
FONTS = f"""@font-face{{font-family:Lalezar;src:url(data:font/woff2;base64,{b64('lalezar-arabic-400-normal.woff2')}) format('woff2')}}
@font-face{{font-family:Plex;font-weight:400;src:url(data:font/woff2;base64,{b64('ibm-plex-sans-arabic-arabic-400-normal.woff2')}) format('woff2')}}
@font-face{{font-family:Plex;font-weight:700;src:url(data:font/woff2;base64,{b64('ibm-plex-sans-arabic-arabic-700-normal.woff2')}) format('woff2')}}"""
HEX = "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)"

def icon_html(size, pad, bg):
    hw = size - 2 * pad; hh = hw * 1.1547
    if hh > size - 2 * pad: hh = size - 2 * pad; hw = hh / 1.1547
    return f"""<html><head><style>{FONTS}*{{margin:0}}body{{width:{size}px;height:{size}px;background:{bg};display:grid;place-items:center}}
.m{{width:{hw}px;height:{hh}px;background:#f6b93b;clip-path:{HEX};display:grid;place-items:center;font-family:Lalezar;color:#241a03;font-size:{hh*0.62}px;line-height:1;padding-top:{hh*0.1}px;box-sizing:border-box}}</style></head>
<body><div class="m">ل</div></body></html>"""

OG = f"""<html lang="ar" dir="rtl"><head><style>{FONTS}*{{margin:0;box-sizing:border-box}}
body{{width:1200px;height:630px;background:#0f1430;background-image:radial-gradient(#34407a 1.4px,transparent 2px);background-size:30px 30px;color:#f6f1e4;font-family:Plex;
display:flex;flex-direction:column;justify-content:center;padding:0 90px;gap:26px;position:relative;overflow:hidden}}
.top{{display:flex;align-items:center;gap:34px}}
.m{{width:170px;height:196px;background:#f6b93b;clip-path:{HEX};display:grid;place-items:center;font-family:Lalezar;color:#241a03;font-size:118px;padding-top:18px;flex:none}}
h1{{font-family:Lalezar;font-weight:400;font-size:150px;line-height:1;color:#f6b93b}}
h2{{font-family:Lalezar;font-weight:400;font-size:62px;line-height:1.15}}
.chips{{display:flex;flex-wrap:wrap;gap:12px}}
.chips span{{font-weight:700;font-size:27px;padding:8px 22px;border-radius:99px;background:#1c2450;border:2px solid #34407a}}
.chips span:nth-child(1){{border-color:#22c39a}} .chips span:nth-child(2){{border-color:#ff7b47}} .chips span:nth-child(3){{border-color:#f6b93b}} .chips span:nth-child(4){{border-color:#5b8cff}} .chips span:nth-child(5){{border-color:#b07cff}}
p{{font-size:30px;color:#a9b0d4}}
.hexes{{position:absolute;left:60px;top:70px;display:flex;gap:10px;direction:ltr;opacity:.9}}
.hexes i{{width:64px;height:74px;clip-path:{HEX};display:block}}</style></head><body>
<div class="hexes"><i style="background:#22c39a"></i><i style="background:#f6b93b;margin-top:38px"></i><i style="background:#ff7b47"></i></div>
<div class="top"><div class="m">ل</div><div><h1>لمّة</h1></div></div>
<h2>ألعاب جماعية ومسابقات مباشرة</h2>
<div class="chips"><span>سباق الحروف</span><span>عجلة التحديات</span><span>تحدي الأسئلة</span><span>اكتشف الفرق</span><span>الصورة الملخبطة</span></div>
<p>شاشة واحدة للمقدّم، وكل لاعب يدخل بكود من جواله.</p></body></html>"""

async def shot(pg, html, w, h, path):
    await pg.set_viewport_size({"width": w, "height": h}); await pg.set_content(html); await pg.evaluate("document.fonts.ready")
    await pg.wait_for_timeout(150); await pg.screenshot(path=path, clip={"x": 0, "y": 0, "width": w, "height": h}, omit_background=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page()
        await shot(pg, icon_html(512, 24, "transparent"), 512, 512, os.path.join(OUT, "mark-512.png"))
        await shot(pg, icon_html(512, 70, "#0f1430"), 512, 512, os.path.join(OUT, "icon-512.png"))
        await shot(pg, icon_html(180, 22, "#0f1430"), 180, 180, os.path.join(OUT, "apple-touch-icon.png"))
        await shot(pg, OG, 1200, 630, os.path.join(OUT, "og-image.png"))
        await b.close()
    big = Image.open(os.path.join(OUT, "icon-512.png")).convert("RGBA")
    big.resize((192, 192), Image.LANCZOS).save(os.path.join(OUT, "icon-192.png"))
    mark = Image.open(os.path.join(OUT, "mark-512.png")).convert("RGBA")
    mark.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, "favicon-32.png"))
    mark.save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    og = Image.open(os.path.join(OUT, "og-image.png")).convert("RGB"); og.save(os.path.join(OUT, "og-image.png"), optimize=True)
    os.remove(os.path.join(OUT, "mark-512.png"))
    print(sorted(os.listdir(OUT)))
asyncio.run(main())
