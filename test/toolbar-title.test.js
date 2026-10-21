'use strict';
// The toolbar icon's hover text names what the page has, so a glance answers
// without opening the popup.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
globalThis.FormatUtils = require('../utils/format-utils.js');
const ToolbarTitle = require('../modules/core/toolbar-title.js');

const d = (name, confidence) => ({ detector: { name }, confidence });

test('names up to three protections, strongest first, then how many more', () => {
  assert.strictEqual(ToolbarTitle.text('found', [d('DataDome', 90), d('Cloudflare', 95)]), 'Scrapfly: Cloudflare 95%, DataDome 90%');
  assert.strictEqual(
    ToolbarTitle.text('found', [d('A', 10), d('B', 20), d('C', 30), d('D', 40), d('E', 50)]),
    'Scrapfly: E 50%, D 40%, C 30%, +2 more'
  );
});

test('the same protection found twice is named once, at its higher confidence', () => {
  assert.strictEqual(ToolbarTitle.text('found', [d('Akamai', 60), d('Akamai', 80.4)]), 'Scrapfly: Akamai 80%');
});

test('clean, skipped and off pages say so; nameless results count as nothing found', () => {
  assert.strictEqual(ToolbarTitle.text('clean', []), 'Scrapfly: No protections found');
  assert.strictEqual(ToolbarTitle.text('found', [{}, null]), 'Scrapfly: No protections found');
  assert.strictEqual(ToolbarTitle.text('skipped'), 'Scrapfly: This site is not scanned');
  assert.strictEqual(ToolbarTitle.text('off'), 'Scrapfly: Detection is switched off');
});

test('the texts come from the translator it is given', () => {
  const tr = (key, fallback, ...args) => `[${key}${args.length ? ':' + args.join(',') : ''}]`;
  assert.strictEqual(ToolbarTitle.text('off', null, tr), 'Scrapfly: [toolbarTitleOff]');
  assert.strictEqual(ToolbarTitle.text('found', [d('A', 1), d('B', 2), d('C', 3), d('D', 4)], tr), 'Scrapfly: D 4%, C 3%, B 2%, [toolbarTitleMoreFmt:1]');
});

test('apply() sets the tab title and survives a closed tab or a browser without setTitle', async () => {
  const calls = [];
  const chrome = { action: { async setTitle(opts) { calls.push(opts); } } };
  assert.strictEqual(await ToolbarTitle.apply(chrome, 7, 'found', [d('Kasada', 88)]), 'Scrapfly: Kasada 88%');
  assert.deepStrictEqual(calls, [{ tabId: 7, title: 'Scrapfly: Kasada 88%' }]);
  assert.strictEqual(await ToolbarTitle.apply({ action: { async setTitle() { throw new Error('No tab with id'); } } }, 1, 'clean'), null);
  assert.strictEqual(await ToolbarTitle.apply({ action: {} }, 1, 'clean'), null);
  await ToolbarTitle.reset(chrome, 7);
  assert.deepStrictEqual(calls.at(-1), { tabId: 7, title: ToolbarTitle.DEFAULT });
});

test('the default is the manifest title, and the keys exist in English', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.strictEqual(ToolbarTitle.DEFAULT, manifest.action.default_title);
  const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));
  for (const key of ['toolbarTitleOff', 'toolbarTitleSkipped', 'toolbarTitleClean', 'toolbarTitleMoreFmt']) assert.ok(en[key], key);
});

test('every badge state of setBadgeForDetections sets its title', () => {
  const source = fs.readFileSync(path.join(root, 'background/utilities.js'), 'utf8');
  const body = source.slice(source.indexOf('async function setBadgeForDetections'), source.indexOf('async function requestDetectionForTab'));
  for (const state of ["'off'", "'skipped'", "'found', detectionResults", "'clean'"]) {
    assert.ok(body.includes(`setToolbarTitle(tabId, ${state}`), state);
  }
});

test('every place that paints a skipped, clean, off or count badge also sets the hover text', () => {
  const files = ['background/utilities.js', 'background/init.js', 'background/tab-events.js', 'background/handlers/messages-cache.js',
    'modules/detection/engine/detection-engine-manager.js', 'modules/settings/settings-runtime.js'];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const badges = (source.match(/text: BADGE\.TEXT\.(BLACKLISTED|CLEAN|DISABLED)/g) || []).length;
    const titles = (source.match(/ToolbarTitle\.apply\(|setToolbarTitle\(tabId/g) || []).length;
    assert.ok(titles >= badges, `${file}: ${badges} badge states, ${titles} hover texts`);
  }
});

test('an apply that waited for the texts and was overtaken by a newer scan sets nothing', async () => {
  const calls = [];
  let release;
  const saved = globalThis.I18n;
  globalThis.I18n = { ready: () => new Promise(r => { release = r; }), format: () => null };
  try {
    const chrome = { action: { async setTitle(opts) { calls.push(opts.title); } } };
    const late = ToolbarTitle.apply(chrome, 3, 'clean');
    await ToolbarTitle.reset(chrome, 3);
    release();
    assert.strictEqual(await late, null);
    assert.deepStrictEqual(calls, [ToolbarTitle.DEFAULT]);
  } finally {
    globalThis.I18n = saved;
  }
});
