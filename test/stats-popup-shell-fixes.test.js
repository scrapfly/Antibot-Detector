'use strict';
// 3.1.6: the Statistics counts read right for 1 and for many, and the popup's on/off switch never says something that was not saved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const messages = (locale) => JSON.parse(fs.readFileSync(path.join(root, '_locales', locale, 'messages.json'), 'utf8'));
const INFLECTING = ['ar', 'cs', 'de', 'en', 'es', 'fr', 'hi', 'it', 'nl', 'pl', 'pt_BR', 'ru', 'sv', 'uk'];
const labelled = (message, index) => new RegExp(`[:：]\\s*\\{${index}\\}`).test(message);

test('the confidence count and the export count are labels, never a number before a noun', () => {
  for (const locale of INFLECTING) {
    const all = messages(locale);
    assert.ok(labelled(all.statsConfidenceKnownFmt.message, 0) && labelled(all.statsConfidenceKnownFmt.message, 1), `${locale} statsConfidenceKnownFmt: "${all.statsConfidenceKnownFmt.message}"`);
    if (locale === 'ar' || locale === 'hi' || locale === 'ru') assert.ok(labelled(all.statsExportScopeFmt.message, 0), `${locale} statsExportScopeFmt: "${all.statsExportScopeFmt.message}"`);
  }
});

function popupWith(settingsStub) {
  const toggle = { checked: true };
  const errors = [];
  const context = vm.createContext({
    console, URLSearchParams,
    document: { addEventListener() {}, querySelector: (s) => (s === '#enableToggle' ? toggle : null) },
    window: { addEventListener() {} }, location: { search: '' },
    Settings: settingsStub, Logger: { error() {}, ui() {} },
    NotificationHelper: { error: (m) => errors.push(m) },
    FormatUtils: { t: (key, fallback, ...args) => fallback.replace('{0}', args[0]) }
  });
  context.globalThis = context;
  context.ScrapflyBridgeProtocol = { MESSAGE_TYPES: {} };
  vm.runInContext(fs.readFileSync(path.join(root, 'popup.js'), 'utf8') + '\n;globalThis.ScrapflyPopup = ScrapflyPopup;', context);
  const view = Object.create(context.ScrapflyPopup.prototype);
  view.detection = { setExtensionEnabled() {}, showDisabledState() {}, showEmptyState() {} };
  view.beginDetectionViewRequest = () => 1;
  view.currentTab = 'history';
  return { view, toggle, errors };
}

test('a switch that could not be saved goes back to where it was', async () => {
  const off = popupWith({ handleEnableToggle: async () => { throw new Error('quota'); } });
  off.toggle.checked = false; // the person just turned it off
  await off.view.handleEnableToggle(false);
  assert.equal(off.toggle.checked, true, 'still on, as stored');
  assert.equal(off.errors.length, 1);
  const on = popupWith({ handleEnableToggle: async () => { throw new Error('quota'); } });
  on.toggle.checked = true;
  await on.view.handleEnableToggle(true);
  assert.equal(on.toggle.checked, false);
});

test('a switch that was saved stays where the person put it', async () => {
  const ok = popupWith({ handleEnableToggle: async () => {} });
  ok.toggle.checked = false;
  await ok.view.handleEnableToggle(false);
  assert.equal(ok.toggle.checked, false);
});

// ---- Statistics → Export → Copy summary ----
const { createPage, entry } = require('./stats-page-harness.js');
const en = messages('en');
const pages = () => [entry('alpha.example', 0, [['Cloudflare', 'antibot', 50]]), entry('beta.example', 1, [])];

test('Copy summary puts the Markdown of the shown range on the clipboard and says so', async () => {
  const copied = [];
  const ui = await createPage(pages(), { clipboard: async (text) => { copied.push(text); } });
  await ui.button('export', 'copy').events.click();
  assert.deepEqual(copied, ['SUMMARY 2 30']);
  assert.equal(ui.text('statsStatus'), en.statsExportCopied.message);
  assert.equal(ui.id('statsStatus').classes.has('stats-status--error'), false);
});

test('a clipboard that refuses is an error on the page, not silence', async () => {
  const ui = await createPage(pages(), { clipboard: async () => { throw new Error('denied'); } });
  await ui.button('export', 'copy').events.click();
  assert.equal(ui.text('statsStatus'), en.statsExportCopyFailed.message);
  assert.equal(ui.id('statsStatus').classes.has('stats-status--error'), true);
});
