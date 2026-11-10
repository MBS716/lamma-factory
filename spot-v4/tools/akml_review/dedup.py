import json, re, sys, itertools, collections
SP='/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad'
sys.path.insert(0,'/home/claude/lamma/tools'); import akml_bank as T
ex=json.load(open('/home/claude/lamma/data/akml.src.json'))
items=[dict(q, batch=0, status='accepted') for q in ex]
for n in range(1,10):
    try: b=json.load(open(f'{SP}/batch{n}/batch{n}.json'))
    except FileNotFoundError: break
    items+=[dict(x,batch=n) for x in b['items'] if x['status']=='accepted']
plain=lambda t: T.norm(re.sub(r'[{}]','',t))
toks=lambda t: set(T.bare(w) for w in plain(t).split() if len(w)>2)
for q in items: q['_p']=plain(q['text']); q['_t']=toks(q['text']); q['_a']=T.norm(q['ans'])
pairs=[]
for a,b in itertools.combinations(items,2):
    if a['_p']==b['_p']: pairs.append(('SAME',a,b)); continue
    A,B=a['_t'],b['_t']
    if A and B:
        r=len(A&B)/min(len(A),len(B))
        if r>=.5 and (a['_a']==b['_a'] or r>=.7): pairs.append((f'{r:.2f}',a,b))
    # text contains another's full saying
    if len(a['_p'])>12 and len(b['_p'])>12 and (a['_p'] in b['_p'] or b['_p'] in a['_p']): pairs.append(('CONTAINS',a,b))
seen=set()
with open('pairs.txt','w') as f:
    for k,a,b in pairs:
        key=(a['id'],b['id'])
        if key in seen: continue
        seen.add(key)
        f.write(f"{k}\t{a['id']}\t{a['text']}\t[{a['ans']}]\n\t{b['id']}\t{b['text']}\t[{b['ans']}]\n")
print('items',len(items),'game',len(ex),'pairs',len(seen))
print(collections.Counter(q['sec'] for q in items))
# same answer clusters (for variety info)
ac=collections.Counter(q['_a'] for q in items); print('answers used >=4:',[(k,v) for k,v in ac.items() if v>=4][:30])
