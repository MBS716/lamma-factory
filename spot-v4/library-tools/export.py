"""Export a reviewed pair from a kit2 lib (full resolution) into a site spot library at 1600 px wide (pairs.json entry)."""
import json, os, sys
from PIL import Image
def export(pid, lib, dst, prefix='s4-', credit=None, title=None, kind=None, level=None, W=1600):
    L = json.load(open(f'{lib}/{pid}.json'))
    pj = f'{dst}/pairs.json'; P = json.load(open(pj)) if os.path.exists(pj) else []
    old = next((p for p in P if p['id'] == prefix + pid), None)
    a = Image.open(f'{lib}/{pid}a.webp').convert('RGB'); b = Image.open(f'{lib}/{pid}b.webp').convert('RGB'); s = W / a.size[0]
    H = round(a.size[1] * s)
    for k, im in (('a', a), ('b', b)): im.resize((W, H), Image.LANCZOS).save(f'{dst}/{prefix}{pid}{k}.webp', quality=90, method=6)
    e = {'id': prefix + pid, 'a': f'{prefix}{pid}a.webp', 'b': f'{prefix}{pid}b.webp', 'w': W, 'h': H,
         'level': level if level is not None else L['level'], 'title': title or L.get('title') or (old or {}).get('title'), 'kind': kind or L.get('kind') or (old or {}).get('kind', 'photo'),
         'credit': credit or (old or {}).get('credit'),
         'diffs': [{'x': round(d['x'] * s), 'y': round(d['y'] * s), 'rx': max(14, round(d['rx'] * s)), 'ry': max(14, round(d['ry'] * s))} for d in L['diffs']],
         'notes': [d['name'] for d in L['diffs']]}
    P = [p for p in P if p['id'] != e['id']] + [e]
    json.dump(P, open(pj, 'w'), ensure_ascii=False, indent=1)
    return e
if __name__ == '__main__':
    print(export(sys.argv[1], sys.argv[2], sys.argv[3])['id'])
