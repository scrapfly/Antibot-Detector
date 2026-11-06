const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The toasts that answer what the person just did (a copy, a save, a delete, an export, an update check). They have to show
// whatever Settings → Notifications says (that switch is for alerts about detections), every one has to stay for the time
// that was asked for, and the countdown has to wait while the pointer or the keyboard is on the toast.
// NotificationManager runs in a small fake DOM with a clock the test moves by hand.

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'modules/ui/notification-manager.js'), 'utf8');
const FADE = 300;

function makeDom() {
  class El {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.children = [];
      this.parent = null;
      this.attrs = {};
      this.handlers = {};
      this.className = '';
      this.id = '';
      this.textContent = '';
      this.innerHTML = '';
      this.offsetHeight = 0;
      this.style = {};
    }
    appendChild(child) { child.parent = this; this.children.push(child); return child; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); this.parent = null; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
    fire(type) { for (const fn of this.handlers[type] || []) fn({ target: this, relatedTarget: null }); }
    click() { this.fire('click'); }
    contains(node) { for (let n = node; n; n = n.parent) if (n === this) return true; return false; }
    all() { return this.children.flatMap(c => [c, ...c.all()]); }
    matches(selector) {
      const classes = this.className.split(/\s+/);
      if (selector.startsWith('.')) return classes.includes(selector.slice(1));
      if (selector.startsWith('#')) return this.id === selector.slice(1);
      return false;
    }
    querySelectorAll(selector) { return this.all().filter(e => e.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  }
  const html = new El('html');
  const head = html.appendChild(new El('head'));
  const body = html.appendChild(new El('body'));
  const doc = {
    body, head,
    createElement: (tag) => new El(tag),
    querySelector: (s) => html.querySelector(s),
    querySelectorAll: (s) => html.querySelectorAll(s),
    getElementById: (id) => html.querySelector('#' + id),
    contains: (n) => html.contains(n),
    addEventListener() {},
    removeEventListener() {}
  };
  return { doc };
}

/** A clock: timers run in order when the test moves time forward. */
function makeClock() {
  let now = 1000000;
  let next = 0;
  const timers = new Map();
  return {
    now: () => now,
    setTimeout: (fn, ms) => { const id = ++next; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, id }); return id; },
    clearTimeout: (id) => { timers.delete(id); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.values()].filter(t => t.at <= end).sort((a, b) => a.at - b.at || a.id - b.id)[0];
        if (!due) break;
        now = due.at;
        timers.delete(due.id);
        due.fn();
      }
      now = end;
    }
  };
}

/** Notifications can be off in the settings the helper reads: that must not matter to a toast. */
function load({ notificationsEnabled = true, drawingFails = false } = {}) {
  const dom = makeDom();
  const clock = makeClock();
  const logged = [];
  const context = vm.createContext({
    console, Promise, Map, Set, Number, String, Math,
    document: dom.doc,
    Date: { now: clock.now },
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    requestAnimationFrame: (fn) => fn(),
    Constants: { NOTIFICATION_DURATION: 3000, NOTIFICATION_FADE_MS: FADE },
    CloseButton: { create: ({ className }) => { const b = dom.doc.createElement('button'); b.className = `btn-close ${className}`; return b; } },
    I18n: { get: () => '', format: () => '' },
    Logger: { ui() {}, error: (...args) => logged.push(args.join(' ')), warn() {}, debug() {} },
    Utils: { getSettings: async () => ({ notificationsEnabled }) },
    chrome: { runtime: { getURL: (p) => p }, storage: { onChanged: { addListener() {} } } }
  });
  context.window = context;
  vm.runInContext(source, context);
  // From here on nothing can be built (a page that is not ready, a missing piece)
  if (drawingFails) dom.doc.createElement = () => { throw new Error('the page cannot draw'); };
  const { NotificationHelper, NotificationManager: manager } = context;
  // Helper calls may answer a tick later (older code asked the settings first): let that tick pass
  const settle = () => new Promise(resolve => setImmediate(resolve));
  const toastEls = () => dom.doc.querySelectorAll('.notification-toast');
  const textOf = (el) => el.querySelector('.notification-message').textContent;
  return {
    manager, helper: NotificationHelper, dom, clock, logged,
    async say(kind, text, options) { const out = NotificationHelper[kind](text, options); await settle(); return out; },
    /** What is on screen (not leaving), oldest first */
    visible: () => toastEls().filter(el => el.getAttribute('data-show') === 'true').map(textOf),
    inDom: () => toastEls().map(textOf),
    el: (text) => toastEls().find(el => textOf(el) === text),
    advance: (ms) => clock.advance(ms),
    /** Moves time in small steps and notes when each text was first and last on screen */
    watch(ms, step = 50) {
      const seen = new Map();
      let most = 0;
      const t0 = clock.now();
      for (let spent = 0; spent <= ms; spent += step) {
        const now = this.visible();
        most = Math.max(most, now.length);
        for (const text of now) {
          const entry = seen.get(text) || { first: clock.now() - t0, last: 0 };
          entry.last = clock.now() - t0;
          seen.set(text, entry);
        }
        clock.advance(step);
      }
      return { seen, most };
    }
  };
}

test('with Settings → Notifications off, a copy, a save, a delete or an export still answers: success, info, warning and micro show', async () => {
  const h = load({ notificationsEnabled: false });
  for (const kind of ['success', 'info', 'warning', 'micro', 'error']) {
    await h.say(kind, `answer ${kind}`);
    assert.deepEqual(h.visible(), [`answer ${kind}`], `${kind} toast`);
    h.advance(10000);
    assert.deepEqual(h.inDom(), [], `${kind} toast went away by itself`);
  }
});

test('an error lasts the time its caller asked for (the update check asks for 8 seconds), and 5 seconds when nobody asks', async () => {
  const h = load();
  await h.say('error', 'slow error', { duration: 8000 });
  h.advance(7900);
  assert.deepEqual(h.visible(), ['slow error'], 'still there after 7.9 s');
  h.advance(100 + FADE);
  assert.deepEqual(h.inDom(), [], 'gone after 8 s');

  await h.say('error', 'plain error');
  h.advance(4900);
  assert.deepEqual(h.visible(), ['plain error'], 'the default is 5 s');
  h.advance(100 + FADE);
  assert.deepEqual(h.inDom(), []);

  // An undefined duration is "not given", not "never goes away"
  await h.say('error', 'unset', { duration: undefined });
  h.advance(5000 + FADE);
  assert.deepEqual(h.inDom(), []);
});

test('an update check that says four things shows all four, each for its whole time, two at a time', async () => {
  const h = load();
  // Rules → Update and Settings → Check now: NotificationHelper[type](text, type === 'success' ? {} : { duration: 8000 })
  await h.say('success', 'Rules updated from release v3.1.2: F5');
  await h.say('warning', 'Waiting for extension 3.2.0 or newer: Kasada', { duration: 8000 });
  await h.say('warning', 'Could not download: A. Try again later.', { duration: 8000 });
  await h.say('info', 'Rules you edited wait for your decision in Rules → Update: Cloudflare', { duration: 8000 });
  const { seen, most } = h.watch(20000);
  assert.deepEqual([...seen.keys()].sort(), [
    'Could not download: A. Try again later.',
    'Rules updated from release v3.1.2: F5',
    'Rules you edited wait for your decision in Rules → Update: Cloudflare',
    'Waiting for extension 3.2.0 or newer: Kasada'
  ], 'every message was on screen');
  assert.ok(most <= 2, `${most} at once`);
  const lasted = (text) => seen.get(text).last - seen.get(text).first;
  assert.ok(lasted('Rules updated from release v3.1.2: F5') >= 2900, 'the success note keeps its 3 s');
  for (const text of ['Waiting for extension 3.2.0 or newer: Kasada', 'Could not download: A. Try again later.',
    'Rules you edited wait for your decision in Rules → Update: Cloudflare']) {
    assert.ok(lasted(text) >= 7900, `${text} keeps its 8 s (${lasted(text)} ms)`);
  }
  assert.ok(seen.get('Waiting for extension 3.2.0 or newer: Kasada').first < 500, 'the first two show at once');
});

test('Restore official: the failure message stays on screen while the notes that follow it wait for a place', async () => {
  const h = load();
  await h.say('error', 'Could not restore: Kasada');
  await h.say('success', 'DataDome restored');
  await h.say('info', 'Run Rules → Update to install the rest.');
  h.advance(600);
  assert.deepEqual(h.visible(), ['Could not restore: Kasada', 'DataDome restored'], 'two places; the third waits');
  h.advance(4300);
  assert.ok(h.visible().includes('Could not restore: Kasada'), 'the error is still readable at 4.9 s');
  assert.ok(h.visible().includes('Run Rules → Update to install the rest.'), 'the last note took the place of the success note');
  h.advance(5000);
  assert.deepEqual(h.inDom(), []);
});

test('while the pointer is on a toast, or the keyboard is in it, its time waits; leaving gives back what was left', async () => {
  const h = load();
  await h.say('success', 'Settings saved');
  h.advance(2000);
  const toast = h.el('Settings saved');
  toast.fire('mouseenter');
  const bar = toast.querySelector('.notification-progress-bar');
  assert.ok(Math.abs(parseFloat(bar.style.width) - 100 / 3) < 0.5, `the bar stops at a third: ${bar.style.width}`);
  h.advance(60000);
  assert.deepEqual(h.visible(), ['Settings saved'], 'a minute later it is still there');
  toast.fire('mouseleave');
  h.advance(990);
  assert.deepEqual(h.visible(), ['Settings saved'], 'the second that was left runs on');
  h.advance(10 + FADE);
  assert.deepEqual(h.inDom(), []);

  // Keyboard focus on the close button does the same; the pointer and the focus both have to go
  await h.say('warning', 'Could not download: A', { duration: 8000 });
  const warning = h.el('Could not download: A');
  warning.fire('focusin');
  warning.fire('mouseenter');
  h.advance(30000);
  assert.deepEqual(h.visible(), ['Could not download: A']);
  warning.fire('mouseleave');
  h.advance(30000);
  assert.deepEqual(h.visible(), ['Could not download: A'], 'focus still holds it');
  warning.fire('focusout');
  h.advance(8000 + FADE);
  assert.deepEqual(h.inDom(), []);
});

test('the same text again starts its time over; a toast that is already leaving is not given a second life', async () => {
  const h = load();
  await h.say('success', 'Copied');
  h.advance(2900);
  await h.say('success', 'Copied');
  h.advance(2900);
  assert.deepEqual(h.visible(), ['Copied'], 'the second copy restarted the 3 s');
  h.advance(100 + FADE);
  assert.deepEqual(h.inDom(), []);

  await h.say('success', 'Saved');
  h.advance(3000 + 100);
  assert.deepEqual(h.visible(), [], 'it is fading out');
  assert.deepEqual(h.inDom(), ['Saved'], 'but still in the page for a moment');
  await h.say('success', 'Saved');
  h.advance(FADE);
  assert.deepEqual(h.visible(), ['Saved'], 'the new one is not taken away with the old one');
  h.advance(2500);
  assert.deepEqual(h.visible(), ['Saved'], 'and has its own 3 s');
  h.advance(600);
  assert.deepEqual(h.inDom(), []);
});

test('a spinner that stays until it is closed does not take a place from the messages, and is never the one dropped', async () => {
  const h = load();
  const loader = h.helper.loading('Checking the latest release…');
  await h.say('success', 'First answer');
  await h.say('success', 'Second answer');
  assert.deepEqual(h.visible(), ['Checking the latest release…', 'First answer', 'Second answer']);
  await h.say('success', 'Third answer');
  assert.deepEqual(h.visible(), ['Checking the latest release…', 'First answer', 'Second answer'], 'the third waits');
  h.advance(3000 + FADE + 10);
  assert.deepEqual(h.visible(), ['Checking the latest release…', 'Third answer']);
  loader.update('Still checking…');
  assert.deepEqual(h.visible()[0], 'Still checking…');
  loader.close();
  h.advance(FADE + 10);
  assert.deepEqual(h.visible(), ['Third answer']);
});

test('a toast that waits for a place is the same toast when asked again, and one removed while waiting never shows', async () => {
  const h = load();
  await h.say('info', 'one', { duration: 8000 });
  await h.say('info', 'two', { duration: 8000 });
  const third = h.manager.info('third');
  assert.equal(h.manager.info('third'), third, 'asked again: the same one');
  assert.deepEqual(h.visible(), ['one', 'two']);
  h.manager.removeToast(third);
  const { seen } = h.watch(20000);
  assert.ok(!seen.has('third'), 'it never showed');
});

test('a flood of different notes keeps a short waiting line: the oldest notes are the ones given up, an error is not', async () => {
  const h = load();
  for (let i = 0; i < 30; i++) await h.say('info', `note ${i}`);
  await h.say('error', 'boom');
  assert.ok(h.manager.waiting.length <= h.manager.maxWaiting, `${h.manager.waiting.length} waiting`);
  const { seen, most } = h.watch(60000);
  assert.ok(seen.has('boom'), 'the error was shown');
  assert.ok(!seen.has('note 2'), 'an old note was given up');
  assert.ok(most <= 2);
});

test('a toast taken out of the page by other code does not keep a place: the next one still shows', async () => {
  const h = load();
  await h.say('info', 'one', { duration: 8000 });
  await h.say('info', 'two', { duration: 8000 });
  for (const el of h.dom.doc.querySelectorAll('.notification-toast')) el.remove(); // e.g. a test clearing the screen
  await h.say('success', 'after');
  assert.deepEqual(h.visible(), ['after']);
});

test('a place that is free goes to the toast that waited, before one that has just asked', async () => {
  const h = load();
  await h.say('info', 'one', { duration: 8000 });
  await h.say('info', 'two', { duration: 8000 });
  await h.say('info', 'three', { duration: 8000 });
  for (const el of h.dom.doc.querySelectorAll('.notification-toast')) el.remove();
  await h.say('success', 'fresh');
  assert.deepEqual(h.visible(), ['three', 'fresh'], 'the older request is first');
});

test('a toast that cannot be drawn is logged and does not throw into the code that reports its action (a copy that worked is not a failed copy)', async () => {
  const h = load({ drawingFails: true });
  for (const kind of ['success', 'info', 'warning', 'micro']) {
    let result;
    assert.doesNotThrow(() => { result = h.helper[kind]('Copied'); }, kind);
    assert.equal(result, undefined, kind);
  }
  assert.equal(h.logged.length, 4, h.logged.join('\n'));
  assert.match(h.logged[0], /success notification could not be shown/);
});
