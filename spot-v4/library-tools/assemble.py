"""Build the site library spotlib-v5: the 15 approved pairs (spotlib-v4, s4-*) + every new pair that passed run/qc and
review (listed in accepted.txt as '<id>'), exported at 1600 px with credits and exact tap areas.
  python3 assemble.py   -> /home/claude/lamma/spotlib-v5"""
import json, os, shutil, sys, importlib.util, subprocess
sys.path.insert(0, '/home/claude/spot3'); from export import export
D = '/home/claude/lamma/spotlib-v5'; V4 = '/home/claude/lamma/spotlib-v4'
os.makedirs(D, exist_ok=True)
P = json.load(open(f'{V4}/pairs.json'))
for p in P:
    for k in ('a', 'b'): shutil.copy(f"{V4}/{p[k]}", f"{D}/{p[k]}")
for f in ('thumb_a.webp', 'thumb_b.webp'):
    if os.path.exists(f'{V4}/{f}'): shutil.copy(f'{V4}/{f}', f'{D}/{f}')
json.dump(P, open(f'{D}/pairs.json', 'w'), ensure_ascii=False, indent=1)
old = {c['id']: c for c in json.load(open('/home/claude/spot3/old/old46/old46.json'))}
cand = {c['id']: c for c in json.load(open('/home/claude/spot3/candidates.json'))}
def credit(i):
    if i in old: return old[i]['credit']
    c = cand[i]; return [c['artist'], c['page'], c['licence'], c['licence_url'] or '']
acc = [l.split()[0] for l in open('/home/claude/spot3/accepted.txt') if l.strip() and not l.startswith('#')]
for i in acc:
    sp = importlib.util.spec_from_file_location(i, f'/home/claude/spot3/manual/{i}.py'); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
    S = m.SPEC
    e = export(i, '/home/claude/spot3/lib', D, prefix='s5-', credit=credit(i), title=S['title'], kind=S.get('kind', 'photo'), level=S['level'])
    print(e['id'], e['level'], len(e['diffs']), e['title'])
print(subprocess.run(['python3', '/home/claude/lamma/tools/spotmask.py', D], capture_output=True, text=True).stdout[-300:])
P = json.load(open(f'{D}/pairs.json')); import collections
print(len(P), 'pairs', sorted(collections.Counter(p['level'] for p in P).items()))
