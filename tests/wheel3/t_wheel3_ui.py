"""Wheel v3 in real browsers: host + two players (green, orange), every card flow through the host's buttons,
what the players see, reload during the box, double taps, end of match, no controls on phones.
Usage: python t_wheel3_ui.py [host width] [screenshot folder]"""
import asyncio, sys, os, json
from common import Env
HW = int(sys.argv[1]) if len(sys.argv) > 1 else 1280
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
R = []
def check(ok, msg): R.append(ok); print(('OK   ' if ok else 'FAIL ') + msg)

async def main():
    async with Env(8760 + os.getpid() % 30) as E:
        host = await E.page('host', HW, 900 if HW > 600 else 844); g = await E.page('green', 390, 844); o = await E.page('orange', 360, 780)
        for pg in (host, g, o): await pg.add_init_script("try{localStorage.setItem('lm-w-mot','0')}catch(e){}")
        async def shot(pg, name):
            if SHOT: os.makedirs(SHOT, exist_ok=True); await pg.wait_for_timeout(250); await pg.screenshot(path=f'{SHOT}/{name}.png', full_page=True)
        S = lambda: host.evaluate('JSON.parse(JSON.stringify(H.s))')
        async def click(sel):
            await host.locator(sel).first.scroll_into_view_if_needed(); await host.locator(sel).first.click()
        async def w(a, arg=None):
            sel = f'[data-w="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')
            await host.wait_for_selector(sel, timeout=6000); await host.wait_for_timeout(480); await click(sel); await host.wait_for_timeout(150)
        async def force(k):   # press the real spin button, make the wheel stop on card k
            await w('spin'); await host.evaluate(f'H.s.seg = "{k}"'); await host.wait_for_function('H.s.stage !== "rolling"', timeout=8000); await host.wait_for_timeout(250)
        async def seen(pg, text, t=5000):
            try: await pg.wait_for_function(f'document.querySelector("#playerMain").innerText.includes({json.dumps(text)})', timeout=t); return True
            except Exception: return False

        await host.goto(E.U); await host.click('.gact [data-game=wheel]'); await host.wait_for_selector('.code', timeout=8000)
        code = await host.inner_text('.code')
        check(await host.is_disabled('[data-h=start]'), 'lobby: start is disabled until a goal is chosen (no default goal)')
        await host.click('[data-opt=goal][data-val="1500"]'); await host.wait_for_timeout(200)
        check(not await host.is_disabled('[data-h=start]'), 'goal 1,500 chosen: start enabled')
        await host.click('[data-opt=mode][data-val="classic"]'); await host.click('[data-opt=t][data-val="45"]')
        await host.click('.w3cards summary'); await host.wait_for_timeout(150)
        rows = await host.locator('.w3table tr').count(); check(rows == 20, f'lobby lists all 20 cards with their odds ({rows})')
        await host.click('[data-h=tog][data-card=tre]'); await host.wait_for_timeout(150)
        off = await host.evaluate('H.s.o.off'); pct = await host.locator('.w3table tr.off td.num').first.inner_text()
        check(off == ['tre'] and pct.strip() == '—', 'switching a card off removes it from the odds table')
        await host.click('[data-h=tog][data-card=tre]'); await host.wait_for_timeout(150)
        check(await host.evaluate('H.s.o.off.length') == 0, 'and switching it on again restores it')
        await E.join(g, code, 'سارة', 'g'); await E.join(o, code, 'خالد', 'o'); await host.wait_for_timeout(600)
        await shot(host, 'host_lobby')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"')
        s = await S(); check(s['o']['goal'] == 1500 and s['o']['t'] == 45 and s['o']['mode'] == 'classic', 'match started with the chosen settings')
        check(await seen(g, 'بانتظار لفّ العجلة') and await seen(o, 'الهدف 1,500'), 'phones show the scoreboard, the goal and whose turn it is')
        await shot(host, 'host_spin'); await shot(g, 'player_spin')

        # direct points, immunity, shield
        t = (await S())['turn']; await force('p250'); s = await S()
        check(s['sc'][t] == 250, '+250 card applied at once'); check(await seen(g, '+250'), 'phones show +250')
        await w('next'); t2 = (await S())['turn']; check(t2 != t, 'turn passes to the other team')
        await force('imm'); check((await S())['im'][t2] == 1, 'immunity received'); await shot(host, 'host_immunity'); await shot(g, 'player_immunity')
        await w('next'); await force('p50'); await w('next')
        await host.evaluate(f'H.s.sc[{t2}] = 300; pushHost()'); await force('m250'); s = await S()
        check(s['sc'][t2] == 300 and s['im'][t2] == 0, 'immunity blocks −250 and is used up')
        check(await seen(g, 'الحصانة منعت'), 'phones show that the immunity blocked the deduction')
        await w('next')

        # question: host judges; double tap counted once; answer hidden from phones until judged
        await force('q'); s = await S(); t = s['turn']
        check('ci' not in s['cur'] and await host.evaluate('H.priv.wp.ci') in (0, 1, 2, 3), 'question: the right answer is kept on the host, not sent to phones')
        check(await host.locator('[data-w=ok]').count() == 1 and await g.locator('[data-w]').count() == 0 and await o.locator('[data-w]').count() == 0, 'only the host has judging buttons; phones have none')
        await shot(host, 'host_question'); await shot(o, 'player_question')
        before = s['sc'][t]; await host.locator('[data-w=ok]').dblclick(); await host.wait_for_timeout(300); s = await S()
        check(s['sc'][t] - before == 200, f'double tap on «right»: +200 once (got +{s["sc"][t] - before})')
        check(await seen(g, 'إجابة صحيحة'), 'phones see the verdict and the right answer')
        await w('next')

        # speed challenge: cancel, replay, both lose, winner
        await force('speed'); sc0 = (await S())['sc']
        check(await seen(o, 'ضد'), 'speed challenge: face-off screen on phones'); await shot(host, 'host_speed'); await shot(g, 'player_speed')
        await w('sx'); s = await S(); check(s['sc'] == sc0 and s['cur']['st'] == 'cancel', 'cancelled challenge: scores unchanged')
        await w('sre'); await w('sn'); s = await S(); check(s['sc'] == sc0, 'replayed, both teams lose: scores unchanged')
        await w('next'); await force('speed'); sc0 = (await S())['sc']; await w('so'); s = await S()
        check(s['sc'][1] - sc0[1] == 250 and s['sc'][0] == sc0[0], 'orange wins the challenge: +250 to orange only'); await w('next')

        # box: reload the host page right after opening -> same result, nothing applied twice
        await force('box'); check(await seen(g, 'صندوق الحظ'), 'box appears closed on phones'); await shot(host, 'host_box_closed')
        await w('open'); await host.wait_for_timeout(400); s1 = await S(); await shot(host, 'host_box_open'); await shot(g, 'player_box_open')
        await host.reload(); await host.wait_for_selector('#resumeGo', timeout=8000); await host.click('#resumeGo')
        await host.wait_for_function('H && H.code && H.s.cur && H.s.cur.k === "box"', timeout=15000); await host.wait_for_timeout(800); s2 = await S()
        check(s2['sc'] == s1['sc'] and s2['cur'] == s1['cur'] and await host.locator('[data-w=open]').count() == 0, 'host reload after opening the box: same result, no second opening, no double score')
        check(await seen(g, 'صندوق الحظ', 8000), 'phones still in the game after the host came back')
        nxt = 'again' if s2['cur']['r'] == 'respin' else 'next'; await w(nxt)
        if nxt == 'again': await force('p50'); await w('next')

        # luck twice: two spins, choose one
        t = (await S())['turn']; sc_t = (await S())['sc'][t]
        await force('l2'); await w('l2spin'); await host.evaluate('H.s.seg = "p150"'); await host.wait_for_function('H.s.cur.st === "b"', timeout=8000)
        await w('l2spin'); await host.evaluate('H.s.seg = "m50"'); await host.wait_for_function('H.s.cur.st === "choose"', timeout=8000)
        check((await S())['sc'][t] == sc_t and await seen(g, 'اختاروا نتيجة واحدة'), 'luck twice: both results shown, nothing applied yet'); await shot(host, 'host_luck2'); await shot(g, 'player_luck2')
        await w('l2pick', 'a'); s = await S(); check(s['sc'][t] == sc_t + 150, 'the chosen result (+150) only is applied'); await w('next')

        # treasure, bet, streak, steal, swap
        t = (await S())['turn']; sc_t = (await S())['sc'][t]; await force('tre'); await shot(host, 'host_treasure'); await w('tpick', 2); s = await S()
        check(s['sc'][t] - sc_t in (100, 300, 500), f'treasure: chosen chest adds {s["sc"][t] - sc_t}'); await shot(g, 'player_treasure'); await w('next')
        t = (await S())['turn']; await host.evaluate(f'H.s.sc[{t}] = 250; pushHost()'); await force('bet')
        check(await host.locator('[data-w=wager]').count() == 2, 'bet with 250 points: only 100 and 200 offered'); await w('wager', 200); await w('no')
        check((await S())['sc'][t] == 50, 'bet lost: −200'); await w('next')
        t = (await S())['turn']; sc_t = (await S())['sc'][t]; await force('streak'); await w('ok'); await w('more'); await w('ok'); await w('more'); await w('no')
        check((await S())['sc'][t] - sc_t == 350, 'streak: 150 + 200, ends at the first wrong answer, keeps 350'); await w('next')
        t = (await S())['turn']; await host.evaluate(f'H.s.sc = [400, 400]; H.s.im = [0, 0]; H.s.s2 = [0, 0]; H.s.im[{t}] = 1; pushHost()'); await force('swap'); s = await S()
        check(s['im'][t] == 0 and s['im'][1 - t] == 1, 'swap: the immunity moves to the other team'); await w('next')
        t = (await S())['turn']; await host.evaluate(f'H.s.sc = [400, 400]; H.s.im = [0, 0]; H.s.im[{1 - t}] = 1; pushHost()'); await force('steal'); s = await S()
        check(s['sc'][1 - t] == 400 and s['im'][1 - t] == 0, 'steal against immunity: blocked, immunity used'); await w('next')
        t = (await S())['turn']; await host.evaluate('H.s.sc = [400, 400]; H.s.im = [0, 0]; pushHost()'); await force('steal'); s = await S()
        check(s['sc'][t] == 550 and s['sc'][1 - t] == 250, 'steal: 150 moves to the stealing team'); await w('next')

        # end of the match: close to the goal, final round, winner screen on phones
        await host.evaluate('H.s.sc = [1450, 1400]; pushHost()')
        while (await S())['ph'] == 'play':
            await force('p50'); await w('next')
        s = await S(); check(s['ph'] == 'final' and s['tn'][0] == s['tn'][1], 'goal reached: round completed, final round with equal turns')
        check(await seen(g, 'الجولة الختامية'), 'phones show the final round'); await shot(host, 'host_final')
        await force('p50'); await w('next'); await force('p250'); await w('next'); s = await S()
        check(s['ph'] == 'end' and s['win'] in (0, 1), 'final round played: winner declared on points')
        check(await seen(g, 'الفائز') and await seen(o, 'الفائز'), 'winner screen on both phones'); await shot(host, 'host_end'); await shot(g, 'player_end')
        check(s['tn'][0] == s['tn'][1], f'equal number of turns at the end ({s["tn"]})')
        sw = await host.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
        check(sw <= 0, f'host page has no sideways scroll ({sw})')
        for name, pg in (('green', g), ('orange', o)):
            sw = await pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'); check(sw <= 0, f'{name} phone: no sideways scroll ({sw})')
        check(not E.errs, f'no script errors ({E.errs[:3]})')
    print(f"{sum(R)}/{len(R)} passed (host width {HW})"); sys.exit(0 if all(R) else 1)
asyncio.run(main())
