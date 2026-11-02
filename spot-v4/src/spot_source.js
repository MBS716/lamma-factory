/* ================= SPOT THE DIFFERENCE: content source =================
   Production: pairs come from the factory's catalog on Cloudflare R2 (SPOT_CDN), which grows every day
   without redeploying this site. Fallback: the 10 bundled pairs (SPOT_LIB) when no CDN is set or it is unreachable.
   Each device keeps a history of pairs it has seen; the host picks a pair nobody in the room has seen. */
const SPOT_CDN = /*@@SPOTCDN@@*/"";
const THEME_AR = {"old market":"سوق قديم","souk":"سوق شعبي","bazaar stalls":"بازار","spice market":"سوق التوابل","street market":"سوق الشارع","fruit stall":"بسطة فواكه","flower market":"سوق الزهور","flea market":"سوق المستعمل","antique shop":"محل تحف","bookshop interior":"مكتبة","library interior":"مكتبة عامة","cafe interior":"مقهى","restaurant interior":"مطعم","bakery shop":"مخبز","kitchen interior":"مطبخ","living room interior":"غرفة جلوس","cozy room":"غرفة","workshop tools":"ورشة","pottery shop":"محل فخار","carpet shop":"محل سجاد","lantern shop":"محل فوانيس","toy shop":"محل ألعاب","street food stall":"أكل الشارع","harbor boats":"مرفأ","fishing village":"قرية صيادين","old town street":"شارع قديم","narrow alley":"زقاق","colorful street":"شارع ملوّن","city street cars":"شارع المدينة","rooftops city":"أسطح المدينة","balcony plants":"شرفة","window flowers":"نافذة وزهور","village houses":"قرية","farm market":"سوق المزارعين","garden with bench":"حديقة","park playground":"ملعب أطفال","beach umbrellas":"شاطئ","camping site":"مخيم","train station":"محطة قطار","museum hall":"متحف","art gallery wall":"معرض فني","supermarket shelves":"سوبرماركت","hardware store":"محل أدوات","bicycle street":"دراجات","desk with objects":"مكتب","office interior":"مكتب عمل","classroom":"فصل دراسي","music instruments shop":"محل آلات موسيقية","vintage interior":"ديكور قديم","shelves with jars":"رفوف وبرطمانات","tea shop":"محل شاي","coffee roastery":"محمصة قهوة","fish market":"سوق السمك","textile shop":"محل أقمشة","desert camp":"مخيم صحراوي","festival street":"احتفال","night market":"سوق ليلي","old house facade":"واجهة بيت قديم","castle courtyard":"فناء قلعة","marina":"مرسى"};
const devId = (() => { let d = lsGet("lm-dev"); if (!/^[a-z0-9]{10,24}$/.test(d)){ d = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); lsSet("lm-dev", d); } return d; })();
const fbdb = () => (window.firebase && firebase.apps && firebase.apps.length) ? firebase.database() : null;
const localSeen = () => { try { return JSON.parse(lsGet("lm-seen") || "[]"); } catch(e){ return []; } };
function rememberLocal(id){ const s = localSeen(); if (!s.includes(id)){ s.push(id); while (s.length > 4000) s.shift(); lsSet("lm-seen", JSON.stringify(s)); } }
const Spot = {
  index:null, indexAt:0, shards:{}, hidden:new Set(), remote:false,
  norm(e){ // catalog entry -> pair used by the game
    return {id:e.id, level:e.l, w:e.w, h:e.h, a:SPOT_CDN + "pairs/" + e.id + "a.webp", b:SPOT_CDN + "pairs/" + e.id + "b.webp",
      title:THEME_AR[e.th] || "صورة", diffs:e.d.map(([x, y, rx, ry]) => ({x, y, rx, ry})), credit:e.c || null};
  },
  local(p){ return {id:p.id, level:p.level, w:p.w, h:p.h, a:"spot/" + p.a, b:"spot/" + p.b, title:p.title, diffs:p.diffs, credit:null}; },
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
  async seenBy(devs){ // union of everything these devices have played (Firebase), plus this device's local history
    const all = new Set(localSeen()), db = fbdb();
    if (db) await Promise.all(devs.map(d => Promise.race([db.ref("spotseen/" + d).once("value").then(s => Object.keys(s.val() || {}).forEach(k => all.add(k))), sleep(4000)]).catch(() => {})));
    return all;
  },
  markSeen(id, devs){ rememberLocal(id); const db = fbdb(); if (db) devs.forEach(d => db.ref("spotseen/" + d + "/" + id).set(Date.now()).catch(() => {})); },
  report(id){ const db = fbdb(); if (db) return db.ref("spotreports/" + id + "/" + devId).set(Date.now()); return Promise.resolve(); },
  levelOk: (lv, l) => lv === 3 || l === lv,
  /* returns {pair, fresh, total} */
  async pick(lv, devs){
    const seen = await this.seenBy(devs), idx = await this.loadIndex();
    if (idx && idx.shards && idx.shards.length){
      const shards = idx.shards.filter(s => lv === 3 ? s.count : s.levels[lv]);
      const order = shuffle(shards, rnd()); let fallback = null;
      for (const s of order.slice(0, 12)){
        let list; try { list = await this.shard(s.name); } catch(e){ continue; }
        const ok = list.filter(e => this.levelOk(lv, e.l) && !this.hidden.has(e.id));
        const fresh = ok.filter(e => !seen.has(e.id));
        if (fresh.length) return {pair:this.norm(fresh[Math.floor(Math.random() * fresh.length)]), fresh:true, total:idx.total};
        if (!fallback && ok.length) fallback = ok[Math.floor(Math.random() * ok.length)];
      }
      if (fallback) return {pair:this.norm(fallback), fresh:false, total:idx.total};
    }
    const pool = SPOT_LIB.filter(p => this.levelOk(lv, p.level)), fresh = pool.filter(p => !seen.has(p.id));
    const p = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length || pool.length))];
    return {pair:this.local(p), fresh:!!fresh.length, total:SPOT_LIB.length};
  },
};
