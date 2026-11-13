"""The referee on every one of the 15 pairs, called directly in the host page:
- a tap on what changed in each difference is a find (all 125);
- inside the box but far from what changed: a mistake;
- within the tolerance of two differences: neither (zoom in);
- tolerance measured on a 360 px phone at zoom 1, 2 and 4."""
import asyncio, json, math, sys
from common import Env
async def main():
    async with Env(8782) as E:
        host = await E.page('host', 1280, 900); A = await E.page('A', 390, 844)
        code = await E.start(host, 'diff', {'lv': 1, 'pk': 'auto', 'lim': 300}); await E.join(A, code, 'سارة'); await host.wait_for_timeout(600)
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        res = await host.evaluate('''async () => {
          const idx = await (await fetch("spot/catalog/index.json")).json(); let all = [];
          for (const sh of idx.shards) all = all.concat(await (await fetch("spot/catalog/" + sh.name)).json());
          const out = [];
          const cells = d => dfCells(d) || [];
          const dist = (d, x, y) => Math.min(...cells(d).map(([cx, cy]) => Math.hypot(Math.max(0, Math.abs(x - cx) - 8), Math.max(0, Math.abs(y - cy) - 8))));
          for (const e of all){
            const D = e.d.map(d => d.slice()), W = e.w, Hh = e.h;
            for (const [phone, zoom] of [[360, 1], [360, 2], [360, 4]]){
              const tol = 12 / (phone / W * zoom), T = Math.min(0.025 * W, Math.max(0.008 * W, tol));
              const run = (x, y) => { H.s.ph = "play"; H.s.pair = {id:e.id, w:W, h:Hh}; H.s.nd = 99; H.priv.dfs = D; H.s.pl.zz = dfZero("t"); H.priv.pf = H.priv.pf || {}; H.priv.pf.zz = {fi:[], lr:[], hz:null}; Diff.judge("zz", x, y, tol, "j" + Math.random()); const L = H.priv.pf.zz.lr[H.priv.pf.zz.lr.length - 1]; if (!L) throw new Error("nolr " + JSON.stringify([e.id, x, y, W, Hh, H.s.ph, Object.keys(H.s.pl)])); return {r:L[1], f:H.priv.pf.zz.fi.slice()}; };
              let ok = 0, wrong = [], offs = 0, offBad = [], ambs = 0, ambBad = [];
              D.forEach((d, i) => {
                const c = cells(d); const p = c.reduce((a, q) => Math.hypot(q[0] - d[0], q[1] - d[1]) < Math.hypot(a[0] - d[0], a[1] - d[1]) ? q : a, c[0]);
                const r = run(p[0], p[1]); if (r.r === "ok" && r.f[0] === i) ok++; else if (r.r === "amb") ambs += 0; else wrong.push([i, r.r, r.f]);
                // empty part of the box, further than the tolerance from every change
                for (let x = d[0] - d[2]; x <= d[0] + d[2]; x += 6) for (let y = d[1] - d[3]; y <= d[1] + d[3]; y += 6){
                  if (x >= 0 && y >= 0 && x <= W && y <= Hh && D.every(q => dist(q, x, y) > T + 1)){ offs++; const r2 = run(x, y); if (r2.r !== "no") offBad.push([i, x, y, r2.r]); x = 1e9; break; }
                }
              });
              for (let x = 0; x < W; x += 6) for (let y = 0; y < Hh; y += 6){
                const near = D.filter(q => dist(q, x, y) <= T - 1);
                if (near.length >= 2 && D.every(q => dist(q, x, y) > 1)){ ambs++; const r3 = run(x, y); if (r3.r !== "amb") ambBad.push([x, y, r3.r]); }
              }
              out.push({id:e.id, n:D.length, phone, zoom, T:Math.round(T), ok, wrong, offs, offBad:offBad.length, ambs, ambBad:ambBad.length});
            }
          }
          delete H.s.pl.zz; delete H.priv.pf.zz; return out; }''')
        bad = 0; tot = 0
        for r in res:
            if r['zoom'] == 1: tot += r['n']
            fail = r['ok'] != r['n'] or r['offBad'] or r['ambBad']
            bad += bool(fail)
            print(('FAIL ' if fail else 'OK   ') + f"{r['id']} 360px zoom {r['zoom']}: tolerance {r['T']} px of 1600 · {r['ok']}/{r['n']} found on the change · empty box parts tested {r['offs']} → mistakes · ambiguous points {r['ambs']} → no hit/no mistake" + (f" WRONG {r['wrong']} offBad {r['offBad']} ambBad {r['ambBad']}" if fail else ''))
        print(f'differences checked: {tot}; failures: {bad}; page errors: {E.errs or "none"}'); sys.exit(1 if bad or E.errs else 0)
asyncio.run(main())
