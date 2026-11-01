"""Retouching kit for spot-the-difference pairs.
Every edit works on a copy (B) of the original photo (A) and records the region it touched."""
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFilter

_NET = None
def net():
    global _NET
    if _NET is None:
        import onnxruntime as ort
        so = ort.SessionOptions(); so.log_severity_level = 3
        _NET = ort.InferenceSession('/home/claude/models/lama.onnx', so, providers=['CPUExecutionProvider'])
    return _NET

def poly_mask(shape, pts, dil=0):
    m = Image.new('L', (shape[1], shape[0]), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    m = np.array(m)
    if dil: m = cv2.dilate(m, np.ones((dil * 2 + 1, dil * 2 + 1), np.uint8))
    return m

def rect_pts(x0, y0, x1, y1): return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]

def feather(m, r):
    if r <= 0: return m.astype(np.float32) / 255
    return cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), r)

def lama(img, mask, ctx=3.0, minside=160):
    """Remove the masked object and rebuild the background with LaMa, working on a local window."""
    H, W = mask.shape
    ys, xs = np.where(mask > 0)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    side = int(max(minside, (x1 - x0) * ctx, (y1 - y0) * ctx)); side = min(side, max(H, W))
    wx0 = int(max(0, min(W - side, cx - side / 2))); wy0 = int(max(0, min(H - side, cy - side / 2)))
    sw, sh = min(side, W), min(side, H)
    crop = img[wy0:wy0 + sh, wx0:wx0 + sw]; mcrop = mask[wy0:wy0 + sh, wx0:wx0 + sw]
    bgr = cv2.cvtColor(crop, cv2.COLOR_RGB2BGR)
    ib = cv2.dnn.blobFromImage(bgr, 1 / 255, (512, 512), (0, 0, 0), False, False)
    mb = (cv2.dnn.blobFromImage(mcrop, 1.0, (512, 512), (0,), False, False) > 0).astype(np.float32)
    out = net().run(None, {'image': ib.astype(np.float32), 'mask': mb.astype(np.float32)})[0][0].transpose(1, 2, 0)
    out = np.clip(out, 0, 255).astype(np.uint8)
    out = cv2.cvtColor(cv2.resize(out, (sw, sh), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2RGB)
    res = img.copy()
    a = feather(cv2.dilate(mcrop, np.ones((3, 3), np.uint8)), 1.2)[..., None]
    res[wy0:wy0 + sh, wx0:wx0 + sw] = (crop * (1 - a) + out * a).astype(np.uint8)
    return res

def clone(img, src_pts, dx, dy, feath=1.5, flip=False):
    """Copy the polygon at src_pts to the same shape shifted by (dx,dy)."""
    H, W = img.shape[:2]
    m = poly_mask(img.shape, src_pts)
    ys, xs = np.where(m > 0); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    patch = img[y0:y1, x0:x1].copy(); pm = m[y0:y1, x0:x1]
    if flip: patch = patch[:, ::-1]; pm = pm[:, ::-1]
    a = feather(pm, feath)[..., None]
    res = img.copy()
    tx, ty = x0 + dx, y0 + dy
    region = res[ty:ty + (y1 - y0), tx:tx + (x1 - x0)]
    res[ty:ty + (y1 - y0), tx:tx + (x1 - x0)] = (region * (1 - a) + patch * a).astype(np.uint8)
    return res

def recolor(img, pts, hue=0, sat=1.0, val=1.0, feath=1.0, mask=None):
    m = poly_mask(img.shape, pts) if mask is None else mask
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV_FULL).astype(np.float32)
    hsv[..., 0] = (hsv[..., 0] + hue * 256 / 360) % 256
    hsv[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255); hsv[..., 2] = np.clip(hsv[..., 2] * val, 0, 255)
    rec = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB_FULL)
    a = feather(m, feath)[..., None]
    return (img * (1 - a) + rec * a).astype(np.uint8)

def colormask(img, pts, ref_rgb, tol):
    """Pixels inside the polygon whose colour is near ref_rgb (to recolour just one object)."""
    m = poly_mask(img.shape, pts) > 0
    d = np.sqrt(((img.astype(np.float32) - np.array(ref_rgb, np.float32)) ** 2).sum(-1))
    out = ((d < tol) & m).astype(np.uint8) * 255
    return cv2.morphologyEx(out, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))

def flip_region(img, pts, feath=1.2, vertical=False):
    m = poly_mask(img.shape, pts)
    ys, xs = np.where(m > 0); x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    res = img.copy(); patch = img[y0:y1, x0:x1]
    patch = patch[::-1] if vertical else patch[:, ::-1]
    a = feather(m[y0:y1, x0:x1], feath)[..., None]
    res[y0:y1, x0:x1] = (img[y0:y1, x0:x1] * (1 - a) + patch * a).astype(np.uint8)
    return res
