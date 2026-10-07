'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('modules/styles/advanced.css').replace(/\/\*[\s\S]*?\*\//g, '');
const html = read('sections/advanced/advanced.html');
function rule(selector, source = css) {
  const block = [...source.matchAll(/([^{}]+)\{([^{}]+)\}/g)]
    .find(([, selectors]) => selectors.trim() === selector);
  assert.ok(block, `Missing rule ${selector}`);
  return block[2];
}

test('empty history uses the shared Scrapfly card and decorative brand tile', () => {
  assert.match(html, /id="captureEmptyState" class="advanced-history-empty state-card state-card--blue"/);
  assert.match(html, /class="advanced-history-empty-icon" aria-hidden="true">\s*<img src="icons\/icon128.png" alt="" width="48" height="48"/);
  for (const key of ['advancedEmptyCapturesTitle', 'advancedEmptyCapturesHint',
    'advancedToolsLoadTools', 'advancedFooterHint']) assert.match(html, new RegExp(`data-i18n="${key}"`));
  assert.match(html, /type="button" id="captureOpenToolsBtn"/);
});

test('empty capture card has bounded readable layout without a fixed height', () => {
  const card = rule('.advanced-history-empty');
  assert.match(card, /max-width:\s*360px/);
  assert.match(card, /padding:\s*24px/);
  assert.match(card, /background:\s*var\(--bg-secondary\)/);
  assert.match(card, /border:\s*1px solid var\(--border\)/);
  assert.match(card, /min-height:\s*0/);
  assert.doesNotMatch(card, /(?:^|;)\s*(?:height|max-height):/);
  assert.match(rule('.advanced-history-empty-copy h3'), /font-size:\s*18px/);
  assert.match(rule('.advanced-history-empty-copy p'), /font-size:\s*13px/);
  assert.match(rule('.advanced-history-empty-copy p'), /overflow-wrap:\s*anywhere/);
});

test('primary Tools action is full-width blue and keyboard accessible', () => {
  const action = rule('.advanced-history-empty-action');
  assert.match(action, /width:\s*100%/);
  assert.match(action, /min-height:\s*44px/);
  assert.match(action, /background:\s*var\(--accent\)/);
  assert.match(action, /color:\s*var\(--text-primary\)/);
  assert.match(rule('.advanced-history-empty-action:focus-visible'), /outline:\s*2px solid var\(--accent-light\)/);
  assert.match(rule('.advanced-history-empty-action:hover'), /background:\s*var\(--accent-dark\)/);
});

test('retention guidance is a quiet wrapping card footer', () => {
  const footer = rule('.advanced-history-empty .advanced-retention-note');
  assert.match(footer, /border-top:\s*1px solid var\(--border\)/);
  assert.match(footer, /font-size:\s*11px/);
  assert.match(footer, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(footer, /background:/);
});

test('empty captures alone fill the remaining space below the unchanged sub-navigation', () => {
  const source = read('modules/styles/popup-scroll.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const centered = rule('#app > .main > #advancedTab > #advancedContent.is-captures-view.is-capture-history-empty', source);
  assert.match(centered, /flex:\s*1 0 auto/);
  assert.doesNotMatch(centered, /(?:display|overflow|height|position|transform):/);
  assert.match(rule('#capturesPanel.is-empty'), /padding:\s*32px 4px 20px/);
  assert.match(source, /#advancedContent\.is-no-tools:not\(\.is-captures-view\)/,
    'Tools empty-state centering remains separate');
});
