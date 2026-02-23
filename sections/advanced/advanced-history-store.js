/**
 * advanced-history-store.js
 * Single source of truth for Advanced capture history persistence.
 *
 * Storage format (canonical):
 * {
 *   [moduleId]: Array<{
 *     id: string,
 *     timestamp: number,
 *     url?: string,
 *     data: object,
 *     expiresAt?: number,
 *     ...moduleSpecificFields
 *   }>
 * }
 */

(function initAdvancedHistoryStore(globalContext) {
    const STORAGE_KEY = 'scrapfly_advanced_history';
    const DEFAULT_HISTORY_LIMIT = 100;

    function safeParseJson(value, fallback) {
        if (typeof value !== 'string') {
            return value;
        }

        try {
            return JSON.parse(value);
        } catch (error) {
            Logger.error('STORAGE', '[AdvancedHistoryStore] Failed to parse JSON history payload', error);
            return fallback;
        }
    }

    function toFiniteTimestamp(value, fallback) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    function normalizeCapture(moduleId, rawCapture = {}) {
        if (!rawCapture || typeof rawCapture !== 'object') {
            return null;
        }

        const timestamp = toFiniteTimestamp(rawCapture.timestamp, Date.now());
        const resolvedModule = moduleId || rawCapture.type || 'unknown';
        const id = rawCapture.id || `${resolvedModule}_${timestamp}`;
        const expiresAt = rawCapture.expiresAt === undefined
            ? undefined
            : toFiniteTimestamp(rawCapture.expiresAt, undefined);

        // Keep backwards compatibility: modules still read `captureData` in some places.
        const normalizedData = rawCapture.data !== undefined
            ? rawCapture.data
            : (rawCapture.captureData !== undefined ? rawCapture.captureData : {});

        const normalized = {
            ...rawCapture,
            id,
            timestamp,
            type: rawCapture.type || resolvedModule,
            data: normalizedData,
            captureData: normalizedData
        };

        if (expiresAt !== undefined) {
            normalized.expiresAt = expiresAt;
        } else {
            delete normalized.expiresAt;
        }

        return normalized;
    }

    function migrateToCanonical(rawHistory) {
        let changed = false;
        let history = safeParseJson(rawHistory, {});

        if (!history || typeof history !== 'object' || Array.isArray(history)) {
            history = {};
            changed = true;
        }

        // Legacy format: { items: [] }
        if (Array.isArray(history.items)) {
            const migrated = {};

            history.items.forEach((item) => {
                if (!item || typeof item !== 'object') {
                    changed = true;
                    return;
                }

                const moduleId = item.type || 'unknown';
                if (!migrated[moduleId]) {
                    migrated[moduleId] = [];
                }

                const normalized = normalizeCapture(moduleId, item);
                if (normalized) {
                    migrated[moduleId].push(normalized);
                } else {
                    changed = true;
                }
            });

            history = migrated;
            changed = true;
        }

        const normalizedHistory = {};
        Object.entries(history).forEach(([moduleId, entries]) => {
            if (!Array.isArray(entries)) {
                changed = true;
                return;
            }

            const normalizedEntries = [];
            entries.forEach((entry) => {
                const normalized = normalizeCapture(moduleId, entry);
                if (normalized) {
                    normalizedEntries.push(normalized);
                } else {
                    changed = true;
                }
            });

            normalizedHistory[moduleId] = normalizedEntries;
        });

        if (Object.keys(normalizedHistory).length !== Object.keys(history).length) {
            changed = true;
        }

        return {
            history: normalizedHistory,
            changed
        };
    }

    function cloneHistory(history) {
        return JSON.parse(JSON.stringify(history || {}));
    }

    async function load(options = {}) {
        const { persistIfChanged = true } = options;
        const result = await chrome.storage.local.get([STORAGE_KEY]);
        const { history, changed } = migrateToCanonical(result[STORAGE_KEY]);

        if (changed && persistIfChanged) {
            await save(history);
        }

        return history;
    }

    async function save(history) {
        const { history: canonical } = migrateToCanonical(history);
        await chrome.storage.local.set({ [STORAGE_KEY]: canonical });
        return canonical;
    }

    function normalizeLimit(limit) {
        const parsed = Number.parseInt(limit, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_HISTORY_LIMIT;
    }

    function filterNotExpired(entries, now = Date.now()) {
        return (entries || []).filter((entry) => !entry.expiresAt || entry.expiresAt > now);
    }

    async function cleanupExpired(moduleId = null) {
        const history = await load();
        const now = Date.now();
        let removedCount = 0;

        if (moduleId) {
            const existing = Array.isArray(history[moduleId]) ? history[moduleId] : [];
            const filtered = filterNotExpired(existing, now);
            removedCount += (existing.length - filtered.length);
            history[moduleId] = filtered;
        } else {
            Object.keys(history).forEach((key) => {
                const existing = Array.isArray(history[key]) ? history[key] : [];
                const filtered = filterNotExpired(existing, now);
                removedCount += (existing.length - filtered.length);
                history[key] = filtered;
            });
        }

        if (removedCount > 0) {
            await save(history);
        }

        return { history, removedCount };
    }

    async function appendCapture(moduleId, capture, options = {}) {
        if (!moduleId) {
            throw new Error('appendCapture requires moduleId');
        }

        const {
            expiryMinutes = 30,
            limit = DEFAULT_HISTORY_LIMIT
        } = options;

        const history = await load();
        const now = Date.now();
        const historyLimit = normalizeLimit(limit);
        const expiresAt = now + (expiryMinutes * 60 * 1000);
        const normalized = normalizeCapture(moduleId, {
            ...capture,
            type: moduleId,
            timestamp: capture?.timestamp || now,
            expiresAt: capture?.expiresAt || expiresAt
        });

        if (!history[moduleId]) {
            history[moduleId] = [];
        }

        const existing = filterNotExpired(history[moduleId], now);
        existing.unshift(normalized);
        history[moduleId] = existing.slice(0, historyLimit);

        await save(history);
        return normalized;
    }

    async function replaceModule(moduleId, entries = []) {
        const history = await load();
        history[moduleId] = (entries || [])
            .map((entry) => normalizeCapture(moduleId, entry))
            .filter(Boolean);
        await save(history);
        return history[moduleId];
    }

    async function getModule(moduleId, options = {}) {
        const {
            includeExpired = false,
            hostname = null
        } = options;

        const history = await load();
        let entries = Array.isArray(history[moduleId]) ? history[moduleId] : [];

        if (!includeExpired) {
            entries = filterNotExpired(entries, Date.now());
        }

        if (hostname) {
            entries = entries.filter((entry) => {
                try {
                    return entry.hostname === hostname || (entry.url && new URL(entry.url).hostname === hostname);
                } catch (error) {
                    return entry.hostname === hostname;
                }
            });
        }

        return entries;
    }

    async function deleteCapture(moduleId, captureId) {
        const history = await load();
        const existing = Array.isArray(history[moduleId]) ? history[moduleId] : [];
        history[moduleId] = existing.filter((entry) => entry.id !== captureId);
        await save(history);
        return history[moduleId];
    }

    async function clear(moduleId = null) {
        if (moduleId) {
            const history = await load();
            delete history[moduleId];
            await save(history);
            return history;
        }

        await chrome.storage.local.set({ [STORAGE_KEY]: {} });
        return {};
    }

    const AdvancedHistoryStore = {
        STORAGE_KEY,
        DEFAULT_HISTORY_LIMIT,
        migrate: migrateToCanonical,
        load,
        save,
        cleanupExpired,
        appendCapture,
        replaceModule,
        getModule,
        deleteCapture,
        clear,
        cloneHistory
    };

    globalContext.AdvancedHistoryStore = AdvancedHistoryStore;
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
