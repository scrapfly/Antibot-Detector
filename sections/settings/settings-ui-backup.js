// Settings → Data → Backup and restore: settings, your own rules and History in one file.
// Requires settings-ui.js (defines const SettingsUI), settings-ui-data.js (downloads, the older importers),
// modules/settings/backup-bundle.js and modules/settings/settings-transfer.js.

SettingsUI.backUpEverything = async function() {
    const text = (key, fallback) => FormatUtils.t(key, fallback);
    try {
        const detectorManager = window.popupInstance && window.popupInstance.detectorManager;
        if (!detectorManager) throw new Error('The rules are not loaded');
        const stored = await chrome.storage.local.get(['scrapfly_language_override']);
        const bundle = BackupBundle.build({
            extensionVersion: chrome.runtime.getManifest().version,
            // What is saved, never a draft that was not (Save it first to include it)
            settings: this.settingsBaseline || this.settings,
            languageOverride: stored.scrapfly_language_override || 'auto',
            detectors: BackupBundle.customOnly(detectorManager.exportDetectors(), detector => DetectionUtils.isOfficialDetector(detector)),
            historyItems: await SettingsUI._readStoredHistoryItems()
        });
        SettingsUI._downloadFile(JSON.stringify(bundle, null, 2), BackupBundle.fileName(), 'application/json');
        NotificationHelper.success(text('backupDone', 'Backup saved'));
    } catch (error) {
        Logger.warn('UI', 'Could not create the backup', error);
        NotificationHelper.error(text('backupFailed', 'Could not create the backup'));
    }
};

/** The dialog that asks which parts to restore and how. Resolves to { parts, mode }, or null when the person cancels. */
SettingsUI.chooseRestore = async function(parsed) {
    const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const { bundle, summary } = parsed;
    const content = document.createElement('div');
    const intro = document.createElement('p');
    intro.className = 'notification-confirm-message';
    intro.textContent = text('restoreHoldsFmt', 'Made with version {0} on {1}. It holds:', bundle.extensionVersion || '?', FormatUtils.formatDateTime(Date.parse(bundle.createdAt) || 0));
    content.append(intro);
    const row = (input, label) => {
        const line = document.createElement('label');
        line.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12.5px;line-height:1.4;color:var(--text-primary);cursor:pointer';
        const span = document.createElement('span');
        span.textContent = label;
        line.append(input, span);
        content.append(line);
    };
    const checks = {};
    const parts = [
        ['settings', summary.settings, text('restorePartSettings', 'Settings')],
        ['rules', summary.rules > 0, text('restorePartRulesFmt', 'Your rules ({0})', summary.rules)],
        ['history', summary.history > 0, text('restorePartHistoryFmt', 'History ({0} entries)', summary.history)]
    ];
    for (const [id, present, label] of parts) {
        if (!present) continue;
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = true;
        box.dataset.part = id;
        checks[id] = box;
        row(box, label);
    }
    // Merging or replacing only matters for rules and History: settings are always applied over the current ones
    const modes = {};
    if (checks.rules || checks.history) {
        const heading = document.createElement('p');
        heading.className = 'notification-confirm-message';
        heading.style.marginTop = '14px';
        heading.textContent = text('restoreModeLabel', 'Rules and History');
        content.append(heading);
        for (const [value, label] of [['merge', text('restoreModeMerge', 'Merge with what you have')], ['replace', text('restoreModeReplace', 'Replace what you have')]]) {
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'restoreMode';
            radio.value = value;
            radio.checked = value === 'merge';
            modes[value] = radio;
            row(radio, label);
        }
    }
    const confirmed = await NotificationHelper.form({
        title: text('restoreTitle', 'Restore a backup'), content, type: 'info',
        confirmText: text('restoreConfirm', 'Restore'), cancelText: text('btnCancel', 'Cancel')
    });
    if (!confirmed) return null;
    return {
        parts: Object.fromEntries(Object.entries(checks).map(([id, box]) => [id, box.checked])),
        mode: modes.replace && modes.replace.checked ? 'replace' : 'merge'
    };
};

/**
 * Settings, then rules, then History. A part that fails does not undo the ones before it. A language that comes with the
 * settings is saved with them but shown last: showing it reloads the popup, which would cut the other parts short.
 * @returns {{done: string[], failed: string[], language: string|null, skipped: string[]}} `skipped`: rules of the backup this
 *   version could not take (merge imports the valid ones), to be named to the person
 */
SettingsUI.applyBackup = async function(bundle, choice) {
    const done = [];
    const failed = [];
    let language = null;
    let skipped = [];
    const run = async (part, apply) => {
        try { await apply(); done.push(part); } catch (error) { Logger.warn('UI', `Could not restore ${part}`, error); failed.push(part); }
    };
    if (choice.parts.settings) {
        await run('settings', async () => {
            // The same rules as importing a settings file: only portable preferences, merged over the current ones
            // Over the saved settings: a change staged in the form but not saved is not written with the restore
            const candidate = this.deepMerge(this.settingsBaseline || this.settings, SettingsTransfer.portable(bundle.settings));
            if (!this.validateSettings(candidate).isValid) throw new Error('Invalid settings in the backup');
            await SettingsUI.confirmHistorySizeFor.call(this, candidate);
            const knownLanguage = Array.isArray(SettingsUI.LANGUAGE_OPTIONS) && SettingsUI.LANGUAGE_OPTIONS.some(option => option.value === bundle.languageOverride);
            // Showing a language reloads the popup and wipes the restore's messages: only when it is another one
            const languageBefore = typeof SettingsUI.languageInForce === 'function' ? await SettingsUI.languageInForce() : null;
            const saved = await this.saveSettings({ notify: false, notifyError: false, candidate, languageOverride: knownLanguage ? bundle.languageOverride : undefined });
            if (!saved) throw new Error('The settings could not be saved');
            this.updateSettingsUI();
            if (knownLanguage && bundle.languageOverride !== languageBefore) language = bundle.languageOverride;
        });
    }
    if (choice.parts.rules) {
        await run('rules', async () => {
            const detectorManager = window.popupInstance && window.popupInstance.detectorManager;
            if (!detectorManager || !await detectorManager.importDetectors(bundle.detectors, choice.mode === 'merge')) throw new Error('The rules could not be imported');
            skipped = Array.isArray(detectorManager.lastImportSkipped) ? detectorManager.lastImportSkipped.slice() : [];
            chrome.runtime.sendMessage({ type: WorkerMessages.RELOAD_DETECTORS }, () => { void chrome.runtime.lastError; });
        });
    }
    if (choice.parts.history) {
        await run('history', async () => {
            const history = window.popupInstance && window.popupInstance.history;
            if (!history) throw new Error('History is not loaded');
            await history.loadHistoryFromStorage();
            await history.saveHistoryToStorage(bundle.history.items, choice.mode);
            history.renderHistory();
        });
    }
    return { done, failed, language, skipped };
};

SettingsUI.restoreBackupFile = async function(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;
    const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    try {
        const content = await file.text();
        let data = null;
        try { data = JSON.parse(content); } catch (_) { /* parse() reports it */ }
        // An older, single-purpose export goes to the importer it always had (each asks its own questions)
        const legacy = BackupBundle.legacyKind(data);
        if (legacy === 'history') {
            const history = window.popupInstance && window.popupInstance.history;
            if (history) { await history.loadHistoryFromStorage(); await history.handleImport(event); return; }
        } else if (legacy === 'rules') {
            const rules = window.popupInstance && window.popupInstance.rules;
            if (rules && typeof rules.handleImport === 'function') { await rules.handleImport(event); return; }
        } else if (legacy === 'settings') {
            await SettingsUI.importSettingsFile.call(this, event);
            return;
        }
        const parsed = BackupBundle.parse(content);
        if (!parsed.ok) {
            NotificationHelper.error(parsed.reason === 'newer'
                ? text('restoreNewer', 'This backup was made by a newer version of the extension. Update the extension and try again.')
                : text('restoreInvalid', 'This file is not a backup of this extension. Nothing was changed.'));
            return;
        }
        const choice = await SettingsUI.chooseRestore(parsed);
        if (!choice) return;
        if (!Object.values(choice.parts).some(Boolean)) {
            NotificationHelper.info(text('restoreNothing', 'Nothing is selected.'));
            return;
        }
        const { done, failed, language, skipped } = await SettingsUI.applyBackup.call(this, parsed.bundle, choice);
        const names = {
            settings: text('restorePartSettings', 'Settings'),
            rules: text('restorePartRulesFmt', 'Your rules ({0})', parsed.summary.rules),
            history: text('restorePartHistoryFmt', 'History ({0} entries)', parsed.summary.history)
        };
        for (const part of failed) NotificationHelper.error(text('restorePartFailedFmt', '{0} could not be restored.', names[part]));
        if (done.length) NotificationHelper.success(text('restoreDoneFmt', 'Restored: {0}', done.map(part => names[part]).join(', ')));
        // Rules of the backup this version could not take are named, as Rules → Import does
        if (skipped && skipped.length) NotificationHelper.warning(text('detectorsImportedSkippedFmt', `Detectors imported, except: ${skipped.join(', ')} (not valid in this version)`, skipped.join(', ')));
        await SettingsUI.refreshStorageOverview();
        if (language && typeof SettingsUI._applyLanguageChoice === 'function') await SettingsUI._applyLanguageChoice.call(this, language, { persist: false });
    } catch (error) {
        Logger.warn('UI', 'Could not read the backup', error);
        NotificationHelper.error(text('restoreInvalid', 'This file is not a backup of this extension. Nothing was changed.'));
    } finally {
        input.value = '';
    }
};

SettingsUI._setupBackupListeners = function() {
    const back = document.querySelector('#backUpEverythingBtn');
    const restore = document.querySelector('#restoreBackupBtn');
    const file = document.querySelector('#restoreBackupFile');
    if (back) back.addEventListener('click', () => SettingsUI.backUpEverything.call(this));
    if (restore && file) {
        restore.addEventListener('click', () => file.click());
        file.addEventListener('change', (event) => SettingsUI.restoreBackupFile.call(this, event));
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
