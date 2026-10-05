const { test } = require('node:test');
const assert = require('node:assert');
const { createPage, installDetail, bootstrapDetail: engineBootstrap, P } = require('./helpers/main-world-page.js');

// The bootstrap event is the one thing the page could try to forge: it is
// adopted once, atomically (protocol + token), and later ones change nothing.
const TOKEN = 'a'.repeat(32);
const FORGED = 'f'.repeat(32);
const T = P.MESSAGE_TYPES;

const clone = (v) => JSON.parse(JSON.stringify(v));
const bootstrapDetail = (token, protocol = P) => ({ ...engineBootstrap(token), protocol, [P.FIELDS.TOKEN]: token });

test('a forged later bootstrap cannot change the token or the protocol', () => {
  const page = createPage();
  page.bootstrap(bootstrapDetail(TOKEN));

  const forgedProtocol = clone(P);
  forgedProtocol.EVENTS.MAIN_TO_ISOLATED = 'page-listens-here';
  forgedProtocol.EVENTS.INSTALL_HOOKS = 'page-install';
  forgedProtocol.TO_MAIN_TYPES.push('PAGE_TYPE');
  page.bootstrap(bootstrapDetail(FORGED, forgedProtocol));

  const leaked = [];
  page.context.addEventListener('page-listens-here', (e) => leaked.push(e.detail));
  page.install(installDetail(FORGED));
  assert.deepStrictEqual(page.posted, [], 'install with the forged token ignored');
  page.install(installDetail(TOKEN));
  assert.ok(page.ofType(T.JS_HOOKS_COMPLETE).length === 1, 'install with the real token works');
  assert.ok(page.posted.every(m => m[P.FIELDS.TOKEN] === TOKEN));
  assert.deepStrictEqual(leaked, [], 'reports still go to the original event');
});

test('a bootstrap with a malformed token adopts nothing, not even the protocol', () => {
  const page = createPage();
  for (const bad of [undefined, '', 'short', 'x'.repeat(129), 'has spaces in it and is long', 12345678901234567890]) {
    page.bootstrap(bootstrapDetail(bad));
  }
  page.install(installDetail(TOKEN));
  assert.deepStrictEqual(page.posted, [], 'no bridge without a valid bootstrap');

  // The real one still gets in afterwards
  page.bootstrap(bootstrapDetail(TOKEN));
  page.install(installDetail(TOKEN));
  assert.strictEqual(page.ofType(T.JS_HOOKS_COMPLETE).length, 1);
});

test('a bootstrap with a malformed protocol adopts nothing', () => {
  const page = createPage();
  const broken = clone(P);
  delete broken.EVENTS.INSTALL_HOOKS;
  page.bootstrap(bootstrapDetail(TOKEN, broken));
  page.bootstrap({ [P.FIELDS.TOKEN]: TOKEN });
  page.bootstrap(null);
  page.install(installDetail(TOKEN));
  assert.deepStrictEqual(page.posted, []);
});

test('the adopted protocol is a private frozen copy', () => {
  const page = createPage();
  const mine = clone(P);
  page.bootstrap(bootstrapDetail(TOKEN, mine));
  mine.EVENTS.MAIN_TO_ISOLATED = 'changed-after-bootstrap';
  page.install(installDetail(TOKEN));
  assert.strictEqual(page.ofType(T.JS_HOOKS_COMPLETE).length, 1, 'still reports on the original event');
});

test('bootstrap events never reach page listeners', () => {
  const page = createPage();
  const seen = [];
  page.context.addEventListener(P.EVENTS.BRIDGE_INIT, (e) => seen.push(e.detail));
  page.context.addEventListener(P.EVENTS.BRIDGE_INIT, (e) => seen.push(e.detail), true);
  page.bootstrap(bootstrapDetail(TOKEN));
  page.bootstrap(bootstrapDetail(TOKEN)); // a re-arm
  page.bootstrap(bootstrapDetail(FORGED));
  assert.deepStrictEqual(seen, []);
});
