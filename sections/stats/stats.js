/**
 * Local history dashboard. This file loads History and the settings, applies the category scope, aggregates once per
 * range and scope, and drives the shell (tabs, filter row, export menu). The tabs themselves are the stats-*.js views.
 */
(function() {
  'use strict';
  const U = StatsUI;
  const { byId, tr, fmt, num, share, element } = U;
  const V = StatsViews;
  const SECTIONS = ['overview', 'protections', 'domains', 'evidence', 'activity', 'rules', 'tools'];
  const SUBS = ['confidence', 'signals', 'combinations'];
  const RANGE_KEY = 'scrapfly_stats_range';
  const SECTION_KEY = 'scrapfly_stats_section';
  const SUB_KEY = 'scrapfly_stats_sub';
  const SCOPE_KEY = 'scrapfly_stats_scope';
  /** Rows shown before "Show more", per list. Rule lists can hold most of the library, so they page shorter. */
  const PAGE = { protection: 50, domain: 50, signal: 50, combination: 50, unused: 15, missing: 15, change: 20, capture: 50 };
  /** The Rules and Tools tabs ignore the category scope. */
  const INERT_SECTIONS = ['rules', 'tools'];
  /** Tabs that compare with the previous period. */
  const COMPARE_SECTIONS = ['overview', 'protections', 'domains'];
  const CHIP_ORDER = Categories.KEYS_AND_OTHER;
  const WATCHED = ['scrapfly_history', 'scrapfly_settings', 'scrapfly_detectors', 'scrapfly_advanced_history', 'scrapfly_incompatible_updates', 'scrapfly_remote_official_ids'];
  const RELOAD_DELAY = 400;
  const SMALL_HISTORY = 10;
  /** A width change below this many pixels (a scrollbar appearing, say) does not redraw the charts. */
  const RESIZE_STEP = 8;

  const state = { items: [], scope: new Set(HistoryStats.DEFAULT_SCOPE), scoped: [], days: 30, section: 'overview', sub: 'confidence',
    now: 0, exporting: false, loadVersion: 0, historyVersion: 0, d: null, cache: { key: '', stats: null },
    rules: [], captures: [], incompatible: [], officialIds: new Set(), bundledOfficialIds: [], descriptions: new Map(),
    limits: { ...PAGE }, protectionSort: 'pages', domain: { query: '', protection: '', sort: 'hardest', difficulty: new Set(), captcha: false, changed: false } };
  const app = { state, PAGE, go: section => selectSection(section), openDomain, openProtection, openHistory, isOfficialRule,
    get d() { return state.d; } };

  function isOfficialRule(detector) {
    if (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.isOfficialDetector === 'function') return DetectionUtils.isOfficialDetector(detector, state.officialIds);
    return RuleStats.defaultIsOfficial(state.officialIds)(detector);
  }
  const persist = (key, value) => StorageManager.saveToStorage(key, value, { wrapMetadata: false });
  function status(message, error = false) {
    U.setText('statsStatus', message);
    byId('statsStatus').hidden = !message;
    byId('statsStatus').classList.toggle('stats-status--error', error);
  }
  const resetLimits = () => { state.limits = { ...PAGE }; };

  /* ---------- Loading and the pipeline ---------- */
  function validScope(raw) {
    if (!Array.isArray(raw) || !raw.length || !raw.every(key => HistoryStats.SCOPE_KEYS.includes(key))) return null;
    return new Set(raw);
  }
  /** A section saved by the five-tab layout opens the matching Evidence view. */
  function restoreSection(value) {
    if (SUBS.includes(value)) { state.section = 'evidence'; state.sub = value; }
    else if (SECTIONS.includes(value)) state.section = value;
  }
  /** Settings colours become the --cat-* tokens; the page derives its inks from them. */
  function applyColors(raw) {
    const body = document.body;
    if (!body || !body.style || typeof body.style.setProperty !== 'function') return;
    const colors = StorageManager.normalizeSettings(raw).categoryColors || {};
    HistoryStats.SCOPE_KEYS.forEach(key => {
      if (/^#[0-9a-f]{6}$/i.test(colors[key])) body.style.setProperty('--cat-' + key, colors[key]);
      else body.style.removeProperty('--cat-' + key);
    });
  }
  /** The scope strips detections, never entries; done on load and on a chip, never on a range or resize. */
  const applyScope = () => { state.scoped = HistoryStats.scopeItems(state.items, state.scope); };

  async function loadData(preferences = false) {
    const version = ++state.loadVersion;
    const stored = await StorageManager.readRaw(['scrapfly_history', 'scrapfly_settings', RANGE_KEY, SECTION_KEY, SUB_KEY, SCOPE_KEY,
      'scrapfly_detectors', 'scrapfly_advanced_history', 'scrapfly_incompatible_updates', 'scrapfly_remote_official_ids']);
    if (version !== state.loadVersion) return;
    state.items = HistoryStats.parseStoredHistory(stored.scrapfly_history);
    state.historyVersion++;
    if (typeof RuleStats !== 'undefined') {
      state.rules = RuleStats.parseDetectors(stored.scrapfly_detectors);
      if (typeof RuleI18n !== 'undefined') RuleI18n.indexRules(state.rules);
      state.descriptions = RuleStats.descriptions(state.rules);
      // A protection's own logo, by its name: the stored rules carry the icon, history does not
      const icons = {};
      for (const rule of state.rules) {
        const icon = rule.detector && typeof rule.detector.icon === 'string' ? rule.detector.icon.trim() : '';
        if (icon && /\.(png|jpe?g|svg)$/i.test(icon) && rule.name) { const key = rule.name.toLowerCase(); if (!icons[key]) icons[key] = icon; }
      }
      state.iconByName = icons;
      if (typeof U !== 'undefined' && U.setBrandIcons) U.setBrandIcons(icons);
    }
    state.captures = typeof ToolsStats !== 'undefined' ? ToolsStats.parse(stored.scrapfly_advanced_history) : [];
    state.captureRetention = CaptureRetention.minutesOf(StorageManager.normalizeSettings(stored.scrapfly_settings).detection?.captureRetentionMinutes);
    state.incompatible = Array.isArray(stored.scrapfly_incompatible_updates) ? stored.scrapfly_incompatible_updates : [];
    const remote = Array.isArray(stored.scrapfly_remote_official_ids) ? stored.scrapfly_remote_official_ids : [];
    state.officialIds = new Set([...state.bundledOfficialIds, ...remote].filter(id => typeof id === 'string'));
    if (preferences) {
      if ([0, 7, 30, 90].includes(stored[RANGE_KEY])) state.days = stored[RANGE_KEY];
      if (SUBS.includes(stored[SUB_KEY])) state.sub = stored[SUB_KEY];
      restoreSection(stored[SECTION_KEY]);
      state.scope = validScope(stored[SCOPE_KEY]) || new Set(HistoryStats.DEFAULT_SCOPE);
    }
    applyColors(stored.scrapfly_settings);
    applyScope();
    render();
  }

  /** Everything the tabs read for the current range and scope. Light passes run every time; compute() is memoised. */
  function derive() {
    const now = Date.now(), days = state.days;
    const selectedAll = HistoryStats.filterByRange(state.items, days, now);
    const selected = state.scoped === state.items ? selectedAll : HistoryStats.filterByRange(state.scoped, days, now);
    const key = [state.historyVersion, days, [...state.scope].sort().join(','), Math.floor(now / 60000)].join('|');
    if (state.cache.key !== key) {
      state.cache = { key, stats: HistoryStats.compute(selected, { now, days: HistoryStats.timelineDays(selected, days, now, 365), top: 8 }) };
    }
    const stats = state.cache.stats;
    const since = HistoryStats.rangeStart(days, now);
    const firstSeen = HistoryStats.firstSeen(state.scoped, since === null ? 0 : since, now);
    // A protection first seen in the range is new only when History reaches back past the range, or came after the first saved page
    const newProtections = firstSeen.protections.filter(row => firstSeen.baselineComplete || (firstSeen.oldestTs !== null && row.ts > firstSeen.oldestTs));
    const prevWindow = HistoryStats.previousWindow(state.scoped, days, now);
    let compare = null;
    if (prevWindow && prevWindow.usable) {
      const prevIndex = HistoryStats.protectionIndex(prevWindow.items), curIndex = HistoryStats.protectionIndex(selected);
      compare = { usable: true, prev: HistoryStats.summary(prevWindow.items), prevIndex, curIndex,
        movers: HistoryStats.movers(curIndex, prevIndex, { exclude: new Set(firstSeen.protections.map(row => Categories.protectionKey(row.name))) }) };
    }
    const counts = HistoryStats.categoryCounts(selectedAll);
    let clipped = false;
    if (!days && stats.timeline.length) {
      const earliest = U.dayDate(stats.timeline[0].date).setHours(0, 0, 0, 0);
      clipped = selected.some(item => { const ts = HistoryStats.getTimestamp(item); return ts !== null && ts < earliest; });
    }
    return { now, days, since, ranged: days > 0, selectedAll, selected, counts, stats, summary: HistoryStats.summary(selected), firstSeen, newProtections,
      prevWindow, compare, changes: HistoryStats.protectionChanges(state.scoped, { since, now }), clipped,
      fingerprint: !state.scope.has('fingerprint') && counts.fingerprint > 0 ? HistoryStats.categoryProfile(selectedAll, 'fingerprint') : null };
  }

  /* ---------- Shell ---------- */
  let loaded = false;
  function finishLoading() {
    if (loaded) return;
    loaded = true;
    byId('statsSkeleton').hidden = true;
    byId('statsMain').removeAttribute('aria-busy');
  }
  function updateExportButtons() {
    const none = state.exporting || !state.d || !state.d.stats.totals.entries;
    document.querySelectorAll('[data-export]').forEach(button => { button.disabled = none; });
  }
  function render() {
    U.hideTooltip();
    const d = state.d = derive();
    state.now = d.now;
    const has = d.selectedAll.length > 0;
    byId('statsContent').hidden = !has;
    byId('statsEmpty').hidden = has;
    byId('statsBar').classList.toggle('is-empty', !has);
    byId('statsFilters').hidden = false;
    U.setText('statsEmptyTitle', state.items.length ? tr('statsRangeEmptyTitle', 'No entries in this range') : tr('statsEmptyTitle', 'No history yet'));
    U.setText('statsEmptyDesc', state.items.length ? tr('statsRangeEmptyDesc', 'Choose a longer date range to explore your saved history.') : tr('statsEmptyDesc', 'Statistics appear here once pages with detections are saved to the history.'));
    // Only an empty range has a way out: there is history, just not here
    byId('statsEmptyAll').hidden = has || !state.items.length || !state.days;
    U.setText('statsExportScope', fmt('statsExportScopeFmt', 'Export the selected range: {0} entries', num(d.selectedAll.length)));
    document.querySelectorAll('[data-days]').forEach(button => {
      const active = Number(button.dataset.days) === state.days;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    byId('stats-tab-tools').hidden = !state.captures.length;
    if (state.section === 'tools' && !state.captures.length) state.section = 'overview';
    updateExportButtons();
    finishLoading();
    showSection(state.section);
    renderFilters();
    renderActive();
    syncToolsTimer();
  }
  function renderActive() {
    if (!state.d || byId('statsContent').hidden) return;
    V[state.section].render(app);
    const width = byId('statsContent').getBoundingClientRect().width;
    if (Number.isFinite(width)) lastWidth = width;
  }

  /** Tab strip fades: only on the side that still has tabs to scroll to (scrollLeft is negative in right-to-left). */
  function updateNavFades() {
    const wrap = byId('statsNavWrap'), nav = byId('statsNav');
    const max = nav.scrollWidth - nav.clientWidth, pos = Math.abs(nav.scrollLeft || 0);
    wrap.classList.toggle('can-scroll-start', max > 1 && pos > 1);
    wrap.classList.toggle('can-scroll-end', max > 1 && pos < max - 1);
  }
  function showSub() {
    document.querySelectorAll('[data-sub]').forEach(button => {
      const active = button.dataset.sub === state.sub;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    SUBS.forEach(key => { byId('stats-sub-' + key).hidden = key !== state.sub; });
  }
  function showSection(section) {
    document.querySelectorAll('[data-section]').forEach(button => {
      const active = button.dataset.section === section;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    SECTIONS.forEach(key => { byId('stats-panel-' + key).hidden = key !== section; });
    showSub();
    revealTab(byId('stats-tab-' + section));
    updateNavFades();
  }
  /** Scrolls the tab strip (never the page) so the active tab sits in the middle, whatever the writing direction. */
  function revealTab(tab) {
    const nav = byId('statsNav');
    if (!Number.isFinite(nav.scrollLeft) || typeof tab.getBoundingClientRect !== 'function') return;
    const a = tab.getBoundingClientRect(), b = nav.getBoundingClientRect();
    nav.scrollLeft += (a.left + a.width / 2) - (b.left + b.width / 2);
  }
  function selectSection(section, save = true) {
    if (!SECTIONS.includes(section)) return;
    // Tools is only offered when Advanced has saved something
    if (section === 'tools' && !state.captures.length) section = 'overview';
    state.section = section;
    U.hideTooltip();
    if (state.keepOneShown) { status(''); state.keepOneShown = false; } // the "keep one category" note belongs to the moment it was shown
    showSection(section);
    if (state.d) { renderFilters(); renderActive(); }
    if (save) persist(SECTION_KEY, section);
    syncToolsTimer();
  }
  function selectSub(sub, save = true) {
    if (!SUBS.includes(sub)) return;
    state.sub = sub;
    U.hideTooltip();
    showSub();
    if (state.d && state.section === 'evidence') renderActive();
    if (save) persist(SUB_KEY, sub);
  }
  /** The Domains list searched for a site or a protection (the search also reads each domain's protections). */
  function showDomains(query, protection = '') {
    state.domain.query = query;
    state.domain.protection = protection; // set: only the domains with exactly this protection, not every text match
    state.domain.difficulty.clear(); state.domain.captcha = false; state.domain.changed = false; // a stale chip must not hide what was clicked
    byId('statsDomainSearch').value = query;
    state.limits.domain = PAGE.domain;
    selectSection('domains');
  }
  function openDomain(hostname) { showDomains(hostname); }
  /** A protection of the Protections table: the domains that have it. */
  function openProtection(name) { showDomains(name, name); }
  /** A site's History: the popup page in a tab, on its History tab, searched for the host (popup.js routeFrom). */
  function openHistory(hostname) {
    const url = chrome.runtime.getURL('popup.html?tab=history&search=' + encodeURIComponent(String(hostname || '').slice(0, 200)));
    try {
      return Promise.resolve(chrome.tabs.create({ url, active: true })).catch(() => {});
    } catch (_) {
      return Promise.resolve();
    }
  }

  /* ---------- Filter row ---------- */
  const visibleKey = key => key !== 'other' || !state.d || state.d.counts.other > 0;
  function scopeNames(inert) {
    return CHIP_ORDER.filter(key => visibleKey(key) && (inert || state.scope.has(key))).map(U.categoryLabel);
  }
  function renderFilters() {
    const d = state.d;
    if (!d) return;
    const section = state.section, inert = INERT_SECTIONS.includes(section);
    // Tools ignores the scope and the range alike: there is nothing here to filter
    byId('statsFilters').classList.toggle('is-empty', !d.selectedAll.length || section === 'tools');
    const scope = byId('statsScope');
    scope.classList.toggle('is-inert', inert);
    if (inert) scope.setAttribute('aria-disabled', 'true'); else scope.removeAttribute('aria-disabled');
    const names = { antibot: 'scopeCountAntibot', captcha: 'scopeCountCaptcha', fingerprint: 'scopeCountFingerprint', other: 'scopeCountOther' };
    document.querySelectorAll('[data-category]').forEach(chip => {
      const key = chip.dataset.category;
      chip.setAttribute('aria-pressed', String(state.scope.has(key)));
      chip.tabIndex = inert ? -1 : 0;
      chip.hidden = !visibleKey(key);
      U.setText(names[key], num(d.counts[key]));
    });
    const hidden = !state.scope.has('fingerprint') && d.counts.fingerprint > 0;
    byId('statsScopeNote').hidden = !inert && !hidden;
    U.setText('statsScopeNoteText', inert ? tr('statsScopeRulesNote', 'Rules always use every category.')
      : fmt('statsScopeHiddenFmt', 'Fingerprinting detections hidden: {0} ({1} of all)', num(d.counts.fingerprint), share(d.counts.total ? d.counts.fingerprint / d.counts.total : 0)));
    byId('statsScopeShow').hidden = inert || !hidden;
    const t = d.stats.totals, oldest = d.firstSeen.oldestTs;
    const range = d.days ? U.rangeText(d.since, d.now)
      : oldest !== null ? fmt('statsRangeSinceFmt', 'All history since {0}', U.dateText(oldest)) : tr('statsRangeAll', 'All');
    U.setText('statsContext', section === 'tools' ? '' : fmt('statsContextFmt', 'Pages: {0} · Domains: {1} · {2} · {3}', num(t.entries), num(t.uniqueDomains), range, U.list(scopeNames(inert))));
    let compare = '';
    if (COMPARE_SECTIONS.includes(section)) {
      const prev = d.prevWindow;
      if (!d.days) compare = tr('statsCompareNone', 'Choose 7, 30 or 90 days to compare with the previous period.');
      else if (prev && prev.usable) compare = fmt('statsCompareCaptionFmt', 'Compared with the previous period ({0})', U.rangeText(prev.start, prev.end));
      else if (prev && prev.oldest !== null) compare = fmt('statsCompareIncompleteFmt', 'History starts on {0}, so there is no full previous period to compare.', U.dateText(prev.oldest));
    }
    U.setText('statsCompare', compare);
    const low = section !== 'tools' && d.selectedAll.length > 0 && d.selectedAll.length < SMALL_HISTORY;
    byId('statsLowData').hidden = !low;
    if (low) U.setText('statsLowData', fmt('statsLowDataFmt', 'Few pages in this range ({0}): comparisons and rankings may mislead.', num(d.selectedAll.length)));
  }
  /** One code path for the chips and every "Show fingerprinting" button; force turns a category on or off. */
  function toggleScope(key, force) {
    if (!state.d || !HistoryStats.SCOPE_KEYS.includes(key) || INERT_SECTIONS.includes(state.section)) return;
    const on = force === undefined ? !state.scope.has(key) : force;
    if (on === state.scope.has(key)) return;
    const next = new Set(state.scope);
    if (on) next.add(key); else next.delete(key);
    if (![...next].some(visibleKey)) { status(tr('statsScopeKeepOne', 'At least one category stays selected.')); state.keepOneShown = true; return; }
    status('');
    state.keepOneShown = false;
    state.scope = next;
    persist(SCOPE_KEY, [...next]);
    applyScope();
    resetLimits();
    render();
    // The control that was pressed may be gone now (the "Show fingerprinting" link hides): keep the keyboard on the filter
    const active = document.activeElement, chip = document.querySelector('[data-category="' + key + '"]');
    if (chip && (!active || active === document.body || active.hidden || (active.closest && active.closest('[hidden]')))) chip.focus();
  }

  /* ---------- Export menu ---------- */
  const menuOpen = () => !byId('statsExportMenu').hidden;
  function setMenu(open, focusButton = false) {
    byId('statsExportMenu').hidden = !open;
    byId('statsExportBtn').setAttribute('aria-expanded', String(open));
    if (open) {
      const first = [...document.querySelectorAll('[data-export]')].find(item => !item.disabled);
      if (first) first.focus();
    } else if (focusButton) byId('statsExportBtn').focus();
  }
  async function exportData(format) {
    if (state.exporting || !state.d || !state.d.stats.totals.entries) return;
    // The range and the day are taken at the click, so a slow Save As cannot change what was asked for
    const days = state.days, now = Date.now();
    state.exporting = true;
    updateExportButtons();
    status('');
    try {
      const result = await StatsExport.download(format, state.items, { days, now });
      status(fmt('statsExportStartedFmt', 'Download started: {0}', result.filename));
    } catch (error) {
      if (error && error.canceled) status(tr('statsExportCanceled', 'Export canceled'));
      else status(tr('statsExportFailed', 'Could not export the data. Please try again.'), true);
    } finally { state.exporting = false; updateExportButtons(); }
  }

  /* ---------- Timers and observers ---------- */
  let toolsTimer = null, midnightTimer = null, reloadTimer = null, lastWidth = 0;
  /** Capture times are relative ("in 20 minutes"): redraw them once a minute, only while the Tools tab is on screen. */
  function syncToolsTimer() {
    const want = state.section === 'tools' && !document.hidden && typeof setInterval === 'function';
    if (want && toolsTimer === null) toolsTimer = setInterval(() => { if (!document.hidden && state.section === 'tools' && state.d) V.tools.render(app); }, 60000);
    else if (!want && toolsTimer !== null) { clearInterval(toolsTimer); toolsTimer = null; }
  }
  /** Today is the last, still-counting bucket: when the local day changes everything is drawn again. */
  function checkDay() {
    if (state.d && HistoryStats.dayKey(Date.now()) !== HistoryStats.dayKey(state.now)) render();
  }
  function scheduleMidnight() {
    if (typeof setTimeout !== 'function') return;
    if (midnightTimer !== null) clearTimeout(midnightTimer);
    const next = new Date();
    next.setHours(24, 0, 1, 0);
    midnightTimer = setTimeout(() => { midnightTimer = null; checkDay(); scheduleMidnight(); }, Math.max(1000, next.getTime() - Date.now()));
  }
  function failed() {
    finishLoading();
    status(tr('statsLoadFailed', 'Could not load the history. Please reload this page.'), true);
  }
  const reload = () => loadData().catch(failed);
  /** One reload per burst of storage writes: History is saved many times while pages are scanned. */
  function scheduleReload() {
    if (typeof setTimeout !== 'function') { reload(); return; }
    if (reloadTimer !== null) clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => { reloadTimer = null; reload(); }, RELOAD_DELAY);
  }
  const hitsOf = host => [...host.querySelectorAll('.stats-hit, .stats-rank-row')];
  /** Redraws the open tab and puts keyboard focus back on the same chart element. */
  function rerenderKeepingFocus() {
    const active = document.activeElement;
    const host = active && typeof active.closest === 'function' ? active.closest('.stats-chart') : null;
    const index = host ? hitsOf(host).indexOf(active) : -1, id = host && host.id;
    renderActive();
    if (id && index >= 0) {
      const items = hitsOf(byId(id)), target = items[index];
      if (target) {
        items.forEach((item, i) => item.setAttribute('tabindex', i === index ? '0' : '-1'));
        target.focus({ preventScroll: true });
      }
    }
  }
  function watchWidth() {
    const content = byId('statsContent');
    let frame = 0;
    const check = () => {
      frame = 0;
      const width = content.getBoundingClientRect().width;
      if (!state.d || content.hidden || !(width > 0) || Math.abs(width - lastWidth) < RESIZE_STEP) return;
      rerenderKeepingFocus();
    };
    const schedule = () => {
      if (typeof requestAnimationFrame !== 'function') { check(); return; }
      if (!frame) frame = requestAnimationFrame(check);
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(content);
    else window.addEventListener('resize', schedule);
    window.addEventListener('resize', updateNavFades);
  }

  /* ---------- Wiring ---------- */
  /** Arrow, Home and End keys over a list of buttons: focus follows selection, and the arrows swap in right-to-left. */
  function roving(buttons, select) {
    buttons.forEach(button => button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const list = buttons.filter(item => !item.hidden), at = list.indexOf(button);
      if (at < 0) return;
      event.preventDefault();
      const backward = document.documentElement.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (at + (event.key === backward ? -1 : 1) + list.length) % list.length;
      select(list[next]);
      list[next].focus();
    }));
  }
  function wire() {
    const tabs = [...document.querySelectorAll('[data-section]')];
    tabs.forEach(button => button.addEventListener('click', () => selectSection(button.dataset.section)));
    roving(tabs, button => selectSection(button.dataset.section));
    const subs = [...document.querySelectorAll('[data-sub]')];
    subs.forEach(button => button.addEventListener('click', () => selectSub(button.dataset.sub)));
    roving(subs, button => selectSub(button.dataset.sub));
    byId('statsNav').addEventListener('scroll', updateNavFades, { passive: true });
    document.querySelectorAll('[data-days]').forEach(button => button.addEventListener('click', () => {
      state.days = Number(button.dataset.days);
      resetLimits();
      status('');
      render();
      persist(RANGE_KEY, state.days);
    }));
    byId('statsEmptyAll').addEventListener('click', () => { state.days = 0; resetLimits(); render(); persist(RANGE_KEY, 0); });
    document.querySelectorAll('[data-category]').forEach(chip => chip.addEventListener('click', () => toggleScope(chip.dataset.category)));
    document.querySelectorAll('[data-scope-toggle]').forEach(button => button.addEventListener('click', () => toggleScope(button.dataset.scopeToggle, true)));
    document.querySelectorAll('[data-go]').forEach(button => button.addEventListener('click', () => selectSection(button.dataset.go)));
    byId('statsExportBtn').addEventListener('click', () => setMenu(!menuOpen()));
    document.querySelectorAll('[data-export]').forEach(item => item.addEventListener('click', () => { setMenu(false, true); return exportData(item.dataset.export); }));
    const menu = byId('statsExportMenu');
    menu.addEventListener('keydown', event => {
      const items = [...document.querySelectorAll('[data-export]')].filter(item => !item.disabled), at = items.indexOf(document.activeElement);
      if (!items.length || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (at + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length].focus();
    });
    // Focus leaving the menu for another element closes it; a click on its plain text (no related target) does not
    menu.addEventListener('focusout', event => {
      const to = event.relatedTarget;
      if (menuOpen() && to && typeof menu.contains === 'function' && !menu.contains(to) && to !== byId('statsExportBtn')) setMenu(false);
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      U.hideTooltip();
      if (typeof Tooltip !== 'undefined' && Tooltip.hide) Tooltip.hide(); // the card tooltips come from the shared tooltip module
      if (menuOpen()) setMenu(false, true);
    });
    document.addEventListener('pointerdown', event => {
      const target = event.target;
      if (menuOpen() && !(target && typeof target.closest === 'function' && target.closest('.stats-menu'))) setMenu(false);
      U.hideTooltipOutside(target);
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDay(); syncToolsTimer(); });
    window.addEventListener('scroll', U.hideTooltip, { passive: true });
    V.protections.init(app);
    V.domains.init(app);
    V.evidence.init(app);
    V.rules.init(app);
  }

  async function init() {
    try {
      const stored = await StorageManager.readRaw(['scrapfly_language_override']);
      await I18n.loadOverride(stored.scrapfly_language_override);
    } catch (_) { /* Browser locale remains available. */ }
    I18n.apply(document);
    // The category chips carry the same icons as the other tabs
    if (typeof FormatUtils !== 'undefined') {
      document.querySelectorAll('[data-category-icon]').forEach(node => { node.innerHTML = FormatUtils.categoryIconSvg(node.dataset.categoryIcon); });
    }
    document.title = tr('settingsHistoryStatsTitle', 'History statistics') + ' · Scrapfly';
    document.documentElement.lang = U.locale();
    document.documentElement.dir = I18n.dir();
    wire();
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.scrapfly_language_override) { location.reload(); return; }
      if (WATCHED.some(key => changes[key])) scheduleReload();
    });
    // Official ids of the detectors shipped with this build (Rules → Update adds its own in storage)
    try {
      if (typeof fetch === 'function') {
        const index = await (await fetch('../../detectors/index.json')).json();
        state.bundledOfficialIds = Object.values(index || {}).flatMap(entry => entry && Array.isArray(entry.detectors) ? entry.detectors : []);
      }
    } catch (_) { /* custom vs official falls back to stored ids */ }
    if (typeof RuleI18n !== 'undefined') { try { await RuleI18n.load(); } catch (_) { /* English rule texts */ } }
    watchWidth();
    try { await loadData(true); } catch (_) { failed(); }
    scheduleMidnight();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
