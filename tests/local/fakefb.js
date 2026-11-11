window.firebase = (() => {
  const bc = new BroadcastChannel('fakefb'); const store = {}; const listeners = {}; const owned = {};
  const snap = path => ({val: () => store[path] && Object.keys(store[path]).length ? JSON.parse(JSON.stringify(store[path])) : null});
  const emit = path => (listeners[path] || []).forEach(cb => cb(snap(path)));
  const apply = (path, id, val) => { store[path] = store[path] || {}; if (val === null) delete store[path][id]; else store[path][id] = val; setTimeout(() => emit(path), 5); };
  bc.onmessage = e => { const m = e.data; if (m.t === 'set') apply(m.path, m.id, m.val);
    if (m.t === 'hello') for (const [p, o] of Object.entries(owned)) for (const [id, v] of Object.entries(o)) bc.postMessage({t:'set', path:p, id, val:v}); };
  const onDisc = {};   // path|id -> value to write when this page disconnects (null = remove)
  const disconnectAll = () => { for (const [p, o] of Object.entries(owned)) for (const id of Object.keys(o)){ const k = p + '|' + id; const v = k in onDisc ? onDisc[k] : null; bc.postMessage({t:'set', path:p, id, val:v}); } };
  window.addEventListener('pagehide', disconnectAll);
  window.__fakeDisconnect = () => { disconnectAll(); };     // tests: the network drops (the page stays)
  // tests: the phone loses / gets back its connection (the server applies the "away" marks; on return the page writes again)
  window.__setOnline = on => { window.__offline = !on; if (!on) disconnectAll(); (window.__connCbs || []).forEach(cb => { try { cb({val: () => !!on}); } catch(e){} }); };
  bc.postMessage({t:'hello'});
  const childRef = (path, id) => ({
    set(v){ v = {...v, t:v.t > 0 ? v.t : Date.now()};   /* tests may write an explicit old time */ if (v.c === 0) v.c = Date.now(); (owned[path] = owned[path] || {})[id] = v; apply(path, id, v); bc.postMessage({t:'set', path, id, val:v}); return Promise.resolve(); },
    update(v){ const cur = (store[path] || {})[id] || {}; return this.set({...cur, ...v}); },
    once: async () => { const v = (store[path] || {})[id]; const val = v === undefined ? null : JSON.parse(JSON.stringify(v)); return {val: () => val, child: k => ({val: () => val && k in val ? val[k] : null})}; },
    remove(){ if (owned[path]) delete owned[path][id]; apply(path, id, null); bc.postMessage({t:'set', path, id, val:null}); return Promise.resolve(); },
    onDisconnect(){ const k = path + '|' + id; return {remove: () => { onDisc[k] = null; return Promise.resolve(); }, set: v => { onDisc[k] = {...v, t:Date.now()}; return Promise.resolve(); }, update: v => { onDisc[k] = {...((store[path] || {})[id] || {}), ...v, t:Date.now()}; return Promise.resolve(); }, cancel: () => { delete onDisc[k]; return Promise.resolve(); }}; },
  });
  const kv = JSON.parse(localStorage.getItem('fakekv') || '{}');
  const flat = (p) => { const out = {}; for (const [k, v] of Object.entries(kv)) if (k.startsWith(p + '/')) out[k.slice(p.length + 1).split('/')[0]] = v; return Object.keys(out).length ? out : null; };
  // hosts/ games/ gpriv/ : plain values shared by every page of the browser context (a stand-in for the database).
  // localStorage 'fakedeny' = '1' makes them refuse like the current public rules do.
  const deny = () => localStorage.getItem('fakedeny') === '1';
  const store2 = () => JSON.parse(localStorage.getItem('fakestore2') || '{}');
  const plain = path => ({
    once: async () => { if (deny()) throw new Error('PERMISSION_DENIED'); const v = store2()[path]; return {val: () => v === undefined ? null : JSON.parse(JSON.stringify(v))}; },
    set: async v => { if (deny()) throw new Error('PERMISSION_DENIED'); const st = store2(); const fix = x => x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, y && y['.sv'] ? Date.now() : (k === 't' || k === 'at') && y === 0 ? Date.now() : y])) : x;
      if (v === null) delete st[path]; else st[path] = fix(v); localStorage.setItem('fakestore2', JSON.stringify(st)); },
    remove: async () => { if (deny()) throw new Error('PERMISSION_DENIED'); const st = store2(); delete st[path]; localStorage.setItem('fakestore2', JSON.stringify(st)); },
  });
  const ref = path => /^(hosts|games|gpriv)\//.test(path) ? plain(path) : path.startsWith('spot') ? {
      once: async () => ({val: () => flat(path)}),
      set: async v => { kv[path] = v; localStorage.setItem('fakekv', JSON.stringify(kv)); } }
    : path === '.info/connected'
    ? {on: (e, cb) => { (window.__connCbs = window.__connCbs || []).push(cb); setTimeout(() => cb({val: () => !window.__offline}), 10); }, off(){}}
    : path === '.info/serverTimeOffset'
    ? {on: (e, cb) => setTimeout(() => cb({val: () => +(window.__srvOff || 0)}), 5), off(){}}
    : {child: id => childRef(path, id), on: (e, cb) => { (listeners[path] = listeners[path] || []).push(cb); setTimeout(() => cb(snap(path)), 5); },
       off: (e, cb) => { listeners[path] = (listeners[path] || []).filter(x => x !== cb); },
       once: async () => snap(path)};
  const db = {ref};
  const ukey = localStorage.getItem('fakeuidper') === '1' ? 'devuid' : 'fakeuid';   // tests may give every page (device) its own identity
  let uid = localStorage.getItem(ukey); if (!uid){ uid = 'u' + Math.random().toString(36).slice(2, 10); localStorage.setItem(ukey, uid); }
  const auth = {currentUser:null, signInAnonymously: async () => { if (localStorage.getItem('fakenoauth') === '1') throw new Error('auth/operation-not-allowed'); auth.currentUser = {uid}; return {user:auth.currentUser}; }};
  const fb = {apps:[], initializeApp(){ fb.apps.push(1); }, database: Object.assign(() => db, {ServerValue:{TIMESTAMP:0}}), auth: () => auth};
  return fb;
})();
