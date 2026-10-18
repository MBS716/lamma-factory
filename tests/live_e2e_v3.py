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

async def run(pw):
    if os.environ.get('FAKEFB'):     # local dry run: one Chromium context shared by all pages so the in-browser Firebase stand-in can relay
        cb = wb = await pw.chromium.launch(); shared = await cb.new_context(has_touch=True); fake = open(os.environ['FAKEFB']).read()
        async def route(r):
            u = r.request.url
            if 'firebase-app-compat' in u: await r.fulfill(body=fake, content_type='application/javascript')
            elif 'localhost' in u: await r.continue_()
            else: await r.fulfill(body='', content_type='application/javascript')
        await shared.route('**/*', route)
        class Ctx:
            def __init__(self, vp): self.vp = vp
            async def new_page(self):
                pg = await shared.new_page(); await pg.set_viewport_size(self.vp); return pg
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
            check('اسمك' not in t, 'a phone on the current public site cannot half-join a game of this version (no stuck lobby)')
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

        # ---------------- wheel: question and challenge visible on the phones
        code = await start(host, 'wheel')
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
    R['PASS'] = not R.get('exception') and not R['errors'] and all(c.startswith('OK') for c in R['checks']) and len(R['checks']) >= 25
    json.dump(R, open(f'{OUT}/result.json', 'w'), ensure_ascii=False, indent=1); print(json.dumps(R, ensure_ascii=False, indent=1))
    sys.exit(0 if R['PASS'] else 1)
asyncio.run(main())
