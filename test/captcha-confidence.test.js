const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const captcha = Object.fromEntries(fs.readdirSync(path.join(root, 'detectors/captcha'))
  .filter(file => file.endsWith('.json')).map(file => {
    const detector = JSON.parse(fs.readFileSync(path.join(root, 'detectors/captcha', file), 'utf8'));
    return [detector.id, detector];
  }));
// Concrete documented/observed integration shapes supplied by the definition owners.
// These are not generated from regexes or injected matches. Frame paths containing
// "test" represent markup, not a claim of live vendor challenge verification.
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/captcha-confidence.json'), 'utf8'));
const context = vm.createContext({
  Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000,
    PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000 },
  Logger: new Proxy({}, { get: (_, key) => key === 'debugMode' ? false :
    key === 'error' ? (...args) => { throw new Error(args.join(' ')); } : () => {} }),
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  setTimeout, clearTimeout
});
context.window = context;
for (const file of [
  'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
  'modules/detection/window-condition-grammar.js', 'modules/detection/hooks/window-condition-language.js',
  'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager']
    .map(name => `modules/detection/engine/detection-engine-${name}.js`),
  'background/detection-lifecycle.js', 'background/handlers/messages-detection.js'
]) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
const Engine = vm.runInContext('DetectionEngineManager', context);
const Combinations = context.DetectionCombinations;
context.detectorManager = { findDetectorById: id => captcha[id], getDetector: (_, id) => captcha[id] };
context.tabsUsingCache = new Set();
context.workerKeepaliveManager = null;
for (const key of ['interruptedDetections', 'activeDetections', 'detectionStates', 'payloadStore',
  'networkUrlsStore', 'headersStore', 'requestHeadersStore', 'responseCookiesStore']) context[key] = new Map();
context.UrlUtils = { normalizeFaviconForStorage: () => null, getHostnameFromUrl: url => new URL(url).hostname };
context.setBadgeForDetections = async () => {};
context.chrome = { runtime: { sendMessage: async () => {} }, tabs: { sendMessage: async () => {} } };
context.Utils = { getHistorySettings: async () => ({}) };
context.History = { shouldSaveToHistory: async () => false };
Engine.storeDetection = async (_, page, results) => {
  context.finalizedResults = results;
  return { ...page, timestamp: 1, expiry: 2 };
};
Engine.getStoredDetection = async () => null;
const registry = {};
context.registerDetectionHandlers(registry, {});
function patterns(detector) {
  return Object.entries(detector.detection).flatMap(([method, rules]) => rules.map(rule => ({ method, ...rule })));
}
function product(groups) {
  return groups.reduce((out, group) => out.flatMap(left => group.map(right => [...left, ...right])), [[]]);
}
function choices(list, count) {
  if (count === 0) return [[]];
  return list.flatMap((item, index) => choices(list.slice(index + 1), count - 1).map(rest => [item, ...rest]));
}
function validate(node, known, label) {
  assert.ok(node && typeof node === 'object' && !Array.isArray(node), `${label}: object required`);
  const keys = Object.keys(node).sort();
  if (Object.hasOwn(node, 'pattern')) {
    assert.deepEqual(keys, ['pattern'], `${label}: explicit leaf only`);
    assert.ok(typeof node.pattern === 'string' && node.pattern && known.has(node.pattern), `${label}: unknown leaf`);
    return;
  }
  const op = Object.hasOwn(node, 'all') ? 'all' : Object.hasOwn(node, 'any') ? 'any' : 'of';
  assert.deepEqual(keys, op === 'of' ? ['atLeast', 'of'] : [op], `${label}: invalid AST`);
  assert.ok(Array.isArray(node[op]) && node[op].length, `${label}: empty branch`);
  if (op === 'of') assert.ok(Number.isInteger(node.atLeast) && node.atLeast >= 1 && node.atLeast <= node.of.length, `${label}: impossible threshold`);
  node[op].forEach(child => validate(child, known, label));
}
function witnesses(node) {
  if (node.pattern) return [[node.pattern]];
  if (node.all) return product(node.all.map(witnesses));
  if (node.any) return node.any.flatMap(witnesses);
  return choices(node.of, node.atLeast).flatMap(group => product(group.map(witnesses)));
}
function satisfied(node, ids) {
  if (node.pattern) return ids.has(node.pattern);
  if (node.all) return node.all.every(child => satisfied(child, ids));
  if (node.any) return node.any.some(child => satisfied(child, ids));
  return node.of.filter(child => satisfied(child, ids)).length >= node.atLeast;
}
function expected(detector, matches) {
  const ids = new Set(matches.flatMap(match => Array.from(Combinations.matchPatternIds(detector, match))));
  const rules = new Map(patterns(detector).map(rule => [rule.id, rule]));
  const standalone = matches.filter(match => {
    const refs = Array.from(Combinations.matchPatternIds(detector, match));
    return refs.length === 0 || refs.some(id => rules.get(id)?.standalone !== false);
  });
  return Math.max(0, ...standalone.map(match => match.baseConfidence ?? match.confidence),
    ...detector.combinations.filter(combo => satisfied(combo.when, ids)).map(combo => combo.confidence));
}
async function installed() {
  const events = [];
  await Engine.installHooksOrchestrator({ dispatchEvent(event) { events.push(event); } }, {
    storage: { local: { async get() { return { scrapfly_detectors: { detectors: { captcha } } }; } } }
  });
  assert.equal(events.length, 1);
  return events[0].detail;
}
function pageFor(detector, ids) {
  const page = { url: 'https://example.test/', content: [], dom: [], externalContent: [], networkUrls: [] };
  const runtime = {};
  for (const id of new Set(ids)) {
    const fixture = fixtures[detector.id]?.[id];
    assert.ok(fixture, `${detector.id}/${id}: explicit fixture required`);
    const rule = patterns(detector).find(rule => rule.id === id);
    assert.ok(rule, `${detector.id}/${id}: unknown fixture`);
    if (rule.method === 'url') {
      assert.ok(typeof fixture.url === 'string' && /^https?:\/\//.test(fixture.url), `${id}: concrete absolute URL required`);
      page.networkUrls.push({ url: fixture.url, type: 'script', method: 'GET' });
    } else if (rule.method === 'content') {
      assert.ok(typeof fixture.source === 'string' && fixture.source.trim(), `${id}: nonempty source witness required`);
      page.content.push({ type: 'inline', content: fixture.source });
    }
    else if (rule.method === 'dom') {
      assert.ok(fixture.dom?.tagName && fixture.dom.attributes, `${id}: real serialized DOM node required`);
      assert.ok(!fixture.dom.selector || /^[a-z]+$/.test(fixture.dom.selector), `${id}: do not fake selector matching`);
      page.dom.push(fixture.dom);
    } else if (rule.method === 'window') {
      assert.ok(['object', 'function'].includes(fixture.runtimeType), `${id}: explicit runtime type`);
      const parts = rule.path.replace(/^window\./, '').split('.');
      let parent = runtime;
      for (const part of parts.slice(0, -1)) parent = parent[part] ||= {};
      parent[parts.at(-1)] = fixture.runtimeType === 'function' ? function captchaAPI() {} : {};
    } else throw new Error(`${id}: unsupported fixture method ${rule.method}`);
  }
  return { page, runtime };
}
async function detect(detector, profile) {
  const engine = new Engine();
  engine.setDetectors({ captcha });
  const state = { url: profile.page.url, mainData: await engine.detectOnPage(profile.page, { includePartial: true }) };
  const main = vm.createContext({ ...profile.runtime, setTimeout, clearTimeout });
  main.window = main;
  main.location = { href: state.url };
  vm.runInContext(fs.readFileSync(path.join(root, 'modules/detection/hooks/window-property-tracker.js'), 'utf8'), main);
  const tracker = main.__WindowPropertyTracker;
  const reports = [];
  tracker.initialize((await installed()).windowProperties.filter(prop => prop.detectorId === detector.id), {
    protocol: context.ScrapflyBridgeProtocol, config: context.HooksConfig.defaults,
    conditionLanguage: context.ScrapflyWindowConditionLanguage,
    onDetection: detections => reports.push(...detections)
  });
  tracker._performPollingCheck();
  context.getOrCreateDetectionState = () => state;
  registry[context.ScrapflyBridgeProtocol.MESSAGE_TYPES.WINDOW_DETECTIONS]({
    request: { detections: reports, executionTime: 0 }, sender: { tab: { id: 1, url: state.url } }
  });
  await new Promise(resolve => setImmediate(resolve));
  const result = state.mainData.find(result => result.detector.id === detector.id);
  // Run the real finalizer, stubbing only browser/storage/history side effects.
  // Keep raw partial evidence available to per-pattern reachability assertions.
  state.hooksData = new Map();
  state.completedMethods = new Set(['url', 'dom', 'content', 'window']);
  await context.finalizeDetection(1, state);
  const finalized = context.finalizedResults.find(item => item.detector.id === detector.id);
  if (result && result.confidence > 0) assert.equal(finalized?.confidence, result.confidence, `${detector.id}: finalization lost evidence`);
  else assert.equal(finalized, undefined, `${detector.id}: zero-score evidence escaped finalizer`);
  return result;
}

test('combination AST rejects malformed and unreachable alternatives', () => {
  for (const node of [null, [], {}, { all: [] }, { any: [] }, { atLeast: 0, of: [{ pattern: 'a' }] },
    { atLeast: 2, of: [{ pattern: 'a' }] }, { pattern: 'missing' },
    { any: [{ pattern: 'a' }, { all: [] }] }, { pattern: 'a', all: [{ pattern: 'a' }] }]) {
    assert.throws(() => validate(node, new Set(['a']), 'invalid'));
  }
});
test('all nine definitions have explicit IDs, conservative standalone evidence and three graded combinations', () => {
  assert.deepEqual(Object.keys(captcha).sort(), ['detect-aliexpress', 'detect-captchaeu', 'detect-friendlycaptcha',
    'detect-funcaptcha', 'detect-geetest', 'detect-hcaptcha', 'detect-qcloud', 'detect-recaptcha', 'detect-turnstile']);
  for (const detector of Object.values(captcha)) {
    // Semver: bump the minor version whenever rules change, so Rules → Update offers it
    assert.match(detector.version, /^1\.\d+\.\d+$/, detector.id);
    assert.match(detector.lastUpdated, /^2026-10-0[34]$/, detector.id);
    const rules = patterns(detector);
    const ids = new Set(rules.map(rule => rule.id));
    assert.equal(ids.size, rules.length, `${detector.id}: duplicate IDs`);
    assert.deepEqual(Object.keys(fixtures[detector.id] || {}).sort(), [...ids].sort(), `${detector.id}: fixture map parity`);
    for (const rule of rules) {
      assert.ok(typeof rule.id === 'string' && rule.id);
      assert.notEqual(rule.enabled, false, rule.id);
      assert.ok(Number.isInteger(rule.confidence) && rule.confidence > 0 && rule.confidence <= 60, rule.id);
      if (rule.method === 'content') {
        assert.equal(rule.standalone, true, rule.id);
        assert.ok(rule.confidence >= 5 && rule.confidence <= 10, rule.id);
        assert.equal(rule.scope, 'scripts', rule.id);
        assert.equal(rule.checkScripts, true, rule.id);
      }
      if (rule.method === 'url') assert.equal(rule.textRegex, true, rule.id);
    }
    assert.ok(detector.combinations?.length >= 3, detector.id);
    assert.ok(new Set(detector.combinations.map(combo => combo.confidence)).size >= 3, detector.id);
    assert.equal(new Set(detector.combinations.map(combo => combo.id)).size, detector.combinations.length);
    assert.equal(new Set(detector.combinations.map(combo => JSON.stringify(combo.when))).size, detector.combinations.length);
    for (const combo of detector.combinations) {
      assert.deepEqual(Object.keys(combo).sort(), ['confidence', 'id', 'name', 'when']);
      assert.ok(Number.isInteger(combo.confidence) && combo.confidence > 0 && combo.confidence <= 95);
      validate(combo.when, ids, `${detector.id}/${combo.id}`);
      assert.ok(witnesses(combo.when).length);
      assert.equal(Combinations.references(combo.when).methods.size, 0);
    }
  }
});
test('orchestrator installs every configured runtime path and no new CAPTCHA API hooks', async () => {
  const config = await installed();
  assert.equal(config.hookDefinitions.length, 0);
  for (const detector of Object.values(captcha)) for (const rule of detector.detection.window || []) {
    const installedRule = config.windowProperties.find(prop => prop.detectorId === detector.id && prop.path === rule.path);
    assert.ok(installedRule, rule.id);
    assert.equal(installedRule.condition, rule.condition);
    assert.equal(installedRule.confidence, rule.confidence);
  }
});
for (const detector of Object.values(captcha)) {
  test(`${detector.id}: every pattern fixture is reached through production matching`, async () => {
    for (const rule of patterns(detector)) {
      const result = await detect(detector, pageFor(detector, [rule.id]));
      assert.ok(result?.matches.some(match => Array.from(Combinations.matchPatternIds(detector, match)).includes(rule.id)), `${rule.id}: pipeline lost signal`);
      assert.equal(result.confidence, expected(detector, result.matches));
    }
  });
  test(`${detector.id}: vendor URL fixtures reach every supported URL source`, async () => {
    const engine = new Engine();
    engine.setDetectors({ captcha });
    for (const rule of patterns(detector).filter(rule => rule.method === 'url')) {
      assert.equal(rule.textScope, 'all', rule.id);
      const url = fixtures[detector.id][rule.id].url;
      for (const page of [{ url }, { content: [{ src: url, content: url }] },
        { externalContent: [{ url, type: 'javascript', content: '' }] }, { networkUrls: [{ url, type: 'xmlhttprequest' }] }]) {
        const result = (await engine.detectOnPage(page, { includePartial: true })).find(item => item.detector.id === detector.id);
        assert.ok(result?.matches.some(match => Array.from(Combinations.matchPatternIds(detector, match)).includes(rule.id)), `${rule.id}: URL source unreachable`);
      }
    }
  });
  test(`${detector.id}: all combination branches reach their tier through URL/content/DOM/window pipelines`, async () => {
    assert.ok(detector.combinations?.length >= 3, `${detector.id}: combinations must be present before enumerating branches`);
    for (const combo of detector.combinations) {
      validate(combo.when, new Set(patterns(detector).map(rule => rule.id)), combo.id);
      const branches = witnesses(combo.when);
      assert.ok(branches.length, combo.id);
      for (const branch of branches) {
        const ids = [...new Set(branch)];
        assert.ok(ids.length >= 2, `${combo.id}: independent signals required`);
        const result = await detect(detector, pageFor(detector, ids));
        assert.ok(result?.combinations?.some(item => item.id === combo.id), `${combo.id}/${ids}: tier unreachable`);
        assert.equal(result.confidence, expected(detector, result.matches));
        assert.ok(result.confidence >= combo.confidence);
        for (const missing of ids) {
          const remaining = await detect(detector, pageFor(detector, ids.filter(id => id !== missing)));
          assert.ok(!remaining?.combinations?.some(item => item.id === combo.id), `${combo.id}: missing ${missing} still promoted`);
          if (remaining) assert.equal(remaining.confidence, expected(detector, remaining.matches));
          assert.ok((remaining?.confidence || 0) <= result.confidence);
        }
        const duplicate = pageFor(detector, ids);
        duplicate.page.dom.push(...duplicate.page.dom);
        duplicate.page.content.push(...duplicate.page.content);
        duplicate.page.networkUrls.push(...duplicate.page.networkUrls);
        const repeated = await detect(detector, duplicate);
        assert.equal(repeated.confidence, result.confidence, `${combo.id}: duplicate promotion`);
      }
    }
  });
  test(`${detector.id}: source-only references remain at most 20 and non-script resources never identify it`, async () => {
    const ids = patterns(detector).filter(rule => rule.method === 'content').map(rule => rule.id);
    const profile = pageFor(detector, ids);
    const result = await detect(detector, profile);
    assert.ok((result?.confidence || 0) <= 20, detector.id);
    const source = profile.page.content.map(script => script.content).join('\n');
    for (const page of [
      { pageHTML: `<p>${source}</p>` }, { pageHTML: `<style>${source}</style>` },
      { pageHTML: `<script type="application/ld+json">${JSON.stringify({ text: source })}</script>` },
      { externalContent: [{ type: 'css', url: 'https://example.test/style.css', content: source }] }
    ]) assert.equal(await detect(detector, { page: { url: 'https://example.test/', ...page }, runtime: {} }), undefined, detector.id);
  });
  test(`${detector.id}: identifier lookalikes cannot manufacture source evidence`, async () => {
    for (const rule of patterns(detector).filter(rule => rule.method === 'content')) {
      const lookalike = rule.textRegex ? 'customTCaptcha.jsSuffix customTJCaptcha.jsSuffix customTJNCaptcha-global.jsSuffix'
        : `custom${rule.text}Suffix`;
      assert.equal(await detect(detector, { page: { url: 'https://example.test/', content: [{ content: lookalike }] }, runtime: {} }), undefined, rule.id);
    }
  });
  test(`${detector.id}: runtime aliases and methods stay one evidence family`, async () => {
    const ids = patterns(detector).filter(rule => rule.method === 'window').map(rule => rule.id);
    const result = await detect(detector, pageFor(detector, ids));
    const maximum = Math.max(0, ...patterns(detector).filter(rule => rule.method === 'window' && rule.standalone !== false).map(rule => rule.confidence));
    assert.equal(result?.confidence || 0, maximum, `${detector.id}: root/method promotion`);
    assert.equal(result?.combinations, undefined, `${detector.id}: runtime-only combination`);
  });
  test(`${detector.id}: frame authority lookalikes and class substrings cannot identify it`, async () => {
    const engine = new Engine();
    engine.setDetectors({ captcha });
    for (const rule of patterns(detector).filter(rule => rule.method === 'dom')) {
      const node = fixtures[detector.id][rule.id].dom;
      const className = node.attributes.class;
      if (className) {
        const value = className.split(/\s+/).map(token => `custom-${token}-suffix`).join(' ');
        const result = await engine.detectOnPage({ dom: [{ ...node, class: value, attributes: { ...node.attributes, class: value } }] });
        assert.deepEqual(Array.from(result, item => item.detector.id), [], `${rule.id}: class substring`);
      }
      if (node.attributes.src) {
        const positive = new URL(node.attributes.src);
        for (const src of [`https://${positive.host}.evil.test${positive.pathname}`,
          `https://${positive.host}@evil.test${positive.pathname}`,
          `https://evil.test/?next=${positive.href}`]) {
          const result = await engine.detectOnPage({ dom: [{ ...node, src, attributes: { ...node.attributes, src } }] });
          assert.deepEqual(Array.from(result, item => item.detector.id), [], `${rule.id}/${src}`);
        }
      }
    }
  });
  test(`${detector.id}: incremental real matched evidence never compounds confidence`, async () => {
    const parts = [];
    for (const rule of patterns(detector)) {
      const result = await detect(detector, pageFor(detector, [rule.id]));
      assert.ok(result, rule.id);
      parts.push(result);
    }
    const merged = parts[0];
    for (const result of parts.slice(1)) {
      merged.matches.push(...result.matches);
      context.rescoreCombinations(merged);
      assert.equal(merged.confidence, expected(detector, merged.matches));
    }
    const highest = Math.max(...detector.combinations.map(combo => combo.confidence));
    assert.equal(merged.confidence, highest, detector.id);
    for (let repeat = 0; repeat < 3; repeat++) {
      context.rescoreCombinations(merged);
      assert.equal(merged.confidence, highest);
    }
  });
  test(`${detector.id}: non-JavaScript data blocks are excluded by the production extractor`, async () => {
    const source = patterns(detector).filter(rule => rule.method === 'content')
      .map(rule => fixtures[detector.id][rule.id].source).join('\n');
    const instance = new Engine();
    instance.setDetectors({ captcha });
    for (const type of ['application/json', 'application/ld+json', 'text/plain', 'importmap', 'speculationrules']) {
      context.document = { querySelectorAll: () => [{ type, src: '', textContent: source }] };
      const content = instance.extractScriptElements();
      assert.equal(content.length, 0, `${detector.id}/${type}: data block leaked`);
      assert.equal((await instance.detectOnPage({ content })).length, 0);
    }
  });
}

test('configured widget attribute presence does not claim key validity, and hidden input type is ASCII case-insensitive', async () => {
  for (const detector of Object.values(captcha)) {
    for (const rule of patterns(detector).filter(rule => rule.method === 'dom')) {
      const fixture = fixtures[detector.id][rule.id].dom;
      if (Object.hasOwn(fixture.attributes, 'data-sitekey')) {
        const node = { ...fixture, attributes: { ...fixture.attributes, 'data-sitekey': '' } };
        const result = await detect(detector, { page: { url: 'https://example.test/', dom: [node] }, runtime: {} });
        assert.ok(result?.matches.some(match => Array.from(Combinations.matchPatternIds(detector, match)).includes(rule.id)), `${rule.id}: empty present sitekey`);
        assert.ok(result.confidence <= 60, `${rule.id}: attribute presence is not a valid key`);
      }
      if (fixture.attributes.type === 'hidden') {
        const node = { ...fixture, attributes: { ...fixture.attributes, type: 'HIDDEN' } };
        const result = await detect(detector, { page: { url: 'https://example.test/', dom: [node] }, runtime: {} });
        assert.ok(result?.matches.some(match => Array.from(Combinations.matchPatternIds(detector, match)).includes(rule.id)), `${rule.id}: uppercase HIDDEN`);
      }
    }
  }
});

test('hCaptcha compatibility APIs and mismatched reCAPTCHA SDK families cannot manufacture Google integration', async () => {
  const google = captcha['detect-recaptcha'];
  const hcaptcha = captcha['detect-hcaptcha'];
  const hProfile = pageFor(hcaptcha, ['hcaptcha-api-resource', 'hcaptcha-configured-widget', 'hcaptcha-runtime-render']);
  hProfile.runtime.grecaptcha = { render() {}, execute() {} };
  const compatibility = await detect(google, hProfile);
  assert.equal(compatibility?.confidence || 0, 0);
  assert.equal(compatibility?.combinations, undefined);
  for (const ids of [['configured-sdk', 'enterprise-execute-api'], ['configured-enterprise-sdk', 'standard-execute-api']]) {
    const mismatch = await detect(google, pageFor(google, ids));
    assert.equal(mismatch.confidence, 60, ids.join(','));
    assert.equal(mismatch.combinations, undefined);
  }
});

test('generic sitekeys, routes, query URL copies and lookalike authorities produce no false CAPTCHA IDs', async () => {
  const engine = new Engine();
  engine.setDetectors({ captcha });
  const urls = ['https://example.test/get.php', 'https://example.test/api/captcha',
    'https://example.test/tdc.js', 'https://example.test/gettype.php', 'https://example.test/getcaptcha',
    'https://example.test/checksiteconfig', 'https://example.test/punish?x5secdata=sample'];
  for (const detector of Object.values(captcha)) for (const rule of detector.detection.url || []) {
    const positive = fixtures[detector.id]?.[rule.id]?.url;
    assert.ok(positive, `${rule.id}: URL fixture required`);
    const parsed = new URL(positive);
    urls.push(`https://example.test/?next=${positive}`, `https://${parsed.host}.evil.test${parsed.pathname}${parsed.search}`,
      `https://${parsed.host}@evil.test${parsed.pathname}${parsed.search}`,
      `https://evil.test/${parsed.host}${parsed.pathname}${parsed.search}`);
  }
  for (const url of urls) {
    const result = await engine.detectOnPage({ url, content: [{ src: url, content: url }],
      externalContent: [{ url, type: 'css', content: '' }], networkUrls: [{ url }],
      dom: [{ tagName: 'div', attributes: { 'data-sitekey': 'generic' } },
        { tagName: 'iframe', attributes: { src: url }, src: url }] });
    assert.deepEqual(Array.from(result, item => item.detector.id), [], url);
  }
});
