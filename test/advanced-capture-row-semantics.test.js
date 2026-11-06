const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Advanced → History: a capture row was role="button" with two buttons (Copy, Delete) inside it. A button's children are presentational
// in ARIA, so a screen reader's browse mode may not reach Copy and Delete at all. The row is now a labelled group holding three real
// buttons: the one that opens the capture (it carries the logo and the text, so the whole row is still the click target), Copy and
// Delete. The "?" Help dialog was a bare overlay: no dialog role or name, Tab walked the page behind it and the focus did not come back.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// ---- The rows ----
function render(captures) {
  const grid = { innerHTML: '', querySelectorAll: () => [] };
  const context = vm.createContext({ window: {}, URL, console, Logger: { ui() {}, debug() {}, error(...args) { throw args[1] || args[0]; } },
    FormatUtils: require('../utils/format-utils.js'),
    AdvancedUtils: { getTimeAgo: () => '2 minutes ago', formatBytes: () => '630 B' },
    UrlUtils: { resolveDisplayFavicon: () => '', getHostnameFromUrl: (url) => new URL(url).hostname, getDefaultFaviconUrl: () => 'favicon.png' },
    document: { querySelectorAll: () => [] } });
  vm.runInContext(read('modules/advanced/vendor-registry.js'), context);
  for (const file of ['advanced.js', 'history/controller.js', 'history/view.js']) vm.runInContext(read(`sections/advanced/${file}`), context, { filename: file });
  const advanced = new context.window.Advanced({}, {});
  let bound = 0;
  advanced.setupCaptureCardListeners = () => { bound++; };
  advanced.renderCaptureCards(captures, { querySelector: () => grid });
  assert.equal(bound, 1);
  return grid.innerHTML;
}

const entry = (id, data) => ({ id, moduleId: 'akamai', moduleName: 'Akamai', url: 'https://shop.example/login', timestamp: Date.now(), data });
const rowsOf = (html) => html.split('<div class="capture-card cap-row"').slice(1).map(part => `<div class="capture-card cap-row"${part}`);

test('a row is a labelled group, not a button, and cannot take the focus itself', () => {
  const rows = rowsOf(render([entry('c1', { sensorData: 'x' }), entry('c2', { schemaVersion: 1, tool: 'analysis', result: {} })]));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    const open = row.match(/^<div class="capture-card cap-row"[^>]*>/)[0];
    assert.match(open, /role="group"/);
    assert.match(open, /aria-label="[^"]+ · Akamai · shop\.example"/, 'what the row holds, for the Copy and Delete buttons that have no words of their own');
    assert.doesNotMatch(open, /role="button"/);
    assert.doesNotMatch(open, /tabindex/, 'the open button is the stop, not the row');
    assert.match(open, /data-module-id="akamai"/);
    assert.match(open, /data-capture-id="c\d"/);
  }
  assert.match(rows[0], /aria-label="Capture · Akamai · shop\.example"/);
  assert.match(rows[1], /aria-label="Analyze Scripts · Akamai · shop\.example"/);
});

test('the row has three real buttons side by side: open (logo and text), Copy and Delete; none inside another', () => {
  const [row] = rowsOf(render([entry('c1', { sensorData: 'x' })]));
  assert.equal((row.match(/<button\b/g) || []).length, 3);
  assert.equal((row.match(/<\/button>/g) || []).length, 3);
  const open = row.match(/<button type="button" class="cap-row-open" aria-label="([^"]*)">([\s\S]*?)<\/button>/);
  assert.ok(open, 'a button for the open action');
  assert.equal(open[1], 'View: Capture · Akamai · shop.example', 'the same name the row had as a button');
  assert.doesNotMatch(open[2], /<button\b/, 'no button inside a button');
  assert.match(open[2], /class="cap-row-mark"/, 'the logo is inside it: the whole left of the row is one target');
  assert.match(open[2], /class="cap-row-tool">Capture<\/span>/);
  assert.match(open[2], /class="cap-row-vendor">Akamai<\/span>/);
  assert.match(open[2], /class="cap-row-place"/);
  assert.match(open[2], /class="cap-row-size">630 B<\/span>/);
  const rest = row.slice(row.indexOf('</button>') + '</button>'.length);
  assert.match(rest, /<button type="button" class="capture-action-btn cap-row-btn" data-action="copy" title="Copy" aria-label="Copy">/);
  assert.match(rest, /<button type="button" class="capture-action-btn cap-row-btn cap-row-btn--danger" data-action="delete" title="Delete" aria-label="Delete">/);
});

test('the names stay safe: a vendor or tool name with markup is escaped in the labels', () => {
  const [row] = rowsOf(render([{ ...entry('c1', { schemaVersion: 1, tool: 'analysis' }), moduleName: 'A"><img src=x>' }]));
  assert.doesNotMatch(row, /<img src=x>/);
  assert.match(row, /aria-label="Analyze Scripts · A&quot;&gt;&lt;img src=x&gt; · shop\.example"/);
});

test('the stylesheet lays the open button out as the row did: it fills what the actions leave, draws nothing of its own, and the row shows the focus ring', () => {
  const css = read('sections/advanced/styles/panels.css');
  const rule = css.match(/\.cap-row-open\s*\{([^}]*)\}/);
  assert.ok(rule, 'a rule for the open button');
  assert.match(rule[1], /display:\s*flex/);
  assert.match(rule[1], /flex:\s*1 1 auto/);
  assert.match(rule[1], /min-width:\s*0/);
  assert.match(rule[1], /background:\s*none/);
  assert.match(rule[1], /border:\s*0/);
  assert.match(rule[1], /text-align:\s*start/);
  assert.match(css, /\.cap-row:has\(\.cap-row-open:focus-visible\)\s*\{[^}]*outline:\s*2px solid var\(--accent\)/, 'the same ring around the whole row');
  assert.doesNotMatch(css, /\.cap-row:focus-visible/, 'the row is no longer focusable');
});

// ---- The Help dialog ----
const html = read('sections/advanced/advanced.html');

test('the Help dialog is a modal dialog named by its title', () => {
  const dialog = html.match(/<div class="advanced-info-container"[^>]*>/)[0];
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
  const labelled = dialog.match(/aria-labelledby="([^"]+)"/);
  assert.ok(labelled, 'named');
  const title = html.match(new RegExp(`<h3 id="${labelled[1]}"[^>]*>`));
  assert.ok(title, 'by the heading with that id');
  assert.match(title[0], /data-i18n="advancedModalTitle"/, 'an existing string, in the interface language');
});

function helpFixture({ realFocus = true } = {}) {
  const listeners = [];
  const doc = { activeElement: null,
    addEventListener(type, fn) { listeners.push({ type, fn }); },
    removeEventListener(type, fn) { const at = listeners.findIndex(entry => entry.type === type && entry.fn === fn); if (at >= 0) listeners.splice(at, 1); } };
  const control = (name) => ({ name, hidden: false, isConnected: true, getClientRects: () => [{}], focus() { doc.activeElement = this; } });
  const opener = control('help-button');
  const close = control('close');
  const outside = control('page-behind');
  const container = { querySelectorAll: () => [close], contains: (el) => el === close, hasAttribute: () => true };
  const modal = { style: { display: 'none' }, querySelectorAll: () => [],
    querySelector: (selector) => (selector === '.advanced-info-container' ? container : selector === '#closeAdvancedInfoModal' ? close : null) };
  doc.querySelector = (selector) => (selector === '#advancedInfoModal' ? modal : selector === '#closeAdvancedInfoModal' ? close : null);
  const activations = [];
  const context = vm.createContext({ window: {}, console, document: doc, Advanced: function() {}, FormatUtils: { categoryIconSvg: () => '', DEFAULT_CATEGORY_COLORS: {} } });
  if (realFocus) vm.runInContext(read('modules/ui/modal-focus.js'), context);
  else context.ModalFocus = { activate(dialog, options) { activations.push({ dialog, options, released: 0 }); const entry = activations.at(-1); return () => { entry.released++; }; } };
  vm.runInContext(read('sections/advanced/advanced-modals.js'), context);
  const advanced = new context.Advanced();
  const key = (type, init) => { const event = { type, defaultPrevented: false, stopped: false, preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...init };
    for (const entry of [...listeners]) if (entry.type === type && !event.stopped) entry.fn(event); return event; };
  return { advanced, modal, container, close, opener, outside, doc, listeners, activations, key };
}

test('opening the dialog moves the focus into it, Tab stays on it, and Escape closes it and gives the focus back to the "?" button', () => {
  const f = helpFixture();
  f.opener.focus();
  f.advanced.openAdvancedInfoModal();
  assert.equal(f.modal.style.display, 'flex');
  assert.equal(f.doc.activeElement, f.close, 'the focus is in the dialog');
  const tab = f.key('keydown', { key: 'Tab', shiftKey: false });
  assert.equal(tab.defaultPrevented, true, 'Tab is handled by the dialog, not by the page behind it');
  assert.equal(f.doc.activeElement, f.close, 'the only control: Tab comes back to it');
  f.key('keydown', { key: 'Tab', shiftKey: true });
  assert.equal(f.doc.activeElement, f.close);
  // Focus that gets out anyway (a click on the page behind) is pulled back
  f.outside.focus();
  f.key('focusin', { target: f.outside });
  assert.equal(f.doc.activeElement, f.close, 'a stray focus is brought back');
  const escape = f.key('keydown', { key: 'Escape' });
  assert.equal(escape.defaultPrevented, true);
  assert.equal(f.modal.style.display, 'none', 'Escape closes it');
  assert.equal(f.doc.activeElement, f.opener, 'back on the button that opened it');
  assert.deepEqual(f.listeners.map(entry => entry.type), [], 'nothing is left listening');
});

test('closing returns the focus to the button; opening twice holds one scope; closing twice is harmless; it opens again as before', () => {
  const f = helpFixture();
  f.opener.focus();
  f.advanced.openAdvancedInfoModal();
  f.advanced.openAdvancedInfoModal();
  assert.equal(f.listeners.filter(entry => entry.type === 'keydown').length, 1, 'one scope, not two');
  f.advanced.closeAdvancedInfoModal();
  assert.equal(f.modal.style.display, 'none');
  assert.equal(f.doc.activeElement, f.opener);
  f.advanced.closeAdvancedInfoModal();
  assert.equal(f.doc.activeElement, f.opener);
  assert.deepEqual(f.listeners, []);
  // And it opens again as before
  f.advanced.openAdvancedInfoModal();
  assert.equal(f.doc.activeElement, f.close);
  f.advanced.closeAdvancedInfoModal();
  assert.equal(f.doc.activeElement, f.opener);
});

test('the dialog asks the shared focus helper for the dialog box itself, closing through its own close method, starting on the close button', () => {
  const f = helpFixture({ realFocus: false });
  f.advanced.openAdvancedInfoModal();
  assert.equal(f.activations.length, 1);
  assert.equal(f.activations[0].dialog, f.container);
  assert.equal(f.activations[0].options.initialFocus, f.close);
  f.activations[0].options.onClose();
  assert.equal(f.modal.style.display, 'none');
  assert.equal(f.activations[0].released, 1, 'released once, so the helper gives the focus back');
});

test('the Escape handler of the page is gone: the shared helper closes the dialog (a second handler would close it twice)', () => {
  const source = read('sections/advanced/advanced-modals.js');
  assert.doesNotMatch(source, /document\.addEventListener\('keydown'/);
});
