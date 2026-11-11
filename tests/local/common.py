import asyncio, subprocess, time, json, re, os
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
FAKE = open(os.path.join(HERE, 'fakefb.js')).read()
if os.environ.get('FAKE_UID_PER_DEVICE'): FAKE = "localStorage.setItem('fakeuidper', '1');\n" + FAKE
DEVICE = r"""(() => { const dev = '__DEV__', P = Storage.prototype, g = P.getItem, st = P.setItem, rm = P.removeItem;
  const k = (self, key) => self === window.localStorage && !String(key).startsWith('fake') ? 'dev:' + dev + ':' + key : key;
  P.getItem = function(key){ return g.call(this, k(this, key)); }; P.setItem = function(key, v){ return st.call(this, k(this, key), v); }; P.removeItem = function(key){ return rm.call(this, k(this, key)); };
  window.__device = dev; })();"""
CLOCK = "(()=>{const n=Date.now.bind(Date);Date.now=()=>n()+(window.__off||0);})();"
DIST = os.environ.get('DIST', '/home/claude/lamma/dist')
# «أكملها»: a question waits in its reading time until the host presses «ابدأ وقت الإجابة». The older tests play the host
# who presses it at once (this clicks the real button); the timer test (t_akml_timer.py) presses it itself.
AUTOGO = "setInterval(() => { const b = !window.__noGo && document.querySelector('[data-h=akgo]:not([disabled])'); if (b) b.click(); }, 400);"
class Env:
    def __init__(self, port=8790, autogo=True): self.port = port; self.errs = []; self.U = f'http://localhost:{port}/'; self.autogo = autogo
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
    async def page(self, name, w, h, device=None):
        pg = await self.ctx.new_page(); await pg.set_viewport_size({'width': w, 'height': h})
        # every page is its own device: its own localStorage (the in-browser Firebase stand-in keeps its shared keys)
        await pg.add_init_script(DEVICE.replace('__DEV__', device or name))
        pg.on('pageerror', lambda e: self.errs.append(f'{name}: {e} @ {(getattr(e, "stack", "") or "")[:400]}')); return pg
    async def start(self, host, game, opts=None):
        if self.autogo and game == 'akml': await host.add_init_script(AUTOGO)
        await host.goto(self.U); await host.wait_for_timeout(300); await host.wait_for_function('!window.__resuming', timeout=20000); await host.wait_for_timeout(300)
        if await host.is_visible('#endBtn'): await host.click('#endBtn'); await host.wait_for_timeout(400)   # back in an unfinished game: end it first
        await host.click(f'.gact [data-game={game}]'); await host.wait_for_selector('.code', timeout=8000)
        for k, v in (opts or {}).items(): await host.click(f'[data-opt={k}][data-val="{v}"]')
        return await host.inner_text('.code')
    async def join(self, pg, code, name, team=None):
        await pg.goto(self.U + '#' + code); await pg.reload(); await pg.wait_for_selector('#pName', timeout=8000); await pg.fill('#pName', name)
        if team: await pg.click(f'[data-team={team}]')
        await pg.click('[data-act=enter]')
    async def __aexit__(self, *a):
        await self.b.close(); await self.pw.stop(); self.srv.terminate()
