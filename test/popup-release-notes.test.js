const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// After an update the popup said nothing about what changed. The version in its header is now a link to that version's release notes
// (the GitHub release of its tag: a release's text is its CHANGELOG section, and CHANGELOG.md itself is not in the package), with a
// small dot until the person has opened them once. The last version seen is kept in the popup's localStorage, so the worker has
// nothing to do with it. A first run only records the version (a new install has no notes to catch up on), and a storage that cannot
// be read or written says nothing: no dot, and the link still opens.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const KEY = 'lastSeenVersion';
const REPO = 'https://github.com/scrapfly/Antibot-Detector';
const LINK_KEY = 'headerVersionLinkFmt';
const NEWS_KEY = 'headerVersionNewFmt';
const LINK_NAME = (version) => `Release notes for version ${version}`;
const NEWS_NAME = (version) => `What's new in version ${version}`;

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); }
  };
}

/** The header's version element, as far as the popup touches it. */
function makeElement() {
  const attributes = new Map();
  const classes = new Set();
  const listeners = {};
  return {
    textContent: '',
    classList: {
      toggle: (name, force) => { const on = force === undefined ? !classes.has(name) : !!force; if (on) classes.add(name); else classes.delete(name); return on; },
      contains: (name) => classes.has(name)
    },
    setAttribute: (name, value) => { attributes.set(name, String(value)); },
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    /** What the page does when the person clicks (button 0) or uses another button (1: middle, 2: right). */
    fire: (type, event = {}) => { for (const fn of listeners[type] || []) fn({ type, button: 0, ...event }); },
    news: () => classes.has('has-news')
  };
}

/**
 * ScrapflyPopup in a page with the header's version element and a localStorage the test controls.
 * `blocked`: reaching localStorage throws, as it does with the browser's site data blocked.
 */
function load({ storage = makeStorage(), blocked = false, version = '3.1.7' } = {}) {
  const asked = [];
  const logged = [];
  const element = makeElement();
  const context = vm.createContext({
    console,
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: {} },
    Logger: { debug() {}, popup() {}, warn() {}, error: (...args) => logged.push(args.join(' ')) },
    window: { addEventListener() {} },
    document: { addEventListener() {}, querySelector: (selector) => (selector === '#appVersion' ? element : null) },
    FormatUtils: { t: (key, fallback, ...args) => { asked.push(key); return String(fallback).replace(/\{(\d+)\}/g, (_, index) => args[Number(index)]); } },
    NotificationHelper: { initialize() {}, error() {} },
    chrome: { runtime: { getManifest: () => ({ version }) } }
  });
  if (blocked) Object.defineProperty(context, 'localStorage', { get() { throw new Error('The operation is insecure.'); } });
  else context.localStorage = storage;
  vm.runInContext(`${read('popup.js')}\nthis.ScrapflyPopup = ScrapflyPopup;`, context, { filename: 'popup.js' });
  const ScrapflyPopup = context.ScrapflyPopup;
  return { ScrapflyPopup, popup: Object.create(ScrapflyPopup.prototype), element, storage, asked, logged };
}

/** The popup, opened for `version` on that storage: the element, and whether it shows the dot. */
function open(storage, version = '3.1.7') {
  const h = load({ storage, version });
  h.popup.setupVersionLink(h.element, version);
  return h;
}

test('the link goes to the GitHub release of the running version, whose tag is v<version>', () => {
  const { ScrapflyPopup } = load();
  const { version } = JSON.parse(read('manifest.json'));
  assert.equal(ScrapflyPopup.releaseNotesUrl('3.1.7'), `${REPO}/releases/tag/v3.1.7`);
  assert.equal(ScrapflyPopup.releaseNotesUrl(version), `${REPO}/releases/tag/v${version}`, `the version this package has (${version})`);
  assert.equal(ScrapflyPopup.releaseNotesUrl('3.1.7.2'), `${REPO}/releases/tag/v3.1.7.2`, 'a browser version may have four numbers');
  // Anything that is not a version number is never put into an address: the list of releases instead
  for (const odd of [undefined, null, '', ' ', 'latest', 'v3.1.7', '3.1.7/../../x', '3.1.7?a=b', '3.1.7#top', ' 3.1.7', '3.1.7\n', '3..1', '1.2.3.4.5', '3.1.7-beta']) {
    assert.equal(ScrapflyPopup.releaseNotesUrl(odd), `${REPO}/releases`, JSON.stringify(odd));
  }
});

test('the address matches how this repository names itself and its tags: the changelog\'s compare links, and the release workflow', () => {
  const link = /^\[\d+\.\d+\.\d+\]: (https:\/\/github\.com\/[^/\s]+\/[^/\s]+)\/compare\/v\d+\.\d+\.\d+\.\.\.v\d+\.\d+\.\d+$/m.exec(read('CHANGELOG.md'));
  assert.ok(link, 'the changelog has a compare link');
  assert.equal(link[1], REPO, 'the repository, spelt as the changelog spells it');
  assert.ok(read('.github/workflows/main.yml').includes('VER="${TAG#v}"'), 'a release tag is v<version>: the workflow strips the v to find the changelog section');
  assert.ok(read('popup.js').includes(REPO), 'popup.js carries that address');
});

test('the version in the header is an anchor that opens in a new tab and does not hand the page its opener', () => {
  const html = read('popup.html');
  assert.ok(!/<span\b[^>]*\bid="appVersion"/.test(html), 'no longer plain text');
  const tag = /<a\b[^>]*\bid="appVersion"[^>]*>/.exec(html);
  assert.ok(tag, 'an <a> with id appVersion');
  assert.match(tag[0], /\bclass="app-version"/);
  assert.match(tag[0], /\btarget="_blank"/);
  assert.match(tag[0], /\brel="[^"]*\bnoopener\b[^"]*"/);
  assert.ok(/<a\b[^>]*\bid="appVersion"[^>]*><\/a>/.test(html), 'empty until the popup writes the version and the address');
});

test('the element shows v<version>, points at its release notes, and its name says where the link goes', () => {
  const h = open(makeStorage({ [KEY]: '3.1.7' }));
  assert.equal(h.element.textContent, 'v3.1.7');
  assert.equal(h.element.getAttribute('href'), `${REPO}/releases/tag/v3.1.7`);
  assert.equal(h.element.getAttribute('aria-label'), LINK_NAME('3.1.7'));
  assert.equal(h.element.getAttribute('title'), LINK_NAME('3.1.7'), 'the hover text says it too');
  assert.deepEqual(h.asked, [LINK_KEY], 'in the language of the interface');
  assert.equal(h.element.news(), false);
});

test('the dot shows when the version last seen is not this one, and the name then says there is news', () => {
  const h = open(makeStorage({ [KEY]: '3.1.6' }));
  assert.equal(h.element.news(), true);
  assert.equal(h.element.getAttribute('aria-label'), NEWS_NAME('3.1.7'), 'a screen reader hears what the dot shows');
  assert.equal(h.element.getAttribute('title'), NEWS_NAME('3.1.7'));
  assert.deepEqual(h.asked, [NEWS_KEY]);
  assert.equal(h.element.getAttribute('href'), `${REPO}/releases/tag/v3.1.7`);
  assert.equal(h.storage.getItem(KEY), '3.1.6', 'seeing the dot does not clear it: opening the notes does');
});

test('opening the notes clears the dot at once and for the next popup; the next update brings it back', () => {
  const storage = makeStorage({ [KEY]: '3.1.6' });
  const first = open(storage);
  assert.equal(first.element.news(), true);
  first.element.fire('click');
  assert.equal(first.element.news(), false, 'gone');
  assert.equal(first.element.getAttribute('aria-label'), LINK_NAME('3.1.7'), 'and the name is the plain one again');
  assert.equal(first.element.getAttribute('title'), LINK_NAME('3.1.7'));
  assert.equal(storage.getItem(KEY), '3.1.7');
  assert.equal(open(storage).element.news(), false, 'the next time the popup opens');
  assert.equal(open(storage, '3.1.8').element.news(), true, 'a later version has notes of its own');
});

test('a middle click opens the notes in a new tab too, so it clears the dot; a right click only opens the menu', () => {
  const storage = makeStorage({ [KEY]: '3.1.6' });
  const right = open(storage);
  right.element.fire('auxclick', { button: 2 });
  assert.equal(right.element.news(), true);
  assert.equal(storage.getItem(KEY), '3.1.6');
  const middle = open(storage);
  middle.element.fire('auxclick', { button: 1 });
  assert.equal(middle.element.news(), false);
  assert.equal(storage.getItem(KEY), '3.1.7');
});

test('the first run in a browser only records the version: a new install shows no dot', () => {
  const storage = makeStorage();
  const first = open(storage);
  assert.equal(first.element.news(), false);
  assert.equal(first.element.getAttribute('aria-label'), LINK_NAME('3.1.7'));
  assert.equal(storage.getItem(KEY), '3.1.7', 'recorded, so that the next version is known to be new');
  assert.equal(first.element.getAttribute('href'), `${REPO}/releases/tag/v3.1.7`, 'and the link is there all the same');
  assert.equal(open(storage, '3.1.8').element.news(), true, 'the update after it shows the dot');
});

test('a storage that cannot be reached, read or written says nothing: no dot, no crash, and the link still opens', () => {
  const href = `${REPO}/releases/tag/v3.1.7`;
  const blocked = load({ blocked: true });
  assert.doesNotThrow(() => blocked.popup.setupVersionLink(blocked.element, '3.1.7'), 'localStorage itself throws (site data blocked)');
  assert.equal(blocked.element.news(), false);
  assert.equal(blocked.element.getAttribute('href'), href);
  assert.doesNotThrow(() => blocked.element.fire('click'));
  assert.equal(blocked.element.news(), false);

  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const unreadable = open(denied);
  assert.equal(unreadable.element.news(), false, 'reading throws');
  assert.equal(unreadable.element.getAttribute('href'), href);
  assert.doesNotThrow(() => unreadable.element.fire('click'));

  // Readable, not writable (full, or read-only): the dot shows, and a click does not break on the write that fails
  const full = makeStorage({ [KEY]: '3.1.6' });
  full.setItem = () => { throw new Error('QuotaExceededError'); };
  const unwritable = open(full);
  assert.equal(unwritable.element.news(), true);
  assert.doesNotThrow(() => unwritable.element.fire('click'));
  assert.equal(unwritable.element.news(), false, 'it still goes for this popup');
  assert.equal(full.getItem(KEY), '3.1.6');

  // A first run that cannot record the version shows no dot either (nothing says the version is new)
  const emptyAndFull = makeStorage();
  emptyAndFull.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.equal(open(emptyAndFull).element.news(), false);

  // Nothing at all to show or link: no version, no element
  const none = load();
  assert.doesNotThrow(() => none.popup.setupVersionLink(null, '3.1.7'));
  assert.doesNotThrow(() => none.popup.setupVersionLink(none.element, undefined));
  assert.equal(none.element.getAttribute('href'), null);
});

test('opening the popup sets the link up from the manifest version', async () => {
  const h = load({ version: '3.4.5', storage: makeStorage({ [KEY]: '3.4.4' }) });
  const popup = h.popup;
  // Everything initialize() does besides the header is somebody else's: stubbed
  popup.warnIfWorkerOutdated = () => {};
  popup.warnIfSettingsUnreadable = () => {};
  popup.warnIfRulesUnreadable = () => {};
  popup.setupEventListeners = () => {};
  popup.setupMessageHandlers = () => {};
  popup.initializeSections = async () => {};
  popup.restoreAfterLanguageChange = async () => true;
  popup.detectorManager = { initialized: true, detectors: [], addChangeListener() {} };
  await popup.initialize();
  assert.deepEqual(h.logged, [], 'initialize() ran to its end');
  assert.equal(h.element.textContent, 'v3.4.5');
  assert.equal(h.element.getAttribute('href'), `${REPO}/releases/tag/v3.4.5`);
  assert.equal(h.element.news(), true);
});

test('both texts exist in every language with the version in them, and the popup falls back to the English ones', () => {
  const english = JSON.parse(read('_locales/en/messages.json'));
  const popup = read('popup.js');
  for (const [key, text] of [[LINK_KEY, LINK_NAME('{0}')], [NEWS_KEY, NEWS_NAME('{0}')]]) {
    assert.equal(english[key] && english[key].message, text, `${key} in English`);
    assert.ok(english[key].description && english[key].description.length > 20, `${key}: the English entry says where it is shown`);
    const fallback = new RegExp(`FormatUtils\\.t\\('${key}', ("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')`).exec(popup);
    assert.ok(fallback, `${key}: the popup asks for it with an English fallback`);
    assert.equal(vm.runInNewContext(fallback[1]), english[key].message, `${key}: the fallback in the popup is the English text`);
    for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
      const entry = JSON.parse(read(`_locales/${locale}/messages.json`))[key];
      assert.ok(entry && typeof entry.message === 'string' && entry.message.includes('{0}'), `${locale} has ${key}, with the version in it`);
      if (locale !== 'en') assert.notEqual(entry.message, english[key].message, `${locale} is translated`);
    }
  }
  // Two different texts: what a screen reader says must tell "there is news" from "the notes"
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    assert.notEqual(messages[LINK_KEY].message, messages[NEWS_KEY].message, `${locale}: the two names differ`);
  }
});

test('the dot is drawn by the stylesheet beside the text, takes no room, mirrors in Arabic and takes its colour from the theme', () => {
  const css = read('modules/styles/popup.css');
  const block = (selector) => {
    const found = new RegExp(`(?:^|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm').exec(css);
    assert.ok(found, `${selector} is in popup.css`);
    return found[1];
  };
  assert.match(block('.app-version'), /position:\s*relative/, 'the dot is placed against the link');
  const dot = block('.app-version.has-news::after');
  assert.match(dot, /position:\s*absolute/, 'out of the flow: nothing moves when it appears or goes');
  assert.match(dot, /inset-inline-end:/, 'on the end side of the text, whichever way the language reads');
  assert.doesNotMatch(dot, /(^|[\s;{])(left|right)\s*:/, 'no physical side to be left behind in Arabic');
  assert.match(dot, /background:\s*var\(--accent\)/);
  assert.doesNotMatch(dot, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'only theme colours: the light and the dark theme each give --accent a value');
  const common = read('modules/styles/common.css');
  assert.match(common, /:root\s*\{[^}]*--accent:\s*#/, 'the dark theme has --accent');
  assert.match(common, /:root\[data-theme="light"\]\s*\{[^}]*--accent:\s*#/, 'the light theme has --accent');
  assert.match(css, /\.app-version:focus-visible\s*\{[^}]*outline:/, 'a link that can be reached by keyboard shows where it is');
});
