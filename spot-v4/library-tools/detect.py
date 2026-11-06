"""Objects the detector sees in a source picture (COCO classes), to help choose differences.
  python3 detect.py <id>   -> lines: class  confidence  x0 y0 x1 y1  (full-resolution coordinates)"""
import sys, numpy as np
sys.path.insert(0, '/home/claude/spot3'); import propose
from PIL import Image
img = np.array(Image.open(f'/home/claude/spot3/src/{sys.argv[1]}.png').convert('RGB'))
for d in sorted(propose.detect(img), key=lambda d: (d[5], -d[4])):
    print(f'{d[5]:14} {d[4]:.2f}  {int(d[0])} {int(d[1])} {int(d[2])} {int(d[3])}')
