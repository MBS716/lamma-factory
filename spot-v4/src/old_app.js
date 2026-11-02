
"use strict";
const BASE_URL = location.protocol.startsWith("http") ? location.origin + location.pathname : "";
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean = s => String(s || "").replace(/[\u0000-\u001f\u007f­​-‏‪-‮⁠-⁩﻿]/g, "").trim().slice(0, 20);
function rng(seed){ let s = (seed >>> 0) || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function shuffle(arr, seed){ const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const range = n => Array.from({length:n}, (_, i) => i);
const TEAM = {g:"الأخضر", o:"البرتقالي"};
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch(e){ return ""; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };

/* ================= CONTENT ================= */
const QUIZ = [
  ["ما عاصمة اليابان؟", ["طوكيو","أوساكا","كيوتو","سيول"], 0],
  ["كم عدد أيام السنة الكبيسة؟", ["365","366","364","360"], 1],
  ["ما أكبر محيط في العالم؟", ["الأطلسي","الهندي","الهادئ","المتجمد الشمالي"], 2],
  ["أي كوكب يُعرف بالكوكب الأحمر؟", ["الزهرة","المريخ","المشتري","عطارد"], 1],
  ["كم لاعبًا لكل فريق كرة قدم داخل الملعب؟", ["9","10","11","12"], 2],
  ["ما العنصر الذي رمزه الكيميائي O؟", ["الذهب","الأكسجين","الحديد","الفضة"], 1],
  ["في أي مدينة يقع برج خليفة؟", ["الدوحة","الرياض","دبي","الكويت"], 2],
  ["ما أطول نهر في أفريقيا؟", ["الكونغو","النيل","النيجر","الزمبيزي"], 1],
  ["كم ضلعًا للشكل السداسي؟", ["5","6","7","8"], 1],
  ["ما أسرع حيوان بري؟", ["الأسد","الفهد","الحصان","الغزال"], 1],
  ["ما عملة المملكة المتحدة؟", ["اليورو","الدولار","الجنيه الإسترليني","الفرنك"], 2],
  ["كم عدد قارات العالم؟", ["5","6","7","8"], 2],
  ["ما الغاز الذي تمتصه النباتات من الهواء؟", ["الأكسجين","ثاني أكسيد الكربون","النيتروجين","الهيليوم"], 1],
  ["ما أصغر دولة عربية مساحةً؟", ["قطر","البحرين","لبنان","الكويت"], 1],
  ["في أي قارة تقع البرازيل؟", ["أفريقيا","أمريكا الجنوبية","أوروبا","آسيا"], 1],
  ["كم ثانية في الساعة الواحدة؟", ["360","3600","6000","600"], 1],
  ["ما أكبر صحراء حارة في العالم؟", ["الربع الخالي","الصحراء الكبرى","غوبي","كالاهاري"], 1],
  ["ما أكبر عضو في جسم الإنسان؟", ["الكبد","الجلد","الرئة","القلب"], 1],
  ["ما عاصمة المغرب؟", ["الدار البيضاء","مراكش","الرباط","فاس"], 2],
  ["كم عدد ألوان قوس قزح؟", ["5","6","7","8"], 2],
];
const LETTERS = [
  ["أ","أكبر قارة في العالم من حيث المساحة","آسيا"],
  ["ب","عاصمة لبنان","بيروت"],
  ["ت","ثمرة النخيل","تمر"],
  ["ث","حيوان يُضرب به المثل في المكر","ثعلب"],
  ["ج","مدينة سعودية ساحلية على البحر الأحمر","جدة"],
  ["ح","طائر يرمز إلى السلام","حمامة"],
  ["خ","الحيوان الذي يُضحّى به غالبًا في عيد الأضحى","خروف"],
  ["د","أكبر مدن الإمارات من حيث عدد السكان","دبي"],
  ["ذ","معدن ثمين لونه أصفر","ذهب"],
  ["ر","عاصمة المملكة العربية السعودية","الرياض"],
  ["ز","أطول حيوان على وجه الأرض","زرافة"],
  ["س","أداة تُلبس في المعصم لمعرفة الوقت","ساعة"],
  ["ش","النجم الذي تدور حوله الأرض","الشمس"],
  ["ص","عاصمة اليمن","صنعاء"],
  ["ض","حيوان برمائي يقفز وينقّ","ضفدع"],
  ["ط","وسيلة نقل تحلّق في السماء","طائرة"],
  ["ظ","عكس النور","ظلام"],
  ["ع","عاصمة الأردن","عمّان"],
  ["غ","أكبر القردة حجمًا ويعيش في غابات أفريقيا","غوريلا"],
  ["ف","حيوان ضخم له خرطوم","فيل"],
  ["ق","التابع الطبيعي الوحيد للأرض","القمر"],
  ["ك","الرياضة الأكثر شعبية في العالم","كرة القدم"],
  ["ل","عاصمة المملكة المتحدة","لندن"],
  ["م","المدينة التي يقع فيها المسجد الحرام","مكة المكرمة"],
  ["ن","أطول نهر في أفريقيا","النيل"],
  ["هـ","دولة عاصمتها نيودلهي","الهند"],
  ["و","مادة تُصنع منها الكتب والدفاتر","الورق"],
  ["ي","دولة عاصمتها طوكيو","اليابان"],
];
const SEGS = [
  {t:"+100", p:100}, {t:"تحدٍّ", ch:1}, {t:"+200", p:200}, {t:"خسارة الدور", lose:1},
  {t:"+300", p:300}, {t:"تحدٍّ", ch:1}, {t:"ضعف النقاط", x2:1}, {t:"+500", p:500},
];
const CHALLENGES = [
  "قلّد صوت حيوان، ويخمّنه فريقك خلال 10 ثوانٍ",
  "اذكر 5 دول تبدأ بحرف الميم خلال 15 ثانية",
  "عُدّ من 20 إلى 1 بسرعة دون أي خطأ",
  "اذكر 3 أشياء لونها أزرق في 5 ثوانٍ",
  "صِف شيئًا دون ذكر اسمه، ويخمّنه فريقك في 30 ثانية",
  "اذكر 4 لاعبي كرة قدم عرب في 10 ثوانٍ",
  "تحدَّ لاعبًا من الفريق الآخر في حجر ورقة مقص",
  "قل اسم مدينة تبدأ بآخر حرف من اسمك",
];
const SCENES = ["الصحراء","البحر","المدينة ليلًا","الملعب"];
const SHAPES = ["◆","●","▲","■"];

/* ================= ROOM (Firebase Realtime Database) ================= */
/* ضع إعدادات مشروعك في Firebase هنا (من: Project settings ← Your apps ← Web app) */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDYeFUK0RhwmFUUwuGNkjH_0cnrsDP0EOA",
  authDomain: "lamma-b3804.firebaseapp.com",
  databaseURL: "https://lamma-b3804-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "lamma-b3804",
  storageBucket: "lamma-b3804.firebasestorage.app",
  messagingSenderId: "75949188252",
  appId: "1:75949188252:web:f2e58971af02071b8a7959",
};

let ROOM = null, NR = null, H = null, P = null, connState = "checking";
function makeRoom(db){
  const me = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return {
    async join(name){
      const ref = db.ref("rooms/" + name), mine = ref.child(me), ci = db.ref(".info/connected");
      let local = {}, peersArr = Object.freeze([]), handlers = [], connH = [], conn = false, left = false;
      const write = () => mine.set({j:JSON.stringify(local), t:firebase.database.ServerValue.TIMESTAMP});
      const build = val => {
        const prev = new Map(peersArr.map(p => [p.peer, p])), now = Date.now();
        peersArr = Object.freeze(Object.entries(val || {}).map(([id, v]) => {
          let pres = {}; try { pres = JSON.parse((v && v.j) || "{}") || {}; } catch(e){}
          const old = prev.get(id);
          return old && old.raw === (v && v.j) ? old : {peer:id, presence:pres, raw:v && v.j, sameTab:id === me, isMe:id === me, updatedAt:now};
        }));
        handlers.slice().forEach(h => { try { h({peers:peersArr}); } catch(e){ console.error(e); } });
      };
      const cb = snap => build(snap.val());
      const ccb = s => { conn = !!s.val(); if (conn && !left){ mine.onDisconnect().remove(); write(); } connH.forEach(h => h(conn)); };
      mine.onDisconnect().remove();
      await Promise.race([write(), sleep(10000).then(() => { throw new Error("timeout"); })]);
      ref.on("value", cb);
      ci.on("value", ccb);
      return {
        name,
        presence(patch){ for (const [k, v] of Object.entries(patch)){ if (v === null) delete local[k]; else local[k] = v; } return left ? Promise.resolve() : write(); },
        peers: () => peersArr,
        onPeers(h){ handlers.push(h); setTimeout(() => h({peers:peersArr}), 0); return () => { handlers = handlers.filter(x => x !== h); }; },
        connected: () => conn,
        onConnection(h){ connH.push(h); return () => { connH = connH.filter(x => x !== h); }; },
        async leave(){ if (left) return; left = true; ref.off("value", cb); ci.off("value", ccb); handlers = []; try { await mine.onDisconnect().cancel(); } catch(e){} await mine.remove(); },
      };
    },
  };
}
const roomReady = (async () => {
  try {
    if (FIREBASE_CONFIG && window.firebase){
      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      ROOM = makeRoom(firebase.database());
    }
  } catch(e){ console.error(e); ROOM = null; }
  connState = ROOM ? "on" : "off"; updateConn(); return ROOM;
})();
function updateConn(){
  $("#connDot").className = "dot " + (connState === "on" ? "on" : connState === "off" ? "off" : "");
  $("#connTxt").textContent = connState === "on" ? "الاتصال المباشر جاهز" : connState === "off" ? "وضع الشاشة الواحدة" : "جارٍ فحص الاتصال المباشر…";
}
const peerKey = peer => "p_" + String(peer).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
const pname = p => clean(p.presence && p.presence.n) || "لاعب";
function hostPlayers(){ return NR ? NR.peers().filter(p => !p.sameTab && p.presence && p.presence.r === "p") : []; }
function myPeer(){ const me = NR && NR.peers().find(p => p.sameTab); return me ? me.peer : ""; }
function joinLink(code){ return (BASE_URL || "") + "#" + code; }

/* ================= GAMES REGISTRY ================= */
const GAMES = {
  quiz:   {name:"تحدي الأسئلة", desc:"أسئلة متعددة الخيارات بمؤقت، ونقاط أعلى لمن يجيب أسرع.", meta:"أفراد · من الجوال", teams:false,
           art:`<div class="art-quiz">${SHAPES.map((s,i)=>`<span class="c${i}">${s}</span>`).join("")}</div>`},
  letters:{name:"سباق الحروف", desc:"فريقان يتنافسان على خلايا الحروف، والفائز من يصل ضفّتيه أولًا.", meta:"فريقان · جرس من الجوال", teams:true,
           art:`<div class="art-hex"><span style="background:var(--green)">م</span><span style="background:var(--gold)">ل</span><span style="background:var(--orange)">ع</span></div>`},
  wheel:  {name:"عجلة التحديات", desc:"لفّ العجلة: نقاط، تحديات، مضاعفة أو خسارة الدور.", meta:"فريقان · يتابعون من الجوال", teams:true,
           art:`<div class="art-wheel"></div>`},
  puzzle: {name:"الصورة الملخبطة", desc:"سباق لترتيب قطع صورة مبعثرة، والأسرع يتصدّر.", meta:"أفراد · من الجوال", teams:false,
           art:`<div class="art-pz">${[4,0,7,2,8,1,6,3,5].map(i=>`<span style="background-position:${-(i%3)*36}px ${-Math.floor(i/3)*36}px"></span>`).join("")}</div>`},
  diff:   {name:"اكتشف الفرق", desc:"مشاهد مفصّلة بثلاث مستويات صعوبة، والفائز من يجد كل الفروق أولًا.", meta:"أفراد · من الجوال", teams:false,
           art:`<div class="art-df"><span>🍎</span><span>🍎<i></i></span></div>`},
};
$("#gamesGrid").innerHTML = Object.entries(GAMES).map(([k,g]) => `
  <button class="gcard" data-game="${k}">
    <div class="gart">${g.art}</div>
    <div class="gbody"><span class="meta">${g.meta}</span><h3>${g.name}</h3><p class="muted">${g.desc}</p><span class="go">ابدأ كمقدّم ←</span></div>
  </button>`).join("");
$("#gamesGrid").addEventListener("click", e => { const b = e.target.closest("[data-game]"); if (b) hostStart(b.dataset.game); });

function show(v){ for (const id of ["home","host","player"]) $("#" + id).hidden = id !== v; window.scrollTo(0, 0); }

/* ================= HOST ================= */
async function hostStart(g){
  H = {g, code:null, s:MOD[g].init(), priv:{}};
  for (const id of ["#hostMain","#hostBar"]){ $(id).innerHTML = ""; $(id).dataset.k = ""; }
  show("host"); renderHost();
  await roomReady;
  if (ROOM) await claimCode();
  renderHost();
}
async function claimCode(){
  for (let k = 0; k < 4; k++){
    const code = String(1000 + Math.floor(Math.random() * 9000));
    let nr;
    try { nr = await ROOM.join("lm-" + code); } catch(e){ console.error(e); H.failed = true; return; }
    try { await nr.presence({r:"h", g:H.g, s:H.s}); } catch(e){}
    await sleep(1300);
    if (nr.peers().some(p => !p.sameTab && p.presence && p.presence.r === "h")){ try { await nr.leave(); } catch(e){} continue; }
    if (!H){ try { await nr.leave(); } catch(e){} return; }
    NR = nr; H.code = code;
    NR.onPeers(() => { if (H && MOD[H.g].hostPeers) MOD[H.g].hostPeers(hostPlayers()); renderHost(); });
    return;
  }
}
function pushHost(){
  if (!H) return;
  if (NR){
    let s = H.s, txt = JSON.stringify(s);
    if (txt.length > 3800 && s.res){ s = {...s, res:{}}; }
    NR.presence({r:"h", g:H.g, s}).catch(() => {});
  }
  renderHost();
}
async function hostEnd(){
  if (H && H.priv.tick) clearInterval(H.priv.tick);
  if (NR){ try { await NR.leave(); } catch(e){} NR = null; }
  H = null; show("home");
}
function renderHost(){
  if (!H) return;
  const g = GAMES[H.g], players = hostPlayers();
  let codeHtml;
  if (H.code){
    codeHtml = `<div><span class="muted">كود الدخول</span><div class="code">${H.code}</div></div>
      <div class="qr" id="qr"></div>
      ${BASE_URL ? `<button class="btn ghost sm" id="copyLink">نسخ رابط الدخول</button>` : ""}`;
  } else if (connState === "checking" || (ROOM && !H.code && !H.failed)){
    codeHtml = `<span class="muted">جارٍ تجهيز الكود…</span>`;
  } else {
    codeHtml = `<span class="muted">وضع الشاشة الواحدة</span>`;
  }
  const bar = `<div><span class="muted">${g.meta}</span><h2>${g.name}</h2></div>
    <div class="codebox">${codeHtml}</div>
    <div class="row"><span class="chip">${players.length} لاعب</span><button class="btn ghost sm" id="endBtn">إنهاء</button></div>`;
  const barEl = $("#hostBar");
  if (barEl.dataset.k !== bar){
    barEl.innerHTML = bar; barEl.dataset.k = bar;
    $("#endBtn").onclick = hostEnd;
    const cp = $("#copyLink");
    if (cp) cp.onclick = () => copyText(joinLink(H.code), cp);
    const qr = $("#qr");
    if (qr && BASE_URL && window.QRCode){ try { new QRCode(qr, {text:joinLink(H.code), width:96, height:96, colorDark:"#0f1430", colorLight:"#ffffff"}); } catch(e){} }
  }
  MOD[H.g].host(players);
}
function copyText(t, btn){
  const done = () => { const o = btn.textContent; btn.textContent = "تم النسخ"; setTimeout(() => btn.textContent = o, 1500); };
  try { navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, btn)); } catch(e){ fallbackCopy(t, btn); }
}
function fallbackCopy(t, btn){ btn.insertAdjacentHTML("afterend", `<input class="field" value="${esc(t)}" readonly style="font-size:.9rem;direction:ltr" onfocus="this.select()">`); btn.remove(); }
function soloNote(){
  if (H.code) return "";
  if (ROOM && H.failed) return `<p class="note">تعذّر الاتصال بقاعدة البيانات. تأكد من اتصال الإنترنت، ومن نشر القواعد في Firebase، ثم أعد فتح اللعبة.</p>`;
  return `<p class="note">الاتصال المباشر غير مفعّل في هذه النسخة، فتُدار اللعبة من هذه الشاشة فقط. لتفعيل اللعب من الجوالات أضف إعدادات Firebase إلى الملف.</p>`;
}
function playerChips(players, teams){
  if (!players.length) return `<p class="muted">لم ينضم أحد بعد. اعرض الكود على الشاشة.</p>`;
  if (!teams) return `<div class="chips">${players.map(p => `<span class="chip">${esc(pname(p))}</span>`).join("")}</div>`;
  const col = t => players.filter(p => p.presence.tm === t).map(p => `<span class="chip ${t}">${esc(pname(p))}</span>`).join("") || `<span class="muted">لا أحد</span>`;
  return `<div class="stack"><div><b class="tg">الفريق الأخضر</b><div class="chips">${col("g")}</div></div><div><b class="to">الفريق البرتقالي</b><div class="chips">${col("o")}</div></div></div>`;
}
function setMain(html){ const m = $("#hostMain"); if (m.dataset.k !== html){ m.innerHTML = html; m.dataset.k = html; return true; } return false; }

/* ================= PLAYER ================= */
async function playerJoin(code){
  $("#joinErr").textContent = "";
  if (!/^\d{4}$/.test(code)){ $("#joinErr").textContent = "الكود مكوّن من 4 أرقام."; return; }
  await roomReady;
  if (!ROOM){ $("#joinErr").textContent = "الاتصال المباشر غير مفعّل في هذه النسخة من الموقع."; return; }
  if (NR){ try { await NR.leave(); } catch(e){} NR = null; }
  try { NR = await ROOM.join("lm-" + code); }
  catch(e){ console.error(e); NR = null; $("#joinErr").textContent = "تعذّر الاتصال باللعبة. تأكد من الإنترنت وأعد المحاولة."; return; }
  $("#playerMain").innerHTML = ""; $("#playerMain").dataset.k = "";
  P = {code, name:lsGet("lm-name"), team:null, joined:false, g:null, host:null, view:{}, searching:true};
  show("player"); playerRender();
  NR.onPeers(() => playerRender());
  setTimeout(() => { if (P && P.code === code){ P.searching = false; playerRender(); } }, 6000);
}
async function playerLeave(){ if (NR){ try { await NR.leave(); } catch(e){} NR = null; } P = null; show("home"); }
function findHost(){ return NR ? NR.peers().find(p => !p.sameTab && p.presence && p.presence.r === "h" && GAMES[p.presence.g]) : null; }
function pSet(html){ const m = $("#playerMain"); if (m.dataset.k !== html){ m.innerHTML = html; m.dataset.k = html; return true; } return false; }
function playerRender(){
  if (!P) return;
  const host = findHost();
  if (!host){
    pSet(`<div class="panel center stack">${P.searching || P.joined
      ? `<p class="bigmsg">${P.joined ? "بانتظار المقدّم…" : "نبحث عن اللعبة…"}</p><p class="muted">الكود ${esc(P.code)}</p>`
      : `<p class="bigmsg">لم نجد لعبة بهذا الكود</p><p class="muted">تأكد من الكود المعروض على شاشة المقدّم.</p>`}
      <div class="row" style="justify-content:center"><button class="btn ghost sm" data-act="leave">رجوع</button></div></div>`);
    bindPlayer(); return;
  }
  P.g = host.presence.g;
  const game = GAMES[P.g];
  if (!P.joined){
    const needTeam = game.teams;
    pSet(`<div class="panel stack">
      <p class="muted">انضممت إلى</p><h2 style="font-size:2rem">${game.name}</h2>
      <label for="pName">اسمك</label>
      <input class="field" id="pName" maxlength="20" value="${esc(P.name)}" placeholder="اكتب اسمك">
      ${needTeam ? `<span>اختر فريقك</span><div class="teampick"><button class="g ${P.team==="g"?"on":""}" data-team="g">الأخضر</button><button class="o ${P.team==="o"?"on":""}" data-team="o">البرتقالي</button></div>` : ""}
      <p class="err" id="pErr"></p>
      <button class="btn" data-act="enter">دخول</button></div>`);
    bindPlayer(); return;
  }
  MOD[P.g].player(host.presence.s || {}, host);
}
function bindPlayer(){
  const m = $("#playerMain");
  m.onclick = e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.act === "leave") return playerLeave();
    if (t.dataset.team){ P.team = t.dataset.team; P.name = clean($("#pName") ? $("#pName").value : P.name); m.querySelectorAll("[data-team]").forEach(b => b.classList.toggle("on", b.dataset.team === P.team)); return; }
    if (t.dataset.act === "enter"){
      const name = clean($("#pName").value);
      if (!name){ $("#pErr").textContent = "اكتب اسمك أولًا."; return; }
      if (GAMES[P.g].teams && !P.team){ $("#pErr").textContent = "اختر فريقك."; return; }
      P.name = name; lsSet("lm-name", name); P.joined = true;
      NR.presence({r:"p", n:name, tm:P.team || null}).catch(() => {});
      playerRender(); return;
    }
    if (P && P.g && MOD[P.g].pclick) MOD[P.g].pclick(t);
  };
}
function phead(extra){ return `<div class="phead"><span class="who">${esc(P.name)}${P.team ? ` · <span class="t${P.team}">${TEAM[P.team]}</span>` : ""}</span><span class="row">${extra || ""}<button class="btn ghost sm" data-act="leave">خروج</button></span></div>`; }

/* ================= QUIZ ================= */
const optOrder = qid => shuffle([0,1,2,3], qid * 97 + 13);
const QZ_MS = 20000;
const Quiz = {
  init: () => ({ph:"lobby", i:0, n:10, q:-1, t:20, cnt:0, top:[], res:{}, dist:null}),
  start(){
    H.priv.order = shuffle(range(QUIZ.length), Date.now() % 1e9).slice(0, 10);
    H.priv.scores = {}; H.priv.local = {g:0, o:0};
    H.s = {...Quiz.init(), n:H.priv.order.length};
    Quiz.next();
  },
  next(){
    const s = H.s;
    if (s.i >= s.n){ s.ph = "end"; pushHost(); return; }
    s.q = H.priv.order[s.i]; s.i++; s.ph = "q"; s.t = 20; s.cnt = 0; s.res = {}; s.dist = null;
    H.priv.seen = {}; H.priv.qStart = Date.now(); H.priv.showAns = false;
    clearInterval(H.priv.tick); H.priv.tick = setInterval(Quiz.tick, 250);
    pushHost();
  },
  tick(){
    if (!H || H.s.ph !== "q") return;
    const left = Math.max(0, Math.ceil((QZ_MS - (Date.now() - H.priv.qStart)) / 1000));
    if (left !== H.s.t){ H.s.t = left; pushHost(); }
    if (left <= 0) Quiz.reveal();
  },
  hostPeers(players){
    if (H.s.ph !== "q") return;
    let ch = false;
    for (const p of players){
      const a = p.presence.a;
      if (a && a.q === H.s.q && Number.isInteger(a.c) && a.c >= 0 && a.c < 4 && !H.priv.seen[p.peer]){
        H.priv.seen[p.peer] = {c:a.c, ms:Date.now() - H.priv.qStart, n:pname(p)}; ch = true;
      }
    }
    if (ch){
      H.s.cnt = Object.keys(H.priv.seen).length;
      if (players.length && H.s.cnt >= players.length) Quiz.reveal(); else pushHost();
    }
  },
  reveal(){
    clearInterval(H.priv.tick);
    const s = H.s, correct = optOrder(s.q).indexOf(QUIZ[s.q][2]), dist = [0,0,0,0];
    for (const p of hostPlayers()){ const sc = H.priv.scores[p.peer] || (H.priv.scores[p.peer] = {n:pname(p), s:0}); sc.n = pname(p); }
    for (const sc of Object.values(H.priv.scores)) sc.g = 0;
    for (const [peer, a] of Object.entries(H.priv.seen)){
      dist[a.c]++;
      const sc = H.priv.scores[peer] || (H.priv.scores[peer] = {n:a.n, s:0});
      if (a.c === correct){ sc.g = 500 + Math.round(500 * Math.max(0, 1 - a.ms / QZ_MS)); sc.s += sc.g; }
    }
    const all = Object.entries(H.priv.scores).sort((a, b) => b[1].s - a[1].s);
    s.res = {}; all.forEach(([peer, sc], i) => { s.res[peerKey(peer)] = [sc.g, sc.s, i + 1]; });
    s.top = all.slice(0, 8).map(([, sc]) => [sc.n, sc.s]);
    s.dist = dist; s.ph = "r"; s.t = 0;
    pushHost();
  },
  optsHtml(s, mode){
    const ord = optOrder(s.q), q = QUIZ[s.q], correct = ord.indexOf(q[2]);
    return `<div class="opts">${ord.map((oi, i) => {
      const cls = mode === "r" ? (i === correct ? "right" : "dim") : "";
      return `<div class="opt c${i} ${cls}"><span class="sh">${SHAPES[i]}</span><span>${esc(q[1][oi])}</span>${mode === "r" && s.dist ? `<span class="cnt">${s.dist[i]}</span>` : ""}</div>`;
    }).join("")}</div>`;
  },
  host(players){
    const s = H.s; let html;
    if (s.ph === "lobby"){
      html = `<div class="layout"><div class="panel stack"><h2 style="font-size:2rem">بانتظار اللاعبين</h2>
        <p class="muted">10 أسئلة، 20 ثانية لكل سؤال. الإجابة الصحيحة تمنح من 500 إلى 1000 نقطة حسب السرعة.</p>
        ${playerChips(players, false)}<div><button class="btn" data-h="start">ابدأ المسابقة</button></div>${soloNote()}</div>
        <div class="panel stack"><h3>كيف يشارك اللاعبون</h3><p class="muted">يفتحون الرابط أو يكتبون الكود في الصفحة الرئيسية، ثم يكتبون أسماءهم. تظهر الأسئلة على هذه الشاشة، ويجيبون من جوالاتهم بالشكل واللون.</p></div></div>`;
    } else if (s.ph === "q"){
      html = `<div class="layout"><div class="panel stack"><span class="muted">السؤال ${s.i} من ${s.n}</span><p class="big-q">${esc(QUIZ[s.q][0])}</p>${Quiz.optsHtml(s, "q")}</div>
        <div class="panel stack"><div class="row" style="justify-content:space-between"><span class="timer">${s.t}</span><span class="chip">أجاب ${s.cnt} من ${players.length}</span></div>
        <button class="btn" data-h="reveal">إظهار الإجابة الآن</button>${soloNote()}</div></div>`;
    } else if (s.ph === "r"){
      const loc = H.priv.local;
      html = `<div class="layout"><div class="panel stack"><span class="muted">السؤال ${s.i} من ${s.n}</span><p class="big-q">${esc(QUIZ[s.q][0])}</p>${Quiz.optsHtml(s, "r")}</div>
        <div class="panel stack"><h3>الترتيب</h3>${s.top.length ? `<div class="lb">${s.top.map(([n, sc], i) => `<div><span>${i + 1}. ${esc(n)}</span><b>${sc}</b></div>`).join("")}</div>` : `<p class="muted">لا لاعبين على الجوالات.</p>`}
        ${!H.code ? `<div class="scores"><div class="score g"><span>الأخضر</span><b>${loc.g}</b><button class="btn g sm" data-h="lg">+1</button></div><div class="score o"><span>البرتقالي</span><b>${loc.o}</b><button class="btn o sm" data-h="lo">+1</button></div></div>` : ""}
        <button class="btn" data-h="next">${s.i >= s.n ? "النتيجة النهائية" : "السؤال التالي"}</button></div></div>`;
    } else {
      const t = s.top;
      html = `<div class="panel stack" style="margin-top:18px"><h2 class="center" style="font-size:2.4rem;color:var(--gold)">النتيجة النهائية</h2>
        ${t.length ? `<div class="podium">${t[1] ? `<div class="p2"><strong>${esc(t[1][0])}</strong><span>${t[1][1]}</span></div>` : ""}<div class="p1"><strong>${esc(t[0][0])}</strong><span>${t[0][1]}</span></div>${t[2] ? `<div class="p3"><strong>${esc(t[2][0])}</strong><span>${t[2][1]}</span></div>` : ""}</div>
        <div class="lb">${t.slice(3).map(([n, sc], i) => `<div><span>${i + 4}. ${esc(n)}</span><b>${sc}</b></div>`).join("")}</div>` : `<p class="center muted">الأخضر ${H.priv.local.g} · البرتقالي ${H.priv.local.o}</p>`}
        <div class="row" style="justify-content:center"><button class="btn" data-h="start">مسابقة جديدة</button></div></div>`;
    }
    setMain(html);
    $("#hostMain").onclick = e => {
      const b = e.target.closest("[data-h]"); if (!b) return;
      const a = b.dataset.h;
      if (a === "start") Quiz.start();
      else if (a === "reveal") Quiz.reveal();
      else if (a === "next") Quiz.next();
      else if (a === "lg"){ H.priv.local.g++; renderHost(); }
      else if (a === "lo"){ H.priv.local.o++; renderHost(); }
    };
  },
  player(s){
    const me = peerKey(myPeer()), mine = P.ans && P.ans.q === s.q ? P.ans.c : null;
    let body;
    if (s.ph === "lobby") body = `<div class="panel center stack"><p class="bigmsg">أنت داخل!</p><p class="muted">بانتظار أن يبدأ المقدّم المسابقة.</p></div>`;
    else if (s.ph === "q"){
      if (mine !== null) body = `<div class="panel center stack"><p class="bigmsg">تم تسجيل إجابتك</p><div class="opt c${mine}" style="justify-content:center"><span class="sh">${SHAPES[mine]}</span><span>${esc(QUIZ[s.q][1][optOrder(s.q)[mine]])}</span></div><p class="muted">بانتظار البقية… ${s.t} ث</p></div>`;
      else body = `<div class="panel stack"><div class="row" style="justify-content:space-between"><span class="muted">السؤال ${s.i} من ${s.n}</span><span class="timer" style="font-size:2rem">${s.t}</span></div>
        <p style="font-size:1.3rem;font-weight:700">${esc(QUIZ[s.q][0])}</p>
        <div class="opts">${optOrder(s.q).map((oi, i) => `<button class="opt c${i}" data-ans="${i}"><span class="sh">${SHAPES[i]}</span><span>${esc(QUIZ[s.q][1][oi])}</span></button>`).join("")}</div></div>`;
    } else if (s.ph === "r"){
      const r = s.res[me], correct = optOrder(s.q).indexOf(QUIZ[s.q][2]);
      const ok = mine === correct;
      body = `<div class="panel center stack"><p class="bigmsg" style="color:var(--${ok ? "green" : "bad"})">${mine === null ? "لم تُجب" : ok ? "إجابة صحيحة!" : "إجابة خاطئة"}</p>
        ${r ? `<p style="font-size:1.2rem">+${r[0]} نقطة · المجموع <b>${r[1]}</b></p><p class="muted">ترتيبك ${r[2]}</p>` : ""}
        <p class="muted">الإجابة: ${esc(QUIZ[s.q][1][QUIZ[s.q][2]])}</p></div>`;
    } else {
      const r = s.res[me];
      body = `<div class="panel center stack"><p class="bigmsg" style="color:var(--gold)">انتهت المسابقة</p>${r ? `<p style="font-size:1.3rem">ترتيبك <b>${r[2]}</b> بمجموع ${r[1]} نقطة</p>` : ""}
        <div class="lb">${s.top.slice(0, 3).map(([n, sc], i) => `<div><span>${i + 1}. ${esc(n)}</span><b>${sc}</b></div>`).join("")}</div></div>`;
    }
    pSet(phead() + body); bindPlayer();
  },
  pclick(t){
    if (t.dataset.ans === undefined) return;
    const host = findHost(); if (!host) return;
    const s = host.presence.s; if (s.ph !== "q") return;
    P.ans = {q:s.q, c:+t.dataset.ans};
    NR.presence({a:P.ans}).catch(() => {});
    playerRender();
  },
};

/* ================= LETTERS ================= */
const HEX_N = 5;
function hexNeighbors(r, c){
  return (r % 2 ? [[r-1,c],[r-1,c+1],[r,c-1],[r,c+1],[r+1,c],[r+1,c+1]] : [[r-1,c-1],[r-1,c],[r,c-1],[r,c+1],[r+1,c-1],[r+1,c]])
    .filter(([a, b]) => a >= 0 && b >= 0 && a < HEX_N && b < HEX_N);
}
function hexWinner(b){
  for (const t of ["g","o"]){
    const seen = new Set(), q = [];
    for (let i = 0; i < HEX_N; i++){ const idx = t === "g" ? i * HEX_N : i; if (b[idx] === t){ q.push(idx); seen.add(idx); } }
    while (q.length){
      const idx = q.shift(), r = Math.floor(idx / HEX_N), c = idx % HEX_N;
      if (t === "g" ? c === HEX_N - 1 : r === HEX_N - 1) return t;
      for (const [a, d] of hexNeighbors(r, c)){ const n = a * HEX_N + d; if (!seen.has(n) && b[n] === t){ seen.add(n); q.push(n); } }
    }
  }
  return null;
}
function hexBoard(s, clickable, small){
  let html = `<div class="hexwrap"><div class="hexboard ${small ? "small" : ""}" role="grid" aria-label="لوحة الحروف">`;
  for (let r = 0; r < HEX_N; r++){
    html += `<div class="hrow ${r % 2 ? "odd" : ""}">`;
    for (let c = 0; c < HEX_N; c++){
      const i = r * HEX_N + c, own = s.b[i], L = LETTERS[s.L[i]][0];
      const cls = own !== "." ? own : (s.cur === i ? "cur" : "");
      const dis = !clickable || own !== "." || s.w ? "disabled" : "";
      html += `<button class="hex ${cls}" data-cell="${i}" ${dis} aria-label="حرف ${L}">${L}</button>`;
    }
    html += `</div>`;
  }
  return html + `</div></div>`;
}
const Letters = {
  init: () => ({L:shuffle(range(LETTERS.length), Date.now() % 1e9).slice(0, 25), b:".".repeat(25), cur:-1, rd:0, bz:null, w:null, sc:[0,0]}),
  newRound(){ const sc = H.s.sc; H.s = {...Letters.init(), sc, rd:H.s.rd + 1}; H.priv.showAns = false; pushHost(); },
  hostPeers(players){
    const s = H.s; if (s.cur < 0 || s.bz || s.w) return;
    const c = players.filter(p => p.presence.bz && p.presence.bz.rd === s.rd && (p.presence.tm === "g" || p.presence.tm === "o"));
    if (!c.length) return;
    c.sort((a, b) => (+a.presence.bz.t || 0) - (+b.presence.bz.t || 0));
    s.bz = {n:pname(c[0]), tm:c[0].presence.tm}; pushHost();
  },
  host(players){
    const s = H.s, cur = s.cur >= 0 ? LETTERS[s.L[s.cur]] : null;
    let side;
    if (s.w){
      side = `<div class="winner ${s.w}">فاز الفريق ${TEAM[s.w]}!</div><button class="btn" data-h="round">جولة جديدة</button>`;
    } else if (cur){
      side = `<div class="lettercard"><span class="L">${cur[0]}</span><div class="stack" style="gap:6px"><span class="muted">سؤال حرف ${cur[0]}</span><p style="font-size:1.3rem;font-weight:700">${esc(cur[1])}</p>
          ${H.priv.showAns ? `<span class="answer">${esc(cur[2])}</span>` : `<button class="btn ghost sm" data-h="ans">إظهار الإجابة</button>`}</div></div>
        <div class="buzzbar ${s.bz ? s.bz.tm : ""}">${s.bz ? `أول من ضغط الجرس: <b>${esc(s.bz.n)}</b> (الفريق ${TEAM[s.bz.tm]})` : `الجرس مفتوح… بانتظار أول ضغطة`}</div>
        <div class="row"><button class="btn g sm" data-h="win-g">صحيحة للأخضر</button><button class="btn o sm" data-h="win-o">صحيحة للبرتقالي</button></div>
        <div class="row"><button class="btn ghost sm" data-h="rebuzz">فتح الجرس من جديد</button><button class="btn ghost sm" data-h="close">إلغاء الخلية</button></div>`;
    } else {
      side = `<h3>اختر خلية</h3><p class="muted">اضغط أي حرف على اللوحة لعرض سؤاله. يمكنك طرح سؤالك الخاص لنفس الحرف.</p>
        <p class="muted"><b class="tg">الأخضر</b> يصل بين اليمين واليسار، و<b class="to">البرتقالي</b> بين الأعلى والأسفل.</p>`;
    }
    const html = `<div class="layout"><div class="panel">${hexBoard(s, !cur && !s.w, false)}</div>
      <div class="stack"><div class="scores"><div class="score g"><span>جولات الأخضر</span><b>${s.sc[0]}</b></div><div class="score o"><span>جولات البرتقالي</span><b>${s.sc[1]}</b></div></div>
      <div class="panel stack">${side}</div><div class="panel stack"><h3>اللاعبون</h3>${playerChips(players, true)}${soloNote()}</div>
      <div><button class="btn ghost sm" data-h="round">لوحة جديدة</button></div></div></div>`;
    setMain(html);
    $("#hostMain").onclick = e => {
      const cell = e.target.closest("[data-cell]");
      if (cell && !cell.disabled){ s.cur = +cell.dataset.cell; s.rd++; s.bz = null; H.priv.showAns = false; pushHost(); return; }
      const b = e.target.closest("[data-h]"); if (!b) return;
      const a = b.dataset.h;
      if (a === "ans"){ H.priv.showAns = true; renderHost(); }
      else if (a === "win-g" || a === "win-o"){
        const t = a.slice(4), arr = s.b.split(""); arr[s.cur] = t; s.b = arr.join(""); s.cur = -1; s.bz = null;
        s.w = hexWinner(s.b); if (s.w) s.sc[s.w === "g" ? 0 : 1]++;
        pushHost();
      }
      else if (a === "rebuzz"){ s.rd++; s.bz = null; pushHost(); }
      else if (a === "close"){ s.cur = -1; s.bz = null; pushHost(); }
      else if (a === "round") Letters.newRound();
    };
  },
  player(s){
    const cur = s.cur >= 0 ? LETTERS[s.L[s.cur]] : null, buzzed = P.buzzRd === s.rd;
    let status;
    if (s.w) status = `<div class="winner ${s.w}">فاز الفريق ${TEAM[s.w]}!</div>`;
    else if (!cur) status = `<p class="center muted">بانتظار أن يختار المقدّم حرفًا…</p>`;
    else if (s.bz) status = `<div class="buzzbar ${s.bz.tm} center">${s.bz.n === P.name && s.bz.tm === P.team ? "<b>أنت الأسرع! أجب الآن</b>" : `الأسرع: <b>${esc(s.bz.n)}</b> (${TEAM[s.bz.tm]})`}</div>`;
    else status = `<p class="center" style="font-size:1.2rem">حرف <b style="color:var(--gold);font-family:var(--display);font-size:1.6rem">${cur[0]}</b> · اضغط الجرس إذا عرفت الإجابة</p>`;
    const canBuzz = cur && !s.bz && !s.w && !buzzed;
    pSet(phead() + `<div class="panel stack">${hexBoard(s, false, true)}</div>${status}
      <button class="buzz" style="background:var(--${P.team === "g" ? "green" : "orange"})" data-buzz="1" ${canBuzz ? "" : "disabled"}>${buzzed && !s.bz ? "تم!" : "الجرس"}</button>`);
    bindPlayer();
  },
  pclick(t){
    if (!t.dataset.buzz) return;
    const host = findHost(); if (!host) return;
    const s = host.presence.s; if (s.cur < 0 || s.bz) return;
    P.buzzRd = s.rd;
    NR.presence({bz:{rd:s.rd, t:Date.now()}}).catch(() => {});
    playerRender();
  },
};

/* ================= WHEEL ================= */
let wheelImg = null;
async function wheelCanvas(){
  try { await document.fonts.load('40px "Lalezar"'); } catch(e){}
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  const fills = [col("--gold"), col("--green"), col("--orange"), col("--blue")];
  const c = document.createElement("canvas"); c.width = c.height = 640;
  const x = c.getContext("2d"), R = 310, cx = 320, step = Math.PI * 2 / SEGS.length;
  SEGS.forEach((sg, i) => {
    const a0 = -Math.PI / 2 + i * step;
    x.beginPath(); x.moveTo(cx, cx); x.arc(cx, cx, R, a0, a0 + step); x.closePath();
    x.fillStyle = fills[i % 4]; x.fill();
    x.lineWidth = 4; x.strokeStyle = col("--bg"); x.stroke();
    x.save(); x.translate(cx, cx); x.rotate(a0 + step / 2);
    x.fillStyle = col("--on-color"); x.textAlign = "right"; x.textBaseline = "middle";
    x.font = `${sg.t.length > 6 ? 30 : 42}px Lalezar, Tahoma, sans-serif`; x.direction = "rtl";
    x.fillText(sg.t, R - 22, 4); x.restore();
  });
  x.beginPath(); x.arc(cx, cx, R, 0, Math.PI * 2); x.lineWidth = 10; x.strokeStyle = col("--ink"); x.stroke();
  return c;
}
function mountWheel(holder, s, state){
  let box = holder.querySelector(".wheelbox");
  if (!box){
    holder.innerHTML = `<div class="wheelbox"><div class="pointer"></div><div class="hub"></div></div>`;
    box = holder.querySelector(".wheelbox");
    (wheelImg ? Promise.resolve(wheelImg) : wheelCanvas().then(c => wheelImg = c)).then(src => {
      const c = document.createElement("canvas"); c.width = c.height = 640; c.getContext("2d").drawImage(src, 0, 0);
      c.style.transform = `rotate(${s.rot}deg)`; box.appendChild(c); state.sp = s.sp;
    });
    state.sp = s.sp; return;
  }
  const c = box.querySelector("canvas"); if (!c) return;
  if (state.sp !== s.sp){ box.classList.add("spin"); state.sp = s.sp; }
  c.style.transform = `rotate(${s.rot}deg)`;
}
const Wheel = {
  init: () => ({rot:0, sp:0, seg:-1, ch:"", turn:"g", sc:[0,0], show:false}),
  spin(){
    const s = H.s, i = Math.floor(Math.random() * SEGS.length), seg = 360 / SEGS.length;
    const target = (360 - (i * seg + seg / 2) + (Math.random() - .5) * seg * .6) % 360;
    const cur = ((s.rot % 360) + 360) % 360;
    s.rot = s.rot + 360 * 6 + ((target - cur + 360) % 360);
    s.seg = i; s.sp++; s.show = false;
    s.ch = SEGS[i].ch ? CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)] : "";
    pushHost();
    const sp = s.sp;
    setTimeout(() => { if (H && H.g === "wheel" && H.s.sp === sp){ H.s.show = true; pushHost(); } }, 4800);
  },
  act(kind, team){
    const s = H.s, sg = SEGS[s.seg], ti = s.turn === "g" ? 0 : 1;
    if (kind === "pts") s.sc[ti] += sg.p;
    if (kind === "ch") s.sc[team === "g" ? 0 : 1] += 300;
    if (kind === "x2") s.sc[ti] *= 2;
    s.turn = s.turn === "g" ? "o" : "g"; s.show = false; s.seg = -1; s.ch = "";
    pushHost();
  },
  resultHtml(s, host){
    if (!s.show || s.seg < 0) return "";
    const sg = SEGS[s.seg], who = `الفريق ${TEAM[s.turn]}`;
    let txt = sg.p ? `${sg.p} نقطة لـ${who}` : sg.ch ? esc(s.ch) : sg.lose ? `${who} خسر دوره` : `مضاعفة نقاط ${who}`;
    let btns = "";
    if (host){
      if (sg.p) btns = `<button class="btn" data-h="pts">احتساب النقاط</button>`;
      else if (sg.ch) btns = `<div class="row"><button class="btn g sm" data-h="ch-g">نجح الأخضر +300</button><button class="btn o sm" data-h="ch-o">نجح البرتقالي +300</button><button class="btn ghost sm" data-h="skip">لم ينجح أحد</button></div>`;
      else if (sg.x2) btns = `<button class="btn" data-h="x2">ضاعف النقاط</button>`;
      else btns = `<button class="btn" data-h="skip">الدور التالي</button>`;
    }
    return `<div class="result stack"><h3>${esc(sg.t)}</h3><p style="font-size:1.2rem">${txt}</p>${btns}</div>`;
  },
  scoresHtml(s){
    return `<div class="scores"><div class="score g ${s.turn === "g" ? "turn" : ""}"><span>الأخضر</span><b>${s.sc[0]}</b></div><div class="score o ${s.turn === "o" ? "turn" : ""}"><span>البرتقالي</span><b>${s.sc[1]}</b></div></div>`;
  },
  host(players){
    const s = H.s;
    if (!$("#hostMain .wh-holder")){
      $("#hostMain").innerHTML = `<div class="layout"><div class="panel"><div class="wh-holder"></div></div><div class="stack" id="whSide"></div></div>`;
      $("#hostMain").dataset.k = "";
      H.priv.wstate = {};
      $("#hostMain").onclick = e => {
        const b = e.target.closest("[data-h]"); if (!b) return;
        const a = b.dataset.h;
        if (a === "spin") Wheel.spin();
        else if (a === "pts") Wheel.act("pts");
        else if (a === "ch-g") Wheel.act("ch", "g");
        else if (a === "ch-o") Wheel.act("ch", "o");
        else if (a === "x2") Wheel.act("x2");
        else if (a === "skip") Wheel.act("skip");
        else if (a === "reset"){ H.s = Wheel.init(); H.s.rot = s.rot; H.s.sp = s.sp; pushHost(); }
      };
    }
    mountWheel($("#hostMain .wh-holder"), s, H.priv.wstate);
    const spinning = s.seg >= 0 && !s.show;
    const side = `${Wheel.scoresHtml(s)}<div class="panel stack"><p style="font-size:1.2rem">الدور على <b class="t${s.turn}">الفريق ${TEAM[s.turn]}</b></p>
      ${Wheel.resultHtml(s, true) || `<button class="btn" data-h="spin" ${spinning ? "disabled" : ""}>${spinning ? "العجلة تدور…" : "لُفّ العجلة"}</button>`}</div>
      <div class="panel stack"><h3>اللاعبون</h3>${playerChips(players, true)}${soloNote()}</div><div><button class="btn ghost sm" data-h="reset">تصفير النقاط</button></div>`;
    const sideEl = $("#whSide"); if (sideEl.dataset.k !== side){ sideEl.innerHTML = side; sideEl.dataset.k = side; }
  },
  player(s){
    if (!$("#playerMain .wh-holder")){
      $("#playerMain").innerHTML = `${phead()}<div class="panel"><div class="wh-holder"></div></div><div id="whP"></div>`;
      $("#playerMain").dataset.k = ""; P.view.w = {}; bindPlayer();
    }
    mountWheel($("#playerMain .wh-holder"), s, P.view.w);
    const html = `${Wheel.scoresHtml(s)}<p class="center" style="margin-top:10px">الدور على <b class="t${s.turn}">الفريق ${TEAM[s.turn]}</b></p>${Wheel.resultHtml(s, false)}`;
    const el = $("#whP"); if (el.dataset.k !== html){ el.innerHTML = html; el.dataset.k = html; }
  },
};

/* ================= PUZZLE ================= */
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
function mountPuzzle(el, cfg, onChange){
  const n = cfg.n, N = n * n, url = sceneURL(cfg.img);
  let perm = shuffle(range(N), cfg.seed);
  if (perm.every((v, k) => v === k)) [perm[0], perm[1]] = [perm[1], perm[0]];
  let sel = -1, mv = 0, done = false;
  const pos = id => { const r = Math.floor(id / n), c = id % n; return `${n > 1 ? c / (n - 1) * 100 : 0}% ${n > 1 ? r / (n - 1) * 100 : 0}%`; };
  function draw(){
    el.innerHTML = `<div class="pz ${done ? "done" : ""}" style="grid-template-columns:repeat(${n},1fr)">${perm.map((id, k) =>
      `<button class="tile ${sel === k ? "sel" : ""}" data-k="${k}" style="background-image:url(${url});background-size:${n * 100}% ${n * 100}%;background-position:${pos(id)}" aria-label="قطعة ${k + 1}" ${done ? "disabled" : ""}></button>`).join("")}</div>`;
  }
  el.onclick = e => {
    const t = e.target.closest("[data-k]"); if (!t || done) return;
    const k = +t.dataset.k;
    if (sel < 0) sel = k;
    else if (sel === k) sel = -1;
    else { [perm[sel], perm[k]] = [perm[k], perm[sel]]; sel = -1; mv++;
      done = perm.every((v, i) => v === i);
      onChange && onChange({p:Math.round(perm.filter((v, i) => v === i).length / N * 100), d:done, mv}); }
    draw();
  };
  draw();
}
const Puzzle = {
  init: () => ({ph:"lobby", rd:0, img:0, n:3, seed:1, fin:[]}),
  start(){ const s = H.s; s.rd++; s.seed = 1 + Math.floor(Math.random() * 1e9); s.ph = "play"; s.fin = []; H.priv.t0 = Date.now(); H.priv.prog = {}; H.priv.mounted = null; pushHost(); },
  hostPeers(players){
    const s = H.s; if (s.ph !== "play") return;
    let ch = false;
    for (const p of players){
      const z = p.presence.pz; if (!z || z.rd !== s.rd) continue;
      H.priv.prog[p.peer] = {n:pname(p), p:Math.max(0, Math.min(100, +z.p || 0))};
      if (z.d && !s.fin.some(f => f[3] === peerKey(p.peer)) && s.fin.length < 30){
        s.fin.push([pname(p), Math.max(0, +z.mv || 0), Math.round((Date.now() - H.priv.t0) / 1000), peerKey(p.peer)]); ch = true;
      }
    }
    if (ch) pushHost();
  },
  host(players){
    const s = H.s;
    if (s.ph === "lobby"){
      setMain(`<div class="layout"><div class="panel stack"><h3>اختر الصورة</h3>
        <div class="thumbs">${SCENES.map((nm, i) => `<button class="thumb ${s.img === i ? "on" : ""}" data-img="${i}" aria-label="${nm}"><img src="${sceneURL(i)}" alt="${nm}"></button>`).join("")}</div>
        <div class="row"><span>عدد القطع</span><div class="seg">${[3,4,5].map(k => `<button class="${s.n === k ? "on" : ""}" data-n="${k}">${k}×${k}</button>`).join("")}</div></div>
        <div><button class="btn" data-h="go">ابدأ السباق</button></div></div>
        <div class="panel stack"><h3>اللاعبون</h3>${playerChips(players, false)}<p class="muted">كل لاعب يحصل على نفس الصورة بنفس الخلط، ويرتّبها بالضغط على قطعتين لتبديلهما.</p>${soloNote()}</div></div>`);
    } else {
      const prog = Object.values(H.priv.prog || {}).sort((a, b) => b.p - a.p);
      const local = !H.code || !players.length;
      const html = `<div class="layout"><div class="panel stack">${local ? `<div id="hostPz"></div>` : `<h3>سباق الترتيب</h3><div class="race">${prog.length ? prog.map(r => `<div class="r"><span>${esc(r.n)}</span><div class="bar"><i style="width:${r.p}%"></i></div><b>${r.p}%</b></div>`).join("") : `<p class="muted">بانتظار أول حركة…</p>`}</div>`}</div>
        <div class="stack"><div class="panel stack"><div class="row"><img class="ref" src="${sceneURL(s.img)}" alt="الصورة الأصلية"><div><span class="muted">الصورة الأصلية</span><h3>${SCENES[s.img]} · ${s.n}×${s.n}</h3></div></div></div>
        <div class="panel stack"><h3>المنتهون</h3>${s.fin.length ? `<div class="lb">${s.fin.map((f, i) => `<div><span>${i + 1}. ${esc(f[0])}</span><span class="muted">${f[2]} ث · ${f[1]} حركة</span></div>`).join("")}</div>` : `<p class="muted">لم ينهِ أحد بعد.</p>`}</div>
        <div class="row"><button class="btn" data-h="go">جولة جديدة بنفس الإعدادات</button><button class="btn ghost sm" data-h="lobby">تغيير الصورة</button></div></div></div>`;
      if (setMain(html) || H.priv.mounted !== s.rd){
        const el = $("#hostPz"); if (el){ mountPuzzle(el, s, null); H.priv.mounted = s.rd; }
      }
    }
    $("#hostMain").onclick = e => {
      if (e.target.closest("#hostPz")) return;
      const b = e.target.closest("[data-img],[data-n],[data-h]"); if (!b) return;
      if (b.dataset.img !== undefined){ s.img = +b.dataset.img; pushHost(); }
      else if (b.dataset.n){ s.n = +b.dataset.n; pushHost(); }
      else if (b.dataset.h === "go") Puzzle.start();
      else if (b.dataset.h === "lobby"){ s.ph = "lobby"; pushHost(); }
    };
  },
  player(s){
    if (s.ph !== "play"){
      P.view.pzRd = null;
      pSet(phead() + `<div class="panel center stack"><p class="bigmsg">أنت داخل!</p><p class="muted">بانتظار أن يبدأ المقدّم السباق.</p></div>`);
      bindPlayer(); return;
    }
    const me = peerKey(myPeer()), rank = s.fin.findIndex(f => f[3] === me);
    if (P.view.pzRd !== s.rd){
      P.view.pzRd = s.rd;
      pSet(phead() + `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>رتّب الصورة</h3><img class="ref" style="width:80px" src="${sceneURL(s.img)}" alt="الصورة الأصلية"></div><p class="muted">اضغط قطعتين لتبديل مكانيهما.</p><div id="pPz"></div></div><div id="pPzStatus"></div>`);
      bindPlayer();
      NR.presence({pz:{rd:s.rd, p:0, d:false, mv:0}}).catch(() => {});
      mountPuzzle($("#pPz"), s, z => NR.presence({pz:{rd:s.rd, ...z}}).catch(() => {}));
    }
    const st = rank >= 0 ? `<div class="panel center"><p class="bigmsg" style="color:var(--gold)">أنهيت! ترتيبك ${rank + 1}</p><p class="muted">${s.fin[rank][2]} ثانية · ${s.fin[rank][1]} حركة</p></div>`
      : s.fin.length ? `<p class="center muted">أنهى ${s.fin.length} لاعب حتى الآن</p>` : "";
    const el = $("#pPzStatus"); if (el && el.dataset.k !== st){ el.innerHTML = st; el.dataset.k = st; }
  },
};

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
function mountDiff(el, cfg, onChange){
  const g = genDiff(cfg.seed, cfg.nd, cfg.lv), found = new Set();
  let wrong = 0, revealed = false;
  el.innerHTML = `<div class="dfpair">${["A","B"].map(sd => `<div class="dfimg" data-side="${sd}"><img src="${diffURL(cfg.seed, cfg.nd, cfg.lv, sd)}" alt="${sd === "A" ? "الصورة الأولى" : "الصورة الثانية"}" draggable="false"><div class="dfmarks"></div></div>`).join("")}</div>`;
  const marks = [...el.querySelectorAll(".dfmarks")];
  const draw = () => {
    const html = g.diffs.map((d, i) => found.has(i) || revealed ? `<span class="dfm ${found.has(i) ? "" : "rev"}" style="left:${d.x / 6}%;top:${d.y / 6}%;width:${d.r / 3}%"></span>` : "").join("");
    marks.forEach(m => m.innerHTML = html);
  };
  el.onclick = e => {
    const box = e.target.closest(".dfimg");
    if (!box || revealed || found.size === g.diffs.length) return;
    const r = box.getBoundingClientRect(), px = (e.clientX - r.left) / r.width * 600, py = (e.clientY - r.top) / r.height * 600;
    let hit = -1, best = 1e9;
    g.diffs.forEach((d, i) => { const dist = Math.hypot(d.x - px, d.y - py); if (!found.has(i) && dist < d.r && dist < best){ hit = i; best = dist; } });
    if (hit >= 0){ found.add(hit); draw(); }
    else {
      wrong++;
      const m = box.querySelector(".dfmarks"), xm = document.createElement("span");
      xm.className = "dfx"; xm.style.left = px / 6 + "%"; xm.style.top = py / 6 + "%"; xm.textContent = "✕";
      m.appendChild(xm); setTimeout(() => xm.remove(), 700);
    }
    onChange && onChange({f:found.size, d:found.size === g.diffs.length, w:wrong});
  };
  draw();
  return {reveal(){ if (!revealed){ revealed = true; draw(); } }};
}
const Diff = {
  init: () => ({ph:"lobby", rd:0, nd:7, lv:1, seed:1, rev:false, fin:[]}),
  start(){ const s = H.s; s.rd++; s.seed = 1 + Math.floor(Math.random() * 1e9); s.ph = "play"; s.rev = false; s.fin = []; H.priv.t0 = Date.now(); H.priv.prog = {}; pushHost(); },
  hostPeers(players){
    const s = H.s; if (s.ph !== "play") return;
    let ch = false;
    for (const p of players){
      const z = p.presence.df; if (!z || z.rd !== s.rd) continue;
      H.priv.prog[p.peer] = {n:pname(p), f:Math.max(0, Math.min(s.nd, +z.f || 0)), w:Math.max(0, +z.w || 0)};
      if (z.d && !s.fin.some(f => f[3] === peerKey(p.peer)) && s.fin.length < 30){
        s.fin.push([pname(p), Math.max(0, +z.w || 0), Math.round((Date.now() - H.priv.t0) / 1000), peerKey(p.peer)]); ch = true;
      }
    }
    if (ch) pushHost();
  },
  host(players){
    const s = H.s, m = $("#hostMain");
    m.onclick = e => {
      const b = e.target.closest("[data-nd],[data-lv],[data-h]"); if (!b) return;
      if (b.dataset.nd){ s.nd = +b.dataset.nd; pushHost(); }
      else if (b.dataset.lv){ s.lv = +b.dataset.lv; pushHost(); }
      else if (b.dataset.h === "go") Diff.start();
      else if (b.dataset.h === "rev"){ s.rev = true; pushHost(); }
      else if (b.dataset.h === "lobby"){ s.ph = "lobby"; pushHost(); }
    };
    if (s.ph === "lobby"){
      H.priv.dfRd = null;
      setMain(`<div class="layout"><div class="panel stack"><h2 style="font-size:2rem">اكتشف الفرق</h2>
        <p class="muted">كل جولة مشهد جديد مرسوم بتفاصيل كثيرة: شارع المدينة، أو الحديقة، أو الشاطئ، أو غرفة الجلوس. يضغط كل لاعب على مكان كل اختلاف، والأسرع يتصدّر.</p>
        <div class="row"><span>الصعوبة</span><div class="seg">${DF_LEVELS.map((n, k) => `<button class="${s.lv === k ? "on" : ""}" data-lv="${k}">${n}</button>`).join("")}</div></div>
        <div class="row"><span>عدد الفروق</span><div class="seg">${[5,7,10].map(k => `<button class="${s.nd === k ? "on" : ""}" data-nd="${k}">${k}</button>`).join("")}</div></div>
        <p class="muted">${["الاختلافات واضحة: أشياء تختفي أو تكبر أو يتغير لونها كليًا.","مزيج من الواضح والدقيق: نوافذ وأعداد ولمسات صغيرة.","اختلافات دقيقة فقط: درجات لون قريبة، عقارب ساعة، بتلات وردة، نافذة واحدة."][s.lv]}</p>
        <div><button class="btn" data-h="go">ابدأ الجولة</button></div></div>
        <div class="panel stack"><h3>اللاعبون</h3>${playerChips(players, false)}${soloNote()}</div></div>`);
      return;
    }
    if (!m.querySelector(".df-holder") || H.priv.dfRd !== s.rd){
      m.innerHTML = `<div class="layout wide"><div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${DF_THEMES[Math.floor(rng(s.seed)() * 4)]} · ${s.nd} فروق · ${DF_LEVELS[s.lv]}</h3><b id="dfHostCount"></b></div><div class="df-holder"></div></div><div class="stack" id="dfSide"></div></div>`;
      m.dataset.k = ""; H.priv.dfRd = s.rd;
      H.priv.dfm = mountDiff(m.querySelector(".df-holder"), s, st => { const c = $("#dfHostCount"); if (c) c.textContent = `${st.f} / ${s.nd}`; });
    }
    if (s.rev) H.priv.dfm.reveal();
    const prog = Object.values(H.priv.prog || {}).sort((a, b) => b.f - a.f);
    const side = `<div class="panel stack"><h3>السباق</h3>${prog.length ? `<div class="race">${prog.map(r => `<div class="r"><span>${esc(r.n)}</span><div class="bar"><i style="width:${Math.round(r.f / s.nd * 100)}%"></i></div><b>${r.f}/${s.nd}</b></div>`).join("")}</div>` : `<p class="muted">${H.code && players.length ? "بانتظار أول اكتشاف…" : "العب من هذه الشاشة، أو اعرض الكود ليشارك الآخرون من جوالاتهم."}</p>`}</div>
      <div class="panel stack"><h3>المنتهون</h3>${s.fin.length ? `<div class="lb">${s.fin.map((f, i) => `<div><span>${i + 1}. ${esc(f[0])}</span><span class="muted">${f[2]} ث · ${f[1]} خطأ</span></div>`).join("")}</div>` : `<p class="muted">لم ينهِ أحد بعد.</p>`}</div>
      <div class="row">${s.rev ? "" : `<button class="btn ghost sm" data-h="rev">اكشف الفروق</button>`}<button class="btn" data-h="go">جولة جديدة</button><button class="btn ghost sm" data-h="lobby">الإعدادات</button></div>${soloNote()}`;
    const sideEl = $("#dfSide"); if (sideEl.dataset.k !== side){ sideEl.innerHTML = side; sideEl.dataset.k = side; }
  },
  player(s){
    if (s.ph !== "play"){
      P.view.dfRd = null;
      pSet(phead() + `<div class="panel center stack"><p class="bigmsg">أنت داخل!</p><p class="muted">بانتظار أن يبدأ المقدّم الجولة.</p></div>`);
      bindPlayer(); return;
    }
    if (P.view.dfRd !== s.rd){
      P.view.dfRd = s.rd;
      pSet(phead() + `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${DF_THEMES[Math.floor(rng(s.seed)() * 4)]} · ${s.nd} فروق</h3><b id="dfCount" style="font-family:var(--display);font-size:1.5rem;color:var(--gold)">0 / ${s.nd}</b></div><p class="muted">اضغط على مكان الاختلاف في أي من الصورتين.</p><div id="pDf"></div></div><div id="pDfStatus"></div>`);
      bindPlayer();
      NR.presence({df:{rd:s.rd, f:0, d:false, w:0}}).catch(() => {});
      P.view.dfm = mountDiff($("#pDf"), s, st => { const c = $("#dfCount"); if (c) c.textContent = `${st.f} / ${s.nd}`; NR.presence({df:{rd:s.rd, ...st}}).catch(() => {}); });
    }
    if (s.rev && P.view.dfm) P.view.dfm.reveal();
    const me = peerKey(myPeer()), rank = s.fin.findIndex(f => f[3] === me);
    const st = rank >= 0 ? `<div class="panel center"><p class="bigmsg" style="color:var(--gold)">وجدتها كلها! ترتيبك ${rank + 1}</p><p class="muted">${s.fin[rank][2]} ثانية · ${s.fin[rank][1]} خطأ</p></div>`
      : s.rev ? `<p class="center muted">كشف المقدّم الفروق المتبقية</p>` : s.fin.length ? `<p class="center muted">أنهى ${s.fin.length} لاعب حتى الآن</p>` : "";
    const el = $("#pDfStatus"); if (el && el.dataset.k !== st){ el.innerHTML = st; el.dataset.k = st; }
  },
};

const MOD = {quiz:Quiz, letters:Letters, wheel:Wheel, puzzle:Puzzle, diff:Diff};

/* ================= JOIN ================= */
$("#joinForm").addEventListener("submit", e => { e.preventDefault(); playerJoin($("#joinCode").value.trim()); });
$("#joinCode").addEventListener("input", e => { e.target.value = e.target.value.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/\D/g, "").slice(0, 4); });
const hashCode = (location.hash || "").replace("#", "") || new URLSearchParams(location.search).get("code") || "";
if (/^\d{4}$/.test(hashCode)){ $("#joinCode").value = hashCode; playerJoin(hashCode); }
