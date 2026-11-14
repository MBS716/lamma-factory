"""Spot the difference: every tap counts once, under pressure.
- three phones tap the same differences at the same moment;
- a slow connection (each message from a phone leaves 0.3-1.5 s late, in order);
- a connection that delivers only the latest message (intermediate ones lost, as after a short drop): a player who taps
  fast must still have every tap counted;
- the phone's page busy between the finger going down and coming up (a slow phone): the tap still counts.
A host and 3 players (phone 390, phone 360, computer). Each check compares what the host counted with the taps made."""
import asyncio, json, os, sys
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')

def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]

SLOW = '''(() => { const o = NR.presence.bind(NR); let chain = Promise.resolve();
  NR.presence = v => { const c = JSON.parse(JSON.stringify(v)); chain = chain.then(() => new Promise(r => setTimeout(r, 300 + Math.random() * 1200))).then(() => o(c)); return Promise.resolve(); }; })()'''
LATEST = '''(() => { const o = NR.presence.bind(NR); let last = null, t = null;
  NR.presence = v => { last = JSON.parse(JSON.stringify(v)); if (!t) t = setTimeout(() => { t = null; o(last); }, 2500); return Promise.resolve(); }; })()'''

async def main():
    async with Env(8822) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'diff', {'lv': 2, 'pk': 'auto', 'lim': 0})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        G = {}
        async def new_round():
            if await host.locator('[data-h=go]').count(): await host.click('[data-h=go]')
            else: await host.click('[data-h=start]')
            await host.wait_for_function('H.s.ph === "play"', timeout=15000)
            for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
            await host.wait_for_timeout(1000)
            s = await S(host); G['D'] = await host.evaluate('H.priv.dfs'); G['W'], G['H'] = s['pair']['w'], s['pair']['h']; return s
        def on(i):
            d = G['D'][i]; return min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
        async def box(pg):
            sel = '#pDf .dfimg >> nth=1'; await pg.locator(sel).scroll_into_view_if_needed(); await pg.wait_for_timeout(150); return await pg.locator(sel).bounding_box()
        async def tap(pg, b, i):
            x, y = on(i); await pg.touchscreen.tap(b['x'] + x / G['W'] * b['width'], b['y'] + y / G['H'] * b['height'])
        kA, kB, kC = [await key(host, n) for n in ('صالح', 'تافير', 'نورة')]
        async def wait_count(k, n, t=15000):
            try: await host.wait_for_function(f'H.s.pl[{json.dumps(k)}] && H.s.pl[{json.dumps(k)}].f >= {n}', timeout=t)
            except Exception: pass
            return (await S(host))['pl'][k]['f']

        # 1. the same differences, three phones, the same moment (hard: 12 differences)
        s = await new_round(); n = s['nd']
        bA, bB, bC = await box(A), await box(B), await box(C)
        for i in range(6):
            await asyncio.gather(tap(A, bA, i), tap(B, bB, i), tap(C, bC, i)); await A.wait_for_timeout(250)
        got = [await wait_count(k, 6) for k in (kA, kB, kC)]
        check(got == [6, 6, 6], f'three phones tap the same 6 differences at the same moments: each has all 6 ({got})')
        s = await S(host); check(all(s['pl'][k]['w'] == 0 for k in (kA, kB, kC)), 'and no mistake was counted for anybody')

        # 2. a slow connection: every message of B leaves 0.3-1.5 s late
        await B.evaluate(SLOW)
        for i in range(6, 12): await tap(B, bB, i); await B.wait_for_timeout(120)
        await host.wait_for_function('H.s.ph === "over"', timeout=30000)
        s = await S(host)
        check(s['pl'][kB]['f'] == 12 and s['win'] == [kB] and s['pl'][kB]['w'] == 0, f'B on a slow connection taps the other 6 fast: all 12 counted, B wins, no mistake ({s["pl"][kB]["f"]})')

        # 3. a connection that keeps only the latest message: C taps 12 differences within ~2 s
        s = await new_round(); bC = await box(C)
        await C.evaluate(LATEST)
        for i in range(12): await tap(C, bC, i); await C.wait_for_timeout(110)
        f = await wait_count(kC, 12, 20000)
        check(f == 12, f'C taps 12 differences in 2 s and only its last message arrives: all 12 counted ({f})')

        # 4. a slow phone: the page is busy for 0.9 s between the finger going down and coming up
        s = await new_round(); bA = await box(A); x, y = on(0)
        px, py = bA['x'] + x / G['W'] * bA['width'], bA['y'] + y / G['H'] * bA['height']
        await A.evaluate('''() => { const p = document.querySelectorAll("#pDf .dfimg")[1];
            p.addEventListener("pointerdown", () => { const t = performance.now(); while (performance.now() - t < 900); }, {once:true}); }''')
        await A.touchscreen.tap(px, py)
        f = await wait_count(kA, 1, 8000)
        check(f == 1, f'a slow phone (busy 0.9 s during the tap): the tap still counts ({f})')
        await A.wait_for_timeout(600)
        # a real long press (finger held 1.2 s) is not a tap
        x, y = on(1); px, py = bA['x'] + x / G['W'] * bA['width'], bA['y'] + y / G['H'] * bA['height']
        await A.mouse.move(px, py); await A.mouse.down(); await A.wait_for_timeout(1200); await A.mouse.up(); await host.wait_for_timeout(1500)
        check((await S(host))['pl'][kA]['f'] == 1, 'a finger held down 1.2 s is not counted as a tap')
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    k = sum(ok for ok, _ in R); print(f'\n{k}/{len(R)} passed'); sys.exit(0 if k == len(R) else 1)

asyncio.run(main())
