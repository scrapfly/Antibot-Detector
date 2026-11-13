'use strict';
// 3.1.9, the Detection tab's details:
//   What was checked   a scan's counts (cookies, scripts, requests, headers) and how its JS hooks ended, kept with the cached
//                      result and shown under the Cache row and under Nothing Detected; nothing for an older result
//   Cookie lifetimes   the details dialog's cookie rows say how long the cookie has lived (the worker's cookie timeline)
//   Edit rule, Copy evidence   two actions in the details dialog's links row
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const LOCALES = fs.readdirSync(path.join(root, '_locales'));

global.self = global;
global.Logger = { error() {}, debug() {}, warn() {} };
const ScanReport = require('../background/scan-report.js');
const DetectionSummary = require('../modules/core/detection-summary.js');
const CookieTimeline = require('../modules/core/cookie-timeline.js');

// ---- What was checked: the worker side
test('a finished scan\'s facts are its four counts and how the hooks ended; unknown counts give none', () => {
  const stats = { cookies: 12, scripts: 31, requests: 200, headers: 18, dom: 488, html: 1000 };
  assert.deepEqual(ScanReport.facts({ stats }), { cookies: 12, scripts: 31, requests: 200, headers: 18, hooks: 'done' });
  assert.equal(ScanReport.facts({ stats, hooksTimedOut: true }).hooks, 'timeout');
  assert.deepEqual(Object.keys(ScanReport.facts({ stats })), ['cookies', 'scripts', 'requests', 'headers', 'hooks'], 'counts only: no name, address or value');
  assert.equal(ScanReport.facts({ stats: { cookies: 1, headers: 2 } }), null, 'the match step never ran');
  assert.equal(ScanReport.facts({}), null);
  assert.equal(ScanReport.facts(null), null);
});

test('the facts travel with the result: saved by the scan and by late evidence, and in every answer the popup reads', () => {
  const lifecycle = read('background/detection-lifecycle.js');
  assert.match(lifecycle, /const scanFacts = scanFactsOf\(state\);[\s\S]*?\.\.\.\(scanFacts \? \{ scanFacts \} : \{\}\)/, 'the scan saves them');
  assert.match(lifecycle, /const scanFacts = stored \? stored\.scanFacts : scanFactsOf\(finishedState\);/, 'late evidence keeps them');
  assert.equal((lifecycle.match(/scanFacts: storedData(WithExpiry)?\?\.scanFacts/g) || []).length, 2, 'both NEW_DETECTION_DATA messages carry them');
  const manager = read('modules/detection/engine/detection-engine-manager.js');
  assert.match(manager, /scanFacts: storedData\.scanFacts\n\s*\};/, 'GET_DETECTION_DATA answers with them (no new message)');
  assert.match(manager, /httpStatus: storedData\.httpStatus,\n\s*scanFacts: storedData\.scanFacts\n\s*\}\)\.catch/, 'a cache hit sends them');
  assert.match(read('popup.js'), /scanFacts: request\.scanFacts/);
  assert.match(read('sections/detection/detection-requests.js'), /scanFacts: detectionData\.scanFacts \?\? nestedMeta\.scanFacts/);
});

function engineContext(extra = {}) {
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, console,
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: { warn() {}, debug() {}, detection() {}, cache() {}, error() {}, debugMode: false },
    StorageManager: { normalizeSettings: settings => settings || {} },
    setTimeout, clearTimeout,
    ...extra
  });
  context.self = context;
  for (const file of ['utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
    'modules/core/hooks-config.js', 'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`)]) {
    vm.runInContext(read(file), context, { filename: file });
  }
  return vm.runInContext('DetectionEngineManager', context);
}

test('the cache keeps the facts with the result, and says the hooks were off on a site that has them off', async () => {
  const stored = {};
  const settings = { detection: { hooksOffDomains: [] } };
  const Engine = engineContext({
    Utils: { getCacheScope: async () => 'full', getSettings: async () => settings },
    chrome: { storage: { local: {
      get: async () => ({ scrapfly_detection_storage: stored }),
      set: async (values) => { Object.assign(stored, values.scrapfly_detection_storage); }
    } } }
  });
  const facts = { cookies: 3, scripts: 4, requests: 5, headers: 6, hooks: 'done' };
  const found = [{ id: 'd', category: 'antibot', confidence: 90, detector: { id: 'd', name: 'D' }, matches: [{ type: 'cookie', value: 'a=b', confidence: 90 }] }];
  const url = 'https://shop.example.com/a';
  const saved = await Engine.storeDetection(url, { url, hostname: 'shop.example.com', scanFacts: facts }, found);
  assert.deepEqual({ ...saved.scanFacts }, facts);
  assert.deepEqual({ ...(await Engine.getStoredDetection(url)).scanFacts }, facts);

  settings.detection.hooksOffDomains = ['example.com'];
  const off = await Engine.storeDetection(url, { url, hostname: 'shop.example.com', scanFacts: facts }, found);
  assert.equal(off.scanFacts.hooks, 'off');
  assert.equal(facts.hooks, 'done', 'the scan\'s own object is not changed');

  const older = await Engine.storeDetection('https://old.test/', { url: 'https://old.test/', hostname: 'old.test' }, found);
  assert.equal('scanFacts' in older, false, 'none known, none saved');
});

// ---- What was checked: the popup side
function el(extra = {}) {
  const attrs = {};
  const listeners = {};
  const children = extra.children || {};
  return {
    hidden: true, textContent: '', dataset: {}, attrs,
    setAttribute(name, value) { attrs[name] = String(value); },
    getAttribute(name) { return name in attrs ? attrs[name] : null; },
    removeAttribute(name) { delete attrs[name]; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    click() { (listeners.click || []).forEach(fn => fn({ preventDefault() {} })); },
    querySelector: (selector) => children[selector] || null
  };
}

function loadUi(messages = null) {
  const counts = el();
  const hooks = el();
  const nodes = {
    '#scanFactsToggle': el(),
    '#scanFactsPanel': el({ children: { '[data-facts="counts"]': counts, '[data-facts="hooks"]': hooks } }),
    '#emptyFactsNote': el()
  };
  const context = vm.createContext({
    console, URL,
    Logger: { ui() {}, debug() {}, error() {}, detection() {}, warn() {} },
    chrome: { runtime: { getURL: (p) => p } },
    document: { querySelector: (selector) => nodes[selector] || null }
  });
  context.self = context;
  if (messages) context.I18n = { format: (key, ...args) => (messages[key] ? messages[key].message.replace(/\{(\d+)\}/g, (p, i) => String(args[i])) : null), locale: () => 'es' };
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('utils/format-utils.js'), context);
  vm.runInContext(read('sections/detection/detection-ui.js'), context);
  return { DetectionUI: context.DetectionUI, nodes, counts, hooks };
}

const FACTS = { cookies: 12, scripts: 31, requests: 200, headers: 18, hooks: 'timeout' };

test('the facts read as labelled counts and the hooks outcome; an older or unreadable result gives nothing', () => {
  const { DetectionUI } = loadUi();
  assert.deepEqual({ ...DetectionUI.scanFactsText(FACTS) }, {
    counts: 'Cookies: 12 · Scripts: 31 · Requests: 200 · Headers: 18', hooks: 'JS hooks: stopped at the time limit' });
  assert.equal(DetectionUI.scanFactsText({ ...FACTS, hooks: 'done' }).hooks, 'JS hooks: finished');
  assert.equal(DetectionUI.scanFactsText({ ...FACTS, hooks: 'off' }).hooks, 'JS hooks: off for this site');
  assert.equal(DetectionUI.scanFactsText({ ...FACTS, hooks: 'later' }).hooks, '', 'an outcome this version does not know says nothing');
  for (const none of [undefined, null, {}, { ...FACTS, cookies: '12' }, { ...FACTS, headers: -1 }, { ...FACTS, scripts: 1.5 }]) {
    assert.equal(DetectionUI.scanFactsText(none), null, JSON.stringify(none));
  }
  const es = loadUi(JSON.parse(read('_locales/es/messages.json'))).DetectionUI;
  assert.equal(es.scanFactsText(FACTS).counts, 'Cookies: 12 · Scripts: 31 · Solicitudes: 200 · Cabeceras: 18');
});

test('results: a closed square at the end of the Cache row opens the lines; the clean card gets one line; none without facts', () => {
  const { DetectionUI, nodes, counts, hooks } = loadUi();
  const toggle = nodes['#scanFactsToggle'];
  const panel = nodes['#scanFactsPanel'];
  const clean = nodes['#emptyFactsNote'];
  DetectionUI.syncScanFacts({ scanFacts: FACTS }, 'results');
  assert.equal(toggle.hidden, false);
  assert.equal(panel.hidden, true, 'closed until asked');
  assert.equal(clean.hidden, true);
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.hidden, false);
  assert.equal(counts.textContent, 'Cookies: 12 · Scripts: 31 · Requests: 200 · Headers: 18');
  assert.equal(hooks.textContent, 'JS hooks: stopped at the time limit');
  DetectionUI.syncScanFacts({ scanFacts: FACTS }, 'results');
  assert.equal(panel.hidden, false, 'open stays open for the next result');
  toggle.click();
  assert.equal(panel.hidden, true);

  DetectionUI.syncScanFacts({ scanFacts: { ...FACTS, hooks: 'done' } }, 'clean');
  assert.equal(clean.hidden, false);
  assert.equal(clean.textContent, 'Cookies: 12 · Scripts: 31 · Requests: 200 · Headers: 18 · JS hooks: finished');
  assert.equal(toggle.hidden, true);

  for (const [meta, where] of [[{}, 'results'], [{ httpStatus: 200 }, 'clean'], [null, 'results'], [{ scanFacts: FACTS }, null]]) {
    toggle.click();
    DetectionUI.syncScanFacts(meta, where);
    assert.equal(toggle.hidden, true, JSON.stringify([meta, where]));
    assert.equal(panel.hidden, true);
    assert.equal(clean.hidden, true);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  }
});

test('the square, the lines and the clean line are in the page, named, and wired to the results and the clean card', () => {
  const html = read('sections/detection/detection.html');
  const row = html.slice(html.indexOf('class="cache-expiry-line"'), html.indexOf('id="detectionChangeNote"'));
  assert.match(row, /<button type="button" id="scanFactsToggle"[^>]*aria-expanded="false"[^>]*aria-controls="scanFactsPanel"[^>]*hidden[^>]*data-i18n-aria-label="detectionFactsTitle"/);
  assert.match(row, /id="scanFactsPanel"[^>]*hidden>[\s\S]*?data-i18n="detectionFactsTitle"/);
  assert.match(html, /<p id="emptyFactsNote" class="state-card-checked state-card-facts"[^>]*hidden><\/p>/);
  const ui = read('sections/detection/detection-ui.js');
  assert.match(ui, /DetectionUI\.syncScanFacts\.call\(this, options\.cacheMetadata \|\| null, 'results'\);/);
  assert.match(ui, /DetectionUI\.syncScanFacts\.call\(this, options\.scan \|\| null, this\.scanOutcome === 'complete' && options\.scan \? 'clean' : null\);/);
});

// ---- Cookie lifetimes
test('the cookie summary line lives in CookieTimeline: the same words for Check Cookies and the details dialog', () => {
  const now = 10 * 3_600_000;
  const events = [
    { e: 'set', t: now - 4 * 60_000, x: now + 3_600_000, l: 120, m: 'a1b2c3' },
    { e: 'changed', t: now - 3 * 60_000, x: now + 3_600_000, l: 121, m: 'd4e5f6' },
    { e: 'changed', t: now - 2 * 60_000, x: now + 3_600_000, l: 121, m: '0a0b0c' },
    { e: 'changed', t: now - 40_000, x: now + 3_600_000, l: 122, m: '112233' }
  ];
  assert.equal(CookieTimeline.describe(events, now, { locale: 'en' }), 'set 4 min. ago · changed 3 times · last change 40 sec. ago · expires in 1 hr.');
  assert.equal(CookieTimeline.describe([], now), '');
  const de = JSON.parse(read('_locales/de/messages.json'));
  const t = (key, ...args) => de[key].message.replace(/\{(\d+)\}/g, (p, i) => String(args[i]));
  assert.equal(CookieTimeline.describe([{ e: 'set', t: 0, x: 3_600_000 }], 60_000, { t, locale: 'de' }), 'gesetzt vor 1 Min. · läuft ab in 59 Min.');
  assert.match(read('sections/advanced/components/cookie-results.js'), /return CookieTimeline\.describe\(events, now,/, 'Check Cookies uses it');
  // A name recorded under two domains: the one active last
  const cookies = { [CookieTimeline.keyOf('_abck', 'a.example.com')]: [{ e: 'set', t: 5 }], [CookieTimeline.keyOf('_abck', 'example.com')]: [{ e: 'set', t: 9 }], other: [{ e: 'set', t: 20 }] };
  assert.equal(CookieTimeline.eventsFor(cookies, '_abck')[0].t, 9);
  assert.equal(CookieTimeline.eventsFor(cookies, 'bm_sz'), null);
  assert.equal(CookieTimeline.eventsFor(null, '_abck'), null);
});

function row() {
  const classes = new Set(['method-item-card']);
  const appended = [];
  return {
    classList: { contains: (c) => classes.has(c), add: (c) => classes.add(c) },
    classes, appended,
    appendChild(node) { appended.push(node); },
    querySelector: () => null
  };
}

function loadModals({ timeline = null, detectors = {}, copied = [] } = {}) {
  const sent = [];
  const context = vm.createContext({
    console, URL, Date, Promise, setTimeout, clearTimeout,
    Logger: { warn() {}, debug() {}, ui() {}, error() {} },
    WorkerMessages: { COOKIE_TIMELINE_GET: 'COOKIE_TIMELINE_GET' },
    chrome: { runtime: { lastError: null, sendMessage: (message, reply) => { sent.push(message); reply(timeline ? { status: 'ok', ...timeline } : { status: 'error' }); } } },
    document: { querySelector: () => null, createElement: () => ({ setAttribute(name, value) { this[name] = value; } }) },
    I18n: { locale: () => 'en', format: () => null, tr: (k, fb) => fb, get: () => null }
  });
  context.self = context;
  for (const file of ['modules/core/categories.js', 'utils/format-utils.js', 'modules/core/detection-summary.js', 'modules/core/cookie-timeline.js', 'sections/detection/detection-modals.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  context.FormatUtils.copyToClipboard = async (text) => { copied.push(text); return true; };
  return { DM: context.DetectionModals, context, sent };
}

test('cookie rows get their life on this site, from the worker\'s timeline: times only, never the value', async () => {
  const now = 1_000_000;
  const timeline = { now, cookies: { [CookieTimeline.keyOf('_abck', 'example.com')]: [{ e: 'set', t: now - 4 * 60_000, x: now + 3_600_000, l: 9, m: 'abcdef' }] } };
  const { DM, sent } = loadModals({ timeline });
  const rows = [row(), row(), row()];
  const self = { modalElements: { methods: { children: rows } }, cacheMetadata: { url: 'https://www.example.com/p' } };
  const detection = { matches: [{ type: 'cookie', value: '_abck=SECRET~VALUE' }, { type: 'header', value: 'server: x' }, { type: 'cookie', value: 'unseen=1' }] };
  assert.equal(await DM.renderCookieLives.call(self, detection), 1);
  assert.equal(sent[0].type, 'COOKIE_TIMELINE_GET', 'the existing message, by name');
  assert.equal(sent[0].url, 'https://www.example.com/p');
  assert.equal(rows[0].appended[0].textContent, 'set 4 min. ago · expires in 1 hr.');
  assert.equal(rows[0].appended[0].className, 'method-cookie-life');
  assert.ok(rows[0].classes.has('has-life'));
  assert.doesNotMatch(rows[0].appended[0].textContent, /SECRET/);
  assert.equal(rows[1].appended.length, 0, 'not a cookie');
  assert.equal(rows[2].appended.length, 0, 'nothing recorded: no line');

  // No timeline (the worker cannot answer) or no cookie row: the rows stay as they are
  const quiet = loadModals({ timeline: null });
  const rows2 = [row()];
  assert.equal(await quiet.DM.renderCookieLives.call({ modalElements: { methods: { children: rows2 } }, cacheMetadata: { url: 'https://example.com/' } }, detection), 0);
  assert.equal(rows2[0].appended.length, 0);
  assert.equal(await DM.renderCookieLives.call(self, { matches: [{ type: 'url', value: 'https://x.test/' }] }), 0);
  assert.match(read('sections/detection/detection-modals.js'), /DetectionModals\.renderCookieLives\.call\(this, detection\);/);
});

test('the popup loads CookieTimeline and DetectionSummary before the details dialog', () => {
  const popup = [...read('popup.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  for (const module of ['modules/core/cookie-timeline.js', 'modules/core/detection-summary.js']) {
    assert.equal(popup.filter(file => file === module).length, 1, module);
    assert.ok(popup.indexOf(module) < popup.indexOf('sections/detection/detection-modals.js'), module);
  }
  assert.ok(popup.indexOf('utils/pattern-cache.js') < popup.indexOf('modules/core/cookie-timeline.js'), 'its regex guard first');
});

// ---- Copy evidence
test('the evidence of one detection as Markdown: names and patterns, never a cookie or header value, a query or a body', () => {
  const detection = {
    detector: { id: 'detect-cloudflare', name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 95,
    matches: [
      { type: 'cookie', value: '__cf_bm=SECRET1', confidence: 70 },
      { type: 'cookie', name: '__cf_bm', value: '__cf_bm=SECRET2', confidence: 90 },
      { type: 'header', value: 'cf-ray: SECRET3', confidence: 40 },
      { type: 'url', fullUrl: 'https://challenges.example/cdn-cgi/x.js?token=SECRET4#SECRET5', value: 'https://challenges.example/cdn-cgi/x.js?token=SECRET4' },
      { type: 'payload', value: '{"pw":"SECRET6"}' },
      { type: 'content', pattern: 'cf_chl_`opt', value: 'SECRET7 around it' },
      { type: 'js_hooks', pattern: 'toDataURL', confidence: 60 },
      { type: 'dom', value: '#challenge=SECRET8' }
    ],
    combinations: [{ name: 'Challenge page', confidence: 95 }]
  };
  const text = DetectionSummary.evidenceMarkdown(detection, { host: 'shop.example', category: 'Anti-bot', when: '2026-11-13' });
  assert.doesNotMatch(text, /SECRET/);
  assert.equal(text, [
    '## Cloudflare · 95%', '', 'shop.example · Anti-bot', '',
    '- cookie `__cf_bm` · 90%',
    '- header `cf-ray` · 40%',
    '- url `challenges.example/cdn-cgi/x.js`',
    '- payload',
    '- content ``cf_chl_`opt``',
    '- js\\_hooks `toDataURL` · 60%',
    '- dom `#challenge`',
    '- combination Challenge page · 95%',
    '', '_Scanned with Scrapfly Antibot Detector on 2026-11-13_', ''
  ].join('\n'));
  // A name that tries to be a link or a heading stays text
  assert.match(DetectionSummary.evidenceMarkdown({ detector: { name: '[x](https://evil.test)' } }), /^## \\\[x\\\]\(https:\/\/evil\.test\)\n/);
  assert.match(DetectionSummary.evidenceMarkdown(null), /^## \?\n/);
});

test('Copy evidence copies the detection shown, with the page\'s host; a refused copy is reported as every copy is', async () => {
  const copied = [];
  const { DM } = loadModals({ copied });
  const detection = { detector: { id: 'd', name: 'Akamai' }, category: 'antibot', confidence: 80, matches: [{ type: 'cookie', value: '_abck=SECRET' }] };
  const self = { activeModalIndex: 0, getDetectionByIndex: () => detection, cacheMetadata: { url: 'https://www.shop.example/a?b=SECRET' } };
  const text = await DM.copyEvidence.call(self);
  assert.equal(copied.length, 1);
  assert.equal(copied[0], text.trim());
  assert.match(copied[0], /^## Akamai · 80%\n\nwww\.shop\.example · Anti-bot\n\n- cookie `_abck`\n/);
  assert.doesNotMatch(copied[0], /SECRET/);
  assert.equal(await DM.copyEvidence.call({ ...self, getDetectionByIndex: () => null }), '');
  // The clipboard helper reports a refusal itself (clipboardCopyFailed); the dialog adds no second message
  assert.match(read('utils/format-utils.js'), /clipboardCopyFailed/);
  assert.match(read('sections/detection/detection-modals.js'), /await FormatUtils\.copyToClipboard\(text\.trim\(\)\);/);
});

// ---- Edit rule
test('Edit rule shows for a loaded rule only, closes the dialog and opens the rule in the Rules editor', async () => {
  const detectors = { antibot: { 'detect-akamai': { id: 'detect-akamai', name: 'Akamai', detection: { cookie: [] } } } };
  const { DM, context } = loadModals();
  const opened = [];
  const switched = [];
  context.window = { popupInstance: { switchTab: async (tab) => { switched.push(tab); }, rules: { openRuleById: async (id) => { opened.push(id); return true; } } } };
  const elements = { links: el(), website: el(), docs: el(), openTools: el(), editRule: el(), copyEvidence: el(), difficultyNote: el() };
  const self = { modalElements: elements, detectorManager: { getAllDetectors: () => detectors }, closed: 0, closeDetectionModal() { this.closed++; } };
  DM.bindAboutLinks.call(self);
  await DM.renderAbout.call(self, { detector: { id: 'detect-akamai', name: 'Akamai' }, category: 'antibot', confidence: 90 }, 'High');
  assert.equal(elements.editRule.hidden, false);
  assert.equal(elements.copyEvidence.hidden, false);
  assert.equal(elements.links.hidden, false, 'the row shows for its actions alone');
  elements.editRule.click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(self.closed, 1);
  assert.deepEqual(switched, ['rules']);
  assert.deepEqual(opened, ['detect-akamai']);

  await DM.renderAbout.call(self, { detector: { id: 'detect-deleted', name: 'Gone' }, category: 'antibot', confidence: 90 }, 'High');
  assert.equal(elements.editRule.hidden, true, 'a rule deleted since the scan has nothing to open');
  assert.equal(elements.copyEvidence.hidden, false);
});

test('the Rules tab opens a rule by id once its markup is loaded, as a click on its card does', async () => {
  const opened = [];
  const context = vm.createContext({ console, document: { querySelector: () => null } });
  context.Rules = function Rules() {};
  vm.runInContext(read('sections/rules/rules-editor-modal.js'), context);
  const rules = new context.Rules();
  let initialized = 0;
  rules.initialize = async () => { initialized++; };
  rules.getDetectorDisplayName = (name) => name;
  rules.openEditModal = (detector, category, detectorName, isNew) => opened.push({ detector, category, detectorName, isNew });
  rules.detectorManager = { getAllDetectors: () => ({ captcha: { 'detect-hcaptcha': { id: 'detect-hcaptcha', name: 'hCaptcha' } } }) };
  assert.equal(await rules.openRuleById('detect-hcaptcha'), true);
  assert.equal(initialized, 1);
  assert.equal(opened.length, 1);
  assert.equal(opened[0].category, 'captcha');
  assert.equal(opened[0].detectorName, 'detect-hcaptcha');
  assert.equal(opened[0].isNew, false);
  assert.deepEqual({ ...opened[0].detector.detection }, {});
  assert.equal(await rules.openRuleById('detect-none'), false);
  assert.equal(await rules.openRuleById(''), false);
  assert.equal(opened.length, 1);
});

test('the dialog has both actions, and every language has the new texts, translated', () => {
  const html = read('sections/detection/detection.html');
  const links = html.slice(html.indexOf('id="detectionModalLinks"'), html.indexOf('id="detectionModalCombinationsSection"'));
  assert.match(links, /<button type="button" id="detectionModalEditRule" class="detection-modal-link" hidden><span data-i18n="detectionModalEditRule">Edit rule<\/span><\/button>/);
  assert.match(links, /<button type="button" id="detectionModalCopyEvidence" class="detection-modal-link"><span data-i18n="detectionModalCopyEvidence">Copy evidence<\/span><\/button>/);
  const keys = ['detectionFactsTitle', 'detectionFactsCountsFmt', 'detectionFactsHooksDone', 'detectionFactsHooksTimeout', 'detectionFactsHooksOff',
    'detectionModalEditRule', 'detectionModalCopyEvidence'];
  const en = JSON.parse(read('_locales/en/messages.json'));
  for (const key of keys) assert.ok(en[key] && en[key].message && en[key].description, key);
  for (const locale of LOCALES.filter(name => name !== 'en')) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    for (const key of keys) {
      assert.ok(messages[key] && messages[key].message.trim(), `${locale}: ${key}`);
      assert.notEqual(messages[key].message, en[key].message, `${locale}: ${key} is translated`);
    }
    assert.equal((messages.detectionFactsCountsFmt.message.match(/\{\d\}/g) || []).join(), '{0},{1},{2},{3}', `${locale}: four counts in order`);
  }
});
