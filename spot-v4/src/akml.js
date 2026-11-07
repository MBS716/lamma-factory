/* ================= أكملها: complete the phrase =================
   Three modes, chosen by the host before the match:
   - c «اختر الإجابة»: the phrase with its gap and 4 options; each phone picks one (final).
   - t «أكمل بنفسك»: the phrase alone; each phone types the missing part once.
   - b «أكملها قبل غيرك»: the phones press «أعرف الإجابة»; the first in order answers aloud and the host judges it;
     a wrong answer passes the turn to the next in order, and that player cannot take the turn again on this question.
   What is secret and where it lives:
   - the bank (data/akml.json) is a public file of the site. Its answers are only scrambled (not readable by a simple
     search); hiding them for real would need a server (none is used).
   - in the room (readable by every phone) a question carries only the phrase with its gap, and in mode c the 4 options.
     Which one is right, and the answer, stay on the host's device until the question closes.
   - each phone's answer (c, t) travels sealed for the host (the same channel as spot the difference), so the other phones
     cannot read it; they only see how many have answered.
   Points: right answer 100, plus up to 50 for speed (c, t). In b, speaking and judging take time, so speed is not
   measured in seconds: the first to press who answers right gets 100 + 50, a later turn 100. Wrong or no answer 0.
   The winner(s) of the match get +100, shown apart from the question points. */
const AK_SECS = [["gulf","أمثال سعودية وخليجية"],["arab","أمثال عربية"],["hikam","حكم وأقوال"],["info","معلومات عامة"],["lang","لغة وأدب"],["fun","عبارات طريفة"]];
const AK_MODE = {c:"اختر الإجابة", t:"أكمل بنفسك", b:"أكملها قبل غيرك"};
const AK_LEAD = 3000;          // ms between sending a question and the start of its clock (every phone has it on screen)
const AK_TURN = 10;            // seconds for an oral answer, started and paused by the host
const AK_DRAIN = 150;          // ms: presses are ordered by the moment they reached the host, a moment after they arrive
const AK_AUTO = 8;             // seconds shown on the answer before the next question (automatic mode)
const AK_PTS = {ok:100, fast:50, first:50, win:100};
const akSecName = c => (AK_SECS.find(x => x[0] === c) || [, ""])[1];
const AK_DIG = s => String(s || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
/* how a typed answer is compared: no diacritics or tatweel, one form of alif, ي for ى, ه for ة, و for ؤ, ي for ئ,
   punctuation and extra spaces ignored, Arabic-Indic digits read as digits; a leading «ال» may be left out */
function akNorm(s){
  return AK_DIG(s).replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^ء-ي0-9a-zA-Z\s]/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
const akBare = s => s.split(" ").map(w => w.length > 3 && w.startsWith("ال") ? w.slice(2) : w).join("");
function akLev(a, b){
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = range(b.length + 1);
  for (let i = 1; i <= a.length; i++){ const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}
/* "ok": the answer or an accepted alternative; "no": anything else (including another option of the question);
   "?": one letter away from the answer (two for long answers): the host decides, nothing is accepted by guess */
function akCheck(it, raw){
  const x = akNorm(raw); if (!x) return "no";
  const xb = akBare(x), acc = [it.a, ...it.alt].map(akNorm).filter(Boolean);
  if (acc.some(a => a === x || akBare(a) === xb)) return "ok";
  const wrong = it.o.map(akNorm).filter(w => w && !acc.includes(w));
  if (wrong.some(w => w === x || akBare(w) === xb)) return "no";
  for (const a of acc){ const m = akBare(a), d = akLev(xb, m); if ((d === 1 && m.length >= 4) || (d === 2 && m.length >= 8)) return "?"; }
  return "no";
}
/* the bank: {"v":1,"d":"<base64>"}, the items scrambled with a fixed key (not a protection: anyone can read the site files) */
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
/* the order of a match: questions this device has not shown yet first, then the older ones, and those of the previous
   match last (never the same question in two matches in a row); with «الكل» the sections take turns */
function akPick(B, o){
  const fit = B.list.filter(q => (o.sec === "all" || q.s === o.sec) && q.md.includes(o.mode));
  const seen = seenGet("lm-akseen"), last = seenGet("lm-aklast");
  const tier = q => last.has(q.id) ? 2 : seen.has(q.id) ? 1 : 0;
  const ordered = [0, 1, 2].flatMap(t => shuffle(fit.filter(q => tier(q) === t), rnd()));
  if (o.sec !== "all") return ordered.map(q => q.id);
  const by = {}; ordered.forEach(q => (by[q.s] = by[q.s] || []).push(q));
  const keys = shuffle(Object.keys(by), rnd()), out = []; let k = 0;
  while (out.length < ordered.length){ const c = by[keys[k++ % keys.length]]; if (c.length) out.push(c.shift().id); }
  return out;
}
const akAd = (dir, code, sp, k) => `lamma-ak|${dir}|${code}|${sp}|${k}`;
const akGapHTML = (q, fill, cls) => `<p class="akx ${cls || ""}">${esc(q.pre)}<span class="${fill != null ? "akfill" : "akgap"}">${fill != null ? esc(fill) : "<i>؟</i>"}</span>${esc(q.post)}</p>`;
const akLeft = s => {        // ms left on the question clock
  if (!s || !s.qs) return 0;
  if (s.o.mode !== "b") return Math.max(0, s.T * 1000 - (srvNow() - s.qs));
  const b = s.bz || {}; return Math.max(0, s.T * 1000 - (b.used || 0) - (b.ra ? Math.max(0, srvNow() - b.ra) : 0));
};
const akTurnLeft = b => b && b.cur >= 0 ? Math.max(0, AK_TURN * 1000 - (b.tu || 0) - (b.ta ? Math.max(0, srvNow() - b.ta) : 0)) : 0;
const akSec = ms => Math.ceil(ms / 1000);

const Akml = {
  init: () => ({sp:0, step:0, i:0, n:10, T:20, qs:0, qd:null, got:[], cnt:0, res:{}, top:[], rev:null, dist:null, bz:null, hk:"", nx:0, fin:null, vd:0}),
  savePriv(){ const p = H.priv; return {order:p.order || [], pos:p.pos || 0, sc:p.sc || {}, ans:p.ans || {}, ci:p.ci, qid:p.qid, revealedK:p.revealedK, own:p.own || {}, hkp:p.hkp || null, pend:p.pend || [], dec:p.dec || {}, bzw:p.bzw || {}, ids:p.ids || [], spMax:p.spMax || 0}; },
  async restore(pv){
    Object.assign(H.priv, {order:pv.order || [], pos:+pv.pos || 0, sc:pv.sc || {}, ans:pv.ans || {}, ci:pv.ci, qid:pv.qid, revealedK:pv.revealedK, own:pv.own || {}, hkp:pv.hkp || null, pend:pv.pend || [], dec:pv.dec || {}, bzw:pv.bzw || {}, ids:pv.ids || [], spMax:+pv.spMax || 0});
    if (H.s.ph === "lobby") return;
    try { H.priv.B = await akLoad(); } catch(e){ if (H) H.s.ph = "lobby"; return; }
    if (!H || H.g !== "akml") return;
    if (["q", "judge", "r"].includes(H.s.ph)){ Akml.hostKey(); H.priv.tickAt = 0; clearInterval(H.priv.tick); H.priv.tick = setInterval(Akml.tick, 250); }
  },
  hostKey(){
    if (!DFC.ok()) return Promise.reject(new Error("no crypto"));
    if (!H.priv.hkP){ H.priv.hkP = DFC.pair(H.priv.hkp).then(k => { if (!H) return k; H.priv.hkp = k.saved; if (H.s.hk !== k.pub){ H.s.hk = k.pub; pushHost(); } return k; }); H.priv.hkP.catch(() => { if (H) H.priv.hkP = null; }); }
    return H.priv.hkP;
  },
  canStart: () => !AK_BANK || akPick(AK_BANK, H.s.o).length > 0,
  act(a, b){
    const s = H.s;
    if (a === "start") Akml.start();
    else if (a === "next") Akml.next();
    else if (a === "close") Akml.close(true);
    else if (a === "skip") Akml.skip();
    else if (a === "final") Akml.finish();
    else if (a === "jok" || a === "jno") Akml.decide(b.dataset.x, a === "jok");
    else if (s.o.mode === "b" && s.ph === "q" && s.bz && b && +b.dataset.tid === s.bz.tid){       // a click from an older turn does nothing
      if (a === "bok") Akml.oral(true);
      else if (a === "bno") Akml.oral(false);
      else if (a === "bgo"){ const z = s.bz; if (!z.ta){ z.ta = srvNow(); pushHost(); } }
      else if (a === "bstop"){ const z = s.bz; if (z.ta){ z.tu = (z.tu || 0) + srvNow() - z.ta; z.ta = 0; pushHost(); } }
    }
  },
  async start(){
    if (H.priv.starting) return; H.priv.starting = true;
    let B; try { B = await akLoad(); } catch(e){ H.priv.starting = false; H.priv.bankErr = true; renderHost(); return; }
    H.priv.starting = false;
    if (!H || H.g !== "akml") return;
    const o = H.s.o, order = akPick(B, o);
    if (!order.length) return;
    Object.assign(H.priv, {B, order, pos:0, sc:{}, ans:{}, pend:[], dec:{}, bzw:{}, ids:[], revealedK:-1});
    for (const p of hostPlayers()){ const k = dfKey(pname(p)); H.priv.sc[k] = {n:pname(p), s:0, r:0}; }
    // the question counter never goes back (also after «الإعدادات»), so an answer sent for an earlier question is never taken for a new one
    H.s = {...Akml.init(), o, n:Math.min(o.n, order.length), T:o.t, hk:H.s.hk || (H.priv.hkp && H.priv.hkp.pub) || "", sp:Math.max(H.s.sp || 0, H.priv.spMax || 0)};
    Akml.hostKey().catch(() => {});
    Akml.ask();
  },
  // the next question of the bank (also the replacement of a skipped one)
  ask(){
    const s = H.s, B = H.priv.B;
    let it = null;
    while (H.priv.pos < H.priv.order.length && !it) it = B.by[H.priv.order[H.priv.pos++]] || null;
    if (!it){ s.n = s.i; return Akml.finish(); }
    seenAdd("lm-akseen", [it.id], 3000); H.priv.ids.push(it.id);
    H.priv.qid = it.id; H.priv.ans = {}; H.priv.pend = []; H.priv.dec = {}; H.priv.bzw = {};
    const qd = {pre:it.pre, post:it.post, s:it.s, l:it.l};
    if (s.o.mode === "c"){ const o = shuffle(it.o, rnd()); H.priv.ci = o.indexOf(it.o[0]); qd.o = o; } else H.priv.ci = -1;
    s.sp++; H.priv.spMax = s.sp; s.step = 0; s.i++; s.qd = qd; s.ph = "q"; s.qs = srvNow() + AK_LEAD; s.got = []; s.cnt = 0; s.res = {}; s.rev = null; s.dist = null; s.nx = 0; s.vd = 0;
    s.bz = s.o.mode === "b" ? {q:[], cur:-1, bl:[], tid:0, used:0, ra:s.qs, ta:0, tu:0} : null;
    H.priv.tickAt = Date.now(); clearInterval(H.priv.tick); H.priv.tick = setInterval(Akml.tick, 250);
    pushHost();
  },
  next(){
    const s = H.s;
    if (s.ph !== "r" || H.priv.revealedK !== s.sp) return;
    if (s.i >= s.n) return Akml.finish();
    Akml.ask();
  },
  // a question with a problem: no points for anybody, and another question takes its place (the match keeps its length)
  skip(){
    const s = H.s; if (!["q", "judge"].includes(s.ph)) return;
    clearInterval(H.priv.tick);
    s.i--; Akml.ask();
  },
  tick(){
    if (!H || H.g !== "akml") return;
    const s = H.s; H.priv.tickAt = Date.now();
    if (s.ph === "q"){
      if (s.o.mode !== "b"){ if (srvNow() > s.qs + s.T * 1000 + 800){ if (Akml.hostPeers) Akml.hostPeers(hostPlayers()); Akml.close(); } }   // late answers still on their way count first
      else if (s.bz.cur < 0 && akLeft(s) <= 0) Akml.close();
      renderHost();
    } else if (s.ph === "r"){
      if (s.o.go === "auto" && s.nx && srvNow() >= s.nx) Akml.next(); else renderHost();
    }
  },
  /* ---------- answers from the phones ---------- */
  hostPeers(players){
    const s = H.s; if (s.ph !== "q") return;
    const own = H.priv.own || (H.priv.own = {}), now = srvNow();
    let ch = false;
    for (const p of players){
      const z = p.presence.ak; if (!z || z.i !== s.sp) continue;
      const k = dfKey(pname(p));
      // a name's record belongs to the device identity that first played under it (the database guarantees a seat's identity)
      if (p.uid){ if (own[k] && own[k] !== p.uid) continue; if (!own[k]) own[k] = p.uid; }
      if (!H.priv.sc[k]){ H.priv.sc[k] = {n:pname(p), s:0, r:0}; }
      if (s.o.mode === "b"){
        if (z.bz && !s.bz.q.some(x => x[0] === k) && !s.bz.bl.includes(k) && !H.priv.bzw[k] && now >= s.qs){ H.priv.bzw[k] = {n:pname(p), at:now}; ch = true; }
      } else if (typeof z.e === "string" && z.e.length < 2000 && typeof z.pk === "string" && z.pk.length < 200 && !H.priv.ans[k]){
        const le = H.priv.le || (H.priv.le = {});
        if (le[k] !== z.e){ le[k] = z.e; Akml.unseal(k, pname(p), z.pk, z.e, now, s.sp); }
      }
    }
    if (ch && !H.priv.bzT) H.priv.bzT = setTimeout(Akml.drain, AK_DRAIN);
  },
  async unseal(k, name, pub, e, arr, sp){
    let m = null;
    try { const hk = await Akml.hostKey(); m = await DFC.open(await DFC.shared(hk, pub), e, akAd("up", H.code, sp, k)); } catch(err){ m = null; }
    if (!H || H.g !== "akml" || !m || m.i !== sp) return;
    Akml.record(k, name, m, arr);
  },
  record(k, name, m, arr){
    const s = H.s; if (s.ph !== "q" || m.i !== s.sp || H.priv.ans[k]) return;        // the first answer counts, never a second one
    const T = s.T * 1000, rec = arr - s.qs, said = Number.isFinite(+m.at) ? +m.at - s.qs : rec;
    if (said > T + 1000 || rec > T + 5000 || said < -1500) return;                   // outside the answer time
    // the answer time on the shared clock: a phone cannot claim to be more than 3 s faster than the moment its answer
    // arrived, unless the host's page was asleep (then the phone's own time counts)
    const asleep = Date.now() - (H.priv.tickAt || 0) > 1500;
    const ms = Math.max(0, Math.min(T, asleep ? said : Math.max(said, rec - 3000)));
    if (s.o.mode === "c"){ if (!Number.isInteger(m.c) || m.c < 0 || m.c > 3) return; H.priv.ans[k] = {n:name, c:m.c, ms}; }
    else { const x = String(m.x || "").slice(0, 60); if (!akNorm(x)) return; H.priv.ans[k] = {n:name, x, ms}; }
    s.got = Object.keys(H.priv.ans); s.cnt = s.got.length;
    const act = activePlayers(hostPlayers()).map(p => dfKey(pname(p)));
    if (act.length && act.every(x => H.priv.ans[x])) Akml.close(); else pushHost();
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
  // the turn goes to the first in order who has not answered wrong; the question clock stops while somebody answers
  turn(){
    const s = H.s, z = s.bz, now = srvNow();
    const idx = z.q.findIndex(x => !z.bl.includes(x[0]));
    if (idx >= 0){ if (z.ra){ z.used += Math.max(0, now - z.ra); z.ra = 0; } z.cur = idx; z.tid++; z.ta = 0; z.tu = 0; }
    else { z.cur = -1; if (!z.ra) z.ra = now; }
  },
  oral(ok){
    const s = H.s, z = s.bz; if (z.cur < 0) return;
    const k = z.q[z.cur][0];
    if (ok){ H.priv.ans[k] = {n:z.q[z.cur][1], ok:1, first:z.cur === 0 && !z.bl.length}; return Akml.reveal(); }
    z.bl.push(k); H.priv.ans[k] = {n:z.q[z.cur][1], ok:0};
    Akml.turn();
    if (z.cur < 0 && akLeft(s) <= 0) return Akml.close();
    pushHost();
  },
  /* ---------- the end of a question ---------- */
  close(early){
    const s = H.s; if (s.ph !== "q") return;
    if (early && s.o.mode !== "b" && srvNow() < s.qs) return;
    if (s.o.mode === "t"){
      const it = H.priv.B.by[H.priv.qid], pend = new Set();
      for (const a of Object.values(H.priv.ans)){ a.v = akCheck(it, a.x); if (a.v === "?") pend.add(akNorm(a.x)); }
      H.priv.pend = [...pend];
      if (H.priv.pend.length){ clearInterval(H.priv.tick); s.ph = "judge"; s.step = 1; pushHost(); return; }
    }
    Akml.reveal();
  },
  // the host's decision on a typed answer the device was not sure about (applies to every player who typed the same)
  decide(x, ok){
    const s = H.s; if (s.ph !== "judge" || !H.priv.pend.includes(x)) return;
    H.priv.dec[x] = ok ? "ok" : "no";
    if (H.priv.pend.every(p => H.priv.dec[p])) Akml.reveal(); else renderHost();
  },
  reveal(){
    const s = H.s; if (s.ph !== "q" && s.ph !== "judge") return;          // once per question
    clearInterval(H.priv.tick);
    const it = H.priv.B.by[H.priv.qid], T = s.T * 1000, sc = H.priv.sc, res = {}, dist = [0, 0, 0, 0];
    for (const p of hostPlayers()){ const k = dfKey(pname(p)); if (!sc[k]) sc[k] = {n:pname(p), s:0, r:0}; }
    for (const [k, a] of Object.entries(H.priv.ans)){
      let ok = false, g = 0;
      if (s.o.mode === "c"){ dist[a.c]++; ok = a.c === H.priv.ci; }
      else if (s.o.mode === "t") ok = a.v === "ok" || (a.v === "?" && H.priv.dec[akNorm(a.x)] === "ok");
      else ok = !!a.ok;
      if (ok) g = s.o.mode === "b" ? AK_PTS.ok + (a.first ? AK_PTS.first : 0) : AK_PTS.ok + Math.round(AK_PTS.fast * Math.max(0, 1 - a.ms / T));
      const r = sc[k] || (sc[k] = {n:a.n, s:0, r:0}); r.s += g; if (ok) r.r++;
      res[k] = [g, ok ? 1 : 0];
    }
    const rank = Akml.ranking();
    rank.forEach(([k, r], i) => { res[k] = [...(res[k] || [0, -1]), r.s, i + 1]; });
    s.res = res; s.top = rank.slice(0, 10).map(([k, r]) => [r.n, r.s, (res[k] || [0])[0]]);
    s.dist = s.o.mode === "c" ? dist : null;
    s.rev = {a:it.a, why:it.why, src:it.src, ci:H.priv.ci};
    s.ph = "r"; s.step = 2; s.nx = s.o.go === "auto" ? srvNow() + AK_AUTO * 1000 : 0; H.priv.revealedK = s.sp;
    if (s.o.go === "auto"){ H.priv.tick = setInterval(Akml.tick, 250); }
    pushHost();
  },
  ranking(){ return Object.entries(H.priv.sc).sort((a, b) => b[1].s - a[1].s || b[1].r - a[1].r || a[1].n.localeCompare(b[1].n, "ar")); },
  finish(){
    const s = H.s; clearInterval(H.priv.tick);
    lsSet("lm-aklast", JSON.stringify(H.priv.ids || []));
    const rank = Akml.ranking(), best = rank.length ? rank[0][1].s : 0;
    // the match bonus: +100 for the winner, shared by everybody tied at the top (only if somebody scored)
    const fin = rank.map(([k, r]) => { const w = best > 0 && r.s === best; return [r.n, r.s, w ? AK_PTS.win : 0, r.s + (w ? AK_PTS.win : 0), r.r, k]; })
      .sort((a, b) => b[3] - a[3] || b[4] - a[4]);
    let place = 0; fin.forEach((f, i) => { if (i === 0 || f[3] !== fin[i - 1][3] || f[4] !== fin[i - 1][4]) place = i + 1; f.push(place); });
    s.fin = fin.slice(0, 16).map(f => [f[0], f[1], f[2], f[3], f[4], f[6]]);
    s.res = {}; fin.forEach(f => { s.res[f[5]] = [f[6], f[3], f[2]]; });
    s.ph = "end"; s.step = 3; s.sp++; H.priv.spMax = s.sp;
    pushHost();
  },
  /* ---------- the host's screen ---------- */
  head(s){ const q = s.qd; return `<div class="row qmeta"><span class="muted">السؤال ${s.i} من ${s.n}</span><span class="chip">${esc(akSecName(q.s))}</span><span class="chip lv l${q.l}">${LV_NAMES[q.l]}</span><span class="chip akmode">${AK_MODE[s.o.mode]}</span></div>`; },
  optsHTML(s, rev){
    return `<div class="opts">${range(4).map(i => `<div class="opt c${i} ${rev ? (i === s.rev.ci ? "right" : "dim") : ""}"><span class="sh">${SHAPES[i]}</span><span>${esc(s.qd.o[i])}</span>${rev && s.dist ? `<span class="cnt">${s.dist[i]}</span>` : ""}</div>`).join("")}</div>`;
  },
  revHTML(s){
    const r = s.rev;
    return `<div class="akrev">${akGapHTML(s.qd, r.a, "big")}<p><b>الإجابة:</b> ${esc(r.a)}</p><p><b>المعنى:</b> ${esc(r.why)}</p>${r.src ? `<p class="muted aksrc">${esc(r.src)}</p>` : ""}</div>`;
  },
  topHTML(s){ return s.top.length ? `<div class="lb">${s.top.map(([n, sc, g], i) => `<div><span>${i + 1}. ${esc(n)}</span><span>${g ? `<em class="akgain">+${g}</em> ` : ""}<b>${sc}</b></span></div>`).join("")}</div>` : `<p class="muted">لا لاعبين على الجوالات.</p>`; },
  queueHTML(s, me){
    const z = s.bz; if (!z || !z.q.length) return `<p class="muted center">لم يطلب أحد الإجابة بعد.</p>`;
    return `<ol class="akq">${z.q.map(([k, n], i) => `<li class="${i === z.cur ? "on" : z.bl.includes(k) ? "out" : ""} ${k === me ? "me" : ""}"><span>${esc(n)}</span><span class="muted">${i === z.cur ? "يجيب الآن" : z.bl.includes(k) ? "أخطأ" : "في الانتظار"}</span></li>`).join("")}</ol>`;
  },
  finHTML(s, me){
    const f = s.fin || [], win = f.filter(x => x[5] === 1 && x[3] > 0);
    const hero = win.length ? `<div class="akhero"><span class="akcrown">👑</span><p class="muted">${win.length > 1 ? "فوز مشترك" : "الفائز"}</p><h2>${win.map(x => esc(x[0])).join(" و")}</h2><p>${win[0][3]} نقطة <span class="muted">(${win[0][1]} من الأسئلة + ${AK_PTS.win} مكافأة الفوز)</span></p></div>`
      : `<div class="akhero"><h2>انتهت المباراة</h2><p class="muted">لم يسجّل أحد نقاطًا.</p></div>`;
    const rows = f.map(x => `<tr class="${x[5] === 1 && x[3] > 0 ? "win" : ""} ${me && P && x[0] === P.name ? "me" : ""}"><td>${x[5]}</td><td>${esc(x[0])}</td><td>${x[4]}</td><td>${x[1]}</td><td>${x[2] ? "+" + x[2] : "—"}</td><td><b>${x[3]}</b></td></tr>`).join("");
    return hero + (f.length ? `<div class="aktable-w"><table class="aktable"><thead><tr><th>#</th><th>اللاعب</th><th>صحيحة</th><th>نقاط الأسئلة</th><th>مكافأة الفوز</th><th>المجموع</th></tr></thead><tbody>${rows}</tbody></table></div>` : "");
  },
  host(players){
    const s = H.s, B = AK_BANK; let html;
    if (s.ph === "lobby"){
      if (!B && !H.priv.bankAsked){ H.priv.bankAsked = true; akLoad().then(() => { if (H && H.g === "akml") renderHost(); }).catch(() => { if (H){ H.priv.bankErr = true; renderHost(); } }); }
      const pool = B ? akPick(B, s.o).length : 0, md = s.o.mode;
      const how = md === "c" ? "تظهر العبارة وأربعة خيارات، وكل لاعب يختار من جواله. الإجابة الصحيحة 100 نقطة وحتى 50 للسرعة."
        : md === "t" ? "تظهر العبارة دون خيارات، وكل لاعب يكتب الجزء الناقص مرة واحدة. لا تُحسب الأخطاء البسيطة في الهمزات والتشكيل، وما لا يتأكد منه الجهاز يُعرض عليك للحكم."
        : "يضغط اللاعبون «أعرف الإجابة»، وأول من ضغط يجيب بصوته وأنت تحكم. الخاطئ لا يعود للسؤال نفسه، والدور ينتقل للتالي. الصحيحة 100، و+50 لأول من ضغط إن أصاب.";
      html = lobbyHTML(players, `<p class="muted">${H.priv.bankErr ? "تعذّر تحميل الأسئلة. تحقق من الاتصال ثم أعد المحاولة." : B ? `${pool.toLocaleString("ar")} سؤالًا متاحًا لهذا الاختيار${pool < s.o.n ? `، فتكون المباراة ${pool.toLocaleString("ar")} سؤالًا` : ""}، ولا يتكرر سؤال داخل المباراة.` : "جارٍ تجهيز الأسئلة…"}</p><p class="muted">${how} مكافأة الفوز بالمباراة +${AK_PTS.win}.</p>`, "ابدأ المباراة");
    } else if (s.ph === "q" && srvNow() < s.qs){
      html = `<div class="panel center stack akget"><p class="muted">السؤال ${s.i} من ${s.n} · ${esc(akSecName(s.qd.s))}</p><p class="bigmsg">استعدّوا…</p><span class="timer">${akSec(s.qs - srvNow())}</span></div>`;
    } else if (s.ph === "q"){
      const left = akSec(akLeft(s)), md = s.o.mode;
      let side;
      if (md === "b"){
        const z = s.bz, cur = z.cur >= 0 ? z.q[z.cur] : null, tl = akSec(akTurnLeft(z));
        side = `<div class="panel stack"><div class="row" style="justify-content:space-between"><span class="timer ${left <= 5 ? "warn" : ""}">${cur ? "⏸" : left}</span><span class="chip">${cur ? "الوقت متوقف أثناء الإجابة" : "باب الإجابة مفتوح"}</span></div>
          ${cur ? `<div class="akturn"><p class="muted">الدور الآن</p><h3>${esc(cur[1])}</h3><span class="timer sm ${z.ta && tl <= 3 ? "warn" : ""}">${z.ta ? tl : AK_TURN} ث</span>
            <div class="row" style="justify-content:center">${z.ta ? `<button class="btn ghost sm" data-h="bstop" data-tid="${z.tid}">⏸ أوقف الوقت</button>` : `<button class="btn ghost sm" data-h="bgo" data-tid="${z.tid}">▶ ابدأ وقت الإجابة</button>`}</div>
            <div class="row" style="justify-content:center"><button class="btn g" data-h="bok" data-tid="${z.tid}">✓ إجابة صحيحة</button><button class="btn o" data-h="bno" data-tid="${z.tid}">✗ إجابة خاطئة</button></div></div>` : ""}
          <h3>ترتيب طلب الإجابة</h3>${Akml.queueHTML(s)}
          <div class="row"><button class="btn ghost sm" data-h="close">إنهاء السؤال</button><button class="btn ghost sm" data-h="skip">تخطّي السؤال</button></div></div>`;
      } else side = `<div class="panel stack"><div class="row" style="justify-content:space-between"><span class="timer ${left <= 5 ? "warn" : ""}">${left}</span><span class="chip">أجاب ${s.cnt} من ${players.length}</span></div>
          <div class="tbar"><i style="width:${akLeft(s) / (s.T * 10)}%"></i></div>
          <div class="row"><button class="btn" data-h="close">إنهاء الوقت الآن</button><button class="btn ghost sm" data-h="skip">تخطّي السؤال</button></div>${soloNote()}</div>`;
      html = `<div class="layout"><div class="panel stack akcard">${Akml.head(s)}${akGapHTML(s.qd, null, "big")}${md === "c" ? Akml.optsHTML(s, false) : ""}</div>${side}</div>`;
    } else if (s.ph === "judge"){
      const items = H.priv.pend.map(x => { const who = Object.values(H.priv.ans).filter(a => akNorm(a.x) === x), d = H.priv.dec[x];
        return `<div class="akjd ${d || ""}"><div><b>«${esc(who[0] ? who[0].x : x)}»</b><span class="muted"> · ${who.map(a => esc(a.n)).join("، ")}</span></div><div class="row"><button class="btn g sm" data-h="jok" data-x="${esc(x)}" ${d ? "disabled" : ""}>✓ أقبلها</button><button class="btn o sm" data-h="jno" data-x="${esc(x)}" ${d ? "disabled" : ""}>✗ أرفضها</button></div></div>`; }).join("");
      const it = H.priv.B.by[H.priv.qid];
      html = `<div class="layout"><div class="panel stack akcard">${Akml.head(s)}${akGapHTML(s.qd, it.a, "big")}<p class="muted">الإجابة المعتمدة: <b>${esc([it.a, ...it.alt].join("، "))}</b></p></div>
        <div class="panel stack"><h3>إجابات تحتاج حكمك</h3><p class="muted">هذه الإجابات قريبة من الإجابة الصحيحة في الكتابة، ولم يعتمدها الجهاز تلقائيًا. اقبلها إن كانت الإجابة نفسها بخطأ إملائي بسيط.</p>${items}<button class="btn ghost sm" data-h="skip">تخطّي السؤال</button></div></div>`;
    } else if (s.ph === "r"){
      const auto = s.o.go === "auto" && s.nx ? Math.max(0, akSec(s.nx - srvNow())) : null;
      html = `<div class="layout"><div class="panel stack akcard">${Akml.head(s)}${s.o.mode === "c" ? Akml.optsHTML(s, true) : ""}${Akml.revHTML(s)}</div>
        <div class="panel stack"><h3>الترتيب</h3>${Akml.topHTML(s)}
        <button class="btn" data-h="next">${s.i >= s.n ? "النتيجة النهائية" : auto != null ? `السؤال التالي (${auto})` : "السؤال التالي"}</button>${s.i < s.n ? `<button class="btn ghost sm" data-h="final">إنهاء المباراة الآن</button>` : ""}</div></div>`;
    } else {
      html = `<div class="panel stack endcard akend" style="margin-top:18px">${Akml.finHTML(s)}
        <div class="row" style="justify-content:center"><button class="btn" data-h="start">مباراة جديدة بنفس الإعدادات</button></div></div>`;
    }
    setMain(html);
  },
  /* ---------- the phone ---------- */
  mine(s){
    if (!P.view.akA || P.view.akA.i !== s.sp){ const sv = seatProg("akml"); P.view.akA = sv && sv.i === s.sp && sv.q === s.qs ? sv : null; }
    return P.view.akA;
  },
  async psend(){
    const a = P.view.akA, h = findHost(), hs = h && h.presence.s;
    if (!a || !hs || !hs.hk || hs.sp !== a.i || hs.ph !== "q") return;
    try {
      const me = await DFC.mine(), k = dfKey(P.name);
      const e = await DFC.seal(await DFC.shared(me, hs.hk), {i:a.i, c:a.c, x:a.x, at:a.at}, akAd("up", P.code, a.i, k));
      const pres = {ak:{i:a.i, pk:me.pub, e}};
      seatProg("pres", pres); await NR.presence(pres);
    } catch(err){ console.warn(err); }
  },
  answer(v){
    const h = findHost(), s = h && h.presence.s; if (!s || s.ph !== "q" || !s.qd || srvNow() < s.qs || akLeft(s) <= 0) return;
    if (Akml.mine(s)) return;                           // one answer per question
    const a = {i:s.sp, q:s.qs, at:srvNow(), ...v};          // q: this question's start, so an answer is never taken for another question
    P.view.akA = a; seatProg("akml", a); P.view.akReAt = Date.now();
    Akml.psend(); playerRender();
  },
  buzz(){
    const h = findHost(), s = h && h.presence.s; if (!s || s.ph !== "q" || s.o.mode !== "b" || srvNow() < s.qs) return;
    const me = dfKey(P.name); if (s.bz.bl.includes(me) || s.bz.q.some(x => x[0] === me) || P.view.akBz === s.sp) return;
    P.view.akBz = s.sp; const pres = {ak:{i:s.sp, bz:1}};
    seatProg("pres", pres); NR.presence(pres).catch(() => {}); playerRender();
  },
  player(s){
    const me = dfKey(P.name), md = s.o.mode, now = srvNow();
    if (md !== "b" && !DFC.ok()){ pSet(phead() + `<div class="panel center stack"><p class="bigmsg">هذا المتصفح لا يدعم اللعبة</p><p class="muted">افتح الرابط في متصفح حديث مثل Safari أو Chrome.</p></div>`); bindPlayer(); return; }
    let frame, live = {};
    if (s.ph === "end"){
      const r = s.res[me];
      frame = `end|${s.sp}|${JSON.stringify(s.fin)}`;
      if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead() + `<div class="panel stack endcard akend">${r ? `<p class="center akmine">ترتيبك <b>${r[0]}</b> بمجموع ${r[1]} نقطة${r[2] ? ` (منها +${r[2]} مكافأة الفوز)` : ""}</p>` : ""}${Akml.finHTML(s, me)}<p class="muted center">بانتظار المقدّم…</p></div>`); bindPlayer(); }
      return;
    }
    if (!s.qd) return;
    const a = Akml.mine(s);
    // after a reload (or a lost write) the sealed answer is sent again until the host has it; the host keeps the first one
    if (s.ph === "q" && a && md !== "b" && s.hk && !s.got.includes(me) && Date.now() - (P.view.akReAt || 0) > 2500){ P.view.akReAt = Date.now(); Akml.psend(); }
    const card = (fill, cls) => `<div class="panel stack akcard ${cls || ""}">${Akml.head(s)}${akGapHTML(s.qd, fill, "")}`;
    if (s.ph === "q" && now < s.qs){
      frame = `get|${s.sp}`; live.akClock = `<span class="timer">${akSec(s.qs - now)}</span>`;
      if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead() + `<div class="panel center stack akget"><p class="muted">السؤال ${s.i} من ${s.n} · ${esc(akSecName(s.qd.s))}</p><p class="bigmsg">استعدّ…</p><div id="akClock"></div></div>`); bindPlayer(); }
    } else if (s.ph === "q"){
      const left = akLeft(s);
      live.akClock = `<span class="timer sm ${left <= 5000 ? "warn" : ""}">${md === "b" && s.bz.cur >= 0 ? "⏸" : akSec(left)}</span>`;
      if (md === "c"){
        if (a){ frame = `c1|${s.sp}|${a.c}`;
          if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead(`<span id="akClock"></span>`) + `<div class="panel center stack"><p class="bigmsg">تم تسجيل إجابتك</p><div class="opt c${a.c}" style="justify-content:center"><span class="sh">${SHAPES[a.c]}</span><span>${esc(s.qd.o[a.c])}</span></div><p class="muted" id="akGot"></p></div>`); bindPlayer(); }
        } else if (left <= 0){ frame = `late|${s.sp}`; if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead() + `<div class="panel center stack"><p class="bigmsg">انتهى الوقت</p><p class="muted">بانتظار الإجابة الصحيحة…</p></div>`); bindPlayer(); } }
        else { frame = `c0|${s.sp}`;
          if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead(`<span id="akClock"></span>`) + card() + `<div class="opts">${range(4).map(i => `<button class="opt c${i}" data-ak="${i}"><span class="sh">${SHAPES[i]}</span><span>${esc(s.qd.o[i])}</span></button>`).join("")}</div><p class="muted aknote">اختيارك نهائي ولا يمكن تغييره.</p></div>`); bindPlayer(); }
        }
        live.akGot = `أجاب ${s.cnt} · بانتظار البقية`;
      } else if (md === "t"){
        if (a){ frame = `t1|${s.sp}`;
          if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead(`<span id="akClock"></span>`) + card() + `<p class="bigmsg">تم إرسال إجابتك</p><p class="aksent">«${esc(a.x)}»</p><p class="muted" id="akGot"></p></div>`); bindPlayer(); }
          live.akGot = s.got.includes(me) ? `وصلت إجابتك إلى المقدّم · أجاب ${s.cnt}` : "جارٍ إرسال إجابتك…";
        } else if (left <= 0){ frame = `late|${s.sp}`; if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead() + `<div class="panel center stack"><p class="bigmsg">انتهى الوقت</p><p class="muted">بانتظار الإجابة الصحيحة…</p></div>`); bindPlayer(); } }
        else { frame = `t0|${s.sp}`;
          if (P.view.akF !== frame){
            P.view.akF = frame;
            pSet(phead(`<span id="akClock"></span>`) + card() + `<form class="akform" id="akForm" autocomplete="off"><input class="field" id="akIn" maxlength="40" dir="rtl" lang="ar" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="اكتب الكلمة الناقصة" aria-label="الكلمة الناقصة"><button class="btn" data-act="aksend">أرسل</button></form><p class="muted aknote">لديك محاولة واحدة، ولا يمكن تعديل الإجابة بعد الإرسال.</p></div>`);
            bindPlayer();
            const f = $("#akForm"), inp = $("#akIn");
            if (inp){ inp.value = P.view.akDraft && P.view.akDraft[0] === s.sp ? P.view.akDraft[1] : ""; inp.oninput = () => { P.view.akDraft = [s.sp, inp.value]; }; }
            if (f) f.onsubmit = e => { e.preventDefault(); Akml.sendTyped(); };
          }
        }
      } else {
        const z = s.bz, i = z.q.findIndex(x => x[0] === me), out = z.bl.includes(me), mineTurn = z.cur >= 0 && z.q[z.cur][0] === me;
        const st = out ? "out" : mineTurn ? "turn" : i >= 0 || P.view.akBz === s.sp ? "wait" : left <= 0 ? "late" : "open";
        frame = `b|${s.sp}|${st}`;
        if (P.view.akF !== frame){
          P.view.akF = frame;
          const btn = st === "open" ? `<button class="akbz" data-act="akbz">أعرف الإجابة</button>`
            : st === "turn" ? `<div class="akturn me"><p class="bigmsg">دورك! أجب بصوتك</p><p class="muted">المقدّم يحكم على إجابتك.</p></div>`
            : st === "wait" ? `<p class="bigmsg">طلبت الإجابة</p><p class="muted">ترتيبك يظهر أدناه.</p>`
            : st === "out" ? `<p class="bigmsg akno">إجابتك لم تكن صحيحة</p><p class="muted">لا يمكنك الإجابة مرة أخرى في هذا السؤال.</p>`
            : `<p class="bigmsg">انتهى الوقت</p>`;
          pSet(phead(`<span id="akClock"></span>`) + card() + `<div class="center stack">${btn}</div></div><div class="panel stack"><h3>ترتيب طلب الإجابة</h3><div id="akQ"></div></div>`); bindPlayer();
        }
        live.akQ = Akml.queueHTML(s, me);
      }
    } else if (s.ph === "judge"){
      frame = `judge|${s.sp}`;
      if (P.view.akF !== frame){ P.view.akF = frame; pSet(phead() + card() + `<p class="bigmsg">انتهى الوقت</p><p class="muted center">المقدّم يراجع بعض الإجابات المكتوبة…</p></div>`); bindPlayer(); }
    } else if (s.ph === "r"){
      const r = s.res[me] || null, ok = r && r[1] === 1;
      const said = md === "c" && a ? `<p class="muted">اخترت: ${esc(s.qd.o[a.c])}</p>` : md === "t" && a ? `<p class="muted">كتبت: «${esc(a.x)}»</p>` : "";
      const verdict = !r || r[1] === -1 ? (md === "b" ? "انتهى السؤال" : "لم تُجب") : ok ? "إجابة صحيحة!" : "إجابة خاطئة";
      frame = `r|${s.sp}|${JSON.stringify(r)}`;
      if (P.view.akF !== frame){ P.view.akF = frame;
        pSet(phead() + `<div class="panel center stack ${ok ? "akok" : r && r[1] === 0 ? "akno" : ""}"><p class="bigmsg" style="color:var(--${ok ? "green" : r && r[1] === 0 ? "bad" : "muted"})">${verdict}</p>${said}
          ${r && r.length >= 4 ? `<p style="font-size:1.2rem">${r[0] ? `+${r[0]} نقطة · ` : ""}المجموع <b>${r[2]}</b></p><p class="muted">ترتيبك ${r[3]}</p>` : ""}</div>
          <div class="panel stack akcard">${Akml.revHTML(s)}</div><div class="panel stack"><h3>الترتيب</h3>${Akml.topHTML(s)}</div>`); bindPlayer(); }
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
