"""Check the spot-the-difference library as the live site serves it.
python tests/live_spot_library.py <site url> <local site dir> <report file>

- the catalog the site serves has exactly the expected pairs (60: 20 easy / 20 medium / 20 hard);
- every pair has 5 / 8 / 12 differences for its level and a source + licence credit;
- every picture the site serves (both images of every pair) is byte-identical to the tested build.
Exit 1 on any failure."""
import sys, json, hashlib, urllib.request, time

URL = sys.argv[1].rstrip('/') + '/'; SITE = sys.argv[2]; OUT = sys.argv[3]
NEED = {0: 5, 1: 8, 2: 12}
lines, bad = [], []


def get(path):
    for i in range(5):
        try:
            with urllib.request.urlopen(URL + path + f'?nc={int(time.time())}{i}', timeout=60) as r: return r.read()
        except Exception as e:
            err = e; time.sleep(5)
    raise err


def local(path): return open(f'{SITE}/{path}', 'rb').read()


idx = json.loads(get('spot/catalog/index.json'))
if json.loads(local('spot/catalog/index.json')) != idx: bad.append('catalog index differs from the tested build')
pairs = []
for sh in idx['shards']:
    pairs += json.loads(get('spot/catalog/' + sh['name']))
lv = {0: 0, 1: 0, 2: 0}; ndiff = 0; same = 0
for p in pairs:
    lv[p['l']] += 1; ndiff += len(p['d'])
    if len(p['d']) != NEED[p['l']]: bad.append(f"{p['id']}: {len(p['d'])} differences at level {p['l']}")
    c = p.get('c') or []      # [author, source page, licence, licence url]
    if len(c) < 3 or not str(c[1]).startswith('https://') or not c[2]: bad.append(f"{p['id']}: missing source or licence")
    for k in 'ab':
        f = f"spot/pairs/{p['id']}{k}.webp"
        if hashlib.sha256(get(f)).digest() == hashlib.sha256(local(f)).digest(): same += 1
        else: bad.append(f'{f} differs from the tested build')
lines += [f'site: {URL}', f"pairs served: {len(pairs)} (index total {idx['total']}), per level easy/medium/hard: {lv[0]}/{lv[1]}/{lv[2]}",
          f'differences: {ndiff}', f'pictures served identical to the tested build: {same} of {2 * len(pairs)}']
if len(pairs) != 60 or [lv[0], lv[1], lv[2]] != [20, 20, 20]: bad.append('expected 60 pairs, 20 per level')
lines.append('RESULT: ' + ('PASS' if not bad else 'FAIL ' + '; '.join(bad[:20])))
open(OUT, 'w').write('\n'.join(lines) + '\n'); print('\n'.join(lines))
sys.exit(1 if bad else 0)
