const { test } = require('node:test');
const assert = require('node:assert/strict');
const manifest = require('../manifest.json');

// The extension's page-side scripts run in the page's own world ("world": "MAIN" in a content script, Chrome 111). A browser older than
// that would load them in the isolated world, where every hook and window check silently finds nothing: the store must not offer it there.

test('the manifest names the Chrome version the MAIN-world content scripts need', () => {
  const needsMainWorld = (manifest.content_scripts || []).some(script => script.world === 'MAIN');
  assert.ok(needsMainWorld, 'the extension has a MAIN-world content script');
  assert.ok(Number(manifest.minimum_chrome_version) >= 111, `minimum_chrome_version ${manifest.minimum_chrome_version}`);
});
