// Share uploads UI for SettingsUI (Settings → Detection → Share uploads):
// which service Detection → "Upload detections" uses, and its expiry, key or
// custom server. Values are normalized by ShareProviders
// (sections/detection/share-providers.js). Requires settings-ui.js first.

SettingsUI._shareFields = {
  dpasteComDays: '#shareDpasteComDays',
  dpasteOrgExpires: '#shareDpasteOrgExpires',
  pastebinKey: '#sharePastebinKey',
  pastebinExpire: '#sharePastebinExpire',
  githubToken: '#shareGithubToken',
  customUrl: '#shareCustomUrl',
  customMethod: '#shareCustomMethod',
  customBodyFormat: '#shareCustomBodyFormat',
  customFieldName: '#shareCustomFieldName',
  customJsonTemplate: '#shareCustomJsonTemplate',
  customHeaders: '#shareCustomHeaders',
  customLinkFrom: '#shareCustomLinkFrom',
  customLinkJsonPath: '#shareCustomLinkJsonPath',
  customExpiryDays: '#shareCustomExpiryDays'
};

// Show the selected service's panel and, for the custom server, only the
// fields its body format and link source use
SettingsUI.syncSharePanels = function() {
  const provider = document.querySelector('#shareProvider')?.value || ShareProviders.DEFAULTS.provider;
  document.querySelectorAll('[data-share-panel]').forEach(panel => {
    panel.hidden = panel.dataset.sharePanel !== provider;
  });
  const bodyFormat = document.querySelector('#shareCustomBodyFormat')?.value;
  const fieldRow = document.querySelector('#shareCustomFieldRow');
  const jsonRow = document.querySelector('#shareCustomJsonRow');
  if (fieldRow) fieldRow.hidden = bodyFormat !== 'form';
  if (jsonRow) jsonRow.hidden = bodyFormat !== 'json';
  const pathRow = document.querySelector('#shareCustomJsonPathRow');
  if (pathRow) pathRow.hidden = document.querySelector('#shareCustomLinkFrom')?.value !== 'json';
};

SettingsUI.populateShareUI = function() {
  if (typeof ShareProviders === 'undefined') return;
  const share = ShareProviders.normalize(this.settings.share);
  const providerSelect = document.querySelector('#shareProvider');
  if (providerSelect) providerSelect.value = share.provider;
  for (const [key, selector] of Object.entries(SettingsUI._shareFields)) {
    const el = document.querySelector(selector);
    if (el) el.value = String(share[key]);
  }
  SettingsUI.syncSharePanels();
};

SettingsUI.readShareFromUI = function() {
  if (typeof ShareProviders === 'undefined') return this.settings.share;
  const current = ShareProviders.normalize(this.settings.share);
  const share = { provider: document.querySelector('#shareProvider')?.value ?? current.provider };
  for (const [key, selector] of Object.entries(SettingsUI._shareFields)) {
    const el = document.querySelector(selector);
    share[key] = el ? el.value : current[key];
  }
  return ShareProviders.normalize(share);
};

// Errors for SettingsUI.validateSettings: only the selected service is checked
SettingsUI.validateShareSettings = function(share, text) {
  const errors = [];
  if (!share || typeof ShareProviders === 'undefined') return errors;
  if (share.provider === 'custom' && share.customUrl &&
      !ShareProviders.isCustomUrlAllowed(share.customUrl, SettingsRuntime._isWebhookUrlSafe)) {
    errors.push(text('settingsUiErrShareCustomUrl', 'Custom upload server: use an HTTPS address on a public host'));
  }
  if (share.provider === 'custom' && share.customBodyFormat === 'json') {
    const probe = share.customJsonTemplate.replace(/<(?:CONTENT_JSON|TITLE_JSON)>/g, '""').replace(/<EXPIRY_DAYS>/g, '1');
    try {
      JSON.parse(probe);
    } catch (e) {
      errors.push(text('settingsUiErrShareCustomJson', 'Custom upload server: the JSON template is not valid JSON'));
    }
  }
  return errors;
};

// Settings as they may leave the browser (export, debug logs): the service
// key, token and custom headers are left out, so importing the file later
// keeps the ones already stored
SettingsUI.SHARE_SECRET_KEYS = ['pastebinKey', 'githubToken', 'customHeaders'];
SettingsUI.withoutShareSecrets = function(settings) {
  if (!settings || typeof settings !== 'object' || !settings.share) return settings;
  const share = { ...settings.share };
  for (const key of SettingsUI.SHARE_SECRET_KEYS) delete share[key];
  return { ...settings, share };
};

SettingsUI._setupShareListeners = function() {
  ['#shareProvider', '#shareCustomBodyFormat', '#shareCustomLinkFrom'].forEach(selector => {
    document.querySelector(selector)?.addEventListener('change', () => SettingsUI.syncSharePanels());
  });
};
