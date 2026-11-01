#!/usr/bin/env node
/**
 * Runs the browser suites (scripts/e2e-<name>.js: the real extension unpacked in Chromium) one after the other, each with a time
 * limit, and ends with one line per suite. Every suite's output goes to its own log file, so a run can be read afterwards.
 *
 *   npm run e2e:setup            once: Playwright and a Chromium that starts here (see scripts/e2e-setup.js)
 *   npm run e2e:all              every suite, short ones first
 *   npm run e2e:all -- --only history,data --skip languages --bail
 *   node scripts/e2e-all.js --repo ~/worktrees/Antibot-Detector/some-branch     the suites and the extension of another checkout
 *
 * Options: --only a,b  --skip a,b  --out <folder for the logs>  --dir <folder e2e-setup.js prepared>  --repo <checkout>
 *          --timeout <minutes per suite, 25>  --live (also e2e-live, which needs the internet)  --bail (stop at the first failure)
 *
 * One suite at a time, and nothing else heavy meanwhile: a browser suite is timing-sensitive, and the unit tests or a second run
 * beside it have made scenarios fail for no reason of their own. Exit code 0 when every suite passed, 1 when one did not (or ran
 * out of time), 2 when Playwright is not there.
 */
'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('./lib/e2e-runner.js');

const USAGE = `Usage: node scripts/e2e-all.js [--only a,b] [--skip a,b] [--out folder] [--dir folder] [--repo checkout] [--timeout minutes] [--live] [--bail]`;

/** The environment the suites need: what e2e-setup.js wrote (NODE_PATH, the browsers folder), over this process's own. */
function childEnvironment(dir) {
  const env = { ...process.env };
  const file = path.join(dir, 'env.json');
  if (!fs.existsSync(file)) return env;
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (saved.NODE_PATH) env.NODE_PATH = [saved.NODE_PATH, env.NODE_PATH].filter(Boolean).join(path.delimiter);
  if (saved.PLAYWRIGHT_BROWSERS_PATH) env.PLAYWRIGHT_BROWSERS_PATH = saved.PLAYWRIGHT_BROWSERS_PATH;
  return env;
}

function playwrightIsThere(repo, env) {
  try {
    require.resolve('playwright', { paths: [repo, ...String(env.NODE_PATH || '').split(path.delimiter).filter(Boolean)] });
    return true;
  } catch (_) {
    return false;
  }
}

/** Stops a suite and the browser it started: they share a process group on POSIX. */
function stop(child) {
  try {
    if (process.platform === 'win32') child.kill();
    else process.kill(-child.pid, 'SIGKILL');
  } catch (_) {
    try { child.kill('SIGKILL'); } catch (__) { /* already gone */ }
  }
}

function runSuite({ name, repo, env, logFile, minutes }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const log = fs.openSync(logFile, 'w');
    const script = path.join(repo, 'scripts', `e2e-${name}.js`);
    const child = spawn(process.execPath, [script, repo], { cwd: repo, env, stdio: ['ignore', log, log], detached: process.platform !== 'win32' });
    let timedOut = false;
    let finished = false;
    const timer = setTimeout(() => { timedOut = true; stop(child); }, minutes * 60000);
    const done = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      fs.closeSync(log);
      stop(child); // a browser the suite left behind goes with it
      let text = '';
      try { text = fs.readFileSync(logFile, 'utf8'); } catch (_) { /* no log */ }
      resolve({ name, code: timedOut ? null : code, timedOut, ms: Date.now() - started, last: R.lastLine(text), log: logFile });
    };
    child.on('error', (error) => { fs.appendFileSync(logFile, `${error.message}\n`); done(1); });
    child.on('exit', (code) => done(code === null ? 1 : code));
  });
}

async function main(argv) {
  const args = R.parseArgs(argv);
  if (args.help) { console.log(USAGE); return 0; }
  const repo = path.resolve(args.repo || path.join(__dirname, '..'));
  const scriptsDir = path.join(repo, 'scripts');
  const all = R.orderSuites(R.discoverSuites(fs.readdirSync(scriptsDir), { live: args.live }));
  const chosen = R.selectSuites(all, { only: args.only, skip: args.skip });
  if (!chosen.length) { console.error('No suite to run.'); return 1; }

  const dir = path.resolve(args.dir || process.env.ANTIBOT_E2E_DIR || R.defaultSetupDir(process.env, os.homedir()));
  const env = childEnvironment(dir);
  if (!playwrightIsThere(repo, env)) {
    console.error(`Playwright was not found. Run "npm run e2e:setup" once (it prepares ${dir}), or install it yourself: npm i --no-save playwright && npx playwright install chromium`);
    return 2;
  }

  const out = path.resolve(args.out || path.join(os.tmpdir(), `antibot-e2e-${new Date().toISOString().replace(/[:.]/g, '-')}`));
  fs.mkdirSync(out, { recursive: true });
  console.log(`${chosen.length} suites, logs in ${out}\n`);

  const results = [];
  const started = new Date().toISOString();
  for (const name of chosen) {
    const result = await runSuite({ name, repo, env, logFile: path.join(out, `${name}.log`), minutes: args.timeout });
    results.push(result);
    console.log(R.formatLine(result));
    if (args.bail && (result.timedOut || result.code !== 0)) break;
  }
  console.log(`\n${R.formatSummary(results)}`);
  fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify({ startedAt: started, repo, results }, null, 2));
  return results.every(result => !result.timedOut && result.code === 0) ? 0 : 1;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { main, childEnvironment, runSuite };
