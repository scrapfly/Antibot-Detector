#!/usr/bin/env node
/**
 * Prepares what the browser suites (scripts/e2e-*.js, run by scripts/e2e-all.js) need, once, outside the repository:
 *
 *   1. Playwright, installed in its own folder (default ~/.cache/antibot-e2e, or --dir / ANTIBOT_E2E_DIR), never in the repo.
 *   2. A Chromium that Playwright can find. The browsers folder is shared by every Playwright version, so the revision this one
 *      asks for may be missing while another is there: it is linked in under the expected name (a "shim" folder), instead of
 *      downloading 150 MB again. With nothing cached, the usual `playwright install chromium` runs.
 *   3. On Windows Subsystem for Linux, Chromium starts through a wrapper that adds --disable-gpu --disable-software-rasterizer
 *      (also --no-gpu, anywhere on Linux): without them it draws no frames there, requestAnimationFrame never fires, and every
 *      wait that depends on a frame, every screenshot and every Playwright click on a moving element times out.
 *   4. A check that the browser starts and draws a frame, so a broken set-up is told here and not as forty failed scenarios.
 *
 * It writes <dir>/env.json (NODE_PATH, and the browsers folder when a shim was needed), which e2e-all.js reads; for a suite run by
 * hand it prints the same as `export` lines.
 *
 *   npm run e2e:setup [-- --dir <folder>] [--playwright 1.57.0] [--no-gpu]
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('./lib/e2e-runner.js');

const FRAME_PROBE = `
  const { chromium } = require('playwright');
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
  (async () => {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'antibot-probe-'));
    const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium' });
    try {
      const page = await context.newPage();
      const drew = await page.evaluate(() => new Promise((resolve) => { const t = setTimeout(() => resolve(false), 1500); requestAnimationFrame(() => { clearTimeout(t); resolve(true); }); }));
      console.log(drew ? 'frames: yes' : 'frames: NO');
      process.exitCode = drew ? 0 : 3;
    } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
  })().catch((error) => { console.error(error.message); process.exitCode = 4; });
`;

const say = (text) => console.log(text);
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function ensurePlaywright(dir, version) {
  fs.mkdirSync(dir, { recursive: true });
  const manifest = path.join(dir, 'node_modules', 'playwright', 'package.json');
  if (fs.existsSync(manifest) && JSON.parse(fs.readFileSync(manifest, 'utf8')).version === version) {
    say(`Playwright ${version}: already in ${dir}`);
    return;
  }
  if (!fs.existsSync(path.join(dir, 'package.json'))) fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'antibot-e2e', private: true }, null, 2));
  say(`Playwright ${version}: installing in ${dir}`);
  execFileSync(npm, ['install', '--no-audit', '--no-fund', '--silent', `playwright@${version}`], { cwd: dir, stdio: 'inherit', shell: process.platform === 'win32' });
}

const folders = (root) => (fs.existsSync(root) ? fs.readdirSync(root) : []);
const link = (target, name) => fs.symlinkSync(target, name);

/** The shim folder: what Playwright expects, made of links to what is cached, and the Chromium launcher with the GPU flags. */
function buildShim(dir, root, plan) {
  const shim = path.join(dir, 'browsers');
  fs.rmSync(shim, { recursive: true, force: true });
  fs.mkdirSync(shim, { recursive: true });
  for (const entry of plan.links) {
    const source = path.join(root, entry.target);
    const dest = path.join(shim, entry.name);
    if (!(plan.gpuFlags && entry.name.startsWith('chromium-'))) { link(source, dest); continue; }
    // The Chromium folder is rebuilt one level down: everything linked, but the launcher is a wrapper
    fs.mkdirSync(dest);
    for (const name of fs.readdirSync(source)) if (name !== 'chrome-linux64') link(path.join(source, name), path.join(dest, name));
    const real = path.join(source, 'chrome-linux64');
    fs.mkdirSync(path.join(dest, 'chrome-linux64'));
    for (const name of fs.readdirSync(real)) {
      if (name !== 'chrome') link(path.join(real, name), path.join(dest, 'chrome-linux64', name));
    }
    const launcher = path.join(dest, 'chrome-linux64', 'chrome');
    fs.writeFileSync(launcher, `#!/bin/sh\nexec "${path.join(real, 'chrome')}" --disable-gpu --disable-software-rasterizer "$@"\n`);
    fs.chmodSync(launcher, 0o755);
  }
  return shim;
}

function main(argv) {
  const args = R.parseArgs(argv);
  if (args.help) { say('Usage: node scripts/e2e-setup.js [--dir folder] [--playwright version] [--no-gpu]'); return 0; }
  const dir = path.resolve(args.dir || process.env.ANTIBOT_E2E_DIR || R.defaultSetupDir(process.env, os.homedir()));

  ensurePlaywright(dir, args.playwright);
  const browsersJson = JSON.parse(fs.readFileSync(path.join(dir, 'node_modules', 'playwright-core', 'browsers.json'), 'utf8'));
  const expected = R.expectedRevisions(browsersJson);
  const root = R.browsersRoot(process.platform, process.env, os.homedir());

  const procVersion = process.platform === 'linux' && fs.existsSync('/proc/version') ? fs.readFileSync('/proc/version', 'utf8') : '';
  const gpuFlags = process.platform === 'linux' && (args.noGpu || R.isWsl(procVersion, process.env));
  if (gpuFlags) say(`Chromium will start with --disable-gpu --disable-software-rasterizer (${args.noGpu ? 'asked for' : 'Windows Subsystem for Linux: it draws no frames without them'})`);

  const env = { ...process.env, NODE_PATH: path.join(dir, 'node_modules') };
  let plan = R.shimPlan({ expected, available: folders(root), gpuFlags });
  if (plan.missing.some(name => name.startsWith('chromium-'))) {
    say(`No Chromium in ${root}: downloading it (playwright install chromium)`);
    execFileSync(process.execPath, [path.join(dir, 'node_modules', 'playwright', 'cli.js'), 'install', 'chromium'], { cwd: dir, stdio: 'inherit', env: { ...env, PLAYWRIGHT_BROWSERS_PATH: root } });
    plan = R.shimPlan({ expected, available: folders(root), gpuFlags });
  }

  const saved = { NODE_PATH: path.join(dir, 'node_modules') };
  if (plan.needsShim) {
    if (process.platform !== 'linux') {
      say(`Playwright wants Chromium revision ${expected.chromium}, which is not in ${root}. Run "npx playwright install chromium" with this Playwright (${args.playwright}); a link to another revision is only made on Linux.`);
      return 1;
    }
    saved.PLAYWRIGHT_BROWSERS_PATH = buildShim(dir, root, plan);
    say(`Browsers folder: ${saved.PLAYWRIGHT_BROWSERS_PATH}${plan.links.some(entry => !entry.exact) ? ` (links to ${plan.links.filter(entry => !entry.exact).map(entry => entry.target).join(', ')} under the names ${args.playwright} expects)` : ''}`);
  } else if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    saved.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  fs.writeFileSync(path.join(dir, 'env.json'), JSON.stringify(saved, null, 2));

  Object.assign(env, saved);
  try {
    const out = execFileSync(process.execPath, ['-e', FRAME_PROBE], { cwd: dir, env, timeout: 90000, encoding: 'utf8' }).trim();
    say(`Chromium: starts, ${out}`);
  } catch (error) {
    const text = `${error.stdout || ''}${error.stderr || ''}`.trim().split('\n').slice(-3).join(' | ');
    say(`Chromium did not come up as needed (${text || error.message}).${gpuFlags ? '' : ' If it starts but draws no frames, run this again with --no-gpu.'}`);
    return 1;
  }

  say(`\nReady. e2e-all.js finds it by itself. For one suite by hand:\n  export NODE_PATH=${saved.NODE_PATH}${saved.PLAYWRIGHT_BROWSERS_PATH ? `\n  export PLAYWRIGHT_BROWSERS_PATH=${saved.PLAYWRIGHT_BROWSERS_PATH}` : ''}\n  node scripts/e2e-history.js`);
  return 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { main, buildShim };
