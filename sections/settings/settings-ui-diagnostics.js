// Settings → Data → Support → Copy diagnostics: a summary for a bug report, written by DiagnosticsReport.
// Requires settings-ui.js to load first (defines const SettingsUI), modules/settings/diagnostics-report.js and settings-ui-storage.js.

/** What the report needs from the browser and the extension. The report itself decides what is safe to say. */
SettingsUI.gatherDiagnostics = async function(settings) {
    const local = chrome.storage.local;
    const stored = await local.get(['scrapfly_language_override', 'scrapfly_last_update_check', 'scrapfly_collected_logs',
        'scrapfly_pending_updates', 'scrapfly_incompatible_updates', 'scrapfly_update_errors']);
    let isBrave = false;
    try { isBrave = !!(navigator.brave && await navigator.brave.isBrave()); } catch (_) { /* not Brave */ }

    // Detectors: how many, of which category, which are custom and which official ones were edited
    const detectors = { total: 0, official: 0, custom: 0, edited: 0, byCategory: {}, versions: {}, indexVersion: null,
        lastCheckAt: (settings.updates && settings.updates.lastCheckTimestamp) || stored.scrapfly_last_update_check || 0,
        // What Rules → Update left waiting: for a newer extension, and failed
        pending: Array.isArray(stored.scrapfly_pending_updates) ? stored.scrapfly_pending_updates.length : 0,
        incompatible: Array.isArray(stored.scrapfly_incompatible_updates) ? stored.scrapfly_incompatible_updates.length : 0,
        failed: Array.isArray(stored.scrapfly_update_errors) ? stored.scrapfly_update_errors.length : 0 };
    // The version of the bundled rule set (a number, no names)
    try { detectors.indexVersion = String((await (await fetch(chrome.runtime.getURL('detectors/index.json'))).json()).version || ''); } catch (_) { /* unreadable: left out */ }
    const registry = (window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.detectors) || {};
    for (const [category, group] of Object.entries(registry)) {
        for (const detector of Object.values(group || {})) {
            detectors.total++;
            const key = Categories.keyOf(category);
            detectors.byCategory[key] = (detectors.byCategory[key] || 0) + 1;
            if (DetectionUtils.isOfficialDetector(detector)) {
                detectors.official++;
                if (detector.userModified) detectors.edited++;
                // Which versions of the official rules are installed (tells whether updates landed)
                const version = String(detector.version || 'unversioned');
                detectors.versions[version] = (detectors.versions[version] || 0) + 1;
            } else {
                detectors.custom++;
            }
        }
    }

    const history = await HistoryStore.usage(local).catch(() => null);
    const sizes = await SettingsUI.readStorageSizes().catch(() => null);
    const logs = Array.isArray(stored.scrapfly_collected_logs) ? stored.scrapfly_collected_logs : [];
    return {
        version: chrome.runtime.getManifest().version,
        now: Date.now(),
        userAgent: navigator.userAgent,
        brands: navigator.userAgentData ? navigator.userAgentData.brands : undefined,
        isBrave,
        uiLanguage: I18n.locale(),
        languageOverride: stored.scrapfly_language_override || 'auto',
        detectors,
        history: history ? { entries: history.entries, bytes: history.bytes } : undefined,
        storage: sizes ? { used: sizes.total, quota: sizes.quota, unlimited: sizes.unlimited } : undefined,
        workerCurrent: await SettingsUI.workerIsCurrent().catch(() => null),
        logs: { enabled: settings.logCollectorEnabled === true, errors: logs.filter(entry => entry && entry.level === 'error').slice(-DiagnosticsReport.MAX_ERRORS) }
    };
};

SettingsUI.copyDiagnostics = async function() {
    const text = (key, fallback) => FormatUtils.t(key, fallback);
    try {
        const report = DiagnosticsReport.build(await SettingsUI.gatherDiagnostics(this.settings), this.settings);
        if (!await FormatUtils.copyToClipboard(report, { notify: false })) throw new Error('The clipboard refused the text');
        NotificationHelper.success(text('diagnosticsCopied', 'Diagnostics copied'));
    } catch (error) {
        Logger.warn('UI', 'Could not copy the diagnostics', error);
        NotificationHelper.error(text('diagnosticsCopyFailed', 'Could not copy the diagnostics'));
    }
};

SettingsUI._setupDiagnosticsListeners = function() {
    const button = document.querySelector('#copyDiagnosticsBtn');
    if (button) button.addEventListener('click', () => SettingsUI.copyDiagnostics.call(this));
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
