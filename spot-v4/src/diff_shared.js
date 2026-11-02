/* Two synced photo panes with pinch/scroll zoom and drag-to-pan, for the SHARED board.
   The board only reports taps (picture coordinates + the tap tolerance at the current zoom); what was found, missed or
   hinted is drawn from the host's state, never decided here. A tap counts only when the finger did not move, no second
   finger touched, and it is not a repeat of the same touch (browsers sometimes fire one touch twice). */
function mountBoard(el, pair, onTap){
  const W = pair.w, Hh = pair.h;
  el.innerHTML = `<div class="dfbar"><button class="btn ghost sm" data-z="in" aria-label="تكبير">＋</button><button class="btn ghost sm" data-z="out" aria-label="تصغير">－</button><button class="btn ghost sm" data-z="reset">حجم كامل</button><span class="muted dfhint">كبّر بإصبعين أو بعجلة الفأرة، واسحب للتحريك. التكبير والسحب لا يُحسبان أخطاء.</span></div>
    <div class="dfpair">${[pair.a, pair.b].map((f, i) => `<div class="dfimg" style="aspect-ratio:${W}/${Hh}"><div class="dfzoom"><img src="${esc(f)}" alt="${i ? "الصورة الثانية" : "الصورة الأولى"}" draggable="false"><div class="dfmarks"></div></div></div>`).join("")}</div>`;
  const panes = [...el.querySelectorAll(".dfimg")], zooms = [...el.querySelectorAll(".dfzoom")], marks = [...el.querySelectorAll(".dfmarks")];
  let sc = 1, tx = 0, ty = 0, locked = false, last = null, view = {fd:[], hz:null, rev:null, pend:[]};
  const clamp = () => { const w = panes[0].clientWidth, h = panes[0].clientHeight; sc = Math.min(6, Math.max(1, sc)); tx = Math.min(0, Math.max(w - w * sc, tx)); ty = Math.min(0, Math.max(h - h * sc, ty)); };
  const apply = () => { clamp(); zooms.forEach(z => z.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`); el.classList.toggle("zoomed", sc > 1.01); };
  const zoomAt = (f, px, py) => { const ns = Math.min(6, Math.max(1, sc * f)), k = ns / sc; tx = px - (px - tx) * k; ty = py - (py - ty) * k; sc = ns; apply(); };
  const box = (x, y, rx, ry, cls, extra) => `<span class="dfm ${cls}" style="left:${(x - rx * 1.25) / W * 100}%;top:${(y - ry * 1.25) / Hh * 100}%;width:${rx * 2.5 / W * 100}%;height:${ry * 2.5 / Hh * 100}%">${extra || ""}</span>`;
  const draw = () => {
    let h = view.fd.map(f => box(f[1], f[2], f[3], f[4], f[5] === view.me ? "mine" : "", `<i>${esc(f[6] || "")}</i>`)).join("");
    if (view.rev) h += view.rev.map(r => box(r[0], r[1], r[2], r[3], "rev")).join("");
    if (view.hz && !view.rev) h += `<span class="dfhz" style="left:${(view.hz[0] - view.hz[2]) / W * 100}%;top:${(view.hz[1] - view.hz[2]) / Hh * 100}%;width:${view.hz[2] * 2 / W * 100}%;height:${view.hz[2] * 2 / Hh * 100}%"></span>`;
    h += view.pend.map(p => `<span class="dfpend" style="left:${p.x / W * 100}%;top:${p.y / Hh * 100}%"></span>`).join("");
    marks.forEach(m => m.innerHTML = h);
  };
  // a short sign at the tap: ✕ (miss), or a word (already found, too close to call)
  const flash = (x, y, txt, cls) => panes.forEach(pane => { const s = document.createElement("span"); s.className = "dfx " + (cls || ""); s.style.left = x / W * 100 + "%"; s.style.top = y / Hh * 100 + "%"; s.textContent = txt; pane.querySelector(".dfmarks").appendChild(s); setTimeout(() => s.remove(), 1100); });
  const tap = (pane, cx, cy) => {
    if (locked) return;
    const r = pane.getBoundingClientRect(), lx = (cx - r.left - tx) / sc, ly = (cy - r.top - ty) / sc;
    const x = lx / r.width * W, y = ly / r.height * Hh;
    if (x < 0 || y < 0 || x > W || y > Hh) return;                       // outside the picture: nothing
    const now = Date.now();
    if (last && now - last.t < 350 && Math.hypot(cx - last.cx, cy - last.cy) < 12) return;   // the same touch fired twice
    last = {t:now, cx, cy};
    // tolerance: a fingertip (12 screen px) at the current zoom, never more than 2.5% of the picture width
    const tol = Math.min(0.025 * W, Math.max(0.008 * W, 12 * W / ((r.width || 1) * sc)));
    onTap && onTap(Math.round(x), Math.round(y), Math.round(tol));
  };
  const pts = new Map(); let start = null, multi = false, pinch0 = null;
  panes.forEach(pane => {
    pane.addEventListener("pointerdown", e => {
      pane.setPointerCapture(e.pointerId); pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if (pts.size === 1){ start = {x:e.clientX, y:e.clientY, tx, ty, t:Date.now(), pane, moved:false}; multi = false; }
      else { multi = true; const [p1, p2] = [...pts.values()], r = pane.getBoundingClientRect(); pinch0 = {d:Math.hypot(p1.x - p2.x, p1.y - p2.y), sc, mx:(p1.x + p2.x) / 2 - r.left, my:(p1.y + p2.y) / 2 - r.top, tx, ty}; }
    });
    pane.addEventListener("pointermove", e => {
      if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
      if (pts.size >= 2 && pinch0){
        const [p1, p2] = [...pts.values()], r = pane.getBoundingClientRect(), d = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        const ns = Math.min(6, Math.max(1, pinch0.sc * d / pinch0.d)), mx = (p1.x + p2.x) / 2 - r.left, my = (p1.y + p2.y) / 2 - r.top, k = ns / pinch0.sc;
        sc = ns; tx = mx - (pinch0.mx - pinch0.tx) * k; ty = my - (pinch0.my - pinch0.ty) * k; apply();
      } else if (start){
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) start.moved = true;
        if (start.moved && sc > 1.01){ tx = start.tx + dx; ty = start.ty + dy; apply(); }
      }
    });
    const end = e => {
      if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
      if (pts.size === 0){
        if (start && !multi && !start.moved && Date.now() - start.t < 700 && e.type === "pointerup") tap(start.pane, e.clientX, e.clientY);
        start = null; pinch0 = null;
      } else if (pts.size === 1){ const [p] = [...pts.values()]; start = {x:p.x, y:p.y, tx, ty, t:Date.now(), pane, moved:true}; pinch0 = null; }
    };
    pane.addEventListener("pointerup", end); pane.addEventListener("pointercancel", end);
    pane.addEventListener("wheel", e => { e.preventDefault(); const r = pane.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.18 : 1 / 1.18, e.clientX - r.left, e.clientY - r.top); }, {passive:false});
    pane.addEventListener("dblclick", e => e.preventDefault());
  });
  el.querySelector(".dfbar").addEventListener("click", e => {
    const b = e.target.closest("[data-z]"); if (!b) return;
    const w = panes[0].clientWidth / 2, h = panes[0].clientHeight / 2;
    if (b.dataset.z === "in") zoomAt(1.5, w, h); else if (b.dataset.z === "out") zoomAt(1 / 1.5, w, h); else { sc = 1; tx = ty = 0; apply(); }
  });
  window.addEventListener("resize", apply);
  draw(); apply();
  return {
    set(v){ view = {...view, ...v}; draw(); },
    flash, lock(on){ locked = on !== false; el.classList.toggle("dflocked", locked); },
    zoomTo(x, y, f){ const r = panes[0].getBoundingClientRect(); sc = 1; tx = ty = 0; zoomAt(f || 2.5, x / W * r.width, y / Hh * r.height); },
  };
}
function spotFail(holder, attr){
  if (holder) holder.innerHTML = `<div class="center stack"><p class="note">تعذّر تحميل صور هذه الجولة. تأكد من الإنترنت ثم أعد المحاولة.</p><div><button class="btn sm" ${attr}>إعادة المحاولة</button></div></div>`;
}
/* attribution: a small button that opens the photo's author, source, licence and the changes made (CC BY / CC BY-SA) */
const infoBtn = attr => `<button class="btn ghost sm" ${attr}>ⓘ معلومات الصورة</button>`;
function imageInfo(p, running){
  const safe = u => /^https:\/\//.test(u || "") ? esc(u) : "";
  const link = (u, t) => safe(u) ? `<a href="${safe(u)}" target="_blank" rel="noopener">${t}</a>` : t;
  let rows;
  if (!p.credit) rows = `<tr><th>العمل</th><td>رسم أصلي من إعداد لمّة</td></tr><tr><th>التعديلات</th><td>نسخة ثانية من الرسم نفسه بفروق مقصودة.</td></tr>`;
  else if (p.credit.length >= 4){
    const [who, page, lic, licUrl] = p.credit, sa = /SA/i.test(lic || "");
    rows = `<tr><th>${p.kind === "art" ? "الفنان" : "المصوّر"}</th><td>${esc(who)}</td></tr><tr><th>المصدر</th><td>${running ? `Wikimedia Commons<br><span class="muted">رابط صفحة الصورة الأصلية يظهر هنا بعد انتهاء الجولة، حتى لا تُكشف الفروق أثناء اللعب.</span>` : link(page, "صفحة الصورة على Wikimedia Commons")}</td></tr>
      <tr><th>الترخيص</th><td>${/^(public domain|cc0)$/i.test(lic || "") ? `<bdi dir="ltr">${esc(lic)}</bdi> (ملكية عامة)` : link(licUrl, `<bdi dir="ltr">${esc(lic)}</bdi>`)}</td></tr>
      <tr><th>التعديلات</th><td>صُغّرت الصورة، وعُدّلت النسخة الثانية بإخفاء عناصر أو إضافتها أو تغيير ألوانها لصنع الفروق.${sa ? " النسختان المعدّلتان متاحتان بالترخيص نفسه." : ""}</td></tr>`;
  } else rows = `<tr><th>المصدر</th><td>${esc(String(p.credit[0] || ""))}</td></tr>`;
  openModal("معلومات الصورة", `<p class="muted">${esc(p.title || "")}</p><table class="htable info">${rows}</table>`);
}
const reportBtn = attr => `<button class="btn ghost sm dfreport" ${attr}>إبلاغ عن مشكلة في الصورة</button>`;

/* ================= SPOT THE DIFFERENCE: one shared picture for everybody =================
   The host's device is the referee. The exact places of the differences stay in the host's private data (H.priv.dfs);
   the shared state only carries the differences already found (with who found them) and, after the round, the rest.
   A phone sends its taps (picture coordinates, tolerance, id); the host checks them in arrival order (taps that reach it
   within the same 150 ms are ordered by the time they were made), so the first correct tap takes the difference and a
   later tap on it is not a mistake. Every player has their own mistakes (5 per round), points, hint and status, kept in
   the host's state: reloading the page or opening a new tab on a phone cannot reset them. */
const DF_MAX_W = 5, DF_PTS = {find:10, last:50, clean:30, miss:5, hint:15};
const dfZero = n => ({n, f:0, w:0, p:0, h:0, out:0, ft:0, b:0});
const Diff = {
  savePriv(){ return {played:[...(H.priv.played || [])], playedLv:H.priv.playedLv || {}, dfs:H.priv.dfs || null, seen:H.priv.seen || {}}; },
  async restore(pv){
    H.priv.played = new Set(pv.played || []); H.priv.playedLv = pv.playedLv || {}; H.priv.dfs = pv.dfs || null; H.priv.seen = pv.seen || {};
    if (H.s.ph === "play" && H.s.pair && H.priv.dfs){ H.priv.dfRd = null; H.priv.dfq = []; startRaceClock(true); }      // the round goes on
    else if (H.s.ph === "play" || H.s.ph === "prep") H.s.ph = "lobby";
  },
  init: () => ({rd:0, pair:null, nd:0, lv:1, fresh:true, fd:[], pl:{}, rev:null, rk:null, tot:{}, end:""}),
  async start(replay){
    if (H.priv.picking) return;
    const s = H.s, rd = s.rd + 1;
    s.rd = rd; s.ph = "prep"; s.fd = []; s.pl = {}; s.rev = null; s.rk = null; s.end = ""; s.pair = null; H.priv.dfs = null; H.priv.seen = {}; H.priv.dfq = [];
    pushHost();
    const devs = [devId, ...hostPlayers().map(p => p.presence.dv).filter(d => typeof d === "string" && /^[a-z0-9]{10,24}$/.test(d))].slice(0, 40);
    let r; H.priv.picking = true;
    const played = H.priv.played || (H.priv.played = new Set());
    if (replay){ for (const id of [...played]) if (Spot.levelOk(s.o.lv, (H.priv.playedLv || {})[id])) played.delete(id); }
    try { r = await Spot.pick(s.o.lv, devs, played); } catch(e){ console.warn(e); r = null; }
    if (H) H.priv.picking = false;
    if (!H || H.g !== "diff" || H.s.rd !== rd) return;
    if (!r){ s.ph = "fail"; pushHost(); return; }
    if (r.done){ s.ph = "done"; pushHost(); return; }   // this room has played every pair of this level
    const p = r.pair;
    H.priv.dfs = p.diffs.map(d => [d.x, d.y, d.rx, d.ry]);                              // the answer stays on this device
    s.pair = {id:p.id, level:p.level, w:p.w, h:p.h, a:p.a, b:p.b, title:p.title, credit:p.credit, kind:p.kind};
    s.nd = p.diffs.length; s.lv = p.level; s.fresh = r.fresh; H.priv.total = r.total;
    Spot.markSeen(p.id, devs); played.add(p.id); (H.priv.playedLv = H.priv.playedLv || {})[p.id] = p.level;
    pushHost();
    try { await preloadSpot(p); } catch(e){ console.warn(e); }
    if (!H || H.g !== "diff" || H.s.rd !== rd) return;
    s.ph = "play"; Diff.enroll(hostPlayers()); startRaceClock(); pushHost();
  },
  // everybody in the room when the round starts (or who joins during it) plays this round
  enroll(players){ const s = H.s; let ch = false; for (const p of players){ const k = peerKey(p.peer); if (!s.pl[k] && !p.away){ s.pl[k] = dfZero(pname(p)); ch = true; } } return ch; },
  act(a){
    const s = H.s;
    if (a === "start" || a === "go") Diff.start();
    else if (a === "end") Diff.finish("host");
    else if (a === "lobby"){ clearInterval(H.priv.tick); s.ph = "lobby"; pushHost(); }
    else if (a === "dfhretry"){ H.priv.dfRd = null; renderHost(); }
    else if (a === "dfinfo" && s.pair) imageInfo(s.pair, s.ph !== "over");
    else if (a === "replay") Diff.start(true);
    else if (a === "dfhint") Diff.hint("host", "dfh" + Date.now());
    else if (a === "dfreport" && s.pair){ Spot.report(s.pair.id).then(() => { const b = $("#hostMain .dfreport"); if (b){ b.textContent = "شكرًا، وصل البلاغ"; b.disabled = true; } }).catch(() => {}); }
  },
  // the referee: one tap of one player
  judge(k, x, y, tol, id){
    const s = H.s, D = H.priv.dfs, pr = s.pl[k];
    if (s.ph !== "play" || !D || !pr) return;
    const res = code => { pr.lr = [id, code, x, y]; };
    if (pr.out){ res("out"); return; }
    const W = s.pair.w, Hh = s.pair.h; if (!(x >= 0 && y >= 0 && x <= W && y <= Hh)) return;     // outside the picture: nothing
    const T = Math.min(0.025 * W, Math.max(0.008 * W, +tol || 0));
    const inBox = (d, t) => Math.abs(x - d[0]) <= d[2] + t && Math.abs(y - d[1]) <= d[3] + t;
    const found = new Set(s.fd.map(f => f[0]));
    // a tap on a difference somebody already found is never a mistake
    const done = s.fd.find(f => inBox(D[f[0]], T));
    const open = D.map((d, i) => i).filter(i => !found.has(i));
    const exact = open.filter(i => inBox(D[i], 0)), near = open.filter(i => inBox(D[i], T));
    let hit = -1;
    if (exact.length) hit = exact.sort((a, b) => Math.hypot(x - D[a][0], y - D[a][1]) - Math.hypot(x - D[b][0], y - D[b][1]))[0];
    else if (near.length === 1) hit = near[0];
    else if (near.length > 1){ res("amb"); return; }                      // two differences under one fingertip: zoom in, no mistake
    if (hit < 0 && done){ res(done[5] === k ? "dup" : "taken"); if (done[5] !== k) pr.lr.push(done[6]); return; }
    if (hit >= 0){
      const d = D[hit]; s.fd.push([hit, d[0], d[1], d[2], d[3], k, pr.n, raceEl(s)]);
      pr.f++; pr.p += DF_PTS.find; pr.ft = Math.max(0, srvNow() - s.t0); res("ok");
      if (s.fd.length >= s.nd){ pr.p += DF_PTS.last; pr.b += DF_PTS.last; Diff.finish("all"); }
      return;
    }
    pr.w++; pr.p = Math.max(0, pr.p - DF_PTS.miss); res("no");
    if (pr.w >= DF_MAX_W){ pr.out = 1; pr.hz = null; }
    Diff.checkEnd();
  },
  hint(k, id){
    const s = H.s, D = H.priv.dfs, pr = s.pl[k];
    if (s.ph !== "play" || !D || !pr || pr.h || pr.out) return;
    const found = new Set(s.fd.map(f => f[0])), open = D.map((d, i) => i).filter(i => !found.has(i));
    if (!open.length) return;
    const d = D[open[Math.floor(Math.random() * open.length)]], W = s.pair.w, Hh = s.pair.h;
    // an approximate area: a circle several times the size of the difference, its centre moved at random
    const R = Math.round(Math.max(d[2], d[3]) * 2.2 + 0.05 * W), a = Math.random() * Math.PI * 2, o = R * (0.25 + Math.random() * 0.4);
    const cx = Math.round(Math.min(W - R * 0.5, Math.max(R * 0.5, d[0] + Math.cos(a) * o))), cy = Math.round(Math.min(Hh - R * 0.5, Math.max(R * 0.5, d[1] + Math.sin(a) * o)));
    pr.h = 1; pr.hz = [cx, cy, R]; pr.p = Math.max(0, pr.p - DF_PTS.hint); pr.lr = [id, "hint", cx, cy];
    if (k === "host") pushHost();
  },
  // the round ends when every difference is found, the time is up, or nobody can play any more
  checkEnd(){
    const s = H.s; if (s.ph !== "play") return;
    const keys = Object.keys(s.pl); if (!keys.length) return;
    if (keys.every(k => s.pl[k].out)) Diff.finish(keys.length === 1 ? "solo" : "out");
  },
  // players who are still allowed to play but all stepped away: wait a minute, then end (no round left hanging)
  watchAway(players){
    const s = H.s; if (s.ph !== "play" || !Object.keys(s.pl).length || s.pl.host) return;
    const here = new Set(activePlayers(players).map(p => peerKey(p.peer)));
    const able = Object.keys(s.pl).filter(k => !s.pl[k].out && here.has(k));
    if (able.length){ H.priv.awayAt = 0; return; }
    if (!H.priv.awayAt) H.priv.awayAt = Date.now();
    else if (Date.now() - H.priv.awayAt > 60000) Diff.finish("away");
  },
  finish(why){
    const s = H.s; if (s.ph !== "play") return;
    clearInterval(H.priv.tick); clearTimeout(H.priv.dfT); s.ph = "over"; s.end = why || "";
    const found = new Set(s.fd.map(f => f[0]));
    s.rev = (H.priv.dfs || []).filter((d, i) => !found.has(i));
    for (const k of Object.keys(s.pl)){ const p = s.pl[k]; if (p.f > 0 && !p.w && !p.out){ p.p += DF_PTS.clean; p.b += DF_PTS.clean; } p.hz = null; }
    s.rk = Object.keys(s.pl).sort((a, b) => { const x = s.pl[a], y = s.pl[b]; return y.p - x.p || y.f - x.f || x.w - y.w || (x.ft || 9e9) - (y.ft || 9e9); });
    const tot = s.tot || (s.tot = {});
    for (const k of s.rk){ const p = s.pl[k], t = tot[k] || (tot[k] = {n:p.n, p:0, r:0, f:0}); t.n = p.n; t.p += p.p; t.r++; t.f += p.f; }
    pushHost();
  },
  // taps and hint requests from the phones: collected for 150 ms, then judged oldest first
  hostPeers(players){
    const s = H.s; if (s.ph !== "play") return;
    let ch = Diff.enroll(players);
    const seen = H.priv.seen || (H.priv.seen = {}), q = H.priv.dfq || (H.priv.dfq = []);
    for (const p of players){
      const z = p.presence.df; if (!z || z.rd !== s.rd) continue;
      const k = peerKey(p.peer), sn = seen[k] || (seen[k] = []);
      if (!s.pl[k]){ s.pl[k] = dfZero(pname(p)); ch = true; }
      for (const t of Array.isArray(z.q) ? z.q.slice(-8) : []){
        if (!Array.isArray(t) || typeof t[0] !== "string" || sn.includes(t[0])) continue;
        sn.push(t[0]); if (sn.length > 40) sn.shift();
        q.push({k, id:t[0], x:+t[1], y:+t[2], tol:+t[3], at:Math.min(srvNow(), Math.max(s.t0 || 0, +t[4] || 0))});
      }
      if (z.hq && typeof z.hq === "string" && !sn.includes(z.hq)){ sn.push(z.hq); q.push({k, id:z.hq, hint:true, at:srvNow()}); }
    }
    Diff.watchAway(players);
    if (q.length && !H.priv.dfT) H.priv.dfT = setTimeout(Diff.drain, 150);
    else if (ch) pushHost();
  },
  drain(){
    if (!H || H.g !== "diff") return;
    H.priv.dfT = null;
    const q = (H.priv.dfq || []).sort((a, b) => a.at - b.at); H.priv.dfq = [];
    for (const t of q){ if (t.hint) Diff.hint(t.k, t.id); else Diff.judge(t.k, t.x, t.y, t.tol, t.id); }
    pushHost();
  },
  // results: points, found, mistakes, time; ties go to more found, then fewer mistakes, then the earlier last find
  resultsHTML(s, me){
    const rows = (s.rk || []).map((k, i) => { const p = s.pl[k]; return `<tr class="${k === me ? "me" : ""}"><td>${i + 1}</td><td>${esc(p.n)}${p.out ? ` <span class="chip warn sm">استُبعد</span>` : ""}</td><td>${p.f}</td><td>${p.w}</td><td>${p.ft ? fmtT(Math.round(p.ft / 1000)) : "—"}</td><td><b>${p.p}</b>${p.b ? ` <span class="muted">(+${p.b})</span>` : ""}</td></tr>`; }).join("");
    const T = s.tot || {}, tk = Object.keys(T).sort((a, b) => T[b].p - T[a].p || T[b].f - T[a].f);
    const tot = tk.length && (s.rd > 1 || tk.some(k => T[k].r > 1)) ? `<h3>الترتيب العام</h3><div class="tbl"><table class="htable dfres"><tr><th>#</th><th>اللاعب</th><th>الجولات</th><th>الفروق</th><th>النقاط</th></tr>${tk.map((k, i) => `<tr class="${k === me ? "me" : ""}"><td>${i + 1}</td><td>${esc(T[k].n)}</td><td>${T[k].r}</td><td>${T[k].f}</td><td><b>${T[k].p}</b></td></tr>`).join("")}</table></div>` : "";
    const why = {all:"اكتُشفت كل الفروق.", time:"انتهى الوقت.", out:"استنفد كل اللاعبين محاولاتهم.", solo:"استنفد اللاعب محاولاته الخمس.", away:"لم يبقَ لاعب متصل يستطيع اللعب.", host:"أنهى المقدّم الجولة."}[s.end] || "";
    return `<p class="muted">${why} ${s.rev && s.rev.length ? `الدوائر البرتقالية هي ${s.rev.length === 1 ? "الفرق الذي لم يُكتشف" : `الفروق الـ${s.rev.length} التي لم تُكتشف`}.` : ""}</p>
      ${rows ? `<div class="tbl"><table class="htable dfres"><tr><th>#</th><th>اللاعب</th><th>الفروق</th><th>الأخطاء</th><th>آخر اكتشاف</th><th>النقاط</th></tr>${rows}</table></div><p class="muted dfnote">+10 لكل فرق، +50 لمن يكتشف الفرق الأخير، +30 لمن أنهى الجولة دون أخطاء، −5 لكل خطأ، −15 للتلميح. ما بين القوسين مكافآت.</p>` : ""}${tot}`;
  },
  liveHTML(s, me){
    const ks = Object.keys(s.pl).sort((a, b) => s.pl[b].p - s.pl[a].p || s.pl[b].f - s.pl[a].f);
    if (!ks.length) return `<p class="muted">بانتظار اللاعبين…</p>`;
    return `<div class="lb dflive">${ks.map(k => { const p = s.pl[k]; return `<div class="${k === me ? "me" : ""} ${p.out ? "out" : ""}"><span>${esc(p.n)}${p.out ? " · استُبعد" : ""}</span><span class="muted">${p.f} فرق · ${p.w}/${DF_MAX_W} أخطاء · <b>${p.p}</b></span></div>`; }).join("")}</div>`;
  },
  host(players){
    const s = H.s, m = $("#hostMain");
    if (s.ph === "lobby"){
      H.priv.dfRd = null;
      if (!H.priv.idxAsked){ H.priv.idxAsked = true; Spot.loadIndex().then(() => { if (H && H.g === "diff" && H.s.ph === "lobby"){ $("#hostMain").dataset.k = ""; renderHost(); } }); }
      const ix = Spot.index, cnt = ix ? ix.levels : null;
      setMain(lobbyHTML(players, `${cnt ? `<p class="muted">عدد الصور: سهل ${cnt[0]} · متوسط ${cnt[1]} · صعب ${cnt[2]}. لا يتكرر زوج داخل الغرفة حتى تُلعب كل صور المستوى.</p>` : ""}
        <p class="muted">${["سهل: 5 فروق واضحة.","متوسط: 8 فروق تحتاج تركيزًا.","صعب: 12 فرقًا دقيقًا.","الكل: زوج عشوائي من أي مستوى."][s.o.lv]} صورة واحدة مشتركة للجميع، والفرق لمن يكتشفه أولًا. لكل لاعب 5 أخطاء وتلميح واحد في الجولة.</p>`, "ابدأ الجولة"));
      return;
    }
    if (s.ph === "done" || s.ph === "fail"){ H.priv.dfRd = null; clearInterval(H.priv.tick);
      setMain(`<div class="panel center stack endcard" style="margin-top:18px">${s.ph === "done" ? `<p class="bigmsg endtitle">لُعبت كل صور هذا المستوى في هذه الغرفة</p><p class="muted">يمكنك اختيار مستوى آخر أو إعادة اللعب بالصور نفسها.</p>` : `<p class="bigmsg">تعذّر تجهيز الصور</p><p class="muted">تأكد من الإنترنت ثم أعد المحاولة.</p>`}
        <div class="row" style="justify-content:center">${s.ph === "done" ? `<button class="btn" data-h="lobby">اختيار مستوى آخر</button><button class="btn ghost" data-h="replay">إعادة اللعب</button>` : `<button class="btn" data-h="go">إعادة المحاولة</button><button class="btn ghost" data-h="lobby">الإعدادات</button>`}</div></div>`); return; }
    const pair = s.pair;
    if (s.ph === "prep" || !pair){ H.priv.dfRd = null; setMain(`<div class="panel center stack" style="margin-top:18px"><div class="spinner"></div><p class="bigmsg">جارٍ تجهيز الصورتين…</p></div>`); return; }
    const solo = !H.code || !players.length || !!s.pl.host;       // nobody joined: the host plays on this screen
    if (H.priv.dfRd !== s.rd){
      H.priv.dfRd = s.rd; H.priv.dfm = null;
      m.innerHTML = `<div class="dfhost"><div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)} · ${LV_NAMES[s.lv]}</h3><b id="dfHostCount" class="count"></b></div><div id="dfMe"></div><div class="df-holder"></div><div class="row dfmeta">${infoBtn('data-h="dfinfo"')}<span id="dfRep"></span></div></div><div class="stack" id="dfSide"></div></div>`;
      m.dataset.k = "";
      const rd = s.rd, holder = m.querySelector(".df-holder");
      preloadSpot(pair).then(() => {
        if (!H || H.s.rd !== rd) return;
        H.priv.dfm = mountBoard(holder, pair, (x, y, tol) => {
          if (!H || H.s.ph !== "play") return;
          const live = H.code && hostPlayers().length && !H.s.pl.host;
          if (live) return;                                           // players are on: the host screen only shows the board
          if (!H.s.pl.host) H.s.pl.host = dfZero("المقدّم");
          const id = "h" + Date.now().toString(36); Diff.judge("host", x, y, tol, id); pushHost();
        });
        renderHost();
      }).catch(() => spotFail(holder, 'data-h="dfhretry"'));
    }
    const over = s.ph === "over", me = solo ? "host" : "";
    if (H.priv.dfm){
      H.priv.dfm.set({fd:s.fd, me, rev:over ? s.rev : null, hz:solo && s.pl.host ? s.pl.host.hz : null, pend:[]});
      H.priv.dfm.lock(over || (!solo && !!H.code));
      const lr = solo && s.pl.host && s.pl.host.lr;
      if (lr && H.priv.dfLr !== lr[0]){ H.priv.dfLr = lr[0]; Diff.feedback(H.priv.dfm, lr, s); }
    }
    setEl($("#dfHostCount"), `${s.fd.length} من ${s.nd} فروق`);
    const hp = s.pl.host;
    setEl($("#dfMe"), solo && hp && !over ? Diff.meHTML(hp, true) : solo && !over ? `<div class="row dfmine"><span class="muted">العب من هذه الشاشة، أو اعرض الكود ليشارك الآخرون من جوالاتهم.</span><button class="btn ghost sm" data-h="dfhint" disabled>💡 تلميح (−15)</button></div>` : "");
    setEl($("#dfRep"), over ? reportBtn('data-h="dfreport"') : "");
    setEl($("#dfSide"), `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${over ? "نتيجة الجولة" : "اللاعبون"}</h3>${clockChip(s)}</div>${over ? Diff.resultsHTML(s, me) : Diff.liveHTML(s, me)}</div>
      <div class="row">${over ? "" : `<button class="btn ghost sm" data-h="end">إنهاء وكشف الفروق</button>`}<button class="btn" data-h="go">${over ? "الجولة التالية" : "صورة جديدة"}</button><button class="btn ghost sm" data-h="lobby">الإعدادات</button></div>`);
  },
  meHTML(p, host){
    const left = DF_MAX_W - p.w;
    return `<div class="row dfmine ${p.out ? "out" : ""}"><span class="chip ${p.w >= 4 ? "warn" : ""}">الأخطاء: ${p.w} من ${DF_MAX_W}</span><span class="chip">اكتشفت ${p.f}</span><span class="chip gold">نقاطك ${p.p}</span>
      <button class="btn ghost sm" ${host ? 'data-h="dfhint"' : 'data-act="dfhint"'} ${p.h || p.out ? "disabled" : ""}>💡 ${p.h ? "استُخدم التلميح" : "تلميح (−15)"}</button></div>
      ${p.out ? `<p class="note">انتهت محاولاتك الخمس في هذه الجولة. تابع اللعب حتى نهايتها، وتعود للمشاركة في الجولة التالية.</p>` : left === 1 ? `<p class="muted">بقيت لك محاولة خاطئة واحدة.</p>` : ""}`;
  },
  // what happened to a tap, shown at the place of the tap
  feedback(board, lr, s){
    const [, code, x, y, who] = lr;
    if (code === "ok") board.flash(x, y, "+10", "ok");
    else if (code === "no") board.flash(x, y, "✕");
    else if (code === "taken") board.flash(x, y, `سبقك ${who || ""}`, "info");
    else if (code === "dup") board.flash(x, y, "اكتُشف", "info");
    else if (code === "amb") board.flash(x, y, "كبّر الصورة", "info");
    else if (code === "hint") board.zoomTo(x, y, 1.8);
  },
  player(s){
    const pair = s.pair, me = peerKey(myPeer());
    if (s.ph === "done" || s.ph === "fail"){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><p class="bigmsg">بانتظار المقدّم…</p><p class="muted">${s.ph === "done" ? "لُعبت كل صور هذا المستوى." : ""}</p></div>`); bindPlayer(); return; }
    if (s.ph === "prep" || !pair){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><div class="spinner"></div><p class="bigmsg">جولة جديدة…</p></div>`); bindPlayer(); return; }
    if (P.view.dfRd !== s.rd){
      P.view.dfRd = s.rd; P.view.dfm = null; P.view.dfq = []; P.view.dfLr = null; P.view.dfPend = [];
      pSet(phead(`<span id="pClock"></span>`) + `<div class="panel stack dfpanel"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)}</h3><b id="dfCount" class="count"></b></div><div id="dfMe"></div><div id="pDf"><div class="center stack"><div class="spinner"></div><p class="muted">جارٍ تحميل الصورتين…</p></div></div><div class="row dfmeta">${infoBtn('data-act="dfinfo"')}</div></div><div id="pDfStatus"></div>`);
      rememberLocal(pair.id);
      bindPlayer();
      const rd = s.rd;
      preloadSpot(pair).then(() => {
        if (!P || P.view.dfRd !== rd) return;
        P.view.dfm = mountBoard($("#pDf"), pair, (x, y, tol) => {
          const h = findHost(), hs = h && h.presence.s, mine = hs && hs.pl && hs.pl[peerKey(myPeer())];
          if (!hs || hs.ph !== "play" || hs.rd !== rd || (mine && mine.out)) return;
          const id = Math.random().toString(36).slice(2, 9);
          P.view.dfq = [...P.view.dfq, [id, x, y, tol, srvNow()]].slice(-8);
          P.view.dfPend = [...P.view.dfPend, {id, x, y, t:Date.now()}];
          P.view.dfm.set({pend:P.view.dfPend});
          NR.presence({df:{rd, q:P.view.dfq, hq:P.view.dfHq || null}}).catch(() => {});
        });
        playerRender();
      }).catch(() => { if (P && P.view.dfRd === rd) spotFail($("#pDf"), 'data-act="dfretry"'); });
    }
    const mine = s.pl && s.pl[me], over = s.ph === "over";
    if (P.view.dfm){
      // a tap the host has answered stops waiting; one not answered in 6 s is dropped from the screen
      const done = new Set(Object.values(s.pl || {}).map(p => p.lr && p.lr[0]).filter(Boolean));
      if (mine && mine.lr && P.view.dfLr !== mine.lr[0]){ P.view.dfLr = mine.lr[0]; Diff.feedback(P.view.dfm, mine.lr, s); }
      P.view.dfPend = (P.view.dfPend || []).filter(p => !done.has(p.id) && !(mine && mine.lr && mine.lr[0] === p.id) && Date.now() - p.t < 6000 && !over);
      P.view.dfm.set({fd:s.fd || [], me, rev:over ? s.rev : null, hz:mine && !over ? mine.hz : null, pend:P.view.dfPend});
      P.view.dfm.lock(over || !!(mine && mine.out));
    }
    setEl($("#pClock"), clockChip(s));
    setEl($("#dfCount"), `${(s.fd || []).length} من ${s.nd}`);
    setEl($("#dfMe"), mine && !over ? Diff.meHTML(mine, false) : "");
    setEl($("#pDfStatus"), over ? `<div class="panel stack"><p class="bigmsg center" style="color:var(--gold)">${(s.rk || []).indexOf(me) >= 0 ? `ترتيبك ${(s.rk || []).indexOf(me) + 1}` : "انتهت الجولة"}</p>${Diff.resultsHTML(s, me)}</div>`
      : `<div class="panel stack"><h3>اللاعبون</h3>${Diff.liveHTML(s, me)}</div>`);
  },
  pclick(t){
    if (t.dataset.act === "dfretry"){ P.view.dfRd = null; playerRender(); }
    else if (t.dataset.act === "dfinfo"){ const h = findHost(); if (h && h.presence.s.pair) imageInfo(h.presence.s.pair, h.presence.s.ph !== "over"); }
    else if (t.dataset.act === "dfhint"){
      const h = findHost(), hs = h && h.presence.s; if (!hs || hs.ph !== "play") return;
      P.view.dfHq = "q" + Math.random().toString(36).slice(2, 9); t.disabled = true;
      NR.presence({df:{rd:hs.rd, q:P.view.dfq || [], hq:P.view.dfHq}}).catch(() => {});
    }
  },
};
