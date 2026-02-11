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
        this.accessOrder = []; // Track insertion order for LRU eviction
    }

    set(key, value) {
        // Update existing key
        if (this.has(key)) {
            // Remove from accessOrder first
            const idx = this.accessOrder.indexOf(key);
            if (idx > -1) this.accessOrder.splice(idx, 1);
            clearTimeout(this.timers.get(key));
        } else if (this.size >= this.maxSize) {
            // Adding new key and at capacity - evict oldest
            this._evictOldest();
        }

        // Set new timer for auto-cleanup
        const timer = setTimeout(() => {
            super.delete(key);
            this.timers.delete(key);
            // Remove from access order
            const idx = this.accessOrder.indexOf(key);
            if (idx > -1) this.accessOrder.splice(idx, 1);
        }, this.ttlMs);

        this.timers.set(key, timer);
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
        super.delete(oldest);
    }

    delete(key) {
        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
            this.timers.delete(key);
        }
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
        this.accessOrder = [];
        return super.clear();
    }
}
