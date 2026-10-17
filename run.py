"""Factory run: take fresh photos, make spot-the-difference pairs, keep only those that pass every check.

  python run.py --source pexels --target 30 --store local --out out/test --report
  python run.py --source pexels --target 300 --time-limit 330 --store r2      (daily production)
Environment: PEXELS_API_KEY, and for R2: R2_ACCOUNT_ID R2_BUCKET R2_KEY_ID R2_SECRET"""
import os, sys, io, json, time, argparse, base64, random, traceback
import numpy as np
from PIL import Image, ImageDraw
from factory.engine import Engine, Reject, prepare, LEVEL_NAMES, LEVELS
from factory.collect import Registry, Pexels, Commons, CommonsArt, Folder, dhash
from factory.store import LocalStore, R2Store, Catalog

ap = argparse.ArgumentParser()
ap.add_argument("--source", default="commons"); ap.add_argument("--folder", default="")
ap.add_argument("--target", type=int, default=30, help="accepted pairs to produce")
ap.add_argument("--max-attempts", type=int, default=0); ap.add_argument("--time-limit", type=float, default=0, help="minutes")
ap.add_argument("--mix", default="0.3,0.4,0.3", help="share of easy,medium,hard")
ap.add_argument("--store", default="local"); ap.add_argument("--out", default="out/run")
ap.add_argument("--registry", default="state/registry.json"); ap.add_argument("--report", action="store_true")
ap.add_argument("--judge", default="off", choices=["off", "api", "replay"], help="api = paid Claude API (owner approval needed)")
ap.add_argument("--judge-model", default="claude-haiku-5-5"); ap.add_argument("--judge-budget", type=float, default=1.0, help="hard stop in USD")
ap.add_argument("--verdicts", default="state/verdicts.json"); ap.add_argument("--repair-rounds", type=int, default=2)
ap.add_argument("--save-pairs", action="store_true", help="keep full-quality A/B and difference data for offline judging")
ap.add_argument("--per-author", type=int, default=2, help="max pairs from one photographer per run")
ap.add_argument("--seed", type=int, default=0); ap.add_argument("--quality", type=int, default=88)
a = ap.parse_args()

os.makedirs(a.out, exist_ok=True); os.makedirs(os.path.dirname(a.registry) or ".", exist_ok=True)
reg = Registry(a.registry)
src = {"pexels": lambda: Pexels(os.environ["PEXELS_API_KEY"], reg), "commons": lambda: Commons(reg), "commons-art": lambda: CommonsArt(reg), "folder": lambda: Folder(a.folder, reg)}[a.source]()
store = LocalStore(os.path.join(a.out, "bucket")) if a.store == "local" else R2Store(
    os.environ["R2_ACCOUNT_ID"], os.environ["R2_BUCKET"], os.environ["R2_KEY_ID"], os.environ["R2_SECRET"])
cat = Catalog(store)
eng = Engine(seed=a.seed or int(time.time()))
judge = None
if a.judge != "off":
    from factory.judge import ApiJudge, ReplayJudge, judge_and_repair, BudgetExceeded
    judge = ApiJudge(a.judge_model, a.judge_budget) if a.judge == "api" else ReplayJudge(a.verdicts, os.path.join(a.out, "pending"))
jstats = {"pairs_judged": 0, "pairs_rejected": 0, "diffs_judged": 0, "diffs_failed": 0, "diffs_replaced_ok": 0, "diffs_dropped": 0}
rng = random.Random(a.seed or None)
mix = [float(x) for x in a.mix.split(",")]

def webp(img):
    b = io.BytesIO(); Image.fromarray(img).save(b, "WEBP", quality=a.quality, method=5); return b.getvalue()

T0 = time.time(); log = []; accepted = []; made = [0, 0, 0]; authors = {}
quota = [int(np.ceil(m * a.target)) + 1 for m in mix]
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
        if authors.get(ph.get("photographer"), 0) >= a.per_author: raise Reject("author_quota")
        c = Engine.clutter(A); rec["clutter"] = round(c, 4)
        if c < 0.025: raise Reject("scene_too_plain")
        # plan: look at the scene once, then aim for the most-needed level this scene can actually supply
        cands = eng.candidates(A)
        pools = eng.pools(cands, A.shape[0] * A.shape[1]); rec["pool"] = [len(pools[i]) for i in range(3)]
        need = [mix[i] * a.target - made[i] for i in range(3)]
        order = sorted(range(3), key=lambda k: -need[k])
        order = [k for k in order if len(pools[k]) >= LEVELS[k]["n"][0] + 2] + [k for k in order if len(pools[k]) < LEVELS[k]["n"][0] + 2]
        res = None; why = []
        for L in order[:2]:
            try:
                res = eng.make(A, L, cands)
                if made[res["level"]] >= quota[res["level"]]:
                    why.append(f"{LEVEL_NAMES[L]}:level_quota_full"); res = None; continue
                break
            except Reject as e:
                why.append(f"{LEVEL_NAMES[L]}:{e.reason}")
                if len(e.info) > 1 and isinstance(e.info[1], dict): rec.setdefault("tries", {}).update({f"{L}:{k}": v for k, v in e.info[1].items()})
        if res is None: raise Reject(" / ".join(why))
        if judge:
            jr = judge_and_repair(eng, A, res, judge, LEVELS[res["planned"]]["n"][0], a.repair_rounds)
            jstats["pairs_judged"] += 1; jstats["diffs_judged"] += jr["judged"]; jstats["diffs_failed"] += jr["failed"]
            jstats["diffs_replaced_ok"] += jr.get("repaired_ok", 0); jstats["diffs_dropped"] += jr["dropped"]
            rec["judge"] = {k: jr.get(k) for k in ("judged", "failed", "repaired", "repaired_ok", "dropped", "rounds", "issues", "vis_mean", "status")}
            if jr["status"] == "pending": raise Reject("judge_pending")
            if jr["status"] == "rejected": jstats["pairs_rejected"] += 1; raise Reject("judge_rejected")
            res["B"], res["diffs"] = jr["B"], jr["diffs"]
            res["D"], _ = Engine.difficulty(res["diffs"], res["clutter"])
            res["D"] = round(res["D"], 2); res["vis_mean"] = jr["vis_mean"]
            res["level"] = Engine.player_level(res["D"], jr["vis_mean"])
            if made[res["level"]] >= quota[res["level"]]: raise Reject("level_quota_full")   # balance counted after judging
        pid = f"x{ph['id']}" if ph["provider"] == "pexels" else str(ph["id"])
        store.put(f"pairs/{pid}a.webp", webp(A), "image/webp"); store.put(f"pairs/{pid}b.webp", webp(res["B"]), "image/webp")
        entry = {"id": pid, "l": res["level"], "w": A.shape[1], "h": A.shape[0],
                 "d": [[d["x"], d["y"], d["rx"], d["ry"]] for d in res["diffs"]],
                 "c": [ph["photographer"], ph["photographer_url"], ph["url"]] + ([ph["licence"], ph.get("licence_url", ""), 1] if ph.get("licence") else []), "th": ph["theme"]}
        cat.add(entry); reg.hashes.append(h); made[res["level"]] += 1; authors[ph.get("photographer")] = authors.get(ph.get("photographer"), 0) + 1
        rec.update(ok=True, id=pid, level=res["level"], planned=res["planned"], D=res["D"], vis_mean=res.get("vis_mean"), ops=res["ops"], diffs=res["diffs"], time=res["time"], lama_calls=res["lama_calls"], tries=res["tries"])
        accepted.append((pid, A, res))
        if a.save_pairs:
            fd = os.path.join(a.out, "full"); os.makedirs(fd, exist_ok=True)
            Image.fromarray(A).save(f"{fd}/{pid}a.jpg", quality=95); Image.fromarray(res["B"]).save(f"{fd}/{pid}b.jpg", quality=95)
            json.dump({"planned": res["planned"], "clutter": res["clutter"], "diffs": res["diffs"]}, open(f"{fd}/{pid}.json", "w"))
    except Reject as e:
        rec.update(ok=False, reason=e.reason)
    except Exception as e:
        if judge and type(e).__name__ == "BudgetExceeded":
            rec.update(ok=False, reason="judge_budget"); log.append(rec); print("judge budget reached, stopping"); break
        rec.update(ok=False, reason="error: " + str(e)[:200]); traceback.print_exc()
        if "rate_limited" in str(e): log.append(rec); break
    rec["t_total"] = round(time.time() - t, 1); log.append(rec)
    print(f"[{len(log):4d}] {'OK ' if rec.get('ok') else '-- '} {rec.get('id', ph['id'])} {rec.get('reason', LEVEL_NAMES[rec.get('level', 0)])} {rec['t_total']}s", flush=True)
    if len(log) % 10 == 0: cat.flush(); reg.save()

cat.flush(); reg.save()
elapsed = time.time() - T0
ok = [r for r in log if r.get("ok")]
stats = {"attempts": len(log), "accepted": len(ok), "accept_rate": round(len(ok) / max(1, len(log)), 3),
         "by_level": made, "themes_tried": len({r["theme"] for r in log}), "themes_accepted": len({r["theme"] for r in log if r.get("ok")}),
         "ops": {},  "elapsed_min": round(elapsed / 60, 1),
         "min_per_accepted": round(elapsed / 60 / max(1, len(ok)), 2),
         "sec_per_attempt": round(elapsed / max(1, len(log)), 1),
         "source": a.source, "judge": a.judge, "judge_calls": judge.calls if judge else 0, "judge_tokens": [judge.tin, judge.tout] if judge else None,
         "judge_cost_usd": round(judge.cost, 4) if judge else 0, "judge_stats": jstats if judge else None, "pexels_requests": getattr(src, "requests", 0), "pexels_remaining": getattr(src, "remaining", None), "skipped_before_download": getattr(src, "skipped", {}),
         "avg_pair_kb": None, "reasons": {}}
for r in log:
    if not r.get("ok"):
        for part in r["reason"].split(" / "):
            k = part.split(":")[-1]; stats["reasons"][k] = stats["reasons"].get(k, 0) + 1
for r in log:
    for k, v in (r.get("ops") or {}).items(): stats["ops"][k] = stats["ops"].get(k, 0) + v
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
