"""Exact hit areas for spot-the-difference: for each difference, the cells (16 px of the 1600 px picture)
where the two pictures really differ, inside its box. Written into pairs.json as d['m'] = [gx0, gy0, cols, rows-hex].
A tap counts when it lands on (or within the finger tolerance of) one of these cells, not anywhere in the box."""
import json, sys, os, numpy as np
from PIL import Image, ImageFilter
G = 16
lib = sys.argv[1]; P = json.load(open(os.path.join(lib, 'pairs.json')))
for p in P:
    a = Image.open(os.path.join(lib, p['a'])).convert('RGB'); b = Image.open(os.path.join(lib, p['b'])).convert('RGB')
    A = np.asarray(a.filter(ImageFilter.GaussianBlur(1.2)), np.int16); B = np.asarray(b.filter(ImageFilter.GaussianBlur(1.2)), np.int16)
    ch = (np.abs(A - B).max(2) > 22)
    m = Image.fromarray((ch * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(9))
    ch = np.asarray(m) > 0
    H, W = ch.shape
    for d in p['diffs']:
        x0, y0 = max(0, d['x'] - d['rx']) // G, max(0, d['y'] - d['ry']) // G
        x1, y1 = min(W - 1, d['x'] + d['rx']) // G, min(H - 1, d['y'] + d['ry']) // G
        cols = x1 - x0 + 1; rows = []
        n = 0
        for gy in range(y0, y1 + 1):
            bits = 0
            for i, gx in enumerate(range(x0, x1 + 1)):
                c = ch[gy * G:(gy + 1) * G, gx * G:(gx + 1) * G]
                # inside the box, and enough of the cell really changed
                cx, cy = gx * G + G / 2, gy * G + G / 2
                if c.mean() > 0.12 and abs(cx - d['x']) <= d['rx'] + G / 2 and abs(cy - d['y']) <= d['ry'] + G / 2: bits |= 1 << i; n += 1
            rows.append(format(bits, 'x'))
        if n == 0: rows = [format((1 << cols) - 1, 'x')] * (y1 - y0 + 1); n = -1          # nothing measurable: the whole box
        d['m'] = [int(x0), int(y0), int(cols), '.'.join(rows)]; d['mc'] = n
    print(p['id'], [d['mc'] for d in p['diffs']])
json.dump(P, open(os.path.join(lib, 'pairs.json'), 'w'), ensure_ascii=False, indent=1)
