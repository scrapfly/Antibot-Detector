const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The Logger prints one readable line per event, stays silent and free below
// its level, and never drops lines without saying so. The scan report turns
// one finalized page into one collapsible block.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// A fresh Logger in its own realm, as the service worker sees it
function loadLogger({ debug = false, verbose = false, collector = null } = {}) {
  const out = [];
  const record = (kind) => (...args) => out.push({ kind, text: args.join(' ') });
  const context = vm.createContext({
    console: { log: record('log'), warn: record('warn'), error: record('error'), debug: record('debug'),
      groupCollapsed: record('group'), groupEnd() {} },
    Date, Math, JSON, Object, Array, Map, Set, String, Number, Error, TypeError, RegExp, URL,
    setTimeout, clearTimeout,
    debugMode: debug, debugVerbose: verbose, logCollector: collector
  });
  context.globalThis = context;
  context.self = context;
  vm.runInContext(read('modules/core/logger.js'), context);
  // Service-worker context: print, do not relay
  Object.defineProperty(context.Logger, 'context', { get: () => 'background' });
  return { Logger: context.Logger, out, context };
}

test('info lines need Debug mode; debug lines also need Verbose logs; warnings always print', () => {
  const off = loadLogger();
  off.Logger.background('hidden');
  off.Logger.debug('SCAN', 'hidden');
  off.Logger.warn('STORAGE', 'Storage is full');
  assert.deepStrictEqual(off.out.map(o => o.kind), ['warn']);

  const debug = loadLogger({ debug: true });
  debug.Logger.background('shown');
  debug.Logger.debug('SCAN', 'still hidden');
  assert.deepStrictEqual(debug.out.map(o => o.kind), ['log']);

  const verbose = loadLogger({ debug: true, verbose: true });
  verbose.Logger.debug('SCAN', 'shown');
  assert.deepStrictEqual(verbose.out.map(o => o.kind), ['debug']);
});

test('a hidden level does no formatting work', () => {
  const { Logger } = loadLogger();
  let touched = false;
  const data = { get expensive() { touched = true; return 1; } };
  Logger.background('x', data);
  Logger.debug('SCAN', 'x', data);
  assert.strictEqual(touched, false);
});

test('one line: time, origin/area, message, data as key=value', () => {
  const { Logger, out } = loadLogger({ debug: true });
  Logger.background('Saved', { tab: 12, url: 'https://a.test/x', list: ['a', 'b'], nested: { k: 'v w' } });
  assert.match(out[0].text, /^\[\d\d:\d\d:\d\d\.\d{3}\] bg\/background  Saved · tab=12 url=https:\/\/a\.test\/x list=\[a, b\] nested=\{k="v w"\}$/);
  assert.ok(!out[0].text.includes('{"'), 'no JSON dumps');
});

test('errors print as "Name: message (file:line)" without the whole stack', () => {
  const { Logger, out } = loadLogger();
  const error = new TypeError('x is undefined');
  error.stack = 'TypeError: x is undefined\n    at run (chrome-extension://abc/background/detection-lifecycle.js:42:7)\n    at next (chrome-extension://abc/background.js:9:1)';
  Logger.error('SCAN', 'Scan failed on a.test', error);
  assert.strictEqual(out.length, 1);
  assert.match(out[0].text, /bg\/scan  Scan failed on a\.test · TypeError: x is undefined \(background\/detection-lifecycle\.js:42\)$/);
  assert.ok(!out[0].text.includes('background.js:9'), 'first frame only unless verbose');
});

test('long values are cut and big arrays previewed', () => {
  const { Logger, out } = loadLogger({ debug: true });
  Logger.background('Long', { text: 'z'.repeat(1000), items: Array.from({ length: 50 }, (_, i) => i) });
  assert.ok(out[0].text.length < 400, `line is ${out[0].text.length} chars`);
  assert.match(out[0].text, /items=\[0, 1, 2, 3, 4, 5, \+44\]/);
});

test('repeats are collapsed and counted, not dropped silently', () => {
  const { Logger, out } = loadLogger();
  for (let i = 0; i < 10; i++) Logger.warn('HOOKS', 'Hook failed: Navigator.prototype.x');
  assert.strictEqual(out.length, Logger.MAX_REPEATS);
  // The burst ends once its window passes; the next copy reports the hidden count
  const entry = Logger._repeats.values().next().value;
  entry.start -= Logger.REPEAT_WINDOW_MS + 1;
  Logger.warn('HOOKS', 'Hook failed: Navigator.prototype.x');
  assert.ok(out.some(o => /\(repeated 7 more times\)$/.test(o.text)), out.map(o => o.text).join('\n'));
});

test('a burst over the per-second cap is reported as skipped lines', () => {
  const { Logger, out } = loadLogger({ debug: true });
  for (let i = 0; i < Logger.RATE_LIMIT.INFO + 15; i++) Logger.background(`line ${i}`);
  assert.strictEqual(out.length, Logger.RATE_LIMIT.INFO);
  Logger._rateWindowStart -= Logger.RATE_WINDOW_MS;
  Logger.background('next second');
  assert.ok(out.some(o => o.kind === 'warn' && /15 log lines skipped/.test(o.text)));
});

test('the repeat map stays bounded', () => {
  const { Logger } = loadLogger({ debug: true });
  for (let i = 0; i < Logger.MAX_REPEAT_KEYS * 3; i++) Logger.background(`distinct ${i}`);
  assert.ok(Logger._repeats.size <= Logger.MAX_REPEAT_KEYS);
});

test('a report is one collapsed group with its detail lines', () => {
  const { Logger, out } = loadLogger({ debug: true });
  Logger.report('SCAN', 'a.test · 2 detections', ['Anti-bot  X  90%', 'Data  cookies=3']);
  assert.deepStrictEqual(out.map(o => o.kind), ['group', 'log']);
  assert.match(out[0].text, /bg\/scan  a\.test · 2 detections$/);
  assert.strictEqual(out[1].text, '  Anti-bot  X  90%\n  Data  cookies=3');
  const off = loadLogger();
  off.Logger.report('SCAN', 'hidden', ['x']);
  assert.deepStrictEqual(off.out, []);
});

test('with the Log Collector on, info goes to the collector only and warnings still print', () => {
  const collected = [];
  const collector = { enabled: true, addLog: (level, args) => collected.push([level, args[0]]) };
  const { Logger, out } = loadLogger({ debug: true, collector });
  Logger.background('quiet');
  Logger.warn('SCAN', 'loud');
  assert.strictEqual(collected.length, 1);
  assert.match(collected[0][1], /bg\/background  quiet$/);
  assert.deepStrictEqual(out.map(o => o.kind), ['warn']);
});

test('content-script lines reach the worker in one batched message', async () => {
  const sent = [];
  const context = vm.createContext({
    console, Date, Math, JSON, Object, Array, Map, Set, String, Number, Error, RegExp, URL, setTimeout, clearTimeout,
    debugMode: true, debugVerbose: false,
    chrome: { runtime: { id: 'ext', sendMessage: (msg) => { sent.push(msg); return Promise.resolve(); } } },
    location: { protocol: 'https:' }
  });
  context.globalThis = context;
  context.self = context;
  vm.runInContext(read('modules/core/logger.js'), context);
  const { Logger } = context;
  assert.strictEqual(Logger.context, 'content');
  for (let i = 0; i < 5; i++) Logger.content(`step ${i}`);
  assert.strictEqual(sent.length, 0, 'nothing sent synchronously');
  await new Promise(r => setTimeout(r, Logger.BATCH_MS + 50));
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].type, 'LOG');
  assert.deepStrictEqual(Array.from(sent[0].logs, l => l.message), ['step 0', 'step 1', 'step 2', 'step 3', 'step 4']);
});

test('extension pages are their own context, not "content"', () => {
  const context = vm.createContext({ console, Date, Math, JSON, Object, Array, Map, Set, String, Number, Error, RegExp, URL,
    setTimeout, clearTimeout, chrome: { runtime: { id: 'ext' } }, location: { protocol: 'chrome-extension:' } });
  context.globalThis = context;
  context.self = context;
  vm.runInContext(read('modules/core/logger.js'), context);
  assert.strictEqual(context.Logger.context, 'popup');
});

test('the worker prints relayed content-script batches as page lines', () => {
  const printed = [];
  const registry = {};
  const context = vm.createContext({
    Logger: { MAX_BATCH: 50, _outputToConsole: (log) => printed.push(log) },
    globalThis: null
  });
  context.globalThis = context;
  context.ScrapflyBridgeProtocol = { MESSAGE_TYPES: { DEBUG_LOG: 'SCRAPFLY_DEBUG_LOG', HOOK_FAILURE_REPORT: 'HOOK_FAILURE_REPORT' } };
  vm.runInContext(read('background/handlers/messages-logging.js') + '\nregisterLoggingHandlers(registry, {});', Object.assign(context, { registry }));
  registry.LOG({ request: { logs: [{ message: 'a', context: 'background' }, { message: 'b' }] } });
  registry.LOG({ request: { log: { message: 'old page' } } });
  assert.deepStrictEqual(printed.map(l => [l.message, l.context]), [['a', 'content'], ['b', 'content'], ['old page', 'content']]);
});

test('relayed MAIN-world lines use the cached flags, never a settings read', () => {
  const src = read('background/handlers/messages-logging.js');
  assert.ok(!/getSettings|storage\.local/.test(src), 'no storage access in the log relay');
});

test('settings expose Verbose logs next to Debug mode, off by default', () => {
  const html = read('sections/settings/settings.html');
  assert.match(html, /id="debugVerbose"/);
  assert.ok(html.indexOf('id="debugVerbose"') > html.indexOf('id="debugModeGeneral"'));
  assert.strictEqual(JSON.parse(read('sections/settings/default-settings.json')).settings?.debugVerbose
    ?? JSON.parse(read('sections/settings/default-settings.json')).debugVerbose, false);
});

// ---------------------------------------------------------------------------
// Scan report

const ScanReport = require('../background/scan-report.js');

const akamai = {
  category: 'antibot', confidence: 95,
  detector: { id: 'detect-akamai', name: 'Akamai Bot Manager' },
  matches: [
    { type: 'cookie', name: '_abck', value: '_abck=68D1~-1~YAAQ' },
    { type: 'cookie', name: 'bm_sz', value: 'bm_sz=xyz' },
    { type: 'url', fullUrl: 'https://www.walmart.com/akam/13/7a1b2c?x=1', pattern: '/akam/13/' },
    { type: 'header', name: 'akamai-grn', value: 'akamai-grn: 0.1' }
  ],
  combinations: [{ id: 'c1', name: 'Sensor and cookie', confidence: 95 }]
};
const canvas = {
  category: 'fingerprint', confidence: 40,
  detector: { name: 'Canvas Fingerprint' },
  matches: [
    { type: 'js_hooks', pattern: 'HTMLCanvasElement.prototype.toDataURL' },
    { type: 'js_hooks', pattern: 'CanvasRenderingContext2D.prototype.getImageData' },
    { type: 'content', pattern: 'toDataURL', foundIn: 'https://cdn.test/fp.js' }
  ]
};

test('scan report: title with host, count, time and top detection', () => {
  const { title } = ScanReport.build('https://www.walmart.com/ip/1', [canvas, akamai], { startTime: Date.now() - 4600 });
  assert.match(title, /^walmart\.com · 2 detections in 4\.\d s \(top: Akamai Bot Manager 95%\)$/);
});

test('scan report: one row per detection, strongest first, with readable evidence', () => {
  const { lines } = ScanReport.build('https://www.walmart.com/', [canvas, akamai], {});
  assert.match(lines[0], /^Anti-bot\s+Akamai Bot Manager\s+95%  cookie _abck, bm_sz · url walmart\.com\/akam\/13\/7a1b2c · header akamai-grn · combination: Sensor and cookie$/);
  assert.match(lines[1], /^Fingerprint Canvas Fingerprint\s+40%  js_hooks toDataURL, getImageData · content "toDataURL" in fp\.js$/);
  assert.ok(!lines.join('\n').includes('68D1'), 'cookie values are not printed');
});

test('scan report: data and timing lines from the tab state', () => {
  const { lines } = ScanReport.build('https://a.test/', [akamai], {
    stats: { cookies: 15, dom: 488, scripts: 31, resources: 206, requests: 200, html: 359419, collectMs: 812, matchMs: 62, detectors: 46 },
    hooksCompletionReason: 'activity_timeout', hooksCompletionTime: 4007, hooksFired: 21,
    windowStats: { detected: 2, checked: 30, reason: 'all_terminal' }
  });
  assert.ok(lines.includes('Data        cookies=15 dom=488 scripts=31 resources=206 requests=200 html=351 KB'), lines.join('\n'));
  assert.ok(lines.includes('Timing      collect 812 ms · match 62 ms (46 detectors) · hooks 4.0 s (activity_timeout, 21 fired) · window 2/30 (all_terminal)'), lines.join('\n'));
});

test('scan report: empty page, timeouts and failed hook removal', () => {
  const { title, lines } = ScanReport.build('https://clean.test/', [], { hooksTimedOut: true,
    hooksUninstallStats: { failedTargets: ['Navigator.prototype.a', 'Screen.prototype.b'] } });
  assert.strictEqual(title, 'clean.test · 0 detections');
  assert.ok(lines.includes('No protection found on this page.'));
  assert.ok(lines.some(l => l.endsWith('hooks timed out')));
  assert.ok(lines.some(l => /^Warning\s+2 hooks could not be removed: Navigator\.prototype\.a, Screen\.prototype\.b$/.test(l)));
});

test('scan report: long lists are capped and odd input does not throw', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ category: 'fingerprint', confidence: i, detector: { name: `D${i}` },
    matches: Array.from({ length: 9 }, (_, j) => ({ type: 'cookie', name: `c${j}` })) }));
  const { lines } = ScanReport.build('not a url', many, {});
  assert.strictEqual(lines.filter(l => l.startsWith('Fingerprint')).length, ScanReport.MAX_ROWS);
  assert.ok(lines.includes(`… ${40 - ScanReport.MAX_ROWS} more`));
  assert.match(lines[0], /cookie c0, c1, c2 \+6$/);
  assert.doesNotThrow(() => ScanReport.build(undefined, [null, { matches: [null, 5] }], null || {}));
});

test('the worker loads the scan report before the lifecycle that prints it', () => {
  const src = read('background.js');
  const imports = [...src.slice(src.indexOf('importScripts(')).matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
  assert.ok(imports.indexOf('background/scan-report.js') >= 0);
  assert.ok(imports.indexOf('background/scan-report.js') < imports.indexOf('background/detection-lifecycle.js'));
  assert.match(read('background/detection-lifecycle.js'), /ScanReport\.log\(state\.url, finalResults, state\)/);
});

test('no per-rule or per-URL logging is left in the scan path', () => {
  const engine = read('modules/detection/engine/detection-engine-manager.js');
  assert.ok(!/\[Content Detection\]|\[URL Detection\]/.test(engine), 'per-pattern traces');
  const lifecycle = read('background/detection-lifecycle.js');
  assert.ok(!/networkUrls\.forEach\(\(urlObj, index\) =>/.test(lifecycle), 'one line per network URL');
  const main = read('content-main-world.js');
  assert.ok(!/INSTALLED: |Uninstalled: \$\{hookTarget\}/.test(main), 'one line per hook install/removal');
});

test('the page console gets JS API echoes only in Debug mode', () => {
  const main = read('content-main-world.js');
  assert.match(main, /if \(debugMode && typeof console !== 'undefined' && console\) \{\n\s+const label = `\$\{MAIN_WORLD\.JS_API_CONSOLE_LABEL\}/);
});
