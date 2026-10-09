"""Local component check with synthetic records; never contacts the real API."""
import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright

OUTPUT = Path(__file__).resolve().parent
ORIGIN = 'http://127.0.0.1:5191'
HTML = '''<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<script type="module">
import RefreshRuntime from '/@react-refresh';
RefreshRuntime.injectIntoGlobalHook(window);
window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
window.__vite_plugin_react_preamble_installed__ = true;
import '/src/index.css'; import '/src/components/admin/admin.css';
window.fixtureReady = true;
</script></head><body><div class="admin-shell"><main class="admin-panel" id="fixture"></main></div></body></html>'''


async def main():
    checks = []
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for width in [1440, 390]:
            page = await browser.new_page(viewport={'width': width, 'height': 1000})
            await page.route('**/*', lambda route: route.continue_() if route.request.url.startswith(ORIGIN) else route.abort())
            await page.route('**/__emergency_check', lambda route: route.fulfill(content_type='text/html', body=HTML))
            await page.goto(ORIGIN + '/__emergency_check')
            await page.wait_for_function('window.fixtureReady')
            await page.evaluate('''async () => {
                const React = (await import('/node_modules/.vite/deps/react.js')).default;
                const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
                const {EmergencyToggle} = await import('/src/components/admin/EmergencyToggle.tsx');
                const {adminApi} = await import('/src/services/adminApi.ts');
                const candidates = Array.from({length:123}, (_, i) => ({id:i+1, commodity_key:`product-${i+1}`,
                    minimum_price:40, maximum_price:50, observed_average_price:44, computed_apc_price:45,
                    observation_count:3, establishment_count:3, source_week:{starts_on:'2026-08-31',ends_on:'2026-09-06'},
                    source_observations:Array.from({length:3}, (_, j) => ({item_id:i*3+j+1,monitoring_record_id:j+1,
                        store_name:`Market ${j+1}`,finalized_at:'2026-09-01T01:00:00Z',recorded_price:40+j*5}))}));
                const detail = {id:7, location:'San Jose de Buenavista, Antique', declaration_reference:'LOCAL-CHECK-7',
                    starts_on:'2026-09-09', ends_on:null, status:'draft', effective_state:'draft',preparation_hash:'a'.repeat(64),
                    source_week:{timezone:'Asia/Manila',starts_at:'2026-08-30T16:00:00Z',ends_at:'2026-09-06T16:00:00Z'},
                    candidates, srp_fallbacks:[],official_prices:[]};
                const {candidates:unused,source_week:week,srp_fallbacks:fallbacks,...summary} = detail;
                window.checkFixture = {detail,summary,hold:false,summaryCalls:0,detailCalls:0};
                adminApi.getEmergencySummaries = async () => {
                    const f=window.checkFixture; f.summaryCalls++;
                    if(f.hold) await new Promise(resolve => { f.releaseSummary=resolve });
                    return [structuredClone(f.summary)];
                };
                adminApi.getEmergency = async () => {
                    const f=window.checkFixture; f.detailCalls++;
                    if(f.hold) await new Promise(resolve => { f.releaseDetail=resolve });
                    return structuredClone(f.detail);
                };
                adminApi.getSrp = async () => ({records:[]});
                createRoot(document.getElementById('fixture')).render(React.createElement(EmergencyToggle));
            }''')
            await page.get_by_text('Monitoring sources for APC (123 products)', exact=True).wait_for()
            source = page.locator('.apc-source-records-scroll')
            assert await source.locator('details').count() == 123
            dimensions = await source.evaluate('''el => [...el.children].map(d => ({row:d.getBoundingClientRect().height,summary:d.querySelector('summary').getBoundingClientRect().height}))''')
            assert all(d['row'] >= d['summary'] and d['summary'] > 20 for d in dimensions), dimensions[:3]
            await source.locator('summary').first.click()
            await source.locator('li').first.wait_for(state='visible')
            await source.evaluate('el => { el.scrollTop=80; el.dataset.savedScroll=el.scrollTop }')
            await page.get_by_role('checkbox').check()
            await page.evaluate('''() => { window.checkFixture.hold=true; window.dispatchEvent(new Event('regulatory-data-changed')) }''')
            await page.get_by_text('Refreshing…', exact=True).first.wait_for()
            assert await page.get_by_role('button', name='LOCAL-CHECK-7').is_visible()
            assert await page.get_by_text('Loading emergency records…', exact=True).count() == 0
            assert await source.locator('details').first.get_attribute('open') is not None
            assert await source.evaluate('el => el.scrollTop === Number(el.dataset.savedScroll)')
            assert await page.get_by_role('button', name='Confirm and activate').is_disabled()
            await page.evaluate('''() => {const f=window.checkFixture; f.hold=false;f.releaseSummary()}''')
            await page.wait_for_function('window.checkFixture.detailCalls === 2')
            await page.get_by_role('button', name='Confirm and activate').wait_for(state='visible')
            await page.wait_for_function("!document.querySelector('.apc-verification-box button').disabled")
            assert await source.locator('details').first.get_attribute('open') is not None
            assert await source.evaluate('el => el.scrollTop === Number(el.dataset.savedScroll)')
            await source.evaluate('el => { el.scrollTop=0 }')
            await source.locator('summary').first.focus()
            await source.locator('summary').first.press('Enter')
            assert await source.locator('details').first.get_attribute('open') is None
            await source.locator('summary').first.press('Enter')
            await source.locator('li').first.wait_for(state='visible')
            await source.scroll_into_view_if_needed()
            await page.screenshot(path=str(OUTPUT / f'sources-{width}.png'), full_page=True)
            checks.append({'viewport_width': width, 'products':123, 'minimum_row_height':min(d['row'] for d in dimensions),
                           'expansion_visible':True,'keyboard_expansion':True,'refresh_keeps_records_and_scroll':True,
                           'request_counts':await page.evaluate('({summary:window.checkFixture.summaryCalls,detail:window.checkFixture.detailCalls})')})
            await page.close()
        await browser.close()
    (OUTPUT / 'browser-results.json').write_text(json.dumps(checks, indent=2), encoding='utf-8')
    print(json.dumps(checks))


asyncio.run(main())
