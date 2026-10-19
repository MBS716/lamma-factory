"""Puzzle drag with real touch input (CDP Input.dispatchTouchEvent -> the browser's own touch->pointer pipeline),
on a phone-sized, touch-only page. Usage: DIST=<site> python t_touch_puzzle.py [width]"""
import asyncio, sys, os, subprocess, time
from playwright.async_api import async_playwright
from common import FAKE, CLOCK, DIST
W = int(sys.argv[1]) if len(sys.argv) > 1 else 360
R = []
def check(ok, msg): R.append(ok); print(('OK   ' if ok else 'FAIL ') + msg)

async def main():
    port = 8890 + os.getpid() % 40
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(port), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
    U = f'http://localhost:{port}/'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': W, 'height': 760}, is_mobile=True, has_touch=True, device_scale_factor=2)
        await ctx.add_init_script(CLOCK)
        async def route(r):
            u = r.request.url
            if 'firebase-app-compat' in u: await r.fulfill(body=FAKE, content_type='application/javascript')
            elif 'localhost' in u: await r.continue_()
            else: await r.fulfill(body='', content_type='application/javascript')
        await ctx.route('**/*', route)
        host = await ctx.new_page(); g = await ctx.new_page()
        hc = lambda sel: host.evaluate("s => document.querySelector(s).click()", sel)
        await host.goto(U); await hc('.gact [data-game=puzzle]'); await host.wait_for_selector('.code')
        await hc('[data-opt=src][data-val="draw"]'); await hc('[data-opt=n][data-val="4"]')
        code = await host.inner_text('.code')
        await g.goto(U + '#' + code); await g.reload(); await g.wait_for_selector('#pName'); await g.fill('#pName', 'سارة')
        await g.evaluate("document.querySelector('[data-act=enter]').click()"); await host.wait_for_timeout(500)
        await hc('[data-h=start]'); await g.wait_for_selector('#pPz .tile')
        await g.bring_to_front()
        cdp = await ctx.new_cdp_session(g)
        async def touch(kind, pts):
            await cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, x, y in pts]})
        async def tile(k):
            await g.evaluate(f"document.querySelector('#pPz .pz').scrollIntoView({{block:'center'}})"); await g.wait_for_timeout(80)
            r = await g.evaluate(f"(() => {{ const r = document.querySelector('#pPz [data-k=\"{k}\"]').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }})()")
            return r
        perm = lambda: g.evaluate("[...document.querySelectorAll('#pPz .tile:not(.ghost)')].map(t => t.style.backgroundPosition).join('|')")
        ghosts = lambda: g.evaluate("document.querySelectorAll('.tile.ghost').length")
        board = lambda: g.evaluate("(() => { const r = document.querySelector('#pPz .pz').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
        async def drag(a, b_xy, steps=8, end='touchEnd', id=0):
            (x0, y0), (x1, y1) = a, b_xy
            await touch('touchStart', [(id, x0, y0)])
            for i in range(1, steps + 1): await touch('touchMove', [(id, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)]); await g.wait_for_timeout(16)
            await touch(end, [])
            await g.wait_for_timeout(350)

        # 1. drag a piece onto another square: they swap, nothing left floating
        before = await perm(); sy = await g.evaluate('scrollY')
        a, c = await tile(0), await tile(5)
        await drag(a, c)
        after = await perm(); pa, pb = before.split('|'), after.split('|')
        check(pa[0] == pb[5] and pa[5] == pb[0] and pa[1:5] == pb[1:5], 'touch drag 0 -> 5 swaps exactly those two pieces')
        check(await ghosts() == 0, 'no floating piece after a successful drop')
        # 2. drag far outside the board (over the page header) while holding: the piece stays inside the board
        before = await perm(); a = await tile(2); bx = await board()
        await touch('touchStart', [(0, a[0], a[1])])
        for i in range(1, 9): await touch('touchMove', [(0, a[0], a[1] - i * 60)]); await g.wait_for_timeout(16)
        gr = await g.evaluate("(() => { const e = document.querySelector('.tile.ghost'); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
        if os.environ.get('SHOT'): await g.screenshot(path=os.environ['SHOT'] + '_middrag.png')
        check(gr is not None, 'a piece follows the finger while dragging')
        if gr: check(gr[1] >= bx[1] - 12 and gr[3] <= bx[3] + 12 and gr[0] >= bx[0] - 12 and gr[2] <= bx[2] + 12, f'the moving piece stays inside the board (piece {[round(v) for v in gr]}, board {[round(v) for v in bx]})')
        await touch('touchEnd', []); await g.wait_for_timeout(400)
        check(await perm() == before, 'dropped outside the board: nothing changes')
        check(await ghosts() == 0, 'dropped outside the board: the piece goes back, nothing left floating')
        # 3. touch interrupted by the system (call, notification, gesture)
        before = await perm(); a, c = await tile(1), await tile(6)
        await drag(a, c, end='touchCancel')
        check(await perm() == before and await ghosts() == 0, 'interrupted touch: no change and nothing left floating')
        # 4. two fingers at once
        before = await perm(); a, c, d = await tile(3), await tile(8), await tile(12)
        await touch('touchStart', [(0, a[0], a[1])]); await touch('touchMove', [(0, a[0] + 15, a[1] + 15)])
        await touch('touchStart', [(0, a[0] + 15, a[1] + 15), (1, c[0], c[1])])
        maxg = 0
        for i in range(1, 9):
            await touch('touchMove', [(0, a[0] + (d[0] - a[0]) * i / 8, a[1] + (d[1] - a[1]) * i / 8), (1, c[0] - i * 10, c[1] - i * 10)]); await g.wait_for_timeout(16)
            maxg = max(maxg, await ghosts())
        await touch('touchEnd', [(1, c[0] - 80, c[1] - 80)]); await touch('touchEnd', []); await g.wait_for_timeout(400)
        if os.environ.get('SHOT'): await g.screenshot(path=os.environ['SHOT'] + '_twofingers.png')
        check(maxg <= 1, f'two fingers never lift two pieces (max at once: {maxg})')
        check(await ghosts() == 0, 'two fingers: nothing left floating')
        # 5. the page redraws in the middle of a drag (reconnect / new round)
        a = await tile(4)
        await touch('touchStart', [(0, a[0], a[1])])
        for i in range(1, 5): await touch('touchMove', [(0, a[0] + i * 12, a[1] + i * 12)]); await g.wait_for_timeout(16)
        await g.evaluate("document.querySelector('#pPz').innerHTML = ''")
        await touch('touchMove', [(0, a[0] + 70, a[1] + 70)]); await touch('touchEnd', []); await g.wait_for_timeout(400)
        check(await ghosts() == 0, 'page redrawn mid-drag: no orphan piece left on screen')
        # 6. enlarged mode
        await g.evaluate("P.view.pzRd = -1; playerRender()"); await g.wait_for_selector('#pPz .tile')
        await g.evaluate("document.querySelector('[data-pzbig]').click()"); await g.wait_for_timeout(300)
        bx = await board(); before = await perm()
        r0 = await g.evaluate("(() => { const r = document.querySelector('#pPz [data-k=\"0\"]').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()")
        r5 = await g.evaluate("(() => { const r = document.querySelector('#pPz [data-k=\"5\"]').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()")
        await drag(r0, r5); after = await perm(); pa, pb = before.split('|'), after.split('|')
        check(pa[0] == pb[5] and pa[5] == pb[0], 'enlarged mode: touch drag swaps the pieces')
        await touch('touchStart', [(0, r0[0], r0[1])])
        for i in range(1, 9): await touch('touchMove', [(0, r0[0] - i * 40, r0[1] + i * 90)]); await g.wait_for_timeout(16)
        gr = await g.evaluate("(() => { const e = document.querySelector('.tile.ghost'); const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()")
        check(gr[3] <= bx[3] + 12 and gr[0] >= bx[0] - 12, 'enlarged mode: the moving piece stays inside the board')
        await touch('touchEnd', []); await g.wait_for_timeout(400)
        check(await ghosts() == 0, 'enlarged mode: nothing left floating')
        await g.evaluate("document.querySelector('[data-pzbig]').click()")
        check(await g.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth"), 'no sideways scrolling on the puzzle page')
        await ctx.close(); await b.close()
    srv.terminate()
    print(f"{sum(R)}/{len(R)} passed (width {W})"); sys.exit(0 if all(R) else 1)
asyncio.run(main())
