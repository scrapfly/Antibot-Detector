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
 */
function pageWorld({ sitemaps = {}, run = null } = {}) {
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
    setAttribute() {}, focus() {},
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
  const I18n = {
    tr: (key, fallback) => (en[key] ? en[key].message : fallback),
    format: (key, ...args) => (en[key] ? args.reduce((text, arg, i) => text.split(`{${i}}`).join(String(arg)), en[key].message) : ''),
    locale: () => 'en', dir: () => 'ltr', apply() {}, syncOverrideFromStorage: async () => {}
  };
  const ctx = vm.createContext({
    console, URL, Intl, Date, Math, JSON, Promise, Map, Set, setTimeout, clearTimeout, AbortController, Blob, document, I18n,
    FormatUtils: { categoryIconSvg: () => '', localDay: () => '2026-11-05' },
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
      storage: { onChanged: { addListener: (fn) => { onChanged = fn; } } }
    }
  });
  ctx.self = ctx;
  for (const file of ['modules/core/worker-messages.js', 'modules/core/categories.js', 'modules/core/bulk-scan.js', 'modules/core/bulk-filter.js', 'sections/bulk/bulk.js']) {
    vm.runInContext(read(file), ctx, { filename: file });
  }
  const byId = (id) => document.getElementById(id);
  return {
    byId, sent, fetched, ctx,
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
    update(nextRun) { onChanged({ session_bulk_scan: { newValue: nextRun } }, 'session'); }
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
