import json,re,sys,collections
sys.path.insert(0,'/home/claude/lamma/tools'); import akml_bank as T
SP='/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad'
quiz=json.load(open('/home/claude/lamma/data/quiz.json')); let=json.load(open('/home/claude/lamma/data/letters.json'))
others=[('quiz',q[2],q[3]) for q in quiz]+[('letters',q[3],q[4]) for q in let]
toks=lambda t: set(T.bare(w) for w in T.norm(re.sub(r'[{}؟]','',t)).split() if len(w)>2)
O=[(g,q,a,toks(q),T.norm(str(a))) for g,q,a in others]
items=[]
for n in range(1,10):
    try: items+=[x for x in json.load(open(f'{SP}/batch{n}/batch{n}.json'))['items'] if x['status']=='accepted']
    except FileNotFoundError: break
items+=json.load(open('/home/claude/lamma/data/akml.src.json'))
TH=float(sys.argv[1]); hits=[]
for x in items:
    A=toks(x['text']); a=T.norm(x['ans'])
    for g,q,ans,B,b in O:
        if a==b and A and B and len(A&B)/min(len(A),len(B))>=TH: hits.append((x['id'],x['text'],g,q,ans))
open('cross.txt','w').write('\n'.join(f'{h[0]}\t{h[1]}\n\t{h[2]}: {h[3]} [{h[4]}]' for h in hits))
print(len(hits), len({h[0] for h in hits}), collections.Counter(h[0].split('-')[1][0] if '-' in h[0] else 'AK' for h in hits))
