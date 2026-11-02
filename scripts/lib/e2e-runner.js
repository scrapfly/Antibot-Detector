/**
 * The pure part of the browser-test tooling (scripts/e2e-setup.js and scripts/e2e-all.js), kept apart so the unit tests can run it:
 * which suites exist and in what order, the command line, the one-line results, and where Playwright's Chromium is (or has to be
 * pointed at). Nothing here touches the disk or starts a process.
 */
'use strict';

const path = require('node:path');

/** The Playwright these suites were written and run against. */
const PLAYWRIGHT_VERSION = '1.57.0';

/** Runners and suites that need the internet are not part of the default run (e2e-live is asked for with --live). */
const EXCLUDED = Object.freeze(['all', 'setup', 'live']);

/** Short suites first, so a mistake shows within a minute; any suite not named here follows them, alphabetically. */
const PREFERRED = Object.freeze(['popup-guards', 'refactor', 'settings-modal', 'settings', 'data', 'scope', 'webhook', 'hooks', 'bulk',
  'quickwins', 'v304', 'methods', 'rule-texts', 'updater', 'controls']);

/** Minutes each: last, so the quick ones have already answered. */
const SLOW = Object.freeze(['editor', 'history', 'languages']);

const SUITE_FILE = /^e2e-(.+)\.js$/;

/** The suite names a scripts folder holds (e2e-<name>.js), the runners and the live one left out unless asked. */
function discoverSuites(fileNames, { live = false } = {}) {
  return fileNames
    .map(name => (SUITE_FILE.exec(name) || [])[1])
    .filter(Boolean)
    .filter(name => (name === 'live' ? live : !EXCLUDED.includes(name)));
}

/** preferred suites in their order, then the others by name, then the slow ones. */
function orderSuites(names) {
  const known = (list) => list.filter(name => names.includes(name));
  const middle = names.filter(name => !PREFERRED.includes(name) && !SLOW.includes(name) && name !== 'live').sort();
  const ordered = [...known(PREFERRED), ...middle, ...known(SLOW)];
  return names.includes('live') ? [...ordered, 'live'] : ordered;
}

/**
 * Which of the suites run. `only` names suites (an unknown name is an error: a typo must not mean "ran nothing, all green"),
 * `skip` leaves some out.
 */
function selectSuites(all, { only = [], skip = [] } = {}) {
  const unknown = [...only, ...skip].filter(name => !all.includes(name));
  if (unknown.length) throw new Error(`Unknown suite${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Available: ${all.join(', ')}`);
  const chosen = only.length ? all.filter(name => only.includes(name)) : all;
  return chosen.filter(name => !skip.includes(name));
}

const list = (value) => String(value || '').split(',').map(part => part.trim()).filter(Boolean);

/** The command line of both tools: --only a,b --skip c --out dir --dir dir --repo dir --timeout minutes --live --bail --playwright x.y.z --no-gpu --help */
function parseArgs(argv) {
  const out = { only: [], skip: [], out: '', dir: '', repo: '', timeout: 25, live: false, bail: false, help: false, noGpu: false, playwright: PLAYWRIGHT_VERSION, rest: [] };
  const value = (index, flag) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
    return next;
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const [flag, inline] = arg.startsWith('--') && arg.includes('=') ? [arg.slice(0, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)] : [arg, undefined];
    const take = () => { if (inline !== undefined) return inline; i++; return value(i - 1, flag); };
    if (flag === '--only') out.only.push(...list(take()));
    else if (flag === '--skip') out.skip.push(...list(take()));
    else if (flag === '--out') out.out = take();
    else if (flag === '--dir') out.dir = take();
    else if (flag === '--repo') out.repo = take();
    else if (flag === '--playwright') out.playwright = take();
    else if (flag === '--timeout') {
      const minutes = Number(take());
      if (!(minutes > 0)) throw new Error('--timeout is a number of minutes above 0');
      out.timeout = minutes;
    } else if (flag === '--live') out.live = true;
    else if (flag === '--bail') out.bail = true;
    else if (flag === '--no-gpu') out.noGpu = true;
    else if (flag === '--help' || flag === '-h') out.help = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    else out.rest.push(arg);
  }
  return out;
}

const seconds = (ms) => `${Math.round(ms / 1000)}s`;
const clip = (text, length = 90) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/** One suite's result on one line: "PASS  history       367s  RESULT ALL PASS (30 scenarios)". */
function formatLine(result, width = 14) {
  const state = result.timedOut ? 'TIME' : result.code === 0 ? 'PASS' : 'FAIL';
  const detail = result.timedOut ? `no answer after ${seconds(result.ms)}, stopped` : result.code === 0 ? result.last : `exit ${result.code}${result.last ? `: ${result.last}` : ''}`;
  return `${state}  ${result.name.padEnd(width)} ${seconds(result.ms).padStart(5)}  ${clip(detail || '')}`;
}

/** The end of a run: every line again, then what did not pass. */
function formatSummary(results) {
  const bad = results.filter(result => result.timedOut || result.code !== 0);
  return [
    ...results.map(result => formatLine(result)),
    '',
    bad.length ? `${results.length - bad.length} of ${results.length} suites passed. Not passed: ${bad.map(result => result.name).join(', ')}` : `All ${results.length} suites passed.`
  ].join('\n');
}

/** The last line of a log that says something (blank lines, stack frames and shell noise skipped). */
function lastLine(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^at\s/.test(line));
  return lines.length ? lines[lines.length - 1] : '';
}

/** Where e2e-setup.js puts Playwright and what it learned, and where e2e-all.js looks for it. */
function defaultSetupDir(env, home) {
  return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'antibot-e2e');
}

/** True inside Windows Subsystem for Linux, where Chromium draws no frames without --disable-gpu (see e2e-setup.js). */
function isWsl(procVersion, env = {}) {
  return /microsoft/i.test(String(procVersion || '')) || !!env.WSL_DISTRO_NAME;
}

/** Where Playwright keeps the browsers it downloaded. */
function browsersRoot(platform, env, home) {
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0') return env.PLAYWRIGHT_BROWSERS_PATH;
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'ms-playwright');
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'ms-playwright');
  return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'ms-playwright');
}

const FOLDER_PREFIX = Object.freeze({ chromium: 'chromium', 'chromium-headless-shell': 'chromium_headless_shell', ffmpeg: 'ffmpeg' });

/** The revision a Playwright install expects, from its browsers.json ({browsers: [{name, revision}]}). */
function expectedRevisions(browsersJson) {
  const out = {};
  for (const entry of (browsersJson && browsersJson.browsers) || []) {
    if (FOLDER_PREFIX[entry.name]) out[entry.name] = String(entry.revision);
  }
  return out;
}

const revisionOf = (folder) => Number(folder.slice(folder.lastIndexOf('-') + 1)) || 0;

/**
 * What the browsers folder has to look like for the installed Playwright to find a Chromium. A browser that is in the cache with
 * the revision Playwright asks for is used as it is; one with another revision (the cache is shared with other Playwright
 * versions) is linked in under the name Playwright expects, the newest one. With `gpuFlags` the Chromium also starts through a
 * wrapper that adds --disable-gpu --disable-software-rasterizer.
 * @param {{expected: object, available: string[], gpuFlags?: boolean}} options
 * @returns {{links: Array<{name: string, target: string, exact: boolean}>, missing: string[], needsShim: boolean, gpuFlags: boolean}}
 */
function shimPlan({ expected, available, gpuFlags = false }) {
  const links = [];
  const missing = [];
  for (const [browser, revision] of Object.entries(expected)) {
    const prefix = FOLDER_PREFIX[browser];
    const wanted = `${prefix}-${revision}`;
    const same = available.filter(folder => folder.startsWith(`${prefix}-`) && /^\d+$/.test(folder.slice(prefix.length + 1)));
    const target = same.includes(wanted) ? wanted : same.sort((a, b) => revisionOf(b) - revisionOf(a))[0];
    if (target) links.push({ name: wanted, target, exact: target === wanted });
    else missing.push(wanted);
  }
  const chromium = links.find(link => link.name.startsWith('chromium-'));
  return {
    links,
    missing,
    gpuFlags,
    // Without the Chromium itself there is nothing to point at; otherwise a shim is only needed for another revision or the wrapper
    needsShim: !!chromium && (gpuFlags || links.some(link => !link.exact))
  };
}

module.exports = {
  PLAYWRIGHT_VERSION, EXCLUDED, PREFERRED, SLOW,
  discoverSuites, orderSuites, selectSuites, parseArgs, formatLine, formatSummary, lastLine,
  defaultSetupDir, isWsl, browsersRoot, expectedRevisions, shimPlan
};
