// «أكملها» bank test, on the real game code (src/akml.js and src/app.js are read and their functions evaluated as they are):
// the bank file decodes; every question: the answer and each approved alternative are accepted, no wrong option is
// accepted or sent to the host as "maybe"; 4 distinct options, the answer first; a gap; modes; sections and levels; no
// phrase twice; and the match order (akOrder): never a question twice in a match, sections in turn, levels kept, over
// many simulated matches. Usage: node t_akml_bank.js [bank.json] [src.json]
const fs = require("fs"), path = require("path");
const ROOT = "/home/claude/lamma", BANK = process.argv[2] || path.join(ROOT, "data/akml.json"), SRC = process.argv[3];
const app = fs.readFileSync(path.join(ROOT, "src/app.js"), "utf8"), ak = fs.readFileSync(path.join(ROOT, "src/akml.js"), "utf8");
const grab = (src, re) => { const m = src.match(re); if (!m) throw new Error("not found: " + re); return m[0]; };
const fnBody = (src, name) => {      // a top-level function or const, up to its closing line
  const i = src.search(new RegExp("^(function " + name + "\\b|const " + name + "\\b)", "m")); if (i < 0) throw new Error(name);
  let j = src.indexOf("\n", i), depth = 0, k = i;
  for (k = i; k < src.length; k++){ const c = src[k]; if (c === "{") depth++; else if (c === "}") depth--; if (c === "\n" && depth === 0 && k > i) break; }
  return src.slice(i, k);
};
global.atob = s => Buffer.from(s, "base64").toString("binary");
let code = ["rng", "shuffle", "range", "rnd"].map(n => fnBody(app, n)).join("\n") + "\n";
code += ["AK_DIG", "akNorm", "akLev", "akCheck", "akDecode", "akKind", "akFits", "akOrder", "akAvail", "AK_SECS"].map(n => fnBody(ak, n)).join("\n");
code += "\nconst LS = {}; const seenGet = k => new Set(LS[k] || []); function seenAdd(k, ids, max){ const s = [...(LS[k] || [])]; for (const id of ids) if (!s.includes(id)) s.push(id); while (s.length > max) s.shift(); LS[k] = s; }";
code += "\nmodule.exports = {akNorm, akCheck, akDecode, akKind, akFits, akOrder, akAvail, AK_SECS, seenAdd, LS, shuffle, rnd};";
const tmp = path.join(__dirname, ".akbank_code.js"); fs.writeFileSync(tmp, code);
const K = require(tmp);
let fails = 0, checks = 0; const bad = []; const ok = (c, m) => { checks++; if (!c){ fails++; if (bad.length < 40) bad.push(m); } };
const B = K.akDecode(JSON.parse(fs.readFileSync(BANK, "utf8")));
console.log("bank", BANK, "questions", B.list.length);
const SECS = K.AK_SECS.map(s => s[0]);
const seenText = new Map(), shortTyped = [];   // typed questions too short for a near-answer variant (the host's card test skips them)
for (const q of B.list){
  ok(SECS.includes(q.s), q.id + " section");
  ok([0, 1, 2].includes(q.l), q.id + " level");
  ok(q.gap && q.t.split("{").length === 2, q.id + " one gap");
  ok(K.akNorm(q.gap) === K.akNorm(q.a), q.id + " gap = answer");
  ok(q.o.length === 4 && K.akNorm(q.o[0]) === K.akNorm(q.a) && new Set(q.o.map(K.akNorm)).size === 4, q.id + " 4 distinct options, answer first");
  ok(/^[ctb]+$/.test(q.md), q.id + " modes");
  ok(K.akCheck(q, q.a) === "ok", q.id + " answer accepted: " + q.a);
  for (const a of q.alt) ok(K.akCheck(q, a) === "ok", q.id + " alternative accepted: " + a);
  for (const w of q.o.slice(1)) ok(K.akCheck(q, w) === "no", q.id + " wrong option refused: " + w + " → " + K.akCheck(q, w));
  ok(K.akCheck(q, "") === "no" && K.akCheck(q, "   ") === "no", q.id + " empty refused");
  const key = K.akNorm(q.t.replace(/[{}]/g, "")); ok(!seenText.has(key), q.id + " same phrase as " + seenText.get(key)); seenText.set(key, q.id);
  // typed questions: a near answer (with/without «ال», or a one-letter slip) goes to the host's judgement — the host's card
  // test (t_akml_key.py) relies on finding one, whatever question it draws
  if (q.md.includes("t")){ const A = q.a, near = [A.startsWith("ال") ? A.slice(2) : "ال" + A, A.slice(0, -1), A + "ه", A[0] + A.slice(2), A.slice(0, -1) + "ي"];
    if (!near.some(w => w && K.akCheck(q, w) === "?")) shortTyped.push(q.id); }
}
// ids unique
ok(new Set(B.list.map(q => q.id)).size === B.list.length, "ids unique");
// match order: many simulated matches with different settings
const base = {secs:[], sw:"turn", dif:"all", m:"c", mix:["c"], first:"any"};
const settings = [
  {}, {sw:"rnd"}, {sw:"blk"}, {dif:"0"}, {dif:"2"}, {dif:"up"}, {secs:["gulf"]}, {secs:["info", "lang"]}, {m:"t"}, {m:"b"}, {m:"mx", mix:["c", "t", "b"]}];
let matches = 0;
for (const s of settings){
  const o = {...base, ...s};
  for (let r = 0; r < 40; r++){
    const n = [10, 20, 30][r % 3];
    const ks = (o.m === "mx" ? o.mix : [o.m]);
    const plan = Array.from({length:n}, (_, i) => K.akKind(ks[i % ks.length], o));
    const ids = K.akOrder(B, o, plan); matches++;
    const got = ids.filter(Boolean);
    ok(new Set(got).size === got.length, `match ${JSON.stringify(s)}: a question twice in one match`);
    ok(got.length === Math.min(n, K.akAvail(B, o)), `match ${JSON.stringify(s)} n=${n}: only ${got.length} questions found (the bank has ${K.akAvail(B, o)} for these settings)`);
    const secs = o.secs.length ? o.secs : SECS;
    ok(got.every(id => secs.includes(B.by[id].s)), `match ${JSON.stringify(s)}: a question of another section`);
    if (o.dif === "0" || o.dif === "2") ok(got.every(id => B.by[id].l === +o.dif), `match ${JSON.stringify(s)}: level not kept`);
    ok(got.every((id, i) => K.akFits(B.by[id], plan[i])), `match ${JSON.stringify(s)}: a question that does not fit its method`);
    if (o.sw === "turn" && !o.secs.length && n >= 12) { const c = {}; got.forEach(id => c[B.by[id].s] = (c[B.by[id].s] || 0) + 1); ok(Object.keys(c).length === 6, `match ${JSON.stringify(s)}: sections not in turn ${JSON.stringify(c)}`); }
    K.seenAdd("lm-akseen", got, 3000); K.LS["lm-aklast"] = got;
  }
}
// across matches: the previous match's questions are not repeated in the next one while others are free
K.LS["lm-akseen"] = []; K.LS["lm-aklast"] = [];
let prev = [], repeats = 0;
for (let r = 0; r < 30; r++){ const o = {...base}; const plan = Array.from({length:20}, () => K.akKind("c", o)); const got = K.akOrder(B, o, plan);
  repeats += got.filter(id => prev.includes(id)).length; K.seenAdd("lm-akseen", got, 3000); K.LS["lm-aklast"] = got; prev = got; }
ok(repeats === 0, "consecutive matches repeated " + repeats + " questions");
console.log(`${checks - fails}/${checks} checks passed over ${B.list.length} questions and ${matches + 30} simulated matches`);
if (bad.length) console.log("FAILURES:\n" + bad.join("\n"));
fs.unlinkSync(tmp);
process.exit(fails ? 1 : 0);
