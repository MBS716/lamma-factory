"""The official site moves from the current version (v4.0-spot, the build now live) to the new one (v4.8, with «أكملها")
while people are playing. The same address serves the old files, then the new ones (as GitHub Pages does after a publish).
Checks: a room opened on the old version keeps working; a phone that opens the new version joins it; the old pages learn
of the new version, finish their round, then move to it by themselves and come back to the same room with their scores;
a phone still showing the old page that is asked to join a «أكملها» room (a game it does not know) gets a clear update
message or updates itself, never a stuck screen.
usage: OLD=dir NEW=dir python3 t_version_switch.py"""
import asyncio, os, shutil, sys, json, tempfile
SERVE = tempfile.mkdtemp(prefix='lamma-switch-')
os.environ['DIST'] = SERVE
from common import Env
OLD, NEW = os.environ['OLD'], os.environ['NEW']
R = []
def check(ok, msg): R.append((bool(ok), msg)); print(('OK   ' if ok else 'FAIL ') + msg, flush=True); return ok
def serve(src):
    for f in os.listdir(SERVE):
        p = os.path.join(SERVE, f); shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    for f in os.listdir(src):
        s = os.path.join(src, f); (shutil.copytree if os.path.isdir(s) else shutil.copy2)(s, os.path.join(SERVE, f))
VER = lambda d: json.load(open(os.path.join(d, 'version.json')))['b']
BUILD = lambda pg: pg.evaluate('BUILD')
SHOTS = os.environ.get('SHOTS', 'reports/site-test/version-switch')

async def main():
    os.makedirs(SHOTS, exist_ok=True); old_b, new_b = VER(OLD), VER(NEW)
    serve(OLD)
    async with Env(8734) as E:
        host = await E.page('host', 1280, 900); A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 390, 844)
        # ---------- people playing on the old version ----------
        code = await E.start(host, 'quiz')
        await E.join(A, code, 'صالح'); await host.wait_for_timeout(1200)
        await C.goto(E.U); await C.wait_for_timeout(1500)            # a phone with the old page open, not in a game yet
        check(await BUILD(host) == old_b and await BUILD(A) == old_b and await BUILD(C) == old_b, f'before the publish: everybody on the old version ({old_b})')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph && H.s.ph !== "lobby"', timeout=15000); await host.wait_for_timeout(1500)
        ph0 = await host.evaluate('H.s.ph'); sc0 = await host.evaluate('JSON.stringify(H.s.sc || H.s.pl || {})')
        # ---------- the new version is published ----------
        serve(NEW)
        # a phone that opens the site now gets the new version and joins the old room
        await E.join(B, code, 'تافير'); await host.wait_for_timeout(2500)
        check(await BUILD(B) == new_b, f'a phone opening the site after the publish gets the new version ({new_b})')
        inb = await host.evaluate("Object.values(H.s.pl || {}).map(p => p.n || p.name || '').join('|')")
        tb = await B.inner_text('#playerMain')
        check('تافير' in (await host.inner_text('#hostMain')) or 'تافير' in inb or 'صالح' not in tb, 'the new phone joins the room opened on the old version (same game protocol): it is in the game, not refused')
        check(not any(w in tb for w in ('أُنشئت بإصدار قديم', 'لم نجد', 'غير موجودة')), 'the new phone sees no error')
        # the old pages learn of the new version during the round: a notice, no reload in the middle of the round
        await host.evaluate('checkUpdate()'); await A.evaluate('checkUpdate()'); await host.wait_for_timeout(1500)
        check(await BUILD(host) == old_b and await host.evaluate('H.s.ph') != 'lobby', 'host on the old page: not reloaded in the middle of the round')
        bar = await host.evaluate('(() => { const b = document.querySelector("#updBar"); return b && !b.hidden ? b.innerText : ""; })()')
        check('إصدار أحدث' in bar, f'host sees a clear notice: «{bar.strip()}»')
        barA = await A.evaluate('(() => { const b = document.querySelector("#updBar"); return b && !b.hidden ? b.innerText : ""; })()')
        check('إصدار أحدث' in barA and await BUILD(A) == old_b, 'the old phone sees the same notice and stays in the round')
        await host.screenshot(path=SHOTS + '/vs_host_notice.png'); await A.screenshot(path=SHOTS + '/vs_phone_notice.png')
        # the round ends: the old pages move to the new version by themselves, back in the same room
        await host.click('#setBtn')          # the round is over: the host goes back to the settings (lobby)
        await host.wait_for_function(f'typeof BUILD !== "undefined" && BUILD === "{new_b}"', timeout=40000)
        try: await host.wait_for_function('typeof H !== "undefined" && H && H.code', timeout=20000)
        except Exception:
            await host.screenshot(path=SHOTS + '/vs_host_after.png'); print('DEBUG', await host.evaluate('location.href'), (await host.inner_text('body'))[:400].replace('\n',' | '))
        await host.wait_for_timeout(2500)
        check(await host.evaluate('H.code') == code, f'after the round the host page moved to the new version by itself and is back in room {code}')
        await A.wait_for_function(f'typeof BUILD !== "undefined" && BUILD === "{new_b}"', timeout=40000); await A.wait_for_timeout(3000)
        check(await A.evaluate('!!(P && P.joined && P.code)') and await A.evaluate('P.code') == code, 'the old phone moved to the new version too, back in the same room without joining again')
        # ---------- a phone still on the old page is invited to a «أكملها» room ----------
        D = await E.page('D', 1280, 900); code2 = await E.start(D, 'akml')
        check(await BUILD(D) == new_b, 'a host opens «أكملها» on the new version')
        # C still shows the page it opened before the publish (old version, «أكملها» unknown to it): it types the code
        await C.fill('#joinCode', code2); await C.press('#joinCode', 'Enter')
        await C.wait_for_timeout(6000)
        cb, ct = await BUILD(C), await C.inner_text('body')
        await C.screenshot(path=SHOTS + '/vs_old_phone_akml.png')
        ok = cb == new_b or any(w in ct for w in ('إصدار أحدث', 'حدّث', 'تحديث'))
        check(ok, f'the phone on the old page invited to «أكملها»: ' + ('it updated itself to the new version' if cb == new_b else 'it shows an update message' if ok else 'STUCK: ' + ct[:160].replace('\n', ' ')))
        if cb == new_b:
            await C.wait_for_selector('#pName', timeout=10000); await C.fill('#pName', 'نورة'); await C.click('[data-act=enter]'); await D.wait_for_timeout(1500)
            check('نورة' in await D.inner_text('#hostMain'), 'after updating it joins the «أكملها» room')
        check(not E.errs, 'no page errors ' + '; '.join(E.errs[:3]))
    shutil.rmtree(SERVE, ignore_errors=True)
    n = sum(ok for ok, _ in R); print(f'\n{n}/{len(R)} passed'); sys.exit(0 if n == len(R) else 1)

asyncio.run(main())
