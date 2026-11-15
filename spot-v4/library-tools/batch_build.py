"""One production batch -> a CANDIDATE library (never the approved bank) and the review page's data.
  python3 batch_build.py <batch> <out>
Reads /home/claude/spot3/batches/<batch>/: {easy,medium,hard}_done.txt (accepted ids), rejected.txt (ids the review rejected),
review<N>.json (independent review rounds: {"<id>": {"verdict", "notes", "level_ok", "independent", "content"}}),
fixes<N>.txt ("<id> fixed: …" / "<id> still: …"), crop.txt (ids whose source was cropped), notes_ar.json (Arabic summary per id).
Writes <out>/lib (pairs.json + 1600 px images, exact tap areas, ids <batch>-<source id>) and <out>/page (<batch>.json + images
for the review page: the original and the changed picture at 1000 px; the page draws the numbered circles itself)."""
import json, os, sys, importlib.util, subprocess, glob, re
from PIL import Image
sys.path.insert(0, '/home/claude/spot3'); from export import export
B, OUT = sys.argv[1], sys.argv[2]; BD = f'/home/claude/spot3/batches/{B}'
LIB, PG = f'{OUT}/lib', f'{OUT}/page'
for d in (LIB, f'{PG}/img'): os.makedirs(d, exist_ok=True)
if os.path.exists(f'{LIB}/pairs.json'): os.remove(f'{LIB}/pairs.json')
cand = {}
for f in ('/home/claude/spot3/cand2/candidates.json', '/home/claude/spot3/candidates.json'):
    if os.path.exists(f): cand.update({c['id']: c for c in json.load(open(f))})
rd = lambda f: [l.split()[0] for l in open(f, encoding='utf-8') if l.strip() and not l.startswith('#')] if os.path.exists(f) else []
rej = set(rd(f'{BD}/rejected.txt')); crop = set(rd(f'{BD}/crop.txt'))
ids = [i for lv in ('easy', 'medium', 'hard') for i in rd(f'{BD}/{lv}_done.txt') if i not in rej]
ROUNDS = [json.load(open(f)) for f in sorted(glob.glob(f'{BD}/review*.json'), key=lambda f: int(re.findall(r'(\d+)\.json$', f)[0]))]
FIX = {}
for f in sorted(glob.glob(f'{BD}/fixes*.txt'), key=lambda f: int(re.findall(r'(\d+)\.txt$', f)[0])):
    n = int(re.findall(r'(\d+)\.txt$', f)[0])
    for l in open(f, encoding='utf-8'):
        if l.strip(): FIX.setdefault(l.split()[0], []).append({'round': n, 'text': l.split(' ', 1)[1].strip()})
AR = json.load(open(f'{BD}/notes_ar.json')) if os.path.exists(f'{BD}/notes_ar.json') else {}
def spec(i):
    sp = importlib.util.spec_from_file_location(i, f'/home/claude/spot3/manual/{i}.py'); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m.SPEC
def qc(i):
    r = subprocess.run(['python3', '/home/claude/spot3/qc.py', i], capture_output=True, text=True).stdout.strip().splitlines()
    return r[-1] if r else ''
page = []
for i in ids:
    S = spec(i); c = cand[i]; cr = [c['artist'], c['page'], c['licence'], c.get('licence_url') or '']
    e = export(i, '/home/claude/spot3/lib', LIB, prefix=f'{B}-', credit=cr, title=S['title'], kind=S.get('kind', 'photo'), level=S['level'])
    sc = 1000 / e['w']
    for k in ('a', 'b'):
        im = Image.open(f'{LIB}/{e[k]}'); im = im.resize((1000, round(im.size[1] * sc)), Image.LANCZOS); im.save(f'{PG}/img/{i}{k}.webp', quality=80, method=6)
    hist = [{'round': n + 1, 'verdict': R[i]['verdict'], 'notes': R[i].get('notes', ''), 'level_ok': R[i].get('level_ok')} for n, R in enumerate(ROUNDS) if i in R]
    last = next((R[i] for R in reversed(ROUNDS) if i in R), {})
    ops = [d['op'] for d in S['diffs']]
    page.append({'id': f'{B}-{i}', 'src': i, 'batch': B, 'level': S['level'], 'title': S['title'], 'kind': S.get('kind', 'photo'), 'credit': cr, 'crop': i in crop,
                 'diffs': [d['name'] for d in S['diffs']], 'circles': [[round(d['x'] * sc), round(d['y'] * sc), round(d['rx'] * sc), round(d['ry'] * sc)] for d in e['diffs']],
                 'colour_share': round(sum(o == 'recolor' for o in ops) / len(ops), 2), 'ops': {o: ops.count(o) for o in sorted(set(ops))},
                 'qc': qc(i), 'review': {**last, 'ar': AR.get(i, '')}, 'rounds': len(hist), 'history': hist, 'fixes': FIX.get(i, []),
                 'source': {'page': c['page'], 'licence': c['licence'], 'artist': c['artist']},
                 'a': f'img/{i}a.webp', 'b': f'img/{i}b.webp', 'w': 1000, 'h': round(e['h'] * sc)})
    print(i, S['level'], S['title'], page[-1]['qc'][:50], last.get('verdict'), flush=True)
if crop:
    P = json.load(open(f'{LIB}/pairs.json'))
    for x in P:
        if x['id'][len(B) + 1:] in crop: x['crop'] = True
    json.dump(P, open(f'{LIB}/pairs.json', 'w'), ensure_ascii=False, indent=1)
print(subprocess.run(['python3', '/home/claude/wt5/spot-v4/tools/spotmask.py', LIB], capture_output=True, text=True).stdout[-200:])
json.dump(page, open(f'{PG}/{B}.json', 'w'), ensure_ascii=False, indent=1)
print(len(page), 'pairs')
