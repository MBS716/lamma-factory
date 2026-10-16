"""Optional visual judge (OFF by default; paid Claude API usage, needs ANTHROPIC_API_KEY and --judge).

For every finished pair it sends one picture: each difference as a zoomed before|after tile, numbered.
The model answers per difference whether the edited side looks like an untouched photo.
Differences it flags are reverted (the regions never overlap); the pair is kept only if enough remain."""
import os, io, json, base64, urllib.request
import numpy as np
from PIL import Image, ImageDraw

API = "https://api.anthropic.com/v1/messages"
MODEL = os.environ.get("JUDGE_MODEL", "claude-haiku-5-5")
PROMPT = """You review a spot-the-difference game. Each numbered tile shows the SAME spot of a photo: LEFT = original, RIGHT = edited.
For each tile decide whether the RIGHT side looks like a real, untouched photograph to someone who has not seen the left side.
Fail it if the right side shows any of: smudge or blur patch, ghost or outline of something removed, leftover shadow,
an object floating without support, a pasted object with a visible edge or wrong lighting, warped or garbled shapes or letters,
a person or part of a person changed, or anything else that looks edited. Pass it if it is clean and natural.
Answer ONLY with JSON: {"tiles":[{"n":1,"pass":true,"why":""}, ...]}"""

def sheet(A, B, diffs, tile=260):
    H, W = A.shape[:2]; tiles = []
    for i, d in enumerate(diffs):
        s = int(max(96, max(d["rx"], d["ry"]) * 2.6)); x0 = max(0, min(W - s, d["x"] - s // 2)); y0 = max(0, min(H - s, d["y"] - s // 2))
        t = Image.fromarray(np.hstack([A[y0:y0 + s, x0:x0 + s], np.full((s, max(2, s // 40), 3), 255, np.uint8), B[y0:y0 + s, x0:x0 + s]])).resize((tile * 2, tile))
        dr = ImageDraw.Draw(t); dr.rectangle((0, 0, 30, 22), fill=(0, 0, 0)); dr.text((8, 4), str(i + 1), fill=(255, 255, 0))
        tiles.append(np.array(t))
    cols = 2; rows = (len(tiles) + 1) // 2
    out = np.full((rows * tile, cols * tile * 2, 3), 255, np.uint8)
    for i, t in enumerate(tiles): out[(i // 2) * tile:(i // 2 + 1) * tile, (i % 2) * tile * 2:(i % 2 + 1) * tile * 2] = t
    return out

class Judge:
    def __init__(self):
        self.key = os.environ["ANTHROPIC_API_KEY"]; self.calls = 0; self.tin = 0; self.tout = 0
    def __call__(self, A, B, diffs):
        img = sheet(A, B, diffs); buf = io.BytesIO(); Image.fromarray(img).save(buf, "JPEG", quality=85)
        body = {"model": MODEL, "max_tokens": 400, "messages": [{"role": "user", "content": [
            {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(buf.getvalue()).decode()}},
            {"type": "text", "text": PROMPT}]}]}
        req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={
            "x-api-key": self.key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=90) as r: res = json.loads(r.read())
        self.calls += 1; u = res.get("usage", {}); self.tin += u.get("input_tokens", 0); self.tout += u.get("output_tokens", 0)
        txt = "".join(c.get("text", "") for c in res.get("content", []))
        v = json.loads(txt[txt.index("{"):txt.rindex("}") + 1])
        return {int(t["n"]) - 1: (bool(t["pass"]), t.get("why", "")) for t in v.get("tiles", [])}

def apply(A, B, diffs, verdict):
    """Revert failed differences. Returns (B, kept_diffs, failed)."""
    B = B.copy(); kept, failed = [], []
    for i, d in enumerate(diffs):
        ok, why = verdict.get(i, (False, "no answer"))
        if ok: kept.append(d); continue
        failed.append((d, why))
        y0, y1 = max(0, d["y"] - d["ry"] - 2), d["y"] + d["ry"] + 3; x0, x1 = max(0, d["x"] - d["rx"] - 2), d["x"] + d["rx"] + 3
        B[y0:y1, x0:x1] = A[y0:y1, x0:x1]
    return B, kept, failed
