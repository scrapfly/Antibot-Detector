/**
 * URL Hash LRU Cache - Optimized cache with Least Recently Used eviction
 */
class URLHashCache {
  constructor(maxSize = Constants.URL_HASH_CACHE_MAX_SIZE) {
    this.maxSize = maxSize;
    this.cache = new Map();
    this.accessOrder = [];
    this.accessSet = new Set();
  }

  /**
   * Get value from cache and update access order
   * @param {string} key - Cache key
   * @returns {string|undefined} Cached value or undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }

    this._touch(key);
    return this.cache.get(key);
  }

  /**
   * Set value in cache with LRU eviction
   * @param {string} key - Cache key
   * @param {string} value - Value to cache
   */
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.set(key, value);
      this._touch(key);
      return;
    }

    if (this.cache.size >= this.maxSize) {
      this._evict();
    }

    this.cache.set(key, value);
    this.accessOrder.push(key);
    this.accessSet.add(key);
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Move key to end of access order (most recently used)
   * @private
   * @param {string} key - Cache key
   */
  _touch(key) {
    if (this.accessSet.has(key)) {
      const index = this.accessOrder.indexOf(key);
      this.accessOrder.splice(index, 1);
    } else {
      this.accessSet.add(key);
    }
    this.accessOrder.push(key);
  }

  /**
   * Evict least recently used entries (first 10%)
   * @private
   */
  _evict() {
    const evictCount = Math.ceil(this.maxSize * 0.1);
    const keysToEvict = this.accessOrder.splice(0, evictCount);

    for (const key of keysToEvict) {
      this.cache.delete(key);
      this.accessSet.delete(key);
    }
  }

  /**
   * Clear entire cache
   */
  clear() {
    this.cache.clear();
    this.accessOrder = [];
    this.accessSet.clear();
  }
}

/**
 * UrlUtils - URL parsing, domain extraction, and favicon utilities
 */
class UrlUtils {
  static urlHashCache = new URLHashCache(1000);

  /**
   * Generate a hash for URL to use as cache key
   * Supports different cache scopes: domain, path, or full URL
   * @param {string} url - URL to hash
   * @param {string} scope - Cache scope: 'domain', 'path', or 'full'
   * @returns {string} Simple hash string
   */
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

    // Two parallel non-cryptographic hashes (djb2 + sdbm) → ~64 bits of state.
    // Drops collision probability from ~50% at 77k URLs to ~50% at 5B URLs.
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

  /**
   * Extract hostname from URL with proper error handling
   * @param {string} url - Full URL string
   * @returns {string} Hostname or fallback to original URL
   */
  static getHostnameFromUrl(url) {
    if (!url || typeof url !== 'string') return 'Unknown';

    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch (error) {
      return url;
    }
  }

  /**
   * Normalize hostname for cache fallback matching (lowercase, no trailing dot).
   * Does not alter stored cache keys.
   * @param {string} hostname
   * @returns {string}
   */
  static normalizeHostname(hostname) {
    if (!hostname || typeof hostname !== 'string') {
      return '';
    }
    return hostname.toLowerCase().replace(/\.$/, '').trim();
  }

  /**
   * Compare hostnames with optional www equivalence (fallback reads only).
   * @param {string} a
   * @param {string} b
   * @returns {boolean}
   */
  static hostnamesMatch(a, b) {
    const stripWww = (host) => {
      const normalized = UrlUtils.normalizeHostname(host);
      return normalized.startsWith('www.') ? normalized.slice(4) : normalized;
    };
    const left = stripWww(a);
    const right = stripWww(b);
    return left.length > 0 && left === right;
  }

  /**
   * Get favicon URL for a domain using Google's favicon service
   * @param {string} urlOrHostname - Full URL or just hostname
   * @returns {string} Google favicon service URL
   */
  static getFaviconUrl(urlOrHostname, size) {
    if (!urlOrHostname) return this.getDefaultFaviconUrl();

    try {
      const hostname = urlOrHostname.includes('://')
        ? this.getHostnameFromUrl(urlOrHostname)
        : urlOrHostname;

      const sizeParam = size ? `&sz=${size}` : '';
      return `https://www.google.com/s2/favicons?domain=${hostname}${sizeParam}`;
    } catch (error) {
      return this.getDefaultFaviconUrl();
    }
  }

  /**
   * Check if favicon URL is an unstable Google faviconV2 redirect URL.
   * These often expire and produce 404s when reused from storage.
   * @param {string} url - Favicon URL to inspect
   * @returns {boolean}
   */
  static isUnstableGoogleFaviconUrl(url) {
    if (!url || typeof url !== 'string') return false;

    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();
      return hostname.endsWith('gstatic.com') && path.includes('/faviconv2');
    } catch (error) {
      return false;
    }
  }

  /**
   * Normalize favicon URL before persisting to storage/history.
   * @param {string} rawFavicon - Raw favicon candidate
   * @param {string} pageUrlOrHostname - Page URL or hostname used to derive fallback favicon
   * @param {number} size - Optional favicon size
   * @returns {string} Stable favicon URL
   */
  static normalizeFaviconForStorage(rawFavicon, pageUrlOrHostname, size) {
    const candidate = typeof rawFavicon === 'string' ? rawFavicon.trim() : '';

    if (candidate) {
      if (this.isUnstableGoogleFaviconUrl(candidate)) {
        return this.getFaviconUrl(pageUrlOrHostname || candidate, size);
      }

      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          return parsed.href; // normalized + quote-safe (raw candidate could break out of a src="..." attribute)
        }
      } catch (error) {
        // Ignore parse errors and fall back below.
      }
    }

    if (pageUrlOrHostname) {
      return this.getFaviconUrl(pageUrlOrHostname, size);
    }

    return this.getDefaultFaviconUrl();
  }

  /**
   * Resolve favicon for UI rendering with compatibility for old stored values.
   * @param {string} rawFavicon - Stored favicon value
   * @param {string} pageUrlOrHostname - Page URL or hostname fallback
   * @param {number} size - Optional favicon size
   * @returns {string} Sanitized display favicon URL
   */
  static resolveDisplayFavicon(rawFavicon, pageUrlOrHostname, size) {
    return this.normalizeFaviconForStorage(rawFavicon, pageUrlOrHostname, size);
  }

  /** Locale override value → ISO country code for flag images. */
  static LOCALE_FLAG_COUNTRY = {
    en: 'us',
    es: 'es',
    pt_BR: 'br',
    fr: 'fr',
    de: 'de',
    it: 'it',
    ru: 'ru',
    ja: 'jp',
    ko: 'kr',
    zh_CN: 'cn',
    ar: 'sa',
    hi: 'in'
  };

  /**
   * Flag image URL for a settings language locale code.
   * @param {string} locale - e.g. "en", "pt_BR", "auto"
   * @param {number} [size=20]
   * @returns {string|null} null for "auto" (use globe icon in UI)
   */
  static getLocaleFlagUrl(locale, size = 20) {
    if (!locale || locale === 'auto') return null;
    const code = UrlUtils.LOCALE_FLAG_COUNTRY[locale];
    if (!code) return null;
    const width = Math.min(Math.max(Number(size) || 20, 16), 40);
    return `https://flagcdn.com/w${width}/${code}.png`;
  }

  /**
   * Get default favicon URL (extension icon)
   * @returns {string} Default favicon URL
   */
  static getDefaultFaviconUrl() {
    try {
      return chrome.runtime.getURL('icons/icon16.png');
    } catch (error) {
      return 'icons/icon16.png';
    }
  }

  /**
   * Clear the URL hash cache
   */
  static clearUrlHashCache() {
    UrlUtils.urlHashCache.clear();
  }
}

if (typeof window !== 'undefined') {
  window.UrlUtils = UrlUtils;
} else if (typeof self !== 'undefined') {
  self.UrlUtils = UrlUtils;
}

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = UrlUtils; }
