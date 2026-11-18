"""Give every pair of a library a scene group `g`, so the automatic choice never puts two similar scenes one after the other.
  python3 scene_groups.py <library folder>      (writes `g` into <library>/pairs.json and prints the groups)
g = "<kind>" or "<kind>|<place>": kind is a broad scene type from the Arabic title (harbour, market, interior, transport,
countryside, town); place is added when two pictures come from the same place: Commons file ids close together (the same
photographer's series) or near-identical thumbnails (difference hash)."""
import json, os, re, sys
from PIL import Image
D = sys.argv[1]; P = json.load(open(f'{D}/pairs.json'))
KIND = [('harbour', r'ميناء|مرفأ|قارب|قوارب|سفينة|شاطئ|الصيادين|عوامات|المنقذين|الشباك|البحيرة|القناة|النهر|الخليج'),
        ('market', r'سوق|بسطة|دكان|متجر|محل|سلال|صناديق الخضار|أكياس|كومة الفواكه|أوعية|أطباق|البيض|الحلويات|الأناناس'),
        ('transport', r'قطار|ترام|قاطرة|سيارة|محطة|حافلات|مطار|موقف'),
        ('interior', r'غرفة|مكتبة|قاعة|مطبخ|ورشة|رفّ|رف |خزانة|مكتب|المنشرة|مخزن|السقف المزخرف|الأريكة|المطالعة|الطعام'),
        ('countryside', r'كوخ|أكواخ|مزرعة|مرعى|مرج|حديقة|حدائق|طاحونة|مطحنة|حظيرة|خيمة|إسطبل|الغابة|الجبل|الثلج|البقرة|بقرة|الصبار|الورود|الزهور|البيت الزجاجي|ممرّ')]
def kind(t):
    for k, rx in KIND:
        if re.search(rx, t): return k
    return 'town'
def src(i): m = re.search(r'w(\d+)$', i); return int(m.group(1)) if m else None
def dh(p):
    im = Image.open(f"{D}/{p['a']}").convert('L').resize((17, 16), Image.LANCZOS); px = list(im.getdata())
    return sum(1 << k for k, (r, c) in enumerate((r, c) for r in range(16) for c in range(16)) if px[r * 17 + c] > px[r * 17 + c + 1])
H = {p['id']: dh(p) for p in P}
parent = {p['id']: p['id'] for p in P}
def find(x):
    while parent[x] != x: parent[x] = parent[parent[x]]; x = parent[x]
    return x
links = []
for i, p in enumerate(P):
    for q in P[i + 1:]:
        a, b = src(p['id']), src(q['id']); ham = bin(H[p['id']] ^ H[q['id']]).count('1')
        if (a and b and abs(a - b) <= 40) or ham <= 40:
            links.append((p['id'], q['id'], 'ids' if a and b and abs(a - b) <= 40 else f'dhash {ham}')); parent[find(p['id'])] = find(q['id'])
EXTRA = [('b1-w26767729', 'b2-w26382436'), ('b1-w89114423', 'b2-w89106661'), ('b1-w89114411', 'b2-w89106661')]   # same place (review notes)
for a, b in EXTRA:
    if a in parent and b in parent: parent[find(a)] = find(b); links.append((a, b, 'review'))
groups = {}
for p in P: groups.setdefault(find(p['id']), []).append(p['id'])
place = {i: f'p{n}' for n, (r, ids) in enumerate(sorted(groups.items())) if len(ids) > 1 for i in ids}
for p in P: p['g'] = kind(p['title']) + (('|' + place[p['id']]) if p['id'] in place else '')
json.dump(P, open(f'{D}/pairs.json', 'w'), ensure_ascii=False, indent=1)
import collections
print(collections.Counter(p['g'].split('|')[0] for p in P))
for a, b, why in links: print('same place:', a, b, why)
