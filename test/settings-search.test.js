const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDom, parseInto } = require('./helpers/html-dom');

// Settings → the search box above the tabs. It narrows the four tabs to the settings whose text (already translated in the page)
// holds what was typed: matching by name and by description, in any language, ignoring case and accents; it opens the first tab
// that has a match and unfolds the cards that match, says when nothing does, clears with Escape and with its button, and puts the
// tab and the folds back when it is emptied. These tests run the real settings.html, settings-ui.js, the real focus trap and the
// real i18n script in a small DOM (test/helpers/html-dom.js), so a change to the page is a change to what is tested.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const HTML = read('sections/settings/settings.html');
const LOCALES = fs.readdirSync(path.join(root, '_locales')).sort();
const HIDDEN = 'settings-search-hidden';
const KEYS = ['settingsSearchPlaceholder', 'settingsSearchNoMatch', 'settingsSearchCountFmt', 'settingsSearchClear'];

/** Timers that only move when a test says so (the screen reader line is set after a short wait). */
function fakeClock() {
  let now = 0, next = 1;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const id = next++; timers.set(id, { fn, due: now + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0];
        if (!due) break;
        now = due[1].due;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    }
  };
}

/**
 * Settings as the popup builds it: settings.html in #settingsModal, translated by the real I18n, with settings-ui.js,
 * settings-ui-search.js and the focus trap loaded in a vm context, and a stand-in for the Settings class that delegates to them.
 */
function createPage({ locale = 'en', webhookOn = false } = {}) {
  const { document, window } = createDom();
  const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
  const modal = document.createElement('div');
  modal.id = 'settingsModal';
  modal.className = 'base-modal';
  document.body.appendChild(modal);
  parseInto(modal, HTML);
  const clock = fakeClock();
  const context = vm.createContext({
    console, document, window, self: {}, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    requestAnimationFrame: (fn) => fn(), getComputedStyle: () => ({ direction: 'ltr' }),
    chrome: { i18n: { getMessage: (key) => (messages[key] && messages[key].message) || '' } },
    Logger: new Proxy({}, { get: () => () => {} }),
    NotificationHelper: { info() {}, error() {}, success() {} }
  });
  for (const file of ['modules/core/i18n.js', 'modules/ui/modal-focus.js', 'sections/settings/settings-ui.js', 'sections/settings/settings-ui-search.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  // What FormatUtils.t does, over the real I18n
  vm.runInContext(`var FormatUtils = { t(key, fallback, ...args) { const text = I18n.format(key, ...args); return text || String(fallback).replace(/\\{(\\d+)\\}/g, (p, i) => (Number(i) < args.length ? String(args[Number(i)]) : p)); } };`, context);
  const SettingsUI = vm.runInContext('SettingsUI', context);
  // Things the popup's other scripts do when a tab opens: not what is under test
  Object.assign(SettingsUI, { refreshHistoryStorage: async () => {}, refreshHistoryWatch: async () => {}, refreshStorageOverview: () => {} });
  vm.runInContext('I18n.apply(document.querySelector("#settingsModal"))', context);

  const owner = {
    isModalVisible: false, settings: { detection: {} }, settingsBaseline: null, loadSettings() {}, setupColorPagination() {},
    showSettings(...args) { return SettingsUI.showSettings.apply(this, args); },
    hideSettings(...args) { return SettingsUI.hideSettings.apply(this, args); },
    switchTab(...args) { return SettingsUI.switchTab.apply(this, args); },
    setupEventListeners(...args) { return SettingsUI.setupEventListeners.apply(this, args); },
    async handleSaveSettings() {}
  };
  owner.setupEventListeners();
  owner.showSettings();
  const $ = (selector) => document.querySelector(selector);
  // What updateSettingsUI leaves under the default settings (the webhook, the JS API and the automatic update are off): what a
  // switch turns on is hidden by an inline display. The Duplicate Prevention and Log Collector blocks start so in the page itself.
  for (const id of ['#webhookSettings', '#webhookOnCacheGroup', '#jsApiSettings', '#updateIntervalGroup']) $(id).style.display = 'none';
  if (webhookOn) {
    $('#webhookSettings').style.display = 'block';
    $('#webhookOnCacheGroup').style.display = 'flex';
  }

  const page = {
    document, window, modal, context, SettingsUI, owner, clock, messages,
    input: $('#settingsSearchInput'), clear: $('#settingsSearchClear'), status: $('#settingsSearchStatus'), empty: $('#settingsSearchEmpty'),
    $,
    /** What a person does: put the text in the box and let the page hear it */
    type(text) { this.input.value = text; this.input.dispatchEvent({ type: 'input', isComposing: false }); },
    /** A key pressed with the focus on `target`, through the window, the document and the elements, as the browser does */
    press(target, key, init = {}) { target.focus(); return target.dispatchEvent({ type: 'keydown', key, ...init }); },
    activeTab() { return $('.settings-tab-btn.active').getAttribute('data-settings-tab'); },
    /** Hidden by the search: the element, or something around it */
    hidden(element) { for (let up = element; up && up.nodeType === 1; up = up.parentNode) if (up.classList.contains(HIDDEN)) return true; return false; },
    /** The row, group or item a control sits in */
    unit(id) { return document.getElementById(id).closest('.setting-row, .setting-group, .settings-row, .color-row, .data-item'); },
    card(id) { return document.getElementById(id).closest('.settings-card'); },
    folded(card) { return card.classList.contains('is-collapsed'); },
    /** Every control's value, to prove the search touches none */
    values() { return modal.querySelectorAll('input, select, textarea').map((el) => [el.id || el.getAttribute('name') || el.localName, el.value, el.checked]); },
    announced() { this.clock.tick(1000); return this.status.textContent; }
  };
  return page;
}

// ---------------------------------------------------------------------------------------------------------------- the page

test('the search box is a named, labelled control above the tabs, with a clear button and a polite status line', () => {
  const header = HTML.indexOf('class="modal-header"');
  const box = HTML.indexOf('id="settingsSearchInput"');
  const tabs = HTML.indexOf('class="settings-tabs"');
  assert.ok(header >= 0 && box > header && box < tabs, 'the box sits between the header and the tab strip');
  const input = /<input[^>]*id="settingsSearchInput"[^>]*>/.exec(HTML)[0];
  assert.match(input, /type="search"/);
  assert.match(input, /data-i18n-aria-label="settingsSearchPlaceholder"/, 'its name is translated');
  assert.match(input, /data-i18n-placeholder="settingsSearchPlaceholder"/);
  assert.match(input, /\baria-label="[^"]+"/, 'and has one before the translation runs');
  assert.match(input, /autocomplete="off"/);
  const clear = /<button[^>]*id="settingsSearchClear"[^>]*>/.exec(HTML)[0];
  assert.match(clear, /type="button"/);
  assert.match(clear, /\bhidden\b/, 'nothing to clear until something is typed');
  assert.match(clear, /data-i18n-aria-label="settingsSearchClear"/);
  assert.match(clear, /data-i18n-title="settingsSearchClear"/);
  const status = /<[a-z]+[^>]*id="settingsSearchStatus"[^>]*>/.exec(HTML)[0];
  assert.match(status, /role="status"/);
  assert.match(status, /aria-live="polite"/);
  assert.match(status, /aria-atomic="true"/);
  assert.match(/<[a-z]+[^>]*id="settingsSearchEmpty"[^>]*>/.exec(HTML)[0], /\bhidden\b/, 'the no-match line starts hidden');
  assert.match(HTML, /id="settingsSearchEmpty"[^>]*data-i18n="settingsSearchNoMatch"|data-i18n="settingsSearchNoMatch"[^>]*id="settingsSearchEmpty"/);
});

test('popup.html loads the search script once, after settings-ui.js', () => {
  const scripts = [...read('popup.html').matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
  const file = 'sections/settings/settings-ui-search.js';
  assert.equal(scripts.filter((src) => src === file).length, 1);
  assert.ok(scripts.indexOf('sections/settings/settings-ui.js') < scripts.indexOf(file));
  assert.ok(fs.existsSync(path.join(root, file)));
});

test('every language has the four strings; the count is a label with a number, so no language needs a plural', () => {
  assert.equal(LOCALES.length, 22);
  for (const locale of LOCALES) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    for (const key of KEYS) assert.ok(messages[key] && messages[key].message.trim(), `${locale}: ${key}`);
    assert.equal((messages.settingsSearchCountFmt.message.match(/\{0\}/g) || []).length, 1, `${locale}: one {0}`);
    assert.doesNotMatch(messages.settingsSearchPlaceholder.message, /\{\d\}/);
  }
  const english = JSON.parse(read('_locales/en/messages.json'));
  assert.equal(english.settingsSearchCountFmt.message, 'Settings found: {0}');
});

test('the new keys sit beside the Settings search keys, not at the end of each file', () => {
  for (const locale of LOCALES) {
    const keys = Object.keys(JSON.parse(read(`_locales/${locale}/messages.json`)));
    const at = keys.indexOf('settingsSearchDomainsPlaceholder');
    for (const key of KEYS) {
      const place = keys.indexOf(key);
      assert.ok(place >= 0 && Math.abs(place - at) <= KEYS.length + 1, `${locale}: ${key} is next to settingsSearchDomainsPlaceholder (${place} vs ${at})`);
    }
  }
});

// ---------------------------------------------------------------------------------------------------------------- matching

test('matches a setting by its name: "cache duration" opens the Detection tab, unfolds its card and shows that one row', () => {
  const page = createPage();
  assert.equal(page.activeTab(), 'general');
  assert.equal(page.folded(page.card('cacheDuration')), true, 'the card starts folded');
  page.type('cache duration');
  assert.equal(page.activeTab(), 'detection');
  assert.equal(page.folded(page.card('cacheDuration')), false, 'the card with the match is unfolded');
  assert.equal(page.card('cacheDuration').querySelector(':scope > .settings-card-head').getAttribute('aria-expanded'), 'true');
  assert.equal(page.hidden(page.unit('cacheDuration')), false, 'the row is shown');
  assert.equal(page.hidden(page.unit('cacheScope')), true, 'its neighbour is not about duration');
  assert.equal(page.hidden(page.card('sortByConfidence')), true, 'the other cards go');
  assert.equal(page.hidden(page.card('enableJsApi')), true);
  assert.equal(page.hidden(page.card('notificationsEnabled')), true, 'and so do those of the other tabs');
  assert.equal(page.empty.hidden, true, 'something matches, so no no-match line');
});

test('matches by description: a phrase that only a row\'s description holds finds that row among its neighbours', () => {
  const page = createPage();
  page.type('almost full backup fails');
  assert.equal(page.activeTab(), 'general');
  assert.equal(page.hidden(page.unit('notificationsEnabled')), false, '"... History is almost full or its backup fails" is under Notifications');
  for (const other of ['languageOverride', 'themeChoice', 'debugModeGeneral']) assert.equal(page.hidden(page.unit(other)), true, `${other} is another setting`);
  assert.equal(page.hidden(page.card('autoUpdate')), true, 'and the Detector Updates card has no such text');
});

test('every word must match, in any order and any place of the row: the group and card titles count as part of it', () => {
  const page = createPage();
  page.type('webhook secret');
  assert.equal(page.activeTab(), 'detection');
  const hit = page.unit('enableWebhook');
  assert.equal(page.hidden(hit), false, 'with the webhook off, the switch that turns the signing secret on is what is shown');
  page.type('secret signing');
  assert.equal(page.activeTab(), 'detection', 'the order does not matter');
  page.type('theme dark');
  assert.equal(page.activeTab(), 'general');
  assert.equal(page.hidden(page.unit('themeChoice')), false);
  assert.equal(page.hidden(page.unit('languageOverride')), true, 'it does not hold both words');
});

test('"webhook secret" with the webhook on shows the signing secret and none of the other webhook fields', () => {
  const page = createPage({ webhookOn: true });
  page.type('webhook secret');
  assert.equal(page.activeTab(), 'detection');
  assert.equal(page.hidden(page.document.getElementById('webhookSecretGroup')), false);
  for (const other of ['webhookUrl', 'webhookPayload', 'testWebhookBtn', 'webhookMinConfidence']) assert.equal(page.hidden(page.document.getElementById(other)), true, `${other} is another field`);
  assert.equal(page.hidden(page.card('enableWebhook')), true, 'the switch row has no "secret" in it, and the fields are already on');
});

test('turning the webhook on while a search is open filters the fields that appear', () => {
  const page = createPage();
  page.type('webhook secret');
  assert.equal(page.hidden(page.document.getElementById('webhookUrl')), false, 'not filtered yet: they are off, hidden by their own switch');
  page.document.getElementById('webhookSettings').style.display = 'block'; // what the switch does
  page.document.getElementById('webhookOnCacheGroup').style.display = 'flex';
  page.document.getElementById('enableWebhook').dispatchEvent({ type: 'change' });
  assert.equal(page.hidden(page.document.getElementById('webhookSecretGroup')), false);
  assert.equal(page.hidden(page.document.getElementById('webhookUrl')), true);
});

test('a setting behind a switch or a choice is found through it: the switch is shown, and what it opens stays the page\'s to open', () => {
  const page = createPage();
  page.type('time window');
  assert.equal(page.activeTab(), 'history');
  assert.equal(page.hidden(page.unit('preventDuplicates')), false, 'the switch that opens "Time Window"');
  assert.equal(page.document.getElementById('duplicateSettingsContainer').style.display, 'none', 'the search left its state alone');
  page.type('github token');
  assert.equal(page.activeTab(), 'detection');
  assert.equal(page.hidden(page.unit('shareProvider')), false, 'the Service choice that shows the token field');
  assert.equal(page.document.getElementById('shareGithubToken').closest('.share-provider-panel').hidden, true, 'the panel is still hidden by the choice');
  page.type('scrapfly:onstart');
  assert.equal(page.hidden(page.unit('enableJsApi')), false);
  assert.equal(page.document.getElementById('jsApiSettings').style.display, 'none');
});

test('a hint belongs to the row above it: it is shown with its row and hidden with the others', () => {
  const page = createPage();
  const hint = (text) => page.modal.querySelectorAll('.setting-row-hint').find((p) => p.textContent.includes(text));
  page.type('gains or loses a protection');
  assert.equal(page.activeTab(), 'history');
  assert.equal(page.hidden(page.unit('historyChangeAlerts')), false);
  assert.equal(page.hidden(hint('A notification when a page you scanned')), false, 'the row\'s hint stays with it');
  assert.equal(page.hidden(hint('0 keeps them like every other page')), true, 'the hint of another row goes with that row');
});

test('a card or group title finds everything under it: "cache settings" shows both rows of the card', () => {
  const page = createPage();
  page.type('cache settings');
  assert.equal(page.hidden(page.unit('cacheDuration')), false);
  assert.equal(page.hidden(page.unit('cacheScope')), false);
  assert.equal(page.folded(page.card('cacheDuration')), false);
});

test('a Tag colour on a page the pager has hidden is found and shown, and the pager is left as it was', () => {
  const page = createPage();
  const pageOf = (id) => page.document.getElementById(id).closest('.color-page');
  page.type('payload');
  assert.equal(page.activeTab(), 'general', 'the colour is on the General tab');
  const third = pageOf('colorTagPayload');
  assert.equal(third.classList.contains('settings-search-reveal'), true, 'page 3 is shown although the pager has page 1 open');
  assert.equal(page.hidden(third), false);
  assert.equal(third.style.display, 'none', 'the pager\'s own state is not touched');
  assert.equal(page.hidden(pageOf('colorTagDOM')), true, 'page 1 holds no "payload"');
  page.type('');
  assert.equal(page.modal.querySelectorAll('.settings-search-reveal').length, 0, 'emptying the box takes the page away again');
  assert.equal(third.style.display, 'none');
});

test('case and accents do not matter, in the page\'s language and in the typed one', () => {
  const english = createPage();
  english.type('CACHÉ DURATION');
  assert.equal(english.hidden(english.unit('cacheDuration')), false);
  const spanish = createPage({ locale: 'es' });
  const label = spanish.messages.cacheDuration.message;
  assert.match(label, /[áéíóú]/i, `Spanish "${label}" has an accent to lose`);
  spanish.type(label.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase());
  assert.equal(spanish.hidden(spanish.unit('cacheDuration')), false, 'an upper-case query without accents finds the accented label');
  spanish.type(label.toLowerCase());
  assert.equal(spanish.hidden(spanish.unit('cacheDuration')), false);
});

test('an empty query, spaces and one letter do nothing: nothing is hidden and the tab stays', () => {
  const page = createPage();
  for (const text of ['', '   ', 'c', ' c ', 'a b']) {
    page.type(text);
    assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0, JSON.stringify(text));
    assert.equal(page.activeTab(), 'general', JSON.stringify(text));
    assert.equal(page.empty.hidden, true, JSON.stringify(text));
  }
  page.type('ca');
  assert.ok(page.modal.querySelectorAll(`.${HIDDEN}`).length > 0, 'two letters filter');
});

test('one character of Chinese, Japanese or Korean is a word, so it filters', () => {
  const page = createPage({ locale: 'zh_CN' });
  const first = [...page.messages.cacheDuration.message][0];
  assert.ok(/[一-鿿]/.test(first), first);
  page.type(first);
  assert.ok(page.modal.querySelectorAll(`.${HIDDEN}`).length > 0);
  assert.equal(page.hidden(page.unit('cacheDuration')), false);
});

test('a word that is being composed (an input method) is not searched until it is committed', () => {
  const page = createPage();
  page.input.value = 'cache duration';
  page.input.dispatchEvent({ type: 'input', isComposing: true });
  assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0, 'still composing');
  page.input.dispatchEvent({ type: 'compositionend' });
  assert.equal(page.activeTab(), 'detection');
});

// ---------------------------------------------------------------------------------------------------------------- tabs and folds

test('opens the first tab that has a match, and stays on the open tab while it has one', () => {
  const page = createPage();
  page.type('cache');
  assert.equal(page.activeTab(), 'detection', 'General has none; Detection (cache duration) is the first that has');
  page.owner.switchTab('history');
  page.type('cach');
  page.type('cache');
  assert.equal(page.activeTab(), 'history', 'History has "Save on Cache Hits" too: the person is there, so it stays');
  page.type('zzzz');
  assert.equal(page.activeTab(), 'history', 'nothing matches anywhere: no tab is better than another');
  page.type('');
  page.owner.switchTab('data');
  page.type('cache');
  assert.equal(page.activeTab(), 'detection', 'the Data tab has none, so the search goes to the first that has');
});

test('the tab strip keeps its ARIA state through a search: one selected tab, in the Tab order, with its panel open', () => {
  const page = createPage();
  page.type('cache duration');
  const tabs = page.modal.querySelectorAll('.settings-tab-btn');
  assert.equal(tabs.filter((tab) => tab.getAttribute('aria-selected') === 'true').length, 1);
  for (const tab of tabs) {
    const open = tab.getAttribute('data-settings-tab') === 'detection';
    assert.equal(tab.getAttribute('aria-selected'), String(open));
    assert.equal(tab.tabIndex, open ? 0 : -1);
    assert.equal(tab.classList.contains('active'), open);
    assert.equal(page.document.getElementById(tab.getAttribute('aria-controls')).classList.contains('active'), open);
  }
});

test('the arrow keys still move along the tabs while a search is open', () => {
  const page = createPage();
  page.type('cache');
  assert.equal(page.activeTab(), 'detection');
  page.press(page.$('#settingsTab-detection'), 'ArrowRight');
  assert.equal(page.activeTab(), 'history');
  assert.equal(page.document.activeElement.id, 'settingsTab-history');
  page.press(page.$('#settingsTab-history'), 'End');
  assert.equal(page.activeTab(), 'data');
  assert.equal(page.document.activeElement.id, 'settingsTab-data');
  assert.equal(page.empty.hidden, false, 'the Data tab has no "cache": the line says so');
  page.press(page.$('#settingsTab-data'), 'Home');
  assert.equal(page.activeTab(), 'general');
});

test('a card the person folds or unfolds by hand still folds and unfolds during a search', () => {
  const page = createPage();
  page.type('cache settings');
  const head = page.card('cacheDuration').querySelector(':scope > .settings-card-head');
  head.click();
  assert.equal(page.folded(page.card('cacheDuration')), true);
  assert.equal(head.getAttribute('aria-expanded'), 'false');
  head.click();
  assert.equal(page.folded(page.card('cacheDuration')), false);
});

test('opening a tab by hand during a search shows the no-match line when that tab has nothing for it', () => {
  const page = createPage();
  page.type('cache duration');
  assert.equal(page.empty.hidden, true);
  page.owner.switchTab('history');
  assert.equal(page.empty.hidden, false, 'History has no cache duration');
  page.owner.switchTab('detection');
  assert.equal(page.empty.hidden, true);
});

// ---------------------------------------------------------------------------------------------------------------- nothing found

test('nothing matches: the no-match line shows, every group of every tab goes, and the status line says so', () => {
  const page = createPage();
  page.type('zzqqxx');
  assert.equal(page.empty.hidden, false);
  assert.equal(page.empty.textContent.trim(), 'No settings match your search.');
  for (const group of page.modal.querySelectorAll('.settings-card-group')) assert.equal(page.hidden(group), true);
  assert.equal(page.announced(), 'No settings match your search.');
  page.type('cache duration');
  assert.equal(page.empty.hidden, true);
});

test('the status line says how many settings were found, once the person has stopped typing', () => {
  const page = createPage();
  page.type('cache duration');
  assert.equal(page.status.textContent, '', 'not at once: a word typed over is said once');
  assert.equal(page.announced(), 'Settings found: 1');
  page.type('theme');
  page.type('themes');
  page.clock.tick(1000);
  assert.equal(page.status.textContent, 'No settings match your search.', 'only the last word is said');
  assert.equal(page.status.getAttribute('aria-live'), 'polite');
});

test('the status line is told in the page\'s language', () => {
  const page = createPage({ locale: 'de' });
  page.type(page.messages.cacheDuration.message);
  const [before, after] = page.messages.settingsSearchCountFmt.message.split('{0}');
  assert.equal(page.announced(), `${before}1${after}`);
  page.type('zzqqxx');
  assert.equal(page.announced(), page.messages.settingsSearchNoMatch.message);
});

// ---------------------------------------------------------------------------------------------------------------- clearing

test('Escape in the box clears the search and keeps Settings open; a second Escape closes it', () => {
  const page = createPage();
  page.type('cache duration');
  page.input.focus();
  const event = page.press(page.input, 'Escape');
  assert.equal(page.input.value, '');
  assert.equal(page.owner.isModalVisible, true, 'the first Escape belongs to the search');
  assert.equal(event.defaultPrevented, true);
  assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0, 'everything is back');
  assert.equal(page.empty.hidden, true);
  assert.equal(page.document.activeElement, page.input, 'the focus stays in the box');
  page.press(page.input, 'Escape');
  assert.equal(page.owner.isModalVisible, false, 'with nothing to clear, Escape closes Settings as it always did');
});

test('Escape elsewhere in Settings still closes it, even with a search open', () => {
  const page = createPage();
  page.type('cache duration');
  page.press(page.$('#settingsTab-detection'), 'Escape');
  assert.equal(page.owner.isModalVisible, false);
});

test('Escape that cancels an input-method composition does not close Settings or clear the box', () => {
  const page = createPage();
  page.type('cache');
  const event = page.press(page.input, 'Escape', { isComposing: true });
  assert.equal(page.owner.isModalVisible, true);
  assert.equal(page.input.value, 'cache');
  assert.equal(event.defaultPrevented, false, 'the input method still gets the key');
});

test('the clear button empties the box, gives the focus back to it and hides itself', () => {
  const page = createPage();
  assert.equal(page.clear.hidden, true);
  page.type('cache duration');
  assert.equal(page.clear.hidden, false);
  page.clear.focus();
  page.clear.click();
  assert.equal(page.input.value, '');
  assert.equal(page.clear.hidden, true);
  assert.equal(page.document.activeElement, page.input);
  assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0);
});

test('emptying the box by hand (or typing one letter) puts back the tab and every fold as they were', () => {
  const page = createPage();
  const head = page.card('hooksOffDomains').querySelector(':scope > .settings-card-head');
  page.owner.switchTab('detection');
  head.click(); // the person had opened this card before searching
  page.owner.switchTab('general');
  page.type('cache duration');
  assert.equal(page.activeTab(), 'detection');
  assert.equal(page.folded(page.card('cacheDuration')), false);
  page.type('');
  assert.equal(page.activeTab(), 'general', 'the tab the person was on');
  assert.equal(page.folded(page.card('cacheDuration')), true, 'the card the search opened is folded again');
  assert.equal(page.folded(page.card('hooksOffDomains')), false, 'and the one the person had opened is as they left it');
  assert.equal(head.getAttribute('aria-expanded'), 'true');
  assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0);
  page.type('cache duration');
  page.type('c');
  assert.equal(page.activeTab(), 'general', 'a single letter counts as empty');
  assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0);
});

test('each search remembers where it started from: a second one after a clear restores to the new place', () => {
  const page = createPage();
  page.type('cache duration');
  page.type('');
  page.owner.switchTab('history');
  page.type('cache duration');
  page.type('');
  assert.equal(page.activeTab(), 'history');
});

// ---------------------------------------------------------------------------------------------------------------- never a value

test('searching, finding and clearing change no value, no switch and no setting', () => {
  const page = createPage({ webhookOn: true });
  const before = JSON.stringify(page.values());
  const settings = JSON.stringify(page.owner.settings);
  for (const word of ['cache duration', 'webhook secret', 'theme', 'history days', 'zzqq', '']) page.type(word);
  page.type('webhook url');
  page.clear.click();
  assert.equal(JSON.stringify(page.owner.settings), settings);
  // the search box itself is the only control that holds something different
  assert.equal(JSON.stringify(page.values()), before);
  assert.equal(page.input.value, '');
});

test('the box, its clear button and its status line sit outside every tab and every card: the search can never hide them, and no tab\'s form reads them', () => {
  const page = createPage();
  for (const element of [page.input, page.clear, page.status]) {
    assert.equal(element.closest('.settings-tab-content'), null, element.id);
    assert.equal(element.closest('.settings-card'), null, element.id);
    assert.equal(element.closest('.modal-body'), null, `${element.id} stays put when the body scrolls`);
  }
  page.type('zzqqxx');
  assert.equal(page.hidden(page.input) || page.hidden(page.clear) || page.hidden(page.status), false, 'nothing found, and the box is still there to be emptied');
});

// ---------------------------------------------------------------------------------------------------------------- opening, saving

test('Settings opens with an empty box and nothing hidden, each time', () => {
  const page = createPage();
  page.type('cache duration');
  page.owner.hideSettings();
  assert.equal(page.owner.isModalVisible, false);
  page.owner.showSettings();
  assert.equal(page.input.value, '');
  assert.equal(page.clear.hidden, true);
  assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0);
  assert.equal(page.empty.hidden, true);
  assert.equal(page.folded(page.card('cacheDuration')), true, 'and the cards start folded, as before');
});

test('a Save that finds an invalid value steps the search aside so the field can be shown and focused', () => {
  const page = createPage();
  page.type('theme');
  assert.equal(page.hidden(page.document.getElementById('cacheDuration')), true);
  page.SettingsUI.revealInvalidFields.call(page.owner, ['#cacheDuration']);
  assert.equal(page.input.value, '');
  assert.equal(page.hidden(page.document.getElementById('cacheDuration')), false);
  assert.equal(page.activeTab(), 'detection');
  assert.equal(page.folded(page.card('cacheDuration')), false, 'its card is open');
  assert.equal(page.document.activeElement.id, 'cacheDuration');
});

// ---------------------------------------------------------------------------------------------------------------- languages

test('in every language, the translated name of a setting finds it, in capitals and without accents', () => {
  const fold = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const locale of LOCALES) {
    const page = createPage({ locale });
    const label = page.messages.cacheDuration.message;
    for (const query of [label, fold(label).toUpperCase(), label.toLocaleLowerCase(locale.replace('_', '-'))]) {
      page.type(query);
      assert.equal(page.hidden(page.unit('cacheDuration')), false, `${locale}: "${query}" finds "${label}"`);
      assert.equal(page.folded(page.card('cacheDuration')), false, `${locale}: its card is unfolded`);
      assert.equal(page.empty.hidden, true, `${locale}: something matched`);
    }
    // and the description of another one
    const description = page.messages.settingsCardNotificationsDesc.message;
    page.type(description);
    assert.equal(page.activeTab(), 'general', `${locale}: the description of Notifications`);
    assert.equal(page.hidden(page.unit('notificationsEnabled')), false, `${locale}`);
    assert.equal(page.hidden(page.unit('themeChoice')), true, `${locale}`);
    page.type('');
    assert.equal(page.modal.querySelectorAll(`.${HIDDEN}`).length, 0, `${locale}: cleared`);
  }
});

// ---------------------------------------------------------------------------------------------------------------- the style

test('the stylesheet hides what the search hides even where a rule sets display, mirrors in right-to-left, and has a themed look', () => {
  const css = read('sections/settings/settings.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (selector) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `${selector} is defined`);
    return css.slice(at, css.indexOf('}', at));
  };
  assert.match(block('#settingsModal .settings-search-hidden'), /display:\s*none\s*!important/, '.settings-row and .setting-row set display: flex, which a plain class would not beat');
  assert.match(block('#settingsModal .settings-search-reveal'), /display:\s*block\s*!important/, 'a page of the colour pager has display set inline by the pager');
  assert.match(block('#settingsModal .settings-search-clear[hidden]'), /display:\s*none/, 'the clear button sets display, so [hidden] needs its own rule');
  assert.match(block('#settingsModal .settings-search-empty[hidden]'), /display:\s*none/);
  const owned = ['.settings-search', '.settings-search-field', '.settings-search-icon', '.settings-search-input', '.settings-search-clear', '.settings-search-empty']
    .map((selector) => block(`#settingsModal ${selector}`)).join('\n');
  assert.doesNotMatch(owned, /(^|[\s;{])(left|right)\s*:/, 'logical sides, so Arabic mirrors');
  assert.doesNotMatch(owned, /(margin|padding)-(left|right)/);
  assert.doesNotMatch(owned, /text-align:\s*left/);
  assert.match(block('#settingsModal .settings-search-icon'), /inset-inline-start/);
  assert.match(block('#settingsModal .settings-search-clear'), /inset-inline-end/);
  assert.match(block('#settingsModal .settings-search-input'), /padding-inline:/);
  assert.match(block('#settingsModal .settings-search-input:focus'), /var\(--accent\)/, 'the focus ring of every other field');
  assert.doesNotMatch(owned, /#[0-9a-fA-F]{3,8}\b/, 'colours come from the theme tokens, so the light theme works');
  assert.match(css, /#settingsModal \.settings-search-input::-webkit-search-cancel-button\s*\{[^}]*display:\s*none/, 'the browser\'s own x is not drawn beside ours');
  assert.match(block('#settingsModal .settings-search-status'), /clip:\s*rect\(0, 0, 0, 0\)/, 'read by a screen reader, drawn nowhere');
});
