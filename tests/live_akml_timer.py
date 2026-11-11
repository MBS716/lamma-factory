"""أكملها on a real site (emulator build or the preview): the answer timer — see tests/t_akml_timer.py of the branch akml-v2."""
import asyncio, json, sys
import urllib.request, os
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'; OUT = sys.argv[2] if len(sys.argv) > 2 else 'reports/akml'
class Env:
    """every page is its own device: its own browser context (own storage, own anonymous sign-in)"""
    def __init__(self, port=None, autogo=False): self.errs = []; self.U = URL
    async def __aenter__(self):
        self.pw = await async_playwright().start(); self.b = await self.pw.chromium.launch(); self.ctxs = []; return self
    async def page(self, name, w, h, device=None):
        ctx = await self.b.new_context(has_touch=True, viewport={'width': w, 'height': h}); self.ctxs.append(ctx)
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: self.errs.append(f'{name}: {e}')); return pg
    async def start(self, host, game, opts=None):
        await host.goto(self.U); await host.wait_for_function('typeof AUTH_UID !== "undefined" && !window.__resuming', timeout=30000); await host.wait_for_timeout(1500)
        if await host.is_visible('#endBtn'): await host.click('#endBtn'); await host.wait_for_timeout(600)
        await host.click(f'.gact [data-game={game}]'); await host.wait_for_selector('.code', timeout=30000)
        for k, v in (opts or {}).items(): await host.click(f'[data-opt={k}][data-val="{v}"]')
        return await host.inner_text('.code')
    async def join(self, pg, code, name, team=None):
        await pg.goto(self.U + '#' + code); await pg.wait_for_selector('#pName', timeout=30000); await pg.fill('#pName', name)
        await pg.click('[data-act=enter]'); await pg.wait_for_timeout(1200)
    async def __aexit__(self, *a):
        await self.b.close(); await self.pw.stop()
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
ITEM = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.priv.B.by[H.priv.qid]))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')
NOW = lambda pg: pg.evaluate('srvNow()')
TXT = lambda pg: pg.inner_text('#playerMain')
SHOTS = OUT

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with Env(8792, autogo=False) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        P3 = (A, B, C)
        code = await E.start(host, 'akml')
        names = ('صالح', 'تافير', 'نورة')
        for pg, n in zip(P3, names): await E.join(pg, code, n)
        await host.wait_for_timeout(1200)
        kA, kB, kC = [await key(host, n) for n in names]

        async def opt(k, v): await host.click(f'[data-opt={k}][data-val="{v}"]'); await host.wait_for_timeout(150)
        async def lobby():
            if (await host.evaluate('H.s.ph')) != 'lobby': await host.click('#setBtn'); await host.wait_for_timeout(600)
        async def reveal(t=70000): await host.wait_for_function('H.s.ph === "r"', timeout=t); await host.wait_for_timeout(600)
        async def choose(pg, i): await pg.wait_for_selector(f'[data-ak="{i}"]', timeout=8000); await pg.click(f'[data-ak="{i}"]')
        async def go():                     # the host presses «ابدأ وقت الإجابة»; returns the moment of the press
            await host.wait_for_selector('[data-h=akgo]:not([disabled])', timeout=8000); t = await NOW(host)
            await host.click('[data-h=akgo]'); await host.wait_for_function('!H.s.rd', timeout=5000); return t
        async def started(): await host.wait_for_function('H.s.ph === "q" && srvNow() >= H.s.qs', timeout=70000); await host.wait_for_timeout(300)
        async def right(): return await host.evaluate('H.priv.ci')
        async def forge(pg, c=0):           # a phone that skips its own screen and sends a sealed answer anyway
            await pg.evaluate(f'''(async () => {{ const s = findHost().presence.s; P.view.akA = {{i:s.sp, t:0, key:s.sp + "|0", q:s.qs, at:srvNow(), c:{c}}}; await Akml.psend(); }})()''')

        # ================= the settings =================
        lb = await host.inner_text('#hostMain')
        check(all([await host.locator(f'[data-opt=t][data-val="{v}"]').count() == 1 for v in (10, 15, 20, 30, 45, 60)]), 'answer time: 10, 15, 20, 30 kept, 45 and 60 added')
        check('45 ث' in lb and 'دقيقة' in lb, 'the new durations read «45 ث» and «دقيقة»')
        check(await host.evaluate('H.s.o.rs') == 'man' and 'بدء وقت الإجابة' in lb and await host.locator('[data-opt=rw]').count() == 0, 'the start of the answer time: manual by default, no reading time shown')
        await opt('rs', 'auto')
        check(all([await host.locator(f'[data-opt=rw][data-val="{v}"]').count() == 1 for v in (10, 15, 20)]), 'automatic: a reading time of 10, 15 or 20 s can be chosen')
        await opt('rs', 'man')
        await host.screenshot(path=SHOTS + '/akt_lobby.png', full_page=True)

        # ================= manual · 45 s · choose from four, everybody answers =================
        await opt('m', 'c'); await opt('lock', 'all'); await opt('n', '10'); await opt('t', '45')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000); await host.wait_for_timeout(1500)
        s = await S(host); it = await ITEM(host); now = await NOW(host)
        check(s['q']['T'] == 45, 'the question has 45 s of answer time')
        check(s['rd'] and s['rd']['a'] == 0 and s['qs'] - now > 3600e3, 'manual: the question is shown in its reading time, the clock waits for the host')
        hm = await host.inner_text('#hostMain')
        check(it['pre'].strip()[:12] in hm and await host.locator('[data-h=akgo]').count() == 1 and 'وقت القراءة' in hm, 'the host sees the question, «وقت القراءة» and the button «ابدأ وقت الإجابة»')
        for pg, n in zip(P3, names):
            t = await TXT(pg)
            check(it['pre'].strip()[:12] in t and await pg.locator('[data-ak]').count() == 0 and await pg.locator('.opt[disabled]').count() == 4, f'{n}: sees the question and the four options, which cannot be chosen yet')
        await host.screenshot(path=SHOTS + '/akt_host_reading.png'); await A.screenshot(path=SHOTS + '/akt_phone_reading.png')
        await A.wait_for_timeout(4000)
        check((await S(host))['rd'] and not await host.evaluate('srvNow() >= H.s.qs'), 'after 5 s of reading the clock has still not started')
        await A.click('.opt[disabled] >> nth=0', force=True); await A.evaluate(f'Akml.answer({{c:{await right()}}})'); await forge(B, await right())
        await host.wait_for_timeout(1500)
        check(await host.evaluate('Object.keys(H.priv.ans).length') == 0 and (await S(host))['cnt'] == 0, 'answers during the reading are refused: a tap, a call from the page, and a sealed answer sent anyway')
        check(await A.evaluate('!P.view.akA'), 'the phone keeps no answer from the reading time, so it can still answer when the time starts')

        # host reloads during the reading: the question waits as it was
        qs0 = (await S(host))['qs']
        await host.reload(); await host.wait_for_function('typeof H !== "undefined" && H && H.code && H.s.ph === "q"', timeout=20000); await host.wait_for_timeout(1500)
        s = await S(host)
        check(s['rd'] and s['qs'] == qs0 and await host.locator('[data-h=akgo]').count() == 1, 'host reloads during the reading: still reading, the clock still waits, the button is back')
        await B.reload(); await B.wait_for_selector('.opt[disabled]', timeout=10000)
        check(await B.locator('[data-ak]').count() == 0, 'a phone reloads during the reading: the question again, options still closed')

        # the host starts the answer time
        tpress = await go(); s = await S(host)
        check(1500 <= s['qs'] - tpress <= 2600, f'the answer time starts {s["qs"] - tpress} ms after the press, at one moment for every phone')
        # every phone gets the same start moment, and gets it before that moment comes (so all start together)
        got = []
        for pg in P3:
            try:
                await pg.wait_for_function(f'findHost() && findHost().presence.s.qs === {s["qs"]}', timeout=max(100, s['qs'] - await NOW(pg)))
                got.append(s['qs'] - await NOW(pg))
            except Exception: got.append(None)
        check(all(x is not None and x >= 0 for x in got), f'every phone has the same start of the answer time, received before it starts (with {", ".join(str(round(x)) + " ms" if x is not None else "late" for x in got)} to spare)')
        await A.wait_for_selector('[data-ak]', timeout=6000); t_open = await NOW(A)
        check(t_open >= s['qs'] - 300, 'the options open on the phone at the start of the answer time, not before')
        await choose(A, await right())
        await B.wait_for_timeout(9000); await choose(B, await right())
        # the host reloads during the answer time: the clock goes on from the same start
        left1 = await host.evaluate('akLeft(H.s)')
        await host.reload(); await host.wait_for_function('typeof H !== "undefined" && H && H.code && H.s.ph === "q"', timeout=20000); await host.wait_for_timeout(1000)
        left2 = await host.evaluate('akLeft(H.s)'); s2 = await S(host)
        check(s2['qs'] == s['qs'] and 0 < left2 < left1 and 45000 - left2 > 9000, f'host reloads during the answer time: same start, the clock goes on ({round(left1/1000)} s → {round(left2/1000)} s left)')
        await C.reload(); await C.wait_for_selector('[data-ak]', timeout=10000)
        tc = await C.inner_text('#akClock'); check(tc.strip().isdigit() and abs(int(tc) - left2 / 1000) <= 3, f'a phone reloads during the answer time: its clock shows the same time left ({tc} s)')
        await choose(C, (await right() + 1) % 4)
        await reveal(); s = await S(host); sc = await host.evaluate('JSON.parse(JSON.stringify(H.priv.ans))')
        msA, msB = sc[kA]['ms'], sc[kB]['ms']
        check(msA < 1500, f'صالح answered at once: {msA} ms counted, the reading time (more than 8 s) is not counted')
        check(8500 <= msB <= 11500, f'تافير answered about 9 s after the start: {msB} ms counted')
        rA, rB, rC = s['res'][kA], s['res'][kB], s['res'][kC]
        bA = round(50 * max(0, 1 - msA / 45000)); bB = round(50 * max(0, 1 - msB / 45000))
        check(rA[0] == 100 + bA and rA[4] == bA and bA >= 48, f'speed bonus from the start of the answer time: صالح +{rA[0]} (bonus {rA[4]})')
        check(rB[0] == 100 + bB and rB[4] == bB, f'تافير +{rB[0]} (bonus {rB[4]}), less for answering later')
        check(rC[0] == 0 and rC[1] == 0, 'نورة wrong: no points')
        await host.screenshot(path=SHOTS + '/akt_result.png')

        # ================= automatic · 10 s reading · 60 s =================
        await lobby(); await opt('rs', 'auto'); await opt('rw', '10'); await opt('t', '60')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        t0 = await NOW(host); s = await S(host)
        check(s['q']['T'] == 60 and s['rd']['a'] == 1 and 9000 <= s['qs'] - t0 <= 10500, f'automatic: 60 s of answer time after 10 s of reading (starts in {round((s["qs"] - t0) / 1000, 1)} s)')
        check(await host.locator('[data-h=akgo]').count() == 0 and 'يبدأ وقت الإجابة تلقائيًا' in await host.inner_text('#hostMain'), 'automatic: no button, the host sees the countdown of the reading')
        await A.wait_for_selector('.opt[disabled]', timeout=8000); await forge(B, await right()); await A.wait_for_timeout(1200)
        check(await host.evaluate('Object.keys(H.priv.ans).length') == 0, 'automatic: an answer sent during the reading is refused')
        # a phone reloads during the automatic reading
        await C.reload(); await C.wait_for_selector('.opt[disabled]', timeout=10000)
        check(await C.locator('[data-ak]').count() == 0, 'a phone reloads during the automatic reading: options still closed')
        await started(); await A.wait_for_selector('[data-ak]', timeout=5000)
        tc = await A.inner_text('#akClock'); check(tc.strip().isdigit() and 57 <= int(tc) <= 60, f'the 60 s clock starts at 60 on the phone ({tc})')
        await choose(A, await right()); await A.wait_for_timeout(2500); await choose(C, await right())   # تافير's page sent a forged answer: it stays out
        await reveal(); sc = await host.evaluate('JSON.parse(JSON.stringify(H.priv.ans))'); s = await S(host)
        check(sc[kA]['ms'] < 2000 and s['res'][kA][4] >= 48, f'automatic: صالح {sc[kA]["ms"]} ms from the start of the answer time, bonus {s["res"][kA][4]}; the 10 s reading not counted')

        # ================= fastest finger · aloud · manual =================
        await lobby(); await opt('rs', 'man'); await opt('m', 'b'); await opt('binp', 'o'); await opt('t', '30')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000); await host.wait_for_timeout(1200)
        check(await A.locator('.akbz').count() == 0, 'fastest finger: no «أعرف الإجابة» during the reading')
        await A.evaluate('Akml.buzz()'); await B.evaluate('(() => { const s = findHost().presence.s; NR.presence({ak:{i:s.sp, bz:1}}); })()'); await host.wait_for_timeout(1200)
        check(not (await S(host))['bz']['q'], 'a press during the reading is refused (from the page and sent anyway)')
        await go(); await started(); await B.evaluate('NR.presence({ak:null})')
        await A.wait_for_selector('.akbz', timeout=6000); await A.click('.akbz'); await host.wait_for_function('H.s.bz.cur >= 0', timeout=8000)
        s = await S(host); check(s['bz']['q'][s['bz']['cur']][0] == kA, 'after the start: صالح presses first and has the turn')
        await host.wait_for_selector('[data-h=bok]', timeout=8000)
        if await host.locator('[data-h=bgo]').count(): await host.click('[data-h=bgo]'); await host.wait_for_timeout(600)
        await host.click('[data-h=bok]')
        await reveal(); s = await S(host)
        check(s['res'][kA][0] == 150 and s['res'][kA][1] == 1, f'judging aloud unchanged: the host says right, صالح +{s["res"][kA][0]} (100 + 50 first)')

        # ================= the match goes to its end: results =================
        await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000); s = await S(host)
        top = s['fin']
        check(s['ph'] == 'end' and top, 'the match ends with its results')
        tA = await A.inner_text('#playerMain'); check('ترتيبك' in tA, 'the phone shows its rank at the end')
        await host.screenshot(path=SHOTS + '/akt_end.png', full_page=True)
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    n = sum(ok for ok, _ in R); print(f'\n{n}/{len(R)} passed'); sys.exit(0 if n == len(R) else 1)

asyncio.run(main())
