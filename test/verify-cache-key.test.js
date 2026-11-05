const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const UrlUtils = require('../utils/url-utils.js');

// scripts/verify-cache-key.js prints the keys a page is saved under, to compare them with the keys of
// scrapfly_detection_storage. It carried a copy of the hash that kept the host without its port (the extension keeps it, since
// 3.0.9), so two dev servers on one machine printed the same key; its footer also named hostname_fallback and matchSource, which
// exist nowhere. It now loads the extension's own hash.

const script = path.join(__dirname, '..', 'scripts', 'verify-cache-key.js');
function keysOf(url) {
  const run = spawnSync(process.execPath, [script, url, 'all'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return Object.fromEntries([...run.stdout.matchAll(/scope=(\w+)\s+primaryKey: (\S+)/g)].map(match => [match[1], match[2]]));
}

test('the keys it prints are the ones the extension computes, and a port is part of the site', () => {
  const a = keysOf('http://localhost:3000/a'), b = keysOf('http://localhost:8080/a');
  assert.deepEqual(Object.keys(a), ['domain', 'path', 'full']);
  for (const scope of ['domain', 'path', 'full']) {
    assert.equal(a[scope], UrlUtils.hashUrl('http://localhost:3000/a', scope), `${scope}, localhost:3000`);
    assert.equal(b[scope], UrlUtils.hashUrl('http://localhost:8080/a', scope), `${scope}, localhost:8080`);
    assert.notEqual(a[scope], b[scope], `${scope}: two ports are two sites`);
  }
});

test('the script loads the extension\'s hash instead of keeping a copy, and its footer names only what the extension does', () => {
  const source = fs.readFileSync(script, 'utf8');
  assert.match(source, /require\('\.\.\/utils\/url-utils\.js'\)/);
  assert.doesNotMatch(source, /static hashUrl|class UrlUtils|class URLHashCache|hostname_fallback|matchSource/);
  // the lookup the footer describes is real: Debug mode logs a same-site hit as "hostname fallback"
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'modules', 'detection', 'engine', 'detection-engine-manager.js'), 'utf8'), /Hit \(hostname fallback\)/);
});
