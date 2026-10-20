"""Every wheel slice shows its icon AND its name/value, inside the slice, readable on computer and phone.
Serves the real Lalezar font locally (as Google Fonts would) so the measurements match the live site.
Usage: FONTS=<folder with lalezar-*.woff2 and ibm-plex-sans-arabic-*.woff2> python t_wheel3_labels.py <out folder>"""
import asyncio, os, sys, json, subprocess, time
from playwright.async_api import async_playwright
from common import FAKE, CLOCK, DIST
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True); FD = os.environ['FONTS']
R = []
def check(ok, msg): R.append(ok); print(('OK   ' if ok else 'FAIL ') + msg)
CSS = "".join(f"@font-face{{font-family:'{fam}';font-weight:{w};src:url(/__f/{f}) format('woff2');unicode-range:{ur}}}"
              for fam, w, f, ur in [("Lalezar", 400, "lalezar-arabic-400-normal.woff2", "U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF"),
                                    ("Lalezar", 400, "lalezar-latin-400-normal.woff2", "U+0000-00FF,U+2000-206F,U+2212"),
                                    ("IBM Plex Sans Arabic", 400, "ibm-plex-sans-arabic-arabic-400-normal.woff2", "U+0600-06FF,U+FB50-FDFF,U+FE70-FEFF"),
                                    ("IBM Plex Sans Arabic", 700, "ibm-plex-sans-arabic-arabic-700-normal.woff2", "U+0600-06FF,U+FB50-FDFF,U+FE70-FEFF")])
async def main():
    port = 8850 + os.getpid() % 30
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(port), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
    U = f'http://localhost:{port}/'; rows = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def route(r):
            u = r.request.url
            if 'firebase-app-compat' in u: await r.fulfill(body=FAKE, content_type='application/javascript')
            elif '/__f/' in u: await r.fulfill(body=open(os.path.normpath(os.path.join(FD, u.split('/__f/')[1])), 'rb').read(), content_type='font/woff2', headers={'Access-Control-Allow-Origin': '*'})
            elif 'fonts.googleapis.com' in u: await r.fulfill(body=CSS, content_type='text/css', headers={'Access-Control-Allow-Origin': '*'})
            elif 'localhost' in u: await r.continue_()
            else: await r.fulfill(body='', content_type='application/javascript')
        for label, vw, mobile in (('computer', 1280, False), ('phone 360', 360, True), ('phone 390', 390, True)):
            ctx = await b.new_context(viewport={'width': vw, 'height': 860}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2)
            await ctx.add_init_script(CLOCK); await ctx.add_init_script("try{localStorage.setItem('lm-w-mot','0')}catch(e){}"); await ctx.route('**/*', route)
            host = await ctx.new_page(); pl = await ctx.new_page()
            for mode in ('classic', 'hype', 'legend'):
                await host.goto(U); await host.evaluate("document.querySelector('.gact [data-game=wheel]').click()"); await host.wait_for_selector('.code', timeout=8000)
                await host.evaluate(f"""document.querySelector('[data-opt=goal][data-val="1500"]').click(); document.querySelector('[data-opt=mode][data-val="{mode}"]').click()""")
                code = await host.inner_text('.code')
                await pl.goto(U + '#' + code); await pl.reload(); await pl.wait_for_selector('#pName', timeout=8000); await pl.fill('#pName', 'سارة')
                await pl.evaluate("document.querySelector('[data-team=g]').click(); document.querySelector('[data-act=enter]').click()")
                await host.wait_for_timeout(400); await host.evaluate("document.querySelector('[data-h=start]').click()"); await host.wait_for_function('H.s.ph === "play"')
                for who, pg in (('host', host), ('player', pl)):
                    await pg.wait_for_selector('.wheelbox canvas', timeout=8000); await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(700)
                    fam = await pg.evaluate('document.fonts.check(\'30px "Lalezar"\')')
                    info = await pg.evaluate('({lab: window.__w3lab, w: document.querySelector(".wheelbox canvas").getBoundingClientRect().width, n: W3.layout(H ? H.s : findHost().presence.s).length})')
                    labs, w = info['lab'], info['w']; px = [l['f'] * w / 640 for l in labs]
                    rows.append((label, who, mode, round(w), min(px), [l for l in labs if l['f'] * w / 640 == min(px)][0]['txt']))
                    if mode == 'classic' or (mode == 'legend'):
                        await pg.locator('.wheelbox').screenshot(path=f'{OUT}/{label.replace(" ", "")}_{who}_{mode}.png')
                    check(fam, f'{label} {who} {mode}: the real Lalezar font is used for measuring')
                    check(len(labs) == info['n'] and all(l['txt'] for l in labs), f'{label} {who} {mode}: all {info["n"]} slices have a name or value')
                    check(sum(1 for l in labs if l['icon']) == len(labs), f'{label} {who} {mode}: all slices keep their icon ({sum(1 for l in labs if l["icon"])}/{len(labs)})')
                    check(all(l['up'] for l in labs), f'{label} {who} {mode}: at rest no label is upside down ({sum(1 for l in labs if not l["up"])} upside down)')
                # three real spins: after each stop every label must read upright on both screens
                bad = 0
                for i in range(3):
                    await host.evaluate("document.querySelector('[data-w=spin]').click()"); await host.wait_for_function('H.s.stage === "card"', timeout=8000); await host.wait_for_timeout(900)
                    for pg in (host, pl):
                        await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(200)
                        bad += await pg.evaluate('(window.__w3lab || []).filter(l => !l.up).length')
                    if i == 0 and mode == 'hype': await pl.locator('.wheelbox').screenshot(path=f'{OUT}/{label.replace(" ", "")}_player_{mode}_after_spin.png')
                    if i == 0 and label == 'computer': await host.screenshot(path=f'{OUT}/final_computer_host_{mode}.png')
                    if i == 0 and label == 'phone 390': await pl.screenshot(path=f'{OUT}/final_phone_player_{mode}.png'); await host.screenshot(path=f'{OUT}/final_phone_host_{mode}.png')
                    await host.evaluate("(() => { const m = W3.moves(H.s); const a = m.includes('next') ? 'next' : null; if (!a){ H.s.cur = null; H.s.stage = 'spin'; pushHost(); } else W3.act(H.s, H.priv.wp, 'next', null, W3.tok(H.s), Wheel.env()) || 0; pushHost(); })()")
                check(bad == 0, f'{label} {mode}: after 3 real spins no label is upside down on host or phone ({bad})')
                await host.evaluate("document.querySelector('#endBtn').click()"); await host.wait_for_timeout(300)
            await ctx.close()
        await b.close()
    srv.terminate()
    print('\nsmallest label on screen (CSS px):')
    for r in rows: print(f'  {r[0]:10} {r[1]:6} {r[2]:7} wheel {r[3]}px  smallest label {r[4]:.1f}px  ({r[5]})')
    for r in rows:
        need = 13 if r[0] == 'computer' and r[1] == 'host' else 10
        check(r[4] >= need, f'{r[0]} {r[1]} {r[2]}: smallest label {r[4]:.1f}px >= {need}px')
    json.dump(rows, open(f'{OUT}/labels.json', 'w'), ensure_ascii=False)
    print(f"{sum(R)}/{len(R)} passed")
asyncio.run(main())
