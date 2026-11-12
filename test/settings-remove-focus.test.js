const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Settings: removing a skipped (or chosen) site or a webhook header redraws the list, and the button that was pressed is
// gone with it. The keyboard goes on to the row that took its place, or the one before it when it was the last, or to the
// control that adds one when the list is empty. Copying a template variable that the browser refuses says so.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function harness() {
  const doc = { activeElement: null };
  const control = (name) => ({ name, isConnected: true, dataset: {}, value: '', focus() { doc.activeElement = this; } });
  const button = (attributes) => {
    const handlers = {};
    return {
      ...control(`remove ${Object.values(attributes)[0]}`),
      getAttribute: (key) => attributes[key],
      addEventListener: (type, handler) => { (handlers[type] ||= []).push(handler); },
      click() { this.focus(); return Promise.all((handlers.click || []).map(handler => handler({ target: this }))); }
    };
  };
  // A list container that turns the markup it is given into its remove buttons (and, for the headers, its rows)
  const container = (pattern, attribute, rowClass) => {
    let buttons = [];
    let rows = [];
    return {
      set innerHTML(html) {
        for (const old of buttons) old.isConnected = false;
        buttons = [...html.matchAll(pattern)].map(match => button({ [attribute]: match[1] }));
        rows = rowClass ? [...html.matchAll(/data-index="(\d+)" style/g)].map(match => ({
          getAttribute: () => match[1],
          querySelector: () => ({ value: '', addEventListener() {} })
        })) : [];
      },
      querySelectorAll: (selector) => (selector === rowClass ? rows : buttons)
    };
  };
  const nodes = {
    '#blacklistContainer': container(/class="remove-blacklist-btn" data-domain="([^"]*)"/g, 'data-domain'),
    '#webhookHeadersContainer': container(/class="remove-webhook-header-btn" data-index="(\d+)"/g, 'data-index', '.webhook-header-item'),
    '#blacklistSearchInput': control('search'),
    '#addCurrentDomainBtn': control('add current page'),
    '#addWebhookHeaderBtn': control('add header')
  };
  const notices = [];
  const context = vm.createContext({
    console, JSON, Date, URL,
    document: Object.assign(doc, { querySelector: (selector) => nodes[selector] || null, querySelectorAll: () => [] }),
    navigator: {},
    Logger: { warn() {}, debug() {}, error() {} },
    NotificationHelper: { info() {}, micro: (text) => notices.push(['micro', text]), error: (text) => notices.push(['error', text]) },
    ScanScope: { listKeyOf: () => 'blacklistedDomains', modeOf: () => 'blocklist' }
  });
  // Loaded in the page's own globals, so its copy helper says what it says through this NotificationHelper
  vm.runInContext(read('modules/core/categories.js'), context);
  vm.runInContext(read('utils/format-utils.js') + '\nthis.FormatUtils = FormatUtils;', context);
  vm.runInContext(read('sections/settings/settings-ui.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-blacklist.js'), context);
  vm.runInContext(read('sections/settings/settings-ui-webhook.js'), context);
  const SettingsUI = vm.runInContext('SettingsUI', context);
  const ui = Object.assign(Object.create(SettingsUI), {
    escapeHtml: (text) => context.FormatUtils.escapeHtml(text),
    settings: { detection: {}, webhook: { webhookHeaders: [] } }
  });
  return { context, doc, nodes, ui, notices, SettingsUI };
}

const removeButtons = (h, list) => h.nodes[list].querySelectorAll('remove');

test('removing a site moves the keyboard to the next site, then the one before, then Add current page', async () => {
  const h = harness();
  h.ui.settings.detection.blacklistedDomains = ['a.test', 'b.test', 'c.test'];
  h.ui.renderBlacklistUI();
  await removeButtons(h, '#blacklistContainer')[0].click();
  assert.equal(h.doc.activeElement.name, 'remove b.test', 'the site that took its place');
  await removeButtons(h, '#blacklistContainer')[1].click();
  assert.equal(h.doc.activeElement.name, 'remove b.test', 'the last one removed: the one before it');
  await removeButtons(h, '#blacklistContainer')[0].click();
  assert.equal(h.doc.activeElement.name, 'add current page', 'nothing left: the button that adds one');
});

test('a search that no longer matches anything after a removal leaves the keyboard in the search box', async () => {
  const h = harness();
  h.ui.settings.detection.blacklistedDomains = ['a.test', 'other.example'];
  h.ui.blacklistSearch = 'a.test';
  h.ui.renderBlacklistUI();
  await removeButtons(h, '#blacklistContainer')[0].click();
  assert.equal(h.doc.activeElement.name, 'search');
});

test('removing a webhook header moves the keyboard to the next header, then the one before, then Add header', async () => {
  const h = harness();
  h.ui.settings.webhook.webhookHeaders = [{ name: 'A', value: '1' }, { name: 'B', value: '2' }, { name: 'C', value: '3' }];
  h.ui.renderWebhookHeadersUI();
  await removeButtons(h, '#webhookHeadersContainer')[1].click();
  assert.equal(h.doc.activeElement.isConnected, true);
  assert.equal(h.doc.activeElement.getAttribute('data-index'), '1', 'the header that took its place');
  await removeButtons(h, '#webhookHeadersContainer')[1].click();
  assert.equal(h.doc.activeElement.getAttribute('data-index'), '0', 'the last one removed: the one before it');
  await removeButtons(h, '#webhookHeadersContainer')[0].click();
  assert.equal(h.doc.activeElement.name, 'add header', 'nothing left: the button that adds one');
});

test('copying a template variable says so when the browser refuses the copy', async () => {
  const h = harness();
  let clickHandler = null;
  const overlay = {
    innerHTML: '', remove() {},
    addEventListener: (type, handler) => { if (type === 'click') clickHandler = handler; },
    querySelector: () => null
  };
  h.context.document.createElement = () => overlay;
  h.context.document.body = { appendChild() {} };
  h.context.WebhookBody = { VARIABLES: [{ token: '{{url}}', key: 'url', desc: 'Page address' }], sampleContext: () => ({}) };
  h.context.CloseButton = { html: () => '' };
  h.context.chrome = { tabs: { query: async () => [] } };
  h.context.navigator.clipboard = { writeText: async () => { throw new Error('Document is not focused'); } };
  await h.SettingsUI.openWebhookVariablesHelp.call(h.ui);
  const copy = { dataset: { token: '{{url}}' } };
  await clickHandler({ target: { closest: (selector) => (selector === '.webhook-vars-copy' ? copy : null) } });
  assert.deepEqual(h.notices.map(entry => entry[0]), ['error'], 'a failed copy is said, not only logged');
  h.notices.length = 0;
  h.context.navigator.clipboard = { writeText: async () => {} };
  await clickHandler({ target: { closest: (selector) => (selector === '.webhook-vars-copy' ? copy : null) } });
  assert.deepEqual(h.notices.map(entry => entry[0]), ['micro'], 'a copy that worked still says Copied');
});
