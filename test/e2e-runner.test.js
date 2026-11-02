const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// The browser-test tooling: which suites there are and in what order, the command line, the one-line results, the Chromium folder
// Playwright is pointed at, and the runner itself driven with made-up suites (one passes, one fails, one never answers).

const root = path.join(__dirname, '..');
const R = require('../scripts/lib/e2e-runner.js');
const { buildShim } = require('../scripts/e2e-setup.js');

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `antibot-${name}-`));

test('suites are the e2e-<name>.js files, without the runners and the one that needs the internet', () => {
  const files = ['e2e-history.js', 'e2e-all.js', 'e2e-setup.js', 'e2e-live.js', 'e2e-data.js', 'check-syntax.js', 'e2e-notes.txt', 'e2e-.js'];
  assert.deepEqual(R.discoverSuites(files), ['history', 'data']);
  assert.deepEqual(R.discoverSuites(files, { live: true }), ['history', 'live', 'data'], 'in the order of the files');
});

test('the quick suites run first, the new ones next, the slow ones last, the live one at the very end', () => {
  const names = ['languages', 'zeta', 'history', 'alpha', 'data', 'popup-guards', 'editor', 'live', 'webhook'];
  assert.deepEqual(R.orderSuites(names), ['popup-guards', 'data', 'webhook', 'alpha', 'zeta', 'editor', 'history', 'languages', 'live']);
});

test('every suite of this repository is found, and the order lists name suites that exist', () => {
  const files = fs.readdirSync(path.join(root, 'scripts'));
  const found = R.discoverSuites(files);
  const expected = files.filter(name => /^e2e-.+\.js$/.test(name)).map(name => name.slice(4, -3)).filter(name => !R.EXCLUDED.includes(name));
  assert.deepEqual([...found].sort(), [...expected].sort());
  assert.deepEqual([...R.orderSuites(found)].sort(), [...found].sort(), 'ordering drops and repeats nothing');
  for (const name of [...R.PREFERRED, ...R.SLOW]) assert.ok(found.includes(name), `${name} is named in the order but there is no scripts/e2e-${name}.js`);
  assert.equal(new Set([...R.PREFERRED, ...R.SLOW]).size, R.PREFERRED.length + R.SLOW.length, 'a suite is in one list only');
});

test('only and skip choose; a name that does not exist is an error, never "ran nothing, all green"', () => {
  const all = ['a', 'b', 'c'];
  assert.deepEqual(R.selectSuites(all), ['a', 'b', 'c']);
  assert.deepEqual(R.selectSuites(all, { only: ['c', 'a'] }), ['a', 'c'], 'in the order of the run, not of the request');
  assert.deepEqual(R.selectSuites(all, { skip: ['b'] }), ['a', 'c']);
  assert.deepEqual(R.selectSuites(all, { only: ['a', 'b'], skip: ['a'] }), ['b']);
  assert.throws(() => R.selectSuites(all, { only: ['histroy'] }), /Unknown suite: histroy\. Available: a, b, c/);
  assert.throws(() => R.selectSuites(all, { skip: ['x', 'y'] }), /Unknown suites: x, y/);
});

test('the command line: lists, values with = or a space, flags, and errors that say what is wrong', () => {
  const args = R.parseArgs(['--only', 'a,b', '--only=c', '--skip', 'd', '--out', '/o', '--dir=/d', '--repo', '/r', '--timeout', '0.5', '--live', '--bail', '--no-gpu', '--playwright=1.2.3']);
  assert.deepEqual([args.only, args.skip, args.out, args.dir, args.repo, args.timeout, args.live, args.bail, args.noGpu, args.playwright],
    [['a', 'b', 'c'], ['d'], '/o', '/d', '/r', 0.5, true, true, true, '1.2.3']);
  const defaults = R.parseArgs([]);
  assert.deepEqual([defaults.timeout, defaults.live, defaults.bail, defaults.playwright, defaults.help], [25, false, false, R.PLAYWRIGHT_VERSION, false]);
  assert.equal(R.parseArgs(['-h']).help, true);
  assert.throws(() => R.parseArgs(['--timeout', '0']), /minutes above 0/);
  assert.throws(() => R.parseArgs(['--timeout', 'soon']), /minutes above 0/);
  assert.throws(() => R.parseArgs(['--only']), /--only needs a value/);
  assert.throws(() => R.parseArgs(['--only', '--bail']), /--only needs a value/);
  assert.throws(() => R.parseArgs(['--fast']), /Unknown option --fast/);
});

test('a result is one line, a summary names what did not pass, and the last line skips the stack', () => {
  const pass = { name: 'history', code: 0, ms: 367400, last: 'RESULT ALL PASS (30 scenarios)' };
  const fail = { name: 'updater', code: 2, ms: 40000, last: 'TimeoutError: waiting for #checkUpdatesNowBtn' };
  const slow = { name: 'editor', code: null, timedOut: true, ms: 1500000, last: '' };
  assert.equal(R.formatLine(pass), 'PASS  history         367s  RESULT ALL PASS (30 scenarios)');
  assert.equal(R.formatLine(fail), 'FAIL  updater          40s  exit 2: TimeoutError: waiting for #checkUpdatesNowBtn');
  assert.equal(R.formatLine(slow), 'TIME  editor         1500s  no answer after 1500s, stopped');
  assert.match(R.formatSummary([pass, fail, slow]), /1 of 3 suites passed\. Not passed: updater, editor$/);
  assert.match(R.formatSummary([pass]), /All 1 suites passed\.$/);
  assert.equal(R.lastLine('PASS one\n\nPASS two\n    at W (/x/e2e.js:134:20)\n    at setHistory (/x/e2e.js:175:48)\n'), 'PASS two');
  assert.equal(R.lastLine(''), '');
});

test('where Chromium is: the browsers folder per system, WSL, and the set-up folder', () => {
  assert.equal(R.browsersRoot('linux', {}, '/home/me'), path.join('/home/me', '.cache', 'ms-playwright'));
  assert.equal(R.browsersRoot('linux', { XDG_CACHE_HOME: '/c' }, '/home/me'), path.join('/c', 'ms-playwright'));
  assert.equal(R.browsersRoot('darwin', {}, '/Users/me'), path.join('/Users/me', 'Library', 'Caches', 'ms-playwright'));
  assert.equal(R.browsersRoot('win32', { LOCALAPPDATA: 'C:\\L' }, 'C:\\Users\\me'), path.join('C:\\L', 'ms-playwright'));
  assert.equal(R.browsersRoot('linux', { PLAYWRIGHT_BROWSERS_PATH: '/pw' }, '/home/me'), '/pw');
  assert.equal(R.browsersRoot('linux', { PLAYWRIGHT_BROWSERS_PATH: '0' }, '/home/me'), path.join('/home/me', '.cache', 'ms-playwright'), '0 means "next to the package", which this tooling does not use');
  assert.equal(R.isWsl('Linux version 6.18.33.2-microsoft-standard-WSL2', {}), true);
  assert.equal(R.isWsl('Linux version 6.8.0-generic', {}), false);
  assert.equal(R.isWsl('', { WSL_DISTRO_NAME: 'Ubuntu' }), true);
  assert.equal(R.defaultSetupDir({}, '/home/me'), path.join('/home/me', '.cache', 'antibot-e2e'));
});

test('the browsers folder plan: the revision asked for is used, another one is linked in under that name, nothing is invented', () => {
  const expected = R.expectedRevisions({ browsers: [{ name: 'chromium', revision: '1200' }, { name: 'chromium-headless-shell', revision: '1200' }, { name: 'ffmpeg', revision: '1011' }, { name: 'firefox', revision: '1509' }] });
  assert.deepEqual(expected, { chromium: '1200', 'chromium-headless-shell': '1200', ffmpeg: '1011' }, 'only the browsers the suites use');

  const exact = R.shimPlan({ expected, available: ['chromium-1200', 'chromium_headless_shell-1200', 'ffmpeg-1011', 'chromium-1243'] });
  assert.equal(exact.needsShim, false, 'all there: Playwright finds them itself');
  assert.deepEqual(exact.links.map(link => link.exact), [true, true, true]);

  const other = R.shimPlan({ expected, available: ['chromium-1208', 'chromium-1243', 'chromium_headless_shell-1243', 'ffmpeg-1011', 'firefox-1509'] });
  assert.equal(other.needsShim, true);
  assert.deepEqual(other.links.map(link => [link.name, link.target]), [['chromium-1200', 'chromium-1243'], ['chromium_headless_shell-1200', 'chromium_headless_shell-1243'], ['ffmpeg-1011', 'ffmpeg-1011']], 'the newest revision, under the expected name');

  const wrapped = R.shimPlan({ expected, available: ['chromium-1200', 'chromium_headless_shell-1200', 'ffmpeg-1011'], gpuFlags: true });
  assert.equal(wrapped.needsShim, true, 'the wrapper needs the folder even when every revision is right');

  const none = R.shimPlan({ expected, available: [] });
  assert.deepEqual(none.missing, ['chromium-1200', 'chromium_headless_shell-1200', 'ffmpeg-1011']);
  assert.equal(none.needsShim, false, 'nothing to link: it has to be downloaded');
});

test('the shim folder: links to what is cached, and a Chromium launcher that adds the GPU flags and runs the real one', { skip: process.platform === 'win32' }, () => {
  const cache = tmp('cache');
  const dir = tmp('setup');
  try {
    fs.mkdirSync(path.join(cache, 'chromium-1243', 'chrome-linux64'), { recursive: true });
    fs.writeFileSync(path.join(cache, 'chromium-1243', 'chrome-linux64', 'chrome'), '#!/bin/sh\necho "real chrome $@"\n', { mode: 0o755 });
    fs.writeFileSync(path.join(cache, 'chromium-1243', 'chrome-linux64', 'resources.pak'), 'pak');
    fs.writeFileSync(path.join(cache, 'chromium-1243', 'INSTALLATION_COMPLETE'), '');
    fs.mkdirSync(path.join(cache, 'ffmpeg-1011'));
    const plan = R.shimPlan({ expected: { chromium: '1200', ffmpeg: '1011' }, available: fs.readdirSync(cache), gpuFlags: true });
    const shim = buildShim(dir, cache, plan);
    assert.equal(shim, path.join(dir, 'browsers'));
    assert.ok(fs.lstatSync(path.join(shim, 'ffmpeg-1011')).isSymbolicLink(), 'a plain browser is one link');
    const chromium = path.join(shim, 'chromium-1200');
    assert.ok(fs.lstatSync(path.join(chromium, 'INSTALLATION_COMPLETE')).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(chromium, 'chrome-linux64', 'resources.pak')).isSymbolicLink());
    const launcher = path.join(chromium, 'chrome-linux64', 'chrome');
    assert.ok(!fs.lstatSync(launcher).isSymbolicLink(), 'the launcher is a file of its own');
    const run = spawnSync(launcher, ['--headless', 'about:blank'], { encoding: 'utf8' });
    assert.equal(run.stdout.trim(), 'real chrome --disable-gpu --disable-software-rasterizer --headless about:blank', 'the flags first, the caller\'s arguments after, the real browser run');
    // Built again: the old folder is replaced, not added to
    assert.doesNotThrow(() => buildShim(dir, cache, plan));
  } finally {
    fs.rmSync(cache, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- The runner, with made-up suites ----------------------------------------------------------------------------------
function fakeRepo({ playwright = true } = {}) {
  const repo = tmp('repo');
  fs.mkdirSync(path.join(repo, 'scripts'));
  const suite = (name, body) => fs.writeFileSync(path.join(repo, 'scripts', `e2e-${name}.js`), body);
  suite('ok', "console.log('PASS one'); console.log('RESULT ALL PASS');");
  suite('bad', "console.log('PASS before'); console.error('boom'); process.exit(3);");
  suite('slow', "require('node:fs').writeFileSync(process.argv[2] + '/slow.pid', String(process.pid)); setInterval(() => {}, 1000);");
  suite('env', "console.log('NODE_PATH=' + process.env.NODE_PATH); console.log('BROWSERS=' + process.env.PLAYWRIGHT_BROWSERS_PATH);");
  suite('live', "console.log('RESULT live');");
  if (playwright) {
    fs.mkdirSync(path.join(repo, 'node_modules', 'playwright'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'node_modules', 'playwright', 'package.json'), '{"name":"playwright","main":"index.js"}');
    fs.writeFileSync(path.join(repo, 'node_modules', 'playwright', 'index.js'), 'module.exports = {};');
  }
  return repo;
}

function runAll(repo, argv, { dir = path.join(repo, 'no-setup') } = {}) {
  const out = path.join(repo, 'logs');
  const env = { ...process.env };
  delete env.NODE_PATH;
  delete env.PLAYWRIGHT_BROWSERS_PATH;
  const run = spawnSync(process.execPath, [path.join(root, 'scripts', 'e2e-all.js'), '--repo', repo, '--dir', dir, '--out', out, ...argv], { encoding: 'utf8', env, timeout: 60000 });
  const summary = fs.existsSync(path.join(out, 'summary.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')) : null;
  return { ...run, out, summary };
}

const withRepo = (options, fn) => {
  const repo = fakeRepo(options);
  try { return fn(repo); } finally { fs.rmSync(repo, { recursive: true, force: true }); }
};

test('the runner: suites in order, a log and a line for each, and one that fails fails the run', () => withRepo({}, (repo) => {
  const run = runAll(repo, ['--only', 'ok,bad']);
  assert.equal(run.status, 1);
  assert.deepEqual(run.summary.results.map(r => [r.name, r.code, r.timedOut]), [['bad', 3, false], ['ok', 0, false]], 'new suites by name');
  assert.match(run.stdout, /FAIL {2}bad .*exit 3: boom/);
  assert.match(run.stdout, /PASS {2}ok .*RESULT ALL PASS/);
  assert.match(run.stdout, /1 of 2 suites passed\. Not passed: bad/);
  assert.match(fs.readFileSync(path.join(run.out, 'bad.log'), 'utf8'), /PASS before\nboom\n/, 'its own output, both streams, in its log');
  assert.ok(fs.existsSync(path.join(run.out, 'ok.log')));
  assert.equal(run.summary.repo, repo);
}));

test('the runner: all green is exit 0, the live suite only when asked, and --bail stops at the first failure', () => withRepo({}, (repo) => {
  const green = runAll(repo, ['--only', 'ok']);
  assert.equal(green.status, 0);
  assert.match(green.stdout, /All 1 suites passed\./);

  const everything = runAll(repo, ['--skip', 'slow,env']);
  assert.deepEqual(everything.summary.results.map(r => r.name), ['bad', 'ok'], 'no live suite by default');
  const withLive = runAll(repo, ['--skip', 'slow,env', '--live']);
  assert.deepEqual(withLive.summary.results.map(r => r.name), ['bad', 'ok', 'live'], 'live last');

  const bailed = runAll(repo, ['--skip', 'slow,env', '--bail']);
  assert.equal(bailed.status, 1);
  assert.deepEqual(bailed.summary.results.map(r => r.name), ['bad'], 'the suites after the failure did not run');
}));

test('the runner: a suite that never answers is stopped at its limit and its process is gone', { skip: process.platform === 'win32' }, () => withRepo({}, (repo) => {
  const started = Date.now();
  const run = runAll(repo, ['--only', 'slow', '--timeout', '0.03']);
  assert.ok(Date.now() - started < 30000);
  assert.equal(run.status, 1);
  assert.match(run.stdout, /TIME {2}slow .*no answer after \d+s, stopped/);
  assert.equal(run.summary.results[0].timedOut, true);
  const pid = Number(fs.readFileSync(path.join(repo, 'slow.pid'), 'utf8'));
  assert.throws(() => process.kill(pid, 0), /ESRCH/, 'not left running beside the next suite');
}));

test('the runner: an unknown suite is an error, --help says how to use it, and without Playwright it says what to run', () => {
  withRepo({}, (repo) => {
    const unknown = runAll(repo, ['--only', 'histroy']);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /Unknown suite: histroy\. Available: .*ok/);
    assert.equal(unknown.summary, null, 'nothing was run');
    const help = runAll(repo, ['--help']);
    assert.equal(help.status, 0);
    assert.match(help.stdout, /Usage: node scripts\/e2e-all\.js/);
  });
  withRepo({ playwright: false }, (repo) => {
    const run = runAll(repo, ['--only', 'ok']);
    assert.equal(run.status, 2);
    assert.match(run.stderr, /Playwright was not found\. Run "npm run e2e:setup" once/);
    assert.equal(run.summary, null);
  });
});

test('the runner: what e2e-setup.js saved reaches the suites, and is enough to find Playwright', () => withRepo({ playwright: false }, (repo) => {
  const dir = path.join(repo, 'saved');
  fs.mkdirSync(path.join(dir, 'node_modules', 'playwright'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'playwright', 'package.json'), '{"name":"playwright","main":"index.js"}');
  fs.writeFileSync(path.join(dir, 'node_modules', 'playwright', 'index.js'), 'module.exports = {};');
  fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify({ NODE_PATH: path.join(dir, 'node_modules'), PLAYWRIGHT_BROWSERS_PATH: path.join(dir, 'browsers') }));
  const run = runAll(repo, ['--only', 'env'], { dir });
  assert.equal(run.status, 0, run.stderr);
  const log = fs.readFileSync(path.join(run.out, 'env.log'), 'utf8');
  assert.ok(log.includes(`NODE_PATH=${path.join(dir, 'node_modules')}`), log);
  assert.ok(log.includes(`BROWSERS=${path.join(dir, 'browsers')}`), log);
}));
