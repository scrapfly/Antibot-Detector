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

function pageScripts(page) {
  return [...read(page).matchAll(/<script\s+src="([^"]+)"/g)].map(m => path.posix.join(path.posix.dirname(page), m[1]));
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

test('every script that reads a shared global module loads after it, in the popup, the worker, the stats page, the bulk scan page and the content script', () => {
  const stats = pageScripts('sections/stats/stats.html');
  const bulk = pageScripts('sections/bulk/bulk.html');
  const manifest = JSON.parse(read('manifest.json'));
  const contexts = {
    popup: popupScripts(), worker: workerImports(), stats, bulk,
    content: manifest.content_scripts.find(entry => entry.world !== 'MAIN').js
  };
  const MODULES = {
    Categories: 'modules/core/categories.js', CaptureRetention: 'modules/core/capture-retention.js', DomainList: 'modules/core/domain-list.js', ScanScope: 'modules/core/scan-scope.js',
    WebhookFilter: 'modules/core/webhook-filter.js', WebhookLog: 'modules/core/webhook-log.js', MessageSender: 'modules/core/message-sender.js', CookieTimeline: 'modules/core/cookie-timeline.js',
    WorkerMessages: 'modules/core/worker-messages.js', HistoryFilter: 'modules/core/history-filter.js', HistoryCompare: 'modules/core/history-compare.js',
    StorageOverview: 'modules/settings/storage-overview.js', BackupBundle: 'modules/settings/backup-bundle.js', DiagnosticsReport: 'modules/settings/diagnostics-report.js',
    SettingsPresets: 'modules/settings/settings-presets.js', SettingsTransfer: 'modules/settings/settings-transfer.js',
    RuleSuggest: 'modules/core/rule-suggest.js',
    BulkScan: 'modules/core/bulk-scan.js'
  };
  const readers = Object.fromEntries(Object.keys(MODULES).map(name => [name, 0]));
  for (const [global, module] of Object.entries(MODULES)) {
    for (const graph of Object.values(contexts)) {
      for (const file of graph.filter(entry => entry !== module && new RegExp(`\\b${global}\\.`).test(read(entry)))) {
        readers[global]++;
        assertBefore(graph, module, file);
      }
    }
    // The page's own world shares its globals with the site, so nothing shared is loaded there
    assert.ok(!manifest.content_scripts.find(entry => entry.world === 'MAIN').js.includes(module));
  }
  assert.ok(readers.Categories >= 20, 'the guard finds the scripts that use the category module');
  assert.ok(readers.CaptureRetention >= 4, 'the guard finds the scripts that use the capture retention module');
  assert.ok(readers.DomainList >= 2 && readers.ScanScope >= 3, 'the guard finds the scripts that use the site list modules');
  assert.ok(readers.CookieTimeline >= 2, 'the guard finds the worker recorder and the Check Cookies window');
  assert.ok(readers.WebhookFilter >= 2 && readers.WebhookLog >= 2 && readers.MessageSender >= 3, 'the guard finds the scripts that use the webhook and sender modules');
  assert.ok(readers.WorkerMessages >= 20, 'the guard finds the scripts that send or handle worker messages');
  assert.ok(readers.BulkScan >= 2, 'the guard finds the bulk scan page and its worker');
  assert.ok(readers.HistoryFilter >= 1 && readers.StorageOverview >= 1 && readers.BackupBundle >= 1 && readers.DiagnosticsReport >= 1 && readers.SettingsPresets >= 1 && readers.SettingsTransfer >= 2, 'the guard finds the popup modules\' users');
});

test('rules and integration graphs load dependencies before their users', () => {
  for (const graph of [popupScripts(), workerImports()]) {
    assertBefore(graph, 'modules/detection/rules/detector-schema.js', 'modules/detection/rules/detector-manager.js');
    assertBefore(graph, 'modules/detection/rules/historical-migrations.js', 'modules/detection/rules/detector-manager.js');
  }
  const graph = popupScripts();
  const files = ['options', 'parameters', 'codegen', 'ai-export', 'dialog'].map(name => `modules/integrations/scrapfly/${name}.js`);
  for (let i = 1; i < files.length; i++) assertBefore(graph, files[i - 1], files[i]);
  // The replay kit quotes as the Scrapfly code does, and the copy menu uses it
  assertBefore(graph, 'modules/integrations/scrapfly/codegen.js', 'modules/integrations/replay-kit.js');
  assertBefore(graph, 'modules/integrations/replay-kit.js', 'sections/detection/detection-actions.js');
  assertBefore(graph, 'modules/ui/modal-focus.js', 'sections/advanced/components/dialogs.js');
});

test('the bulk scan page lists its own scripts: each exists once, in dependency order, none from the worker or the popup sections', () => {
  const list = pageScripts('sections/bulk/bulk.html');
  assert.ok(list.length >= 5, 'script list parsed');
  for (const file of list) assert.ok(fs.existsSync(path.join(root, file)), `missing: ${file}`);
  assert.deepStrictEqual(list.filter((f, i) => list.indexOf(f) !== i), []);
  assert.ok(!list.some(file => file.startsWith('background/') || (file.startsWith('sections/') && !file.startsWith('sections/bulk/'))));
  assert.equal(list[list.length - 1], 'sections/bulk/bulk.js', 'the page script runs last');
  for (const dependency of ['modules/core/worker-messages.js', 'modules/core/i18n.js', 'modules/core/storage-manager.js', 'modules/core/categories.js', 'utils/format-utils.js', 'modules/core/bulk-scan.js']) {
    assertBefore(list, dependency, 'sections/bulk/bulk.js');
  }
  assertBefore(list, 'modules/core/categories.js', 'modules/core/bulk-scan.js');
  assertBefore(list, 'modules/core/worker-messages.js', 'modules/core/logger.js');
});

test('all popup and standalone stylesheets exist after feature ownership moves', () => {
  for (const page of ['popup.html', 'sections/stats/stats.html', 'sections/bulk/bulk.html']) {
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
  // the vendors whose popup code opens the code generator (the others lost their generators in 2.8.7)
  for (const folder of ['akamai', 'imperva', 'shapesecurity', 'geetest']) {
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
  for (const user of ['sections/advanced/vendors/cloudflare/sitekey-view.js',
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
