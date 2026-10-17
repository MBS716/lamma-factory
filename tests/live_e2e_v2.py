"""Real end-to-end group test of the Lamma site, version 2 (real Firebase, real hosting, real time).
One host on a desktop browser and two phones (touch, separate browsers) play:
  - سباق الحروف: a full 20-question match (phones on different teams press «جاوبنا», host judges)
  - اكتشف الفرق: one round per level, every difference found by touch on phone 1
  - تحدي الأسئلة: 5 questions answered from both phones
and check the how-to-play modals, the image-info modal and that phones never scroll sideways.
Usage: python tests/live_e2e_v2.py <site url> <folder for results>"""
import asyncio, sys, json, time, os, traceback
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'
OUT = sys.argv[2] if len(sys.argv) > 2 else 'shots'
os.makedirs(OUT, exist_ok=True)
R = {"url": URL, "checks": [], "errors": []}
def check(ok, msg): R["checks"].append(("OK " if ok else "FAIL ") + msg); print(R["checks"][-1], flush=True); return ok

async def join(pg, code, name, team=None):
    await pg.goto(URL + '#' + code, wait_until='load'); await pg.wait_for_selector('#pName', timeout=30000)
    await pg.fill('#pName', name)
    if team: await pg.click(f'[data-team={team}]')
    await pg.click('[data-act=enter]')

async def start(host, game, opts=None):
    await host.goto(URL + f'?t={int(time.time())}', wait_until='load')
    await host.click(f'.gact [data-game={game}]'); await host.wait_for_selector('.code', timeout=30000)
    for k, v in (opts or {}).items(): await host.click(f'[data-opt={k}][data-val="{v}"]')
    return (await host.inner_text('.code')).strip().replace(' ', '')

async def wait_players(host, n):
    await host.wait_for_function(f'hostPlayers().length >= {n}', timeout=30000)

async def run(b):
    desk = await b.new_context(viewport={'width': 1366, 'height': 900})
    ph = [await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2) for _ in range(2)]
    host = await desk.new_page(); p1, p2 = [await c.new_page() for c in ph]
    for pg, n in ((host, 'host'), (p1, 'phone1'), (p2, 'phone2')): pg.on('pageerror', lambda e, n=n: R['errors'].append(f'{n}: {e}'))
    try:
        await host.goto(URL + f'?t={int(time.time())}', wait_until='load')
        check(await host.locator('text=TIGER').count() > 0 and await host.locator('text=10000003').count() > 0, 'footer: TIGER and TopTop ID')
        n = 0
        for g in ('letters', 'wheel', 'quiz', 'diff', 'puzzle'):
            await host.click(f'.gact [data-help={g}]'); await host.wait_for_selector('#modal[open]', timeout=5000)
            n += len(await host.inner_text('#modalBody')) > 150; await host.keyboard.press('Escape'); await host.wait_for_timeout(200)
        check(n == 5, f'how-to-play modal on all 5 games ({n}/5)')
        await host.screenshot(path=f'{OUT}/home.png', full_page=True)

        # ---------------- letters: full match, real time
        code = await start(host, 'letters', {'m': 'q20', 't': 30})
        await join(p1, code, 'جوال الأخضر', 'g'); await join(p2, code, 'جوال البرتقالي', 'o'); await wait_players(host, 2)
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play" && H.s.st === "pick"', timeout=30000)
        exp = {"g": 0, "o": 0}; wrong = {"g": 0, "o": 0}; times = []
        for i in range(30):
            if await host.locator('.victory').count(): break
            tn = await host.evaluate('H.s.tn'); pg = p1 if tn == 'g' else p2; other = p2 if tn == 'g' else p1
            await host.click('[data-h=rand]'); await host.wait_for_function('H.s.st === "ask"', timeout=15000)
            await pg.wait_for_selector('[data-am]:not([disabled])', timeout=15000)
            if i == 0: check(await other.locator('[data-am]').count() == 0, 'letters: only the team on turn gets the answer button')
            await pg.click('[data-am]'); await host.wait_for_function('H.s.st === "judge"', timeout=15000)
            am = await host.evaluate('H.s.am'); times.append(am)
            ok = i not in (3, 8, 13)
            await host.click('[data-h=ok]' if ok else '[data-h=no]')
            pts = await host.evaluate('H.s.last.pts'); exp[tn] += pts
            if not ok: wrong[tn] += 1
            if i == 2:
                await p1.wait_for_timeout(600); await host.screenshot(path=f'{OUT}/letters_host_result.png'); await pg.screenshot(path=f'{OUT}/letters_phone_result.png', full_page=True)
            await host.click('[data-h=next]')
        await host.wait_for_selector('.victory', timeout=15000)
        f = await host.evaluate('H.s.fin')
        check(f['g']['n'] == f['o']['n'] >= 10, f"letters: equal questions per team ({f['g']['n']}/{f['o']['n']})")
        check(f['g']['p'] == exp['g'] and f['o']['p'] == exp['o'], f"letters: totals match the points given ({f['g']['p']} / {f['o']['p']})")
        check(all(0 < t < 30000 for t in times), f'letters: answer times measured on the host clock (max {max(times)} ms)')
        for pg in (p1, p2): await pg.wait_for_selector('.victory', timeout=15000)
        check(True, f"letters: winner screen on host and both phones (winner {f['w']}, {f['g']['p']}-{f['o']['p']}, tiebreak {f['tb']})")
        await host.screenshot(path=f'{OUT}/letters_host_victory.png', full_page=True); await p1.screenshot(path=f'{OUT}/letters_phone_victory.png', full_page=True)
        await p1.click('.phead [data-help]'); await p1.wait_for_selector('#modal[open]', timeout=5000); await p1.wait_for_timeout(500)
        txt = await p1.inner_text('#modalBody'); check('100' in txt and 'النقاط' in txt, 'letters: phone how-to-play explains the points system')
        await p1.screenshot(path=f'{OUT}/letters_phone_help.png'); await p1.keyboard.press('Escape')

        # ---------------- spot the difference
        code = await start(host, 'diff')
        await join(p1, code, 'جوال 1'); await join(p2, code, 'جوال 2'); await wait_players(host, 2)
        idx = await host.evaluate('fetch("spot/catalog/index.json").then(r=>r.json())'); R['spot_library'] = idx
        check(idx['total'] >= 50, f"spot: library has {idx['total']} pairs (levels {idx['levels']})")
        for lv in (0, 1, 2):
            if await host.locator('[data-h=lobby]').count(): await host.click('[data-h=lobby]')
            await host.wait_for_selector('[data-opt=lv]', timeout=15000); rd0 = await host.evaluate('H.s.rd')
            await host.click(f'[data-opt=lv][data-val="{lv}"]'); await host.click('[data-h=start]')
            await host.wait_for_function(f'H.s.pair && H.s.rd > {rd0} && H.s.ph === "play"', timeout=40000)
            pair = await host.evaluate('H.s.pair'); W, Hh = pair['w'], pair['h']
            for pg in (p1, p2):
                await pg.wait_for_function('(f) => { const i=[...document.querySelectorAll("#pDf img")]; return i.length===2 && i[1].getAttribute("src").endsWith(f) && i.every(x=>x.complete&&x.naturalWidth>1000); }', arg=pair['b'].split('/')[-1], timeout=40000)
            await p1.wait_for_timeout(400)
            B = p1.locator('#pDf .dfimg >> nth=1'); await B.scroll_into_view_if_needed(); bb = await B.bounding_box()
            for d in pair['diffs']: await p1.touchscreen.tap(bb['x'] + d['x'] / W * bb['width'], bb['y'] + d['y'] / Hh * bb['height']); await p1.wait_for_timeout(150)
            A = p2.locator('#pDf .dfimg >> nth=0'); await A.scroll_into_view_if_needed(); ab = await A.bounding_box()
            for d in pair['diffs'][:2]: await p2.touchscreen.tap(ab['x'] + d['x'] / W * ab['width'], ab['y'] + d['y'] / Hh * ab['height']); await p2.wait_for_timeout(150)
            await host.wait_for_timeout(2000)
            c1, c2 = (await p1.inner_text('#dfCount')).replace(' ', ''), (await p2.inner_text('#dfCount')).replace(' ', '')
            nd = len(pair['diffs'])
            check(pair['level'] == lv and c1 == f'{nd}/{nd}' and c2 == f'2/{nd}', f"spot level {lv}: {pair['id']} ({pair.get('kind')}) phone1 {c1}, phone2 {c2}")
            await p1.screenshot(path=f'{OUT}/spot_phone_level{lv}.png', full_page=True); await host.screenshot(path=f'{OUT}/spot_host_level{lv}.png')
            if lv == 2:
                await p2.click('[data-act=dfinfo]'); await p2.wait_for_selector('#modal[open]', timeout=5000); await p2.wait_for_timeout(500)
                info = await p2.inner_text('#modalBody'); check(('الترخيص' in info) or ('رسم أصلي' in info), 'spot: image-info modal shows author/licence')
                await p2.screenshot(path=f'{OUT}/spot_phone_info.png'); await p2.keyboard.press('Escape')
            await host.click('[data-h=end]'); await host.wait_for_timeout(500)

        # ---------------- quiz
        code = await start(host, 'quiz', {'n': 5, 't': 20})
        await join(p1, code, 'جوال 1'); await join(p2, code, 'جوال 2'); await wait_players(host, 2)
        await host.click('[data-h=start]')
        for i in range(5):
            await host.wait_for_function('H.s.ph === "q"', timeout=30000)
            for pg in (p1, p2): await pg.wait_for_selector('[data-ans]', timeout=15000)
            ci = await host.evaluate('H.priv.ci')
            await p1.click(f'[data-ans="{ci}"]'); await p2.click(f'[data-ans="{(ci + 1) % 4}"]')
            await host.wait_for_function('H.s.ph === "r"', timeout=15000)
            if i == 0: await p1.screenshot(path=f'{OUT}/quiz_phone_result.png', full_page=True)
            await host.click('[data-h=next]')
        await host.wait_for_function('H.s.ph === "end"', timeout=15000)
        top = await host.evaluate('H.s.top'); check(top[0][0] == 'جوال 1' and top[1][1] == 0, f'quiz: phone answers scored ({top})')
        await host.screenshot(path=f'{OUT}/quiz_host_end.png')
        for pg in (p1, p2):
            w = await pg.evaluate('document.documentElement.scrollWidth'); check(w <= 390, f'phone width fits ({w}px)')
    except Exception:
        R['exception'] = traceback.format_exc()[-1500:]
        for n, pg in (('host', host), ('phone1', p1), ('phone2', p2)):
            try: await pg.screenshot(path=f'{OUT}/FAIL_{n}.png', full_page=True)
            except Exception: pass

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        if os.environ.get('FAKEFB'):          # local dry run only: in-browser stand-in for Firebase
            fake = open(os.environ['FAKEFB']).read()
            shared = await b.new_context(has_touch=True)
            async def route(r):
                u = r.request.url
                if 'firebase-app-compat' in u: await r.fulfill(body=fake, content_type='application/javascript')
                elif 'localhost' in u: await r.continue_()
                else: await r.fulfill(body='', content_type='application/javascript')
            await shared.route('**/*', route)
            class One:          # every "browser" shares one context so the stand-in can relay messages
                def __init__(self, vp): self.vp = vp
                async def new_page(self):
                    pg = await shared.new_page(); await pg.set_viewport_size(self.vp); return pg
            async def ctx(**kw): return One(kw.get('viewport', {'width': 1280, 'height': 900}))
            b.new_context = ctx
        await run(b); await b.close()
    R['PASS'] = not R.get('exception') and not R['errors'] and all(c.startswith('OK') for c in R['checks']) and len(R['checks']) >= 15
    json.dump(R, open(f'{OUT}/result.json', 'w'), ensure_ascii=False, indent=1); print(json.dumps(R, ensure_ascii=False, indent=1))
    sys.exit(0 if R['PASS'] else 1)
asyncio.run(main())
