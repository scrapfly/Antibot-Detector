'use strict';

// Texts that described something the extension does not do (3.1.9 wording pass): the Clear cache confirmation, the
// History limit error, the Advanced tab's own History, and the "blacklist" words for the sites the person skips.
// The storage keys and setting names keep their old names (blacklistedDomains, ...) so saved data keeps working:
// only what a person reads changes.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const locales = fs.readdirSync(path.join(root, '_locales')).filter(l => fs.existsSync(path.join(root, '_locales', l, 'messages.json')));
const messages = (l) => JSON.parse(read(`_locales/${l}/messages.json`));
const en = messages('en');

test('Clear cache promises no scan it does not start and no scope it does not have', () => {
  const text = en.clearCacheConfirmMsg.message;
  assert.doesNotMatch(text, /fresh analysis|trigger/i, 'nothing is scanned when the cache is cleared');
  assert.doesNotMatch(text, /this domain/i, 'the saved result can be for a path or an exact address');
  assert.match(text, /reload/i, 'says how the page gets scanned again');
});

test('the History limit error says what 0 really keeps', () => {
  const limit = Number(/SAFETY_LIMIT:\s*(\d+)/.exec(read('background/history-retention.js'))[1]);
  const text = en.settingsUiErrHistoryLimit.message;
  assert.doesNotMatch(text, /unlimited/i);
  assert.ok(text.includes(limit.toLocaleString('en-US')), `names the ${limit}-entry cap`);
  for (const l of locales) {
    const own = messages(l).settingsUiErrHistoryLimit.message;
    assert.doesNotMatch(own, /\(0 \(|ilimitad|illimit|unbegrenzt|без ограничений|无限|不限/i, `${l}: no longer says 0 is unlimited`);
  }
});

test('Cache scope, Include timestamps and Save on cache hits are explained in Settings', () => {
  const html = read('sections/settings/settings.html');
  for (const key of ['settingsCacheScopeDesc', 'settingsIncludeTimestampsDesc', 'settingsSaveOnCacheHitsDesc']) {
    assert.ok(html.includes(`data-i18n="${key}"`), `${key} is on the page`);
    for (const l of locales) assert.ok(messages(l)[key] && messages(l)[key].message, `${l}: ${key}`);
  }
  assert.match(en.settingsIncludeTimestampsDesc.message, /CSV/);
  assert.match(en.settingsSaveOnCacheHitsDesc.message, /cache/i);
});

test('the Advanced sub-tab is Captures, not a second History', () => {
  assert.equal(en.advancedSubtabHistory.message, 'Captures');
  assert.match(read('sections/advanced/advanced.html'), /data-i18n="advancedSubtabHistory">Captures</);
  for (const l of locales) {
    const m = messages(l);
    assert.notEqual(m.advancedSubtabHistory.message, m.tabHistory.message, `${l}: the sub-tab is not named like the History tab`);
  }
  assert.match(read('README.md'), /\*\*Advanced → Captures\*\*/);
});

test('sites the person skips are never called a blacklist or blocked', () => {
  const keys = ['actionRemoveFromBlacklist', 'blacklistedDomains', 'blacklistedDomainsDesc', 'addBlacklistTitle', 'addBlacklistMsgFmt',
    'addBlacklistBtn', 'alreadyBlacklistedFmt', 'addedToBlacklistFmt', 'failedAddBlacklistFmt', 'removedFromBlacklistFmt',
    'failedRemoveBlacklistFmt', 'notificationDomainBlacklistedFmt', 'notificationBlacklistFailed', 'domainAlreadyBlacklistedFmt',
    'settingsCardSkipDomains', 'detectionRemoveFromBlacklistBtn', 'detectionBlacklistHint', 'failedRemoveBlacklist',
    'detectionTitleBlockDomain', 'detectionDomainBlacklistedTitle', 'detectionDisabledForDomain', 'settingsUiBlacklistEmpty',
    'settingsUiBlacklistNoMatches'];
  for (const key of keys) assert.doesNotMatch(en[key].message, /black\s*list|block/i, key);
  // The English the pages show before the translations load says the same
  for (const p of ['sections/detection/detection.html', 'sections/history/history.html', 'sections/settings/settings.html']) {
    const visible = read(p).replace(/<[^>]*>/g, ' ');
    assert.doesNotMatch(visible, /Blacklist|Block this domain/, p);
    assert.doesNotMatch(read(p), /title="(Block this domain|This domain is blacklisted)"/, p);
  }
  // A skipped site is an exact host: its subdomains are scanned (ScanScope.isExcluded), so the text does not say otherwise
  assert.match(en.blacklistedDomainsDesc.message, /subdomains are still scanned/);
});
