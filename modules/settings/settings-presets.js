/**
 * Settings → Data → Presets and reset: a few settings changed together, and the way back to the defaults. Pure (no
 * browser APIs): the page shows what a preset changes, applies it as a patch through the usual Save, and asks the
 * worker to reset with the list of what to keep.
 *
 *   PRESETS        privacy and developer: each change is { path, value, key, label } (key and label are the
 *                  message of what the person sees listed before applying)
 *   pending()      the changes of a preset that would actually change something now
 *   patchOf()      those changes as the nested object a settings patch is
 *   KEEP           what a reset never touches: the four site lists and when the rules were last checked
 *   CONNECTIONS    the webhook and sharing connection details: kept by a reset unless the person disconnects them
 *   resetKeep()    the dotted paths a reset keeps
 *
 * A preset never touches detectors, categories, History, captures, the domain lists, the language, the theme or the
 * on/off switch of the extension: only settings that are plain preferences.
 */
(function(root) {
  'use strict';

  const PRESETS = Object.freeze({
    privacy: Object.freeze({
      nameKey: 'presetPrivacyName', name: 'Privacy',
      descKey: 'presetPrivacyDesc', desc: 'Keeps less on this device and sends nothing out.',
      changes: Object.freeze([
        { path: 'history.historyEnabled', value: false, key: 'presetHistoryOff', label: 'History is not recorded' },
        { path: 'history.historyBackup', value: 'off', key: 'presetBackupOff', label: 'Automatic History backups are off' },
        { path: 'history.historyClearOnClose', value: true, key: 'presetClearOnClose', label: 'History is cleared when the browser closes' },
        { path: 'webhook.enableWebhook', value: false, key: 'presetWebhookOff', label: 'The webhook is off' },
        { path: 'notificationsEnabled', value: false, key: 'presetNotificationsOff', label: 'Notifications are off' },
        { path: 'jsApi.enableJsApi', value: false, key: 'presetJsApiOff', label: 'The JS API is off' },
        { path: 'debugMode', value: false, key: 'presetDebugOff', label: 'Debug mode is off' },
        { path: 'logCollectorEnabled', value: false, key: 'presetCollectorOff', label: 'The log collector is off' }
      ].map(change => Object.freeze(change)))
    }),
    developer: Object.freeze({
      nameKey: 'presetDeveloperName', name: 'Developer',
      descKey: 'presetDeveloperDesc', desc: 'Debug logs and the JS API, for working on rules.',
      changes: Object.freeze([
        { path: 'debugMode', value: true, key: 'presetDebugOn', label: 'Debug mode is on' },
        { path: 'debugVerbose', value: true, key: 'presetVerboseOn', label: 'Verbose logging is on' },
        { path: 'logCollectorEnabled', value: true, key: 'presetCollectorOn', label: 'The log collector is on' },
        { path: 'logCollectorMaxLogs', value: 5000, key: 'presetCollectorMax', label: 'The log collector keeps up to 5000 lines' },
        { path: 'jsApi.enableJsApi', value: true, key: 'presetJsApiOn', label: 'The JS API is on' }
      ].map(change => Object.freeze(change)))
    })
  });

  // What a reset keeps: the site lists, the rules check time, and how much History may hold (a default limit or size
  // below what History uses would delete pages at once, and Reset promises to leave History alone)
  const KEEP = Object.freeze(['detection.blacklistedDomains', 'detection.allowedDomains', 'detection.hooksOffDomains', 'history.historyExcludedDomains', 'updates.lastCheckTimestamp',
    'history.historyLimit', 'history.historyMaxMB']);
  const CONNECTIONS = Object.freeze([
    'webhook.webhookUrl', 'webhook.webhookMethod', 'webhook.webhookContentType', 'webhook.webhookPayload', 'webhook.webhookHeaders', 'webhook.webhookSecret',
    'share.pastebinKey', 'share.githubToken', 'share.customUrl', 'share.customMethod', 'share.customBodyFormat', 'share.customFieldName',
    'share.customJsonTemplate', 'share.customHeaders', 'share.customLinkFrom', 'share.customLinkJsonPath'
  ]);

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

  function getPath(source, path) {
    let value = source;
    for (const part of path.split('.')) {
      if (!isObject(value)) return undefined;
      value = value[part];
    }
    return value;
  }

  function setPath(target, path, value) {
    const parts = path.split('.');
    let node = target;
    for (const part of parts.slice(0, -1)) {
      if (!isObject(node[part])) node[part] = {};
      node = node[part];
    }
    node[parts[parts.length - 1]] = value;
    return target;
  }

  /** The changes of a preset that differ from the settings in force (a missing setting counts as its default). */
  function pending(id, settings, defaults) {
    const preset = PRESETS[id];
    if (!preset) return [];
    return preset.changes.filter((change) => {
      const now = getPath(settings, change.path);
      const effective = now === undefined ? getPath(defaults, change.path) : now;
      return effective !== change.value;
    });
  }

  function patchOf(id, settings, defaults) {
    const patch = {};
    for (const change of pending(id, settings, defaults)) setPath(patch, change.path, change.value);
    return patch;
  }

  /** The dotted paths a reset keeps: always the domain lists; the connections too, unless they are disconnected. */
  function resetKeep(options = {}) {
    return options.disconnect === true ? [...KEEP] : [...KEEP, ...CONNECTIONS];
  }

  const api = { PRESETS, KEEP, CONNECTIONS, getPath, setPath, pending, patchOf, resetKeep };
  root.SettingsPresets = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.SettingsPresets = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
