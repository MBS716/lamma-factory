"""أكملها: complete matches played to the final results with the special rounds (golden, final, surprise, speed challenge),
solo and two teams, everybody answering; the tie and the no-winner results; team names and team points; the team
challenge when the member on turn is offline or chosen by the host; fastest finger's turn time and start.
A host and 4 players (phone 390, phone 360, computer, phone 390). Real pages and real taps."""
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
        if game == 'akml':        # the host presses «ابدأ وقت الإجابة» at once (the timer test presses it itself)
            await host.add_init_script("setInterval(() => { const b = !window.__noGo && document.querySelector('[data-h=akgo]:not([disabled])'); if (b) b.click(); }, 400);")
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
TXT = lambda pg: pg.inner_text('#playerMain')
TAGS = {'gold': 'الجولة الذهبية', 'final': 'الجولة النهائية', 'surp': 'سؤال مفاجئ'}

async def main():
    os.makedirs(OUT, exist_ok=True)
    async with Env(8789) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860); D = await E.page('D', 390, 844)
        code = await E.start(host, 'akml')
        names = ('صالح', 'تافير', 'نورة', 'فهد')
        for pg, n in zip((A, B, C, D), names): await E.join(pg, code, n)
        await host.wait_for_timeout(1000)
        kA, kB, kC, kD = [await key(host, n) for n in names]
        PG = {kA: A, kB: B, kC: C, kD: D}

        async def opt(k, v): await host.click(f'[data-opt={k}][data-val="{v}"]'); await host.wait_for_timeout(150)
        async def tog(k, on):
            if bool(await host.evaluate(f'H.s.o[{json.dumps(k)}] || 0')) != bool(on): await host.click(f'[data-h=set][data-k={k}]'); await host.wait_for_timeout(150)
        async def lobby():
            if (await host.evaluate('H.s.ph')) != 'lobby': await host.click('#setBtn'); await host.wait_for_timeout(500)
        async def live(t=15000): await host.wait_for_function('H.s.ph === "q" && srvNow() >= H.s.qs', timeout=t); await host.wait_for_timeout(400)
        async def reveal(t=20000): await host.wait_for_function('H.s.ph === "r"', timeout=t); await host.wait_for_timeout(500)
        async def typ(pg, x): await pg.wait_for_selector('#akIn', timeout=8000); await pg.fill('#akIn', x); await pg.click('[data-act=aksend]')
        async def choose(pg, i): await pg.wait_for_selector(f'[data-ak="{i}"]', timeout=8000); await pg.click(f'[data-ak="{i}"]')
        async def to_end():
            await host.click('[data-h=next]'); await host.wait_for_function('H.s.ph === "end"', timeout=10000); await host.wait_for_timeout(700)
        async def end_now():
            if (await host.evaluate('H.s.ph')) in ('q', 'judge'):
                if await host.locator('[data-h=close]').count(): await host.click('[data-h=close]')
                await reveal()
            await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=10000); await host.wait_for_timeout(700)

        def gain_ok(g, mul, fx, right):
            if not right: return g == 0
            base, bonus = 100 * mul, g - 100 * mul
            return bonus >= 0 and bonus <= (100 if fx else 50) * mul and bonus % mul == 0

        # ================= 1. a complete solo match, everybody answers (choose), every special round =================
        await opt('m', 'c'); await opt('lock', 'all'); await opt('t', '15'); await opt('n', '10')
        for k in ('gold', 'fin', 'surp', 'fast'): await tog(k, 1)
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        plan = await host.evaluate('H.priv.plan.map(p => [p.tag, p.mul, p.T, p.fx])')
        tags = [p[0] for p in plan]
        check(len(plan) == 10 and tags[7:] == ['final'] * 3 and tags.count('gold') == 3 and tags.count('surp') >= 1 and any(p[3] for p in plan), f'the plan of the match: {tags}')
        totals = {k: 0 for k in PG}; seen_tag = {}; fast_ok = []; gains_ok = True; mul_seen = set()
        for i in range(10):
            await live(); s = await S(host); q = s['q']; it = await ITEM(host); ci = s['qd']['o'].index(it['o'][0])
            if q['tag'] in TAGS:
                ph = await TXT(A); hm = await host.inner_text('#hostMain')
                seen_tag[q['tag']] = seen_tag.get(q['tag'], True) and TAGS[q['tag']] in ph and TAGS[q['tag']] in hm
            if q['fx']: fast_ok.append(q['T'] == 6 and 'تحدي السرعة' in await TXT(A))
            # صالح always right; تافير right on even questions; نورة always wrong; فهد never answers
            await choose(A, ci); await choose(B, ci if i % 2 == 0 else (ci + 1) % 4); await choose(C, (ci + 2) % 4)
            await host.wait_for_function('H.s.cnt >= 3', timeout=8000)
            await host.click('[data-h=close]'); await reveal(); s = await S(host)
            for k, right in ((kA, True), (kB, i % 2 == 0), (kC, False)):
                g = s['res'][k][0]; gains_ok = gains_ok and gain_ok(g, q['mul'], q['fx'], right); totals[k] += g
            if q['mul'] > 1 and s['res'][kA][0] >= 100 * q['mul']: mul_seen.add(q['mul'])
            check(s['res'][kD][:2] == [0, -1], f'question {i + 1} ({q["tag"] or "عادي"}{", سرعة" if q["fx"] else ""} ×{q["mul"]}): no answer = 0') if i in (0, 9) else None
            if i < 9: await host.click('[data-h=next]')
        check(all(seen_tag.get(t) for t in ('gold', 'final', 'surp')), f'golden round, final round and surprise questions announced on the host and the phones during the match {seen_tag}')
        check(fast_ok and all(fast_ok), f'speed challenge questions played with 6 seconds and announced on the phones ({len(fast_ok)} question(s))')
        check(gains_ok, 'every gain = (100 + speed bonus) × the question\'s multiplier; the speed bonus is at most 50 (100 in the speed challenge) × multiplier')
        check(mul_seen >= {2, 3}, f'right answers really counted ×2 and ×3 ({sorted(mul_seen)})')
        await to_end(); s = await S(host); fin = {f[0]: f for f in s['fin']}
        check(s['tres'] == 'win' and fin['صالح'][6] == 100 and fin['صالح'][8] == 1, 'final results: صالح wins with +100')
        check(all(fin[n][7] == totals[k] + (100 if n == 'صالح' else 0) for k, n in zip((kA, kB, kC), names[:3])), f'final totals = the sum of the gains of the 10 questions (+100 for the winner) {[(n, fin[n][7]) for n in names[:3]]}')
        check(fin['فهد'][7] == 0 and fin['نورة'][2] == 0 and fin['نورة'][3] == 10, 'no answer and wrong answers: 0 points; right/wrong counted (نورة 0 ✓ 10 ✗)')
        check(fin['تافير'][2] == 5 and fin['تافير'][3] == 5 and fin['تافير'][5] > 0, 'تافير: 5 right, 5 wrong, speed bonuses counted')
        await A.wait_for_selector('.akhero', timeout=8000)
        check('الفائز' in await TXT(A) and 'صالح' in await TXT(B), 'the phones show the winner')
        await host.screenshot(path=OUT + '/full_solo_end_host.png', full_page=True)

        # ================= 2. a complete match between two named teams, typed, everybody answers =================
        await lobby()
        for k in ('fast',): await tog(k, 0)
        await opt('sys', 'team'); await host.wait_for_timeout(300)
        s = await S(host); want = {kA: 'g', kB: 'g', kC: 'o', kD: 'o'}
        for k, t in want.items():
            if s['tm'][k] != t: await host.click(f'[data-h=tmove][data-k="{k}"]'); await host.wait_for_timeout(250)
        await host.fill('#akTn_g', 'النمور'); await host.wait_for_timeout(1500)        # the screen refreshes while the host types
        await host.press('#akTn_g', 'Enter'); await host.wait_for_timeout(300)
        await host.fill('#akTn_o', 'الصقور'); await host.press('#akTn_o', 'Tab'); await host.wait_for_timeout(500)
        s = await S(host)
        check(s['o']['tn'] == {'g': 'النمور', 'o': 'الصقور'}, f'the host names the teams: {s["o"]["tn"]}')
        check(await sees(A, 'النمور') and await sees(C, 'الصقور'), 'phones show their team\'s name')
        await opt('m', 't'); await opt('t', '30'); await opt('tsc', 'sum')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        plan = await host.evaluate('H.priv.plan.map(p => [p.tag, p.mul])'); tsum = {'g': 0, 'o': 0}; tag_ok = True
        for i in range(10):
            await live(); s = await S(host); it = await ITEM(host); q = s['q']
            if q['tag'] in TAGS: tag_ok = tag_ok and TAGS[q['tag']] in await TXT(C)
            # النمور: صالح right every question; الصقور: نورة right on odd questions; تافير wrong; فهد no answer
            await typ(A, it['a']); await typ(B, it['o'][1])
            if i % 2: await typ(C, it['a'])
            await host.wait_for_function(f'H.s.cnt >= {3 if i % 2 else 2}', timeout=8000)
            await host.click('[data-h=close]'); await host.wait_for_function('H.s.ph === "r" || H.s.ph === "judge"', timeout=10000)
            if (await host.evaluate('H.s.ph')) == 'judge':
                while await host.locator('[data-h=jno]').count(): await host.click('[data-h=jno]'); await host.wait_for_timeout(300)
            await reveal(); s = await S(host)
            check(s['tsg']['g'] == s['res'][kA][0] + s['res'][kB][0] and s['tsg']['o'] == s['res'][kC][0] + s['res'][kD][0], f'question {i + 1}: team points = the sum of the members\' points') if i in (0, 5, 9) else None
            tsum['g'] += s['tsg']['g']; tsum['o'] += s['tsg']['o']
            if i < 9: await host.click('[data-h=next]')
        check(tag_ok, 'special rounds announced on the phones in the team match')
        await to_end(); s = await S(host); tf = {x['t']: x for x in s['tf']}
        check(tf['g']['s'] == tsum['g'] and tf['o']['s'] == tsum['o'], f'team totals = the sum of the 10 questions (النمور {tf["g"]["s"]}, الصقور {tf["o"]["s"]})')
        check(s['tres'] == 'win' and tf['g']['w'] == 100 and tf['o']['w'] == 0 and tf['g']['p'] == 1 and tf['o']['p'] == 2, 'النمور win (+100), places 1 and 2 ' + json.dumps([s['tm'], [(x['t'], x['s'], x['r'], x['w'], x['p'], [m[:2] for m in x['m']]) for x in s['tf']], s['tres']], ensure_ascii=False))
        check(all(sum(m[4] for m in x['m']) == x['s'] for x in s['tf']), 'members\' contributions add up exactly to each team\'s points')
        hm = await host.inner_text('#hostMain')
        check('النمور' in hm and 'الصقور' in hm and 'الأول' in hm and 'الثاني' in hm, 'the results show the teams by name, first and second')
        await A.wait_for_selector('.aktf', timeout=8000)
        check('النمور' in await TXT(A) and 'مساهمته في الفريق' in await TXT(A), 'phones: the team names and each member\'s contribution')
        await host.screenshot(path=OUT + '/full_teams_end_host.png', full_page=True); await B.screenshot(path=OUT + '/full_teams_end_360.png', full_page=True)

        # ================= 3. teams of different sizes, average: exact, no rounding difference =================
        await lobby(); await tog('gold', 0); await tog('fin', 0); await tog('surp', 0)
        s = await S(host)
        if s['tm'][kB] != 'o': await host.click(f'[data-h=tmove][data-k="{kB}"]'); await host.wait_for_timeout(300)      # 1 (صالح) vs 3
        await opt('m', 'c'); await opt('tsc', 'avg')
        check('متوسط نقاط أعضائه' in await host.inner_text('#hostMain'), 'teams: the host chooses «sum» or «average» of the members\' points')
        await host.click('[data-h=start]')
        for i in range(3):
            await live(); s = await S(host); it = await ITEM(host); ci = s['qd']['o'].index(it['o'][0])
            await choose(A, ci); await choose(B, ci); await choose(C, ci if i != 1 else (ci + 1) % 4)
            await host.wait_for_function('H.s.cnt >= 3', timeout=8000); await host.click('[data-h=close]'); await reveal(); s = await S(host)
            exp_o = round((s['res'][kB][0] + s['res'][kC][0] + s['res'][kD][0]) / 3 + 1e-9)
            check(s['tsg']['g'] == s['res'][kA][0] and abs(s['tsg']['o'] - (s['res'][kB][0] + s['res'][kC][0]) / 3) <= .5, f'question {i + 1}: 1 player vs 3: الصقور get the average {s["tsg"]["o"]}')
            if i < 2: await host.click('[data-h=next]')
        await end_now(); s = await S(host)
        check(all(sum(m[4] for m in x['m']) == x['s'] for x in s['tf']), f'with the average, the contributions still add up exactly: {[(x["t"], x["s"], [m[4] for m in x["m"]]) for x in s["tf"]]}')
        await lobby(); s = await S(host)
        if s['tm'][kB] != 'g': await host.click(f'[data-h=tmove][data-k="{kB}"]'); await host.wait_for_timeout(300)
        await opt('tsc', 'sum')

        # ================= 4. ties and no winner =================
        await opt('m', 'tt'); await opt('tinp', 'o'); await opt('first', 'g'); await opt('ord', 'join'); await opt('tie', 'rules')
        await host.click('[data-h=start]'); await live(); await host.click('[data-h=bok]'); await reveal()
        await host.click('[data-h=next]'); await live(); await host.click('[data-h=bok]'); await reveal()
        await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000); await host.wait_for_timeout(600); s = await S(host)
        check(s['tres'] == 'tie' and all(x['w'] == 0 and x['p'] == 1 for x in s['tf']), 'teams tied (100–100, one right answer each): «تعادل», no win bonus, both first')
        check('تعادل' in await host.inner_text('#hostMain') and 'الفريق الفائز' not in await host.inner_text('#hostMain') and await sees(C, 'تعادل'), 'the tie is shown as a tie on the host and the phones')
        await lobby(); await opt('sys', 'solo'); await opt('m', 'b'); await opt('binp', 'o'); await opt('bst', 'auto')
        await host.click('[data-h=start]'); await live()
        await A.click('[data-act=akbz]'); await host.wait_for_timeout(900); s = await S(host)
        check(s['bz']['ta'] > 0, 'fastest finger aloud, «automatic»: the answer time starts by itself when the player takes the turn')
        await host.click('[data-h=bok]'); await reveal()
        await host.click('[data-h=next]'); await live(); await B.click('[data-act=akbz]'); await host.wait_for_timeout(900); await host.click('[data-h=bok]'); await reveal()
        await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000); await host.wait_for_timeout(600); s = await S(host)
        f = {x[0]: x for x in s['fin']}
        check(s['tres'] == 'tie' and f['صالح'][6] == 0 and f['تافير'][6] == 0 and f['صالح'][8] == f['تافير'][8] == 1, 'solo tie on every rule (150 each, 1 right, 0 wrong, same time): «تعادل», no win bonus, both first')
        check('تعادل' in await host.inner_text('#hostMain') and 'لا مكافأة فوز' in await host.inner_text('#hostMain'), 'the tie is explained on the host')
        await lobby(); await opt('m', 'c'); await host.click('[data-h=start]'); await live(); await host.click('[data-h=close]'); await reveal()
        await host.click('[data-h=final]'); await host.wait_for_function('H.s.ph === "end"', timeout=8000); await host.wait_for_timeout(600); s = await S(host)
        check(s['tres'] == 'none' and all(x[6] == 0 and x[8] == 0 for x in s['fin']), 'nobody scored: no winner, no win bonus, no places')
        hm = await host.inner_text('#hostMain'); pa = await TXT(A)
        check('انتهت المباراة دون فائز' in hm and '👑' not in hm and 'انتهت المباراة دون فائز' in pa and 'ترتيبك' not in pa, '«انتهت المباراة دون فائز» on host and phones; no crown, no «ترتيبك 1»')
        await host.screenshot(path=OUT + '/full_nowinner_host.png'); await B.screenshot(path=OUT + '/full_nowinner_360.png', full_page=True)

        # ================= 5. fastest finger: the host sets the typed answer time =================
        await lobby(); await opt('m', 'b'); await opt('binp', 't'); await opt('bt', '10'); await opt('t', '30')
        await host.click('[data-h=start]'); await live()
        await C.click('[data-act=akbz]'); await C.wait_for_timeout(600); await A.click('[data-act=akbz]'); await host.wait_for_timeout(1000)
        left = await host.evaluate('akTurnLeft(H.s)')
        check(8000 < left <= 10000, f'typed turn time set by the host: 10 s ({left} ms left at the start)')
        await host.wait_for_function('H.s.bz.cur === 1', timeout=16000); s = await S(host)
        check(kC in s['bz']['bl'] and s['bz']['q'][1][0] == kA, 'نورة did not answer in 10 s: the turn passes to صالح in the order of the presses')
        out = await sees(C, 'لا يمكنك الإجابة مرة أخرى')
        check(out and await C.locator('[data-act=akbz]').count() == 0 and await C.locator('#akIn').count() == 0, 'نورة cannot press or answer again on this question')
        await typ(A, (await ITEM(host))['a']); await reveal(8000)
        await end_now(); await lobby(); await opt('bt', '15')

        # ================= 6. team challenge: the host picks who answers; the member on turn goes offline =================
        await opt('sys', 'team'); await host.wait_for_timeout(300); s = await S(host)
        for k, t in want.items():
            if s['tm'][k] != t: await host.click(f'[data-h=tmove][data-k="{k}"]'); await host.wait_for_timeout(250)
        await opt('m', 'tt'); await opt('tinp', 't'); await opt('ord', 'host'); await opt('first', 'g')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q" && H.s.tt && H.s.tt.wait === 1', timeout=15000); await host.wait_for_timeout(1500)
        s = await S(host)
        check(s['tt']['k'] == kA and await host.locator('[data-h=ttpick]').count() == 2 and s['ph'] == 'q' and not s['tt'].get('moved'), 'host picks: the clock waits; the rotation suggests صالح, both green members can be picked')
        check(await sees(A, 'المقدّم يختار من يجيب'), 'phones: «the host is choosing who answers»')
        await host.screenshot(path=OUT + '/full_tt_pick_host.png')
        await host.click(f'[data-h=ttpick][data-k="{kB}"]'); await live(); s = await S(host)
        check(s['tt']['k'] == kB and not s['tt']['wait'], 'the host picks تافير: he answers, the clock starts')
        await B.wait_for_selector('#akIn', timeout=6000); check(await A.locator('#akIn').count() == 0, 'only تافير has the field')
        await typ(B, (await ITEM(host))['a']); await reveal(8000)
        await host.click('[data-h=next]'); await host.wait_for_function('H.s.ph === "q" && H.s.tt.wait === 1', timeout=10000)
        await host.click(f'[data-h=ttpick][data-k="{(await S(host))["tt"]["k"]}"]'); await live(); await host.click('[data-h=close]'); await reveal()
        await host.click('[data-h=next]'); await host.wait_for_function('H.s.ph === "q" && H.s.tt.wait === 1', timeout=10000); s = await S(host)
        check(s['tt']['t'] == 'g' and s['tt']['k'] == kA, 'next green turn: صالح (passed over when the host picked تافير) is suggested first')
        await host.click(f'[data-h=ttpick][data-k="{kA}"]'); await live(); await end_now()
        # offline: the member on turn closes his page during his turn
        await lobby(); await opt('ord', 'join'); await opt('first', 'o')
        await host.click('[data-h=start]'); await live(); s = await S(host)
        check(s['tt']['t'] == 'o' and s['tt']['k'] == kC, 'orange starts: نورة on turn')
        await C.close(); await host.wait_for_function(f'H.s.tt && H.s.tt.k === {json.dumps(kD)}', timeout=40000); s = await S(host)
        check(s['tt']['moved'] == 1 and s['ph'] == 'q', 'نورة offline: after a few seconds the turn passes to فهد, the question goes on')
        await live(); await D.wait_for_selector('#akIn', timeout=6000)
        check('غير متصل' in await host.inner_text('#hostMain'), 'the host is told why the turn moved')
        await typ(D, (await ITEM(host))['a']); await reveal(8000); s = await S(host)
        check(s['res'][kD][:2] == [100, 1] and s['tsg']['o'] == 100, 'فهد answers for his team: 100')
        await end_now()

        # ================= 7. average: explained to everybody; a member offline the whole question does not count =================
        await lobby(); await opt('m', 'c'); await opt('tsc', 'avg'); await opt('t', '30')
        await B.close()
        await host.wait_for_function(f'!activePlayers(hostPlayers()).some(p => dfKey(pname(p)) === {json.dumps(kB)})', timeout=40000)
        await host.click('[data-h=start]'); await live(); s = await S(host); it = await ITEM(host); ci = s['qd']['o'].index(it['o'][0])
        await choose(A, ci); await choose(D, ci); await host.wait_for_function('H.s.cnt >= 2', timeout=8000); await host.wait_for_timeout(600)
        if (await host.evaluate('H.s.ph')) == 'q': await host.click('[data-h=close]')
        await reveal(); s = await S(host)
        check(s['tsx']['g']['n'] == 1 and s['tsx']['o']['n'] == 1, f'average: تافير and نورة were offline the whole question, so each team\'s average counts only its connected member ({s["tsx"]})')
        check(s['tsg']['g'] == s['res'][kA][0] and s['tsg']['o'] == s['res'][kD][0] and abs(s['tsg']['g'] - s['tsg']['o']) <= 50, f'same performance, same team points (±speed bonus): {s["tsg"]}')
        hm = await host.inner_text('#hostMain')
        check('متوسط نقاط أعضائه' in hm and '÷' in hm, 'the host sees how the team points of the question were worked out (sum ÷ members)')
        check(await sees(D, '÷') and 'متوسط نقاط أعضائه' in await TXT(D), 'the players see the same explanation after the question')
        await host.screenshot(path=OUT + '/full_avg_host.png'); await D.screenshot(path=OUT + '/full_avg_390.png', full_page=True)
        await end_now()
        check(not [e for e in E.errs if 'C:' not in e], 'no page errors' + ('' if not E.errs else ': ' + '; '.join(E.errs[:3])))
    bad = [m for ok, m in R if not ok]
    os.makedirs(OUT, exist_ok=True); json.dump({'checks': len(R), 'passed': len(R) - len(bad), 'failed': bad, 'all': [('OK ' if ok else 'FAIL ') + m for ok, m in R], 'PASS': not bad}, open(OUT + '/result.json', 'w'), ensure_ascii=False, indent=1)
    print(f'\n{len(R) - len(bad)}/{len(R)} passed'); sys.exit(1 if bad else 0)

async def sees(pg, text, t=8000):
    try: await pg.wait_for_function(f'document.querySelector("#playerMain").innerText.includes({json.dumps(text)})', timeout=t); return True
    except Exception: return False

asyncio.run(main())
