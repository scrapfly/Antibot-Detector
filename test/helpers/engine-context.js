// The detection engine loaded into a vm context, the way the page's content script and the worker run it, with small fakes
// for the browser. Shared by the 3.1.4 engine tests (test/engine-*.test.js).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const ENGINE_FILES = [
  'utils/url-utils.js', 'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/categories.js', 'modules/core/domain-list.js',
  'modules/core/scan-scope.js', 'modules/core/hooks-config.js', 'modules/detection/conditions/window-condition-grammar.js',
  'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
  ...['analysis', 'extractors', 'matching', 'hooks', 'manager'].map(name => `modules/detection/engine/detection-engine-${name}.js`)
];

/** A Logger that keeps what it was told, per level, as the argument lists of each call. */
function recordingLogger() {
  const logs = { debug: [], warn: [], error: [], detection: [] };
  const keep = (level) => (...args) => { logs[level].push(args); };
  const logger = {
    debug: keep('debug'), warn: keep('warn'), error: keep('error'), detection: keep('detection'), cache() {}, content() {}, debugMode: false,
    hostOf(url) { try { return new URL(url).host; } catch (_) { return String(url); } }
  };
  return { logs, logger };
}

const CONSTANTS = { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000, PATTERN_CACHE_MAX_SIZE: 500,
  MATCH_CACHE_TTL: 300000, FETCH_TIMEOUT: 5000, REQUEST_SKIP_THRESHOLD: 500, DETECTION_SKIP_THRESHOLD: 1500, REQUEST_DETECTION_PENDING_TIMEOUT: 10000 };

/**
 * @param {object} extra - globals of the fake browser (document, window, chrome, fetch, ...), over the defaults
 * @param {{files?: string[]}} options - the scripts to load, in order (the engine's by default)
 */
function engineContext(extra = {}, { files = ENGINE_FILES } = {}) {
  const { logs, logger } = recordingLogger();
  const context = vm.createContext({
    URL, Date, JSON, Math, Map, Set, Promise, Intl, console, setTimeout, clearTimeout,
    Constants: { ...CONSTANTS },
    Logger: logger,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options && options.detail; } },
    ...extra
  });
  context.self = context;
  for (const file of files) vm.runInContext(read(file), context, { filename: file });
  return {
    context, logs,
    Engine: vm.runInContext('DetectionEngineManager', context),
    run: (code) => vm.runInContext(code, context)
  };
}

/** A copy that crossed a realm: arrays and objects built inside the vm context compare equal to the test's own. */
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = { engineContext, recordingLogger, plain, read, root, ENGINE_FILES, CONSTANTS };
