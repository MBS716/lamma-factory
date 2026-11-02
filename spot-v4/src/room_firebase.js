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
