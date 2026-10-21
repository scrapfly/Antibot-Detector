/**
 * Settings → Data → Storage: which keys of chrome.storage.local belong to which part of the extension, and how their
 * sizes become the rows of the overview. Pure (no browser APIs): the page asks chrome.storage.local.getBytesInUse for
 * each group's keys and for the whole storage, and this module does the rest.
 *
 *   GROUPS       the parts, in the order the overview lists them; `clear` names what the Clear button does
 *   QUOTA_BYTES  what the browser allows the extension to store (10 MB)
 *   EMPTY_BELOW  a part this small holds only an empty container (a key and "{}"): it counts as empty
 *   summarize()  rows with their sizes, the rest of the storage as "other", and the total against the quota
 *
 * Settings, rules and categories are listed so that people see where the space goes, but they have no Clear button:
 * nothing here can delete a setting or a rule. The pending rule updates can be cleared: the next check finds them again.
 */
(function(root) {
  'use strict';

  const QUOTA_BYTES = 10485760;
  const EMPTY_BELOW = 100;

  const GROUPS = Object.freeze([
    { id: 'cache', labelKey: 'storageCache', label: 'Detection cache', clear: 'cache',
      keys: ['scrapfly_detection_storage', 'scrapfly_js_hook_detections'] },
    { id: 'captures', labelKey: 'storageCaptures', label: 'Tool captures', clear: 'captures',
      keys: ['scrapfly_advanced_history'] },
    { id: 'history', labelKey: 'storageHistory', label: 'History', clear: 'history',
      keys: ['scrapfly_history', 'scrapfly_history_backup', 'scrapfly_history_storage_notice', 'scrapfly_history_watch'] },
    { id: 'rules', labelKey: 'storageRules', label: 'Rules and categories', clear: null,
      keys: ['scrapfly_detectors', 'scrapfly_categories', 'scrapfly_rule_i18n', 'scrapfly_remote_official_ids', 'scrapfly_deleted_official_detectors',
        'scrapfly_last_update_check'] },
    // What Rules → Update left waiting: updates for a newer extension, and failed ones (found again by the next check)
    { id: 'updates', labelKey: 'storageUpdates', label: 'Pending rule updates', clear: 'updates',
      keys: ['scrapfly_pending_updates', 'scrapfly_incompatible_updates', 'scrapfly_update_errors'] },
    { id: 'settings', labelKey: 'storageSettings', label: 'Settings', clear: null,
      keys: ['scrapfly_settings', 'scrapfly_language_override', 'scrapfly_theme', 'scrapfly_enabled', 'scrapfly_reopen_after_language',
        'scrapfly_stats_range', 'scrapfly_stats_section', 'scrapfly_stats_sub', 'scrapfly_stats_scope', 'scrapfly_webhook_log'] },
    { id: 'logs', labelKey: 'storageLogs', label: 'Logs', clear: 'logs',
      keys: ['scrapfly_collected_logs', 'scrapfly_log_collector_enabled', 'scrapfly_log_collector_max'] }
  ].map(group => Object.freeze({ ...group, keys: Object.freeze(group.keys) })));

  const bytes = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0);

  /**
   * @param {Object<string, number>} sizes  bytes in use per group id
   * @param {number} total                  bytes in use by the whole storage
   * @param {number} [quota]
   * @param {boolean} [unlimited]           the browser allows unlimited storage (the optional permission): there is no quota to fill
   * @returns {{rows: Array<{id, labelKey, label, bytes, clear, empty}>, other: number, total: number, quota: number, ratio: number}}
   */
  function summarize(sizes, total, quota = QUOTA_BYTES, unlimited = false) {
    const rows = GROUPS.map(group => {
      const used = bytes(sizes && sizes[group.id]);
      return { id: group.id, labelKey: group.labelKey, label: group.label, bytes: used, clear: group.clear, empty: used < EMPTY_BELOW };
    });
    const known = rows.reduce((sum, row) => sum + row.bytes, 0);
    const all = Math.max(bytes(total), known);
    const limit = bytes(quota) || QUOTA_BYTES;
    return { rows, other: all - known, total: all, quota: limit, unlimited: unlimited === true, ratio: unlimited === true ? 0 : Math.min(1, all / limit) };
  }

  const api = { QUOTA_BYTES, EMPTY_BELOW, GROUPS, summarize };
  root.StorageOverview = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.StorageOverview = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
