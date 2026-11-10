"""أكملها: check the question bank and write the file the site loads.
python3 tools/akml_bank.py            -> data/akml.json (scrambled) + data/akml.report.json

The source is data/akml.src.json (readable, reviewed by people). Every item:
  id, sec, lv (0 easy, 1 medium, 2 hard), text (the phrase with the missing part in {braces}), ans, alt (accepted
  alternatives for typed answers), opts (4 options, the answer first), why (the meaning, short), src (source or reference),
  ref (where it was checked), modes (c choose, t type, b buzz).
The checks are mechanical only: they do not prove a proverb is authentic or its wording right (people review that)."""
import json, re, sys, base64, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, OUT, REP = (os.path.join(ROOT, 'data', f) for f in ('akml.src.json', 'akml.json', 'akml.report.json'))
# a preview bank (questions that passed internal review, not yet approved by the owner) is built to separate files and is
# only copied into a preview build (build.py with LAMMA_AKML_BANK); the game's own bank above is not touched:
#   python3 tools/akml_bank.py --src data/akml.preview.src.json --out data/akml.preview.json
if '--src' in sys.argv: SRC = os.path.join(ROOT, sys.argv[sys.argv.index('--src') + 1])
if '--out' in sys.argv:
    OUT = os.path.join(ROOT, sys.argv[sys.argv.index('--out') + 1]); REP = OUT.replace('.json', '.report.json')
SECS = ['gulf', 'arab', 'hikam', 'info', 'lang', 'fun']
KEY = b'lamma-akml-v1'


def norm(s):   # the same comparison as akNorm() in src/akml.js
    s = str(s or '')
    s = s.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'))
    s = re.sub(r'[ً-ٰٟـ]', '', s)
    s = re.sub('[أإآٱ]', 'ا', s).replace('ى', 'ي').replace('ة', 'ه').replace('ؤ', 'و').replace('ئ', 'ي')
    s = re.sub(r'[^ء-ي0-9a-zA-Z\s]', ' ', s)
    return re.sub(r'\s+', ' ', s).strip().lower()


def bare(s): return ''.join(w[2:] if len(w) > 3 and w.startswith('ال') else w for w in s.split(' '))


def main():
    B = json.load(open(SRC, encoding='utf-8'))
    errs, ids, texts = [], set(), {}
    for q in B:
        e = lambda m: errs.append(f"{q.get('id')}: {m}")
        for f in ('id', 'sec', 'lv', 'text', 'ans', 'alt', 'opts', 'why', 'src', 'modes'):
            if f not in q: e(f'missing {f}')
        if q['id'] in ids: e('duplicate id')
        ids.add(q['id'])
        if q['sec'] not in SECS: e('unknown section')
        if q['lv'] not in (0, 1, 2): e('level must be 0, 1 or 2')
        m = re.fullmatch(r'(.*)\{(.+)\}(.*)', q['text'])
        if not m or q['text'].count('{') != 1: e('the text needs exactly one {gap}')
        elif norm(m.group(2)) != norm(q['ans']): e('the gap is not the answer')
        if len(q['opts']) != 4: e('4 options needed')
        if norm(q['opts'][0]) != norm(q['ans']): e('the first option must be the answer')
        on = [norm(o) for o in q['opts']]
        if len(set(on)) != 4: e('options repeat')
        accepted = {norm(q['ans'])} | {norm(a) for a in q['alt']}
        if any(o in accepted or bare(o) in {bare(a) for a in accepted} for o in on[1:]): e('a wrong option is also an accepted answer')
        if not set(q['modes']) <= {'c', 't', 'b'} or not q['modes']: e('modes')
        if len(q['why']) > 260: e('the meaning is longer than 2-3 lines')
        if not q['src']: e('no source')
        key = norm(re.sub(r'[{}]', '', q['text']))
        if key in texts: e(f'same phrase as {texts[key]}')
        texts[key] = q['id']
    if errs:
        print('\n'.join(errs)); sys.exit(1)
    rows = [[q['id'], q['sec'], q['lv'], q['text'], q['ans'], q['alt'], q['opts'], q['why'], q['src'], ''.join(q['modes'])] for q in B]
    raw = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    enc = bytes(b ^ KEY[i % len(KEY)] for i, b in enumerate(raw))
    json.dump({'v': 1, 'd': base64.b64encode(enc).decode()}, open(OUT, 'w'), separators=(',', ':'))
    c = collections.Counter
    rep = {'total': len(B), 'by_section': dict(c(q['sec'] for q in B)), 'by_level': dict(c(q['lv'] for q in B)),
           'by_mode': {m: sum(m in q['modes'] for q in B) for m in 'ctb'},
           'section_level': {s: dict(c(q['lv'] for q in B if q['sec'] == s)) for s in SECS}}
    json.dump(rep, open(REP, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps(rep, ensure_ascii=False))


if __name__ == '__main__':
    main()
