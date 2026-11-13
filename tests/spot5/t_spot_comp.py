"""Spot the difference v5, phase 2: a new competition in the same room.
The host closes the competition (its summary is kept and can be downloaded as a spreadsheet file), the points start from
zero and nobody leaves the room. Checks that points of two competitions never mix: a tap that arrives late (a phone that
was offline, a message delivered again), a new competition while a round is played, reloads of the host and the phones,
large points, and the size limits of the database. A host and 3 players (phone 390, phone 360, computer)."""
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

async def over_or_dump(host, t=20000):
    """the round should end: if it does not, print what the referee has (to see why) and fail"""
    try: await host.wait_for_function('H.s.ph === "over"', timeout=t)
    except Exception:
        print('DEBUG', await host.evaluate('JSON.stringify({ph:H.s.ph, nd:H.s.nd, pl:H.s.pl, pf:H.priv.pf, q:(H.priv.dfq||[]).length, uns:H.priv.unsealing, winAt:H.priv.winAt, now:srvNow()})'), flush=True); raise

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with Env(8811) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'diff', {'lv': 0, 'pk': 'auto', 'lim': 300})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        G = {}
        async def new_round():
            if await host.locator('[data-h=go]').count(): await host.click('[data-h=go]')
            else: await host.click('[data-h=start]')
            await host.wait_for_function('H.s.ph === "play"', timeout=15000)
            for pg in (A, B, C): await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
            await host.wait_for_timeout(900)
            s = await S(host); G['D'] = await host.evaluate('H.priv.dfs'); G['W'], G['H'] = s['pair']['w'], s['pair']['h']; return s
        def on(i):
            d = G['D'][i]; return min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
        async def tap(pg, x, y):
            sel = '#pDf .dfimg >> nth=1'; await pg.locator(sel).scroll_into_view_if_needed(); b = await pg.locator(sel).bounding_box()
            await pg.touchscreen.tap(b['x'] + x / G['W'] * b['width'], b['y'] + y / G['H'] * b['height'])
        async def taps(pg, idx):
            for i in idx: await tap(pg, *on(i)); await pg.wait_for_timeout(350)
        kA, kB, kC = await key(host, 'صالح'), await key(host, 'تافير'), await key(host, 'نورة')
        players = lambda: host.evaluate('hostPlayers().length')

        # ================= competition 1, round 1: صالح completes (130), تافير 2 (50), نورة 0
        s = await new_round()
        check(s['cn'] == 1 and s['cr'] == 0, 'a new room is competition 1')
        await taps(B, [0, 1]); await host.wait_for_timeout(600)
        await taps(A, [0, 1, 2, 3, 4]); await over_or_dump(host); s = await S(host)
        T = s['tot']; check((T[kA]['p'], T[kB]['p'], T[kC]['p']) == (130, 50, 0) and s['cr'] == 1, f'round 1 counted in competition 1: صالح 130, تافير 50, نورة 0 ({T[kA]["p"]}, {T[kB]["p"]}, {T[kC]["p"]})')
        # the download of the competition running now
        async with host.expect_download() as dl: await host.click('#dfAct [data-h=dfcsv]')
        d = await dl.value; p = await d.path(); txt = open(p, encoding='utf-8-sig').read(); open(os.path.join(OUT, 'competition1_live.csv'), 'w', encoding='utf-8-sig').write(txt)
        check(d.suggested_filename.startswith('lamma-spot-competition-1-') and d.suggested_filename.endswith('.csv') and '"صالح","130"' in txt and '"المنافسة","1"' in txt,
              f'«تنزيل النتائج» gives a spreadsheet file of competition 1 ({d.suggested_filename})')

        # ================= the question before a new competition, and «إلغاء»
        await host.click('#dfAct [data-h=nc]'); await host.wait_for_selector('.dfnc', timeout=4000)
        q = await host.inner_text('.dfnc')
        check('صالح' in q and '130' in q and 'جولة واحدة' in q and 'يبقى اللاعبون' in q, f'the host is asked first: leader, points, rounds, players stay («{q.splitlines()[1] if len(q.splitlines()) > 1 else q}»)')
        await host.screenshot(path=f'{SHOTS}/v5_host_newcomp_ask.png', full_page=True)
        await host.click('.dfnc [data-h=ncno]'); await host.wait_for_timeout(500); s = await S(host)
        check(s['cn'] == 1 and s['tot'][kA]['p'] == 130 and s['ph'] == 'over' and await host.locator('.dfnc').count() == 0, '«إلغاء»: nothing changes')

        # B's sealed tap of round 1 is kept to be delivered again later (a message arriving late)
        old_df = await B.evaluate('JSON.parse(JSON.stringify(NR.peers().find(p => p.isMe).presence.df || null))')
        check(bool(old_df and old_df.get('e')), 'a sealed tap message of round 1 kept for the late-delivery test')

        # ================= new competition from the results screen
        await host.click('#dfAct [data-h=nc]'); await host.click('.dfnc [data-h=ncgo]'); await host.wait_for_function('H.s.cn === 2 && H.s.ph === "lobby"', timeout=6000)
        await host.wait_for_timeout(1200); s = await S(host)
        check(s['tot'] == {} and s['cr'] == 0 and s['past'][-1]['cn'] == 1 and s['past'][-1]['top'][0][:2] == ['صالح', 130], 'competition 2: points at zero, competition 1 summarised for everybody (winner صالح 130)')
        check(await players() == 3, 'the 3 players are still in the room (nobody joined again)')
        hist = await host.evaluate('H.priv.hist')
        check(len(hist) == 1 and [x['n'] for x in hist[0]['rank']] == ['صالح', 'تافير', 'نورة'] and hist[0]['rounds'][0]['w'] == ['صالح'], 'the full summary of competition 1 is kept on the host (ranking and rounds)')
        for pg, n in ((A, 'phone 390'), (B, 'phone 360'), (C, 'computer')):
            await pg.wait_for_function('document.querySelector("#playerMain").innerText.includes("المنافسة 2")', timeout=6000)
            t = await pg.inner_text('#playerMain'); check('انتهت المنافسة 1' in t and 'صالح' in t and 'بدأت من جديد' in t, f'{n}: «المنافسة 2», how competition 1 ended, points start again')
        await A.screenshot(path=f'{SHOTS}/v5_phone_newcomp.png', full_page=True); await host.screenshot(path=f'{SHOTS}/v5_host_lobby_comp.png', full_page=True)
        async with host.expect_download() as dl: await host.click('.dfpast [data-h=dfcsv][data-cn="1"]')
        d = await dl.value; txt = open(await d.path(), encoding='utf-8-sig').read(); open(os.path.join(OUT, 'competition1.csv'), 'w', encoding='utf-8-sig').write(txt)
        check('"1","صالح","130","1","1","5"' in txt and '"2","تافير","50"' in txt and '"الجولة","الصورة","المستوى","الفائز"' in txt, 'the earlier competition downloads from the settings: ranking and each round')

        # ================= competition 2: late taps of competition 1 are not counted
        s = await new_round(); rd2 = s['rd']
        check(s['cn'] == 2 and set(s['pl']) == {kA, kB, kC} and all(v['p'] == 0 for v in s['pl'].values()), 'competition 2, round 1: everybody at zero')
        await B.evaluate(f'NR.presence({{df:{json.dumps(old_df)}}})'); await host.wait_for_timeout(1500); s = await S(host)
        check(s['pl'][kB]['f'] == 0 and s['pl'][kB]['w'] == 0, 'a tap message of competition 1 delivered again now: not counted')
        forged = dict(old_df, rd=rd2)
        await B.evaluate(f'NR.presence({{df:{json.dumps(forged)}}})'); await host.wait_for_timeout(1500); s = await S(host)
        check(s['pl'][kB]['f'] == 0 and s['pl'][kB]['w'] == 0, 'the same message relabelled with the new round number: it does not open (sealed for round 1), not counted')
        await B.evaluate('P.view.dfKeyRd = null; playerRender()'); await host.wait_for_timeout(800)
        # تافير goes offline, taps two differences (they cannot leave the phone), the host starts a new competition meanwhile
        await taps(A, [0, 1]); await host.wait_for_timeout(800)
        # (what the phone sends while offline waits on the phone, then reaches the database when it is back, as Firebase does)
        await B.evaluate('''(() => { window.__q = []; window.__hold = true; const o = NR.presence.bind(NR); window.__send = o;
            NR.presence = v => { if (window.__hold){ window.__q.push(JSON.parse(JSON.stringify(v))); return Promise.resolve(); } return o(v); }; })()''')
        await taps(B, [0, 1, 2]); await host.wait_for_timeout(600)
        check(await B.evaluate('window.__q.length') > 0, 'تافير\'s taps are waiting on the phone (offline)')
        await host.click('#dfAct [data-h=nc]'); await host.wait_for_selector('.dfnc', timeout=4000)
        q = await host.inner_text('.dfnc'); check('الجولة جارية' in q and 'إنهاء الجولة واحتسابها' in q, 'a round is being played: the host is told it will end and count in competition 2 first')
        await host.click('.dfnc [data-h=ncgo]'); await host.wait_for_function('H.s.cn === 3', timeout=6000); await host.wait_for_timeout(600)
        hist = await host.evaluate('H.priv.hist'); c2 = {x['n']: x for x in hist[-1]['rank']}
        check(len(hist) == 2 and hist[-1]['cn'] == 2 and c2['صالح']['p'] == 50 and c2['صالح']['r'] == 1 and c2['تافير']['p'] == 0,
              f'the round ended by the new competition counted in competition 2 (صالح 2×10 +30 = {c2["صالح"]["p"]}); تافير\'s offline taps not counted ({c2["تافير"]["p"]})')
        await B.evaluate('(async () => { window.__hold = false; for (const v of window.__q) await window.__send(v); })()'); await host.wait_for_timeout(2500); s = await S(host)
        check(s['cn'] == 3 and s['tot'] == {} and s['ph'] == 'lobby', 'تافير comes back online with its old taps: competition 3 still at zero')
        hist2 = await host.evaluate('H.priv.hist')
        check(hist2 == hist, 'and competition 2 does not change afterwards')

        # ================= reloads keep the competition and its number
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.g === "diff"', timeout=20000); await host.wait_for_timeout(1500)
        s = await S(host); h3 = await host.evaluate('H.priv.hist')
        check(s['cn'] == 3 and s['tot'] == {} and len(h3) == 2 and [x['cn'] for x in s['past']] == [1, 2], 'host reloads: competition 3, the two earlier competitions kept')
        await A.reload(); await A.wait_for_function('document.querySelector("#playerMain").innerText.includes("المنافسة 3")', timeout=15000)
        check('انتهت المنافسة 2' in await A.inner_text('#playerMain'), 'a phone reloads: «المنافسة 3», how competition 2 ended')
        s = await new_round(); await taps(C, [0]); await host.wait_for_timeout(800)
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.s.ph === "play"', timeout=20000); await host.wait_for_timeout(1500)
        G['D'] = await host.evaluate('H.priv.dfs'); await taps(C, [1, 2, 3, 4]); await host.wait_for_function('H.s.ph === "over"', timeout=8000); s = await S(host)
        check(s['cn'] == 3 and s['tot'][kC]['p'] == 130 and s['tot'][kC]['r'] == 1 and s['cr'] == 1 and kA in s['tot'] and s['tot'][kA]['p'] == 0,
              f'host reloads in the middle of a round of competition 3: the round counts once, in competition 3 only (نورة {s["tot"][kC]["p"]})')
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code', timeout=20000); await host.wait_for_timeout(1500)
        check((await S(host))['tot'] == s['tot'], 'host reloads after the round: nothing counted twice')
        # the database copy follows each move of the game at once (a reload on another tab or device finds it)
        cloud = await host.evaluate(f'(async () => {{ const g = await FS.get("games/" + ROOM_PREFIX + {json.dumps(code)}); return g ? JSON.parse(g.s) : null; }})()')
        check(cloud and cloud['cn'] == 3 and cloud['ph'] == 'over' and cloud['tot'].get(kC, {}).get('p') == 130, 'the database copy of the room is already at competition 3 with the result')

        # ================= large points, many players: within the database limits
        big = await host.evaluate('''(() => { const s = H.s, keep = JSON.stringify(s.tot);
            for (let i = 0; i < 40; i++){ const n = "لاعب طويل الاسم " + String(i).padStart(3, "0"); s.tot["n_x" + i] = {n, p:2000 + i * 37, r:40, f:300, w:12, pr:i + 1, dp:130}; }
            const pres = JSON.stringify(hostPresence()).length, sv = JSON.stringify(s).length;
            for (let k = 0; k < 4; k++){ H.priv.crounds = Array.from({length:100}, (_, j) => ({rd:j, t:"سوق شعبي مزدحم بالألوان", id:"spot-v5-x-" + j, lv:2, end:"win", w:["لاعب طويل الاسم 001"], at:Date.now()})); Diff.newComp(); for (let i = 0; i < 40; i++) s.tot["n_x" + i] = {n:"لاعب طويل الاسم " + i, p:2500 + i, r:100, f:900, w:30}; s.cr = 100; }
            const pv = JSON.stringify(Diff.savePriv()).length, pres2 = JSON.stringify(hostPresence()).length;
            return {pres, sv, pv, pres2, top:Diff.compNow().rank[0], hist:H.priv.hist.length}; })()''')
        check(big['pres'] < 12000 and big['pres2'] < 12000 and big['sv'] < 20000 and big['pv'] < 120000, f'40 players with more than 2,000 points and 6 kept competitions of 100 rounds: room {big["pres"]}/{big["pres2"]} < 12,000, saved game {big["sv"]} < 20,000, private copy {big["pv"]} < 120,000')
        check(big['top']['p'] == 2539 and big['hist'] == 6, f'points above 2,000 ranked correctly ({big["top"]["n"]} {big["top"]["p"]}); the 6 latest competitions kept')
        await host.evaluate('renderHost()'); await host.wait_for_timeout(400)
        for pg, w in ((A, 390), (B, 360), (C, 1280)):
            sw = await pg.evaluate('document.documentElement.scrollWidth'); check(sw <= w, f'no horizontal scroll at {w} px ({sw})')
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    n = sum(ok for ok, _ in R); print(f'\n{n}/{len(R)} passed'); sys.exit(0 if n == len(R) else 1)

asyncio.run(main())
