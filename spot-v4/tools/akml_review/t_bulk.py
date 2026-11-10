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
def EFF(col='test_decisions'):
    """what the page means by the record: single documents and batch documents ("bulk-…"), the latest «at» winning"""
    out = {}
    for k, v in STORE.get(col, {}).items():
        for id, e in ((v.get('m') or {}).items() if k.startswith('bulk-') else [(k, v)]):
            if id not in out or (e.get('at') or 0) >= (out[id].get('at') or 0): out[id] = e
    return out
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
            if op == 'set':
                if not ONLINE['v']: return 'offline'
                STORE.setdefault(col, {})[id] = json.loads(v); return 'ok'
            return json.dumps(STORE.get(col, {}))
        async def device(name):
            ctx = await b.new_context(viewport={'width': 390, 'height': 900})
            await ctx.expose_function('__store', store)
            await ctx.add_init_script(SHIM)
            pg = await ctx.new_page(); pg.on('pageerror', lambda e: print('PAGE ERROR', name, e))
            await ctx.route('https://review.test/**', lambda r: r.fulfill(body=DOC, content_type='text/html; charset=utf-8'))
            return ctx, pg
        async def open_(pg, hash='#test'):
            await pg.goto('https://review.test/page' + hash); await pg.wait_for_selector('.card', timeout=15000); await pg.wait_for_timeout(500)
        D = json.loads(PAGE.split('const DATA = ', 1)[1].split(';\nconst SEC', 1)[0])
        items = D['items']; byid = {x['id']: x for x in items}
        flagged = [x for x in items if x.get('flag')]
        ctx, pg = await device('A'); await open_(pg)
        S = EFF
        # 1. the special cases: one filter shows them all, each with its recommendation
        await pg.click('[data-k=sp][data-v=any]'); await pg.wait_for_timeout(300)
        cnt = await pg.inner_text('#count')
        check(str(len(flagged)) in cnt, f'«كل الحالات الخاصة» shows the {len(flagged)} special cases ({cnt})')
        first = await pg.inner_text('.card >> nth=0')
        check('توصيتي' in first and 'حالة خاصة' in first, 'each special case shows why it is special and my recommendation')
        for c in ('reserve', 'xgame', 'weak', 'multi'):
            n = sum(1 for x in flagged if c in x['flag']['cats'])
            await pg.click(f'[data-k=sp][data-v={c}]'); await pg.wait_for_timeout(200)
            check(str(n) in await pg.inner_text('#count'), f'filter {c}: {n} questions')
        # a question with a proposed fix: «اعتماد مع التعديل المقترح» is a decision of its own
        fx = next((x for x in flagged if x['flag'].get('fix') and x['status'] == 'accepted'), None)
        if fx:
            await pg.fill('#q', fx['id']); await pg.wait_for_timeout(300)
            await pg.click(f'.decide[data-id="{fx["id"]}"] [data-d=okfix]'); await pg.wait_for_timeout(800)
            check(S().get(fx['id'], {}).get('d') == 'okfix' and 'التعديل المقترح' in await pg.inner_text(f'#c-{fx["id"]}'), 'approve with the proposed fix: saved as «okfix», shown on the card')
            await pg.fill('#q', ''); await pg.wait_for_timeout(200)
        # 2. bulk approval: select everything in a filter, take two out, confirm
        await pg.click('[data-k=sp][data-v=all]'); await pg.click('[data-k=status][data-v=accepted]'); await pg.click('[data-k=sec][data-v=gulf]'); await pg.click('[data-k=view][data-v=compact]'); await pg.wait_for_timeout(300)
        gulf = [x for x in items if x['sec'] == 'gulf' and x['status'] == 'accepted']
        await pg.click('#selAll'); await pg.wait_for_timeout(200)
        check(f'محدد: {len(gulf)}' in await pg.inner_text('#selCount'), f'«تحديد كل المطابق» selects all {len(gulf)} matching questions, not only those on the screen')
        plain = [x for x in gulf if not x.get('flag')]
        ex1, ex2 = plain[0]['id'], plain[1]['id']
        await pg.uncheck(f'[data-sel="{ex1}"]'); await pg.uncheck(f'[data-sel="{ex2}"]')
        before = dict(S())
        await pg.click('#bulkOk'); await pg.wait_for_timeout(300)
        conf = await pg.inner_text('#confirm')
        open_flag = [x for x in gulf if x.get('flag') and not S().get(x['id'], {}).get('d')]
        decided = [x for x in gulf if S().get(x['id'], {}).get('d')]
        expect = len(gulf) - 2 - len(open_flag) - len(decided)
        check(S() == before, 'nothing is decided before the owner confirms (the confirmation panel only shows what will happen)')
        check(f'اعتماد {expect} سؤالًا' in conf and (not open_flag or str(len(open_flag)) in conf), f'the panel: {expect} to approve; {len(open_flag)} special cases left out to be decided one by one')
        await pg.click('#bulkGo'); await pg.wait_for_timeout(4000)
        got = [k for k, v in S().items() if v.get('d') == 'ok' and byid[k]['sec'] == 'gulf']
        check(len(got) == expect and ex1 not in S() and ex2 not in S() and not any(x['id'] in S() for x in open_flag), f'after confirming: exactly {expect} approved; the two taken out and the open special cases untouched')
        check('اعتُمد' in await pg.inner_text('#ioMsg') and 'بانتظار' not in await pg.inner_text('#sync'), 'the page says how many were approved; all saved on the server')
        # a second bulk over the same group does not overwrite existing decisions unless asked
        await pg.click(f'.decide[data-id="{plain[2]["id"]}"] [data-d=no]'); await pg.wait_for_timeout(600)
        await pg.click('#selAll'); await pg.click('#bulkOk'); await pg.wait_for_timeout(300)
        await pg.click('#bulkGo'); await pg.wait_for_timeout(2500)
        check(S()[plain[2]['id']]['d'] == 'no' and S()[ex1]['d'] == 'ok', 'a second bulk approval keeps an earlier «رفض» (not replaced unless «استبدال» is ticked) and fills the ones left before')
        # 3. a big review: everything else approved in bulk (special cases excepted), with notes on some
        await pg.click('[data-k=sec][data-v=all]'); await pg.wait_for_timeout(300)
        await pg.click('#selAll'); await pg.click('#bulkOk'); await pg.wait_for_timeout(300); await pg.click('#bulkGo')
        await pg.wait_for_function('!document.getElementById("sync").innerText.includes("بانتظار")', timeout=120000)
        nok = sum(1 for v in S().values() if v.get('d') in ('ok', 'okfix'))
        check(nok >= len([x for x in items if x['status'] == 'accepted' and not x.get('flag')]) - 1, f'bulk over the whole bank: {nok} approved, every write confirmed by the server')
        notes = {plain[3]['id']: 'ملاحظة طويلة «بعلامات» وأسطر\nجديدة، وأرقام ١٢٣', plain[4]['id']: 'قصيرة'}
        for k, v in notes.items():
            await pg.fill('#q', k); await pg.wait_for_timeout(300); 
            if await pg.locator(f'[data-full="{k}"]').count(): await pg.click(f'[data-full="{k}"]')
            await pg.wait_for_timeout(200)
            await pg.fill(f'#nt-{k}', v); await pg.click('h1'); await pg.wait_for_timeout(1200)
        await pg.fill('#q', ''); await pg.wait_for_timeout(200)
        check(all(S()[k]['note'] == v for k, v in notes.items()), 'notes saved (with quotes, a new line and Arabic digits)')
        # 4. full export → a clean device with an empty server → import → every decision and note identical
        snap = {k: (v['d'], v['note']) for k, v in S().items()}
        ats = {k: v['at'] for k, v in S().items() if v.get('d') or v.get('note')}
        check(len(STORE['test_decisions']) < 60, f"the whole review took {len(STORE['test_decisions'])} database documents (bulk decisions are saved as batch documents, not one write per question)")
        await pg.click('#fullBtn'); await pg.wait_for_timeout(1500)
        full = json.loads(await pg.input_value('#expText'))
        exp = {k: (v['d'], v['note']) for k, v in full['decisions'].items() if v.get('d') or v.get('note')}
        check(exp == {k: v for k, v in snap.items() if v[0] or v[1]}, f'the exported file holds exactly the {len(exp)} decisions and notes of the server')
        it = next(x for x in full['items'] if x['id'] == plain[3]['id'])
        check(it['decision'] == 'ok' and it['owner_note'] == notes[plain[3]['id']] and it['ans'] and it.get('flag') is None, 'each question in the file carries its answer, decision and note')
        open(os.path.join(HERE, 'export_full_big.json'), 'w').write(json.dumps(full, ensure_ascii=False))
        await ctx.close(); STORE['test_decisions'] = {}
        ctx2, pg2 = await device('clean'); await open_(pg2)
        check('0 · 0 · 0' in await pg2.inner_text('#stats'), 'clean device, empty server: no decisions')
        await pg2.set_input_files('#impFile', os.path.join(HERE, 'export_full_big.json'))
        await pg2.wait_for_function('document.getElementById("ioMsg").innerText.includes("استُورد")', timeout=30000)
        await pg2.wait_for_function('!document.getElementById("sync").innerText.includes("بانتظار")', timeout=120000)
        back = {k: (v['d'], v['note']) for k, v in S().items() if v.get('d') or v.get('note')}
        check({k: v['at'] for k, v in S().items() if v.get('d') or v.get('note')} == ats, 'the time of each decision is kept too (so a later decision on another device still wins)')
        check(back == exp, f'import: all {len(back)} decisions and notes back on the server, identical (okfix and no included)')
        await pg2.click('[data-k=mine][data-v=ok]'); await pg2.wait_for_timeout(300)
        check(str(sum(1 for v in back.values() if v[0] in ('ok', 'okfix'))) in await pg2.inner_text('#count'), 'the page shows the imported decisions')
        # importing the same file again changes nothing and loses nothing
        await pg2.set_input_files('#impFile', os.path.join(HERE, 'export_full_big.json')); await pg2.wait_for_timeout(1500)
        check({k: (v['d'], v['note']) for k, v in S().items() if v.get('d') or v.get('note')} == exp and 'استُورد 0' in await pg2.inner_text('#ioMsg'), 'importing the same file twice: nothing changes, nothing is lost')
        await pg2.screenshot(path=os.path.join(HERE, 'bulk_390.png'))
        await ctx2.close(); await b.close()
    bad = [m for ok, m in R if not ok]; print(f'\n{len(R) - len(bad)}/{len(R)} passed'); sys.exit(1 if bad else 0)

asyncio.run(main())
