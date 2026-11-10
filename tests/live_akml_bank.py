"""«أكملها»: which bank the live preview really serves, and how the game draws from it.
Opens the page (as a player would), loads the bank with the page's own akLoad(), and runs the page's own akOrder() over many
simulated matches: every section alone and together, every level and «تصاعدي», every answer method and the mix, the three
section orders. Checks: the number of questions, no question twice in a match, the section and the level kept, each question
fits its answer method, the match filled whenever the bank has enough. Usage: live_akml_bank.py URL OUTDIR [expected_count]"""
import json, os, sys, urllib.request
from playwright.sync_api import sync_playwright
URL, OUT = sys.argv[1], sys.argv[2]
WANT = int(sys.argv[3]) if len(sys.argv) > 3 else 0
os.makedirs(OUT, exist_ok=True)
JS = r'''async () => {
  const B = await akLoad(), R = {n:B.list.length, sec:{}, lv:{}, md:{}, fails:[], matches:0, checks:0};
  for (const q of B.list){ R.sec[q.s] = (R.sec[q.s] || 0) + 1; R.lv[q.l] = (R.lv[q.l] || 0) + 1; for (const m of q.md) R.md[m] = (R.md[m] || 0) + 1; }
  const SECS = AK_SECS.map(s => s[0]), bad = m => { if (R.fails.length < 50) R.fails.push(m); };
  const ok = (c, m) => { R.checks++; if (!c) bad(m); };
  const sets = [[]].concat(SECS.map(s => [s]), [["info", "lang"], ["gulf", "arab", "hikam"]]);
  for (const secs of sets) for (const dif of ["all", "0", "1", "2", "up"]) for (const m of ["c", "t", "b", "mx"]) for (const sw of ["turn", "rnd", "blk"]){
    const o = {secs, sw, dif, m, mix:["c", "t", "b"], first:"any"};
    for (const n of [10, 20, 30]){
      const ks = m === "mx" ? o.mix : [m], plan = Array.from({length:n}, (_, i) => akKind(ks[i % ks.length], o));
      const ids = akOrder(B, o, plan), got = ids.filter(Boolean), tag = JSON.stringify({secs, dif, m, sw, n});
      R.matches++;
      ok(new Set(got).size === got.length, tag + ": a question twice in one match");
      const S = secs.length ? secs : SECS;
      ok(got.every(id => S.includes(B.by[id].s)), tag + ": a question of another section");
      if (["0", "1", "2"].includes(dif)) ok(got.every(id => B.by[id].l === +dif), tag + ": level not kept");
      ok(ids.every((id, i) => !id || akFits(B.by[id], plan[i])), tag + ": a question that does not fit its answer method");
      const avail = akAvail(B, o);
      if (avail >= n * 1.5) ok(got.length === n, tag + `: only ${got.length} of ${n} although ${avail} fit`);
      if (!secs.length && sw === "turn" && dif === "all" && n >= 10) ok(new Set(got.map(id => B.by[id].s)).size >= Math.min(6, n), tag + ": sections not in turn");
    }
  }
  // the same device plays 15 matches in a row: questions just seen are not drawn again while unseen ones remain
  const o = {secs:[], sw:"turn", dif:"all", m:"c", mix:["c"], first:"any"}, seenAll = new Set(); let rep = 0;
  for (let k = 0; k < 15; k++){ const plan = Array.from({length:30}, () => akKind("c", o)); const got = akOrder(B, o, plan).filter(Boolean);
    got.forEach(id => { if (seenAll.has(id)) rep++; seenAll.add(id); }); seenAdd("lm-akseen", got, 5000); seenAdd("lm-aklast", got, 60); }
  R.repeatAcross15 = rep; R.distinctAcross15 = seenAll.size;
  return R;
}'''
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    pg.goto(URL, wait_until='load'); pg.wait_for_function('typeof akLoad === "function" && typeof akOrder === "function"', timeout=60000)
    pg.evaluate('() => { try { localStorage.removeItem("lm-akseen"); localStorage.removeItem("lm-aklast"); } catch(e){} }')
    R = pg.evaluate(JS); b.close()
# the bank file the page fetches, compared with the file in this commit
try:
    live = urllib.request.urlopen(URL.rstrip('/') + '/data/akml.json?nc=' + str(os.getpid()), timeout=60).read()
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'preview-akml', 'data', 'akml.json')
    R['bank_file_same_as_commit'] = os.path.exists(here) and open(here, 'rb').read() == live
except Exception as e:
    R['bank_file_same_as_commit'] = 'error: ' + str(e)
R['PASS'] = not R['fails'] and (not WANT or R['n'] == WANT) and R['bank_file_same_as_commit'] is True
json.dump(R, open(os.path.join(OUT, 'result.json'), 'w'), ensure_ascii=False, indent=1)
print('questions', R['n'], 'sections', R['sec'], 'levels', R['lv'], 'modes', R['md'])
print('matches', R['matches'], 'checks', R['checks'], 'repeats across 15 matches on one device', R['repeatAcross15'], 'distinct', R['distinctAcross15'])
print('bank file same as commit', R['bank_file_same_as_commit'])
for f in R['fails']: print('FAIL', f)
print(('PASS' if R['PASS'] else 'FAIL') + f" {R['checks'] - len(R['fails'])}/{R['checks']} passed")
sys.exit(0 if R['PASS'] else 1)
