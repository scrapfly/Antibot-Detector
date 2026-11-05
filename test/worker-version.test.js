const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// An unpacked extension that is edited without a reload: the popup's files are read fresh on every open, the service worker
// still runs the code it had. The popup asks the worker for a fingerprint of the message names it knows
// (WorkerMessages.WORKER_FINGERPRINT) and says so, once, when it differs or the worker does not know the question.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const WorkerMessages = require('../modules/core/worker-messages.js');
const WorkerVersion = require('../modules/core/worker-version.js');

const HINT = "The extension's background part is out of date. Reload the extension on the extensions page and try again.";

test('the fingerprint is the same for the same names in any order, and changes when one is added, removed or renamed', () => {
  const a = WorkerVersion.fingerprintOf({ ONE: 'ONE', TWO: 'TWO', THREE: 'THREE' });
  assert.match(a, /^[0-9a-f]{8}-3$/, 'a hash and how many names');
  assert.equal(WorkerVersion.fingerprintOf({ THREE: 'THREE', ONE: 'ONE', TWO: 'TWO' }), a, 'order does not matter');
  assert.notEqual(WorkerVersion.fingerprintOf({ ONE: 'ONE', TWO: 'TWO' }), a, 'one removed');
  assert.notEqual(WorkerVersion.fingerprintOf({ ONE: 'ONE', TWO: 'TWO', THREE: 'THREE', FOUR: 'FOUR' }), a, 'one added');
  assert.notEqual(WorkerVersion.fingerprintOf({ ONE: 'ONE', TWO: 'TWO', THIRD: 'THIRD' }), a, 'one renamed');
  assert.equal(WorkerVersion.fingerprintOf({}), WorkerVersion.fingerprintOf(null), 'nothing is nothing');
});

test('the real registry has the question, and the worker answers it with the fingerprint of the registry it loaded', () => {
  assert.equal(WorkerMessages.WORKER_FINGERPRINT, 'WORKER_FINGERPRINT');
  assert.deepEqual(WorkerVersion.answer(WorkerMessages), { status: 'ok', fingerprint: WorkerVersion.fingerprintOf(WorkerMessages) });
});

test('isOutdated: a worker that does not know the question or whose list differs is out of date; the same list is current; no answer says nothing', async () => {
  const own = WorkerVersion.fingerprintOf(WorkerMessages);
  const ask = (reply) => WorkerVersion.isOutdated(async () => reply, WorkerMessages);
  assert.equal(await ask({ status: 'unknown' }), true, 'a worker from before this check');
  assert.equal(await ask({ status: 'ok', fingerprint: own }), false, 'current');
  assert.equal(await ask({ status: 'ok', fingerprint: '00000000-1' }), true, 'it runs another list of messages');
  for (const reply of [undefined, null, {}, { status: 'ok' }, { status: 'error', error: 'x' }, { status: 'ok', fingerprint: 7 }]) {
    assert.equal(await ask(reply), null, JSON.stringify(reply) || 'no reply');
  }
  assert.equal(await WorkerVersion.isOutdated(async () => { throw new Error('Could not establish connection'); }, WorkerMessages), null, 'a worker that is not there');
  // and what is sent is the registry's own question
  const sent = [];
  await WorkerVersion.isOutdated(async (message) => { sent.push(message); return undefined; }, WorkerMessages);
  assert.deepEqual(sent, [{ type: 'WORKER_FINGERPRINT' }]);
});

/** ScrapflyPopup's warnIfWorkerOutdated with a fake worker. */
function popupWith(reply) {
  const toasts = [];
  const sent = [];
  const context = vm.createContext({
    ScrapflyBridgeProtocol: { MESSAGE_TYPES: {} },
    Logger: { debug() {}, error() {}, popup() {} },
    window: { addEventListener() {} },
    document: { addEventListener() {} },
    WorkerMessages, WorkerVersion,
    FormatUtils: { t: (key, fallback) => fallback },
    NotificationHelper: { error: (text) => toasts.push(text) },
    chrome: { runtime: { sendMessage: async (message) => { sent.push(message); if (reply instanceof Error) throw reply; return reply; } } }
  });
  vm.runInContext(read('popup.js') + '\nthis.ScrapflyPopup = ScrapflyPopup;', context, { filename: 'popup.js' });
  const popup = Object.create(context.ScrapflyPopup.prototype);
  return { popup, toasts, sent };
}

test('the popup says the background part is out of date, once, in the words History and Settings already use', async () => {
  const own = WorkerVersion.fingerprintOf(WorkerMessages);
  let h = popupWith({ status: 'unknown' });
  await h.popup.warnIfWorkerOutdated();
  await h.popup.warnIfWorkerOutdated();
  assert.deepEqual(h.toasts, [HINT], 'once, however often it is asked');
  assert.equal(h.sent.length, 1, 'and the worker is asked once');

  h = popupWith({ status: 'ok', fingerprint: '00000000-1' });
  await h.popup.warnIfWorkerOutdated();
  assert.deepEqual(h.toasts, [HINT]);

  for (const reply of [{ status: 'ok', fingerprint: own }, undefined, new Error('Could not establish connection')]) {
    h = popupWith(reply);
    await h.popup.warnIfWorkerOutdated();
    assert.deepEqual(h.toasts, [], 'a current worker, or none that answers, is no reason to say anything');
  }
  const en = JSON.parse(read('_locales/en/messages.json'));
  assert.equal(en.workerOutdatedHint.message, HINT);
});

test('the popup opens with the check, the module loads after the registry in the popup and the worker, and the worker answers', () => {
  const popup = read('popup.js');
  assert.ok(/NotificationHelper\.initialize\(\);[\s\S]{0,260}this\.warnIfWorkerOutdated\(\);/.test(popup), 'asked when the popup initializes, not waited for');
  const html = read('popup.html');
  assert.ok(html.indexOf('modules/core/worker-messages.js') < html.indexOf('modules/core/worker-version.js') && html.indexOf('modules/core/worker-version.js') < html.indexOf('popup.js'));
  const worker = read('background.js');
  assert.ok(worker.indexOf('./modules/core/worker-messages.js') < worker.indexOf('./modules/core/worker-version.js'));
  const registry = read('background/handlers/router-registry.js');
  assert.match(registry, /registry\[WorkerMessages\.WORKER_FINGERPRINT\] = \(\{ sendResponse \}\) => \{\s*sendResponse\(WorkerVersion\.answer\(WorkerMessages\)\);/);
});
