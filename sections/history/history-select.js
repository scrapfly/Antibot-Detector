/**
 * History → … → Select entries: pick several entries and pin, watch, export or delete them together.
 * A mixin of History (loads after history.js).
 *
 * The selection is always about what the list shows: a search or a chip that hides a selected entry also
 * unselects it, so Delete can never reach an entry nobody can see. Pin, watch and delete are one message
 * each to the worker, which is the only History writer; Export builds the file here, in the format
 * chosen in Settings → History.
 */

History.prototype.selectedItems = function() {
  const ids = this.selectedIds || new Set();
  return (this.historyItems || []).filter(item => ids.has(item.id));
};

/** Select mode on: checkboxes on every card and the bar with the actions. */
History.prototype.enterSelectMode = function() {
  if (this.selectMode) return;
  this.selectMode = true;
  this.selectedIds = new Set();
  this.closeMenus();
  const list = document.querySelector('#historyList');
  if (list) list.classList.add('is-selecting');
  this.renderHistory(); // draws the checkboxes
  this.syncSelectBar();
  const first = document.querySelector('#historyList .history-select-input');
  if (first) first.focus();
};

/** Select mode off: the cards are as before, nothing stays selected. */
History.prototype.exitSelectMode = function() {
  if (!this.selectMode) return;
  this.selectMode = false;
  this.selectedIds = new Set();
  // Done, Escape or a checkbox had the focus: it goes back to the menu that started selecting, not to the page
  const active = document.activeElement;
  const hadFocus = !!(active && active.closest && active.closest('#historySelectBar, #historyList'));
  const list = document.querySelector('#historyList');
  if (list) list.classList.remove('is-selecting');
  this.renderHistory();
  this.syncSelectBar();
  if (hadFocus) document.querySelector('#historyMenuBtn')?.focus();
};

/** Leaving the History tab ends the selection (popup.js calls cleanup() on the section it leaves). */
History.prototype.cleanup = function() {
  if (this.selectMode) this.exitSelectMode();
};

/** Selected entries the list no longer shows (a search or a chip hid them) are unselected. */
History.prototype.pruneSelection = function(shownItems) {
  if (!this.selectMode || !this.selectedIds) return;
  const shown = new Set((shownItems || []).map(item => item.id));
  for (const id of [...this.selectedIds]) if (!shown.has(id)) this.selectedIds.delete(id);
};

History.prototype.setSelected = function(id, on) {
  if (!this.selectMode) return;
  if (on) this.selectedIds.add(id); else this.selectedIds.delete(id);
  const card = [...document.querySelectorAll('#historyList .history-item')].find(el => el.dataset.historyId === id);
  if (card) {
    card.classList.toggle('is-selected', on);
    const box = card.querySelector('.history-select-input');
    if (box) box.checked = on;
  }
  this.syncSelectBar();
};

/** Every entry the search and the chips leave (all pages), or none when they are all selected already. */
History.prototype.toggleSelectAll = function() {
  if (!this.selectMode) return;
  const shown = this.getFilteredItems();
  const all = shown.length > 0 && shown.every(item => this.selectedIds.has(item.id));
  this.selectedIds = new Set(all ? [] : shown.map(item => item.id));
  document.querySelectorAll('#historyList .history-item').forEach((card) => {
    const on = this.selectedIds.has(card.dataset.historyId);
    card.classList.toggle('is-selected', on);
    const box = card.querySelector('.history-select-input');
    if (box) box.checked = on;
  });
  this.syncSelectBar();
};

/** The bar: its count, and what Pin and Watch would do to this selection. */
History.prototype.syncSelectBar = function() {
  const bar = document.querySelector('#historySelectBar');
  if (!bar) return;
  bar.hidden = !this.selectMode;
  if (!this.selectMode) return;
  const t = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  const picked = this.selectedItems();
  const shown = this.getFilteredItems();
  const set = (selector, text) => { const el = bar.querySelector(selector); if (el) el.textContent = text; };
  set('#historySelectCount', t('historySelectedFmt', '{0} selected', picked.length));
  const allPicked = shown.length > 0 && shown.every(item => this.selectedIds.has(item.id));
  set('#historySelectAll', allPicked ? t('historySelectNone', 'Select none') : t('historySelectAll', 'Select all'));
  const none = picked.length === 0;
  for (const selector of ['#historySelectPin', '#historySelectWatch', '#historySelectExport', '#historySelectDelete']) {
    const button = bar.querySelector(selector);
    if (button) button.disabled = none;
  }
  set('#historySelectPin span', picked.length && picked.every(item => item.pinned === true) ? t('historyUnpin', 'Unpin') : t('historyPin', 'Pin'));
  set('#historySelectWatch span', picked.length && picked.every(item => item.watch === true) ? t('historyUnwatch', 'Stop watching') : t('historyWatch', 'Watch for changes'));
};

/** Reads the stored list again (the worker may have saved scans meanwhile) and draws it. */
History.prototype.refreshAfterBulk = async function() {
  await this.loadHistoryFromStorage();
  if (!(this.historyItems || []).length) { this.exitSelectMode(); return; } // nothing left to select
  this.renderHistory();
  this.syncSelectBar();
};

/** Pin every selected entry, or unpin them when they are all pinned already. */
History.prototype.bulkPin = async function() {
  const items = this.selectedItems();
  if (!items.length) return;
  const pin = !items.every(item => item.pinned === true);
  try {
    // Only the entries that change: the toast counts what was done, not what already was
    const ids = items.filter(item => (item.pinned === true) !== pin).map(item => item.id);
    const response = await this.sendHistoryChange({ type: HistoryStore.Messages.UPDATE_ITEMS, ids, patch: { pinned: pin } });
    await this.refreshAfterBulk();
    NotificationHelper.success(pin
      ? FormatUtils.t('historyBulkPinnedFmt', 'Pinned: {0}', response.updated)
      : FormatUtils.t('historyBulkUnpinnedFmt', 'Unpinned: {0}', response.updated));
  } catch (error) {
    Logger.warn('UI', '[History] Pin of the selection failed', error);
    NotificationHelper.error(error.message);
  }
};

/** Watch every selected entry (up to the watchlist's room), or stop watching them when they are all watched. */
History.prototype.bulkWatch = async function() {
  const items = this.selectedItems();
  if (!items.length) return;
  const watch = !items.every(item => item.watch === true);
  try {
    const ids = items.filter(item => (item.watch === true) !== watch).map(item => item.id);
    const response = await this.sendHistoryChange({ type: HistoryStore.Messages.UPDATE_ITEMS, ids, patch: { watch } });
    await this.refreshAfterBulk();
    if (!watch) {
      NotificationHelper.success(FormatUtils.t('historyBulkWatchStoppedFmt', 'Stopped watching: {0}', response.updated));
    } else if (response.skipped > 0) {
      NotificationHelper.error(FormatUtils.t('historyBulkWatchLimitFmt', 'Watching: {0}. Not added: {1} (you can watch up to {2} pages).', response.updated, response.skipped, response.limit));
    } else {
      const settings = await Utils.getHistorySettings();
      NotificationHelper.success(HistoryPolicy.watchModeOf(settings) === 'off'
        ? FormatUtils.t('historyBulkWatchOffFmt', 'Watching: {0}. Turn on Watch pinned pages in Settings → History for them to be checked.', response.updated)
        : FormatUtils.t('historyBulkWatchFmt', 'Watching: {0}', response.updated));
    }
  } catch (error) {
    Logger.warn('UI', '[History] Watch of the selection failed', error);
    NotificationHelper.error(error.message);
  }
};

/** The selected entries as one file, in the format chosen in Settings → History. */
History.prototype.bulkExport = async function() {
  const items = this.selectedItems();
  if (!items.length) return;
  const saved = await Utils.getHistorySettings().catch(() => ({}));
  const built = HistoryExport.build(items, { format: saved.exportFormat, includeTimestamps: saved.includeTimestamps !== false });
  const url = URL.createObjectURL(new Blob([built.text], { type: built.type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = HistoryExport.fileName(built.format);
  link.click();
  URL.revokeObjectURL(url);
  NotificationHelper.success(FormatUtils.t('notificationHistoryExportedFmt', `Exported ${items.length} history items`, items.length));
};

/** Delete every selected entry, after asking (pinned ones too: the question says how many are pinned). */
History.prototype.bulkDelete = async function() {
  const items = this.selectedItems();
  if (!items.length) return;
  const pinned = items.filter(item => item.pinned === true).length;
  const t = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
  const confirmed = await NotificationHelper.confirm({
    title: t('historyBulkDeleteTitle', 'Delete selected entries'),
    message: t('historyBulkDeleteMessageFmt', 'Delete the selected entries ({0}) from History? This cannot be undone.', items.length)
      + (pinned ? ` ${t('historyBulkDeletePinnedFmt', 'Pinned among them: {0}.', pinned)}` : ''),
    type: 'danger',
    confirmText: t('btnDelete', 'Delete'),
    cancelText: t('btnCancel', 'Cancel'),
    emphasizeAction: true
  });
  if (!confirmed) return;
  try {
    const response = await this.sendHistoryChange({ type: HistoryStore.Messages.DELETE_ITEMS, ids: items.map(item => item.id) });
    this.selectedIds = new Set();
    await this.refreshAfterBulk();
    NotificationHelper.success(t('historyBulkDeletedFmt', 'Deleted: {0}', response.removed !== undefined ? response.removed : items.length));
  } catch (error) {
    Logger.warn('UI', '[History] Delete of the selection failed', error);
    NotificationHelper.error(error.message);
  }
};

/** The card click in Select mode: a checkbox click already toggled the box, anywhere else toggles the entry. */
History.prototype.onSelectClick = function(event, id) {
  const box = event.target.closest && event.target.closest('.history-select-input');
  this.setSelected(id, box ? box.checked : !this.selectedIds.has(id));
};

/** Listeners of the toolbar item and the bar; History.setupEventListeners calls this once. */
History.prototype.setupSelectListeners = function() {
  const on = (selector, handler) => {
    const el = document.querySelector(selector);
    if (el) el.addEventListener('click', handler);
  };
  on('#selectHistoryBtn', () => this.enterSelectMode());
  on('#historySelectDone', () => this.exitSelectMode());
  on('#historySelectAll', () => this.toggleSelectAll());
  on('#historySelectPin', () => this.bulkPin());
  on('#historySelectWatch', () => this.bulkWatch());
  on('#historySelectExport', () => this.bulkExport());
  on('#historySelectDelete', () => this.bulkDelete());
  // Escape ends Select mode, unless it is closing something on top of it (a menu, a dialog, the details)
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !this.selectMode || this._openMenu) return;
    if (document.querySelector('.notification-confirm')) return;
    const details = document.querySelector('#historyDetailModal');
    if (details && details.style.display && details.style.display !== 'none') return;
    this.exitSelectMode();
  }, true);
};
