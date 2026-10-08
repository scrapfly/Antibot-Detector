const { test } = require('node:test');
const assert = require('node:assert/strict');
const ScrapflyExport = require('../sections/detection/scrapfly-export.js');

// Detection / Advanced → "Scrape with Scrapfly": the page as ready-to-run
// code with the Unblocker on. The shapes follow the published SDKs (PyPI and
// npm scrapfly-sdk 0.12.0, go-scrapfly v1.6.0, crate scrapfly-sdk 0.5.1,
// scrapfly-cli v0.4.0).

const URL_PLAIN = 'https://shop.example/p?id=1&ref=a';
const URL_NASTY = "https://shop.example/it's?q=\"x\"&v=$HOME\\path";

// Read the literal each language passes as the URL back into a string
const readBack = {
  python: (code) => JSON.parse(code.match(/^ {4}url=(".*"),$/m)[1]),
  node: (code) => JSON.parse(code.match(/^ {2}url: (".*"),$/m)[1]),
  go: (code) => JSON.parse(code.match(/^\t\tURL: +(".*"),$/m)[1]),
  rust: (code) => code.match(/ScrapeConfig::builder\("((?:[^"\\]|\\.)*)"\)/)[1]
    .replace(/\\u\{([0-9a-f]+)\}/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\(["\\])/g, '$1'),
  cli: (code) => unquoteShell(code.match(/^scrapfly scrape ('(?:[^']|'\\'')*') --unblocker$/m)[1]),
  cliMulti: (code) => unquoteShell(code.match(/^scrapfly scrape ('(?:[^']|'\\'')*') \\$/m)[1]),
  curl: (code) => unquoteShell(code.match(/--data-urlencode ('url=(?:[^']|'\\'')*') \\$/m)[1]).slice('url='.length)
};
function unquoteShell(quoted) {
  assert.ok(quoted.startsWith("'") && quoted.endsWith("'"));
  return quoted.slice(1, -1).replace(/'\\''/g, "'");
}

test('every language turns the Unblocker on and reads the key from SCRAPFLY_API_KEY', () => {
  const unblocker = {
    python: 'unblocker=True,', node: 'unblocker: true,', curl: '-d unblocker=true', cli: '--unblocker',
    go: 'Unblocker: scrapfly.BoolPtr(true),', rust: '.unblocker(true)'
  };
  assert.deepEqual(ScrapflyExport.LANGUAGES.map(l => l.id), ['python', 'node', 'curl', 'cli', 'go', 'rust']);
  for (const { id } of ScrapflyExport.LANGUAGES) {
    const code = ScrapflyExport.snippet(id, URL_PLAIN);
    assert.ok(code.includes(unblocker[id]), id);
    assert.ok(!/\basp\b/i.test(code), `${id}: the old asp alias is never sent as well`);
    assert.ok(code.includes('SCRAPFLY_API_KEY'), id);
    assert.ok(!/scp-live-/.test(code), `${id}: no key in the code`);
    assert.equal(readBack[id](code), URL_PLAIN, id);
  }
  assert.equal(ScrapflyExport.snippet('cobol', URL_PLAIN), '');
});

test('the SDK calls match the published packages', () => {
  const python = ScrapflyExport.snippet('python', URL_PLAIN);
  assert.match(python, /^# pip install scrapfly-sdk$/m);
  assert.match(python, /^from scrapfly import ScrapflyClient, ScrapeConfig$/m);
  assert.match(python, /^client = ScrapflyClient\(key=os\.environ\["SCRAPFLY_API_KEY"\]\)$/m);
  assert.match(python, /^print\(result\.content\)$/m);
  const node = ScrapflyExport.snippet('node', URL_PLAIN);
  assert.match(node, /^import \{ ScrapflyClient, ScrapeConfig \} from 'scrapfly-sdk';$/m);
  assert.match(node, /^console\.log\(result\.result\.content\);$/m);
  const go = ScrapflyExport.snippet('go', URL_PLAIN);
  assert.match(go, /^\t"github\.com\/scrapfly\/go-scrapfly"$/m);
  assert.match(go, /scrapfly\.New\(os\.Getenv\("SCRAPFLY_API_KEY"\)\)/);
  assert.match(go, /fmt\.Println\(result\.Result\.Content\)/);
  const rust = ScrapflyExport.snippet('rust', URL_PLAIN);
  assert.match(rust, /^use scrapfly_sdk::\{Client, ScrapeConfig\};$/m);
  assert.match(rust, /\.api_key\(std::env::var\("SCRAPFLY_API_KEY"\)\?\)/);
  assert.match(rust, /println!\("\{\}", result\.result\.content\);/);
  const curl = ScrapflyExport.snippet('curl', URL_PLAIN);
  assert.match(curl, /^curl -G https:\/\/api\.scrapfly\.io\/scrape \\$/m);
  assert.match(curl, /--data-urlencode "key=\$SCRAPFLY_API_KEY" \\/);
});

test('quotes, dollars and backslashes in the address cannot break out of the string', () => {
  for (const { id } of ScrapflyExport.LANGUAGES) {
    assert.equal(readBack[id](ScrapflyExport.snippet(id, URL_NASTY)), URL_NASTY, id);
  }
  // A control character becomes an escape, never a raw line break in the code
  const withNewline = 'https://shop.example/a\nb';
  for (const id of ['python', 'node', 'go', 'rust']) {
    const code = ScrapflyExport.snippet(id, withNewline);
    assert.equal(readBack[id](code), withNewline, id);
  }
});

test('only web pages can be exported', () => {
  assert.equal(ScrapflyExport.targetUrl('https://Shop.Example/a b'), 'https://shop.example/a%20b');
  assert.equal(ScrapflyExport.targetUrl('http://shop.example'), 'http://shop.example/');
  for (const bad of ['chrome://extensions', 'chrome-extension://abc/popup.html', 'file:///etc/hosts', 'javascript:alert(1)', 'about:blank', '', null, 'not a url']) {
    assert.equal(ScrapflyExport.targetUrl(bad), '', String(bad));
  }
});

test('protections: anti-bot and CAPTCHA only, strongest first, once each', () => {
  const detections = [
    { name: 'Canvas Fingerprint', category: 'Fingerprint', confidence: 99 },
    { detector: { name: 'Google reCAPTCHA', icon: 'recaptcha_official.png' }, category: 'CAPTCHA', confidence: 70 },
    { detector: { name: 'Cloudflare Bot Management', icon: 'cloudflare_official.png' }, category: 'Anti-Bot', confidence: 95 },
    { name: 'Google reCAPTCHA', category: 'CAPTCHA', confidence: 40 },
    { name: 'Meetrics Check', category: 'ANTIBOT', confidence: 10 }
  ];
  assert.deepEqual(ScrapflyExport.protectionNames(detections), ['Cloudflare Bot Management', 'Google reCAPTCHA', 'Meetrics Check']);
  assert.equal(ScrapflyExport.hasCaptcha(detections), true);
  assert.equal(ScrapflyExport.hasCaptcha([{ name: 'DataDome', category: 'Anti-Bot' }]), false);
  assert.deepEqual(ScrapflyExport.protectionNames(null), []);
});

test('the detected names go in one comment line, cut after four', () => {
  const names = ['A', 'B', 'C', 'D', 'E', 'F'];
  assert.equal(ScrapflyExport.detectedComment(names, '#'), '# Detected: A, B, C, D and 2 more');
  assert.equal(ScrapflyExport.detectedComment([], '#'), '');
  assert.equal(ScrapflyExport.detectedComment(['Evil\nimport os'], '#'), '# Detected: Evil import os');
  const code = ScrapflyExport.snippet('python', URL_PLAIN, ['Cloudflare Bot Management']);
  assert.match(code, /^# Detected: Cloudflare Bot Management$/m);
  assert.ok(!ScrapflyExport.snippet('curl', URL_PLAIN).includes('Detected'), 'no empty comment');
});

test('logos: an uploaded image, the bundled icon, or the Scrapfly logo', () => {
  global.chrome = { runtime: { getURL: (path) => `chrome-extension://id/${path}` } };
  try {
    assert.equal(ScrapflyExport.iconUrl({ detector: { icon: 'cloudflare_official.png' } }), 'chrome-extension://id/detectors/icons/cloudflare_official.png');
    assert.equal(ScrapflyExport.iconUrl({ detector: { customIcon: 'data:image/png;base64,AAAA', icon: 'x.png' } }), 'data:image/png;base64,AAAA');
    assert.equal(ScrapflyExport.iconUrl({ detector: { customIcon: 'javascript:alert(1)', icon: 'custom.png' } }), 'chrome-extension://id/icons/icon48.png');
    assert.equal(ScrapflyExport.iconUrl({ detector: { icon: 'default' } }), 'chrome-extension://id/icons/icon48.png');
    assert.equal(ScrapflyExport.iconUrl({}), 'chrome-extension://id/icons/icon48.png');
    assert.deepEqual(ScrapflyExport.protections([{ detector: { name: 'DataDome', icon: 'datadome_official.png' }, category: 'Anti-Bot' }]),
      [{ name: 'DataDome', iconUrl: 'chrome-extension://id/detectors/icons/datadome_official.png' }]);
  } finally {
    delete global.chrome;
  }
});

// Options: each one rewrites the code with the SDK's own name for it (checked
// against the published packages on 2026-10-08); defaults add nothing.
const ALL = { format: 'markdown', renderJs: true, proxyPool: 'public_residential_pool', country: 'gb' };

test('options use each SDK\'s own names, and defaults add nothing', () => {
  const expected = {
    python: ['render_js=True,', 'proxy_pool="public_residential_pool",', 'country="gb",', 'format="markdown",'],
    node: ['render_js: true,', 'proxy_pool: "public_residential_pool",', 'country: "gb",', 'format: "markdown",'],
    curl: ['-d render_js=true', '-d proxy_pool=public_residential_pool', '-d country=gb', '-d format=markdown'],
    cli: ['--render-js', '--proxy-pool public_residential_pool', '--country gb', '--format markdown'],
    go: ['RenderJS:  true,', 'ProxyPool: scrapfly.PublicResidentialPool,', 'Country:   "gb",', 'Format:    scrapfly.FormatMarkdown,'],
    rust: ['.render_js(true)', '.proxy_pool(ProxyPool::PublicResidentialPool)', '.country("gb")', '.format(Format::Markdown)']
  };
  for (const { id } of ScrapflyExport.LANGUAGES) {
    const code = ScrapflyExport.snippet(id, URL_PLAIN, [], ALL);
    for (const part of expected[id]) assert.ok(code.includes(part), `${id}: ${part}`);
    assert.equal(readBack[id === 'cli' ? 'cliMulti' : id](code), URL_PLAIN, id);
    const plain = ScrapflyExport.snippet(id, URL_PLAIN, [], ScrapflyExport.DEFAULT_OPTIONS);
    assert.equal(plain, ScrapflyExport.snippet(id, URL_PLAIN), `${id}: defaults change nothing`);
    for (const part of expected[id]) assert.ok(!plain.includes(part), `${id}: no ${part} by default`);
  }
  assert.match(ScrapflyExport.snippet('rust', URL_PLAIN, [], ALL), /^use scrapfly_sdk::\{Client, Format, ProxyPool, ScrapeConfig\};$/m);
  assert.match(ScrapflyExport.snippet('go', URL_PLAIN, [], { format: 'text' }), /Format: +scrapfly\.FormatText,/);
  assert.match(ScrapflyExport.snippet('rust', URL_PLAIN, [], { format: 'text' }), /\.format\(Format::Text\)/);
});

test('shell code keeps every line continued and none dangling', () => {
  for (const id of ['curl', 'cli']) {
    const lines = ScrapflyExport.snippet(id, URL_PLAIN, [], ALL).split('\n').filter(l => !l.startsWith('#'));
    lines.slice(0, -1).forEach(line => assert.ok(line.endsWith(' \\'), `${id}: ${line}`));
    assert.ok(!lines[lines.length - 1].endsWith('\\'), `${id}: last line`);
  }
});

test('unknown option values fall back to the defaults', () => {
  assert.deepEqual(ScrapflyExport.normalizeOptions(null), { ...ScrapflyExport.DEFAULT_OPTIONS });
  assert.deepEqual(ScrapflyExport.normalizeOptions({ format: 'pdf', renderJs: 'yes', proxyPool: 'tor', country: 'zz"; rm' }),
    { ...ScrapflyExport.DEFAULT_OPTIONS });
  const code = ScrapflyExport.snippet('curl', URL_PLAIN, [], { country: "us' && rm -rf ~" });
  assert.ok(!code.includes('country'), 'a value off the list never reaches the code');
});

test('highlighting only wraps the code in spans: the text stays the same', () => {
  const unescape = (html) => html.replace(/<span class="sfx-[a-z]+">|<\/span>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  for (const { id } of ScrapflyExport.LANGUAGES) {
    const code = ScrapflyExport.snippet(id, 'https://x.example/<img src=x onerror=alert(1)>', ['<b>Evil</b>'], ALL);
    const html = ScrapflyExport.highlight(code, id);
    assert.equal(unescape(html), code, id);
    assert.ok(!/<(?!\/?span\b)/.test(html), `${id}: no tag but span`);
  }
  assert.match(ScrapflyExport.highlight('import os  # note', 'python'), /<span class="sfx-keyword">import<\/span> os  <span class="sfx-comment"># note<\/span>/);
  assert.match(ScrapflyExport.highlight('const a = "x"; // c', 'node'), /<span class="sfx-string">&quot;x&quot;<\/span>; <span class="sfx-comment">\/\/ c<\/span>/);
  assert.match(ScrapflyExport.highlight('#[tokio::main]', 'rust'), /^#\[tokio::main\]$/, 'Rust attributes are not comments');
});

test('the key command matches the shell of the computer', () => {
  assert.equal(ScrapflyExport.keyCommand('Windows'), '$env:SCRAPFLY_API_KEY="YOUR_API_KEY"');
  assert.equal(ScrapflyExport.keyCommand('Win32'), '$env:SCRAPFLY_API_KEY="YOUR_API_KEY"');
  assert.equal(ScrapflyExport.keyCommand('macOS'), 'export SCRAPFLY_API_KEY="YOUR_API_KEY"');
  assert.equal(ScrapflyExport.keyCommand(''), 'export SCRAPFLY_API_KEY="YOUR_API_KEY"');
  for (const { id, file, run } of ScrapflyExport.LANGUAGES) {
    assert.ok(file, id);
    assert.equal(typeof run, 'string', id);
  }
});
