'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

/**
 * A worker-like vm context over a chrome.storage.local the test controls, for the tests of what happens when the storage cannot be
 * read: a rejected read (`state.failGet(key)` is true for a key of the call) and a stored value that is damaged (the test puts
 * text that is not JSON in `store`). The real files run in it, as the extension's own scripts do.
 *
 *   store      what is stored (values are cloned on the way in and out, as the browser does)
 *   files      repository files to run in the context, in order
 *   globals    added to the context (they win over the defaults below)
 *   chrome     more of the chrome API (alarms, tabs, notifications...), next to storage and runtime.getURL
 *   index      the shipped detectors/index.json that fetch answers (the real one by default)
 *
 * Returns { ctx, store, state, writes, warnings, fetched, run(file) }:
 *   writes     the keys written, in order (a set of two keys lists both)
 *   warnings   every warn and error line, as [level, ...arguments], an Error shown as "Name: message", which is what a log line
 *              holds of it (a test that says a text is never logged looks for it here)
 */
const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function storageWorld({ store = {}, files = [], globals = {}, chrome = {}, index = null } = {}) {
  const state = { failGet: null };
  const writes = [];
  const warnings = [];
  const fetched = [];
  const shown = (value) => (value && typeof value === 'object' && 'message' in value ? `${value.name}: ${value.message}` : value);
  const logger = new Proxy({}, { get: (_, name) => (...args) => { if (name === 'warn' || name === 'error') warnings.push([name, ...args.map(shown)]); } });
  const keysOf = (keys) => (typeof keys === 'string' ? [keys] : [].concat(keys));
  const local = {
    get: async (keys) => {
      const list = keysOf(keys);
      if (state.failGet && list.some(state.failGet)) throw new Error('storage is unavailable');
      return Object.fromEntries(list.filter(key => key in store).map(key => [key, plain(store[key])]));
    },
    set: async (values) => { writes.push(...Object.keys(values)); Object.assign(store, plain(values)); },
    remove: async (keys) => { for (const key of keysOf(keys)) delete store[key]; }
  };
  const ctx = vm.createContext({
    console, URL, Date, JSON, Math, Set, Map, Promise, setTimeout, clearTimeout, AbortController,
    Logger: logger,
    chrome: { storage: { local, onChanged: { addListener() {} } }, runtime: { getURL: (p) => p }, ...chrome },
    fetch: async (url) => {
      fetched.push(url);
      if (url === 'detectors/index.json') return { ok: true, json: async () => plain(index || JSON.parse(read('detectors/index.json'))) };
      const file = path.join(root, url);
      if (!fs.existsSync(file)) return { ok: false, status: 404 };
      return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, 'utf8')) };
    },
    ...globals
  });
  ctx.self = ctx;
  ctx.window = ctx;
  const run = (file) => vm.runInContext(read(file), ctx, { filename: file });
  for (const file of files) run(file);
  return { ctx, store, state, writes, warnings, fetched, run };
}

module.exports = { storageWorld, read, plain };
