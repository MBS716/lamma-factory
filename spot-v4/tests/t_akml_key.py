"""أكملها: the host sees the right answer from the moment a question is shown, in every answer method; the players never
see it (screen or room data) before the question ends. A host and 3 players (phone 390, phone 360, computer)."""
import asyncio, json, sys, os
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
ITEM = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.priv.B.by[H.priv.qid]))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')
ROOM = 'JSON.stringify(NR.peers().map(p => p.presence))'          # everything a phone can read in the room
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots')
URL = os.environ.get('URL')

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    async with Env(8787) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        P3 = (A, B, C)
        code = await E.start(host, 'akml')
        names = ('صالح', 'تافير', 'نورة')
        for pg, n in zip(P3, names): await E.join(pg, code, n)
        await host.wait_for_timeout(1000)
        kA, kB, kC = [await key(host, n) for n in names]

        async def opt(k, v): await host.click(f'[data-opt={k}][data-val="{v}"]'); await host.wait_for_timeout(150)
        async def lobby():
            if (await host.evaluate('H.s.ph')) != 'lobby': await host.click('#setBtn'); await host.wait_for_timeout(500)
        async def live():
            await host.wait_for_function('H.s.ph === "q" && srvNow() >= H.s.qs', timeout=15000); await host.wait_for_timeout(600)
        async def reveal(t=20000): await host.wait_for_function('H.s.ph === "r"', timeout=t); await host.wait_for_timeout(600)
        async def typ(pg, x): await pg.wait_for_selector('#akIn', timeout=8000); await pg.fill('#akIn', x); await pg.click('[data-act=aksend]')
        async def end():
            if (await host.evaluate('H.s.ph')) in ('q', 'judge'):
                if await host.locator('[data-h=close]').count(): await host.click('[data-h=close]')
                await reveal()
            await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000)
        async def card():
            return await host.inner_text('.akkey') if await host.locator('.akkey').count() else ''
        async def hidden_from_players(it, label, choice=False, typed_it=()):
            """the answer is on no player's screen and nowhere in the room data"""
            room = await A.evaluate(ROOM); qd = await host.evaluate('JSON.stringify(H.s.qd)')
            rest = room.replace(qd, '')
            in_room = (it['a'] in rest) or (it['why'][:25] in room) or '"ci"' in room or '"why"' in room
            on_screen = []
            for pg in P3:
                t = await pg.inner_text('#playerMain')
                if await pg.locator('.akkey, .akkeyopt, .akkeyb').count() or 'للمقدّم فقط' in t or 'الإجابة الصحيحة' in t or it['why'][:25] in t: on_screen.append('card')
                if not choice and pg not in typed_it and it['a'] in t: on_screen.append('answer')     # a player who typed it sees his own answer
            check(not in_room and not on_screen, f'{label}: the answer is on no phone and not in the room data' + ('' if not in_room and not on_screen else f' room={in_room} screen={on_screen}'))

        # ================= choose from four =================
        await opt('m', 'c'); await opt('t', '30')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q" && H.priv.qid', timeout=15000); await host.wait_for_timeout(300)
        it = await ITEM(host); k = await card()
        check(it['a'] in k and 'للمقدّم فقط' in k, 'choice: the answer card is on the host\'s screen already during the countdown')
        await live(); it = await ITEM(host); s = await S(host); ci = await host.evaluate('H.priv.ci')
        k = await card()
        check(it['a'] in k and 'العبارة الكاملة' in k and 'الخيار الصحيح' in k and (not it['why'] or 'المعنى' in k), 'choice: the card shows the answer, the right option, the full phrase and the meaning')
        mark = await host.locator('.akcard .opt.akkeyopt').all_inner_texts()
        check(len(mark) == 1 and s['qd']['o'][ci] in mark[0] and '✓ الصحيح' in mark[0], 'choice: the right option is marked on the host\'s screen')
        for pg in P3: await pg.wait_for_selector('[data-ak]', timeout=8000)
        cls = [await pg.evaluate('[...document.querySelectorAll("[data-ak]")].map(b => b.className + b.innerText).join("|")') for pg in P3]
        check(all('akkey' not in c and 'right' not in c and 'الصحيح' not in c for c in cls), 'choice: the players\' options carry no mark of the right one')
        await hidden_from_players(it, 'choice', True)
        await host.screenshot(path=SHOTS + '/key_choice_host.png')
        await A.screenshot(path=SHOTS + '/key_choice_390.png')
        await host.reload(); await host.wait_for_function('typeof H !== "undefined" && H && H.code && H.s.ph === "q"', timeout=20000)
        await host.wait_for_selector('.akkey .akkey-a', timeout=10000); k = await card()
        check(it['a'] in k and await host.locator('.opt.akkeyopt').count() == 1, 'host reload: the answer card and the marked option come back')
        await host.click(f'[data-h=akhide]'); await host.wait_for_timeout(300)
        check(it['a'] not in await card() and await host.locator('.opt.akkeyopt').count() == 0, 'the host can hide the answer from his screen (when it is shown to the players)')
        await host.click(f'[data-h=akhide]'); await host.wait_for_timeout(300)
        check(it['a'] in await card(), '… and show it again')
        await A.click(f'[data-ak="{ci}"]'); await host.click('[data-h=close]'); await reveal()
        check(it['a'] in await A.inner_text('#playerMain'), 'choice: after the question ends the players see the answer')
        await end()

        # ================= typed (everybody answers) =================
        await lobby(); await opt('m', 't'); await host.click('[data-h=start]'); await live()
        it = await ITEM(host); ans = it['a']; k = await card()
        check(ans in k and (not it['alt'] or it['alt'][0] in k) and 'العبارة الكاملة' in k, 'typed: the card shows the answer, the accepted alternatives and the full phrase from the start')
        alv = ans[2:] if ans.startswith('ال') else 'ال' + ans
        v_al = await host.evaluate(f'akCheck(H.priv.B.by[H.priv.qid], {json.dumps(alv)})')
        odd = 'كلمة بمعناها'
        await typ(A, ans); await A.wait_for_timeout(300); await typ(B, odd); await B.wait_for_timeout(300)
        if v_al == '?': await typ(C, alv)
        await host.wait_for_timeout(1500)
        lst = await host.inner_text('.akans')
        check('صالح' in lst and '«' + ans + '»' in lst and 'مطابقة' in lst, 'typed: each player\'s answer appears on the host\'s screen when it arrives, with the device\'s check')
        check('تافير' in lst and 'غير مطابقة' in lst and await host.locator('[data-h=jover]').count() == 1, 'typed: a non-matching answer is shown with «اعتمدها» for the host')
        if v_al == '?': check('تحتاج حكمك' in lst and await host.locator('[data-h=jok]').count() == 1, f'typed: «{alv}» (differs by «ال») waits for the host\'s judgement')
        await hidden_from_players(it, 'typed, while the host reviews', typed_it=(A,))
        await host.screenshot(path=SHOTS + '/key_typed_host.png')
        await host.click('[data-h=jover]'); await host.wait_for_timeout(500)
        x = await host.evaluate(f'akNorm({json.dumps(odd)})')
        check(await host.evaluate(f'H.priv.dec[{json.dumps(x)}]') == 'ok' and 'قبلها المقدّم' in await host.inner_text('.akans') and await host.locator('[data-h=jover]').count() == 0, 'typed: the host accepts it (right in meaning); the button is gone')
        await host.evaluate(f'Akml.decide({json.dumps(x)}, false); Akml.accept({json.dumps(x)})'); await host.wait_for_timeout(300)
        check(await host.evaluate(f'H.priv.dec[{json.dumps(x)}]') == 'ok', 'a decision once given cannot be changed (a second decision is ignored)')
        if v_al == '?': await host.click('[data-h=jno]'); await host.wait_for_timeout(300)
        else: await typ(C, it['o'][1])
        await reveal(); s = await S(host)
        check(s['res'][kB][1] == 1 and s['res'][kB][0] >= 100 and s['res'][kA][1] == 1 and s['res'][kC][1] == 0, 'typed: points: the accepted answer counts once, the refused one 0')
        tot = s['res'][kB][2]
        await host.evaluate(f'Akml.accept({json.dumps(x)}); Akml.reveal()'); await host.wait_for_timeout(400)
        check((await S(host))['res'][kB][2] == tot, 'after the result nothing can be counted twice')
        await end()

        # ================= fastest finger, aloud =================
        await lobby(); await opt('m', 'b'); await opt('binp', 'o'); await host.click('[data-h=start]'); await live()
        it = await ITEM(host)
        check(it['a'] in await card(), 'aloud: the answer card is there from the start, before anybody presses')
        await A.click('[data-act=akbz]'); await A.wait_for_timeout(400); await B.click('[data-act=akbz]'); await B.wait_for_timeout(400); await C.click('[data-act=akbz]')
        await host.wait_for_timeout(1200)
        k = await card(); turn = await host.inner_text('.akturn')
        check(it['a'] in k and 'صالح' in turn and await host.locator('[data-h=bok]').count() == 1, 'aloud: the player on turn (صالح), the model answer and the judge buttons together on the host\'s screen')
        await hidden_from_players(it, 'aloud, صالح on turn')
        await host.screenshot(path=SHOTS + '/key_oral_host.png')
        await host.set_viewport_size({'width': 390, 'height': 844}); await host.wait_for_timeout(500)
        await host.locator('.akkey').scroll_into_view_if_needed()
        kb = await host.locator('.akkey').bounding_box(); bb = await host.locator('[data-h=bok]').bounding_box()
        check(kb and bb and 0 <= bb['y'] - (kb['y'] + kb['height']) < 260, f'host on a phone (390): the card sits just above the judge buttons ({int(bb["y"] - kb["y"] - kb["height"]) if kb and bb else "?"} px)')
        await host.screenshot(path=SHOTS + '/key_oral_host_390.png')
        await host.set_viewport_size({'width': 1280, 'height': 900}); await host.wait_for_timeout(300)
        await host.click('[data-h=bno]'); await host.wait_for_timeout(900); s = await S(host)
        check(s['bz']['q'][s['bz']['cur']][0] == kB and s['ph'] == 'q', 'aloud: صالح wrong: the turn passes to تافير')
        check('لم تكن صحيحة' in await A.inner_text('#playerMain'), 'صالح\'s phone: «not right», nothing more')
        await hidden_from_players(it, 'aloud, after the turn passed')
        check(it['a'] in await card() and 'تافير' in await host.inner_text('.akturn'), 'aloud: the card stays for the next player\'s turn')
        await host.click('[data-h=bok]'); await reveal(); s = await S(host)
        check(s['res'][kB][:2] == [100, 1] and s['res'][kA][:2] == [0, 0], 'aloud: the host\'s judgement counts: تافير 100, صالح 0')
        check(it['a'] in await B.inner_text('#playerMain'), 'aloud: the players see the answer only now, after the question')
        await end()

        # ================= fastest finger, typed: an unknown answer goes to the host before the turn passes =================
        await lobby(); await opt('binp', 't'); await host.click('[data-h=start]'); await live(); it = await ITEM(host)
        await C.click('[data-act=akbz]'); await C.wait_for_timeout(400); await A.click('[data-act=akbz]'); await host.wait_for_timeout(1000)
        await typ(C, 'جواب آخر'); await host.wait_for_function('H.s.ph === "judge"', timeout=8000); await host.wait_for_timeout(400)
        k = await card(); hm = await host.inner_text('#hostMain')
        check(it['a'] in k and 'نورة' in hm and '«جواب آخر»' in hm and await host.locator('[data-h=jok]').count() == 1, 'typed turn: an answer that matches nothing known goes to the host, with the model answer beside it')
        await hidden_from_players(it, 'typed turn, while the host judges')
        await host.screenshot(path=SHOTS + '/key_turn_typed_host.png')
        await host.click('[data-h=jno]'); await host.wait_for_timeout(900); s = await S(host)
        check(s['ph'] == 'q' and s['bz']['q'][s['bz']['cur']][0] == kA, 'refused: the turn passes to صالح')
        await hidden_from_players(it, 'typed turn, after the turn passed')
        await typ(A, it['a']); await reveal(8000)
        await end()

        # ================= grab the chance, team challenge with stealing, mixed =================
        await lobby(); await opt('m', 's'); await opt('sinp', 'c'); await host.click('[data-h=start]'); await live(); it = await ITEM(host)
        check(it['a'] in await card() and await host.locator('.opt.akkeyopt').count() == 1, 'grab the chance: card and marked option on the host')
        await hidden_from_players(it, 'grab the chance', True)
        await end()
        await lobby(); await opt('sys', 'team'); await host.wait_for_timeout(300); await opt('m', 'tt'); await opt('tinp', 'o')
        await host.click('[data-h=start]'); await live(); it = await ITEM(host)
        check(it['a'] in await card() and await host.locator('[data-h=bok]').count() == 1, 'team challenge (aloud): card and judge buttons for the member on turn')
        await hidden_from_players(it, 'team challenge')
        await host.screenshot(path=SHOTS + '/key_teams_host.png')
        if (await S(host))['o']['steal']:
            await host.click('[data-h=bno]'); await host.wait_for_function('H.s.tt && H.s.tt.steal === 1', timeout=6000); await live()
            check(it['a'] in await card(), 'stealing: the card stays for the other team\'s chance')
            await hidden_from_players(it, 'stealing')
        await end()
        await lobby(); await opt('m', 'mx'); await host.click('[data-h=start]'); await live(); it = await ITEM(host)
        check(it['a'] in await card(), f'mixed ({(await S(host))["q"]["m"]}): the card is there')
        await hidden_from_players(it, 'mixed', (await S(host))['q']['inp'] == 'c')
        await end()
        check(not E.errs, 'no page errors' + ('' if not E.errs else ': ' + '; '.join(E.errs[:3])))
    bad = [m for ok, m in R if not ok]
    if os.environ.get('OUT'):
        json.dump({'checks': len(R), 'passed': len(R) - len(bad), 'failed': bad, 'all': [('OK ' if ok else 'FAIL ') + m for ok, m in R], 'PASS': not bad}, open(os.environ['OUT'] + '/result.json', 'w'), ensure_ascii=False, indent=1)
    print(f'\n{len(R) - len(bad)}/{len(R)} passed'); sys.exit(1 if bad else 0)

asyncio.run(main())
