"""Assemble the preview bank source: the game's own questions plus every question that passed internal review in the
batches (data/akml.batchN.json). Writes data/akml.preview.src.json; the game's bank (data/akml.src.json) is not changed.
Owner decisions (an exported review file) can be applied with --decisions FILE: rejected questions are left out."""
import json, os, sys, glob, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BATCHES = sys.argv[sys.argv.index('--batches') + 1] if '--batches' in sys.argv else os.path.join(ROOT, 'data')
F = ('id', 'sec', 'lv', 'text', 'ans', 'alt', 'opts', 'why', 'src', 'ref', 'modes')
game = json.load(open(os.path.join(ROOT, 'data', 'akml.src.json'), encoding='utf-8'))
dec = {}
if '--decisions' in sys.argv: dec = json.load(open(sys.argv[sys.argv.index('--decisions') + 1]))['decisions']
out = [{k: q[k] for k in F if k in q} for q in game]
files = sorted(glob.glob(os.path.join(BATCHES, 'akml.batch*.json')) or glob.glob(os.path.join(BATCHES, 'batch*/batch*.json')),
               key=lambda f: int(re.search(r'batch(\d+)\.json$', f).group(1)))
for f in files:
    for x in json.load(open(f, encoding='utf-8'))['items']:
        if x['status'] == 'accepted' and (dec.get(x['id']) or {}).get('d') != 'no':
            out.append({k: x[k] for k in F})
json.dump(out, open(os.path.join(ROOT, 'data', 'akml.preview.src.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'questions from', len(files), 'batch files + the game')
