'use strict';
// Detection tab → Copy → curl command / Python (requests): the page asked for
// again with this browser's headers and cookies. The snippets are run (bash,
// and python3 with a stand-in for requests) so the quoting is proven, not
// only read.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const source = ['scrapfly/options', 'scrapfly/parameters', 'scrapfly/codegen', 'replay-kit']
  .map(name => fs.readFileSync(path.join(root, 'modules/integrations', `${name}.js`), 'utf8')).join('\n');
const ReplayKit = new Function(source + '\nreturn globalThis.ReplayKit;')();

const nav = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  languages: ['es-ES', 'es', 'en-US', 'en'],
  userAgentData: { brands: [{ brand: 'Google Chrome', version: '141' }, { brand: 'Not?A_Brand', version: '8' }, { brand: 'Chromium', version: '141' }], mobile: false, platform: 'Windows' }
};
const detections = [
  { detector: { name: 'Cloudflare' }, category: 'Anti-Bot', confidence: 95,
    matches: [{ type: 'cookie', name: '__cf_bm', value: '__cf_bm=x' }, { type: 'cookie', value: 'cf_clearance=y' }, { type: 'header', value: 'cf-ray: z' }] },
  { detector: { name: 'DataDome' }, category: 'Anti-Bot', confidence: 80, matches: [{ type: 'cookie', name: 'datadome', value: 'datadome=q' }] }
];
const cookies = [
  { name: '__cf_bm', value: "it's;\"quoted\" $(rm -rf ~) `x`" },
  { name: 'cf_clearance', value: 'abc.def-123' },
  { name: 'lang', value: 'ñandú 日本 🍪' },
  { name: 'lang', value: 'shadowed-by-the-more-specific-path' },
  { name: 'session', value: 'a=b; c=d' }
];
const input = { url: 'https://shop.example/cart?q=a b&x=\'1\'#frag', cookies, headers: ReplayKit.browserHeaders(nav), detections };

test('the header set is the browser\'s own: client hints, User-Agent and Accept-Language as Chrome writes them', () => {
  assert.deepStrictEqual(ReplayKit.browserHeaders(nav), [
    ['sec-ch-ua', '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"'],
    ['sec-ch-ua-mobile', '?0'],
    ['sec-ch-ua-platform', '"Windows"'],
    ['User-Agent', nav.userAgent],
    ['Accept-Language', 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7']
  ]);
  // A browser without client hints (Firefox) sends none
  assert.deepStrictEqual(ReplayKit.browserHeaders({ userAgent: 'UA', languages: ['fr'] }), [['User-Agent', 'UA'], ['Accept-Language', 'fr']]);
  assert.strictEqual(ReplayKit.acceptLanguage(Array.from({ length: 12 }, (_, i) => `l${i}`)).split(',').pop(), 'l11;q=0.1');
});

test('protection cookies are named from the cookie evidence, by name or by name=value', () => {
  const owners = ReplayKit.protectionCookies(detections);
  assert.deepStrictEqual([...owners.keys()], ['__cf_bm', 'cf_clearance', 'datadome']);
  assert.deepStrictEqual(owners.get('cf_clearance'), ['Cloudflare']);
});

test('curl: comment header, the note, the marked cookies, and nothing but http(s) pages', () => {
  const code = ReplayKit.curl(input);
  const lines = code.split('\n');
  assert.ok(lines[0].startsWith('# Replays https://shop.example/cart?'), 'the fragment is never sent');
  assert.ok(!code.includes('#frag'));
  assert.ok(code.includes('# Detected: Cloudflare, DataDome'));
  assert.ok(code.includes('TLS/HTTP2 fingerprint'));
  assert.ok(code.includes('# Protection cookies: __cf_bm (Cloudflare), cf_clearance (Cloudflare)'), 'only cookies the page has are listed');
  assert.ok(!code.includes('shadowed-by'), 'a name held twice is sent once, the more specific first');
  assert.strictEqual(ReplayKit.curl({ ...input, url: 'chrome://extensions' }), '');
  assert.strictEqual(ReplayKit.python({ ...input, url: '' }), '');
});

test('curl: bash reads back every header and the cookie line exactly, quotes and $() included', { skip: spawnSync('bash', ['-c', 'true']).status !== 0 && 'no bash' }, () => {
  const code = ReplayKit.curl(input);
  const run = spawnSync('bash', ['-c', `curl() { for a in "$@"; do printf '%s\\0' "$a"; done; }\n${code}`], { encoding: 'utf8' });
  assert.strictEqual(run.status, 0, run.stderr);
  const args = run.stdout.split('\0').slice(0, -1);
  assert.strictEqual(args[0], '-g', 'brackets and braces in an address are not curl URL patterns');
  assert.strictEqual(args[1], 'https://shop.example/cart?q=a%20b&x=%271%27');
  const headers = [];
  let cookie = null;
  for (let i = 2; i < args.length; i += 2) {
    if (args[i] === '-H') headers.push(args[i + 1]);
    else if (args[i] === '-b') cookie = args[i + 1];
  }
  assert.deepStrictEqual(headers, ReplayKit.browserHeaders(nav).map(([k, v]) => `${k}: ${v}`));
  assert.strictEqual(cookie, `__cf_bm=${cookies[0].value}; cf_clearance=abc.def-123; lang=ñandú 日本 🍪; session=a=b; c=d`);
});

test('Python: a requests call whose dicts hold the exact values, with the protection named beside its cookie', { skip: spawnSync('python3', ['-c', 'pass']).status !== 0 && 'no python3' }, () => {
  const code = ReplayKit.python(input);
  assert.ok(code.includes('"__cf_bm": ') && /"__cf_bm": .*,  # Cloudflare$/m.test(code));
  assert.ok(/"datadome"/.test(code) === false, 'a protection cookie the page does not hold is not invented');
  const stub = [
    'import sys, types, json',
    'calls = []',
    'class R: status_code = 200; text = ""',
    'm = types.ModuleType("requests")',
    'm.get = lambda url, **kw: calls.append([url, kw]) or R()',
    'sys.modules["requests"] = m',
    'exec(compile(sys.stdin.read(), "replay.py", "exec"), {})',
    'sys.stdout.write("\\n" + json.dumps(calls[0], ensure_ascii=False))'
  ].join('\n');
  const run = spawnSync('python3', ['-I', '-c', stub], { input: code, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  assert.strictEqual(run.status, 0, run.stderr);
  const [url, kw] = JSON.parse(run.stdout.trim().split('\n').pop());
  assert.strictEqual(url, 'https://shop.example/cart?q=a%20b&x=%271%27');
  assert.deepStrictEqual(Object.entries(kw.headers), ReplayKit.browserHeaders(nav));
  assert.deepStrictEqual(kw.cookies, { __cf_bm: cookies[0].value, cf_clearance: 'abc.def-123', lang: 'ñandú 日本 🍪', session: 'a=b; c=d' });
  assert.strictEqual(kw.timeout, 30);
});

test('a name with a line break cannot end a comment early', () => {
  const tricky = [{ detector: { name: 'Evil\nimport os' }, confidence: 90, matches: [{ type: 'cookie', name: 'x\ny', value: 'x\ny=1' }] }];
  for (const code of [ReplayKit.curl({ url: 'https://a.example/', cookies: [{ name: 'x\ny', value: '1' }], detections: tricky }),
    ReplayKit.python({ url: 'https://a.example/', cookies: [{ name: 'x\ny', value: '1' }], detections: tricky })]) {
    // Every line before the command is a comment (inside the quoted -b value a line break is only data)
    const body = code.split('\n');
    const start = body.findIndex(line => /^(curl|import requests)/.test(line));
    assert.ok(start > 0 && body.slice(0, start).every(line => line.startsWith('# ')), code);
    assert.ok(!/^import os/m.test(code));
  }
});
