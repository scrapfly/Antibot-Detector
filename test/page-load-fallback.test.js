const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The scan and the MAIN-world page-ready signal wait for the load event. Some
// pages never fire it: a request that never finishes, or a script that blocks
// the parser for 45 s or more (samr.gov.cn, measured 2026-10-08). content.js
// falls back to timers; the helper is run here as written in content.js.

const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');

function page(readyState) {
  const helper = source.match(/function onPageLoaded\(callback\) \{[\s\S]*?\n\}/);
  const delays = source.match(/const PAGE_LOAD_FALLBACK_MS = \d+;\s*const PAGE_PARSE_FALLBACK_MS = \d+;/);
  assert.ok(helper && delays, 'onPageLoaded and its delays not found in content.js');
  const listeners = { window: new Map(), document: new Map() };
  const timers = [];
  const target = (name) => ({
    addEventListener: (type, fn) => listeners[name].set(type, fn),
    removeEventListener: (type, fn) => { if (listeners[name].get(type) === fn) listeners[name].delete(type); }
  });
  const document = { readyState, ...target('document') };
  const context = vm.createContext({
    document,
    window: target('window'),
    setTimeout: (fn, ms) => timers.push({ fn, ms, cleared: false }),
    clearTimeout: (id) => { if (id) timers[id - 1].cleared = true; }
  });
  vm.runInContext(`${delays[0]}\n${helper[0]}`, context);
  const calls = [];
  context.onPageLoaded(() => calls.push(document.readyState));
  return {
    calls, listeners, timers, document,
    fire(name, type) {
      const fn = listeners[name].get(type);
      listeners[name].delete(type);
      if (fn) fn();
    },
    // Fires the live timers set for this delay, in order
    elapse(ms) { timers.filter(t => t.ms === ms && !t.cleared).forEach(t => { t.cleared = true; t.fn(); }); },
    pending: () => timers.filter(t => !t.cleared).map(t => t.ms)
  };
}

test('an already loaded page runs the callback at once, with no listener or timer', () => {
  const p = page('complete');
  assert.deepEqual(p.calls, ['complete']);
  assert.equal(p.listeners.window.size + p.listeners.document.size + p.timers.length, 0);
});

test('a page that loads normally runs it on load, once, and cancels both fallbacks', () => {
  const p = page('loading');
  assert.deepEqual(p.pending(), [20000], 'only the parser fallback before the DOM is ready');
  p.document.readyState = 'interactive';
  p.fire('document', 'DOMContentLoaded');
  assert.deepEqual(p.pending(), [20000, 10000]);
  p.document.readyState = 'complete';
  p.fire('window', 'load');
  assert.deepEqual(p.calls, ['complete']);
  assert.deepEqual(p.pending(), []);
  p.timers.forEach(t => t.fn());
  assert.equal(p.calls.length, 1, 'a timer that slipped through does nothing');
});

test('load never fires after DOMContentLoaded: it runs 10 s later, and not again on a late load', () => {
  const p = page('loading');
  p.document.readyState = 'interactive';
  p.fire('document', 'DOMContentLoaded');
  p.elapse(20000);
  assert.deepEqual(p.calls, [], 'the parser fallback stands down once the DOM is ready');
  p.elapse(10000);
  assert.deepEqual(p.calls, ['interactive']);
  assert.ok(!p.listeners.window.has('load'), 'the load listener is removed');
});

test('a parser blocked for good: it runs 20 s in with what has loaded, and not again later', () => {
  const p = page('loading');
  p.elapse(20000);
  assert.deepEqual(p.calls, ['loading']);
  assert.ok(!p.listeners.document.has('DOMContentLoaded') && !p.listeners.window.has('load'));
  p.document.readyState = 'interactive';
  p.fire('document', 'DOMContentLoaded');
  p.fire('window', 'load');
  assert.deepEqual(p.pending(), []);
  assert.equal(p.calls.length, 1);
});

test('when the DOM is already ready, only the 10 s fallback is armed', () => {
  const p = page('interactive');
  assert.ok(!p.listeners.document.has('DOMContentLoaded'));
  assert.deepEqual(p.pending(), [10000]);
  p.elapse(10000);
  assert.deepEqual(p.calls, ['interactive']);
});

test('both the scan and the MAIN-world page-ready signal use the fallback', () => {
  assert.ok(!/addEventListener\('load'/.test(source.replace(/function onPageLoaded[\s\S]*?\n\}/, '')),
    'no other load listener in content.js');
  assert.match(source, /onPageLoaded\(\(\) => setTimeout\(notifyPageLoad, 200\)\)/);
  assert.match(source, /onPageLoaded\(triggerHookStart\)/);
});
