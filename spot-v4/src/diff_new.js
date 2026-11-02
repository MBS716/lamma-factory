/* ================= SPOT THE DIFFERENCE =================
   Pairs are prepared in advance (photo A + retouched copy B) and listed in SPOT_LIB
   with the exact box of every difference. Nothing is generated while playing, so every
   player sees the same two images and every difference is real and checked. */
const SPOT_DIR = "spot/";
const spotURL = f => SPOT_DIR + f;
const spotPairs = lv => SPOT_LIB.filter(p => lv === 3 || p.level === lv);
function pickSpot(lv, played){
  const pool = spotPairs(lv), fresh = pool.filter(p => !played.includes(p.id));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}
const spotById = id => SPOT_LIB.find(p => p.id === id);
const spotImgCache = {};
function loadSpotImg(f){
  if (!spotImgCache[f]) spotImgCache[f] = new Promise((res, rej) => {
    const im = new Image(); let tries = 0;
    const go = () => { im.src = spotURL(f) + (tries ? `?r=${tries}` : ""); };
    im.onload = () => res(im);
    im.onerror = () => { if (++tries < 3) setTimeout(go, 800 * tries); else { delete spotImgCache[f]; rej(new Error("load " + f)); } };
    go();
  });
  return spotImgCache[f];
}
const preloadSpot = p => Promise.all([loadSpotImg(p.a), loadSpotImg(p.b)]);

/* Two synced photo panes with pinch/scroll zoom and drag-to-pan.
   A tap counts only when the finger did not move and no second finger touched. */
function mountPair(el, pair, onChange){
  const found = new Set(); let wrong = 0, revealed = false, locked = false;
  const W = pair.w, Hh = pair.h, TOL = 8;
  el.innerHTML = `<div class="dfbar"><button class="btn ghost sm" data-z="in" aria-label="تكبير">＋</button><button class="btn ghost sm" data-z="out" aria-label="تصغير">－</button><button class="btn ghost sm" data-z="reset">حجم كامل</button><span class="muted dfhint">كبّر بإصبعين أو بعجلة الفأرة، واسحب للتحريك.</span></div>
    <div class="dfpair">${[pair.a, pair.b].map((f, i) => `<div class="dfimg" style="aspect-ratio:${W}/${Hh}"><div class="dfzoom"><img src="${spotURL(f)}" alt="${i ? "الصورة الثانية" : "الصورة الأولى"}" draggable="false"><div class="dfmarks"></div></div></div>`).join("")}</div>`;
  const panes = [...el.querySelectorAll(".dfimg")], zooms = [...el.querySelectorAll(".dfzoom")], marks = [...el.querySelectorAll(".dfmarks")];
  let sc = 1, tx = 0, ty = 0;
  const clamp = () => { const w = panes[0].clientWidth, h = panes[0].clientHeight; sc = Math.min(5, Math.max(1, sc)); tx = Math.min(0, Math.max(w - w * sc, tx)); ty = Math.min(0, Math.max(h - h * sc, ty)); };
  const apply = () => { clamp(); zooms.forEach(z => z.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`); el.classList.toggle("zoomed", sc > 1.01); };
  const zoomAt = (f, px, py) => { const ns = Math.min(5, Math.max(1, sc * f)), k = ns / sc; tx = px - (px - tx) * k; ty = py - (py - ty) * k; sc = ns; apply(); };
  const draw = () => {
    const html = pair.diffs.map((d, i) => found.has(i) || revealed ? `<span class="dfm ${found.has(i) ? "" : "rev"}" style="left:${(d.x - d.rx * 1.25) / W * 100}%;top:${(d.y - d.ry * 1.25) / Hh * 100}%;width:${d.rx * 2.5 / W * 100}%;height:${d.ry * 2.5 / Hh * 100}%"></span>` : "").join("");
    marks.forEach(m => m.innerHTML = html);
  };
  const tap = (pane, cx, cy) => {
    if (revealed || locked || found.size === pair.diffs.length) return;
    const r = pane.getBoundingClientRect(), lx = (cx - r.left - tx) / sc, ly = (cy - r.top - ty) / sc;
    const px = lx / r.width * W, py = ly / r.height * Hh;
    let hit = -1, best = 1e9;
    pair.diffs.forEach((d, i) => {
      if (found.has(i)) return;
      const dx = Math.abs(px - d.x), dy = Math.abs(py - d.y);
      if (dx <= d.rx + TOL && dy <= d.ry + TOL){ const s2 = dx / (d.rx + TOL) + dy / (d.ry + TOL); if (s2 < best){ best = s2; hit = i; } }
    });
    if (hit >= 0){ found.add(hit); draw(); }
    else if (!pair.diffs.some((d, i) => found.has(i) && Math.abs(px - d.x) <= d.rx + TOL && Math.abs(py - d.y) <= d.ry + TOL)){
      wrong++;
      const xm = document.createElement("span"); xm.className = "dfx"; xm.style.left = px / W * 100 + "%"; xm.style.top = py / Hh * 100 + "%"; xm.textContent = "✕";
      pane.querySelector(".dfmarks").appendChild(xm); setTimeout(() => xm.remove(), 700);
    }
    onChange && onChange({f:found.size, d:found.size === pair.diffs.length, w:wrong});
  };
  // pointer handling (shared state across both panes so zoom stays in sync)
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
        const ns = Math.min(5, Math.max(1, pinch0.sc * d / pinch0.d)), mx = (p1.x + p2.x) / 2 - r.left, my = (p1.y + p2.y) / 2 - r.top, k = ns / pinch0.sc;
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
  return {reveal(){ if (!revealed){ revealed = true; locked = true; draw(); } }, lock(){ locked = true; }};
}
function spotFail(holder, attr){
  if (holder) holder.innerHTML = `<div class="center stack"><p class="note">تعذّر تحميل صور هذه الجولة. تأكد من الإنترنت، ومن رفع مجلد spot مع الموقع.</p><div><button class="btn sm" ${attr}>إعادة المحاولة</button></div></div>`;
}
const Diff = {
  init: () => ({rd:0, pid:"", nd:0, lv:1, rev:false, fin:[], title:""}),
  async start(){
    const s = H.s, rd = s.rd + 1;
    H.priv.played = H.priv.played || [];
    const p = pickSpot(s.o.lv, H.priv.played);
    H.priv.played.push(p.id);
    s.rd = rd; s.ph = "prep"; s.fin = []; s.rest = []; s.rev = false; s.pid = p.id; s.nd = p.diffs.length; s.lv = p.level; s.title = p.title;
    pushHost();
    try { await preloadSpot(p); } catch(e){ console.warn(e); }
    if (!H || H.g !== "diff" || H.s.rd !== rd) return;
    s.ph = "play"; H.priv.prog = {}; startRaceClock(); pushHost();
  },
  act(a){
    const s = H.s;
    if (a === "start" || a === "go") Diff.start();
    else if (a === "rev" || a === "end") endRace();
    else if (a === "lobby"){ clearInterval(H.priv.tick); s.ph = "lobby"; pushHost(); }
    else if (a === "dfhretry"){ H.priv.dfRd = null; renderHost(); }
  },
  hostPeers(players){
    const s = H.s; if (s.ph !== "play") return;
    let ch = false;
    for (const p of players){
      const z = p.presence.df; if (!z || z.rd !== s.rd) continue;
      H.priv.prog[p.peer] = {n:pname(p), v:Math.max(0, Math.min(s.nd, +z.f || 0))};
      if (z.d && !s.fin.some(f => f[3] === peerKey(p.peer)) && s.fin.length < 30){ s.fin.push([pname(p), Math.max(0, +z.w || 0), Math.round((Date.now() - H.priv.t0) / 1000), peerKey(p.peer)]); ch = true; }
    }
    if (ch){ pushHost(); maybeAllDone(players); }
  },
  host(players){
    const s = H.s, m = $("#hostMain");
    if (s.ph === "lobby"){
      H.priv.dfRd = null;
      const cnt = [0, 1, 2].map(l => spotPairs(l).length);
      setMain(lobbyHTML(players, `<p class="muted">المكتبة الحالية: ${cnt[0]} أزواج سهلة، و${cnt[1]} متوسطة، و${cnt[2]} صعبة. لا تتكرر الصورة نفسها حتى تنتهي صور المستوى.</p>
        <p class="muted">${["سهل: فروق متوسطة الحجم في مشاهد واضحة.","متوسط: فروق صغيرة وطبيعية لا تلفت النظر.","صعب: تفاصيل دقيقة مخفية داخل مشاهد مزدحمة.","الكل: زوج عشوائي من أي مستوى."][s.o.lv]}</p>`, "ابدأ الجولة"));
      return;
    }
    const pair = spotById(s.pid);
    if (s.ph === "prep" || !pair){ H.priv.dfRd = null; setMain(`<div class="panel center stack" style="margin-top:18px"><div class="spinner"></div><p class="bigmsg">جارٍ تجهيز الصورتين…</p></div>`); return; }
    if (H.priv.dfRd !== s.rd){
      H.priv.dfRd = s.rd; H.priv.dfm = null;
      m.innerHTML = `<div class="layout wide"><div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)} · ${s.nd} فروق · ${LV_NAMES[s.lv]}</h3><b id="dfHostCount" class="count"></b></div><div class="df-holder"></div></div><div class="stack" id="dfSide"></div></div>`;
      m.dataset.k = "";
      const rd = s.rd, holder = m.querySelector(".df-holder");
      preloadSpot(pair).then(() => {
        if (!H || H.s.rd !== rd) return;
        H.priv.dfm = mountPair(holder, pair, st => { const c = $("#dfHostCount"); if (c) c.textContent = `${st.f} / ${s.nd}`; if (st.d && !hostPlayers().length) endRace(); });
        if (H.s.rev) H.priv.dfm.reveal();
      }).catch(() => spotFail(holder, 'data-h="dfhretry"'));
    }
    if (s.rev && H.priv.dfm) H.priv.dfm.reveal();
    const prog = Object.values(H.priv.prog || {}).sort((a, b) => b.v - a.v), over = s.ph === "over";
    setEl($("#dfSide"), `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${over ? "الترتيب النهائي" : "السباق"}</h3>${clockChip(s)}</div>${over ? standingsHTML(s, "خطأ", s.nd) : H.code && players.length ? raceHTML(prog, s.nd, true) : `<p class="muted">العب من هذه الشاشة، أو اعرض الكود ليشارك الآخرون من جوالاتهم.</p>`}</div>
      ${over ? "" : `<div class="panel stack"><h3>المنتهون</h3>${finHTML(s.fin.map(f => [f[0], f[1], fmtT(f[2])]), "خطأ")}</div>`}
      <div class="row">${over ? "" : `<button class="btn ghost sm" data-h="end">إنهاء وكشف الفروق</button>`}<button class="btn" data-h="go">صورة جديدة</button><button class="btn ghost sm" data-h="lobby">الإعدادات</button></div>${soloNote()}`);
  },
  player(s){
    const pair = spotById(s.pid);
    if (s.ph === "prep" || !pair){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><div class="spinner"></div><p class="bigmsg">جولة جديدة…</p></div>`); bindPlayer(); return; }
    if (P.view.dfRd !== s.rd){
      P.view.dfRd = s.rd; P.view.dfm = null;
      pSet(phead(`<span id="pClock"></span>`) + `<div class="panel stack dfpanel"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)} · ${s.nd} فروق</h3><b id="dfCount" class="count">0 / ${s.nd}</b></div><p class="muted">اضغط على مكان الفرق في أي من الصورتين.</p><div id="pDf"><div class="center stack"><div class="spinner"></div><p class="muted">جارٍ تحميل الصورتين…</p></div></div></div><div id="pDfStatus"></div>`);
      bindPlayer();
      if (s.ph === "play") NR.presence({df:{rd:s.rd, f:0, d:false, w:0}}).catch(() => {});
      const rd = s.rd;
      preloadSpot(pair).then(() => {
        if (!P || P.view.dfRd !== rd) return;
        P.view.dfm = mountPair($("#pDf"), pair, st => { const c = $("#dfCount"); if (c) c.textContent = `${st.f} / ${s.nd}`; NR.presence({df:{rd, ...st}}).catch(() => {}); });
        const h = findHost(); if (h && h.presence.s.rev) P.view.dfm.reveal();
      }).catch(() => { if (P && P.view.dfRd === rd) spotFail($("#pDf"), 'data-act="dfretry"'); });
    }
    if (s.rev && P.view.dfm) P.view.dfm.reveal();
    setEl($("#pClock"), clockChip(s));
    const me = peerKey(myPeer()), rank = s.fin.findIndex(f => f[3] === me);
    setEl($("#pDfStatus"), s.ph === "over" ? `<div class="panel stack"><p class="bigmsg center" style="color:var(--gold)">${rank >= 0 ? `ترتيبك ${rank + 1}` : "انتهت الجولة"}</p><p class="muted center">الدوائر البرتقالية هي الفروق التي لم تُكتشف.</p>${standingsHTML(s, "خطأ", s.nd)}</div>`
      : rank >= 0 ? `<div class="panel center"><p class="bigmsg" style="color:var(--gold)">وجدتها كلها! ترتيبك ${rank + 1}</p><p class="muted">${fmtT(s.fin[rank][2])} · ${s.fin[rank][1]} خطأ</p></div>` : s.fin.length ? `<p class="center muted">أنهى ${s.fin.length} لاعب حتى الآن</p>` : "");
  },
  pclick(t){ if (t.dataset.act === "dfretry"){ P.view.dfRd = null; playerRender(); } },
};
