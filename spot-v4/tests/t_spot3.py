"""Spot the difference v4 (independent finds): a host and 3 players (phone 390, phone 360, computer), then solo rooms.
Every player looks for ALL the differences alone; what one finds is shown and counted for that player only.
Real pages, real taps (touch on the phones, mouse on the computer)."""
import asyncio, json, sys
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')
CIRCLES = 'document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm:not(.rev)").length'
HOSTCIRCLES = 'document.querySelectorAll("#hostMain .dfimg:nth-child(2) .dfm").length'

def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]

async def main():
    async with Env(8783) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'diff', {'lv': 1, 'lim': 300})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        await host.click('[data-h=start]')
        for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(900)
        s = await S(host); D = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        kA, kB, kC = await key(host, 'صالح'), await key(host, 'تافير'), await key(host, 'نورة')
        check(s['nd'] == 8 and len(D) == 8 and set(s['pl']) == {kA, kB, kC}, f'medium round: 8 differences, 3 players each with their own record ({s["pair"]["id"]})')
        check(bool(s.get('hk')), 'the host published its public key for the sealed channel')

        def on(i):
            d = D[i]; return min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
        async def tap(pg, x, y, touch=True):
            sel = '#pDf .dfimg >> nth=1'; await pg.locator(sel).scroll_into_view_if_needed(); b = await pg.locator(sel).bounding_box()
            px, py = b['x'] + x / W * b['width'], b['y'] + y / Hh * b['height']
            if touch: await pg.touchscreen.tap(px, py)
            else: await pg.mouse.click(px, py)
        def wrong(k=0):
            pts = [(gx / 20 * W, gy / 12 * Hh) for gx in range(1, 20) for gy in range(1, 12)]
            pts = [p for p in pts if all(abs(p[0] - d[0]) > d[2] + 0.06 * W or abs(p[1] - d[1]) > d[3] + 0.06 * W for d in D)]
            return pts[(k * 7) % len(pts)]
        async def settle(t=1100): await host.wait_for_timeout(t)
        pl = lambda s, k: s['pl'][k]
        async def leak(pg, found_idx):
            """everything this phone can read from the room: no box of any difference, no plain tap"""
            raw = await pg.evaluate('JSON.stringify(NR.peers().map(p => p.raw))')
            boxes = any(f'{d[0]},{d[1]},{d[2]},{d[3]}' in raw for d in D)
            return boxes or '"q":[' in raw or '"fi"' in raw or '"hz"' in raw

        # zoom and drag
        await A.click('[data-z=in]'); await A.click('[data-z=in]')
        b = await A.locator('#pDf .dfimg >> nth=1').bounding_box(); await A.mouse.move(b['x'] + 100, b['y'] + 80); await A.mouse.down(); await A.mouse.move(b['x'] + 30, b['y'] + 30, steps=8); await A.mouse.up()
        await A.click('[data-z=reset]'); await settle(); s = await S(host)
        check(pl(s, kA)['w'] == 0 and pl(s, kA)['f'] == 0, 'zoom in, drag, zoom back: no mistake, nothing found')

        # 1. the three players find the SAME difference: each gets it
        await asyncio.gather(tap(A, *on(0)), tap(B, *on(0)), tap(C, *on(0), False)); await settle(1500); s = await S(host)
        check(all(pl(s, k)['f'] == 1 and pl(s, k)['p'] == 10 for k in (kA, kB, kC)), f'the same difference found by all three at once: each gets it, +10 each ({[pl(s, k)["p"] for k in (kA, kB, kC)]})')
        for pg in (A, B, C): await pg.wait_for_function(CIRCLES + ' === 1', timeout=6000)
        check(True, 'each phone shows its own circle')
        # 2. B finds a second one: only B's screen shows it
        await tap(B, *on(1)); await settle(); s = await S(host)
        await B.wait_for_function(CIRCLES + ' === 2', timeout=6000)
        a_c, c_c = await A.evaluate(CIRCLES), await C.evaluate(CIRCLES)
        check(pl(s, kB)['f'] == 2 and a_c == 1 and c_c == 1, f'B found another difference: shown on B only (A sees {a_c} circle, C sees {c_c})')
        check(await host.evaluate(HOSTCIRCLES) == 0, 'the host screen shows no place of any difference during the round')
        check(not await leak(A, []) and not await leak(C, []), 'what the phones can read from the room holds no box of a difference, no plain tap, no other player\'s finds or hint')
        txt = await A.inner_text('#pDfStatus'); check('تافير' in txt and '2' in txt, 'A sees how many B found (a count, not where)')
        # another device using A's name (a different identity) cannot take A's record
        took = await host.evaluate(f"""() => {{ const k = {json.dumps(kA)}, before = (H.priv.pk || {{}})[k];
          Diff.hostPeers([{{peer:"evil0001", uid:"evil-identity", presence:{{r:"p", n:"صالح", df:{{rd:H.s.rd, pk:"BEvil", e:"x"}}}}, ts:srvNow()}}]);
          return (H.priv.pk || {{}})[k] !== before; }}""")
        check(not took, 'another device that takes A\'s name cannot read or play A\'s record (bound to A\'s device identity)')
        # 3. A taps its own find again: no points, no mistake
        await tap(A, on(0)[0] + 3, on(0)[1]); await settle(); s = await S(host)
        check(pl(s, kA)['f'] == 1 and pl(s, kA)['p'] == 10 and pl(s, kA)['w'] == 0, 'A taps its own find again: no extra points, not a mistake')
        # a touch the browser fires twice counts once
        x1, y1 = on(1)
        await A.evaluate(f'(() => {{ const el = document.querySelectorAll("#pDf .dfimg")[1], b = el.getBoundingClientRect(); const x = b.left + {x1} / {W} * b.width, y = b.top + {y1} / {Hh} * b.height; for (let i = 0; i < 2; i++){{ const o = {{clientX:x, clientY:y, pointerId:7, bubbles:true, isPrimary:true}}; el.dispatchEvent(new PointerEvent("pointerdown", o)); el.dispatchEvent(new PointerEvent("pointerup", o)); }} }})()')
        await settle(); s = await S(host)
        check(pl(s, kA)['f'] == 2 and pl(s, kA)['p'] == 20 and pl(s, kA)['w'] == 0, 'a touch the browser fires twice counts once (A finds the difference B found too: +10 once)')

        # 4. A: 4 mistakes, reload: counter, finds and circles come back
        for i in range(4): await tap(A, *wrong(i)); await A.wait_for_timeout(450)
        await settle(); s = await S(host)
        check(pl(s, kA)['w'] == 4 and pl(s, kA)['p'] == 0 and pl(s, kB)['w'] == 0, f'4 mistakes for A only, points never below zero ({pl(s, kA)["p"]})')
        await A.reload(); await A.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await A.wait_for_function(CIRCLES + ' === 2', timeout=8000)
        check('الأخطاء المتبقية: 1' in await A.inner_text('#dfMe') and 'اكتشفت 2 من 8' in await A.inner_text('#dfMe'), 'A reloads: 2 finds with their circles, 1 attempt left')
        await tap(A, *wrong(5)); await settle(); s = await S(host)
        check(pl(s, kA)['out'] == 1 and s['ph'] == 'play', "A's 5th mistake: A stops, the round goes on")
        await A.wait_for_function('document.querySelector("#dfMe").innerText.includes("انتهت محاولاتك")', timeout=5000)
        await tap(A, *on(2)); await settle(); s = await S(host)
        check(pl(s, kA)['f'] == 2, 'A (out) taps a real difference: nothing counted')
        # A leaves and comes back
        await A.click('[data-act=leave]'); await A.wait_for_timeout(300); await A.click('[data-act=leave]'); await A.wait_for_timeout(800)
        await E.join(A, code, 'صالح'); await A.wait_for_selector('#pDf .dfimg img', timeout=15000); await A.wait_for_function(CIRCLES + ' === 2', timeout=8000); s = await S(host)
        check(pl(s, kA)['out'] == 1 and pl(s, kA)['w'] == 5 and pl(s, kA)['f'] == 2 and 'انتهت محاولاتك' in await A.inner_text('#dfMe'), 'A leaves and joins again: same finds (circles back), mistakes and points; still out')

        # 5. hint on C: only C sees the area
        pC, wC = pl(s, kC)['p'], pl(s, kC)['w']
        await C.click('[data-act=dfhint]'); await settle(); s = await S(host)
        await C.wait_for_selector('#pDf .dfhz', timeout=5000); await C.click('[data-z=reset]')
        check(pl(s, kC)['h'] == 1 and pl(s, kC)['w'] == wC and pl(s, kC)['p'] == max(0, pC - 15), f'C uses the hint: −15 ({pC} → {pl(s, kC)["p"]}), not a mistake')
        check(await B.locator('#pDf .dfhz').count() == 0 and await A.locator('#pDf .dfhz').count() == 0 and await C.locator('[data-act=dfhint]').is_disabled(), 'the hint area shows on C only, once')

        # 6. host reload: nothing lost, no phone shows "ended", the sealed records come back
        for pg in (A, B, C): await pg.evaluate('window.__ended = 0; new MutationObserver(() => { if (document.querySelector("#playerMain").innerText.includes("انتهت هذه اللعبة")) window.__ended = 1; }).observe(document.querySelector("#playerMain"), {childList:true, subtree:true, characterData:true})')
        before = await S(host)
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.s.ph === "play"', timeout=20000); await host.wait_for_timeout(2000)
        s = await S(host); D = await host.evaluate('H.priv.dfs')
        check(s['pl'] == before['pl'] and s['hk'] == before['hk'], 'host reloads: same round, same records, same key')
        check([await pg.evaluate('window.__ended') for pg in (A, B, C)] == [0, 0, 0], 'while the host page reloads, no phone shows «the game ended»')
        await tap(B, *on(2)); await settle(); s = await S(host)
        await B.wait_for_function(CIRCLES + ' === 3', timeout=8000)
        check(pl(s, kB)['f'] == 3, 'after the host reload B keeps playing: 3 finds, 3 circles')

        # 7. B finds them all: B's part ends with +50, C plays on
        for i in range(3, 8): await tap(B, *on(i)); await B.wait_for_timeout(500)
        await settle(1500); s = await S(host)
        check(pl(s, kB)['done'] == 1 and pl(s, kB)['f'] == 8 and pl(s, kB)['b'] == 50 and s['ph'] == 'play', f'B found all 8: +50, B\'s part is over, the round goes on ({pl(s, kB)["p"]} points)')
        await B.wait_for_function('document.querySelector("#dfMe").innerText.includes("اكتشفت كل الفروق")', timeout=5000)
        check(await C.evaluate(CIRCLES) == 1, 'C still sees only its own find')
        # 8. C finds the rest (A is out, B done): the round ends
        left = [i for i in range(8) if i != 0]
        for i in left: await tap(C, *on(i), False); await C.wait_for_timeout(500)
        await host.wait_for_function('H.s.ph === "over"', timeout=8000); s = await S(host)
        f = s['pl']
        check(s['end'] == 'all' or s['end'] == 'done', f'everybody finished (A out, B and C complete): the round ends ({s["end"]})')
        check(f[kB]['p'] == 80 + 50 + 30 and f[kC]['f'] == 8 and f[kC]['b'] == 80 and f[kA]['b'] == 0, f'points: B 8×10 +50 +30 = {f[kB]["p"]}; C {f[kC]["p"]} (hint −15, bonuses {f[kC]["b"]}); A {f[kA]["p"]} (no bonus)')
        check(s['rk'] == [kB, kC, kA], f'ranking by points, then finds, then mistakes, then time ({[f[k]["n"] for k in s["rk"]]})')
        check(len(s['rev']) == 8 and set(map(tuple, map(sorted, [s['pf'][kB]]))) and sorted(s['pf'][kA]) == [0, 1], 'after the round every difference and each player\'s finds become visible')
        await A.wait_for_selector('.dfres', timeout=6000)
        g = await A.evaluate('[document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm:not(.rev)").length, document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm.rev").length]')
        check(g == [2, 6], f'review on A: its 2 finds green, the 6 others orange ({g})')
        await A.click(f'[data-act=dfsel][data-k="{kB}"]'); await A.wait_for_timeout(300)
        g = await A.evaluate('[document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm:not(.rev)").length, document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm.rev").length]')
        check(g == [8, 0], f'A opens B\'s finds: all 8 green ({g})')
        txt = await B.inner_text('#pDfStatus'); check('النقاط' in txt and 'تافير' in txt and 'ترتيبك 1' in txt, 'results on the phones: rank, name, finds, mistakes, time, points')
        check(await A.locator('.dfreport').count() == 0 and await host.locator('.dfreport').count() == 1, 'the report button is on the host only, after the round')
        await A.screenshot(path='spot3_phone_over.png', full_page=True); await host.screenshot(path='spot3_host_over.png', full_page=True)

        # 9. round 2 (easy): time is up with different progress
        await host.click('[data-h=lobby]'); await host.click('[data-opt=lv][data-val="0"]'); await host.click('[data-h=start]')
        await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(900)
        s = await S(host); D = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        check(s['nd'] == 5 and pl(s, kA)['out'] == 0 and pl(s, kA)['f'] == 0, 'next round (easy, 5): A plays again with 5 attempts, records start from zero')
        for pg in (A, B, C): check(await pg.evaluate(CIRCLES) == 0, 'no circle of the last round left on the phone')
        await tap(A, *on(0)); await tap(A, *on(1)); await tap(B, *on(1)); await settle(1500)
        await host.evaluate('window.__off = (window.__off || 0) + 301000'); await host.wait_for_function('H.s.ph === "over"', timeout=6000); s = await S(host)
        check(s['end'] == 'time' and pl(s, kA)['f'] == 2 and pl(s, kB)['f'] == 1 and pl(s, kC)['f'] == 0 and s['rk'][0] == kA, 'time is up with different progress: A 2, B 1, C 0; ranked in that order')
        check(s['tot'][kA]['r'] == 2 and s['tot'][kB]['p'] >= 160, 'the overall table adds up both rounds')

        # 10. round 3 (hard): everybody uses their 5 attempts
        await host.click('[data-h=lobby]'); await host.click('[data-opt=lv][data-val="2"]'); await host.click('[data-h=start]')
        await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(900)
        s = await S(host); D = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        check(s['nd'] == 12, f'hard round: 12 differences ({s["pair"]["id"]})')
        for k in range(5):
            await asyncio.gather(tap(A, *wrong(k)), tap(B, *wrong(k + 1)), tap(C, *wrong(k + 2), False)); await host.wait_for_timeout(500)
        await host.wait_for_function('H.s.ph === "over"', timeout=8000); s = await S(host)
        check(s['end'] == 'out' and all(v['out'] for v in s['pl'].values()), 'all three used their 5 attempts: the round ends')
        sz = await host.evaluate('NR.peers().find(p => p.isMe).raw.length')
        check(sz < 12000, f'the host seat stays under the database limit ({sz} characters)')
        for pg, w in ((A, 390), (B, 360), (C, 1280)):
            sw = await pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'no horizontal scroll at {w} px ({sw})')
        # sealed messages: one sealed for a player cannot be opened as another player's
        ok = await A.evaluate('''async () => { const a = await DFC.mine(), b = await DFC.pair(null), k = await DFC.shared(a, b.pub);
            const e = await DFC.seal(k, {q:[1]}, DFC.ad("up", "1234", 1, "n_a")); try { await DFC.open(k, e, DFC.ad("up", "1234", 1, "n_b")); return false; } catch(x){ return true; } }''')
        check(ok, 'a sealed message cannot be read as another player\'s (or another round\'s)')

        # 11. solo: one player, 5 mistakes; another solo player completes the picture
        host2 = await E.page('host2', 1280, 900); Dp = await E.page('D', 390, 844)
        code2 = await E.start(host2, 'diff', {'lv': 0, 'lim': 0})
        await E.join(Dp, code2, 'ليلى'); await host2.wait_for_timeout(700); await host2.click('[data-h=start]')
        await Dp.wait_for_selector('#pDf .dfimg img', timeout=15000); await host2.wait_for_timeout(900)
        s2 = await S(host2); D = await host2.evaluate('H.priv.dfs'); W, Hh = s2['pair']['w'], s2['pair']['h']
        for k in range(5): await tap(Dp, *wrong(k)); await Dp.wait_for_timeout(450)
        await host2.wait_for_function('H.s.ph === "over"', timeout=6000); s2 = await S(host2)
        check(s2['end'] == 'solo', 'a single player\'s 5th mistake ends the round')
        await host2.click('[data-h=go]'); await host2.wait_for_function('H.s.ph === "play"', timeout=15000); await Dp.wait_for_selector('#pDf .dfimg img', timeout=15000); await host2.wait_for_timeout(900)
        s2 = await S(host2); D = await host2.evaluate('H.priv.dfs'); W, Hh = s2['pair']['w'], s2['pair']['h']
        for i in range(5): await tap(Dp, *on(i)); await Dp.wait_for_timeout(450)
        await host2.wait_for_function('H.s.ph === "over"', timeout=6000); s2 = await S(host2); kD = await key(host2, 'ليلى')
        check(s2['end'] == 'all' and s2['pl'][kD]['p'] == 50 + 50 + 30, f'a single player who finds them all ends the round: 5×10 +50 +30 = {s2["pl"][kD]["p"]}')

    bad = [m for ok, m in R if not ok]
    print('PAGE ERRORS:', E.errs or 'none'); print(f'{sum(ok for ok, _ in R)}/{len(R)} passed'); sys.exit(1 if bad or E.errs else 0)
asyncio.run(main())
