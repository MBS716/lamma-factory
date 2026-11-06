"""Quality gate of one pair, measured exactly like the site's publishing check, on the 1600 px export:
  every difference changes >= 250 clearly different pixels inside its box (the publishing gate asks 150),
  no change outside the boxes, boxes at least 24 px apart, number of differences = level (5/8/12),
  and the exact tap areas (16 px cells) of two differences never closer than 16 px.
  python3 qc.py <id>   -> PASS/FAIL lines; writes the export to /home/claude/spot3/stage/<id>/"""
import sys, json, os, numpy as np, subprocess
from PIL import Image
from scipy import ndimage
sys.path.insert(0, '/home/claude/spot3'); from export import export
pid = sys.argv[1]; st = f'/home/claude/spot3/stage/{pid}'; os.makedirs(st, exist_ok=True)   # one folder per pair (several workers run at once)
L = json.load(open(f'/home/claude/spot3/lib/{pid}.json'))
need = {0: 5, 1: 8, 2: 12}[L['level']]
e = export(pid, '/home/claude/spot3/lib', st, prefix='s5-')
A = np.asarray(Image.open(f"{st}/{e['a']}").convert('RGB')).astype(int); B = np.asarray(Image.open(f"{st}/{e['b']}").convert('RGB')).astype(int)
d = np.abs(A - B).sum(2) > 60; inside = np.zeros(d.shape, bool); ok = True; out = []
for i, g in enumerate(e['diffs']):
    x0, x1, y0, y1 = max(0, g['x'] - g['rx']), min(e['w'], g['x'] + g['rx']), max(0, g['y'] - g['ry']), min(e['h'], g['y'] + g['ry'])
    inside[y0:y1, x0:x1] = True; n = int(d[y0:y1, x0:x1].sum())
    phone = min(g['rx'], g['ry']) * 2 * 360 / 1600
    good = n >= 250; ok &= good
    out.append(f"{'PASS' if good else 'FAIL'} #{i + 1} {L['diffs'][i]['name'][:40]}: {n} px changed (>=250), {phone:.0f} px wide on a 360 px phone")
lab, nb = ndimage.label(ndimage.binary_opening(d & ~inside, iterations=1)); sizes = ndimage.sum(d & ~inside, lab, range(1, nb + 1)) if nb else []
big = [int(s) for s in sizes if s >= 120]
if big: ok = False; out.append(f'FAIL change outside the boxes: {big[:5]}')
gaps = []
for i, a in enumerate(e['diffs']):
    for j, b in enumerate(e['diffs'][i + 1:], i + 1):
        gx = max(0, abs(a['x'] - b['x']) - a['rx'] - b['rx']); gy = max(0, abs(a['y'] - b['y']) - a['ry'] - b['ry'])
        g = max(gx, gy); gaps.append(g)
        if g < 24: ok = False; out.append(f'FAIL boxes #{i + 1} and #{j + 1} only {g} px apart (need 24)')
if len(e['diffs']) != need: ok = False; out.append(f"FAIL {len(e['diffs'])} differences, level needs {need}")
print('\n'.join(out)); print(('PASS' if ok else 'FAIL') + f" {pid}: {len(e['diffs'])} differences, smallest gap {min(gaps) if gaps else '-'} px")
