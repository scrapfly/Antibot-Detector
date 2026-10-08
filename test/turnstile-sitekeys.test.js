const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const TurnstileSiteKeys = require('../sections/advanced/modules/cloudflare/turnstile-sitekeys.js');

// Advanced → Turnstile / Cloudflare "Extract Site Key": the probe runs in each
// frame of the page; here it runs against a fake document.
function runProbe({ widgets = [], resources = [], inline = [], url = 'https://demo.test/login' }) {
  const el = (attrs, classes = []) => ({ classList: { contains: c => classes.includes(c) }, getAttribute: name => attrs[name] ?? null });
  const document = {
    querySelectorAll: (selector) => selector === '[data-sitekey]'
      ? widgets.map(w => el(w.attrs, w.classes))
      : selector === 'script:not([src])' ? inline.map(textContent => ({ textContent })) : []
  };
  const context = vm.createContext({ document, location: { href: url }, URL,
    performance: { getEntriesByType: type => type === 'resource' ? resources.map(name => ({ name })) : [] } });
  return vm.runInContext(`(${TurnstileSiteKeys.probe.toString()})()`, context);
}

test('the widget key with its action and cData (demo.turnstile.workers.dev shape)', () => {
  const result = runProbe({
    widgets: [{ classes: ['cf-turnstile'], attrs: { 'data-sitekey': '1x00000000000000000000AA', 'data-action': 'login', 'data-cdata': 'abc' } }],
    resources: ['https://challenges.cloudflare.com/turnstile/v0/api.js',
      'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/turnstile/f/av0/rch/f22ts/1x00000000000000000000AA/light/fbE/new/normal?lang=auto']
  });
  const [key] = TurnstileSiteKeys.merge([{ result }]);
  assert.deepStrictEqual({ ...key, sources: [...key.sources] }, { sitekey: '1x00000000000000000000AA', sources: ['widget', 'frame'], action: 'login', cdata: 'abc',
    theme: '', size: '', pageUrl: 'https://demo.test/login' });
});

test('explicit rendering: the key comes from the challenge frame URL or an inline render call', () => {
  const fromFrame = runProbe({ resources: ['https://challenges.cloudflare.com/cdn-cgi/challenge-platform/turnstile/if/ov2/av0/rcv/x1y2/0x4AAAAAAAB1cDeFgHiJkLmN/auto/normal'] });
  assert.deepStrictEqual(TurnstileSiteKeys.merge([{ result: fromFrame }]).map(k => k.sitekey), ['0x4AAAAAAAB1cDeFgHiJkLmN']);
  const fromScript = runProbe({ inline: ["turnstile.render('#box', { sitekey: '0x4AAAAAAAZZZZZZZZZZZZZZ', callback: done });"] });
  assert.deepStrictEqual(TurnstileSiteKeys.merge([{ result: fromScript }]).map(k => [k.sitekey, k.sources.join()]), [['0x4AAAAAAAZZZZZZZZZZZZZZ', 'script']]);
});

test('reCAPTCHA and hCaptcha keys on the same page are not reported', () => {
  const result = runProbe({ widgets: [
    { classes: ['g-recaptcha'], attrs: { 'data-sitekey': '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI' } },
    { classes: ['h-captcha'], attrs: { 'data-sitekey': '10000000-ffff-ffff-ffff-000000000001' } }
  ] });
  assert.deepStrictEqual(TurnstileSiteKeys.merge([{ result }]), []);
});

test('keys from several frames are merged once, frames that failed are skipped', () => {
  const top = runProbe({ widgets: [{ classes: ['cf-turnstile'], attrs: { 'data-sitekey': '0x4AAAAAAAB1cDeFgHiJkLmN' } }] });
  const child = runProbe({ resources: ['https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/q/0x4AAAAAAAB1cDeFgHiJkLmN/dark/normal'] });
  const keys = TurnstileSiteKeys.merge([{ result: top }, null, { result: child }, { error: 'no access' }]);
  assert.strictEqual(keys.length, 1);
  assert.deepStrictEqual([...keys[0].sources], ['widget', 'frame']);
});
