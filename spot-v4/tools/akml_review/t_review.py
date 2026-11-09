"""The question review page: decisions saved, restored after closing and reopening, on another device, while offline and
after a refresh. The claude.ai database is replaced by a stand-in with the same calls (collection().doc().set,
onSnapshot with metadata) kept outside the browser, so a reload or a new browser does not keep it; the stand-in can be
switched offline (its writes fail as they do without a connection)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = open(os.path.join(HERE, 'akml-review.html'), encoding='utf-8').read()
DOC = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + PAGE + '</body></html>'
STORE = {}            # collection -> {id: data}  (the "server")
ONLINE = {'v': True}
R = []
def check(ok, m): R.append((bool(ok), m)); print(('OK   ' if ok else 'FAIL ') + m, flush=True)

SHIM = r'''
(() => {
  const subs = [];
  const snap = (col, docs) => ({docs: Object.entries(docs).map(([id, v]) => ({id, exists:true, data:() => v, metadata:{fromCache:false, hasPendingWrites:false}})), size:Object.keys(docs).length, empty:!Object.keys(docs).length, metadata:{fromCache:false, hasPendingWrites:false}, docChanges:() => []});
  const db = {collection(col){ return {
    doc(id){ return {async set(v){ const r = await window.__store("set", col, id, JSON.stringify(v)); if (r !== "ok") throw {code:"unavailable", message:"offline"};
      const all = JSON.parse(await window.__store("all", col)); subs.filter(s => s.col === col).forEach(s => s.cb(snap(col, all))); }}; },
    onSnapshot(cb, err){ const s = {col, cb}; subs.push(s); window.__store("all", col).then(a => cb(snap(col, JSON.parse(a)))); return () => {}; }
  }; }};
  window.claude = {use: async name => name === "db" ? db : name === "user" ? {can: () => true} : null};
})();
'''

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        async def store(op, col, id=None, v=None):
          try:
            return await store_(op, *([col] if op == 'all' else [col, id, v]))
          except Exception as e:
            print('STORE ERR', repr(e)); raise
        async def store_(col_op, *a):
            op = col_op
            if op == 'set':
                col, id, v = a
                if not ONLINE['v']: return 'offline'
                STORE.setdefault(col, {})[id] = json.loads(v); return 'ok'
            if op == 'all': return json.dumps(STORE.get(a[0], {}))
        async def device(name):
            ctx = await b.new_context(viewport={'width': 390, 'height': 900})
            await ctx.expose_function('__store', store)
            await ctx.add_init_script(SHIM)
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: print('PAGE ERROR', name, e))
            await ctx.route('https://review.test/**', lambda r: r.fulfill(body=DOC, content_type='text/html; charset=utf-8'))
            return ctx, pg
        async def open_(pg, hash='#test'):
            await pg.goto('https://review.test/page' + hash); await pg.wait_for_selector('.card', timeout=10000); await pg.wait_for_timeout(500)
        ids = await (await b.new_page()).evaluate('() => 0') or None
        items = [x['id'] for x in json.loads(PAGE.split('const DATA = ', 1)[1].split(';\nconst SEC', 1)[0])['items'] if x['status'] == 'accepted']
        X1, X2, X3, X4, X5 = items[:5]
        ctx, pg = await device('A'); await open_(pg)
        check(await pg.is_visible('#testBanner') and 'test_decisions' in await pg.inner_text('#testBanner'), 'test mode: a banner says the decisions go to a separate test record')
        card = lambda i: f'.decide[data-id="{i}"]'
        await pg.click(f'{card(X1)} [data-d=ok]')
        await pg.click(f'{card(X2)} [data-d=edit]'); await pg.fill(f'#nt-{X2}', 'الخيار الثالث قريب من الإجابة، يُستبدل'); await pg.click('h1')
        await pg.click(f'{card(X3)} [data-d=no]'); await pg.fill(f'#nt-{X3}', 'المثل غير معروف في منطقتنا'); await pg.click('h1')
        await pg.wait_for_timeout(1500)
        S = STORE.get('test_decisions', {})
        check(S.get(X1, {}).get('d') == 'ok', '1. approve: saved in the database')
        check(S.get(X2, {}).get('d') == 'edit' and 'يُستبدل' in S.get(X2, {}).get('note', ''), '2. needs editing + note: saved with the note')
        check(S.get(X3, {}).get('d') == 'no' and 'غير معروف' in S.get(X3, {}).get('note', ''), '3. reject + reason: saved with the reason')
        check(not STORE.get('decisions'), 'the real decisions record is untouched (nothing written to it)')
        check('كل القرارات محفوظة على الخادم' in await pg.inner_text('#sync'), 'the page says everything is saved on the server')
        check('قرارك: معتمد' in await pg.inner_text(f'#c-{X1}') and 'قرارك: مرفوض' in await pg.inner_text(f'#c-{X3}'), 'each card shows the decision')
        # 4-5. close the page and open it again (same device), then on another device (empty browser storage)
        await ctx.close(); ctx, pg = await device('A again'); await open_(pg)
        await pg.click('[data-k=status][data-v=accepted]')
        ok = (await pg.get_attribute(f'{card(X1)} [data-d=ok]', 'aria-pressed') == 'true'
              and await pg.get_attribute(f'{card(X2)} [data-d=edit]', 'aria-pressed') == 'true'
              and await pg.input_value(f'#nt-{X2}') == 'الخيار الثالث قريب من الإجابة، يُستبدل'
              and await pg.get_attribute(f'{card(X3)} [data-d=no]', 'aria-pressed') == 'true' and 'غير معروف' in await pg.input_value(f'#nt-{X3}'))
        check(ok, '4-5. closed and reopened: the three decisions and the notes are back')
        ctx2, pg2 = await device('B'); await open_(pg2)
        ok2 = await pg2.get_attribute(f'{card(X1)} [data-d=ok]', 'aria-pressed') == 'true' and 'يُستبدل' in await pg2.input_value(f'#nt-{X2}')
        check(ok2, '5. another device (empty browser storage): the decisions are there (they live on the server, not in the browser)')
        await pg2.click('[data-k=mine][data-v=edit]'); n = await pg2.locator('.card').count()
        check(n == 1, 'the filter «تحتاج تعديل» shows exactly the one question marked so')
        await ctx2.close()
        # 7. offline: decisions made without a connection are kept on the device, survive a refresh, and are sent later
        ONLINE['v'] = False
        await pg.click(f'{card(X4)} [data-d=ok]'); await pg.fill(f'#nt-{X5}', 'ملاحظة كتبت دون اتصال'); await pg.wait_for_timeout(1500)
        check(X4 not in STORE['test_decisions'] and 'بانتظار التأكيد' in await pg.inner_text('#sync'), '7. offline: not on the server yet; the page says it is waiting and kept on this device')
        check('بانتظار الحفظ' in await pg.inner_text(f'#c-{X4}'), 'the card shows «بانتظار الحفظ على الخادم»')
        await pg.reload(); await pg.wait_for_selector('.card'); await pg.wait_for_timeout(600)
        check(await pg.get_attribute(f'{card(X4)} [data-d=ok]', 'aria-pressed') == 'true' and await pg.input_value(f'#nt-{X5}') == 'ملاحظة كتبت دون اتصال', '7. refreshed while offline: the unsent decision and note are still there')
        ONLINE['v'] = True
        await pg.evaluate('window.dispatchEvent(new Event("online"))'); await pg.wait_for_timeout(1500)
        S = STORE['test_decisions']
        check(S.get(X4, {}).get('d') == 'ok' and S.get(X5, {}).get('note') == 'ملاحظة كتبت دون اتصال', '7. back online: sent to the server by itself')
        check('كل القرارات محفوظة على الخادم' in await pg.inner_text('#sync'), 'nothing left waiting')
        # 7. a note typed and the page refreshed at once (before it was sent)
        await pg.fill(f'#nt-{X1}', 'صحيح ومشهور'); await pg.reload(); await pg.wait_for_selector('.card'); await pg.wait_for_timeout(2500)
        check(STORE['test_decisions'][X1].get('note') == 'صحيح ومشهور' and STORE['test_decisions'][X1].get('d') == 'ok', '7. refreshed right after typing: the note was kept and sent, the decision unchanged')
        # undo: tapping the same decision again clears it (and is saved)
        await pg.click(f'{card(X4)} [data-d=ok]'); await pg.wait_for_timeout(800)
        check(STORE['test_decisions'][X4].get('d') == '', 'tapping the chosen decision again clears it (saved as no decision)')
        # the real review (no #test) does not show test decisions
        ctx3, pg3 = await device('real'); await open_(pg3, '')
        check(not await pg3.is_visible('#testBanner') and await pg3.get_attribute(f'{card(X1)} [data-d=ok]', 'aria-pressed') == 'false', 'the real review page (without #test) shows none of the test decisions')
        # every field the owner asked for is on the card
        t = await pg3.inner_text(f'#c-{X1}')
        check(all(k in t for k in ('الإجابة الصحيحة', 'بدائل مقبولة', 'الخيارات الأربعة', 'المعنى', 'القسم والصعوبة', 'الأصل', 'مصدر التحقق', 'قرارك')) and await pg3.locator(f'#nt-{X1}').count() == 1, 'each card shows: question, answer, alternatives, the 4 options, meaning, section and level, source, status, decision and a notes box')
        await pg3.screenshot(path=os.path.join(HERE, 'review_card_390.png'))
        await ctx3.close(); await ctx.close(); await b.close()
    json.dump(STORE, open(os.path.join(HERE, 'store_after_test.json'), 'w'), ensure_ascii=False, indent=1)
    bad = [m for ok, m in R if not ok]; print(f'\n{len(R) - len(bad)}/{len(R)} passed'); sys.exit(1 if bad else 0)

asyncio.run(main())
