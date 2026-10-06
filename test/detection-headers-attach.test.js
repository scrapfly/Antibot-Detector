const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Response headers, request headers and Set-Cookie data are captured by
// webRequest per tab and attached to the content script's page data only when
// their URL contains the page hostname. The content script never sends a
// hostname, so it has to be derived from the tab: without it every header and
// response-cookie rule (Cloudflare server header, Jiasule X-Via-JSL, Yundun,
// Azure Front Door, Radware...) silently never matched.

const root = path.join(__dirname, '..');

function enrich() {
  const ctx = vm.createContext({ console, URL, Logger: new Proxy({}, { get: () => () => {} }) });
  vm.runInContext(fs.readFileSync(path.join(root, 'utils/url-utils.js'), 'utf8'), ctx);
  const src = fs.readFileSync(path.join(root, 'background/detection-lifecycle.js'), 'utf8');
  const start = src.indexOf('function enrichPageDataWithTabInfo');
  const end = src.indexOf('\n}\n', start) + 2;
  assert.ok(start >= 0 && end > start, 'enrichPageDataWithTabInfo not found');
  vm.runInContext(src.slice(start, end) + '\nthis.enrich = enrichPageDataWithTabInfo;', ctx);
  return ctx.enrich;
}

test('page data from the content script gets the tab hostname', () => {
  const pageData = { url: 'https://www.mps.gov.cn/', title: 'x', cookies: [] }; // what the content script sends
  const enriched = enrich()(pageData, { id: 7, url: 'https://www.mps.gov.cn/', title: 'x' });
  assert.strictEqual(enriched.hostname, 'www.mps.gov.cn');
  // the attach condition in processDetectionData
  assert.ok('https://www.mps.gov.cn/'.includes(enriched.hostname), 'stored headers for the page would be attached');
});

test('an explicit hostname is kept, and the page URL is the fallback without a tab URL', () => {
  const fn = enrich();
  assert.strictEqual(fn({ url: 'https://a.example/', hostname: 'a.example' }, { id: 1 }).hostname, 'a.example');
  assert.strictEqual(fn({ url: 'https://b.example/path' }, { id: 1 }).hostname, 'b.example');
});

test('the content script still sends no hostname, so the background must derive it', () => {
  const utils = fs.readFileSync(path.join(root, 'utils/utils.js'), 'utf8');
  const block = utils.slice(utils.indexOf('const plainPageData = {'), utils.indexOf('};', utils.indexOf('const plainPageData = {')));
  assert.ok(!/\bhostname\s*:/.test(block), 'if the content script starts sending hostname, this guard can go');
});

test('request-scope header rules see the request headers in detectOnPage', async () => {
  const ctx = vm.createContext({
    Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
    Logger: new Proxy({}, { get: (_, k) => (k === 'debugMode' ? false : () => {}) }), setTimeout, clearTimeout, console
  });
  ctx.window = ctx;
  for (const file of ['utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
    'modules/detection/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js',
    'modules/detection/detection-combinations.js',
    ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`)]) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  }
  const engine = vm.runInContext('new DetectionEngineManager()', ctx);
  const detector = {
    id: 'detect-reqheader', name: 'Request header probe', category: 'Anti-Bot', enabled: true,
    detection: { header: [{ id: 'req-cookie', name: '^cookie$', nameRegex: true, value: 'session_probe=1', nameScope: 'request', valueScope: 'request', confidence: 60, description: 'req-cookie' }] }
  };
  engine.setDetectors({ antibot: { [detector.id]: detector } });
  const found = await engine.detectOnPage({ url: 'https://a.example/', headers: { server: 'nginx' }, requestHeaders: { cookie: 'session_probe=1' } });
  const hit = (Array.isArray(found) ? found : []).find(d => (d.detector?.id || d.id) === 'detect-reqheader');
  assert.ok(hit, 'request header rule matched');
  const none = await engine.detectOnPage({ url: 'https://a.example/', headers: { server: 'nginx', cookie: 'session_probe=1' } });
  assert.ok(!(Array.isArray(none) ? none : []).some(d => (d.detector?.id || d.id) === 'detect-reqheader'), 'a response header is not a request header');
});
