const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// The extension has no bundler: popup.html and the service worker's
// importScripts() list are the module graph. These guards catch the mistakes
// that have broken it before (a background file never imported, a missing
// path, a script listed twice, a dependency loaded after its user).

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function workerImports() {
  const src = read('background.js');
  const block = src.slice(src.indexOf('importScripts('), src.indexOf(');', src.indexOf('importScripts(')));
  return [...block.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]);
}

function popupScripts() {
  return [...read('popup.html').matchAll(/<script\s+src="([^"]+)"/g)].map(m => m[1]);
}

function assertBefore(list, dependency, user) {
  assert.ok(list.includes(dependency), `${dependency} is registered`);
  assert.ok(list.includes(user), `${user} is registered`);
  assert.ok(list.indexOf(dependency) < list.indexOf(user), `${dependency} before ${user}`);
}

test('manifest files exist once per context and page summaries load at the isolated boundary', () => {
  const manifest = JSON.parse(read('manifest.json'));
  for (const entry of manifest.content_scripts) {
    assert.equal(new Set(entry.js).size, entry.js.length);
    for (const file of entry.js) assert.ok(fs.existsSync(path.join(root, file)), `${entry.world}: ${file}`);
  }
  const main = manifest.content_scripts.find(entry => entry.world === 'MAIN').js;
  const isolated = manifest.content_scripts.find(entry => entry.world !== 'MAIN').js;
  assert.ok(!main.some(file => /modules\/(core|settings)|public-summary/.test(file)), 'no shared globals loaded in MAIN');
  assertBefore(isolated, 'modules/detection/public-summary.js', 'modules/settings/settings-runtime.js');
  assertBefore(isolated, 'modules/settings/settings-runtime.js', 'content.js');
  assertBefore(main, 'modules/detection/conditions/window-condition-evaluator.js', 'content-main-world.js');
});

test('worker responsibilities never load popup sections', () => {
  assert.deepStrictEqual(workerImports().filter(file => file.startsWith('sections/')), []);
  assert.ok(!popupScripts().some(file => file.startsWith('background/')));
  assertBefore(workerImports(), 'modules/core/storage-manager.js', 'modules/settings/settings-store.js');
  assertBefore(workerImports(), 'background/runtime-state.js', 'background/init.js');
  assertBefore(workerImports(), 'background/detection-session-store.js', 'background/detection-lifecycle.js');
});

test('rules and integration graphs load dependencies before their users', () => {
  for (const graph of [popupScripts(), workerImports()]) {
    assertBefore(graph, 'modules/detection/rules/detector-schema.js', 'modules/detection/rules/detector-manager.js');
    assertBefore(graph, 'modules/detection/rules/historical-migrations.js', 'modules/detection/rules/detector-manager.js');
  }
  const graph = popupScripts();
  const files = ['options', 'parameters', 'codegen', 'ai-export', 'dialog'].map(name => `modules/integrations/scrapfly/${name}.js`);
  for (let i = 1; i < files.length; i++) assertBefore(graph, files[i - 1], files[i]);
  assertBefore(graph, 'modules/ui/modal-focus.js', 'sections/advanced/components/dialogs.js');
});

test('all popup and standalone stylesheets exist after feature ownership moves', () => {
  for (const page of ['popup.html', 'sections/stats/stats.html']) {
    for (const [, href] of read(page).matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) {
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(page), href)), `${page}: ${href}`);
    }
  }
});

const indexIn = (list, file) => list.indexOf(file);

test('every service-worker import exists and is listed once', () => {
  const list = workerImports();
  assert.ok(list.length > 20, 'import list parsed');
  for (const file of list) assert.ok(fs.existsSync(path.join(root, file)), `missing: ${file}`);
  const dupes = list.filter((f, i) => list.indexOf(f) !== i);
  assert.deepStrictEqual(dupes, []);
});

test('every background/ module is imported by the service worker', () => {
  const list = new Set(workerImports());
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : (e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  const missing = walk('background').filter(f => !list.has(f));
  assert.deepStrictEqual(missing, [], 'background files that never load');
});

test('every popup script exists and is listed once', () => {
  const list = popupScripts();
  for (const file of list) assert.ok(fs.existsSync(path.join(root, file)), `missing: ${file}`);
  const dupes = list.filter((f, i) => list.indexOf(f) !== i);
  assert.deepStrictEqual(dupes, []);
});

test('shared Advanced code dialog loads after its base and before every generator user', () => {
  const list = popupScripts();
  const dialog = 'sections/advanced/components/code-generator-dialog.js';
  assert.ok(indexIn(list, 'sections/advanced/base-advanced-module.js') < indexIn(list, dialog));
  assert.ok(indexIn(list, dialog) >= 0);
  for (const folder of ['akamai', 'awswaf', 'cloudflare', 'datadome', 'imperva', 'shapesecurity', 'turnstile', 'geetest']) {
    const suffix = folder === 'geetest' ? 'actions' : 'view';
    const user = `sections/advanced/vendors/${folder}/${suffix}.js`;
    assert.ok(indexIn(list, user) >= 0, `${user} is registered`);
    assert.ok(indexIn(list, dialog) < indexIn(list, user), `${dialog} before ${user}`);
  }
});

test('Turnstile site keys live with the Cloudflare tools and load before both of their users', () => {
  const list = popupScripts();
  const helper = 'sections/advanced/vendors/cloudflare/turnstile-sitekeys.js';
  assert.ok(indexIn(list, helper) >= 0, `${helper} is registered`);
  for (const user of ['sections/advanced/vendors/cloudflare/actions.js',
    'sections/advanced/vendors/turnstile/actions.js']) {
    assert.ok(indexIn(list, helper) < indexIn(list, user), `${helper} before ${user}`);
  }
});

test('HistoryStore loads before its users in both contexts', () => {
  const sw = workerImports();
  const store = 'modules/core/history-store.js';
  for (const user of ['background/history-recorder.js', 'background/history-retention.js', 'background/handlers/router-registry.js']) {
    assert.ok(indexIn(sw, store) >= 0 && indexIn(sw, store) < indexIn(sw, user), `worker: ${store} before ${user}`);
  }
  const popup = popupScripts();
  for (const user of ['sections/history/history.js', 'sections/settings/settings-ui-data.js']) {
    assert.ok(indexIn(popup, store) >= 0 && indexIn(popup, store) < indexIn(popup, user), `popup: ${store} before ${user}`);
  }
});

test('the combination checklist loads after the engine and before Detection and History, popup only', () => {
  const popup = popupScripts();
  const checklist = 'modules/ui/combination-checklist.js';
  assert.ok(indexIn(popup, checklist) >= 0, 'registered in the popup');
  assert.ok(indexIn(popup, 'modules/detection/detection-combinations.js') < indexIn(popup, checklist));
  for (const user of ['sections/history/history.js', 'sections/detection/detection-modals.js']) {
    assert.ok(indexIn(popup, checklist) < indexIn(popup, user), `${checklist} before ${user}`);
  }
  // history.js also runs in the service worker, which must not load the renderer
  assert.strictEqual(indexIn(workerImports(), checklist), -1);
});

test('nothing in the popup or settings writes scrapfly_history directly', () => {
  const offenders = [];
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : (e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));
  for (const file of [...walk('sections'), 'popup.js']) {
    const src = read(file);
    if (/storage\.local\.(set|remove)\(\s*[\[{][^)]*scrapfly_history/.test(src)) offenders.push(file);
  }
  assert.deepStrictEqual(offenders, [], 'history writes must go through the service worker (HistoryStore)');
});
