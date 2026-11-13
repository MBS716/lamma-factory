"""The 30-pair pilot -> a CANDIDATE library (never the approved bank) and the owner's review page data.
  python3 pilot_build.py OUT  -> OUT/spotlib-pilot (pairs.json + images at 1600 px, exact tap areas)
                                 OUT/page (pilot.json + a/b/rev images for the review page, 1200 px)"""
import json, os, sys, importlib.util, subprocess, shutil
from PIL import Image
sys.path.insert(0, '/home/claude/spot3'); from export import export
OUT = sys.argv[1]; LIB = f'{OUT}/spotlib-pilot'; PG = f'{OUT}/page'
for d in (LIB, f'{PG}/img'): os.makedirs(d, exist_ok=True)
if os.path.exists(f'{LIB}/pairs.json'): os.remove(f'{LIB}/pairs.json')
cand = {c['id']: c for c in json.load(open('/home/claude/spot3/candidates.json'))}
ids = []
for lv in ('easy', 'medium', 'hard'): ids += [l.split()[0] for l in open(f'/home/claude/spot3/pilot_{lv}_done.txt') if l.strip()]
rej = {l.split()[0] for l in open('/home/claude/spot3/pilot_review_rejected.txt') if l.strip()}
ids = [i for i in ids if i not in rej]
ld = lambda f: json.load(open(f)) if os.path.exists(f) else {}
R4all = ld('/home/claude/spot3/pilot_review4.json')
ROUNDS = [ld('/home/claude/spot3/pilot_review.json'), ld('/home/claude/spot3/pilot_review2.json'), ld('/home/claude/spot3/pilot_review3.json'), R4all.get('quality', {}), ld('/home/claude/spot3/pilot_review5.json')]
FIX = {}
for n, f in enumerate(['pilot_fixes.txt', 'pilot_fixes2.txt', 'pilot_fixes3.txt', 'pilot_fixes4.txt'], 1):
    if os.path.exists('/home/claude/spot3/' + f):
        for l in open('/home/claude/spot3/' + f, encoding='utf-8'):
            if l.strip(): FIX.setdefault(l.split()[0], []).append({'round': n, 'text': l.split(' ', 1)[1].strip()})
CROP = {'w52071480'}
def spec(i):
    sp = importlib.util.spec_from_file_location(i, f'/home/claude/spot3/manual/{i}.py'); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m); return m.SPEC
def qc(i):
    r = subprocess.run(['python3', '/home/claude/spot3/qc.py', i], capture_output=True, text=True).stdout.strip().splitlines()
    return r[-1] if r else ''
# what the owner should weigh himself (content of the ORIGINAL photo, not an edit)
FLAG = {'w73745961': 'قرار المحتوى: زجاجة داكنة بلا ملصق على طاولة مطبخ تاريخي في متحف، لا تُعدّل. جرّبت إزالتها من الصورتين فترك ذلك أثرًا ضبابيًا عند التكبير، فأبقيت الصورة الأصلية حفاظًا على جودتها. المراجع المستقل: مناسبة. القرار لك إن أردت استبعادها.',
        'w69344105': 'قرار المحتوى: اسم المقهى الحقيقي ظاهر على اللافتة وزجاج الباب، وهو جزء عادي من صورة شارع وليس إعلانًا. الرخصة CC BY-SA 4.0 تغطي الصورة، والاسم لا يُعدّل. المراجع المستقل: مناسبة.',
        'w52071480': 'قرار المحتوى: قُصّ الطرفان الأيسر والأيمن من الصورة الأصلية لإخراج ألعاب الشخصيات التجارية وعلبة الدمية وألعاب المسدسات، وأُعيد إعداد الاختلافات للصورة الجديدة. ذُكر القص في بيانات حقوق الصورة.'}
page = []
for i in ids:
    S = spec(i); c = cand[i]; cr = [c['artist'], c['page'], c['licence'], c.get('licence_url') or '']
    e = export(i, '/home/claude/spot3/lib', LIB, prefix='p1-', credit=cr, title=S['title'], kind=S.get('kind', 'photo'), level=S['level'])
    for k in ('a', 'b'):
        im = Image.open(f'{LIB}/{e[k]}'); im.thumbnail((1200, 1200), Image.LANCZOS); im.save(f'{PG}/img/{i}{k}.webp', quality=82, method=6)
    rv = Image.open(f'/home/claude/spot3/out/rev_{i}.jpg').convert('RGB'); rv.thumbnail((1200, 1200), Image.LANCZOS); rv.save(f'{PG}/img/{i}r.webp', quality=82, method=6)
    w, h = Image.open(f'{PG}/img/{i}a.webp').size
    hist = [{'round': n + 1, 'verdict': R[i]['verdict'], 'notes': R[i].get('notes', ''), 'level_ok': R[i].get('level_ok')} for n, R in enumerate(ROUNDS) if i in R]
    review = dict(ROUNDS[hist[-1]['round'] - 1][i]); rounds = len(hist)
    indep = R4all.get('independence', {}).get(i, ''); content = (ROUNDS[4].get(i, {}) or {}).get('content') or R4all.get('content', {}).get(i, '')
    if i in CROP:
        P_ = json.load(open(f'{LIB}/pairs.json'))
        for x in P_:
            if x['id'] == e['id']: x['crop'] = True
        json.dump(P_, open(f'{LIB}/pairs.json', 'w'), ensure_ascii=False, indent=1)
    page.append({'id': i, 'level': S['level'], 'title': S['title'], 'kind': S.get('kind', 'photo'), 'credit': cr, 'diffs': [d['name'] for d in S['diffs']],
                 'qc': qc(i), 'review': review, 'rounds': rounds, 'history': hist, 'fixes': FIX.get(i, []), 'independence': indep, 'content': content, 'source': {'page': c['page'], 'licence': c['licence'], 'artist': c['artist']}, 'flag': FLAG.get(i, ''), 'a': f'img/{i}a.webp', 'b': f'img/{i}b.webp', 'rev': f'img/{i}r.webp', 'w': w, 'h': h})
    print(i, S['level'], S['title'], page[-1]['qc'][:60], (review or {}).get('verdict'))
print(subprocess.run(['python3', '/home/claude/lamma/tools/spotmask.py', LIB], capture_output=True, text=True).stdout[-300:])
json.dump(page, open(f'{PG}/pilot.json', 'w'), ensure_ascii=False, indent=1)
print(len(page), 'pairs')
