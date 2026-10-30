/** Worker-owned settings mutations. Reads and writes share one serialized queue. */
(function(root) {
    'use strict';
    let queue = Promise.resolve();
    const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const clone = value => JSON.parse(JSON.stringify(value));
    const legacyKeys = ['hooksConfig', 'reliabilityConfig', 'cacheDuration', 'cacheUnit', 'cacheScope', 'cacheHours', 'blacklistedDomains'];

    function patchObject(target, patch) {
        if (!isObject(patch)) throw new Error('Invalid settings change');
        for (const [key, value] of Object.entries(patch)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) continue;
            if (isObject(value)) {
                if (!isObject(target[key])) target[key] = {};
                patchObject(target[key], value);
            } else {
                target[key] = clone(value);
            }
        }
        return target;
    }

    function pathValue(source, path) {
        let value = source;
        for (const part of path.split('.')) {
            if (!isObject(value)) return undefined;
            value = value[part];
        }
        return value;
    }

    function setPathValue(target, path, value) {
        const parts = path.split('.');
        if (parts.some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) return;
        let node = target;
        for (const part of parts.slice(0, -1)) {
            if (!isObject(node[part])) node[part] = {};
            node = node[part];
        }
        node[parts[parts.length - 1]] = value;
    }

    async function apply(mutation) {
        const previous = await StorageManager.readSettingsStrict();
        let settings = clone(previous);
        if (mutation.operation === 'merge') {
            if (!isObject(mutation.baseline) || !isObject(mutation.candidate)) throw new Error('Invalid settings change');
            settings = StorageManager.mergeSettingsChanges(mutation.baseline, mutation.candidate, settings);
        } else if (mutation.operation === 'patch') {
            settings = patchObject(settings, mutation.patch);
        } else if (mutation.operation === 'reset') {
            // Every setting returns to the defaults the caller sends, except the dotted paths it asks to keep
            if (!isObject(mutation.defaults) || !Array.isArray(mutation.keep) || !mutation.keep.every(path => typeof path === 'string' && path)) throw new Error('Invalid settings reset');
            const next = clone(mutation.defaults);
            for (const path of mutation.keep) {
                const kept = pathValue(settings, path);
                if (kept !== undefined) setPathValue(next, path, clone(kept));
            }
            settings = next;
        } else if (mutation.operation === 'domain') {
            if (typeof mutation.domain !== 'string' || !mutation.domain.trim() || typeof mutation.excluded !== 'boolean') {
                throw new Error('Invalid domain exclusion');
            }
            const domain = mutation.domain.trim().toLowerCase();
            settings.detection = isObject(settings.detection) ? settings.detection : {};
            const domains = Array.isArray(settings.detection.blacklistedDomains) ? settings.detection.blacklistedDomains : [];
            settings.detection.blacklistedDomains = mutation.excluded
                ? [...new Set([...domains, domain])]
                : domains.filter(value => value !== domain);
        } else if (mutation.operation === 'allow') {
            if (typeof mutation.domain !== 'string' || !mutation.domain.trim() || typeof mutation.allowed !== 'boolean') {
                throw new Error('Invalid site');
            }
            const domain = mutation.domain.trim().toLowerCase();
            settings.detection = isObject(settings.detection) ? settings.detection : {};
            const sites = Array.isArray(settings.detection.allowedDomains) ? settings.detection.allowedDomains : [];
            settings.detection.allowedDomains = mutation.allowed
                ? [...new Set([...sites, domain])]
                : sites.filter(value => value !== domain);
        } else {
            throw new Error('Unknown settings change');
        }
        // Only discard flat legacy fields after preserving their nested values.
        settings.detection = isObject(settings.detection) ? settings.detection : {};
        for (const key of ['cacheDuration', 'cacheUnit', 'cacheScope', 'blacklistedDomains', 'hooksConfig']) {
            if (settings.detection[key] === undefined && settings[key] !== undefined) settings.detection[key] = settings[key];
        }
        if (settings.detection.cacheDuration === undefined && settings.cacheHours !== undefined) {
            settings.detection.cacheDuration = settings.cacheHours;
            settings.detection.cacheUnit = 'hours';
        }
        for (const key of legacyKeys) delete settings[key];
        const values = {
            scrapfly_settings: JSON.stringify({ timestamp: new Date().toISOString(), settings })
        };
        if (mutation.languageOverride !== undefined) {
            if (!['auto', 'en', 'es', 'fr', 'de', 'it', 'pt_BR', 'ru', 'ja', 'ko', 'zh_CN', 'zh_TW', 'ar', 'hi', 'tr', 'id', 'vi', 'pl', 'uk', 'nl', 'th', 'sv', 'cs'].includes(mutation.languageOverride)) {
                throw new Error('Invalid language');
            }
            values.scrapfly_language_override = mutation.languageOverride;
        }
        await chrome.storage.local.set(values);
        return { success: true, settings, previous };
    }

    function mutate(mutation) {
        // Clone before enqueueing so callers cannot mutate the queued payload.
        const change = clone(mutation);
        const operation = queue.then(() => apply(change));
        queue = operation.catch(() => {});
        return operation;
    }

    function registerHandlers(registry) {
        StorageManager.settingsWriter = mutate;
        // Extension pages only: it can set the webhook address or reset every setting
        registry[root.ScrapflyBridgeProtocol.MESSAGE_TYPES.SETTINGS_MUTATE] = root.MessageSender.extensionPagesOnly(({ request, sendResponse }) => {
            mutate(request.mutation).then(sendResponse, () => sendResponse({ success: false, error: 'Settings could not be saved' }));
            return true;
        });
    }
    StorageManager.settingsWriter = mutate;
    root.SettingsStore = { mutate, registerHandlers };
})(globalThis);
