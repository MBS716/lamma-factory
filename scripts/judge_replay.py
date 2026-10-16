"""Free judge test on saved pairs (no API): runs the same check-and-repair loop as production,
with verdicts read from a file. Tiles that have no verdict yet are written to <out>/pending for review.

  python scripts/judge_replay.py reports/test-4/full state/verdicts.json out/replay"""
import os, sys, json, glob, hashlib, numpy as np
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from PIL import Image
from factory.engine import Engine, LEVELS
from factory.judge import ReplayJudge, judge_and_repair, tile, image_tokens, PRICES
src, vfile, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
judge = ReplayJudge(vfile, os.path.join(out, "pending"))
eng = Engine(seed=1); results = {}
for jf in sorted(glob.glob(os.path.join(src, "*.json"))):
    pid = os.path.basename(jf)[:-5]; meta = json.load(open(jf))
    A = np.array(Image.open(os.path.join(src, pid + "a.jpg")).convert("RGB"))
    B = np.array(Image.open(os.path.join(src, pid + "b.jpg")).convert("RGB"))
    eng.rng = np.random.default_rng(int(hashlib.md5(pid.encode()).hexdigest()[:8], 16))
    eng.candidates(A)
    res = {"B": B, "diffs": meta["diffs"], "planned": meta["planned"], "clutter": meta["clutter"]}
    tiles = []
    jr = judge_and_repair(eng, A, res, judge, LEVELS[meta["planned"]]["n"][0], 2, tiles_out=tiles, tag=pid + "_")
    for name, jpg, v in tiles: open(os.path.join(out, name + ".jpg"), "wb").write(jpg)
    if jr["status"] == "ok":
        D, lv = Engine.difficulty(jr["diffs"], meta["clutter"])
        Image.fromarray(jr["B"]).save(os.path.join(out, pid + "_final_b.jpg"), quality=92)
        jr.update(D=round(D, 2), level_measured=lv)
    results[pid] = {k: v for k, v in jr.items() if k not in ("B",)}
    print(pid, jr["status"], {k: jr.get(k) for k in ("judged", "failed", "repaired", "repaired_ok", "dropped")}, flush=True)
pin, pout = PRICES["claude-haiku-5-5"]; sin, sout = PRICES["claude-sonnet-5-5"]
summary = {"pairs": len(results), "ok": sum(r["status"] == "ok" for r in results.values()),
           "rejected": sum(r["status"] == "rejected" for r in results.values()), "pending": sum(r["status"] == "pending" for r in results.values()),
           "judge_calls": judge.calls, "tokens_in": judge.tin, "tokens_out": judge.tout, "missing_verdicts": judge.missing,
           "est_cost_haiku_usd": round(judge.tin * pin / 1e6 + judge.tout * pout / 1e6, 4),
           "est_cost_sonnet_usd": round(judge.tin * sin / 1e6 + judge.tout * sout / 1e6, 4)}
json.dump({"summary": summary, "pairs": results}, open(os.path.join(out, "replay.json"), "w"), ensure_ascii=False, indent=1, default=str)
print(json.dumps(summary, indent=1))
