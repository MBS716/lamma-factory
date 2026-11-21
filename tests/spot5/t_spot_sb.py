"""Spot the difference v5.1: the host shows and hides the overall ranking on every screen («عرض النتائج للجميع» / «إخفاء النتائج»).
A host and 3 players (phone 390, phone 360, computer). Checks: only the host has the control; the ranking (names, places,
points) appears on all screens and stays until the host hides it (not tied to the end or the start of a round); it can be
shown after a round, between rounds (settings) and before the next round, never during a round; it shows no picture and
no place of a difference; points and rounds do not change; host reload, phone reload and a phone that drops and comes back
keep the shown/hidden state; a player cannot change it."""
import asyncio, json, os, sys
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots')

def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with Env(8813) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'diff', {'lv': 0, 'pk': 'auto', 'lim': 300})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        G = {}
        async def new_round():
            if await host.locator('#dfAct [data-h=go]').count(): await host.click('#dfAct [data-h=go]')
            else: await host.click('[data-h=start]')
            await host.wait_for_function('H.s.ph === "play"', timeout=15000)
            for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
            await host.wait_for_timeout(900)
            s = await S(host); G['D'] = await host.evaluate('H.priv.dfs'); G['W'], G['H'] = s['pair']['w'], s['pair']['h']; return s
        def on(i):
            d = G['D'][i]; return min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
        async def taps(pg, idx):
            for i in idx:
                x, y = on(i); sel = '#pDf .dfimg >> nth=1'; await pg.locator(sel).scroll_into_view_if_needed(); b = await pg.locator(sel).bounding_box()
                await pg.touchscreen.tap(b['x'] + x / G['W'] * b['width'], b['y'] + y / G['H'] * b['height']); await pg.wait_for_timeout(350)
        kA, kB, kC = await key(host, 'صالح'), await key(host, 'تافير'), await key(host, 'نورة')
        shown = lambda pg: pg.evaluate('!!document.getElementById("dfSB")')
        async def all_shown(want, pages, t=6000):
            for pg in pages:
                try: await pg.wait_for_function(f'!!document.getElementById("dfSB") === {"true" if want else "false"}', timeout=t)
                except Exception: return False
            return True

        # ================= round 1: صالح completes (130), تافير 2 differences (50), نورة 0
        await new_round(); await taps(B, [0, 1]); await host.wait_for_timeout(500); await taps(A, [0, 1, 2, 3, 4])
        await host.wait_for_function('H.s.ph === "over"', timeout=20000); await host.wait_for_timeout(1200)
        s0 = await S(host); T0 = json.dumps(s0['tot'], sort_keys=True)
        check(not await shown(host) and not any([await shown(p) for p in (A, B, C)]), 'after the round: the round results as before, the ranking is NOT shown by itself')
        check(await host.locator('#dfAct [data-h=sbon]').count() == 1, 'the host has «عرض النتائج للجميع» next to «الجولة التالية»')
        check(all([await p.locator('[data-h=sbon],[data-sb]').count() == 0 for p in (A, B, C)]), 'no phone has a show or hide control')

        # ================= show: every screen
        await host.click('#dfAct [data-h=sbon]')
        check(await all_shown(True, (host, A, B, C)), 'show: the ranking appears on the host and the 3 phones')
        txt = {n: await pg.inner_text('#dfSB') for n, pg in (('host', host), ('A', A), ('B', B), ('C', C))}
        order = await B.evaluate('[...document.querySelectorAll("#dfSB .dfsb-n")].map(e => e.firstChild.textContent.trim())')
        pts = await B.evaluate('[...document.querySelectorAll("#dfSB .dfsb-p b")].map(e => +e.textContent)')
        check(order == ['صالح', 'تافير', 'نورة'] and pts == [130, 50, 0], f'names, places and points in order: {list(zip(order, pts))}')
        last = await B.evaluate('[...document.querySelectorAll("#dfSB .dfsb-l")].map(e => e.textContent.trim())')
        heads = await B.evaluate('[...document.querySelectorAll("#dfSB thead th")].map(e => e.textContent.trim())')
        check(heads == ['#', 'اسم اللاعب', 'آخر جولة', 'إجمالي النقاط'] and last == ['130', '50', '0'], f'columns like Flashi: last round and total points ({heads}; last round {last})')
        check('الترتيب العام' in txt['A'] and 'المنافسة 1' in txt['A'] and 'جولة واحدة' in txt['A'], 'title, competition and number of rounds')
        check('(أنت)' in txt['B'] and await B.locator('#dfSB tbody tr.me').count() == 1, 'each phone sees its own row marked («أنت»)')
        check(await host.locator('#dfSB [data-sb=off]').count() == 1 and all([await p.locator('#dfSB button').count() == 0 for p in (A, B, C)]),
              'the host has «إخفاء النتائج»; the phones only «المقدّم يعرض النتائج الآن»')
        leak = await host.evaluate('(() => { const el = document.getElementById("dfSB"); return {img:el.querySelectorAll("img,svg,canvas").length, pair:el.innerText.includes(H.s.pair.title)}; })()')
        check(leak['img'] == 0 and not leak['pair'], 'the ranking screen shows no picture and no place of a difference')
        big = await A.evaluate('(() => { const r = document.querySelector("#dfSB tbody tr"), b = r.getBoundingClientRect(); return {fs:parseFloat(getComputedStyle(r).fontSize), cover:document.getElementById("dfSB").getBoundingClientRect().height >= innerHeight - 1, sw:document.documentElement.scrollWidth}; })()')
        check(big['fs'] >= 18 and big['cover'] and big['sw'] <= 390, f'big and clear on phone 390: font {big["fs"]:.0f} px, full screen, no horizontal scroll')
        for n, pg in (('host', host), ('phone390', A), ('phone360', B), ('computer', C)): await pg.screenshot(path=f'{SHOTS}/v51_sb_{n}.png')
        s = await S(host)
        check(json.dumps(s['tot'], sort_keys=True) == T0 and s['ph'] == 'over' and s['rd'] == s0['rd'] and s['cr'] == s0['cr'], 'showing changes no points, no round, no phase')

        # ================= it stays until the host hides it; nothing starts a round meanwhile
        await host.wait_for_timeout(4000)
        check(await all_shown(True, (host, A, B, C), 500), 'still shown 4 s later (only the host hides it)')
        await host.evaluate('Diff.act("go")'); await host.evaluate('Diff.act("nc")'); await host.wait_for_timeout(800); s = await S(host)
        check(s['ph'] == 'over' and s['rd'] == s0['rd'] and s['cn'] == 1, 'while shown, «الجولة التالية» or «منافسة جديدة» does nothing (the host hides the ranking first)')

        # ================= a player cannot change it
        await B.evaluate('NR.presence({sb:0, s:{sb:0}}).catch(() => {})'); await B.evaluate('try { Diff.act("sboff") } catch(e){}'); await host.wait_for_timeout(1000)
        check((await S(host)).get('sb') == 1 and await all_shown(True, (host, A, C), 1500), 'a player\'s page cannot hide it (its messages do not change the host\'s game)')

        # ================= host reload, phone reload, a phone that drops and comes back
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.g === "diff"', timeout=20000); await host.wait_for_timeout(1500)
        check(await all_shown(True, (host, A, B, C)), 'host reloads: the ranking is still shown everywhere')
        await A.reload(); check(await all_shown(True, (A,), 15000), 'phone 390 reloads: the ranking comes back')
        if await C.evaluate('typeof window.__setOnline === "function"'):      # local stand-in database
            await C.evaluate('window.__setOnline(false)'); await host.wait_for_timeout(1200); await C.evaluate('window.__setOnline(true)'); await host.wait_for_timeout(1500)
        else:                                                                  # the real database: the browser goes offline
            await C.context.set_offline(True); await host.wait_for_timeout(4000); await C.context.set_offline(False); await host.wait_for_timeout(6000)
        check(await all_shown(True, (C,)), 'the computer loses its connection and gets it back: still shown')
        # B leaves the page (network gone); the host hides meanwhile; B comes back on a new page of the same device
        await B.close()
        await host.click('#dfSB [data-sb=off]')
        check(await all_shown(False, (host, A, C)), 'hide: gone on every screen')
        B = await E.page('B', 360, 740); await B.goto(E.U + '#' + code); await B.wait_for_timeout(2500)
        on_b = await B.evaluate('!!(P && P.joined)')
        if not on_b: await B.reload(); await B.wait_for_timeout(2500)
        check(await B.evaluate('!!(P && P.joined)') and await all_shown(False, (B,), 3000), 'the phone that was away comes back to its seat: the ranking stays hidden (the host hid it meanwhile)')
        s = await S(host)
        check(s.get('sb') == 0 and s['ph'] == 'over' and json.dumps(s['tot'], sort_keys=True) == T0, 'hiding starts nothing: still after round 1, points unchanged')

        # ================= between rounds (settings) and before the next round
        await host.click('#dfAct [data-h=lobby]'); await host.wait_for_function('H.s.ph === "lobby"', timeout=5000); await host.wait_for_timeout(600)
        check(await host.locator('.dfcomp [data-h=sbon]').count() == 1, 'between rounds (settings): «عرض النتائج للجميع» in the competition panel')
        await host.click('.dfcomp [data-h=sbon]')
        check(await all_shown(True, (host, A, B, C)), 'between rounds: shown on every screen, phones waiting in the lobby included')
        await B.reload(); check(await all_shown(True, (B,), 15000), 'a phone reloads in the lobby: shown again')
        await host.click('#dfSB [data-sb=off]'); check(await all_shown(False, (host, A, B, C)), 'hidden again')

        # ================= never during a round
        await new_round()
        check(not await shown(host) and not any([await shown(p) for p in (A, B, C)]), 'round 2 runs: no ranking screen over the pictures')
        await host.evaluate('Diff.act("sbon")'); await host.wait_for_timeout(800)
        check((await S(host)).get('sb') in (0, None) and not await shown(A), 'during a round the host cannot show it (the pictures stay for everybody)')
        check(await host.locator('#dfAct [data-h=sbon]').count() == 0, 'and there is no show button during the round')
        await taps(C, [0, 1, 2, 3, 4]); await host.wait_for_function('H.s.ph === "over"', timeout=20000); await host.wait_for_timeout(1200)
        s = await S(host)
        check(s['tot'][kC]['p'] == 130 and s['tot'][kA]['p'] == 130 + 0 and s['tot'][kB]['p'] == 50 and s['cr'] == 2,
              f'round 2 counted normally (نورة 130, صالح {s["tot"][kA]["p"]}, تافير {s["tot"][kB]["p"]}; 2 rounds)')
        await host.click('#dfAct [data-h=sbon]'); check(await all_shown(True, (host, A, B, C)), 'after round 2: shown again on request')
        top = await A.evaluate('[...document.querySelectorAll("#dfSB tbody tr")].map(r => r.innerText.replace(/\\s+/g, " "))')
        check(len(top) == 3 and 'جولتان' in await A.inner_text('#dfSB'), f'the ranking after 2 rounds: {top}')
        rows2 = await A.evaluate('[...document.querySelectorAll("#dfSB tbody tr")].map(r => [r.querySelector(".dfsb-n").firstChild.textContent.trim(), r.querySelector(".dfsb-l").textContent.trim(), +r.querySelector(".dfsb-p b").textContent])')
        want2 = {'نورة': ('130', 130), 'صالح': ('0', 130), 'تافير': ('0', 50)}
        check(all(want2[n] == (l, p) for n, l, p in rows2), f'after round 2: «آخر جولة» shows that round only, «إجمالي النقاط» the sum ({rows2})')
        await host.click('#dfSB [data-sb=off]'); check(await all_shown(False, (host, A, B, C)), 'and hidden')
        for pg, w in ((A, 390), (B, 360), (C, 1280)):
            sw = await pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'no horizontal scroll at {w} px ({sw})')
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    n = sum(ok for ok, _ in R); print(f'\n{n}/{len(R)} passed'); sys.exit(0 if n == len(R) else 1)

asyncio.run(main())
