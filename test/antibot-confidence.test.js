const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Anti-bot definitions v2: every rule has an id and a witness from a live site
// (fixtures/antibot-confidence.json). Weak signals (CDN headers, short cookie
// names, generic paths) are standalone:false and only count inside a
// combination; strong vendor signals score alone, and the 85-95 tiers need two
// independent observations. Lookalikes from real sites must stay at 0.

const root = path.join(__dirname, '..');
const dir = path.join(root, 'detectors/antibot');
const antibot = Object.fromEntries(fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(file => {
  const raw = fs.readFileSync(path.join(dir, file), 'utf8');
  const detector = JSON.parse(raw);
  return [detector.id, Object.assign(detector, { __raw: raw })];
}));
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/antibot-confidence.json'), 'utf8'));
const { isLikelyEvilRegex } = require('../utils/pattern-cache.js');

const context = vm.createContext({
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => key === 'debugMode' ? false :
    key === 'error' ? (...args) => { throw new Error(args.join(' ')); } : () => {} }),
  setTimeout, clearTimeout
});
context.window = context;
for (const file of [
  'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js',
  'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(n => `modules/detection/engine/detection-engine-${n}.js`)
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const Engine = vm.runInContext('DetectionEngineManager', context);
const Combinations = context.DetectionCombinations;
const definitions = Object.fromEntries(Object.entries(antibot).map(([id, d]) => {
  const { __raw, ...clean } = d;
  return [id, clean];
}));

const patterns = d => Object.entries(d.detection).flatMap(([method, rules]) => rules.map(rule => ({ method, ...rule })));
const product = groups => groups.reduce((out, g) => out.flatMap(l => g.map(r => [...l, ...r])), [[]]);
const choices = (list, n) => n === 0 ? [[]] : list.flatMap((x, i) => choices(list.slice(i + 1), n - 1).map(rest => [x, ...rest]));
function witnesses(node) {
  if (node.pattern) return [[node.pattern]];
  if (node.all) return product(node.all.map(witnesses));
  if (node.any) return node.any.flatMap(witnesses);
  return choices(node.of, node.atLeast).flatMap(g => product(g.map(witnesses)));
}

/** A page carrying the live witnesses of the given pattern ids */
function pageFor(detector, ids) {
  const page = { url: 'https://example.test/', content: [], dom: [], headers: {}, allCookies: [], responseCookies: [], networkUrls: [], payloads: [] };
  const windowIds = [];
  for (const id of new Set(ids)) {
    const fx = fixtures[detector.id][id];
    assert.ok(fx, `${detector.id}/${id}: fixture required`);
    if (fx.cookie) page.allCookies.push({ name: fx.cookie[0], value: fx.cookie[1] });
    else if (fx.setCookie) page.responseCookies.push({ name: fx.setCookie[0], value: fx.setCookie[1] });
    else if (fx.header) page.headers[fx.header[0]] = fx.header[1];
    else if (fx.url) page.networkUrls.push({ url: fx.url, type: 'script', method: 'GET' });
    else if (fx.source) page.content.push({ type: 'inline', content: fx.source });
    else if (fx.dom) page.dom.push({ ...fx.dom, selector: fx.dom.tagName, id: fx.dom.attributes.id || '', class: fx.dom.attributes.class || '', src: fx.dom.attributes.src });
    else if (fx.payload) page.payloads.push({ ...fx.payload, type: 'text' });
    else if (fx.runtimeType) windowIds.push(id);
    else throw new Error(`${detector.id}/${id}: unknown fixture kind`);
  }
  return { page, windowIds };
}

/** Production page matching, plus window reports the way the worker merges them */
function detect(detector, { page, windowIds = [] }) {
  const engine = new Engine();
  engine.setDetectors({ antibot: { [detector.id]: detector } });
  const result = engine.runDetector(detector, page);
  const rules = new Map(patterns(detector).map(r => [r.id, r]));
  for (const id of windowIds) {
    const rule = rules.get(id);
    result.matches.push({ type: 'window', pattern: rule.path, confidence: rule.confidence,
      patternId: Combinations.idOf(detector, rule), description: rule.description });
  }
  Combinations.rescore(detector, result);
  return result;
}
const matched = (detector, result, id) => result.matches.some(m => Array.from(Combinations.matchPatternIds(detector, m)).includes(id));

test('twenty-five anti-bot definitions: v2, CRLF, explicit ids, graded combinations', () => {
  assert.deepEqual(Object.keys(antibot).sort(), ['detect-akamai', 'detect-aliyunwaf', 'detect-anubis', 'detect-aws-waf',
    'detect-azurefrontdoor', 'detect-botguard', 'detect-cheq', 'detect-cloudflare', 'detect-datadome', 'detect-f5',
    'detect-fingerprintjs', 'detect-incapsula', 'detect-jiasule', 'detect-kasada', 'detect-meetrics', 'detect-netacea',
    'detect-ocule', 'detect-perimeterx', 'detect-radware', 'detect-reblaze', 'detect-ruishu', 'detect-shapesecurity',
    'detect-sucuri', 'detect-threatmetrix', 'detect-yundun']);
  for (const d of Object.values(definitions)) {
    const raw = antibot[d.id].__raw;
    assert.equal(raw.split('\n').length - 1, (raw.match(/\r\n/g) || []).length, `${d.id}: CRLF throughout`);
    assert.match(d.version, /^2\.\d+\.\d+$/, d.id);
    const rules = patterns(d);
    const ids = new Set(rules.map(r => r.id));
    assert.equal(ids.size, rules.length, `${d.id}: duplicate ids`);
    assert.deepEqual(Object.keys(fixtures[d.id]).sort(), [...ids].sort(), `${d.id}: one live witness per rule`);
    for (const r of rules) {
      assert.ok(Number.isInteger(r.confidence) && r.confidence > 0 && r.confidence <= 90, `${d.id}/${r.id}: rule confidence`);
      if (r.method === 'content') {
        assert.ok(r.confidence <= 30, `${d.id}/${r.id}: source text is weak evidence`);
        assert.equal(r.scope, 'scripts', r.id);
      }
      if (r.method === 'url') assert.equal(r.textRegex, true, `${r.id}: anchored regex, not substring`);
    }
    assert.ok(d.combinations.length >= 3, d.id);
    assert.ok(new Set(d.combinations.map(c => c.confidence)).size >= 2, `${d.id}: graded tiers`);
    for (const c of d.combinations) {
      assert.ok(c.confidence <= 95, c.id);
      for (const branch of witnesses(c.when)) assert.ok(new Set(branch).size >= 2, `${c.id}: needs two signals`);
    }
  }
});

test('every regex compiles and passes the ReDoS guard', () => {
  for (const d of Object.values(definitions)) for (const r of patterns(d)) {
    for (const [key, flag] of [['name', 'nameRegex'], ['value', 'valueRegex'], ['text', 'textRegex'], ['urlPattern', 'urlRegex']]) {
      if (typeof r[key] !== 'string' || r[flag] !== true) continue;
      assert.doesNotThrow(() => new RegExp(r[key]), `${d.id}/${r.id}`);
      assert.equal(isLikelyEvilRegex(r[key]), false, `${d.id}/${r.id}: ${r[key]}`);
    }
  }
});

for (const d of Object.values(definitions)) {
  test(`${d.id}: every rule is reached by its live witness, weak ones score 0 alone`, () => {
    for (const r of patterns(d)) {
      const result = detect(d, pageFor(d, [r.id]));
      assert.ok(matched(d, result, r.id), `${r.id}: witness not matched`);
      if (r.standalone === false) assert.equal(result.confidence, 0, `${r.id}: weak signal scored alone`);
      else assert.ok(result.confidence >= r.confidence, `${r.id}: standalone score`);
      assert.ok(result.confidence <= 90, `${r.id}: one signal never reaches the top tier`);
    }
  });

  test(`${d.id}: every combination branch reaches its tier and drops without each signal`, () => {
    for (const c of d.combinations) for (const branch of witnesses(c.when)) {
      const ids = [...new Set(branch)];
      const full = detect(d, pageFor(d, ids));
      assert.ok(full.combinations?.some(x => x.id === c.id), `${c.id}/${ids}: tier unreachable`);
      assert.ok(full.confidence >= c.confidence, `${c.id}/${ids}`);
      for (const missing of ids) {
        const less = detect(d, pageFor(d, ids.filter(id => id !== missing)));
        assert.ok(!less.combinations?.some(x => x.id === c.id), `${c.id}: still fires without ${missing}`);
      }
    }
  });

  test(`${d.id}: URL rules are anchored to their host`, () => {
    for (const r of patterns(d).filter(r => r.method === 'url')) {
      const positive = new URL(fixtures[d.id][r.id].url);
      for (const bad of [
        `https://${positive.host}.evil.test${positive.pathname}${positive.search}`,
        `https://evil.test/?next=${encodeURIComponent(positive.href)}`,
        `https://${positive.host}@evil.test${positive.pathname}`
      ]) {
        if (/^\^https\?:\/\/\[\^\/\?#\]\+/.test(r.text)) continue; // first-party rules: any host by design
        const result = detect(d, { page: { networkUrls: [{ url: bad }], content: [], dom: [], headers: {}, allCookies: [] } });
        assert.ok(!matched(d, result, r.id), `${r.id}: ${bad}`);
      }
    }
  });
}

// Benign shapes seen on real, unprotected pages (or other vendors' signals).
// Each must not identify the named detector at all.
const benign = {
  'detect-akamai': { headers: { server: 'AkamaiGHost' }, cookies: ['AKA_A2', 'bm_s'], urls: ['https://github.com/a/b/blob/main/src/x', 'https://example.test/akamai/13/x.js'] },
  'detect-aws-waf': { urls: ['https://example.test/static/challenge.js', 'https://example.test/api/verify', 'https://example.test/telemetry', 'https://example.test/inputs?client=browser'] },
  'detect-botguard': { urls: ['https://www.google.com/recaptcha/api.js', 'https://www.google.com/js/bg/abc.js',
    'https://mail.google.com/mail/u/0/', 'https://mail.google.com/mail/u/0/?view=waa', 'https://mail.google.com/mail/u/0/waaffle'], sources: ["var mode = 'botguard';"] },
  'detect-cheq': { sources: ["var cheque = 'cheq';"], urls: ['https://example.test/cheq.js'] },
  'detect-cloudflare': { headers: { server: 'cloudflare', 'cf-ray': '8c1-AMS' }, urls: ['https://example.test/cdn-cgi/l/email-protection', 'https://challenges.cloudflare.com/turnstile/v0/api.js'] },
  'detect-datadome': { urls: ['https://example.test/tags.js', 'https://example.test/js/'], sources: ["var dd = {};"] },
  'detect-f5': { cookies: ['TSession', 'TSID', 'TSabc', 'BIGipServerpool_web'] },
  'detect-incapsula': { cookies: ['_impv_routing', 'incap_session'] },
  'detect-kasada': { urls: ['https://www.zillow.com/7e84c9ce-057e-4c91-87ef-56e6d4914637/a84e7f07-b7d6-4b7a-af51-89d7fb6d34f4/consent.js', 'https://example.test/static/ips.js'] },
  'detect-meetrics': { urls: ['https://example.test/mtrcs_123.js'] },
  'detect-ocule': { urls: ['https://example.test/molecule/ocules.js'] },
  'detect-perimeterx': { urls: ['https://example.test/pxl/init.js', 'https://example.test/abcdefgh/captcha/captcha.js'], cookies: ['pxcts'] },
  'detect-reblaze': { cookies: ['rbz_theme'] },
  'detect-shapesecurity': { headers: { 'x-datadome-cid': 'AHrl', 'x-amzn-waf-action': 'challenge', 'x-frame-options': 'DENY' }, urls: ['https://example.test/app.js?seed=42'], cookies: ['Ad34bsY56'] },
  'detect-sucuri': { sources: ["var plugin = 'sucuri-scanner';"] },
  'detect-threatmetrix': { urls: ['https://example.test/api?org_id=123'] },
  'detect-aliyunwaf': { cookies: ['acw_tc'] },
  'detect-anubis': { urls: ['https://example.test/anubis/'], cookies: ['anubis_auth'] },
  'detect-azurefrontdoor': { headers: { 'x-cache': 'HIT' } },
  'detect-fingerprintjs': { sources: ['var fp = window.FingerprintJs;'] },
  'detect-jiasule': { cookies: ['jsl_session'] },
  'detect-netacea': { cookies: ['mitata'] },
  'detect-radware': { sources: ["var plugin = 'radware';"] },
  'detect-ruishu': { cookies: ['ssxmod_itn'] },
  'detect-yundun': { headers: { 'x-cache': 'HIT from cloudfront', server: 'nginx' }, cookies: ['yd_session'] }
};
test('benign lookalikes from real pages identify no anti-bot vendor', () => {
  for (const [id, b] of Object.entries(benign)) {
    const d = definitions[id];
    const page = { url: 'https://example.test/', headers: b.headers || {}, allCookies: (b.cookies || []).map(name => ({ name, value: 'x' })),
      networkUrls: (b.urls || []).map(url => ({ url })), content: (b.sources || []).map(content => ({ type: 'inline', content })), dom: [] };
    assert.equal(detect(d, { page }).confidence, 0, id);
  }
});

test('one vendor\'s full signal set does not identify another vendor', () => {
  for (const source of Object.values(definitions)) {
    const ids = patterns(source).map(r => r.id);
    const profile = pageFor(source, ids);
    for (const other of Object.values(definitions)) {
      if (other.id === source.id) continue;
      // Akamai's random-path rule is first-party by design; PerimeterX's app-id is not another vendor's
      const result = detect(other, { page: profile.page });
      assert.ok(result.confidence <= 20, `${source.id} evidence scored ${result.confidence} for ${other.id}`);
    }
  }
});

test('Ocule and Meetrics are kept as legacy detectors with capped confidence', () => {
  for (const id of ['detect-ocule', 'detect-meetrics']) {
    const d = definitions[id];
    assert.match(d.description, /^Legacy /);
    const all = detect(d, pageFor(d, patterns(d).map(r => r.id)));
    assert.ok(all.confidence <= 60, `${id}: ${all.confidence}`);
  }
});
