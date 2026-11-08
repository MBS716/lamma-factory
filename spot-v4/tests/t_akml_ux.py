"""أكملها: a walk through the screens a person sees (host and phones) in each method, for a human review of the look and
the wording. Screenshots only; no pass/fail."""
import asyncio, json, os
from common import Env
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
ITEM = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.priv.B.by[H.priv.qid]))')
OUT = '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/ux'

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with Env(8788) as E:
        host = await E.page('host', 390, 844)            # the host on a phone: the hardest case
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 390, 844); D = await E.page('D', 360, 740)
        code = await E.start(host, 'akml')
        for pg, n in zip((A, B, C, D), ('صالح', 'تافير', 'نورة', 'فهد')): await E.join(pg, code, n)
        await host.wait_for_timeout(1000)
        shot = lambda pg, n, full=False: pg.screenshot(path=f'{OUT}/{n}.png', full_page=full)
        async def opt(k, v): await host.click(f'[data-opt={k}][data-val="{v}"]'); await host.wait_for_timeout(150)
        async def live(): await host.wait_for_function('H.s.ph === "q" && srvNow() >= H.s.qs', timeout=15000); await host.wait_for_timeout(700)
        async def lobby():
            if (await host.evaluate('H.s.ph')) != 'lobby': await host.click('#setBtn'); await host.wait_for_timeout(500)
        async def end():
            if (await host.evaluate('H.s.ph')) in ('q', 'judge'):
                if await host.locator('[data-h=close]').count(): await host.click('[data-h=close]')
                await host.wait_for_function('H.s.ph === "r"', timeout=20000)
            await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000)

        await shot(host, '01_host_lobby_solo_phone', True)
        await opt('t', '30'); await host.click('[data-h=start]'); await live()
        await shot(A, '02_phone_choice'); await shot(host, '03_host_choice_phone', True)
        await A.click('[data-ak="0"]'); await host.click('[data-h=close]'); await host.wait_for_function('H.s.ph === "r"'); await host.wait_for_timeout(700)
        await shot(B, '04_phone_result_360', True); await shot(host, '05_host_result_phone', True)
        await end(); await lobby()
        await opt('m', 's'); await opt('sinp', 't'); await host.click('[data-h=start]'); await live(); it = await ITEM(host)
        await A.fill('#akIn', it['a']); await A.click('[data-act=aksend]'); await host.wait_for_function('H.s.ph === "r"', timeout=8000); await host.wait_for_timeout(700)
        await shot(B, '06_phone_grab_lost_360', True)
        await end(); await lobby()
        await opt('sys', 'team'); await host.wait_for_timeout(300); await shot(host, '07_host_lobby_teams_phone', True); await shot(C, '08_phone_lobby_team')
        await opt('m', 'tt'); await opt('tinp', 't'); await host.click('[data-h=start]'); await host.wait_for_timeout(1200)
        s = await S(host); on = {'صالح': A, 'تافير': B, 'نورة': C, 'فهد': D}
        await shot(A, '09_phone_tt_countdown'); await live()
        who = s['tt']['n']; others = [p for n, p in on.items() if n != who]
        await shot(on[who], '10_phone_tt_on_turn'); await shot(others[0], '11_phone_tt_waiting'); await shot(host, '12_host_tt_phone', True)
        await on[who].fill('#akIn', 'خطأ'); await on[who].click('[data-act=aksend]'); await host.wait_for_timeout(1500)
        if (await S(host))['ph'] == 'judge': await host.click('[data-h=jno]'); await host.wait_for_timeout(500)
        await host.wait_for_timeout(2500); s = await S(host)
        await shot(on[s['tt']['n']], '13_phone_steal_on_turn'); await shot(host, '14_host_steal_phone', True)
        await end(); await lobby()
        await opt('m', 'mx'); await host.click('[data-set]') if await host.locator('[data-set]').count() else None
        await host.click('[data-h=set][data-k=gold]'); await host.click('[data-h=start]'); await live()
        await shot(A, '15_phone_mixed_q1'); await shot(host, '16_host_mixed_phone', True)
        await end(); await host.wait_for_timeout(800)
        await shot(host, '17_host_end_teams_phone', True); await shot(B, '18_phone_end_teams_360', True)
        await host.set_viewport_size({'width': 1280, 'height': 900}); await lobby(); await host.wait_for_timeout(400)
        await shot(host, '19_host_lobby_teams_desktop', True)
        print('errors:', E.errs)

asyncio.run(main())
