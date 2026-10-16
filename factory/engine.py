"""Spot-the-difference engine v2: photo in -> (A, B, regions, metrics) out, or a rejection reason.

Plan first, edit second:
  1. Scene analysis: focus map, people (never edited), text and logos (never edited), busy natural texture.
  2. Candidates: detected objects (cut out with GrabCut) and distinct details from image segmentation,
     kept only if they are sharp, well lit, clearly separated from their surroundings and away from people/text.
  3. Each candidate gets the edit types that suit it:
       remove  - small thing disappears; its cast shadow goes with it; LaMa rebuilds the background
       dup     - a copy appears beside it on the same surface (same line, same support, same focus)
       move    - it slides a little along its surface
       scale   - it becomes a bit larger, standing on the same base
       flip    - it is mirrored (only clearly asymmetric objects)
     No colour shifts, no drawn shapes.
  4. Every edit is measured and rejected if it leaves blur, ghosts, shadows, foreign colours, seams,
     or anything floating. The pair must then pass pair checks.
  5. Difficulty is measured from the finished differences (size x visibility, scene clutter),
     not assumed from the plan."""
import time, numpy as np, cv2
from skimage.segmentation import felzenszwalb
from .models import Lama, Yolox, TextDet, Sam, GOOD_CLASSES

W_OUT = 1280
LEVELS = {
    #        candidate area (fraction of photo)  min contrast  min visibility  diffs  op weights
    0: dict(amin=0.0008, amax=0.0300, tgt=0.004, con=26, vis=34, n=(5, 5), ops={"remove": 3, "dup": 2, "swap": 2, "scale": 2, "move": 1, "flip": 1}),
    1: dict(amin=0.0005, amax=0.0120, tgt=0.0015, con=20, vis=28, n=(5, 6), ops={"remove": 3, "dup": 2, "swap": 2, "scale": 2, "move": 1, "flip": 1}),
    2: dict(amin=0.00030, amax=0.0040, tgt=0.0006, con=16, vis=22, n=(6, 7), ops={"remove": 3, "dup": 2, "swap": 2, "scale": 2, "move": 1, "flip": 1}),
}
LEVEL_NAMES = ["easy", "medium", "hard"]
# measured difficulty (median per-difference visibility score, adjusted for clutter) -> level
D_EASY, D_HARD = 5.0, 2.4

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

def hist_dist(a, b, bins=6):
    """Chi-square distance between coarse colour histograms of two pixel sets (N x 3)."""
    def h(p):
        b = np.minimum(p * bins // 256, bins - 1)
        idx = b[:, 0] * bins * bins + b[:, 1] * bins + b[:, 2]
        v = np.bincount(idx.astype(np.int64), minlength=bins ** 3).astype(np.float64); return v / max(1, v.sum())
    ha, hb = h(a), h(b)
    return float(0.5 * (((ha - hb) ** 2) / (ha + hb + 1e-9)).sum())

def overlaps(box, boxes, pad=0):
    x0, y0, x1, y1 = box
    return any(not (x1 + pad < b[0] or x0 - pad > b[2] or y1 + pad < b[1] or y0 - pad > b[3]) for b in boxes)

class Cand:
    __slots__ = ("mask", "box", "area", "label", "src", "contrast", "ring", "ringstd", "edge", "sharp", "bottom")
    def __init__(self, **k):
        for a, b in k.items(): setattr(self, a, b)

class Engine:
    def __init__(self, seed=0):
        self.lama = Lama(); self.det = Yolox(); self.text = TextDet(); self.sam = Sam()
        self.rng = np.random.default_rng(seed)
        self.t = {}; self.why = {}

    def _tick(self, k, t0): self.t[k] = self.t.get(k, 0) + time.time() - t0

    # ---------------------------------------------------------------- scene analysis
    def analyze(self, img):
        H, W = img.shape[:2]
        gr = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
        g32 = gr.astype(np.float32)
        self._lum = g32
        self._busy = cv2.blur((cv2.Canny(gr, 60, 140) > 0).astype(np.float32), (15, 15))
        self._grad = cv2.magnitude(cv2.Sobel(g32, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(g32, cv2.CV_32F, 0, 1, ksize=3))
        # focus map: local detail energy relative to the sharpest parts of this photo
        lap = np.abs(cv2.Laplacian(g32, cv2.CV_32F, ksize=3))
        foc = cv2.blur(lap, (41, 41))
        self._focus = foc / (np.percentile(foc, 92) + 1e-6)
        t0 = time.time()
        self._dets = self.det(img)
        ppl = [(x, y, bw, bh) for (x, y, bw, bh, sc, cls) in self._dets if cls == "person" and sc > 0.2]
        # small people in wide shots: look again in four overlapping tiles
        th, tw = int(H * 0.6), int(W * 0.6)
        for ty in (0, H - th):
            for tx in (0, W - tw):
                for (x, y, bw, bh, sc, cls) in self.det(img[ty:ty + th, tx:tx + tw]):
                    if cls == "person" and sc > 0.2: ppl.append((x + tx, y + ty, bw, bh))
        self.people = [(x - 14, y - 14, x + bw + 14, y + bh + 14) for (x, y, bw, bh) in ppl]
        self._tick("detect", t0)
        t0 = time.time()
        self.textboxes = self.text(img)
        tm = np.zeros((H, W), np.uint8)
        for poly in self.textboxes: cv2.fillPoly(tm, [poly.astype(np.int32)], 255)
        self._textmask = cv2.dilate(tm, np.ones((15, 15), np.uint8)) > 0
        self._tick("text", t0)

    def forbidden(self, m, box):
        """True if a region touches a person or text/logo."""
        if overlaps(box, self.people): return True
        x0, y0, x1, y1 = box
        if self._textmask[y0:y1 + 1, x0:x1 + 1].any(): return True
        return False

    # ---------------------------------------------------------------- candidates
    def candidates(self, img, grid=(24, 16)):
        """Things and parts of things, cut out by EfficientSAM from box prompts (detected objects) and a point grid."""
        H, W = img.shape[:2]; N = H * W; out = []; seen = []
        self.analyze(img)
        t0 = time.time()
        self.sam.set_image(img)
        def take(mask1024, label, src):
            a = int(mask1024.sum()) * N / (Sam.S * Sam.S)
            if a < 0.0003 * N or a > 0.035 * N: return
            small = cv2.resize(mask1024.astype(np.uint8), (128, 128), interpolation=cv2.INTER_AREA) > 0
            for o in seen:
                inter = np.count_nonzero(small & o); uni = np.count_nonzero(small | o)
                if uni and inter / uni > 0.7: return
            seen.append(small)
            m = self.sam.full(mask1024)
            # one solid piece, no holes or stray bits
            n, lab, st, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8))
            if n < 2: return
            k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
            if st[k, cv2.CC_STAT_AREA] < 0.9 * (m > 0).sum(): return
            m = (lab == k).astype(np.uint8) * 255
            c = self._mk(img, m, label, src)
            if c: out.append(c)
        # detected objects: box prompt, take the best whole-object mask
        for (x, y, bw, bh, sc, cls) in self._dets:
            if cls not in GOOD_CLASSES: continue
            fr = bw * bh / N
            if fr < 0.0003 or fr > 0.035: continue
            if overlaps((x, y, x + bw, y + bh), self.people): continue
            masks, iou = self.sam.predict([(x, y), (x + bw, y + bh)], [2, 3])
            i = int(np.argmax(iou))
            if iou[i] > 0.65: take(masks[i], cls, "object")
        # point grid: every sharp, lit spot away from people and writing; parts and whole things
        gx, gy = grid
        for j in range(gy):
            for i in range(gx):
                px = int((i + 0.5 + self.rng.uniform(-0.3, 0.3)) * W / gx); py = int((j + 0.5 + self.rng.uniform(-0.3, 0.3)) * H / gy)
                if self._focus[py, px] < 0.35 or self._lum[py, px] < 40 or self._textmask[py, px]: continue
                if overlaps((px, py, px, py), self.people): continue
                masks, iou = self.sam.predict([(px, py)], [1])
                for k in np.argsort(-iou):
                    if iou[k] > 0.6: take(masks[k], "detail", "sam")
        self._tick("candidates", t0)
        self._cands = out
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

    def _no(self, why):
        self.why[why] = self.why.get(why, 0) + 1; return None

    def _mk(self, img, m, label, src):
        H, W = img.shape[:2]
        ys, xs = np.where(m > 0)
        if xs.size < 40: return self._no("tiny")
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        if x0 < 8 or y0 < 8 or x1 > W - 9 or y1 > H - 9: return self._no("edge_of_photo")
        box = (int(x0), int(y0), int(x1), int(y1))
        if self.forbidden(m, box): return self._no("people_or_text")
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        area = xs.size
        if src != "object":
            if area / (bw * bh) < 0.30 or max(bw, bh) / max(1, min(bw, bh)) > 5: return self._no("shape")
        # in focus and well lit
        sharp = float(self._focus[m > 0].mean())
        if sharp < 0.4: return self._no("out_of_focus")
        if self._lum[m > 0].mean() < 40: return self._no("dark")
        ring = ring_of(m, max(4, int(0.12 * max(bw, bh))))
        rpx = img[ring].astype(np.float32); opx = img[m > 0].astype(np.float32)
        if rpx.shape[0] < 20: return self._no("tiny")
        if self._lum[ring].mean() < 35: return self._no("dark")
        rmean, omean = rpx.mean(0), opx.mean(0)
        contrast = float(np.linalg.norm(rmean - omean))
        ringstd = float(rpx.std(0).mean())
        cx0, cy0, cx1, cy1 = max(0, x0 - 12), max(0, y0 - 12), min(W, x1 + 13), min(H, y1 + 13)
        g = self._grad[cy0:cy1, cx0:cx1]; mm = m[cy0:cy1, cx0:cx1]
        contour = (mm > 0) & ~(cv2.erode(mm, np.ones((3, 3), np.uint8)) > 0)
        rr = ring[cy0:cy1, cx0:cx1] & ~(cv2.dilate(mm, np.ones((5, 5), np.uint8)) > 0)
        edge = float(g[contour].mean() / (g[rr].mean() + 4)) if contour.any() and rr.any() else 0.0
        if src != "object":
            # a separate thing: clearly different from what surrounds it, with a real outline,
            # on surroundings that are not a repetitive natural texture (foliage, gravel, waves)
            if contrast < 12: return self._no("low_contrast")
            if edge < 1.15: return self._no("weak_outline")
            if contrast / (ringstd + 6) < 0.9: return self._no("not_distinct")
            if self._busy[ring].mean() > 0.22: return self._no("busy_texture")
        # the band just under the thing: what it stands on
        bb = np.zeros_like(m); bb[min(H - 1, y1 + 2):min(H, y1 + 2 + max(4, bh // 6)), x0:x1 + 1] = 255
        bottom = img[bb > 0].astype(np.float32).mean(0) if (bb > 0).any() else rmean
        return Cand(mask=m, box=box, area=int(area), label=label, src=src, contrast=contrast, ring=rmean,
                    ringstd=ringstd, edge=edge, sharp=sharp, bottom=bottom)

    def solid(self, c): return c.src == "object" or (c.edge >= 1.8 and c.ringstd <= 20 and c.contrast >= 26)

    # ---------------------------------------------------------------- operations
    def _with_shadow(self, B, c):
        """Object mask plus the dark cast shadow attached to it (so no shadow is left behind)."""
        x0, y0, x1, y1 = c.box; bh = y1 - y0 + 1; bw = x1 - x0 + 1
        H, W = c.mask.shape
        lum = cv2.cvtColor(B, cv2.COLOR_RGB2GRAY).astype(np.float32)
        far = ring_of(c.mask, max(8, int(0.5 * max(bw, bh))))
        ref = np.median(lum[far]) if far.any() else lum.mean()
        zone = np.zeros((H, W), np.uint8)
        zx0, zx1 = max(0, x0 - bw // 2), min(W, x1 + bw // 2 + 1); zy0, zy1 = max(0, y0 - bh // 6), min(H, y1 + bh // 2 + 1)
        zone[zy0:zy1, zx0:zx1] = 1
        dark = ((lum < 0.80 * ref) & (zone > 0) & ~(c.mask > 0)).astype(np.uint8)
        comb = np.maximum(dark, (c.mask > 0).astype(np.uint8))
        n, lab = cv2.connectedComponents(cv2.morphologyEx(comb, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8)))
        keep = np.unique(lab[c.mask > 0]); keep = keep[keep > 0]
        m = np.isin(lab, keep)
        if m.sum() > 2.2 * c.area: m = c.mask > 0      # shadow guess too big: keep the object only
        return (m * 255).astype(np.uint8)

    def removable(self, c, N):
        return c.ringstd <= 16 and c.area <= 0.008 * N and self._busy[self._ringmask(c)].mean() <= 0.14

    def op_remove(self, B, c):
        if not self.removable(c, B.shape[0] * B.shape[1]): return None, None
        m = self._with_shadow(B, c)
        if (m > 0).sum() > 1.3 * c.area: return None, None      # a real cast shadow: too risky to rebuild
        m = cv2.dilate(m, np.ones((7, 7), np.uint8))
        if overlaps(self._box(m), self.people) or self._textmask[m > 0].any(): return None, None
        return self.lama(B, m), m

    @staticmethod
    def _box(m):
        ys, xs = np.where(m > 0); return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))

    def _paste(self, B, src_img, c, dx, dy, scale=1.0, anchor_bottom=True):
        x0, y0, x1, y1 = c.box
        patch = src_img[y0:y1 + 1, x0:x1 + 1]; pm = (c.mask[y0:y1 + 1, x0:x1 + 1] > 0).astype(np.float32)
        if scale != 1.0:
            nh, nw = int(round(patch.shape[0] * scale)), int(round(patch.shape[1] * scale))
            patch = cv2.resize(patch, (nw, nh), interpolation=cv2.INTER_CUBIC)
            pm = cv2.resize(pm, (nw, nh), interpolation=cv2.INTER_LINEAR)
            cx = (x0 + x1) / 2; nx0 = int(round(cx - nw / 2)); ny0 = (y1 + 1 - nh) if anchor_bottom else int(round((y0 + y1) / 2 - nh / 2))
        else:
            nx0, ny0 = x0, y0; nh, nw = patch.shape[:2]
        nx0 += dx; ny0 += dy
        H, W = B.shape[:2]
        if nx0 < 4 or ny0 < 4 or nx0 + nw > W - 4 or ny0 + nh > H - 4: return None, None
        a = cv2.GaussianBlur(pm, (0, 0), 0.9)[..., None]
        out = B.copy(); tgt = out[ny0:ny0 + nh, nx0:nx0 + nw]
        out[ny0:ny0 + nh, nx0:nx0 + nw] = (tgt * (1 - a) + patch * a).round().astype(np.uint8)
        tm = np.zeros(B.shape[:2], np.uint8); tm[ny0:ny0 + nh, nx0:nx0 + nw] = (pm > 0.5) * 255
        return out, tm

    def _ringmask(self, c):
        return ring_of(c.mask, max(4, int(0.12 * max(c.box[2] - c.box[0], c.box[3] - c.box[1]))))

    def _find_spot(self, B, c, used, near=(1.25, 3.0)):
        """Sideways offset on the same surface: same background, same support underneath, same focus, nothing else there."""
        H, W = B.shape[:2]; x0, y0, x1, y1 = c.box; bw, bh = x1 - x0 + 1, y1 - y0 + 1
        best, bs = None, 1e9
        rm = self._ringmask(c); tm = c.mask[y0:y1 + 1, x0:x1 + 1] > 0
        for _ in range(48):
            dist = self.rng.uniform(*near) * bw * (1 if self.rng.random() < .5 else -1)
            dx = int(dist); dy = int(self.rng.uniform(-0.08, 0.08) * bh)
            nx0, ny0, nx1, ny1 = x0 + dx, y0 + dy, x1 + dx, y1 + dy
            if nx0 < 10 or ny0 < 10 or nx1 > W - 11 or ny1 > H - 11: continue
            if overlaps((nx0, ny0, nx1, ny1), used, 22) or overlaps((nx0, ny0, nx1, ny1), self.people, 4): continue
            if self._textmask[ny0:ny1 + 1, nx0:nx1 + 1].any(): continue
            under = B[ny0:ny1 + 1, nx0:nx1 + 1].astype(np.float32)[tm]
            col = float(np.linalg.norm(under.mean(0) - c.ring)); tex = float(under.std(0).mean())
            if col > 22 or tex > c.ringstd * 1.5 + 6: continue
            tr = np.roll(np.roll(rm, dy, 0), dx, 1)
            tcol = float(np.linalg.norm(B[tr].astype(np.float32).mean(0) - c.ring))
            if tcol > 20: continue
            # support: the band under the new place must look like the band under the original
            by0, by1 = min(H - 1, ny1 + 2), min(H, ny1 + 2 + max(4, bh // 6))
            if by1 <= by0: continue
            sup = B[by0:by1, nx0:nx1 + 1].astype(np.float32).reshape(-1, 3).mean(0)
            if np.linalg.norm(sup - c.bottom) > 26: continue
            # same depth of field
            f = float(self._focus[ny0:ny1 + 1, nx0:nx1 + 1][tm].mean())
            if not (0.6 < f / max(1e-3, c.sharp) < 1.7): continue
            s = col + tex * 0.5 + 0.5 * tcol
            if s < bs: bs, best = s, (dx, dy)
        return best

    def op_dup(self, B, A, c, used):
        if not self.solid(c): return None, None
        spot = self._find_spot(B, c, used)
        if spot is None: return None, None
        return self._paste(B, A, c, *spot)

    def op_move(self, B, A, c, used):
        if not self.solid(c) or not self.removable(c, B.shape[0] * B.shape[1]): return None, None
        spot = self._find_spot(B, c, used, near=(0.5, 1.0))
        if spot is None: return None, None
        B2, m1 = self.op_remove(B, c)
        if B2 is None: return None, None
        B3, m2 = self._paste(B2, A, c, *spot)
        if B3 is None: return None, None
        return B3, np.maximum(m1, m2)

    def op_scale(self, B, A, c, used):
        """The thing grows a little, standing on the same base; it must fully cover its old outline."""
        if not self.solid(c) or c.edge < 1.8: return None, None
        x0, y0, x1, y1 = c.box
        s = float(self.rng.uniform(1.22, 1.35))
        out, tm = self._paste(B, A, c, 0, 0, scale=s)
        if out is None: return None, None
        leftover = (c.mask > 0) & ~(cv2.erode(tm, np.ones((3, 3), np.uint8)) > 0)
        if leftover.sum() > 0.03 * c.area: return None, None
        if overlaps(self._box(tm), self.people, 4) or self._textmask[tm > 0].any(): return None, None
        # the grown outline must land on the same background
        r = ring_of(tm, 5)
        if np.linalg.norm(B[r].astype(np.float32).mean(0) - c.ring) > 22: return None, None
        return out, np.maximum(tm, c.mask)

    def op_swap(self, B, A, c, used):
        """Replace this thing with another thing of the same size and shape from the photo (e.g. a different fruit,
        a different window pane). Nothing is rebuilt, so nothing can smear."""
        if not self.solid(c): return None, None
        x0, y0, x1, y1 = c.box; bw, bh = x1 - x0 + 1, y1 - y0 + 1
        best = None
        for o in self._cands:
            if o is c: continue
            ox0, oy0, ox1, oy1 = o.box; ow, oh = ox1 - ox0 + 1, oy1 - oy0 + 1
            if not (0.85 < ow / bw < 1.18 and 0.85 < oh / bh < 1.18): continue
            if np.linalg.norm(o.ring - c.ring) > 20: continue
            # the donor must cover the receiver once centred
            om = cv2.resize(o.mask[oy0:oy1 + 1, ox0:ox1 + 1], (bw, bh), interpolation=cv2.INTER_NEAREST) > 0
            cm = c.mask[y0:y1 + 1, x0:x1 + 1] > 0
            if (cm & ~cv2.dilate(om.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)).sum() > 0.03 * cm.sum(): continue
            if (om & ~cm).sum() > 0.25 * cm.sum(): continue
            dif = float(np.abs(cv2.resize(A[oy0:oy1 + 1, ox0:ox1 + 1], (bw, bh)).astype(int) - A[y0:y1 + 1, x0:x1 + 1].astype(int))[cm].mean())
            if dif < 25: continue
            if best is None or dif > best[0]: best = (dif, o, om)
        if best is None: return None, None
        _, o, om = best; ox0, oy0, ox1, oy1 = o.box
        patch = cv2.resize(A[oy0:oy1 + 1, ox0:ox1 + 1], (bw, bh), interpolation=cv2.INTER_AREA)
        a = cv2.GaussianBlur(cv2.dilate(om.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(np.float32), (0, 0), 0.9)[..., None]
        out = B.copy(); tgt = out[y0:y1 + 1, x0:x1 + 1]
        out[y0:y1 + 1, x0:x1 + 1] = (tgt * (1 - a) + patch * a).round().astype(np.uint8)
        m = np.zeros(B.shape[:2], np.uint8); m[y0:y1 + 1, x0:x1 + 1] = np.maximum(om, c.mask[y0:y1 + 1, x0:x1 + 1] > 0) * 255
        return out, m

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
        """Returns (ok, reason, stats). The edit must be visible on comparison and invisible as an edit."""
        P = LEVELS[lv]
        ch = np.abs(after.astype(int) - before.astype(int)).max(-1)
        changed = ch > 18
        if changed.sum() < 30: return False, "invisible", {}
        vis = float(ch[m > 0].mean())
        if vis < P["vis"]: return False, "too_faint", {"vis": vis}
        if op in ("remove", "move"):
            hole = (cv2.erode(m, np.ones((7, 7), np.uint8)) > 0) if op == "remove" else (c.mask > 0)
            if op == "move": hole &= ~(changed & ~(c.mask > 0))
            if hole.sum() < 20: hole = c.mask > 0
            ring = ring_of(hole.astype(np.uint8) * 255, max(6, int(0.18 * max(c.box[2] - c.box[0], c.box[3] - c.box[1]))))
            fpx, rpx = after[hole].astype(np.float32), after[ring].astype(np.float32)
            if np.linalg.norm(fpx.mean(0) - rpx.mean(0)) > 22 + 0.6 * c.ringstd: return False, "fill_mismatch", {}
            sr, sf = float(rpx.std(0).mean()), float(fpx.std(0).mean())
            if sf > 1.6 * sr + 5 or sf < 0.5 * sr - 2: return False, "fill_texture", {}
            lr, lf = lap_var(after, ring), lap_var(after, hole)
            if lr > 20 and lf / lr < 0.45: return False, "blurry_fill", {}
            # fine texture: rebuilt area must keep the grain of its surroundings (LaMa smears show up here)
            gl = np.abs(cv2.Laplacian(cv2.cvtColor(after, cv2.COLOR_RGB2GRAY).astype(np.float32), cv2.CV_32F))
            if np.median(gl[ring]) > 2 and np.median(gl[hole]) < 0.6 * np.median(gl[ring]): return False, "smear", {}
            if lf > 3 * lr + 150: return False, "noisy_fill", {}
            # colours in the rebuilt area must already exist around it (no smudges, no foreign blobs)
            if hist_dist(fpx.astype(np.int32), rpx.astype(np.int32)) > 0.32: return False, "foreign_colour", {}
            # the object's own outline must be gone, not ghosted
            g0 = cv2.Canny(cv2.cvtColor(before, cv2.COLOR_RGB2GRAY), 60, 140) > 0
            g1 = cv2.Canny(cv2.cvtColor(after, cv2.COLOR_RGB2GRAY), 60, 140) > 0
            inner = cv2.erode(c.mask, np.ones((5, 5), np.uint8)) > 0
            if g0[inner].sum() > 20 and (g0 & g1)[inner].sum() / g0[inner].sum() > 0.30: return False, "ghost", {}
            # new edges inside the hole that were not in the surroundings = artefacts
            ed_f = g1[hole].mean(); ed_r = g1[ring].mean()
            if ed_f > 1.6 * ed_r + 0.03: return False, "artefacts", {}
            # residual dark blob where a shadow was
            lf_ = cv2.cvtColor(after, cv2.COLOR_RGB2GRAY).astype(np.float32)
            if lf_[hole].mean() < 0.82 * lf_[ring].mean(): return False, "shadow_left", {}
        if op in ("dup", "move", "scale", "swap"):
            # seam: the pasted outline must not be harsher than the thing's own outline was
            new = (m > 0) & ~(c.mask > 0) if op != "scale" else (m > 0)
            nm = new.astype(np.uint8) * 255
            if nm.any():
                cont = (nm > 0) & ~(cv2.erode(nm, np.ones((3, 3), np.uint8)) > 0)
                ga = cv2.magnitude(cv2.Sobel(cv2.cvtColor(after, cv2.COLOR_RGB2GRAY).astype(np.float32), cv2.CV_32F, 1, 0),
                                   cv2.Sobel(cv2.cvtColor(after, cv2.COLOR_RGB2GRAY).astype(np.float32), cv2.CV_32F, 0, 1))
                oc = (c.mask > 0) & ~(cv2.erode(c.mask, np.ones((3, 3), np.uint8)) > 0)
                if cont.any() and oc.any() and ga[cont].mean() > 1.5 * self._grad[oc].mean() + 10: return False, "seam", {}
        return True, "", {"vis": vis}

    # ---------------------------------------------------------------- difficulty
    @staticmethod
    def clutter(A): return float((cv2.Canny(cv2.cvtColor(A, cv2.COLOR_RGB2GRAY), 80, 160) > 0).mean())
    @staticmethod
    def difficulty(diffs, clutter):
        """Higher = easier to see. Uses size and visibility of each difference and how busy the scene is."""
        s = [np.sqrt(d["area"] * 1e4) * min(d["vis"], 120) / 60 for d in diffs]
        D = float(np.median(s)) / (1 + 4 * max(0.0, clutter - 0.06))
        return D, (0 if D >= D_EASY else 2 if D < D_HARD else 1)

    def pools(self, cands, N):
        out = {}
        for lv, P in LEVELS.items():
            out[lv] = [c for c in cands if P["amin"] * N <= c.area <= P["amax"] * N and c.contrast >= P["con"]]
        return out

    # ---------------------------------------------------------------- pair
    def make(self, A, lv, cands=None):
        """A: prepared RGB photo. Returns dict or raises Reject. Pass cands to reuse a previous detection."""
        P = LEVELS[lv]; H, W = A.shape[:2]; N = H * W
        self.t = {}; t_all = time.time(); self.lama.calls = 0
        clutter = self.clutter(A)
        if clutter < 0.025: raise Reject("scene_too_plain", clutter)
        if cands is None: cands = self.candidates(A)
        self.last_cands = cands
        pool = self.pools(cands, N)[lv]
        self.rng.shuffle(pool)
        # closest to this level's typical size first, real objects slightly preferred, with some randomness
        pool.sort(key=lambda c: abs(np.log(c.area / N / P["tgt"])) + (0 if c.src == "object" else 0.3) + self.rng.random() * 0.8)
        want = int(self.rng.integers(P["n"][0], P["n"][1] + 1))
        if len(pool) < want: raise Reject("not_enough_candidates", len(pool))
        B = A.copy(); used = []; diffs = []; tries = {}; nops = {}
        ops, wts = zip(*P["ops"].items()); wts = np.array(wts, float) / sum(wts)
        max_remove = int(np.ceil(0.6 * want))
        t0 = time.time()
        budget = want * 4 + 8
        for c in pool:
            if len(diffs) >= want or self.lama.calls >= budget: break
            x0, y0, x1, y1 = c.box
            if overlaps(c.box, used, 26): continue
            order = list(self.rng.choice(ops, size=len(ops), replace=False, p=wts))
            for op in order:
                if op == "remove" and nops.get("remove", 0) >= max_remove: continue
                tries[op] = tries.get(op, 0) + 1
                if op == "remove": out, m = self.op_remove(B, c)
                elif op == "dup": out, m = self.op_dup(B, A, c, used)
                elif op == "move": out, m = self.op_move(B, A, c, used)
                elif op == "scale": out, m = self.op_scale(B, A, c, used)
                elif op == "swap": out, m = self.op_swap(B, A, c, used)
                else: out, m = self.op_flip(B, c)
                if out is None: continue
                ok, why, st = self.check_edit(B, out, m, c, op, lv)
                if not ok:
                    tries[why] = tries.get(why, 0) + 1; continue
                ch = np.abs(out.astype(int) - B.astype(int)).max(-1) > 14
                ys, xs = np.where(ch)
                bx0, by0, bx1, by1 = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
                if overlaps((bx0, by0, bx1, by1), used, 18): continue
                B = out; used.append((bx0, by0, bx1, by1)); nops[op] = nops.get(op, 0) + 1
                diffs.append({"x": round((bx0 + bx1) / 2), "y": round((by0 + by1) / 2), "rx": max(14, round((bx1 - bx0) / 2 + 8)),
                              "ry": max(14, round((by1 - by0) / 2 + 8)), "op": op, "what": c.label, "vis": round(st["vis"], 1),
                              "area": round(c.area / N, 5), "contrast": round(c.contrast, 1)})
                break
        self._tick("edit", t0)
        if len(diffs) < P["n"][0]: raise Reject("too_few_good_edits", len(diffs), tries)
        if len(nops) < 2: raise Reject("one_edit_type_only", nops)
        cells = {(min(2, d["x"] * 3 // W), min(1, d["y"] * 2 // H)) for d in diffs}
        if len(cells) < 3: raise Reject("diffs_clustered", len(cells))
        dm = np.abs(B.astype(int) - A.astype(int)).max(-1)
        yy, xx = np.mgrid[0:H, 0:W]; inside = np.zeros((H, W), bool)
        for d in diffs: inside |= (np.abs(xx - d["x"]) <= d["rx"] + 2) & (np.abs(yy - d["y"]) <= d["ry"] + 2)
        if dm[~inside].max() > 6: raise Reject("stray_change", int(dm[~inside].max()))
        D, measured = self.difficulty(diffs, clutter)
        self.t["total"] = time.time() - t_all
        return {"B": B, "diffs": diffs, "level": measured, "planned": lv, "D": round(D, 2), "clutter": round(clutter, 4),
                "tries": tries, "ops": nops, "time": {k: round(v, 2) for k, v in self.t.items()}, "lama_calls": self.lama.calls}

class Reject(Exception):
    def __init__(self, reason, *info):
        super().__init__(reason); self.reason = reason; self.info = info
