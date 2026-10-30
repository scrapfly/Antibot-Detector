const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Anti-bot definitions v2: every rule has an id and a witness from a live site
// (fixtures/antibot-confidence.json). Weak signals (CDN headers, short cookie
// names, generic paths) are standalone:false and only count inside a
// combination; vendor signals score alone, proof (PROOF below) is 100 on its
// own, the 85-95 tiers need two independent observations and a detector's top
// tier (its complete integration) is 100. Lookalikes from real sites stay at 0.

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
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => key === 'debugMode' ? false :
    key === 'error' ? (...args) => { throw new Error(args.join(' ')); } : () => {} }),
  setTimeout, clearTimeout
});
context.window = context;
for (const file of [
  'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/conditions/window-condition-grammar.js', 'modules/detection/managers/confidence-manager.js',
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
  const page = { url: 'https://example.test/', content: [], dom: [], headers: {}, allCookies: [], responseCookies: [], networkUrls: [], payloads: [], responses: [] };
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
    else if (fx.response) page.responses.push({ ...fx.response, type: 'response' });
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

// Proof: a signal only one vendor's product produces, seen as a request to a
// host the vendor owns (or a vendor-literal first-party path), a header or
// cookie with a vendor-coined name (short names also check the value's shape),
// the vendor endpoint's own body, or a token only the vendor injects. It scores
// 100 on its own. Markup, source text, window globals and anything shared with
// another product (CDN edge headers, Turnstile's challenge hosts, BIG-IP LTM
// cookies) never are.
const PROOF = new Set([
  'detect-akamai/abck-cookie-name', 'detect-akamai/abck-sensor-cookie', 'detect-akamai/ak-bmsc-cookie',
  'detect-akamai/akam-pixel', 'detect-akamai/akam-sensor-script', 'detect-akamai/bm-sz-cookie', 'detect-akamai/pixel-variable',
  'detect-akamai/sbsd-endpoint', 'detect-akamai/sensor-data-payload', 'detect-aliyunwaf/acw-sc-v2-cookie',
  'detect-amazon/fwcim-assets-script', 'detect-anubis/anubis-auth-cookie', 'detect-anubis/anubis-endpoint-resource',
  'detect-anubis/anubis-verification-cookie', 'detect-aws-waf/aws-waf-token-cookie', 'detect-aws-waf/captcha-host',
  'detect-aws-waf/token-host-endpoint', 'detect-aws-waf/token-host-script', 'detect-aws-waf/waf-action-header',
  'detect-botguard/botguard-bg-interpreter', 'detect-botguard/botguard-interpreter', 'detect-botguard/gmail-waa',
  'detect-botguard/waa-create', 'detect-cheq/cheq-first-party-endpoint', 'detect-cheq/cheqzone-host', 'detect-cloudflare-waitingroom/cf-waitingroom-cookie',
  'detect-cloudflare/bot-management-script', 'detect-cloudflare/cf-bm-cookie', 'detect-cloudflare/cf-clearance-cookie',
  'detect-cloudflare/cf-mitigated-header', 'detect-cloudflare/challenge-orchestrator', 'detect-cloudflare/jsd-oneshot',
  'detect-datadome/datadome-captcha', 'detect-datadome/datadome-cid-header', 'detect-datadome/datadome-cookie',
  'detect-datadome/datadome-protected-header', 'detect-datadome/datadome-server-header', 'detect-datadome/datadome-tag',
  'detect-deepseek-pow/pow-challenge-endpoint', 'detect-deepseek-pow/pow-challenge-payload', 'detect-deepseek-pow/pow-challenge-response',
  'detect-deepseek-pow/pow-solver-wasm', 'detect-f5/ts-asm-cookie', 'detect-fingerprintjs/fpcdn-pro-script',
  'detect-fingerprintjs/fpjs-api-host', 'detect-fingerprintjs/fpnpmcdn-loader', 'detect-fingerprintjs/openfpcdn-oss-script',
  'detect-fingerprintjs/oss-npm-monitoring', 'detect-fingerprintjs/botd-cdn-script', 'detect-fingerprintjs/botd-npm-monitoring', 'detect-incapsula/imperva-cdn-header', 'detect-incapsula/incap-iinfo-header',
  'detect-incapsula/incap-session-cookie', 'detect-incapsula/incap-visitor-cookie', 'detect-incapsula/incapsula-resource',
  'detect-incapsula/reese84-cookie', 'detect-incapsula/utmvc-cookie', 'detect-jiasule/jsl-clearance-cookie',
  'detect-kasada/ips-script', 'detect-kasada/kpsdk-ct-header', 'detect-kasada/tl-endpoint', 'detect-netacea/mitatacaptcha-cookie',
  'detect-netacea/netacea-captcha-verify', 'detect-openai-sentinel/chat-requirements', 'detect-openai-sentinel/pow-required-response',
  'detect-openai-sentinel/proof-of-work-answer', 'detect-openai-sentinel/requirements-token-payload', 'detect-openai-sentinel/sentinel-frame',
  'detect-openai-sentinel/sentinel-req', 'detect-openai-sentinel/sentinel-sdk-build', 'detect-openai-sentinel/sentinel-sdk-loader',
  'detect-openai-sentinel/so-required-response', 'detect-perimeterx/px-captcha', 'detect-perimeterx/px-client-script',
  'detect-perimeterx/px-collector', 'detect-perimeterx/px3-cookie', 'detect-perimeterx/pxhd-cookie', 'detect-perimeterx/pxvid-cookie',
  'detect-radware/radware-stormcaster-script', 'detect-radware/radware-uzm-cookie', 'detect-radware/radware-validate-host',
  'detect-reblaze/rbz-session-cookie', 'detect-reblaze/reblaze-lib-script', 'detect-ruishu/fssbbi-cookie',
  'detect-sucuri/sucuri-block-header', 'detect-sucuri/sucuri-cloudproxy-cookie', 'detect-sucuri/sucuri-id-header',
  'detect-sucuri/sucuri-server-header', 'detect-threatmetrix/tmx-check', 'detect-threatmetrix/tmx-tags',
  'detect-queueit/queueit-connector-script', 'detect-queueit/queueit-integration-config', 'detect-queueit/queueit-queue-page-assets',
  'detect-queueit/queueit-queue-page-host', 'detect-queueit/queueit-visitorsession-cookie', 'detect-vercel/vercel-mitigated-challenge',
  'detect-vercel/vercel-mitigated-deny', 'detect-vercel/vercel-botid-script', 'detect-ddosguard/ddosguard-server-header',
  'detect-ddosguard/ddosguard-cookie', 'detect-ddosguard/ddosguard-wellknown-path', 'detect-ddosguard/ddosguard-check-domain',
  'detect-iovation/iovation-snare-host', 'detect-iovation/iovation-vendor-host', 'detect-forter/forter-snippet-script',
  'detect-forter/forter-collector', 'detect-sift/sift-snippet-script', 'detect-sift/sift-beacon', 'detect-castle/castle-cdn-script',
  'detect-castle/castle-monitor', 'detect-seon/seon-agent-script', 'detect-seon/seon-legacy-agent-script', 'detect-seon/seon-dns-resolve',
  'detect-fastly/fastly-challenge-script', 'detect-fastly/fastly-detection-script', 'detect-fastly/fastly-challenge-start-cookie',
  'detect-fastly/fastly-challenge-complete-cookie', 'detect-fastly/fastly-detection-cookie', 'detect-kount/kount-collector-sdk',
  'detect-kount/kount-collector-endpoint', 'detect-riskified/riskified-beacon-script', 'detect-riskified/riskified-collector'
]);
// Detectors whose top tier stays below 100: legacy vendors (Ocule, Meetrics)
// and edges that prove a CDN rather than protection (Azure Front Door, Yundun);
// Hunt's /hd-api/ paths could not be shown to be the vendor's alone
const CAPPED = new Set(['detect-ocule', 'detect-meetrics', 'detect-azurefrontdoor', 'detect-yundun', 'detect-hunt']);
const isProof = (d, r) => PROOF.has(`${d.id}/${r.id}`);

test('forty-two anti-bot definitions: v2, CRLF, explicit ids, graded combinations', () => {
  assert.deepEqual(Object.keys(antibot).sort(), ['detect-akamai', 'detect-aliyunwaf', 'detect-amazon', 'detect-anubis', 'detect-aws-waf',
    'detect-azurefrontdoor', 'detect-botguard', 'detect-castle', 'detect-cheq', 'detect-cloudflare', 'detect-cloudflare-waitingroom', 'detect-datadome',
    'detect-ddosguard', 'detect-deepseek-pow', 'detect-f5', 'detect-fastly', 'detect-fingerprintjs', 'detect-forter', 'detect-hunt', 'detect-incapsula',
    'detect-iovation', 'detect-jiasule', 'detect-kasada', 'detect-kount', 'detect-meetrics', 'detect-netacea', 'detect-ocule', 'detect-openai-sentinel',
    'detect-perimeterx', 'detect-queueit', 'detect-radware', 'detect-reblaze', 'detect-riskified', 'detect-ruishu', 'detect-seon', 'detect-shapesecurity',
    'detect-sift', 'detect-sucuri', 'detect-threatmetrix', 'detect-vercel', 'detect-wordfence', 'detect-yundun']);
  for (const d of Object.values(definitions)) {
    const raw = antibot[d.id].__raw;
    assert.equal(raw.split('\n').length - 1, (raw.match(/\r\n/g) || []).length, `${d.id}: CRLF throughout`);
    assert.match(d.version, /^2\.\d+\.\d+$/, d.id);
    const rules = patterns(d);
    const ids = new Set(rules.map(r => r.id));
    assert.equal(ids.size, rules.length, `${d.id}: duplicate ids`);
    assert.deepEqual(Object.keys(fixtures[d.id]).sort(), [...ids].sort(), `${d.id}: one live witness per rule`);
    for (const r of rules) {
      if (isProof(d, r)) {
        assert.equal(r.confidence, 100, `${d.id}/${r.id}: proof is 100`);
        assert.notEqual(r.standalone, false, `${d.id}/${r.id}: proof counts alone`);
        continue;
      }
      assert.ok(Number.isInteger(r.confidence) && r.confidence > 0 && r.confidence <= 90, `${d.id}/${r.id}: rule confidence`);
      if (r.method === 'content') {
        assert.ok(r.confidence <= 30, `${d.id}/${r.id}: source text is weak evidence`);
        assert.equal(r.scope, 'scripts', r.id);
      }
      if (r.method === 'url') assert.equal(r.textRegex, true, `${r.id}: anchored regex, not substring`);
    }
    assert.ok(d.combinations.length >= 3, d.id);
    assert.ok(new Set(d.combinations.map(c => c.confidence)).size >= 2, `${d.id}: graded tiers`);
    const top = Math.max(...d.combinations.map(c => c.confidence));
    if (CAPPED.has(d.id)) assert.ok(top < 100, `${d.id}: capped detector`);
    else assert.equal(top, 100, `${d.id}: complete integration is 100`);
    for (const c of d.combinations) {
      assert.ok(c.confidence <= 95 || c.confidence === 100, c.id);
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
      if (isProof(d, r)) assert.equal(result.confidence, 100, `${r.id}: proof alone is 100`);
      else assert.ok(result.confidence <= 90, `${r.id}: one signal never reaches the top tier`);
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
        if (/^\^https\?:\/\/(?:\(\?!.*?\/\))?\[\^\/\?#\]\+/.test(r.text)) continue; // first-party rules: any host by design
        const result = detect(d, { page: { networkUrls: [{ url: bad }], content: [], dom: [], headers: {}, allCookies: [] } });
        assert.ok(!matched(d, result, r.id), `${r.id}: ${bad}`);
      }
    }
  });
}

test('Reblaze namespace/configuration stays at 90 until a proof signal is present', () => {
  const detector = definitions['detect-reblaze'];
  const namespace = ['rbzns-object', 'rbzns-reference', 'rbz-bereshit-reference'];
  const baseline = detect(detector, pageFor(detector, namespace));
  assert.equal(baseline.confidence, 90);
  assert.ok(baseline.combinations.some(c => c.id === 'reblaze-namespace-config'));
  for (const proof of ['rbz-session-cookie', 'reblaze-lib-script']) {
    assert.equal(detect(detector, pageFor(detector, [...namespace, proof])).confidence, 100, proof);
  }
  assert.equal(detect(detector, pageFor(detector, ['rbzns-reference', 'rbz-bereshit-reference'])).confidence, 10, 'source references are not runtime evidence');
  assert.equal(detect(detector, pageFor(detector, ['rbz-bereshit-reference'])).confidence, 0);
  assert.equal(detect(detector, pageFor(detector, ['rbzns-object'])).confidence, 75);
});

// Benign shapes seen on real, unprotected pages (or other vendors' signals).
// Each must not identify the named detector at all.
const benign = {
  'detect-akamai': { headers: { server: 'AkamaiGHost' }, cookies: ['AKA_A2', 'bm_s'], urls: ['https://github.com/a/b/blob/main/src/x', 'https://example.test/akamai/13/x.js'] },
  'detect-aws-waf': { urls: ['https://example.test/static/challenge.js', 'https://example.test/api/verify', 'https://example.test/telemetry', 'https://example.test/inputs?client=browser'] },
  'detect-botguard': { urls: ['https://www.google.com/recaptcha/api.js', 'https://www.google.com/js/bg/abc.js', 'https://www.google.com/js/th/abc.js',
    'https://mail.google.com/mail/u/0/', 'https://mail.google.com/mail/u/0/?view=waa', 'https://mail.google.com/mail/u/0/waaffle'], sources: ["var mode = 'botguard';"] },
  'detect-cheq': { sources: ["var cheque = 'cheq';"], urls: ['https://example.test/cheq.js'] },
  'detect-cloudflare': { headers: { server: 'cloudflare', 'cf-ray': '8c1-AMS' }, urls: ['https://example.test/cdn-cgi/l/email-protection', 'https://challenges.cloudflare.com/turnstile/v0/api.js',
    // A Turnstile widget's own frames: a CAPTCHA, not Bot Management
    'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=8c1', 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/x',
    'https://challenges.cloudflare-cn.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=8c1', 'https://challenges.fed.cloudflare.com/cdn-cgi/challenge-platform/h/b/orchestrate/captcha/v1?ray=8c1'] },
  'detect-deepseek-pow': { urls: ['https://chat.deepseek.com/api/v0/chat/history_messages', 'https://example.test/api/v0/chat/create_pow_challenge',
    'https://example.test/static/sha3_wasm_bg.7b9ca65ddd.wasm', 'https://www.deepseek.com/'] },
  'detect-openai-sentinel': { urls: ['https://chatgpt.com/backend-api/conversation', 'https://example.test/backend-api/sentinel/chat-requirements',
    'https://example.test/backend-api/sentinel/sdk.js', 'https://chatgpt.com/assets/conversation-shared-DYlOMt6E.js'] },
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
  'detect-yundun': { headers: { 'x-cache': 'HIT from cloudfront', server: 'nginx' }, cookies: ['yd_session'] },
  // A plain Vercel-hosted page, Queue-it's own login and marketing hosts, a DDoS-Guard-like cookie
  'detect-vercel': { headers: { server: 'Vercel', 'x-vercel-id': 'fra1::abcde-1700000000000', 'x-vercel-cache': 'HIT' },
    urls: ['https://example.test/_vercel/insights/script.js', 'https://example.test/.well-known/vercel/flags'] },
  'detect-queueit': { urls: ['https://go.queue-it.net/login', 'https://www.queue-it.com/', 'https://example.test/queueit/queueclient.min.js'] },
  'detect-ddosguard': { cookies: ['__ddg_session', 'ddg'], urls: ['https://example.test/ddos-guard/check.js'] },
  'detect-wordfence': { urls: ['https://example.test/wp-content/plugins/wordfence-assistant/js/admin.js'], sources: ["var plugin = 'wordfence';"] },
  // Short names other code also uses: alone they never identify the vendor
  'detect-sift': { cookies: ['__ssid'], urls: ['https://sift.com/'] },
  // Castle bundled from npm leaves only __cuid (x.com, Atlassian): that counts alone, low (castle-cuid-cookie, 30)
  'detect-castle': { urls: ['https://castle.io/'] },
  'detect-iovation': { urls: ['https://example.test/iojs/latest/io.js'] },
  'detect-forter': { urls: ['https://www.forter.com/events'] },
  'detect-seon': { sources: ['reason.config(options); season.getSession();'] },
  // Fastly's CDN cookies and a bare /_fs-ch- path; Kount's and Riskified's marketing hosts and first-party lookalikes
  'detect-fastly': { cookies: ['_fs_session', 'fs_ch_st', '_fs_ch_st_'], urls: ['https://example.test/_fs-ch-/challenge.js', 'https://www.fastly.com/products/bot-management'] },
  'detect-kount': { urls: ['https://kount.com/', 'https://example.test/collect/sdk?m=123456'], sources: ['var kaxsdcx = 1;'] },
  'detect-riskified': { urls: ['https://www.riskified.com/', 'https://example.test/?shop=shop.example.com&sid=abc'] }
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


test('detect-yundun: the captcha page a blocked visitor is shown is identified, its own scripts alone are not enough', () => {
  const d = definitions['detect-yundun'];
  // csdn.net answering 521: no real page, only the WAF's challenge with its marker cookie and its scripts under /cdn_cgi_bs_captcha/
  const challenge = detect(d, pageFor(d, ['bs-captcha-path', 'waf-captcha-marker-cookie', 'server-waf-header']));
  assert.ok(challenge.detected && challenge.confidence >= 90, `the challenge page scores ${challenge.confidence}`);
  const scriptsOnly = detect(d, pageFor(d, ['bs-captcha-path']));
  assert.ok(!scriptsOnly.detected || scriptsOnly.confidence === 0, 'a path alone is not a detection');
  const noCookie = detect(d, pageFor(d, ['bs-captcha-path', 'server-waf-header']));
  assert.ok(!noCookie.detected || noCookie.confidence < 80, `the path with a generic header scores ${noCookie.confidence}`);
});


// Both collectors cut a cookie value to COOKIE_VALUE_MAX_LENGTH (100) before any rule sees it: a value rule that needs
// more than that never matched a real cookie (the JWT's second dot of Anubis' token, the colon of _pxhd past character 91)
test('cookie value rules still match a real, long value after the collectors cut it to 100 characters', () => {
  const cut = (value) => value.substring(0, 100);
  const anubis = definitions['detect-anubis'];
  const jwt = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.' + 'eyJjaGFsbGVuZ2UiOiIwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZiIsIm5vbmNlIjoxMjM0NSwiaWF0IjoxNzYxODIwMDAwfQ'.repeat(2) + '.c2lnbmF0dXJl';
  assert.ok(jwt.length > 150 && jwt.indexOf('.', 40) > 100, 'a token whose second dot is past the cut');
  const anubisPage = pageFor(anubis, ['anubis-auth-cookie']).page;
  anubisPage.allCookies = [{ name: 'techaro.lol-anubis-auth', value: cut(jwt) }];
  assert.equal(detect(anubis, { page: anubisPage }).confidence, 100, 'Anubis auth cookie, cut');
  const notJwt = pageFor(anubis, ['anubis-auth-cookie']).page;
  notJwt.allCookies = [{ name: 'techaro.lol-anubis-auth', value: 'eyJhbGciOiJFZERTQSJ9.sample.jwt' }];
  assert.ok(!detect(anubis, { page: notJwt }).detected || detect(anubis, { page: notJwt }).confidence < 100, 'a payload that is not JSON is not the token');
  const px = definitions['detect-perimeterx'];
  const base64 = (n) => 'A1b2C3d4'.repeat(Math.ceil(n / 8)).slice(0, n);
  for (const first of [70, 95, 110, 120]) {
    const page = pageFor(px, ['pxhd-cookie']).page;
    page.allCookies = [{ name: '_pxhd', value: cut(`${base64(first)}:${base64(24)}`) }];
    assert.ok(detect(px, { page }).detected, `_pxhd with a ${first}-character first part, cut`);
  }
  const shortValue = pageFor(px, ['pxhd-cookie']).page;
  shortValue.allCookies = [{ name: '_pxhd', value: base64(30) }];
  assert.ok(!detect(px, { page: shortValue }).detected, 'a short value is not _pxhd');
});


test('a cookie value rule is tested against every cookie of that name, and the one that matched is the one reported', () => {
  // The same name from two domains or paths (chrome.cookies.getAll returns both): the order must not decide
  const detector = { id: 'detect-test-dup', name: 'Dup', category: 'antibot', version: '2.0.0', enabled: true, minExtensionVersion: '2.8',
    detection: { cookie: [{ id: 'abck', name: '^_abck$', nameRegex: true, value: '~0~', confidence: 80, nameScope: 'request', valueScope: 'request' }] } };
  const run = (cookies) => {
    const engine = new Engine();
    engine.setDetectors({ antibot: { [detector.id]: detector } });
    return engine.runDetector(detector, { url: 'https://example.test/', content: [], dom: [], headers: {}, allCookies: cookies, responseCookies: [], networkUrls: [], payloads: [], responses: [] });
  };
  const bad = { name: '_abck', value: 'abc~-1~def', domain: '.example.test' };
  const good = { name: '_abck', value: 'abc~0~def', domain: 'www.example.test' };
  for (const order of [[bad, good], [good, bad]]) {
    const result = run(order);
    assert.ok(result.detected, 'found, whichever comes first');
    assert.deepEqual([...new Set(result.matches.map(m => m.value))], ['_abck=abc~0~def'], 'the cookie that matched is the evidence');
  }
  assert.ok(!run([bad]).detected, 'a value that does not match is still not found');
});
