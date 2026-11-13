"""Spot the difference v4, final rules: every player finds the differences alone, the FIRST to find them all wins and the
round stops for everybody; completions within 0.3 s of the first are a joint win. No hints, no image buttons while playing.
A host and 3 players (phone 390, phone 360, computer), then solo rooms. Real pages, real taps."""
import asyncio, json, os, sys
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')
CIRCLES = 'document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm:not(.rev)").length'
REVIEW = '[document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm:not(.rev)").length, document.querySelectorAll("#pDf .dfimg:nth-child(2) .dfm.rev").length]'
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots')

def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]

async def main():
    import os; os.makedirs(SHOTS, exist_ok=True)
    async with Env(8784) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'diff', {'lv': 0, 'pk': 'auto', 'lim': 300})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        G = {}
        async def new_round(lv=None):
            if lv is not None:
                await host.click('[data-h=lobby]'); await host.click(f'[data-opt=lv][data-val="{lv}"]'); await host.click('[data-h=start]')
            elif await host.locator('[data-h=go]').count(): await host.click('[data-h=go]')
            else: await host.click('[data-h=start]')
            await host.wait_for_function('H.s.ph === "play"', timeout=15000)
            for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
            await host.wait_for_timeout(900)
            s = await S(host); G['D'] = await host.evaluate('H.priv.dfs'); G['W'], G['H'] = s['pair']['w'], s['pair']['h']; return s
        def on(i):
            d = G['D'][i]; return min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
        async def tap(pg, x, y, touch=True):
            sel = '#pDf .dfimg >> nth=1'; await pg.locator(sel).scroll_into_view_if_needed(); b = await pg.locator(sel).bounding_box()
            px, py = b['x'] + x / G['W'] * b['width'], b['y'] + y / G['H'] * b['height']
            if touch: await pg.touchscreen.tap(px, py)
            else: await pg.mouse.click(px, py)
        def wrong(k=0):
            D, W, Hh = G['D'], G['W'], G['H']
            pts = [(gx / 20 * W, gy / 12 * Hh) for gx in range(1, 20) for gy in range(1, 12)]
            pts = [p for p in pts if all(abs(p[0] - d[0]) > d[2] + 0.06 * W or abs(p[1] - d[1]) > d[3] + 0.06 * W for d in D)]
            return pts[(k * 7) % len(pts)]
        async def settle(t=1000): await host.wait_for_timeout(t)
        async def taps(pg, idx, touch=True):
            for i in idx: await tap(pg, *on(i), touch); await pg.wait_for_timeout(350)
        pl = lambda s, k: s['pl'][k]
        kA, kB, kC = await key(host, 'صالح'), await key(host, 'تافير'), await key(host, 'نورة')

        # ================= round 1 (easy, 5): joint win
        s = await new_round()
        check(s['nd'] == 5 and set(s['pl']) == {kA, kB, kC} and s.get('hk'), f'round 1: 5 differences, 3 players, each with a record ({s["pair"]["id"]})')
        for pg, n in ((A, 'phone 390'), (B, 'phone 360'), (C, 'computer')):
            nb = await pg.evaluate('[...document.querySelectorAll("#playerMain button")].map(b => b.textContent.trim()).join("|")')
            check('تلميح' not in nb and 'ⓘ' not in nb and 'إبلاغ' not in nb and 'معلومات' not in nb, f'{n}: no hint, image-info or report button while playing')
        cr = await A.inner_text('.dfcredit'); check(len(cr) > 8 and 'commons.wikimedia.org' not in await A.inner_html('#playerMain'), f'a short credit line under the pictures, no link to the original while playing («{cr}»)')
        check('commons.wikimedia.org/wiki' not in await host.inner_html('#hostMain'), 'host screen: no link to the original picture while playing')
        await A.screenshot(path=f'{SHOTS}/phone_playing_start.png', full_page=True)
        # zoom/drag
        await A.click('[data-z=in]'); await A.click('[data-z=in]')
        b = await A.locator('#pDf .dfimg >> nth=1').bounding_box(); await A.mouse.move(b['x'] + 100, b['y'] + 80); await A.mouse.down(); await A.mouse.move(b['x'] + 30, b['y'] + 30, steps=8); await A.mouse.up()
        await A.click('[data-z=reset]'); await settle(); s = await S(host)
        check(pl(s, kA)['w'] == 0 and pl(s, kA)['f'] == 0, 'zoom and drag are not mistakes')
        # the same difference for all three
        await asyncio.gather(tap(A, *on(0)), tap(B, *on(0)), tap(C, *on(0), False)); await settle(1500); s = await S(host)
        check(all(pl(s, k)['f'] == 1 and pl(s, k)['p'] == 10 for k in (kA, kB, kC)), 'three players find the same difference: each +10')
        for pg in (A, B, C): await pg.wait_for_function(CIRCLES + ' === 1', timeout=6000)
        await taps(B, [1]); await B.wait_for_function(CIRCLES + ' === 2', timeout=6000)
        check(await A.evaluate(CIRCLES) == 1 and await C.evaluate(CIRCLES) == 1, 'a find of B shows on B only')
        check(await host.evaluate('document.querySelectorAll("#hostMain .dfm").length') == 0, 'the host screen shows no circle during the round')
        # v5: no live ranking while playing: a phone sees only its own record, the host only how many play
        ta = await A.inner_text('#playerMain')
        check(await A.locator('.dflive').count() == 0 and 'تافير' not in ta and 'نورة' not in ta, 'v5: during the round a phone shows no list of the other players (no live ranking)')
        th = await host.inner_text('#dfSide')
        check('في الجولة: 3' in th and 'تافير' not in th and await host.locator('.dflive').count() == 0, f'v5: the host screen during the round: how many play, no names or counts ({th.splitlines()[:2]})')
        raw = await A.evaluate('JSON.stringify(NR.peers().map(p => p.raw))')
        check(not any(f'{d[0]},{d[1]},{d[2]},{d[3]}' in raw for d in G['D']) and '"q":[' not in raw, 'what a phone can read from the room: no place of a difference, no plain tap')
        await tap(A, on(0)[0] + 3, on(0)[1]); await settle(); s = await S(host)
        check(pl(s, kA)['f'] == 1 and pl(s, kA)['p'] == 10 and pl(s, kA)['w'] == 0, 'A taps its own find again: no points, no mistake')
        # A: mistakes, reload, out, rejoin
        for i in range(4): await tap(A, *wrong(i)); await A.wait_for_timeout(400)
        await settle(); await A.reload(); await A.wait_for_selector('#pDf .dfimg img', timeout=15000); await A.wait_for_function(CIRCLES + ' === 1', timeout=8000)
        check('الأخطاء المتبقية: 1' in await A.inner_text('#dfMe'), 'A reloads after 4 mistakes: its find and 1 attempt left come back')
        await tap(A, *wrong(5)); await settle(); s = await S(host)
        check(pl(s, kA)['out'] == 1 and pl(s, kA)['w'] == 5 and s['ph'] == 'play', "A's 5th mistake: A stops, the round goes on")
        await A.click('[data-act=leave]'); await A.wait_for_timeout(300); await A.click('[data-act=leave]'); await A.wait_for_timeout(800)
        await E.join(A, code, 'صالح'); await A.wait_for_selector('#pDf .dfimg img', timeout=15000); await A.wait_for_timeout(1200); s = await S(host)
        check(pl(s, kA)['out'] == 1 and pl(s, kA)['w'] == 5 and 'استُبعدت' in await A.inner_text('#dfMe'), 'A leaves and joins again: still out, mistakes not reset')
        # host reload in the middle
        for pg in (A, B, C): await pg.evaluate('window.__ended = 0; new MutationObserver(() => { if (document.querySelector("#playerMain").innerText.includes("انتهت هذه اللعبة")) window.__ended = 1; }).observe(document.querySelector("#playerMain"), {childList:true, subtree:true, characterData:true})')
        before = await S(host); await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.s.ph === "play"', timeout=20000); await host.wait_for_timeout(1800)
        s = await S(host); G['D'] = await host.evaluate('H.priv.dfs')
        check(s['pl'] == before['pl'] and [await pg.evaluate('window.__ended') for pg in (A, B, C)] == [0, 0, 0], 'host reloads: same records, no phone shows «the game ended»')
        # B and C reach 4 of 5, then both tap the last one at the same moment
        await taps(B, [2, 3]); await taps(C, [1, 2, 3], False); await settle(1200); s = await S(host)
        check(pl(s, kB)['f'] == 4 and pl(s, kC)['f'] == 4 and s['ph'] == 'play', 'B and C both at 4 of 5')
        await B.screenshot(path=f'{SHOTS}/phone_playing.png', full_page=True)
        await asyncio.gather(tap(B, *on(4)), tap(C, *on(4), False))
        await host.wait_for_function('H.s.ph === "over"', timeout=6000); s = await S(host); f = s['pl']
        gap = abs(f[kB]['da'] - f[kC]['da'])
        check(s['end'] == 'win' and sorted(s['win']) == sorted([kB, kC]), f'B and C complete within the 0.3 s window ({gap} ms apart on the host): joint win')
        check(f[kB]['p'] == 50 + 50 + 30 and f[kC]['p'] == 130 and f[kA]['p'] == 0 and f[kA]['b'] == 0, f'points: each winner 5×10 +50 +30 = {f[kB]["p"]}/{f[kC]["p"]}; A 0')
        check(s['rn'][kB] == 1 and s['rn'][kC] == 1 and s['rk'][-1] == kA, 'both winners ranked 1, A last')
        for pg in (A, B, C): await pg.wait_for_selector('#dfHeroCard', timeout=6000)
        hero = await A.inner_text('#dfHeroCard'); check('130 نقطة لكل منهم' in hero, 'v5: the hero gives the winners\' points («130 نقطة لكل منهم»)')
        async def order(pg, sels):
            ys = [await pg.evaluate(f'(() => {{ const e = document.querySelector({json.dumps(q)}); return e ? e.getBoundingClientRect().top + scrollY : -1; }})()') for q in sels]
            return all(y >= 0 for y in ys) and ys == sorted(ys), ys
        for pg, n in ((A, 'phone 390'), (B, 'phone 360'), (C, 'computer')):
            ok, ys = await order(pg, ['#dfHeroCard', '.dfround', '.dfoverall', '.dfpic'])
            check(ok, f'v5 {n}: results screen in order: winner, round results, overall ranking, then the picture with the differences ({[round(y) for y in ys]})')
        ok, ys = await order(host, ['#dfHeroCard', '.dfround', '[data-h=go]', '.dfpic'])
        check(ok, f'v5 host: winner, results, «الجولة التالية», then the picture ({[round(y) for y in ys]})')
        check('جديد' not in await A.inner_text('.dfoverall') and 'التغيّر' not in await A.inner_text('.dfoverall') and '+130' not in await A.inner_text('.dfoverall'), 'v5: first round: no «change» column yet')
        check('فوز مشترك' in hero and 'تافير' in hero and 'نورة' in hero and '5 من 5' in hero, f'results: «🏆 فوز مشترك: تافير ونورة», completed 5 of 5 ({hero.splitlines()[1:3]})')
        txt = await A.inner_text('#pDfStatus'); check('استُبعد — 5 أخطاء' in txt and 'الترتيب العام' in txt and 'مرات الفوز' in txt, 'table: A «استُبعد — 5 أخطاء»; overall board with wins shown separately')
        check(await A.locator('.dfres tr.win').count() == 2, 'the two winners are marked gold in the table')
        g = await A.evaluate(REVIEW); check(g == [1, 4], f'review on A: its 1 find green, 4 orange ({g})')
        await A.click('.dfcredit-box summary'); ci = await A.inner_html('.dfcredit-box')
        check('commons.wikimedia.org' in ci or 'رسم أصلي' in ci, 'after the round: the picture\'s author, source link and licence')
        check(await A.locator('.dfreport').count() == 0 and await host.locator('.dfreport').count() == 1, 'report: host only, inside the round details after the round')
        await A.screenshot(path=f'{SHOTS}/phone_results_joint.png', full_page=True); await host.screenshot(path=f'{SHOTS}/host_results_joint.png', full_page=True)
        tot1 = (await S(host))['tot']
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code', timeout=20000); await host.wait_for_timeout(1500)
        await B.reload(); await B.wait_for_selector('#dfHeroCard', timeout=15000); await host.wait_for_timeout(800)
        check((await S(host))['tot'] == tot1, 'host and phone reload after the round: results and win counts are not counted again')

        # ================= round 2 (easy): B completes first, C 0.8 s later -> B alone
        s = await new_round()
        check(all(v['w'] == 0 and v['f'] == 0 and not v['out'] for v in s['pl'].values()), 'new round: everybody has 5 new attempts (A too)')
        for pg in (A, B, C): check(await pg.evaluate(CIRCLES) == 0, 'no circle of the last round left on the phone')
        await taps(B, [0, 1, 2, 3]); await taps(C, [0, 1, 2, 3], False); await taps(A, [0]); await settle(1200)
        s0 = await S(host); a0, c0 = dict(pl(s0, kA)), dict(pl(s0, kC))
        # what phone A sees of the round, every 15 ms, from the winning tap until the result
        await A.evaluate(f'''(() => {{ window.__seen = []; const t = setInterval(() => {{ const h = findHost(), hs = h && h.presence.s; if (!hs) return;
            window.__seen.push([hs.ph, (hs.pl[{json.dumps(kB)}] || {{}}).f, (hs.pl[{json.dumps(kB)}] || {{}}).done || 0, performance.now()]); if (hs.ph === "over") clearInterval(t); }}, 15); }})()''')
        tB = await A.evaluate('performance.now()')
        # B completes; 100 ms later A finds a new difference and C makes a mistake (inside the window: neither may count);
        # 0.8 s later C completes (after the window: not counted)
        await tap(B, *on(4)); await A.wait_for_timeout(100)
        await asyncio.gather(tap(A, *on(1)), tap(C, *wrong(3), False))
        await C.wait_for_timeout(700); await tap(C, *on(4), False)
        await host.wait_for_function('H.s.ph === "over"', timeout=6000); await settle(1200); s = await S(host); f = s['pl']
        check(f[kA]['f'] == a0['f'] and f[kA]['p'] - f[kA]['b'] == a0['p'] and f[kC]['w'] == c0['w'], f'inside the 0.3 s window only another completion can count: A\'s new find and C\'s mistake 0.1 s after B\'s completion were not counted (A {a0["f"]}→{f[kA]["f"]}, C mistakes {c0["w"]}→{f[kC]["w"]})')
        seen = await A.evaluate('window.__seen')
        early = [x for x in seen if x[0] == 'play' and (x[2] or x[1] == 5)]
        first_over = next((x[3] for x in seen if x[0] == 'over'), None)
        check(not early and first_over is not None and first_over - tB >= 300, f'phones see no completion and no result before the window closes (result seen {round(first_over - tB) if first_over else None} ms after the winning tap was made)')
        s_again = await S(host); await settle(2500); check((await S(host))['pl'] == s_again['pl'] and (await S(host))['win'] == s_again['win'], 'the result does not change after it is announced')
        check(s['win'] == [kB] and f[kC]['f'] == 4 and not f[kC]['done'], f'C completes 0.8 s after B (outside the window): B wins alone, C\'s late tap is not counted (C {f[kC]["f"]} of 5)')
        check(f[kB]['p'] == 130 and f[kC]['p'] == 40 + 30 and f[kA]['p'] == 10 + 30, f'points: B 130, C 4×10 +30 = {f[kC]["p"]}, A 1×10 +30 = {f[kA]["p"]}')
        txt = await C.inner_text('#pDfStatus'); hero = await C.inner_text('#dfHeroCard')
        check('الفائز بالجولة' in hero and 'تافير' in hero and 'توقفت الجولة بفوز المنافس' in txt, 'results: «🏆 الفائز بالجولة: تافير»; C and A «توقفت الجولة بفوز المنافس»')
        check(s['rk'] == [kB, kC, kA], 'ranking: the winner, then more differences')
        T = s['tot']; ov = await C.inner_text('.dfoverall')
        check((T[kB]['pr'], T[kC]['pr'], T[kA]['pr']) == (1, 1, 3) and (T[kB]['dp'], T[kC]['dp'], T[kA]['dp']) == (130, 70, 40), f'v5: overall keeps the place before the round (B 1, C 1, A 3) and the round\'s points (+130, +70, +40)')
        check('التغيّر' in ov and '▼1' in ov and '+130' in ov and '+70' in ov, 'v5: the overall table shows what changed: نورة ▼1, +130 / +70 added')
        await A.wait_for_timeout(3000); check(await A.locator('#dfHeroCard').count() == 1 and await C.locator('.dfoverall').count() == 1, 'v5: the results stay on the phones (3 s later) until the host moves on')
        await host.screenshot(path=f'{SHOTS}/host_results_single.png', full_page=True); await C.screenshot(path=f'{SHOTS}/computer_results_single.png', full_page=True)

        # ================= round 3 (medium): time is up, nobody completed
        s = await new_round(1)
        st0 = await A.inner_text('.dfstand')
        check('قبل هذه الجولة' in st0 and 'تافير' in st0 and '260' in st0 and await A.locator('#dfHeroCard').count() == 0, f'v5: during the round one short line of the overall ranking as before it («{st0}»)')
        await A.screenshot(path=f'{SHOTS}/v5_phone_playing_stand.png', full_page=True); await host.screenshot(path=f'{SHOTS}/v5_host_playing.png', full_page=True)
        await taps(A, [0, 1]); await taps(B, [0]); await tap(B, *wrong(1)); await settle(1200)
        check(await A.inner_text('.dfstand') == st0, 'v5: the overall line does not move while the round is played')
        await host.evaluate('window.__off = (window.__off || 0) + 301000'); await host.wait_for_function('H.s.ph === "over"', timeout=6000); s = await S(host)
        check(s['end'] == 'time' and not s['win'] and s['rk'] == [kA, kB, kC], 'time is up, nobody completed: A 2, B 1, C 0 in that order')
        hero = await B.inner_text('#dfHeroCard'); check('انتهى الوقت' in hero and 'صالح' in hero, '«انتهى الوقت — متصدر الجولة: صالح»')
        check(await A.locator('.dfstand').count() == 0, 'v5: after the round the short line gives way to the full results')
        # ================= round 4 (hard): everybody out
        s = await new_round(2)
        for k in range(5):
            await asyncio.gather(tap(A, *wrong(k)), tap(B, *wrong(k + 1)), tap(C, *wrong(k + 2), False)); await host.wait_for_timeout(450)
        await host.wait_for_function('H.s.ph === "over"', timeout=8000); s = await S(host)
        check(s['end'] == 'out' and 'استُبعد جميع اللاعبين' in await A.inner_text('#dfHeroCard'), 'everybody used their 5 attempts: the round ends, «استُبعد جميع اللاعبين»')
        T = s['tot']
        got = {k: (T[k]['r'], T[k]['w'], T[k]['f'], T[k]['p']) for k in (kA, kB, kC)}
        want = {kA: (4, 0, 4, 90), kB: (4, 2, 11, 265), kC: (4, 1, 9, 200)}
        check(got == want, f'overall over 4 rounds (rounds, wins, finds, points): صالح {got[kA]}, تافير {got[kB]}, نورة {got[kC]} (expected {want[kA]}, {want[kB]}, {want[kC]})')
        txt = await A.inner_text('.dfoverall'); check('تافير' in txt and '265' in txt and 'مرات الفوز' in txt, 'the overall board shows those totals')
        for pg, w in ((A, 390), (B, 360), (C, 1280)):
            sw = await pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'no horizontal scroll at {w} px ({sw})')
        sz = await host.evaluate('NR.peers().find(p => p.isMe).raw.length'); check(sz < 12000, f'host seat under the database limit ({sz})')
        rk = await host.evaluate("""() => Diff.rank({win:["w"], pl:{w:{n:"W", f:5, w:4, p:80, ft:90000, da:5}, l:{n:"L", f:4, w:0, p:200, ft:10000, da:0}, m:{n:"M", f:4, w:1, p:35, ft:5000, da:0}}}).rk""")
        check(rk == ['w', 'l', 'm'], f'the first to complete ranks first even with fewer points than a player who did not complete ({rk})')
        # old saved data (with hint fields) still restores without errors
        ok = await host.evaluate('(async () => { try { const pv = Diff.savePriv(); pv.pf = {x:{fi:[0], lr:[["a","hint",1,2]], hz:[1,2,3]}}; await Diff.restore(pv); return true; } catch(e){ return String(e); } })()')
        check(ok is True, 'data saved by the earlier version (with a hint) restores without errors')

        # ================= solo rooms
        host2 = await E.page('host2', 1280, 900); Dp = await E.page('D', 390, 844)
        code2 = await E.start(host2, 'diff', {'lv': 0, 'pk': 'auto', 'lim': 0})
        await E.join(Dp, code2, 'ليلى'); await host2.wait_for_timeout(700); await host2.click('[data-h=start]')
        await Dp.wait_for_selector('#pDf .dfimg img', timeout=15000); await host2.wait_for_timeout(900)
        s2 = await S(host2); G['D'] = await host2.evaluate('H.priv.dfs'); G['W'], G['H'] = s2['pair']['w'], s2['pair']['h']
        for i in range(5): await tap(Dp, *on(i)); await Dp.wait_for_timeout(400)
        await host2.wait_for_function('H.s.ph === "over"', timeout=6000); s2 = await S(host2); kD = await key(host2, 'ليلى')
        check(s2['end'] == 'win' and s2['win'] == [kD] and s2['pl'][kD]['p'] == 130, 'a single player who finds all 5 wins: 50 +50 +30 = 130')
        await host2.click('[data-h=go]'); await host2.wait_for_function('H.s.ph === "play"', timeout=15000); await Dp.wait_for_selector('#pDf .dfimg img', timeout=15000); await host2.wait_for_timeout(900)
        s2 = await S(host2); G['D'] = await host2.evaluate('H.priv.dfs'); G['W'], G['H'] = s2['pair']['w'], s2['pair']['h']
        for k in range(5): await tap(Dp, *wrong(k)); await Dp.wait_for_timeout(400)
        await host2.wait_for_function('H.s.ph === "over"', timeout=6000); s2 = await S(host2)
        check(s2['end'] == 'solo', 'a single player\'s 5th mistake ends the round')

    bad = [m for ok, m in R if not ok]
    print('PAGE ERRORS:', E.errs or 'none'); print(f'{sum(ok for ok, _ in R)}/{len(R)} passed'); sys.exit(1 if bad or E.errs else 0)
asyncio.run(main())
