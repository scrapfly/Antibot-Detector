/**
 * Settings → Data → Backup and restore: the one file that holds settings, the person's own rules and History.
 * Pure (no browser APIs): the page reads the three parts and applies them again, and this module writes and checks
 * the file. The settings part goes through SettingsTransfer.portable, so a webhook address, a header or a sharing
 * key can never be in it.
 *
 *   build()        the file's object from the parts
 *   parse()        the file's text as a checked object, or why it is not one of ours
 *   summarize()    what a backup holds: whether it has settings, how many rules, how many History entries
 *   legacyKind()   what an older single-purpose export is (a History file, a rules file, a settings file)
 *   customOnly()   a rules export without the official detectors, which a restore would never overwrite anyway
 *   fileName()     scrapfly-backup-2026-10-20.json
 *
 * Restoring applies settings, then rules, then History, each on its own: one that fails does not undo the others.
 */
(function(root) {
  'use strict';

  // The person's own calendar day (an export made after midnight is named for that day, not for UTC's)
  const localDay = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  const FORMAT = 'scrapfly-backup';
  const VERSION = 1;

  const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

  /** The detectors of a rules export that are not official (`isOfficial(detector)` says which are). */
  function customOnly(exported, isOfficial) {
    const source = isObject(exported) && isObject(exported.detectors) ? exported.detectors : {};
    const detectors = {};
    for (const [category, records] of Object.entries(source)) {
      for (const [id, detector] of Object.entries(isObject(records) ? records : {})) {
        if (isObject(detector) && !isOfficial(detector)) {
          if (!detectors[category]) detectors[category] = {};
          detectors[category][id] = detector;
        }
      }
    }
    return { version: (exported && exported.version) || '1.0', exportedAt: (exported && exported.exportedAt) || undefined, detectors };
  }

  const ruleCount = (detectors) => (isObject(detectors) && isObject(detectors.detectors)
    ? Object.values(detectors.detectors).reduce((sum, records) => sum + (isObject(records) ? Object.keys(records).length : 0), 0) : 0);

  /**
   * @param {{extensionVersion: string, now?: number, settings: object, languageOverride?: string, detectors: object, historyItems: Array}} parts
   */
  function build(parts) {
    const portable = root.SettingsTransfer && root.SettingsTransfer.portable;
    if (typeof portable !== 'function') throw new Error('SettingsTransfer is not loaded');
    return {
      format: FORMAT,
      version: VERSION,
      extensionVersion: String(parts.extensionVersion || ''),
      createdAt: new Date(Number.isFinite(parts.now) ? parts.now : Date.now()).toISOString(),
      settings: portable(parts.settings || {}),
      languageOverride: typeof parts.languageOverride === 'string' ? parts.languageOverride : 'auto',
      detectors: isObject(parts.detectors) ? parts.detectors : { version: '1.0', detectors: {} },
      history: { items: Array.isArray(parts.historyItems) ? parts.historyItems : [] }
    };
  }

  function summarize(bundle) {
    const b = isObject(bundle) ? bundle : {};
    return {
      settings: isObject(b.settings) && Object.keys(b.settings).length > 0,
      rules: ruleCount(b.detectors),
      history: Array.isArray(b.history && b.history.items) ? b.history.items.length : 0
    };
  }

  /** @returns {{ok: true, bundle: object, summary: object}|{ok: false, reason: 'json'|'format'|'newer'|'invalid'|'empty'}} */
  function parse(text) {
    let data;
    try { data = JSON.parse(text); } catch (_) { return { ok: false, reason: 'json' }; }
    if (!isObject(data) || data.format !== FORMAT) return { ok: false, reason: 'format' };
    if (!Number.isInteger(data.version) || data.version < 1) return { ok: false, reason: 'invalid' };
    if (data.version > VERSION) return { ok: false, reason: 'newer' };
    if (data.settings !== undefined && !isObject(data.settings)) return { ok: false, reason: 'invalid' };
    if (data.detectors !== undefined && !(isObject(data.detectors) && (data.detectors.detectors === undefined || isObject(data.detectors.detectors)))) return { ok: false, reason: 'invalid' };
    if (data.history !== undefined && !(isObject(data.history) && Array.isArray(data.history.items))) return { ok: false, reason: 'invalid' };
    const summary = summarize(data);
    if (!summary.settings && !summary.rules && !summary.history) return { ok: false, reason: 'empty' };
    return { ok: true, bundle: data, summary };
  }

  /** What an older export is, so Restore can hand it to the importer it always had. */
  function legacyKind(data) {
    if (!isObject(data) || data.format === FORMAT) return null;
    if (Array.isArray(data.items)) return 'history';
    if (isObject(data.detectors)) return 'rules';
    if (isObject(data.settings) || ['notificationsEnabled', 'debugMode', 'detection', 'history', 'badgeColors', 'categoryColors'].some(key => key in data)) return 'settings';
    return null;
  }

  function fileName(now = Date.now()) {
    return `scrapfly-backup-${localDay(now)}.json`;
  }

  const api = { FORMAT, VERSION, build, parse, summarize, legacyKind, customOnly, fileName };
  root.BackupBundle = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BackupBundle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
