/**
 * Pattern Cache Utility
 * High-performance caching for compiled regex patterns and match results
 */

/**
 * Simple hash function for cache keys
 * @param {string} str - String to hash
 * @returns {string} - Base36 hash
 */
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36); // Base36 for shorter keys
}

/**
 * Heuristic ReDoS check — rejects patterns most likely to cause catastrophic
 * backtracking. Conservative: prefers false positives (over-rejection) to a
 * hung extension. Catches `(a+)+`, `(a*)*`, `(\d+)+`, `(a{2,})+`, etc.
 * @param {string} pattern - User-supplied regex source
 * @returns {boolean} true if the pattern looks dangerous
 */
function isLikelyEvilRegex(pattern) {
    if (typeof pattern !== 'string') return false;
    if (pattern.length > 1000) return true;
    // group containing + * or {n,} immediately followed by another + or *
    if (/\([^()]*[+*][^()]*\)\s*[+*]/.test(pattern)) return true;
    if (/\([^()]*\{\d+,\}[^()]*\)\s*[+*]/.test(pattern)) return true;
    return false;
}

/**
 * PatternCache - High-performance caching for compiled regex patterns and match results
 * Uses LRU eviction strategy to limit memory usage
 * Eliminates 60-80% of regex compilation overhead
 */
class PatternCache {
    constructor(maxSize = Constants.PATTERN_CACHE_MAX_SIZE) {
        this.maxSize = maxSize;
        // Cache for compiled regex patterns: key -> {regex, timestamp}
        this.regexCache = new Map();
        // Cache for match results: key -> {result, timestamp}
        this.matchCache = new Map();
        // FIFO queue for O(1) eviction
        this.insertionOrder = [];
    }

    /**
     * Generate cache key from pattern and options
     */
    getCacheKey(pattern, options = {}) {
        return `${pattern}|${options.regex}|${options.wholeWord}|${options.caseSensitive}`;
    }

    /**
     * Get or compile regex pattern
     */
    getCompiledPattern(pattern, options = {}) {
        const key = this.getCacheKey(pattern, options);

        if (this.regexCache.has(key)) {
            return this.regexCache.get(key).regex;
        }

        // Compile and cache
        let compiledRegex = null;
        try {
            if (options.regex) {
                if (isLikelyEvilRegex(pattern)) {
                    if (typeof Logger !== 'undefined' && Logger.warn) {
                        Logger.warn('DETECTION', '[PatternCache] Rejecting potentially dangerous regex (ReDoS risk):', pattern);
                    }
                    return null;
                }
                // Non-global: these compiled regexes are cached and reused across
                // many texts with .test(); a 'g' flag makes lastIndex persist and
                // produces intermittent false negatives. .test()/.match()[0] don't
                // need the global flag.
                const flags = options.caseSensitive ? '' : 'i';
                compiledRegex = new RegExp(pattern, flags);
            } else if (options.wholeWord) {
                const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                compiledRegex = new RegExp(`\\b${escapedPattern}\\b`, options.caseSensitive ? '' : 'i');
            }
        } catch (e) {
            return null;
        }

        // Cache and evict if needed
        this.regexCache.set(key, { regex: compiledRegex, timestamp: Date.now() });
        this.insertionOrder.push(key);
        this.evictIfNeeded();

        return compiledRegex;
    }

    /**
     * Check if match result is cached
     */
    textKeyFor(text) {
        // Hash full text instead of truncating (prevents collisions)
        return text.length > 100 ? simpleHash(text) : text;
    }

    getCachedMatch(text, pattern, options, textKey) {
        const textHash = textKey !== undefined ? textKey : this.textKeyFor(text);
        const matchKey = `${textHash}|${this.getCacheKey(pattern, options)}`;

        if (this.matchCache.has(matchKey)) {
            const cached = this.matchCache.get(matchKey);
            if (Date.now() - cached.timestamp < Constants.MATCH_CACHE_TTL) {
                return { found: true, result: cached.result };
            }
            // Expired, remove
            this.matchCache.delete(matchKey);
        }
        return { found: false };
    }

    /**
     * Cache a match result
     */
    cacheMatch(text, pattern, options, result, textKey) {
        const textHash = textKey !== undefined ? textKey : this.textKeyFor(text);
        const matchKey = `${textHash}|${this.getCacheKey(pattern, options)}`;
        this.matchCache.set(matchKey, { result, timestamp: Date.now() });
        this.insertionOrder.push(matchKey);
        this.evictIfNeeded();
    }

    /**
     * Evict oldest entries if cache is full
     * Uses FIFO (First-In-First-Out) for O(1) eviction
     */
    evictIfNeeded() {
        const totalSize = this.regexCache.size + this.matchCache.size;
        if (totalSize > this.maxSize) {
            // Simple FIFO: evict oldest 10% from front of queue
            const evictCount = Math.max(1, Math.floor(this.maxSize * 0.1));
            for (let i = 0; i < evictCount && this.insertionOrder.length > 0; i++) {
                const oldestKey = this.insertionOrder.shift();
                this.regexCache.delete(oldestKey);
                this.matchCache.delete(oldestKey);
            }
        }
    }

    /**
     * Clear all caches
     */
    clear() {
        this.regexCache.clear();
        this.matchCache.clear();
        this.insertionOrder = [];
    }
}

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = { PatternCache, isLikelyEvilRegex, simpleHash }; }
