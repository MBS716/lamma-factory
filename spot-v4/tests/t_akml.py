"""أكملها v2: a host and 4 players (phone 390, phone 360, computer, phone 390): the competitions (solo, two teams), the
seven answer methods, the answer locks, typed answers, special rounds, the tie and the results.
Real pages and real taps; the test reads the host's private data only to know which answer is right."""
import asyncio, json, sys, os
from common import Env
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
ITEM = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.priv.B.by[H.priv.qid]))')
key = lambda pg, n: pg.evaluate(f'dfKey({json.dumps(n)})')
ROOM = 'JSON.stringify(NR.peers().map(p => p.presence))'          # everything a phone can read in the room
SHOTS = '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots'
TXT = lambda pg: pg.inner_text('#playerMain')

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    raw = open(os.environ.get('DIST', '/home/claude/lamma/dist') + '/data/akml.json', encoding='utf-8').read()
    check('الضيق' not in raw and 'براقش' not in raw and 'يشويه' not in raw, 'the public bank file has no readable phrase or answer (scrambled, not protected)')
    async with Env(8786) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860); D = await E.page('D', 390, 844)
        code = await E.start(host, 'akml')
        names = ('صالح', 'تافير', 'نورة', 'فهد')
        for pg, n in zip((A, B, C, D), names): await E.join(pg, code, n)
        await host.wait_for_timeout(1000)
        kA, kB, kC, kD = [await key(host, n) for n in names]

        async def opt(k, v): await host.click(f'[data-opt={k}][data-val="{v}"]'); await host.wait_for_timeout(120)
        async def tog(k, on, v=None):
            cur = await host.evaluate(f'(H.s.o[{json.dumps(k)}] || 0)') if v is None else await host.evaluate(f'H.s.o[{json.dumps(k)}].includes({json.dumps(v)})')
            if bool(cur) != bool(on): await host.click(f'[data-h=set][data-k={k}]' + (f'[data-v="{v}"]' if v else '')); await host.wait_for_timeout(120)
        async def lobby():
            if (await host.evaluate('H.s.ph')) != 'lobby': await host.click('#setBtn'); await host.wait_for_timeout(500)
        async def live():
            await host.wait_for_function('H.s.ph === "q" && srvNow() >= H.s.qs', timeout=15000); await host.wait_for_timeout(500)
        async def begin(): await host.click('[data-h=start]'); await live()
        async def reveal(t=20000):
            await host.wait_for_function('H.s.ph === "r"', timeout=t); await host.wait_for_timeout(600)
        async def nxt(): await host.click('[data-h=next]'); await live()
        async def typ(pg, x):
            await pg.wait_for_selector('#akIn', timeout=8000); await pg.fill('#akIn', x); await pg.click('[data-act=aksend]')
        async def choose(pg, i): await pg.wait_for_selector(f'[data-ak="{i}"]', timeout=8000); await pg.click(f'[data-ak="{i}"]')
        async def end():
            if (await host.evaluate('H.s.ph')) == 'q': await host.click('[data-h=close]'); await reveal()
            await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000)
        async def has(pg, sel): return await pg.locator(sel).count() > 0
        async def sees(pg, text, t=8000):
            try: await pg.wait_for_function(f'document.querySelector("#playerMain").innerText.includes({json.dumps(text)})', timeout=t); return True
            except Exception: return False

        # ================= the settings: only what fits =================
        lb = await host.inner_text('#hostMain')
        check('تحدي الفرق' not in lb and 'سرقة الإجابة' not in lb, 'solo: «تحدي الفرق» and «سرقة الإجابة» are not offered')
        check(all(x in lb for x in ('المنافسة', 'طريقة الإجابة', 'الأسئلة', 'الوقت والانتقال', 'جولات خاصة', 'التعادل')), 'the settings in sections: competition, method, questions, time, special rounds, tie')
        check(await has(host, '[data-opt=lock][data-val=first]'), 'choose from four: the lock (everybody / first right answer) can be chosen')
        await opt('m', 'b'); lb = await host.inner_text('#hostMain')
        check(not await has(host, '[data-opt=lock]') and 'صاحب الدور فقط' in lb and await has(host, '[data-opt=binp]'), 'fastest finger: the lock is fixed to «صاحب الدور فقط»; typed or aloud can be chosen')
        await opt('m', 's'); check(not await has(host, '[data-opt=lock]') and await has(host, '[data-opt=sinp]'), 'grab the chance: the lock is fixed to «أول إجابة صحيحة»')
        await opt('m', 'mx'); mixb = await host.locator('[data-h=set][data-k=mix]').all_inner_texts()
        check(len(mixb) == 4 and not any('تحدي الفرق' in x for x in mixb), 'solo mix: four methods to mix, not «تحدي الفرق»')
        await opt('m', 'c'); await opt('lock', 'first'); check(not await has(host, '[data-h=set][data-k=fast]'), 'the speed challenge is hidden when the first right answer closes the question')
        await opt('lock', 'all'); check(await has(host, '[data-h=set][data-k=fast]'), 'the speed challenge is offered when everybody answers')
        await host.screenshot(path=SHOTS + '/ak2_lobby_solo.png', full_page=True)

        # ================= solo · choose from four · everybody answers =================
        await opt('n', '10'); await opt('t', '10')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        await A.wait_for_selector('.akget', timeout=8000)
        check(await A.locator('[data-ak]').count() == 0, 'phone during the countdown: no options yet')
        await live(); it = await ITEM(host); s = await S(host); ids = [it['id']]
        ci = s['qd']['o'].index(it['o'][0]); wrong = (ci + 1) % 4
        room = await B.evaluate(ROOM)
        check('"ci"' not in room and '"rev":null' in room and it['why'][:20] not in room, 'before the time ends the room has no right option, no answer and no meaning')
        await choose(A, ci); await A.wait_for_timeout(300); await choose(B, wrong); await host.wait_for_timeout(1200)
        pa = json.loads(await C.evaluate(ROOM)); mineA = [p for p in pa if p and p.get('n') == 'صالح'][0]
        check('ak' in mineA and 'e' in mineA['ak'] and 'c' not in mineA['ak'], 'a choice is sealed in the room: other phones cannot read it')
        sp = (await S(host))['sp']
        await D.evaluate(f'NR.presence({{ak:{{i:{sp}, c:{ci}}}}})'); await host.wait_for_timeout(900)
        check(kD not in (await S(host))['got'], 'an unsealed answer written straight to the room by a phone is ignored')
        await B.evaluate('Akml.answer({c:0})'); await host.wait_for_timeout(700)
        check((await host.evaluate('H.priv.ans[%s].c' % json.dumps(kB))) == wrong, 'a second answer from the same phone is ignored (no repeated guessing)')
        await reveal(); s = await S(host)
        gA, gB = s['res'][kA], s['res'][kB]
        check(gA[1] == 1 and 100 < gA[0] <= 150 and gA[4] == gA[0] - 100 and gB[:2] == [0, 0] and s['res'][kC][:2] == [0, -1], f'scores: right {gA[0]} (100 + speed bonus {gA[4]}), wrong 0, no answer 0')
        hm = await host.inner_text('#hostMain')
        check('نتيجة السؤال' in hm and 'صالح' in hm, 'after each question: the question\'s result per player on the host\'s screen')
        check(await sees(A, 'المعنى') and 'إجابة صحيحة' in await TXT(A) and 'مكافأة' in await TXT(A), 'phone: verdict, points with the speed bonus, the meaning')
        await nxt(); it = await ITEM(host); ids.append(it['id']); s = await S(host); ci = s['qd']['o'].index(it['o'][0])
        for pg in (A, B, C, D): await pg.wait_for_selector(f'[data-ak="{ci}"]')
        await asyncio.gather(*(pg.click(f'[data-ak="{ci}"]') for pg in (A, B, C, D)))
        await reveal(); s = await S(host)
        check(all(s['res'][k][1] == 1 and s['res'][k][0] >= 100 for k in (kA, kB, kC, kD)), 'four answers at the same moment: all counted')
        tot = {k: s['res'][k][2] for k in (kA, kB, kC, kD)}
        await host.reload(); await host.wait_for_function('typeof H !== "undefined" && H && H.code && H.s.ph === "r"', timeout=20000); await host.wait_for_timeout(1500)
        s = await S(host); check({k: s['res'][k][2] for k in (kA, kB, kC, kD)} == tot, 'host reload: same totals (nothing counted twice)')
        await end(); s = await S(host); fin = s['fin']
        check(fin[0][6] == 100 and fin[0][7] == fin[0][4] + fin[0][5] + 100 and all(f[6] == 0 for f in fin[1:]), f'end: the winner {fin[0][0]} gets +100 apart; answer points + speed bonuses + win bonus = total')
        check([f[8] for f in fin] == sorted(f[8] for f in fin), 'final ranking with places')
        await A.wait_for_selector('.akhero', timeout=8000); tA = await TXT(A)
        check('ترتيبك' in tA and 'مكافآت السرعة' in tA and 'صحيحة' in tA and 'خاطئة' in tA, 'phones: own rank and the table: right, wrong, answer points, speed bonuses, win bonus, total')
        await host.screenshot(path=SHOTS + '/ak2_end_solo_host.png', full_page=True)

        # ================= solo · typed · everybody answers: «ال» is not removed =================
        await lobby(); await opt('m', 't'); await opt('t', '30'); await begin()
        it = await ITEM(host); ans = it['a']
        check(it['id'] not in ids, 'the next match does not repeat a question of the previous match')
        check(await A.locator('[data-ak]').count() == 0 and await A.locator('#akIn').count() == 1, 'typed: no options, one text field')
        alv = ans[2:] if ans.startswith('ال') else 'ال' + ans
        v_al = await host.evaluate(f'akCheck(H.priv.B.by[H.priv.qid], {json.dumps(alv)})')
        await typ(A, ' ' + ans + '  '); await A.wait_for_timeout(700)
        check('تم إرسال إجابتك' in await TXT(A) and await A.locator('#akIn').count() == 0, 'one try: the field is gone after sending')
        room = await B.evaluate(ROOM); qd = await host.evaluate('JSON.stringify(H.s.qd)')
        check(ans not in room.replace(qd, '') and '"x"' not in room, 'typed answers are sealed: the text is nowhere in the room')
        await typ(B, alv); await typ(C, it['o'][2]); await typ(D, ans)
        await host.wait_for_function('H.s.ph === "judge" || H.s.ph === "r"', timeout=40000); s = await S(host)
        if v_al == '?':
            check(s['ph'] == 'judge', f'«{alv}» (the answer «{ans}» with/without «ال») goes to the host, not accepted by itself')
            check(await sees(B, 'يراجع'), 'phones: «the host is reviewing a typed answer»')
            await host.screenshot(path=SHOTS + '/ak2_judge_host.png')
            await host.click('[data-h=jno]'); await reveal(); s = await S(host)
            check(s['res'][kB][:2] == [0, 0], 'the host refuses it: 0')
        else:
            await reveal(); s = await S(host); check(v_al == 'ok', f'«{alv}» is an approved alternative of «{ans}»')
        check(s['res'][kA][1] == 1 and s['res'][kD][1] == 1 and s['res'][kC][1] == 0, 'the answer (with extra spaces) right for two players; another option of the question wrong')
        cases = await host.evaluate('''() => { const by = H.priv.B.by, t = (id, x) => akCheck(by[id], x);
          return {hamza:t("AK031","الاكسجين"), alt:t("AK033","البعير"), digits:t("AK036","١٠٠"), word:t("AK036","مئة"), al:t("AK011","ضيق"), al2:t("AK011","الضيق"),
                  taa:t("AK055","الشجره"), near:t("AK038","افرصت"), opt:t("AK011","الفرح"), other:t("AK034","زحل"), similar:t("AK016","حسين"), num:t("AK037","365"), tash:t("AK011","الضِّيقِ")}; }''')
        check(all(cases[k] == 'ok' for k in ('hamza', 'alt', 'digits', 'word', 'al2', 'taa', 'tash')), f'accepted: missing hamza, approved alternative, Arabic-Indic digits, «مئة», ه for ة, diacritics {cases}')
        check(cases['al'] == '?', '«ضيق» for «الضيق»: «ال» is not removed, the host decides')
        check(all(cases[k] == 'no' for k in ('opt', 'other', 'similar', 'num')) and cases['near'] == '?', 'refused: another option, another planet, «حسين» (an option), 365; a slip in a long word goes to the host')
        await end()

        # ================= solo · grab the chance (first right answer ends the question for all) =================
        await lobby(); await opt('m', 's'); await opt('sinp', 't'); await begin()
        it = await ITEM(host); ans = it['a']; alv = ans[2:] if ans.startswith('ال') else 'ال' + ans
        if await host.evaluate(f'akCheck(H.priv.B.by[H.priv.qid], {json.dumps(alv)})') == '?':
            await typ(A, alv); await A.wait_for_timeout(500); await typ(B, ans)
            try: await host.wait_for_function('H.s.ph === "judge"', timeout=8000); j = True
            except Exception: j = False
            check(j, 'an answer the host must judge, sent before a right one, holds the question until the host decides')
            await host.click('[data-h=jok]'); await reveal(5000); s = await S(host)
            check(s['res'][kA][:2] == [150, 1] and s['res'][kB][0] == 0 and s['rev']['w'] == 'صالح', 'the host accepts it: صالح was first: 100 + 50; تافير right but later: 0')
        else:
            check(True, 'skipped: this question has no «ال» variant to judge'); await host.click('[data-h=close]'); await reveal()
        await nxt(); it = await ITEM(host); ans = it['a']
        await typ(A, it['o'][1]); await A.wait_for_timeout(400); t0 = await host.evaluate('Date.now()'); await typ(B, ans)
        await reveal(6000); s = await S(host); t1 = await host.evaluate('Date.now()')
        check(s['res'][kB][:2] == [150, 1] and s['res'][kA][:2] == [0, 0] and t1 - t0 < 5000, 'the first right answer ends the question at once for everybody (+50 for being first); a wrong answer before it: 0')
        check(await C.locator('#akIn').count() == 0, 'the other phones can no longer answer')
        await end()

        # ================= solo · choose · first right answer =================
        await lobby(); await opt('m', 'c'); await opt('lock', 'first'); await begin()
        s = await S(host); it = await ITEM(host); ci = s['qd']['o'].index(it['o'][0])
        await choose(A, (ci + 1) % 4); await A.wait_for_timeout(300); await choose(C, ci); await reveal(6000); s = await S(host)
        check(s['res'][kC][:2] == [150, 1] and s['res'][kA][:2] == [0, 0], 'choose + first right answer: the question closes on نورة\'s right choice (150)')
        await end(); await lobby(); await opt('lock', 'all')

        # ================= solo · fastest finger · typed (the field only for the player on turn) =================
        await opt('m', 'b'); await opt('binp', 't'); await begin()
        it = await ITEM(host); ans = it['a']
        for pg in (A, B, C): await pg.wait_for_selector('[data-act=akbz]', timeout=8000)
        await B.click('[data-act=akbz]'); await B.wait_for_timeout(250); await A.click('[data-act=akbz]'); await A.wait_for_timeout(250); await C.click('[data-act=akbz]')
        await host.wait_for_timeout(1200); s = await S(host); z = s['bz']
        check([q[0] for q in z['q']] == [kB, kA, kC] and z['cur'] == 0, 'presses in the order they reached the host: تافير, صالح, نورة')
        await B.wait_for_selector('#akIn', timeout=5000)
        check(await A.locator('#akIn').count() == 0 and await C.locator('#akIn').count() == 0, 'the text field opens only for the player on turn (تافير)')
        await host.screenshot(path=SHOTS + '/ak2_b_turn_host.png'); await B.screenshot(path=SHOTS + '/ak2_b_turn_360.png')
        await typ(B, it['o'][1]); await host.wait_for_timeout(1200); s = await S(host)
        check(s['bz']['cur'] == 1 and kB in s['bz']['bl'], 'تافير wrong: the turn passes to the next in order (صالح)')
        check(await sees(B, 'لا يمكنك') and await B.locator('[data-act=akbz]').count() == 0, 'تافير cannot press or answer again on this question')
        await typ(A, ans); await reveal(6000); s = await S(host)
        check(s['res'][kA][:2] == [100, 1] and s['res'][kB][:2] == [0, 0], 'صالح right on the second turn: 100 (no first-press bonus)')
        await end()

        # ================= tie: a deciding round between the tied only =================
        await lobby(); await opt('binp', 'o'); await opt('tie', 'round'); await begin()
        await A.click('[data-act=akbz]'); await host.wait_for_timeout(900); await host.click('[data-h=bok]'); await reveal()
        await nxt(); await B.click('[data-act=akbz]'); await host.wait_for_timeout(900); await host.click('[data-h=bok]'); await reveal()
        s = await S(host); check(s['res'][kA][2] == s['res'][kB][2] == 150, 'صالح and تافير tied with 150 each')
        await host.click('[data-h=final]'); await live(); s = await S(host)
        check(s['tb'] and s['q']['m'] == 'b' and s['ph'] == 'q', 'tie at the top: a deciding round starts (fastest finger)')
        check(await sees(C, 'للمتعادلين فقط') and await C.locator('[data-act=akbz]').count() == 0, 'a player not in the tie cannot press')
        await C.evaluate('NR.presence({ak:{i:findHost().presence.s.sp, bz:1}})'); await host.wait_for_timeout(800)
        check(not (await S(host))['bz']['q'], 'a press forced from a phone not in the tie is ignored by the host')
        await B.click('[data-act=akbz]'); await B.wait_for_selector('#akIn', timeout=6000); await typ(B, (await ITEM(host))['a']); await reveal(8000)
        await host.click('[data-h=next]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000); s = await S(host)
        check(s['fin'][0][0] == 'تافير' and s['fin'][0][6] == 100 and s['tbr']['w'] == 'تافير' and s['fin'][1][6] == 0, 'the deciding round decides: تافير wins (+100); the round adds no points')
        check('جولة فاصلة' in await host.inner_text('#hostMain'), 'the results say the tie was decided by a deciding round')
        await lobby(); await opt('tie', 'rules')

        # ================= two teams =================
        await opt('sys', 'team'); s = await S(host)
        check(set(s['tm'].values()) == {'g', 'o'} and len(s['tm']) == 4, 'teams: every player placed (the device balances newcomers)')
        lb = await host.inner_text('#hostMain')
        check('الفريق الأخضر' in lb and 'الفريق البرتقالي' in lb and 'تحدي الفرق' in lb and await has(host, '[data-h=tauto]'), 'teams: names, members, automatic distribution, and «تحدي الفرق» now offered')
        await host.click('[data-h=tauto]'); await host.wait_for_timeout(300); s = await S(host)
        check(sorted(list(s['tm'].values())) == ['g', 'g', 'o', 'o'], 'automatic distribution: 2 and 2')
        want = {kA: 'g', kB: 'g', kC: 'o', kD: 'o'}
        for k, t in want.items():
            if s['tm'][k] != t: await host.click(f'[data-h=tmove][data-k="{k}"]'); await host.wait_for_timeout(200)
        s = await S(host); check(s['tm'] == want, 'manual distribution by the host: صالح and تافير green, نورة and فهد orange')
        check(await sees(A, 'الفريق الأخضر') and await sees(C, 'الفريق البرتقالي'), 'phones show their own team')
        check(not await has(A, '[data-team]'), 'a player has no control to change team')
        await host.click(f'[data-h=tmove][data-k="{kC}"]'); await host.wait_for_timeout(200); await host.click(f'[data-h=tmove][data-k="{kD}"]'); await host.wait_for_timeout(300)
        check(await host.locator('[data-h=start]').is_disabled(), 'a team with no player: the match cannot start')
        await host.click(f'[data-h=tmove][data-k="{kC}"]'); await host.wait_for_timeout(200); await host.click(f'[data-h=tmove][data-k="{kD}"]'); await host.wait_for_timeout(300)
        await host.screenshot(path=SHOTS + '/ak2_lobby_teams.png', full_page=True)

        # ---- teams · choose · everybody answers: the team gets the average of its members ----
        await opt('m', 'c'); await begin(); s = await S(host); it = await ITEM(host); ci = s['qd']['o'].index(it['o'][0])
        await choose(A, ci); await choose(B, (ci + 1) % 4); await choose(C, ci); await choose(D, (ci + 2) % 4); await host.wait_for_timeout(600)
        await reveal(); s = await S(host)
        gA, gC = s['res'][kA][0], s['res'][kC][0]
        check(s['ph'] == 'r', 'the question closed when all four answered')
        check(s['tsg']['g'] == int(gA / 2 + .5) and s['tsg']['o'] == int(gC / 2 + .5), f'team points of the question: green {s["tsg"]["g"]} = (صالح {gA} + تافير 0) / 2; orange {s["tsg"]["o"]} = (نورة {gC} + فهد 0) / 2')
        check('الفريق الأخضر' in await host.inner_text('#hostMain'), 'the team totals on the host\'s screen after the question')
        await host.click('[data-h=teams]'); await host.wait_for_timeout(300); tsb = s['ts']
        await host.click(f'.akmove [data-h=tmove][data-k="{kB}"]'); await host.wait_for_timeout(400); s = await S(host)
        check(s['tm'][kB] == 'o' and s['ts'] == tsb, 'between questions the host moves تافير to orange; the points already won stay with their team')
        await host.click(f'.akmove [data-h=tmove][data-k="{kB}"]'); await host.wait_for_timeout(500)
        check((await S(host))['tm'][kB] == 'g', 'and back to green')
        # question 2: only green right, so a team wins
        await nxt(); s = await S(host); it = await ITEM(host); ci = s['qd']['o'].index(it['o'][0])
        await choose(A, ci); await choose(C, (ci + 1) % 4); await host.wait_for_timeout(600); await host.click('[data-h=close]'); await reveal()
        await end(); s = await S(host); tf = s['tf']
        check(len(tf) == 2 and all(len(x['m']) == 2 for x in tf) and tf[0]['w'] == 100 and tf[0]['tot'] >= tf[1]['tot'], 'end: both teams, their members\' contributions, +100 to the winning team ' + json.dumps(tf, ensure_ascii=False)[:300])
        check(all(abs(sum(m[4] for m in x['m']) - x['s']) <= 1 for x in tf), 'each member\'s contribution adds up to his team\'s points from the questions')
        await A.wait_for_selector('.aktf', timeout=8000); tA = await TXT(A)
        check('مساهمته' in tA and 'ترتيب اللاعبين' in tA, 'phones: the teams\' ranking with each member\'s contribution, then the players\' ranking')
        await host.screenshot(path=SHOTS + '/ak2_end_teams_host.png', full_page=True); await A.screenshot(path=SHOTS + '/ak2_end_teams_390.png', full_page=True)

        # ---- teams · team challenge (typed) with stealing ----
        await lobby(); s = await S(host)
        for k, t in want.items():
            if s['tm'][k] != t: await host.click(f'[data-h=tmove][data-k="{k}"]'); await host.wait_for_timeout(300)
        await opt('m', 'tt'); await opt('tinp', 't'); await tog('steal', 1); await opt('first', 'g'); await opt('ord', 'join')
        lb = await host.inner_text('#hostMain'); check('سرقة الإجابة' in lb and 'يبدأ' in lb and 'ترتيب الأعضاء' in lb, 'team challenge: stealing, the starting team and the members\' order can be chosen')
        await begin(); s = await S(host); it = await ITEM(host)
        check(s['tt']['t'] == 'g' and s['tt']['k'] == kA, 'question 1: the green team\'s turn; صالح answers' + ('' if s['tt']['k'] == kA else ' ' + json.dumps(s['tt'], ensure_ascii=False) + await host.evaluate('JSON.stringify([H.priv.rot, hostPlayers().map(p => [pname(p), p.presence.jt])])')))
        await A.wait_for_selector('#akIn', timeout=6000)
        check(await B.locator('#akIn').count() == 0 and await C.locator('#akIn').count() == 0, 'only صالح has the text field; his teammate and the other team wait')
        okB = await sees(B, 'دور فريقك'); okC = await sees(C, 'دور الفريق الآخر')
        check(okB and okC, 'phones: «your team\'s turn» / «the other team\'s turn»' + ('' if okB and okC else ' B: ' + (await TXT(B))[-120:] + ' C: ' + (await TXT(C))[-120:]))
        await typ(A, it['o'][1]); await host.wait_for_function('H.s.tt && H.s.tt.steal === 1', timeout=6000); await live(); s = await S(host)
        check(s['tt']['t'] == 'o' and s['tt']['k'] == kC and s['tt']['T'] < s['q']['T'], f'wrong: the chance passes to the orange team (نورة), with a shorter time {s["tt"]} {s["q"]}')
        await typ(C, it['a']); await reveal(6000); s = await S(host)
        check(s['res'][kC][:2] == [100, 1] and s['res'][kA][:2] == [0, 0] and s['tsg'] == {'g': 0, 'o': 100}, 'the steal succeeds: نورة 100, the orange team +100')
        await nxt(); s = await S(host)
        check(s['tt']['t'] == 'o' and s['tt']['k'] == kD, 'question 2: the teams alternate (orange), and the members take turns (فهد)')
        await typ(D, (await ITEM(host))['a']); await reveal(6000)
        await nxt(); s = await S(host); check(s['tt']['t'] == 'g' and s['tt']['k'] == kB, 'question 3: green again, its next member (تافير)')
        await typ(B, (await ITEM(host))['o'][2]); await host.wait_for_function('H.s.tt && H.s.tt.steal === 1', timeout=6000); await live(); s = await S(host)
        check(s['tt']['k'] == kC, 'the steal goes to the orange member whose turn is next')
        await typ(C, (await ITEM(host))['o'][3]); await reveal(8000); s = await S(host)
        check(s['tsg'] == {'g': 0, 'o': 0} and s['res'][kC][1] == 0, 'the steal fails too: the question closes, no points')
        plan_odd = await host.evaluate('akPlan({...H.s.o, m:"tt", n:15}, 15).length')
        check(plan_odd == 16, 'an odd number of questions in the team challenge gets one more so both teams have the same number of turns')
        await end()

        # ---- teams · fastest finger aloud with stealing ----
        await lobby(); await opt('m', 'b'); await opt('binp', 'o'); await begin()
        await A.click('[data-act=akbz]'); await A.wait_for_timeout(250); await B.click('[data-act=akbz]'); await B.wait_for_timeout(250); await C.click('[data-act=akbz]')
        await host.wait_for_timeout(1000); s = await S(host); tid = s['bz']['tid']
        check([q[0] for q in s['bz']['q']] == [kA, kB, kC] and s['bz']['cur'] == 0, 'presses: صالح, تافير (green), نورة (orange)')
        await host.click('[data-h=bgo]'); await host.wait_for_timeout(600); await host.click('[data-h=bno]'); await host.wait_for_timeout(700); s = await S(host)
        check(s['bz']['only'] == 'o' and s['bz']['q'][s['bz']['cur']][0] == kC, 'صالح wrong: the turn skips his teammate and goes to the orange team (نورة) ' + json.dumps([s['bz'], s['ph'], s['o']['steal'], s['tm']], ensure_ascii=False))
        await host.evaluate(f'Akml.act("bok", {{dataset:{{tid:"{tid}"}}}})'); await host.wait_for_timeout(400)
        check((await S(host))['ph'] == 'q', 'a click from the previous turn does nothing')
        await host.click('[data-h=bok]'); await reveal(); s = await S(host)
        check(s['res'][kC][:2] == [100, 1] and s['tsg'] == {'g': 0, 'o': 100}, 'نورة steals it: 100 for her and the orange team')
        await nxt(); await D.click('[data-act=akbz]'); await host.wait_for_timeout(900); await host.click('[data-h=bno]'); await host.wait_for_timeout(600)
        await A.click('[data-act=akbz]'); await host.wait_for_timeout(900); await host.click('[data-h=bno]'); await reveal(); s = await S(host)
        check(s['res'][kD][1] == 0 and s['res'][kA][1] == 0 and s['tsg'] == {'g': 0, 'o': 0}, 'one steal only: when it fails the question closes')
        check(await sees(B, 'انتهى السؤال') or await sees(B, 'لم تُجب'), 'the others see the question ended')
        await end()

        # ---- teams · mixed challenge ----
        await lobby(); await opt('m', 'mx')
        mixb = await host.locator('[data-h=set][data-k=mix]').all_inner_texts()
        check(len(mixb) == 5 and any('تحدي الفرق' in x for x in mixb), 'teams mix: five methods to mix, «تحدي الفرق» among them')
        for v, on in (('c', 1), ('t', 1), ('b', 0), ('s', 0), ('tt', 0)): await tog('mix', on, v)
        counts = await host.evaluate('(() => { const o = {...H.s.o, mix:["c","t","b","s","tt"]}, p = akPlan(o, 20), c = {}; p.forEach(x => c[x.m] = (c[x.m] || 0) + 1); return c; })()')
        check(sorted(counts.values()) == [4, 4, 4, 4, 4], f'a 20-question mix of five methods is balanced: {counts}')
        await begin(); s1 = (await S(host))['q']['m']; await host.click('[data-h=close]'); await reveal(); await nxt(); s2 = (await S(host))['q']['m']
        check({s1, s2} == {'c', 't'}, f'the method changes between questions: {s1} then {s2}')
        await A.wait_for_timeout(800)
        check((await A.locator('#akIn').count() == 1) == (s2 == 't'), 'the phones follow the method of each question')
        await end()

        # ================= special rounds =================
        await lobby(); await opt('sys', 'solo'); await opt('m', 'c'); await opt('lock', 'all')
        plan = await host.evaluate('akPlan({...H.s.o, gold:1, fin:1, surp:1, fast:1}, 20).map(p => [p.tag, p.mul, p.T, p.fx])')
        tags = [p[0] for p in plan]
        check(tags[-3:] == ['final'] * 3 and all(p[1] == 3 for p in plan[-3:]), 'the final round: the last 3 questions ×3')
        check(tags.count('gold') == 3 and all(p[1] == 2 for p in plan if p[0] == 'gold'), 'the golden round: 3 questions ×2')
        check(tags.count('surp') >= 1 and all(p[1] == 2 for p in plan if p[0] == 'surp'), 'surprise questions ×2 at places nobody knows')
        check(any(p[3] == 1 and p[2] == 6 for p in plan), 'the speed challenge: 6-second questions')
        await tog('gold', 1); await begin(); n_gold = None
        for i in range(1, 8):
            s = await S(host)
            if s['q']['tag'] == 'gold': n_gold = i; break
            await host.click('[data-h=close]'); await reveal(); await nxt()
        check(n_gold is not None and '×2' in await host.inner_text('#hostMain'), f'question {n_gold}: the golden round is announced on the host')
        s = await S(host); it = await ITEM(host); ci = s['qd']['o'].index(it['o'][0]); await choose(A, ci); await host.wait_for_timeout(600); await host.click('[data-h=close]'); await reveal(); s = await S(host)
        check(s['res'][kA][0] >= 200 and s['res'][kA][0] % 2 == 0, f'a right answer in the golden round counts double ({s["res"][kA][0]})')
        await end(); await lobby(); await tog('gold', 0)

        # ================= the other games =================
        await host.click('#endBtn'); await host.wait_for_timeout(600)
        for g in ('quiz', 'letters', 'wheel', 'puzzle', 'diff'):
            await host.click(f'.gact [data-game={g}]'); await host.wait_for_selector('.code', timeout=8000); ok = await host.is_visible('[data-h=start]') or await host.is_visible('.lobby')
            check(ok, f'{g}: opens with a room code as before'); await host.click('#endBtn'); await host.wait_for_timeout(500)
        check(not E.errs, 'no page errors' + ('' if not E.errs else ': ' + '; '.join(E.errs[:3])))
    bad = [m for ok, m in R if not ok]
    print(f'\n{len(R) - len(bad)}/{len(R)} passed'); sys.exit(1 if bad else 0)

asyncio.run(main())
