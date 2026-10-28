/** Portable preferences deliberately exclude local integration connections. */
(function(root) {
    'use strict';
    const allowed = {
        root: ['notificationsEnabled', 'debugMode', 'debugVerbose', 'logCollectorEnabled', 'logCollectorMaxLogs', 'defaultTab'],
        badgeColors: ['low', 'medium', 'high'],
        categoryColors: [...root.Categories.KEYS],
        tagColors: ['dom', 'headers', 'cookies', 'content', 'urls', 'js_hooks', 'window', 'payload'],
        detection: ['cacheDuration', 'cacheUnit', 'cacheScope', 'sortBy', 'categoryOrder', 'advancedToolsMinConfidence', 'captureRetentionMinutes', 'scanMode', ...root.ScanScope.SITE_LIST_KEYS, 'hooksConfig'],
        jsApi: ['enableJsApi'],
        share: ['provider', 'dpasteComDays', 'dpasteOrgExpires', 'pastebinExpire', 'customExpiryDays'],
        history: ['historyLimit', 'historyAutoDelete', 'historyAutoDeleteDays', 'exportFormat', 'includeTimestamps', 'historyBypassCache',
            'historyEnabled', 'historySkipIncognito', 'historyMinConfidence', 'historySkipFingerprintOnly',
            'historyExcludedDomains', 'historyChangeAlerts', 'historyBackup', 'historyClearOnClose',
            'historyFingerprintDays', 'historyAutoPinHard', 'historyAutoPinVendors', 'historyAutoPinMinConfidence', 'historyMaxMB', 'historyWatch'],
        duplicatePrevention: ['preventDuplicates', 'duplicateScope', 'duplicateDuration', 'duplicateUnit', 'duplicateAction'],
        updates: ['autoUpdate', 'checkIntervalHours']
    };
    const COLOR_GROUPS = new Set(['badgeColors', 'categoryColors', 'tagColors']);
    const isHexColor = (value) => typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
    function portable(settings) {
        const output = {};
        if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return output;
        for (const [section, keys] of Object.entries(allowed)) {
            const source = section === 'root' ? settings : settings[section];
            if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
            const target = section === 'root' ? output : (output[section] = {});
            for (const key of keys) {
                if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
                // A colour is written into the pages' styles: only a hex colour comes in from a file
                if (COLOR_GROUPS.has(section) && !isHexColor(source[key])) continue;
                target[key] = JSON.parse(JSON.stringify(source[key]));
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
    root.SettingsTransfer = { portable, diagnostics, isHexColor };
})(globalThis);
