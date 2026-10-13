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

    async function apply(mutation) {
        const previous = await StorageManager.readSettingsStrict();
        let settings = clone(previous);
        if (mutation.operation === 'merge') {
            if (!isObject(mutation.baseline) || !isObject(mutation.candidate)) throw new Error('Invalid settings change');
            settings = StorageManager.mergeSettingsChanges(mutation.baseline, mutation.candidate, settings);
        } else if (mutation.operation === 'patch') {
            settings = patchObject(settings, mutation.patch);
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
            if (!['auto', 'en', 'es', 'fr', 'de', 'it', 'pt_BR', 'ru', 'ja', 'ko', 'zh_CN', 'ar', 'hi'].includes(mutation.languageOverride)) {
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
        registry[root.ScrapflyBridgeProtocol.MESSAGE_TYPES.SETTINGS_MUTATE] = ({ request, sendResponse }) => {
            mutate(request.mutation).then(sendResponse, () => sendResponse({ success: false, error: 'Settings could not be saved' }));
            return true;
        };
    }
    StorageManager.settingsWriter = mutate;
    root.SettingsStore = { mutate, registerHandlers };
})(globalThis);
