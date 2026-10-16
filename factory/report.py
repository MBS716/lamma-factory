"""Arabic HTML report for a factory run: every accepted pair with its numbered differences,
close-ups of each edit, every rejected photo with the reason, timing, acceptance rate and cost projection."""
import os, html, json
import numpy as np
from PIL import Image

OPS = {"remove": "حذف", "dup": "نسخ", "move": "إزاحة", "flip": "قلب", "scale": "تكبير", "swap": "استبدال"}
LV = ["سهل", "متوسط", "صعب"]
REASONS = {"not_enough_candidates": "عناصر مناسبة غير كافية", "too_few_good_edits": "تعديلات ناجحة غير كافية",
           "scene_too_plain": "المشهد بسيط جدًا", "diffs_clustered": "الفروق متجمعة في منطقة واحدة",
           "stray_change": "تغيير خارج مناطق الفروق", "near_duplicate": "صورة مكررة تقريبًا",
           "one_edit_type_only": "نوع تعديل واحد فقط", "level_quota_full": "حصة المستوى مكتملة", "author_quota": "حد صور المصوّر الواحد"}

def write_report(out, stats, log, accepted):
    d = os.path.join(out, "report"); os.makedirs(os.path.join(d, "img"), exist_ok=True)
    blocks = []
    for n, (pid, A, res) in enumerate(accepted, 1):
        Image.fromarray(A).save(f"{d}/img/{pid}a.jpg", quality=86); Image.fromarray(res["B"]).save(f"{d}/img/{pid}b.jpg", quality=86)
        H, W = A.shape[:2]
        circ = "".join(f'<ellipse cx="{f["x"]}" cy="{f["y"]}" rx="{f["rx"] * 1.25}" ry="{f["ry"] * 1.25}"/><text x="{f["x"] + f["rx"] * 1.25 + 3}" y="{f["y"] - f["ry"] * 1.25 + 4}">{i + 1}</text>' for i, f in enumerate(res["diffs"]))
        crops = []
        for i, f in enumerate(res["diffs"]):
            s = int(max(110, max(f["rx"], f["ry"]) * 2.8)); x0 = max(0, min(W - s, f["x"] - s // 2)); y0 = max(0, min(H - s, f["y"] - s // 2))
            Image.fromarray(np.hstack([A[y0:y0 + s, x0:x0 + s], np.full((s, 6, 3), 30, np.uint8), res["B"][y0:y0 + s, x0:x0 + s]])).resize((372, 180)).save(f"{d}/img/{pid}_{i + 1}.jpg", quality=85)
            crops.append(f'<figure><img src="img/{pid}_{i + 1}.jpg" loading="lazy"><figcaption>{i + 1}. {OPS.get(f["op"], f["op"])} · {html.escape(str(f["what"]) if f["what"] != "detail" else "تفصيل")}</figcaption></figure>')
        rec = next(r for r in log if r.get("id") == pid)
        blocks.append(f'''<section class="pair"><h3>{n}. <span class="lv l{res["level"]}">{LV[res["level"]]}</span> {len(res["diffs"])} فروق · {html.escape(rec["theme"])} · {rec["t_total"]} ث</h3>
<p class="cr">الصورة: <a href="{html.escape(rec["url"])}">{html.escape(rec.get("credit", ""))}</a> · <a href="{html.escape(rec.get("licence_url", ""))}">{html.escape(rec.get("licence", ""))}</a> · معدّلة{" · المشتقة تُنشر بنفس الرخصة (SA)" if rec.get("share_alike") else ""}</p>
<div class="ab"><img src="img/{pid}a.jpg" loading="lazy"><div class="wrap"><img src="img/{pid}b.jpg" loading="lazy"><svg viewBox="0 0 {W} {H}">{circ}</svg></div></div>
<div class="crops">{"".join(crops)}</div></section>''')
    rej = [r for r in log if not r.get("ok")]
    rej_rows = "".join(f'<tr><td>{html.escape(str(r["photo"]))}</td><td>{html.escape(r.get("theme", ""))}</td><td>{html.escape(" / ".join(REASONS.get(p.split(":")[-1], p) for p in r["reason"].split(" / ")))}</td><td>{r.get("t_total", "")}</td></tr>' for r in rej)
    reasons = "".join(f"<li>{REASONS.get(k, k)}: {v}</li>" for k, v in sorted(stats["reasons"].items(), key=lambda x: -x[1]))
    mpa = stats["min_per_accepted"]; kb = stats["avg_pair_kb"] or 0
    page = f'''<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>تقرير مصنع الفروق</title><style>
body{{font-family:"Noto Naskh Arabic","Segoe UI",Tahoma,sans-serif;margin:0;padding:16px;background:#f6f5f1;color:#1c1c1c}}
h1{{margin:.2em 0}} .stats{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:14px 0}}
.stats div{{background:#fff;border:1px solid #ddd;border-radius:10px;padding:10px}} .stats b{{display:block;font-size:1.5em}}
.pair{{background:#fff;border:1px solid #ddd;border-radius:12px;padding:12px;margin:16px 0}}
.ab{{display:grid;grid-template-columns:1fr 1fr;gap:8px;direction:ltr}} .ab img{{width:100%;display:block}}
.wrap{{position:relative}} .wrap svg{{position:absolute;inset:0;width:100%;height:100%}}
svg ellipse{{fill:none;stroke:#ff2020;stroke-width:3}} svg text{{fill:#ffe100;stroke:#000;stroke-width:.8;font-size:26px;font-weight:700}}
.crops{{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}} figure{{margin:0}} figure img{{width:372px;max-width:100%;display:block}}
.cr{{font-size:.85em;color:#555;margin:0 0 6px}} figcaption{{font-size:.85em;color:#555}} .lv{{padding:1px 8px;border-radius:99px;color:#fff;font-size:.8em}} .l0{{background:#2a9d6a}} .l1{{background:#d39a12}} .l2{{background:#c2452d}}
table{{border-collapse:collapse;width:100%;background:#fff}} td,th{{border:1px solid #ddd;padding:4px 8px;font-size:.9em}}
@media(max-width:700px){{.ab{{grid-template-columns:1fr}}}}
</style></head><body><h1>تقرير تشغيل مصنع «اكتشف الفرق»</h1>
<p>الدوائر الحمراء للمراجعة فقط. لكل فرق صورة مقرّبة: قبل (يسار) وبعد (يمين).</p>
<div class="stats"><div>محاولات<b>{stats["attempts"]}</b></div><div>أزواج مقبولة<b>{stats["accepted"]}</b></div>
<div>نسبة القبول<b>{round(stats["accept_rate"] * 100)}%</b></div><div>سهل / متوسط / صعب<b>{" / ".join(map(str, stats["by_level"]))}</b></div>
<div>المدة الكلية<b>{stats["elapsed_min"]} د</b></div><div>دقائق لكل زوج مقبول<b>{mpa}</b></div>
<div>متوسط حجم الزوج<b>{kb} KB</b></div><div>طلبات المصدر ({stats.get("source", "")})<b>{stats["pexels_requests"]}</b></div></div>
<h2>أسباب الرفض</h2><ul>{reasons or "<li>لا يوجد</li>"}</ul>
<h2>إسقاط 1000 زوج (من أرقام هذا التشغيل)</h2><ul>
<li>زمن المعالجة: {round(mpa * 1000 / 60, 1)} ساعة تشغيل، أي قرابة {round(mpa * 1000 / 60 / 6, 1)} تشغيلة من 6 ساعات (يمكن توزيعها على عدة تشغيلات متوازية).</li>
<li>التخزين: {round(kb * 1000 / 1024, 1)} MB.</li>
<li>طلبات المصدر: قرابة {max(1, round(stats["pexels_requests"] * 1000 / max(1, stats["accepted"])))} طلبًا (Wikimedia بلا مفتاح ولا رسوم؛ اتصال واحد مع مهلة بين الطلبات).</li>
<li>صور استُبعدت قبل التنزيل: {html.escape(json.dumps(stats.get("skipped_before_download", {}), ensure_ascii=False))}</li></ul>
<h2>الأزواج المقبولة</h2>{"".join(blocks)}
<h2>الصور المرفوضة</h2><table><tr><th>الصورة</th><th>الموضوع</th><th>السبب</th><th>ث</th></tr>{rej_rows}</table></body></html>'''
    open(f"{d}/index.html", "w", encoding="utf-8").write(page)
