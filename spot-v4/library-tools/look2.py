"""Look at a source picture with a coordinate grid (full-resolution pixel coordinates, 2400 wide).
  python3 look2.py <id>                     -> whole picture, grid every 200 px
  python3 look2.py <id> x0 y0 x1 y1 [step]  -> a crop enlarged, grid every <step> px (default 50)
  python3 look2.py <id> --b ...             -> the same on the edited picture B (lib/<id>b.webp) after run.py
Writes /home/claude/spot3/look/<id>[...].jpg and prints the path (open it with the Read tool)."""
import sys, os
from PIL import Image, ImageDraw
os.makedirs('/home/claude/spot3/look', exist_ok=True)
a = [x for x in sys.argv[1:] if x != '--b']; useb = '--b' in sys.argv
pid = a[0]
im = Image.open(f'/home/claude/spot3/lib/{pid}b.webp' if useb else f'/home/claude/spot3/src/{pid}.png').convert('RGB')
W, H = im.size
if len(a) >= 5:
    x0, y0, x1, y1 = map(int, a[1:5]); step = int(a[5]) if len(a) > 5 else 50
    c = im.crop((x0, y0, x1, y1)); s = min(1400 / c.size[0], 1000 / c.size[1]); c = c.resize((int(c.size[0] * s), int(c.size[1] * s)))
    d = ImageDraw.Draw(c)
    for x in range((x0 // step + 1) * step, x1, step):
        X = (x - x0) * s; d.line([(X, 0), (X, c.size[1])], fill=(0, 255, 255) if x % (step * 2) == 0 else (255, 255, 0), width=1); d.text((X + 2, 2), str(x), fill=(255, 255, 255))
    for y in range((y0 // step + 1) * step, y1, step):
        Y = (y - y0) * s; d.line([(0, Y), (c.size[0], Y)], fill=(0, 255, 255) if y % (step * 2) == 0 else (255, 255, 0), width=1); d.text((2, Y + 2), str(y), fill=(255, 255, 255))
    out = f'/home/claude/spot3/look/{pid}{"_b" if useb else ""}_{x0}_{y0}.jpg'
else:
    s = 1400 / W; c = im.resize((1400, int(H * s))); d = ImageDraw.Draw(c)
    for x in range(200, W, 200): d.line([(x * s, 0), (x * s, c.size[1])], fill=(0, 255, 255), width=1); d.text((x * s + 2, 2), str(x), fill=(255, 255, 255))
    for y in range(200, H, 200): d.line([(0, y * s), (c.size[0], y * s)], fill=(0, 255, 255), width=1); d.text((2, y * s + 2), str(y), fill=(255, 255, 255))
    out = f'/home/claude/spot3/look/{pid}{"_b" if useb else ""}.jpg'
c.save(out, quality=85); print(out, 'picture', W, 'x', H)
