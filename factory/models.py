"""ONNX models used by the factory (CPU only, no GPU needed).
- LaMa (Apache-2.0): removes an object and rebuilds the background.
- YOLOX-s (Apache-2.0): finds everyday objects (cups, books, clocks, chairs, cars, people...).
- PP-OCRv3 text detector (Apache-2.0): finds writing and logos so they are never edited.
- EfficientSAM-Ti (Apache-2.0): cuts out whole things and their parts with clean outlines."""
import os, numpy as np, cv2
import onnxruntime as ort

MODEL_DIR = os.environ.get("FACTORY_MODELS", os.path.join(os.path.dirname(__file__), "..", "models"))
_so = ort.SessionOptions(); _so.log_severity_level = 3
_threads = int(os.environ.get("FACTORY_THREADS", "0"))
if _threads: _so.intra_op_num_threads = _threads

COCO = ('person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
        'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
        'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee',
        'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard',
        'tennis racket', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
        'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair', 'couch',
        'potted plant', 'bed', 'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
        'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors', 'teddy bear',
        'hair drier', 'toothbrush')
# objects that read naturally when they disappear / appear twice in a scene
GOOD_CLASSES = {'bicycle', 'car', 'motorcycle', 'bus', 'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign',
                'parking meter', 'bench', 'bird', 'cat', 'dog', 'backpack', 'umbrella', 'handbag', 'suitcase', 'kite',
                'sports ball', 'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
                'orange', 'carrot', 'donut', 'cake', 'chair', 'potted plant', 'tv', 'laptop', 'mouse', 'remote',
                'keyboard', 'cell phone', 'book', 'clock', 'vase', 'scissors', 'teddy bear'}   # never people (or what they wear)

class Lama:
    def __init__(self):
        self.s = ort.InferenceSession(os.path.join(MODEL_DIR, "lama.onnx"), _so, providers=["CPUExecutionProvider"])
        self.calls = 0
    def __call__(self, img, mask, ctx=3.0, minside=192):
        """img RGB uint8, mask uint8 (255 = remove). Works on a square window around the mask."""
        H, W = mask.shape
        ys, xs = np.where(mask > 0)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        side = int(max(minside, (x1 - x0 + 1) * ctx, (y1 - y0 + 1) * ctx)); side = min(side, H, W)
        wx0 = int(max(0, min(W - side, cx - side / 2))); wy0 = int(max(0, min(H - side, cy - side / 2)))
        crop = img[wy0:wy0 + side, wx0:wx0 + side]; mc = mask[wy0:wy0 + side, wx0:wx0 + side]
        ib = cv2.resize(crop, (512, 512), interpolation=cv2.INTER_AREA if side > 512 else cv2.INTER_CUBIC)
        mb = cv2.resize(mc, (512, 512), interpolation=cv2.INTER_NEAREST)
        ib = ib[..., ::-1].astype(np.float32).transpose(2, 0, 1)[None] / 255.0   # model expects BGR
        mb = (mb > 0).astype(np.float32)[None, None]
        out = self.s.run(None, {"image": ib, "mask": mb})[0][0].transpose(1, 2, 0)
        self.calls += 1
        out = np.clip(out, 0, 255).astype(np.uint8)[..., ::-1]
        out = cv2.resize(out, (side, side), interpolation=cv2.INTER_AREA if side < 512 else cv2.INTER_CUBIC)
        res = img.copy()
        a = cv2.GaussianBlur(cv2.dilate(mc, np.ones((3, 3), np.uint8)).astype(np.float32) / 255, (0, 0), 1.0)[..., None]
        res[wy0:wy0 + side, wx0:wx0 + side] = (crop * (1 - a) + out * a).round().astype(np.uint8)
        return res

class Yolox:
    def __init__(self, conf=0.35, nms=0.5):
        self.s = ort.InferenceSession(os.path.join(MODEL_DIR, "yolox.onnx"), _so, providers=["CPUExecutionProvider"])
        self.conf, self.nms = conf, nms
        grids, strides = [], []
        for st in (8, 16, 32):
            n = 640 // st; xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            grids.append(np.stack((xv, yv), 2).reshape(-1, 2)); strides.append(np.full((n * n, 1), st))
        self.grids = np.concatenate(grids); self.strides = np.concatenate(strides)
    def __call__(self, img):
        """Returns list of (x, y, w, h, score, class_name) in image pixels."""
        h, w = img.shape[:2]; r = min(640 / h, 640 / w)
        pad = np.full((640, 640, 3), 114, np.float32)
        pad[:int(h * r), :int(w * r)] = cv2.resize(img[..., ::-1], (int(w * r), int(h * r))).astype(np.float32)
        d = self.s.run(None, {"images": pad.transpose(2, 0, 1)[None]})[0][0]
        d[:, :2] = (d[:, :2] + self.grids) * self.strides; d[:, 2:4] = np.exp(d[:, 2:4]) * self.strides
        boxes = np.stack([d[:, 0] - d[:, 2] / 2, d[:, 1] - d[:, 3] / 2, d[:, 2], d[:, 3]], 1)
        sc = d[:, 4:5] * d[:, 5:]; best = sc.max(1); cls = sc.argmax(1)
        keep = cv2.dnn.NMSBoxesBatched(boxes.tolist(), best.tolist(), cls.tolist(), self.conf, self.nms)
        out = []
        for k in np.array(keep).reshape(-1):
            x, y, bw, bh = boxes[k] / r
            out.append((float(x), float(y), float(bw), float(bh), float(best[k]), COCO[int(cls[k])]))
        return out

class TextDet:
    """Text regions (signs, labels, logos with letters). Returns a list of 4-point polygons in image pixels."""
    def __init__(self, w=960, h=640):
        self.m = cv2.dnn.TextDetectionModel_DB(os.path.join(MODEL_DIR, "textdet.onnx"))
        self.m.setBinaryThreshold(0.3).setPolygonThreshold(0.5).setMaxCandidates(400).setUnclipRatio(2.0)
        self.m.setInputParams(1.0 / 255.0, (w, h), (122.67891434, 116.66876762, 104.00698793), True)
        self.w, self.h = w, h
    def __call__(self, img):
        H, W = img.shape[:2]
        small = cv2.resize(img[..., ::-1], (self.w, self.h), interpolation=cv2.INTER_AREA)
        polys, _ = self.m.detect(small)
        sx, sy = W / self.w, H / self.h
        return [np.array(p, np.float32) * [sx, sy] for p in polys]
    def small(self, crop, side=320):
        """Text in a small crop, upscaled so short words and logos are found."""
        self.m.setInputParams(1.0 / 255.0, (side, side), (122.67891434, 116.66876762, 104.00698793), True)
        try: polys, _ = self.m.detect(cv2.resize(crop[..., ::-1], (side, side), interpolation=cv2.INTER_CUBIC))
        finally: self.m.setInputParams(1.0 / 255.0, (self.w, self.h), (122.67891434, 116.66876762, 104.00698793), True)
        return polys

class Sam:
    """EfficientSAM split in two: the image is encoded once, then each point/box prompt costs ~50 ms.
    Returns up to 3 nested masks per prompt (part, bigger part, whole thing) with predicted quality."""
    S = 1024
    def __init__(self):
        self.enc = ort.InferenceSession(os.path.join(MODEL_DIR, "esam_enc.onnx"), _so, providers=["CPUExecutionProvider"])
        self.dec = ort.InferenceSession(os.path.join(MODEL_DIR, "esam_dec.onnx"), _so, providers=["CPUExecutionProvider"])
        self.ein = self.dec.get_inputs()[0].name
    def set_image(self, img):
        self.H, self.W = img.shape[:2]
        x = cv2.resize(img, (self.S, self.S), interpolation=cv2.INTER_AREA).astype(np.float32) / 255.0
        self.emb = self.enc.run(None, {"batched_images": x.transpose(2, 0, 1)[None]})[0]
    def predict(self, pts, labels):
        """pts in image pixels, labels 1 = point on the thing, 2/3 = box corners. Masks at 1024x1024 (bool), ious."""
        p = np.zeros((1, 1, 6, 2), np.float32); l = -np.ones((1, 1, 6), np.float32)
        for i, ((x, y), lb) in enumerate(zip(pts, labels)):
            p[0, 0, i] = [x * self.S / self.W, y * self.S / self.H]; l[0, 0, i] = lb
        m, iou = self.dec.run(None, {self.ein: self.emb, "batched_point_coords": p, "batched_point_labels": l})
        return m[0, 0] >= 0, iou[0, 0]
    def full(self, m1024):
        return cv2.resize(m1024.astype(np.uint8) * 255, (self.W, self.H), interpolation=cv2.INTER_NEAREST)
