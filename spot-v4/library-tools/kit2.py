"""Spot-the-difference retouching kit v2 (high-resolution sources, hand-picked edits).
Every edit is applied to a copy B of the original A; the changed pixels define the difference box automatically.
Ops (each dict in spec['diffs']):
  remove   {rect | poly, gc?}             object disappears; background rebuilt with LaMa
  recolor  {rect | poly, gc?, ref?, tol?, hue, sat, val}   object changes colour
  add      {rect | poly, gc?, dx, dy, flip?, scale?}        a copy of an object appears elsewhere (blended)
  flip     {rect | poly, vertical?}       object mirrored in place
  scale    {rect, f}                      object resized in place (background rebuilt under it first)
  swap     {rect, rect2}                  content of two same-size patches exchanged (two objects swap places) -> one diff per rect
"""
import os, sys, json, cv2, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, '/home/claude/sd/tools')
from kit import lama, poly_mask, rect_pts, feather

_SAM = None
def sam_mask(img, rect, pts=(), neg=(), pick='best'):
    """EfficientSAM on a local window around the box (sharper than the whole picture): box prompt + optional points"""
    global _SAM
    import onnxruntime as ort
    if _SAM is None:
        so = ort.SessionOptions(); so.log_severity_level = 3
        _SAM = ort.InferenceSession('/home/claude/models/esam.onnx', so, providers=['CPUExecutionProvider'])
    H, W = img.shape[:2]; x0, y0, x1, y1 = rect; bw, bh = x1 - x0, y1 - y0
    side = int(max(bw, bh) * 1.6) + 40; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    wx0 = int(max(0, min(W - side, cx - side / 2))); wy0 = int(max(0, min(H - side, cy - side / 2))); sw, sh = min(side, W), min(side, H)
    crop = img[wy0:wy0 + sh, wx0:wx0 + sw]; S = 1024
    x = cv2.resize(crop, (S, S), interpolation=cv2.INTER_AREA if sw > S else cv2.INTER_CUBIC).astype(np.float32) / 255.0
    P = np.zeros((1, 1, 6, 2), np.float32); L = -np.ones((1, 1, 6), np.float32); k = 0
    for (px, py), lb in [((x0, y0), 2), ((x1, y1), 3)] + [(q, 1) for q in pts] + [(q, 0) for q in neg]:
        P[0, 0, k] = [(px - wx0) * S / sw, (py - wy0) * S / sh]; L[0, 0, k] = lb; k += 1
    m, iou = _SAM.run(None, {'batched_images': x.transpose(2, 0, 1)[None], 'batched_point_coords': P, 'batched_point_labels': L})
    ms = m[0, 0] >= 0; iou = iou[0, 0]
    i = int(np.argmax(iou)) if pick == 'best' else {'small': 0, 'mid': 1, 'big': 2}[pick]
    mm = cv2.resize(ms[i].astype(np.uint8) * 255, (sw, sh), interpolation=cv2.INTER_LINEAR)
    out = np.zeros((H, W), np.uint8); out[wy0:wy0 + sh, wx0:wx0 + sw] = np.where(mm > 127, 255, 0)
    box = np.zeros_like(out); box[max(0, y0 - 4):y1 + 4, max(0, x0 - 4):x1 + 4] = 255
    return out & box

def rmask(shape, d, img=None):
    """mask of the object: SAM in the rect (sam=True), GrabCut (gc=True), the polygon, or the full rect"""
    if d.get('sam'):
        m = sam_mask(img, d['rect'], d.get('pts', ()), d.get('neg', ()), d.get('pick', 'best'))
        if d.get('dil', 3): m = cv2.dilate(m, np.ones((2 * d.get('dil', 3) + 1,) * 2, np.uint8))
        if d.get('ero'): m = cv2.erode(m, np.ones((2 * d['ero'] + 1,) * 2, np.uint8))
    elif 'poly' in d: m = poly_mask(shape, d['poly'], d.get('dil', 0))
    else:
        x0, y0, x1, y1 = d['rect']
        if d.get('gc'):
            gm = np.zeros(shape[:2], np.uint8); bg = np.zeros((1, 65), np.float64); fg = np.zeros((1, 65), np.float64)
            pad = 6; r = (max(0, x0 - pad), max(0, y0 - pad), x1 - x0 + 2 * pad, y1 - y0 + 2 * pad)
            cv2.grabCut(cv2.cvtColor(img, cv2.COLOR_RGB2BGR), gm, r, bg, fg, 6, cv2.GC_INIT_WITH_RECT)
            m = np.where((gm == 1) | (gm == 3), 255, 0).astype(np.uint8)
            n, lab, st, _ = cv2.connectedComponentsWithStats(m)
            if n > 1: k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); m = np.where(lab == k, 255, 0).astype(np.uint8)
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
            cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE); m = np.zeros_like(m); cv2.drawContours(m, cnts, -1, 255, -1)
            if d.get('dil', 3): m = cv2.dilate(m, np.ones((2 * d.get('dil', 3) + 1,) * 2, np.uint8))
        else: m = poly_mask(shape, rect_pts(x0, y0, x1, y1), d.get('dil', 0))
    if 'ref' in d and not d.get('sam'):   # keep only pixels near a reference colour (e.g. one cloth)
        dist = np.sqrt(((img.astype(np.float32) - np.array(d['ref'], np.float32)) ** 2).sum(-1))
        m = np.where((dist < d.get('tol', 60)) & (m > 0), 255, 0).astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        if d.get('rdil'): m = cv2.dilate(m, np.ones((2 * d['rdil'] + 1,) * 2, np.uint8))
    for (ex0, ey0, ex1, ey1) in d.get('excl', []): m[ey0:ey1, ex0:ex1] = 0
    if d.get('shadow'):          # the object's cast shadow goes too: the mask is swept along the shadow direction
        sx, sy = d['shadow']; acc = m.copy(); H, W = m.shape
        for k in range(1, 9):
            M = np.float32([[1, 0, sx * k / 8], [0, 1, sy * k / 8]]); acc |= cv2.warpAffine(m, M, (W, H))
        m = cv2.dilate(acc, np.ones((5, 5), np.uint8))
    return m

def big_lama(img, m, ctx=2.6, minside=200, maxside=900):
    """LaMa on a local window (window clipped so detail stays sharp); big masks are done in pieces by the caller."""
    return lama(img, m, ctx, minside)

def recolor(img, m, hue=0, sat=1.0, val=1.0, fe=1.2, set_hue=None, min_sat=0):
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    if set_hue is not None: hsv[..., 0] = set_hue * 256 / 360; hsv[..., 1] = np.maximum(hsv[..., 1], min_sat)
    else: hsv[..., 0] = (hsv[..., 0] + hue * 256 / 360) % 256
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255); hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    rec = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB_FULL)
    a = feather(m, fe)[..., None]
    return (img * (1 - a) + rec * a).astype(np.uint8)

def paste(img, patch, pm, tx, ty, fe=1.5):
    H, W = img.shape[:2]; h, w = pm.shape
    x0, y0 = max(0, tx), max(0, ty); x1, y1 = min(W, tx + w), min(H, ty + h)
    if x1 <= x0 or y1 <= y0: return img
    p = patch[y0 - ty:y1 - ty, x0 - tx:x1 - tx]; a = feather(pm[y0 - ty:y1 - ty, x0 - tx:x1 - tx], fe)[..., None]
    out = img.copy(); out[y0:y1, x0:x1] = (img[y0:y1, x0:x1] * (1 - a) + p * a).astype(np.uint8); return out

def cut(img, m):
    ys, xs = np.where(m > 0); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return img[y0:y1, x0:x1].copy(), m[y0:y1, x0:x1].copy(), x0, y0

def lcc(m):
    """keep the largest connected part of a mask (a mask that leaks onto the ground is cut back to the object)"""
    n, lab, st, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8))
    if n <= 2: return m
    k = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); return np.where(lab == k, 255, 0).astype(np.uint8)

def apply(B, A, d):
    op = d['op']
    if op == 'remove':
        m = rmask(B.shape, d, B)
        if d.get('lcc'): m = lcc(m)
        return big_lama(B, m, d.get('ctx', 2.6), d.get('min', 200))
    if op == 'recolor':
        m = rmask(B.shape, d, B)
        if d.get('lcc'): m = lcc(m)
        if d.get('minval'): m = np.where(cv2.cvtColor(B, cv2.COLOR_RGB2HSV)[..., 2] > d['minval'], m, 0).astype(np.uint8)
        if d.get('maxsat'): m = np.where(cv2.cvtColor(B, cv2.COLOR_RGB2HSV)[..., 1] < d['maxsat'], m, 0).astype(np.uint8)
        if d.get('keep_hue'):
            hh = cv2.cvtColor(B, cv2.COLOR_RGB2HSV)[..., 0]; lo, hi = d['keep_hue']
            m = np.where((hh >= lo) & (hh <= hi), m, 0).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        if d.get('minsat'): m = np.where(cv2.cvtColor(B, cv2.COLOR_RGB2HSV)[..., 1] > d['minsat'], m, 0).astype(np.uint8); m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        if d.get('maxval'): m = np.where(cv2.cvtColor(B, cv2.COLOR_RGB2HSV)[..., 2] < d['maxval'], m, 0).astype(np.uint8)
        return recolor(B, m, d.get('hue', 0), d.get('sat', 1), d.get('val', 1), d.get('fe', 1.2), d.get('set_hue'), d.get('min_sat', 0))
    if op == 'add':
        m = rmask(B.shape, d, B); patch, pm, x0, y0 = cut(B, m)
        if d.get('flip'): patch, pm = patch[:, ::-1], pm[:, ::-1]
        s = d.get('scale', 1.0)
        if s != 1.0:
            patch = cv2.resize(patch, None, fx=s, fy=s, interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
            pm = cv2.resize(pm, (patch.shape[1], patch.shape[0]), interpolation=cv2.INTER_LINEAR)
        if d.get('hue') or d.get('val', 1) != 1 or d.get('sat', 1) != 1: patch = recolor(patch, np.full(pm.shape, 255, np.uint8), d.get('hue', 0), d.get('sat', 1), d.get('val', 1), 0)
        pm = cv2.erode(pm, np.ones((3, 3), np.uint8)) if d.get('erode', True) else pm
        return paste(B, patch, pm, x0 + d['dx'], y0 + d['dy'], d.get('fe', 1.5))
    if op == 'flip':
        m = rmask(B.shape, d, B); patch, pm, x0, y0 = cut(B, m)
        patch = patch[::-1] if d.get('vertical') else patch[:, ::-1]
        if d.get('vertical'): pm = pm[::-1]
        else: pm = pm[:, ::-1]
        base = big_lama(B, cv2.dilate(m, np.ones((5, 5), np.uint8)), 2.6, 200) if d.get('clean', True) else B
        return paste(base, patch, pm, x0, y0, d.get('fe', 1.2))
    if op == 'scale':
        m = rmask(B.shape, d, B); patch, pm, x0, y0 = cut(B, m); f = d['f']
        base = big_lama(B, cv2.dilate(m, np.ones((7, 7), np.uint8)), 2.6, 200) if f < 1 else B
        p2 = cv2.resize(patch, None, fx=f, fy=f, interpolation=cv2.INTER_AREA if f < 1 else cv2.INTER_CUBIC); m2 = cv2.resize(pm, (p2.shape[1], p2.shape[0]))
        ax = d.get('anchor', 'bottom')   # objects stand on their base
        tx = x0 + (pm.shape[1] - p2.shape[1]) // 2; ty = y0 + (pm.shape[0] - p2.shape[0]) if ax == 'bottom' else y0 + (pm.shape[0] - p2.shape[0]) // 2
        return paste(base, p2, cv2.erode(m2, np.ones((3, 3), np.uint8)), tx, ty, 1.2)
    raise ValueError(op)

def run(spec, src_dir='src', out='out', lib='lib'):
    A = np.array(Image.open(f"{src_dir}/{spec['src']}.png").convert('RGB')); B = A.copy(); regions = []
    for d in spec['diffs']:
        before = B.copy(); B = apply(B, A, d)
        ch = np.abs(B.astype(int) - before.astype(int)).max(-1) > 16
        ch = cv2.morphologyEx(ch.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        ys, xs = np.where(ch > 0)
        if not len(xs): print('!! no visible change for', d.get('name')); continue
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); pad = d.get('pad', 10)
        regions.append({'x': int((x0 + x1) / 2), 'y': int((y0 + y1) / 2), 'rx': int(max((x1 - x0) / 2 + pad, 22)), 'ry': int(max((y1 - y0) / 2 + pad, 22)),
                        'name': d.get('name', ''), 'type': d['op'], 'px': int(ch.sum())})
    ov = [(i + 1, j + 1) for i in range(len(regions)) for j in range(i + 1, len(regions))
          if abs(regions[i]['x'] - regions[j]['x']) < regions[i]['rx'] + regions[j]['rx'] and abs(regions[i]['y'] - regions[j]['y']) < regions[i]['ry'] + regions[j]['ry']]
    os.makedirs(lib, exist_ok=True); os.makedirs(out, exist_ok=True)
    pa, pb = f"{lib}/{spec['id']}a.webp", f"{lib}/{spec['id']}b.webp"
    Image.fromarray(A).save(pa, quality=92, method=6); Image.fromarray(B).save(pb, quality=92, method=6)
    # every visible change after encoding must sit inside a declared box
    da = np.array(Image.open(pa)).astype(int); db = np.array(Image.open(pb)).astype(int); diff = np.abs(da - db).max(-1)
    yy, xx = np.mgrid[0:diff.shape[0], 0:diff.shape[1]]; inside = np.zeros(diff.shape, bool)
    for g in regions: inside |= (abs(xx - g['x']) <= g['rx']) & (abs(yy - g['y']) <= g['ry'])
    sig = ((diff > 30) & ~inside).astype(np.uint8); n, lab, st, _ = cv2.connectedComponentsWithStats(sig)
    stray = [(int(st[i, 0]), int(st[i, 1]), int(st[i, 4])) for i in range(1, n) if st[i, 4] >= 25]
    rep = {'id': spec['id'], 'count': len(regions), 'wanted': spec['n'], 'overlaps': ov, 'stray': stray[:10], 'max_outside': int((diff * ~inside).max())}
    print(json.dumps(rep, ensure_ascii=False))
    # review: full B with numbered boxes + crops
    s = 1200 / A.shape[1]; full = Image.fromarray(B).resize((1200, int(A.shape[0] * s))); dr = ImageDraw.Draw(full)
    for i, g in enumerate(regions):
        dr.ellipse([(g['x'] - g['rx']) * s, (g['y'] - g['ry']) * s, (g['x'] + g['rx']) * s, (g['y'] + g['ry']) * s], outline=(255, 0, 0), width=3)
        dr.text(((g['x'] + g['rx']) * s, (g['y'] - g['ry']) * s - 10), str(i + 1), fill=(255, 255, 0))
    full.save(f"{out}/rev_{spec['id']}.jpg", quality=85)
    crops = []
    for g in regions:
        side = int(max(160, 2.6 * max(g['rx'], g['ry']))); x0 = max(0, min(A.shape[1] - side, g['x'] - side // 2)); y0 = max(0, min(A.shape[0] - side, g['y'] - side // 2))
        ca = Image.fromarray(A[y0:y0 + side, x0:x0 + side]).resize((260, 260)); cb = Image.fromarray(B[y0:y0 + side, x0:x0 + side]).resize((260, 260))
        t = Image.new('RGB', (530, 280), 'black'); t.paste(ca, (0, 20)); t.paste(cb, (270, 20)); ImageDraw.Draw(t).text((4, 4), f"{len(crops) + 1}. {g['type']} {g['name'][:50]}", fill='white'); crops.append(t)
    cols = 3; rows = (len(crops) + cols - 1) // cols; cs = Image.new('RGB', (cols * 540, rows * 290), 'gray')
    for i, t in enumerate(crops): cs.paste(t, ((i % cols) * 540, (i // cols) * 290))
    cs.save(f"{out}/crops_{spec['id']}.jpg", quality=85)
    meta = {k: spec[k] for k in ('id', 'src', 'level', 'title', 'n', 'kind')}
    meta.update(w=int(A.shape[1]), h=int(A.shape[0]), diffs=[{k: g[k] for k in ('x', 'y', 'rx', 'ry', 'name', 'type')} for g in regions], check=rep)
    json.dump(meta, open(f"{lib}/{spec['id']}.json", 'w'), ensure_ascii=False, indent=1)
    return meta
