'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// What a screen reader is told on the Detection tab. A search or a chip that leaves fewer results, a page turned, a scan that
// ends in a card ("Nothing detected", "Scan failed") all changed the screen and nothing else: the no-match message toggles
// `hidden`, the footer text is plain, the cards swap. One persistent status region (role="status", polite) carries the count
// or the card's title. It sits outside every state card, which are display:none most of the time: a live region that appears
// together with its text is not reliably read.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function element() {
  let text = '';
  const children = [];
  const attributes = new Map();
  return {
    style: {}, value: '', disabled: false, hidden: false,
    classList: { add() {}, remove() {}, toggle() {} },
    get textContent() { return text + children.map(child => child.textContent).join(''); },
    set textContent(value) { text = String(value); children.length = 0; },
    appendChild(child) { children.push(child); },
    setAttribute(key, value) { attributes.set(key, value); },
    removeAttribute(key) { attributes.delete(key); },
    hasAttribute(key) { return attributes.has(key); },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

function fixture() {
  const status = { textContent: '' };
  const els = {};
  const input = element(), total = element(), info = element(), prev = element(), next = element();
  const container = element();
  const nodes = { '.page-input': input, '.total-pages': total, '.pagination-info': info,
    '.pagination-btn-prev, .pagination-prev': prev, '.pagination-btn-next, .pagination-next': next };
  container.querySelector = selector => nodes[selector] || null;
  // The Nothing detected / failed / interrupted card
  const title = element(), description = element(), card = element();
  const emptyState = element();
  emptyState.querySelector = selector => ({ '.state-card-title': title, '.state-card-description': description, '.state-card': card })[selector] || null;
  Object.assign(els, {
    '#detectionStatus': status, '#detectionPagination': container, '#detectionPagination .pagination-info': info,
    '#detectionNoResults': element(), '#emptyState': emptyState, '#emptyState .state-card-title': title, '#emptyState .state-card-description': description,
    '#emptyRescanBtn': element(), '#loadingState': element(), '#detectionResults': element(), '#disabledState': element(),
    '#blacklistWarning': element(), '#interruptedState': element(), '#blacklistDomain': element()
  });
  const context = { window: {}, self: {}, console, Logger: { error() {}, debug() {}, warn() {} },
    setTimeout: () => 0, clearTimeout() {},
    chrome: { tabs: { query() {} }, runtime: { getURL: path => path } },
    document: { querySelector: selector => els[selector] || null, querySelectorAll: () => [], createElement: element, createTextNode: text => ({ textContent: text }) } };
  vm.createContext(context);
  for (const file of ['modules/core/categories.js', 'modules/core/detection-filter.js', 'utils/format-utils.js', 'utils/detection-utils.js',
    'modules/ui/pagination-manager.js', 'sections/detection/detection.js', 'sections/detection/detection-ui.js', 'sections/detection/detection-actions.js']) {
    vm.runInContext(read(file), context, { filename: file });
  }
  const detection = Object.create(context.window.Detection.prototype);
  Object.assign(detection, {
    renderDetectionsPage() {}, closeDetectionModal() {}, clearBadgeForEmptyState: async () => {}, isExtensionEnabled: true,
    currentResults: ['Canvas', 'Audio', 'Fonts'].map(name => ({ detector: { name }, category: 'Fingerprint' }))
  });
  detection.setupPagination();
  return { detection, status, els, info, UI: context.DetectionUI };
}

test('the tab has one persistent status region, outside every state card, announced politely and as a whole', () => {
  const html = read('sections/detection/detection.html').replace(/<!--[\s\S]*?-->/g, '');
  const tags = [...html.matchAll(/<div\b[^>]*\bid="detectionStatus"[^>]*>/g)];
  assert.equal(tags.length, 1, 'one region');
  const tag = tags[0][0];
  assert.match(tag, /\brole="status"/);
  assert.match(tag, /\baria-live="polite"/);
  assert.match(tag, /\baria-atomic="true"/);
  assert.doesNotMatch(tag, /\bhidden\b|display\s*:\s*none/, 'never hidden: a hidden region is not in the accessibility tree');
  // A top-level block of the template: the state cards (display:none most of the time) are its siblings, not its parents
  const before = html.slice(0, tags[0].index);
  const depth = (before.match(/<div\b/g) || []).length - (before.match(/<\/div>/g) || []).length;
  assert.equal(depth, 0, 'not inside #loadingState, #emptyState, #detectionResults or any other block');
  assert.match(read('sections/detection/detection.css'), /\.detection-status\s*\{[^}]*clip\s*:\s*rect\(0[^}]*\}/, 'read out, never drawn');
});

test('the list is read out as the footer shows it, and by the no-match line when the search or chips leave nothing', () => {
  const { detection, status, info } = fixture();
  detection.paginationManager.setItems(detection.currentResults);
  assert.equal(info.textContent, 'Showing 1-2 of 3');
  assert.equal(status.textContent, 'Showing 1-2 of 3', 'results drawn');
  detection.paginationManager.nextPage();
  assert.equal(status.textContent, 'Showing 3-3 of 3', 'a page turned');
  detection.handleSearch('no matching protection');
  assert.equal(status.textContent, 'No entries match your search or filters.', 'nothing left');
  detection.handleSearch('canvas');
  assert.equal(status.textContent, 'Showing 1-1 of 1', 'one left');
  detection.handleSearch('');
  assert.equal(status.textContent, 'Showing 1-2 of 3', 'the search cleared');
});

test('a scan that ends in a card is read out by the card\'s title; the next scan starts from silence, so the same outcome is heard again', () => {
  const { detection, status, els } = fixture();
  detection.showEmptyState({ outcome: 'failed' });
  assert.equal(els['#emptyState .state-card-title'].textContent, 'Scan failed');
  assert.equal(status.textContent, 'Scan failed');
  detection.showAnalyzingState();
  assert.equal(status.textContent, '', 'a new scan clears what the last one said');
  detection.showEmptyState({ outcome: 'failed' });
  assert.equal(status.textContent, 'Scan failed', 'heard again');
  detection.showAnalyzingState();
  detection.showEmptyState({});
  assert.equal(status.textContent, 'Nothing detected');
  detection.showEmptyState({ outcome: 'unscanned' });
  assert.equal(status.textContent, 'No completed scan');
  detection.showEmptyState({ outcome: 'interrupted' });
  assert.equal(status.textContent, 'Scan interrupted');
  detection.showEmptyState({ outcome: 'unsupported' });
  assert.equal(status.textContent, 'This page cannot be scanned');
});

test('results after a scan are read out too, and a paused or switched-off tab leaves nothing stale in the region', () => {
  const { detection, status } = fixture();
  const results = detection.currentResults.slice();
  detection.showAnalyzingState();
  detection.paginationManager.setItems(results);
  assert.equal(status.textContent, 'Showing 1-2 of 3', 'the scan ended in results');
  detection.showDisabledState();
  assert.equal(status.textContent, '', 'switched off: browse mode finds no old count');
  detection.isExtensionEnabled = true;
  detection.currentResults = results;
  detection.paginationManager.setItems(results);
  assert.equal(status.textContent, 'Showing 1-2 of 3');
  detection.blacklistedDomain = null;
  detection.showBlacklistState('shop.example');
  assert.equal(status.textContent, '', 'paused for a site');
});

test('without the region (the template not loaded yet) nothing throws', () => {
  const { detection, els } = fixture();
  delete els['#detectionStatus'];
  assert.doesNotThrow(() => {
    detection.paginationManager.setItems(detection.currentResults);
    detection.showEmptyState({ outcome: 'failed' });
    detection.showAnalyzingState();
  });
});
