'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const vendors = {
  awswaf: 'AwsWafAdvanced',
  cloudflare: 'CloudflareAdvanced',
  datadome: 'DataDomeAdvanced',
  funcaptcha: 'FunCaptchaAdvanced',
  hcaptcha: 'HCaptchaAdvanced',
  turnstile: 'TurnstileAdvanced'
};
const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
function fixture(vendor, options = {}) {
  const timers = [], calls = [], errors = [];
  let finishReload, rejectReload;
  const reloadPromise = new Promise((resolve, reject) => {
    finishReload = resolve;
    rejectReload = reject;
  });
  class Module {}
  const txt = (key, fallback, ...args) => fallback.replace(/\{(\d+)\}/g, (_, index) => args[index]);
  const context = {
    [vendors[vendor]]: Module,
    hcaptchaText: txt,
    Logger: { network() {}, error() {} },
    NotificationHelper: { info() {}, error(message) { errors.push(message); } },
    AdvancedUtils: {
      async sendMessage(message) {
        calls.push(['message', message]);
        return { status: options.status || 'started' };
      }
    },
    chrome: {
      runtime: { onMessage: { addListener() {}, removeListener() {} } },
      cookies: {
        async getAll(query) {
          calls.push(['cookies', query]);
          return [{ name: query.name }];
        },
        async remove(query) { calls.push(['remove', query]); }
      },
      tabs: {
        reload(id) {
          calls.push(['reload', id]);
          return reloadPromise;
        }
      }
    },
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; }
  };
  const file = path.join(__dirname, '..', 'sections/advanced/modules', vendor, `${vendor}-advanced-actions.js`);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  const instance = new Module();
  instance.tabInfo = { id: 17, url: 'https://example.test/' };
  instance._txt = txt;
  return { instance, timers, calls, errors, finishReload, rejectReload };
}

for (const vendor of Object.keys(vendors)) {
  test(`${vendor}: analysis promise covers the 500ms delay and pending reload`, async () => {
    const f = fixture(vendor);
    let settled = false;
    const action = f.instance.analyzeScripts().then(() => { settled = true; });
    await flush();
    assert.equal(settled, false);
    assert.equal(f.timers.length, 1);
    assert.equal(f.timers[0].delay, 500);
    assert.equal(f.calls.some(([kind]) => kind === 'reload'), false);
    assert.equal(f.calls.some(([kind]) => kind === 'remove'), false);
    f.timers.shift().callback();
    await flush();
    assert.equal(settled, false, 'reload promise must remain part of the action');
    assert.equal(f.calls.filter(([kind]) => kind === 'reload').length, 1);
    const resetName = { awswaf: 'aws-waf-token', turnstile: 'cf_clearance' }[vendor];
    const removals = f.calls.filter(([kind]) => kind === 'remove');
    assert.equal(removals.length, resetName ? 1 : 0);
    if (resetName) {
      assert.equal(removals[0][1].name, resetName);
      assert.ok(f.calls.findIndex(([kind]) => kind === 'remove') < f.calls.findIndex(([kind]) => kind === 'reload'));
    }
    const messages = f.calls.filter(([kind]) => kind === 'message').map(([, message]) => message.type);
    assert.equal(messages[0], `${vendor.toUpperCase()}_START_ANALYSIS`);
    assert.equal(messages[1], `${vendor.toUpperCase()}_SHOW_ANALYZING_NOTIFICATION`);
    f.finishReload();
    await action;
    assert.equal(settled, true);
    assert.deepEqual(f.errors, []);
  });

  test(`${vendor}: rejected delayed reload is contained and reported by the action`, async () => {
    const f = fixture(vendor);
    const action = f.instance.analyzeScripts();
    await flush();
    f.timers.shift().callback();
    await flush();
    f.rejectReload(new Error('reload denied'));
    await assert.doesNotReject(action);
    assert.equal(f.errors.length, 1);
    assert.match(f.errors[0], /reload denied/);
    // A detached rejected timer callback would also fail node:test as an unhandled rejection.
    await new Promise(resolve => setImmediate(resolve));
  });

  test(`${vendor}: unsuccessful start does not schedule a reload or reset cookies`, async () => {
    const f = fixture(vendor, { status: 'error' });
    await f.instance.analyzeScripts();
    assert.equal(f.timers.length, 0);
    assert.equal(f.calls.some(([kind]) => kind === 'reload' || kind === 'remove'), false);
    assert.equal(f.calls.filter(([kind]) => kind === 'message').length, 1);
  });
}

for (const vendor of ['cloudflare', 'hcaptcha']) {
  test(`${vendor}: existing version reload is awaited and its failure is contained`, async () => {
    const f = fixture(vendor);
    let settled = false;
    const action = f.instance.checkVersion().then(() => { settled = true; });
    await flush();
    assert.equal(settled, false);
    assert.equal(f.calls.filter(([kind]) => kind === 'reload').length, 1);
    assert.equal(f.timers.length, 0, 'version check has no delayed reload timer');
    f.rejectReload(new Error('version reload denied'));
    await assert.doesNotReject(action);
    assert.match(f.errors[0], /version reload denied/);
  });
}
