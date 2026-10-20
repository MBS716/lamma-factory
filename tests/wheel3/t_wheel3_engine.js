// Rules tests for the wheel v3 engine (pure logic). Usage: node t_wheel3_engine.js <path to wheel3.js>
const W = require(process.argv[2] || "/home/claude/lamma/src/wheel3.js");
let pass = 0, fail = 0;
const check = (ok, msg) => { if (ok) pass++; else fail++; console.log((ok ? "OK   " : "FAIL ") + msg); };
function rng(seed){ let x = (seed * 2654435761) >>> 0 || 1; const f = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; for (let i = 0; i < 8; i++) f(); return f; }
let NOW = 1e12;
const mkEnv = (seed = 1) => ({R:rng(seed), get now(){ return NOW; }, q:lv => ({d:{q:"سؤال؟", o:["أ","ب","ج","د"], l:lv}, ci:2})});
function game(o, seed){ const s = W.init({goal:1500, t:30, lv:1, mode:"hype", ...(o || {})}), p = {}, env = mkEnv(seed); const r = W.act(s, p, "start", null, W.tok(s), env); return {s, p, env, ok:r}; }
const A = (g, a, arg) => W.act(g.s, g.p, a, arg, W.tok(g.s), g.env);
// spin and make the wheel stop on card k (the pick itself is tested separately)
function land(g, k){ if (!A(g, "spin")) throw new Error("cannot spin in stage " + g.s.stage); g.s.seg = k; if (!A(g, "land")) throw new Error("land refused"); }
const team = g => g.s.turn;
const clone = x => JSON.parse(JSON.stringify(x));

// ---------- start and settings
{ const s = W.init({}), p = {}; check(!W.act(s, p, "start", null, W.tok(s), mkEnv()), "no goal chosen: the match cannot start"); }
{ const s = W.init({goal:2000}), p = {}; check(!W.act(s, p, "start", null, W.tok(s), mkEnv()), "only 1500 / 3000 / 5000 are accepted as goals"); }
{ const g = game(); check(g.ok && g.s.ph === "play" && g.s.stage === "spin", "goal 1500 chosen: match starts, first team spins"); }
{ const firsts = new Set(); for (let i = 1; i < 40; i++) firsts.add(game({}, i).s.first); check(firsts.size === 2, "the starting team is drawn (both teams start in some matches)"); }

// ---------- direct points, floor, immunity
{ const g = game(), t = team(g); land(g, "p250"); check(g.s.sc[t] === 250, "+250 is added at once, no question"); }
{ const g = game(), t = team(g); land(g, "m150"); check(g.s.sc[t] === 0, "deduction at 0 points: stays 0 (never negative)"); }
{ const g = game(), t = team(g); g.s.sc[t] = 100; land(g, "m250"); check(g.s.sc[t] === 0, "−250 with 100 points: goes to 0, not below"); }
{ const g = game(), t = team(g); land(g, "imm"); check(g.s.im[t] === 1, "immunity card gives the team an immunity");
  A(g, "next"); A(g, "spin"); g.s.seg = "p50"; A(g, "land"); A(g, "next");                      // other team's turn
  g.s.sc[t] = 500; land(g, "m250"); check(g.s.sc[t] === 500 && g.s.im[t] === 0, "immunity then −250: no deduction and the immunity is used up");
  A(g, "next"); land(g, "p50"); A(g, "next"); land(g, "m150"); check(g.s.sc[t] === 350, "the next deduction applies normally (immunity gone)"); }
{ const g = game(), t = team(g); land(g, "imm"); A(g, "next"); land(g, "p50"); A(g, "next"); land(g, "imm");
  check(g.s.im[t] === 1 && g.s.sc[t] === 100, "second immunity: still one immunity, converted to +100"); }

// ---------- steal and swap
{ const g = game(), t = team(g), o = 1 - t; g.s.sc[o] = 400; land(g, "steal"); check(g.s.sc[t] === 150 && g.s.sc[o] === 250, "steal: 150 moves from the other team"); }
{ const g = game(), t = team(g), o = 1 - t; g.s.sc[o] = 90; land(g, "steal"); check(g.s.sc[t] === 90 && g.s.sc[o] === 0, "steal from a team with 90: only 90 moves"); }
{ const g = game(), t = team(g), o = 1 - t; g.s.sc[o] = 400; g.s.im[o] = 1; land(g, "steal"); check(g.s.sc[t] === 0 && g.s.sc[o] === 400 && g.s.im[o] === 0, "steal against immunity: blocked completely, immunity used"); }
{ const g = game(), t = team(g), o = 1 - t; g.s.im = [0, 0]; g.s.im[t] = 1; g.s.s2[o] = 1; land(g, "swap");
  check(g.s.im[o] === 1 && g.s.im[t] === 0 && g.s.s2[t] === 1 && g.s.s2[o] === 0, "swap: immunity and second chance change hands");
  check(g.s.tn[0] === 0 && g.s.tn[1] === 0 && g.s.turn === t, "swap does not change the turn order or the number of turns"); }

// ---------- questions, second chance, streak, quick, bet, golden
{ const g = game(), t = team(g); land(g, "q"); check(g.s.cur.st === "ask" && g.s.left === 30 && !("ci" in g.s.cur), "question: timer 30 s, the answer is not in the shared state");
  A(g, "ok"); check(g.s.sc[t] === 200 && g.s.cur.ci === 2, "right answer +200, answer revealed after judging"); }
{ const g = game(), t = team(g); land(g, "gold"); A(g, "ok"); check(g.s.sc[t] === 400, "golden question +400"); }
{ const g = game({t:60}), t = team(g); land(g, "q"); check(g.s.left === 60, "question time setting 60 s is used"); }
{ const g = game(), t = team(g); g.s.s2[t] = 1; land(g, "q"); A(g, "no"); check(g.s.cur.st === "ask" && g.s.s2[t] === 0 && g.s.cur.retry === 1, "second chance: a wrong answer gives one more try, token used");
  A(g, "no"); check(g.s.cur.st === "shown" && g.s.sc[t] === 0, "wrong again: 0 points, no third try"); }
{ const g = game(), t = team(g); land(g, "streak"); A(g, "ok"); A(g, "more"); A(g, "ok"); A(g, "more"); A(g, "no");
  check(g.s.sc[t] === 350 && g.s.cur.st === "shown", "streak: 150 + 200, then a wrong answer ends it and keeps 350"); }
{ const g = game(), t = team(g); land(g, "streak"); A(g, "ok"); A(g, "more"); A(g, "ok"); A(g, "more"); A(g, "ok");
  check(g.s.sc[t] === 600 && g.s.cur.st === "shown" && !W.moves(g.s).includes("more"), "streak: three right answers = 600, then it stops"); }
{ const g = game(), t = team(g); land(g, "streak"); A(g, "no"); check(g.s.sc[t] === 0 && g.s.cur.st === "shown", "streak: wrong first answer = 0"); }
{ const g = game(), t = team(g); land(g, "quick"); check(g.s.left === 15, "quick round: 15 s per question regardless of the setting");
  A(g, "ok"); A(g, "more"); A(g, "no"); A(g, "more"); A(g, "ok"); check(g.s.sc[t] === 200 && g.s.cur.st === "shown", "quick round: 3 questions, +100 each right (2 right = 200)"); }
{ const g = game(), t = team(g); g.s.sc[t] = 250; land(g, "bet"); check(JSON.stringify(g.s.cur.ws) === "[100,200]", "bet: wagers above the team's points are not offered");
  check(!A(g, "wager", 300), "bet: a wager of 300 with 250 points is refused"); A(g, "wager", 200); A(g, "ok"); check(g.s.sc[t] === 450, "bet won: +200"); }
{ const g = game(), t = team(g); g.s.sc[t] = 300; g.s.im[t] = 1; land(g, "bet"); A(g, "wager", 300); A(g, "no");
  check(g.s.sc[t] === 0 && g.s.im[t] === 1, "bet lost: −300 even with immunity (own wager), immunity kept"); }
{ const g = game(), t = team(g); land(g, "bet"); check(g.s.cur.st === "ask" && g.s.cur.free === 1, "bet with fewer than 100 points: becomes a normal question");
  A(g, "no"); check(g.s.sc[t] === 0, "free bet lost: nothing deducted"); }

// ---------- speed challenge (host decides)
{ const g = game(), t = team(g); land(g, "speed"); check(JSON.stringify(W.moves(g.s).filter(m => m[0] === "s" && m !== "spin")) === '["sg","so","sn","sx"]', "speed challenge: the host has exactly 4 choices");
  A(g, "so"); check(g.s.sc[1] === 250 && g.s.sc[0] === 0, "orange wins the speed challenge: +250 (even when it is green's turn)"); }
{ const g = game(); g.s.sc = [300, 300]; land(g, "speed"); A(g, "sn"); check(g.s.sc[0] === 300 && g.s.sc[1] === 300, "both teams fail: nobody gets points"); }
{ const g = game(); g.s.sc = [300, 300]; land(g, "speed"); A(g, "sx"); check(g.s.sc[0] === 300 && g.s.sc[1] === 300 && g.s.cur.st === "cancel", "cancelled challenge: points unchanged");
  check(W.moves(g.s).includes("sre") && W.moves(g.s).includes("next"), "after cancelling: replay with a new question, or continue");
  A(g, "sre"); A(g, "sx"); A(g, "sre"); A(g, "sx"); check(!W.moves(g.s).includes("sre") && W.moves(g.s).includes("next"), "at most 2 replays, then continue only");
  A(g, "next"); check(g.s.stage === "spin" && g.s.tn[g.s.first] === 1, "continue: the turn passes normally"); }
{ const g = game(); land(g, "speed"); NOW += 31000; W.tick(g.s, NOW); check(g.s.to === 1 && W.moves(g.s).includes("sg"), "time is up: the host still decides (no automatic result)"); }

// ---------- box
{ const g = game(), t = team(g); land(g, "box"); check(g.s.cur.st === "closed" && g.s.sc[t] === 0, "box appears closed; nothing applied before opening");
  const tk = W.tok(g.s); A(g, "open"); const r = clone(g.s.cur), sc = g.s.sc.slice();
  check(!W.act(g.s, g.p, "open", null, tk, g.env) && JSON.stringify(g.s.cur) === JSON.stringify(r) && g.s.sc.join() === sc.join(), "box cannot be opened a second time (repeated tap)"); }
{ // reload while opening: the host saved the state right after the result was drawn; the page comes back from the saved copy
  const g = game(); land(g, "box"); const tk = W.tok(g.s); A(g, "open"); const saved = JSON.stringify(g.s), savedP = JSON.stringify(g.p);
  const s2 = JSON.parse(saved), p2 = JSON.parse(savedP), env2 = mkEnv(999);
  check(!W.act(s2, p2, "open", null, tk, env2) && JSON.stringify(s2) === saved, "reload during the box: same result after reload, no re-draw, no double score"); }
{ // reload BEFORE the open was saved: the box is still closed and is opened once
  const g = game(); land(g, "box"); const saved = JSON.stringify(g.s); A(g, "open"); const s2 = JSON.parse(saved), sc0 = s2.sc.slice();
  W.act(s2, {}, "open", null, W.tok(s2), mkEnv(5)); const d = s2.sc[0] + s2.sc[1] - sc0[0] - sc0[1];
  check(s2.cur.st === "open" && Math.abs(d) <= 400, "reload before the result was saved: the box opens exactly once"); }
{ const counts = {}; for (let i = 0; i < 20000; i++){ const g = game({}, i + 7); land(g, "box"); A(g, "open"); const k = g.s.cur.r + g.s.cur.v; counts[k] = (counts[k] || 0) + 1; }
  const exp = {p50:20, p150:16, p250:10, p400:4, m50:14, m150:10, m250:6, imm0:8, respin0:6, lose0:6};
  const worst = Math.max(...Object.entries(exp).map(([k, v]) => Math.abs((counts[k] || 0) / 200 - v)));
  check(worst < 1.2, `box outcomes match the published odds (largest gap ${worst.toFixed(2)} points of %)`); }

// ---------- extra spins (limits)
{ const g = game(), t = team(g); land(g, "respin"); check(g.s.xb === 1 && W.moves(g.s).includes("again"), "re-spin: one extra spin, budget 2 → 1");
  A(g, "again"); land(g, "respin"); check(g.s.xb === 0, "second re-spin in the same turn: budget 0");
  A(g, "again"); check(g.s.turn === t && g.s.tn[t] === 0, "still the same team's single turn");
  const L = W.locks(g.s); check(L.respin === "extra" && L.l2 === "extra", "budget used: re-spin and «luck twice» are locked on the wheel");
  let bad = 0; for (let i = 0; i < 3000; i++){ const s = clone(g.s); W.act(s, {}, "spin", null, W.tok(s), mkEnv(i + 3)); if (s.seg === "respin" || s.seg === "l2") bad++; }
  check(bad === 0, "with the budget used, 3000 spins never land on re-spin or luck twice");
  land(g, "box"); let saw = 0; for (let i = 0; i < 3000; i++){ const s = clone(g.s); W.act(s, {}, "open", null, W.tok(s), mkEnv(i + 11)); if (s.cur.r === "respin") saw++; }
  check(saw === 0, "with the budget used, the box never gives a re-spin"); }
{ const g = game(); A(g, "spin"); g.s.seg = "respin"; A(g, "land"); A(g, "again"); A(g, "spin"); g.s.seg = "box"; A(g, "land");
  g.s.xb = 1; A(g, "open"); }
check(true, "chained extra spins run without errors");

// ---------- luck twice: spin twice, choose ONE, nothing applied before the choice
{ const g = game(), t = team(g); land(g, "l2"); check(g.s.cur.st === "a" && g.s.xb === 1, "luck twice: first spin awaited (uses one extra spin)");
  A(g, "l2spin"); g.s.seg = "p250"; A(g, "land"); A(g, "l2spin"); g.s.seg = "m250"; A(g, "land");
  check(g.s.cur.st === "choose" && g.s.cur.a === "p250" && g.s.cur.b === "m250" && g.s.sc[t] === 0, "two results shown; no points applied before the choice");
  check(!A(g, "next"), "cannot skip the choice");
  A(g, "l2pick", "a"); check(g.s.sc[t] === 250 && g.s.cur.k === "p250" && g.s.cur.from2 === 1, "the chosen result only (+250) is applied, the other is discarded"); }
{ let bad = 0; for (let i = 0; i < 2000; i++){ const g = game({}, i + 1); land(g, "l2"); A(g, "l2spin"); if (["respin","l2"].includes(g.s.seg)) bad++; }
  check(bad === 0, "luck twice never offers re-spin or luck twice again (no loops)"); }

// ---------- treasure
{ const g = game(), t = team(g); land(g, "tre"); A(g, "tpick", 1); const v = g.s.cur.vals[1]; check(g.s.sc[t] === v && [100,300,500].includes(v) && g.s.cur.vals.slice().sort((a, b) => a - b).join() === "100,300,500", "treasure: the chosen chest's value is added, the others are shown");
  check(!A(g, "tpick", 2) && g.s.sc[t] === v, "treasure cannot be picked twice"); }

// ---------- rare cards cool down
{ const g = game(); land(g, "tre"); const at = g.s.sp; A(g, "tpick", 0); A(g, "next");
  let seen = 0; for (let n = 1; n <= W.RARE_LOCK; n++){ if (W.locks(g.s).tre !== "rare") seen++; land(g, "p50"); A(g, "next"); }
  check(seen === 0, "treasure is locked for the 4 spins after it appeared");
  check(!W.locks(g.s).tre, "after 4 spins the treasure can come up again"); }

// ---------- odds: what the wheel shows is what happens
for (const mode of Object.keys(W.MODES)){
  const g = game({mode}), cnt = {}; const N = 40000;
  for (let i = 0; i < N; i++){ const s = clone(g.s); s.sp = 1000 + i * 10; s.cd = {}; W.act(s, {}, "spin", null, W.tok(s), mkEnv(i * 7 + 1)); cnt[s.seg] = (cnt[s.seg] || 0) + 1; }
  const L = W.layout(g.s); const worst = Math.max(...L.map(sl => Math.abs((cnt[sl.k] || 0) / N - sl.p) * 100));
  check(worst < 0.6, `${mode}: landing frequencies match slice sizes (largest gap ${worst.toFixed(2)} points of %)`);
  const wsum = L.reduce((a, sl) => a + sl.p, 0); check(Math.abs(wsum - 1) < 1e-9 && L.length === 20, `${mode}: 20 cards, slices add up to the full wheel`);
}
{ const g = game({off:["box","bet","tre"]}); const L = W.layout(g.s); let seen = 0;
  for (let i = 0; i < 5000; i++){ const s = clone(g.s); W.act(s, {}, "spin", null, W.tok(s), mkEnv(i + 1)); if (["box","bet","tre"].includes(s.seg)) seen++; }
  check(L.length === 17 && seen === 0, "cards switched off by the host are not on the wheel and never come up"); }
{ const g = game({off:["q","speed","p50"]}); check(W.layout(g.s).length === 20, "core cards (question, speed, points) cannot be switched off"); }

// ---------- repeated / stale actions (reload, double tap, duplicated updates)
{ const g = game(), t = team(g); land(g, "q"); const tk = W.tok(g.s); A(g, "ok"); const sc = g.s.sc[t];
  check(!W.act(g.s, g.p, "ok", null, tk, g.env) && g.s.sc[t] === sc, "the same «right answer» tap twice: counted once"); }
{ const g = game(); const tk = W.tok(g.s); A(g, "spin"); check(!W.act(g.s, g.p, "spin", null, tk, g.env), "a second spin tap during the spin does nothing"); }
{ const g = game(), t = team(g); land(g, "p150"); const tk = W.tok(g.s); A(g, "next"); const s = clone(g.s);
  check(!W.act(g.s, g.p, "next", null, tk, g.env) && JSON.stringify(g.s) === JSON.stringify(s), "a stale «next» from an old screen does nothing"); }
{ // host leaves in the middle of a question and comes back 10 s later: same question, clock continued
  const g = game(); land(g, "q"); NOW += 10000; const s2 = JSON.parse(JSON.stringify(g.s)), p2 = JSON.parse(JSON.stringify(g.p)); W.tick(s2, NOW);
  check(s2.left === 20 && s2.cur.st === "ask" && p2.ci === 2, "host back after 10 s: same question, 20 s left, answer still known to the host only");
  NOW += 25000; W.tick(s2, NOW); check(s2.to === 1 && s2.left === 0, "time runs out while the host is away: shown as time up, host judges"); }

// ---------- end of match: equal turns, final round, tie-break
function toTurnEnd(g, k){ land(g, k); if (g.s.cur && g.s.cur.st === "ask"){ A(g, "no"); if (g.s.cur.st === "ask") A(g, "no"); } A(g, "next"); }
{ const g = game({goal:1500}); g.s.first = 0; g.s.turn = 0; g.s.sc = [1400, 1350];
  toTurnEnd(g, "p150"); check(g.s.sc[0] === 1550 && g.s.ph === "play" && g.s.turn === 1, "green passes 1500 first: the match goes on, orange still gets its turn");
  toTurnEnd(g, "p50"); check(g.s.ph === "final" && g.s.fin.ord[0] === 1 && g.s.turn === 1, "round complete → final round, the trailing team (orange) spins first");
  check(g.s.tn[0] === g.s.tn[1], "equal number of turns when the final round starts");
  check(W.locks(g.s).respin === "final" && W.locks(g.s).l2 === "final" && W.locks(g.s).swap === "final", "final round: no extra spins and no swap");
  toTurnEnd(g, "p250"); check(g.s.ph === "final" && g.s.turn === 0, "then the leader spins last");
  toTurnEnd(g, "p50"); check(g.s.ph === "end" && g.s.win === 1 && g.s.sc[1] === 1650 && g.s.sc[0] === 1600, "orange overtakes in the final round and wins on points (1650 vs 1600)");
  check(g.s.tn[0] === g.s.tn[1], "match ends with equal turns"); }
{ const g = game({goal:3000}); g.s.first = 1; g.s.turn = 1; g.s.sc = [2950, 2900];
  toTurnEnd(g, "p50"); toTurnEnd(g, "p50"); check(g.s.ph === "final", "both teams close to the goal: one reaches it at the end of the round → final round");
  g.s.sc = [3000, 3000]; toTurnEnd(g, "p50"); toTurnEnd(g, "p50"); check(g.s.ph === "tb" && g.s.cur.k === "speed" && g.s.cur.tb === 1, "tie after the final round → speed-challenge tie-break");
  A(g, "sn"); check(g.s.ph === "tb" && g.s.tb.n === 1 && g.s.cur.st === "ask", "tie-break: both fail → next challenge (1 of 5 used)");
  A(g, "sx"); check(g.s.tb.n === 2, "tie-break: a cancelled challenge also counts");
  const sc = g.s.sc.slice(); A(g, "sg"); check(g.s.ph === "end" && g.s.win === 0 && g.s.sc.join() === sc.join(), "tie-break won by green: green wins the match (points unchanged)"); }
{ const g = game({goal:5000}); g.s.sc = [5000, 5000]; g.s.ph = "final"; g.s.fin = {ord:[0, 1], i:1}; g.s.turn = 1; g.s.tn = [10, 9];
  toTurnEnd(g, "p50"); g.s.sc = [5000, 5000];      // force the tie
  const s = W.init({goal:5000}); Object.assign(g.s, {ph:"tb", tb:{n:0}, stage:"card", cur:{k:"speed", st:"ask", re:0, tb:1, q:{}}});
  for (let i = 0; i < 5; i++) A(g, i % 2 ? "sx" : "sn");
  check(g.s.ph === "end" && g.s.win === "d", "5 tie-break challenges without a winner → official draw (no endless loop)"); }
{ const g = game({goal:1500}); A(g, "final"); toTurnEnd(g, "p50"); check(g.s.ph === "play", "«final round now» waits for the round to complete (equal turns)");
  toTurnEnd(g, "p50"); check(g.s.ph === "final", "…then the final round starts"); }
{ const g = game({goal:1500}); for (let i = 0; i < 60 && g.s.ph === "play"; i++) toTurnEnd(g, "m50"); check(g.s.ph === "final" && g.s.rd === W.CAP[1500], "nobody reaches the goal: the round cap (30) starts the final round"); }

// ---------- full matches with random play: every goal, every mode, both judges' random choices
for (const goal of W.GOALS) for (const mode of Object.keys(W.MODES)){
  let ended = 0, eqTurns = 0, negative = 0, tooMany = 0, maxRounds = 0, ties = 0, draws = 0, steps = 0;
  const N = 300;
  for (let i = 0; i < N; i++){
    const R = rng(i * 31 + goal), g = game({goal, mode}, i + goal); let guard = 0;
    while (g.s.ph !== "end" && guard++ < 20000){
      const m = W.moves(g.s).filter(x => x !== "final"); if (!m.length) break;
      let a = m[Math.floor(R() * m.length)], arg = null;
      if (m.includes("land")) a = "land"; else if (m.includes("spin")) a = "spin";
      if (a === "wager") arg = g.s.cur.ws[Math.floor(R() * g.s.cur.ws.length)];
      if (a === "tpick") arg = Math.floor(R() * 3);
      if (a === "l2pick") arg = R() < 0.5 ? "a" : "b";
      if (a === "ok" || a === "no") a = R() < 0.6 ? "ok" : "no";
      if (["sg","so","sn","sx"].includes(a)) a = ["sg","so","sn","sx"][Math.floor(R() * 4)];
      if (!A(g, a, arg)) throw new Error(`refused ${a} in ${JSON.stringify(g.s.cur)}`);
      steps++;
      if (g.s.sc[0] < 0 || g.s.sc[1] < 0) negative++;
      if (g.s.im[0] > 1 || g.s.im[1] > 1 || g.s.s2[0] > 1 || g.s.s2[1] > 1 || g.s.xb < 0) tooMany++;
    }
    if (g.s.ph === "end") ended++;
    if (g.s.tn[0] === g.s.tn[1]) eqTurns++;
    if (g.s.win === "d") draws++;
    if (g.s.tb) ties++;
    maxRounds = Math.max(maxRounds, g.s.rd);
  }
  check(ended === N && eqTurns === N && negative === 0 && tooMany === 0,
    `${goal} ${mode}: ${N} random full matches all end, equal turns in all, never negative, limits held (longest ${maxRounds} rounds, ${ties} tie-breaks, ${draws} draws)`);
}
console.log(`${pass}/${pass + fail} checks passed`); process.exit(fail ? 1 : 0);
