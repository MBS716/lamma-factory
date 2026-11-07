"""أكملها (complete the phrase) on a real site (preview or emulator build): a host and 3 players (phone 390, phone 360, computer) in the three modes.
Real pages and real taps; the test reads the host's private data only to know which answer is right."""
import asyncio, json, sys
import urllib.request, os
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'; OUT = sys.argv[2] if len(sys.argv) > 2 else 'reports/akml'
class Env:
    """every page is its own device: its own browser context (own storage, own anonymous sign-in)"""
    def __init__(self, port=None): self.errs = []; self.U = URL
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
ROOM = 'JSON.stringify(NR.peers().map(p => p.presence))'          # everything a phone can read in the room
SHOTS = OUT

async def main():
    import os; os.makedirs(SHOTS, exist_ok=True)
    raw = urllib.request.urlopen(URL + 'data/akml.json?nc=1', timeout=60).read().decode('utf-8')
    check('الضيق' not in raw and 'براقش' not in raw and 'يشويه' not in raw, 'the public bank file has no readable phrase or answer (scrambled, not protected)')
    async with Env(8786) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'akml', {'mode': 'c', 'n': 10, 't': 10})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(800)
        kA, kB, kC = [await key(host, n) for n in ('صالح', 'تافير', 'نورة')]
        async def live():
            await host.wait_for_function('H.s.ph === "q" && srvNow() >= H.s.qs', timeout=15000); await host.wait_for_timeout(500)
        async def choose(pg, i):
            await pg.wait_for_selector(f'[data-ak="{i}"]', timeout=8000); await pg.click(f'[data-ak="{i}"]')
        async def reveal():
            await host.wait_for_function('H.s.ph === "r"', timeout=20000); await host.wait_for_timeout(700)
        async def nxt():
            await host.click('[data-h=next]')
        ids = []

        # ================= mode 1: choose =================
        await host.click('[data-h=start]')
        await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        s = await S(host)
        check(s['qs'] - await host.evaluate('srvNow()') > 1500, 'the clock starts only after a short countdown (question already on every phone)')
        await A.wait_for_selector('.akget', timeout=8000)
        check(await A.locator('[data-ak]').count() == 0, 'phone during the countdown: no options yet')
        await live(); it = await ITEM(host); ids.append(it['id']); s = await S(host)
        ci = s['qd']['o'].index(it['o'][0]); wrong = (ci + 1) % 4
        room = await B.evaluate(ROOM)
        check('"ci"' not in room and '"rev":null' in room and it['why'][:20] not in room, 'before the reveal the room has no right option, no answer and no meaning')
        await choose(A, ci); await A.wait_for_timeout(300); await choose(B, wrong); await host.wait_for_timeout(1200)
        room = await C.evaluate(ROOM); pa = json.loads(room)
        mineA = [p for p in pa if p and p.get('n') == 'صالح'][0]
        check('ak' in mineA and 'e' in mineA['ak'] and 'c' not in mineA['ak'], 'a phone\'s choice is sealed in the room: other phones cannot read it')
        s = await S(host)
        check(s['cnt'] == 2 and s['ph'] == 'q', 'the host sees 2 answers, the question waits for the third')
        tB = await B.inner_text('#playerMain'); check('تم تسجيل إجابتك' in tB and await B.locator('[data-ak]').count() == 0, 'phone 360: answer recorded, options gone (no second answer)')
        await B.evaluate('Akml.answer({c:0})'); await host.wait_for_timeout(800)
        check((await host.evaluate('H.priv.ans[%s].c' % json.dumps(kB))) == wrong, 'a second answer from the same phone is ignored')
        await reveal(); s = await S(host)
        gA, gB, gC = s['res'][kA], s['res'][kB], s['res'].get(kC)
        check(gA[1] == 1 and 100 < gA[0] <= 150 and gB[:2] == [0, 0] and gC and gC[1] == -1 and gC[0] == 0, f'scores: right {gA[0]} (100 + speed), wrong 0, no answer 0')
        check(s['rev']['a'] == it['a'] and s['rev']['ci'] == ci and s['rev']['why'] == it['why'], 'after the time: the right option, the full phrase and its meaning')
        tA = await A.inner_text('#playerMain'); tB = await B.inner_text('#playerMain')
        check('إجابة صحيحة' in tA and 'إجابة خاطئة' in tB and 'المعنى' in tA, 'phones: verdict, points and the meaning')
        await A.screenshot(path=SHOTS + '/ak_c_reveal_390.png'); await host.screenshot(path=SHOTS + '/ak_c_reveal_host.png')

        # question 2: all three at the same moment, then the host reloads; nothing counted twice
        await nxt(); await live(); it = await ITEM(host); ids.append(it['id']); s = await S(host); ci = s['qd']['o'].index(it['o'][0])
        for pg in (A, B, C): await pg.wait_for_selector(f'[data-ak="{ci}"]')
        await asyncio.gather(*(pg.click(f'[data-ak="{ci}"]') for pg in (A, B, C)))
        await reveal(); s = await S(host)
        check(all(s['res'][k][1] == 1 and s['res'][k][0] >= 100 for k in (kA, kB, kC)), 'three answers at the same moment: all counted, each 100 + speed')
        tot = {k: s['res'][k][2] for k in (kA, kB, kC)}
        await host.reload(); await host.wait_for_function('typeof H !== "undefined" && H && H.code && H.s.ph === "r"', timeout=20000); await host.wait_for_timeout(1500)
        s = await S(host)
        check({k: s['res'][k][2] for k in (kA, kB, kC)} == tot, 'host reload after the reveal: same totals (nothing counted twice)')

        # question 3: a phone reloads after answering; the answer stays; then it reloads before answering and still answers
        await nxt(); await live(); it = await ITEM(host); ids.append(it['id']); s = await S(host); ci = s['qd']['o'].index(it['o'][0])
        await choose(A, ci); await A.wait_for_timeout(400); await A.reload(); await A.wait_for_timeout(2500)
        tA = await A.inner_text('#playerMain'); check('تم تسجيل إجابتك' in tA, 'phone reloads after answering: its answer is still recorded')
        await B.reload(); await B.wait_for_selector(f'[data-ak="{ci}"]', timeout=10000); await choose(B, ci)
        await host.wait_for_timeout(800); s = await S(host); check(kB in s['got'] and kA in s['got'], 'phone reloads before answering: back on the question and answers')
        await host.click('[data-h=close]'); await reveal(); s = await S(host)
        check(s['res'][kA][1] == 1 and s['res'][kB][1] == 1 and s['res'][kC][1] == -1, 'host ends the time early: answers so far count, the rest get 0')

        # question 4: time runs out with no answer
        await nxt(); await live(); ids.append((await ITEM(host))['id'])
        await host.wait_for_function('H.s.ph === "r"', timeout=16000); s = await S(host)
        check(all(s['res'][k][:2] == [0, -1] for k in (kA, kB, kC)), 'time out with no answer: 0 for everybody')
        tC = await C.inner_text('#playerMain'); check('لم تُجب' in tC, 'computer: «لم تُجب»')
        # end the match: ranking and the winner's bonus apart
        before = {k: s['res'][k][2] for k in (kA, kB, kC)}
        await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000); s = await S(host)
        fin = s['fin']; top = fin[0]
        check(top[2] == 100 and top[3] == top[1] + 100 and all(f[2] == 0 for f in fin if f[1] < top[1]), f'end: the winner gets +100 shown apart ({top[0]}: {top[1]} + 100 = {top[3]})')
        check([f[3] for f in fin] == sorted([f[3] for f in fin], reverse=True) and fin[0][5] == 1, 'final ranking in order of totals')
        check(sorted(f[1] for f in fin) == sorted(before.values()), 'question points in the table match the points of the questions')
        await A.wait_for_selector('.akhero', timeout=8000); tA = await A.inner_text('#playerMain')
        check('ترتيبك' in tA and 'مكافأة الفوز' in tA, 'phones: own rank and the table with the bonus column')
        await A.screenshot(path=SHOTS + '/ak_end_390.png', full_page=True); await host.screenshot(path=SHOTS + '/ak_end_host.png', full_page=True)
        check(len(set(ids)) == len(ids), 'no question repeated in the match')
        last = set(ids)

        # ================= mode 2: type =================
        await host.click('#setBtn'); await host.wait_for_timeout(400)
        await host.click('[data-opt=mode][data-val="t"]'); await host.click('[data-opt=t][data-val="30"]'); await host.click('[data-h=start]')
        await live(); it = await ITEM(host); s = await S(host)
        check(it['id'] not in last, 'the next match does not start with a question of the previous match')
        check(await A.locator('[data-ak]').count() == 0 and await A.locator('#akIn').count() == 1, 'typing mode: no options, one text field')
        ans = it['a']
        # A: the answer with diacritics and extra spaces; B: one letter off (the host decides); C: another option (wrong)
        import random
        a_typed = '  ' + 'ـ'.join(ans) if len(ans) < 3 else ' ' + ans[0] + 'ً' + ans[1:] + '  '
        core = ans[2:] if ans.startswith('ال') and len(ans) > 3 else ans
        near = ans[:-1] + ('ب' if ans[-1] != 'ب' else 'ت') if len(core.replace(' ', '')) >= 4 else None     # one letter off is sent to the host only for answers of 4 letters or more
        await A.fill('#akIn', a_typed); await A.click('[data-act=aksend]')
        await A.wait_for_timeout(700); tA = await A.inner_text('#playerMain'); check('تم إرسال إجابتك' in tA and await A.locator('#akIn').count() == 0, 'phone: one try, the field is gone after sending')
        room = await B.evaluate(ROOM); qd = await host.evaluate('JSON.stringify(H.s.qd)')
        check(ans not in room.replace(qd, '') and '"x"' not in room, 'typed answers are sealed: the answer text is nowhere in the room')
        if near: await B.fill('#akIn', near); await B.press('#akIn', 'Enter')
        await C.fill('#akIn', it['o'][2]); await C.click('[data-act=aksend]')
        await host.wait_for_timeout(1200)
        if not near: await B.fill('#akIn', ans); await B.click('[data-act=aksend]')
        await host.wait_for_function('H.s.ph === "judge" || H.s.ph === "r"', timeout=40000); s = await S(host)
        if near:
            check(s['ph'] == 'judge', f'«{near}» (one letter off «{ans}») goes to the host, not accepted by itself')
            try: await B.wait_for_function('document.querySelector("#playerMain").innerText.includes("يراجع")', timeout=8000); okr = True
            except Exception: okr = False
            check(okr, 'phones: «the host is reviewing some answers»')
            await host.screenshot(path=SHOTS + '/ak_t_judge_host.png')
            await host.click('[data-h=jok]'); await reveal(); s = await S(host)
            check(s['res'][kB][1] == 1 and s['res'][kB][0] >= 100, 'the host accepts it: points for it')
        else: await reveal(); s = await S(host)
        check(s['res'][kA][1] == 1, f'diacritics, tatweel and spaces ignored: «{a_typed.strip()}» accepted for «{ans}»')
        check(s['res'][kC][1] == 0, f'another option of the question («{it["o"][2]}») is wrong')
        # direct checks of the comparison on known items
        cases = await host.evaluate('''() => { const by = H.priv.B.by, t = (id, x) => akCheck(by[id], x);
          return {hamza:t("AK031","الاكسجين"), alt:t("AK033","البعير"), digits:t("AK036","١٠٠"), word:t("AK036","مئة"), al:t("AK011","ضيق"),
                  taa:t("AK055","الشجره"), near:t("AK038","افرصت"), opt:t("AK011","الفرح"), other:t("AK034","زحل"), similar:t("AK016","حسين"), num:t("AK037","365")}; }''')
        check(cases['hamza'] == 'ok' and cases['alt'] == 'ok' and cases['digits'] == 'ok' and cases['word'] == 'ok' and cases['al'] == 'ok' and cases['taa'] == 'ok',
              'accepted: missing hamza, approved alternative (البعير), Arabic-Indic digits, «مئة», answer without «ال», ه for ة')
        check(cases['opt'] == 'no' and cases['other'] == 'no' and cases['similar'] == 'no' and cases['num'] == 'no', 'refused: another option, a different planet, «حسين» for «حنين» (an option), 365 for 366')
        check(cases['near'] == '?', 'a two-letter slip in a long word goes to the host')
        await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000)

        # ================= mode 3: buzz =================
        await host.click('#setBtn'); await host.wait_for_timeout(400)
        await host.click('[data-opt=mode][data-val="b"]'); await host.click('[data-opt=t][data-val="30"]'); await host.click('[data-h=start]')
        await live(); s = await S(host)
        for pg in (A, B, C): await pg.wait_for_selector('[data-act=akbz]', timeout=8000)
        await B.click('[data-act=akbz]'); await B.wait_for_timeout(250); await A.click('[data-act=akbz]'); await A.wait_for_timeout(250); await C.click('[data-act=akbz]')
        await host.wait_for_timeout(1200); s = await S(host); z = s['bz']
        check([q[0] for q in z['q']] == [kB, kA, kC] and z['cur'] == 0, 'presses in the order they reached the host: تافير, صالح, نورة; the turn goes to تافير')
        check(s['rev'] is None and 'ans' not in json.dumps(s), 'buzz mode: no answer in the room while the question runs')
        tB = await B.inner_text('#playerMain'); tA = await A.inner_text('#playerMain')
        check('دورك' in tB and 'طلبت الإجابة' in tA and 'تافير' in tA, 'phones: «your turn» for تافير, the order shown to the others')
        await host.screenshot(path=SHOTS + '/ak_b_turn_host.png'); await B.screenshot(path=SHOTS + '/ak_b_turn_360.png')
        q0 = await host.evaluate('akLeft(H.s)'); await host.wait_for_timeout(1500); q1 = await host.evaluate('akLeft(H.s)')
        check(abs(q0 - q1) < 60, 'the question clock stops while a player answers')
        await host.click('[data-h=bgo]'); await host.wait_for_timeout(1300); s = await S(host)
        check(s['bz']['ta'] > 0 and await host.evaluate('akTurnLeft(H.s.bz)') < 9500, 'the host starts the 10 s answer time')
        tid = s['bz']['tid']
        await host.click('[data-h=bno]'); await host.wait_for_timeout(700); s = await S(host)
        check(s['bz']['cur'] == 1 and kB in s['bz']['bl'], 'wrong: the turn passes to صالح, تافير is out of this question')
        await B.wait_for_timeout(600); check(await B.locator('[data-act=akbz]').count() == 0 and 'لا يمكنك' in await B.inner_text('#playerMain'), 'تافير cannot press again on this question')
        await host.evaluate(f'Akml.act("bok", {{dataset:{{tid:"{tid}"}}}})'); await host.wait_for_timeout(500); s = await S(host)
        check(s['ph'] == 'q' and s['bz']['cur'] == 1, 'a click from the previous turn does nothing (no double judging)')
        await host.click('[data-h=bok]'); await reveal(); s = await S(host)
        check(s['res'][kA][:2] == [100, 1] and s['res'][kB][:2] == [0, 0], 'right on the second turn: 100 (no first-press bonus); the wrong one 0')
        await host.click('[data-h=bok]') if await host.locator('[data-h=bok]').count() else None
        s2 = await S(host); check(s2['res'] == s['res'], 'no second scoring after the reveal')
        # next question: the first to press answers right: 150; then skip and end
        await nxt(); await live()
        await C.click('[data-act=akbz]'); await host.wait_for_timeout(900)
        await host.click('[data-h=bok]'); await reveal(); s = await S(host)
        check(s['res'][kC][:2] == [150, 1], 'the first to press answers right: 100 + 50')
        await nxt(); await live(); s = await S(host); n_i, sp = s['i'], s['sp']; old = await ITEM(host)
        await host.click('[data-h=skip]'); await host.wait_for_timeout(1000); s = await S(host); new = await ITEM(host)
        check(s['i'] == n_i and s['sp'] == sp + 1 and new['id'] != old['id'], 'skip: another question takes its place, the match keeps its length, no points')
        await live(); await host.wait_for_timeout(300)
        await host.click('[data-h=close]'); await reveal(); s = await S(host)
        check(all(s['res'][k][1] == -1 for k in (kA, kB, kC)), 'the host ends a question nobody answered: 0 for all')
        await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000); s = await S(host)
        check(s['fin'][0][0] == 'نورة' and s['fin'][0][2] == 100, 'buzz match: نورة wins with the +100 bonus')

        # the other games still open and start
        await host.click('#endBtn'); await host.wait_for_timeout(600)
        for g in ('quiz', 'letters', 'wheel', 'puzzle', 'diff'):
            await host.click(f'.gact [data-game={g}]'); await host.wait_for_selector('.code', timeout=8000); ok = await host.is_visible('[data-h=start]') or await host.is_visible('.lobby')
            check(ok, f'{g}: opens with a room code as before'); await host.click('#endBtn'); await host.wait_for_timeout(500)
        await host.screenshot(path=SHOTS + '/ak_home.png', full_page=True)
        check(not E.errs, 'no page errors' + ('' if not E.errs else ': ' + '; '.join(E.errs[:3])))
    bad = [m for ok, m in R if not ok]
    os.makedirs(OUT, exist_ok=True); json.dump({'url': URL, 'checks': len(R), 'passed': len(R) - len(bad), 'failed': bad, 'all': [('OK ' if ok else 'FAIL ') + m for ok, m in R], 'PASS': not bad}, open(OUT + '/result.json', 'w'), ensure_ascii=False, indent=1)
    print(f'\n{len(R) - len(bad)}/{len(R)} passed'); sys.exit(1 if bad else 0)

asyncio.run(main())
