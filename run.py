"""Factory run: take fresh photos, make spot-the-difference pairs, keep only those that pass every check.

  python run.py --source pexels --target 30 --store local --out out/test --report
  python run.py --source pexels --target 300 --time-limit 330 --store r2      (daily production)
Environment: PEXELS_API_KEY, and for R2: R2_ACCOUNT_ID R2_BUCKET R2_KEY_ID R2_SECRET"""
import os, sys, io, json, time, argparse, base64, random, traceback
import numpy as np
from PIL import Image, ImageDraw
from factory.engine import Engine, Reject, prepare, LEVEL_NAMES
from factory.collect import Registry, Pexels, Commons, Folder, dhash
from factory.store import LocalStore, R2Store, Catalog

ap = argparse.ArgumentParser()
ap.add_argument("--source", default="commons"); ap.add_argument("--folder", default="")
ap.add_argument("--target", type=int, default=30, help="accepted pairs to produce")
ap.add_argument("--max-attempts", type=int, default=0); ap.add_argument("--time-limit", type=float, default=0, help="minutes")
ap.add_argument("--mix", default="0.3,0.4,0.3", help="share of easy,medium,hard")
ap.add_argument("--store", default="local"); ap.add_argument("--out", default="out/run")
ap.add_argument("--registry", default="state/registry.json"); ap.add_argument("--report", action="store_true")
ap.add_argument("--seed", type=int, default=0); ap.add_argument("--quality", type=int, default=88)
a = ap.parse_args()

os.makedirs(a.out, exist_ok=True); os.makedirs(os.path.dirname(a.registry) or ".", exist_ok=True)
reg = Registry(a.registry)
src = {"pexels": lambda: Pexels(os.environ["PEXELS_API_KEY"], reg), "commons": lambda: Commons(reg), "folder": lambda: Folder(a.folder, reg)}[a.source]()
store = LocalStore(os.path.join(a.out, "bucket")) if a.store == "local" else R2Store(
    os.environ["R2_ACCOUNT_ID"], os.environ["R2_BUCKET"], os.environ["R2_KEY_ID"], os.environ["R2_SECRET"])
cat = Catalog(store)
eng = Engine(seed=a.seed or int(time.time()))
rng = random.Random(a.seed or None)
mix = [float(x) for x in a.mix.split(",")]

def webp(img):
    b = io.BytesIO(); Image.fromarray(img).save(b, "WEBP", quality=a.quality, method=5); return b.getvalue()

T0 = time.time(); log = []; accepted = []; made = [0, 0, 0]
def out_of_time(): return a.time_limit and (time.time() - T0) / 60 > a.time_limit

for ph in src.photos():
    if len(accepted) >= a.target or out_of_time(): break
    if a.max_attempts and len(log) >= a.max_attempts: break
    rec = {"photo": ph["id"], "theme": ph["theme"], "url": ph["url"], "credit": ph.get("photographer", ""), "licence": ph.get("licence", ""), "licence_url": ph.get("licence_url", ""), "share_alike": ph.get("share_alike", False), "t_start": round(time.time() - T0, 1)}
    t = time.time()
    try:
        A = prepare(src.download(ph)); rec["t_download"] = round(time.time() - t, 1)
        h = dhash(A)
        if reg.near_duplicate(h): raise Reject("near_duplicate")
        # level: follow the wanted mix, but busy scenes go to hard and plain scenes to easy
        c = Engine.clutter(A); rec["clutter"] = round(c, 4)
        need = [mix[i] * (len(accepted) + 1) - made[i] for i in range(3)]
        lv = int(np.argmax(need))
        if c < 0.06: lv = min(lv, 1)
        if c < 0.04: lv = 0
        cands = None; res = None; why = []
        for L in sorted(range(3), key=lambda k: (abs(k - lv), -k)):
            try:
                res = eng.make(A, L, cands); break
            except Reject as e:
                why.append(f"{LEVEL_NAMES[L]}:{e.reason}"); cands = getattr(eng, "last_cands", None)
                if e.reason == "scene_too_plain" and L == 0: break
        if res is None: raise Reject(" / ".join(why))
        pid = f"x{ph['id']}" if ph["provider"] == "pexels" else str(ph["id"])
        store.put(f"pairs/{pid}a.webp", webp(A), "image/webp"); store.put(f"pairs/{pid}b.webp", webp(res["B"]), "image/webp")
        entry = {"id": pid, "l": res["level"], "w": A.shape[1], "h": A.shape[0],
                 "d": [[d["x"], d["y"], d["rx"], d["ry"]] for d in res["diffs"]],
                 "c": [ph["photographer"], ph["photographer_url"], ph["url"]] + ([ph["licence"], ph.get("licence_url", ""), 1] if ph.get("licence") else []), "th": ph["theme"]}
        cat.add(entry); reg.hashes.append(h); made[res["level"]] += 1
        rec.update(ok=True, id=pid, level=res["level"], diffs=res["diffs"], time=res["time"], lama_calls=res["lama_calls"], tries=res["tries"])
        accepted.append((pid, A, res))
    except Reject as e:
        rec.update(ok=False, reason=e.reason)
    except Exception as e:
        rec.update(ok=False, reason="error: " + str(e)[:200]); traceback.print_exc()
        if "rate_limited" in str(e): log.append(rec); break
    rec["t_total"] = round(time.time() - t, 1); log.append(rec)
    print(f"[{len(log):4d}] {'OK ' if rec.get('ok') else '-- '} {rec.get('id', ph['id'])} {rec.get('reason', LEVEL_NAMES[rec.get('level', 0)])} {rec['t_total']}s", flush=True)
    if len(log) % 10 == 0: cat.flush(); reg.save()

cat.flush(); reg.save()
elapsed = time.time() - T0
ok = [r for r in log if r.get("ok")]
stats = {"attempts": len(log), "accepted": len(ok), "accept_rate": round(len(ok) / max(1, len(log)), 3),
         "by_level": made, "elapsed_min": round(elapsed / 60, 1),
         "min_per_accepted": round(elapsed / 60 / max(1, len(ok)), 2),
         "sec_per_attempt": round(elapsed / max(1, len(log)), 1),
         "source": a.source, "pexels_requests": getattr(src, "requests", 0), "pexels_remaining": getattr(src, "remaining", None), "skipped_before_download": getattr(src, "skipped", {}),
         "avg_pair_kb": None, "reasons": {}}
for r in log:
    if not r.get("ok"):
        for part in r["reason"].split(" / "):
            k = part.split(":")[-1]; stats["reasons"][k] = stats["reasons"].get(k, 0) + 1
sizes = []
for pid, _, _ in accepted:
    for s in "ab":
        b = store.get(f"pairs/{pid}{s}.webp"); sizes.append(len(b) if b else 0)
if sizes: stats["avg_pair_kb"] = round(sum(sizes) / len(sizes) * 2 / 1024, 1)
json.dump({"stats": stats, "log": log}, open(os.path.join(a.out, "run.json"), "w"), ensure_ascii=False, indent=1)
print(json.dumps(stats, ensure_ascii=False, indent=1))

if a.report:
    from factory.report import write_report
    write_report(a.out, stats, log, accepted)
