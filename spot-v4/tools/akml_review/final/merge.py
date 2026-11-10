"""Merge the special-case findings into one flags file read by the review page: the 25 held questions (my
recommendation), the questions that repeat another game, weak sources and questions that may have another right answer."""
import json, os, glob
D = os.path.dirname(os.path.abspath(__file__))
flags = {}
def add(id, cat, rec, why='', issue='', fix=None, other=''):
    f = flags.setdefault(id, {'cats': [], 'rec': rec, 'why': '', 'issue': '', 'fix': None, 'other': ''})
    if cat not in f['cats']: f['cats'].append(cat)
    order = {'reject': 3, 'reserve': 2, 'fix': 1, 'keep': 0}
    if order[rec] > order[f['rec']]: f['rec'] = rec; f['why'] = why or f['why']
    elif not f['why']: f['why'] = why
    if issue: f['issue'] = (f['issue'] + ' · ' if f['issue'] else '') + issue
    if fix: f['fix'] = {**(f['fix'] or {}), **fix}
    if other: f['other'] = other
for r in json.load(open(os.path.join(D, 'reserve_recs.json'))):
    add(r['id'], 'reserve', r['rec'], r['why'], r.get('issue', ''), r.get('fix'))
if os.path.exists(os.path.join(D, 'out_xgame.json')):
    for r in json.load(open(os.path.join(D, 'out_xgame.json'))):
        add(r['id'], 'xgame', r['rec'], r['why'], '', None, r.get('other', ''))
for f in sorted(glob.glob(os.path.join(D, 'out_g*.json'))):
    for r in json.load(open(f)):
        for c in r['cat']: add(r['id'], c, r['rec'], r.get('why', ''), r.get('issue', ''), r.get('fix'))
for k, v in json.load(open(os.path.join(D, 'mine.json'))).items():   # my own final read wins
    flags[k].update(v)
for f in flags.values():
    if not f['fix']: del f['fix']
json.dump(flags, open(os.path.join(D, 'flags.json'), 'w'), ensure_ascii=False, indent=0)
import collections
print(len(flags), collections.Counter(c for f in flags.values() for c in f['cats']), collections.Counter(f['rec'] for f in flags.values()))
