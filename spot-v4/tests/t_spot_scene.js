// The automatic choice never plays two similar scenes one after the other (scene group g = "kind|place"),
// still never repeats a pair in a room until the level is exhausted, and still prefers pairs nobody has seen.
//   node tests/t_spot_scene.js <dist>
const fs = require("fs"), path = require("path");
const DIST = process.argv[2] || "dist";
const src = fs.readFileSync(path.join(__dirname, "..", "src", "app.js"), "utf8");
const a = src.indexOf("const Spot = {"), b = src.indexOf("/* ================= SPOT THE DIFFERENCE", a);
let seed = 7; const rnd = () => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const shuffle = (arr, r) => { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--){ const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const SPOT_CDN = "cdn/", THEME_AR = {}, localSeen = () => [], rememberLocal = () => {}, fbdb = () => null, sleep = ms => new Promise(r => setTimeout(r, ms)), devId = "x";
const files = {"cdn/catalog/index.json": JSON.parse(fs.readFileSync(path.join(DIST, "spot/catalog/index.json")))};
for (const sh of files["cdn/catalog/index.json"].shards) files["cdn/catalog/" + sh.name] = JSON.parse(fs.readFileSync(path.join(DIST, "spot/catalog", sh.name)));
const fetch = async u => files[u] ? {ok:true, json:async () => files[u]} : {ok:false, status:404};
const Spot = eval(src.slice(a, b).replace("const Spot =", "(") .replace(/};\s*$/, "})"));
let pass = 0, fail = 0; const check = (ok, m) => { ok ? pass++ : fail++; console.log((ok ? "OK   " : "FAIL ") + m); };
const tags = g => String(g || "").split("|").filter(Boolean);
(async () => {
  const all = files["cdn/catalog/" + files["cdn/catalog/index.json"].shards[0].name];
  check(all.every(e => e.g), `every pair has a scene group (${all.length})`);
  for (const lv of [0, 1, 2, 3]){
    const played = new Set(); let rg = [], clash = 0, avoidable = 0, n = 0;
    for (;;){
      const r = await Spot.pick(lv, [], played, rg); if (r.done) break;
      const p = r.pair; if (played.has(p.id)){ check(false, `level ${lv}: ${p.id} repeated`); break; }
      const near = new Set(rg.flatMap(tags));
      if (tags(p.g).some(t => near.has(t))){ clash++;
        if (all.some(e => Spot.levelOk(lv, e.l) && !played.has(e.id) && !tags(e.g).some(t => near.has(t)))) avoidable++; }
      played.add(p.id); rg = [...rg, p.g].slice(-2); n++;
    }
    const pool = all.filter(e => Spot.levelOk(lv, e.l)).length;
    check(n === pool, `level ${lv}: every pair played once before the level is done (${n}/${pool})`);
    check(avoidable === 0, `level ${lv}: no similar scene right after another while a different one was left (${clash} only at the end of the pool)`);
  }
  // a pair nobody has seen still comes before a seen one of another scene
  const lv = 1, ids = all.filter(e => e.l === lv), seenMap = new Map(ids.slice(1).map(e => [e.id, 5]));
  Spot.seenBy = async () => seenMap;
  const r = await Spot.pick(lv, [], new Set(), []);
  check(r.pair.id === ids[0].id && r.fresh, "the only unseen pair is chosen when no scene is near");
  console.log(`${pass}/${pass + fail} passed`); process.exit(fail ? 1 : 0);
})();
