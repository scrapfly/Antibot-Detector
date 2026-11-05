#!/usr/bin/env node
/**
 * Debug helper: print the cache keys of an address, to compare them with the keys in scrapfly_detection_storage.
 *
 * Usage:
 *   node scripts/verify-cache-key.js "https://www.google.com/recaptcha/api2/demo"
 *   node scripts/verify-cache-key.js "https://web.whatsapp.com/" path
 *   node scripts/verify-cache-key.js "http://localhost:3000/a" all
 *
 * Second argument is optional cache scope: domain | path | full | all (default: domain; all prints the three).
 * The keys come from the extension's own UrlUtils.hashUrl (utils/url-utils.js): a port that is not the scheme's own is part
 * of the site, so localhost:3000 and localhost:8080 print different keys.
 * Does not read Chrome storage — only prints hashes for comparison in DevTools.
 */

const UrlUtils = require('../utils/url-utils.js');

const url = process.argv[2];
const scopeArg = process.argv[3] || 'domain';

if (!url) {
    console.error('Usage: node scripts/verify-cache-key.js <url> [domain|path|full|all]');
    process.exit(1);
}

const scopes = scopeArg === 'all' ? ['domain', 'path', 'full'] : [scopeArg];

console.log('URL:', url);
console.log('Hostname:', UrlUtils.getHostnameFromUrl(url));
console.log('');

for (const scope of scopes) {
    console.log(`scope=${scope}`);
    console.log(`  primaryKey: ${UrlUtils.hashUrl(url, scope)}`);
}

console.log('');
console.log('In chrome://extensions → Service worker → Application → Storage →');
console.log('  scrapfly_detection_storage — compare keys above to stored object keys.');
console.log('A page is looked up under the key of the Cache Scope set in Settings, then under the keys of the more specific');
console.log('scopes (domain, path, full). Under the Domain scope a saved result of the same site (same host and port, with or');
console.log('without www) also answers when no key matches; Debug mode logs that as "Hit (hostname fallback)".');
