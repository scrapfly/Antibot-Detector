const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The webhook address (and a custom share address) must be HTTPS to a public host: never the person's own machine or network.

const source = fs.readFileSync(path.join(__dirname, '..', 'modules/settings/settings-runtime.js'), 'utf8');
const context = vm.createContext({ console, self: {}, Promise, URL, Logger: new Proxy({}, { get: () => () => {} }) });
vm.runInContext(source, context, { filename: 'settings-runtime.js' });
const safe = (url) => vm.runInContext('SettingsRuntime', context)._isWebhookUrlSafe(url);

test('public HTTPS addresses are accepted', () => {
  for (const url of ['https://hooks.slack.com/services/T0/B0/x', 'https://example.com:8443/in?x=1', 'https://203.0.113.7/hook', 'https://[2001:db8::1]/hook']) assert.equal(safe(url), true, url);
});

test('plain HTTP, credentials in the address and local or private hosts are refused', () => {
  for (const url of ['http://example.com/', 'https://user:pw@example.com/', 'https://localhost/', 'https://app.localhost/', 'https://printer.local/',
    'https://metadata.google.internal/', 'https://127.0.0.1/', 'https://10.1.2.3/', 'https://192.168.0.5/', 'https://169.254.169.254/', 'https://[::1]/', 'https://intranet/']) {
    assert.equal(safe(url), false, url);
  }
});

test('a final dot names the same host: "localhost." and "10.0.0.1." are as local as without it', () => {
  for (const url of ['https://localhost./x', 'https://foo.localhost./x', 'https://printer.local./x', 'https://metadata.google.internal./x', 'https://127.0.0.1./x', 'https://10.0.0.1./x', 'https://192.168.1.1../x']) {
    assert.equal(safe(url), false, url);
  }
  assert.equal(safe('https://example.com./hook'), true, 'a public host with a final dot is still public');
});

test('names that only exist on a home or office network are refused', () => {
  for (const url of ['https://router.lan/', 'https://nas.home.arpa/', 'https://home.arpa/', 'https://files.corp/', 'https://pc.localdomain/', 'https://wiki.intranet/']) assert.equal(safe(url), false, url);
  assert.equal(safe('https://lan.example.com/'), true, '"lan" inside a public name is fine');
});
