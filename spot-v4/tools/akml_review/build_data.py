"""Builds data.json for the review page: every batch (all statuses) plus skipped phrases, with a flag when the same fact and
answer is already asked in the quiz or letters game, then assembles akml-review.html."""
import json, re, sys, glob, os
SP = '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad'
sys.path.insert(0, '/home/claude/lamma/tools'); import akml_bank as T
K = ('id','sec','lv','text','ans','alt','opts','why','src','ref','modes','status','reason','fixed','verdict','note','check')
quiz = json.load(open('/home/claude/lamma/data/quiz.json')); let = json.load(open('/home/claude/lamma/data/letters.json'))
toks = lambda t: set(T.bare(w) for w in T.norm(re.sub(r'[{}؟]', '', t)).split() if len(w) > 2)
O = [('سؤال الأسئلة العامة', q[2], q[3]) for q in quiz] + [('لعبة الحروف', q[3], q[4]) for q in let]
O = [(g, q, toks(q), T.norm(str(a))) for g, q, a in O]
def xgame(x):
    A, a = toks(x['text']), T.norm(x['ans'])
    for g, q, B, b in O:
        if a == b and A and B and len(A & B) / min(len(A), len(B)) >= .5: return f'{g}: {q}'
    return ''
items, sk = [], []
n = 1
while True:
    try: b = json.load(open(f'{SP}/batch{n}/batch{n}.json'))
    except FileNotFoundError: break
    for x in b['items']:
        d = {k: x.get(k, '') for k in K} | {'batch': n}
        if x['status'] == 'accepted': d['xgame'] = xgame(x)
        items.append(d)
    sk += [s | {'batch': n} for s in b['skipped']]
    n += 1
FL = SP + '/final2/flags.json'
flags = json.load(open(FL)) if os.path.exists(FL) else {}
for d in items:
    if d['id'] in flags: d['flag'] = flags[d['id']]
game = json.load(open('/home/claude/lamma/data/akml.src.json'))
ingame = {}
for q in game: ingame[q['sec']] = ingame.get(q['sec'], 0) + 1
data = {'items': items, 'skipped': sk, 'ingame': ingame,
        'targets': {'gulf': 200, 'arab': 300, 'hikam': 250, 'info': 800, 'lang': 550, 'fun': 400}}
json.dump(data, open('data.json', 'w'), ensure_ascii=False, separators=(',', ':'))
open('akml-review.html', 'w').write(open('head.html').read() + open('body.html').read().replace('/*DATA*/null', json.dumps(data, ensure_ascii=False, separators=(',', ':'))))
import collections
print(len(items), collections.Counter(x['status'] for x in items), 'xgame', sum(1 for x in items if x.get('xgame')), ingame)
