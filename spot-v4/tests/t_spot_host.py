"""Spot the difference v5, phase 4: the host plays from a separate device while the host's screen stays the referee and
the room's manager. The host's phone is an ordinary player: same taps, same attempts, same points, nothing of the answers
sent to it; the results mark it «المقدّم». Another tab of the referee's own device cannot play (that device holds the
answers). A host (computer), the host's phone and 3 players (phone 390, phone 360, computer)."""
import asyncio, json, os, sys
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots')
OUT = os.environ.get('OUT', SHOTS)

def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with Env(8813) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        M = await E.page('M', 390, 844)                     # the host's own phone
        code = await E.start(host, 'diff', {'lv': 0, 'pk': 'auto', 'lim': 300})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        # ---------- «العب من جوالك»: a one-time link and QR code on the host's screen
        await host.click('[data-h=hpon]'); await host.wait_for_selector('.dfhp-box', timeout=4000); await host.wait_for_timeout(400)
        link = await host.input_value('.dfhp-box input')
        qr = await host.evaluate('!!document.querySelector("#hpQr canvas, #hpQr img")')
        box = await host.inner_text('.dfhp-box')
        qr_lib = await host.evaluate('!!window.QRCode')      # the QR library comes from a CDN, which this test environment does not serve
        check('hp=' in link and link.endswith('#' + code) and (qr or not qr_lib), f'the host\'s screen shows a QR code and a one-time link ({link[-30:]})')
        check('لا تصل أماكن الاختلافات' in box and 'بالطريقة نفسها' in box, 'it says: same counting as everybody, no places of differences sent to the phone')
        await host.screenshot(path=f'{SHOTS}/v5_host_playfromphone.png', full_page=True)
        await M.goto(link); await M.wait_for_selector('#pName', timeout=8000)
        check('hp=' not in M.url, 'the mark is removed from the phone\'s address bar once read')
        await M.fill('#pName', 'محمد'); await M.click('[data-act=enter]'); await host.wait_for_function('H.s.hp', timeout=6000); await host.wait_for_timeout(500)
        s = await S(host); kM = await key(host, 'محمد')
        check(s['hp'] == kM and s['hpn'] == 'محمد' and not await host.evaluate('H.priv.hpTok'), 'the host\'s phone joins as «محمد», marked as the host; the link is used up')
        check('يلعب المقدّم من جهاز مستقل باسم محمد' in await host.inner_text('#hostMain'), 'the host\'s screen says the host plays from a separate device as «محمد»')
        X = await E.page('X', 390, 844); await X.goto(link); await X.wait_for_selector('#pName', timeout=8000); await X.fill('#pName', 'زائر'); await X.click('[data-act=enter]'); await host.wait_for_timeout(1200)
        check((await S(host))['hp'] == kM, 'somebody else opening the same link later is an ordinary player (the link works once)')
        # ---------- another tab of the referee's device cannot play
        T2 = await E.page('T2', 390, 844, device='host'); await E.join(T2, code, 'تبويب'); await host.wait_for_timeout(1500)
        kT = await key(host, 'تبويب')
        check(kT in (await S(host)).get('sd', []) and 'جهاز إدارة الغرفة' in await T2.inner_text('#playerMain'), 'a tab on the referee\'s own device: «هذا الجهاز هو جهاز إدارة الغرفة», it cannot play')
        # ---------- a round: the host's phone is a player like the others
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        for pg in (A, B, C, M, X): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(1000); s = await S(host)
        kA, kB = await key(host, 'صالح'), await key(host, 'تافير')
        check(kM in s['pl'] and kT not in s['pl'] and len(s['pl']) == 5, 'the round has the host\'s phone and the 4 players; the referee\'s tab is not in it')
        D = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        async def tap_at(pg, x, y):
            sel = '#pDf .dfimg >> nth=1'; await pg.locator(sel).scroll_into_view_if_needed(); b = await pg.locator(sel).bounding_box()
            await pg.touchscreen.tap(b['x'] + x / W * b['width'], b['y'] + y / Hh * b['height']); await pg.wait_for_timeout(350)
        def on(i):
            d = D[i]; return min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
        def wrong(k=0):
            pts = [(gx / 20 * W, gy / 12 * Hh) for gx in range(1, 20) for gy in range(1, 12)]
            pts = [p for p in pts if all(abs(p[0] - d[0]) > d[2] + 0.06 * W or abs(p[1] - d[1]) > d[3] + 0.06 * W for d in D)]
            return pts[(k * 7) % len(pts)]
        # the same play on the host's phone and on تافير: 2 finds, 1 mistake each
        for pg in (M, B):
            await tap_at(pg, *on(0)); await tap_at(pg, *on(1)); await tap_at(pg, *wrong(2))
        await host.wait_for_timeout(1500); s = await S(host)
        pm, pb = s['pl'][kM], s['pl'][kB]
        check((pm['f'], pm['w'], pm['p']) == (pb['f'], pb['w'], pb['p']) == (2, 1, 15), f'the same play counts the same: the host\'s phone {pm["f"]} finds, {pm["w"]} mistake, {pm["p"]} points; تافير {pb["f"]}, {pb["w"]}, {pb["p"]}')
        check('الأخطاء المتبقية: 4' in await M.inner_text('#dfMe'), 'the host\'s phone has the same 5 attempts (4 left)')
        # nothing of the answers on the host's phone
        # (keys «fake…» are the test's stand-in for the database, shared by every page here; in the real database the host's
        # saved game (gpriv) is readable by the host's account only, so they are not part of what the phone holds)
        raw = await M.evaluate('JSON.stringify({peers:NR.peers().map(p => p.raw), view:P.view.dfBox || null, ls:Object.keys(localStorage).filter(k => !k.startsWith("fake")).map(k => [k, localStorage.getItem(k)])})')
        mine = {f'{D[i][0]},{D[i][1]},{D[i][2]},{D[i][3]}' for i in (0, 1)}
        others = [f'{D[i][0]},{D[i][1]},{D[i][2]},{D[i][3]}' for i in range(2, len(D))]
        hits = [(o, raw[max(0, raw.find(o) - 80):raw.find(o) + 20]) for o in others if o in raw]
        check(not hits, 'the host\'s phone holds no place of a difference it has not found (room, mailbox, storage) ' + str(hits[:2]))
        fetched = await M.evaluate('performance.getEntriesByType("resource").map(r => r.name).filter(n => /catalog|gpriv|games\\//.test(n))')
        check(not fetched, f'the host\'s phone never loaded the picture catalog or the host\'s saved game ({fetched})')
        check(await host.locator('#hostMain .dfm').count() == 0 and 'محمد' not in await host.inner_text('#dfSide'), 'the referee\'s screen shows no difference and no one\'s progress during the round')
        await M.screenshot(path=f'{SHOTS}/v5_hostphone_playing.png', full_page=True)
        for i in range(5): await tap_at(A, *on(i))
        await host.wait_for_function('H.s.ph === "over"', timeout=8000); s = await S(host)
        check(s['win'] == [kA] and s['pl'][kM]['p'] == 15, 'صالح wins; the host\'s phone keeps its 15 points')
        for pg, n in ((A, 'phone 390'), (B, 'phone 360'), (C, 'computer'), (M, 'host\'s phone')):
            await pg.wait_for_selector('.dfround', timeout=6000); rows = await pg.evaluate('[...document.querySelectorAll(".dfround tr")].map(r => r.innerText)')
            check(any('محمد' in r and 'المقدّم' in r for r in rows) and not any('صالح' in r and 'المقدّم' in r for r in rows), f'{n}: the results mark «محمد» as «المقدّم»')
        check('المقدّم' in await host.inner_text('.dfoverall'), 'the overall ranking marks the host too')
        await M.screenshot(path=f'{SHOTS}/v5_hostphone_results.png', full_page=True); await host.screenshot(path=f'{SHOTS}/v5_host_results_hostplayer.png', full_page=True)
        async with host.expect_download() as dl: await host.click('#dfAct [data-h=dfcsv]')
        txt = open(await (await dl.value).path(), encoding='utf-8-sig').read(); open(os.path.join(OUT, 'competition_hostplayer.csv'), 'w', encoding='utf-8-sig').write(txt)
        check('"محمد","15"' in txt and 'المقدّم (من جهاز مستقل)' in txt, 'the downloaded results mark the host too')
        # ---------- round 2: the host's phone runs out of attempts like anybody
        await host.click('[data-h=go]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        for pg in (A, B, C, M): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        await host.wait_for_timeout(1000); s = await S(host); D = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        for k in range(5): await tap_at(M, *wrong(k))
        await host.wait_for_timeout(1200); s = await S(host)
        check(s['pl'][kM]['out'] == 1 and s['ph'] == 'play', 'the host\'s 5th mistake: out like any player, the round goes on')
        # reloads
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.s.ph === "play"', timeout=20000); await host.wait_for_timeout(1500)
        s = await S(host); check(s['hp'] == kM and s['pl'][kM]['out'] == 1, 'the referee reloads: the host\'s player and its record are kept')
        await M.reload(); await M.wait_for_selector('#pDf .dfimg img', timeout=15000); await M.wait_for_timeout(1200)
        check('استُبعدت' in await M.inner_text('#dfMe'), 'the host\'s phone reloads: same player, still out')
        await host.click('#dfAct [data-h=end]'); await host.wait_for_function('H.s.ph === "over"', timeout=6000)
        await host.click('[data-h=hpoff]'); await host.wait_for_timeout(600)
        check(not (await S(host))['hp'] and await host.locator('[data-h=hpon]').count() >= 1, '«إلغاء وسم المقدّم» removes the mark; the button to play from a phone is back')
        for pg, w in ((A, 390), (B, 360), (M, 390)):
            sw = await pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'no horizontal scroll at {w} px ({sw})')
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    k = sum(ok for ok, _ in R); print(f'\n{k}/{len(R)} passed'); sys.exit(0 if k == len(R) else 1)

asyncio.run(main())
