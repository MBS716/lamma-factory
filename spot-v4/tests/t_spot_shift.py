"""Spot the difference: the pictures do not move on a phone when the player's own counters change (first find: points
0 -> 10, ..., 130). Found by the v5.1 release tests on the real database: on a 390 px phone the points chip wrapped to
a new line after the first find and pushed the pictures down ~40 px between two taps."""
import asyncio, json, sys
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True)
def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]
async def main():
    async with Env(8816) as E:
        host = await E.page('host', 1280, 900); pages = {w: await E.page(f'P{w}', w, 800) for w in (390, 375, 360, 340)}
        code = await E.start(host, 'diff', {'lv': 0, 'pk': 'auto', 'lim': 300})
        for w, pg in pages.items(): await E.join(pg, code, f'لاعب{w}')
        await host.wait_for_timeout(600); await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        for pg in pages.values(): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(900); s = json.loads(await host.evaluate('JSON.stringify(H.s)')); D = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        top = lambda pg: pg.evaluate('document.querySelector("#pDf .dfimg").getBoundingClientRect().top + scrollY')
        for w, pg in pages.items():
            t0 = await top(pg); tops = []
            for i in range(4):
                d = D[i]; x, y = min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
                b = await pg.locator('#pDf .dfimg >> nth=1').bounding_box()
                await pg.touchscreen.tap(b['x'] + x / W * b['width'], b['y'] + y / Hh * b['height']); await pg.wait_for_timeout(900); tops.append(await top(pg))
            pts = await pg.evaluate('document.querySelector(".dfmine").innerText.replace(/\\s+/g, " ")')
            check(all(abs(t - t0) < 1 for t in tops), f'{w} px phone: the pictures stay put while the counters change ({t0:.0f} -> {[round(t) for t in tops]}; {pts})')
        check(not E.errs, 'no page errors')
    n = sum(ok for ok, _ in R); print(f'\n{n}/{len(R)} passed'); sys.exit(0 if n == len(R) else 1)
asyncio.run(main())
