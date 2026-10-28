
class History {
  constructor(detectorManager) {
    this.detectorManager = detectorManager;
    this.historyItems = [];
    this.searchQuery = '';
    // The filter chips under the search (HistoryFilter): kept while the popup is open
    this.activeChips = { pinned: false, changed: false, categories: [] };
    this.initialized = false;
    this.listenersAttached = false;
    this.paginationManager = null;
    this.historyLimit = 0; // 0 = unlimited (matches settings default)
  }

  /**
   * Display history items from storage
   */
  async displayHistory() {
    Logger.debug('UI', 'History.displayHistory called');

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    await this.refreshHistoryLimit();
    this.warnIfWorkerOutdated().catch(() => {});

    try {
      await this.loadHistoryFromStorage();
      this.renderHistory();
    } catch (error) {
      Logger.warn('UI', '[History] Failed to display history', error);
      this.showEmptyState();
    }
  }

  /**
   * Load history from Chrome storage
   */
  async loadHistoryFromStorage() {
    try {
      this.historyItems = await HistoryStore.read(chrome.storage.local);
      if (this.historyLimit > 0 && this.historyItems.length > this.historyLimit) {
        this.historyItems = this.historyItems.slice(0, this.historyLimit);
      }
      Logger.debug('UI', 'Loaded history items:', this.historyItems.length);
    } catch (error) {
      Logger.warn('UI', '[History] Storage load failed', error);
      this.historyItems = [];
    }
  }

  /**
   * Ask the service worker to change the stored history. The popup never
   * writes `scrapfly_history` itself: its copy is only for display, and writing
   * it back would drop entries the worker saved since the popup opened.
   * @param {object} message - One of the HistoryStore.Messages requests
   * @returns {Promise<object>} Worker response ({ status: 'ok', ... })
   */
  async sendHistoryChange(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (response && response.status === 'unknown') {
      // The worker does not know this request: it still runs the code from before the update
      throw new Error(FormatUtils.t('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again."));
    }
    if (!response || response.status !== 'ok') {
      throw new Error((response && response.error) || 'History update failed');
    }
    return response;
  }

  /** Once per popup: say so when the background worker still runs the code from before an update. */
  async warnIfWorkerOutdated() {
    if (this._workerChecked) return;
    this._workerChecked = true;
    let current = false;
    try {
      const pong = await chrome.runtime.sendMessage({ type: HistoryStore.Messages.PING });
      current = !!pong && pong.status === 'ok';
    } catch (_) { /* treated as not current */ }
    if (!current) NotificationHelper.error(FormatUtils.t('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again."));
  }

  /**
   * Import: let the worker merge / replace against the stored list, then reload.
   * @param {Array<object>} items - Imported items
   * @param {'merge'|'replace'} mode
   */
  async saveHistoryToStorage(items = this.historyItems, mode = 'replace') {
    await this.sendHistoryChange({
      type: HistoryStore.Messages.REPLACE_ITEMS,
      items,
      mode,
      limit: this.historyLimit
    });
    await this.loadHistoryFromStorage();
    Logger.debug('UI', 'History saved to storage');
  }

  /**
   * Render history items in the UI
   */
  renderHistory() {
    if (this.historyItems.length === 0) {
      this.showEmptyState();
      return;
    }

    const historyEmpty = document.querySelector('#historyEmpty');
    if (historyEmpty) historyEmpty.style.display = 'none';

    const itemsToShow = this.getFilteredItems();
    this.syncFilterChips();
    // Select mode: what a search or a chip hides is unselected, so an action never reaches an entry nobody sees
    if (this.selectMode) this.pruneSelection(itemsToShow);

    if (this.paginationManager) {
      // Pinning, a note, watching, deleting or a new scan redraw the same search: the list stays on its page.
      // A new search or chip starts on page 1.
      const filterKey = JSON.stringify([this.searchQuery || '', this.activeChips || null]);
      const keepPage = this._renderedFilterKey === filterKey;
      this._renderedFilterKey = filterKey;
      this.paginationManager.setItems(itemsToShow, { keepPage });
    }
    if (this.selectMode) this.syncSelectBar();

    // The search and the chips match nothing: say so, with a way back, instead of an empty list
    const noResults = itemsToShow.length === 0;
    const noResultsBlock = document.querySelector('#historyNoResults');
    if (noResultsBlock) noResultsBlock.hidden = !noResults;
    const historyList = document.querySelector('#historyList');
    if (historyList) historyList.style.display = noResults ? 'none' : 'block';

    const historyPagination = document.querySelector('#historyPagination');
    if (historyPagination && itemsToShow.length > 0) {
      historyPagination.style.display = 'flex';
    }
  }

  /**
   * The chip row follows the entries: hidden while History is empty, each chip shows whether it is on,
   * and a category chip carries its category icon in the colour chosen in Settings.
   */
  syncFilterChips() {
    const row = document.querySelector('#historyFilters');
    if (!row) return;
    row.hidden = this.historyItems.length === 0;
    row.querySelectorAll('.history-filter-chip').forEach((chip) => {
      const key = chip.dataset.filter;
      const on = key === 'pinned' || key === 'changed' ? this.activeChips[key] === true : this.activeChips.categories.includes(key);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      const own = chip.querySelector('[data-ui-icon]');
      if (own && !own.firstChild) own.innerHTML = FormatUtils.uiIconSvg(own.dataset.uiIcon);
      if (!chip.dataset.category) return;
      const holder = chip.querySelector('.category-icon');
      if (holder && !holder.firstChild) holder.innerHTML = FormatUtils.categoryIconSvg(key);
      const colour = this.detectorManager?.getCategoryInfo?.(key)?.colour || FormatUtils.DEFAULT_CATEGORY_COLORS[key];
      if (colour) chip.style.setProperty('--chip-color', colour);
    });
  }

  /**
   * Turn a chip on or off (Pinned, Changed or a category) and show what it leaves.
   * @param {string} key - 'pinned', 'changed', 'antibot' or 'captcha'
   */
  toggleFilterChip(key) {
    const chips = this.activeChips;
    if (key === 'pinned' || key === 'changed') {
      chips[key] = !chips[key];
    } else if (HistoryFilter.CATEGORIES.includes(key)) {
      chips.categories = chips.categories.includes(key) ? chips.categories.filter(k => k !== key) : [...chips.categories, key];
    } else {
      return;
    }
    this.renderHistory();
  }

  /** Back to the whole History: every chip off and the search emptied. */
  clearFilters() {
    this.activeChips = { pinned: false, changed: false, categories: [] };
    this.searchQuery = '';
    const searchInput = document.querySelector('#historySearch');
    if (searchInput) searchInput.value = '';
    this.renderHistory();
  }

  /**
   * Render history page items (called by pagination manager)
   * @param {Array} items - History items for current page
   */
  renderHistoryPage(items) {
    const historyList = document.querySelector('#historyList');
    if (!historyList) {
      Logger.warn('UI', '[History] List element not found');
      return;
    }

    historyList.style.display = 'block';

    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const moreLabel = FormatUtils.escapeHtml(_tr('historyMoreActions', 'More actions'));
    const scrapflyLabel = FormatUtils.escapeHtml(_tr('scrapflyExportTitle', 'Scrape with Scrapfly'));
    const scrapflyLogo = (typeof ScrapflyExport !== 'undefined') ? ScrapflyExport.logoHtml('history-scrapfly-logo') : '';
    const untitledLabel = _tr('historyUiUntitled', 'Untitled');
    const unknownLabel = _tr('timeUnknown', 'Unknown');

    const pinnedTip = _tr('historyPinnedTip', 'Pinned: kept when History is cleaned up');
    const autoPinnedTip = _tr('historyAutoPinnedTip', 'Pinned automatically: kept when History is cleaned up. Unpin it and it is never pinned again by itself.');
    const PIN_ICON = FormatUtils.uiIconSvg('pin');
    const WATCH_ICON = FormatUtils.uiIconSvg('watch');
    const watchTip = _tr('historyWatchTip', 'Watching for changes');
    // "Changed": the page's protections differ from its earlier scan; the hover lists what was added and removed
    const changedBadgeHtml = (item) => {
      const change = item.changed;
      if (!HistoryFilter.isChanged(item)) return '';
      const added = HistoryFilter.changeNames(change.added);
      const removed = HistoryFilter.changeNames(change.removed);
      const rows = [];
      if (added.length) rows.push({ label: FormatUtils.t('historyChangeAlertAddedFmt', 'Added: {0}', added.join(', ')), tone: 'green' });
      if (removed.length) rows.push({ label: FormatUtils.t('historyChangeAlertRemovedFmt', 'Removed: {0}', removed.join(', ')), tone: 'red' });
      const when = Number.isFinite(change.at) ? FormatUtils.formatDateTime(change.at) : '';
      return `<span class="history-changed-badge" ${FormatUtils.tipAttrs(_tr('historyChangedBadge', 'Changed'), when, rows)}>${FormatUtils.escapeHtml(_tr('historyChangedBadge', 'Changed'))}</span>`;
    };

    const buildHistoryItemHtml = (item) => {
      const timeAgo = this.getTimeAgo(new Date(item.timestamp));
      // getDomainFromUrl answers 'Unknown' (English, also used in filenames) without a URL
      const domain = item.url ? this.getDomainFromUrl(item.url) : unknownLabel;
      // Page title on top, domain underneath; entries saved without a real title fall back to the domain
      // ('Untitled' is the value stored for pages without a title)
      const rawTitle = (item.title && item.title !== 'Untitled') ? item.title : (domain || untitledLabel);
      const safeTitle = FormatUtils.escapeHtml(rawTitle);
      const safeUrl = FormatUtils.escapeHtml(item.url || '');
      // The full address on the card (cut off with an ellipsis), the domain when none was saved
      const safeDomain = FormatUtils.escapeHtml(domain);
      // Attribute context ("..."): escapeHtml leaves quotes, so a title or an imported id with one would break out
      const attrTitle = FormatUtils.escapeAttr(rawTitle);
      const attrUrl = FormatUtils.escapeAttr(item.url || domain);

      const faviconSrc = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || item.hostname);
      const summary = this.getHistorySummary(item);
      const cardDetections = item.detections || [];
      const hasCardDetections = summary.totalDetections > 0;
      // Breakdown tips, the same ones the detail modal shows
      const detectionsTip = hasCardDetections ? FormatUtils.detectionsTip(cardDetections, summary.labels.detections) : null;
      const confidenceTip = hasCardDetections ? FormatUtils.confidenceTip(cardDetections, `${summary.labels.confidence}: ${summary.avgConfidence}%`) : null;
      const difficultyTip = hasCardDetections ? FormatUtils.difficultyTip(cardDetections, summary.difficulty, `${summary.labels.difficulty}: ${summary.difficultyDisplay}`) : null;

      // Select mode (history-select.js): a checkbox first on the card, the card marked when it is selected
      const selecting = this.selectMode === true;
      const selected = selecting && this.selectedIds instanceof Set && this.selectedIds.has(item.id);
      const selectLabel = FormatUtils.escapeAttr(FormatUtils.t('historySelectCheckboxFmt', 'Select {0}', rawTitle));

      return `
        <div class="history-item${selected ? ' is-selected' : ''}" data-history-id="${FormatUtils.escapeAttr(item.id)}" role="group" tabindex="0" aria-label="${attrTitle}">
          <div class="history-item-top">
            ${selecting ? `<input type="checkbox" class="history-select-input" aria-label="${selectLabel}"${selected ? ' checked' : ''}>` : ''}
            <span class="history-favicon-tile">
              <img src="${FormatUtils.escapeAttr(faviconSrc)}" alt="" class="history-favicon" data-fallback="${UrlUtils.getDefaultFaviconUrl()}">
            </span>
            <div class="history-item-content">
              <div class="history-title-row">
                ${item.pinned === true ? `<span class="history-pin" ${FormatUtils.tipAttrs(item.autoPinned === true ? autoPinnedTip : pinnedTip)}>${PIN_ICON}</span>` : ''}
                ${item.watch === true ? `<span class="history-watch" ${FormatUtils.tipAttrs(watchTip, item.watchedAt ? _tr('historyWatchCheckedFmt', 'Last checked {0}').replace('{0}', FormatUtils.getTimeAgo(item.watchedAt)) : _tr('historyWatchNever', 'Not checked yet'))}>${WATCH_ICON}</span>` : ''}
                <div class="history-title" title="${attrTitle}">${safeTitle}</div>
                ${changedBadgeHtml(item)}
              </div>
              <div class="history-subline">
                <span class="history-url" dir="ltr" title="${attrUrl}">${safeUrl || safeDomain}</span>

              </div>
              ${item.note ? `<div class="history-note" title="${FormatUtils.escapeAttr(item.note)}">${FormatUtils.escapeHtml(item.note)}</div>` : ''}
            </div>
            ${scrapflyLogo && ScrapflyExport.targetUrl(item.url) ? `<button class="history-item-action-btn history-scrapfly-btn" data-action="scrapfly" title="${scrapflyLabel}" aria-label="${scrapflyLabel}">${scrapflyLogo}</button>` : ''}
            <button class="history-item-action-btn history-more-btn" data-action="menu" title="${moreLabel}" aria-label="${moreLabel}" aria-haspopup="menu" aria-expanded="false">
              <svg width="14" height="4" viewBox="0 0 14 4" aria-hidden="true">
                <circle cx="1.8" cy="2" r="1.2" fill="currentColor"/>
                <circle cx="7" cy="2" r="1.2" fill="currentColor"/>
                <circle cx="12.2" cy="2" r="1.2" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <div class="history-item-bottom">
            <span class="history-metrics">
              <span class="history-metric" ${detectionsTip
                ? FormatUtils.tipAttrs(detectionsTip.title, detectionsTip.detail, detectionsTip.rows)
                : `data-tip="${FormatUtils.escapeAttr(summary.labels.detections)}"`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/></svg>
                <span class="history-metric-value">${summary.totalDetections}</span>
              </span>
              ${FormatUtils.confidenceHtml(summary.avgConfidence, 'history-metric', confidenceTip)}
              ${FormatUtils.difficultyHtml(summary.difficulty, summary.difficultyDisplay, 'history-difficulty-pill', difficultyTip)}
            </span>
            <div class="history-detections">
              ${this.renderHistorySummary(cardDetections)}
            </div>
            <span class="history-timestamp" data-tip="${FormatUtils.escapeAttr(FormatUtils.formatDateTime(item.timestamp))}">${FormatUtils.escapeHtml(timeAgo)}</span>
          </div>
        </div>
      `;
    };

    // One entry that cannot be drawn (data from an old build, an import) is left out, never the whole list: a throw here
    // would leave the previous list on screen under chips that already say something else
    const buildCard = (item) => {
      try {
        return buildHistoryItemHtml(item);
      } catch (error) {
        Logger.warn('UI', `[History] Entry ${item && item.id} could not be shown`, error);
        return '';
      }
    };

    const finalizeRender = () => {
      if (renderToken !== this._historyRenderToken) {
        return;
      }

      // CSP-compliant image error fallback
      historyList.querySelectorAll('img[data-fallback]').forEach(img => {
        img.addEventListener('error', function() {
          this.src = this.dataset.fallback;
        }, { once: true });
      });

      // Add click handlers for history items
      this.setupHistoryItemHandlers();
      this.setupOverflowBadgeHandlers();
    };

    this._historyRenderToken = (this._historyRenderToken || 0) + 1;
    const renderToken = this._historyRenderToken;
    const shouldBatchRender = items.length > 40;

    if (!shouldBatchRender) {
      let historyHtml = '';
      items.forEach(item => {
        historyHtml += buildCard(item);
      });
      historyList.innerHTML = historyHtml;
      finalizeRender();
      return;
    }

    historyList.innerHTML = '';
    const batchSize = 10;
    let offset = 0;

    const renderBatch = () => {
      if (renderToken !== this._historyRenderToken) {
        return;
      }

      const slice = items.slice(offset, offset + batchSize);
      let batchHtml = '';
      slice.forEach(item => {
        batchHtml += buildCard(item);
      });
      historyList.insertAdjacentHTML('beforeend', batchHtml);
      offset += batchSize;

      if (offset < items.length) {
        requestAnimationFrame(renderBatch);
      } else {
        finalizeRender();
      }
    };

    renderBatch();
  }

  /**
   * Render detection tags for a history item
   * @param {Array} detections - Array of detections
   * @returns {string} HTML string for detection tags
   */
  /**
   * A card's protections as one total per category (anti-bot, captcha,
   * fingerprint, in the Settings order) with the category icons; the
   * card's details list each protection
   * @param {Array} detections
   * @returns {string} HTML
   */
  renderHistorySummary(detections) {
    if (!detections || detections.length === 0) {
      const noDetections = FormatUtils.t('historyNoDetections', 'No detections');
      return `<span class="history-detection-tag">${FormatUtils.escapeHtml(noDetections)}</span>`;
    }
    const keys = Categories.KEYS;
    const order = (this.detectionSort?.categoryOrder || keys).filter(key => keys.includes(key));
    keys.forEach(key => { if (!order.includes(key)) order.push(key); });
    const sorted = DetectionUtils.sortDetections(detections, this.detectionSort);
    const parts = order.map(key => {
      const inCategory = sorted.filter(d => FormatUtils.categoryKey(d) === key);
      const colour = this.detectorManager?.getCategoryInfo?.(key)?.colour || FormatUtils.DEFAULT_CATEGORY_COLORS[key];
      // Hover: which protections, with their confidence
      const rows = inCategory.slice(0, 8).map(d => {
        const value = Math.round(Number(d.confidence) || 0);
        return { label: FormatUtils.detectorName(d) || FormatUtils.t('timeUnknown', 'Unknown'), value: `${value}%`, tone: FormatUtils.confidenceTone(value) };
      });
      if (inCategory.length > 8) rows.push({ label: FormatUtils.t('tipMoreFmt', '+{0} more', inCategory.length - 8) });
      return `<span class="history-cat-count${inCategory.length ? '' : ' is-zero'}" ${FormatUtils.tipAttrs(`${FormatUtils.categoryLabel(key)}: ${inCategory.length}`, '', rows)}>`
        + `<span class="category-icon" style="color:${colour}" aria-hidden="true">${FormatUtils.categoryIconSvg(key)}</span>`
        + `<span class="history-cat-value">${inCategory.length}</span></span>`;
    });
    // A click goes to the card, which opens the details with each protection
    return `<span class="history-summary">${parts.join('')}</span>`;
  }

  /**
   * Calculate stats for a history item
   * @param {Array} detections - Array of detections
   * @returns {object} Stats object with totalDetections, avgConfidence, difficulty, difficultyColor
   */
  calculateHistoryStats(detections) {
    const totalDetections = detections?.length || 0;

    // Calculate average confidence
    let avgConfidence = 0;
    if (totalDetections > 0) {
      const totalConfidence = detections.reduce((sum, d) => sum + (d.confidence || 0), 0);
      avgConfidence = Math.round(totalConfidence / totalDetections);
    }

    const difficultyInfo = this.getDifficultyInfo(detections || [], avgConfidence);
    return { totalDetections, avgConfidence, difficulty: difficultyInfo.difficulty, difficultyColor: difficultyInfo.difficultyColor };
  }

  /**
   * Compute difficulty for a set of detections.
   * Escalates difficulty when multiple Anti-Bot/CAPTCHA detections appear,
   * or when high-tier providers are present (Shape Security, hCaptcha, Arkose Labs).
   * @param {Array} detections
   * @param {number} avgConfidence
   * @returns {{difficulty: string, difficultyColor: string}}
   */
  getDifficultyInfo(detections = [], avgConfidence = 0) {
    return DetectionUtils.getDifficultyInfo(detections, avgConfidence);
  }

  /**
   * Display-ready summary of a history entry, shared by the card and the detail modal
   * @param {Object} item - History item with detections and cacheScope
   * @returns {Object} counts, tones and localized labels
   */
  getHistorySummary(item) {
    const detections = item.detections || [];
    const stats = this.calculateHistoryStats(detections);
    const _tr = (key, fallback) => FormatUtils.t(key, fallback);

    const scopeKeyByValue = { domain: 'scopeDomain', path: 'scopePath', url: 'scopeFullUrl', full: 'scopeFullUrl', full_url: 'scopeFullUrl' };
    const scopeFallback = { domain: 'Domain', path: 'Path', url: 'Full URL', full: 'Full URL', full_url: 'Full URL' };
    const cacheScope = String(item.cacheScope || 'domain').toLowerCase();
    const scopeDisplay = _tr(scopeKeyByValue[cacheScope] || 'scopeDomain', scopeFallback[cacheScope] || 'Domain');

    const difficultyKeyByValue = { Low: 'difficultyLow', Medium: 'difficultyMedium', High: 'difficultyHigh' };
    const difficultyKey = difficultyKeyByValue[stats.difficulty];
    const difficultyDisplay = difficultyKey ? _tr(difficultyKey, stats.difficulty || '') : (stats.difficulty || '');

    const confidenceTone = FormatUtils.confidenceTone(stats.avgConfidence);
    const difficultyTone = { High: 'red', Medium: 'amber', Low: 'green' }[stats.difficulty] || 'green';

    // Per-category counts for the modal breakdown (Anti-bot, Captcha, Fingerprint, other)
    const categoryCounts = Object.fromEntries(Categories.KEYS_AND_OTHER.map(key => [key, 0]));
    detections.forEach(d => { categoryCounts[Categories.keyOf(d)]++; });

    return {
      ...stats,
      difficultyDisplay,
      difficultyTone,
      confidenceTone,
      scopeDisplay,
      categoryCounts,
      labels: {
        detections: _tr('statDetections', 'Detections'),
        confidence: _tr('statConfidence', 'Confidence'),
        difficulty: _tr('statDifficulty', 'Difficulty'),
        scope: _tr('statCacheScope', 'Cache Scope')
      }
    };
  }

  /**
   * Summary block of the detail modal: three metric tiles, then a category bar
   * @param {Object} item - History item
   * @returns {string} HTML
   */
  renderHistoryModalSummary(item) {
    const s = this.getHistorySummary(item);
    const esc = FormatUtils.escapeHtml;
    const detections = item.detections || [];
    // Same hover card as the category bar: a title, what the number means and a breakdown
    const tipFor = (tip) => (tip ? ` tabindex="0" ${FormatUtils.tipAttrs(tip.title, tip.detail, tip.rows)}` : '');
    const tile = (cls, label, value, tone = '', tip = null) => `
      <div class="hm-metric ${cls}"${tipFor(tip)}>
        <div class="hm-metric-label">${esc(label)}</div>
        <div class="hm-metric-value${tone ? ` tone-${tone}` : ''}">${esc(String(value))}</div>
      </div>`;
    const hasDetections = s.totalDetections > 0;
    const detectionsTip = hasDetections ? FormatUtils.detectionsTip(detections, s.labels.detections) : null;
    const confidenceTip = hasDetections ? FormatUtils.confidenceTip(detections, `${s.labels.confidence}: ${s.avgConfidence}%`) : null;
    const difficultyTip = hasDetections ? FormatUtils.difficultyTip(detections, s.difficulty, `${s.labels.difficulty}: ${s.difficultyDisplay}`) : null;

    const segments = [
      { key: 'antibot', label: FormatUtils.t('categoryAntibot', 'Anti-bot') },
      { key: 'captcha', label: FormatUtils.t('categoryCaptcha', 'Captcha') },
      { key: 'fingerprint', label: FormatUtils.t('categoryFingerprint', 'Fingerprint') },
      { key: 'other', label: FormatUtils.t('statsCategoryOther', 'Other') }
    ].filter(seg => s.categoryCounts[seg.key] > 0);

    const bar = s.totalDetections > 0 ? `
      <div class="hm-breakdown">
        <div class="hm-bar">
          ${segments.map(seg => {
            const count = s.categoryCounts[seg.key];
            const pct = Math.round((count / s.totalDetections) * 100);
            const detail = FormatUtils.t('historyCategoryShareFmt', '{0} of {1} detections · {2}%', count, s.totalDetections, pct);
            return `<span class="hm-bar-seg cat-${seg.key}" style="flex: ${count}" role="img" aria-label="${FormatUtils.escapeAttr(`${seg.label}: ${detail}`)}" data-tip="${FormatUtils.escapeAttr(seg.label)}" data-tip-detail="${FormatUtils.escapeAttr(detail)}" data-tip-dot="cat-${seg.key}"></span>`;
          }).join('')}
        </div>
        <div class="hm-legend">
          ${segments.map(seg => {
            const count = s.categoryCounts[seg.key];
            const pct = Math.round((count / s.totalDetections) * 100);
            const detail = FormatUtils.t('historyCategoryShareFmt', '{0} of {1} detections · {2}%', count, s.totalDetections, pct);
            return `<span class="hm-legend-item" ${FormatUtils.tipAttrs(seg.label, detail, [], `cat-${seg.key}`)}><i class="hm-dot cat-${seg.key}"></i>${esc(seg.label)}<b>${count}</b></span>`;
          }).join('')}
          <span class="hm-legend-scope" ${FormatUtils.tipAttrs(`${s.labels.scope}: ${s.scopeDisplay}`, this.getScopeHint(item.cacheScope))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a13 13 0 0 0 0 18a13 13 0 0 0 0-18M3 12h18"/></svg>${esc(s.scopeDisplay)}
          </span>
        </div>
      </div>` : '';

    return `
      <div class="hm-metrics">
        ${tile('hm-metric-detections', s.labels.detections, s.totalDetections, '', detectionsTip)}
        ${tile('hm-metric-confidence', s.labels.confidence, `${s.avgConfidence}%`, s.confidenceTone, confidenceTip)}
        ${tile('hm-metric-difficulty', s.labels.difficulty, s.difficultyDisplay, s.difficultyTone, difficultyTip)}
      </div>
      ${bar}
    `;
  }

  /**
   * What a cache scope means, for its hover tip.
   * @param {string} scope - domain | path | full
   * @returns {string}
   */
  getScopeHint(scope) {
    const value = String(scope || 'domain').toLowerCase();
    if (value === 'path') return FormatUtils.t('tipScopePath', 'Results are reused for this exact path, whatever the query.');
    if (value === 'full' || value === 'url' || value === 'full_url') return FormatUtils.t('tipScopeFullUrl', 'Results are reused only for this exact URL, including the query.');
    return FormatUtils.t('tipScopeDomain', 'Results are reused for every page on this domain.');
  }

  /**
   * Setup click handlers for overflow badges
   */
  setupOverflowBadgeHandlers() {
    const badges = document.querySelectorAll('.more-detections');
    badges.forEach(badge => {
      badge.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent history item card click
        const historyItemId = badge.dataset.historyItemId;
        const item = this.historyItems.find(h => h.id === historyItemId);
        if (item) {
          this.showHistoryItemDetails(item);  // Open same modal as card click
        }
      });
    });
  }

  /**
   * Attach click handlers to detection cards in detail modal
   */
  attachDetailModalClickHandlers() {
    const cards = document.querySelectorAll('#historyModalContent .history-modal-detection-card.has-methods');

    cards.forEach(card => {
      const header = card.querySelector('.history-modal-detection-header');
      const methods = card.querySelector('.history-modal-detection-methods');

      if (header && methods) {
        // Toggle expand/collapse on header click or Enter / Space
        const toggle = () => {
          const isExpanded = card.classList.toggle('expanded');
          methods.style.display = isExpanded ? 'flex' : 'none';
          header.setAttribute('aria-expanded', String(isExpanded));
        };
        header.addEventListener('click', toggle);
        header.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        });

        // Initially hide methods
        methods.style.display = 'none';
      }
    });
  }

  /**
   * Show empty state when no history items exist
   */
  showEmptyState() {
    const historyList = document.querySelector('#historyList');
    const historyEmpty = document.querySelector('#historyEmpty');
    const historyPagination = document.querySelector('#historyPagination');
    const historyFilters = document.querySelector('#historyFilters');
    const historyNoResults = document.querySelector('#historyNoResults');

    if (historyList) historyList.style.display = 'none';
    if (historyEmpty) historyEmpty.style.display = 'flex';
    if (historyPagination) historyPagination.style.display = 'none';
    if (historyFilters) historyFilters.hidden = true;
    if (historyNoResults) historyNoResults.hidden = true;
  }

  /**
   * Clear all history items
   */
  async clearHistory() {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      await this.sendHistoryChange({ type: HistoryStore.Messages.CLEAR });
      this.historyItems = [];
      // Select mode ends with the list: its "N selected" bar would stay with nothing to act on
      if (this.selectMode && typeof this.exitSelectMode === 'function') this.exitSelectMode();
      this.showEmptyState();
      Logger.ui('History cleared');
      NotificationHelper.success(_tr('notificationHistoryCleared', 'History cleared'));
    } catch (error) {
      Logger.warn('UI', '[History] Clear failed', error);
      NotificationHelper.error(_fmt('notificationClearHistoryFailedFmt', 'Failed to clear history: ' + error.message, error.message));
    }
  }

  /**
   * Handle search functionality
   * @param {string} query - Search query
   */
  handleSearch(query) {
    this.searchQuery = query.toLowerCase().trim();
    this.renderHistory();
  }

  /**
   * The entries the search and the filter chips leave (HistoryFilter): the search looks in the
   * address, the title, the note and the protections' names
   * @returns {Array} Filtered history items
   */
  getFilteredItems() {
    return HistoryFilter.filter(this.historyItems, {
      query: this.searchQuery,
      chips: this.activeChips,
      nameOf: detection => FormatUtils.detectorName(detection),
      categoryOf: detection => FormatUtils.categoryKey(detection)
    });
  }

  /**
   * History keeps detections without icons: take them from the installed
   * detectors (by id, else by category and name, as the cards do)
   * @param {Array<object>} detections
   * @returns {Array<object>}
   */
  withDetectorIcons(detections) {
    const dm = this.detectorManager;
    if (!dm) return detections;
    return detections.map(detection => {
      const name = detection?.detector?.name || detection?.name;
      const category = Categories.normalize(detection);
      const found = (detection?.detector?.id && dm.findDetectorById?.(detection.detector.id))
        || (name && category && dm.getDetectorByName?.(category, name));
      if (!found) return detection;
      return { ...detection, detector: { ...(detection.detector || {}), name, icon: found.icon, customIcon: found.customIcon } };
    });
  }

  /**
   * Setup click handlers for history items
   */
  setupHistoryItemHandlers() {
    // Card buttons: copy and Scrapfly act directly, "…" opens the shared per-entry menu
    document.querySelectorAll('#historyList .history-item-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = e.currentTarget.dataset.action;
        const historyItem = e.currentTarget.closest('.history-item');
        const historyId = historyItem.dataset.historyId;
        const item = this.historyItems.find(h => h.id === historyId);

        if (!item) return;

        if (action === 'copy') {
          this.copyHistoryItem(item);
        } else if (action === 'scrapfly') {
          this.closeMenus();
          ScrapflyExport.open({ url: item.url, detections: this.withDetectorIcons(item.detections || []) });
        } else if (action === 'menu') {
          const menu = document.querySelector('#historyItemMenu');
          if (this._openMenu && this._openMenu.anchor === e.currentTarget) {
            this.closeMenus();
          } else if (menu) {
            this.syncItemMenu(menu, item);
            this.openMenu(menu, e.currentTarget);
            this._menuItemId = historyId;
          }
        }
      });
    });

    // Handle history item click (open modal)
    document.querySelectorAll('.history-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const historyId = e.currentTarget.dataset.historyId;
        // Select mode: the card selects instead of opening its details
        if (this.selectMode) {
          this.onSelectClick(e, historyId);
          return;
        }
        const historyItem = this.historyItems.find(h => h.id === historyId);

        if (historyItem) {
          this.showHistoryItemDetails(historyItem);
        }
      });
      // Keyboard: Enter or Space on the card itself (not on its buttons) does what a click does
      item.addEventListener('keydown', (e) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        e.currentTarget.click();
      });
    });
  }

  /**
   * Show detailed view of a history item
   * @param {object} historyItem - History item object
   */
  showHistoryItemDetails(historyItem) {
    Logger.debug('UI', 'Showing details for history item:', historyItem);

    const modal = document.querySelector('#historyDetailModal');
    if (!modal) {
      Logger.warn('UI', '[History] Detail modal not found');
      return;
    }

    // Populate modal header
    const favicon = document.querySelector('#historyModalFavicon');
    const title = document.querySelector('#historyModalTitle');
    const url = document.querySelector('#historyModalUrl');
    const timestamp = document.querySelector('#historyModalTimestamp');
    const modalStats = document.querySelector('#historyModalStats');
    const content = document.querySelector('#historyModalContent');

    if (favicon) {
      const faviconUrl = UrlUtils.resolveDisplayFavicon(historyItem.favicon, historyItem.url || historyItem.hostname);
      favicon.src = faviconUrl;
      favicon.onerror = () => {
        favicon.src = UrlUtils.getDefaultFaviconUrl();
      };
    }
    if (title) {
      title.textContent = (historyItem.title && historyItem.title !== 'Untitled')
        ? historyItem.title
        : FormatUtils.t('historyUiUntitled', 'Untitled');
    }
    if (url) {
      url.textContent = this.getDomainFromUrl(historyItem.url || '') || historyItem.url;
      url.href = historyItem.url;
      url.title = historyItem.url || '';
    }
    if (timestamp) {
      const timeAgo = this.getTimeAgo(new Date(historyItem.timestamp));
      const fullDate = FormatUtils.formatDateTime(historyItem.timestamp);
      timestamp.textContent = timeAgo;
      timestamp.title = fullDate;
    }
    if (modalStats) {
      modalStats.innerHTML = this.renderHistoryModalSummary(historyItem);
    }
    this._modalItemId = historyItem.id;

    // Render detections in modal
    if (content) {
      content.innerHTML = this.renderDetectionDetails(historyItem.detections || []);
    }

    this.attachDetailModalClickHandlers();

    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Setup close handlers
    this.setupModalCloseHandlers();

    // Setup copy handlers for individual method items
    this.setupMethodCopyHandlers();
  }

  /**
   * Copy history item data to clipboard
   * @param {object} historyItem - History item to copy
   */
  async copyHistoryItem(historyItem) {
    const detailsText = this.formatHistoryItemText(historyItem);
    await FormatUtils.copyToClipboard(detailsText);
  }

  /**
   * What "Copy entry" writes for one match: what was matched, never its value.
   * A cookie or header keeps its name, an address loses its query and hash, a
   * payload keeps its rule pattern: those values carry live tokens
   * (__cf_bm, datadome, reese84…), which every other copy leaves out too.
   * @param {object} match - A saved match
   * @returns {string} The label, '' when there is nothing safe to show
   */
  static copyLabel(match) {
    if (!match || typeof match !== 'object') return '';
    const type = String(match.type || '').toLowerCase();
    const text = (v) => (typeof v === 'string' ? v.trim() : '');
    const before = (value, sep) => {
      const raw = text(value);
      const at = raw.indexOf(sep);
      return at > 0 ? raw.slice(0, at).trim() : '';
    };
    const noQuery = (value) => text(value).replace(/[?#].*$/s, '');
    if (type === 'cookie' || type === 'cookies') return before(match.value, '=') || text(match.name) || text(match.pattern);
    if (type === 'header' || type === 'headers') return before(match.value, ':') || text(match.name) || text(match.pattern);
    if (type === 'dom') return History.domSelectorOf(match.value) || text(match.selector) || text(match.pattern);
    if (type === 'payload') return text(match.pattern) || text(match.name);
    if (match.fullUrl) return noQuery(match.fullUrl);
    if (type === 'url' || type === 'urls') return noQuery(match.value) || text(match.pattern) || text(match.name);
    // Window properties, hook targets, script text: what matched is the value itself
    return text(match.value) || text(match.name) || text(match.selector) || text(match.pattern);
  }

  /** "selector=text" as History keeps a DOM match: the selector, "=" inside [ ] kept. */
  static domSelectorOf(value) {
    const raw = typeof value === 'string' ? value : '';
    let depth = 0;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === '[') depth++;
      else if (raw[i] === ']') depth = Math.max(0, depth - 1);
      else if (raw[i] === '=' && depth === 0) return raw.slice(0, i).trim();
    }
    return raw.trim();
  }

  /**
   * History → … → Compare with…: a dialog with the entry's other saved scans of the same page to pick from, and what
   * changed between the two (HistoryCompare): protections added, removed, changed in confidence or evidence, unchanged.
   * "Copy as Markdown" copies that report; Close leaves.
   * @param {object} item - History entry
   * @returns {Promise<boolean>} false when the page has no other scan
   */
  async compareHistoryItem(item) {
    const t = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const candidates = HistoryCompare.others(this.historyItems, item);
    if (!candidates.length) {
      NotificationHelper.info(t('historyCompareNone', 'No other saved scan of this page to compare with'));
      return false;
    }
    const categoryLabel = (key) => FormatUtils.categoryLabel(key);
    const methodLabel = (type) => this.getMethodLabel(String(type).toLowerCase());
    const dateText = (ms) => FormatUtils.formatDateTime(ms);
    const where = (entry) => {
      if (entry.url === item.url) return '';
      try { const u = new URL(entry.url); return ` · ${(u.pathname + u.search).slice(0, 40)}`; } catch (_) { return ''; }
    };

    const select = document.createElement('select');
    select.className = 'select-field history-dialog-input';
    // Each option is a translated sentence (date, count, path): its direction is the language's, not forced left to right
    select.setAttribute('dir', 'auto');
    for (const candidate of candidates) {
      const option = document.createElement('option');
      option.value = candidate.id;
      option.textContent = t('historyCompareOptionFmt', '{0} · {1} found', dateText(candidate.timestamp), (candidate.detections || []).length) + where(candidate);
      select.appendChild(option);
    }
    const first = HistoryCompare.pickDefault(candidates, item);
    select.value = first ? first.id : candidates[0].id;

    const field = document.createElement('label');
    field.className = 'history-dialog-field';
    const label = document.createElement('span');
    label.className = 'history-dialog-label';
    label.textContent = t('historyCompareWith', 'Compare with');
    field.append(label, select);
    const range = document.createElement('div');
    range.className = 'history-dialog-count';
    range.setAttribute('role', 'status');
    const result = document.createElement('div');
    result.className = 'history-compare-result';
    const form = document.createElement('div');
    form.className = 'history-dialog-form history-compare';
    form.append(field, range, result);

    let current = null;
    const group = (kind, key, fallback, rows, render) => {
      if (!rows.length) return;
      const section = document.createElement('section');
      section.className = `history-compare-group history-compare-${kind}`;
      const heading = document.createElement('h4');
      heading.textContent = `${t(key, fallback)} (${rows.length})`;
      const list = document.createElement('ul');
      for (const row of rows) {
        const li = document.createElement('li');
        li.textContent = render(row);
        list.appendChild(li);
      }
      section.append(heading, list);
      result.appendChild(section);
    };
    const describe = (row) => `${row.name} · ${categoryLabel(row.category)}${row.confidence === null ? '' : ` · ${row.confidence}%`}`;
    const refresh = () => {
      const other = candidates.find(c => c.id === select.value);
      current = HistoryCompare.compare(item, other);
      range.textContent = t('historyCompareRangeFmt', 'From {0} to {1}', dateText(current.earlier.timestamp), dateText(current.later.timestamp));
      result.replaceChildren();
      if (current.identical) {
        const same = document.createElement('p');
        same.className = 'history-compare-identical';
        same.textContent = t('historyCompareIdentical', 'These two scans found the same protections, with the same confidence and evidence.');
        result.appendChild(same);
      }
      group('added', 'historyCompareAdded', 'Added', current.added, describe);
      group('removed', 'historyCompareRemoved', 'Removed', current.removed, describe);
      group('changed', 'historyCompareChanged', 'Changed', current.changed, (row) => `${row.name} · ${categoryLabel(row.category)} · ${HistoryCompare.changeText(row, { t, methodLabel })}`);
      group('same', 'historyCompareUnchanged', 'Unchanged', current.same, describe);
    };
    select.addEventListener('change', refresh);
    refresh();

    const copy = await NotificationHelper.form({
      title: t('historyCompareTitle', 'Compare scans'),
      confirmText: t('historyCompareCopy', 'Copy as Markdown'),
      cancelText: t('btnClose', 'Close'),
      content: form,
      focus: select
    });
    if (copy && current) {
      await FormatUtils.copyToClipboard(HistoryCompare.toMarkdown(current, {
        host: item.hostname || this.getDomainFromUrl(item.url), address: String(item.url || '').replace(/[?#].*$/s, ''),
        t, methodLabel, categoryLabel, dateText
      }));
    }
    return true;
  }

  /** Only web pages are opened from History. */
  static isOpenableUrl(url) {
    try {
      const parsed = new URL(String(url || ''));
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  /**
   * History → … → Open page: the saved address in a new tab, which scans it as
   * usual (or shows its saved result while that is fresh).
   * @returns {Promise<boolean>} false for an address that is not a web page
   */
  async openHistoryItem(historyItem) {
    if (!History.isOpenableUrl(historyItem && historyItem.url)) return false;
    await chrome.tabs.create({ url: historyItem.url, active: true });
    return true;
  }

  /**
   * History → … → Scan again now: the page's saved result is cleared, then the
   * page is scanned from the start, in the tab that already shows it (reloaded)
   * or in a new one. No confirmation: asking for a scan is the confirmation.
   * @returns {Promise<'reloaded'|'opened'|false>}
   */
  async rescanHistoryItem(historyItem) {
    if (!History.isOpenableUrl(historyItem && historyItem.url)) return false;
    const rawScope = String(historyItem.cacheScope || 'domain').toLowerCase();
    const mappedScope = rawScope === 'url' ? 'full' : rawScope;
    const cacheScope = ['domain', 'path', 'full'].includes(mappedScope) ? mappedScope : 'domain';
    let open = null;
    try {
      const tabs = await chrome.tabs.query({ url: historyItem.url.replace(/#.*$/, '') });
      open = (tabs || []).find(tab => tab && typeof tab.id === 'number' && tab.url === historyItem.url) || (tabs || [])[0] || null;
    } catch (_) {
      open = null; // an address chrome.tabs.query cannot match: open a new tab
    }
    const request = { type: WorkerMessages.HISTORY_CLEAR_CACHE, url: historyItem.url, cacheScope };
    if (open) request.tabId = open.id;
    try {
      await chrome.runtime.sendMessage(request);
    } catch (error) {
      Logger.warn('UI', '[History] Could not clear the saved result before the scan:', error && error.message);
    }
    if (open) {
      try {
        await chrome.tabs.reload(open.id);
      } catch (_) {
        // The tab closed in between: open the page instead
        await chrome.tabs.create({ url: historyItem.url, active: true });
        return 'opened';
      }
      await chrome.tabs.update(open.id, { active: true }).catch(() => {});
      if (typeof open.windowId === 'number' && chrome.windows && chrome.windows.update) {
        await chrome.windows.update(open.windowId, { focused: true }).catch(() => {});
      }
      return 'reloaded';
    }
    await chrome.tabs.create({ url: historyItem.url, active: true });
    return 'opened';
  }

  /**
   * Format history item as text
   * @param {object} historyItem - History item
   * @returns {string} Formatted text
   */
  formatHistoryItemText(historyItem) {
    const L = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
    const title = (historyItem.title && historyItem.title !== 'Untitled')
      ? historyItem.title
      : L('historyUiUntitled', 'Untitled');
    // The address without its query and fragment: they can hold session tokens (like the Detection tab's copies)
    let text = L('clipboardUrlFmt', 'URL: {0}', String(historyItem.url || '').replace(/[?#].*$/s, '')) + '\n';
    text += L('clipboardTitleFmt', 'Title: {0}', title) + '\n';
    text += L('clipboardTimestampFmt', 'Timestamp: {0}', FormatUtils.formatDateTime(historyItem.timestamp)) + '\n';
    text += '\n' + L('clipboardDetectionsListFmt', 'Detections ({0}):', historyItem.detections?.length || 0) + '\n';
    text += '─'.repeat(50) + '\n\n';

    const unknownValue = L('detectionUiUnknownValue', 'unknown');
    (historyItem.detections || []).forEach((detection, index) => {
      const name = FormatUtils.detectorName(detection) || L('timeUnknown', 'Unknown');
      const category = detection.category || '';
      const confidence = detection.confidence || 0;

      text += `${index + 1}. ${name}\n`;
      text += '   ' + L('clipboardCategoryFmt', 'Category: {0}', category) + '\n';
      text += '   ' + L('clipboardConfidenceFmt', 'Confidence: {0}%', confidence) + '\n';

      if (detection.matches && detection.matches.length > 0) {
        text += '   ' + L('clipboardDetectionMethodsHeading', 'Detection Methods:') + '\n';
        detection.matches.forEach(match => {
          const methodType = (match.type || 'unknown').replace(/_/g, ' ').toUpperCase();
          const value = History.copyLabel(match) || unknownValue;
          text += `     - ${methodType}: ${value} (${match.confidence || 0}%)\n`;
        });
      }
      text += '\n';
    });

    return text;
  }

  /**
   * Export single history item to JSON file
   * @param {object} historyItem - History item to export
   */
  exportHistoryItem(historyItem) {
    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      item: historyItem
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const domain = this.getDomainFromUrl(historyItem.url);
    const timestamp = FormatUtils.localDay(historyItem.timestamp);
    a.href = url;
    a.download = `scrapfly-history-${domain}-${timestamp}.json`;
    a.click();

    URL.revokeObjectURL(url);
    const _t1 = (typeof I18n !== 'undefined') ? I18n : null;
    NotificationHelper.success((_t1 && _t1.get('notificationHistoryItemExported')) || 'History item exported');
  }

  /**
   * Clear cached detection data for a history item URL while keeping the entry.
   * @param {Object} historyItem - History item whose cache should be cleared
   */
  async clearHistoryItemCache(historyItem) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      const domain = this.getDomainFromUrl(historyItem.url);
      const confirmed = await NotificationHelper.confirm({
        title: _tr('dialogClearCacheTitle', 'Clear Cache'),
        message: _fmt('dialogClearCacheMessageFmt', `Clear cached detection data for ${domain}? The history entry will be kept.`, domain),
        type: 'warning',
        tone: 'danger',
        confirmText: _tr('buttonClearCache', 'Clear Cache'),
        cancelText: _tr('btnCancel', 'Cancel'),
        emphasizeAction: true
      });

      if (!confirmed) return;

      const rawScope = String(historyItem.cacheScope || 'domain').toLowerCase();
      const mappedScope = rawScope === 'url' ? 'full' : rawScope;
      const cacheScope = ['domain', 'path', 'full'].includes(mappedScope) ? mappedScope : 'domain';

      const request = {
        type: WorkerMessages.HISTORY_CLEAR_CACHE,
        url: historyItem.url,
        cacheScope
      };

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];
      if (activeTab && typeof activeTab.id === 'number' && activeTab.url) {
        const activeHash = UrlUtils.hashUrl(activeTab.url, cacheScope);
        const targetHash = UrlUtils.hashUrl(historyItem.url, cacheScope);
        if (activeHash === targetHash) {
          request.tabId = activeTab.id;
        }
      }

      const response = await chrome.runtime.sendMessage(request);

      if (response?.status === 'cleared') {
        NotificationHelper.success(_tr('notificationCacheCleared', 'Cache cleared'));
      } else if (response?.status === 'not_found') {
        NotificationHelper.info(_tr('notificationCacheAlreadyCleared', 'Cache already cleared'));
      } else {
        NotificationHelper.error(_tr('notificationClearCacheFailed', 'Failed to clear cache'));
      }
    } catch (error) {
      Logger.warn('UI', '[History] Cache clear failed', error);
      NotificationHelper.error(_tr('notificationClearCacheFailed', 'Failed to clear cache'));
    }
  }

  /**
   * Add the history item's domain to blacklist.
   * @param {Object} historyItem - History item whose domain should be blacklisted
   */
  async addHistoryItemToBlacklist(historyItem) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      if (!historyItem?.url) {
        NotificationHelper.error(_tr('invalidUrl', 'Invalid URL'));
        return;
      }

      const domain = this.getDomainFromUrl(historyItem.url);
      if (!domain || domain === 'Unknown') {
        NotificationHelper.error(_tr('invalidDomain', 'Invalid domain'));
        return;
      }

      // In the mode where the list holds the only sites to scan, the entry's site joins that list (nothing is lost, so no question)
      if ((this.scanMode || 'blocklist') === 'allowlist') {
        if (!await StorageManager.setDomainAllowed(domain, true)) throw new Error('Failed to save settings');
        NotificationHelper.success(_fmt('siteAllowedFmt', `Added "${domain}" to the sites to scan`, domain));
        return;
      }

      const confirmed = await NotificationHelper.confirm({
        title: _tr('addBlacklistTitle', 'Add to Blacklist'),
        message: _fmt('addBlacklistMsgFmt', `Domain "${domain}" will be excluded from all future detections. You can remove it later in Settings.`, domain),
        confirmText: _tr('addBlacklistBtn', 'Add to Blacklist'),
        cancelText: _tr('btnCancel', 'Cancel'),
        type: 'danger',
        emphasizeAction: true
      });

      if (!confirmed) return;

      const settings = await Utils.getSettings();

      if (!settings.detection) {
        settings.detection = {};
      }
      if (!Array.isArray(settings.detection.blacklistedDomains)) {
        settings.detection.blacklistedDomains = [];
      }

      if (settings.detection.blacklistedDomains.includes(domain)) {
        NotificationHelper.info(_fmt('alreadyBlacklistedFmt', `Domain "${domain}" is already blacklisted`, domain));
        return;
      }

      const saved = typeof StorageManager !== 'undefined' && typeof StorageManager.setDomainExcluded === 'function'
        ? await StorageManager.setDomainExcluded(domain, true)
        : false;
      if (!saved) {
        throw new Error('Failed to save settings');
      }

      NotificationHelper.success(_fmt('notificationDomainBlacklistedFmt', `Added "${domain}" to blacklist`, domain));
    } catch (error) {
      Logger.warn('UI', '[History] Blacklist add failed', error);
      NotificationHelper.error(_tr('notificationBlacklistFailed', 'Failed to add to blacklist'));
    }
  }

  /**
   * Delete a single history item
   * @param {Object} historyItem - History item to delete
   */
  async deleteHistoryItem(historyItem) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    try {
      const domain = this.getDomainFromUrl(historyItem.url);
      const confirmed = await NotificationHelper.confirm({
        title: _tr('dialogDeleteHistoryTitle', 'Delete History Item'),
        message: _fmt('dialogDeleteHistoryMessageFmt', `Are you sure you want to delete this detection from ${domain}?`, domain),
        type: 'danger',
        confirmText: _tr('btnDelete', 'Delete'),
        cancelText: _tr('btnCancel', 'Cancel'),
        emphasizeAction: true
      });

      if (!confirmed) return;

      // The worker removes it from the stored list; then reload so entries it
      // saved since the popup opened show up instead of being overwritten.
      await this.sendHistoryChange({ type: HistoryStore.Messages.DELETE_ITEMS, ids: [historyItem.id] });
      await this.loadHistoryFromStorage();
      this.renderHistory();

      NotificationHelper.success(_tr('notificationHistoryItemDeleted', 'History item deleted'));
      Logger.debug('UI', 'History: Item deleted successfully');
    } catch (error) {
      Logger.warn('UI', '[History] Delete failed', error);
      NotificationHelper.error(_tr('notificationDeleteHistoryItemFailed', 'Failed to delete history item'));
    }
  }

  /**
   * Render detection details for modal
   * @param {Array} detections - Array of detection objects
   * @returns {string} HTML string
   */
  renderDetectionDetails(detections) {
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;
    if (!detections || detections.length === 0) {
      return `<div class="history-modal-empty">${_tr('historyNoDetectionsFound', 'No detections found')}</div>`;
    }

    // Settings → Detection → Show first (category order or highest confidence),
    // as in the Detection tab. The original index is kept so
    // data-detection-index still points into the stored array.
    const ordered = DetectionUtils.sortDetections(
      detections.map((detection, index) => ({ detection, index })), this.detectionSort, entry => entry.detection);

    return ordered.map(({ detection, index }) => {
      const rawName = FormatUtils.detectorName(detection);
      const name = rawName || _tr('unknownDetection', 'Unknown Detection');
      const safeName = FormatUtils.escapeAttr(name); // also in alt="..."
      const category = detection.category || '';
      const categoryKey = Categories.labelOf(category)?.[0] || null;
      const translatedCategory = categoryKey ? _tr(categoryKey, category) : category;
      const safeCategory = FormatUtils.escapeHtml(translatedCategory);
      const catClass = Categories.keyOf(category);
      const confidence = Math.round(Number(detection.confidence) || 0);
      const hasMethods = detection.matches && detection.matches.length > 0;

      // The rule as loaded now: by id first (names can change), then by name
      let detectorObj = null;
      if (this.detectorManager) {
        const id = detection.detector && typeof detection.detector === 'object' ? detection.detector.id : '';
        detectorObj = (id && this.detectorManager.findDetectorById?.(id))
          || (category && rawName ? this.detectorManager.getDetectorByName(category, name) : null);
      }
      const isFingerprintCategory = catClass === 'fingerprint';

      // Detector icon, the same choice as the Detection tab (FormatUtils.detectorIcon): vendor logo on a white plate,
      // fingerprint glyphs tinted blue, an uploaded image, an emoji, or the Scrapfly logo
      const icon = FormatUtils.detectorIcon(detectorObj);
      let detectorIconHtml;
      if (icon.kind === 'glyph') {
        detectorIconHtml = `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell">${FormatUtils.FINGERPRINT_ICONS[icon.value]}</div>`;
      } else if (icon.kind === 'emoji') {
        detectorIconHtml = FormatUtils.escapeHtml(icon.value);
      } else if (icon.kind === 'file' && !isFingerprintCategory) {
        detectorIconHtml = FormatUtils.brandLogoHtml(icon.value, rawName || name, 'modal-detector-icon');
      } else {
        const [src, source] = icon.kind === 'custom' ? [icon.value, 'custom']
          : icon.kind === 'file' ? [chrome.runtime.getURL(`detectors/icons/${icon.value}`), 'builtin']
            : [chrome.runtime.getURL('icons/icon128.png'), 'default'];
        detectorIconHtml = isFingerprintCategory
          ? `<div class="modal-detector-icon-svg fingerprint-icon fingerprint-icon-shell"><img src="${FormatUtils.escapeAttr(src)}" alt="${safeName}" class="fingerprint-icon-image fingerprint-icon-image--${source} history-modal-fingerprint-image"></div>`
          : `<img src="${FormatUtils.escapeAttr(src)}" alt="${safeName}" class="modal-detector-icon${source === 'default' ? ' modal-detector-icon--default' : ''}">`;
      }

      const methodsHtml = this.renderDetectionMethods(detection.matches || []);
      const combinationsHtml = this.renderHistoryCombinations(detection, detectorObj, index);
      const matchCount = detection.matches?.length || 0;
      const methodTypeBadges = this.renderMethodTypeBadges(detection.matches || []);
      const expandLabel = FormatUtils.escapeAttr(_tr('detectionModalDetectionMethods', 'Detection methods'));

      return `
        <div class="history-modal-detection-card cat-${catClass} ${hasMethods ? 'has-methods' : ''}" data-detection-index="${index}">
          <div class="history-modal-detection-header"${hasMethods ? ` role="button" tabindex="0" aria-expanded="false" aria-label="${expandLabel}"` : ''}>
            <div class="history-modal-detection-icon icon-${catClass}">${detectorIconHtml}</div>
            <div class="history-modal-detection-content">
              <div class="history-modal-detection-title">
                <span class="history-modal-detection-name" title="${FormatUtils.escapeAttr(name)}">${safeName}</span>
                ${safeCategory ? `<span class="history-modal-badge cat-${catClass}">${safeCategory}</span>` : ''}
              </div>
              <div class="history-modal-detection-chips">${methodTypeBadges}</div>
            </div>
            <div class="history-modal-detection-right">
              ${FormatUtils.confidenceHtml(confidence, 'history-modal-score')}
              ${hasMethods ? `
                <span class="history-modal-expand-btn" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
                </span>
              ` : ''}
            </div>
          </div>
          ${hasMethods ? `
            <div class="history-modal-detection-details">
              ${combinationsHtml}
              <div class="history-modal-match-count">${FormatUtils.escapeHtml(_tr('historyMatchedDetections', 'Matched detections'))}</div>
              <div class="history-modal-detection-methods">
                ${methodsHtml}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * Matched combinations of one detection as checklists (CombinationChecklist),
   * rebuilt from the rule as it is now. Popup only: the worker never renders History.
   */
  renderHistoryCombinations(detection, definition, index) {
    const combos = Array.isArray(detection.combinations) ? detection.combinations : [];
    if (!combos.length || typeof CombinationChecklist === 'undefined') return '';
    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const title = (t && t.get('detectionModalCombinations')) || 'Matched combinations';
    const cards = CombinationChecklist.build({
      combinations: combos,
      definition,
      found: detection.comboFound,
      matches: Array.isArray(detection.matches) ? detection.matches : [],
      detectionConfidence: detection.confidence,
      // Slim entries keep a rule key instead of the rule; a full detection carries its own
      fromHistory: !combos.some(combo => combo && combo.when)
    });
    // Entries saved before checklists: say it once, not on every card
    const notSaved = cards.some(card => card.unavailable === 'notSaved')
      ? `<p class="match-combo-hint" dir="auto">${FormatUtils.escapeHtml((t && t.get('combinationDetailsNotSavedAll')) || 'This scan was saved before conditions were kept, so only names and scores are shown.')}</p>`
      : '';
    return `<div class="history-modal-combos">
      <div class="history-modal-combos-title">${FormatUtils.escapeHtml(title)}</div>
      ${notSaved}
      <div class="match-combo-list">${CombinationChecklist.renderHtml(cards, this.historyChecklistOptions(`hist-combo-${index}`))}</div>
    </div>`;
  }

  historyChecklistOptions(idPrefix) {
    return {
      idPrefix,
      methodLabel: (m) => this.getMethodLabel(m),
      confidenceHtml: (value, cls, tip) => FormatUtils.confidenceHtml(value, cls, tip)
    };
  }

  /**
   * Get unique method types from matches
   * @param {Array} matches - Array of match objects
   * @returns {Array} Array of unique method type keys (lowercase)
   */
  getUniqueMethodTypes(matches) {
    if (!matches || matches.length === 0) return [];
    const types = [];
    const seen = new Set();
    matches.forEach((match) => {
      const typeKey = (match.type || 'unknown').toLowerCase();
      if (!seen.has(typeKey)) {
        seen.add(typeKey);
        types.push(typeKey);
      }
    });
    return types;
  }

  /**
   * Readable, localized method name ("JavaScript hooks"), shared with the Detection cards
   * @param {string} typeKey - Lowercase method type
   * @returns {string} Label
   */
  getMethodLabel(typeKey) {
    if (typeof DetectionUI !== 'undefined' && typeof DetectionUI.getMethodLabel === 'function') {
      return DetectionUI.getMethodLabel(typeKey);
    }
    return typeKey.replace(/_/g, ' ').toUpperCase();
  }

  /**
   * Render method type badges for modal meta row
   * @param {Array} matches - Array of match objects
   * @returns {string} HTML string
   */
  renderMethodTypeBadges(matches) {
    const typeKeys = this.getUniqueMethodTypes(matches);
    if (!typeKeys.length) return '';

    const typeCounts = new Map();
    matches.forEach((match) => {
      const typeKey = (match.type || 'unknown').toLowerCase();
      typeCounts.set(typeKey, (typeCounts.get(typeKey) || 0) + 1);
    });

    const visibleTypes = typeKeys.slice(0, 4);
    const overflowCount = typeKeys.length - visibleTypes.length;

    const badgesHtml = visibleTypes.map(typeKey => {
      const count = typeCounts.get(typeKey) || 0;
      const label = FormatUtils.escapeHtml(this.getMethodLabel(typeKey) + (count > 1 ? ` (${count})` : ''));

      // Get tag color (use original key for lookup)
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(typeKey) || '#666666';
      }
      const tagRgb = FormatUtils.hexToRgb(tagColor);
      const badgeStyle = tagRgb
        ? `background: rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.18); color: ${tagColor}; border: 1px solid rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.35);`
        : `background: ${tagColor}; color: white;`;

      // Hover: the method, what it checks and the values it matched
      const values = matches
        .filter(match => (match.type || 'unknown').toLowerCase() === typeKey)
        .map(match => ({
          label: String(match.fullUrl || match.value || match.name || match.selector || match.pattern || ''),
          value: `${Math.round(Number(match.confidence) || 0)}%`,
          tone: FormatUtils.confidenceTone(match.confidence)
        }))
        .filter(row => row.label);
      const rows = values.slice(0, 4).map(row => ({ ...row, label: row.label.length > 48 ? `${row.label.slice(0, 47)}…` : row.label }));
      if (values.length > 4) rows.push({ label: FormatUtils.t('tipMoreFmt', '+{0} more', values.length - 4) });
      const title = count === 1 ? FormatUtils.t('historyOneMatch', '1 match') : FormatUtils.t('historyMatchCountFmt', '{0} matches', count);
      const tip = FormatUtils.tipAttrs(`${this.getMethodLabel(typeKey)} · ${title}`, FormatUtils.methodHint(typeKey), rows);

      return `<span class="history-modal-method-type-badge" style="${badgeStyle}" ${tip}>${label}</span>`;
    }).join('');

    const hiddenTypes = typeKeys.slice(visibleTypes.length);
    const overflowHtml = overflowCount > 0
      ? `<span class="history-modal-method-type-badge history-modal-method-type-overflow" ${FormatUtils.tipAttrs(
        FormatUtils.t('tipMoreFmt', '+{0} more', overflowCount),
        '',
        hiddenTypes.map(typeKey => ({ label: this.getMethodLabel(typeKey), value: String(typeCounts.get(typeKey) || 0) })))}>+${overflowCount}</span>`
      : '';

    return badgesHtml + overflowHtml;
  }

  /**
   * Render detection methods for modal
   * @param {Array} matches - Array of match objects
   * @returns {string} HTML string
   */
  renderDetectionMethods(matches) {
    if (!matches || matches.length === 0) {
      const noMethods = FormatUtils.t('historyUiNoDetectionMethods', 'No detection methods');
      return `<div class="history-modal-no-methods">${FormatUtils.escapeHtml(noMethods)}</div>`;
    }
    const unknownValue = FormatUtils.t('detectionUiUnknownValue', 'unknown');
    const clickToCopy = FormatUtils.escapeAttr(FormatUtils.t('advCommonClickToCopy', 'Click to copy'));

    return matches.map(match => {
      const originalType = match.type || 'unknown';
      const methodType = originalType.replace(/_/g, ' ').toUpperCase();
      const methodLabel = FormatUtils.escapeHtml(this.getMethodLabel(originalType.toLowerCase()));
      const confidence = match.confidence || 0;

      // Determine display value based on method type
      let displayValue = '';
      switch (match.type?.toLowerCase()) {
        case 'cookie':
        case 'cookies':
          displayValue = match.value || match.name || unknownValue;
          break;
        case 'header':
        case 'headers':
          displayValue = match.value || match.name || unknownValue;
          break;
        case 'content':
        case 'script':
          displayValue = match.content || match.value || match.pattern || unknownValue;
          break;
        case 'url':
        case 'urls':
          displayValue = match.fullUrl || match.value || match.pattern || unknownValue;
          break;
        case 'dom':
          displayValue = match.value || match.selector || match.pattern || unknownValue;
          break;
        default:
          displayValue = match.value || match.name || match.selector || match.pattern || unknownValue;
      }

      // Get tag color (use originalType to preserve underscores for lookup)
      let tagColor = '#666666';
      if (this.detectorManager?.categoryManager) {
        tagColor = this.detectorManager.categoryManager.getTagColor(originalType.toLowerCase()) || '#666666';
      }
      const tagRgb = FormatUtils.hexToRgb(tagColor);
      const badgeStyle = tagRgb
        ? `background: rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${tagRgb.r}, ${tagRgb.g}, ${tagRgb.b}, 0.3);`
        : `background: ${tagColor}; color: white;`;

      const copyPayload = JSON.stringify({
        rawValue: displayValue,
        methodType,
        confidence
      });

      const safeDisplayValue = FormatUtils.escapeHtml(displayValue);

      return `
        <div class="history-modal-method-item" data-copy-payload="${encodeURIComponent(copyPayload)}" title="${clickToCopy}">
          <span class="history-modal-method-badge" style="${badgeStyle}">${methodLabel}</span>
          <span class="history-modal-method-value">${safeDisplayValue}</span>
          ${FormatUtils.confidenceHtml(confidence, 'history-modal-method-confidence')}
        </div>
      `;
    }).join('');
  }

  /**
   * Setup modal close handlers
   */
  setupModalCloseHandlers() {
    const modal = document.querySelector('#historyDetailModal');
    const closeBtn = document.querySelector('#historyModalClose');
    const overlay = modal?.querySelector('.history-modal-overlay');

    this.releaseModalFocus?.();
    const closeModal = () => {
      this.releaseModalFocus?.();
      this.releaseModalFocus = null;
      if (modal) modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    };

    if (closeBtn) {
      closeBtn.onclick = closeModal;
    }

    const rescanBtn = document.querySelector('#historyModalRescan');
    if (rescanBtn) {
      rescanBtn.onclick = (e) => {
        e.stopPropagation();
        const item = this.historyItems.find(h => h.id === this._modalItemId);
        if (item) this.rescanHistoryItem(item);
      };
    }

    const copyBtn = document.querySelector('#historyModalCopy');
    if (copyBtn) {
      copyBtn.onclick = (e) => {
        e.stopPropagation();
        const item = this.historyItems.find(h => h.id === this._modalItemId);
        if (item) this.copyHistoryItem(item);
      };
    }

    if (overlay) {
      overlay.onclick = (e) => {
        e.stopPropagation();  // Prevent event bubbling to parent elements
        closeModal();
      };
    }

    if (modal) this.releaseModalFocus = ModalFocus.activate(modal, { onClose: closeModal });
    // Note: expand/collapse handlers are set up in attachDetailModalClickHandlers()
  }

  /**
   * Setup per-method copy handlers inside modal
   */
  setupMethodCopyHandlers() {
    const methodItems = document.querySelectorAll('.history-modal-method-item[data-copy-payload]');
    if (!methodItems.length) {
      return;
    }

    methodItems.forEach((item) => {
      const payloadEncoded = item.getAttribute('data-copy-payload');
      if (!payloadEncoded) {
        return;
      }

      let payload = null;
      try {
        payload = JSON.parse(decodeURIComponent(payloadEncoded));
      } catch (error) {
        Logger.warn('UI', 'History: Failed to parse method copy payload', error);
      }

      const handleCopy = (event) => {
        event.stopPropagation();
        const value = payload?.rawValue || '';
        if (!value) {
          return;
        }

        const textToCopy = `[${payload.methodType || 'METHOD'}] ${value}`;
        // Default toast / inline texts of copyToClipboard are already localised
        // Feedback goes on the value field only, so the row keeps its size
        FormatUtils.copyToClipboard(textToCopy, {
          element: item.querySelector('.history-modal-method-value') || item
        });

        item.classList.add('copy-feedback');
        setTimeout(() => item.classList.remove('copy-feedback'), 800);
      };

      item.addEventListener('click', handleCopy);
      const valueNode = item.querySelector('.history-modal-method-value');
      if (valueNode) {
        valueNode.addEventListener('click', handleCopy);
      }
    });
  }

  /**
   * Get domain from URL
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  getDomainFromUrl(url) {
    if (!url) return 'Unknown';
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  /**
   * Get human-readable time ago string
   * @param {Date} date - Date object
   * @returns {string} Time ago string
   */
  getTimeAgo(date) {
    return FormatUtils.getTimeAgo(date.getTime ? date.getTime() : date);
  }

  /**
   * Label of the pin and note entries of the "…" menu for the entry it opens on
   * (Pin / Unpin, Add note / Edit note).
   * @param {HTMLElement} menu - #historyItemMenu
   * @param {object} item - History entry
   */
  syncItemMenu(menu, item) {
    const label = (name, key, fallback) => {
      const el = menu.querySelector(`[data-menu-label="${name}"]`);
      if (el) el.textContent = FormatUtils.t(key, fallback);
    };
    label('pin', item.pinned === true ? 'historyUnpin' : 'historyPin', item.pinned === true ? 'Unpin' : 'Pin');
    label('watch', item.watch === true ? 'historyUnwatch' : 'historyWatch', item.watch === true ? 'Stop watching' : 'Watch for changes');
    label('note', item.note ? 'historyEditNote' : 'historyAddNote', item.note ? 'Edit note' : 'Add note');
    // Compare needs another saved scan of the same page
    const compare = menu.querySelector('[data-action="compare"]');
    if (compare) {
      const none = HistoryCompare.others(this.historyItems, item).length === 0;
      compare.disabled = none;
      compare.title = none ? FormatUtils.t('historyCompareNone', 'No other saved scan of this page to compare with') : '';
    }
  }

  /**
   * Save a pin or a note of one entry in the worker (the only History writer) and show it.
   * @param {object} item - History entry
   * @param {{pinned?: boolean, note?: string}} patch
   */
  async annotateItem(item, patch) {
    const response = await this.sendHistoryChange({ type: HistoryStore.Messages.UPDATE_ITEM, id: item.id, patch });
    // Show it now; a pinned entry's age and the limit no longer apply to it, so the list is read again
    await this.loadHistoryFromStorage();
    this.renderHistory();
    return response;
  }

  /**
   * Watch an entry for changes (the watchlist re-scans it in the background; watching pins it) or stop watching it.
   * @param {object} item - History entry
   */
  async toggleWatch(item) {
    const watch = item.watch !== true;
    try {
      const response = await this.annotateItem(item, { watch });
      if (watch && response.updated === 0 && response.limit) {
        NotificationHelper.error(FormatUtils.t('historyWatchLimitFmt', 'You can watch up to {0} pages. Stop watching one first.', response.limit));
        return;
      }
      if (!watch) {
        NotificationHelper.success(FormatUtils.t('historyWatchStoppedNotice', 'No longer watching this page'));
        return;
      }
      const settings = await Utils.getHistorySettings();
      NotificationHelper.success(HistoryPolicy.watchModeOf(settings) === 'off'
        ? FormatUtils.t('historyWatchStartedOffNotice', 'Watching this page. Turn on Watch pinned pages in Settings → History for it to be checked.')
        : FormatUtils.t('historyWatchStartedNotice', 'Watching this page'));
    } catch (error) {
      Logger.warn('UI', '[History] Watch failed', error);
      NotificationHelper.error(error.message);
    }
  }

  /**
   * Pin an entry (kept when History is cleaned up) or unpin it.
   * @param {object} item - History entry
   */
  async togglePin(item) {
    const pin = item.pinned !== true;
    try {
      await this.annotateItem(item, { pinned: pin });
      NotificationHelper.success(FormatUtils.t(pin ? 'historyPinnedNotice' : 'historyUnpinnedNotice', pin ? 'Pinned' : 'Unpinned'));
    } catch (error) {
      Logger.warn('UI', '[History] Pin failed', error);
      NotificationHelper.error(error.message);
    }
  }

  /**
   * Ask for a short note on an entry and save it (an empty note removes it).
   * @param {object} item - History entry
   */
  async editNote(item) {
    const input = document.createElement('textarea');
    input.className = 'textarea-field history-dialog-input history-note-input';
    input.rows = 3;
    input.maxLength = 300;
    input.value = item.note || '';
    input.placeholder = FormatUtils.t('historyNotePlaceholder', 'A note for this page…');
    input.setAttribute('aria-label', FormatUtils.t('historyNoteTitle', 'Note'));
    const wrap = document.createElement('div');
    wrap.className = 'history-dialog-form';
    wrap.appendChild(input);

    const confirmed = await NotificationHelper.form({
      title: FormatUtils.t('historyNoteTitle', 'Note'),
      confirmText: FormatUtils.t('btnSave', 'Save'),
      cancelText: FormatUtils.t('btnCancel', 'Cancel'),
      content: wrap,
      focus: input
    });
    if (!confirmed) return;
    try {
      await this.annotateItem(item, { note: input.value });
      NotificationHelper.success(FormatUtils.t('historyNoteSaved', 'Note saved'));
    } catch (error) {
      Logger.warn('UI', '[History] Note failed', error);
      NotificationHelper.error(error.message);
    }
  }

  /**
   * Export History: ask for the format and what to include, then download one file.
   * The format and timestamps start from Settings → History; JSON always keeps every field.
   */
  async exportHistory() {
    const saved = await Utils.getHistorySettings().catch(() => ({}));
    const field = (labelKey, labelFallback, control) => {
      const row = document.createElement('label');
      row.className = 'history-dialog-field';
      const text = document.createElement('span');
      text.className = 'history-dialog-label';
      text.textContent = FormatUtils.t(labelKey, labelFallback);
      row.append(text, control);
      return row;
    };
    const select = (options, value) => {
      const el = document.createElement('select');
      el.className = 'select-field history-dialog-input';
      for (const [optionValue, text] of options) {
        const option = document.createElement('option');
        option.value = String(optionValue);
        option.textContent = text;
        el.appendChild(option);
      }
      el.value = String(value);
      return el;
    };
    const check = (labelKey, labelFallback, checked) => {
      const row = document.createElement('label');
      row.className = 'history-dialog-check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = checked;
      const text = document.createElement('span');
      text.textContent = FormatUtils.t(labelKey, labelFallback);
      row.append(box, text);
      return { row, box };
    };

    const format = select(HistoryExport.FORMATS.map(f => [f, f === 'txt' ? 'TXT' : f === 'md' ? 'Markdown' : f.toUpperCase()]), HistoryExport.FORMATS.includes(saved.exportFormat) ? saved.exportFormat : 'json');
    const category = select([
      ['all', FormatUtils.t('historyExportAll', 'All')],
      ['antibot', FormatUtils.t('categoryAntibot', 'Anti-bot')],
      ['captcha', FormatUtils.t('categoryCaptcha', 'CAPTCHA')],
      ['fingerprint', FormatUtils.t('categoryFingerprint', 'Fingerprint')]
    ], 'all');
    const period = select([
      [0, FormatUtils.t('historyRangeAll', 'All time')],
      [7, FormatUtils.t('historyRange7', 'Last 7 days')],
      [30, FormatUtils.t('historyRange30', 'Last 30 days')],
      [90, FormatUtils.t('historyRange90', 'Last 90 days')]
    ], 0);
    const domain = document.createElement('input');
    domain.type = 'text';
    domain.className = 'input-field history-dialog-input';
    domain.placeholder = FormatUtils.t('historyExportDomainPlaceholder', 'example.com');
    domain.setAttribute('dir', 'ltr');
    domain.autocomplete = 'off';
    const pinned = check('historyExportPinnedOnly', 'Pinned pages only', false);
    const changed = check('historyExportChangedOnly', 'Changed pages only', false);
    const count = document.createElement('div');
    count.className = 'history-dialog-count';
    count.setAttribute('role', 'status');

    const filters = () => ({ category: category.value, days: parseInt(period.value, 10), domain: domain.value, pinnedOnly: pinned.box.checked, changedOnly: changed.box.checked });
    const matching = () => HistoryExport.filter(this.historyItems, filters());
    const refresh = () => {
      const n = matching().length;
      count.textContent = n
        ? FormatUtils.t('historyExportCountFmt', '{0} of {1} entries will be exported', n, this.historyItems.length)
        : FormatUtils.t('historyExportNone', 'No entries match these filters');
      count.classList.toggle('is-empty', n === 0);
    };
    [category, period, domain, pinned.box, changed.box].forEach(el => el.addEventListener(el === domain ? 'input' : 'change', refresh));
    refresh();

    const form = document.createElement('div');
    form.className = 'history-dialog-form';
    form.append(
      field('historyExportFormat', 'Format', format),
      field('historyExportCategory', 'Protections', category),
      field('historyExportPeriod', 'Period', period),
      field('historyExportDomain', 'Site contains', domain),
      pinned.row,
      changed.row,
      count
    );

    const confirmed = await NotificationHelper.form({
      title: FormatUtils.t('historyExportDialogTitle', 'Export history'),
      confirmText: FormatUtils.t('btnExport', 'Export'),
      cancelText: FormatUtils.t('btnCancel', 'Cancel'),
      content: form,
      focus: format
    });
    if (!confirmed) return;

    const items = matching();
    if (!items.length) {
      NotificationHelper.error(FormatUtils.t('historyExportNone', 'No entries match these filters'));
      return;
    }
    const built = HistoryExport.build(items, { format: format.value, includeTimestamps: saved.includeTimestamps !== false });
    const blob = new Blob([built.text], { type: built.type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = HistoryExport.fileName(built.format);
    a.click();

    URL.revokeObjectURL(url);
    NotificationHelper.success(items.length === 1
      ? FormatUtils.t('notificationHistoryExportedOne', 'Exported 1 history item')
      : FormatUtils.t('notificationHistoryExportedFmt', `Exported ${items.length} history items`, items.length));
  }

  /**
   * Handle import of history from file
   * @param {Event} event - File change event
   */
  async handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const t = (typeof I18n !== 'undefined') ? I18n : null;
    const _tr = (key, fallback) => (t && t.get(key)) || fallback;
    const _fmt = (key, fallback, ...args) => (t && t.format(key, ...args)) || fallback;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error(FormatUtils.t('historyUiInvalidFileFormat', 'Invalid history file format'));
      }

      const mode = await NotificationHelper.chooseImportMode({
        title: _tr('importHistoryTitle', 'Import History'),
        message: _fmt('importHistoryModeMessageFmt', `Import ${data.items.length} history items? Your current history has ${this.historyItems.length}.<br>Merge adds the new items to it. Replace deletes it first.`, data.items.length, this.historyItems.length),
        replaceText: _tr('replaceOption', 'Replace')
      });

      // Cancel, ✕, Escape and the backdrop: leave the stored history alone
      if (mode === 'cancel') {
        event.target.value = '';
        return;
      }

      // Preview locally (same rule the worker applies), then let the worker
      // apply it to the stored list so entries saved meanwhile are kept.
      // The preview stays local: a save that fails leaves the list, its search and its filters as they were.
      // After a save, the list is the stored one (loadHistoryFromStorage).
      const before = this.historyItems.length;
      const preview = HistoryStore.applyImport(this.historyItems, data.items, mode, this.historyLimit);
      const added = Math.max(0, preview.length - before);
      await this.saveHistoryToStorage(data.items, mode);

      if (mode === 'merge') {
        NotificationHelper.success(added === 1
          ? _tr('notificationHistoryMergedOne', 'Merged 1 new history item')
          : _fmt('notificationHistoryMergedFmt', `Merged ${added} new history items`, added));
      } else {
        NotificationHelper.success(preview.length === 1
          ? _tr('notificationHistoryReplacedOne', 'Replaced history with 1 item')
          : _fmt('notificationHistoryReplacedFmt', `Replaced history with ${preview.length} items`, preview.length));
      }
      this.renderHistory();
    } catch (error) {
      NotificationHelper.error(_fmt('notificationImportHistoryFailedFmt', 'Failed to import history: ' + error.message, error.message));
    }

    event.target.value = '';
  }

  /**
   * Initialize history section with event listeners
   */
  async initialize() {
    if (!this.initialized) {
      try {
        await this.refreshHistoryLimit();
      } catch (error) {
        Logger.warn('UI', '[History] History limit read failed, defaulting to unlimited', error);
        this.historyLimit = 0; // 0 = unlimited
      }

      await this.refreshDetectionSort();
      await this.loadHTML();
      this.setupPagination();
      this.setupEventListeners();
      this.registerSettingsListener();
      this.initialized = true;
    }
  }

  async refreshHistoryLimit() {
    try {
      const settings = await Utils.getHistorySettings();
      const parsedLimit = parseInt(settings.historyLimit, 10);
      const newLimit = Number.isFinite(parsedLimit) && parsedLimit >= 0 ? parsedLimit : 0; // 0 = unlimited

      if (newLimit !== this.historyLimit) {
        Logger.debug('UI', `History: Updating history limit from ${this.historyLimit} to ${newLimit}`);
        this.historyLimit = newLimit;
      }
    } catch (error) {
      Logger.warn('UI', '[History] Limit refresh failed, keeping current value', error);
    }
  }

  /** Settings → Detection → Show first, for the cards and the detail dialog */
  async refreshDetectionSort() {
    try {
      const settings = await Utils.getSettings();
      this.detectionSort = DetectionUtils.detectionSortOf(settings.detection);
      this.scanMode = ScanScope.modeOf(settings.detection);
    } catch (error) {
      this.detectionSort = DetectionUtils.detectionSortOf();
    }
    this.syncScanModeMenu();
  }

  registerSettingsListener() {
    if (this._settingsListenerAttached) return;
    this._settingsListenerAttached = true;
    // Settings is in this popup: its own SETTINGS_UPDATED message never comes
    // back here, so a new order is picked up from storage
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes.scrapfly_settings) return;
      const before = JSON.stringify(this.detectionSort || null);
      this.refreshDetectionSort()
        .then(() => { if (JSON.stringify(this.detectionSort) !== before) this.renderHistory(); })
        .catch(error => Logger.warn('UI', '[History] Re-sort after settings change failed', error));
    });
    chrome.runtime.onMessage.addListener((message) => {
      if (!message || message.type !== WorkerMessages.SETTINGS_UPDATED) {
        return;
      }

      this.refreshHistoryLimit()
        .then(() => this.refreshDetectionSort())
        .then(() => this.loadHistoryFromStorage())
        .then(() => this.renderHistory())
        .catch(error => {
          Logger.warn('UI', '[History] Refresh after settings update failed', error);
        });
    });
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('historyPagination', {
      itemsPerPage: 20,
      onPageChange: (page, items) => {
        this.renderHistoryPage(items);
      }
    });
  }

  /**
   * Load HTML template into history tab
   */
  /** The entry menu offers "Add to Blacklist" or "Scan this site", whichever list Settings → Detection → Sites to scan reads. */
  syncScanModeMenu() {
    const mode = this.scanMode || 'blocklist';
    for (const element of document.querySelectorAll('#historyItemMenu [data-scan-mode-show]')) element.hidden = element.dataset.scanModeShow !== mode;
  }

  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/history/history.html'));
      const html = await response.text();

      const historyTab = document.querySelector('#historyTab');
      if (historyTab) {
        historyTab.innerHTML = html;
        this.syncScanModeMenu();
      }
    } catch (error) {
      Logger.error('UI', '[History] HTML load failed', error);
    }
  }

  /**
   * Setup event listeners after HTML is loaded
   */
  setupEventListeners() {
    // Guard against duplicate listener attachment
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    // Setup search functionality
    const searchInput = document.querySelector('#historySearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Filter chips, and the "Clear filters" button of the no-matches message
    const filterRow = document.querySelector('#historyFilters');
    if (filterRow) {
      filterRow.addEventListener('click', (e) => {
        const chip = e.target.closest('.history-filter-chip');
        if (chip) this.toggleFilterChip(chip.dataset.filter);
      });
    }
    const clearFiltersBtn = document.querySelector('#historyClearFilters');
    if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', () => this.clearFilters());

    // Select entries: the toolbar item and the bar (history-select.js)
    if (typeof this.setupSelectListeners === 'function') this.setupSelectListeners();

    // Toolbar "…" menu (import / export / clear)
    const menuBtn = document.querySelector('#historyMenuBtn');
    const toolbarMenu = document.querySelector('#historyMenu');
    if (menuBtn && toolbarMenu) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this._openMenu && this._openMenu.menu === toolbarMenu) {
          this.closeMenus();
        } else {
          this.openMenu(toolbarMenu, menuBtn);
        }
      });
      // Each toolbar action closes the menu before running its own handler below
      toolbarMenu.addEventListener('click', () => this.closeMenus());
    }

    // Per-entry "…" menu: dispatch to the entry it was opened from
    const itemMenu = document.querySelector('#historyItemMenu');
    if (itemMenu) {
      itemMenu.addEventListener('click', (e) => {
        const btn = e.target.closest('.history-menu-item');
        if (!btn) return;
        const item = this.historyItems.find(h => h.id === this._menuItemId);
        const action = btn.dataset.action;
        this.closeMenus();
        if (!item) return;

        if (action === 'open') {
          this.openHistoryItem(item);
        } else if (action === 'rescan') {
          this.rescanHistoryItem(item);
        } else if (action === 'compare') {
          this.compareHistoryItem(item);
        } else if (action === 'copy') {
          this.copyHistoryItem(item);
        } else if (action === 'pin') {
          this.togglePin(item);
        } else if (action === 'watch') {
          this.toggleWatch(item);
        } else if (action === 'note') {
          this.editNote(item);
        } else if (action === 'clear-cache') {
          this.clearHistoryItemCache(item);
        } else if (action === 'export') {
          this.exportHistoryItem(item);
        } else if (action === 'blacklist') {
          this.addHistoryItemToBlacklist(item);
        } else if (action === 'delete') {
          this.deleteHistoryItem(item);
        }
      });
    }

    // Close an open menu on outside click, Escape, or list scroll
    document.addEventListener('click', (e) => {
      if (this._openMenu && !this._openMenu.menu.contains(e.target)) this.closeMenus();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenus();
    });
    const historyList = document.querySelector('#historyList');
    if (historyList) {
      historyList.addEventListener('scroll', () => this.closeMenus(), { passive: true });
    }

    // Setup clear history button
    const clearBtn = document.querySelector('#historyTab #clearHistoryBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const t = (typeof I18n !== 'undefined') ? I18n : null;
        const _tr = (key, fallback) => (t && t.get(key)) || fallback;
        const confirmed = await NotificationHelper.confirm({
          title: _tr('dialogClearHistoryTitle', 'Clear History'),
          message: _tr('dialogClearHistoryMessage', 'Are you sure you want to clear all history? This action cannot be undone.'),
          type: 'danger',
          confirmText: _tr('buttonClearAll', 'Clear All'),
          cancelText: _tr('btnCancel', 'Cancel'),
          emphasizeAction: true
        });

        if (confirmed) {
          this.clearHistory();
        }
      });
    }

    // Bulk scan: its own page in a tab (sections/bulk/), where a list of pages is scanned in a background tab
    const bulkBtn = document.querySelector('#historyTab #bulkScanBtn');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', () => this.openBulkScan());
    }

    // Setup export button
    const exportBtn = document.querySelector('#historyTab #exportHistoryBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportHistory());
    }

    // Setup import button and file input
    const importBtn = document.querySelector('#historyTab #importHistoryBtn');
    const importFile = document.querySelector('#historyTab #importHistoryFile');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => importFile.click());
      importFile.addEventListener('change', (e) => this.handleImport(e));
    }
  }

  /** Open the Bulk scan page in a new tab (an open one is focused instead of opening a second). */
  async openBulkScan() {
    const url = chrome.runtime.getURL('sections/bulk/bulk.html');
    try {
      const [open] = await chrome.tabs.query({ url });
      if (open) {
        await chrome.tabs.update(open.id, { active: true });
        if (open.windowId !== undefined && chrome.windows && chrome.windows.update) await chrome.windows.update(open.windowId, { focused: true });
      } else {
        await chrome.tabs.create({ url });
      }
    } catch (error) {
      Logger.error('UI', 'Failed to open Bulk scan:', error);
      window.open(url, '_blank', 'noopener');
    }
  }

  /**
   * Open a "…" dropdown under its anchor button. Menus are fixed-positioned so the
   * scrolling list never clips them, and flip above the anchor near the popup bottom.
   * @param {HTMLElement} menu - .history-menu element
   * @param {HTMLElement} anchor - Button that opened it
   */
  openMenu(menu, anchor) {
    this.closeMenus();
    menu.hidden = false;
    const anchorRect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let top = anchorRect.bottom + 4;
    if (top + menuRect.height > viewportHeight - 4) {
      top = Math.max(4, anchorRect.top - 4 - menuRect.height);
    }
    const left = Math.min(Math.max(4, anchorRect.right - menuRect.width), viewportWidth - menuRect.width - 4);

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    anchor.setAttribute('aria-expanded', 'true');
    anchor.classList.add('active');
    this._openMenu = { menu, anchor };
  }

  /**
   * Close whichever "…" menu is open
   */
  closeMenus() {
    if (!this._openMenu) return;
    const { menu, anchor } = this._openMenu;
    menu.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    anchor.classList.remove('active');
    this._openMenu = null;
  }


}

if (typeof window !== 'undefined') {
  window.History = History;
}
