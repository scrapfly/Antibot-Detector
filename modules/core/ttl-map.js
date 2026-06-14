/**
 * TTLMap - Auto-expiring Map with LRU eviction
 *
 * Used for temporary storage of headers, payloads, detection states, etc.
 * Entries auto-expire after ttlMs and oldest entries are evicted when maxSize is reached.
 */
class TTLMap extends Map {
    constructor(ttlMs = 300000, maxSize = 500) { // 5 min default, 500 entries max
        super();
        this.ttlMs = ttlMs;
        this.maxSize = maxSize;
        this.timers = new Map();
        this.expirations = new Map(); // key -> absolute expiry timestamp (ms epoch)
        this.accessOrder = []; // Track insertion order for LRU eviction
    }

    // Lazy expiration: timestamp check on every read.
    // Guards against MV3 service-worker suspend pausing setTimeout (entries that
    // *should* have expired during a long suspension are dropped on next access).
    _isExpired(key) {
        const exp = this.expirations.get(key);
        return exp !== undefined && Date.now() > exp;
    }

    has(key) {
        if (this._isExpired(key)) {
            this.delete(key);
            return false;
        }
        return super.has(key);
    }

    get(key) {
        if (this._isExpired(key)) {
            this.delete(key);
            return undefined;
        }
        return super.get(key);
    }

    set(key, value) {
        // Update existing key
        if (super.has(key)) {
            // Remove from accessOrder first
            const idx = this.accessOrder.indexOf(key);
            if (idx > -1) this.accessOrder.splice(idx, 1);
            clearTimeout(this.timers.get(key));
        } else if (this.size >= this.maxSize) {
            // Adding new key and at capacity - evict oldest
            this._evictOldest();
        }

        // Set new timer for auto-cleanup (best-effort; lazy check is the source of truth)
        const timer = setTimeout(() => {
            super.delete(key);
            this.timers.delete(key);
            this.expirations.delete(key);
            const idx = this.accessOrder.indexOf(key);
            if (idx > -1) this.accessOrder.splice(idx, 1);
        }, this.ttlMs);

        this.timers.set(key, timer);
        this.expirations.set(key, Date.now() + this.ttlMs);
        this.accessOrder.push(key); // Track insertion order
        return super.set(key, value);
    }

    _evictOldest() {
        if (this.accessOrder.length === 0) return;
        const oldest = this.accessOrder.shift(); // Remove oldest
        if (this.timers.has(oldest)) {
            clearTimeout(this.timers.get(oldest));
            this.timers.delete(oldest);
        }
        this.expirations.delete(oldest);
        super.delete(oldest);
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
        this.expirations.delete(key);
        // Remove from access order
        const idx = this.accessOrder.indexOf(key);
        if (idx > -1) this.accessOrder.splice(idx, 1);
        return super.delete(key);
    }

    clear() {
        for (const timer of this.timers.values()) {
            clearTimeout(timer);
        }
        this.timers.clear();
        this.expirations.clear();
        this.accessOrder = [];
        return super.clear();
    }
}

// Node test export (no-op in the browser, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = TTLMap; }
