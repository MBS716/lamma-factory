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
/* BUILD changes with every published version (written by build.py); SITE_URL is the one official address.
   A preview copy (for testing before publishing) keeps its rooms apart from the official site's rooms, so a phone on
   one and a host on the other can never meet half-way: the phone is told where the game really is. */
const BUILD = /*@@BUILD@@*/"dev", SITE_URL = /*@@SITE@@*/"", PREVIEW = /*@@PREVIEW@@*/false, PREVIEW_URL = /*@@PREVIEWURL@@*/"";
const APP_V = 3, ROOM_PREFIX = PREVIEW ? "lmp3-" : "lm3-";
/* A host of «أكملها» announces itself one protocol step up (4). Pages of this version know it and join it as usual; a page
   still showing an older version of لمّة (opened before a publish, without «أكملها») sees a host on a newer version and
   moves to the current version by itself (its code already does that), instead of searching for the game forever. */
const HOST_V = g => g === "akml" ? APP_V + 1 : APP_V;
const OTHER_PREFIXES = PREVIEW ? ["lm3-", "lm2-"] : ["lmp3-", "lm2-"];     // recognised only to explain, never joined
const TAB_ID = Math.random().toString(36).slice(2, 10);
/* one clock for everybody: the database server's time (Firebase tells each device its offset). Deadlines are stored in
   this time, so a countdown keeps running on the phones even while the host's browser is asleep in the background. */
let SRV_OFF = 0;
const srvNow = () => Date.now() + SRV_OFF;
const newId = () => { try { return [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, "0")).join(""); } catch(e){ return (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24); } };
const SEAT_H = 6 * 3600e3;
const BASE_URL = /*@@BASE@@*/"";
let ROOM = null, NR = null, H = null, P = null, connState = "checking";
/* A room is rooms/<prefix><code>/<seat id>. The seat id is fixed for a player (or host) in that room and kept on the
   device, so coming back writes the same seat again: nobody is listed twice. Losing the connection (another app, a
   closed browser, no network) marks the seat "away" instead of deleting it; only «خروج» / «إنهاء» removes it. */
function makeFirebaseRoom(db){
  try { db.ref(".info/serverTimeOffset").on("value", sn => { SRV_OFF = +sn.val() || 0; }); } catch(e){}
  return {
    async join(name, opt){
      opt = opt || {};
      await Promise.race([authReady, sleep(6000)]);
      if (!AUTH_UID){ const u = await fbSignIn(); if (u) AUTH_UID = u; }      // one more try: the database may accept signed-in devices only
      let me = opt.id || newId();
      const ref = db.ref("rooms/" + name), ci = db.ref(".info/connected");
      let mine = ref.child(me);
      let local = {...(opt.pres || {})}, peersArr = Object.freeze([]), handlers = [], conn = false, left = false, made = false, since = null;
      /* each seat carries: u = the device's anonymous identity (only it may change the seat), c = the server time of the
         seat's first join (fixed for good: an earlier claim to a name cannot be faked), h = true on the host's seat (the
         database accepts it only from the device that holds the room's host lock) */
      const TS = () => firebase.database.ServerValue.TIMESTAMP, uid = () => AUTH_UID ? {u:AUTH_UID} : {}, hm = () => opt.host ? {h:true} : {};
      const body = extra => ({j:JSON.stringify(extra ? {...local, ...extra} : local), t:TS(), ...uid(), ...hm()});
      const arm = () => { try { (opt.keep ? mine.onDisconnect().update(body({away:1})) : mine.onDisconnect().remove()).catch(() => {}); } catch(e){} };
      const write = () => { const pr = made ? mine.update(body()) : mine.set({...body(), c:since || TS()}); return pr.then(() => { made = true; arm(); }); };
      const readSince = async () => { try { const sn = await Promise.race([mine.once("value"), sleep(6000).then(() => null)]); since = sn && +sn.child("c").val() || null; } catch(e){ since = null; } };
      const first = async () => {
        await readSince();
        try { return await write(); } catch(e){}
        await readSince(); try { return await write(); } catch(e){ if (!opt.id) throw e; }
        // this seat belongs to another identity (site data cleared on this device): take a new seat
        me = newId(); mine = ref.child(me); since = null; return write();
      };
      const build = val => {
        const prev = new Map(peersArr.map(p => [p.peer, p])), now = Date.now();
        peersArr = Object.freeze(Object.entries(val || {}).map(([id, v]) => {
          let pres = {}; try { pres = JSON.parse((v && v.j) || "{}") || {}; } catch(e){}
          const old = prev.get(id);
          const hv = !!(v && v.h === true), c = v && +v.c || 0;
          return old && old.raw === (v && v.j) && old.ts === (v && v.t) && old.hv === hv && old.since === c ? old : {peer:id, presence:pres, raw:v && v.j, ts:v && v.t, away:!!pres.away, hv, since:c, uid:(v && typeof v.u === "string") ? v.u : "", sameTab:id === me, isMe:id === me, updatedAt:now};
        }));
        handlers.slice().forEach(h => { try { h({peers:peersArr}); } catch(e){ console.error(e); } });
      };
      const cb = snap => build(snap.val());
      const ccb = sn => { const was = conn; conn = !!sn.val(); if (conn && !left) write(); if (was !== conn) setTimeout(() => window.dispatchEvent(new Event("lm-conn")), 0); };
      await Promise.race([first(), sleep(25000).then(() => { throw new Error("timeout"); })]);   // slow mobile networks need longer than 10 s
      ref.on("value", cb); ci.on("value", ccb);
      return {
        name, get id(){ return me; },
        presence(patch){ for (const [k, v] of Object.entries(patch)){ if (v === null) delete local[k]; else local[k] = v; } return left ? Promise.resolve() : write(); },
        peers: () => peersArr,
        onPeers(h){ handlers.push(h); setTimeout(() => h({peers:peersArr}), 0); return () => { handlers = handlers.filter(x => x !== h); }; },
        connected: () => conn,
        // stop using the seat in this tab without touching it (another tab of this device took it over)
        async detach(){ if (left) return; left = true; ref.off("value", cb); ci.off("value", ccb); handlers = []; try { await mine.onDisconnect().cancel(); } catch(e){} },
        /* a mailbox: another seat of this device (the host's), with the host mark the database checks; used by the spot game
           for messages sealed for one player. Created with its own server join time, then only its text changes. */
        async box(id, data){
          const r = ref.child(id), b = {j:JSON.stringify(data), t:TS(), ...uid(), ...hm()}, has = peersArr.some(p => p.peer === id);
          const make = () => r.set({...b, c:TS()}), upd = () => r.update(b);
          try { await (has ? upd() : make()); return true; } catch(e){}
          try { await (has ? r.remove().then(make) : upd()); return true; } catch(e){}     // a seat of that name held by someone else: the host removes it
          try { await r.remove(); await make(); return true; } catch(e){ return false; }
        },
        unbox(id){ try { return ref.child(id).remove().catch(() => {}); } catch(e){ return Promise.resolve(); } },
        // remove a stale seat of somebody else (only possible where the database rules allow it)
        drop(id){ try { return ref.child(id).remove().catch(() => {}); } catch(e){ return Promise.resolve(); } },
        async leave(){ if (left) return; left = true; ref.off("value", cb); ci.off("value", ccb); handlers = []; try { await mine.onDisconnect().cancel(); } catch(e){} await mine.remove(); },
      };
    },
    // look into a room without joining it (used to recognise games made by another version)
    async peek(name){ try { const sn = await Promise.race([db.ref("rooms/" + name).once("value"), sleep(6000).then(() => null)]); return sn ? sn.val() : null; } catch(e){ return null; } },
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
    if (FIREBASE_CONFIG && window.firebase){ if (!firebase.apps.length){ firebase.initializeApp(FIREBASE_CONFIG); /*@@EMU@@*/ } fbSignIn().then(u => { AUTH_UID = u; authDone(u); }); ROOM = makeFirebaseRoom(firebase.database()); }
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
// players of this game: seats in the room that joined this host session (old games that used the same code are ignored)
function sessionPlayers(){ return NR && H ? NR.peers().filter(p => !p.sameTab && p.presence && p.presence.r === "p" && (!p.presence.hs || p.presence.hs === H.hs) && !(p.away && srvNow() - (+p.ts || 0) > SEAT_H)) : []; }
function hostPlayers(){ const dup = new Set((H && H.priv.dup) || []); return sessionPlayers().filter(p => !dup.has(p.peer)); }
const activePlayers = list => list.filter(p => !p.away);
const normName = n => clean(n || "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
// one seat per name: a second device using a name already taken in this game is refused (the first seat keeps it)
function updateDup(){
  const by = new Map(), dup = [];
  const t0 = p => +p.since || +p.presence.jt || +p.ts || 0;
  for (const p of sessionPlayers().slice().sort((a, b) => t0(a) - t0(b) || (a.peer < b.peer ? -1 : 1))){
    const k = normName(p.presence.n); if (!k) continue;
    if (by.has(k)) dup.push(p.peer); else by.set(k, p.peer);
  }
  const was = JSON.stringify(H.priv.dup || []), now = JSON.stringify(dup.sort());
  H.priv.dup = dup; return was !== now;
}
function myPeer(){ const me = NR && NR.peers().find(p => p.sameTab); return me ? me.peer : ""; }
/* invite links and QR codes: on the official site they always point to the official address, with the version in the
   address so a phone that still has an older copy in its cache gets the same version as the host */
const joinLink = code => BASE_URL ? BASE_URL + "#" + code
  : location.protocol.startsWith("http") ? (SITE_URL && !PREVIEW && (location.origin + location.pathname).startsWith(SITE_URL.replace(/\/$/, "")) ? SITE_URL : location.origin + location.pathname) + "?v=" + encodeURIComponent(BUILD) + "#" + code : "";

/* ================= GAMES REGISTRY ================= */
const LV3 = [[0,"سهل"],[1,"متوسط"],[2,"صعب"]];
const GAMES = {
  letters:{name:"سباق الحروف", group:"team", teams:true, tag:"أكثر من 1000 سؤال · نقاط حسب السرعة",
    desc:"فريقان يتناوبان على أسئلة الحروف، والفائز صاحب أعلى مجموع نقاط.",
    how:"كل فريق يحصل على نفس عدد الأسئلة بالتناوب. الإجابة الصحيحة الأسرع تأخذ نقاطًا أكثر، والخاطئة صفر.",
    opts:[{key:"m", label:"نوع المباراة", def:"q20", choices:() => [["q20","20 سؤالًا"],["q30","30 سؤالًا"],["q40","40 سؤالًا"],["t10","10 دقائق"],["t15","15 دقيقة"],["t20","20 دقيقة"]]},
          {key:"lv", label:"مستوى الأسئلة", def:3, choices:() => [...LV3, [3,"منوّع"]]},
          {key:"t", label:"وقت الإجابة", def:30, choices:() => [[20,"20 ث"],[30,"30 ث"],[45,"45 ث"]]},
          {key:"qt", label:"نمط الأسئلة", def:"d", choices:() => [["d","إجابة مباشرة"],["3","3 خيارات"],["4","4 خيارات"],["mx","مختلط"]]},
          {key:"go", label:"بدء وقت الإجابة", def:"man", choices:() => [["man","يدوي بعد القراءة"],[10,"تلقائي بعد 10 ث"],[15,"تلقائي بعد 15 ث"],[20,"تلقائي بعد 20 ث"]]}],
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
  diff:{name:"اكتشف الفرق", group:"race", teams:false, tag:"صور ورسوم · 5 و8 و12 فرقًا",
    desc:"أول من يكتشف كل الاختلافات يفوز.",
    how:"الصورة نفسها للجميع، وكل لاعب يبحث عن الاختلافات بنفسه دون أن يرى اكتشافات غيره. أول من يكتشفها كلها يفوز وتتوقف الجولة. لكل لاعب 5 أخطاء.",
    opts:[{key:"lv", label:"الصعوبة", def:3, choices:() => [...LV3, [3,"الكل"]]},
          {key:"pk", label:"اختيار الصورة", def:"host", choices:() => [["host","يختارها المقدّم"],["auto","تلقائي"]]},
          {key:"lim", label:"وقت الجولة", def:180, choices:() => [[60,"دقيقة"],[120,"دقيقتان"],[180,"3 دقائق"],[300,"5 دقائق"],[0,"بلا وقت"]]}],
    art:`<div class="art-df art-ph"><img src="spot/thumb_a.webp" alt=""><img src="spot/thumb_b.webp" alt=""></div>`},
  akml:{name:"أكملها", group:"race", teams:false, tag:"فردي أو فريقان · 7 طرق للإجابة",
    desc:"أكمل العبارة الناقصة: أمثال شعبية وعربية وحكم وأدب ومعلومات. فردي أو بين فريقين، بالاختيار أو بالكتابة أو بأسرع إصبع.",
    how:"تظهر عبارة ناقصة، ويكملها اللاعبون من جوالاتهم حسب طريقة الإجابة التي يختارها المقدّم.",
    // the host's settings (shown by the game's own lobby, in sections; only what fits the chosen competition and method)
    opts:[{key:"sys", def:"solo", choices:() => [["solo"],["team"]]},
          {key:"m", def:"c", choices:() => [["c"],["t"],["b"],["s"],["tt"],["mx"]]},
          {key:"lock", def:"all", choices:() => [["all"],["first"]]},
          {key:"sinp", def:"c", choices:() => [["c"],["t"]]},
          {key:"binp", def:"t", choices:() => [["t"],["o"]]},
          {key:"tinp", def:"c", choices:() => [["c"],["t"],["o"]]},
          {key:"first", def:"g", choices:() => [["g"],["o"],["rnd"]]},
          {key:"ord", def:"join", choices:() => [["join"],["rnd"],["host"]]},
          {key:"tsc", def:"sum", choices:() => [["sum"],["avg"]]}, {key:"bt", def:15, choices:() => [[10],[15],[20],[30]]}, {key:"bst", def:"auto", choices:() => [["auto"],["man"]]}, {key:"tn", def:{}, choices:() => []},
          {key:"sw", def:"rot", choices:() => [["rot"],["blk"],["rnd"]]},
          {key:"dif", def:"all", choices:() => [["all"],["0"],["1"],["2"],["up"]]},
          {key:"n", def:10, choices:() => [[10],[15],[20],[30]]},
          {key:"t", def:20, choices:() => [[10],[15],[20],[30],[45],[60]]}, {key:"rs", def:"man", choices:() => [["man"],["auto"]]}, {key:"rw", def:15, choices:() => [[10],[15],[20]]},
          {key:"go", def:"man", choices:() => [["man"],["auto"]]},
          {key:"tie", def:"rules", choices:() => [["rules"],["round"]]},
          {key:"steal", def:1, choices:() => []}, {key:"gold", def:0, choices:() => []}, {key:"fin", def:0, choices:() => []},
          {key:"surp", def:0, choices:() => []}, {key:"fast", def:0, choices:() => []}, {key:"secs", def:[], choices:() => []}, {key:"mix", def:["c","t","b","s"], choices:() => []}],
    art:`<div class="art-ak"><span>الصديق وقت</span><b>؟</b></div>`},
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
    + sec("الدخول والبدء", `<p>المقدّم يفتح اللعبة على الشاشة الكبيرة فيظهر كود من 4 أرقام. يدخل اللاعبون الكود من جوالاتهم، ويكتب كل لاعب اسمه ويختار فريقه. يختار المقدّم نوع المباراة ومستوى الأسئلة ووقت الإجابة ونمط الأسئلة وطريقة بدء الوقت، ثم يضغط «ابدأ المباراة».</p>`)
    + sec("طريقة اللعب", `<ol><li>الفريقان يتناوبان: سؤال للأخضر ثم سؤال للبرتقالي، فيحصل الفريقان دائمًا على نفس عدد الأسئلة.</li><li>الفريق صاحب الدور يختار حرفًا من اللوحة (أو حرفًا عشوائيًا)، فيظهر السؤال <b>دون وقت</b> ليقرأه المقدّم.</li><li>بعد القراءة يضغط المقدّم «▶ ابدأ وقت الإجابة» (أو يبدأ تلقائيًا بعد 10 أو 15 أو 20 ثانية حسب الإعداد)، ومن هذه اللحظة تُحسب السرعة والنقاط.</li><li>في نمط الخيارات (3 أو 4، أو المختلط) تظهر الخيارات للجميع عند بدء الوقت، وتبقى الإجابة شفهية. لا تُكشف الإجابة الصحيحة إلا بعد حكم المقدّم.</li><li>يمكن للمقدّم استبدال السؤال قبل بدء الوقت فقط، مرتين لكل فريق في المباراة، دون احتساب محاولة أو نقاط ودون تغيير الدور أو الحرف.</li><li>يعلن الفريق إجابته بصوت مسموع، فيضغط المقدّم «⏱ تثبيت وقت الإجابة» لحظة سماعها، فيتوقف الوقت. المقدّم وحده يثبّت الوقت ويحكم.</li><li>زر «✋ نريد الإجابة» في جوال الفريق ينبّه المقدّم فقط، ولا يوقف الوقت ولا يؤثر على النقاط.</li><li>يحكم المقدّم: صحيحة أو خاطئة. وقت الحكم لا يُحسب على الفريق.</li><li>الخلية تتلون بلون الفريق إذا أجاب صح، وتصبح رمادية إذا أخطأ أو انتهى الوقت. اللوحة للعرض فقط ولا تؤثر على الفوز.</li></ol><p class="muted">في النمط المختلط يحصل الفريقان في كل جولة على النمط والمستوى نفسيهما، فلا يستفيد أحدهما من سهولة الخيارات.</p>`)
    + sec("النقاط (سؤال مدته 30 ثانية)", `<table class="htable"><tr><th>زمن الإجابة الصحيحة</th><th>النقاط</th></tr><tr><td>5 ثوانٍ أو أقل</td><td>100</td></tr><tr><td>6 إلى 10 ثوانٍ</td><td>90</td></tr><tr><td>11 إلى 15</td><td>75</td></tr><tr><td>16 إلى 20</td><td>60</td></tr><tr><td>21 إلى 25</td><td>45</td></tr><tr><td>26 إلى 30</td><td>30</td></tr><tr><td>إجابة خاطئة أو انتهاء الوقت</td><td>0</td></tr></table><p class="muted">إذا اختار المقدّم 20 أو 45 ثانية تتناسب الفترات مع الوقت المختار. اختيار الحرف وحده لا يعطي نقاطًا.</p>`)
    + sec("نهاية المباراة", `<p><b>بعدد الأسئلة:</b> 20 أو 30 أو 40 سؤالًا تُقسم بالتساوي بين الفريقين.<br><b>بالوقت:</b> 10 أو 15 أو 20 دقيقة، وعند انتهاء الوقت يُكمل الفريق الآخر سؤاله إن لزم حتى تتساوى الفرص.</p><p><b>التعادل:</b> تُلعب جولة فاصلة: سؤال لكل فريق، وتتكرر حتى يتقدم أحدهما.</p><p>تظهر شاشة الفوز بالإحصاءات (النقاط، الصحيحة، الدقة، متوسط الزمن، أسرع إجابة، الفارق) وتبقى حتى يبدأ المقدّم مباراة جديدة.</p>`)
    + sec("مثال", `<p>دور الأخضر، اختاروا «ب»: «عاصمة العراق؟». قرأ المقدّم السؤال ثم بدأ الوقت، فأعلنوا «بغداد» بعد 7 ثوانٍ من البدء فثبّت المقدّم الوقت، ثم حكم بأنها صحيحة: +90 للأخضر. ثم يأتي دور البرتقالي.</p>`),
  quiz:() => sec("الفكرة", `<p>مسابقة اختيار من متعدد: يظهر السؤال على شاشة المقدّم وعلى الجوالات، وكل لاعب يجيب من جواله.</p>`)
    + sec("الدخول والبدء", `<p>المقدّم يختار التصنيف والمستوى وعدد الأسئلة ووقت كل سؤال، ثم يعرض الكود. يدخل اللاعبون الكود ويكتبون أسماءهم، ثم يضغط المقدّم «ابدأ المسابقة».</p>`)
    + sec("طريقة اللعب", `<p>اختر الإجابة من جوالك بالشكل واللون المطابقين. تُكشف الإجابة عند انتهاء الوقت أو عند إجابة الجميع، ثم ينتقل المقدّم للسؤال التالي.</p>`)
    + sec("النقاط", `<p>الإجابة الصحيحة: 500 (سهل) أو 750 (متوسط) أو 1000 (صعب)، وتنقص كلما تأخرت حتى تصل إلى النصف عند نهاية الوقت. الإجابة الخاطئة صفر.</p>`)
    + sec("الفوز", `<p>صاحب أعلى مجموع بعد آخر سؤال يتصدر منصة التتويج.</p>`)
    + sec("ميزات", `<p>أكثر من 2000 سؤال في 8 تصنيفات، ولا يتكرر سؤال داخل المسابقة، وتُقدَّم الأسئلة التي لم تظهر على جهاز المقدّم من قبل.</p>`),
  wheel:() => sec("الفكرة", `<p>فريقان يلفّان العجلة بالتناوب. كل شريحة كرت، وحجمها يساوي احتمال ظهوره. المقدّم وحده يحكم على الإجابات والتحديات، وشاشات اللاعبين تعرض النتيجة فقط.</p>`)
    + sec("البدء", `<p>يختار المقدّم هدف الفوز (1,500 أو 3,000 أو 5,000) ووضع اللعب ووقت السؤال ومستوى الأسئلة، ويمكنه تعطيل الكروت الاختيارية. الفريق البادئ يُختار بالقرعة.</p>`)
    + sec("الكروت", w3bidi(`<ul>${W3.ORDER.map(k => `<li><b>${esc(W3.C[k].f || W3.C[k].n)}:</b> ${W3DESC[k]}</li>`).join("")}</ul>`))
    + sec("سلفة الحظ", w3bidi(`<p>إذا ظهر كرت الرهان ورصيد الفريق أقل من 100 نقطة، يختار المقدّم مع الفريق: <b>سلفة الحظ</b> بقيمة 100 من بنك اللعبة (لا من المنافس)، أو <b>سؤال بديل بلا رهان</b> (+200)، أو <b>تجاوز الرهان</b> وإنهاء الدور.</p><ul><li>إجابة صحيحة بالسلفة: +100 صافية وتُغلق السلفة.</li><li>إجابة خاطئة: يُسجّل دين 100 يظهر للجميع بجانب نقاط الفريق.</li><li>يُسدَّد الدين تلقائيًا من أول نقاط يكسبها الفريق بعد ذلك.</li><li>سلفة واحدة فقط في كل مرة، ولا تتجاوز 100، ولا سلفة جديدة قبل سداد السابقة.</li><li>الحصانة لا تحمي من خسارة الرهان.</li><li>بلوغ الهدف والنتيجة النهائية يُحسبان بالنقاط ناقص الدين (ولا تنزل النتيجة تحت الصفر).</li></ul>`))
    + sec("صندوق الحظ", w3bidi(`<p>${W3.BOX.map(([r, v, p]) => `${r === "p" ? "+" + v : r === "m" ? "−" + v : r === "imm" ? "حصانة" : r === "respin" ? "لفّة إضافية" : "خسارة الدور"} (${p}٪)`).join("، ")}. تُسحب النتيجة لحظة الفتح ولا يمكن إعادة فتحه.</p>`))
    + sec("العدالة", `<ul><li>النقاط لا تنزل تحت الصفر.</li><li>حصانة واحدة وفرصة ثانية واحدة لكل فريق كحد أقصى، والزائدة تتحول إلى +100.</li><li>الحصانة تمنع أول خصم أو سرقة، ولا تحمي من رهان الفريق نفسه.</li><li>لفّتان إضافيتان كحد أقصى في الدور الواحد، ثم تُقفل كروت اللف الإضافي.</li><li>الكروت النادرة (الذهبي، حظك مرتين، الكنز، تبديل المزايا) تُقفل 4 لفّات بعد ظهورها.</li></ul>`)
    + sec("نهاية المباراة", `<p>بلوغ الهدف لا ينهي المباراة فورًا: تكتمل الجولة حتى يتساوى عدد الأدوار، ثم جولة ختامية بدور أخير لكل فريق (المتأخر أولًا، بلا لفّات إضافية). الأعلى نقاطًا يفوز، وعند التعادل مواجهة فاصلة بتحديات السرعة حتى 5 محاولات، ثم تعادل رسمي.</p>`),
  diff:() => sec("الفكرة", `<p>صورتان متطابقتان تقريبًا، وفي الثانية اختلافات: شيء اختفى أو أضيف أو تغيّر لونه. الصورة نفسها لكل اللاعبين، وكل لاعب يبحث بنفسه، وما يكتشفه يظهر على شاشته وحده. <b>أول من يكتشف كل الاختلافات يفوز، وتتوقف الجولة على الجميع.</b></p>`)
    + sec("المستويات", `<p>سهل: 5 اختلافات. متوسط: 8. صعب: 12.</p>`)
    + sec("طريقة اللعب", `<ul><li>اضغط على مكان الاختلاف في أي من الصورتين، وجهاز المقدّم يحكم.</li><li>كبّر بإصبعين أو بأزرار ＋ و－، واسحب للتحرك. التكبير والسحب لا يُحسبان أخطاء، ولا الضغط على اختلاف اكتشفته، ولا الضغط خارج الصورة.</li><li>لكل لاعب <b>5 أخطاء</b>. عند الخامس يتوقف هو وحده ويكمل الباقون.</li><li>إذا أكمل لاعبان أو أكثر في اللحظة نفسها تقريبًا (خلال 0.3 ثانية) فالفوز مشترك.</li></ul>`)
    + sec("النقاط", `<table class="htable"><tr><td>كل اختلاف</td><td>+10</td></tr><tr><td>إكمال كل الاختلافات</td><td>+50</td></tr><tr><td>دون أي خطأ (مع اختلاف واحد على الأقل)</td><td>+30</td></tr><tr><td>كل خطأ</td><td>−5</td></tr></table><p class="muted">نقاط الجولة لا تنزل تحت الصفر. الفائز بالإكمال يتصدر دائمًا. إذا انتهت الجولة دون فائز: الأكثر اكتشافًا، ثم الأقل أخطاءً، ثم الأعلى نقاطًا، ثم الأسبق في آخر اكتشاف.</p>`)
    + sec("نهاية الجولة", `<p>تنتهي الجولة بفوز أول من يُكمل، أو بانتهاء الوقت، أو باستبعاد جميع اللاعبين. بعدها تظهر كل الاختلافات، ويمكن عرض ما اكتشفه كل لاعب، مع الترتيب العام لكل الجولات وحقوق الصورة.</p>`),
  akml:() => sec("الفكرة", `<p>تظهر عبارة ناقصة: مثل شعبي أو عربي، أو حكمة، أو بيت شعر، أو معلومة عامة، ويكمل اللاعبون الجزء الناقص من جوالاتهم. بعد كل سؤال تظهر العبارة كاملة مع معناها.</p>`)
    + sec("المنافسة", `<ul><li><b>فردية:</b> لكل لاعب نقاطه وترتيبه.</li><li><b>فريقان:</b> الأخضر والبرتقالي، ويستطيع المقدّم تسميتهما. المقدّم يوزّع اللاعبين يدويًا (بالضغط على الاسم) أو تلقائيًا، والقادم الجديد ينضم إلى الفريق الأقل عددًا. لا يغيّر اللاعب فريقه بنفسه، والمقدّم وحده يستطيع النقل قبل المباراة أو بين الأسئلة، وتبقى النقاط السابقة لفريقها.</li></ul>`)
    + sec("طرق الإجابة", `<ul><li><b>اختيار من أربعة:</b> الجميع يختار من جواله.</li><li><b>إكمال مباشر:</b> الجميع يكتب الجزء الناقص.</li><li><b>أسرع إصبع:</b> أول من يضغط «أعرف الإجابة» يأخذ الدور، ولا تُفتح خانة الكتابة إلا له (أو يجيب بصوته ويحكم المقدّم). إن أخطأ انتقل الدور إلى التالي في الترتيب.</li><li><b>اقتنص الفرصة:</b> الجميع يجيب، وأول إجابة صحيحة تُنهي السؤال على الجميع.</li><li><b>تحدي الفرق:</b> يتناوب الفريقان، ويجيب عضو واحد من الفريق صاحب الدور، ويتناوب الأعضاء.</li><li><b>سرقة الإجابة:</b> في الفرق، إذا أخطأ صاحب الدور تنتقل فرصة واحدة إلى الفريق الآخر.</li><li><b>تحدي مختلط:</b> يتغير النمط من سؤال لآخر بالتناوب بين الأنماط التي يختارها المقدّم.</li></ul>`)
    + sec("قفل الإجابة", `<ul><li><b>الجميع يجيب:</b> يبقى السؤال مفتوحًا حتى انتهاء الوقت أو إجابة الجميع.</li><li><b>أول إجابة صحيحة:</b> يُغلق السؤال فور اعتماد أول إجابة صحيحة.</li><li><b>صاحب الدور فقط:</b> في أسرع إصبع وتحدي الفرق.</li></ul><p class="muted">الأسبقية بحسب لحظة وصول الإجابة إلى جهاز المقدّم، لا بساعة جوال اللاعب. ويبقى لسرعة إنترنت كل لاعب أثر لا يمكن إلغاؤه تمامًا.</p>`)
    + sec("الإجابات المكتوبة", `<ul><li>محاولة واحدة لكل لاعب في السؤال (أو في دوره).</li><li>لا تُحسب اختلافات التشكيل وأشكال الهمزة والتاء المربوطة والياء والمسافات، وتُقبل الصيغ البديلة المعتمدة.</li><li>لا تُحذف «ال»: الإجابة التي تختلف بـ«ال» فقط، أو بحرف واحد، تُعرض على المقدّم ليحكم عليها.</li></ul>`)
    + sec("النقاط", `<table class="htable"><tr><td>إجابة صحيحة</td><td>100</td></tr><tr><td>مكافأة السرعة (الجميع يجيب)</td><td>حتى 50، تقل مع الوقت من بداية وقت الإجابة</td></tr><tr><td>أول إجابة صحيحة، أو أول من طلب الإجابة وأصاب</td><td>+50</td></tr><tr><td>الجولة الذهبية والأسئلة المفاجئة</td><td>×2</td></tr><tr><td>الجولة النهائية</td><td>×3</td></tr><tr><td>تحدي السرعة</td><td>6 ثوانٍ ومكافأة حتى 100</td></tr><tr><td>الفائز (لاعب أو فريق)</td><td>+100</td></tr></table><p class="muted">في الفرق: نقاط الفريق مجموع نقاط أعضائه. وللفريقين غير المتساويين يستطيع المقدّم اختيار «المتوسط» حين يجيب الجميع، وتُقسم نقاط الفريق على أعضائه بحيث يساوي مجموع مساهماتهم نقاط الفريق تمامًا. في التعادل التام لا مكافأة فوز، وإذا لم يسجّل أحد نقاطًا تنتهي المباراة دون فائز.</p>`)
    + sec("التعادل", `<p>يُحسم بالأكثر إجابات صحيحة، ثم الأقل أخطاء، ثم الأقصر وقتًا في الإجابات الصحيحة؛ وإن بقي التعادل فالفوز مشترك. ويستطيع المقدّم اختيار جولة فاصلة: حتى 3 أسئلة بأسرع إصبع بين المتعادلين فقط.</p>`)
    + sec("الأسئلة", `<p>لا يتكرر سؤال داخل المباراة، وتُقدَّم الأسئلة التي لم تظهر على جهاز المقدّم من قبل. ويستطيع المقدّم تخطّي سؤال فيه خطأ، فيحل محله سؤال آخر دون نقاط للسؤال المتخطّى.</p>`),
  puzzle:() => sec("الفكرة", `<p>سباق لترتيب صورة مقسّمة إلى قطع مبعثرة. كل اللاعبين يحصلون على نفس الصورة بنفس الخلط.</p>`)
    + sec("الدخول والبدء", `<p>المقدّم يختار نوع الصور والصعوبة (من 3×3 إلى 6×6) ووقت الجولة والصورة، ثم يبدأ السباق.</p>`)
    + sec("طريقة اللعب", `<ul><li>اسحب القطعة إلى مكانها الصحيح فتتبادل مع القطعة الموجودة هناك.</li><li>أو اضغط قطعتين متتاليتين لتبديلهما.</li><li>زر «تكبير» يوسّع مساحة اللعب على الجوال.</li></ul>`)
    + sec("الترتيب", `<p>الأسرع في إكمال الصورة يتصدر، ويظهر عدد الحركات لكل لاعب. عند انتهاء الوقت يُرتَّب الباقون حسب نسبة الإنجاز.</p>`),
};
function openHelp(g){ if (GAMES[g] && HELP[g]) openModal(`طريقة اللعب: ${GAMES[g].name}`, HELP[g]()); }
function show(v){ for (const id of ["home","host","player"]) $("#" + id).hidden = id !== v; window.scrollTo(0, 0); }

/* ================= HOST ================= */
async function hostStart(g){
  resumeTok = null; window.__resuming = false;
  dropSaved(); { const r = $("#resume"); if (r) r.hidden = true; }
  const o = {}; for (const op of GAMES[g].opts) o[op.key] = op.def;
  if (g === "puzzle" && PHOTOS_OK === false) o.src = "draw";
  H = {g, code:null, s:{...MOD[g].init(), o, ph:"lobby"}, priv:{}, hs:newId(), hid:newId(), c:0};
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
const cloudGame = g => !!MOD[g];      // every game resumes after the host closes the tab (same room, same state)
// a code whose host stepped away (less than 3 hours ago) is kept for that host
async function codeFree(code, prefer){
  if (!H) return false;
  if (!cloudGame(H.g)) return true;
  const lk = await FS.get("hosts/" + ROOM_PREFIX + code);
  if (!lk || lk.u === AUTH_UID) return true;
  return srvNow() - (+lk.t || 0) > CLOUD_H;
}
async function claimCode(prefer){
  for (let k = 0; k < 4; k++){
    const code = k === 0 && prefer ? prefer : String(1000 + Math.floor(Math.random() * 9000));
    if (!(await codeFree(code, prefer)) && k < 3) continue;
    if (!H) return;                                                   // the host left (ended the game) while we were waiting
    // the host lock comes first: where the database rules are on, only the lock holder may mark a seat as the host's
    const lockMine = cloudGame(H.g) && AUTH_UID ? await FS.set("hosts/" + ROOM_PREFIX + code, {u:AUTH_UID, g:H.g, t:firebase.database.ServerValue.TIMESTAMP}) : false;
    // the host ended the game while the code was being reserved: the lock just taken is given back (no lock left for a finished game)
    const giveBack = () => { if (lockMine) FS.del("hosts/" + ROOM_PREFIX + code); };
    if (!H){ giveBack(); return; }
    if (!lockMine && AUTH_UID && cloudGame(H.g) && !(await codeFree(code, prefer))){ if (!H) return; continue; }   // another host took this code a moment ago
    if (!H){ giveBack(); return; }
    H.priv.lockAt = lockMine ? Date.now() : 0; H.priv.lockLost = false;
    let nr;
    if (!H.c) H.c = srvNow();
    // the seat's first write already carries the host's state: a reloaded host page never shows the phones an empty seat
    try { nr = await ROOM.join(ROOM_PREFIX + code, {id:H.hid, keep:true, host:true, pres:hostPresence()}); } catch(e){ console.error(e); if (lockMine && !(prefer && k === 0)) FS.del("hosts/" + ROOM_PREFIX + code); if (H) H.failed = true; return; }
    if (!H){ try { await nr.leave(); } catch(e){} giveBack(); return; }
    H.hid = nr.id;
    if (!H.c) H.c = srvNow();
    try { await nr.presence(hostPresence()); } catch(e){}
    await sleep(1300);
    // another host in this room: an active one, or one who stepped away less than 3 hours ago, keeps the code
    // with the lock in hand, a seat that only claims to be the host (not verified by the database) does not hold the code
    const live = p => !p.sameTab && p.presence && p.presence.r === "h" && (p.hv || !lockMine) && !(p.away && srvNow() - (+p.ts || 0) > CLOUD_H);
    const other = () => nr.peers().some(live);
    if (!other()) nr.peers().filter(p => !p.sameTab && p.away && srvNow() - (+p.ts || 0) > SEAT_H).forEach(p => nr.drop(p.peer));   // tidy seats left from old games
    if (other() && k === 0 && prefer) for (let w = 0; w < 8 && other(); w++) await sleep(500);   // our old tab may take a moment to leave
    if (other()){ try { await nr.leave(); } catch(e){} if (lockMine && !(prefer && k === 0)) FS.del("hosts/" + ROOM_PREFIX + code); continue; }
    if (!H){ try { await nr.leave(); } catch(e){} giveBack(); return; }
    NR = nr; H.code = code; claimTab("h:" + code + ":" + H.hid);
    if (cloudGame(H.g)){
      const h = H, got = lockMine || await FS.set("hosts/" + ROOM_PREFIX + code, {u:AUTH_UID, g:h.g, t:firebase.database.ServerValue.TIMESTAMP});
      if (h.ended){ if (got) FS.del("hosts/" + ROOM_PREFIX + code); return; }       // ended while the lock was being written
      h.cloud = got;
    }
    NR.onPeers(() => { if (!H) return; if (updateDup()) pushHost(); if (MOD[H.g].hostPeers) MOD[H.g].hostPeers(hostPlayers()); renderHost(); });
    saveHost();                // the room can be found again even if the tab is closed right away
    return;
  }
  if (H && !H.code) H.failed = true;      // no free code after 4 tries
}
function hostPresence(){ let s = H.s; if (JSON.stringify(s).length > 3800 && s.res) s = {...s, res:{}};
  // spot the difference: while the closing window is open the phones keep seeing the counts from before the first completion
  if (H.g === "diff" && s.ph === "play" && H.priv.winAt && H.priv.frozen) s = {...s, pl:H.priv.frozen}; return {r:"h", v:HOST_V(H.g), b:BUILD, g:H.g, s, hs:H.hs, c:H.c || 0, dup:H.priv.dup || []}; }
function pushHost(){
  if (!H) return;
  saveHost();
  if (NR) NR.presence(hostPresence()).catch(() => {});
  renderHost();
}
/* ---- the host's game survives a page reload or a dropped connection: the state is kept in this tab
   (sessionStorage) and the same code is claimed again, so players stay in the game and nothing is scored twice */
const HS_KEY = "lm-host";
const HL_KEY = "lm-host3";     // device copy (survives closing the tab), only for games that resume across tabs
function saveHost(){
  if (!H || !H.code) return;
  const pv = MOD[H.g].savePriv ? MOD[H.g].savePriv() : null, x = {g:H.g, code:H.code, s:H.s, pv, at:Date.now(), hs:H.hs, hid:H.hid, c:H.c};
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
    // one save belongs to one match: the match (h) and both copies are taken now, before any wait. If the host ends the match
    // (or another match starts) while the first copy is on its way, the second one is not written: nothing of a finished
    // match is written after its deletion was asked (writes already sent reach the database before that deletion).
    const h = H; if (!h || !h.cloud || h.ended) return;
    h.priv.cloudT = null; h.priv.cloudOrd = stateOrder(h.s);
    const room = ROOM_PREFIX + h.code, TS = firebase.database.ServerValue.TIMESTAMP;
    const game = {g:h.g, v:APP_V, s:JSON.stringify(h.s), at:TS}, priv = {pv:JSON.stringify(MOD[h.g].savePriv ? MOD[h.g].savePriv() : {}), at:TS};
    await FS.set("games/" + room, game);
    if (H !== h || h.ended) return;
    await FS.set("gpriv/" + room, priv);
    if (H !== h || h.ended) return;
    refreshLock();
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
let resumeTok = null;
async function hostResume(){
  let x = savedHost(); if (!x) return;
  const tok = resumeTok = {}; window.__resuming = true;
  show("host"); $("#hostBar").innerHTML = ""; $("#hostBar").dataset.k = "";
  $("#hostMain").innerHTML = `<div class="panel center stack" style="margin-top:18px"><div class="spinner"></div><p class="bigmsg">نعيدك إلى لعبتك…</p><p class="muted">${esc(GAMES[x.g] ? GAMES[x.g].name : "")} · الكود ${esc(x.code)}</p></div>`; $("#hostMain").dataset.k = "";
  try { await hostResumeIn(x, tok); } finally { if (resumeTok === tok){ resumeTok = null; window.__resuming = false; } }
}
async function hostResumeIn(x, tok){
  const gone = () => resumeTok !== tok;
  if (cloudGame(x.g)){
    await roomReady; await Promise.race([authReady, sleep(6000)]); if (gone()) return;
    const room = ROOM_PREFIX + x.code, lk = await FS.get("hosts/" + room);
    if (lk && lk.u === AUTH_UID){
      const gm = await FS.get("games/" + room), gp = await FS.get("gpriv/" + room);
      // the copy that went further in the match wins (never an older one: a box opened just before closing stays opened)
      try { if (gm && gm.g === x.g && gm.v === APP_V){ const cs = JSON.parse(gm.s); if (stateOrder(cs) > stateOrder(x.s)) x = {...x, s:cs, pv:gp && gp.pv ? JSON.parse(gp.pv) : x.pv}; } } catch(e){}
    }
  }
  if (gone()) return;
  H = {g:x.g, code:null, s:x.s, priv:{}, hs:x.hs || newId(), hid:x.hid || newId(), c:x.c || 0};
  // the game's own data first (question bank, scores, hidden answers), then the screen
  if (MOD[x.g].restore) await MOD[x.g].restore(x.pv || {}); else if (H.s.ph !== "lobby" && !MOD[x.g].keepState){ H.s.ph = "lobby"; }
  if (gone() || !H) return;
  for (const id of ["#hostMain","#hostBar"]){ $(id).innerHTML = ""; $(id).dataset.k = ""; }
  show("host"); renderHost();
  await roomReady;
  if (ROOM && H && H.g === x.g) await claimCode(x.code);
  if (H && H.code && H.code !== x.code) H.priv.newCode = x.code;     // the old code was taken meanwhile (more than 3 h away)
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
  // the match is closed first (a second tap finds nothing to end): no timer, save or lock renewal of this match runs after
  // this point, so the deletion below is the last thing this match sends to the database
  const h = H; if (!h || h.ended) return;
  h.ended = true; H = null;
  clearInterval(h.priv.tick); clearInterval(h.priv.mtick); clearTimeout(h.priv.cloudT);
  dropSaved(); if (h.cloud) dropCloud(h.code); tabKey = "";
  if (NR){ try { await NR.leave(); } catch(e){} NR = null; }
  show("home");
}
function renderHost(){
  if (!H) return;
  if (UPD && updateNow()) return;
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
  const chip = (p, t) => `<span class="chip ${t || ""} ${p.away ? "away" : ""}" ${p.away ? 'title="غير متصل الآن، مقعده محفوظ"' : ""}>${esc(pname(p))}${p.away ? " · غائب" : ""}</span>`;
  if (!teams) return `<div class="chips">${players.map(p => chip(p)).join("")}</div>`;
  const col = t => players.filter(p => p.presence.tm === t).map(p => chip(p, t)).join("") || `<span class="muted">لا أحد</span>`;
  return `<div class="stack"><div><b class="tg">الفريق الأخضر</b><div class="chips">${col("g")}</div></div><div><b class="to">الفريق البرتقالي</b><div class="chips">${col("o")}</div></div></div>`;
}
function setMain(html){ const m = $("#hostMain"); if (m.dataset.k !== html){ m.innerHTML = html; m.dataset.k = html; return true; } return false; }
function setEl(el, html){ if (el && el.dataset.k !== html){ el.innerHTML = html; el.dataset.k = html; return true; } return false; }

/* ================= PLAYER ================= */
/* A player's seat in a room is kept on the device (localStorage, 6 hours): the seat id, the host session it belongs to,
   the name and team, and personal progress (puzzle board, differences found, the answer to the current question).
   Coming back to لمّة - after a reload, a closed browser, another app or a dropped network - rejoins the same seat
   automatically. A seat of a game that has ended (or a new game on the same code) is never restored. */
const SEATS = "lm-seats";
function seatsAll(){ try { return JSON.parse(lsGet(SEATS) || "{}") || {}; } catch(e){ return {}; } }
function seatGet(code){ const x = seatsAll()[code]; return x && x.pid && Date.now() - (+x.at || 0) < SEAT_H ? x : null; }
function seatSet(code, patch){
  const all = seatsAll(), x = {...(all[code] || {}), ...patch, at:Date.now()}; all[code] = x;
  const keep = Object.entries(all).filter(([, v]) => v && Date.now() - (+v.at || 0) < SEAT_H).sort((a, b) => b[1].at - a[1].at).slice(0, 8);
  lsSet(SEATS, JSON.stringify(Object.fromEntries(keep))); return x;
}
function seatDrop(code){ const all = seatsAll(); delete all[code]; lsSet(SEATS, JSON.stringify(all)); }
function seatLatest(){ const e = Object.entries(seatsAll()).filter(([c, v]) => /^\d{4}$/.test(c) && v && v.pid && v.hs && Date.now() - (+v.at || 0) < SEAT_H).sort((a, b) => b[1].at - a[1].at)[0]; return e ? {code:e[0], ...e[1]} : null; }
// personal progress of this player in the current game (kept with the seat)
function seatProg(key, val){ if (!P || !P.code) return null; const st = seatGet(P.code); if (!st) return null; if (val === undefined) return (st.prog || {})[key] || null; seatSet(P.code, {prog:{...(st.prog || {}), [key]:val}}); return val; }

/* the same game open in two tabs of this device: the newest tab plays, the older one steps aside (no split seat) */
let tabBC = null, tabKey = "";
try { tabBC = new BroadcastChannel("lamma-tabs"); tabBC.onmessage = e => { const m = e.data || {}; if (m.t === "take" && m.key === tabKey && m.tab !== TAB_ID) goIdle(); }; } catch(e){}
function claimTab(key){ tabKey = key; try { tabBC && tabBC.postMessage({t:"take", key, tab:TAB_ID}); } catch(e){} }
async function goIdle(){
  const key = tabKey; tabKey = "";
  if (H){ clearInterval(H.priv.tick); clearInterval(H.priv.mtick); clearTimeout(H.priv.cloudT); }
  if (NR){ try { await NR.detach(); } catch(e){} NR = null; }
  const wasHost = key.startsWith("h:"), code = key.split(":")[1] || "";
  H = null; P = null;
  show("player");
  $("#playerMain").innerHTML = `<div class="panel center stack"><p class="bigmsg">اللعبة مفتوحة في تبويب آخر</p><p class="muted">${wasHost ? "تُدار اللعبة الآن من التبويب الآخر." : "تلعب الآن من التبويب الآخر بنفس اسمك ومكانك."} الكود ${esc(code)}</p>
    <div class="row" style="justify-content:center"><button class="btn" data-act="here" data-code="${esc(code)}" data-role="${wasHost ? "h" : "p"}">${wasHost ? "إدارة اللعبة من هنا" : "العب من هذا التبويب"}</button></div></div>`;
  $("#playerMain").dataset.k = "";
  $("#playerMain").onclick = e => { const b = e.target.closest("[data-act=here]"); if (!b) return; if (b.dataset.role === "h") hostResume(); else playerJoin(b.dataset.code); };
}

let joining = null, joinTok = null;
function joinStatus(html){ $("#playerMain").innerHTML = `<div class="panel center stack">${html}<div class="row" style="justify-content:center"><button class="btn ghost sm" data-act="leave">رجوع</button></div></div>`; $("#playerMain").dataset.k = ""; bindPlayer(); }
async function playerJoin(code, opt){
  opt = opt || {};
  if (!opt.auto){ resumeTok = null; window.__resuming = false; }
  $("#joinErr").textContent = "";
  if (!/^\d{4}$/.test(code)){ $("#joinErr").textContent = "الكود مكوّن من 4 أرقام."; return; }
  if (joining === code) return;                     // a second tap while connecting does nothing
  joining = code; const tok = joinTok = {};
  const btn = $("#joinForm button"); if (btn) btn.disabled = true;
  const seat = seatGet(code);
  show("player"); joinStatus(`<div class="spinner"></div><p class="bigmsg">${seat ? "نعيدك إلى مكانك في اللعبة…" : "جارٍ الاتصال باللعبة…"}</p><p class="muted">الكود ${esc(code)}${seat && seat.n ? ` · ${esc(seat.n)}` : ""}</p>`);
  try {
    await roomReady;
    if (!ROOM){ joinStatus(`<p class="bigmsg">تعذّر تشغيل الاتصال المباشر</p><p class="muted">تأكد من الإنترنت، ثم أعد فتح الصفحة. إن كنت تستخدم متصفحًا داخل تطبيق (مثل واتساب أو إنستغرام) فافتح الرابط في Safari أو Chrome.</p>`); return; }
    if (NR){ try { await NR.detach(); } catch(e){} NR = null; }
    let nr;
    try { nr = await ROOM.join(ROOM_PREFIX + code, {id:seat ? seat.pid : newId(), keep:true}); }
    catch(e){ console.error(e); if (joinTok !== tok) return; joinStatus(`<p class="bigmsg">تعذّر الاتصال باللعبة</p><p class="muted">${AUTH_UID ? "الاتصال بطيء أو مقطوع. تأكد من الإنترنت ثم أعد المحاولة." : "تعذّر تجهيز اتصال آمن لهذا الجهاز. تأكد من الإنترنت، وإن كنت داخل تطبيق (مثل واتساب أو إنستغرام) فافتح الرابط في Safari أو Chrome."}</p><button class="btn" data-act="retry" data-code="${esc(code)}">إعادة المحاولة</button>`); return; }
    if (joinTok !== tok){ try { await nr.detach(); } catch(e){} return; }      // the player pressed «رجوع» while connecting
    NR = nr; claimTab("p:" + code + ":" + nr.id);
    if (seat && nr.id !== seat.pid) seatSet(code, {pid:nr.id});
    $("#playerMain").innerHTML = ""; $("#playerMain").dataset.k = "";
    P = {code, pid:nr.id, name:seat ? seat.n : lsGet("lm-name"), team:seat ? seat.tm || null : null, joined:false, seat, g:null, view:{}, searching:true, t0:Date.now(), auto:!!opt.auto};
    playerRender();
    NR.onPeers(() => playerRender());
    setTimeout(() => { if (P && P.code === code){ P.searching = false; playerRender(); } }, 8000);
  } finally { joining = null; if (btn) btn.disabled = false; }
}
// «خروج» frees the seat for good (two taps, so an accidental tap does not throw a player out)
async function playerLeave(force){
  if (!force && P && P.joined && !(P.leaveAsk && Date.now() - P.leaveAsk < 4000)){ P.leaveAsk = Date.now(); const b = $("#playerMain [data-act=leave]"); if (b){ b.textContent = "تأكيد الخروج؟"; b.classList.add("warnbtn"); } setTimeout(() => { if (P && P.leaveAsk){ P.leaveAsk = 0; $("#playerMain").dataset.k = ""; playerRender(); } }, 4000); return; }
  joinTok = null; if (P && P.code && (P.joined || force)) seatDrop(P.code);
  tabKey = "";
  if (NR){ try { await (P && (P.joined || P.seat) ? NR.leave() : NR.detach()); } catch(e){} NR = null; }
  P = null; history.replaceState(null, "", location.pathname + location.search); show("home");
}
/* the host of this game: the host seat that started it first (players stay with that one; a later "host" is ignored) */
function findHost(){
  if (!NR) return null;
  const hs = NR.peers().filter(p => !p.sameTab && p.hv && p.presence && p.presence.r === "h" && !(p.away && srvNow() - (+p.ts || 0) > CLOUD_H));
  const ok = hs.filter(p => GAMES[p.presence.g] && p.presence.v === HOST_V(p.presence.g));
  if (P && P.hostId){ const h = ok.find(p => p.peer === P.hostId); if (h) return h; }
  const mine = P && P.seat ? ok.find(p => p.presence.hs === P.seat.hs) : null;
  const h = mine || ok.slice().sort((a, b) => (+a.presence.c || 0) - (+b.presence.c || 0))[0] || null;
  if (h && P) P.hostId = h.peer;
  return h;
}
// a host on another version of لمّة in the same room (or an older version's rooms): explain instead of "not found"
function otherVersionHost(){ return NR ? NR.peers().find(p => !p.sameTab && p.presence && p.presence.r === "h" && (!GAMES[p.presence.g] || p.presence.v !== HOST_V(p.presence.g) || !p.hv) && !p.away) : null; }
async function probeOldRooms(code){
  if (!ROOM || !ROOM.peek || !P) return;
  for (const pre of OTHER_PREFIXES){
    const v = await ROOM.peek(pre + code); if (!v || !P || P.code !== code) continue;
    if (Object.values(v).some(x => x && typeof x.j === "string" && x.j.includes('"r":"h"'))){ P.oldRoom = pre; $("#playerMain").dataset.k = ""; playerRender(); return; }
  }
}
function reloadOfficial(code, b){
  const here = location.origin + location.pathname, base = SITE_URL && !PREVIEW && here.startsWith(SITE_URL.replace(/\/$/, "")) ? SITE_URL : here;
  try { const last = +sessionStorage.getItem("lm-upd") || 0; if (Date.now() - last < 60000) return false; sessionStorage.setItem("lm-upd", String(Date.now())); } catch(e){}
  location.replace(base + "?v=" + encodeURIComponent(b || Date.now()) + (code ? "#" + code : "")); return true;
}
function pSet(html){ const m = $("#playerMain"); if (m.dataset.k !== html){ m.innerHTML = html; m.dataset.k = html; return true; } return false; }
function playerRender(){
  if (!P) return;
  if (UPD && updateNow()) return;
  const host = findHost();
  if (!host){
    const ov = otherVersionHost();
    let msg;
    if (ov && (+ov.presence.v || 0) === APP_V) msg = `<p class="bigmsg">صفحة المقدّم تحتاج تحديثًا</p><p class="muted">صفحة المقدّم على نسخة سابقة من لمّة وستتحدّث تلقائيًا بعد الجولة الحالية. ابقَ هنا، أو اطلب من المقدّم تحديث صفحته.</p><button class="btn" data-act="retry" data-code="${esc(P.code)}">إعادة المحاولة</button>`;
    else if (ov && (+ov.presence.v || 0) > APP_V && reloadOfficial(P.code, ov.presence.b)) msg = `<div class="spinner"></div><p class="bigmsg">نحدّث لمّة إلى الإصدار الذي يستخدمه المقدّم…</p>`;
    else if (ov) msg = (+ov.presence.v || 0) > APP_V
      ? `<p class="bigmsg">هذه اللعبة على إصدار أحدث من لمّة</p><p class="muted">حدّث الصفحة ليعمل جوالك بنفس إصدار المقدّم.</p><button class="btn" data-act="update" data-code="${esc(P.code)}">تحديث الصفحة</button>`
      : `<p class="bigmsg">المقدّم يستخدم إصدارًا أقدم من لمّة</p><p class="muted">اطلب من المقدّم تحديث صفحته (أو فتح ${esc((SITE_URL || "").replace(/^https?:\/\//, ""))})، ثم أعد المحاولة.</p><button class="btn" data-act="retry" data-code="${esc(P.code)}">إعادة المحاولة</button>`;
    else if (P.oldRoom === "lm3-" && SITE_URL) msg = `<p class="bigmsg">هذه اللعبة على موقع لمّة الرسمي</p><p class="muted">أنت تفتح نسخة المعاينة، والمقدّم يلعب على الموقع الرسمي.</p><a class="btn" href="${esc(SITE_URL)}?v=${encodeURIComponent(BUILD)}#${esc(P.code)}">افتح اللعبة على الموقع الرسمي</a>`;
    else if (P.oldRoom === "lmp3-" && PREVIEW_URL) msg = `<p class="bigmsg">هذه اللعبة على نسخة المعاينة</p><p class="muted">المقدّم يجرّب نسخة المعاينة، وأنت على الموقع الرسمي.</p><a class="btn" href="${esc(PREVIEW_URL)}#${esc(P.code)}">افتح اللعبة على نسخة المعاينة</a>`;
    else if (P.oldRoom) msg = `<p class="bigmsg">هذه اللعبة أُنشئت بإصدار قديم من لمّة</p><p class="muted">اطلب من المقدّم فتح الرابط الرسمي ${esc((SITE_URL || "").replace(/^https?:\/\//, ""))} وإنشاء غرفة جديدة، ثم ادخل بالكود الجديد.</p><button class="btn" data-act="retry" data-code="${esc(P.code)}">إعادة المحاولة</button>`;
    else if ((P.joined || P.g) && P.hostId && NR.peers().some(p => p.peer === P.hostId && !p.sameTab && p.hv)){
      // the host's seat is still there but not readable as a host yet (the host's page is reloading): wait, never end
      msg = `<div class="spinner"></div><p class="bigmsg">المقدّم يعود إلى اللعبة…</p><p class="muted">ابقَ هنا، ستكمل من حيث توقفت. الكود ${esc(P.code)}</p>`;
    }
    else if (P.joined || P.g){
      // the host's seat was removed: the game was ended by the host. The seat is not kept.
      seatDrop(P.code); P.joined = false;
      msg = `<p class="bigmsg">انتهت هذه اللعبة</p><p class="muted">أنهى المقدّم اللعبة. شكرًا للعب! الكود ${esc(P.code)}</p>`;
    }
    else if (P.searching) msg = `<div class="spinner"></div><p class="bigmsg">${P.seat ? "نعيدك إلى مكانك في اللعبة…" : "نبحث عن اللعبة…"}</p><p class="muted">الكود ${esc(P.code)}</p>`;
    else {
      if (P.seat){ seatDrop(P.code); P.seat = null; }
      if (!P.probed){ P.probed = true; probeOldRooms(P.code); }
      if (P.auto){ const c = P.code; setTimeout(() => { if (P && P.code === c && P.auto && !findHost()){ playerLeave(true); } }, 50); }
      msg = `<p class="bigmsg">لم نجد لعبة بهذا الكود</p><p class="muted">تأكد من الكود المعروض على شاشة المقدّم. إن انتهت اللعبة فاطلب كودًا جديدًا.</p><button class="btn" data-act="retry" data-code="${esc(P.code)}">إعادة المحاولة</button>`;
    }
    pSet(`<div class="panel center stack">${msg}<div class="row" style="justify-content:center"><button class="btn ghost sm" data-act="leave">رجوع</button></div></div>`);
    bindPlayer(); return;
  }
  // the saved seat belongs to this game: come back with the same name, team and place
  const hp = host.presence;
  if (P.seat && !P.joined){
    if (P.seat.hs && hp.hs && P.seat.hs === hp.hs && P.seat.n){
      P.joined = true; P.name = P.seat.n; P.team = P.seat.tm || null; P.back = Date.now();
      NR.presence({r:"p", n:P.name, tm:P.team, dv:devId, hs:hp.hs, jt:P.seat.jt || Date.now(), ...((P.seat.prog || {}).pres || {})}).catch(() => {});
      seatSet(P.code, {});
    } else { seatDrop(P.code); P.seat = null; }       // a different game now uses this code: start fresh
  }
  if (P.joined && (hp.dup || []).includes(P.pid)){ P.joined = false; P.dupName = P.name; seatDrop(P.code); P.seat = null; NR.presence({r:"q"}).catch(() => {}); }
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
      <p class="err" id="pErr">${P.dupName ? `الاسم «${esc(P.dupName)}» مستخدم في هذه اللعبة من جهاز آخر. اختر اسمًا آخر.` : ""}</p>
      <button class="btn" data-act="enter">دخول</button></div>`);
    bindPlayer(); return;
  }
  const s = host.presence.s || {};
  if (s.ph === "lobby"){
    P.view = {};
    pSet(phead() + `<div class="panel center stack"><p class="bigmsg">أنت داخل!</p>${MOD[P.g].plobby ? MOD[P.g].plobby(s) : ""}<p class="muted">بانتظار أن يبدأ المقدّم ${esc(game.name)}.</p></div>`);
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
    if (t.dataset.act === "update") return reloadOfficial(t.dataset.code, "u" + Date.now());
    if (t.dataset.team){ P.team = t.dataset.team; P.name = clean($("#pName") ? $("#pName").value : P.name); m.querySelectorAll("[data-team]").forEach(b => b.classList.toggle("on", b.dataset.team === P.team)); return; }
    if (t.dataset.act === "enter"){
      const name = clean($("#pName").value);
      if (!name){ $("#pErr").textContent = "اكتب اسمك أولًا."; return; }
      if (GAMES[P.g].teams && !P.team){ $("#pErr").textContent = "اختر فريقك."; return; }
      const host = findHost(); if (!host){ $("#pErr").textContent = "انتظر ظهور اللعبة ثم حاول مرة أخرى."; return; }
      const taken = NR.peers().some(p => !p.sameTab && p.presence && p.presence.r === "p" && p.presence.hs === host.presence.hs && normName(p.presence.n) === normName(name) && !(host.presence.dup || []).includes(p.peer));
      if (taken){ $("#pErr").textContent = "هذا الاسم مستخدم في هذه اللعبة. اختر اسمًا آخر (مثلًا أضف حرفًا أو رقمًا)."; return; }
      P.name = name; lsSet("lm-name", name); P.joined = true; P.dupName = "";
      const jt = Date.now(); P.seat = seatSet(P.code, {pid:P.pid, hs:host.presence.hs, n:name, tm:P.team || null, jt, prog:{}});
      NR.presence({r:"p", n:name, tm:P.team || null, dv:devId, hs:host.presence.hs, jt}).catch(() => {});
      $("#playerMain").dataset.k = ""; playerRender(); return;
    }
    if (P && P.g && MOD[P.g].pclick) MOD[P.g].pclick(t);
  };
}
const lostNote = () => {
  if (NR && NR.connected && !NR.connected()) return `<p class="note lost">انقطع الاتصال بالإنترنت… نعيد الاتصال تلقائيًا، ومكانك ونقاطك محفوظة.</p>`;
  if (P && P.joined){ const h = findHost(); if (h && h.away) return `<p class="note lost">المقدّم غير متصل مؤقتًا. ابقَ هنا؛ تستمر اللعبة كما هي فور عودته.</p>`; }
  if (P && P.back && Date.now() - P.back < 6000) return `<p class="note ok">أهلًا بعودتك يا ${esc(P.name)}، رجعت إلى مكانك.</p>`;
  return "";
};
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
    H.priv.seen = {}; s.qs = srvNow(); H.priv.tickAt = Date.now();
    clearInterval(H.priv.tick); H.priv.tick = setInterval(Quiz.tick, 250);
    pushHost();
  },
  savePriv(){ const p = H.priv; return {order:p.order, scores:p.scores, local:p.local, ci:p.ci, lastCi:p.lastCi, revealedK:p.revealedK, seen:p.seen}; },
  async restore(pv){
    if (H.s.ph === "lobby") return;
    const B = await loadBank("quiz"); if (!H) return;
    Object.assign(H.priv, {B, order:pv.order || [], scores:pv.scores || {}, local:pv.local || {g:0, o:0}, ci:pv.ci, lastCi:pv.lastCi, revealedK:pv.revealedK, seen:pv.seen || {}});
    if (H.s.ph === "q"){ if (!H.s.qs) H.s.qs = srvNow() - (H.s.T - H.s.t) * 1000; H.priv.tickAt = 0; H.priv.tick = setInterval(Quiz.tick, 250); }
  },
  tick(){
    if (!H || H.g !== "quiz" || H.s.ph !== "q") return;
    const left = Math.max(0, Math.ceil((H.s.T * 1000 - (srvNow() - H.s.qs)) / 1000));
    if (left <= 0){ if (MOD.quiz.hostPeers) MOD.quiz.hostPeers(hostPlayers()); Quiz.reveal(); H.priv.tickAt = Date.now(); return; }   // answers that arrived while the host was away count first
    H.priv.tickAt = Date.now();
    if (left !== H.s.t){ H.s.t = left; pushHost(); }
  },
  hostPeers(players){
    if (H.s.ph !== "q") return;
    let ch = false;
    for (const p of players){
      const a = p.presence.a;
      if (a && a.i === H.s.i && Number.isInteger(a.c) && a.c >= 0 && a.c < 4 && !H.priv.seen[p.peer]){
        // answer time on the shared clock. While the host's page runs normally, a phone cannot claim to be more than
        // 3 s faster than the moment its answer arrived; after the host's page was asleep, the phone's own time counts.
        const T = H.s.T * 1000, rec = srvNow() - H.s.qs, said = Number.isFinite(+a.at) ? +a.at - H.s.qs : rec;
        const asleep = Date.now() - (H.priv.tickAt || 0) > 1500;
        if (said > T + 1000){ continue; }                      // answered after the time was up
        const ms = Math.max(0, Math.min(T, asleep ? said : Math.max(said, rec - 3000)));
        H.priv.seen[p.peer] = {c:a.c, ms, n:pname(p)}; ch = true;
      }
    }
    const act = activePlayers(players);
    if (ch){ H.s.cnt = Object.keys(H.priv.seen).length; if (act.length && act.every(p => H.priv.seen[p.peer])) Quiz.reveal(); else pushHost(); }
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
    if (!P.ans){ const sv = seatProg("quiz"); if (sv) P.ans = sv; }        // the answer given before a reload or a closed browser
    const me = peerKey(myPeer()), mine = P.ans && P.ans.i === s.i && P.ans.q === (s.qd && s.qd.q) ? P.ans.c : null;
    const left = s.ph === "q" && s.qs ? Math.max(0, Math.ceil((s.T * 1000 - (srvNow() - s.qs)) / 1000)) : s.t;
    s = {...s, t:left};
    let body;
    if (s.ph === "q" && mine === null && left <= 0) body = `<div class="panel center stack"><p class="bigmsg">انتهى الوقت</p><p class="muted">بانتظار إظهار الإجابة…</p></div>`;
    else if (s.ph === "q"){
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
    if (s.qs && srvNow() - s.qs > s.T * 1000) return;            // the time is up on the shared clock
    P.ans = {i:s.i, q:s.qd.q, c:+t.dataset.ans, at:srvNow()};
    seatProg("quiz", P.ans); seatProg("pres", {a:{i:s.i, c:P.ans.c, at:P.ans.at}});
    NR.presence({a:{i:s.i, c:P.ans.c, at:P.ans.at}}).catch(() => {});
    playerRender();
  },
};

/* ================= LETTERS: points race =================
   The winner is decided by points only. Teams take turns, one question each, so both always get the same
   number of questions. Every question has a READING phase (no clock: the host reads it aloud) and then the
   ANSWER phase, started by the host («ابدأ وقت الإجابة») or automatically after 10/15/20 s. Speed points count
   from that start until the host locks the moment the team answered; judging time does not count.
   Question types: direct answer, 3 options, 4 options, or mixed. Options reach the players only when the answer
   time starts, and which one is right stays on the host (H.priv) until the host approves the result.
   In the mixed mode (and with mixed difficulty) both turns of a pair (green then orange) get the same type and
   level, and the three types rotate in shuffled blocks, so neither team gets an easier share.
   The host may replace a question during the reading phase only, at most twice per team per match.
   The hex board is only a picture of the match: each cell takes the colour of the team that answered it. */
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
const LT_REPL = 2;                                                   // question replacements per team per match
const LT_TYPES = {0:"إجابة مباشرة", 3:"3 خيارات", 4:"4 خيارات"};
const OPT_LBL = ["أ", "ب", "ج", "د"];
// options a question can be shown with: 0 (direct) always; 3/4 only with enough REVIEWED wrong options in the bank
// bank row: [letter, level, category, question, answer, wrong options, accepted alternatives, off, linked questions]
const ltCan = (q, n) => !q[7] && (!n || (Array.isArray(q[5]) ? q[5].length : 0) >= n - 1);
// a question is free when it was not asked in this match and no asked question gives its answer away
const ltFree = i => !H.priv.used.has(i) && !(H.priv.skip && H.priv.skip.has(i));
// the answer as the host and the result show it: the main answer plus any other accepted forms
const ltAnsTxt = () => H.priv.ans + (H.priv.alts && H.priv.alts.length ? ` (وتُقبل أيضًا: ${H.priv.alts.join("، ")})` : "");
const ltStrict = o => ({d:0, "3":3, "4":4, mx:4})[String(o.qt || "d")] || 0;
function ltEligible(B, n){ return B ? B.filter(q => ltCan(q, n)).length : 0; }
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
  init: () => ({L:[], b:"", cur:-1, tn:"g", st:"pick", k:0, q:"", a:"", lt:"", ql:1, t:0, T:30, am:-1, by:"", last:null, sc:{g:ltZero(), o:ltZero()}, mt:-1, over:false, tb:0, fin:null,
    pt:0, op:null, ci:-1, r0:0, rp:{g:LT_REPL, o:LT_REPL}, plan:[]}),
  board(){
    const s = H.s, B = H.priv.idx || {};
    // letters that still have unused questions come first
    const n = ltStrict(s.o), avail = ALPHA.filter(L => (B[L] || []).some(i => ltFree(i) && ltCan(H.priv.B[i], n)));
    s.L = shuffle(avail.length >= 25 ? avail : ALPHA, rnd()).slice(0, 25); s.b = ".".repeat(25); s.cur = -1;
  },
  async start(){
    if (H.priv.starting) return; H.priv.starting = true;
    const B = await loadBank("letters"); H.priv.starting = false;
    if (!H || H.g !== "letters") return;
    BANKS.letters = B; if (!Letters.canStart(H.s.o)){ renderHost(); return; }
    clearInterval(H.priv.tick); clearInterval(H.priv.mtick);
    H.priv.B = B; H.priv.idx = {}; B.forEach((q, i) => (H.priv.idx[q[0]] = H.priv.idx[q[0]] || []).push(i));
    H.priv.used = new Set(); H.priv.skip = new Set(); H.priv.alts = []; H.priv.devSeen = seenGet("lm-lseen"); H.priv.pend = null; H.priv.pos = {3:[0,0,0], 4:[0,0,0,0]}; H.priv.lastPos = {};
    const o = H.s.o, m = ltMode(o);
    H.s = {...Letters.init(), o, ph:"play", T:o.t, k:rnd() * 64};    // question keys never repeat across matches (stale phone presses are ignored)
    Letters.board();
    if (m.time){ H.s.m0 = srvNow(); H.s.mt = m.v * 60; H.priv.mtick = setInterval(Letters.matchTick, 500); }
    pushHost();
  },
  // a mode with options needs enough reviewed questions (at least 30) before a match can start
  canStart(o){ const n = ltStrict(o), B = bankNow("letters"); return !n || !B || ltEligible(B, n) >= 30; },
  savePriv(){ return {used:[...(H.priv.used || [])], skip:[...(H.priv.skip || [])], ans:H.priv.ans, alts:H.priv.alts || [], flash:H.priv.flash || "", pend:H.priv.pend || null, pos:H.priv.pos || null, lastPos:H.priv.lastPos || {}}; },
  async restore(pv){
    if (H.s.ph !== "play") return;
    const B = await loadBank("letters"); if (!H) return;
    H.priv.B = B; H.priv.idx = {}; B.forEach((q, i) => (H.priv.idx[q[0]] = H.priv.idx[q[0]] || []).push(i));
    H.priv.used = new Set(pv.used || []); H.priv.skip = new Set(pv.skip || []); H.priv.ans = pv.ans || ""; H.priv.alts = pv.alts || []; H.priv.flash = pv.flash; H.priv.devSeen = seenGet("lm-lseen");
    H.priv.pend = pv.pend || null; H.priv.pos = pv.pos || {3:[0,0,0], 4:[0,0,0,0]}; H.priv.lastPos = pv.lastPos || {};
    if (!H.s.rp) H.s.rp = {g:LT_REPL, o:LT_REPL}; if (!H.s.plan) H.s.plan = [];
    if (H.s.st === "read"){ clearInterval(H.priv.tick); H.priv.tick = setInterval(Letters.readTick, 250); }
    const m = ltMode(H.s.o);
    if (m.time && H.s.mt > 0){ if (!H.s.m0) H.s.m0 = srvNow() - (m.v * 60 - H.s.mt) * 1000; H.priv.mtick = setInterval(Letters.matchTick, 500); }
    if (H.s.st === "ask"){ if (!H.s.q0) H.s.q0 = srvNow() - (H.s.T - H.s.t) * 1000; H.priv.tick = setInterval(Letters.tick, 200); }
  },
  matchTick(){
    if (!H || H.g !== "letters" || H.s.ph !== "play"){ clearInterval(H && H.priv.mtick); return; }
    const m = ltMode(H.s.o), left = Math.max(0, m.v * 60 - Math.floor((srvNow() - H.s.m0) / 1000));
    if (left !== H.s.mt){ H.s.mt = left; if (!left){ H.s.over = true; clearInterval(H.priv.mtick); } pushHost(); }
  },
  /* question for a letter: requested level first, then the nearest levels; never one already used in this match;
     questions this device has not asked before come first */
  /* the pair plan: question k of each team (green then orange) shares type and level */
  planFor(k){
    const s = H.s; if (!s.plan) s.plan = [];
    if (!s.plan[k]){
      const qt = String(s.o.qt || "d");
      let t = qt === "3" ? 3 : qt === "4" ? 4 : 0;
      if (qt === "mx"){
        const b0 = k - k % 3;                                          // blocks of three pairs, one of each type, shuffled
        if (!s.plan[b0] || s.plan[b0].blk === undefined){ const order = shuffle([0, 3, 4], rnd()); for (let j = 0; j < 3; j++) s.plan[b0 + j] = {...(s.plan[b0 + j] || {}), t:order[j], blk:b0}; }
        t = s.plan[k].t;
      }
      const lv = s.o.lv === 3 ? [0, 1, 1, 2][Math.floor(Math.random() * 4)] : s.o.lv;
      s.plan[k] = {...(s.plan[k] || {}), t, l:lv};
    } else if (s.plan[k].l === undefined) s.plan[k].l = s.o.lv === 3 ? [0, 1, 1, 2][Math.floor(Math.random() * 4)] : s.o.lv;
    return s.plan[k];
  },
  pickQ(L, n, lv, exact){
    const s = H.s, B = H.priv.B, list = (H.priv.idx[L] || []).filter(i => ltFree(i) && ltCan(B[i], n));
    if (!list.length) return -1;
    for (const l of exact ? [lv] : [lv, lv + 1, lv - 1, lv + 2, lv - 2]){
      const pool = list.filter(i => B[i][1] === l); if (!pool.length) continue;
      const fresh = pool.filter(i => !H.priv.devSeen.has(hashStr(B[i][3])));
      const from = fresh.length ? fresh : pool; return from[Math.floor(Math.random() * from.length)];
    }
    return -1;
  },
  /* the right option's place: the least used places so far in this match, never the same place twice in a row */
  placeFor(n){
    const P = H.priv.pos = H.priv.pos || {3:[0,0,0], 4:[0,0,0,0]}, cnt = P[n] || (P[n] = Array(n).fill(0));
    const min = Math.min(...cnt); let c = range(n).filter(i => cnt[i] === min);
    const last = (H.priv.lastPos || {})[n]; if (c.length > 1 && c.includes(last)) c = c.filter(i => i !== last);
    const ci = c[Math.floor(Math.random() * c.length)]; cnt[ci]++; (H.priv.lastPos = H.priv.lastPos || {})[n] = ci; return ci;
  },
  /* letters that can still give a question of this pair's type (and locked level, once the pair has one) */
  // the level is locked by the OTHER team's question of this pair (the first team may still replace freely)
  lockedLv(pl){ return pl.lk !== undefined && pl.lkBy !== H.s.tn ? pl.lk : undefined; },
  canAsk(cell){
    const s = H.s, pl = Letters.planFor(ltPlayed(s.sc[s.tn])), lk = Letters.lockedLv(pl);
    return Letters.pickQ(s.L[cell], pl.t, lk !== undefined ? lk : pl.l, lk !== undefined) >= 0;
  },
  ask(cell, swap){
    const s = H.s, L = s.L[cell], pl = Letters.planFor(ltPlayed(s.sc[s.tn])), lk = Letters.lockedLv(pl);
    // the first question of a pair fixes its level; the other team's question must have the same level
    let qi = Letters.pickQ(L, pl.t, lk !== undefined ? lk : pl.l, lk !== undefined);
    if (qi < 0 && lk !== undefined){
      const anyFree = range(25).some(i => s.b[i] === "." && i !== cell && Letters.canAsk(i));
      if (anyFree || swap){ H.priv.flash = `لا يوجد سؤال لحرف ${L} بنفس مستوى سؤال الفريق الآخر في هذه الجولة${swap ? "" : "، اختر حرفًا آخر"}.`; renderHost(); return false; }
      qi = Letters.pickQ(L, pl.t, lk, false);                     // no letter left with that level: the nearest level
    }
    if (qi < 0){ if (!swap){ const arr = s.b.split(""); arr[cell] = "x"; s.b = arr.join(""); s.cur = -1; s.st = "pick"; H.priv.flash = `لا توجد أسئلة متبقية لحرف ${L} بهذا النمط، اختر حرفًا آخر.`; pushHost(); }
      else { H.priv.flash = `لا يوجد سؤال بديل لحرف ${L} بهذا النمط.`; renderHost(); }
      return false; }
    const q = H.priv.B[qi];
    if (lk === undefined){ pl.lk = q[1]; pl.lkBy = s.tn; }
    H.priv.used.add(qi); (q[8] || []).forEach(j => H.priv.skip.add(j)); seenAdd("lm-lseen", [hashStr(q[3])], 3000); H.priv.ans = q[4]; H.priv.alts = Array.isArray(q[6]) ? q[6] : []; H.priv.flash = "";
    // options are prepared now but stay on the host until the answer time starts
    if (pl.t){ const wrong = shuffle(q[5].slice(), rnd()).slice(0, pl.t - 1), ci = Letters.placeFor(pl.t), o = []; for (let i = 0, w = 0; i < pl.t; i++) o.push(i === ci ? q[4] : wrong[w++]); H.priv.pend = {o, ci}; }
    else H.priv.pend = null;
    s.cur = cell; s.lt = L; s.q = q[3]; s.ql = q[1]; s.pt = pl.t; s.op = null; s.ci = -1; s.a = ""; s.am = -1; s.by = ""; s.rq = ""; s.k++; s.st = "read"; s.t = s.T; s.away = 0;
    s.q0 = 0; s.r0 = srvNow(); s.go = s.o.go === "man" ? 0 : +s.o.go || 0; H.priv.showAns = false;
    clearInterval(H.priv.tick); H.priv.tick = setInterval(Letters.readTick, 250);
    pushHost(); return true;
  },
  /* reading phase: nothing counts yet; with an automatic start, the answer time begins after the chosen delay */
  readTick(){
    if (!H || H.g !== "letters" || H.s.st !== "read"){ clearInterval(H && H.priv.tick); return; }
    const s = H.s; if (!s.go){ return; }
    const left = Math.max(0, Math.ceil((s.go * 1000 - (srvNow() - s.r0)) / 1000));
    if (!left){ Letters.begin(); return; }
    if (H.priv.readLeft !== left){ H.priv.readLeft = left; renderHost(); }
  },
  /* the answer time starts: the clock and the speed points start now, and the options reach every screen at once */
  begin(){
    const s = H.s; if (s.st !== "read") return;
    clearInterval(H.priv.tick);
    s.st = "ask"; s.q0 = srvNow(); s.t = s.T; s.op = s.pt && H.priv.pend ? H.priv.pend.o.slice() : null;
    H.priv.tick = setInterval(Letters.tick, 200);
    pushHost();
  },
  /* replacing a question: reading phase only, the same team, the same letter and type; no attempt, no points */
  replace(){
    const s = H.s; if (s.st !== "read" || !s.rp || !(s.rp[s.tn] > 0)) return;
    if (Letters.ask(s.cur, true)){ s.rp[s.tn]--; pushHost(); }
  },
  tick(){
    if (!H || H.g !== "letters" || H.s.st !== "ask"){ clearInterval(H && H.priv.tick); return; }
    const el = srvNow() - H.s.q0, left = Math.max(0, Math.ceil((H.s.T * 1000 - el) / 1000));
    if (el >= H.s.T * 1000){
      // the time ran out while this page was asleep (another app): no automatic result, the host decides on return
      if (el - H.s.T * 1000 > 1500 || document.hidden){ if (!H.s.away){ H.s.away = 1; H.s.t = 0; clearInterval(H.priv.tick); pushHost(); } return; }
      Letters.finishQ(false, true); return;
    }
    if (left !== H.s.t){ H.s.t = left; pushHost(); } else if (H.priv.liveEl !== Math.floor(el / 1000)){ H.priv.liveEl = Math.floor(el / 1000); renderHost(); }
  },
  /* the team announced its answer: freeze the clock (judging time does not count) */
  stop(by){
    const s = H.s; if (s.st !== "ask") return;
    if (s.away) return;
    const ms = srvNow() - s.q0;
    if (ms >= s.T * 1000){ Letters.finishQ(false, true); return; }
    clearInterval(H.priv.tick);
    s.am = ms; s.by = ""; s.st = "judge"; s.t = Math.max(0, Math.ceil((s.T * 1000 - ms) / 1000));
    pushHost();
  },
  /* result of a question: runs once per question (st changes immediately), so repeated taps can't score twice */
  finishQ(ok, timeout){
    const s = H.s; if (s.st !== "judge" && !(timeout && s.st === "ask")) return;
    s.away = 0;
    clearInterval(H.priv.tick);
    const team = s.sc[s.tn], ms = timeout ? -1 : s.am, pts = ok && !timeout ? speedPoints(ms, s.T) : 0;
    if (pts > 0){ team.p += pts; team.c++; team.ms += ms; team.best = team.best ? Math.min(team.best, ms) : ms; }
    else team.w++;
    const arr = s.b.split(""); arr[s.cur] = pts > 0 ? s.tn : "x"; s.b = arr.join("");
    s.last = {tm:s.tn, ok:pts > 0, to:!!timeout, pts, ms}; s.a = ltAnsTxt(); s.ci = s.pt && H.priv.pend ? H.priv.pend.ci : -1; s.st = "done"; s.t = timeout ? 0 : s.t;
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
    s.st = "pick"; s.cur = -1; s.q = ""; s.a = ""; s.lt = ""; s.am = -1; s.by = ""; s.rq = ""; s.last = null; s.t = s.T; s.op = null; s.ci = -1; s.pt = 0; H.priv.pend = null;
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
    else if (a === "rand"){ if (s.st !== "pick") return; const all = range(25).filter(i => s.b[i] === "."), good = all.filter(i => Letters.canAsk(i)), free = good.length ? good : all; if (free.length) Letters.ask(free[Math.floor(Math.random() * free.length)]); }
    else if (a === "begin") Letters.begin();
    else if (a === "repl") Letters.replace();
    else if (a === "stop") Letters.stop();
    else if (a === "ok") Letters.finishQ(true);
    else if (a === "no") Letters.finishQ(false);
    else if (a === "next") Letters.next();
    else if (a === "swap"){ if (s.st === "ask" && s.away){ s.away = 0; Letters.ask(s.cur, true); } }   // only when the time ran out while the host was away
    else if (a === "tout"){ if (s.st === "ask" && s.away) Letters.finishQ(false, true); }
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
    const mt = s.m0 ? Math.max(0, m.v * 60 - Math.floor((srvNow() - s.m0) / 1000)) : s.mt;
    if (m.time) return s.over ? `<span class="chip warn">انتهى الوقت · تُستكمل الأسئلة لتتساوى الفرص</span>` : `<span class="clock ${mt <= 30 ? "warn" : ""}">${fmtT(mt)}</span>`;
    return `<span class="chip">السؤال ${Math.min(n + (s.st === "pick" ? 1 : s.st === "done" ? 0 : 1), m.v)} من ${m.v}</span>`;
  },
  /* the options as everyone sees them: shown from the start of the answer time; the right one marked only after the result */
  optsHTML(s){
    if (!s.op || !s.op.length) return "";
    const done = s.st === "done" && s.ci >= 0;
    return `<ol class="lopts n${s.op.length}">${s.op.map((o, i) => `<li class="${done ? (i === s.ci ? "ok" : "off") : ""}"><span class="ol">${OPT_LBL[i]}</span><span class="ot">${esc(o)}</span>${done && i === s.ci ? `<span class="ock">✓</span>` : ""}</li>`).join("")}</ol>`;
  },
  stage(s, host){
    const team = `<b class="t${s.tn}">الفريق ${TEAM[s.tn]}</b>`, T = s.T;
    if (s.st === "pick") return `<div class="stage"><p class="stage-h">دور ${team}</p><p class="muted">${host ? "يختار الفريق حرفًا من اللوحة، أو اضغط «حرف عشوائي»." : "يختار الفريق حرفًا، والمقدّم يفتحه."}</p>
      ${host && H.priv.flash ? `<p class="note">${esc(H.priv.flash)}</p>` : ""}${host ? `<div class="row"><button class="btn" data-h="rand">حرف عشوائي</button></div>` : ""}</div>`;
    const kind = `<span class="chip qt">${LT_TYPES[s.pt || 0]}</span>`;
    const head = `<div class="lettercard"><span class="L">${esc(s.lt)}</span><div class="stack" style="gap:6px"><div class="row"><span class="muted">حرف ${esc(s.lt)} · دور ${team}</span><span class="chip lv l${s.ql}">${LV_NAMES[s.ql]}</span>${kind}</div><p class="qtext">${esc(s.q)}</p></div></div>`;
    const ansBtn = host ? `<button class="btn ghost sm" data-h="ans">${H.priv.showAns ? `الإجابة: ${esc(ltAnsTxt())}` : "إظهار الإجابة لي"}</button>` : "";
    if (s.st === "read"){
      // reading: the host needs the start button first; nothing is timed yet
      const left = s.go ? Math.max(0, Math.ceil((s.go * 1000 - (srvNow() - s.r0)) / 1000)) : 0;
      const auto = s.go ? `<div class="prep"><span>${host ? "يبدأ وقت الإجابة تلقائيًا بعد" : "يبدأ وقت الإجابة بعد"}</span><b class="prep-n">${left}</b><span>ث</span><div class="tbar"><i style="width:${left / s.go * 100}%"></i></div></div>` : "";
      const rp = s.rp ? s.rp[s.tn] : 0;
      return `<div class="stage">${host ? `<button class="btn big beginbtn" data-h="begin">▶ ابدأ وقت الإجابة</button>${auto}` : ""}${head}
        ${!host ? auto + `<p class="muted center">${s.pt ? "تظهر الخيارات عند بدء وقت الإجابة." : "استمعوا إلى السؤال؛ يبدأ الوقت عندما يبدؤه المقدّم."}</p>` : ""}
        ${host ? `<p class="muted" style="margin:0">اقرأ السؤال${s.pt ? "، والخيارات تظهر للجميع عند البدء" : ""}. الوقت والنقاط لا يبدآن قبل الضغط.</p>
        ${H.priv.flash ? `<p class="note">${esc(H.priv.flash)}</p>` : ""}
        <div class="row"><button class="btn ghost sm" data-h="repl" ${rp > 0 ? "" : "disabled"}>استبدال السؤال (متبقٍ ${rp} من ${LT_REPL})</button>${ansBtn}</div>` : ""}</div>`;
    }
    if (s.st === "ask"){
      const el = s.q0 ? srvNow() - s.q0 : (T - s.t) * 1000, now = speedPoints(Math.max(0, Math.min(el, T * 1000)), T);
      s = {...s, t:s.away ? 0 : Math.max(0, Math.ceil((T * 1000 - el) / 1000))};
      const clock = `<div class="qclock"><span class="timer ${s.t <= 5 ? "warn" : ""}">${s.t}</span><div class="tbar"><i style="width:${s.t / T * 100}%"></i></div>${host ? `<span class="chip">الإجابة الآن = ${now} نقطة</span>` : ""}</div>`;
      const rq = s.rq ? `<div class="rqnote">✋ الفريق ${TEAM[s.tn]} يطلب الإجابة${host ? ` (${esc(s.rq)})` : ""}. الوقت لا يتوقف حتى ${host ? "تثبّته عند سماع الإجابة" : "يثبّته المقدّم عند سماع الإجابة"}.</div>` : "";
      if (s.away) return `<div class="stage">${clock}${head}${Letters.optsHTML(s)}<p class="note warn">انتهى وقت السؤال أثناء غياب المقدّم. ${host ? "اختر كيف يُحتسب:" : "بانتظار قرار المقدّم…"}</p>${host ? `<div class="row"><button class="btn bad" data-h="tout">احتسابه وقتًا منتهيًا (0 نقطة)</button><button class="btn ghost" data-h="swap">سؤال بديل لنفس الفريق (بسبب الغياب)</button></div>` : ""}</div>`;
      // answering: the host needs the clock and the lock button first
      return `<div class="stage">${clock}${host ? `<button class="btn big stopbtn" data-h="stop">⏱ تثبيت وقت الإجابة</button>` : ""}${rq}${head}${Letters.optsHTML(s)}
        ${host ? `<p class="muted" style="margin:0">اضغط لحظة سماع الإجابة من الفريق، ثم احكم عليها.</p><div class="row">${ansBtn}</div>` : ""}</div>`;
    }
    if (s.st === "judge") return `<div class="stage"><div class="judge"><p>وقت الإجابة المثبّت <b>${fmtS(s.am)} ث</b></p><p class="muted">إن كانت صحيحة: <b class="pts-sm">${speedPoints(s.am, T)}</b> نقطة · مدة التحكيم لا تُحتسب</p></div>
      ${host ? `<div class="row judgebtns"><button class="btn g" data-h="ok">✓ صحيحة</button><button class="btn bad" data-h="no">✗ خاطئة</button></div><p class="answer">الإجابة: ${esc(ltAnsTxt())}${s.pt && H.priv.pend ? ` (الخيار ${OPT_LBL[H.priv.pend.ci]})` : ""}</p>` : `<p class="muted center">بانتظار حكم المقدّم…</p>`}${head}${Letters.optsHTML(s)}</div>`;
    if (s.st === "done"){
      const l = s.last || {}, msg = l.ok ? `إجابة صحيحة! <b>+${l.pts}</b> للفريق ${TEAM[l.tm]}` : l.to ? `انتهى الوقت · 0 نقطة` : `إجابة خاطئة · 0 نقطة`;
      return `<div class="stage"><div class="verdict ${l.ok ? "ok " + l.tm : "no"}"><span>${msg}</span>${l.ok ? `<small>في ${fmtS(l.ms)} ث</small>` : ""}</div><p class="answer big">الإجابة الصحيحة: ${esc(s.a)}</p>
        ${host ? `<button class="btn big" data-h="next">التالي ←</button>` : ""}${head}${Letters.optsHTML(s)}</div>`;
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
      const cnt = B ? `${B.filter(q => !q[7]).length.toLocaleString("ar")} سؤال على ${ALPHA.length} حرفًا (${ltEligible(B, 3).toLocaleString("ar")} مؤهلة لثلاثة خيارات، و${ltEligible(B, 4).toLocaleString("ar")} لأربعة). ` : "";
      const few = B && !Letters.canStart(s.o) ? `<p class="note warn">لا توجد أسئلة كافية مراجَعة لهذا النمط بعد. اختر «إجابة مباشرة».</p>` : "";
      setMain(lobbyHTML(players, `${few}<p class="muted">${cnt}الفوز بالنقاط فقط: كل فريق يحصل على نفس عدد الأسئلة. يقرأ المقدّم السؤال أولًا، ثم يبدأ وقت الإجابة، والإجابة الصحيحة الأسرع تأخذ نقاطًا أكثر (من 100 إلى 30).</p>`, "ابدأ المباراة"));
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
const W3COL = k => ({bonus:"--green", pen:"--bad", ask:"--blue", duel:"--purple", steal:"--orange", spec:"--gold"})[W3.CAT[k]] || "--gold";
const W3DESC = {
  q:"سؤال للفريق صاحب الدور: الصحيحة +200.", speed:"سؤال مشترك للفريقين، والمقدّم يحدد الفائز: +250.",
  p50:"+50 تُضاف فورًا.", p150:"+150 تُضاف فورًا.", p250:"+250 تُضاف فورًا.", m50:"−50 تُخصم فورًا (الحصانة تمنعها).", m150:"−150 تُخصم فورًا (الحصانة تمنعها).", m250:"−250 تُخصم فورًا (الحصانة تمنعها).",
  gold:"سؤال صعب: الصحيحة +400.", bet:"راهِن بـ 100 أو 200 أو 300: الصحيحة تضيف الرهان والخاطئة تخصمه. برصيد أقل من 100: سلفة الحظ أو سؤال بديل أو التجاوز.", streak:"حتى 3 أسئلة: +150 ثم +200 ثم +250، وتنتهي عند أول خطأ.",
  quick:"3 أسئلة، 15 ثانية لكل سؤال: +100 لكل صحيحة.", steal:"تسرق 150 نقطة من المنافس (الحصانة تمنعها).", imm:"تحمي من أول خصم قادم (واحدة لكل فريق).",
  sec:"محاولة ثانية عند أول إجابة خاطئة (واحدة لكل فريق).", box:"صندوق مغلق يفتحه المقدّم: مكافأة أو عقوبة أو مفاجأة.", respin:"لفّة إضافية لنفس الفريق.",
  l2:"لفّتان، ويختار الفريق نتيجة واحدة منهما.", tre:"ثلاثة صناديق فيها 100 و300 و500: اختر واحدًا.", swap:"يتبادل الفريقان الحصانة والفرصة الثانية.",
};
const W3LOG = {p50:"بطاقة نقاط", p150:"بطاقة نقاط", p250:"بطاقة نقاط", m50:"خصم", m150:"خصم", m250:"خصم", q:"سؤال", gold:"السؤال الذهبي", bet:"الرهان", streak:"سلسلة الانتصارات",
  quick:"الجولة السريعة", speed:"تحدي السرعة", steal:"سرقة", stolen:"سُرقت منه", box:"صندوق الحظ", box400:"جائزة نادرة", tre:"الكنز", tre500:"الكنز الأكبر",
  repay:"سداد السلفة من نقاطه", debt:"سُجّل عليه دين سلفة 100", imm:"حصل على حصانة", imm2:"حصانة ثانية ← +100", sec:"حصل على فرصة ثانية", sec2:"فرصة ثانية إضافية ← +100", "sec-used":"استخدم الفرصة الثانية", shield:"الحصانة منعت الخصم", swap:"تبادل المزايا", tb:"فاز بالمواجهة الفاصلة"};
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

/* Label of one wheel slice. Radial text must fit the slice's width along its whole length (the slice narrows toward
   the centre), so for each candidate (full name, then short name) the largest font that fits is found by measuring the
   real glyphs. Wide slices: icon at the rim, text inside it. Narrow slices: text at the rim (widest part), icon inside. */
const W3LONG = {q:"سؤال", speed:"تحدي السرعة", gold:"السؤال الذهبي", bet:"الرهان", streak:"سلسلة الانتصارات", quick:"الجولة السريعة", steal:"سرقة النقاط",
  imm:"حصانة", sec:"فرصة ثانية", box:"صندوق الحظ", respin:"إعادة تدوير", l2:"حظك مرتين", tre:"الكنز", swap:"تبديل المزايا"};
function w3label(x, k, deg){
  const R_OUT = 298, R_IN = 70, th = deg * Math.PI / 180, wid = r => 2 * r * Math.sin(th / 2), num = k[0] === "p" || k[0] === "m";
  const cands = num ? [(k[0] === "p" ? "+" : "−") + k.slice(1)] : [W3LONG[k], W3SHORT[k]].filter((t, i, a) => t && a.indexOf(t) === i);
  const narrow = deg < 12;
  const iconSize = r => Math.max(12, Math.min(40, wid(r) * 0.72));
  let best = null;
  for (const txt of cands){
    x.font = `100px Lalezar, Tahoma, sans-serif`; x.direction = "rtl";
    const m = x.measureText(num ? "\u2066" + txt + "\u2069" : txt), L100 = m.width, H100 = (m.actualBoundingBoxAscent || 70) + (m.actualBoundingBoxDescent || 30);
    for (let f = 30; f >= 7; f -= 0.5){
      const L = L100 * f / 100, H = H100 * f / 100;
      let r0, rEnd, icon;
      if (!narrow){ const is = iconSize(R_OUT - 22); icon = {r:R_OUT - 4 - is / 2, size:is}; r0 = R_OUT - is - 12; rEnd = r0 - L; }
      else { r0 = R_OUT - 4; rEnd = r0 - L; const ir = rEnd - 6, is = Math.min(iconSize(ir - 8), 28); icon = {r:ir - is / 2, size:is}; if (icon.r - is / 2 < R_IN) icon = null; }
      if (rEnd < R_IN || H > wid(rEnd) * 0.84) continue;
      const cand = {txt, f, r0, dy:H100 * f / 100 * 0.06, num, icon};
      // the full name when it is about as large as the short one (or comfortably large); otherwise the bigger, shorter one
      if (!best || (txt === cands[0] ? true : f > best.f * 1.04 && best.f < 26)) best = cand;
      break;
    }
  }
  return best || {txt:cands[cands.length - 1], f:7, r0:R_OUT - 4, dy:0, num, icon:null};
}
function w3wheelCanvas(s, locks, hi, rest){
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  const c = document.createElement("canvas"); c.width = c.height = 640;
  const x = c.getContext("2d"), R = 306, cx = 320, rad = d => (d - 90) * Math.PI / 180;
  window.__w3lab = [];
  W3.layout(s).forEach((sl, idx) => {
    const a0 = rad(sl.a0), a1 = rad(sl.a1), mid = (a0 + a1) / 2, deg = sl.a1 - sl.a0, lk = locks[sl.k];
    x.beginPath(); x.moveTo(cx, cx); x.arc(cx, cx, R, a0, a1); x.closePath();
    const base = col(W3COL(sl.k)), g = x.createRadialGradient(cx, cx, 40, cx, cx, R);
    g.addColorStop(0, `color-mix(in srgb, ${base} 70%, #000)`); g.addColorStop(1, base);
    x.fillStyle = base; try { x.fillStyle = g; } catch(e){}
    x.fill(); x.lineWidth = 3; x.strokeStyle = col("--bg"); x.stroke();
    if (W3.C[sl.k].rare){ x.save(); x.clip(); x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 2; x.setLineDash([3, 6]); x.beginPath(); x.arc(cx, cx, R - 14, a0, a1); x.stroke(); x.restore(); }
    // every slice carries its icon AND its name or value, sized to fit inside the slice (see w3label)
    const lab = w3label(x, sl.k, deg);
    // where this slice sits on the screen once the wheel is at rest: labels on the left half are turned so they read upright
    const scr = mid + (rest || 0) * Math.PI / 180, flip = Math.cos(scr) < -1e-6;   // a straight-down label (cos ≈ 0) is vertical: no flip
    const drawIcon = (r, size) => { x.save(); x.translate(cx + Math.cos(mid) * r, cx + Math.sin(mid) * r); x.rotate(mid + Math.PI / 2 + (flip ? Math.PI : 0)); x.scale(size / 24, size / 24); x.translate(-12, -12);
      x.strokeStyle = col("--on-color"); x.lineWidth = 2.2; x.lineCap = x.lineJoin = "round"; x.stroke(new Path2D(wicon(sl.k))); x.restore(); };
    if (lab.icon) drawIcon(lab.icon.r, lab.icon.size);
    x.save(); x.translate(cx, cx); x.rotate(mid + (flip ? Math.PI : 0)); x.fillStyle = col("--on-color"); x.textBaseline = "middle";
    x.font = `${lab.f}px Lalezar, Tahoma, sans-serif`; x.direction = "rtl"; x.textAlign = flip ? "left" : "right";
    x.fillText(lab.num ? "\u2066" + lab.txt + "\u2069" : lab.txt, flip ? -lab.r0 : lab.r0, flip ? -lab.dy : lab.dy); x.restore();
    (window.__w3lab = window.__w3lab || []).push({k:sl.k, txt:lab.txt, f:lab.f, deg, icon:lab.icon ? lab.icon.size : 0, up:Math.cos(scr + (flip ? Math.PI : 0)) >= -1e-6});
    if (lk){
      x.save(); x.beginPath(); x.moveTo(cx, cx); x.arc(cx, cx, R, a0, a1); x.closePath(); x.fillStyle = "rgba(10,14,36,.62)"; x.fill();
      x.translate(cx + Math.cos(mid) * (R - 110), cx + Math.sin(mid) * (R - 110)); x.rotate(mid + Math.PI / 2); x.scale(.9, .9); x.translate(-12, -12);
      x.strokeStyle = "#fff"; x.lineWidth = 2.4; x.lineCap = x.lineJoin = "round"; x.stroke(new Path2D(WIC.lock)); x.restore();
    }
    if (idx === hi){   // the slice the wheel stopped on
      x.save(); x.beginPath(); x.moveTo(cx, cx); x.arc(cx, cx, R - 3, a0, a1); x.closePath(); x.lineWidth = 7; x.strokeStyle = "#fff6c9"; x.shadowColor = "#ffd76a"; x.shadowBlur = 18; x.stroke(); x.restore();
    }
  });
  x.beginPath(); x.arc(cx, cx, R + 4, 0, Math.PI * 2); x.lineWidth = 12; x.strokeStyle = col("--gold"); x.stroke();
  return c;
}
function w3mount(holder, s, st){
  let box = holder.querySelector(".wheelbox");
  if (!box){
    holder.innerHTML = `<div class="wheelbox w3"><div class="bulbs">${range(24).map(i => `<i style="--i:${i}"></i>`).join("")}</div><div class="wclip"></div><div class="pointer"></div><div class="hub"><span>ل</span></div></div>`;
    box = holder.querySelector(".wheelbox"); st.key = null; st.sp = s.sp;
  }
  const L = s.stage === "rolling" ? (st.locks || {}) : W3.locks(s, s.cur && s.cur.k === "l2" && (s.cur.st === "a" || s.cur.st === "b"));
  // after the wheel stops, the slice under the pointer lights up
  let hi = -1;
  if (s.stage !== "rolling" && s.seg && s.sp){ const ang = ((360 - (s.rot % 360)) % 360 + 360) % 360; hi = W3.layout(s).findIndex(sl => ang >= sl.a0 && ang < sl.a1); }
  const fontOk = !document.fonts || !document.fonts.check || document.fonts.check('30px "Lalezar"');
  const rest = ((Math.round(s.rot) % 360) + 360) % 360;      // labels are laid out for the angle the wheel rests at
  const key = s.o.mode + "|" + (s.o.off || []).join() + "|" + JSON.stringify(L) + "|" + hi + "|" + fontOk + "|" + rest;
  st.locks = L;
  let c = box.querySelector("canvas");
  const draw = () => { const n = w3wheelCanvas(s, L, hi, rest); n.style.transform = `rotate(${s.rot}deg)`; if (c) c.replaceWith(n); else box.querySelector(".wclip").appendChild(n); c = n; st.key = key; };
  if (st.key !== key && s.stage !== "rolling") (document.fonts && document.fonts.load ? document.fonts.load('30px "Lalezar"').catch(() => {}) : Promise.resolve()).then(() => { if (box.isConnected && st.key !== key) draw(); if (!fontOk && box.isConnected) setTimeout(() => { if (box.isConnected && H) renderHost(); else if (box.isConnected && P) playerRender(); }, 50); });
  if (!c){ draw(); }
  if (st.sp !== s.sp){ box.classList.remove("spin"); void box.offsetWidth; box.classList.add("spin"); st.sp = s.sp; w3beep("spin"); }
  box.classList.toggle("rolling", s.stage === "rolling");
  c.style.transform = `rotate(${s.rot}deg)`;
}
const w3team = t => `<b class="t${W3.T[t]}">الفريق ${TEAM[W3.T[t]]}</b>`;
function w3scores(s){
  const g = s.o.goal || 1, card = t => {
    const tm = W3.T[t], dbt = (s.debt || [0, 0])[t], pct = Math.max(0, Math.min(100, (s.sc[t] - dbt) / g * 100)), turn = (s.ph === "play" || s.ph === "final") && s.turn === t;
    return `<div class="w3score ${tm} ${turn ? "turn" : ""} ${s.im[t] ? "shielded" : ""}"><div class="row" style="justify-content:space-between;gap:6px"><span class="tname2">${TEAM[tm]}</span>
      <span class="perks">${s.im[t] ? `<span class="perk" title="حصانة">${wsvg("imm")}</span>` : ""}${s.s2[t] ? `<span class="perk" title="فرصة ثانية">${wsvg("sec")}</span>` : ""}${turn ? `<span class="turnchip">الدور</span>` : ""}</span></div>
      <b class="pts">${s.sc[t].toLocaleString("en")}</b>${dbt ? `<span class="debtchip" title="سلفة الحظ غير المسددة">دين سلفة ${dbt}</span>` : ""}<div class="gbar" role="progressbar" aria-valuemin="0" aria-valuemax="${g}" aria-valuenow="${s.sc[t]}"><i style="width:${pct}%"></i></div></div>`;
  };
  const phase = s.ph === "final" ? `<span class="chip warn">الجولة الختامية · ${s.fin.i + 1} من 2</span>` : s.ph === "tb" ? `<span class="chip warn">المواجهة الفاصلة · ${s.tb.n + 1} من ${W3.TB_MAX}</span>`
    : s.ph === "play" ? `<span class="chip">الجولة ${s.rd + 1}</span>${s.fnow ? `<span class="chip warn">الختامية بعد هذه الجولة</span>` : ""}` : "";
  return `<div class="scores">${card(0)}${card(1)}</div><div class="row w3meta"><span class="muted">الهدف ${(s.o.goal || 0).toLocaleString("en")}</span>${phase}<span class="muted">${W3.MODES[s.o.mode].n}</span></div>`;
}
function w3log(s){
  if (!s.lg.length) return "";
  return w3bidi(`<div class="panel w3log"><h3>آخر النتائج</h3><ul>${s.lg.map(([t, d, k]) => `<li><span class="dot ${W3.T[t]}"></span><span>${TEAM[W3.T[t]]}</span><span class="muted">${esc(W3LOG[k] || k)}</span><b class="${k === "repay" ? "" : d > 0 ? "up" : d < 0 ? "down" : ""}">${k === "repay" ? d : d > 0 ? "+" + d : d < 0 ? "−" + (-d) : "•"}</b></li>`).join("")}</ul></div>`);
}
function w3qhtml(c, host, s){
  const q = c.q || {}, rv = c.ci != null ? c.ci : -1, mine = host && H.priv.wshow && rv < 0 ? H.priv.wp.ci : -1;
  // every screen counts down from the same deadline (shared clock), so the phones keep time even if the host's page sleeps
  const left = s.dl ? Math.max(0, Math.ceil((s.dl - srvNow()) / 1000)) : 0, to = s.to || (s.dl && left <= 0);
  const timer = s.dl || s.to ? `<div class="qclock"><span class="timer ${left <= 5 ? "warn" : ""}">${to ? "0" : left}</span><div class="tbar"><i style="width:${s.tt ? (left / s.tt * 100) : 0}%"></i></div>${to ? `<span class="chip warn">انتهى الوقت${host ? "" : " · بانتظار حكم المقدّم"}</span>` : ""}</div>` : "";
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
  const k = c.k, name = W3.C[k].f || W3.C[k].n, head = `<div class="w3head ${W3COL(k).slice(2)}">${wsvg(k)}<div><b>${esc(name)}</b><span class="muted">${s.ph === "tb" ? "المواجهة الفاصلة" : c.k === "speed" ? "للفريقين" : `دور الفريق ${TEAM[W3.T[t]]}`}</span></div></div>${s.ph === "tb" ? "" : `<p class="w3desc">${W3DESC[k]}</p>`}`;
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
  else if (k === "bet" && (c.st === "low" || c.st === "skipped")){
    const dbt = s.debt[t];
    body = c.st === "skipped" ? `<p class="center">تجاوز ${who} الرهان وانتهى دوره.</p>`
      : `<p class="center">رصيد ${who} أقل من 100 نقطة، فلا يكفي للرهان. الخيارات:</p><ul class="w3list"><li><b>سلفة الحظ (100 من بنك اللعبة):</b> الصحيحة +100 صافية وتُغلق السلفة، والخاطئة تسجّل دينًا بـ100 يُسدَّد تلقائيًا من النقاط القادمة.</li><li><b>سؤال بديل بلا رهان:</b> الصحيحة +200، والخاطئة بلا خصم.</li><li><b>تجاوز الرهان:</b> ينتهي الدور بلا نقاط.</li></ul>${dbt ? `<p class="note warn">لدى ${who} سلفة غير مسددة (${dbt})، فلا تُمنح سلفة جديدة قبل سدادها.</p>` : ""}`;
    btns = host && c.st === "low" ? `<div class="row w3btns">${has("loan") ? w3btn(s, "loan", "سلفة الحظ 100", "") : ""}${w3btn(s, "alt", "سؤال بديل بلا رهان", "ghost")}${w3btn(s, "skip", "تجاوز الرهان", "ghost")}</div>` : "";
  }
  else if (k === "bet" && c.st === "wager"){ body = `<p class="center">يحدد ${who} رهانه (لا يتجاوز نقاطه). الصحيحة تضيف الرهان، والخاطئة تخصمه، والحصانة لا تحمي من الرهان.</p>`; btns = host ? `<div class="row">${c.ws.map(v => w3btn(s, "wager", `رهان ${v}`, "", v)).join("")}</div>` : ""; }
  else if (["q","gold","bet","streak","quick","speed"].includes(k)){
    const pts = k === "speed" ? `+250 للفائز` : k === "bet" ? (c.loan ? `سلفة الحظ: الصحيحة +100، والخاطئة دين 100` : c.alt ? `سؤال بديل بلا رهان: +200` : `الرهان ${c.v}`) : k === "streak" ? `السؤال ${c.n + (c.st === "ask" ? 1 : 0)} من 3 · ${c.v} · المجموع ${c.got}` : k === "quick" ? `السؤال ${Math.min(c.n + (c.st === "ask" ? 1 : 0), 3)} من 3 · 15 ثانية · المجموع ${c.got}` : `+${c.v}`;
    const vs = k === "speed" ? `<div class="vs"><span class="g">الأخضر</span><b>ضد</b><span class="o">البرتقالي</span></div>` : "";
    const verdict = c.st === "shown" || c.st === "right" || c.st === "wrong" || c.st === "cancel"
      ? (k === "speed" ? (c.st === "cancel" ? `<p class="verdict no">أُلغي التحدي · لا نقاط</p>` : c.w >= 0 ? `<p class="verdict ok ${W3.T[c.w]}">فاز الفريق ${TEAM[W3.T[c.w]]}${s.ph === "end" ? " بالمباراة" : " · +250"}</p>` : `<p class="verdict no">لم ينجح أي فريق · لا نقاط</p>`)
        : c.ok ? `<p class="verdict ok ${W3.T[t]}">إجابة صحيحة · +${c.v}${c.loan ? " وأُغلقت السلفة" : ""}</p>`
          : `<p class="verdict no">${s.to ? "انتهى الوقت" : "إجابة خاطئة"}${c.loan ? " · سُجّل دين سلفة 100" : k === "bet" && !c.alt ? ` · −${c.v}` : " · 0"}</p>`) : "";
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
    <p class="v-score"><b>${(s.fs || s.sc)[0].toLocaleString("en")}</b> <span>مقابل</span> <b>${(s.fs || s.sc)[1].toLocaleString("en")}</b></p>
    ${draw ? `<p class="muted">تعادل الفريقان ولم تحسمه ${W3.TB_MAX} تحديات فاصلة.</p>` : ""}
    <table class="vtable"><thead><tr><th></th><th class="g">الأخضر</th><th class="o">البرتقالي</th></tr></thead><tbody>${st("النقاط", s.sc[0], s.sc[1])}${(s.debt || [0, 0]).some(x => x) ? st("سلفة غير مسددة", s.debt[0] ? "−" + s.debt[0] : "0", s.debt[1] ? "−" + s.debt[1] : "0") + st("النتيجة النهائية", (s.fs || s.sc)[0], (s.fs || s.sc)[1]) : ""}${st("الإجابات والتحديات الصحيحة", s.ca[0], s.ca[1])}${st("الأدوار", s.tn[0], s.tn[1])}</tbody></table>
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
  const o = s.o, L = W3.ORDER.filter(k => W3.MODES[o.mode].w[k] > 0).map(k => ({k})), off = o.off || [], od = W3.odds(s);
  const rows = L.map(sl => `<tr class="${off.includes(sl.k) ? "off" : ""}"><td>${wsvg(sl.k, W3COL(sl.k).slice(2))}</td><td><b>${esc(W3.C[sl.k].f || W3.C[sl.k].n)}</b><br><span class="muted">${W3DESC[sl.k]}</span></td>
    <td class="num">${off.includes(sl.k) ? "—" : (od[sl.k] * 100).toFixed(1) + "٪"}</td>
    <td>${W3.C[sl.k].opt ? `<button class="tog ${off.includes(sl.k) ? "" : "on"}" data-h="tog" data-card="${sl.k}" aria-pressed="${!off.includes(sl.k)}" aria-label="${esc(W3.C[sl.k].n)}"><i></i></button>` : `<span class="muted">أساسي</span>`}</td></tr>`).join("");
  return w3bidi(`${o.goal ? "" : `<p class="note warn">اختر هدف الفوز لتبدأ المباراة.</p>`}
    <details class="w3cards" ${H && H.priv.wco ? "open" : ""}><summary>الكروت ونسب ظهورها (${W3.MODES[o.mode].n})</summary><p class="muted">حجم كل شريحة في العجلة يساوي احتمالها. الكرت المعطّل يُحذف من العجلة وتُعاد موازنة النسب.</p>
    <div class="tablewrap"><table class="w3table"><tbody>${rows}</tbody></table></div></details>`);
}
const Wheel = {
  keepState:true, cloudResume:true,
  init: () => W3.init({}),
  canStart: o => W3.GOALS.includes(o.goal),
  env(){ return {R:w3rand, now:srvNow(), q:lv => {
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
      if (s.stage === "rolling" && srvNow() - s.t0 >= (w3motion() ? 4900 : 600)){ if (W3.act(s, H.priv.wp, "land", null, W3.tok(s), Wheel.env())) pushHost(); return; }
      if (W3.tick(s, srvNow())){ if (s.left && s.left <= 5) w3beep("tick"); pushHost(); }
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
function startRaceClock(resume){
  clearInterval(H.priv.tick); if (!resume || !H.s.t0) H.s.t0 = srvNow(); H.priv.tickAt = Date.now(); if (!resume){ H.s.el = 0; H.s.left = H.s.o.lim || -1; }
  const g = H.g;
  H.priv.tick = setInterval(() => {
    if (!H || H.g !== g || H.s.ph !== "play"){ clearInterval(H.priv.tick); return; }
    const el = Math.floor((srvNow() - H.s.t0) / 1000); let ch = false; H.priv.tickAt = Date.now();
    if (el !== H.s.el){ H.s.el = el; ch = true; }
    if (H.s.o.lim){ const l = Math.max(0, H.s.o.lim - el); if (l !== H.s.left){ H.s.left = l; ch = true; } if (!l){ endRace(); return; } }
    if (g === "diff" && el !== H.priv.awayEl){ H.priv.awayEl = el; Diff.watchAway(hostPlayers()); if (H.s.ph !== "play") return; }
    if (ch) pushHost();
  }, 250);
}
function endRace(){
  if (H.g === "diff"){ Diff.finish("time"); return; }       // the shared spot game ends its round itself (points, bonuses)
  clearInterval(H.priv.tick);
  const s = H.s; if (s.ph !== "play") return;
  s.ph = "over"; s.rev = true;
  s.rest = Object.entries(H.priv.prog || {}).filter(([peer]) => !s.fin.some(f => f[3] === peerKey(peer))).map(([, r]) => [r.n, r.v]).sort((a, b) => b[1] - a[1]).slice(0, 20);
  pushHost();
}
function maybeAllDone(players){ const s = H.s, act = activePlayers(players); if (s.ph === "play" && act.length && s.fin.length >= act.length && act.every(p => s.fin.some(f => f[3] === peerKey(p.peer)))) endRace(); }
function finishSec(z){
  const rec = srvNow() - H.s.t0, said = Number.isFinite(+z.at) ? +z.at - H.s.t0 : rec, asleep = Date.now() - (H.priv.tickAt || 0) > 1500;
  return Math.max(0, Math.round((asleep ? said : Math.max(said, rec - 3000)) / 1000));
}
const raceEl = s => s.t0 ? Math.max(0, Math.floor((srvNow() - s.t0) / 1000)) : (s.el || 0);
const clockChip = s => { if (s.t0 && s.ph === "play"){ const el = raceEl(s); s = {...s, el, left:s.o && s.o.lim ? Math.max(0, s.o.lim - el) : -1}; } return clockChipRaw(s); };
const clockChipRaw = s => s.ph === "over" ? `<span class="chip warn">انتهت الجولة</span>` : s.left >= 0 ? `<span class="clock ${s.left <= 10 ? "warn" : ""}">${fmtT(s.left)}</span>` : `<span class="clock">${fmtT(s.el || 0)}</span>`;
function standingsHTML(s, unit, total, pct){
  const rest = (s.rest || []).map(([n, v], i) => `<div><span>${s.fin.length + i + 1}. ${esc(n)}</span><span class="muted">${pct ? `${v}%` : `${v}/${total}`}</span></div>`).join("");
  return `<div class="lb">${s.fin.map((f, i) => `<div><span>${i + 1}. ${esc(f[0])}</span><span class="muted">${fmtT(f[2])} · ${f[1]} ${unit}</span></div>`).join("")}${rest}</div>`;
}

/* ================= PUZZLE ================= */
/* Puzzle board: drag a piece onto another to swap them (finger or mouse), or tap two pieces.
   The board itself has touch-action:none so dragging never scrolls the page. */
function mountPuzzle(el, cfg, onChange, init){
  const n = cfg.n, N = n * n, url = cfg.src === "photo" ? photoURL(cfg.img) : sceneURL(cfg.img);
  let perm = shuffle(range(N), cfg.seed);
  if (perm.every((v, k) => v === k)) [perm[0], perm[1]] = [perm[1], perm[0]];
  // a board saved before a reload or a closed browser continues where it was
  if (init && Array.isArray(init.perm) && init.perm.length === N && [...init.perm].sort((a, b) => a - b).every((v, i) => v === i)) perm = init.perm.slice();
  let sel = -1, mv = init && +init.mv || 0, done = perm.every((v, i) => v === i), locked = false, drag = null;
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
    onChange && onChange({p:Math.round(perm.filter((v, i) => v === i).length / N * 100), d:done, mv, perm:perm.slice()});
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
  // the host came back during a round: the round goes on with the same start time (shared clock)
  async restore(){ if (H.s.ph === "play"){ H.priv.prog = {}; H.priv.mounted = null; startRaceClock(true); } },
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
      if (z.d && !s.fin.some(f => f[3] === peerKey(p.peer)) && s.fin.length < 30){ s.fin.push([pname(p), Math.max(0, +z.mv || 0), finishSec(z), peerKey(p.peer)]); ch = true; }
    }
    if (ch){ s.fin.sort((a, b) => a[2] - b[2] || a[1] - b[1]); pushHost(); maybeAllDone(players); }
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
      const sv = seatProg("pz"), init = sv && sv.rd === s.rd && sv.seed === s.seed ? sv : null;
      if (!over && !init) NR.presence({pz:{rd:s.rd, p:0, d:false, mv:0}}).catch(() => {});
      P.view.pzm = mountPuzzle($("#pPz"), s, z => {
        const pres = {pz:{rd:s.rd, p:z.p, d:z.d, mv:z.mv, at:srvNow()}};
        seatProg("pz", {rd:s.rd, seed:s.seed, perm:z.perm, mv:z.mv}); seatProg("pres", pres);
        NR.presence(pres).catch(() => {});
      }, init);
      if (init && !over){ const pr = seatProg("pres"); if (pr && pr.pz && pr.pz.rd === s.rd) NR.presence(pr).catch(() => {}); }
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
      title:e.t || THEME_AR[e.th] || "صورة", diffs:e.d.map(([x, y, rx, ry, m]) => m ? {x, y, rx, ry, m} : {x, y, rx, ry}), credit:e.c || null, kind:e.k || "photo"};
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
  // the whole library (for the host's picture library): every shard, without the hidden pairs
  async all(){
    const idx = await this.loadIndex(); if (!idx || !idx.shards) return null;
    const out = []; for (const sh of idx.shards){ try { out.push(...(await this.shard(sh.name))); } catch(e){ return null; } }
    return out.filter(e => !this.hidden.has(e.id));
  },
  async get(id, devs){
    const list = await this.all(), e = list && list.find(x => x.id === id); if (!e) return null;
    const seen = await this.seenBy(devs); return {pair:this.norm(e), fresh:!seen.get(id), total:list.length};
  },
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

/* Two synced photo panes with pinch/scroll zoom and drag-to-pan, for the SHARED board.
   The board only reports taps (picture coordinates + the tap tolerance at the current zoom); what was found, missed or
   hinted is drawn from the host's state, never decided here. A tap counts only when the finger did not move, no second
   finger touched, and it is not a repeat of the same touch (browsers sometimes fire one touch twice). */
function mountBoard(el, pair, onTap){
  const W = pair.w, Hh = pair.h;
  el.innerHTML = `<div class="dfbar"><button class="btn ghost sm" data-z="in" aria-label="تكبير">＋</button><button class="btn ghost sm" data-z="out" aria-label="تصغير">－</button><button class="btn ghost sm" data-z="reset">حجم كامل</button></div>
    <div class="dfpair">${[pair.a, pair.b].map((f, i) => `<div class="dfimg" style="aspect-ratio:${W}/${Hh}"><div class="dfzoom"><img src="${esc(f)}" alt="${i ? "الصورة الثانية" : "الصورة الأولى"}" draggable="false"><div class="dfmarks"></div></div></div>`).join("")}</div>`;
  const panes = [...el.querySelectorAll(".dfimg")], zooms = [...el.querySelectorAll(".dfzoom")], marks = [...el.querySelectorAll(".dfmarks")];
  let sc = 1, tx = 0, ty = 0, locked = false, last = null, view = {found:[], rev:null, pend:[]};
  const clamp = () => { const w = panes[0].clientWidth, h = panes[0].clientHeight; sc = Math.min(6, Math.max(1, sc)); tx = Math.min(0, Math.max(w - w * sc, tx)); ty = Math.min(0, Math.max(h - h * sc, ty)); };
  const apply = () => { clamp(); zooms.forEach(z => z.style.transform = `translate(${tx}px,${ty}px) scale(${sc})`); el.classList.toggle("zoomed", sc > 1.01); };
  const zoomAt = (f, px, py) => { const ns = Math.min(6, Math.max(1, sc * f)), k = ns / sc; tx = px - (px - tx) * k; ty = py - (py - ty) * k; sc = ns; apply(); };
  const box = (x, y, rx, ry, cls, extra) => `<span class="dfm ${cls}" style="left:${(x - rx * 1.25) / W * 100}%;top:${(y - ry * 1.25) / Hh * 100}%;width:${rx * 2.5 / W * 100}%;height:${ry * 2.5 / Hh * 100}%">${extra || ""}</span>`;
  const draw = () => {
    let h = (view.found || []).map(f => box(f[0], f[1], f[2], f[3], "")).join("");
    if (view.rev) h += view.rev.map(r => box(r[0], r[1], r[2], r[3], "rev")).join("");
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
      try { pane.setPointerCapture(e.pointerId); } catch(_){} pts.set(e.pointerId, {x:e.clientX, y:e.clientY});
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
const reportBtn = attr => `<button class="btn ghost sm dfreport" ${attr}>إبلاغ عن مشكلة في الصورة</button>`;

/* ================= SPOT THE DIFFERENCE: the same picture for everybody, each player finds the differences alone =================
   Every player looks for ALL the differences on their own: a difference found by one player counts for that player only,
   and stays hidden from the others until the round is over. The first player to find them all wins and the round stops
   for everybody; players who complete within DF_WIN of the first are joint winners.
   The host's device is the referee: the exact places of the differences stay in its private data (H.priv.dfs), it judges
   every tap and keeps every player's record (mistakes, points, status) under the player's name, so a reload, a new tab or
   leaving and joining again finds the same record. WHO WAS FIRST is decided by the moment each tap reached the host's
   device (its own clock, the referee's), never by a time a phone sends: a phone cannot claim to be earlier.
   The room in the database is readable by every phone, so what belongs to one player travels sealed: each device has a
   key pair (ECDH P-256), the host and each phone derive a shared key, and with it (AES-GCM) the phone seals its taps and
   the host seals that player's finds and answers into a "mailbox" seat of the host's. Other phones can read the room but
   see only each player's counts. No change of the database rules is needed. */
const DF_DRAIN = 120;     // ms: taps are judged in the order they reached the host, a moment after they arrive
const DF_WIN = 300;       // ms: players who complete within this time of the first completion share the win
/* how the moment a tap arrived is measured:
   - default: when it reached the host's device (the referee's own clock). Valid with today's database rules.
   - DF_SRV: when the database SERVER received it. Each phone writes its sealed taps to taps/<room>/<its identity> with
     t = the server's time, which the PROPOSED rule enforces (t === now); without that rule a phone could write any t.
     Built only with LAMMA_SRVTIME=1, and only for use with the proposed rules. */
const DF_SRV = /*@@SRVTIME@@*/false;
const DF_MAX_W = 5, DF_PTS = {find:10, all:50, clean:30, miss:5};
const dfZero = n => ({n, f:0, w:0, p:0, out:0, done:0, ft:0, dt:0, da:0, b:0});
// a player's round record is kept under their name (one seat per name in a game), so leaving and joining again,
// a reload or a new tab finds the same mistakes, finds and points
const dfKey = n => "n_" + hashStr(normName(n || ""));
const dfBoxId = k => "mbox_" + k.replace(/[^A-Za-z0-9_-]/g, "");
// [gx0, gy0, cols, "hexrow.hexrow…"] -> centres of the changed 16 px cells (decoded once per difference)
const DF_CELLS = new WeakMap();
function dfCells(d){
  const m = d && d[4]; if (!Array.isArray(m) || typeof m[3] !== "string") return null;
  if (DF_CELLS.has(d)) return DF_CELLS.get(d);
  const out = []; m[3].split(".").forEach((r, j) => { let b = BigInt("0x" + (r || "0")); for (let i = 0; i < m[2] && b; i++, b >>= 1n) if (b & 1n) out.push([(m[0] + i) * 16 + 8, (m[1] + j) * 16 + 8]); });
  const res = out.length ? out : null; DF_CELLS.set(d, res); return res;
}
/* the sealed channel between the host and one player (WebCrypto, available on every current phone browser over https) */
const DFC = {
  ok: () => !!(window.crypto && crypto.subtle && window.isSecureContext !== false),
  b64(u8){ let s = ""; for (let i = 0; i < u8.length; i += 4096) s += String.fromCharCode.apply(null, u8.subarray(i, i + 4096)); return btoa(s); },
  unb64: s => Uint8Array.from(atob(s), c => c.charCodeAt(0)),
  async pair(saved){
    if (saved && saved.pub && saved.jwk){ try { return {pub:saved.pub, saved, priv:await crypto.subtle.importKey("jwk", saved.jwk, {name:"ECDH", namedCurve:"P-256"}, false, ["deriveKey"])}; } catch(e){} }
    const k = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveKey"]);
    const pub = DFC.b64(new Uint8Array(await crypto.subtle.exportKey("raw", k.publicKey))), jwk = await crypto.subtle.exportKey("jwk", k.privateKey);
    return {pub, priv:k.privateKey, saved:{pub, jwk}};
  },
  keys:new Map(),
  shared(me, otherPub){
    const id = me.pub + "|" + otherPub; if (DFC.keys.has(id)) return DFC.keys.get(id);
    const p = (async () => { const op = await crypto.subtle.importKey("raw", DFC.unb64(otherPub), {name:"ECDH", namedCurve:"P-256"}, false, []);
      return crypto.subtle.deriveKey({name:"ECDH", public:op}, me.priv, {name:"AES-GCM", length:256}, false, ["encrypt", "decrypt"]); })();
    DFC.keys.set(id, p); p.catch(() => DFC.keys.delete(id)); return p;
  },
  async seal(key, obj, ad){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM", iv, additionalData:new TextEncoder().encode(ad)}, key, new TextEncoder().encode(JSON.stringify(obj))));
    const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return DFC.b64(out);
  },
  async open(key, str, ad){
    const u = DFC.unb64(str);
    return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM", iv:u.slice(0, 12), additionalData:new TextEncoder().encode(ad)}, key, u.slice(12))));
  },
  // what the sealed text belongs to: direction, room, round and player (a sealed message cannot be replayed elsewhere)
  ad: (dir, code, rd, k) => `lamma-df|${dir}|${code}|${rd}|${k}`,
  _mine:null,
  mine(){   // this device's key pair (a phone keeps it, so a reload reads its mailbox again)
    if (!DFC._mine){ let saved = null; try { saved = JSON.parse(lsGet("lm-dfkey") || "null"); } catch(e){}
      DFC._mine = DFC.pair(saved).then(k => { if (!saved || saved.pub !== k.pub) lsSet("lm-dfkey", JSON.stringify(k.saved)); return k; }); DFC._mine.catch(() => { DFC._mine = null; }); }
    return DFC._mine;
  },
};
const fmtMS = ms => fmtT(Math.max(0, Math.round((ms || 0) / 1000)));
const Diff = {
  savePriv(){ return {played:[...(H.priv.played || [])], playedLv:H.priv.playedLv || {}, dfs:H.priv.dfs || null, seen:H.priv.seen || {}, pf:H.priv.pf || {}, hkp:H.priv.hkp || null, mb:H.priv.mb || [], own:H.priv.own || {}, winAt:H.priv.winAt || 0, frozen:H.priv.frozen || null, hist:H.priv.hist || [], crounds:H.priv.crounds || []}; },
  async restore(pv){
    H.priv.played = new Set(pv.played || []); H.priv.playedLv = pv.playedLv || {}; H.priv.dfs = pv.dfs || null; H.priv.seen = pv.seen || {};
    H.priv.pf = pv.pf || {}; H.priv.hkp = pv.hkp || null; H.priv.mb = pv.mb || []; H.priv.own = pv.own || {}; H.priv.winAt = +pv.winAt || 0; H.priv.frozen = pv.frozen || null;
    H.s.pick = 0;                                                  // the picture library is not open after a reload
    H.priv.hist = Array.isArray(pv.hist) ? pv.hist : []; H.priv.crounds = Array.isArray(pv.crounds) ? pv.crounds : [];
    // a game saved before competitions existed: it is competition 1, with the rounds it already played
    if (!(H.s.cn >= 1)){ H.s.cn = 1; H.s.cr = Math.max(0, ...Object.values(H.s.tot || {}).map(t => +t.r || 0)); H.s.cs = 0; H.s.past = []; }
    H.priv.pk = {}; H.priv.le = {}; H.priv.box = {}; H.priv.qd = new Set(); H.priv.unsealing = 0;
    // records saved by an earlier version (with a hint) are read as they are: the hint parts are simply not used any more
    for (const k of Object.keys(H.s.pl || {})){ const p = H.s.pl[k]; if (p && typeof p === "object"){ delete p.h; for (const f of ["dt", "da"]) if (!Number.isFinite(p[f])) p[f] = 0; } }
    if (H.s.ph === "play" && H.s.pair && H.priv.dfs){ H.priv.dfRd = null; H.priv.dfq = []; Diff.hostKey(); startRaceClock(true); if (H.priv.winAt) Diff.armClose(); }      // the round goes on
    else if (H.s.ph === "play" || H.s.ph === "prep") H.s.ph = "lobby";
  },
  init: () => ({rd:0, pair:null, nd:0, lv:1, fresh:true, pl:{}, rev:null, pf:null, rk:null, win:null, rn:null, tot:{}, end:"", hk:"", cn:1, cr:0, cs:0, past:[], sp:0}),
  /* every move of the game (a round prepared, played, ended, a new competition) is one step further: the database copy is
     written at once, and after a reload the copy that went further wins (stateOrder) */
  step(s){ s.sp = (+s.sp || 0) + 1; s.step = 0; },
  // the host's key pair: kept in its private saved data, so after a reload the phones' sealed messages still open
  hostKey(){
    if (!DFC.ok()) return Promise.reject(new Error("no crypto"));
    if (!H.priv.hkP){ H.priv.hkP = DFC.pair(H.priv.hkp).then(k => { if (!H) return k; H.priv.hkp = k.saved; if (H.s.hk !== k.pub){ H.s.hk = k.pub; pushHost(); } return k; }); H.priv.hkP.catch(() => { if (H) H.priv.hkP = null; }); }
    return H.priv.hkP;
  },
  pf(k){ const a = H.priv.pf || (H.priv.pf = {}); return a[k] || (a[k] = {fi:[], lr:[]}); },
  async start(replay, chosen){
    if (H.priv.picking) return;
    H.priv.pk = null; H.s.pick = 0;                                  // the picture library closes
    const s = H.s, rd = s.rd + 1;
    Diff.clearBoxes(); Diff.tapsClear(); clearTimeout(H.priv.closeT); H.priv.closeT = null;
    s.rd = rd; s.ph = "prep"; Diff.step(s); s.pl = {}; s.rev = null; s.pf = null; s.rk = null; s.win = null; s.rn = null; s.end = ""; s.pair = null;
    H.priv.dfs = null; H.priv.seen = {}; H.priv.dfq = []; H.priv.pf = {}; H.priv.le = {}; H.priv.box = {}; H.priv.qd = new Set(); H.priv.winAt = 0; H.priv.frozen = null;
    pushHost();
    const devs = [devId, ...hostPlayers().map(p => p.presence.dv).filter(d => typeof d === "string" && /^[a-z0-9]{10,24}$/.test(d))].slice(0, 40);
    let r; H.priv.picking = true;
    const played = H.priv.played || (H.priv.played = new Set());
    if (replay){ for (const id of [...played]) if (Spot.levelOk(s.o.lv, (H.priv.playedLv || {})[id])) played.delete(id); }
    try { await Diff.hostKey(); r = chosen ? await Spot.get(chosen, devs) : await Spot.pick(s.o.lv, devs, played); } catch(e){ console.warn(e); r = null; }
    if (H) H.priv.picking = false;
    if (!H || H.g !== "diff" || H.s.rd !== rd) return;
    if (!r){ s.ph = "fail"; pushHost(); return; }
    if (r.done){ s.ph = "done"; pushHost(); return; }   // this room has played every pair of this level
    const p = r.pair;
    H.priv.dfs = p.diffs.map(d => d.m ? [d.x, d.y, d.rx, d.ry, d.m] : [d.x, d.y, d.rx, d.ry]);                              // the answer stays on this device
    s.pair = {id:p.id, level:p.level, w:p.w, h:p.h, a:p.a, b:p.b, title:p.title, credit:p.credit, kind:p.kind};
    s.nd = p.diffs.length; s.lv = p.level; s.fresh = r.fresh; H.priv.total = r.total;
    Spot.markSeen(p.id, devs); played.add(p.id); (H.priv.playedLv = H.priv.playedLv || {})[p.id] = p.level;
    pushHost();
    try { await preloadSpot(p); } catch(e){ console.warn(e); }
    if (!H || H.g !== "diff" || H.s.rd !== rd) return;
    s.ph = "play"; Diff.step(s); Diff.enroll(hostPlayers()); startRaceClock(); pushHost();
  },
  // everybody in the room when the round starts (or who joins during it) plays this round
  enroll(players){ const s = H.s; let ch = false; for (const p of players){ const k = dfKey(pname(p)); if (!s.pl[k] && !p.away){ s.pl[k] = dfZero(pname(p)); ch = true; } } return ch; },
  act(a, b){
    const s = H.s;
    if (a === "start" || a === "go"){ if (s.o.pk === "auto") Diff.start(); else Diff.openPick(); }
    else if (a === "pkclose"){ H.priv.pk = null; s.pick = 0; H.priv.dfRd = null; $("#hostMain").dataset.k = ""; pushHost(); }
    else if (a === "pklv" && H.priv.pk){ H.priv.pk.lv = +b.dataset.lv; H.priv.pk.ask = ""; renderHost(); }
    else if (a === "pkauto"){ Diff.start(); }
    else if (a === "dfpick" && H.priv.pk){ const id = b.dataset.id || "";
      if ((H.priv.played || new Set()).has(id) && H.priv.pk.ask !== id){ H.priv.pk.ask = id; renderHost(); const x = $("#dfPkAsk"); if (x) x.scrollIntoView({block:"center", behavior:"smooth"}); }
      else Diff.start(false, id); }
    else if (a === "pkok" && H.priv.pk && H.priv.pk.ask) Diff.start(false, H.priv.pk.ask);
    else if (a === "pkno" && H.priv.pk){ H.priv.pk.ask = ""; renderHost(); }
    else if (a === "end") Diff.finish("host");
    else if (a === "lobby"){ clearInterval(H.priv.tick); s.ph = "lobby"; pushHost(); }
    else if (a === "dfhretry"){ H.priv.dfRd = null; renderHost(); }
    else if (a === "replay") Diff.start(true);
    else if (a === "dfsel" && b){ H.priv.dfSel = b.dataset.k || ""; renderHost(); }
    else if (a === "nc"){ H.priv.ncAsk = true; renderHost(); }
    else if (a === "ncno"){ H.priv.ncAsk = false; renderHost(); }
    else if (a === "ncgo"){ H.priv.ncAsk = false; Diff.newComp(); }
    else if (a === "dfcsv"){ const cn = +((b && b.dataset.cn) || s.cn), c = cn === s.cn ? Diff.compNow() : (H.priv.hist || []).find(x => x.cn === cn);
      if (c) Diff.download(`lamma-spot-competition-${c.cn}-${new Date(c.to || Date.now()).toISOString().slice(0, 10)}.csv`, Diff.csv(c)); }
    else if (a === "dfreport" && s.pair && s.ph === "over"){ Spot.report(s.pair.id).then(() => { const x = $("#hostMain .dfreport"); if (x){ x.textContent = "وصل البلاغ للمراجعة (لا تُخفى الصورة تلقائيًا)"; x.disabled = true; } }).catch(() => {}); }
  },
  /* ---------- the host's picture library: the host chooses the next picture (the default), or lets the game choose ---------- */
  async openPick(){
    const s = H.s; if (H.priv.picking) return;
    H.priv.pk = {open:true, lv:s.o.lv, q:"", ask:"", list:null, seen:null, err:false}; s.pick = 1; pushHost();
    const devs = [devId, ...hostPlayers().map(p => p.presence.dv).filter(d => typeof d === "string" && /^[a-z0-9]{10,24}$/.test(d))].slice(0, 40);
    let list = null, seen = null; try { [list, seen] = await Promise.all([Spot.all(), Spot.seenBy(devs)]); } catch(e){ console.warn(e); }
    if (!H || !H.priv.pk || !H.priv.pk.open) return;
    H.priv.pk.list = list; H.priv.pk.seen = seen || new Map(); H.priv.pk.err = !list; renderHost();
  },
  // a picture's state for this room: used in this competition, seen before on a device of the room, or new
  pkState(id){ const pk = H.priv.pk; return (H.priv.played || new Set()).has(id) ? "used" : pk && pk.seen && pk.seen.get(id) ? "seen" : "new"; },
  pickHTML(s){
    const pk = H.priv.pk, lvs = [[0, "سهل"], [1, "متوسط"], [2, "صعب"], [3, "الكل"]];
    if (!pk.list) return `<div class="panel center stack" style="margin-top:18px">${pk.err ? `<p class="bigmsg">تعذّر تحميل مكتبة الصور</p><div class="row" style="justify-content:center"><button class="btn" data-h="go">إعادة المحاولة</button><button class="btn ghost" data-h="pkauto">اختيار تلقائي</button><button class="btn ghost" data-h="pkclose">رجوع</button></div>` : `<div class="spinner"></div><p class="bigmsg">جارٍ تحميل مكتبة الصور…</p>`}</div>`;
    const ST = {new:"جديدة", seen:"شوهدت سابقًا على أجهزة الغرفة", used:"استُخدمت في هذه المنافسة"}, O = {new:0, seen:1, used:2};
    const list = pk.list.filter(e => Spot.levelOk(pk.lv, e.l)).sort((a, b) => (O[Diff.pkState(a.id)] - O[Diff.pkState(b.id)]) || a.l - b.l);
    const cnt = st => list.filter(e => Diff.pkState(e.id) === st).length;
    const ask = pk.ask && pk.list.find(e => e.id === pk.ask);
    const card = e => { const st = Diff.pkState(e.id), t = e.t || THEME_AR[e.th] || "صورة";
      return `<button class="dfpk-c ${st}" data-h="dfpick" data-id="${esc(e.id)}" data-t="${esc(normName(t))}"><span class="dfpk-im"><img loading="lazy" src="${SPOT_CDN}thumbs/${esc(e.id)}.webp" alt=""></span>
        <span class="dfpk-t">${esc(t)}</span><span class="dfpk-m">${LV_NAMES[e.l]} · ${e.d.length} ${e.d.length > 10 ? "اختلافًا" : "اختلافات"}</span><span class="chip dfpk-s ${st}">${ST[st]}</span></button>`; };
    return `<div class="panel stack dfpicker" style="margin-top:18px">
      <div class="row" style="justify-content:space-between"><h2 class="dfpk-h">اختر صورة الجولة</h2><button class="btn ghost sm" data-h="pkclose">رجوع</button></div>
      <p class="muted dfnote">الصور المصغّرة من الصورة الأصلية فقط، ولا تظهر فيها الاختلافات. يرى اللاعبون أنك تختار الصورة.</p>
      ${ask ? `<div class="panel stack dfnc" id="dfPkAsk" role="alertdialog"><p><b>«${esc(ask.t || "صورة")}»</b> استُخدمت في هذه المنافسة. هل تريد استخدامها مرة أخرى؟</p><div class="row"><button class="btn" data-h="pkok">نعم، استخدمها</button><button class="btn ghost" data-h="pkno">إلغاء</button></div></div>` : ""}
      <div class="row dfpk-f"><div class="seg wrap">${lvs.map(([v, l]) => `<button class="${pk.lv === v ? "on" : ""}" data-h="pklv" data-lv="${v}">${l}</button>`).join("")}</div>
        <input class="field dfpk-q" id="dfq" type="search" placeholder="ابحث باسم المشهد" aria-label="ابحث باسم المشهد" autocomplete="off"></div>
      <div class="row dfpk-sum"><span class="muted"><b>${list.length}</b> صورة · جديدة ${cnt("new")} · شوهدت ${cnt("seen")} · استُخدمت ${cnt("used")}</span><button class="btn ghost sm" data-h="pkauto">اختيار تلقائي لهذه الجولة</button></div>
      <div class="dfpk-grid">${list.map(card).join("") || `<p class="muted">لا توجد صور في هذا المستوى.</p>`}</div><p class="muted dfpk-none" hidden>لا توجد صورة بهذا الاسم.</p></div>`;
  },
  // the search filters the cards in place (no new drawing: the typing is never interrupted)
  pickFilter(){
    const inp = $("#dfq"), pk = H.priv.pk; if (!inp || !pk) return;
    if (!inp.dataset.b){ inp.dataset.b = "1"; inp.value = pk.q || ""; inp.oninput = () => { pk.q = inp.value; Diff.pickFilter(); }; }
    const q = normName(pk.q || ""); let n = 0;
    document.querySelectorAll("#hostMain .dfpk-c").forEach(c => { const on = !q || (c.dataset.t || "").includes(q); c.hidden = !on; n += on; });
    const none = $("#hostMain .dfpk-none"); if (none) none.hidden = n > 0;
  },
  /* ---------- competitions: the host closes one and opens the next without anybody leaving the room ---------- */
  // the summary of the competition now running (what is exported, and what is archived when a new one starts)
  compNow(){
    const s = H.s, T = s.tot || {}, ks = Diff.totOrder(T), rn = Diff.totRanks(T), at = Date.now();
    return {cn:s.cn || 1, from:s.cs || at, to:at, r:s.cr || 0, rank:ks.map(k => ({n:T[k].n, rk:rn[k], p:T[k].p, r:T[k].r, w:T[k].w || 0, f:T[k].f})), rounds:(H.priv.crounds || []).slice(-100)};
  },
  newComp(){
    const s = H.s;
    // a round being played is ended first and counted in the competition it belongs to; a round being prepared is dropped
    if (s.ph === "play"){ Diff.drain(true); Diff.finish("host"); }
    else if (s.ph === "prep"){ s.rd++; H.priv.dfs = null; }        // the pending start sees another round number and stops
    clearInterval(H.priv.tick); clearTimeout(H.priv.closeT); H.priv.closeT = null;
    const c = Diff.compNow();
    if (c.rank.length){
      H.priv.hist = [...(H.priv.hist || []), c].slice(-6);
      s.past = [...(s.past || []), {cn:c.cn, at:c.to, r:c.r, top:c.rank.slice(0, 3).map(x => [x.n, x.p, x.rk])}].slice(-2);
    }
    s.cn = (s.cn || 1) + 1; s.cr = 0; s.cs = 0; s.tot = {}; H.priv.crounds = [];
    H.priv.played = new Set(); H.priv.playedLv = {};                // the pictures of this competition start again
    s.ph = "lobby"; s.pl = {}; s.rk = null; s.rn = null; s.win = null; s.rev = null; s.pf = null; s.end = ""; Diff.step(s);
    pushHost();
  },
  csv(c){
    // a spreadsheet file (Excel opens it in Arabic): text that could be read as a formula is kept as text
    const q = v => { let t = String(v == null ? "" : v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
    const d = t => t ? new Date(t).toLocaleString("ar-SA-u-nu-latn", {dateStyle:"medium", timeStyle:"short"}) : "";
    const rows = [["لمّة · اكتشف الفرق"], ["المنافسة", c.cn], ["من", d(c.from)], ["إلى", d(c.to)], ["عدد الجولات", c.r], [],
      ["المركز", "اللاعب", "النقاط", "الجولات", "مرات الفوز", "الاختلافات"], ...c.rank.map(x => [x.rk, x.n, x.p, x.r, x.w, x.f]), [],
      ["الجولة", "الصورة", "المستوى", "الفائز"], ...(c.rounds || []).map((x, i) => [i + 1, x.t, LV_NAMES[x.lv] || "", x.w && x.w.length ? x.w.join(" و ") : "لا فائز"])];
    return "\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n");
  },
  download(name, text){
    try { const a = document.createElement("a"), u = URL.createObjectURL(new Blob([text], {type:"text/csv;charset=utf-8"}));
      a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 2000); } catch(e){ console.warn(e); }
  },
  rounds: n => n === 1 ? "جولة واحدة" : n === 2 ? "جولتان" : n >= 3 && n <= 10 ? `${n} جولات` : `${n} جولة`,
  // asking before a new competition: who leads now, what is kept, what is reset
  ncHTML(s){
    const T = s.tot || {}, ks = Diff.totOrder(T), L = ks[0] && T[ks[0]], live = s.ph === "play" || s.ph === "prep";
    return `<div class="panel stack dfnc" role="alertdialog" aria-labelledby="dfncT"><h3 id="dfncT">بدء منافسة جديدة؟</h3>
      <p>${L ? `المتصدّر الآن: <b>${esc(L.n)}</b> بـ <b>${L.p}</b> نقطة، بعد ${Diff.rounds(s.cr || 0)}.` : "لم تُحتسب أي جولة في هذه المنافسة بعد."}</p>
      <p class="muted">تُحفظ نتيجة المنافسة ${s.cn || 1} ويمكن تنزيلها، ثم تبدأ النقاط من صفر. يبقى اللاعبون في الغرفة بأسمائهم.</p>
      ${live ? `<p class="note">الجولة جارية: ستنتهي الآن وتُحتسب في المنافسة الحالية، ثم تبدأ المنافسة الجديدة.</p>` : ""}
      <div class="row"><button class="btn" data-h="ncgo">${live ? "إنهاء الجولة واحتسابها ثم بدء منافسة جديدة" : "نعم، ابدأ منافسة جديدة"}</button><button class="btn ghost" data-h="ncno">إلغاء</button></div></div>`;
  },
  // the host's competition panel (in the settings): this competition's ranking, a new competition, the earlier ones
  compHTML(s){
    const T = s.tot || {}, ks = Diff.totOrder(T), rn = Diff.totRanks(T), hist = (H.priv.hist || []).slice().reverse();
    const table = ks.length ? `<div class="tbl"><table class="htable dfres dftot"><tr><th>#</th><th>اللاعب</th><th>الجولات</th><th>مرات الفوز</th><th>النقاط</th></tr>${ks.map(k => `<tr><td class="dfrank">${rn[k]}</td><td class="dfname">${esc(T[k].n)}</td><td>${T[k].r}</td><td>${T[k].w || 0}</td><td class="dfpts"><b>${T[k].p}</b></td></tr>`).join("")}</table></div>` : `<p class="muted">لم تُلعب جولة في هذه المنافسة بعد.</p>`;
    const past = hist.length ? `<div class="stack dfpast"><b>المنافسات السابقة في هذه الغرفة</b>${hist.map(c => { const w = c.rank.filter(x => x.rk === 1);
      return `<div class="row dfpast-i"><span>المنافسة ${c.cn} · ${Diff.rounds(c.r)} · الفائز: <b>${w.map(x => esc(x.n)).join(" و ") || "—"}</b>${w[0] ? ` (${w[0].p} نقطة)` : ""}</span><button class="btn ghost sm" data-h="dfcsv" data-cn="${c.cn}">تنزيل</button></div>`; }).join("")}</div>` : "";
    return `<div class="panel stack dfcomp"><div class="row" style="justify-content:space-between"><h3>المنافسة ${s.cn || 1}</h3>${s.cr ? `<span class="muted">${Diff.rounds(s.cr)}</span>` : ""}</div>${table}
      ${H.priv.ncAsk ? Diff.ncHTML(s) : `<div class="row"><button class="btn ghost sm" data-h="nc">منافسة جديدة</button>${ks.length ? `<button class="btn ghost sm" data-h="dfcsv" data-cn="${s.cn || 1}">تنزيل النتائج</button>` : ""}</div>`}${past}</div>`;
  },
  // a phone waiting in the lobby: which competition, and how the last one ended
  plobby(s){
    const last = (s.past || [])[(s.past || []).length - 1], fresh = !(s.cr > 0);
    const w = last && last.top.filter(x => x[2] === 1);
    return `${s.pick ? `<p class="dfwait">المقدّم يختار صورة الجولة…</p>` : ""}<p class="chip dfcn">المنافسة ${s.cn || 1}</p>${fresh && last ? `<p class="dfpast-n">انتهت المنافسة ${last.cn} بعد ${Diff.rounds(last.r)}. الفائز: <b>${w.map(x => esc(x[0])).join(" و ")}</b> (${w[0] ? w[0][1] : 0} نقطة).<br>النقاط بدأت من جديد.</p>` : ""}${Diff.standHTML(s, P ? dfKey(P.name) : "")}`;
  },
  // the referee: one tap of one player (at = when it reached this device), against that player's own finds only
  judge(k, x, y, tol, id, at){
    const s = H.s, D = H.priv.dfs, pr = s.pl[k];
    if (s.ph !== "play" || !D || !pr) return;
    if (H.priv.winAt && at > H.priv.winAt + DF_WIN) return;              // reached the host after the round was won: not counted
    const pf = Diff.pf(k);
    // after the first completion the window only settles OTHER COMPLETIONS that arrived at nearly the same moment:
    // no other find, mistake or anything else is counted, so nobody gets extra time to play
    const settling = !!H.priv.winAt && at > H.priv.winAt;
    const res = code => { pf.lr = [...(pf.lr || []), [id, code, x, y]].slice(-6); };
    if (pr.out || pr.done){ if (!settling) res(pr.out ? "out" : "done"); return; }
    if (settling && pr.f < s.nd - 1) return;                              // could not complete with this tap: not counted
    const W = s.pair.w, Hh = s.pair.h; if (!(x >= 0 && y >= 0 && x <= W && y <= Hh)) return;     // outside the picture: nothing
    const T = Math.min(0.025 * W, Math.max(0.008 * W, +tol || 0));
    const inBox = (d, t) => Math.abs(x - d[0]) <= d[2] + t && Math.abs(y - d[1]) <= d[3] + t;
    // the exact area: the cells of the picture that really changed (16 px of 1600), not the whole box around them
    const onDiff = (d, t) => { const c = dfCells(d); if (!c) return inBox(d, t);
      for (const [cx, cy] of c){ const dx = Math.max(0, Math.abs(x - cx) - 8), dy = Math.max(0, Math.abs(y - cy) - 8); if (dx * dx + dy * dy <= t * t) return true; } return false; };
    const mine = new Set(pf.fi);
    const again = pf.fi.some(i => inBox(D[i], T));                       // a tap on a difference I already found: never a mistake
    const open = D.map((d, i) => i).filter(i => !mine.has(i));
    const exact = open.filter(i => onDiff(D[i], 0)), near = open.filter(i => onDiff(D[i], T));
    let hit = -1;
    if (exact.length) hit = exact.sort((a, b) => Math.hypot(x - D[a][0], y - D[a][1]) - Math.hypot(x - D[b][0], y - D[b][1]))[0];
    else if (near.length === 1) hit = near[0];
    else if (near.length > 1){ if (!settling) res("amb"); return; }       // two differences under one fingertip: zoom in, no mistake
    if (settling && hit < 0) return;                                      // in the window a miss is not counted either
    if (hit < 0 && again){ res("dup"); return; }
    if (hit >= 0){
      if (!H.priv.winAt && pr.f + 1 >= s.nd) H.priv.frozen = JSON.parse(JSON.stringify(s.pl));   // what everybody saw before the first completion
      pf.fi.push(hit); pr.f = pf.fi.length; pr.p += DF_PTS.find; pr.ft = Math.max(0, at - s.t0); res("ok");
      if (pr.f >= s.nd){                                                  // this player found them all
        pr.done = 1; pr.dt = pr.ft; pr.da = at; pr.p += DF_PTS.all; pr.b += DF_PTS.all;
        if (!H.priv.winAt){ H.priv.winAt = at; saveHost(); Diff.armClose(); }   // the first to complete: the round closes DF_WIN later
      }
      return;
    }
    pr.w++; pr.p = Math.max(0, pr.p - DF_PTS.miss); res("no");
    if (pr.w >= DF_MAX_W) pr.out = 1;
    Diff.checkEnd();
  },
  // the closing: DF_WIN after the first completion reached the host, every tap that reached it before then is judged
  // (a sealed tap still being opened is waited for, up to 3 s), then the round ends for everybody
  armClose(){
    if (!H || H.priv.closeT || !H.priv.winAt) return;
    const t0 = Date.now(), go = () => {
      if (!H || H.g !== "diff" || H.s.ph !== "play"){ if (H) H.priv.closeT = null; return; }
      if ((H.priv.unsealing || 0) > 0 && Date.now() - t0 < 3000){ H.priv.closeT = setTimeout(go, 40); return; }
      H.priv.closeT = null; Diff.drain(true); Diff.finish("win");
    };
    H.priv.closeT = setTimeout(go, Math.max(0, H.priv.winAt + DF_WIN - srvNow()) + (DF_SRV ? 700 : 20));
  },
  // nobody can play any more (everybody used their 5 attempts): the round ends
  checkEnd(){
    const s = H.s; if (s.ph !== "play" || H.priv.winAt) return;
    const keys = Object.keys(s.pl); if (!keys.length) return;
    if (keys.every(k => s.pl[k].out)) Diff.finish(keys.length === 1 ? "solo" : "out");
  },
  // players who can still play but all stepped away: wait a minute, then end (no round left hanging)
  watchAway(players){
    const s = H.s; if (s.ph !== "play" || !Object.keys(s.pl).length || s.pl.host || H.priv.winAt) return;
    const here = new Set(activePlayers(players).map(p => dfKey(pname(p))));
    const able = Object.keys(s.pl).filter(k => !s.pl[k].out && !s.pl[k].done && here.has(k));
    if (able.length){ H.priv.awayAt = 0; return; }
    if (!H.priv.awayAt) H.priv.awayAt = Date.now();
    else if (Date.now() - H.priv.awayAt > 60000) Diff.finish("away");
  },
  /* the order of the round: the winners first (all rank 1), then the others by more differences, fewer mistakes,
     more points, and who reached their last find first (times measured on the host's device) */
  rank(s){
    const keys = Object.keys(s.pl), win = new Set(s.win || []);
    const ord = (a, b) => { const x = s.pl[a], y = s.pl[b];
      return (win.has(b) - win.has(a)) || (win.has(a) && win.has(b) ? (x.da - y.da) || (y.p - x.p) : 0)
        || (y.f - x.f) || (x.w - y.w) || (y.p - x.p) || ((x.ft || 9e12) - (y.ft || 9e12)); };
    const rk = keys.sort(ord), rn = {}; let n = 0;
    rk.forEach((k, i) => { if (win.has(k)) rn[k] = 1; else { n = i + 1; rn[k] = n; } });
    return {rk, rn};
  },
  finish(why){
    const s = H.s; if (s.ph !== "play") return;                          // a round ends once: no bonus or result is counted twice
    clearInterval(H.priv.tick); clearTimeout(H.priv.dfT); H.priv.dfT = null; clearTimeout(H.priv.closeT); H.priv.closeT = null;
    s.ph = "over"; Diff.step(s);
    const close = H.priv.winAt ? H.priv.winAt + DF_WIN : 0;
    s.win = close ? Object.keys(s.pl).filter(k => s.pl[k].done && s.pl[k].da && s.pl[k].da <= close) : [];
    s.end = s.win.length ? "win" : (why || "");
    // only now every difference, and who found which, becomes public
    s.rev = (H.priv.dfs || []).map(d => d.slice(0, 4));
    s.pf = {}; for (const k of Object.keys(s.pl)) s.pf[k] = Diff.pf(k).fi.slice();
    for (const k of Object.keys(s.pl)){ const p = s.pl[k]; if (p.f > 0 && !p.w && !p.out){ p.p += DF_PTS.clean; p.b += DF_PTS.clean; } }
    const r = Diff.rank(s); s.rk = r.rk; s.rn = r.rn;
    const tot = s.tot || (s.tot = {}), before = Diff.totRanks(tot);
    for (const k of s.rk){ const p = s.pl[k], t = tot[k] || (tot[k] = {n:p.n, p:0, r:0, f:0, w:0}); t.n = p.n; t.p += p.p; t.r++; t.f += p.f; t.w = (t.w || 0) + (s.win.includes(k) ? 1 : 0); }
    // what this round changed in the overall ranking: the place before it (0 = first round) and the points it added
    for (const k of Object.keys(tot)){ tot[k].pr = before[k] || 0; tot[k].dp = s.pl[k] ? s.pl[k].p : 0; }
    // the round belongs to the competition now running (its number travels with the state: nothing is added to another)
    s.cr = (+s.cr || 0) + 1; if (!s.cs) s.cs = Date.now();
    const cr = H.priv.crounds || (H.priv.crounds = []);
    cr.push({rd:s.rd, t:s.pair ? s.pair.title : "", id:s.pair ? s.pair.id : "", lv:s.lv, end:s.end, w:s.win.map(k => s.pl[k].n), at:Date.now()}); if (cr.length > 100) cr.splice(0, cr.length - 100);
    H.priv.dfSel = ""; H.priv.dfq = []; H.priv.frozen = null;
    Diff.clearBoxes(); Diff.tapsClear();
    pushHost();
  },
  // sealed taps from the phones: the moment each reaches this device is noted at once, then they are opened and judged
  // DF_SRV only: the host follows taps/<room> (the server-stamped taps)
  tapsWatch(){
    const db = DF_SRV ? fbdb() : null; if (!db || !H || !H.code) return;
    const room = ROOM_PREFIX + H.code; if (H.priv.tapsRoom === room) return;
    H.priv.tapsRoom = room;
    db.ref("taps/" + room).on("value", sn => { if (!H || H.g !== "diff") return; H.priv.taps = sn.val() || {}; if (H.s.ph === "play") Diff.hostPeers(hostPlayers()); }, () => {});
  },
  tapsClear(){
    const db = DF_SRV ? fbdb() : null; if (!db || !H || !H.code) return;
    const r = db.ref("taps/" + ROOM_PREFIX + H.code); for (const id of Object.keys(H.priv.taps || {})) try { r.child(id).remove().catch(() => {}); } catch(e){}
    H.priv.taps = {};
  },
  hostPeers(players){
    const s = H.s; if (s.ph !== "play") return;
    if (DF_SRV) Diff.tapsWatch();
    const now = srvNow();
    let ch = Diff.enroll(players);
    const pk = H.priv.pk || (H.priv.pk = {}), le = H.priv.le || (H.priv.le = {});
    for (const p of players){
      const z = p.presence.df; if (!z || z.rd !== s.rd || typeof z.pk !== "string" || z.pk.length > 200) continue;
      const k = dfKey(pname(p));
      // a player's record belongs to the device identity that first played under that name (the database guarantees a
      // seat's identity): another device taking the same name cannot read or play that record
      const own = H.priv.own || (H.priv.own = {});
      if (p.uid){ if (own[k] && own[k] !== p.uid) continue; if (!own[k]){ own[k] = p.uid; } }
      if (!s.pl[k]){ s.pl[k] = dfZero(pname(p)); ch = true; }
      if (pk[k] !== z.pk){ pk[k] = z.pk; (H.priv.box || (H.priv.box = {}))[k] = ""; Diff.flush(); }        // a new key (new device): seal its record again
      const tp = DF_SRV && p.uid ? (H.priv.taps || {})[p.uid] : null;          // server-stamped taps (proposed rules only)
      if (tp && typeof tp.e === "string" && tp.e.length < 6000 && Number.isFinite(+tp.t) && le[k] !== tp.e){ le[k] = tp.e; Diff.unseal(k, z.pk, tp.e, +tp.t, s.rd); }
      else if (!DF_SRV && typeof z.e === "string" && z.e.length < 6000 && le[k] !== z.e){ le[k] = z.e; Diff.unseal(k, z.pk, z.e, now, s.rd); }
    }
    Diff.watchAway(players);
    if (ch) Diff.publish();
  },
  // nothing new is published while the closing window is open: the phones see the result only when it is final
  publish(){ if (H.priv.winAt && H.s.ph === "play") return; pushHost(); Diff.flush(); },
  async unseal(k, pub, e, arr, rd){
    let m; H.priv.unsealing = (H.priv.unsealing || 0) + 1;
    try { const hk = await Diff.hostKey(); m = await DFC.open(await DFC.shared(hk, pub), e, DFC.ad("up", H.code, rd, k)); } catch(err){ m = null; }   // not sealed for this player: ignored
    finally { if (H) H.priv.unsealing = Math.max(0, (H.priv.unsealing || 1) - 1); }
    if (!H || H.g !== "diff" || H.s.rd !== rd || H.s.ph !== "play" || !m) return;
    const seen = H.priv.seen || (H.priv.seen = {}), sn = seen[k] || (seen[k] = []), q = H.priv.dfq || (H.priv.dfq = []), qd = H.priv.qd || (H.priv.qd = new Set());
    for (const t of Array.isArray(m.q) ? m.q.slice(-8) : []){
      if (!Array.isArray(t) || typeof t[0] !== "string" || t[0].length > 16 || sn.includes(t[0]) || qd.has(k + "|" + t[0])) continue;
      qd.add(k + "|" + t[0]);
      q.push({k, id:t[0], x:+t[1], y:+t[2], tol:+t[3], at:arr});             // the phone's own time is not used for the order
    }
    if (q.length && !H.priv.dfT) H.priv.dfT = setTimeout(() => Diff.drain(), DF_DRAIN);
  },
  drain(closing){
    if (!H || H.g !== "diff") return;
    clearTimeout(H.priv.dfT); H.priv.dfT = null;
    const q = (H.priv.dfq || []).sort((a, b) => a.at - b.at); H.priv.dfq = [];
    const seen = H.priv.seen || (H.priv.seen = {});
    for (const t of q){
      const sn = seen[t.k] || (seen[t.k] = []); if (sn.includes(t.id)) continue;
      sn.push(t.id); if (sn.length > 60) sn.shift(); if (H.priv.qd) H.priv.qd.delete(t.k + "|" + t.id);
      Diff.judge(t.k, t.x, t.y, t.tol, t.id, t.at);
    }
    if (!closing) Diff.publish();
  },
  /* each player's own finds and answers, sealed for that player alone, in a mailbox seat of the host's
     (written only when it changed; the seats are removed when the round ends) */
  async flush(){
    if (H && H.priv && H.priv.winAt && H.s.ph === "play") return;
    if (!H || H.g !== "diff" || !NR || !NR.box || H.priv.flushing){ if (H && H.priv) H.priv.flushAgain = true; return; }
    H.priv.flushing = true; H.priv.flushAgain = false;
    try {
      const s = H.s, D = H.priv.dfs, rd = s.rd, hk = await Diff.hostKey();
      if (s.ph === "play" && D) for (const k of Object.keys(s.pl)){
        const pub = (H.priv.pk || {})[k]; if (!pub) continue;
        const pf = Diff.pf(k), body = {f:pf.fi.map(i => [i, D[i][0], D[i][1], D[i][2], D[i][3]]), lr:pf.lr || []};
        const sig = pub + JSON.stringify(body), box = H.priv.box || (H.priv.box = {});
        if (box[k] === sig) continue;
        const e = await DFC.seal(await DFC.shared(hk, pub), body, DFC.ad("down", H.code, rd, k));
        if (!H || H.s.rd !== rd || H.s.ph !== "play") break;
        const id = dfBoxId(k); await NR.box(id, {r:"m", rd, k, e}); box[k] = sig;
        if (!(H.priv.mb || (H.priv.mb = [])).includes(id)){ H.priv.mb.push(id); saveHost(); }
      }
    } catch(e){ console.warn(e); }
    if (H && H.priv){ H.priv.flushing = false; if (H.priv.flushAgain) setTimeout(Diff.flush, 50); }
  },
  clearBoxes(){
    if (!H || !NR || !NR.unbox) return;
    const ids = new Set(H.priv.mb || []);
    for (const p of NR.peers()) if (!p.sameTab && p.presence && p.presence.r === "m") ids.add(p.peer);     // also any left from an earlier visit
    for (const id of ids) NR.unbox(id); H.priv.mb = []; H.priv.box = {};
  },
  /* ---------- the results ---------- */
  // the large announcement: the winner (or joint winners), or why the round ended and who leads
  heroHTML(s, me){
    const pl = s.pl || {}, win = (s.win || []).filter(k => pl[k]), lead = (s.rk || [])[0], L = lead && pl[lead];
    const names = ks => ks.map(k => `<b>${esc(pl[k].n)}</b>`).join(" و");
    let title, big, sub;
    if (win.length){
      const t = Math.max(...win.map(k => pl[k].dt || 0));
      title = win.length > 1 ? "فوز مشترك" : "الفائز بالجولة"; big = names(win);
      const pts = [...new Set(win.map(k => pl[k].p))];
      sub = `${win.length > 1 ? "أكملوا" : "أكمل"} ${s.nd} من ${s.nd} اختلافات خلال <bdi>${fmtMS(t)}</bdi>`
        + `<span class="dfhero-pts">${pts.length === 1 ? `<b>${pts[0]}</b> نقطة${win.length > 1 ? " لكل منهم" : ""}` : win.map(k => `${esc(pl[k].n)} <b>${pl[k].p}</b>`).join(" · ") + " نقطة"}</span>`;
    } else {
      title = {time:"انتهى الوقت", out:"استُبعد جميع اللاعبين", solo:"انتهت محاولاتك الخمس", host:"أنهى المقدّم الجولة", away:"لم يبقَ لاعب متصل"}[s.end] || "انتهت الجولة";
      big = L ? `<span class="dfhero-k">متصدر الجولة:</span> <b>${esc(L.n)}</b>` : "";
      sub = L ? `اكتشف ${L.f} من ${s.nd} اختلافات<span class="dfhero-pts"><b>${L.p}</b> نقطة</span>` : "";
    }
    const why = win.length ? `انتهت الجولة لأن ${win.length > 1 ? "أكثر من لاعب أكملوا" : "لاعبًا أكمل"} جميع الاختلافات` : {time:"انتهت الجولة لانتهاء الوقت", out:"انتهت الجولة لاستبعاد جميع المشاركين", solo:"انتهت الجولة بالخطأ الخامس", host:"أنهى المقدّم الجولة", away:"انتهت الجولة لعدم وجود لاعب متصل"}[s.end] || "";
    const mine = me && pl[me] && s.rn ? `<p class="dfhero-me">أنت: المركز <b>${s.rn[me]}</b> · ${pl[me].f} من ${s.nd} · <b>${pl[me].p}</b> نقطة</p>` : "";
    return `<div class="dfhero ${win.length ? "won" : ""}" id="dfHeroCard"><div class="dfhero-cup" aria-hidden="true">🏆</div><p class="dfhero-t">${title}</p>${big ? `<p class="dfhero-n">${big}</p>` : ""}${sub ? `<p class="dfhero-s">${sub}</p>` : ""}${why ? `<p class="dfhero-why">${why}</p>` : ""}${mine}</div>`;
  },
  // what happened to each player, for the table
  status(s, k){
    const p = s.pl[k];
    if ((s.win || []).includes(k)) return `<span class="dftime">${fmtMS(p.dt)}</span>`;
    if (p.out) return `<span class="dfst out">استُبعد — 5 أخطاء</span>${p.ft ? `<small class="dflast">آخر اكتشاف ${fmtMS(p.ft)}</small>` : ""}`;
    if (p.done) return `<span class="dftime">${fmtMS(p.dt)}</span>`;
    return `<span class="dfst">${{win:"توقفت الجولة بفوز المنافس", time:"انتهى الوقت", host:"أنهى المقدّم الجولة", away:"انتهت الجولة", out:"انتهت الجولة", solo:"انتهت الجولة"}[s.end] || "انتهت الجولة"}</span>${p.ft ? `<small class="dflast">آخر اكتشاف ${fmtMS(p.ft)}</small>` : ""}`;
  },
  resultsHTML(s, me, sel, attr){
    const win = new Set(s.win || []), rn = s.rn || {};
    const rows = (s.rk || []).map(k => { const p = s.pl[k]; return `<tr class="${win.has(k) ? "win" : ""} ${k === me ? "me" : ""}"><td class="dfrank">${win.has(k) ? "🏆" : rn[k] || ""}</td><td class="dfname">${esc(p.n)}</td><td><b>${p.f}</b><small>/${s.nd}</small></td><td>${p.w}</td><td>${Diff.status(s, k)}</td><td class="dfpts"><b>${p.p}</b></td></tr>`; }).join("");
    const T = s.tot || {}, tk = Diff.totOrder(T), tr = Diff.totRanks(T);
    const moved = tk.some(k => T[k].pr);              // the first round has no earlier place to compare with
    const chg = k => { const t = T[k], d = (t.pr || 0) - tr[k];
      return !t.pr ? `<span class="dfchg new">جديد</span>` : d > 0 ? `<span class="dfchg up" aria-label="تقدّم ${d}"><bdi dir="ltr">▲${d}</bdi></span>` : d < 0 ? `<span class="dfchg down" aria-label="تراجع ${-d}"><bdi dir="ltr">▼${-d}</bdi></span>` : `<span class="dfchg">–</span>`; };
    const tot = tk.length ? `<div class="panel stack dfoverall"><div class="row" style="justify-content:space-between"><h3>الترتيب العام</h3><span class="muted dfcap">المنافسة ${s.cn || 1} · ${Diff.rounds(s.cr || 0)}</span></div>
      <div class="tbl"><table class="htable dfres dftot"><tr><th>#</th><th>اللاعب</th>${moved ? "<th>التغيّر</th>" : ""}<th>الجولات</th><th>مرات الفوز</th><th>الاختلافات</th><th>إجمالي النقاط</th></tr>${tk.map(k => `<tr class="${k === me ? "me" : ""}"><td class="dfrank">${tr[k]}</td><td class="dfname">${esc(T[k].n)}</td>${moved ? `<td>${chg(k)}</td>` : ""}<td>${T[k].r}</td><td>${T[k].w || 0}</td><td>${T[k].f}</td><td class="dfpts"><b>${T[k].p}</b>${moved && T[k].dp ? `<small class="dfplus"><bdi dir="ltr">+${T[k].dp}</bdi></small>` : ""}</td></tr>`).join("")}</table></div></div>` : "";
    return `<div class="panel stack dfround"><h3>نتيجة الجولة</h3>
      <div class="tbl"><table class="htable dfres"><tr><th>#</th><th>اللاعب</th><th>الاختلافات</th><th>الأخطاء</th><th>الوقت أو الحالة</th><th>نقاط الجولة</th></tr>${rows}</table></div>
      <p class="muted dfnote">نقاط الجولة: +10 لكل اختلاف، +50 لإكمالها كلها، +30 دون أي خطأ، −5 لكل خطأ.</p></div>${tot}`;
  },
  // under the picture after the round: whose finds are drawn (green: found, orange: missed)
  reviewHTML(s, sel, attr){
    const who = (s.rk || []).length > 1 ? `<div class="row dfsel"><span class="muted">اعرض اكتشافات:</span>${s.rk.map(k => `<button class="btn ghost sm ${k === sel ? "on" : ""}" ${attr}="dfsel" data-k="${esc(k)}">${esc(s.pl[k].n)}</button>`).join("")}</div>` : "";
    return `<h3 class="dfrevt">الاختلافات على الصورة</h3>${who}<p class="muted dfnote">الدوائر الخضراء ما اكتشفه ${sel && s.pl[sel] ? `<b>${esc(s.pl[sel].n)}</b>` : "اللاعب"}، والبرتقالية ما فاته.</p>`;
  },
  /* the overall ranking: more points, then more wins, then more differences; equal players share a place */
  totOrder(T){ T = T || {}; return Object.keys(T).sort((a, b) => T[b].p - T[a].p || (T[b].w || 0) - (T[a].w || 0) || T[b].f - T[a].f || String(T[a].n).localeCompare(String(T[b].n), "ar")); },
  totRanks(T){ T = T || {}; const ks = Object.keys(T), out = {};
    for (const k of ks){ const t = T[k]; out[k] = 1 + ks.filter(j => { const u = T[j]; return u.p > t.p || (u.p === t.p && ((u.w || 0) > (t.w || 0) || ((u.w || 0) === (t.w || 0) && u.f > t.f))); }).length; }
    return out; },
  // during the round: one short line of the overall ranking as it was BEFORE the round (it does not move while playing)
  standHTML(s, me){
    const T = s.tot || {}, ks = Diff.totOrder(T); if (!ks.length) return "";
    const rn = Diff.totRanks(T), md = ["🥇", "🥈", "🥉"], top = ks.slice(0, 3);
    const item = k => `<span class="dfstand-i ${k === me ? "me" : ""}"><span aria-hidden="true">${md[rn[k] - 1] || ""}</span>${md[rn[k] - 1] ? "" : rn[k] + ". "}${esc(T[k].n)} <b>${T[k].p}</b></span>`;
    const mine = me && T[me] && !top.includes(me) ? `<span class="dfstand-i me">أنت: المركز ${rn[me]} · <b>${T[me].p}</b></span>` : "";
    return `<div class="dfstand"><span class="muted">ترتيب المنافسة ${s.cn || 1} قبل هذه الجولة:</span>${top.map(item).join("")}${mine}</div>`;
  },
  // the host's screen during the round (often seen by everybody): how many play, no counts per player and no places
  hostPlayHTML(s){
    const pl = (H.priv.winAt && H.priv.frozen) || s.pl || {}, ks = Object.keys(pl), out = ks.filter(k => pl[k].out).length;
    return `<div class="panel stack dfplay"><div class="row" style="justify-content:space-between"><h3>الجولة جارية</h3>${clockChip(s)}</div>
      <p class="dfplay-n">${ks.length ? `في الجولة: <b>${ks.length}</b> ${ks.length === 1 ? "لاعب" : ks.length === 2 ? "لاعبان" : ks.length <= 10 ? "لاعبين" : "لاعبًا"}${out ? ` · استُبعد <b>${out}</b>` : ""}` : "بانتظار اللاعبين…"}</p>
      <p class="muted dfnote">لا تظهر نقاط اللاعبين أثناء اللعب. النتائج كاملة بعد انتهاء الجولة.</p>${Diff.standHTML(s, "")}</div>`;
  },
  // the picture's author, source and licence: shown in full after the round (the source would reveal the answer before)
  creditLine(p){
    const c = p && p.credit;
    if (!c) return `رسم أصلي من إعداد لمّة`;
    if (c.length >= 4) return `${p.kind === "art" ? "رسم" : "تصوير"}: ${esc(c[0])} · <bdi dir="ltr">${esc(c[2])}</bdi> · Wikimedia Commons`;
    return esc(String(c[0] || ""));
  },
  creditHTML(p, host){
    const safe = u => /^https:\/\//.test(u || "") ? esc(u) : "";
    const link = (u, t) => safe(u) ? `<a href="${safe(u)}" target="_blank" rel="noopener">${t}</a>` : t;
    const c = p && p.credit; let rows;
    if (!c) rows = `<tr><th>العمل</th><td>رسم أصلي من إعداد لمّة</td></tr>`;
    else if (c.length >= 4){
      const [who, page, lic, licUrl] = c, sa = /SA/i.test(lic || "");
      rows = `<tr><th>${p.kind === "art" ? "الفنان" : "المصوّر"}</th><td>${esc(who)}</td></tr><tr><th>المصدر</th><td>${link(page, "صفحة الصورة على Wikimedia Commons")}</td></tr>
        <tr><th>الترخيص</th><td>${/^(public domain|cc0)$/i.test(lic || "") ? `<bdi dir="ltr">${esc(lic)}</bdi> (ملكية عامة)` : link(licUrl, `<bdi dir="ltr">${esc(lic)}</bdi>`)}</td></tr>
        <tr><th>التعديلات</th><td>صُغّرت الصورة، وعُدّلت النسخة الثانية لصنع الاختلافات.${sa ? " النسختان المعدّلتان بالترخيص نفسه." : ""}</td></tr>`;
    } else rows = `<tr><th>المصدر</th><td>${esc(String(c[0] || ""))}</td></tr>`;
    return `<details class="panel dfcredit-box"><summary>حقوق الصورة${host ? " وتفاصيل الجولة" : ""}</summary><table class="htable info">${rows}</table>${host ? `<div class="row">${reportBtn('data-h="dfreport"')}</div><p class="muted dfnote">البلاغ يصل للمراجعة فقط، ولا يُخفي الصورة تلقائيًا.</p>` : ""}</details>`;
  },
  // the picture after the round: the chosen player's finds in green, the rest in orange
  review(s, sel){ const got = new Set((s.pf && s.pf[sel]) || []), all = s.rev || []; return {found:all.filter((d, i) => got.has(i)), rev:all.filter((d, i) => !got.has(i))}; },
  host(players){
    const s = H.s, m = $("#hostMain");
    if (H.priv.pk && H.priv.pk.open){ H.priv.dfRd = null; setMain(Diff.pickHTML(s)); Diff.pickFilter(); return; }
    if (s.ph === "lobby"){
      H.priv.dfRd = null;
      if (!H.priv.idxAsked){ H.priv.idxAsked = true; Spot.loadIndex().then(() => { if (H && H.g === "diff" && H.s.ph === "lobby"){ $("#hostMain").dataset.k = ""; renderHost(); } }); }
      const ix = Spot.index, cnt = ix ? ix.levels : null;
      setMain(lobbyHTML(players, `${cnt ? `<p class="muted">عدد الصور: سهل ${cnt[0]} · متوسط ${cnt[1]} · صعب ${cnt[2]}. لا يتكرر زوج داخل الغرفة حتى تُلعب كل صور المستوى.</p>` : ""}
        <p class="muted">${["سهل: 5 اختلافات.","متوسط: 8 اختلافات.","صعب: 12 اختلافًا.","الكل: زوج عشوائي من أي مستوى."][s.o.lv]} الصورة نفسها للجميع، وكل لاعب يبحث بنفسه. أول من يكتشف كل الاختلافات يفوز وتتوقف الجولة. لكل لاعب 5 أخطاء.</p>${Diff.compHTML(s)}`, s.o.pk === "auto" ? "ابدأ الجولة" : "اختر الصورة وابدأ"));
      return;
    }
    if (s.ph === "done" || s.ph === "fail"){ H.priv.dfRd = null; clearInterval(H.priv.tick);
      setMain(`<div class="panel center stack endcard" style="margin-top:18px">${s.ph === "done" ? `<p class="bigmsg endtitle">لُعبت كل صور هذا المستوى في هذه الغرفة</p><p class="muted">يمكنك اختيار مستوى آخر أو إعادة اللعب بالصور نفسها.</p>` : `<p class="bigmsg">تعذّر تجهيز الصور</p><p class="muted">تأكد من الإنترنت ثم أعد المحاولة.</p>`}
        <div class="row" style="justify-content:center">${s.ph === "done" ? `<button class="btn" data-h="lobby">اختيار مستوى آخر</button><button class="btn ghost" data-h="replay">إعادة اللعب</button>` : `<button class="btn" data-h="go">إعادة المحاولة</button><button class="btn ghost" data-h="lobby">الإعدادات</button>`}</div></div>`); return; }
    const pair = s.pair;
    if (s.ph === "prep" || !pair){ H.priv.dfRd = null; setMain(`<div class="panel center stack" style="margin-top:18px"><div class="spinner"></div><p class="bigmsg">جارٍ تجهيز الصورتين…</p></div>`); return; }
    const solo = !H.code || !players.length || !!s.pl.host;       // nobody joined: the host plays on this screen
    if (H.priv.dfRd !== s.rd){
      H.priv.dfRd = s.rd; H.priv.dfm = null; H.priv.dfHeroRd = null;
      m.innerHTML = `<div class="dfhost" id="dfWrap"><div id="dfHero"></div><div class="panel stack dfpic"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)} · ${LV_NAMES[s.lv]}</h3><b id="dfHostCount" class="count"></b></div><div id="dfMe"></div><div id="dfRev"></div><div class="df-holder"></div><p class="dfcredit">${Diff.creditLine(pair)}</p><div id="dfCred"></div></div><div class="stack" id="dfSide"></div><div id="dfAct"></div></div>`;
      m.dataset.k = "";
      const rd = s.rd, holder = m.querySelector(".df-holder");
      preloadSpot(pair).then(() => {
        if (!H || H.s.rd !== rd) return;
        H.priv.dfm = mountBoard(holder, pair, (x, y, tol) => {
          if (!H || H.s.ph !== "play") return;
          const live = H.code && hostPlayers().length && !H.s.pl.host;
          if (live) return;                                           // players are on: the host screen only shows the pictures
          if (!H.s.pl.host) H.s.pl.host = dfZero("المقدّم");
          const id = "h" + Date.now().toString(36); Diff.judge("host", x, y, tol, id, srvNow()); Diff.publish();
        });
        renderHost();
      }).catch(() => spotFail(holder, 'data-h="dfhretry"'));
    }
    const over = s.ph === "over", hp = s.pl.host, mine = solo && hp ? Diff.pf("host") : null;
    const sel = over ? (H.priv.dfSel && s.pl[H.priv.dfSel] ? H.priv.dfSel : (s.win || [])[0] || (s.rk || [])[0] || "") : "";
    if (H.priv.dfm){
      // during the round the host screen (often seen by everybody) shows no place of any difference
      const v = over ? Diff.review(s, sel) : {found:mine ? mine.fi.map(i => H.priv.dfs[i]) : [], rev:null};
      H.priv.dfm.set({found:v.found, rev:v.rev, pend:[]});
      H.priv.dfm.lock(over || (!solo && !!H.code));
      const lr = mine && mine.lr && mine.lr[mine.lr.length - 1];
      if (lr && H.priv.dfLr !== lr[0]){ H.priv.dfLr = lr[0]; Diff.feedback(H.priv.dfm, lr); }
    }
    const wrap = $("#dfWrap"); if (wrap) wrap.classList.toggle("over", over);
    setEl($("#dfHero"), over ? Diff.heroHTML(s, solo ? "host" : "") : "");
    setEl($("#dfRev"), over ? Diff.reviewHTML(s, sel, "data-h") : "");
    setEl($("#dfCred"), over ? Diff.creditHTML(pair, true) : "");
    if (over && H.priv.dfHeroRd !== s.rd){ H.priv.dfHeroRd = s.rd; const h = $("#dfHeroCard"); if (h) h.scrollIntoView({block:"start", behavior:"smooth"}); }
    setEl($("#dfHostCount"), solo && hp ? `${hp.f} من ${s.nd}` : `${s.nd} اختلافات`);
    setEl($("#dfMe"), solo && hp && !over ? Diff.meHTML(hp, s) : solo && !over ? `<div class="row dfmine"><span class="muted">العب من هذه الشاشة، أو اعرض الكود ليشارك الآخرون من جوالاتهم.</span></div>` : "");
    setEl($("#dfSide"), over ? Diff.resultsHTML(s, solo ? "host" : "", sel, "data-h")
      : solo ? `<div class="panel stack"><div class="row" style="justify-content:space-between"><h3>جولتك</h3>${clockChip(s)}</div>${Diff.standHTML(s, "host")}</div>` : Diff.hostPlayHTML(s));
    setEl($("#dfAct"), H.priv.ncAsk ? Diff.ncHTML(s) : `<div class="row dfactions">${over ? `<button class="btn big dfnext" data-h="go">الجولة التالية</button>` : `<button class="btn ghost sm" data-h="end">إنهاء الجولة</button><button class="btn ghost sm" data-h="go">صورة جديدة</button>`}<button class="btn ghost sm" data-h="nc">منافسة جديدة</button>${over ? `<button class="btn ghost sm" data-h="dfcsv" data-cn="${s.cn || 1}">تنزيل النتائج</button>` : ""}<button class="btn ghost sm" data-h="lobby">الإعدادات</button></div>`);
  },
  meHTML(p, s){
    const left = DF_MAX_W - p.w;
    return `<div class="row dfmine ${p.out ? "out" : ""}"><span class="chip gold">اكتشفت <b>${p.f}</b> من ${s.nd}</span><span class="chip ${left <= 1 ? "warn" : ""}">الأخطاء المتبقية: <b>${Math.max(0, left)}</b></span><span class="chip">${p.p} نقطة</span></div>
      ${p.done ? `<p class="note ok">أكملت كل الاختلافات! لحظة ونعلن النتيجة…</p>` : p.out ? `<p class="note">استُبعدت بعد 5 أخطاء. تابع تقدّم الآخرين حتى نهاية الجولة، وتعود في الجولة التالية.</p>` : ""}`;
  },
  // what happened to a tap, shown at the place of the tap
  feedback(board, lr){
    const [, code, x, y] = lr;
    if (code === "ok") board.flash(x, y, "+10", "ok");
    else if (code === "no") board.flash(x, y, "✕");
    else if (code === "dup") board.flash(x, y, "اكتشفته من قبل", "info");
    else if (code === "amb") board.flash(x, y, "كبّر الصورة", "info");
  },
  // the phone's own sealed messages: its taps up, its mailbox down
  psend(rd){ P.view.dfSendP = (P.view.dfSendP || Promise.resolve()).then(() => Diff.psend1(rd)); return P.view.dfSendP; },   // one at a time, always the latest taps
  async psend1(rd){
    try {
      const me = await DFC.mine(), h = findHost(), hs = h && h.presence.s;
      if (!P || !hs || !hs.hk || hs.rd !== rd) return;
      const k = dfKey(P.name), body = {q:P.view.dfq || []};
      const e = await DFC.seal(await DFC.shared(me, hs.hk), body, DFC.ad("up", P.code, rd, k));
      if (!P || P.view.dfRd !== rd) return;
      const db = DF_SRV ? fbdb() : null;
      if (db && AUTH_UID){
        if (P.view.dfPkRd !== rd){ P.view.dfPkRd = rd; await NR.presence({df:{rd, pk:me.pub}}); }
        await db.ref("taps/" + ROOM_PREFIX + P.code).child(AUTH_UID).set({e, t:firebase.database.ServerValue.TIMESTAMP});   // stamped by the server
      }
      else await NR.presence({df:{rd, pk:me.pub, e}});
    } catch(e){ console.warn(e); }
  },
  async pread(rd, e){
    try {
      const me = await DFC.mine(), h = findHost(), hs = h && h.presence.s; if (!hs || !hs.hk) return;
      const m = await DFC.open(await DFC.shared(me, hs.hk), e, DFC.ad("down", P.code, rd, dfKey(P.name)));
      if (!P || P.view.dfRd !== rd || P.view.dfBoxE !== e) return;
      // after a reload, answers given before it are not shown again (only those to taps of this page)
      if (!P.view.dfBox){ const pend = new Set((P.view.dfPend || []).map(p => p.id)); for (const lr of m.lr || []) if (!pend.has(lr[0])) P.view.dfLr[lr[0]] = 1; }
      P.view.dfBox = m; playerRender();
    } catch(err){}
  },
  player(s){
    const pair = s.pair, me = dfKey(P.name);
    if (!DFC.ok()){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><p class="bigmsg">هذا المتصفح لا يدعم اللعبة</p><p class="muted">افتح الرابط في متصفح حديث مثل Safari أو Chrome.</p></div>`); bindPlayer(); return; }
    if (s.ph === "done" || s.ph === "fail"){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><p class="bigmsg">بانتظار المقدّم…</p><p class="muted">${s.ph === "done" ? "لُعبت كل صور هذا المستوى." : ""}</p></div>`); bindPlayer(); return; }
    if (s.ph === "prep" || !pair){ P.view.dfRd = null; pSet(phead() + `<div class="panel center stack"><div class="spinner"></div><p class="bigmsg">جولة جديدة…</p></div>`); bindPlayer(); return; }
    if (P.view.dfRd !== s.rd){
      P.view.dfRd = s.rd; P.view.dfm = null; P.view.dfq = []; P.view.dfLr = {}; P.view.dfPend = []; P.view.dfBox = null; P.view.dfBoxE = null; P.view.dfSel = ""; P.view.dfHeroRd = null;
      pSet(phead(`<span id="pClock"></span>`) + `<div class="dfwrap" id="dfWrap"><div id="dfHero"></div><div class="panel stack dfpanel dfpic"><div class="row" style="justify-content:space-between"><h3>${esc(pair.title)}</h3><b id="dfCount" class="count"></b></div><div id="dfMe"></div><div id="dfRev"></div><div id="pDf"><div class="center stack"><div class="spinner"></div><p class="muted">جارٍ تحميل الصورتين…</p></div></div><p class="dfcredit">${Diff.creditLine(pair)}</p><div id="dfCred"></div></div><div id="pDfStatus"></div></div>`);
      rememberLocal(pair.id);
      bindPlayer();
      const rd = s.rd;
      preloadSpot(pair).then(() => {
        if (!P || P.view.dfRd !== rd) return;
        P.view.dfm = mountBoard($("#pDf"), pair, (x, y, tol) => {
          const h = findHost(), hs = h && h.presence.s, mine = hs && hs.pl && hs.pl[dfKey(P.name)];
          if (!hs || hs.ph !== "play" || hs.rd !== rd || (mine && (mine.out || mine.done))) return;
          const id = Math.random().toString(36).slice(2, 9);
          P.view.dfq = [...P.view.dfq, [id, x, y, tol]].slice(-8);
          P.view.dfPend = [...P.view.dfPend, {id, x, y, t:Date.now()}];
          P.view.dfm.set({pend:P.view.dfPend});
          Diff.psend(rd);
        });
        playerRender();
      }).catch(() => { if (P && P.view.dfRd === rd) spotFail($("#pDf"), 'data-act="dfretry"'); });
    }
    const mine = s.pl && s.pl[me], over = s.ph === "over";
    // this player's sealed mailbox (only this phone can open it)
    if (!over){
      const box = NR.peers().find(p => p.peer === dfBoxId(me) && p.hv && p.presence && p.presence.r === "m" && p.presence.rd === s.rd && p.presence.k === me);
      const e = box && typeof box.presence.e === "string" ? box.presence.e : null;
      if (e && e !== P.view.dfBoxE){ P.view.dfBoxE = e; Diff.pread(s.rd, e); }
      // the host learns this phone's key as soon as the round runs, so it can seal this player's record for it
      if (s.ph === "play" && s.hk && P.view.dfKeyRd !== s.rd + "|" + s.hk){ P.view.dfKeyRd = s.rd + "|" + s.hk; Diff.psend(s.rd); }
    }
    const bx = P.view.dfBox || {};
    const sel = over ? (P.view.dfSel && s.pl[P.view.dfSel] ? P.view.dfSel : s.pl[me] ? me : (s.win || [])[0] || (s.rk || [])[0] || "") : "";
    if (P.view.dfm){
      // answers to my taps: each shown once; a tap not answered in 6 s is dropped from the screen
      for (const lr of bx.lr || []){
        if (P.view.dfLr[lr[0]]) continue; P.view.dfLr[lr[0]] = 1;
        if (!over) Diff.feedback(P.view.dfm, lr);
        const at = (P.view.dfPend || []).findIndex(p => p.id === lr[0]); if (at >= 0) P.view.dfPend = P.view.dfPend.slice(at + 1);   // taps are answered in order
      }
      P.view.dfPend = (P.view.dfPend || []).filter(p => Date.now() - p.t < 6000 && !over);
      const v = over ? Diff.review(s, sel) : {found:(bx.f || []).map(f => f.slice(1)), rev:null};
      P.view.dfm.set({found:v.found, rev:v.rev, pend:P.view.dfPend});
      P.view.dfm.lock(over || !!(mine && (mine.out || mine.done)));
    }
    setEl($("#pClock"), clockChip(s));
    setEl($("#dfCount"), mine ? `${mine.f} من ${s.nd}` : `${s.nd} اختلافات`);
    setEl($("#dfMe"), mine && !over ? Diff.meHTML(mine, s) : "");
    const wrap = $("#dfWrap"); if (wrap) wrap.classList.toggle("over", over);
    setEl($("#dfHero"), over ? Diff.heroHTML(s, s.pl[me] ? me : "") : "");
    setEl($("#dfRev"), over ? Diff.reviewHTML(s, sel, "data-act") : "");
    setEl($("#dfCred"), over ? Diff.creditHTML(pair, false) : "");
    if (over && P.view.dfHeroRd !== s.rd){ P.view.dfHeroRd = s.rd; const h = $("#dfHeroCard"); if (h) h.scrollIntoView({block:"start", behavior:"smooth"}); }
    setEl($("#pDfStatus"), over ? Diff.resultsHTML(s, me, sel, "data-act") + `<p class="muted center dfwait">${s.pick ? "المقدّم يختار صورة الجولة التالية…" : "النتائج باقية حتى يبدأ المقدّم الجولة التالية…"}</p>`
      : Diff.standHTML(s, me));
  },
  pclick(t){
    if (t.dataset.act === "dfretry"){ P.view.dfRd = null; playerRender(); }
    else if (t.dataset.act === "dfsel"){ P.view.dfSel = t.dataset.k || ""; playerRender(); }
  },
};
const MOD = {quiz:Quiz, letters:Letters, wheel:Wheel, puzzle:Puzzle, diff:Diff, akml:Akml};

/* ================= FOOTER ================= */
{ const b = $("#copyId"); if (b) b.onclick = () => copyText((($("#tidNum") || {}).textContent || "").trim(), b); }     // the copied ID is the one shown in the footer

/* phones redraw the clocks every half second from the shared deadlines (no dependence on the host's page being awake) */
setInterval(() => { if (P && P.joined && document.visibilityState === "visible"){ const h = findHost(), st = h && h.presence.s; if (st && (st.dl || st.qs || st.q0 || st.m0 || (st.t0 && st.ph === "play"))) playerRender(); } }, 500);

/* ================= VERSION ================= */
/* The page asks for version.json (never cached). A newer version is applied by reloading - right away when nothing is
   being played, otherwise only after the round (seats and the host's game come back by themselves after the reload). */
let UPD = null;
function midRound(){
  const ph = H ? H.s.ph : (P && P.joined && findHost() ? findHost().presence.s.ph : null);
  return !!ph && !["lobby", "end", "over", "done", "fail"].includes(ph);
}
function updateNow(){
  if (!UPD || midRound()) return false;
  const hc = (location.hash || "").replace("#", ""), code = H ? H.code : P ? P.code : /^\d{4}$/.test(hc) ? hc : "";
  return reloadOfficial(code || "", UPD);          // the game code (an invite link's #code) survives the update
}
async function checkUpdate(){
  if (BUILD === "dev" || !location.protocol.startsWith("http")) return;
  try {
    const r = await fetch("version.json?t=" + Date.now(), {cache:"no-store"}); if (!r.ok) return;
    const j = await r.json(); if (!j || !j.b || j.b === BUILD) return;
    UPD = j.b; if (!updateNow()) updBar();
  } catch(e){}
}
function updBar(){ const el = $("#updBar"); if (!el) return; el.hidden = !UPD; if (UPD) el.innerHTML = `<span>يتوفر إصدار أحدث من لمّة. سيُحدَّث تلقائيًا بعد انتهاء الجولة الحالية.</span>`; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkUpdate(); });
/* last activity: a player's seat and the host's saved game are counted from the last moment this page was alive and
   connected (and from leaving it), not from when the player joined, so nobody expires while still playing */
function touchSession(){
  if (window.__resuming || !NR) return;
  try { if (P && P.joined && P.code && seatGet(P.code)) seatSet(P.code, {}); if (H && H.code) saveHost(); } catch(e){}
}
/* The host lock (who owns the room) is renewed every minute while the host is connected, and at once when the host comes
   back to the tab, so a room can only pass to another host after its own host has really been gone for 3 hours. If it did
   pass meanwhile, this page says so: it is no longer the host of that room (the database refuses its changes). */
async function refreshLock(force){
  if (!H || !H.code || !AUTH_UID || !cloudGame(H.g) || !NR || !NR.connected() || window.__resuming) return;
  if (!force && H.priv.lockAt && Date.now() - H.priv.lockAt < 50000) return;
  H.priv.lockAt = Date.now(); const room = ROOM_PREFIX + H.code, g = H.g;
  const ok = await FS.set("hosts/" + room, {u:AUTH_UID, g, t:firebase.database.ServerValue.TIMESTAMP});
  if (!H || ROOM_PREFIX + H.code !== room) return;
  if (ok){ H.cloud = true; if (H.priv.lockLost){ H.priv.lockLost = false; lockBar(); } return; }
  const lk = await FS.get("hosts/" + room);
  if (H && lk && lk.u && lk.u !== AUTH_UID){ H.priv.lockLost = true; lockBar(); }
}
function lockBar(){
  let b = $("#lockBar"); const on = !!(H && H.priv.lockLost);
  if (!b && on){ const u = $("#updBar"); if (!u) return; u.insertAdjacentHTML("afterend", `<div class="updbar" id="lockBar"></div>`); b = $("#lockBar"); }
  if (!b) return; b.hidden = !on;
  if (on) b.innerHTML = `<span>انتقلت هذه الغرفة إلى مقدّم آخر بعد غيابك أكثر من 3 ساعات، ولن تصل تغييراتك إلى اللاعبين.</span> <button class="btn sm" data-lock="end">إنهاء اللعبة</button>`;
  b.onclick = e => { if (e.target.closest("[data-lock=end]")){ const x = $("#endBtn"); if (x) x.click(); b.hidden = true; } };
}
setInterval(() => { if (NR && NR.connected()){ touchSession(); refreshLock(); } }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshLock(true); });
window.addEventListener("pagehide", touchSession);
document.addEventListener("visibilitychange", () => { if (document.hidden) touchSession(); });
setTimeout(checkUpdate, 1500);
if (PREVIEW){ const u = $("#updBar"); if (u) u.insertAdjacentHTML("afterend", `<div class="previewbar">نسخة معاينة للاختبار، وليست الموقع الرسمي. الموقع الرسمي: ${esc((SITE_URL || "").replace(/^https?:\/\//, ""))}</div>`); }

/* ================= JOIN ================= */
window.addEventListener("lm-conn", () => { if (P){ $("#playerMain").dataset.k = ""; playerRender(); } if (H) renderHost(); });
$("#joinForm").addEventListener("submit", e => { e.preventDefault(); playerJoin($("#joinCode").value.trim()); });
$("#joinCode").addEventListener("input", e => { e.target.value = e.target.value.replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, d => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/\D/g, "").slice(0, 4); });
photosReady.then(() => { if (H && H.s.ph === "lobby" && H.g === "puzzle"){ if (PHOTOS_OK === false) H.s.o.src = "draw"; renderHost(); } });
/* opening لمّة: a game link (#code) joins that game; otherwise a game this device was in comes back automatically
   (the host's game or the player's seat, whichever is more recent) */
{ const q = new URLSearchParams(location.search), hc = (location.hash || "").replace("#", "") || q.get("code") || "";
  if (q.has("v")) history.replaceState(null, "", location.pathname + (q.get("code") ? "?code=" + q.get("code") : "") + location.hash);   // the version tag has done its job
  const sh = savedHost(), st = seatLatest();
  // a page that moved to a new version after a round comes back with its room code: on the host's own device that is
  // the host's game coming back, not a player joining it (otherwise the host would land as a player in its own room)
  // (only this tab's own saved game counts: another tab of the host's device opening the invite link is a player)
  if (/^\d{4}$/.test(hc) && sh && !sh.dev && String(sh.code) === hc && (!st || st.code !== hc || sh.at >= st.at)) hostResume();
  else if (/^\d{4}$/.test(hc)){ $("#joinCode").value = hc; playerJoin(hc); }          // a game link always joins as a player
  else if (sh && (!st || sh.at >= st.at)) hostResume();
  else if (st) playerJoin(st.code, {auto:true}); }
/* opening another game link in the same tab (only the #code changes) joins that game */
window.addEventListener("hashchange", () => { const hc = (location.hash || "").replace("#", ""); if (/^\d{4}$/.test(hc) && !H && (!P || P.code !== hc)){ $("#joinCode").value = hc; playerJoin(hc); } });
