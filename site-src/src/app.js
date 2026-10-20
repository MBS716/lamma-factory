"use strict";
/* ================= UTILITIES ================= */
const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const clean = s => String(s || "").replace(/[\u0000-\u001f\u007f­​-‏‪-‮⁠-⁩﻿]/g, "").trim().slice(0, 20);
function rng(seed){ let s = (seed >>> 0) || 7; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function shuffle(arr, seed){ const r = rng(seed), a = arr.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const range = n => Array.from({length:n}, (_, i) => i);
const rnd = () => 1 + Math.floor(Math.random() * 1e9);
const TEAM = {g:"الأخضر", o:"البرتقالي"};
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch(e){ return ""; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
const SHAPES = ["◆","●","▲","■"];
const SCENES = ["الصحراء","البحر","المدينة ليلًا","الملعب"];

/* ================= LIVE CONNECTION ================= */
const FIREBASE_CONFIG = /*@@FIREBASE@@*/null;
/* Rooms of this version live apart from the rooms of the current public site, so a phone that opens the other
   version with the same code finds no game instead of a game it cannot read. */
const APP_V = 3, ROOM_PREFIX = "lm3-";
const BASE_URL = /*@@BASE@@*/"";
let ROOM = null, NR = null, H = null, P = null, connState = "checking";
function makeFirebaseRoom(db){
  const me = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return {
    async join(name){
      await Promise.race([authReady, sleep(6000)]);
      const ref = db.ref("rooms/" + name), mine = ref.child(me), ci = db.ref(".info/connected");
      let local = {}, peersArr = Object.freeze([]), handlers = [], conn = false, left = false;
      const write = () => mine.set({j:JSON.stringify(local), t:firebase.database.ServerValue.TIMESTAMP, ...(AUTH_UID ? {u:AUTH_UID} : {})});
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
      const ccb = s => { const was = conn; conn = !!s.val(); if (conn && !left){ mine.onDisconnect().remove(); write(); } if (was !== conn) setTimeout(() => window.dispatchEvent(new Event("lm-conn")), 0); };
      mine.onDisconnect().remove();
      await Promise.race([write(), sleep(25000).then(() => { throw new Error("timeout"); })]);   // slow mobile networks need longer than 10 s
      ref.on("value", cb); ci.on("value", ccb);
      return {
        name,
        presence(patch){ for (const [k, v] of Object.entries(patch)){ if (v === null) delete local[k]; else local[k] = v; } return left ? Promise.resolve() : write(); },
        peers: () => peersArr,
        onPeers(h){ handlers.push(h); setTimeout(() => h({peers:peersArr}), 0); return () => { handlers = handlers.filter(x => x !== h); }; },
        connected: () => conn,
        async leave(){ if (left) return; left = true; ref.off("value", cb); ci.off("value", ccb); handlers = []; try { await mine.onDisconnect().cancel(); } catch(e){} await mine.remove(); },
      };
    },
  };
}
async function getClaude(){ for (let i = 0; i < 40; i++){ if (window.claude && window.claude.use) return window.claude; await sleep(100); } return null; }
/* A device identity without any account: Firebase anonymous sign-in, kept by the browser on this device. The database
   rules only let that identity write the host's saved game, so a host who closes the tab can come back to the same room
   for 3 hours and nobody else can take it over. If anonymous sign-in is not switched on, everything works as before. */
let AUTH_UID = null, authDone = null;
const authReady = new Promise(r => { authDone = r; });
async function fbSignIn(){
  try {
    if (!firebase.auth) return null;
    const a = firebase.auth(); if (a.currentUser) return a.currentUser.uid;
    const r = await Promise.race([a.signInAnonymously(), sleep(8000).then(() => null)]);
    return r && r.user ? r.user.uid : null;
  } catch(e){ return null; }
}
const roomReady = (async () => {
  try {
    if (FIREBASE_CONFIG && window.firebase){ if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG); fbSignIn().then(u => { AUTH_UID = u; authDone(u); }); ROOM = makeFirebaseRoom(firebase.database()); }
    else { const c = await getClaude(); if (c){ try { ROOM = await c.use("room"); } catch(e){ ROOM = null; } } }
  } catch(e){ console.error(e); ROOM = null; }
  if (!AUTH_UID && !(FIREBASE_CONFIG && window.firebase)) authDone(null);
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
const joinLink = code => (BASE_URL || (location.protocol.startsWith("http") ? location.origin + location.pathname : "")) + "#" + code;

/* ================= GAMES REGISTRY ================= */
const LV3 = [[0,"سهل"],[1,"متوسط"],[2,"صعب"]];
const GAMES = {
  letters:{name:"سباق الحروف", group:"team", teams:true, tag:"أكثر من 1000 سؤال · نقاط حسب السرعة",
    desc:"فريقان يتناوبان على أسئلة الحروف، والفائز صاحب أعلى مجموع نقاط.",
    how:"كل فريق يحصل على نفس عدد الأسئلة بالتناوب. الإجابة الصحيحة الأسرع تأخذ نقاطًا أكثر، والخاطئة صفر.",
    opts:[{key:"m", label:"نوع المباراة", def:"q20", choices:() => [["q20","20 سؤالًا"],["q30","30 سؤالًا"],["q40","40 سؤالًا"],["t10","10 دقائق"],["t15","15 دقيقة"],["t20","20 دقيقة"]]},
          {key:"lv", label:"مستوى الأسئلة", def:3, choices:() => [...LV3, [3,"منوّع"]]},
          {key:"t", label:"وقت السؤال", def:30, choices:() => [[20,"20 ث"],[30,"30 ث"],[45,"45 ث"]]}],
    art:`<div class="art-hex"><span style="background:var(--green)">م</span><span style="background:var(--gold)">ل</span><span style="background:var(--orange)">ع</span></div>`},
  wheel:{name:"عجلة التحديات", group:"team", teams:true, tag:"20 كرتًا · صندوق الحظ · تحدي السرعة",
    desc:"لفّ العجلة: أسئلة وتحديات سرعة وصندوق الحظ والكنز والحصانة والرهان وغيرها، حتى هدف 1,500 أو 3,000 أو 5,000.",
    how:"الفريقان يلفّان بالتناوب، والمقدّم يحكم على الإجابات والتحديات. عند بلوغ الهدف تكتمل الجولة ثم تُلعب جولة ختامية، والأعلى نقاطًا يفوز.",
    opts:[{key:"goal", label:"هدف الفوز", def:null, choices:() => [[1500,"1,500"],[3000,"3,000"],[5000,"5,000"]]},
          {key:"mode", label:"وضع اللعب", def:"hype", choices:() => [["classic","كلاسيكي"],["hype","حماسي"],["legend","أسطوري"]]},
          {key:"t", label:"وقت السؤال", def:30, choices:() => [[30,"30 ث"],[45,"45 ث"],[60,"60 ث"]]},
          {key:"lv", label:"مستوى الأسئلة", def:1, choices:() => [...LV3, [3,"منوّع"]]}],
    art:`<div class="art-wheel"></div>`},
  quiz:{name:"تحدي الأسئلة", group:"race", teams:false, tag:"أكثر من 2000 سؤال · 8 تصنيفات · 3 مستويات",
    desc:"أسئلة اختيار من متعدد بمؤقت، ونقاط أعلى للأسرع وللأسئلة الأصعب.",
    how:"تظهر الأسئلة على هذه الشاشة، ويجيب اللاعبون من جوالاتهم بالشكل واللون. السؤال الصعب يمنح نقاطًا أكثر، والسرعة تضاعفها.",
    opts:[{key:"cat", label:"التصنيف", def:"all", choices:() => [["all","الكل"], ...CATS]},
          {key:"lv", label:"المستوى", def:3, choices:() => [...LV3, [3,"متدرّج"]]},
          {key:"n", label:"عدد الأسئلة", def:10, choices:() => [[5,"5"],[10,"10"],[15,"15"],[20,"20"]]},
          {key:"t", label:"وقت كل سؤال", def:20, choices:() => [[10,"10 ث"],[20,"20 ث"],[30,"30 ث"]]}],
    art:`<div class="art-quiz">${SHAPES.map((s, i) => `<span class="c${i}">${s}</span>`).join("")}</div>`},
  diff:{name:"اكتشف الفرق", group:"race", teams:false, tag:"صور حقيقية · 3 مستويات",
    desc:"صورتان متطابقتان تقريبًا، وفروق صغيرة مخفية بين التفاصيل.",
    how:"كل جولة زوج صور: أشياء صغيرة اختفت أو أضيفت أو تغيّرت. يضغط اللاعب على مكان الفرق في أي صورة، ويمكنه التكبير بإصبعين.",
    opts:[{key:"lv", label:"الصعوبة", def:3, choices:() => [...LV3, [3,"الكل"]]},
          {key:"lim", label:"وقت الجولة", def:180, choices:() => [[60,"دقيقة"],[120,"دقيقتان"],[180,"3 دقائق"],[300,"5 دقائق"],[0,"بلا وقت"]]}],
    art:`<div class="art-df art-ph"><img src="spot/thumb_a.webp" alt=""><img src="spot/thumb_b.webp" alt=""></div>`},
  puzzle:{name:"الصورة الملخبطة", group:"race", teams:false, tag:"صور حقيقية · من 3×3 إلى 6×6",
    desc:"سباق لترتيب قطع صورة مبعثرة، والأسرع يتصدّر.",
    how:"كل لاعب يحصل على نفس الصورة بنفس الخلط، ويرتّبها بسحب القطعة إلى مكانها أو بالضغط على قطعتين لتبديلهما.",
    opts:[{key:"src", label:"نوع الصور", def:"photo", choices:() => [["photo","صور حقيقية"],["draw","رسوم"]]},
          {key:"n", label:"الصعوبة", def:4, choices:() => [[3,"سهل 3×3"],[4,"متوسط 4×4"],[5,"صعب 5×5"],[6,"خبير 6×6"]]},
          {key:"lim", label:"وقت الجولة", def:180, choices:() => [[60,"دقيقة"],[120,"دقيقتان"],[180,"3 دقائق"],[300,"5 دقائق"],[0,"بلا وقت"]]}],
    art:`<div class="art-pz">${[4,0,7,2,8,1,6,3,5].map(i => `<span style="background-position:${-(i % 3) * 36}px ${-Math.floor(i / 3) * 36}px"></span>`).join("")}</div>`},
};
function cardsHTML(group){
  return Object.entries(GAMES).filter(([, g]) => g.group === group).map(([k, g]) => `
    <div class="gcard">
      <button class="gart" data-game="${k}" aria-label="ابدأ ${g.name}">${g.art}</button>
      <div class="gbody"><span class="meta">${g.tag}</span><h3>${g.name}</h3><p class="muted">${g.desc}</p>
        <div class="gact"><button class="btn sm" data-game="${k}">ابدأ كمقدّم</button><button class="btn ghost sm helpbtn" data-help="${k}">❔ طريقة اللعب</button></div></div>
    </div>`).join("");
}
$("#teamGrid").innerHTML = cardsHTML("team");
$("#raceGrid").innerHTML = cardsHTML("race");
$("#home").addEventListener("click", e => { const h = e.target.closest("[data-help]"); if (h) return openHelp(h.dataset.help); const b = e.target.closest("[data-game]"); if (b) hostStart(b.dataset.game); });

/* ================= MODAL (how to play, image info) ================= */
function openModal(title, html){
  const d = $("#modal"); $("#modalTitle").textContent = title; $("#modalBody").innerHTML = html; $("#modalBody").scrollTop = 0;
  if (d.showModal){ if (!d.open) d.showModal(); } else d.setAttribute("open", "");
}
function closeModal(){ const d = $("#modal"); if (d.close && d.open) d.close(); else d.removeAttribute("open"); }
$("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal(); });
document.addEventListener("click", e => { const h = e.target.closest("[data-help]"); if (h && !e.target.closest("#home")) openHelp(h.dataset.help); });
const sec = (t, body) => `<section class="hsec"><h4>${t}</h4>${body}</section>`;
const HELP = {
  letters:() => sec("الفكرة", `<p>فريقان (الأخضر والبرتقالي) يتنافسان على أسئلة الحروف. لكل سؤال حرف، والإجابة تبدأ بهذا الحرف. <b>الفائز صاحب أعلى مجموع نقاط</b>، ولا يوجد فوز بالوصول بين أطراف اللوحة.</p>`)
    + sec("الدخول والبدء", `<p>المقدّم يفتح اللعبة على الشاشة الكبيرة فيظهر كود من 4 أرقام. يدخل اللاعبون الكود من جوالاتهم، ويكتب كل لاعب اسمه ويختار فريقه. يختار المقدّم نوع المباراة ومستوى الأسئلة ووقت السؤال ثم يضغط «ابدأ المباراة».</p>`)
    + sec("طريقة اللعب", `<ol><li>الفريقان يتناوبان: سؤال للأخضر ثم سؤال للبرتقالي، فيحصل الفريقان دائمًا على نفس عدد الأسئلة.</li><li>الفريق صاحب الدور يختار حرفًا من اللوحة (أو حرفًا عشوائيًا)، فيظهر السؤال ويبدأ الوقت فورًا.</li><li>يعلن الفريق إجابته بصوت مسموع، فيضغط المقدّم «⏱ تثبيت وقت الإجابة» لحظة سماعها، فيتوقف الوقت. المقدّم وحده يثبّت الوقت ويحكم.</li><li>زر «✋ نريد الإجابة» في جوال الفريق ينبّه المقدّم فقط، ولا يوقف الوقت ولا يؤثر على النقاط.</li><li>يحكم المقدّم: صحيحة أو خاطئة. وقت الحكم لا يُحسب على الفريق.</li><li>الخلية تتلون بلون الفريق إذا أجاب صح، وتصبح رمادية إذا أخطأ أو انتهى الوقت. اللوحة للعرض فقط ولا تؤثر على الفوز.</li></ol>`)
    + sec("النقاط (سؤال مدته 30 ثانية)", `<table class="htable"><tr><th>زمن الإجابة الصحيحة</th><th>النقاط</th></tr><tr><td>5 ثوانٍ أو أقل</td><td>100</td></tr><tr><td>6 إلى 10 ثوانٍ</td><td>90</td></tr><tr><td>11 إلى 15</td><td>75</td></tr><tr><td>16 إلى 20</td><td>60</td></tr><tr><td>21 إلى 25</td><td>45</td></tr><tr><td>26 إلى 30</td><td>30</td></tr><tr><td>إجابة خاطئة أو انتهاء الوقت</td><td>0</td></tr></table><p class="muted">إذا اختار المقدّم 20 أو 45 ثانية تتناسب الفترات مع الوقت المختار. اختيار الحرف وحده لا يعطي نقاطًا.</p>`)
    + sec("نهاية المباراة", `<p><b>بعدد الأسئلة:</b> 20 أو 30 أو 40 سؤالًا تُقسم بالتساوي بين الفريقين.<br><b>بالوقت:</b> 10 أو 15 أو 20 دقيقة، وعند انتهاء الوقت يُكمل الفريق الآخر سؤاله إن لزم حتى تتساوى الفرص.</p><p><b>التعادل:</b> تُلعب جولة فاصلة: سؤال لكل فريق، وتتكرر حتى يتقدم أحدهما.</p><p>تظهر شاشة الفوز بالإحصاءات (النقاط، الصحيحة، الدقة، متوسط الزمن، أسرع إجابة، الفارق) وتبقى حتى يبدأ المقدّم مباراة جديدة.</p>`)
    + sec("مثال", `<p>دور الأخضر، اختاروا «ب»: «عاصمة العراق؟». أعلنوا «بغداد» بعد 7 ثوانٍ فثبّت المقدّم الوقت، ثم حكم بأنها صحيحة: +90 للأخضر. ثم يأتي دور البرتقالي.</p>`),
  quiz:() => sec("الفكرة", `<p>مسابقة اختيار من متعدد: يظهر السؤال على شاشة المقدّم وعلى الجوالات، وكل لاعب يجيب من جواله.</p>`)
    + sec("الدخول والبدء", `<p>المقدّم يختار التصنيف والمستوى وعدد الأسئلة ووقت كل سؤال، ثم يعرض الكود. يدخل اللاعبون الكود ويكتبون أسماءهم، ثم يضغط المقدّم «ابدأ المسابقة».</p>`)
    + sec("طريقة اللعب", `<p>اختر الإجابة من جوالك بالشكل واللون المطابقين. تُكشف الإجابة عند انتهاء الوقت أو عند إجابة الجميع، ثم ينتقل المقدّم للسؤال التالي.</p>`)
    + sec("النقاط", `<p>الإجابة الصحيحة: 500 (سهل) أو 750 (متوسط) أو 1000 (صعب)، وتنقص كلما تأخرت حتى تصل إلى النصف عند نهاية الوقت. الإجابة الخاطئة صفر.</p>`)
    + sec("الفوز", `<p>صاحب أعلى مجموع بعد آخر سؤال يتصدر منصة التتويج.</p>`)
    + sec("ميزات", `<p>أكثر من 2000 سؤال في 8 تصنيفات، ولا يتكرر سؤال داخل المسابقة، وتُقدَّم الأسئلة التي لم تظهر على جهاز المقدّم من قبل.</p>`),
  wheel:() => sec("الفكرة", `<p>فريقان يلفّان العجلة بالتناوب. كل شريحة كرت، وحجمها يساوي احتمال ظهوره. المقدّم وحده يحكم على الإجابات والتحديات، وشاشات اللاعبين تعرض النتيجة فقط.</p>`)
    + sec("البدء", `<p>يختار المقدّم هدف الفوز (1,500 أو 3,000 أو 5,000) ووضع اللعب ووقت السؤال ومستوى الأسئلة، ويمكنه تعطيل الكروت الاختيارية. الفريق البادئ يُختار بالقرعة.</p>`)
    + sec("الكروت", w3bidi(`<ul>${W3.ORDER.map(k => `<li><b>${esc(W3.C[k].f || W3.C[k].n)}:</b> ${W3DESC[k]}</li>`).join("")}</ul>`))
    + sec("صندوق الحظ", w3bidi(`<p>${W3.BOX.map(([r, v, p]) => `${r === "p" ? "+" + v : r === "m" ? "−" + v : r === "imm" ? "حصانة" : r === "respin" ? "لفّة إضافية" : "خسارة الدور"} (${p}٪)`).join("، ")}. تُسحب النتيجة لحظة الفتح ولا يمكن إعادة فتحه.</p>`))
    + sec("العدالة", `<ul><li>النقاط لا تنزل تحت الصفر.</li><li>حصانة واحدة وفرصة ثانية واحدة لكل فريق كحد أقصى، والزائدة تتحول إلى +100.</li><li>الحصانة تمنع أول خصم أو سرقة، ولا تحمي من رهان الفريق نفسه.</li><li>لفّتان إضافيتان كحد أقصى في الدور الواحد، ثم تُقفل كروت اللف الإضافي.</li><li>الكروت النادرة (الذهبي، حظك مرتين، الكنز، تبديل المزايا) تُقفل 4 لفّات بعد ظهورها.</li></ul>`)
    + sec("نهاية المباراة", `<p>بلوغ الهدف لا ينهي المباراة فورًا: تكتمل الجولة حتى يتساوى عدد الأدوار، ثم جولة ختامية بدور أخير لكل فريق (المتأخر أولًا، بلا لفّات إضافية). الأعلى نقاطًا يفوز، وعند التعادل مواجهة فاصلة بتحديات السرعة حتى 5 محاولات، ثم تعادل رسمي.</p>`),
  diff:() => sec("الفكرة", `<p>صورتان متطابقتان تقريبًا، وفي الثانية فروق صغيرة طبيعية: شيء اختفى أو أضيف أو تغيّر. ابحث عنها قبل الآخرين.</p>`)
    + sec("الدخول والبدء", `<p>المقدّم يختار المستوى ووقت الجولة ثم يبدأ، فيحصل كل اللاعبين على نفس الصورتين في الوقت نفسه.</p>`)
    + sec("طريقة اللعب", `<ul><li>اضغط على مكان الفرق في أي من الصورتين، فتظهر دائرة خضراء.</li><li>كبّر بإصبعين أو بأزرار ＋ و－، واسحب بإصبع واحد للتحرك داخل الصورة. التكبير والسحب لا يُحسبان أخطاء.</li><li>الضغطة الخاطئة تظهر ✕ وتُحسب في عدد الأخطاء.</li></ul>`)
    + sec("الترتيب والوقت", `<p>الأسرع في إيجاد كل الفروق يتصدر، وعند التساوي الأقل أخطاءً. عند انتهاء الوقت تُكشف الفروق المتبقية بدوائر برتقالية.</p>`)
    + sec("ميزات", `<p>لا يتكرر زوج صور داخل الغرفة حتى تُلعب كل صور المستوى، وتُقدَّم أولًا الصور التي لم يرها أحد من الحاضرين. زر «معلومات الصورة» يعرض المصوّر والترخيص، ويظهر رابط الصورة الأصلية بعد انتهاء الجولة.</p>`),
  puzzle:() => sec("الفكرة", `<p>سباق لترتيب صورة مقسّمة إلى قطع مبعثرة. كل اللاعبين يحصلون على نفس الصورة بنفس الخلط.</p>`)
    + sec("الدخول والبدء", `<p>المقدّم يختار نوع الصور والصعوبة (من 3×3 إلى 6×6) ووقت الجولة والصورة، ثم يبدأ السباق.</p>`)
    + sec("طريقة اللعب", `<ul><li>اسحب القطعة إلى مكانها الصحيح فتتبادل مع القطعة الموجودة هناك.</li><li>أو اضغط قطعتين متتاليتين لتبديلهما.</li><li>زر «تكبير» يوسّع مساحة اللعب على الجوال.</li></ul>`)
    + sec("الترتيب", `<p>الأسرع في إكمال الصورة يتصدر، ويظهر عدد الحركات لكل لاعب. عند انتهاء الوقت يُرتَّب الباقون حسب نسبة الإنجاز.</p>`),
};
function openHelp(g){ if (GAMES[g] && HELP[g]) openModal(`طريقة اللعب: ${GAMES[g].name}`, HELP[g]()); }
function show(v){ for (const id of ["home","host","player"]) $("#" + id).hidden = id !== v; window.scrollTo(0, 0); }

/* ================= HOST ================= */
async function hostStart(g){
  dropSaved(); { const r = $("#resume"); if (r) r.hidden = true; }
  const o = {}; for (const op of GAMES[g].opts) o[op.key] = op.def;
  if (g === "puzzle" && PHOTOS_OK === false) o.src = "draw";
  H = {g, code:null, s:{...MOD[g].init(), o, ph:"lobby"}, priv:{}};
  for (const id of ["#hostMain","#hostBar"]){ $(id).innerHTML = ""; $(id).dataset.k = ""; }
  show("host"); renderHost();
  await roomReady;
  if (ROOM && H && H.g === g) await claimCode();
  renderHost();
}
const CLOUD_H = 3 * 3600e3;
const FS = {
  db: () => fbdb(),
  async get(path){ const db = FS.db(); if (!db || !AUTH_UID) return undefined; try { const sn = await Promise.race([db.ref(path).once("value"), sleep(6000).then(() => { throw new Error("timeout"); })]); return sn.val(); } catch(e){ return undefined; } },
  async set(path, v){ const db = FS.db(); if (!db || !AUTH_UID) return false; try { await Promise.race([db.ref(path).set(v), sleep(8000).then(() => { throw new Error("timeout"); })]); return true; } catch(e){ return false; } },
  async del(path){ const db = FS.db(); if (!db || !AUTH_UID) return; try { await db.ref(path).remove(); } catch(e){} },
};
const cloudGame = g => !!(MOD[g] && MOD[g].cloudResume);
// a code whose host stepped away (less than 3 hours ago) is kept for that host
async function codeFree(code, prefer){
  if (!cloudGame(H.g)) return true;
  const lk = await FS.get("hosts/" + ROOM_PREFIX + code);
  if (!lk || lk.u === AUTH_UID) return true;
  return Date.now() - (+lk.t || 0) > CLOUD_H;
}
async function claimCode(prefer){
  for (let k = 0; k < 4; k++){
    const code = k === 0 && prefer ? prefer : String(1000 + Math.floor(Math.random() * 9000));
    if (!(await codeFree(code, prefer)) && k < 3) continue;
    let nr;
    try { nr = await ROOM.join(ROOM_PREFIX + code); } catch(e){ console.error(e); if (H) H.failed = true; return; }
    try { await nr.presence({r:"h", v:APP_V, g:H.g, s:H.s}); } catch(e){}
    await sleep(1300);
    const other = () => nr.peers().some(p => !p.sameTab && p.presence && p.presence.r === "h");
    if (other() && k === 0 && prefer) for (let w = 0; w < 8 && other(); w++) await sleep(500);   // our old tab may take a moment to leave
    if (other()){ try { await nr.leave(); } catch(e){} continue; }
    if (!H){ try { await nr.leave(); } catch(e){} return; }
    NR = nr; H.code = code;
    if (cloudGame(H.g)) H.cloud = await FS.set("hosts/" + ROOM_PREFIX + code, {u:AUTH_UID, g:H.g, t:firebase.database.ServerValue.TIMESTAMP});
    NR.onPeers(() => { if (H && MOD[H.g].hostPeers) MOD[H.g].hostPeers(hostPlayers()); renderHost(); });
    return;
  }
}
function pushHost(){
  if (!H) return;
  saveHost();
  if (NR){ let s = H.s; if (JSON.stringify(s).length > 3800 && s.res) s = {...s, res:{}}; NR.presence({r:"h", v:APP_V, g:H.g, s}).catch(() => {}); }
  renderHost();
}
/* ---- the host's game survives a page reload or a dropped connection: the state is kept in this tab
   (sessionStorage) and the same code is claimed again, so players stay in the game and nothing is scored twice */
const HS_KEY = "lm-host";
const HL_KEY = "lm-host3";     // device copy (survives closing the tab), only for games that resume across tabs
function saveHost(){
  if (!H || !H.code) return;
  const pv = MOD[H.g].savePriv ? MOD[H.g].savePriv() : null, x = {g:H.g, code:H.code, s:H.s, pv, at:Date.now()};
  try { sessionStorage.setItem(HS_KEY, JSON.stringify(x)); } catch(e){}
  if (cloudGame(H.g)){ try { localStorage.setItem(HL_KEY, JSON.stringify(x)); } catch(e){} saveCloud(); }
}
// the database copy: written at once when the match moves on (a card, a verdict…), clock ticks at most every 1.5 s
const stateOrder = s => s && typeof s.sp === "number" ? s.sp * 1e6 + (s.step || 0) : -1;
function saveCloud(){
  if (!H || !H.cloud) return;
  const moved = stateOrder(H.s) !== H.priv.cloudOrd;
  if (H.priv.cloudT && !moved) return;
  clearTimeout(H.priv.cloudT);
  H.priv.cloudT = setTimeout(async () => {
    if (!H || !H.cloud) return; H.priv.cloudT = null; H.priv.cloudOrd = stateOrder(H.s); const room = ROOM_PREFIX + H.code, TS = firebase.database.ServerValue.TIMESTAMP;
    await FS.set("games/" + room, {g:H.g, v:APP_V, s:JSON.stringify(H.s), at:TS});
    await FS.set("gpriv/" + room, {pv:JSON.stringify(MOD[H.g].savePriv ? MOD[H.g].savePriv() : {}), at:TS});
    if (!H.priv.lockAt || Date.now() - H.priv.lockAt > 60000){ H.priv.lockAt = Date.now(); FS.set("hosts/" + room, {u:AUTH_UID, g:H.g, t:TS}); }
  }, moved ? 0 : 1500);
}
function savedHost(){
  const ok = x => x && GAMES[x.g] && Date.now() - x.at < CLOUD_H ? x : null;
  try { const x = ok(JSON.parse(sessionStorage.getItem(HS_KEY) || "null")); if (x) return x; } catch(e){}
  try { const x = ok(JSON.parse(localStorage.getItem(HL_KEY) || "null")); if (x && cloudGame(x.g)) return {...x, dev:1}; } catch(e){}
  return null;
}
function dropSaved(){ try { sessionStorage.removeItem(HS_KEY); localStorage.removeItem(HL_KEY); } catch(e){} }
async function dropCloud(code){ if (!code) return; const room = ROOM_PREFIX + code; await FS.del("games/" + room); await FS.del("gpriv/" + room); await FS.del("hosts/" + room); }
async function hostResume(){
  let x = savedHost(); if (!x) return;
  if (cloudGame(x.g)){
    await roomReady; await Promise.race([authReady, sleep(6000)]);
    const room = ROOM_PREFIX + x.code, lk = await FS.get("hosts/" + room);
    if (lk && lk.u === AUTH_UID){
      const gm = await FS.get("games/" + room), gp = await FS.get("gpriv/" + room);
      // the copy that went further in the match wins (never an older one: a box opened just before closing stays opened)
      try { if (gm && gm.g === x.g && gm.v === APP_V){ const cs = JSON.parse(gm.s); if (stateOrder(cs) > stateOrder(x.s)) x = {...x, s:cs, pv:gp && gp.pv ? JSON.parse(gp.pv) : x.pv}; } } catch(e){}
    }
  }
  H = {g:x.g, code:null, s:x.s, priv:{}};
  for (const id of ["#hostMain","#hostBar"]){ $(id).innerHTML = ""; $(id).dataset.k = ""; }
  show("host"); renderHost();
  if (MOD[x.g].restore) await MOD[x.g].restore(x.pv || {}); else if (H.s.ph !== "lobby" && !MOD[x.g].keepState){ H.s.ph = "lobby"; }
  await roomReady;
  if (ROOM && H && H.g === x.g) await claimCode(x.code);
  pushHost();
}
function resumeBanner(){
  const x = savedHost(), el = $("#resume"); if (!el) return;
  if (!x || /^#\d{4}$/.test(location.hash)){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<div><b>لديك لعبة لم تنتهِ</b><span class="muted"> · ${esc(GAMES[x.g].name)} · الكود ${esc(x.code)}</span></div><div class="row"><button class="btn sm" id="resumeGo">متابعة اللعبة</button><button class="btn ghost sm" id="resumeNo">تجاهل</button></div>`;
  $("#resumeGo").onclick = () => { el.hidden = true; hostResume(); };
  $("#resumeNo").onclick = async () => { const c = x.code, g = x.g; dropSaved(); el.hidden = true; if (cloudGame(g)){ await roomReady; await Promise.race([authReady, sleep(6000)]); dropCloud(c); } };
}
async function hostEnd(){
  dropSaved(); if (H && H.cloud) dropCloud(H.code);
  if (H){ clearInterval(H.priv.tick); clearInterval(H.priv.mtick); }
  if (NR){ try { await NR.leave(); } catch(e){} NR = null; }
  H = null; show("home");
}
function renderHost(){
  if (!H) return;
  const g = GAMES[H.g], players = hostPlayers();
  let codeHtml;
  if (H.code) codeHtml = `<div><span class="muted">كود الدخول</span><div class="code">${H.code}</div></div><div class="qr" id="qr"></div><button class="btn ghost sm" id="copyLink">نسخ رابط الدخول</button>`;
  else if (connState === "checking" || (ROOM && !H.failed)) codeHtml = `<span class="muted">جارٍ تجهيز الكود…</span>`;
  else codeHtml = `<span class="muted">وضع الشاشة الواحدة</span>`;
  const lvBadge = H.s.o.lv != null && H.s.ph !== "lobby" ? `<span class="chip lv">${H.s.o.lv === 3 ? (H.g === "wheel" ? "منوّع" : "متدرّج") : LV_NAMES[H.s.o.lv]}</span>` : "";
  const bar = `${lostNote()}<div><span class="muted">${g.group === "team" ? "لعبة فرق" : "سباق من الجوال"}</span><h2>${g.name}</h2></div>
    <div class="codebox">${codeHtml}</div>
    <div class="row">${lvBadge}<span class="chip">${players.length} لاعب</span><button class="btn ghost sm" data-help="${H.g}">❔ طريقة اللعب</button>${H.s.ph !== "lobby" ? `<button class="btn ghost sm" id="setBtn">الإعدادات</button>` : ""}<button class="btn ghost sm" id="endBtn">إنهاء</button></div>`;
  const barEl = $("#hostBar");
  if (barEl.dataset.k !== bar){
    barEl.innerHTML = bar; barEl.dataset.k = bar;
    $("#endBtn").onclick = hostEnd;
    const sb = $("#setBtn"); if (sb) sb.onclick = () => { clearInterval(H.priv.tick); clearInterval(H.priv.mtick); const ns = {...MOD[H.g].init(), o:H.s.o, ph:"lobby"}; if (MOD[H.g].keepScore) ns.sc = H.s.sc; H.s = ns; $("#hostMain").innerHTML = ""; $("#hostMain").dataset.k = ""; pushHost(); };
    const cp = $("#copyLink"); if (cp) cp.onclick = () => copyText(joinLink(H.code), cp);
    const qr = $("#qr"); if (qr && window.QRCode && joinLink("").startsWith("http")){ try { new QRCode(qr, {text:joinLink(H.code), width:96, height:96, colorDark:"#0f1430", colorLight:"#ffffff"}); } catch(e){} }
  }
  const m = $("#hostMain");
  if (!m.dataset.bound){
    m.dataset.bound = "1";
    m.addEventListener("click", e => {
      if (!H) return;
      const op = e.target.closest("[data-opt]");
      if (op && !op.disabled){ const def = GAMES[H.g].opts.find(x => x.key === op.dataset.opt), ch = def.choices().find(c => String(c[0]) === op.dataset.val); if (ch){ H.s.o[def.key] = ch[0]; if (MOD[H.g].onOpt) MOD[H.g].onOpt(def.key); pushHost(); } return; }
      const wb = e.target.closest("button"); if (wb && !wb.disabled && MOD[H.g].hostClick && MOD[H.g].hostClick(wb)) return;
      const b = e.target.closest("[data-h]"); if (b && !b.disabled && MOD[H.g].act) MOD[H.g].act(b.dataset.h, b);
    });
  }
  MOD[H.g].host(players);
}
function lobbyHTML(players, extra, startLabel){
  const def = GAMES[H.g], o = H.s.o;
  const rows = def.opts.map(op => `<div class="optrow"><span class="optlabel">${op.label}</span><div class="seg wrap">${op.choices().map(([v, l]) => {
      const dis = op.key === "src" && v === "photo" && PHOTOS_OK === false;
      return `<button class="${o[op.key] === v ? "on" : ""}" data-opt="${op.key}" data-val="${esc(v)}" ${dis ? "disabled" : ""}>${esc(l)}</button>`; }).join("")}</div></div>`).join("");
  const photoNote = def.opts.some(op => op.key === "src") && PHOTOS_OK === false ? `<p class="note">الصور الحقيقية غير متاحة في هذا العرض، فتُستخدم الرسوم.</p>` : "";
  return `<div class="layout"><div class="panel stack"><h2 class="lob-h">${def.name}</h2><p class="muted">${def.how}</p>
      <div class="optbox">${rows}</div>${photoNote}${extra || ""}
      <div><button class="btn big" data-h="start" ${MOD[H.g].canStart && !MOD[H.g].canStart(o) ? "disabled" : ""}>${startLabel || "ابدأ اللعب"}</button></div></div>
    <div class="panel stack"><h3>اللاعبون</h3>${playerChips(players, def.teams)}${soloNote()}</div></div>`;
}
function copyText(t, btn){
  const done = () => { const o = btn.textContent; btn.textContent = "تم النسخ"; setTimeout(() => btn.textContent = o, 1500); };
  try { navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, btn)); } catch(e){ fallbackCopy(t, btn); }
}
function fallbackCopy(t, btn){ btn.insertAdjacentHTML("afterend", `<input class="field" value="${esc(t)}" readonly style="font-size:.9rem;direction:ltr" onfocus="this.select()">`); btn.remove(); }
function soloNote(){
  if (H.code) return "";
  if (ROOM && H.failed) return `<p class="note">تعذّر الاتصال المباشر. تأكد من الإنترنت ثم أعد فتح اللعبة.</p>`;
  if (!ROOM && connState === "off") return `<p class="note">الاتصال المباشر غير مفعّل هنا، فتُدار اللعبة من هذه الشاشة فقط.</p>`;
  return "";
}
function playerChips(players, teams){
  if (!players.length) return `<p class="muted">لم ينضم أحد بعد. اعرض الكود على الشاشة.</p>`;
  if (!teams) return `<div class="chips">${players.map(p => `<span class="chip">${esc(pname(p))}</span>`).join("")}</div>`;
  const col = t => players.filter(p => p.presence.tm === t).map(p => `<span class="chip ${t}">${esc(pname(p))}</span>`).join("") || `<span class="muted">لا أحد</span>`;
  return `<div class="stack"><div><b class="tg">الفريق الأخضر</b><div class="chips">${col("g")}</div></div><div><b class="to">الفريق البرتقالي</b><div class="chips">${col("o")}</div></div></div>`;
}
function setMain(html){ const m = $("#hostMain"); if (m.dataset.k !== html){ m.innerHTML = html; m.dataset.k = html; return true; } return false; }
function setEl(el, html){ if (el && el.dataset.k !== html){ el.innerHTML = html; el.dataset.k = html; return true; } return false; }

/* ================= PLAYER ================= */
let joining = null, joinTok = null;
function joinStatus(html){ $("#playerMain").innerHTML = `<div class="panel center stack">${html}<div class="row" style="justify-content:center"><button class="btn ghost sm" data-act="leave">رجوع</button></div></div>`; $("#playerMain").dataset.k = ""; bindPlayer(); }
async function playerJoin(code){
  $("#joinErr").textContent = "";
  if (!/^\d{4}$/.test(code)){ $("#joinErr").textContent = "الكود مكوّن من 4 أرقام."; return; }
  if (joining === code) return;                     // a second tap while connecting does nothing
  joining = code; const tok = joinTok = {};
  const btn = $("#joinForm button"); if (btn) btn.disabled = true;
  show("player"); joinStatus(`<div class="spinner"></div><p class="bigmsg">جارٍ الاتصال باللعبة…</p><p class="muted">الكود ${esc(code)}</p>`);
  try {
    await roomReady;
    if (!ROOM){ joinStatus(`<p class="bigmsg">تعذّر تشغيل الاتصال المباشر</p><p class="muted">تأكد من الإنترنت، ثم أعد فتح الصفحة. إن كنت تستخدم متصفحًا داخل تطبيق (مثل واتساب أو إنستغرام) فافتح الرابط في Safari أو Chrome.</p>`); return; }
    if (NR){ try { await NR.leave(); } catch(e){} NR = null; }
    let nr;
    try { nr = await ROOM.join(ROOM_PREFIX + code); }
    catch(e){ console.error(e); if (joinTok !== tok) return; joinStatus(`<p class="bigmsg">تعذّر الاتصال باللعبة</p><p class="muted">الاتصال بطيء أو مقطوع. تأكد من الإنترنت ثم أعد المحاولة.</p><button class="btn" data-act="retry" data-code="${esc(code)}">إعادة المحاولة</button>`); return; }
    if (joinTok !== tok){ try { await nr.leave(); } catch(e){} return; }      // the player pressed «رجوع» while connecting
    NR = nr;
    $("#playerMain").innerHTML = ""; $("#playerMain").dataset.k = "";
    P = {code, name:lsGet("lm-name"), team:null, joined:false, g:null, view:{}, searching:true, t0:Date.now()};
    // a phone that reloads (or loses the page) comes straight back into the same game with the same name and team
    let prev = null; try { prev = JSON.parse(sessionStorage.getItem("lm-in") || "null"); } catch(e){}
    if (prev && prev.code === code && P.name && Date.now() - (prev.at || 0) < 6 * 3600e3){ P.team = prev.team || null; P.joined = true; NR.presence({r:"p", n:P.name, tm:P.team, dv:devId}).catch(() => {}); }
    else { try { sessionStorage.removeItem("lm-in"); } catch(e){} }
    playerRender();
    NR.onPeers(() => playerRender());
    setTimeout(() => { if (P && P.code === code){ P.searching = false; playerRender(); } }, 8000);
  } finally { joining = null; if (btn) btn.disabled = false; }
}
async function playerLeave(){ joinTok = null; try { sessionStorage.removeItem("lm-in"); } catch(e){} if (NR){ try { await NR.leave(); } catch(e){} NR = null; } P = null; show("home"); }
function findHost(){ return NR ? NR.peers().find(p => !p.sameTab && p.presence && p.presence.r === "h" && p.presence.v === APP_V && GAMES[p.presence.g]) : null; }
function pSet(html){ const m = $("#playerMain"); if (m.dataset.k !== html){ m.innerHTML = html; m.dataset.k = html; return true; } return false; }
function playerRender(){
  if (!P) return;
  const host = findHost();
  if (!host){
    pSet(`<div class="panel center stack">${P.searching || P.joined
      ? (P.joined && P.g && cloudGame(P.g) ? `<p class="bigmsg">المقدّم غير متصل مؤقتًا</p><p class="muted">ابقَ في هذه الصفحة. المباراة محفوظة، وتعود كما كانت فور عودة المقدّم (خلال 3 ساعات). الكود ${esc(P.code)}</p>`
        : `<p class="bigmsg">${P.joined ? "بانتظار المقدّم…" : "نبحث عن اللعبة…"}</p><p class="muted">الكود ${esc(P.code)}</p>`)
      : `<p class="bigmsg">لم نجد لعبة بهذا الكود</p><p class="muted">تأكد من الكود المعروض على شاشة المقدّم، وأن الجوال يفتح نفس رابط الموقع الذي يستخدمه المقدّم.</p><button class="btn" data-act="retry" data-code="${esc(P.code)}">إعادة المحاولة</button>`}
      <div class="row" style="justify-content:center"><button class="btn ghost sm" data-act="leave">رجوع</button></div></div>`);
    bindPlayer(); return;
  }
  if (P.g && P.g !== host.presence.g){ P.view = {}; $("#playerMain").dataset.k = ""; }
  P.g = host.presence.g;
  $("#playerMain").classList.toggle("wide", P.g === "diff");     // two pictures side by side need room on tablets and computers
  const game = GAMES[P.g];
  if (!P.joined || (game.teams && !P.team)){
    P.joined = false;
    pSet(`<div class="panel stack">
      <p class="muted">انضممت إلى</p><h2 style="font-size:2rem">${game.name}</h2>
      <label for="pName">اسمك</label>
      <input class="field" id="pName" maxlength="20" value="${esc(P.name)}" placeholder="اكتب اسمك">
      ${game.teams ? `<span>اختر فريقك</span><div class="teampick"><button class="g ${P.team === "g" ? "on" : ""}" data-team="g">الأخضر</button><button class="o ${P.team === "o" ? "on" : ""}" data-team="o">البرتقالي</button></div>` : ""}
      <p class="err" id="pErr"></p>
      <button class="btn" data-act="enter">دخول</button></div>`);
    bindPlayer(); return;
  }
  const s = host.presence.s || {};
  if (s.ph === "lobby"){
    P.view = {};
    pSet(phead() + `<div class="panel center stack"><p class="bigmsg">أنت داخل!</p><p class="muted">بانتظار أن يبدأ المقدّم ${esc(game.name)}.</p></div>`);
    bindPlayer(); return;
  }
  MOD[P.g].player(s, host);
}
function bindPlayer(){
  const m = $("#playerMain");
  m.onclick = e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.act === "leave") return playerLeave();
    if (t.dataset.act === "retry") return playerJoin(t.dataset.code);
    if (t.dataset.team){ P.team = t.dataset.team; P.name = clean($("#pName") ? $("#pName").value : P.name); m.querySelectorAll("[data-team]").forEach(b => b.classList.toggle("on", b.dataset.team === P.team)); return; }
    if (t.dataset.act === "enter"){
      const name = clean($("#pName").value);
      if (!name){ $("#pErr").textContent = "اكتب اسمك أولًا."; return; }
      if (GAMES[P.g].teams && !P.team){ $("#pErr").textContent = "اختر فريقك."; return; }
      P.name = name; lsSet("lm-name", name); P.joined = true;
      try { sessionStorage.setItem("lm-in", JSON.stringify({code:P.code, team:P.team || null, at:Date.now()})); } catch(e){}
      NR.presence({r:"p", n:name, tm:P.team || null, dv:devId}).catch(() => {});
      $("#playerMain").dataset.k = ""; playerRender(); return;
    }
    if (P && P.g && MOD[P.g].pclick) MOD[P.g].pclick(t);
  };
}
const lostNote = () => NR && NR.connected && !NR.connected() ? `<p class="note lost">انقطع الاتصال بالإنترنت… نعيد الاتصال تلقائيًا، ولن تضيع نقاطك.</p>` : "";
function phead(extra){ return lostNote() + `<div class="phead"><span class="who">${esc(P.name)}${P.team ? ` · <span class="t${P.team}">${TEAM[P.team]}</span>` : ""}</span><span class="row">${extra || ""}<button class="btn ghost sm icon" data-help="${P.g}" aria-label="طريقة اللعب">❔</button><button class="btn ghost sm" data-act="leave">خروج</button></span></div>`; }
function raceHTML(prog, total, unit){
  return prog.length ? `<div class="race">${prog.map(r => `<div class="r"><span>${esc(r.n)}</span><div class="bar"><i style="width:${Math.round(r.v / total * 100)}%"></i></div><b>${unit ? `${r.v}/${total}` : `${Math.round(r.v / total * 100)}%`}</b></div>`).join("")}</div>` : `<p class="muted">بانتظار أول حركة…</p>`;
}
function finHTML(fin, unit){ return fin.length ? `<div class="lb">${fin.map((f, i) => `<div><span>${i + 1}. ${esc(f[0])}</span><span class="muted">${f[2]} · ${f[1]} ${unit}</span></div>`).join("")}</div>` : `<p class="muted">لم ينهِ أحد بعد.</p>`; }

/* ================= QUESTION BANKS (loaded only when a game needs them) =================
   data/quiz.json    [category, level 0-2, question, correct, wrong1, wrong2, wrong3]
   data/letters.json [letter, level 0-2, category, question, answer]
   The small built-in sets in data.js (QB, LETTERS) are only a fallback if the files can't be loaded. */
const BANKS = {}, BANK_WAIT = {};
const BANK_V = /*@@BANKV@@*/"";
function fallbackBank(name){
  if (name === "quiz") return QB;
  return LETTERS.flatMap(([L, ...qs]) => qs.map(([q, a], lv) => [L, lv, "gen", q, a]));
}
function loadBank(name){
  if (BANKS[name]) return Promise.resolve(BANKS[name]);
  if (window.EMBED_BANKS && EMBED_BANKS[name]) return Promise.resolve(BANKS[name] = EMBED_BANKS[name]);
  if (!BANK_WAIT[name]) BANK_WAIT[name] = (async () => {
    for (let t = 0; t < 3; t++){
      try { const r = await fetch(`data/${name}.json${BANK_V ? "?v=" + BANK_V : ""}`); if (r.ok){ const j = await r.json(); if (Array.isArray(j) && j.length) return BANKS[name] = j; } } catch(e){}
      await sleep(600 * (t + 1));
    }
    console.warn("bank fallback", name); return BANKS[name] = fallbackBank(name);
  })();
  return BANK_WAIT[name];
}
const bankNow = name => BANKS[name] || null;
const hashStr = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36); };
const seenGet = k => { try { return new Set(JSON.parse(lsGet(k) || "[]")); } catch(e){ return new Set(); } };
function seenAdd(k, ids, max){ const s = [...seenGet(k)]; for (const id of ids) if (!s.includes(id)) s.push(id); while (s.length > max) s.shift(); lsSet(k, JSON.stringify(s)); }
/* one multiple-choice question for the shared state: options in display order, correct slot kept apart */
function makeQ(item, avoid){
  const slots = range(4).filter(i => i !== avoid), ci = slots[Math.floor(Math.random() * slots.length)];
  const wrong = shuffle(item.slice(4, 7), rnd()), o = [];
  for (let i = 0, w = 0; i < 4; i++) o.push(i === ci ? item[3] : wrong[w++]);
  return {d:{c:item[0], l:item[1], q:item[2], o}, ci};
}

/* ================= QUIZ ================= */
const catName = c => (CATS.find(x => x[0] === c) || [, ""])[1];
function pickQuestions(B, o){
  const all = range(B.length).filter(i => o.cat === "all" || B[i][0] === o.cat), seen = seenGet("lm-qseen");
  // never-seen questions first (on this device), then the rest; balanced across categories when "all"
  const byLv = l => { const pool = all.filter(i => B[i][1] === l), fresh = shuffle(pool.filter(i => !seen.has(hashStr(B[i][2]))), rnd()), old = shuffle(pool.filter(i => seen.has(hashStr(B[i][2]))), rnd());
    const list = fresh.concat(old); if (o.cat !== "all") return list;
    const cats = {}; list.forEach(i => (cats[B[i][0]] = cats[B[i][0]] || []).push(i));
    const keys = shuffle(Object.keys(cats), rnd()), out = []; let k = 0;
    while (out.length < list.length){ const c = cats[keys[k++ % keys.length]]; if (c.length) out.push(c.shift()); }
    return out; };
  let out = [];
  if (o.lv === 3){
    const parts = [Math.ceil(o.n / 3), Math.ceil(o.n / 3), o.n - 2 * Math.ceil(o.n / 3)];
    [0,1,2].forEach(l => out.push(...byLv(l).slice(0, parts[l])));
  } else {
    out = byLv(o.lv).slice(0, o.n);
    for (const l of [o.lv - 1, o.lv + 1, o.lv - 2, o.lv + 2]) if (l >= 0 && l <= 2 && out.length < o.n) out.push(...byLv(l).filter(i => !out.includes(i)).slice(0, o.n - out.length));
  }
  return o.lv === 3 ? out : shuffle(out, rnd());
}
const Quiz = {
  init: () => ({i:0, n:10, qd:null, ci:-1, t:20, T:20, cnt:0, top:[], res:{}, dist:null}),
  act(a){
    if (a === "start") Quiz.start();
    else if (a === "reveal") Quiz.reveal();
    else if (a === "next") Quiz.next();
    else if (a === "lg" || a === "lo"){ H.priv.local[a[1]]++; renderHost(); }
  },
  async start(){
    if (H.priv.starting) return; H.priv.starting = true;
    const B = await loadBank("quiz"); H.priv.starting = false;
    if (!H || H.g !== "quiz") return;
    const o = H.s.o;
    H.priv.B = B; H.priv.order = pickQuestions(B, o);
    H.priv.scores = {}; H.priv.local = {g:0, o:0}; H.priv.lastCi = -1;
    H.s = {...Quiz.init(), o, ph:"q", n:H.priv.order.length, T:o.t};
    Quiz.next();
  },
  next(){
    const s = H.s;
    if (s.ph !== "q" && s.ph !== "r") return;
    if (s.ph === "r" && H.priv.revealedK !== s.i) return;
    if (s.i >= s.n){ s.ph = "end"; pushHost(); return; }
    const item = H.priv.B[H.priv.order[s.i]], q = makeQ(item, H.priv.lastCi);
    seenAdd("lm-qseen", [hashStr(item[2])], 4000);
    H.priv.ci = q.ci; H.priv.lastCi = q.ci;
    s.qd = q.d; s.ci = -1; s.i++; s.ph = "q"; s.t = s.T; s.cnt = 0; s.res = {}; s.dist = null;
    H.priv.seen = {}; H.priv.qStart = Date.now();
    clearInterval(H.priv.tick); H.priv.tick = setInterval(Quiz.tick, 250);
    pushHost();
  },
  savePriv(){ const p = H.priv; return {order:p.order, scores:p.scores, local:p.local, ci:p.ci, lastCi:p.lastCi, revealedK:p.revealedK}; },
  async restore(pv){
    if (H.s.ph === "lobby") return;
    const B = await loadBank("quiz"); if (!H) return;
    Object.assign(H.priv, {B, order:pv.order || [], scores:pv.scores || {}, local:pv.local || {g:0, o:0}, ci:pv.ci, lastCi:pv.lastCi, revealedK:pv.revealedK, seen:{}});
    if (H.s.ph === "q"){ H.priv.qStart = Date.now() - (H.s.T - H.s.t) * 1000; H.priv.tick = setInterval(Quiz.tick, 250); }
  },
  tick(){
    if (!H || H.g !== "quiz" || H.s.ph !== "q") return;
    const left = Math.max(0, Math.ceil((H.s.T * 1000 - (Date.now() - H.priv.qStart)) / 1000));
    if (left !== H.s.t){ H.s.t = left; pushHost(); }
    if (left <= 0) Quiz.reveal();
  },
  hostPeers(players){
    if (H.s.ph !== "q") return;
    let ch = false;
    for (const p of players){
      const a = p.presence.a;
      if (a && a.i === H.s.i && Number.isInteger(a.c) && a.c >= 0 && a.c < 4 && !H.priv.seen[p.peer]){ H.priv.seen[p.peer] = {c:a.c, ms:Date.now() - H.priv.qStart, n:pname(p)}; ch = true; }
    }
    if (ch){ H.s.cnt = Object.keys(H.priv.seen).length; if (players.length && H.s.cnt >= players.length) Quiz.reveal(); else pushHost(); }
  },
  reveal(){
    const s = H.s; if (s.ph !== "q") return;          // only once per question
    clearInterval(H.priv.tick);
    const correct = H.priv.ci, dist = [0,0,0,0], base = [500, 750, 1000][s.qd.l];
    for (const p of hostPlayers()){ const sc = H.priv.scores[p.peer] || (H.priv.scores[p.peer] = {n:pname(p), s:0}); sc.n = pname(p); }
    for (const sc of Object.values(H.priv.scores)) sc.g = 0;
    for (const [peer, a] of Object.entries(H.priv.seen)){
      dist[a.c]++;
      const sc = H.priv.scores[peer] || (H.priv.scores[peer] = {n:a.n, s:0});
      if (a.c === correct){ sc.g = Math.round(base * (.5 + .5 * Math.max(0, 1 - a.ms / (s.T * 1000)))); sc.s += sc.g; }
    }
    const all = Object.entries(H.priv.scores).sort((a, b) => b[1].s - a[1].s);
    s.res = {}; all.forEach(([peer, sc], i) => { s.res[peerKey(peer)] = [sc.g, sc.s, i + 1]; });
    s.top = all.slice(0, 8).map(([, sc]) => [sc.n, sc.s]);
    s.dist = dist; s.ci = correct; s.ph = "r"; s.t = 0; H.priv.revealedK = s.i;
    pushHost();
  },
  qhead(s){ const q = s.qd; return `<div class="row qmeta"><span class="muted">السؤال ${s.i} من ${s.n}</span><span class="chip">${catName(q.c)}</span><span class="chip lv l${q.l}">${LV_NAMES[q.l]}</span></div>`; },
  optsHtml(s, mode){
    return `<div class="opts">${range(4).map(i => `<div class="opt c${i} ${mode === "r" ? (i === s.ci ? "right" : "dim") : ""}"><span class="sh">${SHAPES[i]}</span><span>${esc(s.qd.o[i])}</span>${mode === "r" && s.dist ? `<span class="cnt">${s.dist[i]}</span>` : ""}</div>`).join("")}</div>`;
  },
  host(players){
    const s = H.s; let html;
    if (s.ph === "lobby"){
      const B = bankNow("quiz");
      if (!B && !H.priv.bankAsked){ H.priv.bankAsked = true; loadBank("quiz").then(() => { if (H && H.g === "quiz") renderHost(); }); }
      const pool = B ? B.filter(q => s.o.cat === "all" || q[0] === s.o.cat).length : 0;
      html = lobbyHTML(players, `<p class="muted">${B ? `${pool.toLocaleString("ar")} سؤال متاح في هذا الاختيار، ولا يتكرر سؤال داخل المسابقة.` : "جارٍ تجهيز الأسئلة…"} الإجابة الصحيحة تمنح 500 أو 750 أو 1000 نقطة حسب صعوبة السؤال، وتنقص مع التأخر حتى النصف.</p>`, "ابدأ المسابقة");
    } else if (s.ph === "q"){
      html = `<div class="layout"><div class="panel stack">${Quiz.qhead(s)}<p class="big-q">${esc(s.qd.q)}</p>${Quiz.optsHtml(s, "q")}</div>
        <div class="panel stack"><div class="row" style="justify-content:space-between"><span class="timer">${s.t}</span><span class="chip">أجاب ${s.cnt} من ${players.length}</span></div>
        <div class="tbar"><i style="width:${s.t / s.T * 100}%"></i></div>
        <button class="btn" data-h="reveal">إظهار الإجابة الآن</button>${soloNote()}</div></div>`;
    } else if (s.ph === "r"){
      const loc = H.priv.local;
      html = `<div class="layout"><div class="panel stack">${Quiz.qhead(s)}<p class="big-q">${esc(s.qd.q)}</p>${Quiz.optsHtml(s, "r")}</div>
        <div class="panel stack"><h3>الترتيب</h3>${s.top.length ? `<div class="lb">${s.top.map(([n, sc], i) => `<div><span>${i + 1}. ${esc(n)}</span><b>${sc}</b></div>`).join("")}</div>` : `<p class="muted">لا لاعبين على الجوالات.</p>`}
        ${!H.code ? `<div class="scores"><div class="score g"><span>الأخضر</span><b>${loc.g}</b><button class="btn g sm" data-h="lg">+1</button></div><div class="score o"><span>البرتقالي</span><b>${loc.o}</b><button class="btn o sm" data-h="lo">+1</button></div></div>` : ""}
        <button class="btn" data-h="next">${s.i >= s.n ? "النتيجة النهائية" : "السؤال التالي"}</button></div></div>`;
    } else {
      const t = s.top;
      html = `<div class="panel stack endcard" style="margin-top:18px"><h2 class="center endtitle">النتيجة النهائية</h2>
        ${t.length ? `<div class="podium">${t[1] ? `<div class="p2"><strong>${esc(t[1][0])}</strong><span>${t[1][1]}</span></div>` : ""}<div class="p1"><strong>${esc(t[0][0])}</strong><span>${t[0][1]}</span></div>${t[2] ? `<div class="p3"><strong>${esc(t[2][0])}</strong><span>${t[2][1]}</span></div>` : ""}</div>
        <div class="lb">${t.slice(3).map(([n, sc], i) => `<div><span>${i + 4}. ${esc(n)}</span><b>${sc}</b></div>`).join("")}</div>` : `<p class="center muted">الأخضر ${H.priv.local.g} · البرتقالي ${H.priv.local.o}</p>`}
        <div class="row" style="justify-content:center"><button class="btn" data-h="start">مسابقة جديدة بنفس الإعدادات</button></div></div>`;
    }
    setMain(html);
  },
  player(s){
    const me = peerKey(myPeer()), mine = P.ans && P.ans.i === s.i && P.ans.q === (s.qd && s.qd.q) ? P.ans.c : null;
    let body;
    if (s.ph === "q"){
      if (mine !== null) body = `<div class="panel center stack"><p class="bigmsg">تم تسجيل إجابتك</p><div class="opt c${mine}" style="justify-content:center"><span class="sh">${SHAPES[mine]}</span><span>${esc(s.qd.o[mine])}</span></div><p class="muted">بانتظار البقية… ${s.t} ث</p></div>`;
      else body = `<div class="panel stack"><div class="row" style="justify-content:space-between">${Quiz.qhead(s)}<span class="timer" style="font-size:2rem">${s.t}</span></div>
        <p style="font-size:1.3rem;font-weight:700">${esc(s.qd.q)}</p>
        <div class="opts">${range(4).map(i => `<button class="opt c${i}" data-ans="${i}"><span class="sh">${SHAPES[i]}</span><span>${esc(s.qd.o[i])}</span></button>`).join("")}</div></div>`;
    } else if (s.ph === "r"){
      const r = s.res[me], ok = mine === s.ci;
      body = `<div class="panel center stack"><p class="bigmsg" style="color:var(--${ok ? "green" : "bad"})">${mine === null ? "لم تُجب" : ok ? "إجابة صحيحة!" : "إجابة خاطئة"}</p>
        ${r ? `<p style="font-size:1.2rem">+${r[0]} نقطة · المجموع <b>${r[1]}</b></p><p class="muted">ترتيبك ${r[2]}</p>` : ""}
        <p class="muted">الإجابة: ${esc(s.qd.o[s.ci])}</p></div>`;
    } else {
      const r = s.res[me];
      body = `<div class="panel center stack endcard"><p class="bigmsg endtitle">انتهت المسابقة</p>${r ? `<p style="font-size:1.3rem">ترتيبك <b>${r[2]}</b> بمجموع ${r[1]} نقطة</p>` : ""}
        <div class="lb">${s.top.slice(0, 3).map(([n, sc], i) => `<div><span>${i + 1}. ${esc(n)}</span><b>${sc}</b></div>`).join("")}</div></div>`;
    }
    pSet(phead() + body); bindPlayer();
  },
  pclick(t){
    if (t.dataset.ans === undefined) return;
    const host = findHost(); if (!host) return;
    const s = host.presence.s; if (s.ph !== "q" || (P.ans && P.ans.i === s.i && P.ans.q === s.qd.q)) return;
    P.ans = {i:s.i, q:s.qd.q, c:+t.dataset.ans};
    NR.presence({a:{i:s.i, c:P.ans.c}}).catch(() => {});
    playerRender();
  },
};

/* ================= LETTERS: points race =================
   The winner is decided by points only. Teams take turns, one question each, so both always get the same
   number of questions. Points depend on how fast the team answers correctly; the clock runs on the host
   only (one clock for everybody) from the moment the question appears until the host (or a player of the
   team on turn) records the moment of answering. Judging time does not count. The hex board is only a
   picture of the match: each cell shows a letter and takes the colour of the team that answered it. */
const HEX_N = 5;
const ALPHA = "ا ب ت ث ج ح خ د ذ ر ز س ش ص ض ط ظ ع غ ف ق ك ل م ن ه و ي".split(" ");
const LT_STEPS = [[5,100],[10,90],[15,75],[20,60],[25,45],[30,30]];      // seconds (on a 30-second question) -> points
function speedPoints(ms, T){
  if (!(ms >= 0) || ms >= T * 1000) return 0;
  const sec = Math.floor(ms / 1000 * 30 / T);
  for (const [lim, p] of LT_STEPS) if (sec <= lim) return p;
  return 30;
}
const ltZero = () => ({p:0, c:0, w:0, ms:0, best:0});
const ltPlayed = t => t.c + t.w;
const fmtS = ms => (ms / 1000).toLocaleString("ar", {minimumFractionDigits:1, maximumFractionDigits:1});
const other = t => t === "g" ? "o" : "g";
function ltMode(o){ const m = String(o.m || "q20"); return {time:m[0] === "t", v:+m.slice(1) || 20}; }
function hexBoard(s, clickable, small){
  let html = `<div class="hexwrap"><div class="hexboard ${small ? "small" : ""}" aria-label="لوحة الحروف">`;
  for (let r = 0; r < HEX_N; r++){
    html += `<div class="hrow ${r % 2 ? "odd" : ""}">`;
    for (let c = 0; c < HEX_N; c++){
      const i = r * HEX_N + c, own = s.b[i] || ".", L = s.L[i] || "", cls = own !== "." ? own : (s.cur === i ? "cur" : "");
      html += `<button class="hex ${cls}" data-cell="${i}" ${!clickable || own !== "." ? "disabled" : ""} aria-label="حرف ${L}">${L}</button>`;
    }
    html += `</div>`;
  }
  return html + `</div></div>`;
}
const Letters = {
  init: () => ({L:[], b:"", cur:-1, tn:"g", st:"pick", k:0, q:"", a:"", lt:"", ql:1, t:0, T:30, am:-1, by:"", last:null, sc:{g:ltZero(), o:ltZero()}, mt:-1, over:false, tb:0, fin:null}),
  board(){
    const s = H.s, B = H.priv.idx || {};
    // letters that still have unused questions come first
    const avail = ALPHA.filter(L => (B[L] || []).some(i => !H.priv.used.has(i)));
    s.L = shuffle(avail.length >= 25 ? avail : ALPHA, rnd()).slice(0, 25); s.b = ".".repeat(25); s.cur = -1;
  },
  async start(){
    if (H.priv.starting) return; H.priv.starting = true;
    const B = await loadBank("letters"); H.priv.starting = false;
    if (!H || H.g !== "letters") return;
    clearInterval(H.priv.tick); clearInterval(H.priv.mtick);
    H.priv.B = B; H.priv.idx = {}; B.forEach((q, i) => (H.priv.idx[q[0]] = H.priv.idx[q[0]] || []).push(i));
    H.priv.used = new Set(); H.priv.devSeen = seenGet("lm-lseen");
    const o = H.s.o, m = ltMode(o);
    H.s = {...Letters.init(), o, ph:"play", T:o.t, k:rnd() * 64};    // question keys never repeat across matches (stale phone presses are ignored)
    Letters.board();
    if (m.time){ H.priv.m0 = Date.now(); H.s.mt = m.v * 60; H.priv.mtick = setInterval(Letters.matchTick, 500); }
    pushHost();
  },
  savePriv(){ return {used:[...(H.priv.used || [])], ans:H.priv.ans, flash:H.priv.flash || ""}; },
  async restore(pv){
    if (H.s.ph !== "play") return;
    const B = await loadBank("letters"); if (!H) return;
    H.priv.B = B; H.priv.idx = {}; B.forEach((q, i) => (H.priv.idx[q[0]] = H.priv.idx[q[0]] || []).push(i));
    H.priv.used = new Set(pv.used || []); H.priv.ans = pv.ans || ""; H.priv.flash = pv.flash; H.priv.devSeen = seenGet("lm-lseen");
    const m = ltMode(H.s.o);
    if (m.time && H.s.mt > 0){ H.priv.m0 = Date.now() - (m.v * 60 - H.s.mt) * 1000; H.priv.mtick = setInterval(Letters.matchTick, 500); }
    if (H.s.st === "ask"){ H.priv.q0 = Date.now() - (H.s.T - H.s.t) * 1000; H.priv.tick = setInterval(Letters.tick, 200); }
  },
  matchTick(){
    if (!H || H.g !== "letters" || H.s.ph !== "play"){ clearInterval(H && H.priv.mtick); return; }
    const m = ltMode(H.s.o), left = Math.max(0, m.v * 60 - Math.floor((Date.now() - H.priv.m0) / 1000));
    if (left !== H.s.mt){ H.s.mt = left; if (!left){ H.s.over = true; clearInterval(H.priv.mtick); } pushHost(); }
  },
  /* question for a letter: requested level first, then the nearest levels; never one already used in this match;
     questions this device has not asked before come first */
  pickQ(L){
    const s = H.s, B = H.priv.B, list = (H.priv.idx[L] || []).filter(i => !H.priv.used.has(i));
    if (!list.length) return -1;
    let lv = s.o.lv; if (lv === 3) lv = [0, 1, 1, 2][Math.floor(Math.random() * 4)];
    for (const l of [lv, lv + 1, lv - 1, lv + 2, lv - 2]){
      const pool = list.filter(i => B[i][1] === l); if (!pool.length) continue;
      const fresh = pool.filter(i => !H.priv.devSeen.has(hashStr(B[i][3])));
      const from = fresh.length ? fresh : pool; return from[Math.floor(Math.random() * from.length)];
    }
    return -1;
  },
  ask(cell, swap){
    const s = H.s, L = s.L[cell], qi = Letters.pickQ(L);
    if (qi < 0){ if (!swap){ const arr = s.b.split(""); arr[cell] = "x"; s.b = arr.join(""); s.cur = -1; s.st = "pick"; H.priv.flash = `لا توجد أسئلة متبقية لحرف ${L}، اختر حرفًا آخر.`; pushHost(); } return; }
    const q = H.priv.B[qi];
    H.priv.used.add(qi); seenAdd("lm-lseen", [hashStr(q[3])], 3000); H.priv.ans = q[4]; H.priv.flash = "";
    s.cur = cell; s.lt = L; s.q = q[3]; s.ql = q[1]; s.a = ""; s.am = -1; s.by = ""; s.rq = ""; s.k++; s.st = "ask"; s.t = s.T;
    H.priv.q0 = Date.now(); H.priv.showAns = false;
    clearInterval(H.priv.tick); H.priv.tick = setInterval(Letters.tick, 200);
    pushHost();
  },
  tick(){
    if (!H || H.g !== "letters" || H.s.st !== "ask"){ clearInterval(H && H.priv.tick); return; }
    const el = Date.now() - H.priv.q0, left = Math.max(0, Math.ceil((H.s.T * 1000 - el) / 1000));
    if (el >= H.s.T * 1000){ Letters.finishQ(false, true); return; }
    if (left !== H.s.t){ H.s.t = left; pushHost(); } else if (H.priv.liveEl !== Math.floor(el / 1000)){ H.priv.liveEl = Math.floor(el / 1000); renderHost(); }
  },
  /* the team announced its answer: freeze the clock (judging time does not count) */
  stop(by){
    const s = H.s; if (s.st !== "ask") return;
    const ms = Date.now() - H.priv.q0;
    if (ms >= s.T * 1000){ Letters.finishQ(false, true); return; }
    clearInterval(H.priv.tick);
    s.am = ms; s.by = ""; s.st = "judge"; s.t = Math.max(0, Math.ceil((s.T * 1000 - ms) / 1000));
    pushHost();
  },
  /* result of a question: runs once per question (st changes immediately), so repeated taps can't score twice */
  finishQ(ok, timeout){
    const s = H.s; if (s.st !== "judge" && !(timeout && s.st === "ask")) return;
    clearInterval(H.priv.tick);
    const team = s.sc[s.tn], ms = timeout ? -1 : s.am, pts = ok && !timeout ? speedPoints(ms, s.T) : 0;
    if (pts > 0){ team.p += pts; team.c++; team.ms += ms; team.best = team.best ? Math.min(team.best, ms) : ms; }
    else team.w++;
    const arr = s.b.split(""); arr[s.cur] = pts > 0 ? s.tn : "x"; s.b = arr.join("");
    s.last = {tm:s.tn, ok:pts > 0, to:!!timeout, pts, ms}; s.a = H.priv.ans; s.st = "done"; s.t = timeout ? 0 : s.t;
    pushHost();
  },
  next(){
    const s = H.s; if (s.st !== "done") return;
    const g = ltPlayed(s.sc.g), o = ltPlayed(s.sc.o), m = ltMode(s.o), even = g === o;
    let end = false;
    if (even){
      if (s.tb) end = s.sc.g.p !== s.sc.o.p;
      else if (m.time ? s.over : g + o >= m.v){ if (s.sc.g.p !== s.sc.o.p) end = true; else s.tb = 1; }
    }
    if (end){ Letters.end(); return; }
    s.tn = g > o ? "o" : "g";       // the team with fewer questions plays next; green opens every pair
    s.st = "pick"; s.cur = -1; s.q = ""; s.a = ""; s.lt = ""; s.am = -1; s.by = ""; s.rq = ""; s.last = null; s.t = s.T;
    if (!s.b.includes(".")) Letters.board();
    pushHost();
  },
  end(){
    const s = H.s; clearInterval(H.priv.tick); clearInterval(H.priv.mtick);
    const st = t => { const x = s.sc[t], n = ltPlayed(x); return {p:x.p, c:x.c, w:x.w, n, acc:n ? Math.round(x.c / n * 100) : 0, avg:x.c ? Math.round(x.ms / x.c) : 0, best:x.best}; };
    const g = st("g"), o = st("o");
    s.fin = {w:g.p > o.p ? "g" : "o", g, o, d:Math.abs(g.p - o.p), tb:s.tb};
    s.ph = "end"; s.st = "end"; s.cur = -1;
    pushHost();
  },
  act(a, el){
    const s = H.s;
    if (a === "start" || a === "match") Letters.start();
    else if (a === "cell"){ if (s.ph === "play" && s.st === "pick" && s.b[+el.dataset.cell] === ".") Letters.ask(+el.dataset.cell); }
    else if (a === "rand"){ if (s.st !== "pick") return; const free = range(25).filter(i => s.b[i] === "."); if (free.length) Letters.ask(free[Math.floor(Math.random() * free.length)]); }
    else if (a === "stop") Letters.stop();
    else if (a === "ok") Letters.finishQ(true);
    else if (a === "no") Letters.finishQ(false);
    else if (a === "next") Letters.next();
    else if (a === "swap"){ if (s.st === "ask") Letters.ask(s.cur, true); }
    else if (a === "ans"){ H.priv.showAns = !H.priv.showAns; renderHost(); }
  },
  /* a phone may only SIGNAL that its team wants to answer: it never stops the clock and never affects points */
  hostPeers(players){
    const s = H.s; if (s.ph !== "play" || s.st !== "ask" || s.rq) return;
    const p = players.find(p => p.presence.am && p.presence.am.k === s.k && p.presence.tm === s.tn);
    if (p){ s.rq = pname(p); pushHost(); }
  },
  scoreboard(s){
    const card = t => { const x = s.sc[t]; return `<div class="tscore ${t} ${s.ph === "play" && s.tn === t ? "turn" : ""}"><div class="row" style="justify-content:space-between"><span class="tname2">${TEAM[t]}</span>${s.ph === "play" && s.tn === t ? `<span class="turnchip">الدور</span>` : ""}</div>
      <b class="pts">${x.p}</b><div class="tstats"><span title="صحيحة">✓ ${x.c}</span><span title="خاطئة أو انتهى وقتها">✗ ${x.w}</span><span title="متوسط زمن الإجابة الصحيحة">⌀ ${x.c ? fmtS(x.ms / x.c) + " ث" : "—"}</span></div></div>`; };
    return `<div class="scores">${card("g")}${card("o")}</div>`;
  },
  progress(s){
    const m = ltMode(s.o), n = ltPlayed(s.sc.g) + ltPlayed(s.sc.o);
    if (s.tb) return `<span class="chip warn">جولة فاصلة</span>`;
    if (m.time) return s.over ? `<span class="chip warn">انتهى الوقت · تُستكمل الأسئلة لتتساوى الفرص</span>` : `<span class="clock ${s.mt <= 30 ? "warn" : ""}">${fmtT(s.mt)}</span>`;
    return `<span class="chip">السؤال ${Math.min(n + (s.st === "pick" ? 1 : s.st === "done" ? 0 : 1), m.v)} من ${m.v}</span>`;
  },
  stage(s, host){
    const team = `<b class="t${s.tn}">الفريق ${TEAM[s.tn]}</b>`, T = s.T;
    if (s.st === "pick") return `<div class="stage"><p class="stage-h">دور ${team}</p><p class="muted">${host ? "يختار الفريق حرفًا من اللوحة، أو اضغط «حرف عشوائي»." : "يختار الفريق حرفًا، والمقدّم يفتحه."}</p>
      ${host && H.priv.flash ? `<p class="note">${esc(H.priv.flash)}</p>` : ""}${host ? `<div class="row"><button class="btn" data-h="rand">حرف عشوائي</button></div>` : ""}</div>`;
    const head = `<div class="lettercard"><span class="L">${esc(s.lt)}</span><div class="stack" style="gap:6px"><div class="row"><span class="muted">حرف ${esc(s.lt)} · دور ${team}</span><span class="chip lv l${s.ql}">${LV_NAMES[s.ql]}</span></div><p class="qtext">${esc(s.q)}</p></div></div>`;
    if (s.st === "ask"){
      const el = H && host ? Date.now() - H.priv.q0 : (T - s.t) * 1000, now = speedPoints(Math.max(0, el), T);
      return `<div class="stage">${head}<div class="qclock"><span class="timer ${s.t <= 5 ? "warn" : ""}">${s.t}</span><div class="tbar"><i style="width:${s.t / T * 100}%"></i></div>${host ? `<span class="chip">الإجابة الآن = ${now} نقطة</span>` : ""}</div>
        ${s.rq ? `<div class="rqnote">✋ الفريق ${TEAM[s.tn]} يطلب الإجابة${host ? ` (${esc(s.rq)})` : ""}. الوقت لا يتوقف حتى ${host ? "تثبّته عند سماع الإجابة" : "يثبّته المقدّم عند سماع الإجابة"}.</div>` : ""}
        ${host ? `<button class="btn big stopbtn" data-h="stop">⏱ تثبيت وقت الإجابة</button><p class="muted" style="margin-top:-6px">اضغط لحظة سماع الإجابة من الفريق، ثم احكم عليها.</p>
        <div class="row"><button class="btn ghost sm" data-h="ans">${H.priv.showAns ? `الإجابة: ${esc(H.priv.ans)}` : "إظهار الإجابة لي"}</button><button class="btn ghost sm" data-h="swap">تبديل السؤال</button></div>` : ""}</div>`;
    }
    if (s.st === "judge") return `<div class="stage">${head}<div class="judge"><p>وقت الإجابة المثبّت <b>${fmtS(s.am)} ث</b></p><p class="muted">إن كانت صحيحة: <b class="pts-sm">${speedPoints(s.am, T)}</b> نقطة</p></div>
      ${host ? `<p class="answer">الإجابة: ${esc(H.priv.ans)}</p><div class="row"><button class="btn g" data-h="ok">✓ صحيحة</button><button class="btn bad" data-h="no">✗ خاطئة</button></div>` : `<p class="muted center">بانتظار حكم المقدّم…</p>`}</div>`;
    if (s.st === "done"){
      const l = s.last || {}, msg = l.ok ? `إجابة صحيحة! <b>+${l.pts}</b> للفريق ${TEAM[l.tm]}` : l.to ? `انتهى الوقت · 0 نقطة` : `إجابة خاطئة · 0 نقطة`;
      return `<div class="stage">${head}<div class="verdict ${l.ok ? "ok " + l.tm : "no"}"><span>${msg}</span>${l.ok ? `<small>في ${fmtS(l.ms)} ث</small>` : ""}</div><p class="answer">الإجابة: ${esc(s.a)}</p>
        ${host ? `<button class="btn big" data-h="next">التالي ←</button>` : ""}</div>`;
    }
    return "";
  },
  endHTML(s, host){
    const f = s.fin, W = f.w, L = other(W), row = (lab, k, fmt) => `<tr><th>${lab}</th><td class="g">${fmt(f.g[k])}</td><td class="o">${fmt(f.o[k])}</td></tr>`, id = x => x;
    const sec = v => v ? fmtS(v) + " ث" : "—";
    const fastest = [["g", f.g.best], ["o", f.o.best]].filter(x => x[1]).sort((a, b) => a[1] - b[1])[0];
    return `<div class="victory ${W}"><div class="confetti" aria-hidden="true">${range(18).map(i => `<i style="--i:${i}"></i>`).join("")}</div>
      <p class="v-kicker">الفائز${f.tb ? " بعد جولة فاصلة" : ""}</p><h2 class="v-name">الفريق ${TEAM[W]}</h2>
      <p class="v-score"><b>${f[W].p}</b> <span>مقابل</span> <b>${f[L].p}</b></p><p class="muted">بفارق ${f.d} نقطة</p>
      <table class="vtable"><thead><tr><th></th><th class="g">الأخضر</th><th class="o">البرتقالي</th></tr></thead><tbody>
      ${row("النقاط", "p", id)}${row("الإجابات الصحيحة", "c", id)}${row("الأسئلة", "n", id)}${row("الدقة", "acc", v => v + "٪")}${row("متوسط زمن الإجابة الصحيحة", "avg", sec)}${row("أسرع إجابة", "best", sec)}</tbody></table>
      ${fastest ? `<p class="muted">أسرع إجابة في المباراة: ${fmtS(fastest[1])} ث للفريق ${TEAM[fastest[0]]}</p>` : ""}
      ${host ? `<div class="row" style="justify-content:center"><button class="btn big" data-h="match">مباراة جديدة</button></div>` : ""}</div>`;
  },
  host(players){
    const s = H.s;
    if (s.ph === "lobby"){
      if (!bankNow("letters") && !H.priv.bankAsked){ H.priv.bankAsked = true; loadBank("letters").then(() => { if (H && H.g === "letters") renderHost(); }); }
      const B = bankNow("letters");
      setMain(lobbyHTML(players, `<p class="muted">${B ? `${B.length.toLocaleString("ar")} سؤال على ${ALPHA.length} حرفًا. ` : ""}الفوز بالنقاط فقط: كل فريق يحصل على نفس عدد الأسئلة، والإجابة الصحيحة الأسرع تأخذ نقاطًا أكثر (من 100 إلى 30).</p>`, "ابدأ المباراة"));
      return;
    }
    if (s.ph === "end"){ setMain(Letters.endHTML(s, true)); return; }
    setMain(`<div class="layout ltlay st-${s.st}"><div class="stack"><div class="panel lt-board" data-board="1">${hexBoard(s, s.st === "pick", false)}</div></div>
      <div class="stack"><div class="lt-score">${Letters.scoreboard(s)}</div><div class="row lt-prog" style="justify-content:space-between">${Letters.progress(s)}${s.tb ? `<span class="muted">تُلعب أزواج أسئلة حتى يتقدم فريق</span>` : ""}</div>
      <div class="panel stack lt-stage">${Letters.stage(s, true)}</div><details class="panel lt-players"><summary>اللاعبون (${players.length})</summary>${playerChips(players, true)}${soloNote()}</details></div></div>`);
    const bd = $("#hostMain [data-board]"); if (bd) bd.onclick = e => { const c = e.target.closest("[data-cell]"); if (c && !c.disabled){ e.stopPropagation(); Letters.act("cell", c); } };
  },
  player(s){
    if (s.ph === "end" && s.fin){ pSet(phead() + Letters.endHTML(s, false)); bindPlayer(); return; }
    const mine = P.team === s.tn, can = s.st === "ask" && mine && P.amK !== s.k;
    let action = "";
    if (s.st === "ask") action = mine ? `<button class="buzz ${P.team}" data-am="1" ${can && !s.rq ? "" : "disabled"}>${P.amK === s.k || s.rq ? "وصل الطلب" : "✋ نريد الإجابة"}</button><p class="muted center">هذا الزر ينبّه المقدّم فقط. أعلنوا إجابتكم بصوت مسموع، والمقدّم يثبّت الوقت عند سماعها.</p>`
      : `<p class="center muted">دور الفريق ${TEAM[s.tn]} الآن.</p>`;
    pSet(phead(`<span class="chip"><b class="tg">${s.sc.g.p}</b> - <b class="to">${s.sc.o.p}</b></span>`) + `${Letters.scoreboard(s)}<div class="row" style="justify-content:center">${Letters.progress(s)}</div>
      <div class="panel stack">${Letters.stage(s, false)}${action}</div><div class="panel">${hexBoard(s, false, true)}</div>`);
    bindPlayer();
  },
  pclick(t){
    if (!t.dataset.am) return;
    const host = findHost(); if (!host) return;
    const s = host.presence.s; if (s.st !== "ask" || s.tn !== P.team || P.amK === s.k) return;
    P.amK = s.k; NR.presence({am:{k:s.k}}).catch(() => {}); playerRender();
  },
};

/* ================= WHEEL OF FORTUNE v3 (rules in wheel3.js) ================= */
// card icons: 24×24 line drawings, used on the wheel (canvas Path2D) and in the cards (inline SVG)
const WIC = {
  plus:"M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 7.5v9M7.5 12h9",
  minus:"M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM7.5 12h9",
  q:"M9 9.2a3 3 0 1 1 4.3 2.7c-.8.4-1.3 1.1-1.3 2v.6M12 18v.2",
  speed:"M13.5 2 5 13.5h6.5L10 22l9-12h-6.5z",
  gold:"M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.6L12 17.2l-5.9 3.2 1.3-6.6-4.9-4.5 6.6-.8z",
  bet:"M5 3.5h14a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5zM8.5 8.5h.01M15.5 15.5h.01M12 12h.01M15.5 8.5h.01M8.5 15.5h.01",
  streak:"M12 22c4.2 0 7-2.8 7-6.8 0-4.4-3.4-6.6-4.6-10.2-.9 2-2.1 3.1-3.6 3.6.2-2.2-.6-4.3-2.3-6.1.2 4-5.5 6.8-5.5 12.5C3 19.1 6.6 22 12 22z",
  quick:"M12 22a8 8 0 1 0 0-16a8 8 0 1 0 0 16zM12 10v4.5l2.5 2M9.5 2.5h5M12 2.5V6",
  steal:"M3 12h11M10 7.5l4.5 4.5-4.5 4.5M20.5 4v16",
  imm:"M12 2.5l8 3v6c0 5-3.4 8.8-8 10.5-4.6-1.7-8-5.5-8-10.5v-6z",
  sec:"M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4.5h4.5M10.5 9.5h3l-3 5h3",
  box:"M3 8.5h18v4H3zM4.5 12.5h15V21h-15zM12 8.5V21M12 8.5c-1.5-3.5-5.5-4-5.5-1.5s5.5 1.5 5.5 1.5zm0 0c1.5-3.5 5.5-4 5.5-1.5S12 8.5 12 8.5z",
  respin:"M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18.5 3v4h-4M5.5 21v-4h4",
  l2:"M3 8h10v12H3zM11 4h10v12h-2",
  tre:"M6.5 3.5h11l4 5.5L12 21 2.5 9zM2.5 9h19M12 21 8.5 9l3.5-5.5L15.5 9z",
  swap:"M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7",
  lock:"M6 11h12v10H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
};
const W3ICON = {p50:"plus", p150:"plus", p250:"plus", m50:"minus", m150:"minus", m250:"minus"};
const wicon = k => WIC[W3ICON[k] || k] || WIC.q;
const wsvg = (k, cls) => `<svg class="wic ${cls || ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${wicon(k)}"/></svg>`;
const W3SHORT = {q:"سؤال", speed:"سرعة", gold:"ذهبي", bet:"رهان", streak:"سلسلة", quick:"سريعة", steal:"سرقة", imm:"حصانة", sec:"فرصة", box:"صندوق", respin:"تدوير", l2:"مرتين", tre:"كنز", swap:"تبديل"};
const W3COL = k => k[0] === "p" ? "--green" : k[0] === "m" ? "--bad" : ["q","gold","bet","streak","quick"].includes(k) ? "--blue" : k === "speed" || k === "steal" ? "--purple" : "--gold";
const W3DESC = {
  q:"سؤال للفريق صاحب الدور: الصحيحة +200.", speed:"سؤال مشترك للفريقين، والمقدّم يحدد الفائز: +250.",
  p50:"+50 تُضاف فورًا.", p150:"+150 تُضاف فورًا.", p250:"+250 تُضاف فورًا.", m50:"−50 تُخصم فورًا (الحصانة تمنعها).", m150:"−150 تُخصم فورًا (الحصانة تمنعها).", m250:"−250 تُخصم فورًا (الحصانة تمنعها).",
  gold:"سؤال صعب: الصحيحة +400.", bet:"راهِن بـ 100 أو 200 أو 300: الصحيحة تضيف الرهان والخاطئة تخصمه.", streak:"حتى 3 أسئلة: +150 ثم +200 ثم +250، وتنتهي عند أول خطأ.",
  quick:"3 أسئلة، 15 ثانية لكل سؤال: +100 لكل صحيحة.", steal:"تسرق 150 نقطة من المنافس (الحصانة تمنعها).", imm:"تحمي من أول خصم قادم (واحدة لكل فريق).",
  sec:"محاولة ثانية عند أول إجابة خاطئة (واحدة لكل فريق).", box:"صندوق مغلق يفتحه المقدّم: مكافأة أو عقوبة أو مفاجأة.", respin:"لفّة إضافية لنفس الفريق.",
  l2:"لفّتان، ويختار الفريق نتيجة واحدة منهما.", tre:"ثلاثة صناديق فيها 100 و300 و500: اختر واحدًا.", swap:"يتبادل الفريقان الحصانة والفرصة الثانية.",
};
const W3LOG = {p50:"بطاقة نقاط", p150:"بطاقة نقاط", p250:"بطاقة نقاط", m50:"خصم", m150:"خصم", m250:"خصم", q:"سؤال", gold:"السؤال الذهبي", bet:"الرهان", streak:"سلسلة الانتصارات",
  quick:"الجولة السريعة", speed:"تحدي السرعة", steal:"سرقة", stolen:"سُرقت منه", box:"صندوق الحظ", box400:"جائزة نادرة", tre:"الكنز", tre500:"الكنز الأكبر",
  imm:"حصل على حصانة", imm2:"حصانة ثانية ← +100", sec:"حصل على فرصة ثانية", sec2:"فرصة ثانية إضافية ← +100", "sec-used":"استخدم الفرصة الثانية", shield:"الحصانة منعت الخصم", swap:"تبادل المزايا", tb:"فاز بالمواجهة الفاصلة"};
// signed numbers (+150, −50) keep their sign on the left inside Arabic text: isolate them, only in text, never inside tags
const w3bidi = html => html.replace(/>([^<]+)</g, (m, t) => ">" + t.replace(/([+\u2212])(\d[\d,٬]*)/g, '<bdi dir="ltr">$1$2</bdi>') + "<");
const w3rand = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch(e){ return Math.random(); } };
function w3sound(){ return H ? lsGet("lm-w-snd") !== "0" : lsGet("lm-w-snd") === "1"; }
let w3ac = null;
function w3beep(kind){
  if (!w3sound()) return;
  try {
    w3ac = w3ac || new (window.AudioContext || window.webkitAudioContext)();
    const notes = {spin:[[330,.05],[392,.05]], good:[[523,.09],[659,.12]], bad:[[220,.14],[165,.2]], rare:[[523,.08],[659,.08],[784,.08],[1047,.22]], shield:[[880,.06],[1175,.16]], tick:[[880,.03]]}[kind] || [];
    let t = w3ac.currentTime;
    for (const [f, d] of notes){ const o = w3ac.createOscillator(), g = w3ac.createGain(); o.type = "triangle"; o.frequency.value = f; g.gain.setValueAtTime(.12, t); g.gain.exponentialRampToValueAtTime(.001, t + d); o.connect(g); g.connect(w3ac.destination); o.start(t); o.stop(t + d); t += d * .9; }
  } catch(e){}
}
const w3motion = () => { const v = lsGet("lm-w-mot"); return v === "1" ? true : v === "0" ? false : !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches); };
function w3applyMotion(){ document.documentElement.classList.toggle("lowmo", !w3motion()); }
w3applyMotion();

function w3wheelCanvas(s, locks){
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  const c = document.createElement("canvas"); c.width = c.height = 640;
  const x = c.getContext("2d"), R = 306, cx = 320, rad = d => (d - 90) * Math.PI / 180;
  for (const sl of W3.layout(s)){
    const a0 = rad(sl.a0), a1 = rad(sl.a1), mid = (a0 + a1) / 2, deg = sl.a1 - sl.a0, lk = locks[sl.k];
    x.beginPath(); x.moveTo(cx, cx); x.arc(cx, cx, R, a0, a1); x.closePath();
    const base = col(W3COL(sl.k)), g = x.createRadialGradient(cx, cx, 40, cx, cx, R);
    g.addColorStop(0, `color-mix(in srgb, ${base} 70%, #000)`); g.addColorStop(1, base);
    x.fillStyle = base; try { x.fillStyle = g; } catch(e){}
    x.fill(); x.lineWidth = 3; x.strokeStyle = col("--bg"); x.stroke();
    if (W3.C[sl.k].rare){ x.save(); x.clip(); x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 2; x.setLineDash([3, 6]); x.beginPath(); x.arc(cx, cx, R - 14, a0, a1); x.stroke(); x.restore(); }
    // icon near the rim, label along the radius
    const ir = R - 42, sz = Math.max(18, Math.min(42, deg * 2.6)), ixp = cx + Math.cos(mid) * ir, iyp = cx + Math.sin(mid) * ir;
    x.save(); x.translate(ixp, iyp); x.rotate(mid + Math.PI / 2); x.scale(sz / 24, sz / 24); x.translate(-12, -12);
    x.strokeStyle = col("--on-color"); x.lineWidth = 2.2; x.lineCap = x.lineJoin = "round"; x.stroke(new Path2D(wicon(sl.k))); x.restore();
    if (deg >= 9){
      const flip = Math.cos(mid) < 0, fs = Math.max(16, Math.min(30, deg * 1.5)), txt = sl.k[0] === "p" ? "+" + sl.k.slice(1) : sl.k[0] === "m" ? "−" + sl.k.slice(1) : W3SHORT[sl.k];
      x.save(); x.translate(cx, cx); x.rotate(flip ? mid + Math.PI : mid); x.fillStyle = col("--on-color"); x.textBaseline = "middle";
      x.font = `${fs}px Lalezar, Tahoma, sans-serif`; x.direction = sl.k[0] === "p" || sl.k[0] === "m" ? "ltr" : "rtl"; x.textAlign = flip ? "left" : "right";
      x.fillText(txt, flip ? -(R - 72) : R - 72, 2); x.restore();
    }
    if (lk){
      x.save(); x.beginPath(); x.moveTo(cx, cx); x.arc(cx, cx, R, a0, a1); x.closePath(); x.fillStyle = "rgba(10,14,36,.62)"; x.fill();
      x.translate(cx + Math.cos(mid) * (R - 110), cx + Math.sin(mid) * (R - 110)); x.rotate(mid + Math.PI / 2); x.scale(.9, .9); x.translate(-12, -12);
      x.strokeStyle = "#fff"; x.lineWidth = 2.4; x.lineCap = x.lineJoin = "round"; x.stroke(new Path2D(WIC.lock)); x.restore();
    }
  }
  x.beginPath(); x.arc(cx, cx, R + 4, 0, Math.PI * 2); x.lineWidth = 12; x.strokeStyle = col("--gold"); x.stroke();
  return c;
}
function w3mount(holder, s, st){
  let box = holder.querySelector(".wheelbox");
  if (!box){
    holder.innerHTML = `<div class="wheelbox w3"><div class="bulbs">${range(24).map(i => `<i style="--i:${i}"></i>`).join("")}</div><div class="wclip"></div><div class="pointer"></div><div class="hub"><span>ل</span></div></div>`;
    box = holder.querySelector(".wheelbox"); st.key = null; st.sp = s.sp;
  }
  const L = s.stage === "rolling" ? (st.locks || {}) : W3.locks(s, s.cur && s.cur.k === "l2" && (s.cur.st === "a" || s.cur.st === "b")), key = s.o.mode + "|" + (s.o.off || []).join() + "|" + JSON.stringify(L);
  st.locks = L;
  let c = box.querySelector("canvas");
  const draw = () => { const n = w3wheelCanvas(s, L); n.style.transform = `rotate(${s.rot}deg)`; if (c) c.replaceWith(n); else box.querySelector(".wclip").appendChild(n); c = n; st.key = key; };
  if (st.key !== key && s.stage !== "rolling") (document.fonts && document.fonts.load ? document.fonts.load('30px "Lalezar"').catch(() => {}) : Promise.resolve()).then(() => { if (box.isConnected && st.key !== key) draw(); });
  if (!c){ draw(); }
  if (st.sp !== s.sp){ box.classList.remove("spin"); void box.offsetWidth; box.classList.add("spin"); st.sp = s.sp; w3beep("spin"); }
  box.classList.toggle("rolling", s.stage === "rolling");
  c.style.transform = `rotate(${s.rot}deg)`;
}
const w3team = t => `<b class="t${W3.T[t]}">الفريق ${TEAM[W3.T[t]]}</b>`;
function w3scores(s){
  const g = s.o.goal || 1, card = t => {
    const tm = W3.T[t], pct = Math.min(100, s.sc[t] / g * 100), turn = (s.ph === "play" || s.ph === "final") && s.turn === t;
    return `<div class="w3score ${tm} ${turn ? "turn" : ""} ${s.im[t] ? "shielded" : ""}"><div class="row" style="justify-content:space-between;gap:6px"><span class="tname2">${TEAM[tm]}</span>
      <span class="perks">${s.im[t] ? `<span class="perk" title="حصانة">${wsvg("imm")}</span>` : ""}${s.s2[t] ? `<span class="perk" title="فرصة ثانية">${wsvg("sec")}</span>` : ""}${turn ? `<span class="turnchip">الدور</span>` : ""}</span></div>
      <b class="pts">${s.sc[t].toLocaleString("en")}</b><div class="gbar" role="progressbar" aria-valuemin="0" aria-valuemax="${g}" aria-valuenow="${s.sc[t]}"><i style="width:${pct}%"></i></div></div>`;
  };
  const phase = s.ph === "final" ? `<span class="chip warn">الجولة الختامية · ${s.fin.i + 1} من 2</span>` : s.ph === "tb" ? `<span class="chip warn">المواجهة الفاصلة · ${s.tb.n + 1} من ${W3.TB_MAX}</span>`
    : s.ph === "play" ? `<span class="chip">الجولة ${s.rd + 1}</span>${s.fnow ? `<span class="chip warn">الختامية بعد هذه الجولة</span>` : ""}` : "";
  return `<div class="scores">${card(0)}${card(1)}</div><div class="row w3meta"><span class="muted">الهدف ${(s.o.goal || 0).toLocaleString("en")}</span>${phase}<span class="muted">${W3.MODES[s.o.mode].n}</span></div>`;
}
function w3log(s){
  if (!s.lg.length) return "";
  return w3bidi(`<div class="panel w3log"><h3>آخر النتائج</h3><ul>${s.lg.map(([t, d, k]) => `<li><span class="dot ${W3.T[t]}"></span><span>${TEAM[W3.T[t]]}</span><span class="muted">${esc(W3LOG[k] || k)}</span><b class="${d > 0 ? "up" : d < 0 ? "down" : ""}">${d > 0 ? "+" + d : d < 0 ? "−" + (-d) : "•"}</b></li>`).join("")}</ul></div>`);
}
function w3qhtml(c, host, s){
  const q = c.q || {}, rv = c.ci != null ? c.ci : -1, mine = host && H.priv.wshow && rv < 0 ? H.priv.wp.ci : -1;
  const timer = s.dl || s.to ? `<div class="qclock"><span class="timer ${s.left <= 5 ? "warn" : ""}">${s.to ? "0" : s.left}</span><div class="tbar"><i style="width:${s.tt ? (s.left / s.tt * 100) : 0}%"></i></div>${s.to ? `<span class="chip warn">انتهى الوقت</span>` : ""}</div>` : "";
  return `<p class="qtext">${esc(q.q || "")}</p><div class="opts mini">${(q.o || []).map((o, i) => `<div class="opt c${i} ${rv >= 0 ? (i === rv ? "right" : "dim") : i === mine ? "hint" : ""}"><span class="sh">${SHAPES[i]}</span><span>${esc(o)}</span></div>`).join("")}</div>${timer}`;
}
const w3btn = (s, a, label, cls, arg) => `<button class="btn ${cls || ""}" data-w="${a}" data-tk="${W3.tok(s)}" ${arg != null ? `data-arg="${esc(String(arg))}"` : ""}>${label}</button>`;
function w3card(s, host){
  const c = s.cur, t = s.turn, who = w3team(t), mv = host ? W3.moves(s) : [], has = a => mv.includes(a);
  const next = has("next") ? w3btn(s, "next", s.ph === "final" && s.fin && s.fin.i === 1 ? "إعلان النتيجة" : "الدور التالي ←", "big") : "";
  if (s.stage === "spin") return `<div class="w3card idle"><p class="stage-h">الدور على ${who}</p>${s.ph === "final" ? `<p class="muted">الجولة الختامية: دور أخير لكل فريق.</p>` : ""}
    ${host ? `<div class="row">${w3btn(s, "spin", "لُفّ العجلة", "big spinbtn")}${has("final") ? w3btn(s, "final", "ابدأ الجولة الختامية بعد هذه الجولة", "ghost sm") : ""}</div>` : `<p class="muted">بانتظار لفّ العجلة…</p>`}</div>`;
  if (s.stage === "rolling") return `<div class="w3card idle"><p class="stage-h">العجلة تدور…</p><p class="muted">${s.sub ? `حظك مرتين: اللفّة ${s.sub === "a" ? "الأولى" : "الثانية"}` : `دور ${who}`}</p></div>`;
  if (!c) return "";
  const k = c.k, name = W3.C[k].f || W3.C[k].n, head = `<div class="w3head ${W3COL(k).slice(2)}">${wsvg(k)}<div><b>${esc(name)}</b><span class="muted">${s.ph === "tb" ? "المواجهة الفاصلة" : c.k === "speed" ? "للفريقين" : `دور الفريق ${TEAM[W3.T[t]]}`}</span></div></div>`;
  let body = "", btns = "", fx = "";
  if (k[0] === "p" || k[0] === "m"){
    if (k[0] === "p"){ body = `<p class="bigdelta up">+${c.v}</p><p class="center">أضيفت إلى ${who}</p>`; fx = "good"; }
    else if (c.blocked){ body = `<div class="shieldfx">${wsvg("imm")}</div><p class="center">الحصانة منعت خصم ${c.v} عن ${who}</p>`; fx = "shield"; }
    else { body = `<p class="bigdelta down">${c.d ? "−" + (-c.d) : "0"}</p><p class="center">${c.d ? `خُصمت من ${who}` : `لا نقاط لدى ${who} لتُخصم`}</p>`; fx = "bad"; }
  }
  else if (k === "imm" || k === "sec"){
    const nm = k === "imm" ? "حصانة" : "فرصة ثانية";
    body = c.conv ? `<p class="bigdelta up">+100</p><p class="center">لدى ${who} ${nm} بالفعل (الحد واحدة)، فتحوّلت إلى 100 نقطة.</p>` : `<div class="${k === "imm" ? "shieldfx" : "secfx"}">${wsvg(k)}</div><p class="center">حصل ${who} على ${nm}. ${k === "imm" ? "تحميه من أول خصم قادم." : "تُستخدم تلقائيًا عند أول إجابة خاطئة."}</p>`; fx = k === "imm" ? "shield" : "good";
  }
  else if (k === "swap") body = c.none ? `<p class="center">لا توجد حصانة أو فرصة ثانية لدى أي فريق، فلا شيء يتبدّل.</p>` : `<p class="center">تبادل الفريقان المزايا. الآن: الأخضر ${s.im[0] ? "🛡" : ""}${s.s2[0] ? " ٢" : ""}${!s.im[0] && !s.s2[0] ? "بلا مزايا" : ""} · البرتقالي ${s.im[1] ? "🛡" : ""}${s.s2[1] ? " ٢" : ""}${!s.im[1] && !s.s2[1] ? "بلا مزايا" : ""}</p>`;
  else if (k === "steal") body = c.blocked ? `<div class="shieldfx">${wsvg("imm")}</div><p class="center">حصانة الفريق ${TEAM[W3.T[1 - t]]} منعت السرقة واستُهلكت.</p>` : c.v ? `<p class="bigdelta up">+${c.v}</p><p class="center">سرق ${who} ${c.v} نقطة من الفريق ${TEAM[W3.T[1 - t]]}.</p>` : `<p class="center">لا نقاط لدى المنافس لسرقتها.</p>`;
  else if (k === "respin"){ body = `<p class="center">لفّة إضافية لـ${who}.</p>`; btns = has("again") ? w3btn(s, "again", "لُفّ مرة أخرى", "big") : ""; }
  else if (k === "l2"){
    if (c.st === "a" || c.st === "b") { body = `<p class="center">لفّتان، ثم يختار ${who} نتيجة واحدة. لا يُطبّق شيء قبل الاختيار.</p>${c.a ? `<div class="l2opts">${w3opt(c.a)}</div>` : ""}`; btns = has("l2spin") ? w3btn(s, "l2spin", c.st === "a" ? "اللفّة الأولى" : "اللفّة الثانية", "big") : ""; }
    else { body = `<p class="center">اختاروا نتيجة واحدة:</p><div class="l2opts">${w3opt(c.a, host && w3btn(s, "l2pick", "اختيار هذه", "", "a"))}${w3opt(c.b, host && w3btn(s, "l2pick", "اختيار هذه", "", "b"))}</div>`; }
  }
  else if (k === "box"){
    const r = c.r, res = !r ? "" : r === "p" ? `<p class="bigdelta up">+${c.v}</p>${c.v === 400 ? `<p class="center rare">جائزة نادرة!</p>` : ""}` : r === "m" ? (c.blocked ? `<p class="center">الحصانة منعت خصم ${c.v}.</p>` : `<p class="bigdelta down">${c.d ? "−" + (-c.d) : "0"}</p>`)
      : r === "imm" ? (c.conv ? `<p class="center">حصانة، ولديكم واحدة ← +100</p>` : `<p class="center">حصانة!</p>`) : r === "respin" ? `<p class="center">لفّة إضافية!</p>` : `<p class="center">خسارة الدور</p>`;
    body = `<div class="chest ${c.st === "open" ? "open" : ""} ${r === "p" && c.v === 400 ? "rare" : ""}"><div class="lid"></div><div class="base"></div><div class="glow"></div></div>${res}`;
    btns = has("open") ? w3btn(s, "open", "افتح الصندوق", "big") : has("again") ? w3btn(s, "again", "لُفّ مرة أخرى", "big") : "";
    if (c.st === "open") fx = r === "p" ? (c.v === 400 ? "rare" : "good") : r === "m" ? (c.blocked ? "shield" : "bad") : r === "imm" ? "shield" : "";
  }
  else if (k === "tre"){
    body = `<p class="center">${c.st === "pick" ? `ثلاثة صناديق: 100 و300 و500. يختار ${who} واحدًا.` : `اختار ${who} الصندوق ${c.pick + 1}: <b>+${c.vals[c.pick]}</b>`}</p><div class="tchests">${range(3).map(i => `<div class="tchest ${c.st === "open" ? "open" : ""} ${c.pick === i ? "picked" : ""}"><span>${c.st === "open" ? c.vals[i] : i + 1}</span>${host && has("tpick") ? w3btn(s, "tpick", "هذا", "sm", i) : ""}</div>`).join("")}</div>`;
    if (c.st === "open") fx = c.vals[c.pick] === 500 ? "rare" : "good";
  }
  else if (k === "bet" && c.st === "wager"){ body = `<p class="center">يحدد ${who} رهانه (لا يتجاوز نقاطه). الصحيحة تضيف الرهان، والخاطئة تخصمه، والحصانة لا تحمي من الرهان.</p>`; btns = host ? `<div class="row">${c.ws.map(v => w3btn(s, "wager", `رهان ${v}`, "", v)).join("")}</div>` : ""; }
  else if (["q","gold","bet","streak","quick","speed"].includes(k)){
    const pts = k === "speed" ? `+250 للفائز` : k === "bet" ? (c.free ? `سؤال عادي (+200): النقاط أقل من 100` : `الرهان ${c.v}`) : k === "streak" ? `السؤال ${c.n + (c.st === "ask" ? 1 : 0)} من 3 · ${c.v} · المجموع ${c.got}` : k === "quick" ? `السؤال ${Math.min(c.n + (c.st === "ask" ? 1 : 0), 3)} من 3 · 15 ثانية · المجموع ${c.got}` : `+${c.v}`;
    const vs = k === "speed" ? `<div class="vs"><span class="g">الأخضر</span><b>ضد</b><span class="o">البرتقالي</span></div>` : "";
    const verdict = c.st === "shown" || c.st === "right" || c.st === "wrong" || c.st === "cancel"
      ? (k === "speed" ? (c.st === "cancel" ? `<p class="verdict no">أُلغي التحدي · لا نقاط</p>` : c.w >= 0 ? `<p class="verdict ok ${W3.T[c.w]}">فاز الفريق ${TEAM[W3.T[c.w]]}${s.ph === "end" ? " بالمباراة" : " · +250"}</p>` : `<p class="verdict no">لم ينجح أي فريق · لا نقاط</p>`)
        : c.ok ? `<p class="verdict ok ${W3.T[t]}">إجابة صحيحة · +${k === "bet" && !c.free ? c.v : c.v}</p>` : `<p class="verdict no">${s.to ? "انتهى الوقت" : "إجابة خاطئة"}${k === "bet" && !c.free ? ` · −${c.v}` : " · 0"}</p>`) : "";
    const retry = c.retry && c.st === "ask" ? `<p class="note">استُخدمت الفرصة الثانية: محاولة أخيرة لنفس السؤال.</p>` : "";
    const tbn = s.ph === "tb" && c.last && c.st === "ask" ? `<p class="note">${c.last === "sx" ? "أُلغيت المحاولة السابقة" : "لم يُحسم التحدي السابق"} · محاولة ${s.tb.n + 1} من ${W3.TB_MAX}</p>` : "";
    body = `${vs}${tbn}${retry}<p class="muted">${pts}</p>${w3qhtml(c, host, s)}${verdict}`;
    if (host){
      const b = [];
      if (has("ok")) b.push(`<button class="btn ghost sm" data-w="peek">${H.priv.wshow ? "إخفاء الإجابة" : "إظهار الإجابة لي"}</button>`, w3btn(s, "ok", "✓ صحيحة", "g"), w3btn(s, "no", "✗ خاطئة", "bad"));
      if (has("sg")) b.push(`<button class="btn ghost sm" data-w="peek">${H.priv.wshow ? "إخفاء الإجابة" : "إظهار الإجابة لي"}</button>`, w3btn(s, "sg", "فاز الأخضر +250", "g"), w3btn(s, "so", "فاز البرتقالي +250", "o"), w3btn(s, "sn", "خسر الفريقان", "ghost"), w3btn(s, "sx", "إلغاء التحدي", "ghost"));
      if (has("more")) b.push(w3btn(s, "more", "السؤال التالي", ""));
      if (has("sre")) b.push(w3btn(s, "sre", `إعادة التحدي بسؤال آخر (${W3.SPEED_RETRY - c.re} متبقية)`, ""));
      btns = `<div class="row w3btns">${b.join("")}</div>`;
    }
    if (c.st === "shown" || c.st === "right") fx = (k === "speed" ? c.w >= 0 : c.ok) ? (k === "gold" ? "rare" : "good") : "bad";
  }
  return w3bidi(`<div class="w3card ${k}" data-fx="${fx}" data-ev="${s.sp}.${s.step}">${head}${body}${host ? `<div class="w3act">${btns}${next}</div>` : ""}</div>`);
}
function w3opt(k, btn){ return `<div class="l2opt ${W3COL(k).slice(2)}">${wsvg(k)}<b>${esc(W3.C[k].f || W3.C[k].n)}</b><span class="muted">${W3DESC[k]}</span>${btn || ""}</div>`; }
function w3end(s, host){
  const w = s.win, draw = w === "d", st = (lab, a, b) => `<tr><th>${lab}</th><td class="g">${a}</td><td class="o">${b}</td></tr>`;
  return `<div class="victory ${draw ? "" : W3.T[w]}">${draw ? "" : `<div class="confetti" aria-hidden="true">${range(18).map(i => `<i style="--i:${i}"></i>`).join("")}</div>`}
    <p class="v-kicker">${draw ? "انتهت المباراة" : s.tb ? "الفائز بعد المواجهة الفاصلة" : "الفائز"}</p><h2 class="v-name">${draw ? "تعادل رسمي" : `الفريق ${TEAM[W3.T[w]]}`}</h2>
    <p class="v-score"><b>${s.sc[0].toLocaleString("en")}</b> <span>مقابل</span> <b>${s.sc[1].toLocaleString("en")}</b></p>
    ${draw ? `<p class="muted">تعادل الفريقان ولم تحسمه ${W3.TB_MAX} تحديات فاصلة.</p>` : ""}
    <table class="vtable"><thead><tr><th></th><th class="g">الأخضر</th><th class="o">البرتقالي</th></tr></thead><tbody>${st("النقاط", s.sc[0], s.sc[1])}${st("الإجابات والتحديات الصحيحة", s.ca[0], s.ca[1])}${st("الأدوار", s.tn[0], s.tn[1])}</tbody></table>
    ${host ? `<div class="row" style="justify-content:center">${w3btn(s, "start", "مباراة جديدة بنفس الإعدادات", "big")}<button class="btn ghost" data-h="lobby">تغيير الإعدادات</button></div>` : ""}</div>`;
}
function w3prefs(){ return `<div class="row w3prefs"><button class="btn ghost sm" data-wp="snd" aria-pressed="${w3sound()}">${w3sound() ? "الصوت: يعمل" : "الصوت: متوقف"}</button><button class="btn ghost sm" data-wp="mot" aria-pressed="${w3motion()}">${w3motion() ? "الحركة: تعمل" : "الحركة: مخفّفة"}</button></div>`; }
function w3pref(k){ if (k === "snd") lsSet("lm-w-snd", w3sound() ? "0" : "1"); else { lsSet("lm-w-mot", w3motion() ? "0" : "1"); w3applyMotion(); } }
// one-off effects (sound, confetti) when a new result appears on this device
function w3fx(root, st){
  const el = root.querySelector(".w3card[data-ev]"); if (!el) return;
  const ev = el.dataset.ev + el.dataset.fx; if (st.ev === ev) return; const first = st.ev == null; st.ev = ev;
  const fx = el.dataset.fx; if (!fx || first) return;
  w3beep(fx);
  if (fx === "rare" && w3motion()) el.insertAdjacentHTML("afterbegin", `<div class="confetti" aria-hidden="true">${range(18).map(i => `<i style="--i:${i}"></i>`).join("")}</div>`);
}
function w3lobbyExtra(s){
  const o = s.o, L = W3.layout({o:{...o, off:[]}}), off = o.off || [];
  const rows = L.map(sl => `<tr class="${off.includes(sl.k) ? "off" : ""}"><td>${wsvg(sl.k, W3COL(sl.k).slice(2))}</td><td><b>${esc(W3.C[sl.k].f || W3.C[sl.k].n)}</b><br><span class="muted">${W3DESC[sl.k]}</span></td>
    <td class="num">${off.includes(sl.k) ? "—" : (W3.layout(s).find(x => x.k === sl.k).p * 100).toFixed(1) + "٪"}</td>
    <td>${W3.C[sl.k].opt ? `<button class="tog ${off.includes(sl.k) ? "" : "on"}" data-h="tog" data-card="${sl.k}" aria-pressed="${!off.includes(sl.k)}" aria-label="${esc(W3.C[sl.k].n)}"><i></i></button>` : `<span class="muted">أساسي</span>`}</td></tr>`).join("");
  return w3bidi(`${o.goal ? "" : `<p class="note warn">اختر هدف الفوز لتبدأ المباراة.</p>`}
    <details class="w3cards" ${H && H.priv.wco ? "open" : ""}><summary>الكروت ونسب ظهورها (${W3.MODES[o.mode].n})</summary><p class="muted">حجم كل شريحة في العجلة يساوي احتمالها. الكرت المعطّل يُحذف من العجلة وتُعاد موازنة النسب.</p>
    <div class="tablewrap"><table class="w3table"><tbody>${rows}</tbody></table></div></details>`);
}
const Wheel = {
  keepState:true, cloudResume:true,
  init: () => W3.init({}),
  canStart: o => W3.GOALS.includes(o.goal),
  env(){ return {R:w3rand, now:Date.now(), q:lv => {
    const B = bankNow("quiz") || QB, p = H.priv.wp, used = new Set(p.used || []);
    const lvOf = k => B[k][1]; const want = lv == null ? null : lv;
    let pool = range(B.length).filter(k => (want == null || lvOf(k) === want) && !used.has(k));
    if (!pool.length){ p.used = (p.used || []).filter(k => want != null && lvOf(k) !== want); pool = range(B.length).filter(k => want == null || lvOf(k) === want); }
    const k = pool[Math.floor(w3rand() * pool.length)], q = makeQ(B[k], -1); (p.used = p.used || []).push(k); if (p.used.length > 3000) p.used.shift();
    return {d:{q:q.d.q, o:q.d.o}, ci:q.ci};
  }}; },
  savePriv(){ return {wp:H.priv.wp || {}}; },
  async restore(pv){ H.priv.wp = pv.wp || {}; loadBank("quiz"); Wheel.arm(); },
  // the host's clocks: question timer and the moment the wheel stops
  arm(){
    clearInterval(H.priv.tick);
    H.priv.tick = setInterval(() => {
      if (!H || H.g !== "wheel") return;
      const s = H.s;
      if (s.stage === "rolling" && Date.now() - s.t0 >= (w3motion() ? 4900 : 600)){ if (W3.act(s, H.priv.wp, "land", null, W3.tok(s), Wheel.env())) pushHost(); return; }
      if (W3.tick(s, Date.now())){ if (s.left && s.left <= 5) w3beep("tick"); pushHost(); }
    }, 200);
  },
  onOpt(key){ if (key === "mode" || key === "goal") H.s.o.off = H.s.o.off || []; },
  act(a, el){
    const s = H.s;
    if (a === "tog"){ const k = el.dataset.card; if (!W3.C[k] || !W3.C[k].opt) return; const off = new Set(s.o.off || []); off.has(k) ? off.delete(k) : off.add(k); s.o.off = [...off]; pushHost(); return; }
    if (a === "start"){ if (!W3.GOALS.includes(s.o.goal)) return; H.priv.wp = H.priv.wp || {}; loadBank("quiz"); if (W3.act(s, H.priv.wp, "start", null, W3.tok(s), Wheel.env())){ Wheel.arm(); pushHost(); } return; }
    if (a === "lobby"){ clearInterval(H.priv.tick); H.s = {...W3.init(H.s.o), sp:H.s.sp, rot:H.s.rot, step:H.s.step}; pushHost(); }
  },
  hostClick(t){
    if (t.dataset.wp){ w3pref(t.dataset.wp); renderHost(); return true; }
    const a = t.dataset.w; if (!a) return false;
    if (a === "peek"){ H.priv.wshow = !H.priv.wshow; $("#hostMain").dataset.k = ""; renderHost(); return true; }
    // a double tap must not press the button that replaces the first one under the finger
    if (Date.now() - (H.priv.wlast || 0) < 450) return true;
    const arg = t.dataset.arg == null ? null : /^\d+$/.test(t.dataset.arg) ? +t.dataset.arg : t.dataset.arg;
    if (a === "start") return Wheel.act("start"), true;
    H.priv.wp = H.priv.wp || {};
    if (W3.act(H.s, H.priv.wp, a, arg, t.dataset.tk, Wheel.env())){ H.priv.wlast = Date.now(); H.priv.wshow = false; if (a === "spin" || a === "again" || a === "l2spin") Wheel.arm(); pushHost(); }
    return true;
  },
  host(players){
    const s = H.s, m = $("#hostMain");
    if (s.ph === "lobby"){ H.priv.wst = null; if (!s.o.off) s.o.off = []; setMain(lobbyHTML(players, w3lobbyExtra(s), "ابدأ المباراة")); const d = m.querySelector(".w3cards"); if (d) d.ontoggle = () => { H.priv.wco = d.open; }; return; }
    if (s.ph === "end"){ H.priv.wst = null; setMain(`${w3scores(s)}${w3end(s, true)}`); w3fx(m, H.priv.wfx || (H.priv.wfx = {})); return; }
    if (!m.querySelector(".w3lay")){
      m.innerHTML = `<div class="layout w3lay"><div class="stack"><div class="panel w3wheel"><div class="wh-holder"></div></div></div><div class="stack" id="w3side"></div></div>`; m.dataset.k = ""; H.priv.wst = {};
      if (!H.priv.tick) Wheel.arm();
    }
    m.querySelector(".w3lay").className = `layout w3lay st-${s.stage}`;
    w3mount(m.querySelector(".wh-holder"), s, H.priv.wst);
    setEl($("#w3side"), `<div class="w3sc">${w3scores(s)}</div><div class="panel w3panel">${w3card(s, true)}</div>${w3log(s)}${w3prefs()}<details class="panel w3players"><summary>اللاعبون (${players.length})</summary>${playerChips(players, true)}${soloNote()}</details>`);
    w3fx(m, H.priv.wfx || (H.priv.wfx = {}));
  },
  player(s){
    if (s.ph === "lobby"){ P.view.w3 = null; pSet(phead() + `<div class="panel center stack"><p class="bigmsg">بانتظار بدء المباراة…</p><p class="muted">المقدّم يختار هدف الفوز والإعدادات.</p></div>${w3prefs()}`); bindPlayer(); return; }
    if (s.ph === "end"){ P.view.w3 = null; pSet(phead() + w3scores(s) + w3end(s, false)); bindPlayer(); w3fx($("#playerMain"), P.view.wfx || (P.view.wfx = {})); return; }
    if (!$("#playerMain .w3p")){
      $("#playerMain").innerHTML = `<div class="w3p"><div id="w3ph"></div><div id="w3pc" class="stack"></div><div class="panel w3wheel small"><div class="wh-holder"></div></div><div id="w3pl"></div></div>`;
      $("#playerMain").dataset.k = ""; P.view.w3 = {}; bindPlayer();
    }
    setEl($("#w3ph"), phead());
    const ch = setEl($("#w3pc"), `${w3scores(s)}<div class="panel w3panel">${w3card(s, false)}</div>`);
    mountWheelP(s);
    setEl($("#w3pl"), w3log(s) + w3prefs());
    w3fx($("#playerMain"), P.view.wfx || (P.view.wfx = {}));
    if (ch && s.stage === "card"){ const r = $("#w3pc .w3panel"); if (r && r.scrollIntoView) r.scrollIntoView({block:"nearest", behavior:w3motion() ? "smooth" : "auto"}); }
  },
  pclick(t){ if (t.dataset.wp){ w3pref(t.dataset.wp); $("#playerMain").dataset.k = ""; const pl = $("#w3pl"); if (pl) pl.dataset.k = ""; playerRender(); } },
};
function mountWheelP(s){ w3mount($("#playerMain .wh-holder"), s, P.view.w3 || (P.view.w3 = {})); }

/* ================= RACE CLOCK (puzzle + spot the difference) ================= */
const fmtT = sec => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
function startRaceClock(){
  clearInterval(H.priv.tick); H.priv.t0 = Date.now(); H.s.el = 0; H.s.left = H.s.o.lim || -1;
  const g = H.g;
  H.priv.tick = setInterval(() => {
    if (!H || H.g !== g || H.s.ph !== "play"){ clearInterval(H.priv.tick); return; }
    const el = Math.floor((Date.now() - H.priv.t0) / 1000); let ch = false;
    if (el !== H.s.el){ H.s.el = el; ch = true; }
    if (H.s.o.lim){ const l = Math.max(0, H.s.o.lim - el); if (l !== H.s.left){ H.s.left = l; ch = true; } if (!l){ endRace(); return; } }
    if (ch) pushHost();
  }, 250);
}
function endRace(){
  clearInterval(H.priv.tick);
  const s = H.s; if (s.ph !== "play") return;
  s.ph = "over"; s.rev = true;
  s.rest = Object.entries(H.priv.prog || {}).filter(([peer]) => !s.fin.some(f => f[3] === peerKey(peer))).map(([, r]) => [r.n, r.v]).sort((a, b) => b[1] - a[1]).slice(0, 20);
  pushHost();
}
function maybeAllDone(players){ const s = H.s; if (s.ph === "play" && players.length && s.fin.length >= players.length) endRace(); }
const clockChip = s => s.ph === "over" ? `<span class="chip warn">انتهت الجولة</span>` : s.left >= 0 ? `<span class="clock ${s.left <= 10 ? "warn" : ""}">${fmtT(s.left)}</span>` : `<span class="clock">${fmtT(s.el || 0)}</span>`;
function standingsHTML(s, unit, total, pct){
  const rest = (s.rest || []).map(([n, v], i) => `<div><span>${s.fin.length + i + 1}. ${esc(n)}</span><span class="muted">${pct ? `${v}%` : `${v}/${total}`}</span></div>`).join("");
  return `<div class="lb">${s.fin.map((f, i) => `<div><span>${i + 1}. ${esc(f[0])}</span><span class="muted">${fmtT(f[2])} · ${f[1]} ${unit}</span></div>`).join("")}${rest}</div>`;
}

/* ================= PUZZLE ================= */
/* Puzzle board: drag a piece onto another to swap them (finger or mouse), or tap two pieces.
   The board itself has touch-action:none so dragging never scrolls the page. */
function mountPuzzle(el, cfg, onChange){
  const n = cfg.n, N = n * n, url = cfg.src === "photo" ? photoURL(cfg.img) : sceneURL(cfg.img);
  let perm = shuffle(range(N), cfg.seed);
  if (perm.every((v, k) => v === k)) [perm[0], perm[1]] = [perm[1], perm[0]];
  let sel = -1, mv = 0, done = false, locked = false, drag = null;
  const pos = id => { const r = Math.floor(id / n), c = id % n; return `${c / (n - 1) * 100}% ${r / (n - 1) * 100}%`; };
  el.innerHTML = `<div class="pzwrap"><div class="pzbar"><button class="btn ghost sm" data-pzbig="1">⤢ تكبير</button></div><div class="pz" style="grid-template-columns:repeat(${n},1fr)"></div></div>`;
  const wrap = el.querySelector(".pzwrap"), board = el.querySelector(".pz");
  function draw(){
    board.classList.toggle("done", done);
    board.innerHTML = perm.map((id, k) => `<button class="tile ${sel === k ? "sel" : ""}" data-k="${k}" style="background-image:url(${url});background-size:${n * 100}% ${n * 100}%;background-position:${pos(id)}" aria-label="قطعة ${k + 1}" ${done ? "disabled" : ""}></button>`).join("");
  }
  function swap(a, b){
    if (a === b || done || locked) return;
    [perm[a], perm[b]] = [perm[b], perm[a]]; sel = -1; mv++; done = perm.every((v, i) => v === i);
    onChange && onChange({p:Math.round(perm.filter((v, i) => v === i).length / N * 100), d:done, mv});
    draw();
    if (done && wrap.classList.contains("big")) setTimeout(() => toggleBig(false), 900);
  }
  const tileAt = (x, y) => { const t = document.elementFromPoint(x, y); const b = t && t.closest && t.closest(".pz .tile"); return b && board.contains(b) ? +b.dataset.k : -1; };
  // Drag with one finger at a time. The moving piece is drawn inside the puzzle and is kept within the board,
  // so it can never sit over other parts of the page; every way a touch can end (lift, cancel, lost capture,
  // app switch, page redraw) puts it back or drops it, and a piece that misses a square slides back to where it was.
  const clearOver = () => board.querySelectorAll(".tile.over,.tile.lift").forEach(b => b.classList.remove("over", "lift"));
  const place = (g, x, y) => {
    const br = board.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    const cx = Math.min(Math.max(x - g.w / 2, br.left), br.right - g.w), cy = Math.min(Math.max(y - g.h / 2, br.top), br.bottom - g.h);
    g.el.style.transform = `translate(${cx - wr.left}px,${cy - wr.top}px) scale(1.06)`;
  };
  function stopListening(){ window.removeEventListener("pointermove", onMove, true); window.removeEventListener("pointerup", onEnd, true); window.removeEventListener("pointercancel", onEnd, true); window.removeEventListener("blur", onAbort); document.removeEventListener("visibilitychange", onAbort); }
  function endDrag(e, drop){
    const d = drag; if (!d) return; drag = null; stopListening();
    try { board.releasePointerCapture(d.id); } catch(_){}
    if (!d.moved){ if (drop){ if (sel < 0){ sel = d.k; draw(); } else if (sel === d.k){ sel = -1; draw(); } else swap(sel, d.k); } return; }
    const k = drop && e ? tileAt(e.clientX, e.clientY) : -1;
    if (k >= 0 && k !== d.k && board.isConnected){ d.g.el.remove(); swap(d.k, k); return; }
    // missed: slide the piece back to its square, then show it there again
    const src = board.querySelector(`[data-k="${d.k}"]`), g = d.g.el;
    if (!src || !board.isConnected || matchMedia("(prefers-reduced-motion: reduce)").matches){ g.remove(); clearOver(); return; }
    const sr = src.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    g.classList.add("back"); g.style.transform = `translate(${sr.left - wr.left}px,${sr.top - wr.top}px)`;
    let gone = false; const fin = () => { if (gone) return; gone = true; g.remove(); clearOver(); };
    g.addEventListener("transitionend", fin, {once:true}); setTimeout(fin, 260);
  }
  function onMove(e){
    const d = drag; if (!d || e.pointerId !== d.id) return;
    if (!board.isConnected){ endDrag(null, false); return; }
    e.preventDefault();
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 8){
      const src = board.querySelector(`[data-k="${d.k}"]`); if (!src){ endDrag(null, false); return; }
      const r = src.getBoundingClientRect(), g = src.cloneNode(); g.className = "tile ghost"; g.removeAttribute("data-k"); g.setAttribute("aria-hidden", "true");
      g.style.width = r.width + "px"; g.style.height = r.height + "px"; wrap.appendChild(g);
      d.moved = true; d.g = {el:g, w:r.width, h:r.height}; src.classList.add("lift"); if (sel >= 0){ sel = -1; board.querySelectorAll(".tile.sel").forEach(b => b.classList.remove("sel")); }
    }
    if (d.moved){
      place(d.g, e.clientX, e.clientY);
      const k = tileAt(e.clientX, e.clientY);
      if (k !== d.over){ board.querySelectorAll(".tile.over").forEach(b => b.classList.remove("over")); if (k >= 0 && k !== d.k) board.querySelector(`[data-k="${k}"]`).classList.add("over"); d.over = k; }
    }
  }
  function onEnd(e){ if (drag && e.pointerId === drag.id) endDrag(e, e.type === "pointerup"); }
  function onAbort(){ endDrag(null, false); }
  board.addEventListener("pointerdown", e => {
    if (drag){ if (e.pointerId !== drag.id) e.preventDefault(); return; }      // a second finger never starts a second piece
    if (e.button > 0) return;
    const t = e.target.closest("[data-k]"); if (!t || done || locked) return;
    e.preventDefault();
    wrap.querySelectorAll(".tile.ghost").forEach(g => g.remove());
    drag = {k:+t.dataset.k, x:e.clientX, y:e.clientY, id:e.pointerId, moved:false, g:null, over:-1};
    try { board.setPointerCapture(e.pointerId); } catch(_){}
    window.addEventListener("pointermove", onMove, true); window.addEventListener("pointerup", onEnd, true); window.addEventListener("pointercancel", onEnd, true);
    window.addEventListener("blur", onAbort); document.addEventListener("visibilitychange", onAbort);
  });
  board.addEventListener("lostpointercapture", e => { if (drag && e.pointerId === drag.id) setTimeout(() => { if (drag && drag.id === e.pointerId && !board.isConnected) endDrag(null, false); }, 0); });
  board.addEventListener("contextmenu", e => e.preventDefault());
  function toggleBig(on){
    wrap.classList.toggle("big", on); document.documentElement.classList.toggle("noscroll", on);
    el.querySelector("[data-pzbig]").textContent = on ? "✕ إغلاق التكبير" : "⤢ تكبير";
  }
  el.querySelector("[data-pzbig]").onclick = () => toggleBig(!wrap.classList.contains("big"));
  draw();
  return {lock(){ if (!locked){ endDrag(null, false); locked = true; sel = -1; el.classList.add("locked"); toggleBig(false); draw(); } }};
}
const imgURL = (src, img, size) => src === "photo" ? photoURL(img, size) : sceneURL(img);
const Puzzle = {
  init: () => ({rd:0, img:0, src:"draw", n:4, seed:1, fin:[]}),
  onOpt(key){ if (key === "src") H.s.o.img = null; },
  choices(){
    const o = H.s.o;
    if (o.src === "photo"){ if (!H.priv.ids) H.priv.ids = range(6).map(randPhotoId); if (o.img == null || !H.priv.ids.includes(o.img)) o.img = H.priv.ids[0]; return H.priv.ids; }
    if (o.img == null || o.img > 3) o.img = 0; return [0, 1, 2, 3];
  },
  act(a, el){
    const s = H.s;
    if (a === "img"){ s.o.img = +el.dataset.img; pushHost(); }
    else if (a === "more"){ H.priv.ids = range(6).map(randPhotoId); s.o.img = H.priv.ids[0]; pushHost(); }
    else if (a === "start" || a === "go"){ Puzzle.choices(); s.src = s.o.src; s.img = s.o.img; s.n = s.o.n; s.rd++; s.seed = rnd(); s.ph = "play"; s.fin = []; s.rest = []; H.priv.prog = {}; H.priv.mounted = null; startRaceClock(); pushHost(); }
    else if (a === "end") endRace();
    else if (a === "lobby"){ s.ph = "lobby"; pushHost(); }
  },
  hostPeers(players){
    const s = H.s; if (s.ph !== "play") return;
    let ch = false;
    for (const p of players){
      const z = p.presence.pz; if (!z || z.rd !== s.rd) continue;
      H.priv.prog[p.peer] = {n:pname(p), v:Math.max(0, Math.min(100, +z.p || 0))};
      if (z.d && !s.fin.some(f => f[3] === peerKey(p.peer)) && s.fin.length < 30){ s.fin.push([pname(p), Math.max(0, +z.mv || 0), Math.round((Date.now() - H.priv.t0) / 1000), peerKey(p.peer)]); ch = true; }
    }
    if (ch){ pushHost(); maybeAllDone(players); }
  },
  host(players){
    const s = H.s;
    if (s.ph === "lobby"){
      const ids = Puzzle.choices(), o = s.o;
      const thumbs = `<h3>اختر الصورة</h3><div class="thumbs">${ids.map((id, i) => `<button class="thumb ${o.img === id ? "on" : ""}" data-h="img" data-img="${id}" aria-label="صورة ${i + 1}"><img src="${imgURL(o.src, id, 240)}" alt="" loading="lazy"></button>`).join("")}</div>
        ${o.src === "photo" ? `<div><button class="btn ghost sm" data-h="more">صور أخرى</button></div>` : ""}`;
      setMain(lobbyHTML(players, thumbs, "ابدأ السباق")); return;
    }
    const prog = Object.values(H.priv.prog || {}).sort((a, b) => b.v - a.v), local = !H.code || !players.length, over = s.ph === "over";
    if (H.priv.mounted !== s.rd || (!local) !== !!H.priv.pzRace){
      H.priv.mounted = s.rd; H.priv.pzRace = !local; H.priv.pzm = null;
      $("#hostMain").innerHTML = `<div class="layout"><div class="panel stack">${local ? `<div id="hostPz"></div>` : `<h3>سباق الترتيب</h3><div id="pzRace"></div>`}</div><div class="stack" id="pzSide"></div></div>`; $("#hostMain").dataset.k = "";
      if (local) H.priv.pzm = mountPuzzle($("#hostPz"), s, z => { if (z.d) endRace(); });
    }
    if (over && H.priv.pzm) H.priv.pzm.lock();
    setEl($("#pzRace"), over ? `<img class="refbig" src="${imgURL(s.src, s.img, PW)}" alt="الصورة الأصلية">` : raceHTML(prog, 100));
    setEl($("#pzSide"), `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>الوقت</h3>${clockChip(s)}</div>
        <div class="row"><img class="ref" src="${imgURL(s.src, s.img, 240)}" alt="الصورة الأصلية"><div><span class="muted">الصورة الأصلية</span><h3>${s.n}×${s.n}</h3></div></div></div>
      <div class="panel stack"><h3>${over ? "الترتيب النهائي" : "المنتهون"}</h3>${over ? standingsHTML(s, "حركة", 100, true) : finHTML(s.fin.map(f => [f[0], f[1], fmtT(f[2])]), "حركة")}</div>
      <div class="row">${over ? "" : `<button class="btn ghost sm" data-h="end">إنهاء الجولة</button>`}<button class="btn" data-h="go">جولة جديدة</button><button class="btn ghost sm" data-h="lobby">تغيير الصورة</button></div>`);
  },
  player(s){
    const me = peerKey(myPeer()), rank = s.fin.findIndex(f => f[3] === me), over = s.ph === "over";
    if (P.view.pzRd !== s.rd){
      P.view.pzRd = s.rd;
      pSet(phead(`<span id="pClock"></span>`) + `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>رتّب الصورة · ${s.n}×${s.n}</h3><img class="ref" style="width:80px" src="${imgURL(s.src, s.img, 240)}" alt="الصورة الأصلية"></div><p class="muted">اسحب القطعة إلى مكانها، أو اضغط قطعتين لتبديلهما.</p><div id="pPz"></div></div><div id="pPzStatus"></div>`);
      bindPlayer();
      if (!over){ NR.presence({pz:{rd:s.rd, p:0, d:false, mv:0}}).catch(() => {}); }
      P.view.pzm = mountPuzzle($("#pPz"), s, z => NR.presence({pz:{rd:s.rd, ...z}}).catch(() => {}));
    }
    if (over && P.view.pzm) P.view.pzm.lock();
    setEl($("#pClock"), clockChip(s));
    setEl($("#pPzStatus"), over ? `<div class="panel stack"><p class="bigmsg center" style="color:var(--gold)">${rank >= 0 ? `ترتيبك ${rank + 1}` : "انتهت الجولة"}</p>${standingsHTML(s, "حركة", 100, true)}</div>`
      : rank >= 0 ? `<div class="panel center"><p class="bigmsg" style="color:var(--gold)">أنهيت! ترتيبك ${rank + 1}</p><p class="muted">${fmtT(s.fin[rank][2])} · ${s.fin[rank][1]} حركة</p></div>` : s.fin.length ? `<p class="center muted">أنهى ${s.fin.length} لاعب حتى الآن</p>` : "");
  },
};

/* ================= SPOT THE DIFFERENCE: content source =================
   Pairs are listed in a catalog (index.json + shards of up to 400 pairs each) under SPOT_CDN, by default the
   site's own spot/ folder. Only the index and the shards actually needed are downloaded, so the library can grow
   to thousands of pairs without changing the game or making the page heavier.
   Each device keeps a history of pairs it has seen; the host picks a pair nobody in the room has seen. */
const SPOT_CDN = /*@@SPOTCDN@@*/"spot/";
const THEME_AR = {"old market":"سوق قديم","souk":"سوق شعبي","bazaar stalls":"بازار","spice market":"سوق التوابل","street market":"سوق الشارع","fruit stall":"بسطة فواكه","flower market":"سوق الزهور","flea market":"سوق المستعمل","antique shop":"محل تحف","bookshop interior":"مكتبة","library interior":"مكتبة عامة","cafe interior":"مقهى","restaurant interior":"مطعم","bakery shop":"مخبز","kitchen interior":"مطبخ","living room interior":"غرفة جلوس","cozy room":"غرفة","workshop tools":"ورشة","pottery shop":"محل فخار","carpet shop":"محل سجاد","lantern shop":"محل فوانيس","toy shop":"محل ألعاب","street food stall":"أكل الشارع","harbor boats":"مرفأ","fishing village":"قرية صيادين","old town street":"شارع قديم","narrow alley":"زقاق","colorful street":"شارع ملوّن","city street cars":"شارع المدينة","rooftops city":"أسطح المدينة","balcony plants":"شرفة","window flowers":"نافذة وزهور","village houses":"قرية","farm market":"سوق المزارعين","garden with bench":"حديقة","park playground":"ملعب أطفال","beach umbrellas":"شاطئ","camping site":"مخيم","train station":"محطة قطار","museum hall":"متحف","art gallery wall":"معرض فني","supermarket shelves":"سوبرماركت","hardware store":"محل أدوات","bicycle street":"دراجات","desk with objects":"مكتب","office interior":"مكتب عمل","classroom":"فصل دراسي","music instruments shop":"محل آلات موسيقية","vintage interior":"ديكور قديم","shelves with jars":"رفوف وبرطمانات","tea shop":"محل شاي","coffee roastery":"محمصة قهوة","fish market":"سوق السمك","textile shop":"محل أقمشة","desert camp":"مخيم صحراوي","festival street":"احتفال","night market":"سوق ليلي","old house facade":"واجهة بيت قديم","castle courtyard":"فناء قلعة","marina":"مرسى"};
const devId = (() => { let d = lsGet("lm-dev"); if (!/^[a-z0-9]{10,24}$/.test(d)){ d = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); lsSet("lm-dev", d); } return d; })();
const fbdb = () => (window.firebase && firebase.apps && firebase.apps.length) ? firebase.database() : null;
const localSeen = () => { try { return JSON.parse(lsGet("lm-seen") || "[]"); } catch(e){ return []; } };
function rememberLocal(id){ const s = localSeen(); if (!s.includes(id)){ s.push(id); while (s.length > 4000) s.shift(); lsSet("lm-seen", JSON.stringify(s)); } }
const Spot = {
  index:null, indexAt:0, shards:{}, hidden:new Set(), remote:false,
  norm(e){ // catalog entry -> pair used by the game
    return {id:e.id, level:e.l, w:e.w, h:e.h, a:SPOT_CDN + "pairs/" + e.id + "a.webp", b:SPOT_CDN + "pairs/" + e.id + "b.webp",
      title:e.t || THEME_AR[e.th] || "صورة", diffs:e.d.map(([x, y, rx, ry]) => ({x, y, rx, ry})), credit:e.c || null, kind:e.k || "photo"};
  },
  local(p){ return {id:p.id, level:p.level, w:p.w, h:p.h, a:"spot/" + p.a, b:"spot/" + p.b, title:p.title, diffs:p.diffs, credit:p.credit || null}; },
  async j(url){ const r = await fetch(url, {cache:"no-cache"}); if (!r.ok) throw new Error(r.status); return r.json(); },
  async loadIndex(){
    if (!SPOT_CDN) return null;
    if (this.index && Date.now() - this.indexAt < 300000) return this.index;
    try {
      this.index = await this.j(SPOT_CDN + "catalog/index.json"); this.indexAt = Date.now(); this.remote = true;
      try { this.hidden = new Set(await this.j(SPOT_CDN + "catalog/hidden.json")); } catch(e){}
    } catch(e){ console.warn("catalog unavailable", e); this.remote = false; this.index = null; }
    return this.index;
  },
  async shard(name){ if (!this.shards[name]) this.shards[name] = await this.j(SPOT_CDN + "catalog/" + name); return this.shards[name]; },
  async seenBy(devs){ // id -> when these devices last played it (Firebase + this device's local list). Used only to PREFER new pairs.
    const all = new Map(), db = fbdb(); localSeen().forEach((id, i) => all.set(id, i + 1));
    const one = async d => { try { const sn = await Promise.race([db.ref("spotseen/" + d).once("value"), sleep(4000).then(() => null)]); if (sn) Object.entries(sn.val() || {}).forEach(([k, t]) => all.set(k, Math.max(all.get(k) || 0, +t || 1))); } catch(e){} };
    if (db) await Promise.all(devs.map(one));
    return all;
  },
  markSeen(id, devs){ rememberLocal(id); const db = fbdb(); if (db) devs.forEach(d => { try { db.ref("spotseen/" + d + "/" + id).set(Date.now()).catch(() => {}); } catch(e){} }); },
  report(id){ const db = fbdb(); try { if (db) return Promise.resolve(db.ref("spotreports/" + id + "/" + devId).set(Date.now())); } catch(e){} return Promise.resolve(); },
  levelOk: (lv, l) => lv === 3 || l === lv,
  /* Pick a pair for this room.
     - A pair already played in THIS room is never repeated until the room has played every pair of the level
       (then {done:true}, and the host decides: other level or replay).
     - Among the pairs this room has not played, ones no device in the room has seen before come first; if all of them
       were seen in earlier games, the one seen longest ago is used. Old history never blocks a round. */
  async pick(lv, devs, roomPlayed){
    const idx = await this.loadIndex();
    if (!idx || !idx.shards || !idx.shards.length) return null;
    const seen = await this.seenBy(devs);
    let best = null, bestT = Infinity, total = 0;
    for (const sh of shuffle(idx.shards.filter(x => lv === 3 ? x.count : x.levels[lv]), rnd())){
      let list; try { list = await this.shard(sh.name); } catch(e){ continue; }
      const ok = list.filter(e => this.levelOk(lv, e.l) && !this.hidden.has(e.id) && !roomPlayed.has(e.id));
      total += ok.length;
      for (const e of shuffle(ok, rnd())){
        const t = seen.get(e.id) || 0;
        if (t < bestT){ best = e; bestT = t; if (!t) break; }
      }
      if (best && !bestT) break;          // a pair nobody here has seen: no need to read more shards
    }
    if (!best) return {done:true};
    return {pair:this.norm(best), fresh:!bestT, total:idx.total};
  },
};

/* ================= SPOT THE DIFFERENCE =================
   Pairs are prepared in advance (photo A + retouched copy B) and listed in the catalog
   with the exact box of every difference. Nothing is generated while playing, so every
   player sees the same two images and every difference is real and checked. */
const spotImgCache = {};
function loadSpotImg(f){
  if (!spotImgCache[f]) spotImgCache[f] = new Promise((res, rej) => {
    const im = new Image(); let tries = 0;
    const go = () => { im.src = f + (tries ? (f.includes("?") ? "&" : "?") + `r=${tries}` : ""); };
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
    <div class="dfpair">${[pair.a, pair.b].map((f, i) => `<div class="dfimg" style="aspect-ratio:${W}/${Hh}"><div class="dfzoom"><img src="${esc(f)}" alt="${i ? "الصورة الثانية" : "الصورة الأولى"}" draggable="false"><div class="dfmarks"></div></div></div>`).join("")}</div>`;
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
    const tol = Math.max(TOL, 22 * W / (r.width || 1) / sc);   // never smaller than a fingertip on screen
    let hit = -1, best = 1e9;
    pair.diffs.forEach((d, i) => {
      if (found.has(i)) return;
      const dx = Math.abs(px - d.x), dy = Math.abs(py - d.y);
      if (dx <= d.rx + tol && dy <= d.ry + tol){ const s2 = dx / (d.rx + tol) + dy / (d.ry + tol); if (s2 < best){ best = s2; hit = i; } }
    });
    if (hit >= 0){ found.add(hit); draw(); }
    else if (!pair.diffs.some((d, i) => found.has(i) && Math.abs(px - d.x) <= d.rx + tol && Math.abs(py - d.y) <= d.ry + tol)){
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
  if (holder) holder.innerHTML = `<div class="center stack"><p class="note">تعذّر تحميل صور هذه الجولة. تأكد من الإنترنت ثم أعد المحاولة.</p><div><button class="btn sm" ${attr}>إعادة المحاولة</button></div></div>`;
}
/* attribution: a small button that opens the photo's author, source, licence and the changes made (CC BY / CC BY-SA) */
const infoBtn = attr => `<button class="btn ghost sm" ${attr}>ⓘ معلومات الصورة</button>`;
function imageInfo(p, running){
  const safe = u => /^https:\/\//.test(u || "") ? esc(u) : "";
  const link = (u, t) => safe(u) ? `<a href="${safe(u)}" target="_blank" rel="noopener">${t}</a>` : t;
  let rows;
  if (p.kind === "art" || !p.credit) rows = `<tr><th>العمل</th><td>رسم أصلي من إعداد لمّة</td></tr><tr><th>التعديلات</th><td>نسخة ثانية من الرسم نفسه بفروق مقصودة.</td></tr>`;
  else if (p.credit.length >= 4){
    const [who, page, lic, licUrl] = p.credit, sa = /SA/i.test(lic || "");
    rows = `<tr><th>${p.kind === "painting" ? "الفنان" : "المصوّر"}</th><td>${esc(who)}</td></tr><tr><th>المصدر</th><td>${running ? `Wikimedia Commons<br><span class="muted">رابط صفحة الصورة الأصلية يظهر هنا بعد انتهاء الجولة، حتى لا تُكشف الفروق أثناء اللعب.</span>` : link(page, "صفحة الصورة على Wikimedia Commons")}</td></tr>
      <tr><th>الترخيص</th><td>${/^public domain$/i.test(lic || "") ? "ملكية عامة (Public domain)" : link(licUrl, `<bdi dir="ltr">${esc(lic)}</bdi>`)}</td></tr>
      <tr><th>التعديلات</th><td>قُصّت الصورة وغُيّر حجمها، وعُدّلت النسخة الثانية بإخفاء أو تحريك أو تغيير عناصر صغيرة لصنع الفروق.${sa ? " النسختان المعدّلتان متاحتان بالترخيص نفسه." : ""}</td></tr>`;
  } else {
    const [who, whoUrl, photoUrl] = p.credit;
    rows = `<tr><th>المصوّر</th><td>${link(whoUrl, esc(who))}</td></tr><tr><th>المصدر</th><td>${link(photoUrl, "Pexels")}</td></tr><tr><th>التعديلات</th><td>عُدّلت النسخة الثانية لصنع الفروق.</td></tr>`;
  }
  openModal("معلومات الصورة", `<p class="muted">${esc(p.title || "")}</p><table class="htable info">${rows}</table>`);
}
const reportBtn = attr => `<button class="btn ghost sm dfreport" ${attr}>إبلاغ عن مشكلة في الصورة</button>`;
const Diff = {
  savePriv(){ return {played:[...(H.priv.played || [])], playedLv:H.priv.playedLv || {}}; },
  async restore(pv){ H.priv.played = new Set(pv.played || []); H.priv.playedLv = pv.playedLv || {}; if (H.s.ph !== "lobby" && H.s.ph !== "done"){ H.s.ph = "lobby"; } },
  init: () => ({rd:0, pair:null, nd:0, lv:1, rev:false, fin:[], fresh:true}),
  async start(replay){
    if (H.priv.picking) return;
    const s = H.s, rd = s.rd + 1;
    s.rd = rd; s.ph = "prep"; s.fin = []; s.rest = []; s.rev = false; s.pair = null;
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
    s.pair = p; s.nd = p.diffs.length; s.lv = p.level; s.fresh = r.fresh; H.priv.total = r.total;
    Spot.markSeen(p.id, devs); played.add(p.id); (H.priv.playedLv = H.priv.playedLv || {})[p.id] = p.level;
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
    else if (a === "dfinfo" && s.pair) imageInfo(s.pair, s.ph !== "over");
    else if (a === "replay") Diff.start(true);
    else if (a === "dfreport" && s.pair){ Spot.report(s.pair.id).then(() => { const b = $("#hostMain .dfreport"); if (b){ b.textContent = "شكرًا، وصل البلاغ"; b.disabled = true; } }).catch(() => {}); }
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
      if (!H.priv.idxAsked){ H.priv.idxAsked = true; Spot.loadIndex().then(() => { if (H && H.g === "diff" && H.s.ph === "lobby"){ $("#hostMain").dataset.k = ""; renderHost(); } }); }
      const ix = Spot.index, cnt = ix ? ix.levels : null;
      setMain(lobbyHTML(players, `${cnt ? `<p class="muted">عدد الصور: سهل ${cnt[0]} · متوسط ${cnt[1]} · صعب ${cnt[2]}. لا يتكرر زوج داخل الغرفة حتى تُلعب كل صور المستوى، وتُقدَّم الصور التي لم يرها أحد من الحاضرين.</p>` : ""}
        <p class="muted">${["سهل: فروق واضحة يسهل ملاحظتها.","متوسط: فروق صغيرة وطبيعية لا تلفت النظر.","صعب: تفاصيل دقيقة مخفية داخل مشاهد مزدحمة.","الكل: زوج عشوائي من أي مستوى."][s.o.lv]}</p>`, "ابدأ الجولة"));
      return;
    }
    if (s.ph === "done" || s.ph === "fail"){ H.priv.dfRd = null; clearInterval(H.priv.tick);
      setMain(`<div class="panel center stack endcard" style="margin-top:18px">${s.ph === "done" ? `<p class="bigmsg endtitle">اكتملت تحديات هذا المستوى</p><p class="muted">يمكنك اختيار مستوى آخر أو إعادة اللعب.</p>` : `<p class="bigmsg">تعذّر تجهيز الصور</p><p class="muted">تأكد من الإنترنت ثم أعد المحاولة.</p>`}
        <div class="row" style="justify-content:center">${s.ph === "done" ? `<button class="btn" data-h="lobby">اختيار مستوى آخر</button><button class="btn ghost" data-h="replay">إعادة اللعب</button>` : `<button class="btn" data-h="go">إعادة المحاولة</button><button class="btn ghost" data-h="lobby">الإعدادات</button>`}</div></div>`); return; }
    const pair = s.pair;
    if (s.ph === "prep" || !pair){ H.priv.dfRd = null; setMain(`<div class="panel center stack" style="margin-top:18px"><div class="spinner"></div><p class="bigmsg">جارٍ تجهيز الصورتين…</p></div>`); return; }
    if (H.priv.dfRd !== s.rd){
      H.priv.dfRd = s.rd; H.priv.dfm = null;
      m.innerHTML = `<div class="dfhost"><div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)} · ${s.nd} فروق · ${LV_NAMES[s.lv]}</h3><b id="dfHostCount" class="count"></b></div><div class="df-holder"></div><div class="row dfmeta">${infoBtn('data-h="dfinfo"')}<span id="dfRep"></span></div></div><div class="stack" id="dfSide"></div></div>`;
      m.dataset.k = "";
      const rd = s.rd, holder = m.querySelector(".df-holder");
      preloadSpot(pair).then(() => {
        if (!H || H.s.rd !== rd) return;
        H.priv.dfm = mountPair(holder, pair, st => { const c = $("#dfHostCount"); if (c) c.textContent = `${st.f} / ${s.nd}`; if (st.d && !hostPlayers().length) endRace(); });
        if (H.s.rev) H.priv.dfm.reveal();
      }).catch(() => spotFail(holder, 'data-h="dfhretry"'));
    }
    if (s.rev && H.priv.dfm) H.priv.dfm.reveal();
    setEl($("#dfRep"), s.ph === "over" ? reportBtn('data-h="dfreport"') : "");     // reporting a bad picture: host only, after the round
    const prog = Object.values(H.priv.prog || {}).sort((a, b) => b.v - a.v), over = s.ph === "over";
    setEl($("#dfSide"), `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>${over ? "الترتيب النهائي" : "السباق"}</h3>${clockChip(s)}</div>${over ? standingsHTML(s, "خطأ", s.nd) : H.code && players.length ? raceHTML(prog, s.nd, true) : `<p class="muted">العب من هذه الشاشة، أو اعرض الكود ليشارك الآخرون من جوالاتهم.</p>`}</div>
      ${over ? "" : `<div class="panel stack"><h3>المنتهون</h3>${finHTML(s.fin.map(f => [f[0], f[1], fmtT(f[2])]), "خطأ")}</div>`}
      <div class="row">${over ? "" : `<button class="btn ghost sm" data-h="end">إنهاء وكشف الفروق</button>`}<button class="btn" data-h="go">صورة جديدة</button><button class="btn ghost sm" data-h="lobby">الإعدادات</button></div>${soloNote()}`);
  },
  player(s){
    const pair = s.pair;
    if (s.ph === "done" || s.ph === "fail"){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><p class="bigmsg">بانتظار المقدّم…</p><p class="muted">${s.ph === "done" ? "اكتملت تحديات هذا المستوى." : ""}</p></div>`); bindPlayer(); return; }
    if (s.ph === "prep" || !pair){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><div class="spinner"></div><p class="bigmsg">جولة جديدة…</p></div>`); bindPlayer(); return; }
    if (P.view.dfRd !== s.rd){
      P.view.dfRd = s.rd; P.view.dfm = null;
      pSet(phead(`<span id="pClock"></span>`) + `<div class="panel stack dfpanel"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)} · ${s.nd} فروق</h3><b id="dfCount" class="count">0 / ${s.nd}</b></div><p class="muted">اضغط على مكان الفرق في أي من الصورتين.</p><div id="pDf"><div class="center stack"><div class="spinner"></div><p class="muted">جارٍ تحميل الصورتين…</p></div></div><div class="row dfmeta">${infoBtn('data-act="dfinfo"')}</div></div><div id="pDfStatus"></div>`);
      rememberLocal(pair.id);
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
  pclick(t){
    if (t.dataset.act === "dfretry"){ P.view.dfRd = null; playerRender(); }
    else if (t.dataset.act === "dfinfo"){ const h = findHost(); if (h && h.presence.s.pair) imageInfo(h.presence.s.pair, h.presence.s.ph !== "over"); }
    else if (t.dataset.act === "dfreport"){ const h = findHost(), id = h && h.presence.s.pair && h.presence.s.pair.id; if (id) Spot.report(id).then(() => { t.textContent = "شكرًا، وصل البلاغ"; t.disabled = true; }).catch(() => {}); }
  },
};

const MOD = {quiz:Quiz, letters:Letters, wheel:Wheel, puzzle:Puzzle, diff:Diff};

/* ================= FOOTER ================= */
{ const b = $("#copyId"); if (b) b.onclick = () => copyText("10000003", b); }

/* ================= JOIN ================= */
window.addEventListener("lm-conn", () => { if (P){ $("#playerMain").dataset.k = ""; playerRender(); } if (H) renderHost(); });
resumeBanner();
$("#joinForm").addEventListener("submit", e => { e.preventDefault(); playerJoin($("#joinCode").value.trim()); });
$("#joinCode").addEventListener("input", e => { e.target.value = e.target.value.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/\D/g, "").slice(0, 4); });
photosReady.then(() => { if (H && H.s.ph === "lobby" && H.g === "puzzle"){ if (PHOTOS_OK === false) H.s.o.src = "draw"; renderHost(); } });
{ const hc = (location.hash || "").replace("#", "") || new URLSearchParams(location.search).get("code") || "";
  if (/^\d{4}$/.test(hc)){ $("#joinCode").value = hc; playerJoin(hc); } }
/* opening another game link in the same tab (only the #code changes) joins that game */
window.addEventListener("hashchange", () => { const hc = (location.hash || "").replace("#", ""); if (/^\d{4}$/.test(hc) && !H && (!P || P.code !== hc)){ $("#joinCode").value = hc; playerJoin(hc); } });
