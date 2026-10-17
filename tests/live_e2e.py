"""Real end-to-end test of a published Lamma site (real Firebase, real hosting).
A host on a desktop browser and two phones (touch) play one round of «اكتشف الفرق» per level,
find every difference, then the other four games are opened.  Usage: python tests/live_e2e.py https://mbs716.github.io/lamma/"""
import asyncio, sys, json, time
from playwright.async_api import async_playwright
URL = sys.argv[1].rstrip('/') + '/'
SHOTS = sys.argv[2] if len(sys.argv) > 2 else 'shots'
async def main():
    import os; os.makedirs(SHOTS, exist_ok=True)
    rep = {"url": URL, "rounds": [], "errors": []}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        desk = await b.new_context(viewport={'width': 1366, 'height': 900})
        ph = [await b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True, device_scale_factor=2) for _ in range(2)]
        host = await desk.new_page(); phones = [await c.new_page() for c in ph]
        for pg, n in [(host, 'host'), (phones[0], 'phone1'), (phones[1], 'phone2')]:
            pg.on('pageerror', lambda e, n=n: rep['errors'].append(f'{n}: {e}'))
        await host.goto(URL + f'?t={int(time.time())}', wait_until='networkidle')
        rep['footer_tiger'] = await host.locator('text=TIGER').count() > 0
        rep['footer_id'] = await host.locator('text=10000003').count() > 0
        await host.click('[data-game=diff]'); await host.wait_for_selector('.code', timeout=20000)
        code = (await host.inner_text('.code')).strip().replace(' ', ''); rep['code'] = code
        for pg, nm in zip(phones, ['جوال 1', 'جوال 2']):
            await pg.goto(URL + '#' + code, wait_until='networkidle'); await pg.wait_for_selector('#pName', timeout=20000)
            await pg.fill('#pName', nm); await pg.click('[data-act=enter]')
        await host.wait_for_function('document.querySelectorAll(".chip").length >= 2 || document.body.innerText.includes("جوال 2")', timeout=20000)
        lib = await host.evaluate('SPOT_LIB'); rep['library'] = len(lib)
        rep['levels_in_library'] = [sum(1 for x in lib if x['level'] == l) for l in range(3)]
        for lv in (0, 1, 2):
            if await host.locator('[data-h=lobby]').count(): await host.click('[data-h=lobby]')
            await host.wait_for_selector('[data-opt=lv]', timeout=10000)
            await host.click(f'[data-opt=lv][data-val="{lv}"]'); await host.click('[data-h=start]')
            for pg in phones:
                await pg.wait_for_selector('#pDf .dfimg img', timeout=30000)
                await pg.wait_for_function('[...document.querySelectorAll("#pDf img")].every(i=>i.complete&&i.naturalWidth>1000)', timeout=30000)
            pair = await host.evaluate('H.s.pair'); W, H = pair['w'], pair['h']
            srcs = await phones[0].eval_on_selector_all('#pDf img', 'e=>e.map(i=>i.currentSrc)')
            box = await phones[0].locator('#pDf .dfimg >> nth=1').bounding_box()
            for d in pair['diffs']:
                await phones[0].touchscreen.tap(box['x'] + d['x'] / W * box['width'], box['y'] + d['y'] / H * box['height']); await phones[0].wait_for_timeout(150)
            box2 = await phones[1].locator('#pDf .dfimg >> nth=0').bounding_box()
            for d in pair['diffs'][:2]:
                await phones[1].touchscreen.tap(box2['x'] + d['x'] / W * box2['width'], box2['y'] + d['y'] / H * box2['height']); await phones[1].wait_for_timeout(150)
            await host.wait_for_timeout(2500)
            r = {"level_asked": lv, "level_got": pair['level'], "title": pair['title'], "diffs": len(pair['diffs']),
                 "image": srcs[0].split('/')[-1], "phone1": await phones[0].inner_text('#dfCount'), "phone2": await phones[1].inner_text('#dfCount'),
                 "host_race": (await host.inner_text('#dfSide'))[:120].replace('\n', ' | ')}
            rep['rounds'].append(r)
            await phones[0].screenshot(path=f'{SHOTS}/phone_level{lv}.png', full_page=True)
            await host.screenshot(path=f'{SHOTS}/host_level{lv}.png')
        for g in ('quiz', 'letters', 'wheel', 'puzzle'):
            await host.goto(URL + f'?t={int(time.time())}', wait_until='networkidle'); await host.click(f'[data-game={g}]')
            await host.wait_for_selector('.code', timeout=20000); rep['game_' + g] = 'ok'
        await host.goto(URL, wait_until='networkidle'); await host.screenshot(path=f'{SHOTS}/home.png', full_page=True)
        await b.close()
    ok = (rep['library'] >= 20 and all(r['level_got'] == r['level_asked'] and r['phone1'].strip() == f"{r['diffs']} / {r['diffs']}" and r['phone2'].strip() == f"2 / {r['diffs']}" for r in rep['rounds'])
          and rep['footer_tiger'] and rep['footer_id'] and not rep['errors'])
    rep['PASS'] = ok
    print(json.dumps(rep, ensure_ascii=False, indent=1)); json.dump(rep, open(f'{SHOTS}/result.json', 'w'), ensure_ascii=False, indent=1)
    sys.exit(0 if ok else 1)
asyncio.run(main())
