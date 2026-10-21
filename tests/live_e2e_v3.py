"""Full functional test of the Lamma site with real Firebase and real hosting.
Host: desktop Chromium. Phone A: WebKit (Safari engine) emulating an iPhone. Phone B: Chromium emulating an Android phone.
Every check looks at what the player actually sees. Usage: python tests/live_e2e_v3.py <site url> <out folder> [public site url]"""
import asyncio, sys, json, time, os, traceback, re
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots'
PUBLIC = (sys.argv[3].rstrip('/') + '/') if len(sys.argv) > 3 else None
os.makedirs(OUT, exist_ok=True)
R = {"url": URL, "checks": [], "errors": [], "not_tested": []}
def check(ok, msg): R["checks"].append(("OK " if ok else "FAIL ") + msg); print(R["checks"][-1], flush=True); return ok

async def visible(pg, text):
    """True when `text` is on the screen of the phone without scrolling."""
    return await pg.evaluate('''(t) => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
        while ((n = w.nextNode())) { if (n.textContent.includes(t)) { const r = document.createRange(); r.selectNodeContents(n); const b = r.getBoundingClientRect();
            if (b.height > 0 && b.top >= 0 && b.bottom <= innerHeight) return true; } } return false; }''', text[:18])

async def start(host, game, opts=None):
    await host.goto(URL + f'?t={int(time.time())}', wait_until='load')
    try: await host.wait_for_function('!window.__resuming', timeout=30000)
    except Exception: pass
    await host.wait_for_timeout(500)
    if await host.is_visible('#endBtn'): await host.click('#endBtn'); await host.wait_for_timeout(800)   # back in an unfinished game: end it first
    await host.click(f'.gact [data-game={game}]'); await host.wait_for_selector('.code', timeout=30000)
    for k, v in (opts or {}).items(): await host.click(f'[data-opt={k}][data-val="{v}"]')
    return (await host.inner_text('.code')).strip().replace(' ', '')

async def join_typed(pg, code, name, team=None):
    await pg.goto(URL + f'?t={int(time.time())}', wait_until='load'); await pg.fill('#joinCode', code); await pg.click('#joinForm button')
    await pg.wait_for_selector('#pName', timeout=40000); await pg.fill('#pName', name)
    if team: await pg.click(f'[data-team={team}]')
    await pg.click('[data-act=enter]')

async def join_link(pg, link, name, team=None):
    await pg.goto('about:blank'); await pg.goto(link, wait_until='load')
    await pg.wait_for_selector('#pName', timeout=40000); await pg.fill('#pName', name)
    if team: await pg.click(f'[data-team={team}]')
    await pg.click('[data-act=enter]')

async def players(host, n): await host.wait_for_function(f'hostPlayers().length >= {n}', timeout=40000)

async def wheel_v3(host, ios, android):
    """Wheel v3 on real Firebase: host on a computer, iPhone (WebKit) green, Android (Chromium) orange."""
    await host.evaluate("localStorage.setItem('lm-w-mot','0')")
    code = await start(host, 'wheel', {'goal': 1500})
    await join_typed(ios, code, 'آيفون', 'g'); await join_typed(android, code, 'أندرويد', 'o'); await players(host, 2)
    await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
    R['wheel_cloud'] = await host.evaluate('!!H.cloud'); R['wheel_auth'] = await host.evaluate('!!AUTH_UID')
    async def both(text, t=20000):
        ok = []
        for pg in (ios, android):
            try: await pg.wait_for_function(f'document.querySelector("#playerMain").innerText.includes({json.dumps(text)})', timeout=t); ok.append(True)
            except Exception: ok.append(False)
        return ok == [True, True]
    async def btn(a, arg=None):
        sel = f'[data-w="{a}"]' + (f'[data-arg="{arg}"]' if arg is not None else '')
        await host.wait_for_selector(sel, timeout=15000); await host.wait_for_timeout(500); await host.locator(sel).first.click(); await host.wait_for_timeout(300)
    async def force(k):
        await btn('spin'); await host.evaluate(f'H.s.seg = "{k}"'); await host.wait_for_function('H.s.stage !== "rolling"', timeout=15000)
    check(await both('الهدف 1,500'), 'wheel v3: both phones show the scoreboard and the 1,500 goal')
    await force('q'); qtext = await host.evaluate('H.s.cur.q.q')
    check(await both(qtext[:20]), 'wheel v3: the question reaches iPhone and Android')
    hidden = await ios.evaluate('!document.querySelector("#playerMain .opt.right") && document.querySelectorAll("#playerMain .opt").length === 4')
    check(hidden and await host.evaluate('!("ci" in H.s.cur)'), 'wheel v3: 4 options on the phone, the right answer is not sent before judging')
    await ios.screenshot(path=f'{OUT}/wheel3_iphone_question.png')
    t = await host.evaluate('H.s.turn'); sc0 = await host.evaluate(f'H.s.sc[{t}]'); await btn('ok')
    check(await host.evaluate(f'H.s.sc[{t}]') - sc0 == 200 and await both('إجابة صحيحة'), 'wheel v3: host judges right: +200, phones see the verdict')
    await btn('next')
    await force('speed'); check(await both('ضد'), 'wheel v3: speed challenge face-off on both phones'); await android.screenshot(path=f'{OUT}/wheel3_android_speed.png')
    sc = await host.evaluate('H.s.sc'); await btn('sx')
    check(await host.evaluate('H.s.sc') == sc and await both('أُلغي التحدي'), 'wheel v3: cancelled challenge, scores unchanged on every screen'); await btn('next')
    await force('box'); check(await both('صندوق الحظ'), 'wheel v3: the closed box on both phones'); await btn('open')
    r = await host.evaluate('H.s.cur'); await host.wait_for_timeout(1500)
    pr = await android.evaluate('(() => { const h = findHost(); return h && h.presence.s.cur; })()')
    check(pr and pr.get('r') == r.get('r') and pr.get('v') == r.get('v'), f'wheel v3: phones receive the same box result as the host ({r.get("r")} {r.get("v")})')
    await ios.screenshot(path=f'{OUT}/wheel3_iphone_box.png')
    # host reloads the page while the box is open: same result, same room
    before = await host.evaluate('JSON.stringify([H.s.sc, H.s.cur, H.s.tn])')
    await host.reload(); await host.wait_for_function('!window.__resuming', timeout=30000)
    await host.wait_for_function(f'H && H.code === "{code}" && H.s.ph === "play"', timeout=40000); await host.wait_for_timeout(1500)
    check(await host.evaluate('JSON.stringify([H.s.sc, H.s.cur, H.s.tn])') == before, 'wheel v3: host reload during the box: same room, same result, nothing applied twice')
    await btn('again' if r.get('r') == 'respin' else 'next')
    if r.get('r') == 'respin': await force('p50'); await btn('next')
    await force('l2'); await btn('l2spin'); await host.evaluate('H.s.seg = "p250"'); await host.wait_for_function('H.s.cur.st === "b"', timeout=15000)
    await btn('l2spin'); await host.evaluate('H.s.seg = "m150"'); await host.wait_for_function('H.s.cur.st === "choose"', timeout=15000)
    check(await both('اختاروا نتيجة واحدة'), 'wheel v3: luck twice, both results on the phones before the choice'); await btn('l2pick', 'a'); await btn('next')
    t = await host.evaluate('H.s.turn'); await force('imm'); await btn('next'); await force('p50'); await btn('next')
    await host.evaluate(f'H.s.sc[{t}] = Math.max(H.s.sc[{t}], 300); pushHost()'); scb = await host.evaluate(f'H.s.sc[{t}]'); await force('m250')
    check(await host.evaluate(f'H.s.sc[{t}]') == scb and await both('الحصانة منعت'), 'wheel v3: immunity blocks the deduction, shown on both phones'); await btn('next')
    # luck loan: below 100 points, borrowed 100, wrong answer -> debt visible to everyone, then repaid
    t = await host.evaluate('H.s.turn'); await host.evaluate(f'H.s.sc[{t}] = 40; pushHost()'); await force('bet'); await btn('loan'); await btn('no')
    check(await host.evaluate(f'H.s.debt[{t}]') == 100 and await both('دين سلفة 100'), 'wheel v3: luck loan lost, the 100 debt is shown on iPhone and Android')
    await btn('next'); await force('p50'); await btn('next'); await force('p150')
    check(await host.evaluate(f'H.s.debt[{t}] === 0 && H.s.sc[{t}] === 90') and await both('سداد السلفة'), 'wheel v3: the next gain repays the debt first (40 + 150 − 100 = 90), shown on the phones'); await btn('next')
    # host closes the tab and comes back from a new tab
    before = await host.evaluate('JSON.stringify([H.s.sc, H.s.tn, H.s.im])'); hctx = getattr(host, '_lctx', None) or host.context
    await host.wait_for_timeout(2500); await host.close()
    check(await both('المقدّم غير متصل مؤقتًا', 30000), 'wheel v3: host tab closed, both phones stay in the room and see «host temporarily away»')
    host2 = await hctx.new_page(); host2.on('pageerror', lambda e: R['errors'].append(f'host (new tab): {e}')); await host2.goto(URL, wait_until='load'); await host2.wait_for_function('!window.__resuming', timeout=30000)
    await host2.wait_for_function(f'H && H.code === "{code}" && H.s.ph === "play"', timeout=40000); await host2.wait_for_timeout(1500)
    check(await host2.evaluate('JSON.stringify([H.s.sc, H.s.tn, H.s.im])') == before, f'wheel v3: host back from a new tab: same room and match ({"database copy" if R["wheel_cloud"] else "device copy: rules not updated yet"})')
    check(await both('الدور على', 30000), 'wheel v3: both phones back in the match without re-joining')
    # end of the match
    await host2.evaluate('H.s.sc = [1450, 1000]; pushHost()')
    async def btn2(a):
        await host2.wait_for_selector(f'[data-w="{a}"]', timeout=15000); await host2.wait_for_timeout(500); await host2.locator(f'[data-w="{a}"]').first.click(); await host2.wait_for_timeout(300)
    for i in range(6):
        if await host2.evaluate('H.s.ph === "end"'): break
        await btn2('spin'); await host2.evaluate('H.s.seg = "p50"'); await host2.wait_for_function('H.s.stage !== "rolling"', timeout=15000); await btn2('next')
    s = await host2.evaluate('H.s')
    check(s['ph'] == 'end' and s['tn'][0] == s['tn'][1], f'wheel v3: goal reached, final round, match ends with equal turns {s["tn"]}')
    check(await both('الفائز'), 'wheel v3: winner screen on iPhone and Android'); await ios.screenshot(path=f'{OUT}/wheel3_iphone_end.png', full_page=True)
    size = await host2.evaluate('JSON.stringify(H.s).length'); check(size < 6000, f'wheel v3: state sent to phones stays small ({size} characters)')
    await host2.click('#endBtn'); await host2.wait_for_timeout(1500)
    return host2

async def sessions_real(host, ios, android, newctx):
    """Seats on real Firebase: a phone reloads / closes its browser and comes back to the same seat; another device cannot
    take a used name; the host closes its tab and comes back to the same room."""
    code = await start(host, 'letters', {'m': 'q20', 't': 30})
    await join_typed(ios, code, 'آيفون', 'g'); await join_typed(android, code, 'أندرويد', 'o'); await players(host, 2)
    names = lambda: host.evaluate('hostPlayers().map(p => pname(p) + (p.away ? " (away)" : "")).sort()')
    link = await host.evaluate('joinLink(H.code)'); b = await host.evaluate('BUILD')
    if os.environ.get('RULES_ON'):      # run against the emulator with the final rules: everyone is signed in anonymously
        ids = [await pg.evaluate('AUTH_UID') for pg in (host, ios, android)]
        check(all(ids) and len(set(ids)) == 3, f'rules: host, iPhone and Android each signed in anonymously, no form ({len(set(i for i in ids if i))} identities)')
        check(await host.evaluate('!!H.cloud') and await ios.evaluate('!!(findHost() && findHost().hv)'), 'rules: host holds the room lock; phones see a host seat verified by the database')
    pre = await host.evaluate('ROOM_PREFIX'); prev = 'preview' in URL
    check(pre == ('lmp3-' if prev else 'lm3-') and link.startswith(URL), f'sessions: {"preview" if prev else "official"} rooms are separate ({pre}) and the invite link stays on this site')
    check(('?v=' + b) in link and link.endswith('#' + code), f'sessions: invite link carries the version ({link[-30:]})')
    vj = await host.evaluate('fetch("version.json?t=" + Date.now(), {cache:"no-store"}).then(r => r.json()).catch(() => ({}))')
    check(vj.get('b') == b, f'sessions: version.json matches the page ({vj.get("b")} = {b})')
    await host.click('[data-h=start]'); await host.wait_for_function('H.s.st === "pick"', timeout=20000)
    pid = await ios.evaluate('P.pid')
    await ios.reload(); await ios.wait_for_function('P && P.joined', timeout=30000)
    check(await ios.evaluate('P.pid') == pid and await ios.evaluate('P.name') == 'آيفون' and await ios.locator('#pName').count() == 0, 'sessions: iPhone reloads, back in the same seat with no form')
    actx = getattr(android, '_lctx', None) or android.context; await android.close(); await host.wait_for_timeout(3000)
    n = await names(); check(n == sorted(['آيفون', 'أندرويد (away)']), f'sessions: Android browser closed, its seat is kept as away {n}')
    android = await actx.new_page(); android.on('pageerror', lambda e: R['errors'].append(f'Android (sessions): {e}'))
    await android.goto(URL, wait_until='load'); await android.wait_for_function('P && P.joined', timeout=30000)
    check(await android.evaluate('P.name') == 'أندرويد' and await android.evaluate('P.team') == 'o', 'sessions: Android opens the site again (no code), back automatically with its name and team')
    await host.wait_for_timeout(2000); n = await names(); check(n == sorted(['آيفون', 'أندرويد']), f'sessions: still two players, none twice {n}')
    other = await (await newctx()).new_page(); await other.goto(URL + '#' + code, wait_until='load'); await other.wait_for_selector('#pName', timeout=30000)
    await other.fill('#pName', 'آيفون'); await other.click('[data-team=o]'); await other.click('[data-act=enter]'); await other.wait_for_timeout(2500)
    err = await other.inner_text('#pErr') if await other.locator('#pErr').count() else ''; n = await names()
    check('مستخدم' in err and n == sorted(['آيفون', 'أندرويد']), f'sessions: another device cannot take a name already in the game ({err[:40]})')
    await other.close()
    await host.click('[data-h=rand]'); await host.wait_for_function('H.s.st === "ask"', timeout=20000)
    # a new version appears during the round: nothing reloads, the round and its data stay, a notice is shown
    before = await host.evaluate('JSON.stringify([H.code, H.s.q, H.s.sc])')
    for pg in (host, ios): await pg.route('**/version.json*', lambda r: r.fulfill(body='{"b":"zz-newer","v":"next"}', content_type='application/json'))
    u0 = [host.url, ios.url]; await host.evaluate('checkUpdate()'); await ios.evaluate('checkUpdate()'); await host.wait_for_timeout(4000)
    same = await host.evaluate('JSON.stringify([H.code, H.s.q, H.s.sc])') == before and await ios.evaluate('!!(P && P.joined)')
    check([host.url, ios.url] == u0 and same and await host.is_visible('#updBar'), 'sessions: a new version during a round: no reload on host or phone, round and scores kept, a notice instead')
    for pg in (host, ios): await pg.unroute('**/version.json*')
    hctx = getattr(host, '_lctx', None) or host.context
    await host.close()
    ok = True
    try: await ios.wait_for_function('document.querySelector("#playerMain").innerText.includes("غير متصل مؤقتًا")', timeout=30000)
    except Exception: ok = False
    check(ok, 'sessions: host closed the tab, the phones stay and show "host temporarily away"')
    host = await hctx.new_page(); host.on('pageerror', lambda e: R['errors'].append(f'host (sessions): {e}'))
    await host.goto(URL, wait_until='load'); await host.wait_for_function('!window.__resuming && H && H.code', timeout=40000); await host.wait_for_timeout(1500)
    check(await host.evaluate('JSON.stringify([H.code, H.s.q, H.s.sc])') == before, 'sessions: host opens the site again, back in the same room and question, no new code')
    ok = True
    try: await android.wait_for_function('!document.querySelector("#playerMain").innerText.includes("غير متصل مؤقتًا")', timeout=30000)
    except Exception: ok = False
    check(ok, 'sessions: phones carry on without re-joining')
    if os.environ.get('RULES_ON'):      # emulator only: attacks from a real phone page, and the room lock over time
        res = await android.evaluate('''(async () => { const r = firebase.database().ref("rooms/" + ROOM_PREFIX + P.code), TS = firebase.database.ServerValue.TIMESTAMP, out = [];
          try { await r.child("fakehostxx01").set({j: JSON.stringify({r:"h", v:APP_V, g:"letters", c:0, s:{ph:"play", sc:[999, 0]}}), t:TS, u:AUTH_UID, c:TS, h:true}); out.push("fake host accepted"); } catch(e){ out.push("fake host refused"); }
          const hid = findHost().peer;
          try { await r.child(hid).update({j:"{}"}); out.push("host seat changed"); } catch(e){ out.push("host seat protected"); }
          try { await firebase.database().ref("games/" + ROOM_PREFIX + P.code).set({g:"letters", v:3, s:"{}", at:TS}); out.push("saved match changed"); } catch(e){ out.push("saved match protected"); }
          return out; })()''')
        check(res == ['fake host refused', 'host seat protected', 'saved match protected'], f'rules: from a player phone, faking the host, changing the host seat (scores) and the saved match are all refused {res}')
        import urllib.request
        uid = await host.evaluate('AUTH_UID'); room = await host.evaluate('ROOM_PREFIX + H.code')
        def emu(method, path, body=None):
            rq = urllib.request.Request(f'http://127.0.0.1:9000/{path}.json?ns=demo-lamma-default-rtdb', method=method,
                                        data=None if body is None else json.dumps(body).encode(), headers={'Authorization': 'Bearer owner'})
            return json.loads(urllib.request.urlopen(rq).read() or b'null')
        now = lambda: int(time.time() * 1000)
        emu('PUT', f'hosts/{room}', {'u': uid, 'g': 'letters', 't': now() - 2 * 3600000})
        await host.evaluate('refreshLock(true)'); await host.wait_for_timeout(2000)
        check(now() - emu('GET', f'hosts/{room}')['t'] < 60000, 'rules: a connected host renews its room lock (an active room never counts as abandoned)')
        emu('PUT', f'hosts/{room}', {'u': 'another-host', 'g': 'letters', 't': now()})
        await host.evaluate('refreshLock(true)'); await host.wait_for_timeout(2000)
        check(await host.is_visible('#lockBar') and 'مقدّم آخر' in await host.inner_text('#lockBar'), 'rules: if the room did pass to another host, the old host page says so')
        emu('PUT', f'hosts/{room}', {'u': uid, 'g': 'letters', 't': now()})
        await host.evaluate('refreshLock(true)'); await host.wait_for_timeout(2000)
        check(not await host.is_visible('#lockBar'), 'rules: lock back with this host: the notice goes away')
    await host.click('#endBtn'); await host.wait_for_timeout(1500)
    ok = True
    try: await ios.wait_for_function('document.querySelector("#playerMain").innerText.includes("انتهت")', timeout=30000)
    except Exception: ok = False
    check(ok, 'sessions: host ends the game, phones are told')
    return host, android

async def run(pw):
    if os.environ.get('FAKEFB'):     # local dry run: one Chromium context shared by all pages so the in-browser Firebase stand-in can relay
        cb = wb = await pw.chromium.launch(); shared = await cb.new_context(has_touch=True); fake = open(os.environ['FAKEFB']).read()
        async def route(r):
            u = r.request.url
            if 'firebase-app-compat' in u: await r.fulfill(body=fake, content_type='application/javascript')
            elif 'localhost' in u: await r.continue_()
            else: await r.fulfill(body='', content_type='application/javascript')
        await shared.route('**/*', route)
        DEV = ("(() => { const dev = '__DEV__', P = Storage.prototype, g = P.getItem, st = P.setItem, rm = P.removeItem;"
               " const k = (self, key) => self === window.localStorage && !String(key).startsWith('fake') ? 'dev:' + dev + ':' + key : key;"
               " P.getItem = function(key){ return g.call(this, k(this, key)); }; P.setItem = function(key, v){ return st.call(this, k(this, key), v); };"
               " P.removeItem = function(key){ return rm.call(this, k(this, key)); }; })();")
        class Ctx:     # one stand-in "browser" per context: its pages share their own localStorage, like real contexts
            n = 0
            def __init__(self, vp): self.vp = vp; Ctx.n += 1; self.dev = f'd{Ctx.n}'
            async def new_page(self):
                pg = await shared.new_page(); await pg.add_init_script(DEV.replace('__DEV__', self.dev)); await pg.set_viewport_size(self.vp)
                pg._lctx = self; return pg
        async def ctx(**kw): return Ctx(kw.get('viewport', {'width': 1280, 'height': 900}))
        cb.new_context = ctx
    else:
        cb, wb = await pw.chromium.launch(), await pw.webkit.launch()
    host = await (await cb.new_context(viewport={'width': 1366, 'height': 900})).new_page()
    ios = await (await wb.new_context(**pw.devices['iPhone 13'])).new_page()
    android = await (await cb.new_context(**pw.devices['Pixel 7'])).new_page()
    for pg, n in ((host, 'host'), (ios, 'iPhone/WebKit'), (android, 'Android/Chromium')): pg.on('pageerror', lambda e, n=n: R['errors'].append(f'{n}: {e}'))
    try:
        # ---------------- joining: typed code (iPhone), invite link (Android), QR content, wrong code, public-site phone
        code = await start(host, 'letters', {'m': 'q20', 't': 30})
        link = await host.evaluate('joinLink(H.code)'); check(link.startswith(URL) and link.endswith('#' + code), f'invite link points to this site ({link})')
        qr = await host.evaluate('(() => { const q = document.querySelector("#qr"); return q ? q.getAttribute("title") || "" : ""; })()')
        check(qr == link, f'QR code encodes the invite link ({qr})')
        await join_typed(ios, code, 'آيفون', 'g'); await join_link(android, link, 'أندرويد', 'o'); await players(host, 2)
        check(True, 'iPhone (WebKit) joined by typing the code; Android joined through the invite link')
        await ios.screenshot(path=f'{OUT}/join_iphone.png')
        bad = await (await cb.new_context(**pw.devices['Pixel 7'])).new_page()
        await bad.goto(URL, wait_until='load'); await bad.fill('#joinCode', '0000' if code != '0000' else '1111'); await bad.click('#joinForm button')
        await bad.wait_for_timeout(10000); t = await bad.inner_text('#app')
        check('لم نجد لعبة' in t, 'wrong code: the phone gets a clear "game not found" message')
        await bad.screenshot(path=f'{OUT}/join_wrong_code.png')
        if PUBLIC:
            await bad.goto(PUBLIC + f'?t={int(time.time())}', wait_until='load'); await bad.fill('#joinCode', code); await bad.click('#joinForm button')
            await bad.wait_for_timeout(10000); t = await bad.inner_text('#app')
            same = await bad.evaluate('typeof ROOM_PREFIX !== "undefined" ? ROOM_PREFIX : ""') == await host.evaluate('ROOM_PREFIX')
            if same: check('اسمك' in t, 'public site runs the same version: a phone there joins this game normally')
            else: check('اسمك' not in t, 'public site runs another version: its phones get "not found" instead of a stuck lobby')
        else: R['not_tested'].append('public-site phone with a new-version code')

        # ---------------- letters: fairness, scoring, equal turns, end screen
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play" && H.s.st === "pick"', timeout=30000)
        await host.click('[data-h=rand]'); await host.wait_for_function('H.s.st === "ask"', timeout=15000)
        await ios.wait_for_selector('[data-am]:not([disabled])', timeout=15000); await ios.click('[data-am]')
        await host.wait_for_function('!!H.s.rq', timeout=15000)
        check(await host.evaluate('H.s.st') == 'ask', 'letters: the team pressing on its phone does NOT stop the clock')
        await ios.screenshot(path=f'{OUT}/letters_iphone_request.png')
        await host.wait_for_timeout(18500); await host.click('[data-h=stop]'); await host.wait_for_function('H.s.st === "judge"', timeout=15000)
        am = await host.evaluate('H.s.am'); await host.click('[data-h=ok]'); pts = await host.evaluate('H.s.last.pts')
        check(am >= 18000 and pts <= 60, f'letters fairness: pressed at 0 s, answered at {am / 1000:.1f} s -> {pts} points (not 100)')
        await host.click('[data-h=next]')
        q_seen = set(); exp = {'g': pts, 'o': 0}
        for i in range(40):
            if await host.locator('.victory').count(): break
            tn = await host.evaluate('H.s.tn'); ph = ios if tn == 'g' else android
            await host.click('[data-h=rand]'); await host.wait_for_function('H.s.st === "ask"', timeout=15000)
            q = await host.evaluate('H.s.q'); q_seen.add(q)
            if i == 0:
                await ph.wait_for_timeout(800); check(await visible(ph, q), 'letters: the question is on the phone screen of the team on turn')
            await host.click('[data-h=stop]'); await host.wait_for_function('H.s.st === "judge"', timeout=15000)
            ok = i not in (2, 7)
            await host.click('[data-h=ok]' if ok else '[data-h=no]'); exp[tn] += await host.evaluate('H.s.last.pts')
            await host.click('[data-h=next]')
        await host.wait_for_selector('.victory', timeout=20000); f = await host.evaluate('H.s.fin')
        check(f['g']['n'] == f['o']['n'], f"letters: both teams had the same number of questions ({f['g']['n']}/{f['o']['n']})")
        check(f['g']['p'] == exp['g'] and f['o']['p'] == exp['o'], f"letters: totals equal the points awarded ({f['g']['p']}/{f['o']['p']})")
        check(len(q_seen) + 1 >= f['g']['n'] + f['o']['n'], 'letters: no question repeated')
        for pg in (ios, android): await pg.wait_for_selector('.victory', timeout=20000)
        check(True, 'letters: winner screen on host, iPhone and Android')
        await ios.screenshot(path=f'{OUT}/letters_iphone_victory.png', full_page=True)

        # ---------------- player and host seats (when the site has them)
        if await host.evaluate('typeof seatGet === "function"'):
            async def newctx(): return await cb.new_context(viewport=pw.devices['Pixel 7']['viewport']) if os.environ.get('FAKEFB') else await cb.new_context(**pw.devices['Pixel 7'])
            host, android = await sessions_real(host, ios, android, newctx)
            for pg in (ios, android): await pg.goto(URL, wait_until='load')
        # ---------------- wheel (v3 with cards when the site has it, otherwise the older wheel)
        if await host.evaluate('typeof W3 !== "undefined"'):
            host = await wheel_v3(host, ios, android)
        else:
            code = await start(host, 'wheel', {'goal': 0})     # open game: reaching the goal would end it before both kinds of result are seen
            await join_typed(ios, code, 'آيفون', 'g'); await join_typed(android, code, 'أندرويد', 'o'); await players(host, 2)
            await host.click('[data-h=start]'); await host.wait_for_timeout(800)
            got = {}
            for i in range(40):
                await host.click('[data-h=spin]'); await host.wait_for_function('H.s.show === true', timeout=15000)
                seg = await host.evaluate('SEGS[H.s.seg]'); kind = 'q' if seg.get('q') else 'ch' if seg.get('ch') else None
                if kind and kind not in got:
                    text = await host.evaluate('H.s.wq ? H.s.wq.q : H.s.ch'); await ios.wait_for_timeout(1500)
                    got[kind] = (await visible(ios, text), await visible(android, text))
                    if kind == 'q':
                        await ios.screenshot(path=f'{OUT}/wheel_iphone_question.png')
                        opts_ok = await ios.evaluate('document.querySelectorAll("#whP .opt").length') == 4
                        right_hidden = await ios.evaluate('!document.querySelector("#whP .opt.right")')
                        check(opts_ok and right_hidden, 'wheel: 4 options on the phone, correct answer not marked before the host reveals it')
                        await host.click('[data-h=qrev]'); await ios.wait_for_timeout(1500)
                        check(await ios.evaluate('!!document.querySelector("#whP .opt.right")'), 'wheel: phones see the correct answer after the host reveals it')
                if await host.locator('#whSide [data-h=qrev]').count(): await host.click('#whSide [data-h=qrev]')
                await host.locator('#whSide [data-h=skip], #whSide [data-h=pts], #whSide [data-h=steal], #whSide [data-h=x2], #whSide [data-h=q-ok]').first.click()
                if len(got) == 2: break
            check(got.get('q') == (True, True), f'wheel: question visible on iPhone and Android screens {got.get("q")}')
            check(got.get('ch') == (True, True), f'wheel: challenge visible on iPhone and Android screens {got.get("ch")}')

        # ---------------- spot the difference
        code = await start(host, 'diff', {'lv': 2})
        await join_typed(ios, code, 'آيفون'); await join_typed(android, code, 'أندرويد'); await players(host, 2)
        idx = await host.evaluate('fetch("spot/catalog/index.json").then(r=>r.json())'); R['spot_index'] = idx
        hard = idx['levels'][2]; plays = []
        await host.click('[data-h=start]')
        for i in range(hard + 1):
            await host.wait_for_function('["play","done","fail"].includes(H.s.ph)', timeout=40000)
            ph_ = await host.evaluate('H.s.ph')
            if ph_ != 'play': break
            pair = await host.evaluate('H.s.pair'); plays.append(pair['id'])
            if i == 0:
                W, Hh = pair['w'], pair['h']
                await ios.wait_for_function('(f) => { const i=[...document.querySelectorAll("#pDf img")]; return i.length===2 && i[1].getAttribute("src").endsWith(f) && i.every(x=>x.complete&&x.naturalWidth>500); }', arg=pair['b'].split('/')[-1], timeout=40000)
                B = ios.locator('#pDf .dfimg >> nth=1'); await B.scroll_into_view_if_needed(); bb = await B.bounding_box()
                for d in pair['diffs']: await ios.tap('#pDf .dfimg >> nth=1', position={'x': d['x'] / W * bb['width'], 'y': d['y'] / Hh * bb['height']}); await ios.wait_for_timeout(150)
                c = (await ios.inner_text('#dfCount')).replace(' ', ''); check(c == f"{len(pair['diffs'])}/{len(pair['diffs'])}", f'spot: iPhone found every difference by touch ({c})')
                check(await ios.locator('.dfreport').count() == 0 and await host.locator('.dfreport').count() == 0, 'spot: no report button during the round')
                await ios.click('[data-act=dfinfo]'); await ios.wait_for_selector('#modal[open]'); info = await ios.inner_html('#modalBody')
                check('commons.wikimedia.org/wiki' not in info, 'spot: no link to the original picture during the round')
                await ios.wait_for_timeout(800); await ios.screenshot(path=f'{OUT}/spot_iphone_info_during.png'); await ios.click('#modal [data-close] >> nth=1')
                await host.click('[data-h=end]'); await host.wait_for_timeout(1500)
                if pair.get('kind') == 'photo':
                    await ios.click('[data-act=dfinfo]'); await ios.wait_for_selector('#modal[open]'); info = await ios.inner_html('#modalBody')
                    check('commons.wikimedia.org' in info, 'spot: after the round the source link is shown (licence attribution)'); await ios.click('#modal [data-close] >> nth=1')
                await host.click('[data-h=go]')
            else:
                await host.click('[data-h=end]'); await host.click('[data-h=go]')
        check(len(plays) == hard and len(set(plays)) == hard, f'spot: the room played all {hard} hard pairs, none twice, before the end message ({len(plays)})')
        txt = await host.inner_text('#hostMain'); check('اكتملت تحديات هذا المستوى' in txt, 'spot: end-of-level message only after the level is used up')
        await host.click('[data-h=lobby]'); await host.click('[data-opt=lv][data-val="0"]'); await host.click('[data-h=start]')
        await host.wait_for_function('["play","done","fail"].includes(H.s.ph)', timeout=40000)
        check(await host.evaluate('H.s.ph === "play" && H.s.pair.level === 0'), 'spot: changing the level gives a pair of the new level')
        await android.wait_for_selector('#pDf .dfimg img', timeout=40000); await android.wait_for_timeout(800)
        await android.screenshot(path=f'{OUT}/spot_android_easy.png', full_page=True)

        # ---------------- quiz
        code = await start(host, 'quiz', {'n': 5, 't': 20})
        await join_typed(ios, code, 'آيفون'); await join_typed(android, code, 'أندرويد'); await players(host, 2)
        await host.click('[data-h=start]')
        for i in range(5):
            await host.wait_for_function('H.s.ph === "q"', timeout=30000)
            for pg in (ios, android): await pg.wait_for_selector('[data-ans]', timeout=20000)
            q = await host.evaluate('H.s.qd.q')
            if i == 0: check(await visible(ios, q) and await visible(android, q), 'quiz: the question is on both phone screens')
            ci = await host.evaluate('H.priv.ci'); await ios.click(f'[data-ans="{ci}"]'); await android.click(f'[data-ans="{(ci + 1) % 4}"]')
            await host.wait_for_function('H.s.ph === "r"', timeout=20000); await host.click('[data-h=next]')
        await host.wait_for_function('H.s.ph === "end"', timeout=20000); top = await host.evaluate('H.s.top')
        check(top[0][0] == 'آيفون' and top[1][1] == 0, f'quiz: right answers scored, wrong ones not ({top})')

        # ---------------- puzzle (tap two pieces on the iPhone, drag on Android)
        code = await start(host, 'puzzle', {'src': 'draw', 'n': 3})
        await join_typed(ios, code, 'آيفون'); await join_typed(android, code, 'أندرويد'); await players(host, 2)
        await host.click('[data-h=start]'); await ios.wait_for_selector('#pPz .tile', timeout=20000)
        p0 = await ios.eval_on_selector_all('#pPz .tile', 'e=>e.map(x=>x.style.backgroundPosition)')
        await ios.tap('#pPz .tile >> nth=0'); await ios.tap('#pPz .tile >> nth=4'); await ios.wait_for_timeout(300)
        p1 = await ios.eval_on_selector_all('#pPz .tile', 'e=>e.map(x=>x.style.backgroundPosition)')
        check(p1[0] == p0[4] and p1[4] == p0[0], 'puzzle: iPhone swaps two pieces by tapping')
        await android.wait_for_selector('#pPz .tile', timeout=20000)
        a0 = await android.eval_on_selector_all('#pPz .tile', 'e=>e.map(x=>x.style.backgroundPosition)')
        s0 = await android.evaluate('scrollY')
        cdp = await android.context.new_cdp_session(android)
        t0 = await android.locator('#pPz .tile >> nth=0').bounding_box(); t8 = await android.locator('#pPz .tile >> nth=8').bounding_box()
        sx, sy, ex, ey = t0['x'] + 20, t0['y'] + 20, t8['x'] + 20, t8['y'] + 20
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': sx, 'y': sy}]})
        for k in range(1, 11): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': sx + (ex - sx) * k / 10, 'y': sy + (ey - sy) * k / 10}]})
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await android.wait_for_timeout(300)
        a1 = await android.eval_on_selector_all('#pPz .tile', 'e=>e.map(x=>x.style.backgroundPosition)')
        check(a1[0] == a0[8] and a1[8] == a0[0] and await android.evaluate('scrollY') == s0, 'puzzle: Android drag swaps pieces without scrolling the page')
        for pg, n in ((ios, 'iPhone'), (android, 'Android')):
            w = await pg.evaluate('[document.documentElement.scrollWidth, innerWidth]'); check(w[0] <= w[1], f'{n}: no sideways scrolling ({w[0]} <= {w[1]})')
        R['not_tested'] += ['real phones on mobile networks (only browser engines on GitHub servers)', 'in-app browsers (WhatsApp/Instagram/camera QR)', 'scanning the QR with a camera (the QR content is checked instead)']
    except Exception:
        R['exception'] = traceback.format_exc()[-2000:]
        for n, pg in (('host', host), ('iphone', ios), ('android', android)):
            try: await pg.screenshot(path=f'{OUT}/FAIL_{n}.png', full_page=True)
            except Exception: pass
    await cb.close()
    if wb is not cb: await wb.close()

async def main():
    async with async_playwright() as pw: await run(pw)
    # WebKit reports the Firebase SDK's own "disconnect" beacon (a script request sent while a page unloads) as a page
    # error when a page is reloaded or closed; it is not from the site's code and nothing is shown to the player
    R['ignored'] = [e for e in R['errors'] if '.lp?disconn=t' in e]; R['errors'] = [e for e in R['errors'] if '.lp?disconn=t' not in e]
    R['PASS'] = not R.get('exception') and not R['errors'] and all(c.startswith('OK') for c in R['checks']) and len(R['checks']) >= 25
    json.dump(R, open(f'{OUT}/result.json', 'w'), ensure_ascii=False, indent=1); print(json.dumps(R, ensure_ascii=False, indent=1))
    sys.exit(0 if R['PASS'] else 1)
asyncio.run(main())
