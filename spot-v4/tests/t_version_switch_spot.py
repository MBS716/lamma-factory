"""«اكتشف الفرق»: the official site moves from the current version (OLD) to v5 (NEW) while a room is playing.
The same address serves the old files, then the new ones (as GitHub Pages does after a publish). Checks: the room opened
on the old version keeps playing; a phone that opens the new version joins it; the old pages finish the round, then move
to the new version by themselves and come back to the same room, with the same points; the room then plays on v5
(the host's picture library, a new competition) with the points of before kept in competition 1.
usage: OLD=dir NEW=dir python3 t_version_switch_spot.py"""
import asyncio, os, shutil, sys, json, tempfile
SERVE = tempfile.mkdtemp(prefix='lamma-switch-spot-')
os.environ['DIST'] = SERVE
from common import Env
OLD, NEW = os.environ['OLD'], os.environ['NEW']
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
def serve(src):
    for f in os.listdir(SERVE):
        p = os.path.join(SERVE, f); shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    for f in os.listdir(src):
        s = os.path.join(src, f); (shutil.copytree if os.path.isdir(s) else shutil.copy2)(s, os.path.join(SERVE, f))
VER = lambda d: json.load(open(os.path.join(d, 'version.json')))['b']
BUILD = lambda pg: pg.evaluate('BUILD')
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots')

def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]

async def main():
    os.makedirs(SHOTS, exist_ok=True); old_b, new_b = VER(OLD), VER(NEW)
    serve(OLD)
    async with Env(8814) as E:
        host = await E.page('host', 1280, 900); A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); D = await E.page('D', 390, 844)
        code = await E.start(host, 'diff', {'lv': 0, 'lim': 300})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await host.wait_for_timeout(800)
        check(await BUILD(host) == old_b and await BUILD(A) == old_b, f'before the publish: the room on the old version ({old_b})')
        G = {}
        async def ready(pgs):
            for pg in pgs: await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
            await host.wait_for_timeout(900); s = await S(host); G['D'] = await host.evaluate('H.priv.dfs'); G['W'], G['H'] = s['pair']['w'], s['pair']['h']; return s
        async def tap(pg, i):
            d = G['D'][i]; x, y = min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
            sel = '#pDf .dfimg >> nth=1'; await pg.locator(sel).scroll_into_view_if_needed(); b = await pg.locator(sel).bounding_box()
            await pg.touchscreen.tap(b['x'] + x / G['W'] * b['width'], b['y'] + y / G['H'] * b['height']); await pg.wait_for_timeout(350)
        kA, kB = await host.evaluate('dfKey("صالح")'), await host.evaluate('dfKey("تافير")')
        # round 1 on the old version: صالح 2, تافير completes
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000); await ready([A, B])
        for i in (0, 1): await tap(A, i)
        await host.wait_for_timeout(500)
        for i in range(5): await tap(B, i)
        await host.wait_for_function('H.s.ph === "over"', timeout=8000); t1 = (await S(host))['tot']
        # round 2 starts on the old version, then the new version is published
        await host.click('[data-h=go]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000); await ready([A, B])
        serve(NEW)
        await E.join(D, code, 'نورة'); await D.wait_for_selector('#pDf .dfimg img', timeout=15000); await host.wait_for_timeout(1500)
        check(await BUILD(D) == new_b and (await host.evaluate('dfKey("نورة")')) in (await S(host))['pl'], f'a phone opening the site now gets v5 ({new_b}) and plays the round of the old host')
        await host.evaluate('checkUpdate()'); await A.evaluate('checkUpdate()'); await host.wait_for_timeout(1500)
        check(await BUILD(host) == old_b and await BUILD(A) == old_b and (await S(host))['ph'] == 'play', 'the old pages are not reloaded in the middle of the round')
        await tap(A, 0); await tap(D, 0); await host.wait_for_timeout(500)
        for i in range(5): await tap(B, i)
        await host.wait_for_function('H.s.ph === "over"', timeout=8000); before = (await S(host))['tot']
        check(before[kB]['r'] == 2 and before[kB]['w'] == 2, 'round 2 counted by the old host with the new phone in it')
        # after the round: the old pages move to v5 and come back
        await host.wait_for_function(f'typeof BUILD !== "undefined" && BUILD === "{new_b}"', timeout=40000)
        await host.wait_for_function('typeof H !== "undefined" && H && H.code', timeout=20000); await host.wait_for_timeout(2500)
        s = await S(host)
        check(await host.evaluate('H.code') == code and await host.evaluate('!(P && P.joined)'), f'the host page moved to v5 and is the host of room {code} again')
        check(s['tot'] == before and s['ph'] == 'over' and s.get('cn') == 1, 'the points and the results are kept; the room is competition 1 of v5')
        await A.wait_for_function(f'typeof BUILD !== "undefined" && BUILD === "{new_b}"', timeout=40000); await A.wait_for_timeout(3000)
        check(await A.evaluate('P.joined && P.code') == code and 'الترتيب العام' in await A.inner_text('#playerMain'), 'the old phone moved to v5: same room, same player, results on screen')
        # v5 on the same room: the picture library (the room's old settings had no choice: the host chooses)
        await host.click('[data-h=go]'); await host.wait_for_selector('.dfpk-c', timeout=15000)
        await host.click('.dfpk-c'); await host.wait_for_function('H.s.ph === "play"', timeout=15000); await ready([A, B, D])
        for i in range(5): await tap(A, i)
        await host.wait_for_function('H.s.ph === "over"', timeout=8000); s = await S(host)
        check(s['tot'][kB]['p'] == before[kB]['p'] and s['tot'][kA]['p'] > before[kA]['p'] and s['tot'][kA]['r'] == 3 and s['cr'] == 3,
              f'the first v5 round adds to the points of before, competition 1 now has 3 rounds (صالح {before[kA]["p"]} → {s["tot"][kA]["p"]})')
        await host.click('#dfAct [data-h=nc]'); await host.click('.dfnc [data-h=ncgo]'); await host.wait_for_function('H.s.cn === 2', timeout=6000)
        h = await host.evaluate('H.priv.hist')
        check(h[0]['cn'] == 1 and {x['n']: x['p'] for x in h[0]['rank']}['تافير'] == s['tot'][kB]['p'], 'a new competition keeps competition 1 with the points of both versions')
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    shutil.rmtree(SERVE, ignore_errors=True)
    n = sum(ok for ok, _ in R); print(f'\n{n}/{len(R)} passed'); sys.exit(0 if n == len(R) else 1)

asyncio.run(main())
