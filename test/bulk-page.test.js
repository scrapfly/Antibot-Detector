const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The Bulk scan page (sections/bulk/bulk.html) runs here as it does in the extension page: the real bulk.js, BulkScan,
// Categories and WorkerMessages in a vm context, with a fake document, a fake fetch and the worker's answers the test
// controls. The page reads the list, expands the sitemaps it names and hands the addresses to the worker.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const en = JSON.parse(read('_locales/en/messages.json'));

const urlset = (...locs) => `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map(loc => `<url><loc>${loc}</loc></url>`).join('')}</urlset>`;
const sitemapIndex = (...locs) => `<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs.map(loc => `<sitemap><loc>${loc}</loc></sitemap>`).join('')}</sitemapindex>`;

/**
 * @param {object} options
 *   sitemaps: address -> xml, or { body, url (where a redirect ended), status }; any other address fails like an unreachable host
 *   run: the run the worker answers to BULK_SCAN_STATE
 *   clipboardAccepts: false when the browser refuses a copy (FormatUtils.copyToClipboard answers false)
 *   session: what chrome.storage.session holds (History's hand-over); left out, the page has no session storage
 */
function pageWorld({ sitemaps = {}, run = null, local = {}, clipboard = [], clipboardAccepts = true, session = null } = {}) {
  const elements = new Map();
  const handlers = {};
  const sent = [];
  const fetched = [];
  let ready = null;
  let onChanged = null;
  const element = (id) => ({
    id, value: '', textContent: '', hidden: false, disabled: false, readOnly: false, className: '', title: '', dir: '', href: '', target: '', rel: '', innerHTML: '',
    dataset: {}, style: {}, children: [],
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    setAttribute() {}, focus() { document.activeElement = this; },
    appendChild(child) { this.children.push(child); return child; },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
    addEventListener(type, fn) { (handlers[id] = handlers[id] || {})[type] = fn; }
  });
  const document = {
    getElementById: (id) => { if (!elements.has(id)) elements.set(id, element(id)); return elements.get(id); },
    createElement: (tag) => element(`<${tag}>`),
    createDocumentFragment: () => element('<fragment>'),
    addEventListener: (type, fn) => { if (type === 'DOMContentLoaded') ready = fn; },
    documentElement: {}, body: { classList: { add() {} } }, activeElement: null, title: ''
  };
  const localStorage = { getItem: (key) => (key in local ? local[key] : null), setItem: (key, value) => { local[key] = String(value); } };
  const I18n = {
    tr: (key, fallback) => (en[key] ? en[key].message : fallback),
    format: (key, ...args) => (en[key] ? args.reduce((text, arg, i) => text.split(`{${i}}`).join(String(arg)), en[key].message) : ''),
    locale: () => 'en', dir: () => 'ltr', apply() {}, syncOverrideFromStorage: async () => {}
  };
  const ctx = vm.createContext({
    console, URL, Intl, Date, Math, JSON, Promise, Map, Set, setTimeout, clearTimeout, AbortController, Blob, document, I18n, localStorage,
    FormatUtils: { categoryIconSvg: () => '', localDay: () => '2026-11-05', copyToClipboard: async (text) => { clipboard.push(text); return clipboardAccepts; } },
    StorageManager: { readRaw: async () => ({}), normalizeSettings: (value) => value || {} },
    fetch: async (url) => {
      fetched.push(url);
      const found = sitemaps[url];
      if (found === undefined) throw new Error('Failed to fetch');
      const { body, url: finalUrl, status = 200 } = typeof found === 'string' ? { body: found } : found;
      return { ok: status >= 200 && status < 300, status, url: finalUrl || url, text: async () => body };
    },
    chrome: {
      runtime: {
        lastError: undefined,
        sendMessage: (message, callback) => {
          sent.push(message);
          const BulkScan = ctx.BulkScan;
          if (message.type === ctx.WorkerMessages.BULK_SCAN_STATE) callback({ status: 'ok', run });
          else if (message.type === ctx.WorkerMessages.BULK_SCAN_START) callback({ status: 'ok', run: BulkScan.createRun(BulkScan.prepare(message.entries, { cap: message.cap }), { cap: message.cap }) });
          else callback({ status: 'ok' });
        }
      },
      storage: Object.assign({ onChanged: { addListener: (fn) => { onChanged = fn; } } }, session ? { session: {
        get: async (key) => (key in session ? { [key]: plain(session[key]) } : {}),
        remove: async (key) => { delete session[key]; }
      } } : {})
    }
  });
  ctx.self = ctx;
  for (const file of ['modules/core/worker-messages.js', 'modules/core/categories.js', 'modules/core/http-status.js', 'modules/core/bulk-scan.js', 'modules/core/bulk-filter.js', 'modules/core/bulk-handoff.js', 'sections/bulk/bulk.js']) {
    vm.runInContext(read(file), ctx, { filename: file });
  }
  const byId = (id) => document.getElementById(id);
  return {
    byId, sent, fetched, ctx, handlers, document, local, clipboard,
    /** The table as drawn: for each row its address, its status and the words under the status (the reason). */
    rows: () => ((byId('bulkRows').children[0] || { children: [] }).children).map(row => ({
      address: row.children[1].children[0].textContent,
      status: row.children[2].children[0].textContent,
      reason: row.children[2].children[1] ? row.children[2].children[1].textContent : ''
    })),
    async open() { await ready(); },
    /** Paste the text and choose Start; resolves with the entries the page handed to the worker (null when it handed none). */
    async start(text) {
      byId('bulkInput').value = text;
      await handlers.bulkStartBtn.click();
      const message = sent.find(item => item.type === ctx.WorkerMessages.BULK_SCAN_START);
      return message ? plain(message.entries) : null;
    },
    /** The worker's run state changes (what chrome.storage.session tells the page). */
    update(nextRun) { onChanged({ session_bulk_scan: { newValue: nextRun } }, 'session'); },
    /** Session storage reports a change of one key (History handing addresses over while the page is open). */
    changed(key, newValue) { onChanged({ [key]: { newValue } }, 'session'); }
  };
}

const SITE = 'https://public.example/sitemap.xml';

// What a public sitemap may list besides its own pages: the machine the browser runs on, the local network, a cloud
// metadata address, another site, and addresses made to look like the site. What is judged is the address as listed: the
// worker opens it and follows its redirects (only the person's Sites to scan list is checked afterwards)
const OFF_SITE = [
  'http://127.0.0.1/admin', 'http://127.0.0.1:8080/', 'http://localhost/', 'http://[::1]/', 'http://192.168.1.5/router',
  'http://169.254.169.254/latest/meta-data/', 'https://other.example/page', 'https://shop.public.example/',
  'https://public.example.evil.example/', 'https://evil.example/?next=https://public.example/', 'https://public.example@evil.example/',
  'https://evil.example\\@public.example/'
];
const OWN = ['https://public.example/', 'https://public.example/products?id=1', 'https://www.public.example/about', 'http://public.example:8080/legacy'];

test('a public sitemap only contributes its listed addresses of its own site: not this machine, not the local network, not another host', async () => {
  const page = pageWorld({ sitemaps: { [SITE]: urlset(OWN[0], OFF_SITE[0], OFF_SITE[1], OFF_SITE[2], OFF_SITE[3], OWN[1], OFF_SITE[4], OFF_SITE[5], OFF_SITE[6],
    OWN[2], OFF_SITE[7], OFF_SITE[8], OFF_SITE[9], OFF_SITE[10], OWN[3], 'ftp://public.example/file', 'file:///etc/passwd', 'javascript:alert(1)') } });
  await page.open();
  const entries = await page.start(SITE);
  assert.deepEqual(entries, OWN, 'its own listed addresses (the www spelling, another port or scheme on the same host) and nothing else, in order');
  for (const address of OFF_SITE) assert.ok(!entries.includes(address), address);
});

test('a sitemap index is followed only to listed sitemaps of its own site: a sitemap listed for another host is never fetched', async () => {
  const index = 'https://public.example/index.xml';
  const page = pageWorld({ sitemaps: {
    [index]: sitemapIndex('https://public.example/pages.xml', 'https://other.example/evil.xml', 'http://127.0.0.1/s.xml', 'https://www.public.example/more.xml', 'http://192.168.1.5/sitemap.xml'),
    'https://public.example/pages.xml': urlset('https://public.example/a', 'http://192.168.1.5/'),
    'https://www.public.example/more.xml': urlset('https://www.public.example/b'),
    'https://other.example/evil.xml': urlset('https://other.example/stolen')
  } });
  await page.open();
  const entries = await page.start(index);
  assert.deepEqual(entries, ['https://public.example/a', 'https://www.public.example/b']);
  assert.deepEqual(page.fetched, [index, 'https://public.example/pages.xml', 'https://www.public.example/more.xml'], 'only the sitemaps listed for the site\'s own host are fetched');
});

test('a sitemap that sends the browser to another site is not read: what it lists is not the site\'s own list', async () => {
  const moved = pageWorld({ sitemaps: { [SITE]: { url: 'https://evil.example/sitemap.xml', body: urlset('https://public.example/x', 'https://evil.example/y') } } });
  await moved.open();
  assert.deepEqual(await moved.start(SITE), [{ url: SITE, reason: 'moved' }], 'listed as a sitemap that was not read, with a reason of its own');

  const sameSite = pageWorld({ sitemaps: { [SITE]: { url: 'https://www.public.example/sitemap.xml', body: urlset('https://public.example/x') } } });
  await sameSite.open();
  assert.deepEqual(await sameSite.start(SITE), ['https://public.example/x'], 'to the www spelling of the same site it is read');
});

test('addresses the person pastes stay untouched, whatever host they name: local test pages are a real use', async () => {
  const pasted = ['http://127.0.0.1:8080/local-test', '192.168.1.5/page', 'https://other.example/', 'http://localhost:3000/'];
  const page = pageWorld({ sitemaps: { [SITE]: urlset('https://public.example/a', 'http://127.0.0.1/admin') } });
  await page.open();
  const entries = await page.start([pasted[0], SITE, pasted[1], pasted[2], pasted[3]].join('\n'));
  assert.deepEqual(entries, [pasted[0], 'https://public.example/a', pasted[1], pasted[2], pasted[3]]);
});

test('a sitemap on a local address lists local pages of its own host only', async () => {
  const local = 'https://localhost/sitemap.xml';
  const page = pageWorld({ sitemaps: { [local]: urlset('https://localhost/a', 'http://localhost:8080/b', 'http://127.0.0.1/c', 'https://public.example/d') } });
  await page.open();
  assert.deepEqual(await page.start(local), ['https://localhost/a', 'http://localhost:8080/b']);
});

// ---- The "Most seen" line under the totals

const BulkScan = require('../modules/core/bulk-scan.js');
const FSI = '⁨';
const PDI = '⁩';
const NAMES = ['Cloudflare', 'reCAPTCHA', 'Akamai', 'DataDome', 'PerimeterX', 'Canvas', 'Audio'];
/** Seven scanned pages; the first name is on all seven, the second on six, and so on down to the last on one. */
function seenRun() {
  const run = BulkScan.createRun({ items: NAMES.map((_, i) => ({ url: `https://p${i}.example/`, status: 'waiting' })) }, { now: 1 });
  run.items.forEach((item, i) => {
    item.status = 'done';
    item.detections = NAMES.slice(0, NAMES.length - i).map(name => ({ name, category: 'antibot', confidence: 90 }));
  });
  return plain(run);
}
const cleanRun = () => plain(BulkScan.createRun({ items: ['https://a.example/', 'https://b.example/'].map(url => ({ url, status: 'done', detections: [] })) }, { now: 1 }));

test('the Most seen line names the protections found on the most pages, top five with their counts, under the totals', async () => {
  const page = pageWorld({ run: seenRun() });
  await page.open();
  const line = page.byId('bulkRunMostSeen');
  assert.equal(line.hidden, false);
  assert.equal(line.textContent, `Most seen: ${['Cloudflare (7)', 'reCAPTCHA (6)', 'Akamai (5)', 'DataDome (4)', 'PerimeterX (3)'].map(item => `${FSI}${item}${PDI}`).join(' · ')}`);
  assert.equal(page.byId('bulkRunCounts').textContent, 'Done: 7 · With protections: 7 · Failed: 0 · Skipped: 0', 'the totals are what they were');
});

test('the line follows the run as it changes, and is hidden when nothing was found', async () => {
  const page = pageWorld({ run: cleanRun() });
  await page.open();
  assert.equal(page.byId('bulkRunMostSeen').hidden, true, 'scanned pages with no protection: nothing to say');
  assert.equal(page.byId('bulkRunMostSeen').textContent, '');
  assert.equal(page.byId('bulkRunCounts').textContent, 'Done: 2 · With protections: 0 · Failed: 0 · Skipped: 0');

  page.update(seenRun());
  assert.equal(page.byId('bulkRunMostSeen').hidden, false);
  assert.match(page.byId('bulkRunMostSeen').textContent, /^Most seen: /);

  const oneProtection = plain(BulkScan.createRun({ items: [{ url: 'https://a.example/', status: 'done', detections: [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }] }, { url: 'https://b.example/', status: 'failed', reason: 'load' }] }, { now: 1 }));
  page.update(oneProtection);
  assert.equal(page.byId('bulkRunMostSeen').textContent, `Most seen: ${FSI}Cloudflare (1)${PDI}`, 'fewer than five: all of them');

  page.update(cleanRun());
  assert.equal(page.byId('bulkRunMostSeen').hidden, true);
  assert.equal(page.byId('bulkRunMostSeen').textContent, '');
});

test('the page has the line (hidden until a protection is found) right under the totals, and every language has its label', () => {
  const html = read('sections/bulk/bulk.html');
  assert.match(html, /<p class="bulk-muted" id="bulkRunCounts"><\/p>\s*<p class="bulk-muted" id="bulkRunMostSeen" hidden><\/p>/);
  assert.equal(en.bulkMostSeenFmt.message, 'Most seen: {0}');
  assert.ok(en.bulkMostSeenFmt.description.includes('{0}'));
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${code}/messages.json`));
    assert.ok(messages.bulkMostSeenFmt && messages.bulkMostSeenFmt.message.includes('{0}'), `${code} has the label with its {0}`);
  }
});

// ---- What the table says about a sitemap that was not read

const skippedRun = (...rows) => plain(BulkScan.createRun({ items: rows.map(([url, reason]) => ({ url, status: 'skipped', reason })) }, { now: 1 }));

test('a sitemap that moved to another site says the file could not be read, not that only https sitemaps can be; one that failed to load keeps its own words', async () => {
  const page = pageWorld({ run: skippedRun(['https://moved.example/sitemap.xml', 'moved'], ['https://down.example/sitemap.xml', 'sitemap'], ['ftp://x.example/', 'scheme']) });
  await page.open();
  assert.deepEqual(page.rows(), [
    { address: 'https://moved.example/sitemap.xml', status: 'Skipped', reason: 'The file could not be read.' },
    { address: 'https://down.example/sitemap.xml', status: 'Skipped', reason: 'The sitemap could not be read. Only https sitemaps can be read.' },
    { address: 'ftp://x.example/', status: 'Skipped', reason: 'Only http and https pages are scanned' }
  ]);
  assert.ok(!page.rows()[0].reason.includes('https'), 'the https hint is for a sitemap that was not fetched, not for one that was refused');
});

test('the reason a sitemap line gets follows what happened to it: moved to another site, or not read', async () => {
  const run = async (sitemaps) => { const page = pageWorld({ sitemaps }); await page.open(); return page.start(SITE); };
  assert.deepEqual(await run({ [SITE]: { url: 'https://evil.example/sitemap.xml', body: urlset('https://public.example/x') } }), [{ url: SITE, reason: 'moved' }]);
  assert.deepEqual(await run({}), [{ url: SITE, reason: 'sitemap' }], 'a sitemap the browser could not fetch');
  assert.deepEqual(await run({ [SITE]: { status: 404, body: 'no' } }), [{ url: SITE, reason: 'sitemap' }], 'an error from the site');
  assert.deepEqual(await run({ [SITE]: '<html><body>not a sitemap</body></html>' }), [{ url: SITE, reason: 'sitemap' }], 'something that is not a sitemap');
  assert.deepEqual(await run({ [SITE]: { url: 'https://www.public.example/sitemap.xml', body: urlset('https://public.example/x') } }), ['https://public.example/x'], 'the www spelling of the same site is read');
  // A sitemap index whose child moved: the pages of the other children are kept, and no row for the one left out
  const index = 'https://public.example/index.xml';
  const page = pageWorld({ sitemaps: {
    [index]: sitemapIndex('https://public.example/a.xml', 'https://public.example/b.xml'),
    'https://public.example/a.xml': { url: 'https://evil.example/a.xml', body: urlset('https://public.example/from-a') },
    'https://public.example/b.xml': urlset('https://public.example/from-b')
  } });
  await page.open();
  assert.deepEqual(await page.start(index), ['https://public.example/from-b']);
});

// ---- 3.1.6: remembered filter, copy as lines, empty filter, focus ----

const finished = (url, detections) => ({ url, status: 'done', detections, finishedAt: 1 });
const runOf = (items, status = 'done') => ({ status, items, cap: 200, timeoutSec: 45 });

test('the Show filter chosen last time is there when the page opens again, and an unknown stored value is ignored', async () => {
  const items = [finished('https://a.example/', [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }]), finished('https://b.example/', [])];
  const first = pageWorld({ run: runOf(items) });
  await first.open();
  first.byId('bulkFilter').value = 'found';
  first.handlers.bulkFilter.change({ target: first.byId('bulkFilter') });
  assert.equal(first.local.bulkFilter, 'found');
  const second = pageWorld({ run: runOf(items), local: first.local });
  await second.open();
  assert.equal(second.byId('bulkFilter').value, 'found');
  assert.deepEqual(second.rows().map(row => row.address), ['https://a.example/']);
  const odd = pageWorld({ run: runOf(items), local: { bulkFilter: 'nonsense' } });
  await odd.open();
  assert.equal(odd.byId('bulkFilter').value, 'all');
  assert.equal(odd.rows().length, 2);
});

test('Copy as lines writes one line per shown page, and nothing for a filter that shows no page', async () => {
  const items = [
    finished('https://a.example/p?token=SECRET', [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }]),
    finished('https://b.example/', []),
    { url: 'https://c.example/', status: 'failed', reason: 'timeout' }
  ];
  const page = pageWorld({ run: runOf(items), local: { bulkFilter: 'found' } });
  await page.open();
  await page.handlers.bulkCopyLinesBtn.click();
  assert.deepEqual(page.clipboard, ['https://a.example/p: Cloudflare 90%']);
  page.byId('bulkFilter').value = 'all';
  page.handlers.bulkFilter.change({ target: page.byId('bulkFilter') });
  await page.handlers.bulkCopyLinesBtn.click();
  assert.equal(page.clipboard[1], 'https://a.example/p: Cloudflare 90%\nhttps://b.example/: -\nhttps://c.example/: failed (timeout)');
});

test('Copy as lines says Copied only when the browser took the text: a refused copy says so, as a warning', async () => {
  const items = [finished('https://a.example/', [{ name: 'Cloudflare', category: 'antibot', confidence: 90 }])];
  const copy = async (options) => {
    const page = pageWorld({ run: runOf(items), ...options });
    await page.open();
    const notice = page.byId('bulkNotice'), tones = [];
    notice.classList.toggle = (name, on) => tones.push([name, on]);
    await page.handlers.bulkCopyLinesBtn.click();
    return { page, notice, tones };
  };

  const taken = await copy({});
  assert.deepEqual(taken.page.clipboard, ['https://a.example/: Cloudflare 90%']);
  assert.equal(taken.notice.textContent, en.copiedNotification.message);
  assert.equal(taken.notice.hidden, false);
  assert.deepEqual(taken.tones, [['bulk-notice--warn', false]]);

  const refused = await copy({ clipboardAccepts: false });
  assert.deepEqual(refused.page.clipboard, ['https://a.example/: Cloudflare 90%'], 'the page did ask for the copy');
  assert.equal(refused.notice.textContent, en.clipboardCopyFailed.message);
  assert.notEqual(refused.notice.textContent, en.copiedNotification.message);
  assert.equal(refused.notice.hidden, false);
  assert.deepEqual(refused.tones, [['bulk-notice--warn', true]], 'the page\'s warning look, like its other things that did not work');
});

test('a filter that matches no page says so in the table instead of leaving it blank', async () => {
  const page = pageWorld({ run: runOf([finished('https://b.example/', [])]) });
  await page.open();
  page.byId('bulkFilter').value = 'found';
  page.handlers.bulkFilter.change({ target: page.byId('bulkFilter') });
  const rows = page.byId('bulkRows').children[0].children; // the fake body holds the fragment
  assert.equal(rows.length, 1);
  assert.equal(rows[0].children[0].textContent, en.bulkFilterNone.message);
  assert.equal(rows[0].children[0].colSpan, 5);
});

test('keyboard focus moves to Pause when Start, which was just pressed, becomes disabled', async () => {
  const page = pageWorld({});
  await page.open();
  const running = runOf([{ url: 'https://a.example/', status: 'scanning' }], 'running');
  page.document.activeElement = page.byId('bulkStartBtn');
  page.byId('bulkPauseBtn').focus = () => { page.document.activeElement = page.byId('bulkPauseBtn'); };
  page.update(running);
  assert.equal(page.byId('bulkStartBtn').disabled, true);
  assert.equal(page.document.activeElement, page.byId('bulkPauseBtn'));
});

test('the results table has a name for screen readers and the page has the new buttons and strings in every language', () => {
  const html = read('sections/bulk/bulk.html');
  assert.match(html, /<table class="bulk-table"[^>]*aria-labelledby="bulkResultsTitle"/);
  assert.match(html, /id="bulkCopyLinesBtn"[^>]*data-i18n="bulkCopyLines"/);
  for (const code of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${code}/messages.json`));
    for (const key of ['bulkCopyLines', 'bulkFilterNone']) assert.ok(messages[key] && messages[key].message, `${code}: ${key}`);
  }
});

test('a finished row shows its HTTP status beside Done, toned when it is an error; a row without one shows none', async () => {
  const page = pageWorld({ run: runOf([
    { ...finished('https://a.example/', []), httpStatus: 403 },
    { ...finished('https://b.example/', []), httpStatus: 503 },
    { ...finished('https://c.example/', []), httpStatus: 200 },
    finished('https://d.example/', []),
    { url: 'https://e.example/', status: 'failed', reason: 'timeout', httpStatus: 500 }
  ]) });
  await page.open();
  const pills = page.byId('bulkRows').children[0].children.map(row => row.children[2].children[0]);
  const codes = pills.map(pill => pill.children.filter(child => typeof child === 'object').map(child => [child.textContent, child.className]));
  assert.deepEqual(codes, [
    [['403', 'bulk-http bulk-http--warn']],
    [['503', 'bulk-http bulk-http--error']],
    [['200', 'bulk-http bulk-http--ok']],
    [],
    []
  ], 'only a finished page with a known status shows one');
  assert.equal(pills[0].children[0], ' · ', '"Done · 403"');
  assert.equal(pills[0].children[1].title, en.detectionTipHttpStatus.message);
});

test('a run paused because the extension was switched off says so under its status; a pause the person chose says nothing more', async () => {
  const BulkScan = require('../modules/core/bulk-scan.js');
  const held = BulkScan.createRun({ items: [{ url: 'https://a.example/', status: 'done', detections: [] }, { url: 'https://b.example/', status: 'scanning' }] }, { now: 1 });
  BulkScan.hold(held, 'off');
  const page = pageWorld({ run: plain(held) });
  await page.open();
  assert.match(page.byId('bulkRunStatus').textContent, /^Paused · 1 of 2 finished$/);
  assert.equal(page.byId('bulkRunReason').hidden, false);
  assert.equal(page.byId('bulkRunReason').textContent, en.bulkStoppedOff.message);
  assert.equal(page.byId('bulkResumeBtn').hidden, false, 'Resume is there, for when the extension is on again');
  // Switched on again (the worker drops the reason): a plain pause
  BulkScan.release(held, 'off');
  page.update(plain(held));
  assert.equal(page.byId('bulkRunReason').hidden, true);
  assert.equal(page.byId('bulkRunReason').textContent, '');
  const paused = BulkScan.createRun({ items: [{ url: 'https://a.example/', status: 'waiting' }] }, { now: 1 });
  BulkScan.pause(paused);
  page.update(plain(paused));
  assert.equal(page.byId('bulkRunReason').hidden, true, 'the person\'s own pause needs no words');
});

// History → Select entries → Bulk scan hands the selected addresses over through session storage (BulkHandoff)

const HANDOFF_KEY = 'session_bulk_from_history';
const handoff = (urls, at = Date.now()) => ({ urls, at });
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('the pages History hands over fill the list once: the hand-over is removed, the page says how many came and the keyboard goes to Start', async () => {
  const session = { [HANDOFF_KEY]: handoff(['https://a.example/', 'https://b.example/x', 'https://a.example/']) };
  const page = pageWorld({ session });
  await page.open();
  assert.equal(page.byId('bulkInput').value, 'https://a.example/\nhttps://b.example/x', 'each address once, in the order History showed them');
  assert.ok(!(HANDOFF_KEY in session), 'taken once: opening the page again later starts empty');
  assert.equal(page.byId('bulkNotice').textContent, 'Pages from History: 2');
  assert.equal(page.byId('bulkNotice').hidden, false);
  assert.equal(page.document.activeElement, page.byId('bulkStartBtn'));
  assert.equal(page.byId('bulkInputCount').textContent, 'Addresses: 2');
  // Start hands them to the worker like a typed list: the cap and Sites to scan are the worker's, at the start of the run
  const entries = await page.start(page.byId('bulkInput').value);
  assert.deepEqual(entries, ['https://a.example/', 'https://b.example/x']);
});

test('a run going on is left alone: the pages from History do not replace its list, and the page says so', async () => {
  const run = { id: 'r1', status: 'running', items: [], cap: 200 };
  const session = { [HANDOFF_KEY]: handoff(['https://a.example/']) };
  const page = pageWorld({ session, run });
  await page.open();
  assert.equal(page.byId('bulkInput').value, '', 'the list is not touched');
  assert.ok(!(HANDOFF_KEY in session), 'the hand-over is still used up, so it never fills a later list by surprise');
  assert.equal(page.byId('bulkNotice').textContent, 'A bulk scan is in progress, so the pages from History were not added.');
  assert.ok(!page.sent.some(message => message.type === page.ctx.WorkerMessages.BULK_SCAN_START), 'nothing is started');
});

test('a hand-over the page never took in time (it did not open) does not fill a list opened later from the menu', async () => {
  const session = { [HANDOFF_KEY]: handoff(['https://a.example/'], Date.now() - 10 * 60 * 1000) };
  const page = pageWorld({ session });
  await page.open();
  assert.equal(page.byId('bulkInput').value, '');
  assert.equal(page.byId('bulkNotice').textContent, '', 'and says nothing');
  assert.ok(!(HANDOFF_KEY in session), 'and it is cleared');
});

test('the page already open takes pages handed over later, as they arrive; their removal is not a new hand-over', async () => {
  const session = {};
  const page = pageWorld({ session });
  await page.open();
  assert.equal(page.byId('bulkInput').value, '');
  session[HANDOFF_KEY] = handoff(['https://c.example/']);
  page.changed(HANDOFF_KEY, session[HANDOFF_KEY]);
  await settle(); await settle();
  assert.equal(page.byId('bulkInput').value, 'https://c.example/');
  assert.ok(!(HANDOFF_KEY in session));
  page.byId('bulkInput').value = 'typed';
  page.changed(HANDOFF_KEY, undefined);
  await settle();
  assert.equal(page.byId('bulkInput').value, 'typed', 'a removal reported by storage changes nothing');
});

test('without session storage the page opens as before, with an empty list', async () => {
  const page = pageWorld();
  await page.open();
  assert.equal(page.byId('bulkInput').value, '');
});
