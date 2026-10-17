const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Vendors = require('../modules/advanced/captcha-vendors.js');
const Probe = require('../sections/advanced/components/sitekey-probe.js');
const { demParseDOMSelector, demMatchDOMSelector } = require('../modules/detection/engine/detection-engine-matching.js');

// Advanced tools for the CAPTCHA vendors described as data: the config agrees
// with the detectors, Analyze Scripts matches only each vendor's hosts, and
// Extract Site Key finds the key in each vendor's documented embed.

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const index = JSON.parse(read('detectors/index.json'));
const en = JSON.parse(read('_locales/en/messages.json'));

test('every vendor matches its detector, logo, locale text and message type', () => {
  const ids = new Set();
  const messages = (() => { const context = { window: {} }; vm.createContext(context); vm.runInContext(read('modules/core/message-types.js'), context); return context.window.AdvancedMessageTypes; })();
  assert.equal(Vendors.list.length, 14);
  for (const vendor of Vendors.list) {
    assert.match(vendor.vendorId, /^[a-z][a-z0-9]*$/, 'message prefixes map back to the vendor id');
    assert.ok(!ids.has(vendor.vendorId), `${vendor.vendorId} is unique`);
    ids.add(vendor.vendorId);
    const category = Object.keys(index).find(key => Array.isArray(index[key]) && index[key].some(id => String(id).replace(/^detect-/, '') === vendor.detectorId))
      || Object.keys(index.categories || {}).find(key => (index.categories[key].detectors || index.categories[key]).includes?.(vendor.detectorId));
    const file = path.join(root, 'detectors/captcha', `detect-${vendor.detectorId}.json`);
    assert.ok(fs.existsSync(file), `${vendor.detectorId} has a CAPTCHA detector`);
    const detector = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(vendor.productName, detector.name, vendor.vendorId);
    assert.equal(vendor.logo, detector.icon, vendor.vendorId);
    assert.ok(fs.existsSync(path.join(root, 'detectors/icons', vendor.logo)), vendor.logo);
    assert.ok(en[vendor.infoKey], vendor.infoKey);
    assert.equal(messages[`${vendor.vendorId.toUpperCase()}_START_ANALYSIS`], `${vendor.vendorId.toUpperCase()}_START_ANALYSIS`);
    void category;
  }
});

test('every rule is safe to run in a page: anchored paths, no g/y flags, compound selectors, JSON-safe arguments, bounded time', () => {
  const regexes = [];
  for (const vendor of [...Vendors.list, ...Object.values(Vendors.siteKeyOnly)]) {
    for (const rule of vendor.scripts) {
      assert.ok(rule.hosts || rule.domains, `${vendor.vendorId}: a host rule`);
      if (rule.path) { assert.match(rule.path.source, /^\^/, `${vendor.vendorId}: ${rule.path}`); regexes.push(rule.path); }
    }
    if (!vendor.siteKey) continue;
    regexes.push(vendor.siteKey.key);
    for (const rule of vendor.siteKey.rules) {
      if (rule.selector) assert.ok(demParseDOMSelector(rule.selector), `${vendor.vendorId}: ${rule.selector}`);
      for (const value of [rule.pattern, rule.url]) if (value) regexes.push(value);
      if (rule.type === 'inline') assert.match(rule.pattern.source, /\((?!\?)/, `${vendor.vendorId}: inline patterns capture the key`);
    }
    const args = Vendors.probeArgs(vendor);
    assert.deepEqual(JSON.parse(JSON.stringify(args)), args, `${vendor.vendorId}: probe arguments survive structured cloning`);
  }
  for (const regex of regexes) {
    assert.doesNotMatch(regex.flags, /[gy]/, String(regex));
    for (const filler of ['a', '5', 'x ', '"', ':']) {
      const input = filler.repeat(100000) + '!';
      const started = Date.now();
      regex.test(input);
      assert.ok(Date.now() - started < 50, `${regex} runs in bounded time`);
    }
  }
});

test('the registry, aliases and stored-history keys cover every vendor', () => {
  const context = { globalThis: null };
  vm.createContext(context);
  context.globalThis = context;
  vm.runInContext(read('modules/advanced/captcha-vendors.js'), context);
  vm.runInContext(read('modules/advanced/vendor-registry.js'), context);
  const registry = context.AdvancedVendorRegistry;
  for (const vendor of Vendors.list) {
    assert.equal(registry.modules[vendor.detectorId].name, vendor.className);
    assert.equal(registry.canonical(`detect-${vendor.detectorId}`), vendor.vendorId);
    assert.equal(registry.vendors[vendor.vendorId].detectorId, vendor.detectorId);
    assert.equal(registry.registryKey(vendor.vendorId), vendor.detectorId);
  }
  assert.equal(registry.registryKey('imperva'), 'incapsula');
  assert.equal(registry.registryKey('awswaf'), 'aws-waf');
  assert.equal(registry.registryKey('binance'), 'binance-captcha');
  assert.equal(registry.registryKey('detect-akamai'), 'akamai');
});

const urls = {
  prosopo: { 'https://js.prosopo.io/js/procaptcha.bundle.js': 'bundle', 'https://pronode4.prosopo.io/v1/prosopo/provider/client/captcha/5C7b': 'provider' },
  friendlycaptcha: {
    'https://cdn.jsdelivr.net/npm/friendly-challenge@0.9.18/widget.module.min.js': 'widget v1',
    'https://cdn.jsdelivr.net/npm/@friendlycaptcha/sdk@0.1.10/site.min.js': 'sdk v2',
    'https://api.friendlycaptcha.com/api/v1/puzzle?sitekey=FCMGEMUD2KTDSQ5H': 'api v1',
    'https://global.frcapi.com/api/v2/captcha/activate': 'api v2'
  },
  mtcaptcha: { 'https://service.mtcaptcha.com/mtcv1/client/mtcaptcha.min.js': 'client', 'https://service2.mtcaptcha.com/mtcv1/api/getchallenge.json?sk=MTPublic-abc123': 'api' },
  smartcaptcha: { 'https://smartcaptcha.yandexcloud.net/captcha.js': 'sdk', 'https://smartcaptcha.yandexcloud.net/check?sitekey=ysc1_x': 'check', 'https://smartcaptcha.yandexcloud.net/checkbox?sitekey=ysc1_x': 'frame' },
  captchaeu: { 'https://www.captcha.eu/sdk.js?v7aaaa1aa': 'sdk', 'https://www.captcha.eu/challenge?publicSecret=pub_1234567890abcdef': 'challenge',
    'https://www.captcha.eu/challenge/quest?publicSecret=pub_1234567890abcdef': 'challenge', 'https://b.captcha.eu/bm?publicSecret=pub_1234567890abcdef': 'bot check' },
  qcloud: { 'https://turing.captcha.qcloud.com/TCaptcha.js': 'sdk', 'https://ssl.captcha.qq.com/TCaptcha.js': 'sdk', 'https://ca.turing.captcha.qcloud.com/TJNCaptcha-global.js': 'sdk',
    'https://turing.captcha.qcloud.com/cap_union_prehandle?aid=190012345': 'api', 'https://turing.captcha.qcloud.com/template/placeholder_v2.html': 'frame' },
  yidun: { 'https://cstaticdun.126.net/load.min.js': 'loader', 'https://cstaticdun.126.net/2.28.0/core-optimi.v2.28.0.min.js': 'core', 'https://c.dun.163.com/api/v3/get?id=abc': 'api' },
  aliyun: { 'https://o.alicdn.com/captcha-frontend/aliyunCaptcha/AliyunCaptcha.js': 'sdk', 'https://g.alicdn.com/captcha-frontend/dynamicJS/1.0.1/sg.cdec2e19d71dad4140fa.js': 'sdk', 'https://1a2b3c.captcha-open.aliyuncs.com/': 'api' },
  dingxiang: { 'https://cdn.dingxiang-inc.com/ctu-group/captcha-ui/v5/index.js': 'sdk', 'https://cdn.dingxiang-inc.com/ctu-group/captcha-js/1.2.3/x.js': 'engine', 'https://cap.dingxiang-inc.com/api/a?w=1': 'api' },
  shumei: { 'https://castatic.fengkongcloud.cn/pr/v1.0.4/smcp.min.js': 'sdk', 'https://captcha1.fengkongcloud.cn/ca/v1/register?organization=abc': 'api' },
  capy: { 'https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_Abcdefghijklmnopqrstuvwxyz': 'sdk', 'https://jp.api.capy.me/puzzle/get_image/?k=1': 'puzzle' },
  binance: { 'https://bin.bnbstatic.com/static/js/se/captcha/v1/captcha.min.js': 'sdk', 'https://www.binance.com/bapi/composite/v1/public/antibot/getCaptcha': 'antibot api' },
  basilisk: { 'https://basiliskcaptcha.com/challenge/check-site?key=1': 'check-site', 'https://basiliskcaptcha.com/widget.js': 'basilisk' },
  aliexpress: { 'https://www.aliexpress.com//punish?x5secdata=abc': 'punish page', 'https://g.alicdn.com/bsop-static/sufei-punish/1.1.3/build/punishpage.min.js': 'punish script' }
};
const lookAlikes = ['https://js.prosopo.io.evil.example/js/procaptcha.bundle.js', 'https://evil.example/js.prosopo.io/js/x.js', 'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
  'https://g.alicdn.com/some/other/lib.js', 'https://www.binance.com/en/markets', 'https://captcha.eu.evil.example/sdk.js', 'ftp://js.prosopo.io/js/x.js', 'not a url',
  // Vendors' own websites share the captcha's hosts or domains
  'https://www.captcha.eu/wp-includes/js/jquery/jquery.min.js', 'https://www.captcha.eu/challenger-page/',
  'https://prosopo.io/assets/scripts/formValidation.js', 'https://www.mtcaptcha.com/wp-includes/js/jquery/jquery.min.js', 'https://www.capy.me/static/js/app.js'];

for (const vendor of Vendors.list) {
  test(`${vendor.vendorId}: Analyze Scripts lists its own requests and nothing else`, () => {
    for (const [url, type] of Object.entries(urls[vendor.vendorId])) assert.equal(Vendors.classify(vendor, url), type, url);
    for (const url of lookAlikes) assert.equal(Vendors.classify(vendor, url), null, url);
    for (const other of Vendors.list.filter(item => item !== vendor)) {
      for (const url of Object.keys(urls[other.vendorId])) {
        if (Vendors.classify(vendor, url)) assert.fail(`${vendor.vendorId} claims ${other.vendorId}'s ${url}`);
      }
    }
  });
}

// A frame the probe runs in: elements are { tag, attrs, text }
function frame({ elements = [], resources = [], url = 'https://shop.example/login', top = true, globals = {} }) {
  const node = item => ({
    tagName: item.tag, attributes: item.attrs || {},
    getAttribute: name => (item.attrs && Object.hasOwn(item.attrs, name) ? item.attrs[name] : null),
    get src() { return item.attrs && item.attrs.src ? new URL(item.attrs.src, url).href : ''; },
    get value() { return item.attrs && item.attrs.value; },
    textContent: item.text || ''
  });
  const nodes = elements.map(node);
  const select = selector => selector === 'script:not([src])'
    ? nodes.filter(el => el.tagName === 'script' && !el.attributes.src)
    : nodes.filter(el => demMatchDOMSelector(selector, el));
  const context = { URL, location: { href: url }, ...globals,
    document: { querySelectorAll: select, querySelector: selector => select(selector)[0] || null },
    performance: { getEntriesByType: type => (type === 'resource' ? resources.map(name => ({ name })) : []) } };
  context.window = context;
  context.top = top ? context : {};
  vm.createContext(context);
  return context;
}
const run = (fn, context, args) => vm.runInContext(`(${fn.toString()})(${JSON.stringify(args)})`, context);

const embeds = {
  prosopo: [{ elements: [{ tag: 'div', attrs: { class: 'procaptcha', 'data-sitekey': '5C7bfXYwachNuvmasEFtWi9BMS41uBvo6KpYHVSQmad4nWzw', 'data-captcha-type': 'frictionless' } },
    { tag: 'script', attrs: { src: 'https://js.prosopo.io/js/procaptcha.bundle.js' } }] },
    '5C7bfXYwachNuvmasEFtWi9BMS41uBvo6KpYHVSQmad4nWzw', { captchaType: 'frictionless' }],
  friendlycaptcha: [{ elements: [{ tag: 'div', attrs: { class: 'frc-captcha', 'data-sitekey': 'FCMGEMUD2KTDSQ5H', 'data-start': 'auto' } },
    { tag: 'input', attrs: { type: 'hidden', name: 'frc-captcha-solution' } }] },
    'FCMGEMUD2KTDSQ5H', { start: 'auto' }, { version: 'v1' }],
  mtcaptcha: [{ elements: [{ tag: 'script', text: 'var mtcaptchaConfig = { "sitekey": "MTPublic-tqNCRE0GS", "lang": "en" };' }] }, 'MTPublic-tqNCRE0GS'],
  smartcaptcha: [{ elements: [{ tag: 'div', attrs: { class: 'smart-captcha', 'data-sitekey': 'ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456', 'data-hl': 'en' } }] },
    'ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456', { hl: 'en' }],
  captchaeu: [{ elements: [{ tag: 'script', text: "KROT.setup('pub_1234567890abcdef');" }] }, 'pub_1234567890abcdef'],
  qcloud: [{ elements: [{ tag: 'script', text: "var captcha = new TencentCaptcha('190012345', callback, { userLanguage: 'en' });" }],
    resources: ['https://turing.captcha.qcloud.com/cap_union_prehandle?aid=190012345&protocol=https'] }, '190012345'],
  yidun: [{ elements: [{ tag: 'script', text: "initNECaptcha({ captchaId: '0123456789abcdef0123456789abcdef', element: '#c', mode: 'popup' }, ok, fail);" }] },
    '0123456789abcdef0123456789abcdef', {}, { mode: 'popup' }],
  aliyun: [{ elements: [{ tag: 'script', text: "window.AliyunCaptchaConfig = { region: 'cn', prefix: 'xyz123' }; initAliyunCaptcha({ SceneId: 'c9h3hnfv', mode: 'popup' });" }] },
    'c9h3hnfv', {}, { prefix: 'xyz123', region: 'cn', mode: 'popup' }],
  dingxiang: [{ elements: [{ tag: 'script', text: "var myCaptcha = _dx.Captcha(document.getElementById('c'), { appId: 'abcdef0123456789abcdef0123456789', style: 'popup' });" }] },
    'abcdef0123456789abcdef0123456789', {}, { style: 'popup' }],
  shumei: [{ resources: ['https://captcha1.fengkongcloud.cn/ca/v1/register?organization=AbCdEfGhIjKlMnOp&appId=default&channel=web'],
    elements: [{ tag: 'script', text: "initSMCaptcha({ organization: 'AbCdEfGhIjKlMnOp', product: 'popup' }, cb);" }] },
    'AbCdEfGhIjKlMnOp', {}, { appId: 'default', product: 'popup' }],
  capy: [{ elements: [{ tag: 'script', attrs: { src: 'https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_Abcdefghijklmnopqrstuvwxyz' } },
    { tag: 'input', attrs: { name: 'capy_captchakey', value: 'PUZZLE_Abcdefghijklmnopqrstuvwxyz' } }] }, 'PUZZLE_Abcdefghijklmnopqrstuvwxyz']
};

for (const vendor of Vendors.list.filter(item => item.siteKey)) {
  test(`${vendor.vendorId}: Extract Site Key finds the key in its documented embed`, () => {
    const [page, expected, fields = {}, facts = {}] = embeds[vendor.vendorId];
    const args = Vendors.probeArgs(vendor);
    const context = frame(page);
    const before = Object.keys(context).sort();
    const result = Probe.merge([{ result: run(Probe.probe, context, args) }], args);
    assert.deepEqual(Object.keys(context).sort(), before, 'the probe adds nothing to the page');
    assert.deepEqual(plain(result.keys.map(entry => entry.sitekey)), [expected]);
    for (const [name, value] of Object.entries(fields)) assert.equal(result.keys[0].fields[name], value, name);
    for (const [name, value] of Object.entries(facts)) assert.equal(result.facts[name], value, name);
  });
}

test('vendors never report each other\'s keys when all embeds share one page', () => {
  const everything = { elements: [], resources: [] };
  for (const [page] of Object.values(embeds)) {
    everything.elements.push(...(page.elements || []));
    everything.resources.push(...(page.resources || []));
  }
  for (const vendor of Vendors.list.filter(item => item.siteKey)) {
    const args = Vendors.probeArgs(vendor);
    const keys = Probe.merge([{ result: run(Probe.probe, frame(everything), args) }], args).keys.map(entry => entry.sitekey);
    assert.deepEqual(plain(keys), [embeds[vendor.vendorId][1]], vendor.vendorId);
  }
});

test('the page-variable fallback reads data properties only, never getters or functions', () => {
  const vendor = Vendors.byVendorId.mtcaptcha;
  const args = Vendors.probeArgs(vendor);
  let called = 0;
  const config = { sitekey: 'MTPublic-fromGlobal1' };
  const trap = {};
  Object.defineProperty(trap, 'sitekey', { get() { called++; return 'MTPublic-fromGetter1'; } });
  assert.deepEqual(plain(run(Probe.probeGlobals, frame({ globals: { mtcaptchaConfig: config } }), args).found), [{ sitekey: 'MTPublic-fromGlobal1', source: 'global' }]);
  assert.deepEqual(plain(run(Probe.probeGlobals, frame({ globals: { mtcaptchaConfig: trap } }), args).found), []);
  assert.equal(called, 0);
});

test('keys from several frames merge once; frames that failed are skipped; candidates are the vendor\'s own URLs', () => {
  const vendor = Vendors.byVendorId.smartcaptcha;
  const args = Vendors.probeArgs(vendor);
  const top = run(Probe.probe, frame({ elements: [{ tag: 'div', attrs: { class: 'smart-captcha', 'data-sitekey': 'ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456' } },
    { tag: 'script', attrs: { src: 'https://smartcaptcha.yandexcloud.net/captcha.js' } }, { tag: 'script', attrs: { src: 'https://cdn.example/app.js' } }] }), args);
  const child = run(Probe.probe, frame({ url: 'https://smartcaptcha.yandexcloud.net/checkbox?sitekey=ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456', top: false,
    resources: ['https://smartcaptcha.yandexcloud.net/checkbox?sitekey=ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456'] }), args);
  const merged = Probe.merge([{ result: top }, null, { error: 'no access' }, { result: child }], args);
  assert.equal(merged.keys.length, 1);
  assert.deepEqual(plain(merged.keys[0].sources), ['widget', 'request']);
  assert.deepEqual(plain(merged.keys[0].frames), ['', 'https://smartcaptcha.yandexcloud.net/checkbox?sitekey=ysc1_5ZOqOqA4uXjAsEbVkjQabcdef123456']);
  assert.equal(merged.pageUrl, 'https://shop.example/login');
  assert.ok(merged.candidates.includes('https://smartcaptcha.yandexcloud.net/captcha.js'));
  assert.ok(!merged.candidates.includes('https://cdn.example/app.js'));
});

test('keys only in a widget frame URL, as on the vendors\' live demos', () => {
  // developer.friendlycaptcha.com/playground: a v2 widget made with createWidget(), no data-sitekey
  const friendly = Vendors.probeArgs(Vendors.byVendorId.friendlycaptcha);
  const frc = Probe.merge([{ result: run(Probe.probe, frame({ elements: [{ tag: 'div', attrs: { class: 'frc-captcha' } },
    { tag: 'input', attrs: { name: 'frc-captcha-response' } },
    { tag: 'iframe', attrs: { src: 'https://global.frcapi.com/api/v2/captcha/widget?origin=https%3A%2F%2Fshop.example&sess_c=2&sdk_v=0.1.32&lang=en&sitekey=FCMTROQPGU36Q253&theme=light' } }] }), friendly) }], friendly);
  assert.deepEqual(plain(frc.keys.map(entry => entry.sitekey)), ['FCMTROQPGU36Q253']);
  assert.equal(frc.facts.version, 'v2');
  // smartcaptcha.yandexcloud.net/demo: an older 40-character key without the ysc1_ prefix
  const smart = Vendors.probeArgs(Vendors.byVendorId.smartcaptcha);
  const ysc = Probe.merge([{ result: run(Probe.probe, frame({ elements: [{ tag: 'div', attrs: { class: 'smart-captcha' } },
    { tag: 'iframe', attrs: { src: 'https://smartcaptcha.yandexcloud.net/checkbox.en.e05501d67102945a.html?sitekey=FEXfAbHQsToo97VidNVk3j4dC74nGW1DgdxjtNB9&theme=light&hl=en' } }] }), smart) }], smart);
  assert.deepEqual(plain(ysc.keys.map(entry => entry.sitekey)), ['FEXfAbHQsToo97VidNVk3j4dC74nGW1DgdxjtNB9']);
});

test('hCaptcha, FunCaptcha and reCAPTCHA Extract finds the key the way their live pages carry it', () => {
  const keysFor = (vendorId, page) => {
    const args = Vendors.probeArgs(Vendors.siteKeyOnly[vendorId]);
    return plain(Probe.merge([{ result: run(Probe.probe, frame(page), args) }], args).keys.map(entry => entry.sitekey));
  };
  // accounts.hcaptcha.com/demo: the widget div, and the frame's #...&sitekey=
  assert.deepEqual(keysFor('hcaptcha', { elements: [{ tag: 'div', attrs: { class: 'h-captcha', 'data-sitekey': 'a5f74b19-9e45-40e0-b45d-47ff91b7a6c2' } },
    { tag: 'iframe', attrs: { src: 'https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html#frame=checkbox&id=0x1&host=accounts.hcaptcha.com&sitekey=a5f74b19-9e45-40e0-b45d-47ff91b7a6c2' } }] }),
  ['a5f74b19-9e45-40e0-b45d-47ff91b7a6c2']);
  // signup.live.com: the iframe embed URL inside the page's data
  assert.deepEqual(keysFor('funcaptcha', { elements: [{ tag: 'script',
    text: 'var ServerData = {"urlArkoseEnforcement":"https://iframe.arkoselabs.com/B7D8911C-5CC8-A9A3-35B0-554ACEE604DA/index.html?mkt=en"};' }] }),
  ['B7D8911C-5CC8-A9A3-35B0-554ACEE604DA']);
  assert.deepEqual(keysFor('funcaptcha', { elements: [{ tag: 'iframe', attrs: { src: 'https://iframe.arkoselabs.com/B7D8911C-5CC8-A9A3-35B0-554ACEE604DA/index.html' } }] }),
    ['B7D8911C-5CC8-A9A3-35B0-554ACEE604DA']);
  // google.com/recaptcha/api2/demo: the widget div and the anchor frame's k=
  assert.deepEqual(keysFor('recaptcha', { elements: [{ tag: 'div', attrs: { class: 'g-recaptcha', 'data-sitekey': '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-' } },
    { tag: 'iframe', attrs: { src: 'https://www.google.com/recaptcha/api2/anchor?ar=1&k=6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-&co=aHR0cHM6&hl=en' } }] }),
  ['6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-']);
});

test('Captcha.eu: the key comes from the SDK\'s own requests, and its website\'s files are not "scripts on this page"', () => {
  const vendor = Vendors.byVendorId.captchaeu;
  const args = Vendors.probeArgs(vendor);
  const page = frame({ url: 'https://www.captcha.eu/', elements: [{ tag: 'script', attrs: { src: 'https://www.captcha.eu/sdk.js?v7aaaa1aa' } },
    { tag: 'script', attrs: { src: 'https://www.captcha.eu/wp-includes/js/jquery/jquery.min.js' } }],
  resources: ['https://b.captcha.eu/bm?publicSecret=pub_1234567890abcdef'] });
  const merged = Probe.merge([{ result: run(Probe.probe, page, args) }], args);
  assert.deepEqual(plain(merged.keys.map(entry => entry.sitekey)), ['pub_1234567890abcdef']);
  assert.deepEqual(plain(merged.candidates), ['https://www.captcha.eu/sdk.js?v7aaaa1aa', 'https://b.captcha.eu/bm?publicSecret=pub_1234567890abcdef']);
  assert.deepEqual(plain(run(Probe.probeGlobals, frame({ globals: { KROT: { publicSecret: 'pub_1234567890abcdef' } } }), args).found),
    [{ sitekey: 'pub_1234567890abcdef', source: 'global' }]);
});

test('the worker routes every vendor\'s Analyze Scripts and reports only that vendor\'s requests', async () => {
  const event = () => { const listeners = new Set(); return { listeners, addListener: l => listeners.add(l), removeListener: l => listeners.delete(l),
    emit(...args) { for (const listener of Array.from(listeners)) listener(...args); } }; };
  const timers = new Map(); let nextTimer = 0;
  const messages = [];
  const context = { URL, TextDecoder, Uint8Array, console, Logger: { debug() {}, network() {}, warn() {}, error() {} },
    UrlUtils: { normalizeFaviconForStorage: () => '' },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    chrome: { tabs: { onRemoved: event(), onUpdated: event(), get: async id => ({ id, url: 'https://shop.example/' }) },
      webNavigation: { onCompleted: event(), onCommitted: event() },
      webRequest: { onBeforeRequest: event(), onResponseStarted: event(), onBeforeSendHeaders: event() },
      runtime: { async sendMessage(message) { messages.push(message); } },
      storage: { local: { async get() { return {}; }, async set() {} } } } };
  context.self = context;
  vm.createContext(context);
  for (const file of ['modules/core/message-types.js', 'modules/advanced/captcha-vendors.js', 'modules/advanced/vendor-registry.js', 'modules/advanced/result-model.js',
    'background/advanced/history-store.js', 'background/advanced/page-notice.js', 'background/advanced/collector-utils.js', 'background/advanced/job-manager.js',
    'background/advanced/script-analysis.js', 'background/advanced/vendors/captcha/interceptor.js', 'background/handlers/messages-advanced-capture.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const registry = {};
  context.registerAdvancedCaptureHandlers(registry, {});
  for (const vendor of Vendors.list) assert.equal(typeof registry[`${vendor.vendorId.toUpperCase()}_START_ANALYSIS`], 'function', vendor.vendorId);
  const replies = [];
  registry.PROSOPO_START_ANALYSIS({ request: { type: 'PROSOPO_START_ANALYSIS', tabId: 7, url: 'https://shop.example/', vendorId: 'prosopo' }, sendResponse: reply => replies.push(reply) });
  assert.equal(replies[0].status, 'started');
  for (const [url, type] of [['https://js.prosopo.io/js/procaptcha.bundle.js', 'script'], ['https://js.prosopo.io.evil.example/js/x.js', 'script'],
    ['https://pronode4.prosopo.io/v1/prosopo/provider/client/captcha/x', 'xmlhttprequest'], ['https://js.prosopo.io/js/logo.png', 'image']]) {
    context.chrome.webRequest.onBeforeRequest.emit({ tabId: 7, url, type });
  }
  context.chrome.webNavigation.onCompleted.emit({ tabId: 7, frameId: 0 });
  for (const [id, timer] of Array.from(timers)) if (timer.delay === 5000) { timers.delete(id); timer.fn(); }
  for (let i = 0; i < 40; i++) await Promise.resolve();
  const result = messages.find(message => message.type === 'PROSOPO_ANALYSIS_RESULT');
  assert.ok(result, 'the result goes to the popup');
  assert.deepEqual(plain(result.data.scripts.map(script => [script.type, script.url])), [
    ['bundle', 'https://js.prosopo.io/js/procaptcha.bundle.js'], ['provider', 'https://pronode4.prosopo.io/v1/prosopo/provider/client/captcha/x']]);
});

test('the no-tools screen groups supported protections by category, with logos and escaped names', () => {
  const FormatUtils = require('../utils/format-utils');
  const context = { window: {}, document: {}, console, FormatUtils, Logger: { ui() {}, debug() {}, error() {} } };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('modules/advanced/captcha-vendors.js'), context);
  vm.runInContext(read('modules/advanced/vendor-registry.js'), context);
  for (const file of ['advanced.js', 'advanced-tools.js']) vm.runInContext(read(`sections/advanced/${file}`), context);
  const Advanced = context.window.Advanced;
  const groups = Advanced.supportedProtectionGroups();
  assert.deepEqual(plain(groups.map(group => [group.key, group.items.length])), [['antibot', 6], ['captcha', 19]]);
  for (const group of groups) for (const item of group.items) {
    assert.ok(fs.existsSync(path.join(root, 'detectors/icons', item.logo)), item.logo);
    // The dark theme's copy without the white square: node scripts/generate-dark-logos.js
    assert.ok(fs.existsSync(path.join(root, 'assets/logos-dark', item.logo)), `assets/logos-dark/${item.logo}: run scripts/generate-dark-logos.js`);
  }
  const html = Advanced.prototype.renderNoToolsState.call({ detectorManager: null }, (key, fallback) => fallback);
  assert.equal((html.match(/class="advanced-supported-logo[" ]/g) || []).length, 25);
  assert.equal((html.match(/class="advanced-supported-group"/g) || []).length, 2);
  assert.doesNotMatch(html, /advanced-supported-chip/);
  assert.match(html, /title="Friendly Captcha"><img class="advanced-supported-logo-dark" src="assets\/logos-dark\/friendlycaptcha_official\.png"[^>]*><img class="advanced-supported-logo-light" src="detectors\/icons\/friendlycaptcha_official\.png"/,
    'the dark copy first, the original for the light theme');
  const light = fs.readFileSync(path.join(root, 'modules/styles/theme-light.css'), 'utf8');
  assert.match(light, /:root\[data-theme="light"\] \.advanced-supported-logo \.advanced-supported-logo-dark \{\s*display: none;/);
  // Nothing detected: the minimum and where to change it
  assert.match(html, /No protection detected/);
  assert.match(html, /above 50% confidence/);
  // A supported protection at or below the minimum: named, with its confidence
  const low = Advanced.prototype.renderNoToolsState.call({ detectorManager: null, minToolConfidence: 60,
    toolsBelowThreshold: [{ name: 'DataDome', confidence: 42.6 }] }, (key, fallback) => fallback);
  assert.match(low, /Protection detected with low confidence/);
  assert.match(low, /DataDome was detected with 43% confidence\. Tools appear only above 60%/);
});
