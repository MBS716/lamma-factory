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
SHOTS = os.environ.get('SHOTS', '/tmp/claude-0/-home-claude/a7cbada7-322f-55e5-8221-30cda24e9f18/scratchpad/shots')

async def main():
    os.makedirs(SHOTS, exist_ok=True); old_b, new_b = VER(OLD), VER(NEW)
    serve(OLD)
    async with Env(8734) as E:
        host = await E.page('host', 1280, 900); A = await E.page('A', 390, 844); B = await E.page('B', 360, 740); C = await E.page('C', 390, 844)
        # ---------- people playing on the old version: a quiz match with points ----------
        code = await E.start(host, 'quiz', {'n': 5, 't': 30})
        await E.join(A, code, 'صالح'); await host.wait_for_timeout(1200)
        await C.goto(E.U); await C.wait_for_timeout(1500)            # a phone with the old page open, not in a game yet
        check(await BUILD(host) == old_b and await BUILD(A) == old_b and await BUILD(C) == old_b, f'before the publish: everybody on the old version ({old_b})')
        kA = await A.evaluate('P.key || (P.me && P.me.k) || ""')
        await host.click('[data-h=start]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        async def answer(pg, right):
            await pg.wait_for_selector('[data-ans]', timeout=10000); ci = await host.evaluate('H.priv.ci')
            await pg.click(f'[data-ans="{ci if right else (ci + 1) % 4}"]')
        # question 1 on the old version: صالح right
        await answer(A, True); await host.wait_for_function('H.s.ph === "r"', timeout=15000); await host.click('[data-h=next]')
        await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        # ---------- the new version is published, in the middle of the match ----------
        serve(NEW)
        await E.join(B, code, 'تافير'); await host.wait_for_timeout(2500)        # a phone opening the site now: the new version
        check(await BUILD(B) == new_b, f'a phone opening the site after the publish gets the new version ({new_b})')
        tb = await B.inner_text('#playerMain')
        check(await B.evaluate('!!(P && P.joined && P.code)') and await B.evaluate('P.code') == code,
              'the new phone joins the match opened on the old version (same game protocol), as a player')
        check(not any(w in tb for w in ('أُنشئت بإصدار قديم', 'لم نجد', 'غير موجودة')), 'the new phone sees no error')
        # the old pages learn of the new version during the match: a notice, no reload in the middle of it
        await host.evaluate('checkUpdate()'); await A.evaluate('checkUpdate()'); await host.wait_for_timeout(1500)
        check(await BUILD(host) == old_b and await host.evaluate('H.s.ph') == 'q', 'host on the old page: not reloaded in the middle of the match')
        bar = await host.evaluate('(() => { const b = document.querySelector("#updBar"); return b && !b.hidden ? b.innerText : ""; })()')
        check('إصدار أحدث' in bar, f'host sees a clear notice: «{bar.strip()}»')
        barA = await A.evaluate('(() => { const b = document.querySelector("#updBar"); return b && !b.hidden ? b.innerText : ""; })()')
        check('إصدار أحدث' in barA and await BUILD(A) == old_b, 'the old phone sees the same notice and stays in the match')
        await host.screenshot(path=SHOTS + '/vs_host_notice.png'); await A.screenshot(path=SHOTS + '/vs_phone_notice.png')
        # questions 2 and 3, old host + old phone + new phone together: صالح right then wrong, تافير wrong then right
        await answer(A, True); await answer(B, False); await host.wait_for_function('H.s.ph === "r"', timeout=15000)
        check('تافير' in await host.inner_text('#hostMain'), 'the old host counts the new phone\'s answer: تافير is in the results of the question')
        await host.click('[data-h=next]')
        await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        await answer(A, False); await answer(B, True); await host.wait_for_function('H.s.ph === "r"', timeout=15000)
        for _ in range(2):          # questions 4 and 5: both wrong
            await host.click('[data-h=next]'); await host.wait_for_function('H.s.ph === "q"', timeout=15000)
            await answer(A, False); await answer(B, False); await host.wait_for_function('H.s.ph === "r"', timeout=15000)
        check(await BUILD(host) == old_b, 'still on the old version until the match ends')
        # the match ends: its results are what must survive the move
        before = await host.evaluate('JSON.parse(JSON.stringify({top: H.s.top || null, sc: H.s.sc || null}))')
        await host.click('[data-h=next]')
        # ---------- after the match: every old page moves to the new version by itself ----------
        await host.wait_for_function(f'typeof BUILD !== "undefined" && BUILD === "{new_b}"', timeout=40000)
        try: await host.wait_for_function('typeof H !== "undefined" && H && H.code', timeout=20000)
        except Exception:
            await host.screenshot(path=SHOTS + '/vs_host_after.png'); print('DEBUG', await host.evaluate('location.href'), (await host.inner_text('body'))[:400].replace('\n',' | '))
        await host.wait_for_timeout(2500)
        check(await host.evaluate('H.code') == code and await host.evaluate('!(P && P.joined)'), f'the host page moved to the new version and is back as the host of room {code} (not as a player)')
        after = await host.evaluate('JSON.parse(JSON.stringify({ph: H.s.ph, top: H.s.top || null, sc: H.s.sc || null}))')
        check(after['ph'] == 'end' and after['top'] == (await host.evaluate('H.s.top')) and after['top'], f'the match state is kept: the final results are on the host\'s screen ({after["top"]})')
        tops = {r[0]: r[1] for r in (after['top'] or [])}
        check(tops.get('صالح', 0) > 0 and tops.get('تافير', 0) > 0 and tops.get('صالح', 0) > tops.get('تافير', 0), f'no points lost: صالح {tops.get("صالح")} (two right, one on the old version), تافير {tops.get("تافير")} (one right)')
        check(not before['top'] or before['top'] == after['top'], 'the results after the move are the same as the old page showed')
        await A.wait_for_function(f'typeof BUILD !== "undefined" && BUILD === "{new_b}"', timeout=40000); await A.wait_for_timeout(3000)
        check(await A.evaluate('!!(P && P.joined && P.code)') and await A.evaluate('P.code') == code and await A.evaluate('P.name || (P.me && P.me.n) || ""') in ('صالح', ''),
              'the old phone moved to the new version too: back in the same room, as the same player, without joining again')
        ta, tb2 = await A.inner_text('#playerMain'), await B.inner_text('#playerMain')
        check(str(tops.get('صالح')) in ta and str(tops.get('تافير')) in tb2, f'each phone shows its own final points after the move (صالح {tops.get("صالح")}, تافير {tops.get("تافير")})')
        # the room goes on: a new match on the new version with the same players
        await host.click('#setBtn'); await host.wait_for_selector('[data-h=start]', timeout=10000); await host.click('[data-h=start]')
        await host.wait_for_function('H.s.ph === "q"', timeout=15000)
        await answer(A, True); await answer(B, True); await host.wait_for_function('H.s.ph === "r"', timeout=15000)
        n_ans = await host.evaluate('Object.keys(H.priv.ans || H.s.ans || {}).length || (H.s.res ? Object.keys(H.s.res).length : 0)')
        check(await host.evaluate('H.s.ph') == 'r' and await BUILD(A) == new_b and await BUILD(B) == new_b, 'the same room plays a new match on the new version with both players')
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
