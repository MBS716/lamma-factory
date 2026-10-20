import asyncio, subprocess, time, json, re, os
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
FAKE = open(os.path.join(HERE, 'fakefb.js')).read()
CLOCK = "(()=>{const n=Date.now.bind(Date);Date.now=()=>n()+(window.__off||0);})();"
DIST = os.environ.get('DIST', '/home/claude/lamma/dist')
class Env:
    def __init__(self, port=8790): self.port = port; self.errs = []; self.U = f'http://localhost:{port}/'
    async def __aenter__(self):
        self.srv = subprocess.Popen(['python3', '-m', 'http.server', str(self.port), '-d', DIST], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
        self.pw = await async_playwright().start(); self.b = await self.pw.chromium.launch()
        self.ctx = await self.b.new_context(has_touch=True); await self.ctx.add_init_script(CLOCK)
        async def route(r):
            u = r.request.url
            if 'firebase-app-compat' in u: await r.fulfill(body=FAKE, content_type='application/javascript')
            elif 'localhost' in u: await r.continue_()
            else: await r.fulfill(body='', content_type='application/javascript')
        await self.ctx.route('**/*', route)
        return self
    async def page(self, name, w, h):
        pg = await self.ctx.new_page(); await pg.set_viewport_size({'width': w, 'height': h})
        pg.on('pageerror', lambda e: self.errs.append(f'{name}: {e}')); return pg
    async def start(self, host, game, opts=None):
        await host.goto(self.U); await host.click(f'.gact [data-game={game}]'); await host.wait_for_selector('.code', timeout=8000)
        for k, v in (opts or {}).items(): await host.click(f'[data-opt={k}][data-val="{v}"]')
        return await host.inner_text('.code')
    async def join(self, pg, code, name, team=None):
        await pg.goto(self.U + '#' + code); await pg.reload(); await pg.wait_for_selector('#pName', timeout=8000); await pg.fill('#pName', name)
        if team: await pg.click(f'[data-team={team}]')
        await pg.click('[data-act=enter]')
    async def __aexit__(self, *a):
        await self.b.close(); await self.pw.stop(); self.srv.terminate()
