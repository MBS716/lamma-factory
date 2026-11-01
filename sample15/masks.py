"""masks.py SPEC.py -> out/m_ID.jpg : the mask each edit will use, drawn in red over the original (check before editing)"""
import sys, importlib.util, numpy as np, cv2
from PIL import Image, ImageDraw
from kit2 import rmask
sp = importlib.util.spec_from_file_location('s', sys.argv[1]); mod = importlib.util.module_from_spec(sp); sp.loader.exec_module(mod); S = mod.SPEC
A = np.array(Image.open(f"src/{S['src']}.png").convert('RGB')); tiles = []
only = [int(x) for x in sys.argv[2].split(',')] if len(sys.argv) > 2 else None
for i, d in enumerate(S['diffs']):
    if only and i + 1 not in only: continue
    m = rmask(A.shape, d, A); ys, xs = np.where(m > 0)
    if not len(xs): print('empty mask', i + 1); continue
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max(); side = int(max(x1 - x0, y1 - y0) * 1.8) + 60
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2; wx = max(0, min(A.shape[1] - side, cx - side // 2)); wy = max(0, min(A.shape[0] - side, cy - side // 2))
    c = A[wy:wy + side, wx:wx + side].copy(); mm = m[wy:wy + side, wx:wx + side] > 0
    ov = c.copy(); ov[mm] = (ov[mm] * 0.45 + np.array([255, 0, 0]) * 0.55).astype(np.uint8)
    t = Image.new('RGB', (520, 280), 'black'); t.paste(Image.fromarray(c).resize((255, 255)), (0, 22)); t.paste(Image.fromarray(ov).resize((255, 255)), (265, 22))
    ImageDraw.Draw(t).text((4, 4), f"{i + 1}. {d['op']}", fill='white'); tiles.append(t)
cols = 3; rows = (len(tiles) + 2) // 3; sh = Image.new('RGB', (cols * 530, rows * 290), 'gray')
for i, t in enumerate(tiles): sh.paste(t, ((i % 3) * 530, (i // 3) * 290))
sh.save(f"out/m_{S['id']}.jpg", quality=85)
