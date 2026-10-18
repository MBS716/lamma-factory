"""Build a review page of every spot-the-difference pair in a built site: both pictures, the differences circled.

  python tools/review_page.py dist out_dir
Writes out_dir/index.html and out_dir/t/*.webp (small copies)."""
import json, os, sys, html
from PIL import Image, ImageDraw
root, out = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(out, "t"), exist_ok=True)
idx = json.load(open(os.path.join(root, "spot/catalog/index.json")))
ents = [e for sh in idx["shards"] for e in json.load(open(os.path.join(root, "spot/catalog", sh["name"])))]
LV = ["سهل", "متوسط", "صعب"]; KIND = {"photo": "صورة حقيقية", "painting": "لوحة فنية", "art": "رسم"}
cards = []
for e in sorted(ents, key=lambda e: (e["l"], e.get("k", ""), e["id"])):
    W = 560; sc = W / e["w"]
    for k in "ab":
        im = Image.open(os.path.join(root, "spot/pairs", e["id"] + k + ".webp")).convert("RGB").resize((W, round(e["h"] * sc)))
        if k == "b":
            d = ImageDraw.Draw(im)
            for x, y, rx, ry in e["d"]:
                d.ellipse(((x - rx * 1.2) * sc, (y - ry * 1.2) * sc, (x + rx * 1.2) * sc, (y + ry * 1.2) * sc), outline=(230, 40, 60), width=3)
        im.save(os.path.join(out, "t", e["id"] + k + ".webp"), "WEBP", quality=72)
    c = e.get("c") or []
    credit = f"{html.escape(c[0])} · {html.escape(c[2])}" if len(c) >= 3 else "رسم أصلي"
    cards.append(f'''<article class="card"><header><b>{html.escape(e.get("t") or "")}</b><span class="tag l{e["l"]}">{LV[e["l"]]}</span><span class="tag">{KIND.get(e.get("k","photo"),"")}</span><span class="tag">{len(e["d"])} فروق</span></header>
<div class="pair"><img loading="lazy" src="t/{e["id"]}a.webp" alt="الأصل"><img loading="lazy" src="t/{e["id"]}b.webp" alt="المعدّلة مع الفروق"></div><footer>{credit} · <code>{e["id"]}</code></footer></article>''')
lv = idx["levels"]
page = f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>مكتبة اكتشف الفرق</title>
<style>
:root{{--bg:#f6f4ef;--fg:#1d1f2a;--muted:#5d6272;--card:#fff;--line:#e2ded4;--accent:#c2410c}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#13151d;--fg:#ecebe6;--muted:#a3a7b5;--card:#1c1f2a;--line:#2d3140;--accent:#fb923c}}}}
:root[data-theme="dark"]{{--bg:#13151d;--fg:#ecebe6;--muted:#a3a7b5;--card:#1c1f2a;--line:#2d3140;--accent:#fb923c}}
body{{margin:0;background:var(--bg);color:var(--fg);font-family:"IBM Plex Sans Arabic",system-ui,sans-serif;line-height:1.6}}
main{{max-width:1200px;margin:0 auto;padding:24px 16px 48px}} h1{{margin:0 0 4px;font-size:1.7rem}} .lede{{color:var(--muted);margin:0 0 18px}}
.sum{{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}} .sum div{{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 14px}} .sum b{{font-size:1.3rem;display:block}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px;margin-bottom:14px}}
.card header{{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}} .tag{{font-size:.8rem;border:1px solid var(--line);border-radius:99px;padding:1px 10px;color:var(--muted)}}
.tag.l0{{color:#15803d}} .tag.l1{{color:#b45309}} .tag.l2{{color:#b91c1c}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:8px;direction:ltr}} .pair img{{width:100%;height:auto;border-radius:8px;display:block}}
.card footer{{color:var(--muted);font-size:.85rem;margin-top:6px}} code{{font-size:.8rem}}
@media (max-width:640px){{.pair{{grid-template-columns:1fr}}}}
</style></head><body><main>
<h1>مكتبة «اكتشف الفرق»</h1><p class="lede">كل الأزواج المتاحة في النسخة الجديدة. يسارًا الصورة الأصلية، ويمينًا المعدّلة مع دوائر حمراء حول كل فرق. كل زوج هنا اجتاز الفحص الآلي على الملفات نفسها (تُحمَّل، كل فرق ظاهر فعلًا، ولا تغيير خارج الدوائر).</p>
<div class="sum"><div>المجموع<b>{idx["total"]}</b></div><div>سهل<b>{lv[0]}</b></div><div>متوسط<b>{lv[1]}</b></div><div>صعب<b>{lv[2]}</b></div></div>
{"".join(cards)}
</main></body></html>'''
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(page)
print(len(cards), "pairs")
