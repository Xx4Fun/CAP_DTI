"""Production-build acceptance against synthetic API data; never contacts a real backend.

Run `npm run preview -- --host 127.0.0.1 --port 5177`, then this script with Python Playwright.
"""
import argparse
import json
import re
from datetime import datetime, timedelta, timezone
from email import policy
from email.parser import BytesParser
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect

PRIVATE_READ = """async ([bucket, id]) => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open('price-watch-vendor-private-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const read = (store, key) => new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  const key = await read('meta', 'browser-key'); const sealed = await read(bucket, id);
  if (!sealed) { db.close(); return null; }
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: sealed.iv, additionalData: new TextEncoder().encode(bucket + '/' + id) }, key, sealed.bytes);
  const data = JSON.parse(new TextDecoder().decode(plain));
  const unpack = async (node) => {
    if (node && node.__vendorBinary) { const b = await read('attachments', node.__vendorBinary); const bytes = await crypto.subtle.decrypt({name:'AES-GCM',iv:b.iv,additionalData:new TextEncoder().encode(node.__vendorBinary)}, key,b.bytes); return {...node, content: new TextDecoder().decode(bytes)}; }
    if (Array.isArray(node)) return Promise.all(node.map(unpack));
    if (node && typeof node === 'object') return Object.fromEntries(await Promise.all(Object.entries(node).map(async ([k,v]) => [k,await unpack(v)])));
    return node;
  }; const result = await unpack(data); db.close(); return result;
}"""

OUTBOX = """async () => {
  const db=await new Promise(r=>{const q=indexedDB.open('price-watch-vendor-private-v1');q.onsuccess=()=>r(q.result)});
  const read=(s,op)=>new Promise(r=>{const q=op(db.transaction(s).objectStore(s));q.onsuccess=()=>r(q.result)});
  const keys=await read('outbox',s=>s.getAllKeys()), rows=await read('outbox',s=>s.getAll()), key=await read('meta',s=>s.get('browser-key'));
  const result=await Promise.all(rows.map(async(v,i)=>JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:v.iv,additionalData:new TextEncoder().encode('outbox/'+keys[i])},key,v.bytes)))));
  db.close();return result;
}"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', default='http://127.0.0.1:5177')
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    iso = lambda dt: dt.isoformat()
    store = dict(id=1, store_name='Offline Test Grocery', address='Synthetic test address', dti_sec_number=None,
                 recidivism_index=0, last_inspected_at=iso(now), compliance_status='UNDER_INQUIRY', open_notice_count=1, unread_messages=0)
    user = dict(id=5, name='Offline Test Vendor', email='offline@test.invalid')
    overview = dict(user=user, stores=[store], emergency=None)
    notice = dict(id=11, store_id=1, control_number='TEST-LOI-11', notice_type='LOI', status='issued', issued_at=iso(now),
                  intended_delivery_method='portal', delivery_state='received', delivered_at=iso(now), due_date_timestamp=iso(now + timedelta(days=2)),
                  response_text=None, response_reason_category=None, response_certified_at=None, response_received_at=None,
                  closed_at=None, cancelled_at=None, flagged_items=[], attachments=[], store=store, monitoring_date=iso(now), legal_bases=[])
    unopened = {**notice, 'id': 12, 'control_number': 'TEST-LOI-12', 'delivery_state': 'not_recorded', 'due_date_timestamp': None}
    messages = [dict(id=1, sender_side='dti', sender_name='DTI', body='Saved DTI message', read_at=None, created_at=iso(now), attachment=None)]
    receipts, counts, reads = {}, {'messages': 0, 'responses': 0, 'documents': 0}, []
    state = {'offline': False, 'lose_ack': False}
    results, errors, requests = [], [], []

    def api(route):
        request = route.request
        if state['offline']:
            route.abort('internetdisconnected')
            return
        path = urlparse(request.url).path
        requests.append(request.method + ' ' + path)
        headers = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*'}
        if request.method == 'OPTIONS':
            route.fulfill(status=204, headers=headers)
            return
        body, status = None, 200
        if path.endswith('/overview'):
            body = {'data': overview}
        elif path.endswith('/notices'):
            body = [notice, unopened]
        elif path.endswith('/srp'):
            body = {'data': {'items': [], 'emergency': None, 'protocol': {'mode': 'standard'}}}
        elif path.endswith('/advisories'):
            body = {'data': []}
        elif path.endswith('/preferences'):
            body = {'data': dict(sms_enabled=False, sms_mobile_number='', email_enabled=True, email_address=user['email'],
                                  alert_on_loi=True, alert_on_sco=True, alert_deadline_24h=True, alert_price_freeze=True, alert_srp_bulletin=True)}
        elif path.endswith('/document'):
            counts['documents'] += 1
            route.fulfill(status=200, headers=headers, content_type='application/pdf', body=b'%PDF-1.4\n% synthetic saved document\n%%EOF')
            return
        elif request.method == 'GET' and '/conversations/' in path:
            reads.append(parse_qs(urlparse(request.url).query).get('mark_read', ['1'])[0])
            body = {'data': {'store': store, 'messages': messages, 'notices': [], 'has_more': False}}
        elif request.method == 'POST' and (path.endswith('/messages') or path.endswith('/response')):
            mime = BytesParser(policy=policy.default).parsebytes(('Content-Type: ' + request.headers['content-type'] + '\r\n\r\n').encode() + request.post_data_buffer)
            fields = {part.get_param('name', header='content-disposition'): part.get_payload(decode=True).decode(errors='replace') for part in mime.iter_parts() if not part.get_filename()}
            uuid = fields['client_uuid']
            assert re.fullmatch(r'[0-9a-f-]{36}', uuid)
            if uuid in receipts:
                body, status = receipts[uuid]
            elif path.endswith('/messages'):
                counts['messages'] += 1
                sent = dict(id=counts['messages'] + 1, sender_side='vendor', sender_name=user['name'], body=fields['body'], read_at=None, created_at=iso(now), attachment=None)
                messages.append(sent)
                body, status = {'data': sent}, 201
                receipts[uuid] = (body, status)
            else:
                counts['responses'] += 1
                notice.update(status='response_received', response_text=fields['response_text'], response_reason_category=fields['reason_category'], response_received_at=iso(now), response_certified_at=iso(now))
                body = {'notice': notice, 'message': 'Response submitted.'}
                receipts[uuid] = (body, status)
            if state['lose_ack'] and path.endswith('/messages'):
                state['lose_ack'] = False
                route.abort('failed')
                return
        else:
            raise AssertionError('Unexpected synthetic API request: ' + request.method + ' ' + path)
        route.fulfill(status=status, headers=headers, content_type='application/json', body=json.dumps(body))

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        context.route('**/api/**', api)
        page = context.new_page()
        page.on('dialog', lambda dialog: dialog.accept())
        page.on('pageerror', lambda error: errors.append(str(error)))
        try:
            page.goto(args.base)
            page.evaluate("session => localStorage.setItem('price-watch-vendor-session', JSON.stringify(session))", {'token': 'synthetic-token', 'expires_at': iso(now + timedelta(days=2)), 'user': user})
            page.reload()
            expect(page.get_by_role('heading', name=store['store_name'], exact=True)).to_be_visible()
            page.evaluate('async () => { await navigator.serviceWorker.ready; }')
            page.reload()
            page.wait_for_function('navigator.serviceWorker.controller !== null')
            page.wait_for_function("async () => { const d = await new Promise(r => { const q=indexedDB.open('price-watch-vendor-private-v1');q.onsuccess=()=>r(q.result); }); const keys=await new Promise(r=>{const q=d.transaction('snapshots').objectStore('snapshots').getAllKeys();q.onsuccess=()=>r(q.result);});d.close();return ['5/overview','5/notices','5/srp','5/advisories','5/preferences','5/conversation/1'].every(k=>keys.includes(k)); }")
            for _ in range(100):
                if reads:
                    break
                page.wait_for_timeout(100)
            assert counts['documents'] == 0, 'Preparation opened an official PDF'
            assert '0' in reads or 'false' in reads, 'Preparation did not opt out of marking messages read: ' + repr(reads) + ' requests=' + repr(requests)
            results.append('Automatic preparation without legal receipt or message read receipt')

            page.get_by_role('button', name='Notices Tab', exact=True).click()
            page.get_by_role('button', name='View Notice', exact=True).first.click()
            page.get_by_role('button', name='Open official document (PDF)').click()
            page.wait_for_function("async () => {const d=await new Promise(r=>{const q=indexedDB.open('price-watch-vendor-private-v1');q.onsuccess=()=>r(q.result)});const v=await new Promise(r=>{const q=d.transaction('snapshots').objectStore('snapshots').get('5/document/11');q.onsuccess=()=>r(q.result)});d.close();return !!v}")
            page.get_by_role('button', name='Close', exact=True).click()
            for opened in context.pages:
                if opened != page:
                    opened.close()
            page.bring_to_front()
            results.append('Explicit online PDF access saves a private copy')

            page.get_by_role('button', name='Submit Explanation', exact=True).first.click()
            page.get_by_role('button', name='Next: Written Explanation').click()
            explanation = 'Exact durable explanation prepared offline for a synthetic notice.'
            page.get_by_label('Detailed written explanation').fill(explanation)
            page.get_by_role('button', name='Next: Attach Evidence').click()
            page.get_by_label('Attach supporting documents').set_input_files({'name': 'invoice.pdf', 'mimeType': 'application/pdf', 'buffer': b'evidence-from-phone'})
            page.get_by_label('Document type for invoice.pdf').select_option('FREIGHT_BILL')
            page.get_by_role('button', name='Next: Certify & Review').click()
            page.get_by_role('checkbox').check()
            expect(page.get_by_text('Draft · Saved on this device', exact=True).last).to_be_visible()
            saved = page.evaluate(PRIVATE_READ, ['drafts', '5/response/11'])
            assert saved['justification'] == explanation and saved['step'] == 4 and saved['certified'] is True
            assert saved['attachments'][0]['file']['content'] == 'evidence-from-phone'
            assert saved['attachments'][0]['category'] == 'FREIGHT_BILL'

            state['offline'] = True
            context.set_offline(True)
            page.close()
            page = context.new_page()
            page.on('dialog', lambda dialog: dialog.accept())
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(args.base)
            expect(page.get_by_role('heading', name=store['store_name'], exact=True)).to_be_visible()
            for tab in ['SRP Guide Tab', 'Advisories Tab', 'Messages Tab', 'Notices Tab']:
                page.get_by_role('button', name=tab, exact=True).click()
                expect(page.locator('main')).to_be_visible()
                assert page.get_by_text('Loading price references…', exact=True).count() == 0
            page.get_by_role('button', name='View Notice', exact=True).first.click()
            # Inspect the opened blob directly; headless Chromium's PDF viewer
            # can abort navigation for our deliberately minimal synthetic PDF.
            page.evaluate("window.__originalOpen = window.open; window.open = () => ({ location: { set href(url) { window.__savedPdfUrl = url; } }, close() {} });")
            page.get_by_role('button', name='Open official document (PDF)').click()
            page.wait_for_function("typeof window.__savedPdfUrl === 'string'")
            assert 'synthetic saved document' in page.evaluate('async () => (await fetch(window.__savedPdfUrl)).text()')
            page.evaluate('window.open = window.__originalOpen')
            page.get_by_role('button', name='Close', exact=True).click()
            page.get_by_role('button', name='View Notice', exact=True).last.click()
            page.get_by_role('button', name='Open official document (PDF)').click()
            expect(page.get_by_text('This information has not been saved. Connect to download it.', exact=True)).to_be_visible()
            page.get_by_role('button', name='Close', exact=True).click()
            assert counts['documents'] == 1, 'Offline access changed legal document receipt'
            page.get_by_role('button', name='Open profile', exact=True).first.click()
            expect(page.get_by_text(user['email'], exact=True).last).to_be_visible()
            page.get_by_role('button', name='Manage notification settings', exact=True).click()
            expect(page.get_by_role('heading', name='Notification Settings', exact=True)).to_be_visible()
            page.get_by_role('button', name='Close', exact=True).click()
            page.get_by_role('button', name='Notices Tab', exact=True).click()
            results.append('Offline saved PDFs and profile; first unopened PDF requires connection')
            page.get_by_role('button', name='Submit Explanation', exact=True).first.click()
            expect(page.get_by_text(explanation, exact=True)).to_be_visible()
            expect(page.get_by_role('checkbox')).to_be_checked()
            page.get_by_role('button', name='Back', exact=True).click()
            page.get_by_role('button', name='Back', exact=True).click()
            page.get_by_label('Detailed written explanation').fill(explanation + ' Edited.')
            page.get_by_role('button', name='Next: Attach Evidence').click()
            page.get_by_role('button', name='Next: Certify & Review').click()
            expect(page.get_by_role('checkbox')).not_to_be_checked()
            page.get_by_role('checkbox').check()
            page.get_by_role('button', name='Submit Official Response').click()
            expect(page.get_by_text(re.compile('Pending delivery · Response'))).to_be_visible()
            assert counts['responses'] == 0
            results.append('Cold offline shell, saved tabs, exact wizard/files/categories and certification invalidation')

            page.get_by_role('button', name='Messages Tab', exact=True).click()
            page.get_by_role('textbox', name='Message', exact=True).fill('Message retained after restart')
            expect(page.get_by_text('Draft · Saved on this device', exact=True).last).to_be_visible()
            page.reload()
            page.get_by_role('button', name='Messages Tab', exact=True).click()
            expect(page.get_by_role('textbox', name='Message', exact=True)).to_have_value('Message retained after restart')
            page.get_by_role('button', name='Send', exact=True).click()
            expect(page.get_by_text('Pending delivery · Message', exact=True)).to_be_visible()
            assert counts['messages'] == 0
            results.append('Message draft restart and explicit offline queueing')

            state.update(offline=False, lose_ack=True)
            context.set_offline(False)
            page.wait_for_function('(' + OUTBOX + ')().then(rows => rows.some(row => row.operation === "response" && row.state === "received"))', timeout=20000)
            page.wait_for_function("async () => {const d=await new Promise(r=>{const q=indexedDB.open('price-watch-vendor-private-v1');q.onsuccess=()=>r(q.result)});const rows=await new Promise(r=>{const q=d.transaction('outbox').objectStore('outbox').getAll();q.onsuccess=()=>r(q.result)});const key=await new Promise(r=>{const q=d.transaction('meta').objectStore('meta').get('browser-key');q.onsuccess=()=>r(q.result)});d.close();return rows.length===2}")
            page.reload()
            page.get_by_role('button', name='Messages Tab', exact=True).click()
            second = context.new_page()
            second.goto(args.base)
            page.bring_to_front()
            expect(page.get_by_text('Received by DTI · Message', exact=True)).to_be_visible(timeout=45000)
            assert counts['responses'] == 1 and counts['messages'] == 1, counts
            assert len(receipts) == 2, 'Retry changed the submission UUID'
            private_cached = page.evaluate("async () => { const keys = await caches.keys(); const urls = (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat(); return urls.filter(url => new URL(url).pathname.startsWith('/api/')); }")
            assert not private_cached, 'Private API response entered a service-worker cache'
            results.append('Reconnect delivery, lost acknowledgement, reload and concurrent tabs accept each submission once')
            assert not errors, errors
            print(json.dumps({'passed': results, 'counts': counts, 'browser_errors': errors}, indent=2))
        except Exception:
            page.screenshot(path=str(Path(__file__).parents[2] / 'scratch' / 'vendor-offline-failure.png'))
            raise
        finally:
            browser.close()


if __name__ == '__main__':
    main()
