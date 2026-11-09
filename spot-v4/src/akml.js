/* ================= أكملها: complete the phrase (v2) =================
   Three settings that do not depend on each other:
   1. the competition (o.sys): every player for himself ("solo") or two teams ("team"; green and orange, the host places
      the players by hand or lets the device balance them; nobody changes team during a match except by the host);
   2. the answer method (o.m), one of seven:
        c  «اختيار من أربعة»   every player picks one of 4 options on his phone
        t  «إكمال مباشر»        every player types the missing part
        b  «أسرع إصبع»          the first to press «أعرف الإجابة» gets the turn; only he answers (typed or aloud)
        s  «اقتنص الفرصة»      everybody answers; the first right answer ends the question for all
        tt «تحدي الفرق»         the teams take turns; one member of the team on turn answers (teams only)
        +  «سرقة الإجابة»       a rule of the team turns (tt, and b with teams): a wrong answer passes the chance to the other team
        mx «تحدي مختلط»         the method changes from question to question, in turn, among the methods the host picks
   3. when answering closes (the lock): "all" everybody answers until the time ends or all have answered (c, t);
      "first" the first right answer closes the question (c, t, and always s); "turn" only the player on turn (b, tt).
   Combinations that make no sense are never offered: tt and the steal rule need teams, the lock is chosen only for c and t.
   Secrets: the bank (data/akml.json) is a public file of the site, its answers only scrambled (anyone who reads the site's
   code can read them; protecting them would need a server, none is used). In the room (readable by every phone) a
   question carries only the phrase with its gap (and the 4 options when there are options); which is right, the answer
   and the meaning stay on the host's device until the question closes. Each phone's answer travels sealed for the host,
   so the other phones never read it. Points are counted on the host's device only; a phone sends answers, never points. */
const AK_SECS = [["gulf","أمثال سعودية وخليجية"],["arab","أمثال عربية"],["hikam","حكم وأقوال"],["info","معلومات عامة"],["lang","لغة وأدب"],["fun","عبارات طريفة"]];
const AK_M = {c:"اختيار من أربعة", t:"إكمال مباشر", b:"أسرع إصبع", s:"اقتنص الفرصة", tt:"تحدي الفرق", mx:"تحدي مختلط"};
const AK_MDESC = {
  c:"يظهر السؤال للجميع مع أربعة خيارات، وكل لاعب يختار من جواله.",
  t:"يظهر السؤال للجميع دون خيارات، وكل لاعب يكتب الجزء الناقص مرة واحدة.",
  b:"أول من يضغط «أعرف الإجابة» يأخذ الدور، ولا يجيب غيره. إن أخطأ انتقل الدور للتالي في الترتيب.",
  s:"يجيب الجميع، وأول إجابة صحيحة تُعتمد تُنهي السؤال على الجميع. لكل لاعب محاولة واحدة.",
  tt:"يتناوب الفريقان: في كل سؤال يجيب عضو من الفريق صاحب الدور، ويتناوب الأعضاء.",
  mx:"يتغير نمط الإجابة من سؤال لآخر بالتناوب بين الأنماط التي تختارها، بأعداد متقاربة."};
const AK_LOCK = {all:"الجميع يجيب", first:"أول إجابة صحيحة", turn:"صاحب الدور فقط"};
const AK_INP = {c:"اختيار من أربعة", t:"كتابة", o:"شفهيًا ويحكم المقدّم"};
const AK_LEAD = 3000;          // ms between sending a question and the start of its clock (every phone has it on screen)
const AK_TURN = 15;            // default seconds for the player on turn in «أسرع إصبع» (the host can choose 10–30)
const AK_DRAIN = 150;          // ms: answers and presses are ordered by the moment they reached the host, a moment after they arrive
const AK_AUTO = 8;             // seconds on the answer before the next question (automatic mode)
const AK_FAST_T = 6;           // seconds of a speed challenge question
const AK_PTS = {ok:100, fast:50, fastX:100, first:50, win:100};
const akSecName = c => (AK_SECS.find(x => x[0] === c) || [, ""])[1];
const AK_DIG = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
/* how a typed answer is compared. Only differences of spelling that never change the word are ignored: diacritics and
   tatweel, the forms of alif with hamza (أ إ آ ٱ), ى/ي, ة/ه, ؤ/و, ئ/ي, punctuation, extra spaces, Arabic-Indic digits.
   «ال» is NOT removed: an answer with or without «ال» where the bank does not list it goes to the host. */
function akNorm(s){
  return AK_DIG(s).replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^ء-ي0-9a-zA-Z\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
function akLev(a, b){
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = range(b.length + 1);
  for (let i = 1; i <= a.length; i++){ const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}
/* "ok": the answer or an approved alternative of the bank; "no": anything else, including another option of the question;
   "?": the host decides (never accepted by guess): the answer with or without «ال», or one letter away from it
   (two letters for answers of 8 letters or more) */
function akCheck(it, raw){
  const x = akNorm(raw); if (!x) return "no";
  const acc = [it.a, ...it.alt].map(akNorm).filter(Boolean);
  if (acc.includes(x)) return "ok";
  const wrong = it.o.map(akNorm).filter(w => w && !acc.includes(w));
  if (wrong.includes(x)) return "no";
  const al = w => w.startsWith("ال") ? w.slice(2) : "ال" + w, sq = w => w.replace(/ /g, "");
  for (const a of acc){
    if (al(a) === x) return "?";
    const d = akLev(sq(x), sq(a)), L = sq(a).length;
    if ((d === 1 && L >= 4) || (d === 2 && L >= 8)) return "?";
  }
  return "no";
}
const akIsOpt = (it, raw) => it.o.slice(1).map(akNorm).includes(akNorm(raw));
// the value of an answer: the host's decision (final once given), else the device's check ("?" while nobody decided)
const akVal = (a, und) => a.x != null && H.priv.dec[akNorm(a.x)] ? H.priv.dec[akNorm(a.x)] : a.v === "?" ? und : a.v;
/* the bank: {"v":1,"d":"<base64>"}, the items scrambled with a fixed key (not a protection: the key is in the site's code) */
let AK_BANK = null, AK_WAIT = null;
function akDecode(j){
  const k = new TextEncoder().encode("lamma-akml-v1"), u = Uint8Array.from(atob(j.d), c => c.charCodeAt(0));
  for (let i = 0; i < u.length; i++) u[i] ^= k[i % k.length];
  const items = JSON.parse(new TextDecoder().decode(u)), by = {};
  // [id, sec, lv, text with {gap}, answer, [alternatives], [4 options, the answer first], meaning, source, modes]
  const list = items.map(r => { const t = String(r[3]), m = t.match(/^(.*)\{(.+)\}(.*)$/);
    return by[r[0]] = {id:r[0], s:r[1], l:r[2], t, pre:m ? m[1] : t, gap:m ? m[2] : "", post:m ? m[3] : "", a:r[4], alt:r[5] || [], o:r[6] || [], why:r[7] || "", src:r[8] || "", md:r[9] || "ctb"}; });
  return {list, by};
}
function akLoad(){
  if (AK_BANK) return Promise.resolve(AK_BANK);
  if (window.EMBED_BANKS && EMBED_BANKS.akml) return Promise.resolve(AK_BANK = akDecode(EMBED_BANKS.akml));
  if (!AK_WAIT) AK_WAIT = (async () => {
    for (let t = 0; t < 4; t++){
      try { const r = await fetch(`data/akml.json${BANK_V ? "?v=" + BANK_V : ""}`); if (r.ok) return AK_BANK = akDecode(await r.json()); } catch(e){}
      await sleep(700 * (t + 1));
    }
    AK_WAIT = null; throw new Error("bank");
  })();
  return AK_WAIT;
}
/* ---------- the settings and what fits together ---------- */
const akMethods = o => o.sys === "team" ? ["c", "t", "b", "s", "tt", "mx"] : ["c", "t", "b", "s", "mx"];
const akMixable = o => o.sys === "team" ? ["c", "t", "b", "s", "tt"] : ["c", "t", "b", "s"];
function akFix(o){                  // keeps the settings consistent after any change
  if (!akMethods(o).includes(o.m)) o.m = "c";
  o.mix = (Array.isArray(o.mix) ? o.mix : []).filter(x => akMixable(o).includes(x));
  if (o.mix.length < 2) o.mix = akMixable(o).slice(0, 4);
  o.secs = (Array.isArray(o.secs) ? o.secs : []).filter(x => AK_SECS.some(s => s[0] === x));
  o.tn = {g:akTNameClean(o.tn && o.tn.g), o:akTNameClean(o.tn && o.tn.o)};
  if (o.tn.g && o.tn.g === o.tn.o) o.tn.o = "";             // two teams never share a name
  if (!["sum", "avg"].includes(o.tsc)) o.tsc = "sum";
  if (![10, 15, 20, 30].includes(+o.bt)) o.bt = AK_TURN;
  if (!["auto", "man"].includes(o.bst)) o.bst = "auto";
  if (!["join", "rnd", "host"].includes(o.ord)) o.ord = "join";
  return o;
}
// the method, the answer form and the lock of each kind of question
function akKind(m, o){
  if (m === "c") return {m, inp:"c", lock:o.lock};
  if (m === "t") return {m, inp:"t", lock:o.lock};
  if (m === "s") return {m, inp:o.sinp, lock:"first"};
  if (m === "b") return {m, inp:o.binp, lock:"turn"};
  return {m:"tt", inp:o.tinp, lock:"turn"};
}
const akFits = (q, k) => k.inp === "c" ? q.md.includes("c") : k.inp === "t" ? q.md.includes("t") : q.md.includes("b");
// the plan of the match: one slot per question with its method, multiplier and time
function akPlan(o, n){
  const ms = o.m === "mx" ? o.mix : [o.m], seq = [];
  let pool = [];
  for (let i = 0; i < n; i++){ if (!pool.length) pool = shuffle(ms, rnd()); seq.push(pool.shift()); }   // every method in turn: counts differ by one at most
  const plan = seq.map(m => ({...akKind(m, o), mul:1, tag:"", T:o.t, fx:0}));
  const fin = o.fin && n >= 6 ? 3 : 0;
  if (fin) for (let i = n - fin; i < n; i++){ plan[i].mul = 3; plan[i].tag = "final"; }
  if (o.gold && n >= 6){ const a = Math.max(0, Math.min(n - fin - 3, Math.floor(n / 2) - 1)); for (let i = a; i < a + 3; i++) if (!plan[i].tag){ plan[i].mul = 2; plan[i].tag = "gold"; } }
  if (o.surp){ const free = shuffle(plan.map((p, i) => p.tag ? -1 : i).filter(i => i > 0), rnd()); free.slice(0, Math.max(1, Math.round(n / 5))).forEach(i => { plan[i].mul = 2; plan[i].tag = "surp"; }); }
  if (o.fast) plan.forEach((p, i) => { if ((i + 1) % 4 === 0 && (p.m === "c" || p.m === "t") && p.lock === "all"){ p.T = AK_FAST_T; p.fx = 1; } });
  if (o.sys === "team" && plan.every(p => p.m === "tt") && n % 2) plan.push({...plan[n - 1], tag:plan[n - 1].tag});   // the teams get the same number of turns
  return plan;
}
const AK_TAG = {gold:"🏅 الجولة الذهبية · النقاط ×2", final:"🏁 الجولة النهائية · النقاط ×3", surp:"🎁 سؤال مفاجئ · النقاط ×2"};
// the questions of a match, slot by slot: never twice in a match, those this device has not shown first, those of the
// previous match last; sections in turn, at random or in blocks; difficulty as set (or rising through the match)
function akOrder(B, o, plan){
  const secs = o.secs.length ? o.secs : AK_SECS.map(s => s[0]);
  const seen = seenGet("lm-akseen"), last = seenGet("lm-aklast"), used = new Set(), out = [];
  const tier = q => last.has(q.id) ? 2 : seen.has(q.id) ? 1 : 0;
  const lvOf = i => o.dif === "up" ? Math.min(2, Math.floor(i * 3 / plan.length)) : o.dif === "all" ? null : +o.dif;
  const secOrder = o.sw === "rnd" ? null : shuffle(secs, rnd()), blk = Math.max(1, Math.ceil(plan.length / secs.length));
  const scored = shuffle(B.list, rnd()).sort((a, b) => tier(a) - tier(b));
  plan.forEach((p, i) => {
    const want = o.sw === "rnd" ? null : secOrder[(o.sw === "blk" ? Math.floor(i / blk) : i) % secOrder.length], lv = lvOf(i);
    const ok = q => !used.has(q.id) && secs.includes(q.s) && akFits(q, p);
    const pick = scored.find(q => ok(q) && (!want || q.s === want) && (lv == null || q.l === lv))
      || scored.find(q => ok(q) && (lv == null || q.l === lv)) || scored.find(q => ok(q) && (!want || q.s === want)) || (o.dif === "all" || o.dif === "up" ? scored.find(ok) : null);
    if (pick){ used.add(pick.id); out.push(pick.id); } else out.push(null);
  });
  return out;
}
function akAvail(B, o){       // how many questions of the bank fit these settings
  const secs = o.secs.length ? o.secs : AK_SECS.map(s => s[0]);
  const ks = (o.m === "mx" ? o.mix : [o.m]).map(m => akKind(m, o));
  return B.list.filter(q => secs.includes(q.s) && (o.dif === "all" || o.dif === "up" || q.l === +o.dif) && ks.some(k => akFits(q, k))).length;
}
const akAd = (dir, code, sp, k) => `lamma-ak|${dir}|${code}|${sp}|${k}`;
const akGapHTML = (q, fill, cls) => `<p class="akx ${cls || ""}">${esc(q.pre)}<span class="${fill != null ? "akfill" : "akgap"}">${fill != null ? esc(fill) : "<i>؟</i>"}</span>${esc(q.post)}</p>`;
const akSec = ms => Math.ceil(ms / 1000);
// the room's state on this device (the host's own, or the one a phone reads)
const akS = () => typeof H !== "undefined" && H && H.g === "akml" ? H.s : ((findHost() || {}).presence || {}).s || null;
const akTNameClean = x => String(x || "").replace(/[<>&"'`\\]/g, "").replace(/\s+/g, " ").trim().slice(0, 18);
// a team's name: the host's name for it, or «الفريق الأخضر / البرتقالي»
const akTN = t => { const st = akS(), n = st && st.o && st.o.tn && akTNameClean(st.o.tn[t]); return n || `الفريق ${TEAM[t]}`; };
// ms left on the question clock (it stops while somebody holds the turn in «أسرع إصبع»)
const akLeft = s => {
  if (!s || !s.qs) return 0;
  const q = s.q; if (q.m !== "b") return Math.max(0, (s.tt && s.tt.T ? s.tt.T : q.T) * 1000 - (srvNow() - (s.tt && s.tt.at ? s.tt.at : s.qs)));
  const z = s.bz || {}; return Math.max(0, q.T * 1000 - (z.used || 0) - (z.ra ? Math.max(0, srvNow() - z.ra) : 0));
};
const akTurnLeft = s => { const z = s.bz; if (!z || z.cur < 0) return 0; const T = (+s.o.bt || AK_TURN) * 1000; return Math.max(0, T - (z.tu || 0) - (z.ta ? Math.max(0, srvNow() - z.ta) : 0)); };

const Akml = {
  init: () => ({sp:0, step:0, i:0, n:10, qs:0, qd:null, q:null, got:[], cnt:0, res:{}, top:[], rev:null, dist:null, bz:null, tt:null, hk:"", nx:0, fin:null, tm:{}, ts:null, tsg:null, wk:null, tb:null}),
  savePriv(){ const p = H.priv; return {order:p.order || [], plan:p.plan || [], pos:p.pos || 0, sc:p.sc || {}, ts:p.ts || null, ans:p.ans || {}, arr:p.arr || [], ci:p.ci, qid:p.qid, revealedK:p.revealedK, own:p.own || {}, hkp:p.hkp || null, pend:p.pend || [], dec:p.dec || {}, bzw:p.bzw || {}, ids:p.ids || [], spMax:p.spMax || 0, tmk:p.tmk || null, rot:p.rot || null, ttn:p.ttn || 0, spare:p.spare || [], tbk:p.tbk || null}; },
  async restore(pv){
    Object.assign(H.priv, {order:pv.order || [], plan:pv.plan || [], pos:+pv.pos || 0, sc:pv.sc || {}, ts:pv.ts || null, ans:pv.ans || {}, arr:pv.arr || [], ci:pv.ci, qid:pv.qid, revealedK:pv.revealedK, own:pv.own || {}, hkp:pv.hkp || null, pend:pv.pend || [], dec:pv.dec || {}, bzw:pv.bzw || {}, ids:pv.ids || [], spMax:+pv.spMax || 0, tmk:pv.tmk || null, rot:pv.rot || null, ttn:+pv.ttn || 0, spare:pv.spare || [], tbk:pv.tbk || null});
    akFix(H.s.o);
    if (H.s.ph === "lobby") return;
    try { H.priv.B = await akLoad(); } catch(e){ if (H) H.s.ph = "lobby"; return; }
    if (!H || H.g !== "akml") return;
    if (["q", "judge", "r"].includes(H.s.ph)){ Akml.hostKey(); H.priv.tickAt = 0; clearInterval(H.priv.tick); H.priv.tick = setInterval(Akml.tick, 250); }
    renderHost();            // the answer card comes back with the host's own copy of the bank
  },
  hostKey(){
    if (!DFC.ok()) return Promise.reject(new Error("no crypto"));
    if (!H.priv.hkP){ H.priv.hkP = DFC.pair(H.priv.hkp).then(k => { if (!H) return k; H.priv.hkp = k.saved; if (H.s.hk !== k.pub){ H.s.hk = k.pub; pushHost(); } return k; }); H.priv.hkP.catch(() => { if (H) H.priv.hkP = null; }); }
    return H.priv.hkP;
  },
  onOpt(){ akFix(H.s.o); if (H.s.o.sys === "team") Akml.teamsFill(); },
  canStart(o){
    if (AK_BANK && !akAvail(AK_BANK, akFix(o))) return false;
    if (o.sys === "team"){ const tm = H.s.tm || {}, ks = hostPlayers().map(p => dfKey(pname(p))); if (!ks.some(k => tm[k] === "g") || !ks.some(k => tm[k] === "o")) return false; }
    return true;
  },
  /* ---------- teams ---------- */
  // every player in a team: newcomers join the smaller team (the host can move anybody)
  teamsFill(){
    if (!H.s.tm || !Object.keys(H.s.tm).length) H.s.tm = {...(H.priv.tmk || {})};
    const tm = H.s.tm || (H.s.tm = {}), ks = hostPlayers().map(p => dfKey(pname(p)));
    for (const k of ks) if (!tm[k]){ const g = ks.filter(x => tm[x] === "g").length, o = ks.filter(x => tm[x] === "o").length; tm[k] = g <= o ? "g" : "o"; }
    H.priv.tmk = {...tm};          // the teams stay as they are when the host goes back to the settings
  },
  teamsAuto(){
    const ks = shuffle(hostPlayers().map(p => dfKey(pname(p))), rnd()), tm = {};
    ks.forEach((k, i) => { tm[k] = i % 2 ? "o" : "g"; });
    H.s.tm = tm; H.priv.tmk = {...tm};
  },
  members(t){ return hostPlayers().filter(p => (H.s.tm || {})[dfKey(pname(p))] === t).sort((a, b) => (+a.presence.jt || 0) - (+b.presence.jt || 0)); },     // in the order they joined
  act(a, b){
    const s = H.s, d = b && b.dataset || {};
    if (a === "start") return Akml.start();
    if (a === "set"){            // a setting with several values (sections, the methods of the mix, on/off rounds)
      const o = s.o;
      if (d.k === "secs"){ if (d.v === "all") o.secs = []; else { const x = new Set(o.secs); x.has(d.v) ? x.delete(d.v) : x.add(d.v); o.secs = [...x]; if (o.secs.length === AK_SECS.length) o.secs = []; } }
      else if (d.k === "mix"){ const x = new Set(o.mix); x.has(d.v) ? (x.size > 2 && x.delete(d.v)) : x.add(d.v); o.mix = [...x]; }
      else if (["gold", "fin", "surp", "fast", "steal"].includes(d.k)) o[d.k] = o[d.k] ? 0 : 1;
      akFix(o); return pushHost();
    }
    if (a === "tauto"){ Akml.teamsAuto(); return pushHost(); }
    if (a === "ttpick") return Akml.ttPick(d.k);
    if (a === "tmove"){             // only the host moves a player (before the match, or between questions)
      if (s.ph !== "lobby" && s.ph !== "r") return;
      const k = d.k; if (!k) return; s.tm[k] = s.tm[k] === "g" ? "o" : "g"; H.priv.tmk = {...s.tm}; return pushHost();
    }
    if (a === "teams"){ H.priv.tpanel = !H.priv.tpanel; return renderHost(); }
    if (a === "next") return Akml.next();
    if (a === "close") return Akml.close(true);
    if (a === "skip") return Akml.skip();
    if (a === "final") return Akml.finish();
    if (a === "jok" || a === "jno") return Akml.decide(d.x, a === "jok");
    if (a === "jover") return Akml.accept(d.x);
    if (a === "akhide"){ H.priv.akHide = !H.priv.akHide; try { localStorage.setItem("lm-akhide", H.priv.akHide ? "1" : ""); } catch(e){} return renderHost(); }
    if (s.ph === "q" && b && +d.tid === (s.bz ? s.bz.tid : s.tt ? s.tt.tid : -1)){       // a click from an older turn does nothing
      if (a === "bok") Akml.oral(true);
      else if (a === "bno") Akml.oral(false);
      else if (a === "bgo"){ const z = s.bz; if (z && !z.ta){ z.ta = srvNow(); pushHost(); } }
      else if (a === "bstop"){ const z = s.bz; if (z && z.ta){ z.tu = (z.tu || 0) + srvNow() - z.ta; z.ta = 0; pushHost(); } }
    }
  },
  async start(){
    if (H.priv.starting) return; H.priv.starting = true;
    let B; try { B = await akLoad(); } catch(e){ H.priv.starting = false; H.priv.bankErr = true; renderHost(); return; }
    H.priv.starting = false;
    if (!H || H.g !== "akml") return;
    const o = akFix(H.s.o);
    if (o.sys === "team") Akml.teamsFill();
    const plan = akPlan(o, o.n), order = akOrder(B, o, plan);
    // a slot with no fitting question is dropped; a few spare questions replace skipped ones
    const keep = plan.map((p, i) => [p, order[i]]).filter(x => x[1]);
    if (!keep.length) return;
    const used = new Set(keep.map(x => x[1]));
    const spare = shuffle(B.list.filter(q => !used.has(q.id) && (o.secs.length ? o.secs : AK_SECS.map(x => x[0])).includes(q.s)), rnd()).map(q => q.id);
    const ord = o.ord === "rnd" ? shuffle : x => x;
    Object.assign(H.priv, {B, plan:keep.map(x => x[0]), order:keep.map(x => x[1]), spare, pos:0, sc:{}, ts:{g:{s:0, r:0, b:0}, o:{s:0, r:0, b:0}}, ans:{}, arr:[], pend:[], dec:{}, bzw:{}, ids:[], revealedK:-1, ttn:0, tbk:null, tbw:null, ttStart:null,
      rot:o.sys === "team" ? {g:ord(Akml.members("g").map(p => dfKey(pname(p))), rnd()), o:ord(Akml.members("o").map(p => dfKey(pname(p))), rnd()), i:{g:0, o:0}} : null});
    for (const p of hostPlayers()){ const k = dfKey(pname(p)); H.priv.sc[k] = {n:pname(p), s:0, b:0, r:0, w:0, ms:0}; }
    // the question counter never goes back (also after «الإعدادات»), so an answer sent for an earlier question is never taken for a new one
    H.s = {...Akml.init(), o, tm:H.s.tm || {}, n:keep.length, ts:o.sys === "team" ? {g:0, o:0} : null, hk:H.s.hk || (H.priv.hkp && H.priv.hkp.pub) || "", sp:Math.max(H.s.sp || 0, H.priv.spMax || 0)};
    Akml.hostKey().catch(() => {});
    Akml.ask();
  },
  // the next question (or the replacement of a skipped one, in the same slot)
  ask(replace){
    const s = H.s, B = H.priv.B, p = H.priv.plan[s.i - (replace ? 1 : 0)] || H.priv.plan[H.priv.plan.length - 1];
    let it = null;
    if (replace){ while (H.priv.spare.length && !it){ const q = B.by[H.priv.spare.shift()]; if (q && akFits(q, p)) it = q; } if (!it) return Akml.next(true); }
    else it = B.by[H.priv.order[s.i]];
    if (!it) return Akml.finish();
    if (!replace) s.i++;
    seenAdd("lm-akseen", [it.id], 3000); H.priv.ids.push(it.id);
    Object.assign(H.priv, {qid:it.id, ans:{}, arr:[], pend:[], dec:{}, bzw:{}, ci:-1});
    const qd = {pre:it.pre, post:it.post, s:it.s, l:it.l};
    if (p.inp === "c"){ const o = shuffle(it.o, rnd()); H.priv.ci = o.indexOf(it.o[0]); qd.o = o; }
    s.sp++; H.priv.spMax = s.sp; s.step = 0; s.qd = qd; s.q = {m:p.m, inp:p.inp, lock:p.lock, mul:p.mul, tag:p.tag, T:p.T, fx:p.fx};
    s.ph = "q"; s.qs = srvNow() + AK_LEAD; s.got = []; s.cnt = 0; s.res = {}; s.rev = null; s.dist = null; s.nx = 0; s.wk = null; s.tsg = null;
    s.bz = p.m === "b" ? {q:[], cur:-1, bl:[], tid:0, used:0, ra:s.qs, ta:0, tu:0, only:null, st:0} : null;
    s.tt = null;
    if (p.m === "tt"){ if (replace) H.priv.ttn = Math.max(0, H.priv.ttn - 1); Akml.ttTurn(Akml.ttFirst(), false); }       // a replaced question keeps the same team on turn
    H.priv.tickAt = Date.now(); clearInterval(H.priv.tick); H.priv.tick = setInterval(Akml.tick, 250);
    pushHost();
  },
  next(force){
    const s = H.s;
    if (!force && (s.ph !== "r" || H.priv.revealedK !== s.sp)) return;
    if (s.tb) return Akml.tbNext();
    if (s.i >= s.n) return Akml.finish();
    Akml.ask();
  },
  // a question with a problem: no points for anybody, another question of the same kind takes its place
  skip(){
    const s = H.s; if (!["q", "judge"].includes(s.ph) || s.tb) return;
    clearInterval(H.priv.tick); clearTimeout(H.priv.bzT); H.priv.bzT = null;
    Akml.ask(true);
  },
  /* ---------- «تحدي الفرق»: the team on turn, one member at a time ---------- */
  ttFirst(){
    const o = H.s.o, n = H.priv.ttn++;
    const first = o.first === "rnd" ? (H.priv.ttStart || (H.priv.ttStart = rnd() < .5 ? "g" : "o")) : o.first;
    return n % 2 ? other(first) : first;
  },
  ttLive(t){ return new Set(activePlayers(hostPlayers()).filter(p => H.s.tm[dfKey(pname(p))] === t).map(p => dfKey(pname(p)))); },
  // the member whose turn it is: members who missed their turn while offline come first when they are back (owe), then the
  // rotation; members offline now are passed over and are owed a turn
  ttWho(t, not){
    const R = H.priv.rot, live = Akml.ttLive(t);
    R.owe = R.owe || {g:[], o:[]};
    for (const p of Akml.members(t)){ const k = dfKey(pname(p)); if (!R[t].includes(k)) R[t].push(k); }      // newcomers at the end of the turn order
    const ow = R.owe[t].find(k => live.has(k) && k !== not);
    if (ow){ R.owe[t] = R.owe[t].filter(k => k !== ow); return ow; }
    for (let j = 0; j < R[t].length; j++){ const k = R[t][(R.i[t] + j) % R[t].length]; if (live.has(k) && H.s.tm[k] === t && k !== not){
      for (let x = 0; x < j; x++){ const m = R[t][(R.i[t] + x) % R[t].length]; if (!live.has(m) && H.s.tm[m] === t && !R.owe[t].includes(m)) R.owe[t].push(m); }
      R.i[t] = (R.i[t] + j + 1) % R[t].length; return k; } }
    return null;
  },
  ttTurn(t, steal){
    const s = H.s, k = Akml.ttWho(t), prev = s.tt;
    const T = steal ? Math.max(5, Math.round(s.q.T / 2)) : s.q.T;
    s.tt = {t, k, n:k ? Akml.nm(k) : "", steal:steal ? 1 : 0, tid:(prev ? prev.tid : 0) + 1, T, at:prev ? srvNow() + 1500 : s.qs, first:prev ? prev.first : t, wait:0};
    if (prev) s.qs = s.tt.at;            // the stolen chance has its own short countdown and clock
    // «يختاره المقدّم»: the clock waits until the host picks who answers (the rotation's member is suggested)
    if (s.o.ord === "host"){ s.tt.wait = 1; s.tt.at = s.qs = srvNow() + 864e5; }
  },
  nm(k){ const p = hostPlayers().find(p => dfKey(pname(p)) === k); return (H.priv.sc[k] || {}).n || (p ? pname(p) : ""); },
  // the host picks the member who answers (before the question's clock starts); the suggested member keeps his turn for later
  ttPick(k){
    const s = H.s, t = s.tt; if (s.ph !== "q" || !t || !t.wait || s.tm[k] !== t.t) return;
    const R = H.priv.rot; R.owe = R.owe || {g:[], o:[]};
    if (t.k && t.k !== k && !R.owe[t.t].includes(t.k)) R.owe[t.t].unshift(t.k);
    R.owe[t.t] = R.owe[t.t].filter(x => x !== k);
    t.k = k; t.n = Akml.nm(k); t.wait = 0; t.tid++; t.at = s.qs = srvNow() + AK_LEAD;
    pushHost();
  },
  // the member on turn went offline: after 3 seconds the turn passes to another member of the same team, with a fresh clock;
  // the absent member is owed a turn when he is back. Nobody of the team online: the question waits (the host can skip it).
  ttAway(){
    const s = H.s, t = s.tt; if (!t || t.wait || srvNow() < s.qs) return;
    if (t.k && Akml.ttLive(t.t).has(t.k)){ H.priv.ttOff = 0; return; }
    if (H.priv.ans[(t.k || "") + "|" + t.tid]) return;
    if (!H.priv.ttOff){ H.priv.ttOff = Date.now(); return; }
    if (Date.now() - H.priv.ttOff < 3000) return;
    H.priv.ttOff = 0;
    const R = H.priv.rot; R.owe = R.owe || {g:[], o:[]};
    const k = Akml.ttWho(t.t, t.k);
    if (!k) return;
    if (t.k && !R.owe[t.t].includes(t.k)) R.owe[t.t].push(t.k);
    Object.assign(t, {k, n:Akml.nm(k), tid:t.tid + 1, at:srvNow() + 1500, moved:1}); s.qs = t.at;
    pushHost();
  },
  tick(){
    if (!H || H.g !== "akml") return;
    const s = H.s; H.priv.tickAt = Date.now();
    if (s.ph === "q"){
      const q = s.q;
      if (q.m === "b"){
        const z = s.bz;
        if (z.cur < 0 && akLeft(s) <= 0 && !H.priv.bzT) Akml.close();
        else if (z.cur >= 0 && q.inp === "t" && z.ta && akTurnLeft(s) <= 0) Akml.turnOver(z.q[z.cur][0], "late");
      } else if (q.m === "tt" && (Akml.ttAway(), s.tt.wait)){
        // waiting for the host to pick who answers
      } else if (srvNow() > s.qs + (s.tt ? s.tt.T : q.T) * 1000 + 800){
        Akml.hostPeers(hostPlayers());                 // answers still on their way count first
        if (s.ph === "q"){ if (q.m === "tt") Akml.turnOver(s.tt.k, "late"); else Akml.close(); }
      }
      renderHost();
    } else if (s.ph === "r"){
      if (s.o.go === "auto" && s.nx && srvNow() >= s.nx) Akml.next(); else renderHost();
    }
  },
  /* ---------- answers from the phones ---------- */
  hostPeers(players){
    const s = H.s;
    if (s.o.sys === "team" && (s.ph === "lobby" || s.ph === "r")){ const before = JSON.stringify(s.tm); Akml.teamsFill(); if (JSON.stringify(s.tm) !== before) pushHost(); }
    if (s.ph !== "q") return;
    const own = H.priv.own || (H.priv.own = {}), now = srvNow();
    let ch = false;
    for (const p of players){
      const z = p.presence.ak; if (!z || z.i !== s.sp) continue;
      const k = dfKey(pname(p));
      // a name's record belongs to the device identity that first played under it (the database guarantees a seat's identity)
      if (p.uid){ if (own[k] && own[k] !== p.uid) continue; if (!own[k]) own[k] = p.uid; }
      if (!H.priv.sc[k]) H.priv.sc[k] = {n:pname(p), s:0, b:0, r:0, w:0, ms:0};
      if (z.bz && s.q.m === "b"){
        const bz = s.bz;
        if (!bz.q.some(x => x[0] === k) && !bz.bl.includes(k) && !H.priv.bzw[k] && now >= s.qs && Akml.mayBuzz(k)){ H.priv.bzw[k] = {n:pname(p), at:now}; ch = true; }
      }
      if (typeof z.e === "string" && z.e.length < 2000 && typeof z.pk === "string" && z.pk.length < 200){
        const le = H.priv.le || (H.priv.le = {}), key = k + "|" + (z.t || 0);
        if (le[key] !== z.e){ le[key] = z.e; Akml.unseal(k, pname(p), z, now, s.sp); }
      }
    }
    if (ch && !H.priv.bzT) H.priv.bzT = setTimeout(Akml.drain, AK_DRAIN);
  },
  mayBuzz(k){              // after a wrong answer with the steal rule only the other team may press; a deciding round: only the tied
    const s = H.s, z = s.bz;
    if (z.tb && !z.tb.includes(k)) return false;
    if (s.tb && s.o.sys === "team" && !s.tb.keys.includes(s.tm[k])) return false;
    return !z.only || s.tm[k] === z.only;
  },
  async unseal(k, name, z, arr, sp){
    let m = null;
    try { const hk = await Akml.hostKey(); m = await DFC.open(await DFC.shared(hk, z.pk), z.e, akAd("up", H.code, sp, k)); } catch(err){ m = null; }
    if (!H || H.g !== "akml" || !m || m.i !== sp) return;
    // answers that arrive within a moment are taken in the order they reached the host (not by the phones' clocks)
    (H.priv.inq || (H.priv.inq = [])).push({k, name, m, arr});
    if (!H.priv.inT) H.priv.inT = setTimeout(() => { H.priv.inT = null; const q = H.priv.inq.sort((a, b) => a.arr - b.arr); H.priv.inq = []; for (const x of q) Akml.record(x.k, x.name, x.m, x.arr); }, AK_DRAIN);
  },
  record(k, name, m, arr){
    const s = H.s, q = s.q; if (s.ph !== "q" || m.i !== s.sp) return;
    // who may answer now: everybody (c, t, s), the player on turn (b, tt), and only his current turn
    if (q.lock === "turn"){
      const who = q.m === "b" ? (s.bz.cur >= 0 ? s.bz.q[s.bz.cur][0] : null) : s.tt.k, tid = q.m === "b" ? s.bz.tid : s.tt.tid;
      if (k !== who || m.t !== tid || q.inp === "o") return;
    }
    const A = H.priv.ans, key = q.lock === "turn" ? k + "|" + m.t : k;
    if (A[key]) return;                                   // one answer per player (per turn): no repeated guessing
    const T = (s.tt ? s.tt.T : q.T) * 1000, t0 = q.lock === "turn" && q.m === "b" ? (s.bz.ta || arr) : s.qs;
    const rec = arr - t0, said = Number.isFinite(+m.at) ? +m.at - t0 : rec;
    if (q.m !== "b" && (said > T + 1000 || rec > T + 5000 || said < -1500)) return;       // outside the answer time
    // the answer time on the shared clock: a phone cannot claim to be more than 3 s faster than the moment its answer
    // arrived, unless the host's page was asleep (then the phone's own time counts)
    const asleep = Date.now() - (H.priv.tickAt || 0) > 1500;
    const ms = Math.max(0, Math.min(T, asleep ? said : Math.max(said, rec - 3000)));
    const it = H.priv.B.by[H.priv.qid];
    let v;
    if (q.inp === "c"){ if (!Number.isInteger(m.c) || m.c < 0 || m.c > 3) return; v = m.c === H.priv.ci ? "ok" : "no"; A[key] = {k, n:name, c:m.c, ms, v, at:arr}; }
    else { const x = String(m.x || "").slice(0, 60); if (!akNorm(x)) return; v = akCheck(it, x);
      // the player on turn: an answer that is neither the answer nor one of the question's wrong options is judged by the host
      // before the turn passes (it may be right in meaning)
      if (q.lock === "turn" && v === "no" && !akIsOpt(it, x)) v = "?"; A[key] = {k, n:name, x, ms, v, at:arr}; if (v === "?") H.priv.pend.includes(akNorm(x)) || H.priv.pend.push(akNorm(x)); }
    H.priv.arr.push(key);
    s.got = [...new Set(Object.values(A).map(a => a.k))]; s.cnt = s.got.length;
    if (q.lock === "turn") return Akml.turnAnswer(key);
    if (q.lock === "first") return Akml.firstCheck();
    const act = activePlayers(hostPlayers()).map(p => dfKey(pname(p)));
    if (act.length && act.every(x => A[x])) Akml.close(); else pushHost();
  },
  // «أول إجابة صحيحة»: answers in the order they reached the host; an answer the host must judge holds back the later ones
  firstCheck(){
    const s = H.s, A = H.priv.ans, D = H.priv.dec;
    let waiting = false;
    for (const key of H.priv.arr){
      const a = A[key], v = akVal(a, "?");
      if (v === "ok"){ if (waiting){ s.ph = "judge"; s.step = 1; clearInterval(H.priv.tick); return pushHost(); } s.wk = a.k; return Akml.reveal(); }
      if (v === "?") waiting = true;
    }
    const act = activePlayers(hostPlayers()).map(p => dfKey(pname(p)));
    if (act.length && act.every(x => A[x])) return Akml.close();
    pushHost();
  },
  // the answer of the player on turn (typed or chosen on his phone)
  turnAnswer(key){
    const a = H.priv.ans[key], v = akVal(a, "?");
    if (v === "?"){ H.s.ph = "judge"; H.s.step = 1; clearInterval(H.priv.tick); return pushHost(); }
    return Akml.turnOver(a.k, v);
  },
  turnOver(k, v){
    const s = H.s, q = s.q;
    if (v === "ok"){ s.wk = k; return Akml.reveal(); }
    if (k){ const key = k + "|" + (q.m === "b" ? s.bz.tid : s.tt.tid); if (!H.priv.ans[key]) H.priv.ans[key] = {k, n:(H.priv.sc[k] || {}).n || "", v:"no", late:v === "late"}; }
    if (q.m === "b"){
      const z = s.bz; z.bl.push(k);
      if (s.o.sys === "team" && s.o.steal && !z.st){ z.st = 1; z.only = other(s.tm[k]); }       // the steal: only the other team, once
      else if (z.st) return Akml.close();                                                              // the steal failed too
      Akml.turn();
      if (z.cur < 0 && akLeft(s) <= 0) return Akml.close();
      return pushHost();
    }
    // «تحدي الفرق»: a wrong answer (or the time out) gives the other team one chance if the steal rule is on
    if (!s.tt.steal && s.o.steal){ Akml.ttTurn(other(s.tt.t), true); if (s.tt.k){ s.ph = "q"; clearInterval(H.priv.tick); H.priv.tick = setInterval(Akml.tick, 250); return pushHost(); } }
    Akml.close();
  },
  // presses that arrived within a moment are put in the order they reached the host
  drain(){
    if (!H || H.g !== "akml") return; H.priv.bzT = null;
    const s = H.s; if (s.ph !== "q" || !s.bz) return;
    const w = Object.entries(H.priv.bzw).filter(([k]) => !s.bz.q.some(x => x[0] === k)).sort((a, b) => a[1].at - b[1].at);
    for (const [k, v] of w) s.bz.q.push([k, v.n]);
    if (s.bz.cur < 0) Akml.turn();
    pushHost();
  },
  // the turn goes to the first in order allowed to answer; the question clock stops while somebody answers
  turn(){
    const s = H.s, z = s.bz, now = srvNow();
    const idx = z.q.findIndex(x => !z.bl.includes(x[0]) && (!z.only || s.tm[x[0]] === z.only));
    if (idx >= 0){ if (z.ra){ z.used += Math.max(0, now - z.ra); z.ra = 0; } z.cur = idx; z.tid++; z.tu = 0; z.ta = s.q.inp === "t" || s.o.bst !== "man" ? now : 0; }   // typed: the turn clock starts by itself; aloud: by itself or when the host starts it
    else { z.cur = -1; if (!z.ra) z.ra = now; }
  },
  oral(ok){
    const s = H.s, q = s.q;
    if (q.m === "b"){ const z = s.bz; if (z.cur < 0) return; const k = z.q[z.cur][0];
      if (ok){ H.priv.ans[k + "|" + z.tid] = {k, n:z.q[z.cur][1], v:"ok", first:z.cur === 0 && !z.bl.length}; }
      return Akml.turnOver(k, ok ? "ok" : "no"); }
    if (q.m === "tt" && s.tt.k){ if (ok) H.priv.ans[s.tt.k + "|" + s.tt.tid] = {k:s.tt.k, n:s.tt.n, v:"ok"}; return Akml.turnOver(s.tt.k, ok ? "ok" : "no"); }
  },
  /* ---------- the end of a question ---------- */
  close(early){
    const s = H.s; if (s.ph !== "q") return;
    if (early && s.q.m !== "b" && srvNow() < s.qs) return;
    if (s.q.inp === "t" && s.q.lock === "all"){
      H.priv.pend = [...new Set(Object.values(H.priv.ans).filter(a => a.v === "?").map(a => akNorm(a.x)))];
      if (H.priv.pend.some(x => !H.priv.dec[x])){ clearInterval(H.priv.tick); s.ph = "judge"; s.step = 1; pushHost(); return; }
    }
    if (s.q.lock === "first"){
      const left = H.priv.arr.map(k => H.priv.ans[k]).filter(a => a.v === "?" && !H.priv.dec[akNorm(a.x)]);
      if (left.length){ clearInterval(H.priv.tick); s.ph = "judge"; s.step = 1; pushHost(); return; }
    }
    Akml.reveal();
  },
  // the host's decision on a typed answer the device could not settle (applies to every player who typed the same)
  decide(x, ok){
    const s = H.s; if (!(s.ph === "judge" || s.ph === "q") || !H.priv.pend.includes(x) || H.priv.dec[x]) return;
    H.priv.dec[x] = ok ? "ok" : "no";
    const q = s.q;
    if (q.lock === "first") return Akml.firstCheck(), s.ph === "judge" && Akml.firstAfterJudge();
    if (q.lock === "turn"){
      const key = H.priv.arr[H.priv.arr.length - 1], a = H.priv.ans[key];
      if (a && akNorm(a.x) === x){ s.ph = "q"; clearInterval(H.priv.tick); H.priv.tick = setInterval(Akml.tick, 250); return Akml.turnOver(a.k, ok ? "ok" : "no"); }
      return renderHost();
    }
    if (s.ph === "judge" && H.priv.pend.every(p => H.priv.dec[p])) Akml.reveal(); else renderHost();
  },
  // a typed answer the device refused (not the bank's wording) that the host accepts as right in meaning; a decision is given
  // once and cannot be changed, and only before the question's points are counted
  accept(x){
    const s = H.s, q = s.q; if (!q || !(s.ph === "q" || s.ph === "judge") || q.lock === "turn" || H.priv.dec[x]) return;
    const it = H.priv.B.by[H.priv.qid], has = Object.values(H.priv.ans).some(a => a.x != null && akNorm(a.x) === x && a.v === "no");
    if (!has || akIsOpt(it, x)) return;
    H.priv.dec[x] = "ok";
    if (q.lock === "first"){ Akml.firstCheck(); if (s.ph === "judge") Akml.firstAfterJudge(); return; }
    renderHost();
  },
  firstAfterJudge(){        // judged, nobody right yet: the question goes on for the others (or ends if all answered)
    const s = H.s; if (s.ph !== "judge") return;
    const A = H.priv.ans, act = activePlayers(hostPlayers()).map(p => dfKey(pname(p)));
    if (H.priv.arr.some(k => A[k].v === "?" && !H.priv.dec[akNorm(A[k].x)])) return renderHost();
    if (act.every(x => A[x]) || srvNow() > s.qs + s.q.T * 1000) return Akml.reveal();
    s.ph = "q"; H.priv.tick = setInterval(Akml.tick, 250); pushHost();
  },
  reveal(){
    const s = H.s; if (s.ph !== "q" && s.ph !== "judge") return;          // once per question
    clearInterval(H.priv.tick); clearTimeout(H.priv.bzT); H.priv.bzT = null;
    const it = H.priv.B.by[H.priv.qid], q = s.q, sc = H.priv.sc, res = {}, dist = [0, 0, 0, 0], mul = q.mul;
    for (const p of hostPlayers()){ const k = dfKey(pname(p)); if (!sc[k]) sc[k] = {n:pname(p), s:0, b:0, r:0, w:0, ms:0}; }
    if (s.tb){ Akml.tbReveal(it); return; }
    const T = q.T * 1000, gain = {};
    for (const a of Object.values(H.priv.ans)){
      const v = akVal(a, "no"), ok = v === "ok";
      if (q.inp === "c" && a.c != null) dist[a.c]++;
      let base = 0, bonus = 0;
      if (ok){
        if (q.lock === "all"){ base = AK_PTS.ok; bonus = Math.round((q.fx ? AK_PTS.fastX : AK_PTS.fast) * Math.max(0, 1 - a.ms / T)); }
        else if (q.lock === "first"){ if (s.wk === a.k){ base = AK_PTS.ok; bonus = AK_PTS.first; } }
        else if (q.m === "b"){ if (s.wk === a.k){ base = AK_PTS.ok; bonus = a.first || (s.bz.q[0] && s.bz.q[0][0] === a.k && s.bz.bl.length === 0) ? AK_PTS.first : 0; } }
        else if (s.wk === a.k) base = AK_PTS.ok;
      }
      const g = gain[a.k] || (gain[a.k] = {g:0, b:0, v:-1});
      if (ok && (q.lock === "all" || s.wk === a.k)){ g.g += (base + bonus) * mul; g.b += bonus * mul; g.v = 1; const r = sc[a.k]; r.s += (base + bonus) * mul; r.b += bonus * mul; r.r++; r.ms += a.ms || 0; }
      else if (!ok || q.lock === "all"){ if (g.v !== 1){ g.v = 0; sc[a.k] && sc[a.k].w++; } }
      else if (g.v !== 1) g.v = -1;      // right but too late: somebody else was first
    }
    // the teams. «مجموع النقاط» (default): the team gets the sum of its members' points of the question. «متوسط النقاط» (for
    // teams of different sizes, only when everybody answers): the team gets the average, a whole number, and that number is
    // shared among the members who scored (largest remainders), so the members' contributions always add up to the team's
    // points exactly. When only one player can score (first right answer, the turn), the team gets that player's points.
    if (s.o.sys === "team"){
      const tg = {g:0, o:0};
      for (const t of ["g", "o"]){
        const ks = Akml.members(t).map(p => dfKey(pname(p)));
        const pts = ks.map(k => (gain[k] || {g:0}).g), sum = pts.reduce((a, b) => a + b, 0);
        let share = pts;
        if (q.lock === "all" && s.o.tsc === "avg" && ks.length > 1){
          const T = Math.round(sum / ks.length), ex = pts.map(g => g / ks.length);
          share = ex.map(Math.floor);
          let left = T - share.reduce((a, b) => a + b, 0);
          ex.map((e, i) => [e - Math.floor(e), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([f, i]) => { if (left > 0 && f > 0){ share[i]++; left--; } });
          tg[t] = T;
        } else tg[t] = sum;
        H.priv.ts[t].s += tg[t]; H.priv.ts[t].r += ks.filter(k => (gain[k] || {}).v === 1).length;
        // each member's contribution to his team (kept per team, so a player moved by the host leaves it with the team he played for)
        ks.forEach((k, i) => { const r = sc[k]; if (!r) return; r.tc = r.tc || {}; r.tc[t] = (r.tc[t] || 0) + share[i]; });
      }
      s.tsg = tg; s.ts = {g:H.priv.ts.g.s, o:H.priv.ts.o.s};
    }
    const rank = Akml.ranking();
    rank.forEach(([k, r], i) => { const g = gain[k] || {g:0, b:0, v:-1}; res[k] = [g.g, g.v, r.s, i + 1, g.b]; });
    s.res = res; s.top = rank.slice(0, 10).map(([k, r]) => [r.n, r.s, (gain[k] || {g:0}).g, s.tm[k] || ""]);
    s.dist = q.inp === "c" ? dist : null;
    s.rev = {a:it.a, why:it.why, src:it.src, ci:H.priv.ci, w:s.wk ? (sc[s.wk] || {}).n || "" : ""};
    s.ph = "r"; s.step = 2; s.nx = s.o.go === "auto" ? srvNow() + AK_AUTO * 1000 : 0; H.priv.revealedK = s.sp;
    if (s.o.go === "auto") H.priv.tick = setInterval(Akml.tick, 250);
    pushHost();
  },
  // ranking: points, then more right answers, then fewer wrong ones, then the shorter total time of the right answers
  ranking(){ return Object.entries(H.priv.sc).sort((a, b) => b[1].s - a[1].s || b[1].r - a[1].r || a[1].w - b[1].w || a[1].ms - b[1].ms || a[1].n.localeCompare(b[1].n, "ar")); },
  tied(rank){                 // still equal on every rule: shared
    if (rank.length < 2) return false; const [a, b] = [rank[0][1], rank[1][1]];
    return a.s === b.s && a.r === b.r && a.w === b.w && a.ms === b.ms;
  },
  /* ---------- the end of the match, the tie ---------- */
  finish(){
    const s = H.s; clearInterval(H.priv.tick);
    lsSet("lm-aklast", JSON.stringify(H.priv.ids || []));
    const team = s.o.sys === "team", rank = Akml.ranking();
    // a tie at the top on the points: the tie rules decide, or a deciding round when the host chose it
    if (s.o.tie === "round" && !H.priv.tbk){
      if (team && H.priv.ts.g.s === H.priv.ts.o.s && H.priv.ts.g.s > 0) return Akml.tbStart(["g", "o"]);
      if (!team && rank.length > 1 && rank[0][1].s > 0 && rank[0][1].s === rank[1][1].s) return Akml.tbStart(rank.filter(r => r[1].s === rank[0][1].s).map(r => r[0]));
    }
    Akml.final();
  },
  final(){
    const s = H.s, team = s.o.sys === "team", rank = Akml.ranking(), sc = H.priv.sc, tbw = H.priv.tbw || null;
    let win = [];
    if (team){
      const g = H.priv.ts.g, o = H.priv.ts.o;
      // the winner: more points, then more right answers (or the deciding round); still equal: a tie, nobody gets the win bonus;
      // no points at all: no winner
      const wt = (g.s + o.s) <= 0 ? [] : tbw ? [tbw] : g.s !== o.s ? [g.s > o.s ? "g" : "o"] : g.r !== o.r ? [g.r > o.r ? "g" : "o"] : [];
      const bonus = t => wt.includes(t) ? AK_PTS.win : 0;
      s.tres = (g.s + o.s) <= 0 ? "none" : wt.length ? "win" : "tie";
      s.tf = ["g", "o"].map(t => ({t, s:H.priv.ts[t].s, r:H.priv.ts[t].r, w:bonus(t), tot:H.priv.ts[t].s + bonus(t),
        m:Object.entries(sc).filter(([k, r]) => s.tm[k] === t || (r.tc && r.tc[t])).map(([k, r]) => [r.n, r.s, r.r, r.w, (r.tc || {})[t] || 0]).sort((a, b) => b[4] - a[4] || b[1] - a[1])}))
        .sort((a, b) => b.tot - a.tot || b.r - a.r);
      s.tf.forEach((x, i) => { x.p = s.tres === "none" ? 0 : s.tres === "tie" ? 1 : i + 1; });
    } else {
      const best = rank.length ? rank[0] : null;
      // a sole winner gets the win bonus; equal on every rule (and no deciding round): a tie, no bonus; no points: no winner
      s.tres = !best || best[1].s <= 0 ? "none" : tbw || !Akml.tied(rank) ? "win" : "tie";
      win = s.tres === "win" ? [tbw || best[0]] : [];
      s.ties = s.tres === "tie" ? rank.filter(r => r[1].s === best[1].s && r[1].r === best[1].r && r[1].w === best[1].w && r[1].ms === best[1].ms).map(r => r[1].n) : [];
    }
    const rows = rank.map(([k, r]) => { const w = win.includes(k) ? AK_PTS.win : 0; return {k, n:r.n, t:s.tm[k] || "", r:r.r, w:r.w, q:r.s - r.b, b:r.b, wb:w, tot:r.s + w}; });
    if (!team) rows.sort((a, b) => (b.wb ? 1 : 0) - (a.wb ? 1 : 0) || b.tot - a.tot);
    // places: players equal on the ranking rules share a place; nobody has a place when nobody scored
    const key = x => [x.tot, x.r, (sc[x.k] || {}).w, (sc[x.k] || {}).ms].join("|");
    let place = 0; rows.forEach((x, i) => { const pr = rows[i - 1]; if (!pr || key(x) !== key(pr)) place = i + 1; x.p = s.tres === "none" ? 0 : place; });
    s.tbr = H.priv.tbk ? {w:tbw ? (team ? akTN(tbw) : (sc[tbw] || {}).n) : ""} : null;
    s.fin = rows.slice(0, 20).map(x => [x.n, x.t, x.r, x.w, x.q, x.b, x.wb, x.tot, x.p]);
    s.res = {}; rows.forEach(x => { s.res[x.k] = [x.p, x.tot, x.wb]; });
    s.ph = "end"; s.step = 3; s.sp++; H.priv.spMax = s.sp; s.tb = null;
    pushHost();
  },
  // the deciding round: «أسرع إصبع» (typed) between the tied players or teams only, up to 3 questions; it decides the
  // winner and adds no points
  tbStart(keys){
    const s = H.s, B = H.priv.B;
    H.priv.tbk = keys; H.priv.tbn = 0; H.priv.tbw = null;
    H.priv.tbq = shuffle(B.list.filter(q => q.md.includes("t") && !H.priv.ids.includes(q.id)), rnd()).map(q => q.id);
    s.tb = {keys:s.o.sys === "team" ? keys : keys.map(k => (H.priv.sc[k] || {}).n || ""), n:0};
    Akml.tbNext();
  },
  tbNext(){
    const s = H.s, B = H.priv.B;
    if (H.priv.tbw || H.priv.tbn >= 3 || !H.priv.tbq.length) return Akml.final();
    const it = B.by[H.priv.tbq.shift()]; H.priv.tbn++; s.tb.n = H.priv.tbn;
    H.priv.ids.push(it.id); Object.assign(H.priv, {qid:it.id, ans:{}, arr:[], pend:[], dec:{}, bzw:{}, ci:-1});
    s.sp++; H.priv.spMax = s.sp; s.qd = {pre:it.pre, post:it.post, s:it.s, l:it.l}; s.q = {m:"b", inp:"t", lock:"turn", mul:1, tag:"tb", T:30, fx:0};
    s.ph = "q"; s.qs = srvNow() + AK_LEAD; s.got = []; s.cnt = 0; s.rev = null; s.wk = null; s.tt = null;
    s.bz = {q:[], cur:-1, bl:[], tid:0, used:0, ra:s.qs, ta:0, tu:0, only:null, st:0, tb:s.o.sys === "team" ? null : H.priv.tbk};
    clearInterval(H.priv.tick); H.priv.tick = setInterval(Akml.tick, 250); pushHost();
  },
  tbReveal(it){
    const s = H.s; if (s.wk) H.priv.tbw = s.o.sys === "team" ? s.tm[s.wk] : s.wk;
    s.rev = {a:it.a, why:it.why, src:it.src, ci:-1, w:s.wk ? (H.priv.sc[s.wk] || {}).n || "" : ""};
    s.ph = "r"; s.step = 2; s.nx = 0; H.priv.revealedK = s.sp; pushHost();
  },
  /* ---------- the host's screen ---------- */
  head(s){ const q = s.qd, k = s.q; return `<div class="row qmeta"><span class="muted">${s.tb ? `جولة فاصلة · ${s.tb.n}` : `السؤال ${s.i} من ${s.n}`}</span><span class="chip">${esc(akSecName(q.s))}</span><span class="chip lv l${q.l}">${LV_NAMES[q.l]}</span><span class="chip akmode">${AK_M[k.m]}${k.m === "c" || k.m === "t" ? ` · ${AK_LOCK[k.lock]}` : ""}</span></div>${k.tag && AK_TAG[k.tag] ? `<p class="aktag ${k.tag}">${AK_TAG[k.tag]}</p>` : ""}${k.fx ? `<p class="aktag fast">⚡ تحدي السرعة · ${k.T} ثوانٍ ومكافأة سرعة حتى ${AK_PTS.fastX}</p>` : ""}`; },
  // key: the host's screen marks the right option from the start (the index stays on the host's device, never in the room)
  optsHTML(s, rev, tag, key){
    return `<div class="opts">${range(4).map(i => `<${tag || "div"} class="opt c${i} ${rev ? (i === s.rev.ci ? "right" : "dim") : key === i ? "akkeyopt" : ""}" ${tag ? `data-ak="${i}"` : ""}><span class="sh">${SHAPES[i]}</span><span>${esc(s.qd.o[i])}</span>${rev && s.dist ? `<span class="cnt">${s.dist[i]}</span>` : !rev && key === i ? `<span class="akkeyb">✓ الصحيح</span>` : ""}</${tag || "div"}>`).join("")}</div>`;
  },
  /* the answer card: on the host's screen only, from the moment the question is shown. It is built from the host's own
     copy of the bank (H.priv), which is never written to the room: the phones receive the phrase with its gap only. */
  hidden(){ if (H.priv.akHide === undefined){ try { H.priv.akHide = !!localStorage.getItem("lm-akhide"); } catch(e){ H.priv.akHide = false; } } return H.priv.akHide; },
  keyCard(s){
    const it = H.priv.B && H.priv.B.by[H.priv.qid];
    const top = `<div class="akkey-h"><span>🔒 للمقدّم فقط</span><button class="btn ghost sm" data-h="akhide">${Akml.hidden() ? "👁 إظهار الإجابة" : "إخفاء عن الشاشة"}</button></div>`;
    if (!it) return `<div class="akkey">${top}<p class="muted">جارٍ تحميل الإجابة…</p></div>`;
    if (Akml.hidden()) return `<div class="akkey off">${top}<p class="muted">الإجابة مخفية عن هذه الشاشة (مفيد إذا كانت الشاشة معروضة للاعبين).</p></div>`;
    const ci = H.priv.ci, opt = s.qd && s.qd.o && ci >= 0 ? `<p><b>الخيار الصحيح:</b> <span class="sh">${SHAPES[ci]}</span> ${esc(s.qd.o[ci])}</p>` : "";
    return `<div class="akkey">${top}<p class="akkey-a">✅ الإجابة الصحيحة: <b>${esc(it.a)}</b></p>${it.alt.length ? `<p><b>بدائل مقبولة:</b> ${it.alt.map(esc).join("، ")}</p>` : ""}${opt}
      <p><b>العبارة الكاملة:</b> ${esc(it.pre)}<u>${esc(it.a)}</u>${esc(it.post)}</p>${it.why ? `<p class="akkey-w"><b>المعنى:</b> ${esc(it.why)}</p>` : ""}</div>`;
  },
  // typed answers as they arrive: who wrote what, the device's check, and the host's decision
  answersHTML(s){
    const q = s.q; if (!q || q.inp !== "t") return "";
    const it = H.priv.B && H.priv.B.by[H.priv.qid]; if (!it) return "";
    const rows = H.priv.arr.map(k => H.priv.ans[k]).filter(a => a && a.x != null);
    const late = Object.values(H.priv.ans).filter(a => a.late && a.x == null);
    if (!rows.length && !late.length) return `<p class="muted">الإجابات المكتوبة تظهر هنا فور وصولها.</p>`;
    const btn = (x, h, l, c) => `<button class="btn ${c} sm" data-h="${h}" data-x="${esc(x)}">${l}</button>`;
    const one = a => {
      const x = akNorm(a.x), d = H.priv.dec[x];
      let st;
      if (d) st = d === "ok" ? `<span class="chip ok">✓ قبلها المقدّم</span>` : `<span class="chip no">✗ رفضها المقدّم</span>`;
      else if (a.v === "ok") st = `<span class="chip ok">✓ مطابقة</span>`;
      else if (a.v === "?") st = `<span class="chip ask">؟ تحتاج حكمك</span><span class="row">${btn(x, "jok", "✓ أقبلها", "g")}${btn(x, "jno", "✗ أرفضها", "o")}</span>`;
      else if (akIsOpt(it, a.x)) st = `<span class="chip no">✗ خيار خاطئ</span>`;
      else st = `<span class="chip no">✗ غير مطابقة</span>${q.lock !== "turn" && s.ph !== "r" ? btn(x, "jover", "✓ اعتمدها", "ghost") : ""}`;
      return `<li><span><b>${esc(a.n)}</b> «${esc(a.x)}»</span><span class="akst">${st}</span></li>`;
    };
    return `<div class="akans"><h3>الإجابات المكتوبة</h3><ol>${rows.map(one).join("")}${late.map(a => `<li><span><b>${esc(a.n)}</b></span><span class="akst"><span class="chip no">✗ انتهى وقته</span></span></li>`).join("")}</ol>
      ${q.lock !== "turn" ? `<p class="muted aknote">«اعتمدها» لإجابة صحيحة المعنى لم يطابقها الجهاز. الحكم يُثبَّت مرة واحدة ويسري على كل من كتب الصيغة نفسها، ولا يتغير بعده.</p>` : ""}</div>`;
  },
  revHTML(s){
    const r = s.rev;
    return `<div class="akrev">${akGapHTML(s.qd, r.a, "big")}${r.w ? `<p class="akwin">✓ ${s.q.lock === "all" ? "" : "أول إجابة صحيحة: "}<b>${esc(r.w)}</b></p>` : ""}<p><b>الإجابة:</b> ${esc(r.a)}</p><p><b>المعنى:</b> ${esc(r.why)}</p>${r.src ? `<p class="muted aksrc">${esc(r.src)}</p>` : ""}</div>`;
  },
  teamBar(s, gains){
    if (s.o.sys !== "team" || !s.ts) return "";
    return `<div class="akteams">${["g", "o"].map(t => `<div class="akteam ${t}"><span>${akTN(t)}</span><b>${s.ts[t]}</b>${gains && s.tsg && s.tsg[t] ? `<em class="akgain">+${s.tsg[t]}</em>` : ""}</div>`).join("")}</div>`;
  },
  topHTML(s, me){
    return s.top.length ? `${Akml.teamBar(s, true)}<div class="lb">${s.top.map(([n, sc, g, t], i) => `<div class="${me && n === P.name ? "me" : ""}"><span>${i + 1}. ${t ? `<i class="akdot ${t}"></i>` : ""}${esc(n)}</span><span>${g ? `<em class="akgain">+${g}</em> ` : ""}<b>${sc}</b></span></div>`).join("")}</div>` : `<p class="muted">لا لاعبين على الجوالات.</p>`;
  },
  queueHTML(s, me){
    const z = s.bz; if (!z || !z.q.length) return `<p class="muted center">لم يطلب أحد الإجابة بعد.</p>`;
    return `<ol class="akq">${z.q.map(([k, n], i) => `<li class="${i === z.cur ? "on" : z.bl.includes(k) ? "out" : ""} ${k === me ? "me" : ""}"><span>${s.tm[k] ? `<i class="akdot ${s.tm[k]}"></i>` : ""}${esc(n)}</span><span class="muted">${i === z.cur ? "يجيب الآن" : z.bl.includes(k) ? "أخطأ" : z.only && s.tm[k] !== z.only ? "—" : "في الانتظار"}</span></li>`).join("")}</ol>`;
  },
  // the question's result for everybody: who answered what (after the time only), points and team points
  perQ(s){
    const rows = Object.entries(s.res).filter(([, r]) => r[1] !== -1 || r[0]).sort((a, b) => b[1][0] - a[1][0]);
    const names = Object.fromEntries(s.top.map(x => [x[0], x]));
    if (!rows.length) return `<p class="muted">لم يُجب أحد.</p>`;
    return `<div class="akpq">${rows.map(([k, r]) => { const n = (H && H.priv.sc[k] || {}).n || k; return `<span class="chip ${r[1] === 1 ? "ok" : "no"}">${r[1] === 1 ? "✓" : "✗"} ${esc(n)}${r[0] ? ` +${r[0]}` : ""}</span>`; }).join("")}</div>`;
  },
  finHTML(s, me){
    const f = s.fin || [], team = s.o.sys === "team";
    let hero;
    if (team){
      const w = s.tf.filter(x => x.p === 1);
      hero = s.tres === "none" ? `<div class="akhero"><h2>انتهت المباراة دون فائز</h2><p class="muted">لم يسجّل أي فريق نقاطًا.</p></div>`
        : s.tres === "tie" ? `<div class="akhero"><p class="muted">النتيجة</p><h2>تعادل</h2><p>${s.tf[0].tot} نقطة لكل فريق، وعدد الإجابات الصحيحة نفسه. لا مكافأة فوز في التعادل.</p>${s.tbr ? `<p class="muted">لم تحسم الجولة الفاصلة التعادل.</p>` : ""}</div>`
        : `<div class="akhero"><span class="akcrown">👑</span><p class="muted">الفريق الفائز</p><h2 class="t${w[0].t}">${akTN(w[0].t)}</h2><p>${w[0].tot} نقطة <span class="muted">(${w[0].s} من الأسئلة + ${AK_PTS.win} مكافأة الفوز)</span></p>${s.tbr ? `<p class="muted">حُسم التعادل بجولة فاصلة</p>` : ""}</div>`;
      hero += `<div class="aktf">${s.tf.map(x => `<div class="aktfc ${x.t}"><h3>${s.tres === "win" && x.p === 1 ? "🏆 " : ""}${x.p ? `<span class="muted">${x.p === 1 && s.tres === "tie" ? "متعادل" : x.p === 1 ? "الأول" : "الثاني"} · </span>` : ""}${akTN(x.t)}</h3><p class="aktot">${x.tot}</p><p class="muted">${x.s} من الأسئلة${x.w ? ` + ${x.w} مكافأة الفوز` : ""} · ${x.r} إجابة صحيحة</p><table class="aktable sm"><thead><tr><th>العضو</th><th>مساهمته في الفريق</th><th>نقاطه</th><th>✓</th><th>✗</th></tr></thead><tbody>${x.m.map(m => `<tr class="${me && m[0] === P.name ? "me" : ""}"><td>${esc(m[0])}</td><td><b>${m[4]}</b></td><td>${m[1]}</td><td>${m[2]}</td><td>${m[3]}</td></tr>`).join("")}</tbody></table></div>`).join("")}</div><p class="muted aknote">${s.o.tsc === "avg" ? "نقاط الفريق في كل سؤال يجيب فيه الجميع = متوسط نقاط أعضائه (مقرّبًا لعدد صحيح)، وتُقسم على من سجّل منهم؛ لذلك مجموع مساهمات الأعضاء يساوي نقاط الفريق تمامًا." : "نقاط الفريق = مجموع نقاط أعضائه في الأسئلة. «مساهمته» هي ما أضافه العضو لفريقه."}</p>`;
    } else {
      const win = f.filter(x => x[6]);
      hero = win.length ? `<div class="akhero"><span class="akcrown">👑</span><p class="muted">${win.length > 1 ? "فوز مشترك" : "الفائز"}</p><h2>${win.map(x => esc(x[0])).join(" و")}</h2><p>${win[0][7]} نقطة <span class="muted">(${win[0][7] - AK_PTS.win} من الأسئلة + ${AK_PTS.win} مكافأة الفوز)</span></p>${s.tbr ? `<p class="muted">${s.tbr.w ? "حُسم التعادل بجولة فاصلة" : "لم تحسم الجولة الفاصلة التعادل، فطُبقت قواعد الحسم"}</p>` : ""}</div>`
        : s.tres === "tie" ? `<div class="akhero"><p class="muted">النتيجة</p><h2>تعادل</h2><p>${(s.ties || []).map(esc).join(" و")}: متساوون في النقاط والإجابات الصحيحة والأخطاء والوقت. لا مكافأة فوز في التعادل.</p>${s.tbr ? `<p class="muted">لم تحسم الجولة الفاصلة التعادل.</p>` : ""}</div>`
        : `<div class="akhero"><h2>انتهت المباراة دون فائز</h2><p class="muted">لم يسجّل أي لاعب نقاطًا.</p></div>`;
    }
    const rows = f.map(x => `<tr class="${x[6] ? "win" : ""} ${me && x[0] === P.name ? "me" : ""}"><td>${x[8] || "—"}</td><td>${x[1] ? `<i class="akdot ${x[1]}"></i>` : ""}${esc(x[0])}</td><td>${x[2]}</td><td>${x[3]}</td><td>${x[4]}</td><td>${x[5]}</td>${team ? "" : `<td>${x[6] ? "+" + x[6] : "—"}</td>`}<td><b>${x[7]}</b></td></tr>`).join("");
    return hero + (f.length ? `<h3>ترتيب اللاعبين</h3><div class="aktable-w"><table class="aktable"><thead><tr><th>#</th><th>اللاعب</th><th><span class="akl">صحيحة</span><span class="aks">✓</span></th><th><span class="akl">خاطئة</span><span class="aks">✗</span></th><th><span class="akl">نقاط الإجابات</span><span class="aks">إجابات</span></th><th><span class="akl">مكافآت السرعة</span><span class="aks">سرعة</span></th>${team ? "" : `<th><span class="akl">مكافأة الفوز</span><span class="aks">فوز</span></th>`}<th><span class="akl">المجموع</span><span class="aks">المجموع</span></th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted aknote aklegend">✓ صحيحة · ✗ خاطئة · إجابات: نقاط الإجابات · سرعة: مكافآت السرعة · فوز: مكافأة الفوز</p><p class="muted aknote">الترتيب بالمجموع، ثم الأكثر إجابات صحيحة، ثم الأقل أخطاء، ثم الأقصر وقتًا في الإجابات الصحيحة.</p>` : "");
  },
  // the host's settings, in sections; only what fits the chosen competition and method is shown
  lobby(players){
    const s = H.s, o = akFix(s.o), B = AK_BANK, team = o.sys === "team";
    if (!B && !H.priv.bankAsked){ H.priv.bankAsked = true; akLoad().then(() => { if (H && H.g === "akml") renderHost(); }).catch(() => { if (H){ H.priv.bankErr = true; renderHost(); } }); }
    if (!s.tm || !Object.keys(s.tm).length) s.tm = {...(H.priv.tmk || {})};
    if (team) Akml.teamsFill();
    const seg = (key, list, cur) => `<div class="seg wrap">${list.map(([v, l]) => `<button class="${cur === v ? "on" : ""}" data-opt="${key}" data-val="${esc(v)}">${esc(l)}</button>`).join("")}</div>`;
    const tog = (k, l) => `<button class="${o[k] ? "on" : ""}" data-h="set" data-k="${k}">${o[k] ? "✓ " : ""}${l}</button>`;
    const row = (label, html) => `<div class="optrow"><span class="optlabel">${label}</span>${html}</div>`;
    const sec = (h, body) => `<div class="aksetsec"><h4>${h}</h4>${body}</div>`;
    const m = o.m, kinds = (m === "mx" ? o.mix : [m]);
    let how = AK_MDESC[m];
    let meth = row("الطريقة", seg("m", akMethods(o).map(x => [x, AK_M[x]]), m));
    if (m === "c" || m === "t") meth += row("قفل الإجابة", seg("lock", [["all", AK_LOCK.all], ["first", AK_LOCK.first]], o.lock));
    if (m === "s") meth += row("شكل الإجابة", seg("sinp", [["c", "اختيار من أربعة"], ["t", "كتابة"]], o.sinp));
    if (kinds.includes("b")) meth += row("إجابة صاحب الدور", seg("binp", [["t", "يكتبها في جواله"], ["o", "شفهيًا ويحكم المقدّم"]], o.binp))
      + row("مدة إجابة صاحب الدور", seg("bt", [[10, "10 ث"], [15, "15 ث"], [20, "20 ث"], [30, "30 ث"]], +o.bt))
      + (o.binp === "o" ? row("بدء وقت الإجابة الشفهية", seg("bst", [["auto", "تلقائيًا عند أخذ الدور"], ["man", "يدويًا بزر المقدّم"]], o.bst)) : "");
    if (kinds.includes("tt")) meth += row("إجابة الفريق", seg("tinp", [["c", "اختيار من أربعة"], ["t", "كتابة"], ["o", "شفهيًا"]], o.tinp));
    if (team && (kinds.includes("tt") || kinds.includes("b"))) meth += row("سرقة الإجابة", `<div class="seg wrap">${tog("steal", "إذا أخطأ صاحب الدور تنتقل الفرصة للفريق الآخر")}</div>`);
    if (kinds.includes("tt")) meth += row("يبدأ", seg("first", [["g", akTN("g")], ["o", akTN("o")], ["rnd", "قرعة"]], o.first)) + row("من يجيب عن الفريق", seg("ord", [["join", "بالتناوب حسب الدخول"], ["rnd", "بالتناوب بترتيب عشوائي"], ["host", "يختاره المقدّم قبل كل سؤال"]], o.ord));
    if (m === "mx") meth += row("الأنماط المختلطة", `<div class="seg wrap">${akMixable(o).map(x => `<button class="${o.mix.includes(x) ? "on" : ""}" data-h="set" data-k="mix" data-v="${x}">${o.mix.includes(x) ? "✓ " : ""}${AK_M[x]}</button>`).join("")}</div>`);
    if (m !== "c" && m !== "t") meth += row("قفل الإجابة", `<span class="muted">${m === "mx" ? "حسب نمط كل سؤال" : AK_LOCK[akKind(m, o).lock]}</span>`);
    const secsRow = `<div class="seg wrap"><button class="${!o.secs.length ? "on" : ""}" data-h="set" data-k="secs" data-v="all">الكل</button>${AK_SECS.map(([v, l]) => `<button class="${o.secs.includes(v) ? "on" : ""}" data-h="set" data-k="secs" data-v="${v}">${l}</button>`).join("")}</div>`;
    const nsec = o.secs.length || AK_SECS.length;
    const qs = row("الأقسام", secsRow) + (nsec > 1 ? row("التبديل بين الأقسام", seg("sw", [["rot", "بالتناوب"], ["blk", "قسم بعد قسم"], ["rnd", "عشوائي"]], o.sw)) : "")
      + row("الصعوبة", seg("dif", [["all", "الكل"], ["0", "سهل"], ["1", "متوسط"], ["2", "صعب"], ["up", "متدرّج"]], String(o.dif))) + row("عدد الأسئلة", seg("n", [[10, "10"], [15, "15"], [20, "20"], [30, "30"]], o.n));
    const tm = row("مدة الإجابة", seg("t", [[10, "10 ث"], [15, "15 ث"], [20, "20 ث"], [30, "30 ث"]], o.t)) + row("السؤال التالي", seg("go", [["man", "يدويًا"], ["auto", "تلقائيًا بعد 8 ث"]], o.go));
    const fastOk = kinds.some(x => x === "c" || x === "t") && (o.lock === "all" || m === "mx");
    const sp = `<div class="seg wrap">${tog("gold", "جولة ذهبية ×2")}${tog("fin", "جولة نهائية ×3")}${tog("surp", "أسئلة مفاجئة ×2")}${fastOk ? tog("fast", "تحدي السرعة") : ""}</div><p class="muted aknote">الذهبية: ثلاثة أسئلة في منتصف المباراة. النهائية: آخر ثلاثة أسئلة. المفاجئة: أسئلة لا يُعرف مكانها مسبقًا.${fastOk ? ` تحدي السرعة: سؤال من كل أربعة بـ${AK_FAST_T} ثوانٍ ومكافأة سرعة حتى ${AK_PTS.fastX}.` : ""}</p>`;
    const tie = row("عند التعادل", seg("tie", [["rules", "قواعد الحسم"], ["round", "جولة فاصلة"]], o.tie));
    const avail = B ? akAvail(B, o) : 0;
    const info = H.priv.bankErr ? `<p class="note">تعذّر تحميل الأسئلة. تحقق من الاتصال ثم أعد المحاولة.</p>`
      : B ? `<p class="muted">${avail.toLocaleString("ar")} سؤالًا يناسب هذه الإعدادات${avail < o.n ? `، فتكون المباراة ${avail.toLocaleString("ar")} سؤالًا` : ""}. لا يتكرر سؤال داخل المباراة.${team && kinds.includes("tt") && m === "tt" && o.n % 2 ? " يُضاف سؤال ليتساوى الفريقان في عدد الأدوار." : ""}</p>` : `<p class="muted">جارٍ تجهيز الأسئلة…</p>`;
    // the players: teams with their members; the host taps a player to move him to the other team
    let pl;
    if (team){
      const col = t => players.filter(p => s.tm[dfKey(pname(p))] === t).map(p => `<button class="chip ${t} ${p.away ? "away" : ""}" data-h="tmove" data-k="${esc(dfKey(pname(p)))}">${esc(pname(p))}</button>`).join("") || `<span class="muted">لا أحد</span>`;
      const ng = players.filter(p => s.tm[dfKey(pname(p))] === "g").length, no = players.length - ng;
      pl = `<div class="stack"><div><b class="tg">${akTN("g")}</b> <span class="muted">(${ng})</span><div class="chips">${col("g")}</div></div><div><b class="to">${akTN("o")}</b> <span class="muted">(${no})</span><div class="chips">${col("o")}</div></div>
        <p class="muted aknote">اضغط اسم لاعب لنقله إلى الفريق الآخر. لا يغيّر اللاعب فريقه بنفسه.</p><button class="btn ghost sm" data-h="tauto">🔀 توزيع تلقائي متوازن</button>${ng && no ? (Math.abs(ng - no) > 1 ? `<p class="note">الفريقان غير متساويين. في «الجميع يجيب» تُحسب للفريق متوسط نقاط أعضائه.</p>` : "") : `<p class="note">يحتاج كل فريق لاعبًا واحدًا على الأقل.</p>`}</div>`;
    } else pl = playerChips(players, false);
    const ok = Akml.canStart(o);
    return `<div class="layout"><div class="panel stack"><h2 class="lob-h">أكملها</h2>
        ${sec("المنافسة", row("النظام", seg("sys", [["solo", "منافسة فردية"], ["team", "فريقان"]], o.sys)) + (team ? row("اسما الفريقين", `<div class="aktn">${["g", "o"].map(t => `<label class="aktnl ${t}"><span>${TEAM[t]}</span><input class="field sm" id="akTn_${t}" data-t="${t}" maxlength="18" dir="rtl" autocomplete="off" placeholder="الفريق ${TEAM[t]}" value="${esc(o.tn[t] || "")}"></label>`).join("")}</div>`)
          + row("نقاط الفريق", seg("tsc", [["sum", "مجموع نقاط أعضائه"], ["avg", "متوسط نقاط أعضائه"]], o.tsc)) + `<p class="muted aknote">${o.tsc === "avg" ? "المتوسط يناسب الفريقين غير المتساويين في العدد، ويُطبَّق حين يجيب الجميع. في الأنماط التي يجيب فيها لاعب واحد يحصل الفريق على نقاط ذلك اللاعب." : "المجموع أوضح حين يتساوى الفريقان في العدد. إذا اختلف العدد فالمتوسط أعدل."}</p>` : ""))}
        ${sec("طريقة الإجابة", meth + `<p class="muted aknote">${how}</p>`)}
        ${sec("الأسئلة", qs)}${sec("الوقت والانتقال", tm)}${sec("جولات خاصة", sp)}${sec("التعادل", tie)}
        ${info}<div><button class="btn big" data-h="start" ${ok ? "" : "disabled"}>ابدأ المباراة</button></div></div>
      <div class="panel stack"><h3>${team ? "الفرق" : "اللاعبون"}</h3>${pl}${soloNote()}</div></div>`;
  },
  bindTn(){
    const D = H.priv.tnD || (H.priv.tnD = {});
    for (const inp of document.querySelectorAll("[id^=akTn_]")){
      const t = inp.dataset.t;
      if (D[t] != null) inp.value = D[t];
      inp.oninput = () => { D[t] = inp.value; };
      inp.onfocus = () => { H.priv.tnF = t; };
      inp.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); inp.blur(); } };
      inp.onblur = () => { if (H.priv.tnF === t) H.priv.tnF = null; const v = akTNameClean(inp.value); delete D[t];
        if ((H.s.o.tn || {})[t] !== v){ H.s.o.tn = {...(H.s.o.tn || {}), [t]:v}; akFix(H.s.o); pushHost(); } };
      if (H.priv.tnF === t && document.activeElement !== inp){ inp.focus(); const n = inp.value.length; try { inp.setSelectionRange(n, n); } catch(e){} }
    }
  },
  host(players){
    const s = H.s; let html;
    if (s.ph === "lobby"){ setMain(Akml.lobby(players)); return Akml.bindTn(); }
    const q = s.q, team = s.o.sys === "team";
    const pendHTML = () => Akml.answersHTML(s), key = Akml.keyCard(s), kci = Akml.hidden() ? -1 : H.priv.ci;
    if (s.ph === "q" && srvNow() < s.qs){
      const tt = s.tt, pick = tt && tt.wait;
      const picker = pick ? `<p class="muted">اختر من يجيب عن ${akTN(tt.t)}. المقترح حسب التناوب: <b>${esc(tt.n || "—")}</b></p><div class="chips akpick">${players.filter(p => s.tm[dfKey(pname(p))] === tt.t).map(p => { const k = dfKey(pname(p));
        return `<button class="chip ${tt.t} ${k === tt.k ? "on" : ""} ${p.away ? "away" : ""}" data-h="ttpick" data-k="${esc(k)}" ${p.away ? "disabled" : ""}>${k === tt.k ? "★ " : ""}${esc(pname(p))}${p.away ? " · غير متصل" : ""}</button>`; }).join("")}</div>` : "";
      html = `<div class="panel center stack akget">${Akml.head(s)}${tt ? `<p class="bigmsg">${tt.steal ? "فرصة السرقة: " : "الدور: "}<span class="t${tt.t}">${akTN(tt.t)}</span></p>${pick ? picker : `<p class="muted">يجيب ${esc(tt.n || "—")}</p>`}` : `<p class="bigmsg">استعدّوا…</p>`}${pick ? "" : `<span class="timer">${akSec(s.qs - srvNow())}</span>`}${key}</div>`;
    } else if (s.ph === "q"){
      const left = akSec(akLeft(s));
      let side;
      if (q.m === "b"){
        const z = s.bz, cur = z.cur >= 0 ? z.q[z.cur] : null, tl = akSec(akTurnLeft(s)), oral = q.inp === "o";
        side = `<div class="panel stack"><div class="row" style="justify-content:space-between"><span class="timer ${left <= 5 ? "warn" : ""}">${cur ? "⏸" : left}</span><span class="chip">${cur ? "الوقت متوقف أثناء الإجابة" : z.only ? `باب الإجابة لـ${akTN(z.only)} فقط` : "باب الإجابة مفتوح"}</span></div>${key}
          ${cur ? `<div class="akturn"><p class="muted">الدور الآن</p><h3>${s.tm[cur[0]] ? `<i class="akdot ${s.tm[cur[0]]}"></i>` : ""}${esc(cur[1])}</h3><span class="timer sm ${z.ta && tl <= 3 ? "warn" : ""}">${z.ta || !oral ? tl : +s.o.bt || AK_TURN} ث</span>${oral && z.ta && tl <= 0 ? `<p class="note">انتهى وقت الإجابة. احكم على ما قاله اللاعب.</p>` : ""}
            ${oral ? `<div class="row" style="justify-content:center">${z.ta ? `<button class="btn ghost sm" data-h="bstop" data-tid="${z.tid}">⏸ أوقف الوقت</button>` : `<button class="btn ghost sm" data-h="bgo" data-tid="${z.tid}">▶ ابدأ وقت الإجابة</button>`}</div>
            <div class="row" style="justify-content:center"><button class="btn g" data-h="bok" data-tid="${z.tid}">✓ إجابة صحيحة</button><button class="btn o" data-h="bno" data-tid="${z.tid}">✗ إجابة خاطئة</button></div>` : `<p class="muted">يكتب إجابته في جواله، ويحكم الجهاز عليها.</p>`}</div>` : ""}
          ${pendHTML()}<h3>ترتيب طلب الإجابة</h3>${Akml.queueHTML(s)}
          <div class="row">${s.tb ? "" : `<button class="btn ghost sm" data-h="close">إنهاء السؤال</button><button class="btn ghost sm" data-h="skip">تخطّي السؤال</button>`}</div></div>`;
      } else if (q.m === "tt"){
        const t = s.tt;
        side = `<div class="panel stack"><div class="row" style="justify-content:space-between"><span class="timer ${left <= 5 ? "warn" : ""}">${left}</span><span class="chip t${t.t}">${t.steal ? "فرصة سرقة" : "الدور"}: ${akTN(t.t)}</span></div>${key}
          <div class="akturn"><p class="muted">يجيب</p><h3><i class="akdot ${t.t}"></i>${esc(t.n || "لا أحد متصل")}</h3>${t.moved ? `<p class="muted">انتقل الدور إليه لأن صاحب الدور غير متصل، وله دوره حين يعود.</p>` : ""}${!t.k ? `<p class="note">لا أحد من الفريق متصل. ينتقل الدور تلقائيًا إذا عاد أحدهم، أو تخطَّ السؤال.</p>` : ""}
          ${q.inp === "o" ? `<div class="row" style="justify-content:center"><button class="btn g" data-h="bok" data-tid="${t.tid}">✓ إجابة صحيحة</button><button class="btn o" data-h="bno" data-tid="${t.tid}">✗ إجابة خاطئة</button></div>` : `<p class="muted">يجيب من جواله، ويحكم الجهاز.</p>`}</div>
          ${pendHTML()}${Akml.teamBar(s)}<div class="row"><button class="btn ghost sm" data-h="close">إنهاء السؤال</button><button class="btn ghost sm" data-h="skip">تخطّي السؤال</button></div></div>`;
      } else {
        side = `<div class="panel stack"><div class="row" style="justify-content:space-between"><span class="timer ${left <= 5 ? "warn" : ""}">${left}</span><span class="chip">أجاب ${s.cnt} من ${players.length}</span></div>${key}
          <div class="tbar"><i style="width:${akLeft(s) / (q.T * 10)}%"></i></div>${q.lock === "first" ? `<p class="muted">أول إجابة صحيحة تُنهي السؤال على الجميع.</p>` : ""}${pendHTML()}
          ${Akml.teamBar(s)}<div class="row"><button class="btn" data-h="close">إنهاء الوقت الآن</button><button class="btn ghost sm" data-h="skip">تخطّي السؤال</button></div>${soloNote()}</div>`;
      }
      html = `<div class="layout"><div class="panel stack akcard">${Akml.head(s)}${akGapHTML(s.qd, null, "big")}${q.inp === "c" ? Akml.optsHTML(s, false, null, kci) : ""}</div>${side}</div>`;
    } else if (s.ph === "judge"){
      html = `<div class="layout"><div class="panel stack akcard">${Akml.head(s)}${akGapHTML(s.qd, null, "big")}${q.inp === "c" ? Akml.optsHTML(s, false, null, kci) : ""}</div>
        <div class="panel stack"><h3>إجابة تحتاج حكمك</h3><p class="muted">لم يعتمدها الجهاز تلقائيًا. قارنها بالإجابة المعتمدة واقبلها إن كانت صحيحة. اللاعبون لا يرون الإجابة حتى ينتهي السؤال.</p>${key}${pendHTML()}${s.tb ? "" : `<button class="btn ghost sm" data-h="skip">تخطّي السؤال</button>`}</div></div>`;
    } else if (s.ph === "r"){
      const auto = s.o.go === "auto" && s.nx ? Math.max(0, akSec(s.nx - srvNow())) : null;
      const tpanel = team && H.priv.tpanel ? `<div class="stack akmove"><p class="muted">اضغط اسم لاعب لنقله إلى الفريق الآخر. نقاطه السابقة تبقى لفريقه السابق.</p>${["g", "o"].map(t => `<div><b class="t${t}">${akTN(t)}</b><div class="chips">${players.filter(p => s.tm[dfKey(pname(p))] === t).map(p => `<button class="chip ${t}" data-h="tmove" data-k="${esc(dfKey(pname(p)))}">${esc(pname(p))}</button>`).join("")}</div></div>`).join("")}</div>` : "";
      html = `<div class="layout"><div class="panel stack akcard">${Akml.head(s)}${q.inp === "c" ? Akml.optsHTML(s, true) : ""}${Akml.revHTML(s)}<h3>نتيجة السؤال</h3>${Akml.perQ(s)}</div>
        <div class="panel stack"><h3>الترتيب</h3>${Akml.topHTML(s)}
        <button class="btn" data-h="next">${s.tb ? "متابعة" : s.i >= s.n ? "النتيجة النهائية" : auto != null ? `السؤال التالي (${auto})` : "السؤال التالي"}</button>${s.i < s.n && !s.tb ? `<button class="btn ghost sm" data-h="final">إنهاء المباراة الآن</button>` : ""}${team && !s.tb ? `<button class="btn ghost sm" data-h="teams">تعديل الفرق</button>${tpanel}` : ""}</div></div>`;
    } else {
      html = `<div class="panel stack endcard akend" style="margin-top:18px">${Akml.finHTML(s)}
        <div class="row" style="justify-content:center"><button class="btn" data-h="start">مباراة جديدة بنفس الإعدادات</button></div></div>`;
    }
    setMain(html);
  },
  /* ---------- the phone ---------- */
  plobby(s){ const t = s.o && s.o.sys === "team" && s.tm ? s.tm[dfKey(P.name)] : ""; return t ? `<p class="chip ${t}" style="align-self:center">فريقك: ${akTN(t)}</p><p class="muted">المقدّم يوزّع الفرق.</p>` : ""; },
  mine(s){
    const key = s.sp + "|" + (s.q && s.q.lock === "turn" ? (s.bz ? s.bz.tid : s.tt ? s.tt.tid : 0) : 0);
    if (!P.view.akA || P.view.akA.key !== key){ const sv = seatProg("akml"); P.view.akA = sv && sv.key === key && sv.q === s.qs ? sv : null; }
    return P.view.akA;
  },
  async psend(){
    const a = P.view.akA, h = findHost(), hs = h && h.presence.s;
    if (!a || !hs || !hs.hk || hs.sp !== a.i || hs.ph !== "q") return;
    try {
      const me = await DFC.mine(), k = dfKey(P.name);
      const e = await DFC.seal(await DFC.shared(me, hs.hk), {i:a.i, t:a.t, c:a.c, x:a.x, at:a.at}, akAd("up", P.code, a.i, k));
      const ak = {i:a.i, t:a.t || 0, pk:me.pub, e}; if (P.view.akBz === a.i) ak.bz = 1; const pres = {ak};
      seatProg("pres", pres); await NR.presence(pres);
    } catch(err){ console.warn(err); }
  },
  answer(v){
    const h = findHost(), s = h && h.presence.s; if (!s || s.ph !== "q" || !s.qd || srvNow() < s.qs || akLeft(s) <= 0) return;
    if (Akml.mine(s) || !Akml.canAnswer(s)) return;              // one answer per question (per turn)
    const t = s.q.lock === "turn" ? (s.bz ? s.bz.tid : s.tt.tid) : 0;
    const a = {i:s.sp, t, key:s.sp + "|" + t, q:s.qs, at:srvNow(), ...v};   // q: this question's start, so an answer is never taken for another question
    P.view.akA = a; seatProg("akml", a); P.view.akReAt = Date.now();
    Akml.psend(); playerRender();
  },
  canAnswer(s){
    const me = dfKey(P.name), q = s.q;
    if (q.lock !== "turn") return true;
    if (q.inp === "o") return false;
    return q.m === "b" ? s.bz.cur >= 0 && s.bz.q[s.bz.cur][0] === me : s.tt.k === me;
  },
  buzz(){
    const h = findHost(), s = h && h.presence.s; if (!s || s.ph !== "q" || s.q.m !== "b" || srvNow() < s.qs) return;
    const me = dfKey(P.name), z = s.bz;
    if (z.bl.includes(me) || z.q.some(x => x[0] === me) || P.view.akBz === s.sp || (z.only && s.tm[me] !== z.only) || (z.tb && !z.tb.includes(me)) || (s.tb && s.o.sys === "team" && !s.tb.keys.includes(s.tm[me]))) return;
    P.view.akBz = s.sp; const pres = {ak:{i:s.sp, bz:1}};
    seatProg("pres", pres); NR.presence(pres).catch(() => {}); playerRender();
  },
  player(s){
    const me = dfKey(P.name), now = srvNow(), myT = s.tm && s.tm[me];
    if (!DFC.ok() && s.q && s.q.inp !== "o"){ pSet(phead() + `<div class="panel center stack"><p class="bigmsg">هذا المتصفح لا يدعم اللعبة</p><p class="muted">افتح الرابط في متصفح حديث مثل Safari أو Chrome.</p></div>`); bindPlayer(); return; }
    const badge = myT ? `<span class="chip ${myT}">${akTN(myT)}</span>` : "";
    let frame, live = {};
    const put = (f, html, after) => { f += "|" + (myT || ""); if (P.view.akF !== f){ P.view.akF = f; pSet(html); bindPlayer(); if (after) after(); } };
    if (s.ph === "end"){
      const r = s.res[me];
      put(`end|${s.sp}|${JSON.stringify(s.fin)}`, phead(badge) + `<div class="panel stack endcard akend">${r && r[0] ? `<p class="center akmine">ترتيبك <b>${r[0]}</b> بمجموع ${r[1]} نقطة${r[2] ? ` (منها +${r[2]} مكافأة الفوز)` : ""}</p>` : ""}${Akml.finHTML(s, me)}<p class="muted center">بانتظار المقدّم…</p></div>`);
      return;
    }
    if (!s.qd || !s.q){ put("wait|" + s.sp, phead(badge) + `<div class="panel center stack"><p class="bigmsg">بانتظار المقدّم…</p></div>`); return; }
    const q = s.q, a = Akml.mine(s);
    // after a reload (or a lost write) the sealed answer is sent again until the host has it; the host keeps the first one
    if (s.ph === "q" && a && q.inp !== "o" && s.hk && !s.got.includes(me) && Date.now() - (P.view.akReAt || 0) > 2500){ P.view.akReAt = Date.now(); Akml.psend(); }
    const card = extra => `<div class="panel stack akcard">${Akml.head(s)}${akGapHTML(s.qd, null, "")}${extra || ""}`;
    const optsBtns = () => `<div class="opts">${range(4).map(i => `<button class="opt c${i}" data-ak="${i}"><span class="sh">${SHAPES[i]}</span><span>${esc(s.qd.o[i])}</span></button>`).join("")}</div><p class="muted aknote">اختيارك نهائي ولا يمكن تغييره.</p>`;
    const typeForm = note => `<form class="akform" id="akForm" autocomplete="off"><input class="field" id="akIn" maxlength="40" dir="rtl" lang="ar" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="اكتب الكلمة الناقصة" aria-label="الكلمة الناقصة"><button class="btn" data-act="aksend">أرسل</button></form><p class="muted aknote">${note || "لديك محاولة واحدة، ولا يمكن تعديل الإجابة بعد الإرسال."}</p>`;
    const bindForm = () => { const f = $("#akForm"), inp = $("#akIn"), key = s.sp + "|" + (q.lock === "turn" ? (s.bz ? s.bz.tid : s.tt.tid) : 0);
      if (inp){ inp.value = P.view.akDraft && P.view.akDraft[0] === key ? P.view.akDraft[1] : ""; inp.oninput = () => { P.view.akDraft = [key, inp.value]; }; if (q.lock === "turn") inp.focus(); }
      if (f) f.onsubmit = e => { e.preventDefault(); Akml.sendTyped(); }; };
    const sent = () => q.inp === "c" ? `<p class="bigmsg">تم تسجيل إجابتك</p><div class="opt c${a.c}" style="justify-content:center"><span class="sh">${SHAPES[a.c]}</span><span>${esc(s.qd.o[a.c])}</span></div>` : `<p class="bigmsg">تم إرسال إجابتك</p><p class="aksent">«${esc(a.x)}»</p>`;
    if (s.ph === "q" && now < s.qs){
      live.akClock = s.tt && s.tt.wait ? "" : `<span class="timer">${akSec(s.qs - now)}</span>`;
      const tt = s.tt && s.tt.wait ? `<p class="bigmsg">${s.tt.t === myT ? "دور فريقك" : "دور الفريق الآخر"}</p><p class="muted">المقدّم يختار من يجيب عن ${akTN(s.tt.t)}…</p>` : s.tt ? `<p class="bigmsg">${s.tt.t === myT ? (s.tt.steal ? "فرصة سرقة لفريقك!" : "دور فريقك") : s.tt.steal ? "فرصة سرقة للفريق الآخر" : "دور الفريق الآخر"}</p><p class="muted">${s.tt.k === me ? "أنت من يجيب" : "يجيب " + esc(s.tt.n || "—")}</p>` : `<p class="bigmsg">استعدّ…</p>`;
      put(`get|${s.sp}|${s.tt ? s.tt.tid + "|" + s.tt.wait : 0}`, phead(badge) + `<div class="panel center stack akget"><p class="muted">${s.tb ? "جولة فاصلة" : `السؤال ${s.i} من ${s.n}`} · ${esc(akSecName(s.qd.s))}</p>${q.tag && AK_TAG[q.tag] ? `<p class="aktag ${q.tag}">${AK_TAG[q.tag]}</p>` : ""}${q.fx ? `<p class="aktag fast">⚡ تحدي السرعة</p>` : ""}${tt}<div id="akClock"></div></div>`);
    } else if (s.ph === "q"){
      const left = akLeft(s);
      live.akClock = `<span class="timer sm ${left <= 5000 ? "warn" : ""}">${q.m === "b" && s.bz.cur >= 0 ? "⏸" : akSec(left)}</span>`;
      if (q.m === "b"){
        const z = s.bz, i = z.q.findIndex(x => x[0] === me), out = z.bl.includes(me), mineTurn = z.cur >= 0 && z.q[z.cur][0] === me;
        const barred = (z.only && myT !== z.only) || (z.tb && !z.tb.includes(me)) || (s.tb && s.o.sys === "team" && !s.tb.keys.includes(myT));
        const st = out ? "out" : mineTurn ? (q.inp === "t" ? (a ? "sent" : "type") : "turn") : i >= 0 || P.view.akBz === s.sp ? "wait" : barred ? "barred" : left <= 0 ? "late" : "open";
        const btn = st === "open" ? `<button class="akbz" data-act="akbz">أعرف الإجابة</button>`
          : st === "type" ? `<div class="akturn me"><p class="bigmsg">دورك! اكتب الإجابة</p><span id="akTurn"></span></div>${typeForm("محاولة واحدة في دورك.")}`
          : st === "sent" ? sent() : st === "turn" ? `<div class="akturn me"><p class="bigmsg">دورك! أجب بصوتك</p><p class="muted">المقدّم يحكم على إجابتك.</p></div>`
          : st === "wait" ? `<p class="bigmsg">طلبت الإجابة</p><p class="muted">ترتيبك يظهر أدناه. لا تُفتح خانة الكتابة إلا لصاحب الدور.</p>`
          : st === "barred" ? `<p class="bigmsg">${s.tb ? "الجولة الفاصلة للمتعادلين فقط" : "الفرصة الآن للفريق الآخر"}</p>`
          : st === "out" ? `<p class="bigmsg akno">إجابتك لم تكن صحيحة</p><p class="muted">لا يمكنك الإجابة مرة أخرى في هذا السؤال.</p>` : `<p class="bigmsg">انتهى الوقت</p>`;
        put(`b|${s.sp}|${st}|${z.tid}`, phead(badge + `<span id="akClock"></span>`) + card(`<div class="center stack">${btn}</div>`) + `</div><div class="panel stack"><h3>ترتيب طلب الإجابة</h3><div id="akQ"></div></div>`, st === "type" ? bindForm : null);
        live.akQ = Akml.queueHTML(s, me);
        if (st === "type") live.akTurn = `<span class="timer sm">${akSec(akTurnLeft(s))}</span>`;
      } else if (q.m === "tt"){
        const t = s.tt, onMe = t.k === me;
        const st = onMe ? (q.inp === "o" ? "oral" : a ? "sent" : "ans") : t.t === myT ? "team" : "other";
        const body = st === "ans" ? `<div class="akturn me"><p class="bigmsg">${t.steal ? "فرصة سرقة لفريقك! أجب" : "دورك! أجب عن فريقك"}</p></div>` + (q.inp === "c" ? optsBtns() : typeForm("محاولة واحدة.")) : st === "sent" ? sent() : st === "oral" ? `<div class="akturn me"><p class="bigmsg">دورك! أجب بصوتك</p></div>`
          : `<p class="bigmsg">${st === "team" ? "دور فريقك" : "دور الفريق الآخر"}</p><p class="muted">يجيب ${esc(t.n || "—")}${t.steal ? " (فرصة سرقة)" : ""}</p>`;
        put(`tt|${s.sp}|${t.tid}|${st}`, phead(badge + `<span id="akClock"></span>`) + card(`<div class="center stack">${body}</div>`) + `</div>`, st === "ans" && q.inp === "t" ? bindForm : null);
      } else {
        const st = a ? "sent" : left <= 0 ? "late" : "ans";
        const body = st === "ans" ? (q.inp === "c" ? optsBtns() : typeForm(q.lock === "first" ? "أول إجابة صحيحة تفوز. لديك محاولة واحدة." : null)) : st === "sent" ? sent() + `<p class="muted" id="akGot"></p>` : `<p class="bigmsg">انتهى الوقت</p><p class="muted">بانتظار الإجابة الصحيحة…</p>`;
        put(`a|${s.sp}|${st}`, phead(badge + `<span id="akClock"></span>`) + card(body) + `</div>`, st === "ans" && q.inp === "t" ? bindForm : null);
        live.akGot = s.got.includes(me) ? `وصلت إجابتك إلى المقدّم · أجاب ${s.cnt}` : "جارٍ إرسال إجابتك…";
      }
    } else if (s.ph === "judge"){
      put(`judge|${s.sp}`, phead(badge) + card(`<p class="bigmsg">لحظة…</p><p class="muted center">المقدّم يراجع إجابة مكتوبة.</p>`) + `</div>`);
    } else if (s.ph === "r"){
      const r = s.res[me] || null, ok = r && r[1] === 1;
      const said = q.inp === "c" && a ? `<p class="muted">اخترت: ${esc(s.qd.o[a.c])}</p>` : q.inp === "t" && a ? `<p class="muted">كتبت: «${esc(a.x)}»</p>` : "";
      const verdict = !r || r[1] === -1 ? (q.lock === "all" ? "لم تُجب" : s.rev && s.rev.w && s.rev.w !== P.name ? `سبقك ${s.rev.w}` : "انتهى السؤال") : ok ? "إجابة صحيحة!" : "إجابة خاطئة";
      put(`r|${s.sp}|${JSON.stringify(r)}|${JSON.stringify(s.ts)}`, phead(badge) + `<div class="panel center stack ${ok ? "akok" : r && r[1] === 0 ? "akno" : ""}"><p class="bigmsg" style="color:var(--${ok ? "green" : r && r[1] === 0 ? "bad" : "muted"})">${verdict}</p>${said}
          ${r ? `<p style="font-size:1.2rem">${r[0] ? `+${r[0]} نقطة${r[4] ? ` (منها ${r[4]} مكافأة)` : ""} · ` : ""}مجموعك <b>${r[2]}</b></p>${r[2] ? `<p class="muted">ترتيبك ${r[3]}</p>` : ""}` : ""}</div>
          <div class="panel stack akcard">${Akml.revHTML(s)}</div><div class="panel stack"><h3>الترتيب</h3>${Akml.topHTML(s, me)}</div>`);
    }
    for (const [id, html] of Object.entries(live)) setEl($("#" + id), html);
  },
  sendTyped(){
    const inp = $("#akIn"); if (!inp) return;
    const x = inp.value.replace(/\s+/g, " ").trim().slice(0, 40);
    if (!akNorm(x)){ inp.focus(); return; }
    Akml.answer({x});
  },
  pclick(t){
    if (t.dataset.ak !== undefined) Akml.answer({c:+t.dataset.ak});
    else if (t.dataset.act === "aksend") Akml.sendTyped();
    else if (t.dataset.act === "akbz") Akml.buzz();
  },
};
