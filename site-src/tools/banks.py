"""Validate and merge the question banks.

  python tools/banks.py <content_dir>      reads <content_dir>/quiz/*.json and <content_dir>/letters/*.json
                                           writes data/quiz.json, data/letters.json and data/banks_report.json

Checks (an item failing any of them is dropped and listed in the report):
  quiz     7 fields; level 0-2; known category; 4 distinct non-empty options; question ends with ؟;
           no exact or near-duplicate question (same normalised text, or same answer + very similar wording)
  letters  5 fields; known letter; level 0-2; answer starts with the letter (after removing a leading ال,
           with أ إ آ counted as ا); no duplicate answer inside a letter; no near-duplicate question
"""
import json, glob, os, re, sys, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATS = {"gen", "geo", "sci", "spo", "his", "sau", "lit", "tec"}
LCATS = CATS | {"ani", "food", "name", "obj"}
ALPHA = "ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي".split()
DIAC = re.compile(r"[ً-ْٰـ]")

def norm(t):
    t = DIAC.sub("", str(t)).strip()
    t = re.sub("[أإآٱ]", "ا", t).replace("ة", "ه").replace("ى", "ي").replace("ؤ", "و").replace("ئ", "ي")
    t = re.sub(r"[^\w\s+#]", " ", t)
    return " ".join(w[2:] if w.startswith("ال") and len(w) > 3 else w for w in t.split())

def first_letter(ans):
    a = DIAC.sub("", ans.strip()).lstrip("«\"'(")
    if a.startswith("ال") and len(a) > 2: a = a[2:]
    a = re.sub("^[أإآٱ]", "ا", a)
    return a[:1]

def jacc(a, b):
    A, B = set(a.split()), set(b.split())
    num = lambda S: {w for w in S if re.search(r"\d", w)}
    if num(A) != num(B): return 0.0          # "World Cup 1982" and "World Cup 2022" are different questions
    return len(A & B) / max(1, len(A | B))

def load(pattern):
    items = []
    for f in sorted(glob.glob(pattern)):
        try: data = json.load(open(f, encoding="utf-8"))
        except Exception as e: print("cannot read", f, e); continue
        items += [(os.path.basename(f), x) for x in data]
    return items

def quiz(items):
    keep, bad, seen = [], [], {}
    by_ans = collections.defaultdict(list)
    for src, q in items:
        why = ""
        if not (isinstance(q, list) and len(q) == 7): why = "shape"
        else:
            c, l, text, *opts = q
            opts = [str(o).strip() for o in opts]
            if c not in CATS: why = "category"
            elif l not in (0, 1, 2): why = "level"
            elif not text or len(text) > 140: why = "question length"
            elif any(not o for o in opts) or len({norm(o) for o in opts}) < 4: why = "options not distinct"
            else:
                n = norm(text)
                if n in seen: why = "duplicate"
                else:
                    a = norm(opts[0])
                    if any(jacc(n, m) >= 0.7 for m in by_ans[a]): why = "near duplicate"
        if why: bad.append([src, why, q]); continue
        text = q[2].strip()
        if not text.endswith("؟"): text = text.rstrip("?.") + "؟"
        item = [q[0], q[1], text] + [str(o).strip() for o in q[3:]]
        seen[norm(text)] = 1; by_ans[norm(item[3])].append(norm(text)); keep.append(item)
    return keep, bad

def letters(items):
    keep, bad, seenq, seena = [], [], set(), set()
    for src, q in items:
        why = ""
        if not (isinstance(q, list) and len(q) == 5): why = "shape"
        else:
            L, l, c, text, ans = q
            if L not in ALPHA: why = "letter"
            elif l not in (0, 1, 2): why = "level"
            elif c not in LCATS: why = "category"
            elif not text or not ans or len(text) > 110: why = "length"
            elif first_letter(ans) != L: why = "answer does not start with the letter"
            elif norm(text) in seenq: why = "duplicate question"
            elif (L, norm(ans)) in seena and any(jacc(norm(text), norm(k[3])) >= 0.5 for k in keep if k[0] == L and norm(k[4]) == norm(ans)): why = "near duplicate"
        if why: bad.append([src, why, q]); continue
        seenq.add(norm(q[3])); seena.add((q[0], norm(q[4])))
        keep.append([q[0], q[1], q[2], q[3].strip(), q[4].strip()])
    return keep, bad

def main():
    src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "content")
    os.makedirs(os.path.join(ROOT, "data"), exist_ok=True)
    qk, qb = quiz(load(os.path.join(src, "quiz", "*.json")))
    lk, lb = letters(load(os.path.join(src, "letters", "part*.json")))
    for name, data in (("quiz", qk), ("letters", lk)):
        if data: json.dump(data, open(os.path.join(ROOT, "data", name + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    rep = {
        "quiz": {"kept": len(qk), "dropped": len(qb), "by_category": dict(collections.Counter(q[0] for q in qk)),
                 "by_level": dict(collections.Counter(q[1] for q in qk)), "drops": qb},
        "letters": {"kept": len(lk), "dropped": len(lb), "by_letter": {L: sum(q[0] == L for q in lk) for L in ALPHA},
                    "by_level": dict(collections.Counter(q[1] for q in lk)), "drops": lb},
    }
    json.dump(rep, open(os.path.join(ROOT, "data", "banks_report.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: {x: y for x, y in v.items() if x != "drops"} for k, v in rep.items()}, ensure_ascii=False))
    for k in ("quiz", "letters"):
        for d in rep[k]["drops"][:40]: print(k, d[0], d[1], json.dumps(d[2], ensure_ascii=False)[:120])

if __name__ == "__main__": main()
