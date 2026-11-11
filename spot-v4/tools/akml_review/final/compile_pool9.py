"""Batch 9 (replacement pool): merge drafts and independent reviews, resolve cross-section duplicates, run the mechanical checks, write batch2.json."""
import json, re, sys, collections
SP = '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad'
sys.path.insert(0, '/home/claude/lamma/tools'); import akml_bank as T
D = SP + '/batch9/'
items, skipped = [], []
import os
for sec in ['arab', 'info', 'info_c', 'lang', 'fun']:
    if not os.path.exists(D + f'draft_{sec}.json'): continue
    d = json.load(open(D + f'draft_{sec}.json')); r = {}
    r |= {x['id']: x for x in json.load(open(D + f'review_{sec}.json'))['reviews']}
    for it in d['items']:
        rv = r.get(it['id']) or {'verdict': 'reject', 'reason': 'لم يراجعه المراجع'}
        it = dict(it); it['review'] = rv
        if rv['verdict'] == 'fix':
            for k, v in (rv.get('fixes') or {}).items(): it[k] = v
        items.append(it)
    skipped += [{'sec': sec, 'text': s.get('text', ''), 'reason': s.get('reason', '')} for s in d.get('skipped', [])]
by = {x['id']: x for x in items}
# cross-section decisions (a verse or saying appears once in the whole bank)
override = {}
# my own read: «الوجد» in the text is the answer word of AK013 «من جدّ {وجد}» (same letters)
textfix = {'B9-L027': '«الجَوى» هو {الحُرقة} وشدّة الشوق من عشقٍ أو حزن'}
out = []
for it in items:   # my own read
    if it['id'] in textfix: it['text'] = textfix[it['id']]
for it in items:
    rv = it['review']
    st = 'rejected' if rv['verdict'] == 'reject' else 'accepted'
    reason = rv.get('reason', '') if st == 'rejected' else ''
    if it['id'] in override:
        st, reason = override[it['id']]
    out.append({k: it[k] for k in ('id', 'sec', 'lv', 'text', 'ans', 'alt', 'opts', 'why', 'src', 'ref', 'modes')} | {
        'status': st, 'reason': reason, 'fixed': rv.get('reason', '') if rv['verdict'] == 'fix' else '', 'verdict': rv['verdict'],
        'verified_by': rv.get('verified_by', ''), 'note': rv.get('note', ''), 'check': it.get('check', ''), 'batch': 9})
# mechanical checks against everything already prepared (the game's 60, batch 1 all statuses) and inside batch 2
ex = json.load(open('/home/claude/lamma/data/akml.src.json')); b1 = json.load(open(SP + '/batch1/batch1.json'))['items'] + json.load(open(SP + '/batch2/batch2.json'))['items'] + json.load(open(SP + '/batch3/batch3.json'))['items'] + json.load(open(SP + '/batch4/batch4.json'))['items'] + json.load(open(SP + '/batch5/batch5.json'))['items'] + json.load(open(SP + '/batch6/batch6.json'))['items'] + json.load(open(SP + '/batch7/batch7.json'))['items'] + json.load(open(SP + '/batch8/batch8.json'))['items']
seen = {T.norm(re.sub(r'[{}]', '', q['text'])): q['id'] for q in ex + b1}
toks = lambda t: set(T.bare(w) for w in T.norm(re.sub(r'[{}]', '', t)).split() if len(w) > 2)
pool = [(q['id'], toks(q['text'])) for q in ex + b1 if q.get('status', 'accepted') != 'rejected']
errs = 0
for o in out:
    if o['status'] != 'accepted': continue
    e = []
    m = re.fullmatch(r'(.*)\{(.+)\}(.*)', o['text'])
    if not m or o['text'].count('{') != 1: e.append('gap')
    elif T.norm(m.group(2)) != T.norm(o['ans']): e.append('gap!=ans')
    on = [T.norm(x) for x in o['opts']]
    if len(o['opts']) != 4 or on[0] != T.norm(o['ans']) or len(set(on)) != 4: e.append('opts')
    acc = {T.norm(o['ans'])} | {T.norm(a) for a in o['alt']}
    if any(x in acc for x in on[1:]): e.append('wrong option accepted')
    if len(o['why']) > 260: e.append('why long')
    k = T.norm(re.sub(r'[{}]', '', o['text']))
    if k in seen: e.append('same text as ' + seen[k])
    seen[k] = o['id']
    a = toks(o['text'])
    for pid, b in pool:
        if a and b and len(a & b) / min(len(a), len(b)) >= .6: e.append(f'close to {pid}')
    pool.append((o['id'], a))
    if e:
        errs += 1; print(o['id'], o['text'], e)
        if any(x.startswith(('gap', 'opts', 'wrong', 'same text')) for x in e):
            o['status'] = 'rejected'; o['reason'] = 'فحص آلي: ' + '، '.join(e)
c = collections.Counter((o['sec'], o['status']) for o in out)
print(sorted(c.items())); print('total', collections.Counter(o['status'] for o in out), 'skipped', len(skipped), 'flags', errs)
print('levels of accepted', collections.Counter(o['lv'] for o in out if o['status'] == 'accepted'))
json.dump({'batch': 9, 'items': out, 'skipped': skipped}, open(D + 'batch9.json', 'w'), ensure_ascii=False, indent=1)
