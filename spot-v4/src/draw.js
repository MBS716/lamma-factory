/* ================= DRAWN SCENES (fallback when photos are unavailable) ================= */
const sceneCache = {};
function sceneURL(i){
  if (sceneCache[i]) return sceneCache[i];
  const c = document.createElement("canvas"); c.width = c.height = 600;
  const x = c.getContext("2d"), R = rng(4242 + i * 101);
  const emoji = (e, size, cx, cy) => { x.font = `${size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(e, cx, cy); };
  const grad = (stops) => { const g = x.createLinearGradient(0, 0, 0, 600); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
  const hill = (col, y0, ys) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(150, ys[0], 350, ys[1], 600, ys[2]); x.lineTo(600, 600); x.lineTo(0, 600); x.closePath(); x.fill(); };
  if (i === 0){
    x.fillStyle = grad([[0,"#ff8a4c"],[.55,"#ffd08a"],[1,"#ffe6b8"]]); x.fillRect(0, 0, 600, 600);
    x.fillStyle = "#fff4cf"; x.beginPath(); x.arc(450, 140, 70, 0, 7); x.fill();
    hill("#eaa95b", 380, [300, 430, 340]); hill("#d68a3e", 470, [420, 520, 430]); hill("#b8702d", 560, [520, 560, 500]);
    emoji("🌴", 150, 120, 330); emoji("🐪", 150, 380, 430);
  } else if (i === 1){
    x.fillStyle = grad([[0,"#7cc8ff"],[.5,"#d9f2ff"],[.52,"#1f8ccc"],[1,"#0c4f8a"]]); x.fillRect(0, 0, 600, 600);
    x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 4;
    for (let y = 340; y < 600; y += 40){ x.beginPath(); for (let k = 0; k <= 600; k += 20) x.lineTo(k, y + Math.sin(k / 30 + y) * 6); x.stroke(); }
    emoji("☀️", 110, 480, 100); emoji("⛵", 160, 320, 300); emoji("🐬", 120, 150, 470);
  } else if (i === 2){
    x.fillStyle = grad([[0,"#0b1035"],[1,"#3b2a6e"]]); x.fillRect(0, 0, 600, 600);
    x.fillStyle = "#fff"; for (let k = 0; k < 70; k++){ x.globalAlpha = .4 + R() * .6; x.fillRect(R() * 600, R() * 300, 2, 2); } x.globalAlpha = 1;
    emoji("🌙", 120, 470, 110);
    let bx = 0; while (bx < 600){ const w = 50 + R() * 50, h = 150 + R() * 260; x.fillStyle = ["#1d2150","#262b63","#171a40"][Math.floor(R() * 3)]; x.fillRect(bx, 600 - h, w - 4, h);
      x.fillStyle = "#ffd36b"; for (let wy = 600 - h + 14; wy < 590; wy += 22) for (let wx = bx + 8; wx < bx + w - 14; wx += 14) if (R() > .45) x.fillRect(wx, wy, 7, 10);
      bx += w; }
  } else {
    for (let k = 0; k < 10; k++){ x.fillStyle = k % 2 ? "#3a9a4a" : "#46ad56"; x.fillRect(k * 60, 0, 60, 600); }
    x.strokeStyle = "#fff"; x.lineWidth = 6; x.strokeRect(30, 30, 540, 540);
    x.beginPath(); x.moveTo(300, 30); x.lineTo(300, 570); x.stroke();
    x.beginPath(); x.arc(300, 300, 80, 0, 7); x.stroke();
    x.strokeRect(30, 190, 80, 220); x.strokeRect(490, 190, 80, 220);
    emoji("⚽", 130, 300, 300); emoji("🏆", 90, 470, 110); emoji("🥅", 90, 110, 480);
  }
  return sceneCache[i] = c.toDataURL("image/jpeg", .86);
}

/* ================= SPOT THE DIFFERENCE: scene engine ================= */
const DF_THEMES = ["شارع المدينة","الحديقة","الشاطئ","غرفة الجلوس"];
const DF_LEVELS = ["سهل","متوسط","صعب"];
const hsl = (c, dl = 0) => `hsl(${c[0]},${c[1]}%,${Math.max(0, Math.min(100, c[2] + dl))}%)`;
const PAL = [[355,78,56],[22,88,56],[45,92,56],[140,50,42],[195,70,45],[225,62,56],[275,48,55],[325,68,62],[90,48,44],[12,55,38],[175,50,40],[0,0,94]];
const pc = R => PAL[Math.floor(R() * PAL.length)].slice();
const DARK = [220,25,22], LIT = [48,95,66], SKIN = [28,55,70], WOOD = [28,45,36], LEAF = [120,45,36];
function shiftCol(c, lv, R){
  const d = lv === 2 ? 32 + R() * 18 : lv === 1 ? 60 + R() * 35 : 115 + R() * 65;
  return [Math.round((c[0] + (R() < .5 ? d : -d) + 360) % 360), Math.max(c[1], 55), c[2] > 85 ? 62 : c[2]];
}
function rr(x, X, Y, w, h, r){ x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
const circ = (x, X, Y, r, col) => { x.fillStyle = col; x.beginPath(); x.arc(X, Y, r, 0, Math.PI * 2); x.fill(); };
const line = (x, a, b, c, d, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.lineCap = "round"; x.beginPath(); x.moveTo(a, b); x.lineTo(c, d); x.stroke(); };
const poly = (x, pts, col) => { x.fillStyle = col; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath(); x.fill(); };

/* item types: draw(ctx,it) in local coords; box(it) -> [cx,cy,r] in scene coords;
   muts: subtle mutations for every level; easy: extra obvious ones for levels 0-1; cnt: [min,max] for "count"; det: custom mutations */
const T = {};
T.cloud = {
  draw(x, it){ const B = [[0,0,1],[-.85,.2,.72],[.85,.2,.74],[-.35,-.38,.66],[.42,-.34,.62],[1.45,.32,.5]];
    for (let i = 0; i < it.n; i++){ const [a, b, r] = B[i]; circ(x, a * it.s, b * it.s, r * it.s, hsl(it.c)); } },
  box: it => [it.x, it.y, it.s * 1.7], muts:["count","move"], easy:["remove","size"], cnt:[3,6],
};
T.bird = {
  draw(x, it){ const s = it.s; x.strokeStyle = hsl(DARK); x.lineWidth = 2.6; x.lineCap = "round"; x.beginPath();
    x.moveTo(-s, -s * .3); x.quadraticCurveTo(-s * .5, -s * .85, 0, 0); x.quadraticCurveTo(s * .5, -s * .85, s, -s * .3); x.stroke(); },
  box: it => [it.x, it.y - it.s * .3, it.s * 1.2], muts:["move","remove"], add:true,
};
T.sun = {
  draw(x, it){ for (let i = 0; i < it.n; i++){ const a = i / it.n * Math.PI * 2; line(x, Math.cos(a) * it.s * 1.25, Math.sin(a) * it.s * 1.25, Math.cos(a) * it.s * 1.6, Math.sin(a) * it.s * 1.6, 4, hsl(it.c)); }
    circ(x, 0, 0, it.s, hsl(it.c)); },
  box: it => [it.x, it.y, it.s * 1.7], muts:["count"], easy:["color","size"], cnt:[7,14],
};
function winRect(it, i){ const mx = 12, gw = (it.w - 2 * mx - (it.cols - 1) * 8) / it.cols, col = i % it.cols, row = Math.floor(i / it.cols); return [mx + col * (gw + 8), -it.h + 18 + row * 30, gw, 16]; }
T.building = {
  draw(x, it){
    x.fillStyle = hsl(it.c); x.fillRect(0, -it.h, it.w, it.h);
    x.fillStyle = hsl(it.c, -14); x.fillRect(-4, -it.h - 8, it.w + 8, 8);
    if (it.ant){ line(x, it.w * .7, -it.h - 8, it.w * .7, -it.h - 38, 3, hsl(DARK)); circ(x, it.w * .7, -it.h - 40, 4, "hsl(0,80%,55%)"); }
    for (let i = 0; i < it.wl.length; i++){ const [X, Y, w, h] = winRect(it, i); x.fillStyle = it.wl[i] ? hsl(LIT) : hsl(DARK, 10); x.fillRect(X, Y, w, h); x.fillStyle = hsl(it.c, -20); x.fillRect(X, Y + h - 2, w, 2); }
    x.fillStyle = hsl(it.c2); x.fillRect(it.w / 2 - 14, -38, 28, 38); circ(x, it.w / 2 + 8, -19, 2.2, hsl(LIT));
  },
  box: it => [it.x + it.w / 2, it.y - it.h / 2, Math.min(it.w, it.h) / 2], muts:["win","win","door","ant"], easy:["color"],
  det: {
    win(it, R){ const i = Math.floor(R() * it.wl.length); it.wl[i] = !it.wl[i]; const [X, Y, w, h] = winRect(it, i); return [it.x + X + w / 2, it.y + Y + h / 2, Math.max(w, h) / 2 + 4]; },
    door(it, R, lv){ it.c2 = shiftCol(it.c2, lv, R); return [it.x + it.w / 2, it.y - 19, 24]; },
    ant(it){ it.ant = !it.ant; return [it.x + it.w * .7, it.y - it.h - 24, 22]; },
  },
};
T.tree = {
  draw(x, it){ const s = it.s; x.fillStyle = hsl(WOOD); x.fillRect(-s * .15, -s * 1.4, s * .3, s * 1.4);
    circ(x, 0, -s * 1.9, s, hsl(it.c)); circ(x, -s * .35, -s * 2.15, s * .55, hsl(it.c, 6));
    for (let i = 0; i < it.n; i++){ const [a, b] = it.fp[i]; circ(x, a * s, -s * 1.9 + b * s, s * .13, hsl(it.c2)); } },
  box: it => [it.x, it.y - it.s * 1.9, it.s * 1.05], muts:["count","color2","color"], easy:["size","remove"], cnt:[0,8],
};
T.car = {
  draw(x, it){ const W = it.s; rr(x, -W / 2, -W * .38, W, W * .24, 8); x.fillStyle = hsl(it.c); x.fill();
    rr(x, -W * .3, -W * .56, W * .52, W * .2, 8); x.fill();
    x.fillStyle = "hsl(200,70%,82%)"; x.fillRect(-W * .25, -W * .52, W * .19, W * .13); x.fillRect(-W * .02, -W * .52, W * .19, W * .13);
    for (const d of [-.3, .3]){ circ(x, d * W, -W * .13, W * .12, hsl(DARK)); circ(x, d * W, -W * .13, W * .05, hsl(it.c2)); }
    if (it.hl) circ(x, W * .47, -W * .3, W * .04, hsl(LIT)); x.fillStyle = "hsl(0,75%,50%)"; x.fillRect(-W * .5, -W * .33, W * .04, W * .06); },
  box: it => [it.x, it.y - it.s * .3, it.s * .55], muts:["color2","hl","flip"], easy:["color","move"],
  det: { hl(it){ it.hl = !it.hl; return [it.x + (it.f ? -1 : 1) * it.s * .47, it.y - it.s * .3, 16]; } },
};
T.lamp = {
  draw(x, it){ line(x, 0, 0, 0, -it.s, 5, hsl(DARK)); line(x, 0, -it.s, 16, -it.s, 4, hsl(DARK));
    if (it.lit){ x.globalAlpha = .35; circ(x, 16, -it.s + 8, 18, hsl(LIT)); x.globalAlpha = 1; }
    x.fillStyle = it.lit ? hsl(LIT) : hsl(DARK, 30); x.fillRect(10, -it.s, 12, 9); },
  box: it => [it.x + 8, it.y - it.s / 2, it.s / 2], muts:["lit"], easy:["size","remove"],
  det: { lit(it){ it.lit = !it.lit; return [it.x + 16, it.y - it.s + 4, 22]; } },
};
T.tlight = {
  draw(x, it){ line(x, 0, 0, 0, -it.s, 5, hsl(DARK)); rr(x, -11, -it.s - 60, 22, 60, 5); x.fillStyle = hsl(DARK); x.fill();
    ["0,85%,55%","45,95%,55%","135,70%,45%"].forEach((c, i) => { x.globalAlpha = i === it.n ? 1 : .22; circ(x, 0, -it.s - 50 + i * 19, 7, `hsl(${c})`); }); x.globalAlpha = 1; },
  box: it => [it.x, it.y - it.s - 30, 30], muts:["tl"],
  det: { tl(it, R){ it.n = (it.n + 1 + Math.floor(R() * 2)) % 3; return [it.x, it.y - it.s - 30, 28]; } },
};
T.person = {
  draw(x, it){ const s = it.s; x.fillStyle = hsl(it.c2); x.fillRect(-s * .14, -s * .45, s * .12, s * .45); x.fillRect(s * .02, -s * .45, s * .12, s * .45);
    rr(x, -s * .2, -s * .82, s * .4, s * .42, 6); x.fillStyle = hsl(it.c); x.fill();
    line(x, -s * .2, -s * .74, -s * .3, -s * .45, s * .09, hsl(it.c));
    if (it.arm) line(x, s * .2, -s * .74, s * .34, -s * 1.02, s * .09, hsl(it.c)); else line(x, s * .2, -s * .74, s * .3, -s * .45, s * .09, hsl(it.c));
    circ(x, 0, -s * .95, s * .15, hsl(SKIN)); x.fillStyle = hsl(it.c3); x.fillRect(-s * .16, -s * 1.12, s * .32, s * .07); },
  box: it => [it.x, it.y - it.s * .55, it.s * .55], muts:["color","color2","arm","color3"], easy:["move","flip","remove"],
  det: { arm(it){ it.arm = !it.arm; return [it.x + (it.f ? -1 : 1) * it.s * .28, it.y - it.s * .75, it.s * .3]; },
         color3(it, R, lv){ it.c3 = shiftCol(it.c3, lv, R); return [it.x, it.y - it.s * 1.08, 18]; } },
};
T.sign = {
  draw(x, it){ line(x, 0, 0, 0, -it.s, 4, hsl(DARK)); rr(x, -26, -it.s - 30, 52, 30, 4); x.fillStyle = hsl(it.c); x.fill();
    for (let i = 0; i < it.n; i++) line(x, -18, -it.s - 24 + i * 6.5, 18, -it.s - 24 + i * 6.5, 2.4, "hsl(0,0%,97%)"); },
  box: it => [it.x, it.y - it.s - 15, 30], muts:["count","color"], cnt:[1,4],
};
T.flower = {
  draw(x, it){ const s = it.s; line(x, 0, 0, 0, -s, 3, hsl(LEAF));
    for (let i = 0; i < it.n; i++){ const a = i / it.n * Math.PI * 2; circ(x, Math.cos(a) * s * .36, -s + Math.sin(a) * s * .36, s * .26, hsl(it.c)); }
    circ(x, 0, -s, s * .22, hsl(it.c2)); },
  box: it => [it.x, it.y - it.s, it.s * .7], muts:["count","color","color2"], easy:["remove","size"], cnt:[4,9], add:true,
};
T.butterfly = {
  draw(x, it){ const s = it.s; x.fillStyle = hsl(it.c);
    for (const sx of [-1, 1]){ x.beginPath(); x.ellipse(sx * s * .55, -s * .3, s * .55, s * .45, 0, 0, 7); x.fill(); x.beginPath(); x.ellipse(sx * s * .45, s * .35, s * .38, s * .32, 0, 0, 7); x.fill(); }
    for (const sx of [-1, 1]) circ(x, sx * s * .55, -s * .3, s * .17, hsl(it.c2));
    line(x, 0, -s * .6, 0, s * .6, 3, hsl(DARK)); x.fillStyle = hsl(it.c); },
  box: it => [it.x, it.y, it.s * 1.3], muts:["color","color2","move"], easy:["remove","size"], add:true,
};
T.fence = {
  draw(x, it){ const c = hsl(it.c); x.fillStyle = c; x.fillRect(0, -34, it.n * 22 - 8, 5); x.fillRect(0, -16, it.n * 22 - 8, 5);
    for (let i = 0; i < it.n; i++) poly(x, [[i * 22, 0], [i * 22, -42], [i * 22 + 7, -50], [i * 22 + 14, -42], [i * 22 + 14, 0]], c); },
  box: it => [it.x + it.n * 11, it.y - 25, it.n * 11], muts:["post"], easy:["color"],
  det: { post(it, R){ const d = it.n >= 11 ? -1 : 1; const n0 = it.n; it.n += d; return [it.x + Math.max(n0, it.n) * 22 - 15, it.y - 25, 24]; } },
};
T.bench = {
  draw(x, it){ const c = hsl(it.c); x.fillStyle = c; x.fillRect(-40, -22, 80, 6); x.fillRect(-40, -42, 80, 5); x.fillRect(-40, -34, 80, 5);
    x.fillStyle = hsl(DARK); x.fillRect(-34, -16, 4, 16); x.fillRect(30, -16, 4, 16); },
  box: it => [it.x, it.y - 22, 42], muts:["color"], easy:["remove"],
};
T.kite = {
  draw(x, it){ const s = it.s; poly(x, [[0, -s], [-s * .7, 0], [0, s * 1.2]], hsl(it.c)); poly(x, [[0, -s], [s * .7, 0], [0, s * 1.2]], hsl(it.c2));
    x.strokeStyle = hsl(DARK); x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, s * 1.2); x.bezierCurveTo(-s * .4, s * 1.8, s * .5, s * 2.3, 0, s * 3); x.stroke();
    for (let i = 0; i < it.n; i++){ const t = (i + 1) / (it.n + 1), yy = s * 1.2 + t * s * 1.8; poly(x, [[-6, yy - 4], [6, yy + 4], [6, yy - 4], [-6, yy + 4]], hsl(it.c)); } },
  box: it => [it.x, it.y + it.s * .6, it.s * 1.5], muts:["color","color2","count","rot"], cnt:[2,5],
};
T.duck = {
  draw(x, it){ const s = it.s; x.fillStyle = hsl(it.c); x.beginPath(); x.ellipse(0, 0, s, s * .6, 0, 0, 7); x.fill();
    circ(x, s * .75, -s * .55, s * .42, hsl(it.c)); poly(x, [[s * 1.1, -s * .6], [s * 1.5, -s * .5], [s * 1.1, -s * .4]], "hsl(28,95%,55%)"); circ(x, s * .85, -s * .65, s * .07, hsl(DARK)); },
  box: it => [it.x, it.y - it.s * .2, it.s * 1.3], muts:["flip","color"], easy:["remove","move"],
};
T.boat = {
  draw(x, it){ const s = it.s; poly(x, [[-s * .8, -s * .3], [s * .8, -s * .3], [s * .55, 0], [-s * .55, 0]], hsl(it.c));
    line(x, 0, -s * .3, 0, -s * 1.5, 3, hsl(WOOD)); poly(x, [[4, -s * 1.45], [4, -s * .4], [s * .65, -s * .4]], hsl(it.c2));
    if (it.fl) poly(x, [[0, -s * 1.5], [-s * .3, -s * 1.42], [0, -s * 1.34]], "hsl(0,80%,52%)"); },
  box: it => [it.x, it.y - it.s * .7, it.s * .85], muts:["color2","fl","flip"], easy:["color","move"],
  det: { fl(it){ it.fl = !it.fl; return [it.x - (it.f ? -1 : 1) * it.s * .12, it.y - it.s * 1.42, 18]; } },
};
T.umbrella = {
  draw(x, it){ const s = it.s; line(x, 0, 0, 0, -s, 3, hsl(DARK));
    for (let i = 0; i < it.n; i++){ x.fillStyle = hsl(i % 2 ? it.c2 : it.c); x.beginPath(); x.moveTo(0, -s); x.arc(0, -s, s * .7, Math.PI + i / it.n * Math.PI, Math.PI + (i + 1) / it.n * Math.PI); x.closePath(); x.fill(); } },
  box: it => [it.x, it.y - it.s * 1.15, it.s * .72], muts:["count","color","color2"], cnt:[4,8],
};
T.ball = {
  draw(x, it){ const s = it.s, cs = [hsl(it.c), "hsl(0,0%,97%)", hsl(it.c2), "hsl(0,0%,97%)", hsl(it.c), "hsl(0,0%,97%)"];
    cs.forEach((c, i) => { x.fillStyle = c; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, s, i * Math.PI / 3, (i + 1) * Math.PI / 3); x.closePath(); x.fill(); }); },
  box: it => [it.x, it.y, it.s + 4], muts:["color","color2","rot"], easy:["remove","size"],
};
T.star = {
  draw(x, it){ const s = it.s; x.fillStyle = hsl(it.c); x.beginPath();
    for (let i = 0; i < 10; i++){ const a = i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? s * .42 : s; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill(); },
  box: it => [it.x, it.y, it.s + 4], muts:["color","rot"], easy:["remove","size"], add:true,
};
T.palm = {
  draw(x, it){ const s = it.s; x.strokeStyle = hsl(WOOD); x.lineWidth = 9; x.lineCap = "round"; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(s * .25, -s * .5, s * .2, -s); x.stroke();
    for (let i = 0; i < it.n; i++){ const a = -Math.PI + (i + .5) / it.n * Math.PI; x.strokeStyle = hsl(LEAF, 4); x.lineWidth = 7; x.beginPath(); x.moveTo(s * .2, -s); x.quadraticCurveTo(s * .2 + Math.cos(a) * s * .35, -s + Math.sin(a) * s * .45, s * .2 + Math.cos(a) * s * .55, -s + Math.sin(a) * s * .2 + s * .12); x.stroke(); } },
  box: it => [it.x + it.s * .2, it.y - it.s, it.s * .55], muts:["count"], easy:["size"], cnt:[4,8],
};
T.lighthouse = {
  draw(x, it){ const s = it.s; poly(x, [[-22, 0], [22, 0], [14, -s], [-14, -s]], "hsl(0,0%,96%)");
    for (let i = 0; i < it.n; i++){ const y0 = -s * (i * 2 + 1) / (it.n * 2 + 1), y1 = -s * (i * 2 + 2) / (it.n * 2 + 1), w0 = 22 - 8 * (-y0 / s), w1 = 22 - 8 * (-y1 / s); poly(x, [[-w0, y0], [w0, y0], [w1, y1], [-w1, y1]], hsl(it.c)); }
    x.fillStyle = hsl(LIT); x.fillRect(-11, -s - 18, 22, 18); poly(x, [[-15, -s - 18], [15, -s - 18], [0, -s - 32]], hsl(it.c)); },
  box: it => [it.x, it.y - it.s * .55, it.s * .55], muts:["count","color"], cnt:[2,5],
};
T.frame = {
  draw(x, it){ const w = it.s * 1.3, h = it.s; x.fillStyle = hsl(it.c); x.fillRect(-w / 2, -h / 2, w, h);
    x.fillStyle = "hsl(200,60%,85%)"; x.fillRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14);
    poly(x, [[-w / 2 + 7, h / 2 - 7], [-w * .1, -h * .15], [w * .15, h * .1], [w * .3, -h * .05], [w / 2 - 7, h / 2 - 7]], hsl(it.c2));
    if (it.sn) circ(x, w * .25, -h * .22, h * .1, hsl(LIT)); },
  box: it => [it.x, it.y, it.s * .8], muts:["color2","sn","rot"], easy:["color"],
  det: { sn(it){ it.sn = !it.sn; return [it.x + it.s * .32, it.y - it.s * .22, 20]; } },
};
T.books = {
  draw(x, it){ let X = 0; for (let i = 0; i < it.n; i++){ x.fillStyle = hsl(it.bc[i]); x.fillRect(X, -it.bh[i], it.bw[i], it.bh[i]); x.fillStyle = hsl(it.bc[i], 18); x.fillRect(X + 2, -it.bh[i] + 8, it.bw[i] - 4, 3); X += it.bw[i] + 1; } },
  box(it){ let w = 0; for (let i = 0; i < it.n; i++) w += it.bw[i] + 1; return [it.x + w / 2, it.y - 22, Math.max(w / 2, 20)]; },
  muts:["book","book","bcount"],
  det: {
    book(it, R, lv){ const i = Math.floor(R() * it.n); it.bc[i] = shiftCol(it.bc[i], lv, R); let X = 0; for (let k = 0; k < i; k++) X += it.bw[k] + 1; return [it.x + X + it.bw[i] / 2, it.y - it.bh[i] / 2, Math.max(it.bh[i] / 2, 16)]; },
    bcount(it){ const n0 = it.n; it.n += it.n >= it.bw.length ? -1 : (it.n <= 3 ? 1 : -1); const i = Math.max(n0, it.n) - 1; let X = 0; for (let k = 0; k < i; k++) X += it.bw[k] + 1; return [it.x + X + it.bw[i] / 2, it.y - it.bh[i] / 2, Math.max(it.bh[i] / 2, 18)]; },
  },
};
T.clock = {
  draw(x, it){ const s = it.s; circ(x, 0, 0, s, hsl(it.c)); circ(x, 0, 0, s * .84, "hsl(0,0%,97%)");
    for (let i = 0; i < 12; i++){ const a = i * Math.PI / 6; line(x, Math.cos(a) * s * .7, Math.sin(a) * s * .7, Math.cos(a) * s * .78, Math.sin(a) * s * .78, 2, hsl(DARK)); }
    line(x, 0, 0, Math.cos(it.a) * s * .42, Math.sin(it.a) * s * .42, 4, hsl(DARK)); line(x, 0, 0, Math.cos(it.b) * s * .66, Math.sin(it.b) * s * .66, 2.5, hsl(DARK)); },
  box: it => [it.x, it.y, it.s + 4], muts:["hand"], easy:["color"],
  det: { hand(it, R, lv){ const d = (lv === 2 ? 1 : 2) * Math.PI / 6 * (R() < .5 ? 1 : -1); if (R() < .5) it.a += d; else it.b += d; return [it.x, it.y, it.s]; } },
};
T.tlamp = {
  draw(x, it){ const s = it.s; x.fillStyle = hsl(DARK); x.fillRect(-14, -6, 28, 6); line(x, 0, -6, 0, -s * .6, 4, hsl(DARK));
    if (it.lit){ x.globalAlpha = .3; circ(x, 0, -s * .55, s * .55, hsl(LIT)); x.globalAlpha = 1; }
    poly(x, [[-s * .22, -s * .6], [s * .22, -s * .6], [s * .14, -s], [-s * .14, -s]], hsl(it.c)); },
  box: it => [it.x, it.y - it.s * .6, it.s * .5], muts:["color","lit"],
  det: { lit(it){ it.lit = !it.lit; return [it.x, it.y - it.s * .55, it.s * .5]; } },
};
T.cushion = {
  draw(x, it){ const s = it.s; rr(x, -s * .6, -s * .45, s * 1.2, s * .9, 10); x.fillStyle = hsl(it.c); x.fill();
    for (let i = 0; i < it.n; i++){ const a = (i % 3) - 1, b = Math.floor(i / 3) - .5; circ(x, a * s * .32, b * s * .4, s * .07, hsl(it.c2)); } },
  box: it => [it.x, it.y, it.s * .65], muts:["count","color","color2"], cnt:[0,6],
};
T.plant = {
  draw(x, it){ const s = it.s;
    for (let i = 0; i < it.n; i++){ const a = -Math.PI / 2 + (i - (it.n - 1) / 2) * .42; x.save(); x.translate(0, -s * .45); x.rotate(a + Math.PI / 2); x.fillStyle = hsl(LEAF, i % 2 ? 6 : 0); x.beginPath(); x.ellipse(0, -s * .38, s * .12, s * .38, 0, 0, 7); x.fill(); x.restore(); }
    poly(x, [[-s * .25, -s * .45], [s * .25, -s * .45], [s * .18, 0], [-s * .18, 0]], hsl(it.c)); },
  box: it => [it.x, it.y - it.s * .6, it.s * .6], muts:["count","color"], cnt:[3,8],
};
T.cup = {
  draw(x, it){ x.strokeStyle = hsl(it.c); x.lineWidth = 3.5; x.beginPath(); x.arc(12, -12, 6, -Math.PI / 2, Math.PI / 2); x.stroke();
    poly(x, [[-11, -22], [11, -22], [8, 0], [-8, 0]], hsl(it.c)); },
  box: it => [it.x, it.y - 11, 18], muts:["color","flip"], easy:["remove"], add:true,
};

/* ---- scene builders ---- */
function buildScene(theme, R){
  const items = [], dec = {}, add = (t, o) => { const it = {t, x:0, y:0, s:20, f:false, r:0, ...o}; items.push(it); return it; };
  const rb = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(rb(a, b + 1));
  const fruitPts = () => Array.from({length:8}, (_, i) => { const a = i / 8 * Math.PI * 2 + R() * .5, d = .35 + R() * .45; return [Math.cos(a) * d, Math.sin(a) * d]; });
  if (theme === 0){ // city street
    add("sun", {x:rb(60, 160), y:70, s:30, c:[45,95,58], n:ri(9, 12)});
    for (let i = 0; i < 3; i++) add("cloud", {x:rb(180, 560), y:rb(45, 120), s:rb(18, 26), c:[0,0,98], n:ri(4, 6)});
    for (let i = 0; i < 4; i++) add("bird", {x:rb(150, 560), y:rb(40, 150), s:rb(8, 13)});
    let X = -6; while (X < 600){ const w = rb(112, 160), h = rb(190, 300), cols = Math.max(2, Math.floor((w - 24) / 30)), rows = Math.max(3, Math.floor((h - 70) / 30));
      add("building", {x:X, y:470, w, h, c:[ri(0, 360), ri(15, 40), ri(50, 72)], c2:pc(R), cols, rows, wl:Array.from({length:cols * rows}, () => R() < .5), ant:R() < .5}); X += w + rb(2, 10); }
    for (let i = 0; i < 2; i++) add("tree", {x:rb(40, 560), y:500, s:rb(24, 30), c:[ri(95, 140), 45, ri(32, 42)], c2:[ri(0, 30), 85, 55], n:ri(3, 6), fp:fruitPts()});
    add("lamp", {x:rb(30, 180), y:500, s:rb(95, 115), lit:R() < .5}); add("lamp", {x:rb(420, 570), y:500, s:rb(95, 115), lit:R() < .5});
    add("tlight", {x:rb(250, 350), y:500, s:70, n:ri(0, 2)});
    add("sign", {x:rb(190, 240), y:500, s:60, c:pc(R), n:ri(1, 3)});
    for (let i = 0; i < 3; i++) add("person", {x:rb(60, 560), y:505, s:rb(54, 64), c:pc(R), c2:pc(R), c3:pc(R), arm:R() < .3, f:R() < .5});
    add("car", {x:rb(90, 250), y:592, s:rb(95, 115), c:pc(R), c2:pc(R), hl:R() < .5, f:false});
    add("car", {x:rb(360, 520), y:592, s:rb(95, 115), c:pc(R), c2:pc(R), hl:R() < .5, f:true});
    add("car", {x:rb(150, 450), y:548, s:rb(80, 95), c:pc(R), c2:pc(R), hl:R() < .5, f:R() < .5});
  } else if (theme === 1){ // garden
    dec.hills = [[rb(80, 200), rb(70, 110)], [rb(320, 520), rb(80, 120)]];
    add("sun", {x:rb(470, 560), y:70, s:28, c:[45,95,58], n:ri(9, 12)});
    for (let i = 0; i < 2; i++) add("cloud", {x:rb(60, 420), y:rb(50, 120), s:rb(18, 24), c:[0,0,98], n:ri(4, 6)});
    add("kite", {x:rb(150, 400), y:rb(60, 110), s:24, c:pc(R), c2:pc(R), n:ri(2, 4), r:rb(-15, 15)});
    for (let i = 0; i < 3; i++) add("tree", {x:60 + i * 200 + rb(-30, 30), y:rb(330, 360), s:rb(32, 40), c:[ri(95, 140), 45, ri(32, 42)], c2:[ri(0, 40), 85, 55], n:ri(3, 7), fp:fruitPts()});
    add("fence", {x:rb(10, 60), y:410, n:ri(7, 10), c:[30, 35, 85]});
    add("bench", {x:rb(330, 380), y:410, c:pc(R)});
    for (let i = 0; i < 10; i++) add("flower", {x:i < 7 ? rb(20, 320) : rb(330, 590), y:i < 7 ? rb(440, 590) : rb(540, 595), s:rb(22, 30), c:pc(R), c2:[45, 95, 55], n:ri(5, 7)});
    for (let i = 0; i < 2; i++) add("duck", {x:rb(380, 520), y:rb(465, 495), s:rb(14, 18), c:[50, 95, 60], f:R() < .5});
    for (let i = 0; i < 3; i++) add("butterfly", {x:rb(40, 560), y:rb(170, 330), s:rb(11, 15), c:pc(R), c2:pc(R)});
    add("person", {x:rb(420, 560), y:rb(570, 590), s:rb(58, 66), c:pc(R), c2:pc(R), c3:pc(R), arm:R() < .4, f:R() < .5});
  } else if (theme === 2){ // beach
    add("sun", {x:rb(420, 540), y:rb(60, 90), s:30, c:[40,95,58], n:ri(9, 12)});
    for (let i = 0; i < 2; i++) add("cloud", {x:rb(60, 380), y:rb(50, 120), s:rb(18, 24), c:[0,0,98], n:ri(4, 6)});
    for (let i = 0; i < 3; i++) add("bird", {x:rb(150, 560), y:rb(60, 200), s:rb(8, 12)});
    add("lighthouse", {x:rb(50, 80), y:270, s:150, c:[355,75,52], n:ri(3, 4)});
    for (let i = 0; i < 3; i++) add("boat", {x:150 + i * 140 + rb(-30, 30), y:rb(300, 360), s:rb(38, 52), c:pc(R), c2:[0,0,96], fl:R() < .5, f:R() < .5});
    add("palm", {x:rb(470, 520), y:rb(480, 510), s:rb(140, 165), n:ri(5, 7)});
    add("umbrella", {x:rb(80, 190), y:rb(470, 500), s:rb(80, 95), c:pc(R), c2:[0,0,96], n:ri(5, 7)});
    add("umbrella", {x:rb(300, 400), y:rb(500, 530), s:rb(80, 95), c:pc(R), c2:[0,0,96], n:ri(5, 7)});
    for (let i = 0; i < 2; i++) add("person", {x:rb(60, 460), y:rb(540, 580), s:rb(54, 62), c:pc(R), c2:pc(R), c3:pc(R), arm:R() < .4, f:R() < .5});
    for (let i = 0; i < 2; i++) add("ball", {x:rb(80, 520), y:rb(430, 590), s:rb(13, 17), c:pc(R), c2:pc(R), r:rb(0, 60)});
    for (let i = 0; i < 4; i++) add("star", {x:rb(30, 570), y:rb(500, 590), s:rb(10, 14), c:[ri(0, 30), 80, 60], r:rb(0, 70)});
  } else { // living room
    dec.wall = [ri(20, 220), ri(25, 45), ri(78, 86)]; dec.sofa = pc(R);
    add("frame", {x:rb(90, 130), y:rb(110, 140), s:rb(70, 85), c:[28, 50, ri(30, 55)], c2:pc(R), sn:R() < .5, r:rb(-4, 4)});
    add("frame", {x:rb(250, 280), y:rb(100, 120), s:rb(48, 58), c:pc(R), c2:pc(R), sn:R() < .5, r:rb(-4, 4)});
    add("clock", {x:rb(510, 550), y:rb(80, 100), s:32, c:pc(R), a:rb(0, 6.28), b:rb(0, 6.28)});
    const mkBooks = (X) => { const n = ri(5, 7); add("books", {x:X, y:258, n, bw:Array.from({length:8}, () => rb(11, 16)), bh:Array.from({length:8}, () => rb(30, 46)), bc:Array.from({length:8}, () => pc(R))}); };
    mkBooks(rb(345, 360)); mkBooks(rb(460, 475));
    for (let i = 0; i < 3; i++) add("cushion", {x:110 + i * 85 + rb(-8, 8), y:rb(352, 362), s:rb(52, 60), c:pc(R), c2:[0,0,96], n:ri(2, 6)});
    add("tlamp", {x:rb(470, 520), y:440, s:rb(95, 110), c:pc(R), lit:R() < .5});
    for (let i = 0; i < 2; i++) add("cup", {x:250 + i * 60 + rb(-10, 10), y:497, c:pc(R), f:R() < .5});
    add("plant", {x:rb(30, 55), y:rb(560, 580), s:rb(70, 85), c:pc(R), n:ri(4, 7)});
    add("plant", {x:rb(540, 570), y:rb(560, 580), s:rb(60, 75), c:pc(R), n:ri(4, 7)});
    add("ball", {x:rb(180, 420), y:rb(560, 580), s:14, c:pc(R), c2:pc(R), r:rb(0, 60)});
  }
  return {items, dec};
}
function drawDecor(x, theme, dec){
  const g = (y0, y1, a, b) => { const gr = x.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, a); gr.addColorStop(1, b); return gr; };
  if (theme === 0){
    x.fillStyle = g(0, 470, "hsl(205,70%,72%)", "hsl(200,60%,92%)"); x.fillRect(0, 0, 600, 470);
    x.fillStyle = "hsl(30,10%,78%)"; x.fillRect(0, 470, 600, 40); x.fillStyle = "hsl(220,8%,35%)"; x.fillRect(0, 510, 600, 90);
    for (let X = 10; X < 600; X += 70){ x.fillStyle = "hsl(0,0%,95%)"; x.fillRect(X, 553, 36, 5); }
  } else if (theme === 1){
    x.fillStyle = g(0, 330, "hsl(200,75%,74%)", "hsl(195,60%,92%)"); x.fillRect(0, 0, 600, 330);
    dec.hills.forEach(([X, h]) => { x.fillStyle = "hsl(120,30%,62%)"; x.beginPath(); x.ellipse(X, 330, 220, h, 0, Math.PI, 0); x.fill(); });
    x.fillStyle = g(320, 600, "hsl(105,45%,52%)", "hsl(110,45%,40%)"); x.fillRect(0, 320, 600, 280);
    x.fillStyle = "hsl(200,65%,58%)"; x.beginPath(); x.ellipse(455, 485, 125, 42, 0, 0, 7); x.fill();
  } else if (theme === 2){
    x.fillStyle = g(0, 260, "hsl(200,80%,70%)", "hsl(190,70%,90%)"); x.fillRect(0, 0, 600, 260);
    x.fillStyle = g(260, 420, "hsl(200,70%,48%)", "hsl(190,65%,40%)"); x.fillRect(0, 260, 600, 160);
    x.strokeStyle = "hsla(0,0%,100%,.5)"; x.lineWidth = 2.5; for (let y = 285; y < 395; y += 26){ x.beginPath(); for (let X = 0; X <= 600; X += 12) x.lineTo(X, y + Math.sin(X / 25 + y) * 3); x.stroke(); }
    x.fillStyle = "hsl(30,25%,40%)"; x.beginPath(); x.ellipse(65, 285, 70, 22, 0, 0, 7); x.fill();
    x.fillStyle = g(390, 600, "hsl(42,65%,80%)", "hsl(38,55%,70%)"); x.beginPath(); x.moveTo(0, 405); x.quadraticCurveTo(300, 380, 600, 400); x.lineTo(600, 600); x.lineTo(0, 600); x.fill();
  } else {
    x.fillStyle = hsl(dec.wall); x.fillRect(0, 0, 600, 440);
    for (let X = 0; X < 600; X += 40){ x.fillStyle = hsl(dec.wall, -4); x.fillRect(X, 0, 14, 440); }
    x.fillStyle = "hsl(28,40%,52%)"; x.fillRect(0, 440, 600, 160); for (let y = 460; y < 600; y += 28){ x.fillStyle = "hsl(28,40%,46%)"; x.fillRect(0, y, 600, 2); }
    x.fillStyle = "hsl(15,45%,55%)"; x.beginPath(); x.ellipse(300, 540, 200, 38, 0, 0, 7); x.fill();
    x.fillStyle = hsl(WOOD); x.fillRect(335, 258, 230, 8);
    x.fillStyle = hsl(dec.sofa, -8); rr(x, 50, 300, 300, 90, 16); x.fill(); x.fillStyle = hsl(dec.sofa); rr(x, 40, 370, 320, 60, 14); x.fill();
    x.fillStyle = hsl(dec.sofa, -12); x.fillRect(58, 430, 10, 14); x.fillRect(332, 430, 10, 14);
    x.fillStyle = hsl(WOOD); x.fillRect(220, 497, 140, 10); x.fillRect(232, 507, 8, 40); x.fillRect(340, 507, 8, 40);
    x.fillStyle = hsl(WOOD, 8); x.fillRect(450, 440, 90, 8); x.fillRect(460, 448, 8, 40); x.fillRect(522, 448, 8, 40);
  }
}
function applyMut(it, m, R, lv){
  const tp = T[it.t], b0 = tp.box(it);
  if (tp.det && tp.det[m]) return tp.det[m](it, R, lv);
  if (m === "remove") it.hide = true;
  else if (m === "color") it.c = shiftCol(it.c, lv, R);
  else if (m === "color2") it.c2 = shiftCol(it.c2, lv, R);
  else if (m === "size") it.s *= [1.42, 1.28, 1.18][lv];
  else if (m === "move") it.x += (it.x > 300 ? -1 : 1) * [42, 30, 22][lv];
  else if (m === "flip") it.f = !it.f;
  else if (m === "rot") it.r += (R() < .5 ? 1 : -1) * [35, 24, 16][lv];
  else if (m === "count"){ const [lo, hi] = tp.cnt, st = lv === 0 ? 2 : 1; const d = it.n + st > hi ? -st : it.n - st < lo ? st : (R() < .5 ? -st : st); it.n = Math.max(lo, Math.min(hi, it.n + d)); }
  else return null;
  const b1 = tp.box(it), dx = b1[0] - b0[0], dy = b1[1] - b0[1];
  return [(b0[0] + b1[0]) / 2, (b0[1] + b1[1]) / 2, Math.max(b0[2], b1[2]) + Math.hypot(dx, dy) / 2];
}
const dfClone = o => JSON.parse(JSON.stringify(o));
function genDiff(seed, nd, lv){
  lv = lv == null ? 1 : lv;
  const R = rng(seed), theme = Math.floor(R() * 4), {items:A, dec} = buildScene(theme, R), B = dfClone(A);
  const cands = [];
  A.forEach((it, i) => { const tp = T[it.t]; for (const m of tp.muts) cands.push([i, m]); if (lv < 2 && tp.easy) for (const m of tp.easy) cands.push([i, m]); });
  const order = shuffle(range(cands.length), Math.floor(R() * 1e9) + 1), used = new Set(), diffs = [];
  const free = (cx, cy, r) => diffs.every(d => Math.hypot(d.x - cx, d.y - cy) > d.r + r + 4);
  for (const k of order){
    if (diffs.length >= nd) break;
    const [i, m] = cands[k]; if (used.has(i)) continue;
    const trial = dfClone(B[i]), reg = applyMut(trial, m, R, lv);
    if (!reg) continue;
    const r = Math.max(reg[2], 24) + 6;
    if (!free(reg[0], reg[1], r)) continue;
    B[i] = trial; used.add(i); diffs.push({x:reg[0], y:reg[1], r, m});
  }
  // added objects fill up if still short
  const addTypes = ["bird","flower","butterfly","star","cup"].filter(t => A.some(it => it.t === t));
  let guard = 0;
  while (diffs.length < nd && addTypes.length && guard++ < 200){
    const t = addTypes[Math.floor(R() * addTypes.length)], proto = A.find(it => it.t === t);
    const it = {...dfClone(proto), x:30 + R() * 540, y:proto.y + (R() - .5) * 120}; if (t === "flower"){ it.c = pc(R); }
    const [cx, cy, br] = T[t].box(it), r = Math.max(br, 24) + 6;
    if (cy < 20 || cy > 585) continue;
    if (!free(cx, cy, r) || A.some(o => !o.hide && Math.hypot(T[o.t].box(o)[0] - cx, T[o.t].box(o)[1] - cy) < T[o.t].box(o)[2] * .6 + br)) continue;
    B.push(it); diffs.push({x:cx, y:cy, r, m:"add"});
  }
  return {theme, dec, A, B, diffs};
}
const diffCache = {};
function diffURL(seed, nd, lv, side){
  const key = [seed, nd, lv, side].join(":"); if (diffCache[key]) return diffCache[key];
  const g = genDiff(seed, nd, lv), c = document.createElement("canvas"); c.width = c.height = 900;
  const x = c.getContext("2d"); x.scale(1.5, 1.5);
  drawDecor(x, g.theme, g.dec);
  for (const it of (side === "A" ? g.A : g.B)){
    if (it.hide) continue;
    x.save(); x.translate(it.x, it.y); if (it.r) x.rotate(it.r * Math.PI / 180); if (it.f) x.scale(-1, 1);
    T[it.t].draw(x, it); x.restore();
  }
  return diffCache[key] = c.toDataURL("image/jpeg", .9);
}
