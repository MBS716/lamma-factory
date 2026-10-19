window.firebase = (() => {
  const bc = new BroadcastChannel('fakefb'); const store = {}; const listeners = {}; const owned = {};
  const snap = path => ({val: () => store[path] && Object.keys(store[path]).length ? JSON.parse(JSON.stringify(store[path])) : null});
  const emit = path => (listeners[path] || []).forEach(cb => cb(snap(path)));
  const apply = (path, id, val) => { store[path] = store[path] || {}; if (val === null) delete store[path][id]; else store[path][id] = val; setTimeout(() => emit(path), 5); };
  bc.onmessage = e => { const m = e.data; if (m.t === 'set') apply(m.path, m.id, m.val);
    if (m.t === 'hello') for (const [p, o] of Object.entries(owned)) for (const [id, v] of Object.entries(o)) bc.postMessage({t:'set', path:p, id, val:v}); };
  window.addEventListener('pagehide', () => { for (const [p, o] of Object.entries(owned)) for (const id of Object.keys(o)) bc.postMessage({t:'set', path:p, id, val:null}); });
  bc.postMessage({t:'hello'});
  const childRef = (path, id) => ({
    set(v){ v = {...v, t:Date.now()}; (owned[path] = owned[path] || {})[id] = v; apply(path, id, v); bc.postMessage({t:'set', path, id, val:v}); return Promise.resolve(); },
    remove(){ if (owned[path]) delete owned[path][id]; apply(path, id, null); bc.postMessage({t:'set', path, id, val:null}); return Promise.resolve(); },
    onDisconnect(){ return {remove: () => Promise.resolve(), cancel: () => Promise.resolve()}; },
  });
  const kv = JSON.parse(localStorage.getItem('fakekv') || '{}');
  const flat = (p) => { const out = {}; for (const [k, v] of Object.entries(kv)) if (k.startsWith(p + '/')) out[k.slice(p.length + 1).split('/')[0]] = v; return Object.keys(out).length ? out : null; };
  const ref = path => path.startsWith('spot') ? {
      once: async () => ({val: () => flat(path)}),
      set: async v => { kv[path] = v; localStorage.setItem('fakekv', JSON.stringify(kv)); } }
    : path === '.info/connected'
    ? {on: (e, cb) => setTimeout(() => cb({val: () => true}), 10), off(){}}
    : {child: id => childRef(path, id), on: (e, cb) => { (listeners[path] = listeners[path] || []).push(cb); setTimeout(() => cb(snap(path)), 5); },
       off: (e, cb) => { listeners[path] = (listeners[path] || []).filter(x => x !== cb); }};
  const db = {ref};
  const fb = {apps:[], initializeApp(){ fb.apps.push(1); }, database: Object.assign(() => db, {ServerValue:{TIMESTAMP:0}})};
  return fb;
})();
