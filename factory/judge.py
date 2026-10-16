"""Visual judge: every difference is checked on its own, and bad ones are replaced in the same photo.

Each difference is shown as one tile: the same spot of the photo, original on the left, edited on the right.
The judge answers for that difference only:
  natural     - would someone who never saw the original believe the right side is an untouched photo?
  noticeable  - can a player see the change when comparing the two sides?
  visibility  - 1 (very hard to notice) .. 5 (obvious), used for the difficulty level
A difference passes only if it is natural AND noticeable. Failed differences are undone and replaced with new
differences elsewhere in the same photo (at most `max_rounds` repair rounds), so the pair is not thrown away
unless it can't be repaired.

Backends
  ApiJudge     - Claude API (paid). Off unless the owner approves; has its own hard budget in dollars.
  ReplayJudge  - verdicts from a file (free). Used to test the whole loop on saved samples: tiles without a
                 verdict are written to a folder for review and the run stops at that point."""
import os, io, json, base64, hashlib, math, time, urllib.request
import numpy as np
from PIL import Image

PROMPT = """You check one difference in a spot-the-difference game.
The image shows the SAME spot of a photo twice: LEFT = original photo, RIGHT = edited version.
Answer three things about the RIGHT side:
1. natural: would a person who has never seen the left side believe the right side is an untouched real photo?
   It is NOT natural if you see any of: blur or smudge patch, ghost or outline of something removed, leftover shadow,
   a thing floating without support or in an impossible place, a pasted thing with a visible edge, wrong lighting or
   wrong perspective, a dark or flat patch, warped shapes, garbled or mirrored letters, damaged ornament or pattern,
   a changed person or body part, or anything that looks edited.
2. noticeable: when comparing left and right carefully, can a player clearly see that something changed?
3. visibility: how easy is the change to spot when comparing: 1 = very hard, 3 = moderate, 5 = obvious.
Answer ONLY with JSON: {"natural": true, "noticeable": true, "visibility": 3, "issue": ""}"""

# USD per million tokens (input, output) from the official pricing page; prompts here are far below 100k tokens.
PRICES = {"claude-haiku-5-5": (0.10, 0.50), "claude-sonnet-5-5": (2.0, 10.0)}

def tile(A, B, d, half=384):
    """Left: original, right: edited, same crop around the difference (with surrounding context)."""
    H, W = A.shape[:2]
    s = int(max(120, max(d["rx"], d["ry"]) * 2.6)); s = min(s, H, W)
    x0 = max(0, min(W - s, d["x"] - s // 2)); y0 = max(0, min(H - s, d["y"] - s // 2))
    a = Image.fromarray(A[y0:y0 + s, x0:x0 + s]).resize((half, half), Image.LANCZOS)
    b = Image.fromarray(B[y0:y0 + s, x0:x0 + s]).resize((half, half), Image.LANCZOS)
    t = Image.new("RGB", (half * 2 + 8, half), (255, 255, 255)); t.paste(a, (0, 0)); t.paste(b, (half + 8, 0))
    buf = io.BytesIO(); t.save(buf, "JPEG", quality=88); return buf.getvalue()

def image_tokens(w, h): return math.ceil(w / 28) * math.ceil(h / 28)

class BudgetExceeded(Exception): pass

class ApiJudge:
    API = "https://api.anthropic.com/v1/messages"
    def __init__(self, model=None, budget_usd=1.0):
        self.key = os.environ["ANTHROPIC_API_KEY"]; self.model = model or os.environ.get("JUDGE_MODEL", "claude-haiku-5-5")
        self.pin, self.pout = PRICES[self.model]; self.budget = budget_usd
        self.calls = 0; self.tin = 0; self.tout = 0
    @property
    def cost(self): return self.tin * self.pin / 1e6 + self.tout * self.pout / 1e6
    def __call__(self, jpg):
        if self.cost + 0.002 > self.budget: raise BudgetExceeded(f"judge budget ${self.budget} reached")
        body = {"model": self.model, "max_tokens": 120, "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(jpg).decode()}},
            {"type": "text", "text": PROMPT}]}]}
        req = urllib.request.Request(self.API, data=json.dumps(body).encode(), headers={
            "x-api-key": self.key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        for t in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r: res = json.loads(r.read()); break
            except urllib.error.HTTPError as e:
                msg = e.read().decode(errors="ignore")
                if "usage limits" in msg or "spend_limit" in msg: raise BudgetExceeded("console spend limit reached")
                if t == 2 or e.code not in (429, 500, 529): raise
                time.sleep(5 * (t + 1))
        self.calls += 1; u = res.get("usage", {}); self.tin += u.get("input_tokens", 0); self.tout += u.get("output_tokens", 0)
        txt = "".join(c.get("text", "") for c in res.get("content", []))
        return json.loads(txt[txt.index("{"):txt.rindex("}") + 1])

class ReplayJudge:
    """Free stand-in for testing: verdicts come from a JSON file keyed by the tile's hash.
    Unknown tiles are saved to `pending_dir` and reported as None."""
    def __init__(self, verdict_file, pending_dir):
        self.file = verdict_file; self.pending = pending_dir; os.makedirs(pending_dir, exist_ok=True)
        self.v = json.load(open(verdict_file)) if os.path.exists(verdict_file) else {}
        self.calls = 0; self.tin = 0; self.tout = 0; self.missing = 0
        self.prompt_tokens = 330          # measured size of PROMPT plus message overhead, for cost estimates
    @property
    def cost(self): return 0.0
    def __call__(self, jpg):
        k = hashlib.md5(jpg).hexdigest()[:16]
        w, h = Image.open(io.BytesIO(jpg)).size
        self.calls += 1; self.tin += image_tokens(w, h) + self.prompt_tokens; self.tout += 40
        if k in self.v: return self.v[k]
        open(os.path.join(self.pending, k + ".jpg"), "wb").write(jpg); self.missing += 1
        return None

def verdict_ok(v): return bool(v and v.get("natural") and v.get("noticeable"))

def judge_and_repair(eng, A, res, judge, min_n, max_rounds=2, tiles_out=None, tag=""):
    """Check each difference; undo failed ones and replace them in the same photo. Returns a result dict:
    B, diffs (all passed), status ('ok' | 'rejected' | 'pending'), and counters."""
    B = res["B"]; diffs = [dict(d) for d in res["diffs"]]; lv = res["planned"]
    H, W = A.shape[:2]; banned = []; st = {"judged": 0, "failed": 0, "repaired": 0, "dropped": 0, "rounds": 0, "issues": []}
    to_check = list(range(len(diffs)))
    for rnd in range(max_rounds + 1):
        failed = []; pending = False
        for i in to_check:
            jpg = tile(A, B, diffs[i]); v = judge(jpg); st["judged"] += 1
            if tiles_out is not None: tiles_out.append((f"{tag}r{rnd}_{i}", jpg, v))
            if v is None: pending = True; continue
            diffs[i]["judge"] = v
            if not verdict_ok(v): failed.append(i); st["issues"].append(v.get("issue", ""))
        if pending: return {**st, "status": "pending", "B": B, "diffs": diffs}
        if not failed: break
        st["failed"] += len(failed)
        for i in failed:
            banned.append(eng.region(diffs[i], H, W)); B = eng.revert(A, B, diffs[i])
        keep = [d for j, d in enumerate(diffs) if j not in failed]
        if rnd == max_rounds:
            st["dropped"] += len(failed); diffs = keep; break
        # replace them elsewhere in the same photo
        B, new = eng.extend(A, B, keep, len(failed), lv, banned)
        st["rounds"] += 1; st["repaired"] += len(new)
        for d in new: d["round"] = rnd + 1
        diffs = keep + new
        to_check = list(range(len(keep), len(diffs)))
        if not new: break
    st["repaired_ok"] = sum(1 for d in diffs if d.get("round"))
    if len(diffs) < min_n: return {**st, "status": "rejected", "B": B, "diffs": diffs}
    vis = [d["judge"]["visibility"] for d in diffs if d.get("judge")]
    return {**st, "status": "ok", "B": B, "diffs": diffs, "vis_mean": float(np.mean(vis)) if vis else None}
