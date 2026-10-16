"""Spot-the-difference engine: photo in -> (A, B, regions, metrics) out, or a rejection reason.

Differences are built from things that really exist in the photo:
  * objects found by a detector (cup, book, clock, chair, bicycle, sign, person ...), cut out with GrabCut
  * small scene details found by image segmentation (window panes, knobs, stones, leaves, letters ...)
Edit types (no colour shifts, no drawn shapes):
  remove  - the object disappears and LaMa rebuilds what was behind it
  dup     - a copy of the object appears on matching background nearby
  move    - the object is removed and placed a little further along
  flip    - the object is mirrored in place (only for clearly asymmetric objects)
Every edit is measured and must pass checks before it is kept; the pair must then pass pair checks."""
import time, numpy as np, cv2
from skimage.segmentation import felzenszwalb
from .models import Lama, Yolox, GOOD_CLASSES

W_OUT = 1280
LEVELS = {
    #        area as fraction of the photo   min contrast  min visibility   diffs   op weights
    0: dict(amin=0.0016, amax=0.0220, con=30, vis=32, n=(5, 6), ops={"remove": 5, "dup": 2, "move": 1, "flip": 1}),
    1: dict(amin=0.0008, amax=0.0070, con=24, vis=26, n=(6, 7), ops={"remove": 5, "dup": 2, "move": 2, "flip": 1}),
    2: dict(amin=0.00025, amax=0.0030, con=18, vis=20, n=(7, 8), ops={"remove": 5, "dup": 2, "move": 2, "flip": 1}),
}
LEVEL_NAMES = ["easy", "medium", "hard"]

def prepare(img):
    """Crop to 3:2 and resize to W_OUT wide."""
    h, w = img.shape[:2]; tr = 1.5
    if w / h > tr: nw = int(h * tr); x0 = (w - nw) // 2; img = img[:, x0:x0 + nw]
    else: nh = int(w / tr); y0 = (h - nh) // 2; img = img[y0:y0 + nh]
    return cv2.resize(img, (W_OUT, int(W_OUT / tr)), interpolation=cv2.INTER_AREA)

def ring_of(mask, r):
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return (cv2.dilate(mask, k) > 0) & ~(mask > 0)

def lap_var(img, m):
    g = cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32), cv2.CV_32F)
    v = g[m]; return float(v.var()) if v.size > 10 else 0.0

class Cand:
    __slots__ = ("mask", "box", "area", "label", "src", "contrast", "ring", "ringstd", "edge")
    def __init__(self, **k):
        for a, b in k.items(): setattr(self, a, b)

class Engine:
    def __init__(self, seed=0):
        self.lama = Lama(); self.det = Yolox()
        self.rng = np.random.default_rng(seed)
        self.t = {}

    def _tick(self, k, t0): self.t[k] = self.t.get(k, 0) + time.time() - t0

    # ---------------------------------------------------------------- candidates
    def candidates(self, img):
        H, W = img.shape[:2]; N = H * W; out = []
        gr = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.float32)
        self._busy = cv2.blur((cv2.Canny(gr.astype(np.uint8), 60, 140) > 0).astype(np.float32), (15, 15))
        self._grad = cv2.magnitude(cv2.Sobel(gr, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(gr, cv2.CV_32F, 0, 1, ksize=3))
        t0 = time.time()
        dets = self.det(img)
        self.people = [(x - 6, y - 6, x + bw + 6, y + bh + 6) for (x, y, bw, bh, sc, cls) in dets if cls == "person" and sc > 0.3]
        for (x, y, bw, bh, sc, cls) in dets:
            if cls not in GOOD_CLASSES: continue
            if cls == "person" and bw * bh / N > 0.004: continue
            fr = bw * bh / N
            if fr < 0.00025 or fr > 0.03: continue
            x0, y0 = int(max(0, x - 4)), int(max(0, y - 4)); x1, y1 = int(min(W, x + bw + 4)), int(min(H, y + bh + 4))
            if x0 < 6 or y0 < 6 or x1 > W - 6 or y1 > H - 6: continue
            m = self._grabcut(img, x0, y0, x1, y1)
            if m is None: continue
            c = self._mk(img, m, cls, "object")
            if c: out.append(c)
        self._tick("detect", t0)
        t0 = time.time()
        small = cv2.resize(img, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
        for scale, lim in ((60, 700), (220, 400)):        # fine details, then bigger things
            seg = felzenszwalb(small, scale=scale, sigma=0.7, min_size=25)
            seg = cv2.resize(seg.astype(np.int32), (W, H), interpolation=cv2.INTER_NEAREST)
            areas = np.bincount(seg.ravel(), minlength=seg.max() + 1)
            ids = np.where((areas > 0.00025 * N) & (areas < 0.022 * N))[0]
            self.rng.shuffle(ids)
            for i in ids[:lim]:
                m = (seg == i).astype(np.uint8) * 255
                if any(abs(int(m.sum() // 255) - o.area) < 0.05 * o.area and np.count_nonzero((m > 0) & (o.mask > 0)) > 0.8 * o.area for o in out[-40:]): continue
                c = self._mk(img, m, "detail", "segment")
                if c: out.append(c)
        self._tick("segment", t0)
        return out

    def _grabcut(self, img, x0, y0, x1, y1):
        H, W = img.shape[:2]; pad = 12
        cx0, cy0, cx1, cy1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
        crop = np.ascontiguousarray(img[cy0:cy1, cx0:cx1, ::-1])
        gm = np.zeros(crop.shape[:2], np.uint8)
        try:
            cv2.grabCut(crop, gm, (x0 - cx0, y0 - cy0, x1 - x0, y1 - y0), np.zeros((1, 65)), np.zeros((1, 65)), 3, cv2.GC_INIT_WITH_RECT)
        except cv2.error: return None
        fg = ((gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD)).astype(np.uint8)
        n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
        if n < 2: return None
        k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        fg = (lab == k).astype(np.uint8)
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        fill = fg.sum() / max(1, (x1 - x0) * (y1 - y0))
        if fill < 0.18 or fill > 0.97: return None
        m = np.zeros(img.shape[:2], np.uint8); m[cy0:cy1, cx0:cx1] = fg * 255
        return m

    def _mk(self, img, m, label, src):
        H, W = img.shape[:2]
        ys, xs = np.where(m > 0)
        if xs.size < 40: return None
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        if x0 < 6 or y0 < 6 or x1 > W - 7 or y1 > H - 7: return None
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        area = xs.size
        if src == "segment":
            if area / (bw * bh) < 0.33 or max(bw, bh) / max(1, min(bw, bh)) > 4.5: return None
        ring = ring_of(m, max(4, int(0.12 * max(bw, bh))))
        rpx = img[ring].astype(np.float32); opx = img[m > 0].astype(np.float32)
        if rpx.shape[0] < 20: return None
        rmean, omean = rpx.mean(0), opx.mean(0)
        contrast = float(np.linalg.norm(rmean - omean))
        ringstd = float(rpx.std(0).mean())
        # does the region's outline follow real edges in the photo? (a whole thing, not a fragment of texture)
        cx0, cy0, cx1, cy1 = max(0, x0 - 12), max(0, y0 - 12), min(W, x1 + 13), min(H, y1 + 13)
        g = self._grad[cy0:cy1, cx0:cx1]; mm = m[cy0:cy1, cx0:cx1]
        contour = (mm > 0) & ~(cv2.erode(mm, np.ones((3, 3), np.uint8)) > 0)
        rr = ring[cy0:cy1, cx0:cx1] & ~(cv2.dilate(mm, np.ones((5, 5), np.uint8)) > 0)
        edge = float(g[contour].mean() / (g[rr].mean() + 4)) if contour.any() and rr.any() else 0.0
        if src == "segment":
            if contrast < 16 or ringstd > 26 or edge < 1.5: return None
            # a distinct thing stands out from its surroundings much more than the surroundings vary
            if contrast / (ringstd + 6) < 1.9: return None
            # never touch people (faces, hands, clothes)
            if any(not (x1 < p[0] or x0 > p[2] or y1 < p[1] or y0 > p[3]) for p in getattr(self, "people", [])): return None
            # skip repetitive natural texture (waves, foliage, gravel, stone walls): busy surroundings
            if self._busy[ring].mean() > 0.16: return None
        return Cand(mask=m, box=(int(x0), int(y0), int(x1), int(y1)), area=int(area), label=label, src=src,
                    contrast=contrast, ring=rmean, ringstd=ringstd, edge=edge)

    # ---------------------------------------------------------------- operations
    def op_remove(self, B, c):
        m = cv2.dilate(c.mask, np.ones((7, 7), np.uint8))
        return self.lama(B, m), m

    def _paste(self, B, src_img, c, dx, dy):
        x0, y0, x1, y1 = c.box
        patch = src_img[y0:y1 + 1, x0:x1 + 1]; pm = c.mask[y0:y1 + 1, x0:x1 + 1].astype(np.float32) / 255
        pm = cv2.GaussianBlur(pm, (0, 0), 0.9)[..., None]
        out = B.copy(); tgt = out[y0 + dy:y1 + 1 + dy, x0 + dx:x1 + 1 + dx]
        out[y0 + dy:y1 + 1 + dy, x0 + dx:x1 + 1 + dx] = (tgt * (1 - pm) + patch * pm).round().astype(np.uint8)
        tm = np.zeros(c.mask.shape, np.uint8); tm[y0 + dy:y1 + 1 + dy, x0 + dx:x1 + 1 + dx] = c.mask[y0:y1 + 1, x0:x1 + 1]
        return out, tm

    def _find_spot(self, B, c, used, near=(1.3, 3.2), horiz=True):
        """Offset where the object's own background colour continues and nothing else is."""
        H, W = B.shape[:2]; x0, y0, x1, y1 = c.box; bw, bh = x1 - x0 + 1, y1 - y0 + 1
        best, bs = None, 1e9
        for _ in range(40):
            ang = self.rng.uniform(-0.45, 0.45) + (0 if self.rng.random() < .5 else np.pi) if horiz else self.rng.uniform(0, 2 * np.pi)
            dist = self.rng.uniform(*near) * max(bw, bh)
            dx, dy = int(np.cos(ang) * dist), int(np.sin(ang) * dist)
            nx0, ny0, nx1, ny1 = x0 + dx, y0 + dy, x1 + dx, y1 + dy
            if nx0 < 8 or ny0 < 8 or nx1 > W - 9 or ny1 > H - 9: continue
            if any(not (nx1 + 22 < u[0] or nx0 - 22 > u[2] or ny1 + 22 < u[1] or ny0 - 22 > u[3]) for u in used): continue
            region = B[ny0:ny1 + 1, nx0:nx1 + 1].astype(np.float32)
            tm = c.mask[y0:y1 + 1, x0:x1 + 1] > 0
            under = region[tm]
            ring = ring_of(c.mask, 5)[y0:y1 + 1, x0:x1 + 1] if False else None
            col = float(np.linalg.norm(under.mean(0) - c.ring)); tex = float(under.std(0).mean())
            if col > 20 or tex > c.ringstd * 1.4 + 6: continue
            tr = np.roll(np.roll(self._ringmask(c), dy, 0), dx, 1)
            tcol = float(np.linalg.norm(B[tr].astype(np.float32).mean(0) - c.ring))
            if tcol > 18: continue
            s = col + tex * 0.5
            if s < bs: bs, best = s, (dx, dy)
        return best

    def solid(self, c): return c.src == "object" or (c.edge >= 2.0 and c.ringstd <= 18 and c.contrast >= 30)
    def _ringmask(self, c):
        return ring_of(c.mask, max(4, int(0.12 * max(c.box[2] - c.box[0], c.box[3] - c.box[1]))))
    def op_dup(self, B, A, c, used):
        if not self.solid(c): return None, None
        spot = self._find_spot(B, c, used, horiz=c.src == "object")
        if spot is None: return None, None
        return self._paste(B, A, c, *spot)

    def op_move(self, B, A, c, used):
        if not self.solid(c): return None, None
        spot = self._find_spot(B, c, used, near=(0.45, 1.0), horiz=True)
        if spot is None: return None, None
        B2, m1 = self.op_remove(B, c)
        B3, m2 = self._paste(B2, A, c, *spot)
        return B3, np.maximum(m1, m2)

    def op_flip(self, B, c):
        if c.src != "object": return None, None
        x0, y0, x1, y1 = c.box; pm = c.mask[y0:y1 + 1, x0:x1 + 1] > 0
        if (pm & pm[:, ::-1]).sum() / max(1, (pm | pm[:, ::-1]).sum()) < 0.86: return None, None
        patch = B[y0:y1 + 1, x0:x1 + 1]; fl = patch[:, ::-1]
        if np.abs(patch.astype(int) - fl.astype(int))[pm].mean() < 28: return None, None
        a = cv2.GaussianBlur((pm & pm[:, ::-1]).astype(np.float32), (0, 0), 0.9)[..., None]
        out = B.copy(); out[y0:y1 + 1, x0:x1 + 1] = (patch * (1 - a) + fl * a).round().astype(np.uint8)
        return out, c.mask

    # ---------------------------------------------------------------- checks
    def check_edit(self, before, after, m, c, op, lv):
        """Returns (ok, reason, stats)."""
        P = LEVELS[lv]
        ch = np.abs(after.astype(int) - before.astype(int)).max(-1)
        changed = ch > 18
        if changed.sum() < 30: return False, "invisible", {}
        vis = float(ch[m > 0].mean())
        if vis < P["vis"]: return False, "too_faint", {"vis": vis}
        if op == "remove" or op == "move":
            hole = (c.mask > 0); ring = ring_of(c.mask, max(5, int(0.15 * max(c.box[2] - c.box[0], c.box[3] - c.box[1]))))
            fill_mean = after[hole].astype(np.float32).mean(0)
            ring_mean = after[ring].astype(np.float32).mean(0)
            if np.linalg.norm(fill_mean - ring_mean) > 30 + c.ringstd: return False, "fill_mismatch", {}
            sr, sf = float(after[ring].astype(np.float32).std(0).mean()), float(after[hole].astype(np.float32).std(0).mean())
            if sf > 1.8 * sr + 6 or sf < 0.45 * sr - 2: return False, "fill_texture", {}
            lr, lf = lap_var(after, ring), lap_var(after, hole)
            if lr > 20 and lf / lr < 0.18: return False, "blurry_fill", {}
            if lf > 4 * lr + 200: return False, "noisy_fill", {}
            # the object's own outline must be gone, not ghosted
            g0 = cv2.Canny(cv2.cvtColor(before, cv2.COLOR_RGB2GRAY), 60, 140) > 0
            g1 = cv2.Canny(cv2.cvtColor(after, cv2.COLOR_RGB2GRAY), 60, 140) > 0
            inner = cv2.erode(c.mask, np.ones((5, 5), np.uint8)) > 0
            if g0[inner].sum() > 20 and (g0 & g1)[inner].sum() / g0[inner].sum() > 0.35: return False, "ghost", {}
        return True, "", {"vis": vis}

    # ---------------------------------------------------------------- pair
    @staticmethod
    def clutter(A): return float((cv2.Canny(cv2.cvtColor(A, cv2.COLOR_RGB2GRAY), 80, 160) > 0).mean())
    def make(self, A, lv, cands=None):
        """A: prepared RGB photo. Returns dict or raises Reject. Pass cands to reuse a previous detection."""
        P = LEVELS[lv]; H, W = A.shape[:2]; N = H * W
        self.t = {}; t_all = time.time(); self.lama.calls = 0
        clutter = self.clutter(A)
        if lv == 2 and clutter < 0.06: raise Reject("scene_too_plain", clutter)
        if clutter < 0.025: raise Reject("scene_too_plain", clutter)
        if cands is None: cands = self.candidates(A)
        self.last_cands = cands
        pool = [c for c in cands if P["amin"] * N <= c.area <= P["amax"] * N and c.contrast >= P["con"]]
        # prefer real objects, then details; keep spatial variety
        self.rng.shuffle(pool)
        pool.sort(key=lambda c: (0 if c.src == "object" else 1) + self.rng.random() * 1.2)
        want = int(self.rng.integers(P["n"][0], P["n"][1] + 1))
        if len(pool) < want: raise Reject("not_enough_candidates", len(pool))
        B = A.copy(); used = []; diffs = []; tries = {}
        ops, wts = zip(*P["ops"].items()); wts = np.array(wts, float) / sum(wts)
        t0 = time.time()
        budget = want * 4 + 6          # LaMa calls allowed for one photo before giving up on it
        for c in pool:
            if len(diffs) >= want or self.lama.calls >= budget: break
            x0, y0, x1, y1 = c.box
            if any(not (x1 + 26 < u[0] or x0 - 26 > u[2] or y1 + 26 < u[1] or y0 - 26 > u[3]) for u in used): continue
            order = list(self.rng.choice(ops, size=len(ops), replace=False, p=wts))
            for op in order:
                tries[op] = tries.get(op, 0) + 1
                if op == "remove": out, m = self.op_remove(B, c)
                elif op == "dup": out, m = self.op_dup(B, A, c, used)
                elif op == "move": out, m = self.op_move(B, A, c, used)
                else: out, m = self.op_flip(B, c)
                if out is None: continue
                ok, why, st = self.check_edit(B, out, m, c, op, lv)
                if not ok:
                    tries[why] = tries.get(why, 0) + 1; continue
                ch = np.abs(out.astype(int) - B.astype(int)).max(-1) > 14
                ys, xs = np.where(ch)
                bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
                B = out; used.append((bx0, by0, bx1, by1))
                diffs.append({"x": round((bx0 + bx1) / 2), "y": round((by0 + by1) / 2), "rx": max(14, round((bx1 - bx0) / 2 + 8)),
                              "ry": max(14, round((by1 - by0) / 2 + 8)), "op": op, "what": c.label, "vis": round(st["vis"], 1),
                              "area": round(c.area / N, 5), "contrast": round(c.contrast, 1)})
                break
        self._tick("edit", t0)
        if len(diffs) < P["n"][0]: raise Reject("too_few_good_edits", len(diffs), tries)
        # spread: differences must not crowd into one area of the photo
        cells = {(min(2, d["x"] * 3 // W), min(1, d["y"] * 2 // H)) for d in diffs}
        if len(cells) < 3: raise Reject("diffs_clustered", len(cells))
        # nothing may change outside the declared regions
        dm = np.abs(B.astype(int) - A.astype(int)).max(-1)
        yy, xx = np.mgrid[0:H, 0:W]; inside = np.zeros((H, W), bool)
        for d in diffs: inside |= (np.abs(xx - d["x"]) <= d["rx"] + 2) & (np.abs(yy - d["y"]) <= d["ry"] + 2)
        if dm[~inside].max() > 6: raise Reject("stray_change", int(dm[~inside].max()))
        self.t["total"] = time.time() - t_all
        return {"B": B, "diffs": diffs, "level": lv, "clutter": round(clutter, 4), "tries": tries,
                "time": {k: round(v, 2) for k, v in self.t.items()}, "lama_calls": self.lama.calls}

class Reject(Exception):
    def __init__(self, reason, *info):
        super().__init__(reason); self.reason = reason; self.info = info
