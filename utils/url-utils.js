/**
 * URL Hash LRU Cache - Optimized cache with Least Recently Used eviction
 */
class URLHashCache {
  constructor(maxSize = 1000) {
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
   * Get current cache size
   * @returns {number} Number of entries
   */
  get size() {
    return this.cache.size;
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
  static getFaviconUrl(urlOrHostname) {
    if (!urlOrHostname) return this.getDefaultFaviconUrl();

    try {
      const hostname = urlOrHostname.includes('://')
        ? this.getHostnameFromUrl(urlOrHostname)
        : urlOrHostname;

      return `https://www.google.com/s2/favicons?domain=${hostname}`;
    } catch (error) {
      return this.getDefaultFaviconUrl();
    }
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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { UrlUtils, URLHashCache };
} else if (typeof window !== 'undefined') {
  window.UrlUtils = UrlUtils;
  window.URLHashCache = URLHashCache;
} else if (typeof self !== 'undefined') {
  self.UrlUtils = UrlUtils;
  self.URLHashCache = URLHashCache;
}
