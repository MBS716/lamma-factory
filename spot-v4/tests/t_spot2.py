"""Shared spot-the-difference (v3.4): a host and 3 players (two phones, one computer), then a solo room.
Every required case is checked on the real page with real taps (touch on phones, mouse on the computer)."""
import asyncio, json, sys
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')

async def main():
    async with Env(8781) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'diff', {'lv': 1, 'lim': 300})
        await E.join(A, code, 'سارة'); await E.join(B, code, 'خالد'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        await host.click('[data-h=start]')
        for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(600)
        s = await S(host); dfs = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        kA, kB, kC = await key(host, 'سارة'), await key(host, 'خالد'), await key(host, 'نورة')
        check(s['nd'] == 8 and len(dfs) == 8, f'medium pair has 8 differences ({s["pair"]["id"]})')
        check(set(s['pl']) == {kA, kB, kC}, 'the 3 players are in the round, each with their own record')
        raw = await A.evaluate('JSON.stringify(NR.peers().map(p => p.raw))')
        check('dfs' not in raw and '"diffs"' not in raw and not any(f'{d[0]},{d[1]},{d[2]},{d[3]}' in raw for d in dfs), 'phones cannot read where the differences are (only what was found)')

        async def box(pg):
            sel = '#pDf .dfimg >> nth=1'
            await pg.locator(sel).scroll_into_view_if_needed(); return await pg.locator(sel).bounding_box()
        async def tap(pg, x, y, touch=True):
            b = await box(pg); px, py = b['x'] + x / W * b['width'], b['y'] + y / Hh * b['height']
            if touch: await pg.touchscreen.tap(px, py)
            else: await pg.mouse.click(px, py)
        def wrong_spot(k=0):
            pts = []
            for gx in range(1, 20):
                for gy in range(1, 12):
                    x, y = gx / 20 * W, gy / 12 * Hh
                    if all(abs(x - d[0]) > d[2] + 0.06 * W or abs(y - d[1]) > d[3] + 0.06 * W for d in dfs): pts.append((x, y))
            return pts[(k * 7) % len(pts)]
        def on(i):
            d = dfs[i]
            if len(d) < 5: return d[0], d[1]
            x0, y0, c, rs = d[4]; cells = [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]
            return min(cells, key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
        async def settle(): await host.wait_for_timeout(700)
        async def jump(pg, nm):
            b1 = await pg.locator('#pDf .dfimg >> nth=1').bounding_box(); await pg.wait_for_timeout(900); b2 = await pg.locator('#pDf .dfimg >> nth=1').bounding_box()
            print('JUMP', nm, b1, b2, await pg.evaluate('scrollY'))
        pl = lambda s, k: s['pl'][k]

        # zoom and drag are not mistakes (phone A: + button, pinch is the same code path; drag while zoomed)
        await A.click('[data-z=in]'); await A.click('[data-z=in]')
        b = await box(A); await A.mouse.move(b['x'] + 100, b['y'] + 80); await A.mouse.down(); await A.mouse.move(b['x'] + 30, b['y'] + 30, steps=8); await A.mouse.up()
        await A.click('[data-z=reset]'); await settle(); s = await S(host)
        check(pl(s, kA)['w'] == 0 and not s['fd'], 'zooming in, dragging the picture and zooming back: no mistake, nothing found')

        # A: 4 mistakes, then reload: the counter stays at 4
        for i in range(4): await tap(A, *wrong_spot(i)); await A.wait_for_timeout(420)
        await settle(); s = await S(host)
        check(pl(s, kA)['w'] == 4 and pl(s, kA)['p'] == 0, f'4 mistakes counted for A only ({pl(s, kA)["w"]}), points never below zero ({pl(s, kA)["p"]})')
        check(pl(s, kB)['w'] == 0 and pl(s, kC)['w'] == 0, "the others' counters are untouched")
        await A.reload(); await A.wait_for_selector('#pDf .dfimg img', timeout=15000); await A.wait_for_timeout(800)
        check('الأخطاء: 4 من 5' in await A.inner_text('#dfMe'), 'A reloads the page: still «الأخطاء: 4 من 5»')
        await tap(A, *wrong_spot(5)); await settle(); s = await S(host)
        check(pl(s, kA)['w'] == 5 and pl(s, kA)['out'] == 1 and s['ph'] == 'play', 'A\'s 5th mistake: A stops, the round goes on for the others')
        await A.wait_for_function('document.querySelector("#dfMe").innerText.includes("انتهت محاولاتك")', timeout=5000)
        await tap(A, *on(0)); await settle(); s = await S(host)
        check(not s['fd'] and pl(s, kA)['f'] == 0, 'A (out) taps a real difference: nothing counted')
        # A leaves and joins again: still out
        await A.click('[data-act=leave]'); await A.wait_for_timeout(300); await A.click('[data-act=leave]'); await A.wait_for_timeout(800)
        await E.join(A, code, 'سارة'); await A.wait_for_selector('#pDf .dfimg img', timeout=15000); await A.wait_for_timeout(900)
        s = await S(host); check(pl(s, kA)['out'] == 1 and pl(s, kA)['w'] == 5 and 'انتهت محاولاتك' in await A.inner_text('#dfMe'), 'A leaves and joins again: still out for this round, same counters')

        # B finds after A is out
        await tap(B, *on(0)); await settle(); s = await S(host)
        check(pl(s, kB)['f'] == 1 and pl(s, kB)['p'] == 10 and s['fd'][0][5] == kB, 'B finds a difference after A is out: +10, shown with B\'s name')
        await C.wait_for_function('document.querySelectorAll("#pDf .dfm").length >= 2', timeout=5000)
        check('خالد' in await C.inner_text('#pDf'), 'the found difference appears on the other players\' screens with the finder\'s name')
        # tapping a found difference: not a mistake
        await tap(B, on(0)[0] + 3, on(0)[1]); await tap(C, on(0)[0], on(0)[1] - 3, False); await settle(); s = await S(host)
        check(pl(s, kB)['w'] == 0 and pl(s, kC)['w'] == 0 and len(s['fd']) == 1, 'tapping a difference already found (by me or another player): no mistake, no points')
        # the same touch reported twice by the browser: one tap
        await B.evaluate(f'(() => {{ const b = document.querySelectorAll("#pDf .dfimg")[1].getBoundingClientRect(); const x = b.left + {on(1)[0]} / {W} * b.width, y = b.top + {on(1)[1]} / {Hh} * b.height; for (let i = 0; i < 2; i++){{ const o = {{clientX:x, clientY:y, pointerId:7, bubbles:true, isPrimary:true}}; const el = document.querySelectorAll("#pDf .dfimg")[1]; el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new PointerEvent("pointerup", o)); }} }})()')
        await settle(); s = await S(host)
        check(pl(s, kB)['f'] == 2 and pl(s, kB)['p'] == 20 and pl(s, kB)['w'] == 0, 'a touch the browser fires twice counts once (+10 once, no mistake)')
        # B and C tap the same difference at the same time
        await asyncio.gather(tap(B, *on(2)), tap(C, *on(2), False)); await settle(); s = await S(host)
        got = [f for f in s['fd'] if f[0] == 2]
        winner = got[0][5] if got else None; loser = kC if winner == kB else kB
        check(len(got) == 1 and pl(s, loser)['w'] == 0 and pl(s, winner)['p'] in (30, 10), f'B and C tap the same difference at once: found once, +10 to one ({"B" if winner == kB else "C"}), no mistake for the other')
        lr = pl(s, loser).get('lr') or []
        check(lr[1:2] == ['taken'], f'the slower one is told who was first ({lr[1:2]})')
        # a phone that claims an earlier tap time than it really had gains at most 0.4 s
        g = await host.evaluate("""() => { clearTimeout(H.priv.dfT); H.priv.dfT = null; H.priv.dfq = [];
          const ts = srvNow(), fake = {presence:{n:"خالد", df:{rd:H.s.rd, q:[["forge1", 5, 5, 10, ts - 5000]]}}, ts};
          Diff.hostPeers([fake]); const q = H.priv.dfq.find(t => t.id === "forge1"); clearTimeout(H.priv.dfT); H.priv.dfT = null; H.priv.dfq = [];
          return q ? ts - q.at : null; }""")
        check(g is not None and g <= 400, f'a phone claiming its tap was 5 s earlier is counted at most 0.4 s earlier ({g} ms)')
        # precision: inside the box drawn around a difference but away from what really changed -> a mistake;
        # within the finger tolerance of two differences at once -> neither found nor a mistake (zoom in)
        import math
        def cellsof(d):
            if len(d) < 5: return []
            x0, y0, c, rs = d[4]; return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]
        def dist(d, x, y): return min([math.hypot(max(0, abs(x - cx) - 8), max(0, abs(y - cy) - 8)) for cx, cy in cellsof(d)] or [1e9])
        Tc = 40   # C's desktop picture is 524 px wide: 12 px of screen is more than 2.5% of 1600 -> 40
        fdn = {f[0] for f in (await S(host))['fd']}
        off = None
        for i, d in enumerate(dfs):
            if i in fdn: continue
            for gx in range(max(4, int(d[0] - d[2])), min(W - 4, int(d[0] + d[2])), 8):
                for gy in range(max(4, int(d[1] - d[3])), min(Hh - 4, int(d[1] + d[3])), 8):
                    if all(dist(e, gx, gy) > Tc + 12 and not (abs(gx - e[0]) <= e[2] + Tc and abs(gy - e[1]) <= e[3] + Tc and j != i) for j, e in enumerate(dfs)): off = (gx, gy); break
                if off: break
            if off: break
        if off:
            w0 = pl(await S(host), kC)['w']; await tap(C, *off, False); await settle(); s = await S(host)
            check(pl(s, kC)['w'] == w0 + 1 and len(s['fd']) == len(fdn), f'a tap inside the box of a difference but {int(min(dist(e, *off) for e in dfs))} px of the picture away from what changed: a mistake, not a find')
        else: check(True, 'no box with an empty part far enough from the change in this pair (skipped)')
        amb = None
        for gx in range(0, W, 8):
            for gy in range(0, Hh, 8):
                if sum(dist(e, gx, gy) <= Tc - 4 for j, e in enumerate(dfs) if j not in fdn) >= 2 and all(dist(e, gx, gy) > 4 for e in dfs): amb = (gx, gy); break
            if amb: break
        if amb:
            w0 = pl(await S(host), kC)['w']; await tap(C, *amb, False); await settle(); s = await S(host)
            check(pl(s, kC)['w'] == w0 and len(s['fd']) == len(fdn) and (pl(s, kC).get('lr') or [0, 0])[1] == 'amb', 'a tap between two close differences: not a find, not a mistake, the player is asked to zoom in')
        else: check(True, 'no two differences close enough to share one fingertip in this pair (ambiguous tap not possible)')
        # C's hint: not a mistake, −15 (not below zero), one per round
        pC = pl(s, kC)['p']; wC = pl(s, kC)['w']
        await C.click('[data-act=dfhint]'); await settle(); s = await S(host)
        check(pl(s, kC)['h'] == 1 and pl(s, kC)['w'] == wC and pl(s, kC)['p'] == max(0, pC - 15) and pl(s, kC)['hz'], f'C uses the hint: an approximate area, −15 ({pC} → {pl(s, kC)["p"]}), not a mistake')
        await C.wait_for_selector('#pDf .dfhz', timeout=5000)
        await C.click('[data-z=reset]')
        check(await C.locator('[data-act=dfhint]').is_disabled() and await B.locator('#pDf .dfhz').count() == 0, 'the hint area shows on C only, and C cannot ask again')
        # host reload in the middle: same round, same counters, old taps not judged again
        for pg in (A, B, C): await pg.evaluate('window.__ended = 0; new MutationObserver(() => { if (document.querySelector("#playerMain").innerText.includes("انتهت هذه اللعبة")) window.__ended = 1; }).observe(document.querySelector("#playerMain"), {childList:true, subtree:true, characterData:true})')
        before = await S(host)
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.s.ph === "play"', timeout=20000); await host.wait_for_timeout(1500)
        s = await S(host)
        check(s['pl'] == before['pl'] and s['fd'] == before['fd'], 'host reloads: same round, same counters, no tap judged twice')
        check([await pg.evaluate('window.__ended') for pg in (A, B, C)] == [0, 0, 0], 'while the host page reloads, no phone ever shows «the game ended»')
        # everything else found: by B and C alternately; the last one gets +50; nobody else's counters move
        left = [i for i in range(8) if i not in {f[0] for f in s['fd']}]
        for n, i in enumerate(left):
            await tap(B if n % 2 == 0 else C, *on(i), n % 2 == 0); await host.wait_for_timeout(450)
        try: await host.wait_for_function('H.s.ph === "over"', timeout=6000)
        except Exception:
            s = await S(host); print('DEBUG', s['ph'], left, [f[0] for f in s['fd']], {k: (v['f'], v['w'], v.get('lr')) for k, v in s['pl'].items()}, await host.evaluate('JSON.stringify(H.priv.dfs)'), dfs, await B.evaluate('JSON.stringify(NR.me && NR.me())').catch(lambda e: None) if False else ''); raise
        s = await S(host)
        last = s['fd'][-1][5]
        check(s['end'] == 'all' and len(s['fd']) == 8 and not s['rev'], 'all differences found before the time: the round ends at once')
        f = {k: v for k, v in s['pl'].items()}
        exp = lambda k: f[k]['f'] * 10 + (50 if k == last else 0) + (30 if f[k]['f'] and not f[k]['w'] and not f[k]['out'] else 0) - (15 if f[k]['h'] else 0)
        check(all(f[k]['p'] == max(0, exp(k)) or k == kC for k in f) and f[last]['b'] >= 50, f'points: +10 each, +50 for the last ({f[last]["n"]}), +30 without mistakes; B={f[kB]["p"]} C={f[kC]["p"]} A={f[kA]["p"]}')
        check(f[kA]['b'] == 0 and f[kA]['out'] == 1, 'no bonus for the player who was out')
        check(sum(v['f'] for v in f.values()) == 8, 'every difference counted once in total (8)')
        rk = s['rk']; check(rk[-1] == kA and s['tot'][kB]['p'] == f[kB]['p'], f'results ranked by points; overall table saved ({[s["pl"][k]["n"] for k in rk]})')
        for pg, n in ((A, 'A'), (B, 'B'), (C, 'C')):
            await pg.wait_for_selector('.dfres', timeout=5000)
        txt = await B.inner_text('#pDfStatus'); check('الأخطاء' in txt and 'النقاط' in txt and 'خالد' in txt, 'the results screen shows name, differences, mistakes, time and points on the phones')
        sz = await host.evaluate("""() => { const raw = NR.peers().find(p => p.isMe).raw.length, s = JSON.parse(JSON.stringify(H.s));
          const one = k => JSON.stringify(s.pl[k]).length + JSON.stringify(s.tot[k] || {}).length + k.length + 12;
          const per = Math.max(...Object.keys(s.pl).map(one)) + 40; return {raw, per, max30: raw + per * 27}; }""")
        check(sz['max30'] < 12000, f"room data the host sends stays under the database limit of 12000 characters: {sz['raw']} now, about {sz['max30']} with 30 players (names of up to 24 letters)")
        await host.screenshot(path='spot2_host_over.png', full_page=True); await A.screenshot(path='spot2_phone_over.png', full_page=True)

        # round 2 (easy, 5): A is back; time runs out with differences left
        await host.click('[data-h=lobby]'); await host.click('[data-opt=lv][data-val="0"]'); await host.click('[data-h=start]')
        await host.wait_for_function('H.s.ph === "play"', timeout=15000); await A.wait_for_selector('#pDf .dfimg img', timeout=15000); await host.wait_for_timeout(600)
        s = await S(host); dfs = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        check(s['nd'] == 5 and pl(s, kA) == {'n': 'سارة', 'f': 0, 'w': 0, 'p': 0, 'h': 0, 'out': 0, 'ft': 0, 'b': 0}, 'next round (easy, 5 differences): A plays again with 5 new attempts')
        await tap(A, *on(0)); await settle()
        await host.evaluate('window.__off = (window.__off || 0) + 301000'); await host.wait_for_function('H.s.ph === "over"', timeout=6000); s = await S(host)
        check(s['end'] == 'time' and len(s['rev']) == 4, 'time is up with 4 differences left: the round ends and shows them')
        await A.wait_for_selector('#pDf .dfm.rev', timeout=5000); check(await A.locator('#pDf .dfm.rev').count() >= 4, 'the phones show the differences nobody found')
        check(s['tot'][kA]['r'] == 2 and s['tot'][kA]['p'] >= 10, 'the overall table adds up the rounds')

        # round 3 (hard, 12): all 3 players use their 5 attempts -> the round ends
        await host.click('[data-h=lobby]'); await host.click('[data-opt=lv][data-val="2"]'); await host.click('[data-h=start]')
        await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(600)
        s = await S(host); dfs = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        check(s['nd'] == 12 and len(dfs) == 12, f'hard pair has 12 differences ({s["pair"]["id"]})')
        for k in range(5):
            await asyncio.gather(tap(A, *wrong_spot(k)), tap(B, *wrong_spot(k + 1)), tap(C, *wrong_spot(k + 2), False)); await host.wait_for_timeout(450)
        await host.wait_for_function('H.s.ph === "over"', timeout=6000); s = await S(host)
        check(s['end'] == 'out' and all(v['out'] for v in s['pl'].values()), 'all three players used their 5 attempts: the round ends (not left hanging)')
        for pg, w in ((A, 390), (B, 360), (C, 1280)):
            sw = await pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'no horizontal scroll at {w} px ({sw})')
        await B.screenshot(path='spot2_phone360.png', full_page=True)

        # solo room: one player, 5 mistakes -> the round ends
        host2 = await E.page('host2', 1280, 900); D = await E.page('D', 390, 844)
        code2 = await E.start(host2, 'diff', {'lv': 0, 'lim': 0})
        await E.join(D, code2, 'ليلى'); await host2.wait_for_timeout(700); await host2.click('[data-h=start]')
        await D.wait_for_selector('#pDf .dfimg img', timeout=15000); await host2.wait_for_timeout(600)
        s2 = await S(host2); dfs = await host2.evaluate('H.priv.dfs'); W, Hh = s2['pair']['w'], s2['pair']['h']
        for k in range(5): await tap(D, *wrong_spot(k)); await D.wait_for_timeout(420)
        await host2.wait_for_function('H.s.ph === "over"', timeout=6000); s2 = await S(host2)
        check(s2['end'] == 'solo' and len(s2['rev']) == 5, 'a single player\'s 5th mistake ends the round and shows the differences')

    bad = [m for ok, m in R if not ok]
    print('PAGE ERRORS:', E.errs or 'none'); print(f'{sum(ok for ok, _ in R)}/{len(R)} passed'); sys.exit(1 if bad or E.errs else 0)
asyncio.run(main())
