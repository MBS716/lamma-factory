"""Mobile layout audit: host AND player on phone-sized, touch-enabled pages, every game in its playing state.
Usage: DIST=<built site> python audit_mobile.py <out folder>
Finds: sideways scrolling, elements sticking out of the screen, text squeezed into narrow columns (words broken
vertically), interactive elements covering each other, too-small tap targets. Takes a screenshot of every state."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
from common import FAKE, CLOCK, DIST
import subprocess, time
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
WIDTHS = [320, 360, 390, 412, 430]
PROBE = r"""() => {
  const W = document.documentElement.clientWidth, out = {sideways: document.documentElement.scrollWidth - W, outside: [], squeezed: [], overlaps: [], small: []};
  const vis = e => { const s = getComputedStyle(e); if (s.visibility === 'hidden' || s.display === 'none') return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const name = e => (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '') + ' «' + (e.innerText || '').trim().slice(0, 18) + '»');
  const inScroll = e => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; };
  for (const e of document.querySelectorAll('#app *')) {
    if (!vis(e) || e.closest('.modal:not([open])') || e.closest('[hidden]')) continue;
    const r = e.getBoundingClientRect();
    if ((r.right > W + 1 || r.left < -1) && !inScroll(e) && !e.closest('.dfzoom') && !e.classList.contains('ghost')) out.outside.push(name(e) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
    const own = [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (own.length >= 6 && /\s/.test(own) === false && own.length > 10 && r.width < own.length * 4) out.squeezed.push(name(e) + ` w=${Math.round(r.width)}`);
    if (own.length >= 8) { const lh = parseFloat(getComputedStyle(e).lineHeight) || 20; const words = own.split(/\s+/).length; if (r.height / lh > Math.max(3, words * 0.9) && r.width < 120) out.squeezed.push(name(e) + ` ${Math.round(r.width)}x${Math.round(r.height)}`); }
  }
  const ctrls = [...document.querySelectorAll('#app button, #app input, #app a')].filter(e => vis(e) && !e.closest('[hidden]') && !e.closest('.hexboard') && !e.closest('.pz'));
  for (const e of ctrls) { const r = e.getBoundingClientRect(); if (r.height < 32 || r.width < 32) out.small.push(name(e) + ` ${Math.round(r.width)}x${Math.round(r.height)}`); }
  for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
    const a = ctrls[i].getBoundingClientRect(), b = ctrls[j].getBoundingClientRect();
    if (ctrls[i].contains(ctrls[j]) || ctrls[j].contains(ctrls[i])) continue;
    const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (ix > 4 && iy > 4) out.overlaps.push(name(ctrls[i]) + ' × ' + name(ctrls[j]));
  }
  out.tiny = [];
  for (const e of document.querySelectorAll('#app .hexboard, #app .pz, #app .wheelbox, #app .dfimg')) { if (!vis(e)) continue; const r = e.getBoundingClientRect(); if (r.width < Math.min(W * 0.7, 260)) out.tiny.push(name(e) + ` w=${Math.round(r.width)}`); }
  for (const k of ['outside', 'squeezed', 'overlaps', 'small', 'tiny']) out[k] = [...new Set(out[k])].slice(0, 12);
  return out;
}"""

async def main():
    port = 8830 + (os.getpid() % 50)
    srv = subprocess.Popen(['python3', '-m', 'http.server', str(port), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
    U = f'http://localhost:{port}/'; report = {}
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def route(r):
            u = r.request.url
            if 'firebase-app-compat' in u: await r.fulfill(body=FAKE, content_type='application/javascript')
            elif 'localhost' in u: await r.continue_()
            else: await r.fulfill(body='', content_type='application/javascript')
        for W in WIDTHS + [1280]:
            mobile = W < 1000
            ctx = await b.new_context(viewport={'width': W, 'height': 780 if mobile else 900}, is_mobile=mobile, has_touch=mobile, device_scale_factor=2 if mobile else 1)
            await ctx.add_init_script(CLOCK); await ctx.route('**/*', route)
            host = await ctx.new_page(); g = await ctx.new_page(); o = await ctx.new_page()
            async def snap(pg, tag):
                await pg.wait_for_timeout(400)
                r = await pg.evaluate(PROBE); report[f'{W}/{tag}'] = r
                await pg.screenshot(path=f'{OUT}/{W}_{tag}.png', full_page=True)
            async def hc(sel): await host.evaluate("s => document.querySelector(s).click()", sel)
            async def start(game, opts=None):
                await host.goto(U); await hc(f'.gact [data-game={game}]'); await host.wait_for_selector('.code', timeout=8000)
                for k, v in (opts or {}).items(): await hc(f'[data-opt={k}][data-val="{v}"]')
                return await host.inner_text('.code')
            async def join(pg, code, name, team=None):
                await pg.goto(U + '#' + code); await pg.reload(); await pg.wait_for_selector('#pName', timeout=8000); await pg.fill('#pName', name)
                if team: await pg.evaluate("s => document.querySelector(s).click()", f'[data-team={team}]')
                await pg.evaluate("document.querySelector('[data-act=enter]').click()")
            await host.goto(U); await snap(host, 'home')
            # letters
            code = await start('letters'); await join(g, code, 'سارة', 'g'); await join(o, code, 'خالد', 'o'); await host.wait_for_timeout(400)
            await snap(host, 'letters_host_lobby')
            await hc('[data-h=start]'); await host.wait_for_function('H.s.st === "pick"')
            await snap(host, 'letters_host_pick')
            await hc('[data-h=rand]'); await host.wait_for_function('H.s.st === "ask"')
            await snap(host, 'letters_host_ask'); await snap(g, 'letters_player_ask')
            await hc('[data-h=stop]'); await host.wait_for_function('H.s.st === "judge"'); await snap(host, 'letters_host_judge')
            await hc('[data-h=ok]'); await snap(host, 'letters_host_done')
            # wheel v3: a long card (speed challenge face-off) and the box
            code = await start('wheel', {'goal': 1500}); await join(g, code, 'سارة', 'g'); await host.wait_for_timeout(300)
            await hc('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"')
            await snap(host, 'wheel_host_spin'); await snap(g, 'wheel_player_spin')
            await host.evaluate('W3.act(H.s, H.priv.wp, "spin", null, W3.tok(H.s), Wheel.env()); H.s.seg = "speed"; W3.act(H.s, H.priv.wp, "land", null, W3.tok(H.s), Wheel.env()); pushHost()')
            await snap(host, 'wheel_host_q'); await snap(g, 'wheel_player_q')
            await host.evaluate('W3.act(H.s, H.priv.wp, "sx", null, W3.tok(H.s), Wheel.env()); W3.act(H.s, H.priv.wp, "next", null, W3.tok(H.s), Wheel.env()); W3.act(H.s, H.priv.wp, "spin", null, W3.tok(H.s), Wheel.env()); H.s.seg = "l2"; W3.act(H.s, H.priv.wp, "land", null, W3.tok(H.s), Wheel.env()); H.s.cur = {k:"l2", st:"choose", a:"bet", b:"m250"}; pushHost()')
            await snap(host, 'wheel_host_l2'); await snap(g, 'wheel_player_l2')
            # quiz
            code = await start('quiz'); await join(g, code, 'سارة'); await host.wait_for_timeout(300)
            await hc('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"'); await g.wait_for_selector('[data-ans]')
            await snap(host, 'quiz_host_q'); await snap(g, 'quiz_player_q')
            # spot
            code = await start('diff'); await join(g, code, 'سارة'); await host.wait_for_timeout(300)
            await hc('[data-h=start]'); await host.wait_for_function('H.s.ph === "play"', timeout=15000); await g.wait_for_selector('#pDf .dfimg img', timeout=15000)
            await snap(host, 'spot_host_play'); await snap(g, 'spot_player_play')
            # puzzle
            code = await start('puzzle', {'src': 'draw', 'n': 4}); await join(g, code, 'سارة'); await host.wait_for_timeout(300)
            await snap(host, 'puzzle_host_lobby')
            await hc('[data-h=start]'); await g.wait_for_selector('#pPz .tile', timeout=8000)
            await snap(host, 'puzzle_host_play'); await snap(g, 'puzzle_player_play')
            await ctx.close()
        await b.close()
    srv.terminate()
    json.dump(report, open(f'{OUT}/audit.json', 'w'), ensure_ascii=False, indent=1)
    bad = 0
    for k, r in report.items():
        issues = [f"sideways {r['sideways']}px"] if r['sideways'] > 0 else []
        for t in ('outside', 'squeezed', 'overlaps', 'tiny'):
            if r[t]: issues.append(f"{t}: {r[t][:3]}")
        if issues: bad += 1; print('ISSUE', k, ' | '.join(issues))
    print(f'{len(report) - bad}/{len(report)} screens clean (small tap targets listed in audit.json)')
asyncio.run(main())
