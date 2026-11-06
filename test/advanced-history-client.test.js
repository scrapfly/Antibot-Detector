'use strict';
// The popup's window on Advanced history (modules/advanced/history-client.js): when the worker answers without the history and
// without saying why, the message names its answer, and a worker that does not know the question says how to fix it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'modules/advanced/history-client.js'), 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(root, '_locales/en/messages.json'), 'utf8'));

function client(answer) {
  const context = vm.createContext({
    Promise, Error,
    AdvancedMessageTypes: { ADVANCED_HISTORY: 'ADVANCED_HISTORY' },
    FormatUtils: { t: (key, fallback) => (en[key] ? en[key].message : fallback) },
    chrome: { runtime: { lastError: null, sendMessage: (_, reply) => reply(answer) } }
  });
  context.window = context;
  vm.runInContext(source, context, { filename: 'history-client.js' });
  return context.AdvancedHistoryStore;
}

const failure = async (answer) => {
  try { await client(answer).load(); } catch (error) { return error.message; }
  assert.fail('it should have failed');
};

test('a worker that does not know the question (not reloaded after an update) says to reload the extension', async () => {
  assert.equal(await failure({ status: 'unknown' }), en.workerOutdatedHint.message);
});

test('any other answer without an error is named by its status; one with an error keeps the error', async () => {
  assert.match(await failure({ status: 'busy' }), /busy/);
  assert.equal(await failure({ status: 'error', error: 'storage is full' }), 'storage is full');
  assert.equal(await failure(undefined), 'Advanced history unavailable');
  assert.deepEqual(await client({ status: 'ok', data: { a: 1 } }).load(), { a: 1 });
});
