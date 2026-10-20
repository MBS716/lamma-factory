/* ================= WHEEL OF FORTUNE v3: the rules engine =================
   Pure logic, no screen code: the host's page calls W3.act(...) for every button and W3.tick(...) for the clock,
   then broadcasts the state. Players only display it. Nothing here touches the page, so every rule can be tested alone.

   Fairness rules built in (approved Oct 20):
   - win goal 1500 / 3000 / 5000 (no default). Reaching it does not end the game: the round is completed so both teams
     had the same number of turns, then a final round (one more turn each, trailing team first), highest score wins,
     a tie goes to up to 5 speed challenges, then an official draw. A round cap guarantees the game ends.
   - points never go below 0; at most one immunity and one second-chance per team (a second one becomes +100);
     immunity absorbs the first deduction imposed on the team (cards, box, steal), not its own lost bet.
   - luck loan (Oct 20): a team with fewer than 100 points that lands on the bet may borrow 100 from the game's bank.
     Right answer: +100 net and the loan is closed. Wrong: a debt of 100, repaid automatically from the team's next
     gains. One loan at a time, never more than 100. The goal and the final result use the net score (points − debt).
   - at most 2 extra spins per turn; rare cards are locked for 4 spins after they appear; no extra spins in the final.
   - every host action carries a token (spin number + step): a repeated tap, a stale button or a replayed update does
     nothing, so no reward or penalty is ever applied twice. Random results are drawn at the moment of reveal. */
const W3 = (() => {
  const C = {   // id: name, optional (host can switch it off), rare (cool-down), question-based
    q:{n:"سؤال", f:"سؤال عادي"}, speed:{n:"تحدي السرعة"},
    p50:{n:"+50"}, p150:{n:"+150"}, p250:{n:"+250"}, m50:{n:"−50"}, m150:{n:"−150"}, m250:{n:"−250"},
    gold:{n:"السؤال الذهبي", opt:1, rare:1}, bet:{n:"الرهان", f:"كرت الرهان", opt:1}, streak:{n:"سلسلة الانتصارات", opt:1},
    quick:{n:"الجولة السريعة", opt:1}, steal:{n:"سرقة النقاط", opt:1}, imm:{n:"حصانة", opt:1}, sec:{n:"فرصة ثانية", opt:1},
    box:{n:"صندوق الحظ", opt:1}, respin:{n:"إعادة تدوير", opt:1}, l2:{n:"حظك مرتين", opt:1, rare:1},
    tre:{n:"الكنز", opt:1, rare:1}, swap:{n:"تبديل المزايا", opt:1, rare:1},
  };
  // colour family of each card on the wheel (spread around it so the same family never sits side by side)
  const CAT = {p50:"bonus", p150:"bonus", p250:"bonus", m50:"pen", m150:"pen", m250:"pen", q:"ask", streak:"ask", quick:"ask", bet:"ask",
    speed:"duel", steal:"steal", gold:"spec", box:"spec", tre:"spec", l2:"spec", respin:"spec", swap:"spec", sec:"spec", imm:"spec"};
  const ORDER = ["p150","q","box","m50","speed","imm","p50","gold","m150","streak","respin","p250","bet","sec","m250","quick","tre","steal","l2","swap"];
  const MODES = {
    classic:{n:"كلاسيكي", w:{q:22,speed:10,p50:6,p150:6,p250:4,m50:5,m150:4,m250:2,imm:4,box:6,gold:3,bet:4,respin:3,l2:2,sec:3,streak:4,steal:4,quick:4,tre:2,swap:2}},
    hype:{n:"حماسي", w:{q:14,speed:10,p50:5,p150:6,p250:5,m50:5,m150:5,m250:3,imm:5,box:9,gold:4,bet:5,respin:4,l2:2,sec:3,streak:4,steal:4,quick:3,tre:2,swap:2}},
    legend:{n:"أسطوري", w:{q:11,speed:10,p50:3,p150:5,p250:6,m50:3,m150:5,m250:5,imm:5,box:10,gold:6,bet:7,respin:3,l2:3,sec:2,streak:4,steal:4,quick:3,tre:3,swap:2}}   /* Oct 20: swap 1 → 2 and question 12 → 11, approved so every slice can carry a readable label */,
  };
  const BOX = [["p",50,20],["p",150,16],["p",250,10],["p",400,4],["m",50,14],["m",150,10],["m",250,6],["imm",0,8],["respin",0,6],["lose",0,6]];
  const GOALS = [1500, 3000, 5000], CAP = {1500:30, 3000:60, 5000:100}, TIMES = [30, 45, 60];
  const QPTS = {q:200, gold:400, speed:250, steal:150, quick:100}, STREAK = [150, 200, 250], TREASURE = [100, 300, 500];
  const RARE_LOCK = 4, EXTRA = 2, TB_MAX = 5, SPEED_RETRY = 2, QUICK_N = 3, QUICK_T = 15, LOG_N = 6;
  const T = ["g", "o"];

  const init = o => ({ph:"lobby", o:{goal:null, t:30, lv:1, mode:"hype", off:[], ...(o || {})},
    sc:[0,0], im:[0,0], s2:[0,0], ca:[0,0], debt:[0,0], first:0, turn:0, tn:[0,0], rd:0, fnow:0, fin:null, tb:null, win:null,
    sp:0, step:0, stage:"spin", rot:0, seg:null, xb:EXTRA, cd:{}, cur:null, lg:[], dl:0, left:0, tt:0, t0:0});
  const enabled = s => ORDER.filter(k => (MODES[s.o.mode] || MODES.hype).w[k] > 0 && !(C[k].opt && (s.o.off || []).includes(k)));
  /* The wheel as drawn. A card's total area on the wheel equals its probability. Frequent cards are split into several
     equal slices (about 4.5 % each) spread around the wheel, so no slice dominates; slices are ordered so neighbours
     differ in colour family and big and small ones alternate. The order is fixed for given settings. */
  const UNIT = 4.5;
  function odds(s){ const w = (MODES[s.o.mode] || MODES.hype).w, ks = enabled(s), tot = ks.reduce((a, k) => a + w[k], 0), o = {}; ks.forEach(k => o[k] = w[k] / tot); return o; }
  const layoutCache = new Map();
  function layout(s){
    const key = (s.o.mode || "hype") + "|" + enabled(s).join(); if (layoutCache.has(key)) return layoutCache.get(key);
    const w = (MODES[s.o.mode] || MODES.hype).w, ks = enabled(s), tot = ks.reduce((a, k) => a + w[k], 0);
    const ps = []; ks.forEach(k => { const n = Math.max(1, Math.round(w[k] / UNIT)); for (let i = 0; i < n; i++) ps.push({k, w:w[k] / n, i, n}); });
    const sizes = ps.map(x => x.w).sort((a, b) => a - b), med = sizes[Math.floor(sizes.length / 2)];
    const big = x => x.w >= med, rem = ps.slice(), out = [];
    const area = c => rem.filter(x => CAT[x.k] === c).reduce((a, x) => a + x.w, 0);
    while (rem.length){
      const prev = out[out.length - 1], prev2 = out[out.length - 2], first = out[0], lastSlot = rem.length === 1;
      let best = null, bs = Infinity;
      for (const c of rem){
        let sc = 0;
        if (prev && CAT[c.k] === CAT[prev.k]) sc += 100;
        if (lastSlot && first && CAT[c.k] === CAT[first.k]) sc += 100;
        if (prev2 && c.k === prev2.k) sc += 40;
        if (prev && big(c) === big(prev)) sc += 10;
        sc -= area(CAT[c.k]) * 0.8;                       // place the family with most area left first, so it never piles up at the end
        if (sc < bs - 1e-9){ bs = sc; best = c; }
      }
      out.push(best); rem.splice(rem.indexOf(best), 1);
    }
    // repair: swap slices while that removes neighbours of the same colour family (or the same card two apart)
    const cost = arr => { let c = 0; for (let i = 0; i < arr.length; i++){ const n1 = arr[(i + 1) % arr.length], n2 = arr[(i + 2) % arr.length];
      if (CAT[arr[i].k] === CAT[n1.k]) c += 100; if (arr[i].k === n2.k) c += 10; if (big(arr[i]) === big(n1)) c += 1; } return c; };
    for (let pass = 0, cur = cost(out); pass < 40 && cur >= 100; pass++){
      let improved = false;
      for (let i = 0; i < out.length && !improved; i++) for (let j = i + 1; j < out.length && !improved; j++){
        [out[i], out[j]] = [out[j], out[i]]; const c = cost(out);
        if (c < cur){ cur = c; improved = true; } else [out[i], out[j]] = [out[j], out[i]];
      }
      if (!improved) break;
    }
    let a = 0; const L = out.map(x => { const d = x.w / tot * 360, sl = {k:x.k, a0:a, a1:a + d, p:x.w / tot, i:x.i, n:x.n}; a += d; return sl; });
    layoutCache.set(key, L); return L;
  }
  // cards that cannot come up on the next spin, and why
  function locks(s, sub){
    const L = {}, next = s.sp + 1, fin = s.ph === "final" || s.ph === "tb";
    for (const k of enabled(s)){
      if (C[k].rare && s.cd[k] != null && next - s.cd[k] <= RARE_LOCK) L[k] = "rare";
      if ((k === "respin" || k === "l2") && (s.xb <= 0 || fin || sub)) L[k] = fin ? "final" : "extra";
      if (k === "swap" && fin) L[k] = "final";
    }
    return L;
  }
  function pick(s, R, sub){
    const w = (MODES[s.o.mode] || MODES.hype).w, L = locks(s, sub), ks = enabled(s).filter(k => !L[k]);   // the card is drawn by its weight; spinTo then picks one of its equal slices
    let x = R() * ks.reduce((a, k) => a + w[k], 0);
    for (const k of ks){ x -= w[k]; if (x < 0) return k; }
    return ks[ks.length - 1];
  }
  const tok = s => s.sp + "." + s.step;
  const other = t => 1 - t;
  function log(s, t, d, code){ s.lg.unshift([t, d, code]); if (s.lg.length > LOG_N) s.lg.length = LOG_N; }
  function add(s, t, v, code){
    if (v > 0 && s.debt[t] > 0){ const pay = Math.min(s.debt[t], v); s.debt[t] -= pay; v -= pay; log(s, t, pay, "repay"); if (!v) return 0; }
    const b = s.sc[t]; s.sc[t] = Math.max(0, b + v); log(s, t, s.sc[t] - b, code); return s.sc[t] - b;
  }
  const net = (s, t) => s.sc[t] - (s.debt ? s.debt[t] : 0);
  // a deduction imposed on team t: immunity absorbs all of it once; own=true (a lost bet) is not covered
  function hit(s, t, v, code, own){
    if (!own && s.im[t]){ s.im[t] = 0; log(s, t, 0, "shield"); return {blocked:1, d:0}; }
    return {d:add(s, t, -v, code)};
  }
  function setTimer(s, now, sec){ s.tt = sec; s.dl = now + sec * 1000; s.left = sec; s.to = 0; }
  function stopTimer(s){ s.dl = 0; s.left = 0; s.to = 0; }
  function question(s, p, env, lv){ const x = env.q(lv); p.ci = x.ci; return x.d; }

  function spinTo(s, k, R){
    const all = layout(s).filter(x => x.k === k), sl = all[Math.min(all.length - 1, Math.floor(R() * all.length))], m = (sl.a1 - sl.a0) * 0.18;
    const theta = sl.a0 + m + R() * (sl.a1 - sl.a0 - 2 * m), target = (360 - theta) % 360, cur = ((s.rot % 360) + 360) % 360;
    s.rot = s.rot + 360 * 6 + ((target - cur + 360) % 360);
  }
  function startSpin(s, env, sub){
    s.sp++; const k = pick(s, env.R, sub); s.seg = k; spinTo(s, k, env.R); s.stage = "rolling"; s.t0 = env.now; s.sub = sub || null;
  }
  // a card comes into play for the team in turn
  function resolve(s, p, env, k){
    const t = s.turn, o = other(t);
    if (C[k].rare) s.cd[k] = s.sp;
    s.seg = k; s.stage = "card"; stopTimer(s);
    const done = res => { s.cur = {k, st:"done", ...(res || {})}; };
    if (k[0] === "p" && k !== "p") { const v = +k.slice(1); add(s, t, v, k); return done({v}); }
    if (k[0] === "m") { const v = +k.slice(1), r = hit(s, t, v, k); return done({v, blocked:r.blocked || 0, d:r.d}); }
    if (k === "imm"){ if (s.im[t]){ add(s, t, 100, "imm2"); return done({conv:1}); } s.im[t] = 1; log(s, t, 0, "imm"); return done({}); }
    if (k === "sec"){ if (s.s2[t]){ add(s, t, 100, "sec2"); return done({conv:1}); } s.s2[t] = 1; log(s, t, 0, "sec"); return done({}); }
    if (k === "swap"){
      const had = s.im[0] + s.im[1] + s.s2[0] + s.s2[1]; [s.im[0], s.im[1]] = [s.im[1], s.im[0]]; [s.s2[0], s.s2[1]] = [s.s2[1], s.s2[0]];
      if (had) log(s, t, 0, "swap"); return done({none:had ? 0 : 1});
    }
    if (k === "steal"){
      if (s.im[o]){ s.im[o] = 0; log(s, o, 0, "shield"); return done({blocked:1}); }
      const take = Math.min(QPTS.steal, s.sc[o]); if (take){ add(s, o, -take, "stolen"); add(s, t, take, "steal"); } return done({v:take});
    }
    if (k === "respin"){ s.xb--; return done({}); }
    if (k === "l2"){ s.xb--; s.cur = {k, st:"a"}; return; }
    if (k === "box"){ s.cur = {k, st:"closed"}; return; }
    if (k === "tre"){ s.cur = {k, st:"pick"}; return; }
    if (k === "bet"){
      if (s.sc[t] < 100){ s.cur = {k, st:"low", loanOk:s.debt[t] ? 0 : 1}; return; }
      s.cur = {k, st:"wager", ws:[100, 200, 300].filter(v => v <= s.sc[t])}; return;
    }
    if (k === "q" || k === "gold"){ s.cur = {k, st:"ask", q:question(s, p, env, k === "gold" ? 2 : (s.o.lv === 3 ? null : s.o.lv)), v:QPTS[k]}; setTimer(s, env.now, s.o.t); return; }
    if (k === "streak"){ s.cur = {k, st:"ask", n:0, got:0, q:question(s, p, env, s.o.lv === 3 ? null : s.o.lv), v:STREAK[0]}; setTimer(s, env.now, s.o.t); return; }
    if (k === "quick"){ s.cur = {k, st:"ask", n:0, got:0, q:question(s, p, env, s.o.lv === 3 ? null : s.o.lv), v:QPTS.quick}; setTimer(s, env.now, QUICK_T); return; }
    if (k === "speed"){ s.cur = {k, st:"ask", re:0, q:question(s, p, env, s.o.lv === 3 ? null : s.o.lv)}; setTimer(s, env.now, s.o.t); return; }
  }
  function startFinal(s){
    s.ph = "final"; const n0 = net(s, 0), n1 = net(s, 1), lo = n0 < n1 ? 0 : n1 < n0 ? 1 : s.first;
    s.fin = {ord:[lo, other(lo)], i:0}; s.turn = lo; s.stage = "spin"; s.cur = null; s.seg = null; s.xb = EXTRA;
  }
  function startTiebreak(s, p, env){
    s.ph = "tb"; s.tb = {n:0}; s.stage = "card"; s.seg = "speed";
    s.cur = {k:"speed", st:"ask", re:0, tb:1, q:question(s, p, env, s.o.lv === 3 ? null : s.o.lv)}; setTimer(s, env.now, s.o.t);
  }
  function endTurn(s, p, env){
    s.tn[s.turn]++; s.xb = EXTRA; s.cur = null; s.seg = null; stopTimer(s); s.stage = "spin";
    if (s.ph === "play"){
      if (s.tn[0] === s.tn[1]){
        s.rd++;
        if (Math.max(net(s, 0), net(s, 1)) >= s.o.goal || s.rd >= CAP[s.o.goal] || s.fnow) return startFinal(s);
        s.turn = s.first;
      } else s.turn = other(s.turn);
      return;
    }
    if (s.ph === "final"){
      s.fin.i++;
      if (s.fin.i < 2){ s.turn = s.fin.ord[1]; return; }
      const f0 = Math.max(0, net(s, 0)), f1 = Math.max(0, net(s, 1));      // final result: points minus any unpaid loan, never below 0
      s.fs = [f0, f1];
      if (f0 !== f1){ s.ph = "end"; s.win = f0 > f1 ? 0 : 1; s.stage = "end"; return; }
      return startTiebreak(s, p, env);
    }
  }
  const judging = c => c && c.st === "ask" && ["q","gold","bet","streak","quick"].includes(c.k);

  /* host actions. Returns true when the action changed the state. env = {R:() => [0,1), now:ms, q:lv => {d, ci}} */
  function act(s, p, a, arg, tk, env){
    if (tk !== tok(s)) return false;                      // stale or repeated: ignore
    const ok = apply(s, p, a, arg, env);
    if (ok) s.step++;
    return ok;
  }
  function apply(s, p, a, arg, env){
    const t = s.turn, c = s.cur;
    if (a === "start"){
      if (s.ph !== "lobby" && s.ph !== "end") return false;
      if (!GOALS.includes(s.o.goal) || !TIMES.includes(s.o.t)) return false;
      const o = s.o, sp = s.sp, rot = s.rot, step = s.step; Object.assign(s, init(o)); s.sp = sp; s.rot = rot; s.step = step;
      s.first = env.R() < 0.5 ? 0 : 1; s.turn = s.first; s.ph = "play"; s.stage = "spin"; return true;
    }
    if (s.ph === "lobby" || s.ph === "end") return false;
    if (a === "spin"){ if (s.stage !== "spin") return false; startSpin(s, env); return true; }
    if (a === "land"){
      if (s.stage !== "rolling") return false;
      if (s.sub){ const k = s.seg; s.stage = "card"; s.seg = "l2"; if (s.sub === "a"){ c.a = k; c.st = "b"; } else { c.b = k; c.st = "choose"; } s.sub = null; return true; }
      resolve(s, p, env, s.seg); return true;
    }
    if (a === "final"){ if (s.ph !== "play" || s.fnow) return false; s.fnow = 1; return true; }
    if (!c) return false;
    if (a === "l2spin"){ if (c.k !== "l2" || (c.st !== "a" && c.st !== "b") || s.stage !== "card") return false; startSpin(s, env, c.st); return true; }
    if (a === "l2pick"){ if (c.k !== "l2" || c.st !== "choose" || (arg !== "a" && arg !== "b")) return false; resolve(s, p, env, c[arg]); s.cur.from2 = 1; return true; }
    if (a === "again"){
      const ready = (c.k === "respin" && c.st === "done") || (c.k === "box" && c.st === "open" && c.r === "respin");
      if (!ready) return false; s.cur = null; s.seg = null; s.stage = "spin"; return true;
    }
    if (a === "open"){
      if (c.k !== "box" || c.st !== "closed") return false;
      const noRe = s.xb <= 0 || s.ph === "final", pool = BOX.filter(b => !(noRe && b[0] === "respin"));
      let x = env.R() * pool.reduce((q, b) => q + b[2], 0), r = pool[pool.length - 1];
      for (const b of pool){ x -= b[2]; if (x < 0){ r = b; break; } }
      c.st = "open"; c.r = r[0]; c.v = r[1];
      if (r[0] === "p") add(s, t, r[1], r[1] === 400 ? "box400" : "box");
      else if (r[0] === "m"){ const h = hit(s, t, r[1], "box"); c.blocked = h.blocked || 0; c.d = h.d; }
      else if (r[0] === "imm"){ if (s.im[t]){ add(s, t, 100, "imm2"); c.conv = 1; } else { s.im[t] = 1; log(s, t, 0, "imm"); } }
      else if (r[0] === "respin") s.xb--;
      return true;
    }
    if (a === "tpick"){
      if (c.k !== "tre" || c.st !== "pick" || ![0, 1, 2].includes(arg)) return false;
      const v = TREASURE.slice(); for (let i = v.length - 1; i > 0; i--){ const j = Math.floor(env.R() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; }
      c.vals = v; c.pick = arg; c.st = "open"; add(s, t, v[arg], v[arg] === 500 ? "tre500" : "tre"); return true;
    }
    if (a === "loan" || a === "alt" || a === "skip"){
      if (c.k !== "bet" || c.st !== "low") return false;
      if (a === "skip"){ c.st = "skipped"; return true; }
      if (a === "loan" && (!c.loanOk || s.debt[t])) return false;
      if (a === "loan"){ c.loan = 1; c.v = 100; } else { c.alt = 1; c.v = QPTS.q; }
      c.st = "ask"; c.q = question(s, p, env, s.o.lv === 3 ? null : s.o.lv); setTimer(s, env.now, s.o.t); return true;
    }
    if (a === "wager"){
      if (c.k !== "bet" || c.st !== "wager" || !c.ws.includes(arg)) return false;
      c.v = arg; c.st = "ask"; c.q = question(s, p, env, s.o.lv === 3 ? null : s.o.lv); setTimer(s, env.now, s.o.t); return true;
    }
    if (a === "ok" || a === "no"){
      if (!judging(c)) return false;
      stopTimer(s); c.ci = p.ci;
      if (a === "ok"){
        s.ca[t]++; add(s, t, c.v, c.k);
        if (c.k === "streak"){ c.got += c.v; c.n++; c.st = c.n >= STREAK.length ? "shown" : "right"; c.ok = 1; return true; }
        if (c.k === "quick"){ c.got += c.v; c.n++; c.st = c.n >= QUICK_N ? "shown" : "right"; c.ok = 1; return true; }
        c.st = "shown"; c.ok = 1; return true;
      }
      if ((["q","gold","streak"].includes(c.k) || (c.k === "bet" && c.alt)) && s.s2[t] && !c.u2){
        s.s2[t] = 0; c.u2 = 1; c.retry = 1; log(s, t, 0, "sec-used"); setTimer(s, env.now, s.o.t); delete c.ci; return true;   // same question again
      }
      c.ok = 0;
      if (c.k === "bet" && c.loan){ s.debt[t] = Math.min(100, s.debt[t] + c.v); log(s, t, 0, "debt"); c.st = "shown"; return true; }
      if (c.k === "bet" && !c.alt){ const h = hit(s, t, c.v, "bet", true); c.d = h.d; c.st = "shown"; return true; }
      if (c.k === "quick"){ c.n++; c.st = c.n >= QUICK_N ? "shown" : "wrong"; return true; }
      c.st = "shown"; return true;
    }
    if (a === "more"){            // next question in a streak or a quick round
      if (!((c.k === "streak" && c.st === "right") || (c.k === "quick" && (c.st === "right" || c.st === "wrong")))) return false;
      c.q = question(s, p, env, s.o.lv === 3 ? null : s.o.lv); c.st = "ask"; delete c.ci; delete c.ok; delete c.u2; delete c.retry;
      if (c.k === "streak") c.v = STREAK[c.n];
      setTimer(s, env.now, c.k === "quick" ? QUICK_T : s.o.t); return true;
    }
    if (["sg","so","sn","sx"].includes(a)){
      if (c.k !== "speed" || c.st !== "ask") return false;
      stopTimer(s); c.ci = p.ci;
      if (a === "sg" || a === "so"){
        const w = a === "sg" ? 0 : 1; c.w = w; c.st = "shown";
        if (c.tb){ s.ph = "end"; s.win = w; s.stage = "end"; log(s, w, 0, "tb"); return true; }
        s.ca[w]++; add(s, w, QPTS.speed, "speed"); return true;
      }
      if (c.tb){
        s.tb.n++;
        if (s.tb.n >= TB_MAX){ c.st = a === "sx" ? "cancel" : "shown"; c.w = -1; s.ph = "end"; s.win = "d"; s.stage = "end"; return true; }
        c.q = question(s, p, env, s.o.lv === 3 ? null : s.o.lv); delete c.ci; c.st = "ask"; setTimer(s, env.now, s.o.t); c.last = a; return true;
      }
      c.w = -1; c.st = a === "sx" ? "cancel" : "shown"; return true;
    }
    if (a === "sre"){
      if (c.k !== "speed" || c.st !== "cancel" || c.re >= SPEED_RETRY) return false;
      c.re++; c.q = question(s, p, env, s.o.lv === 3 ? null : s.o.lv); delete c.ci; delete c.w; c.st = "ask"; setTimer(s, env.now, s.o.t); return true;
    }
    if (a === "next"){
      const fine = c.st === "done" ? !(c.k === "respin")
        : c.st === "shown" || c.st === "skipped" || (c.k === "speed" && c.st === "cancel") || (c.k === "box" && c.st === "open" && c.r !== "respin") || (c.k === "tre" && c.st === "open");
      if (!fine) return false;
      endTurn(s, p, env); return true;
    }
    return false;
  }
  // the host's clock: returns true when the visible state changed
  function tick(s, now){
    if (!s.dl) return false;
    const left = Math.max(0, Math.ceil((s.dl - now) / 1000));
    if (left === s.left && (left > 0 || s.to)) return false;
    s.left = left; if (!left) s.to = 1; return true;
  }
  // what the host may press now (used by the interface and by the tests)
  function moves(s){
    const c = s.cur, m = [];
    if (s.ph === "lobby" || s.ph === "end"){ if (GOALS.includes(s.o.goal)) m.push("start"); return m; }
    if (s.stage === "spin") m.push("spin");
    if (s.stage === "rolling") m.push("land");
    if (s.ph === "play" && !s.fnow) m.push("final");
    if (!c || s.stage !== "card") return m;
    if (c.k === "l2" && (c.st === "a" || c.st === "b")) m.push("l2spin");
    if (c.k === "l2" && c.st === "choose") m.push("l2pick");
    if ((c.k === "respin" && c.st === "done") || (c.k === "box" && c.st === "open" && c.r === "respin")) m.push("again");
    if (c.k === "box" && c.st === "closed") m.push("open");
    if (c.k === "tre" && c.st === "pick") m.push("tpick");
    if (c.k === "bet" && c.st === "wager") m.push("wager");
    if (c.k === "bet" && c.st === "low"){ if (c.loanOk && !s.debt[s.turn]) m.push("loan"); m.push("alt", "skip"); }
    if (judging(c)) m.push("ok", "no");
    if ((c.k === "streak" && c.st === "right") || (c.k === "quick" && (c.st === "right" || c.st === "wrong"))) m.push("more");
    if (c.k === "speed" && c.st === "ask") m.push("sg", "so", "sn", "sx");
    if (c.k === "speed" && c.st === "cancel" && c.re < SPEED_RETRY && !c.tb) m.push("sre");
    const nx = c.st === "done" ? c.k !== "respin" : c.st === "shown" || c.st === "skipped" || (c.k === "speed" && c.st === "cancel") || (c.k === "box" && c.st === "open" && c.r !== "respin") || (c.k === "tre" && c.st === "open");
    if (nx && !c.tb) m.push("next");
    return m;
  }
  return {C, ORDER, MODES, BOX, GOALS, CAP, TIMES, QPTS, STREAK, TREASURE, RARE_LOCK, EXTRA, TB_MAX, SPEED_RETRY, QUICK_N, QUICK_T, T,
    CAT, UNIT, init, enabled, odds, layout, locks, tok, act, tick, moves, net};
})();
if (typeof module !== "undefined") module.exports = W3;
