"""The same Env as tests/local/common.py, for a REAL site (the preview on GitHub Pages, the real database with today's
published rules): every device is its own browser context (own storage, own anonymous sign-in); pages given the same
device share one context. The clock offset (window.__off) works as in the local tests. Used by run_live.sh, which copies
this file next to the spot tests as common.py."""
import os
from playwright.async_api import async_playwright
CLOCK = "(()=>{const n=Date.now.bind(Date);Date.now=()=>n()+(window.__off||0);})();"
URL = os.environ['LIVE_URL'].rstrip('/') + '/'
DIST = os.environ.get('DIST', '')             # the served folder in this checkout (for checks on the files themselves)
class Env:
    def __init__(self, port=None, autogo=True): self.errs = []; self.U = URL; self.ctxs = {}
    async def __aenter__(self):
        self.pw = await async_playwright().start(); self.b = await self.pw.chromium.launch(); return self
    async def page(self, name, w, h, device=None):
        dev = device or name
        if dev not in self.ctxs:
            ctx = await self.b.new_context(has_touch=True); await ctx.add_init_script(CLOCK); self.ctxs[dev] = ctx
        pg = await self.ctxs[dev].new_page(); await pg.set_viewport_size({'width': w, 'height': h})
        pg.set_default_timeout(45000)
        pg.on('pageerror', lambda e: self.errs.append(f'{name}: {e}')); return pg
    async def start(self, host, game, opts=None):
        await host.goto(self.U); await host.wait_for_function('typeof AUTH_UID !== "undefined" && !window.__resuming', timeout=45000); await host.wait_for_timeout(1500)
        if await host.is_visible('#endBtn'): await host.click('#endBtn'); await host.wait_for_timeout(600)
        await host.click(f'.gact [data-game={game}]'); await host.wait_for_selector('.code', timeout=45000)
        for k, v in (opts or {}).items(): await host.click(f'[data-opt={k}][data-val="{v}"]')
        return await host.inner_text('.code')
    async def join(self, pg, code, name, team=None):
        await pg.goto(self.U + '#' + code); await pg.wait_for_selector('#pName', timeout=45000); await pg.fill('#pName', name)
        if team: await pg.click(f'[data-team={team}]')
        await pg.click('[data-act=enter]'); await pg.wait_for_timeout(1200)
    async def __aexit__(self, *a):
        await self.b.close(); await self.pw.stop()
