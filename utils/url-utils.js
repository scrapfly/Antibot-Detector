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
    let hash;

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
          break;
      }

      hash = 0;
      for (let i = 0; i < normalizedUrl.length; i++) {
        const char = normalizedUrl.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
    } catch (e) {
      hash = 0;
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
    }

    const hashString = Math.abs(hash).toString(36);

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
          return candidate;
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
