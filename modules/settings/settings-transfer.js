/** Portable preferences deliberately exclude local integration connections. */
(function(root) {
    'use strict';
    const allowed = {
        root: ['notificationsEnabled', 'debugMode', 'debugVerbose', 'logCollectorEnabled', 'logCollectorMaxLogs', 'defaultTab'],
        badgeColors: ['low', 'medium', 'high'],
        categoryColors: ['antibot', 'captcha', 'fingerprint'],
        tagColors: ['dom', 'headers', 'cookies', 'content', 'urls', 'js_hooks', 'window', 'payload'],
        detection: ['cacheDuration', 'cacheUnit', 'cacheScope', 'sortBy', 'categoryOrder', 'advancedToolsMinConfidence', 'blacklistedDomains', 'hooksConfig'],
        jsApi: ['enableJsApi'],
        share: ['provider', 'dpasteComDays', 'dpasteOrgExpires', 'pastebinExpire', 'customExpiryDays'],
        history: ['historyLimit', 'historyAutoDelete', 'historyAutoDeleteDays', 'exportFormat', 'includeTimestamps', 'historyBypassCache'],
        duplicatePrevention: ['preventDuplicates', 'duplicateScope', 'duplicateDuration', 'duplicateUnit'],
        updates: ['autoUpdate', 'checkIntervalHours']
    };
    function portable(settings) {
        const output = {};
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return output;
        for (const [section, keys] of Object.entries(allowed)) {
            const source = section === 'root' ? settings : settings[section];
            if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
            const target = section === 'root' ? output : (output[section] = {});
            for (const key of keys) {
                if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = JSON.parse(JSON.stringify(source[key]));
            }
        }
        return output;
    }
    function diagnostics(settings = {}) {
        return {
            debugMode: settings.debugMode === true,
            logCollectorEnabled: settings.logCollectorEnabled === true,
            webhookEnabled: settings.webhook?.enableWebhook === true,
            excludedDomainCount: Array.isArray(settings.detection?.blacklistedDomains) ? settings.detection.blacklistedDomains.length : 0,
            autoUpdate: settings.updates?.autoUpdate === true
        };
    }
    root.SettingsTransfer = { portable, diagnostics };
})(globalThis);
