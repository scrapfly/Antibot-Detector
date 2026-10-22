const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WB = require('../modules/core/webhook-body.js');

const ctxWith = (detections, extra = {}) => ({
  url: 'https://shop.example/p?a=1&b=2',
  hostname: 'shop.example',
  title: 'He said "hi" \\ <b>&</b>\nnew line',
  favicon: 'https://icons.example/f.png',
  timestamp: '2026-09-30T10:00:00.000Z',
  detectionCount: detections.length,
  categories: [...new Set(detections.map(d => d.category))].join(','),
  detections,
  ...extra
});

const DETS = [
  { id: 'detect-a', name: 'Alpha, "Quoted"', category: 'Anti-Bot', confidence: 90, methods: ['dom', 'cookie'], meta: { vendor: 'X & Y', tags: [] } },
  { id: 'detect-b', name: 'Beta\nTwo lines', category: 'CAPTCHA', confidence: 70, methods: [], matches: [{ type: 'dom', value: '<div>' }] }
];

// ---------------------------------------------------------------- content types
test('listed content types resolve to their serialiser; multipart leaves the header to fetch', () => {
  assert.deepStrictEqual(WB.resolveContentType('application/json'), { kind: 'json', header: 'application/json', value: 'application/json', custom: false });
  assert.strictEqual(WB.resolveContentType('application/x-www-form-urlencoded').kind, 'form');
  assert.strictEqual(WB.resolveContentType('TEXT/PLAIN').kind, 'text');
  assert.strictEqual(WB.resolveContentType('application/xml').kind, 'xml');
  assert.strictEqual(WB.resolveContentType('text/csv').kind, 'csv');
  assert.strictEqual(WB.resolveContentType('application/x-ndjson').kind, 'ndjson');
  const mp = WB.resolveContentType('multipart/form-data');
  assert.strictEqual(mp.kind, 'multipart');
  assert.strictEqual(mp.header, null);
});

test('saved values from before this change keep working', () => {
  // The old select offered exactly these three values
  for (const legacy of ['application/json', 'application/x-www-form-urlencoded', 'text/plain']) {
    assert.strictEqual(WB.resolveContentType(legacy).value, legacy);
    assert.strictEqual(WB.resolveContentType(legacy).custom, false);
  }
  assert.strictEqual(WB.resolveContentType(undefined).value, 'application/json');
  assert.strictEqual(WB.resolveContentType('').value, 'application/json');
});

test('custom content types must be type/subtype; invalid ones fall back to JSON', () => {
  for (const ok of ['application/vnd.acme+json', 'application/json; charset=utf-8', 'text/x-custom;v="1 2"']) {
    assert.ok(WB.isValidContentType(ok), ok);
    const r = WB.resolveContentType(ok);
    assert.strictEqual(r.kind, 'custom');
    assert.strictEqual(r.header, ok);
  }
  for (const bad of ['json', 'application/', '/json', 'a b/c', 'text/plain\r\nX-Evil: 1', 'custom']) {
    assert.ok(!WB.isValidContentType(bad), bad);
    assert.strictEqual(WB.resolveContentType(bad).header, 'application/json', bad);
  }
});

// ---------------------------------------------------------------- substitution
test('JSON substitution escapes strings, inserts the count and the detections array', () => {
  const ctx = ctxWith(DETS);
  const body = WB.substitute(WB.DEFAULT_TEMPLATE, ctx, 'json');
  const parsed = JSON.parse(body);
  assert.strictEqual(parsed.title, ctx.title);
  assert.strictEqual(parsed.url, ctx.url);
  assert.strictEqual(parsed.count, 2);
  assert.deepStrictEqual(parsed.detections, DETS);
  assert.strictEqual(parsed.categories, 'Anti-Bot,CAPTCHA');
});

test('URL substitution encodes values and never inserts detections; headers are verbatim', () => {
  const ctx = ctxWith(DETS);
  assert.strictEqual(WB.substitute('https://h.example/?u=<SITEURL>&n=<DETECTION_COUNT>&d=<DETECTIONS>', ctx, 'url'),
    `https://h.example/?u=${encodeURIComponent(ctx.url)}&n=2&d=<DETECTIONS>`);
  assert.strictEqual(WB.substitute('<HOSTNAME>|<TITLE>', ctx, 'header'), `shop.example|${ctx.title}`);
});

test('every variable is substituted, and the list is the single definition', () => {
  const ctx = ctxWith(DETS);
  const all = WB.VARIABLES.map(v => v.token).join(' ');
  const out = WB.substitute(all, ctx, 'text');
  for (const v of WB.VARIABLES) assert.ok(!out.includes(v.token), v.token);
  assert.deepStrictEqual(WB.VARIABLES.map(v => v.token),
    ['<SITEURL>', '<HOSTNAME>', '<TITLE>', '<FAVICON>', '<DETECTIONS>', '<TIMESTAMP>', '<DETECTION_COUNT>', '<CATEGORIES>']);
});

test('template validation reports the line of a JSON error after substitution', () => {
  assert.deepStrictEqual(WB.validateTemplate(WB.DEFAULT_TEMPLATE), { ok: true });
  assert.deepStrictEqual(WB.validateTemplate('   '), { ok: true, empty: true });
  // A title with quotes stays valid: strings are escaped
  assert.ok(WB.validateTemplate('{"t": "<TITLE>"}', ctxWith(DETS)).ok);
  const bad = WB.validateTemplate('{\n  "a": 1,\n  "b": <DETECTIONS>\n  "c": 2\n}');
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.line, 4);
});

test('a JSON error Chrome words without a position still gets its line: a stray token, or a text that ends too soon', () => {
  // "Unexpected token '}', … is not valid JSON" carries no position
  const stray = WB.validateTemplate('{\n  "a": 1,\n  "b": \n}\n');
  assert.deepStrictEqual([stray.ok, stray.line, stray.column], [false, 4, 1]);
  // The text stops inside an object: the last line that has anything on it
  const open = WB.validateTemplate('{\n  "a": 1,\n  "b": [1, 2\n\n');
  assert.deepStrictEqual([open.ok, open.line], [false, 3]);
  // A comma left before the closing brace, wherever the message puts it
  const comma = WB.validateTemplate('{\n  "a": 1,\n  "b": 2,\n}');
  assert.deepStrictEqual([comma.ok, comma.line], [false, 4]);
  // A long template does not slow the check
  const long = '{' + Array.from({ length: 800 }, (_, i) => `\n  "k${i}": "${'x'.repeat(40)}",`).join('') + '\n  "end": oops\n}';
  const started = Date.now();
  const far = WB.validateTemplate(long);
  assert.ok(far.line > 800 && Date.now() - started < 1000, `line ${far.line} in ${Date.now() - started} ms`);
});

// The Settings "Test" button sends sampleContext(); a naturally triggered
// event sends the engine's detection objects. The two must agree, or the
// test cannot validate a real integration (GitHub issue #5).
test('the sample detections use the schema of real triggered detections', () => {
  const sample = WB.sampleContext().detections[0];

  // Same fields as runDetector/detectOnPage emit — and none of the old
  // ad-hoc ones (id/name/color/methods at the top level)
  assert.deepStrictEqual(
    Object.keys(sample).sort(),
    ['category', 'confidence', 'detected', 'detectionMethods', 'detector', 'difficulty', 'matches']
  );
  assert.deepStrictEqual(
    Object.keys(sample.detector).sort(),
    ['author', 'description', 'difficulty', 'icon', 'id', 'name']
  );
  assert.deepStrictEqual(
    Object.keys(sample.matches[0]).sort(),
    ['confidence', 'description', 'fullUrl', 'pattern', 'patternId', 'type', 'value']
  );
  assert.strictEqual(sample.detected, true);
  assert.strictEqual(sample.category, 'antibot');
  assert.ok(Array.isArray(sample.detectionMethods) && sample.detectionMethods.every(t => typeof t === 'string'));

  // A JSON body built from the sample carries that schema verbatim
  const body = JSON.parse(WB.build('application/json', '', WB.sampleContext()).body);
  assert.deepStrictEqual(body.detections[0], sample);
  // categories are the raw detection categories, as the sender joins them
  assert.strictEqual(WB.sampleContext().categories, 'antibot');
});

// ---------------------------------------------------------------- form + multipart
test('form-urlencoded flattens nested values in bracket notation and encodes them', () => {
  const pairs = WB.flattenPairs({ a: { b: 1, c: [true, null] }, empty: [], none: {}, s: 'x y&z' });
  assert.deepStrictEqual(pairs, [['a[b]', '1'], ['a[c][0]', 'true'], ['a[c][1]', ''], ['empty', ''], ['none', ''], ['s', 'x y&z']]);
  const body = WB.toFormUrlEncoded({ s: 'x y&z=é', list: [{ n: 'q' }] });
  assert.strictEqual(body, 's=x+y%26z%3D%C3%A9&list%5B0%5D%5Bn%5D=q');
  const round = new URLSearchParams(body);
  assert.strictEqual(round.get('s'), 'x y&z=é');
  assert.strictEqual(round.get('list[0][n]'), 'q');
});

test('form body from the default template carries every detection field', () => {
  const ctx = ctxWith(DETS);
  const { body, contentType } = WB.build('application/x-www-form-urlencoded', WB.DEFAULT_TEMPLATE, ctx);
  assert.strictEqual(contentType, 'application/x-www-form-urlencoded');
  const q = new URLSearchParams(body);
  assert.strictEqual(q.get('title'), ctx.title);
  assert.strictEqual(q.get('count'), '2');
  assert.strictEqual(q.get('detections[0][name]'), 'Alpha, "Quoted"');
  assert.strictEqual(q.get('detections[0][methods][1]'), 'cookie');
  assert.strictEqual(q.get('detections[0][meta][vendor]'), 'X & Y');
  assert.strictEqual(q.get('detections[1][methods]'), '');
  assert.strictEqual(q.get('detections[1][matches][0][value]'), '<div>');
});

test('multipart builds FormData with the same pairs and no Content-Type header', () => {
  const ctx = ctxWith(DETS);
  const { body, contentType, kind } = WB.build('multipart/form-data', WB.DEFAULT_TEMPLATE, ctx);
  assert.strictEqual(kind, 'multipart');
  assert.strictEqual(contentType, null);
  assert.ok(body instanceof FormData);
  assert.strictEqual(body.get('hostname'), 'shop.example');
  assert.strictEqual(body.get('detections[1][name]'), 'Beta\nTwo lines');
  const expected = WB.flattenPairs(WB.payloadObject(WB.DEFAULT_TEMPLATE, ctx));
  assert.deepStrictEqual([...body.entries()], expected);
});

// ---------------------------------------------------------------- XML
test('XML escapes text, drops characters XML cannot hold and repeats array items', () => {
  const xml = WB.toXML({ title: 'a<b>&"c"\'d\u0001e', detections: [{ name: 'n1', methods: ['dom'] }, { name: 'n2', methods: [] }], 'bad key': 1, '9lives': 2, empty: [], nothing: null });
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<webhook>\n'));
  assert.ok(xml.includes('<title>a&lt;b&gt;&amp;&quot;c&quot;&apos;de</title>'));
  assert.ok(xml.includes('<detections>\n    <detection>\n      <name>n1</name>\n      <methods>\n        <method>dom</method>\n      </methods>'));
  assert.ok(xml.includes('<methods/>'));
  assert.ok(xml.includes('<bad_key>1</bad_key>'));
  assert.ok(xml.includes('<_9lives>2</_9lives>'));
  assert.ok(xml.includes('<empty/>'));
  assert.ok(xml.includes('<nothing/>'));
  assert.ok(!/[\u0000-\u0008]/.test(xml));
  // Balanced tags
  const opens = (xml.match(/<[A-Za-z_][^/>]*>/g) || []).filter(t => !t.startsWith('<?')).length;
  const closes = (xml.match(/<\/[^>]+>/g) || []).length;
  assert.strictEqual(opens, closes);
});

test('XML with no detections keeps an empty detections element', () => {
  const { body, contentType } = WB.build('application/xml', WB.DEFAULT_TEMPLATE, ctxWith([]));
  assert.strictEqual(contentType, 'application/xml');
  assert.ok(body.includes('<detections/>'));
  assert.ok(body.includes('<count>0</count>'));
});

// ---------------------------------------------------------------- CSV
const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
    else field += c;
  }
  return rows;
};

test('CSV has a header and one row per detection, with RFC 4180 quoting', () => {
  const ctx = ctxWith(DETS);
  const { body, contentType } = WB.build('text/csv', WB.DEFAULT_TEMPLATE, ctx);
  assert.strictEqual(contentType, 'text/csv');
  assert.ok(body.endsWith('\r\n'));
  const rows = parseCsv(body);
  assert.strictEqual(rows.length, 3);
  const [header, r1, r2] = rows;
  const col = (r, name) => r[header.indexOf(name)];
  assert.ok(header.includes('url') && header.includes('detection.name') && header.includes('detection.meta.vendor'));
  assert.ok(!header.includes('detections'));
  assert.strictEqual(col(r1, 'title'), ctx.title);
  assert.strictEqual(col(r1, 'detection.name'), 'Alpha, "Quoted"');
  assert.strictEqual(col(r1, 'detection.methods'), 'dom; cookie');
  assert.strictEqual(col(r2, 'detection.name'), 'Beta\nTwo lines');
  assert.strictEqual(col(r2, 'detection.meta.vendor'), '');
  assert.strictEqual(col(r2, 'detection.matches'), '[{"type":"dom","value":"<div>"}]');
  assert.strictEqual(col(r2, 'count'), '2');
});

test('CSV with no detections is a header and a single page row', () => {
  const rows = parseCsv(WB.build('text/csv', WB.DEFAULT_TEMPLATE, ctxWith([])).body);
  assert.strictEqual(rows.length, 2);
  assert.ok(!rows[0].some(h => h.startsWith('detection')));
  assert.strictEqual(rows[1][rows[0].indexOf('hostname')], 'shop.example');
});

// ---------------------------------------------------------------- NDJSON
test('NDJSON is one parseable object per detection with the page fields', () => {
  const ctx = ctxWith(DETS);
  const { body, contentType } = WB.build('application/x-ndjson', WB.DEFAULT_TEMPLATE, ctx);
  assert.strictEqual(contentType, 'application/x-ndjson');
  const lines = body.trimEnd().split('\n');
  assert.strictEqual(lines.length, 2);
  const objs = lines.map(l => JSON.parse(l));
  assert.deepStrictEqual(objs.map(o => o.detection), DETS);
  assert.ok(objs.every(o => o.title === ctx.title && !('detections' in o)));
});

test('NDJSON with no detections is a single page line', () => {
  const lines = WB.build('application/x-ndjson', WB.DEFAULT_TEMPLATE, ctxWith([])).body.trimEnd().split('\n');
  assert.strictEqual(lines.length, 1);
  assert.strictEqual(JSON.parse(lines[0]).count, 0);
});

// ---------------------------------------------------------------- text / json / fallbacks
test('text/plain sends the template verbatim; JSON and custom send escaped JSON', () => {
  const ctx = ctxWith(DETS);
  assert.strictEqual(WB.build('text/plain', 'Title: <TITLE>', ctx).body, `Title: ${ctx.title}`);
  const json = WB.build('application/json', '{"t": "<TITLE>", "d": <DETECTIONS>}', ctx);
  assert.deepStrictEqual(JSON.parse(json.body), { t: ctx.title, d: DETS });
  const custom = WB.build('application/vnd.acme+json', '{"t": "<TITLE>"}', ctx);
  assert.strictEqual(custom.contentType, 'application/vnd.acme+json');
  assert.deepStrictEqual(JSON.parse(custom.body), { t: ctx.title });
});

test('an empty template sends the default payload; an invalid one does for structured types', () => {
  const ctx = ctxWith(DETS);
  assert.deepStrictEqual(JSON.parse(WB.build('application/json', '', ctx).body), WB.defaultPayload(ctx));
  const xml = WB.build('application/xml', '{ not json', ctx).body;
  assert.ok(xml.includes('<hostname>shop.example</hostname>'));
  assert.ok(WB.expectsJsonTemplate('application/xml'));
  assert.ok(!WB.expectsJsonTemplate('text/plain'));
});

// ---------------------------------------------------------------- background sender
function loadRuntime(webhook, calls) {
  const sandbox = {
    WebhookBody: WB,
    Logger: { network() {}, warn() {}, error() {}, ui() {}, debug() {} },
    UrlUtils: { getFaviconUrl: (h) => `https://icons.example/${h}.png` },
    Utils: { getSettings: async () => ({ webhook }) },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 200 }; },
    URL, URLSearchParams, FormData, encodeURIComponent, console
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  for (const file of ['modules/core/categories.js', 'modules/core/domain-list.js', 'modules/core/webhook-filter.js', 'modules/core/webhook-log.js',
    'modules/settings/settings-runtime.js', 'modules/settings/webhook-runtime.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  }
  return sandbox.SettingsRuntime;
}

test('the background sender uses the serialiser and header for every content type', async () => {
  const types = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/xml', 'text/csv', 'application/x-ndjson', 'application/vnd.acme+json'];
  for (const type of types) {
    const calls = [];
    const runtime = loadRuntime({
      enableWebhook: true, webhookUrl: 'https://hooks.example/in?h=<HOSTNAME>', webhookMethod: 'POST',
      webhookContentType: type, webhookPayload: WB.DEFAULT_TEMPLATE, webhookHeaders: [{ name: 'X-Site', value: '<HOSTNAME>' }]
    }, calls);
    await runtime.sendWebhookIfEnabled({ url: 'https://shop.example/p', title: 'T' }, DETS);
    assert.strictEqual(calls.length, 1, type);
    const { url, options } = calls[0];
    assert.strictEqual(url, 'https://hooks.example/in?h=shop.example');
    assert.strictEqual(options.headers['X-Site'], 'shop.example');
    if (type === 'multipart/form-data') {
      assert.ok(!('Content-Type' in options.headers));
      assert.ok(options.body instanceof FormData);
    } else {
      assert.strictEqual(options.headers['Content-Type'], type);
      assert.strictEqual(typeof options.body, 'string');
    }
  }
});

test('GET sends no body and no Content-Type', async () => {
  const calls = [];
  const runtime = loadRuntime({ enableWebhook: true, webhookUrl: 'https://hooks.example/in', webhookMethod: 'GET', webhookContentType: 'text/csv' }, calls);
  await runtime.sendWebhookIfEnabled({ url: 'https://shop.example/p' }, DETS);
  assert.strictEqual(calls[0].options.body, undefined);
  assert.strictEqual(Object.keys(calls[0].options.headers).length, 0);
});

// ---------------------------------------------------------------- signing (Settings → Webhook → Signing secret)
const { createHmac } = require('node:crypto');
const nodeHmac = (secret, body) => createHmac('sha256', secret).update(body).digest('hex');

test('signature() is the HMAC-SHA256 of the body under the secret, in hex (RFC 4231 test case 2), in Scrapfly\'s two headers', async () => {
  const hex = await WB.signature('Jefe', 'what do ya want for nothing?');
  assert.strictEqual(hex, '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  assert.deepStrictEqual(WB.signatureHeaders(hex), {
    'X-Scrapfly-Webhook-Signature': hex.toUpperCase(),
    'X-Scrapfly-Webhook-Signature-Lowercase': hex
  });
  assert.strictEqual(WB.SIGNATURE_HEADER, 'X-Scrapfly-Webhook-Signature');
  assert.strictEqual(WB.SIGNATURE_HEADER_LOWERCASE, 'X-Scrapfly-Webhook-Signature-Lowercase');
});

test('signature() signs nothing without a secret or a text body, and never throws for it', async () => {
  for (const secret of ['', '   ', undefined, null, 42, {}, []]) assert.strictEqual(await WB.signature(secret, 'body'), null, String(secret));
  for (const body of [undefined, null, 42, new FormData()]) assert.strictEqual(await WB.signature('SYNTHETIC_SECRET', body), null, String(body));
});

test('signature() keys with the trimmed secret and signs the UTF-8 bytes the browser sends, as a server computes it', async () => {
  const cases = [
    ['  SYNTHETIC_SECRET  ', '{"a":1}'],
    ['k'.repeat(300), 'a key longer than the hash block'],
    ['SYNTHETIC_SECRET', 'Ünïcödé · 検出 · 🤖 · عربى'],
    ['SYNTHETIC_SECRET', 'a\uD800b'], // a lone surrogate is sent as EF BF BD by fetch and by Node alike
    ['SYNTHETIC_SECRET', '']
  ];
  for (const [secret, body] of cases) {
    assert.strictEqual(await WB.signature(secret, body), nodeHmac(secret.trim(), Buffer.from(body, 'utf8')), JSON.stringify([secret.slice(0, 20), body]));
  }
  // A secret stored by hand with an accent (the field refuses one) still signs with its UTF-8 bytes
  assert.strictEqual(await WB.signature('clé', 'x'), nodeHmac(Buffer.from('clé', 'utf8'), 'x'));
});

test('a secret is valid up to 512 printable ASCII characters once trimmed; empty means unsigned', () => {
  for (const ok of ['', 'SYNTHETIC_SECRET', 'with inner spaces', `  ${'a'.repeat(512)}  `, '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~']) assert.ok(WB.isValidSecret(ok), ok.slice(0, 20));
  for (const bad of ['a'.repeat(513), 'clé', 'a​b', 'a\tb', 'a\nb', '🤖']) assert.ok(!WB.isValidSecret(bad), JSON.stringify(bad.slice(0, 20)));
  assert.strictEqual(WB.cleanSecret('  x  '), 'x');
  for (const notText of [undefined, null, 42, {}]) assert.strictEqual(WB.cleanSecret(notText), '');
  assert.strictEqual(WB.SECRET_MAX_LENGTH, 512);
});

test('newSecret() is 32 random bytes as 64 lowercase hex characters', () => {
  const a = WB.newSecret();
  const b = WB.newSecret();
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notStrictEqual(a, b);
  const fixed = { getRandomValues: (bytes) => bytes.fill(0xab) };
  assert.strictEqual(WB.newSecret({ crypto: fixed }), 'ab'.repeat(32));
  assert.ok(WB.isValidSecret(a));
});

test('the background sender signs every text body, drops custom headers named like the signature, and leaves GET, HEAD and multipart unsigned', async () => {
  const secret = 'SYNTHETIC_SECRET';
  const forged = [{ name: 'x-scrapfly-webhook-signature', value: 'forged' }, { name: 'X-SCRAPFLY-WEBHOOK-SIGNATURE-LOWERCASE', value: 'forged' }, { name: 'X-Site', value: '<HOSTNAME>' }];
  const types = ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', 'application/xml', 'text/csv', 'application/x-ndjson', 'application/vnd.acme+json'];
  for (const type of types) {
    const calls = [];
    const runtime = loadRuntime({
      enableWebhook: true, webhookUrl: 'https://hooks.example/in', webhookMethod: 'POST', webhookContentType: type,
      webhookPayload: WB.DEFAULT_TEMPLATE, webhookHeaders: forged, webhookSecret: `  ${secret}  `
    }, calls);
    await runtime.sendWebhookIfEnabled({ url: 'https://shop.example/p', title: 'T' }, DETS);
    assert.strictEqual(calls.length, 1, type);
    const { options } = calls[0];
    const headers = new Headers(options.headers); // what fetch sends: names are case-insensitive, duplicates joined
    assert.strictEqual(headers.get('x-site'), 'shop.example', type);
    if (type === 'multipart/form-data') {
      assert.strictEqual(headers.get(WB.SIGNATURE_HEADER), null, type);
      assert.strictEqual(headers.get(WB.SIGNATURE_HEADER_LOWERCASE), null, type);
    } else {
      const expected = nodeHmac(secret, Buffer.from(options.body, 'utf8'));
      assert.strictEqual(headers.get(WB.SIGNATURE_HEADER), expected.toUpperCase(), type);
      assert.strictEqual(headers.get(WB.SIGNATURE_HEADER_LOWERCASE), expected, type);
    }
    assert.ok(!JSON.stringify(options.headers).includes('forged'), `${type}: a custom header cannot pose as the signature`);
  }
  for (const method of ['GET', 'HEAD']) {
    const calls = [];
    const runtime = loadRuntime({ enableWebhook: true, webhookUrl: 'https://hooks.example/in', webhookMethod: method, webhookHeaders: forged, webhookSecret: secret }, calls);
    await runtime.sendWebhookIfEnabled({ url: 'https://shop.example/p' }, DETS);
    const headers = new Headers(calls[0].options.headers);
    assert.strictEqual(calls[0].options.body, undefined, method);
    assert.strictEqual(headers.get(WB.SIGNATURE_HEADER), null, method);
    assert.ok(!JSON.stringify(calls[0].options.headers).includes('forged'), method);
  }
  // Without a secret nothing changes: the custom headers go as written, unsigned
  const calls = [];
  const runtime = loadRuntime({ enableWebhook: true, webhookUrl: 'https://hooks.example/in', webhookMethod: 'POST', webhookHeaders: [{ name: 'X-Other', value: 'v' }] }, calls);
  await runtime.sendWebhookIfEnabled({ url: 'https://shop.example/p' }, DETS);
  assert.strictEqual(new Headers(calls[0].options.headers).get(WB.SIGNATURE_HEADER), null);
  assert.strictEqual(calls[0].options.headers['X-Other'], 'v');
});
