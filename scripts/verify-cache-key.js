#!/usr/bin/env node
/**
 * Debug helper: print computed cache keys vs keys in scrapfly_detection_storage.
 *
 * Usage:
 *   node scripts/verify-cache-key.js "https://www.google.com/recaptcha/api2/demo"
 *   node scripts/verify-cache-key.js "https://web.whatsapp.com/" path
 *
 * Second argument is optional cache scope: domain | path | full (default: domain).
 * Does not read Chrome storage — only prints hashes for comparison in DevTools.
 */

const path = require('path');

// Minimal inline hash (matches utils/url-utils.js UrlUtils.hashUrl)
class URLHashCache {
    constructor(maxSize) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    has(k) { return this.cache.has(k); }
    get(k) { return this.cache.get(k); }
    set(k, v) {
        if (this.cache.size >= this.maxSize) {
            const first = this.cache.keys().next().value;
            this.cache.delete(first);
        }
        this.cache.set(k, v);
    }
}

class UrlUtils {
    static urlHashCache = new URLHashCache(1000);

    static hashUrl(url, scope = 'domain') {
        const cacheKey = `${scope}:${url}`;
        if (UrlUtils.urlHashCache.has(cacheKey)) {
            return UrlUtils.urlHashCache.get(cacheKey);
        }

        let normalizedUrl;
        let effectiveScope = scope;

        try {
            const urlObj = new URL(url);
            switch (scope) {
                case 'full':
                    normalizedUrl = url;
                    break;
                case 'path':
                    normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname}`;
                    break;
                case 'domain':
                default:
                    normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}`;
                    effectiveScope = 'domain';
                    break;
            }
        } catch (e) {
            normalizedUrl = url;
        }

        let h1 = 5381;
        let h2 = 0;
        for (let i = 0; i < normalizedUrl.length; i++) {
            const char = normalizedUrl.charCodeAt(i);
            h1 = (((h1 << 5) + h1) + char) | 0;
            h2 = (char + (h2 << 6) + (h2 << 16) - h2) | 0;
        }

        const hashString = `${effectiveScope}_${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
        UrlUtils.urlHashCache.set(cacheKey, hashString);
        return hashString;
    }

    static getHostnameFromUrl(url) {
        try {
            return new URL(url).hostname;
        } catch (e) {
            return url;
        }
    }
}

const url = process.argv[2];
const scopeArg = process.argv[3] || 'domain';

if (!url) {
    console.error('Usage: node scripts/verify-cache-key.js <url> [domain|path|full]');
    process.exit(1);
}

const scopes = scopeArg === 'all' ? ['domain', 'path', 'full'] : [scopeArg];

console.log('URL:', url);
console.log('Hostname:', UrlUtils.getHostnameFromUrl(url));
console.log('');

for (const scope of scopes) {
    const key = UrlUtils.hashUrl(url, scope);
    console.log(`scope=${scope}`);
    console.log(`  primaryKey: ${key}`);
}

console.log('');
console.log('In chrome://extensions → Service worker → Application → Storage →');
console.log('  scrapfly_detection_storage — compare keys above to stored object keys.');
console.log('If primary misses but a domain_* key exists for the same hostname,');
console.log('the extension should serve it via hostname_fallback (Debug: matchSource).');
