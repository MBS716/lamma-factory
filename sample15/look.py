"""look.py NAME            -> out/g_NAME.jpg : whole picture, 1600 wide, grid every 100 px of the full picture
   look.py NAME x0 y0 x1 y1 -> out/z_NAME.jpg : a zoom at full resolution, grid every 20 px (labels every 100)"""
import sys
from PIL import Image, ImageDraw
n = sys.argv[1]; im = Image.open(f'src/{n}.png').convert('RGB')
if len(sys.argv) == 2:
    s = 1600 / im.width; g = im.resize((1600, int(im.height * s))); d = ImageDraw.Draw(g)
    for x in range(100, im.width, 100): d.line([(x * s, 0), (x * s, g.height)], fill=(255, 255, 0) if x % 500 == 0 else (90, 90, 0)); d.text((x * s + 2, 2), str(x), fill=(255, 255, 0))
    for y in range(100, im.height, 100): d.line([(0, y * s), (g.width, y * s)], fill=(0, 255, 255) if y % 500 == 0 else (0, 90, 90)); d.text((2, y * s + 2), str(y), fill=(0, 255, 255))
    g.save(f'out/g_{n}.jpg', quality=85)
else:
    x0, y0, x1, y1 = map(int, sys.argv[2:6]); c = im.crop((x0, y0, x1, y1)); sc = max(1, min(4, 1100 // max(c.width, c.height)))
    c = c.resize((c.width * sc, c.height * sc), Image.LANCZOS); d = ImageDraw.Draw(c)
    for x in range((x0 // 20 + 1) * 20, x1, 20): d.line([((x - x0) * sc, 0), ((x - x0) * sc, c.height)], fill=(255, 255, 0) if x % 100 == 0 else (110, 110, 0)); x % 100 == 0 and d.text(((x - x0) * sc + 2, 2), str(x), fill=(255, 255, 0))
    for y in range((y0 // 20 + 1) * 20, y1, 20): d.line([(0, (y - y0) * sc), (c.width, (y - y0) * sc)], fill=(0, 255, 255) if y % 100 == 0 else (0, 110, 110)); y % 100 == 0 and d.text((2, (y - y0) * sc + 2), str(y), fill=(0, 255, 255))
    c.save(f'out/z_{n}.jpg', quality=88)
