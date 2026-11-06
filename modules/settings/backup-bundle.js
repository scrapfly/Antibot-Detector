/**
 * Settings → Data → Backup and restore: the one file that holds settings, the person's own rules and History.
 * Pure (no browser APIs): the page reads the three parts and applies them again, and this module writes and checks
 * the file. The settings part goes through SettingsTransfer.portable, so a webhook address, a header or a sharing
 * key can never be in it. The language and the theme travel beside it: they are choices kept apart from the settings.
 *
 *   build()        the file's object from the parts
 *   parse()        the file's text as a checked object, or why it is not one of ours
 *   summarize()    what a backup holds: whether it has settings, how many rules, how many History entries
 *   legacyKind()   what an older single-purpose export is (a History file, a rules file, a settings file)
 *   customOnly()   a rules export reduced to what a restore applies: the person's own rules, and for each official one they
 *                  switched off a stub, {id, enabled: false} (a restore never overwrites an official rule, but it takes its on/off
 *                  state from the file; a full record could be one an older build's importer refuses, and fail the rules part)
 *   isStateStub()  whether a record is such a stub
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

  /** A switched-off official rule as the file holds it: its id and `enabled: false`, nothing else. Never a rule of its own. */
  const isStateStub = (record) => isObject(record) && typeof record.id === 'string' && record.enabled === false
    && Object.keys(record).every(key => key === 'id' || key === 'enabled');

  /**
   * The detectors of a rules export that a restore can apply (`isOfficial(detector)` says which are official): the person's own
   * rules, and a stub ({id, enabled: false}) for each official rule they switched off. The importer never replaces an official
   * rule, so one that is on needs nothing; but it takes the on/off state of an official rule from the file, so one that is off
   * has to be named in it. Only by id: the full record is Scrapfly's, and an older build whose schema refuses it would refuse
   * the whole rules part of a Replace restore.
   */
  function customOnly(exported, isOfficial) {
    const source = isObject(exported) && isObject(exported.detectors) ? exported.detectors : {};
    const detectors = {};
    for (const [category, records] of Object.entries(source)) {
      for (const [id, detector] of Object.entries(isObject(records) ? records : {})) {
        if (!isObject(detector)) continue;
        const official = isOfficial(detector);
        if (official && detector.enabled !== false) continue;
        if (!detectors[category]) detectors[category] = {};
        detectors[category][id] = official ? { id: typeof detector.id === 'string' && detector.id ? detector.id : id, enabled: false } : detector;
      }
    }
    return { version: (exported && exported.version) || '1.0', exportedAt: (exported && exported.exportedAt) || undefined, detectors };
  }

  /** How many rule records the file's rules part holds (`keep(detector)` says which to count; all of them when not given). */
  const ruleCount = (detectors, keep) => (isObject(detectors) && isObject(detectors.detectors)
    ? Object.values(detectors.detectors).reduce((sum, records) => sum + (isObject(records)
      ? Object.values(records).filter(detector => !keep || (isObject(detector) && keep(detector))).length : 0), 0) : 0);

  /**
   * @param {{extensionVersion: string, now?: number, settings: object, languageOverride?: string, theme?: string, detectors: object, historyItems: Array}} parts
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
      // Only when the page knows it (the popup does): the restore applies it only if it is one of its themes
      ...(typeof parts.theme === 'string' && parts.theme ? { theme: parts.theme } : {}),
      detectors: isObject(parts.detectors) ? parts.detectors : { version: '1.0', detectors: {} },
      history: { items: Array.isArray(parts.historyItems) ? parts.historyItems : [] }
    };
  }

  /**
   * What a backup holds. `rules` counts the person's own rules (what "Your rules ({0})" says); since 3.1.4 the file also names
   * the official rules they switched off (stubs, or full records in a 3.1.4 development build's file), which `ruleRecords` counts
   * with them (whether there is a rules part to restore at all).
   * @param {object} bundle
   * @param {Function} [isOfficial] - isOfficial(detector); without it every record counts as the person's own
   */
  function summarize(bundle, isOfficial) {
    const b = isObject(bundle) ? bundle : {};
    const official = typeof isOfficial === 'function' ? isOfficial : () => false;
    return {
      settings: isObject(b.settings) && Object.keys(b.settings).length > 0,
      rules: ruleCount(b.detectors, detector => !isStateStub(detector) && !official(detector)),
      ruleRecords: ruleCount(b.detectors),
      history: Array.isArray(b.history && b.history.items) ? b.history.items.length : 0
    };
  }

  /**
   * @param {string} text
   * @param {Function} [isOfficial] - For the summary (summarize)
   * @returns {{ok: true, bundle: object, summary: object}|{ok: false, reason: 'json'|'format'|'newer'|'invalid'|'empty'}}
   */
  function parse(text, isOfficial) {
    let data;
    try { data = JSON.parse(text); } catch (_) { return { ok: false, reason: 'json' }; }
    if (!isObject(data) || data.format !== FORMAT) return { ok: false, reason: 'format' };
    if (!Number.isInteger(data.version) || data.version < 1) return { ok: false, reason: 'invalid' };
    if (data.version > VERSION) return { ok: false, reason: 'newer' };
    if (data.settings !== undefined && !isObject(data.settings)) return { ok: false, reason: 'invalid' };
    if (data.detectors !== undefined && !(isObject(data.detectors) && (data.detectors.detectors === undefined || isObject(data.detectors.detectors)))) return { ok: false, reason: 'invalid' };
    if (data.history !== undefined && !(isObject(data.history) && Array.isArray(data.history.items))) return { ok: false, reason: 'invalid' };
    const summary = summarize(data, isOfficial);
    if (!summary.settings && !summary.ruleRecords && !summary.history) return { ok: false, reason: 'empty' };
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

  const api = { FORMAT, VERSION, build, parse, summarize, legacyKind, customOnly, isStateStub, fileName };
  root.BackupBundle = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.BackupBundle = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
