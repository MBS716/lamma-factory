"""Host closes the tab in the middle of a wheel match and comes back: same room, same state, players kept.
Run twice: with the database copy (rules updated) and with the database refusing (current public rules) -> device copy.
Usage: python t_wheel3_resume.py [deny]"""
import asyncio, sys, os, json
from common import Env
DENY = len(sys.argv) > 1 and sys.argv[1] == 'deny'
R = []
def check(ok, msg): R.append(ok); print(('OK   ' if ok else 'FAIL ') + msg)

async def main():
    async with Env(8700 + os.getpid() % 40) as E:
        g = await E.page('green', 390, 844); o = await E.page('orange', 360, 780)
        host = await E.page('host', 1280, 900)
        await host.add_init_script(f"try{{localStorage.setItem('lm-w-mot','0'); localStorage.setItem('fakedeny','{'1' if DENY else '0'}')}}catch(e){{}}")
        await host.goto(E.U); await host.click('.gact [data-game=wheel]'); await host.wait_for_selector('.code', timeout=8000)
        await host.click('[data-opt=goal][data-val="3000"]'); code = await host.inner_text('.code')
        await E.join(g, code, 'سارة', 'g'); await E.join(o, code, 'خالد', 'o'); await host.wait_for_timeout(500)
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"')
        cloud = await host.evaluate('!!H.cloud'); check(cloud == (not DENY), f'database copy {"refused (current rules): device copy only" if DENY else "in use"} ({cloud})')
        play = lambda a, k=None: host.evaluate(f'(() => {{ const r = W3.act(H.s, H.priv.wp, "{a}", null, W3.tok(H.s), Wheel.env()); {f"H.s.seg = {json.dumps(k)};" if k else ""} pushHost(); return r; }})()')
        await play('spin', 'p250'); await play('land'); await play('next'); await play('spin', 'imm'); await play('land'); await play('next')
        await play('spin', 'box'); await play('land')
        await host.wait_for_timeout(2200)            # the database copy is written at most every 1.5 s
        before = await host.evaluate('JSON.parse(JSON.stringify(H.s))')
        if not DENY:
            saved = await host.evaluate(f'JSON.parse(JSON.parse(localStorage.getItem("fakestore2"))["games/lm3-{code}"].s)')
            check(saved['sc'] == before['sc'] and saved['cur'] == before['cur'], 'the match state is saved in the database copy')
            lock = await host.evaluate(f'JSON.parse(localStorage.getItem("fakestore2"))["hosts/lm3-{code}"]')
            check(lock and lock['u'] == await host.evaluate('AUTH_UID'), 'the room is locked to the host device identity')
        await host.close(); await g.wait_for_timeout(800)
        txt = await g.inner_text('#playerMain')
        check('المقدّم غير متصل مؤقتًا' in txt, 'host tab closed: players stay in the room and see «host temporarily away»')
        # the same device opens the site again later
        host2 = await E.page('host2', 1280, 900)
        await host2.add_init_script(f"try{{localStorage.setItem('lm-w-mot','0'); localStorage.setItem('fakedeny','{'1' if DENY else '0'}')}}catch(e){{}}")
        if not DENY:   # make the device copy older and different, so we can see the database copy wins
            await host2.goto(E.U); await host2.evaluate('(() => { const x = JSON.parse(localStorage.getItem("lm-host3")); x.at -= 60000; x.s.step -= 1; x.s.sc = [1, 1]; localStorage.setItem("lm-host3", JSON.stringify(x)); })()')
        await host2.goto(E.U); await host2.wait_for_selector('#resumeGo', timeout=8000)
        check(True, 'new tab on the same device offers to resume the match')
        await host2.click('#resumeGo'); await host2.wait_for_function('H && H.code && H.s.ph === "play"', timeout=15000); await host2.wait_for_timeout(800)
        after = await host2.evaluate('JSON.parse(JSON.stringify(H.s))')
        check(await host2.evaluate('H.code') == code, f'same room code after resuming ({code})')
        check(after['sc'] == before['sc'] and after['im'] == before['im'] and after['cur'] == before['cur'] and after['tn'] == before['tn'],
              f'same scores, immunity, turns and open card ({"device copy" if DENY else "the database copy, which went further, wins over an older device copy"}) {after["sc"]}')
        await g.wait_for_function('document.querySelector("#playerMain").innerText.includes("صندوق الحظ")', timeout=8000)
        check(True, 'players are back in the match without re-joining')
        sc0 = after['sc']; t = after['turn']
        await host2.evaluate('W3.act(H.s, H.priv.wp, "open", null, W3.tok(H.s), Wheel.env()); pushHost()')
        r = await host2.evaluate('H.s.cur'); sc1 = await host2.evaluate('H.s.sc')
        ok = r['st'] == 'open' and (sum(sc1) - sum(sc0)) in (0, 50, 150, 250, 400, -50, -150, -250, 100) or r['r'] in ('imm', 'respin', 'lose')
        check(ok, f'the box opens once after resuming ({r.get("r")} {r.get("v")})')
        if not DENY:
            opened = await host2.evaluate('JSON.parse(JSON.stringify(H.s.cur))')
            await host2.evaluate(f'(() => {{ const st = JSON.parse(localStorage.getItem("fakestore2")); const g = JSON.parse(st["games/lm3-{code}"].s); g.step -= 1; g.cur = {{k:"box", st:"closed"}}; st["games/lm3-{code}"].s = JSON.stringify(g); localStorage.setItem("fakestore2", JSON.stringify(st)); }})()')
            await host2.evaluate('(() => { const x = JSON.parse(sessionStorage.getItem("lm-host")); sessionStorage.clear(); })()')
            h5 = await E.page('host5', 1280, 900); await host2.close(); host2 = h5
            await host2.add_init_script("try{localStorage.setItem('lm-w-mot','0')}catch(e){}")
            await host2.goto(E.U); await host2.wait_for_selector('#resumeGo', timeout=8000); await host2.click('#resumeGo')
            await host2.wait_for_function('H && H.code && H.s.ph === "play"', timeout=15000); await host2.wait_for_timeout(600)
            again = await host2.evaluate('JSON.parse(JSON.stringify(H.s.cur))')
            check(again == opened and await host2.locator('[data-w=open]').count() == 0, 'a database copy that is behind (box still closed) never replaces the newer one: the box stays opened, no second draw')
        # the code of a paused game is kept for its host
        free = await host2.evaluate('(async () => { const st = JSON.parse(localStorage.getItem("fakestore2") || "{}"); st["hosts/lm3-4321"] = {u:"someone-else", t:Date.now(), g:"wheel"}; st["hosts/lm3-4322"] = {u:"someone-else", t:Date.now() - 4 * 3600e3, g:"wheel"}; localStorage.setItem("fakestore2", JSON.stringify(st)); return [await codeFree("4321"), await codeFree("4322")]; })()')
        if not DENY: check(free == [False, True], f'another host cannot take a paused room (kept 3 h), an older one is free again {free}')
        # ending the match removes the saved copies and the resume offer
        await host2.click('#endBtn'); await host2.wait_for_timeout(600)
        left = await host2.evaluate(f'[localStorage.getItem("lm-host3"), (JSON.parse(localStorage.getItem("fakestore2") || "{{}}"))["games/lm3-{code}"] || null]')
        check(left == [None, None], 'ending the match deletes the saved copies')
        await host2.goto(E.U); await host2.wait_for_timeout(500)
        check(await host2.locator('#resumeGo').count() == 0 or not await host2.is_visible('#resumeGo'), 'no resume offer after the match was ended')
        # other games keep the old behaviour (resume only in the same tab)
        h3 = await E.page('host3', 1280, 900); await h3.goto(E.U); await h3.click('.gact [data-game=letters]'); await h3.wait_for_selector('.code', timeout=8000); await h3.wait_for_timeout(300)
        await h3.close(); h4 = await E.page('host4', 1280, 900); await h4.goto(E.U); await h4.wait_for_timeout(600)
        check(not await h4.is_visible('#resumeGo'), 'letters (another game): closing the tab does not leave a resume offer, as before')
        check(not E.errs, f'no script errors ({E.errs[:3]})')
    print(f"{sum(R)}/{len(R)} passed ({'current rules: database refuses' if DENY else 'rules updated'})"); sys.exit(0 if all(R) else 1)
asyncio.run(main())
