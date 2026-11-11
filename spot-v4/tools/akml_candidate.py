"""The candidate bank of «أكملها»: what the bank becomes if the owner follows the final review's recommendations, or his own
decisions where he has given them (an exported review file). Nothing here is approved by itself: the owner approves.

  game's 60 + every question that passed internal review (batches 1–9)
  − questions recommended for rejection (most repeat a fact asked in another game of the platform)
  + the small recommended fixes applied (an alternative answer, typing dropped, «يُنسب», a clearer wording)
  questions held for the owner (reserve) stay out unless he approves them.

With --decisions FILE (the review page's full export) the owner's decision wins over the recommendation:
  "no" → out; "ok" → in, as it is; "okfix" → in, with the recommended fix; "edit" → in, as it is, listed for editing.

usage: akml_candidate.py --batches DIR --flags flags.json --out SRC.json [--decisions export.json] [--report report.json]"""
import json, os, sys, glob, re, collections
arg = lambda k, d=None: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else d
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = ('id', 'sec', 'lv', 'text', 'ans', 'alt', 'opts', 'why', 'src', 'ref', 'modes')
flags = json.load(open(arg('--flags')))
dec = json.load(open(arg('--decisions')))['decisions'] if arg('--decisions') else {}
game = json.load(open(os.path.join(ROOT, 'data', 'akml.src.json'), encoding='utf-8'))
files = sorted(glob.glob(os.path.join(arg('--batches'), 'batch*/batch*.json')) or glob.glob(os.path.join(arg('--batches'), 'akml.batch*.json')),
               key=lambda f: int(re.search(r'batch(\d+)\.json$', f).group(1)))
items = [dict(q, status='accepted', batch=0) for q in game]
for f in files:
    n = int(re.search(r'batch(\d+)\.json$', f).group(1))
    items += [dict(x, batch=n) for x in json.load(open(f, encoding='utf-8'))['items'] if x['status'] in ('accepted', 'reserve')]
out, why = [], collections.Counter()
for x in items:
    fl, d = flags.get(x['id']) or {}, (dec.get(x['id']) or {}).get('d', '')
    rec = fl.get('rec', 'keep')
    if d == 'no': why['out: the owner rejected'] += 1; continue
    if not d:
        if x['status'] == 'reserve' and rec in ('reserve', 'reject'): why['out: held for the owner, recommended ' + ('for rejection' if rec == 'reject' else 'his decision')] += 1; continue
        if rec == 'reject': why['out: recommended for rejection'] += 1; continue
    q = {k: x[k] for k in F if k in x}
    fix = fl.get('fix') or {}
    if fix and (d == 'okfix' or (not d and rec == 'fix')):
        for k, v in fix.items(): q[k] = list(v) if k in ('modes', 'alt', 'opts') else v
        why['in: with the recommended fix'] += 1
    else: why['in' + (': the owner approved' if d else '')] += 1
    out.append(q)
json.dump(out, open(arg('--out'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
rep = {'total': len(out), 'by_section': dict(collections.Counter(q['sec'] for q in out)), 'by_level': dict(collections.Counter(q['lv'] for q in out)), 'how': dict(why), 'owner_decisions': len(dec)}
if arg('--report'): json.dump(rep, open(arg('--report'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps(rep, ensure_ascii=False))
