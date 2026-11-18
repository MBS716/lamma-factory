"""Spot the difference v5, phase 3: the host chooses the picture (the default), the automatic choice stays as an option.
The library shows small copies of the ORIGINAL picture only (checked pixel by pixel against both pictures), the level,
the number of differences, the scene's name and the picture's state for this room (new / seen before on a device of the
room / used in this competition); a picture already used asks first. A host and 3 players (phone 390, phone 360, computer),
then the host on a phone-sized screen."""
import asyncio, json, os, sys
from common import Env, DIST
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
S = lambda pg: pg.evaluate('JSON.parse(JSON.stringify(H.s))')
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots')

IDX = json.load(open(os.path.join(DIST, 'spot', 'catalog', 'index.json')))
TOTAL, PER = IDX['total'], IDX['levels']

def thumbs_from_original():
    """every small copy is made from picture a (the original), never from b (the changed one)"""
    from PIL import Image, ImageChops, ImageStat
    bad, n = [], 0
    for f in sorted(os.listdir(os.path.join(DIST, 'spot', 'thumbs'))):
        i = f[:-5]; t = Image.open(os.path.join(DIST, 'spot', 'thumbs', f)).convert('RGB'); n += 1
        d = {}
        for k in 'ab':
            im = Image.open(os.path.join(DIST, 'spot', 'pairs', i + k + '.webp')).convert('RGB').resize(t.size, Image.LANCZOS)
            d[k] = sum(ImageStat.Stat(ImageChops.difference(t, im)).mean)
        if not d['a'] < d['b']: bad.append((i, d))
    return n, bad

def cells(d):
    if len(d) < 5: return [(d[0], d[1])]
    x0, y0, c, rs = d[4]
    return [((x0 + a) * 16 + 8, (y0 + j) * 16 + 8) for j, r in enumerate(rs.split('.')) for a in range(c) if int(r or '0', 16) >> a & 1]

async def over_or_dump(host, t=20000):
    """the round should end: if it does not, print what the referee has (to see why) and fail"""
    try: await host.wait_for_function('H.s.ph === "over"', timeout=t)
    except Exception:
        print('DEBUG', await host.evaluate('JSON.stringify({ph:H.s.ph, nd:H.s.nd, pl:H.s.pl, pf:H.priv.pf, q:(H.priv.dfq||[]).length, uns:H.priv.unsealing, winAt:H.priv.winAt, now:srvNow()})'), flush=True); raise

async def main():
    os.makedirs(SHOTS, exist_ok=True)
    n, bad = thumbs_from_original()
    check(n == TOTAL and not bad, f'{n} small copies, each made from the original picture, not the changed one {bad[:2]}')
    async with Env(8812) as E:
        host = await E.page('host', 1280, 900)
        A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 1280, 860)
        code = await E.start(host, 'diff', {'lim': 300})
        await E.join(A, code, 'صالح'); await E.join(B, code, 'تافير'); await E.join(C, code, 'نورة'); await host.wait_for_timeout(700)
        s = await S(host)
        check(s['o']['pk'] == 'host' and 'اختر الصورة وابدأ' in await host.inner_text('#hostMain') and 'يختارها المقدّم' in await host.inner_text('.optbox'),
              'default: «اختيار الصورة: يختارها المقدّم»; the start button reads «اختر الصورة وابدأ»')
        seen_id = 's4-e1'
        await host.evaluate(f'rememberLocal({json.dumps(seen_id)})')         # a picture this device played in an earlier game
        await host.click('[data-h=start]'); await host.wait_for_selector('.dfpk-c', timeout=15000); await host.wait_for_timeout(500)
        s = await S(host)
        check(s['ph'] == 'lobby' and s['pick'] == 1, 'the library opens on the host only; the room stays in the lobby')
        for pg, nm in ((A, 'phone 390'), (B, 'phone 360'), (C, 'computer')):
            await pg.wait_for_function('document.querySelector("#playerMain").innerText.includes("المقدّم يختار صورة الجولة")', timeout=5000)
        check(True, 'the phones show «المقدّم يختار صورة الجولة…»')
        cards = await host.evaluate('[...document.querySelectorAll(".dfpk-c")].map(c => ({id:c.dataset.id, t:c.querySelector(".dfpk-t").textContent, m:c.querySelector(".dfpk-m").textContent, s:c.querySelector(".dfpk-s").textContent, img:c.querySelector("img").getAttribute("src")}))')
        check(len(cards) == TOTAL and all(c['img'] == f'spot/thumbs/{c["id"]}.webp' for c in cards), f'«الكل»: {TOTAL} cards, each with its small copy ({len(cards)})')
        check(all(c['t'] and ('سهل · 5 اختلافات' in c['m'] or 'متوسط · 8 اختلافات' in c['m'] or 'صعب · 12 اختلافًا' in c['m']) for c in cards), 'each card: scene name, level and number of differences')
        st = {c['id']: c['s'] for c in cards}
        check(st[seen_id] == 'شوهدت سابقًا على أجهزة الغرفة' and sum(v == 'جديدة' for v in st.values()) == TOTAL - 1, 'states: the picture played before on this device «شوهدت سابقًا على أجهزة الغرفة», the rest «جديدة»')
        html = await host.inner_html('#hostMain')
        check('b.webp' not in html and 'pairs/' not in html and await host.locator('#hostMain .dfm').count() == 0, 'the library never shows the changed picture or any mark of a difference')
        await host.screenshot(path=f'{SHOTS}/v5_host_picker.png', full_page=False)
        # level filter and search
        await host.click('[data-h=pklv][data-lv="0"]'); await host.wait_for_timeout(300)
        check(await host.locator('.dfpk-c').count() == PER[0], f'level «سهل»: {PER[0]} cards')
        await host.fill('#dfq', 'قوارب'); await host.wait_for_timeout(300)
        vis = await host.evaluate('[...document.querySelectorAll(".dfpk-c")].filter(c => !c.hidden).map(c => c.querySelector(".dfpk-t").textContent)')
        check(vis and all('قوارب' in v for v in vis), f'search by the scene\'s name: {vis}')
        await host.evaluate('renderHost()'); await E.join(await E.page('D', 390, 844), code, 'ليلى'); await host.wait_for_timeout(1200)
        check(await host.input_value('#dfq') == 'قوارب' and len(await host.evaluate('[...document.querySelectorAll(".dfpk-c")].filter(c => !c.hidden)')) == len(vis),
              'the search stays while the screen updates (a player joined meanwhile)')
        await host.fill('#dfq', ''); await host.wait_for_timeout(200)
        # choose one picture
        pick = next(c['id'] for c in cards if c['id'] != seen_id and 'سهل' in c['m'])
        await host.click(f'.dfpk-c[data-id="{pick}"]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000); s = await S(host)
        check(s['pair']['id'] == pick and s['pick'] == 0 and s['nd'] == 5, f'the round starts with the chosen picture ({pick})')
        players = [A, B, C]
        for pg in players: await pg.wait_for_selector('#pDf .dfimg img', timeout=15000)
        D = await host.evaluate('H.priv.dfs'); W, Hh = s['pair']['w'], s['pair']['h']
        async def tap(pg, i):
            d = D[i]; x, y = min(cells(d), key=lambda q: (q[0] - d[0]) ** 2 + (q[1] - d[1]) ** 2)
            await pg.locator('#pDf .dfimg >> nth=1').scroll_into_view_if_needed(); b = await pg.locator('#pDf .dfimg >> nth=1').bounding_box(); await pg.touchscreen.tap(b['x'] + x / W * b['width'], b['y'] + y / Hh * b['height']); await pg.wait_for_timeout(350)
        await host.wait_for_timeout(900)
        for i in range(5): await tap(A, i)
        await over_or_dump(host)
        # next round: the library again, the results stay on the phones
        await host.click('[data-h=go]'); await host.wait_for_selector('.dfpk-c', timeout=15000); await host.wait_for_timeout(400)
        await A.wait_for_function('document.querySelector("#playerMain").innerText.includes("المقدّم يختار صورة الجولة التالية")', timeout=5000)
        check(await A.locator('#dfHeroCard').count() == 1, 'while the host chooses, the phones keep the results and read «المقدّم يختار صورة الجولة التالية…»')
        await host.click('[data-h=pklv][data-lv="3"]'); await host.wait_for_timeout(300)
        su = await host.inner_text(f'.dfpk-c[data-id="{pick}"] .dfpk-s')
        check(su == 'استُخدمت في هذه المنافسة', f'the picture just played: «{su}»')
        first = await host.evaluate('document.querySelector(".dfpk-c").dataset.id')
        check(first != pick, 'new pictures come first, used ones last')
        await host.click(f'.dfpk-c[data-id="{pick}"]'); await host.wait_for_selector('#dfPkAsk', timeout=3000)
        check('استُخدمت في هذه المنافسة' in await host.inner_text('#dfPkAsk') and (await S(host))['ph'] == 'over', 'choosing it again asks first (the round does not start)')
        await host.screenshot(path=f'{SHOTS}/v5_host_picker_reuse.png', full_page=False)
        await host.click('[data-h=pkno]'); await host.wait_for_timeout(300)
        check(await host.locator('#dfPkAsk').count() == 0 and (await S(host))['ph'] == 'over', '«إلغاء»: nothing starts')
        await host.click(f'.dfpk-c[data-id="{pick}"]'); await host.click('[data-h=pkok]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        check((await S(host))['pair']['id'] == pick, 'after «نعم، استخدمها» the same picture is played again')
        # the library during a round: the round goes on, «رجوع» comes back to it
        await host.click('#dfAct [data-h=go]'); await host.wait_for_selector('.dfpk-c', timeout=15000)
        check((await S(host))['ph'] == 'play', 'opening the library during a round does not stop the round')
        await host.click('[data-h=pkclose]'); await host.wait_for_selector('#hostMain .df-holder .dfimg img', timeout=15000)
        s = await S(host); check(s['ph'] == 'play' and s['pick'] == 0 and s['pair']['id'] == pick, '«رجوع»: back to the same round, pictures shown again')
        # a reload with the library open
        await host.click('#dfAct [data-h=go]'); await host.wait_for_selector('.dfpk-c', timeout=15000)
        await host.reload(); await host.wait_for_function('!window.__resuming && H && H.code && H.s.ph === "play"', timeout=20000); await host.wait_for_timeout(1500)
        check((await S(host))['pick'] == 0 and await host.locator('.dfpk-c').count() == 0, 'host reloads with the library open: back to the round, the phones are not left on «يختار»')
        # a new competition: «used» starts again (the picture is then «seen before»)
        await host.click('#dfAct [data-h=nc]'); await host.click('.dfnc [data-h=ncgo]'); await host.wait_for_function('H.s.cn === 2', timeout=6000)
        await host.click('[data-h=start]'); await host.wait_for_selector('.dfpk-c', timeout=15000); await host.wait_for_timeout(500)
        check(await host.inner_text(f'.dfpk-c[data-id="{pick}"] .dfpk-s') == 'شوهدت سابقًا على أجهزة الغرفة', 'new competition: the picture is no longer «used in this competition», it is «seen before»')
        await host.click('[data-h=pkauto]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        s = await S(host); check(s['ph'] == 'play' and s['pick'] == 0 and s['pair'], f'«اختيار تلقائي لهذه الجولة» starts a round ({s["pair"]["id"]})')
        # the automatic choice as before
        await host.click('#dfAct [data-h=lobby]'); await host.click('[data-opt=pk][data-val=auto]'); await host.wait_for_timeout(200)
        check('ابدأ الجولة' in await host.inner_text('#hostMain [data-h=start]'), 'setting «تلقائي»: the button reads «ابدأ الجولة»')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000)
        check(await host.locator('.dfpk-c').count() == 0 and (await S(host))['pick'] == 0, '«تلقائي»: the round starts at once, no library (as before)')
        # the host on a phone-sized screen
        await host.click('#dfAct [data-h=lobby]'); await host.click('[data-opt=pk][data-val=host]'); await host.set_viewport_size({'width': 390, 'height': 844})
        await host.click('[data-h=start]'); await host.wait_for_selector('.dfpk-c', timeout=15000); await host.wait_for_timeout(600)
        sw = await host.evaluate('document.documentElement.scrollWidth'); check(sw <= 390, f'library on a 390 px screen: no horizontal scroll ({sw})')
        cw = await host.evaluate('document.querySelector(".dfpk-c").getBoundingClientRect().width'); check(cw >= 150, f'two cards a row on a phone, each {round(cw)} px wide')
        await host.screenshot(path=f'{SHOTS}/v5_host_picker_phone.png', full_page=False)
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    k = sum(ok for ok, _ in R); print(f'\n{k}/{len(R)} passed'); sys.exit(0 if k == len(R) else 1)

asyncio.run(main())
