// Settings → Data → Presets and reset: ready-made groups of settings, and the way back to the defaults.
// Requires settings-ui.js to load first (defines const SettingsUI) and modules/settings/settings-presets.js.

/** The changes a preset would make now, as the lines the confirmation lists. */
SettingsUI.presetLines = function(id) {
    const text = (key, fallback) => FormatUtils.t(key, fallback);
    return SettingsPresets.pending(id, this.settings, this.defaultSettings || {}).map(change => text(change.key, change.label));
};

SettingsUI.applyPreset = async function(id) {
    const preset = SettingsPresets.PRESETS[id];
    if (!preset) return;
    const text = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const lines = SettingsUI.presetLines.call(this, id);
    if (!lines.length) {
        NotificationHelper.info(text('presetAlreadySet', 'These settings are already set.'));
        return;
    }
    const confirmed = await NotificationHelper.confirm({
        title: text('presetConfirmTitleFmt', 'Apply the {0} preset?', text(preset.nameKey, preset.name)),
        message: `${text('presetConfirmIntro', 'These settings will change:')}\n${lines.map(line => `• ${line}`).join('\n')}`,
        type: 'info',
        confirmText: text('presetApply', 'Apply'),
        cancelText: text('btnCancel', 'Cancel')
    });
    if (!confirmed) return;
    // The same Save as the form: three-way merged with whatever changed meanwhile, announced to the worker
    // Over the saved settings: a change staged in the form but not saved (an empty "only these sites" list) is not
    // written with the preset
    const base = this.settingsBaseline || this.settings;
    const patch = SettingsPresets.patchOf(id, base, this.defaultSettings || {});
    const saved = await this.saveSettings({ candidate: this.deepMerge(base, patch), notify: false });
    if (!saved) return;
    this.updateSettingsUI();
    NotificationHelper.success(text('presetApplied', 'Preset applied'));
};

/** The reset asks whether the connections go too; the answer decides what the worker keeps. */
SettingsUI.resetSettingsToDefaults = async function() {
    const text = (key, fallback) => FormatUtils.t(key, fallback);
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.className = 'notification-confirm-message';
    message.textContent = text('settingsResetMessage', 'Every setting returns to its default. Rules, History, site lists, language and theme are not changed. Webhook and sharing details are kept unless you choose to remove them.');
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin-top:12px;font-size:12.5px;line-height:1.45;color:var(--text-primary);cursor:pointer';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'resetConnections';
    box.style.cssText = 'margin-top:2px;flex:0 0 auto';
    const label = document.createElement('span');
    label.textContent = text('settingsResetConnections', 'Also remove the webhook and sharing connections');
    row.append(box, label);
    content.append(message, row);
    const confirmed = await NotificationHelper.form({
        title: text('settingsResetTitle', 'Reset settings'), content, type: 'warning', tone: 'danger',
        confirmText: text('settingsResetConfirm', 'Reset'), cancelText: text('btnCancel', 'Cancel')
    });
    if (!confirmed) return;
    const saved = await this.saveSettings({
        notify: false,
        reset: { defaults: this.defaultSettings, keep: SettingsPresets.resetKeep({ disconnect: box.checked }) }
    });
    if (!saved) return;
    this.updateSettingsUI();
    NotificationHelper.success(text('settingsResetDone', 'Settings reset'));
};

SettingsUI._setupPresetListeners = function() {
    for (const button of document.querySelectorAll('[data-preset]')) {
        button.addEventListener('click', () => SettingsUI.applyPreset.call(this, button.dataset.preset));
    }
    const reset = document.querySelector('#resetSettingsBtn');
    if (reset) reset.addEventListener('click', () => SettingsUI.resetSettingsToDefaults.call(this));
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
