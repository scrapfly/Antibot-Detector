const { test } = require('node:test');
const assert = require('node:assert');
const ShareProviders = require('../sections/detection/share-providers.js');

// Detection → "Upload detections": every destination builds the documented
// request and only hands back a link from where the service promised.
// A fake fetch records the request; nothing leaves the machine.
function fakeFetch({ status = 200, body = '', location = '' } = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => body,
      headers: { get: (name) => (name.toLowerCase() === 'location' ? location : null) } };
  };
  return { fetch, calls };
}
const form = (init) => Object.fromEntries(new URLSearchParams(init.body));
const publicHost = (url) => !/localhost|127\.0\.0\.1|192\.168\./.test(url);
const CONTENT = '{"detections":[]}';

test('dpaste.com stays the default, with its expiry in days', async () => {
  const { fetch, calls } = fakeFetch({ body: '"https://dpaste.com/ABC123"\n' });
  const link = await ShareProviders.upload(CONTENT, {}, { fetch });
  assert.strictEqual(link, 'https://dpaste.com/ABC123');
  assert.strictEqual(calls[0].url, 'https://dpaste.com/api/v2/');
  assert.deepStrictEqual(form(calls[0].init), { content: CONTENT, syntax: 'json', title: 'Scrapfly detections', expiry_days: '30' });
  assert.strictEqual(calls[0].init.credentials, 'omit');
  assert.strictEqual(calls[0].init.redirect, 'error');
  const days = await ShareProviders.upload(CONTENT, { dpasteComDays: 7 }, fakeFetch({ body: 'https://dpaste.com/X' }));
  assert.strictEqual(days, 'https://dpaste.com/X');
});

test('dpaste.com falls back to the Location header', async () => {
  const { fetch } = fakeFetch({ status: 201, body: '', location: 'https://dpaste.com/LOC' });
  assert.strictEqual(await ShareProviders.upload(CONTENT, {}, { fetch }), 'https://dpaste.com/LOC');
});

test('dpaste.org sends its lifetime and asks for a plain URL', async () => {
  const { fetch, calls } = fakeFetch({ body: 'https://dpaste.org/Xy7\n' });
  const link = await ShareProviders.upload(CONTENT, { provider: 'dpaste_org', dpasteOrgExpires: 'onetime' }, { fetch });
  assert.strictEqual(link, 'https://dpaste.org/Xy7');
  assert.strictEqual(calls[0].url, 'https://dpaste.org/api/');
  assert.deepStrictEqual(form(calls[0].init), { content: CONTENT, lexer: 'json', format: 'url', expires: 'onetime' });
  // An unknown lifetime falls back to 30 days
  assert.strictEqual(ShareProviders.normalize({ provider: 'dpaste_org', dpasteOrgExpires: '5' }).dpasteOrgExpires, '2592000');
});

test('paste.rs posts the raw text', async () => {
  const { fetch, calls } = fakeFetch({ status: 201, body: 'https://paste.rs/aBc' });
  assert.strictEqual(await ShareProviders.upload(CONTENT, { provider: 'paste_rs' }, { fetch }), 'https://paste.rs/aBc');
  assert.strictEqual(calls[0].init.body, CONTENT);
  assert.deepStrictEqual(ShareProviders.describe({ provider: 'paste_rs' }).expiry, { kind: 'service' });
});

test('Pastebin: unlisted paste with the key and expiry; its 200 errors are reported', async () => {
  const { fetch, calls } = fakeFetch({ body: 'https://pastebin.com/Qw3rTy' });
  const settings = { provider: 'pastebin', pastebinKey: 'dev-key', pastebinExpire: '1W' };
  assert.strictEqual(await ShareProviders.upload(CONTENT, settings, { fetch }), 'https://pastebin.com/Qw3rTy');
  const f = form(calls[0].init);
  assert.strictEqual(calls[0].url, 'https://pastebin.com/api/api_post.php');
  assert.strictEqual(f.api_dev_key, 'dev-key');
  assert.strictEqual(f.api_option, 'paste');
  assert.strictEqual(f.api_paste_private, '1');
  assert.strictEqual(f.api_paste_expire_date, '1W');
  await assert.rejects(ShareProviders.upload(CONTENT, settings, fakeFetch({ body: 'Bad API request, invalid api_dev_key' })),
    (e) => e.code === 'provider' && /invalid api_dev_key/.test(e.message));
});

test('a service that needs a key is not called without it', async () => {
  for (const provider of ['pastebin', 'github_gist', 'custom']) {
    const { fetch, calls } = fakeFetch();
    await assert.rejects(ShareProviders.upload(CONTENT, { provider }, { fetch }), (e) => e.code === 'missing');
    assert.strictEqual(calls.length, 0);
    assert.ok(ShareProviders.describe({ provider }).missing);
  }
});

test('GitHub Gist: a secret gist, link from html_url', async () => {
  const { fetch, calls } = fakeFetch({ status: 201, body: JSON.stringify({ html_url: 'https://gist.github.com/me/abc' }) });
  const link = await ShareProviders.upload(CONTENT, { provider: 'github_gist', githubToken: 'tok' }, { fetch });
  assert.strictEqual(link, 'https://gist.github.com/me/abc');
  assert.strictEqual(calls[0].url, 'https://api.github.com/gists');
  assert.strictEqual(calls[0].init.headers.Authorization, 'Bearer tok');
  const body = JSON.parse(calls[0].init.body);
  assert.strictEqual(body.public, false);
  assert.strictEqual(body.files['scrapfly-detections.json'].content, CONTENT);
});

test('a link from another host, plain http or a script URL is refused', async () => {
  for (const body of ['https://evil.test/dpaste.com/x', 'http://dpaste.com/x', 'javascript:alert(1)', 'not a url']) {
    await assert.rejects(ShareProviders.upload(CONTENT, {}, fakeFetch({ body })), (e) => e.code === 'bad-link', body);
  }
  await assert.rejects(ShareProviders.upload(CONTENT, {}, fakeFetch({ status: 503, body: 'down' })), (e) => e.code === 'http');
});

test('custom server: form, JSON template and raw bodies, headers, link sources', async () => {
  const base = { provider: 'custom', customUrl: 'https://paste.example.com/api?ttl=<EXPIRY_DAYS>', customExpiryDays: 9 };

  let r = fakeFetch({ body: 'https://paste.example.com/p/1' });
  assert.strictEqual(await ShareProviders.upload(CONTENT, { ...base, customFieldName: 'text', customHeaders: 'Authorization: Bearer abc\nbad line\nX-Team: qa' },
    { fetch: r.fetch, isUrlSafe: publicHost }), 'https://paste.example.com/p/1');
  assert.strictEqual(r.calls[0].url, 'https://paste.example.com/api?ttl=9');
  assert.deepStrictEqual(form(r.calls[0].init), { text: CONTENT, title: 'Scrapfly detections', expiry_days: '9' });
  assert.strictEqual(r.calls[0].init.headers.Authorization, 'Bearer abc');
  assert.strictEqual(r.calls[0].init.headers['X-Team'], 'qa');

  r = fakeFetch({ body: JSON.stringify({ data: { url: 'https://share.example.net/z' } }) });
  const json = { ...base, customMethod: 'put', customBodyFormat: 'json', customLinkFrom: 'json', customLinkJsonPath: 'data.url' };
  assert.strictEqual(await ShareProviders.upload(CONTENT, json, { fetch: r.fetch, isUrlSafe: publicHost }), 'https://share.example.net/z');
  assert.strictEqual(r.calls[0].init.method, 'PUT');
  assert.deepStrictEqual(JSON.parse(r.calls[0].init.body), { content: CONTENT, title: 'Scrapfly detections', expiry_days: 9 });

  r = fakeFetch({ status: 201, location: 'https://paste.example.com/loc' });
  const raw = { ...base, customBodyFormat: 'raw', customLinkFrom: 'location' };
  assert.strictEqual(await ShareProviders.upload(CONTENT, raw, { fetch: r.fetch, isUrlSafe: publicHost }), 'https://paste.example.com/loc');
  assert.strictEqual(r.calls[0].init.body, CONTENT);
});

test('custom server must be HTTPS on a public host, checked before any request', async () => {
  for (const customUrl of ['http://paste.example.com/', 'https://127.0.0.1/api', 'ftp://x.test/']) {
    const { fetch, calls } = fakeFetch();
    await assert.rejects(ShareProviders.upload(CONTENT, { provider: 'custom', customUrl }, { fetch, isUrlSafe: publicHost }),
      (e) => e.code === 'unsafe-url', customUrl);
    assert.strictEqual(calls.length, 0);
  }
  // Without the guard nothing is allowed
  assert.strictEqual(ShareProviders.isCustomUrlAllowed('https://paste.example.com/', null), false);
});

test('settings are clamped and unknown values fall back to defaults', () => {
  const s = ShareProviders.normalize({ provider: 'nope', dpasteComDays: 900, pastebinExpire: '5Y', customMethod: 'delete',
    customBodyFormat: 'xml', customLinkFrom: 'cookie', customExpiryDays: -3 });
  assert.strictEqual(s.provider, 'dpaste_com');
  assert.strictEqual(s.dpasteComDays, 365);
  assert.strictEqual(s.pastebinExpire, '1M');
  assert.strictEqual(s.customMethod, 'POST');
  assert.strictEqual(s.customBodyFormat, 'form');
  assert.strictEqual(s.customLinkFrom, 'body');
  assert.strictEqual(s.customExpiryDays, 1);
});

test('the defaults file and the module agree', () => {
  const defaults = require('../sections/settings/default-settings.json').settings.share;
  assert.deepStrictEqual(defaults, { ...ShareProviders.DEFAULTS });
});

test('settings exports and debug logs leave out the key, token and custom headers', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const path = require('node:path');
  const context = vm.createContext({ SettingsUI: {}, ShareProviders });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../sections/settings/settings-ui-share.js'), 'utf8'), context);
  const settings = { debugMode: true, share: { provider: 'pastebin', pastebinKey: 'k', githubToken: 't', customHeaders: 'Authorization: Bearer s', customUrl: 'https://x.test/' } };
  const out = context.SettingsUI.withoutShareSecrets(settings);
  assert.deepStrictEqual(Object.keys(out.share).sort(), ['customUrl', 'provider']);
  assert.strictEqual(settings.share.pastebinKey, 'k', 'the stored settings are not modified');
  assert.strictEqual(context.SettingsUI.withoutShareSecrets(null), null);
});

test('GitHub: a refused token and a token without the Gists permission are told apart', async () => {
  const settings = { provider: 'github_gist', githubToken: 'tok' };
  await assert.rejects(ShareProviders.upload(CONTENT, settings, fakeFetch({ status: 401, body: '{"message":"Bad credentials"}' })), (e) => e.code === 'auth');
  await assert.rejects(ShareProviders.upload(CONTENT, settings, fakeFetch({ status: 403, body: '{"message":"Resource not accessible by personal access token"}' })), (e) => e.code === 'permission');
  await assert.rejects(ShareProviders.upload(CONTENT, settings, fakeFetch({ status: 404 })), (e) => e.code === 'permission');
  await assert.rejects(ShareProviders.upload(CONTENT, settings, fakeFetch({ status: 500 })), (e) => e.code === 'http');
});
