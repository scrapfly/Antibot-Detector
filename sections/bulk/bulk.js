/**
 * Bulk scan page (sections/bulk/bulk.html), opened from History's "…" menu.
 *
 * The page reads the list (pasted, or a .txt/.csv file), expands the sitemaps it names, and hands the addresses to the
 * service worker, which owns the run (background/bulk-scan-runner.js): de-duplication, the cap, the "Sites to scan"
 * setting and the scans happen there. The page shows the run as the worker keeps it in chrome.storage.session, so it
 * can be closed and opened again while the run goes on. Exports are built here from that state (BulkScan.build).
 */
(function() {
  'use strict';
  const M = WorkerMessages;
  const STATE_KEY = 'session_bulk_scan';
  const SITEMAP_TIMEOUT_MS = 20000;
  const SITEMAP_MAX_FILES = 10;     // a sitemap index is followed this far, at most
  const SITEMAP_MAX_URLS = 5000;    // what the worker takes, at most

  const byId = (id) => document.getElementById(id);
  const tr = (key, fallback) => I18n.tr(key, fallback);
  const fmt = (key, fallback, ...args) => {
    const translated = I18n.format(key, ...args);
    return translated || args.reduce((message, arg, i) => message.split(`{${i}}`).join(String(arg)), fallback);
  };
  const number = (value) => {
    try { return new Intl.NumberFormat(I18n.locale()).format(value); } catch (_) { return String(value); }
  };

  const STATUS_TEXT = {
    waiting: ['bulkStatusWaiting', 'Waiting'],
    scanning: ['bulkStatusScanning', 'Scanning'],
    done: ['bulkStatusDone', 'Done'],
    failed: ['bulkStatusFailed', 'Failed'],
    skipped: ['bulkStatusSkipped', 'Skipped']
  };
  const REASON_TEXT = {
    invalid: ['bulkReasonInvalid', 'Not a valid address'],
    scheme: ['bulkReasonScheme', 'Only http and https pages are scanned'],
    scope: ['bulkReasonScope', 'Skipped by Settings → Detection → Sites to scan'],
    sitemap: ['bulkReasonSitemap', 'The sitemap could not be read. Only https sitemaps can be read.'],
    timeout: ['bulkReasonTimeout', 'No result within the time limit'],
    load: ['bulkReasonLoad', 'The page did not load'],
    error: ['bulkReasonError', 'The scan failed'],
    off: ['bulkStoppedOff', 'The extension is switched off.']
  };
  const RUN_TEXT = {
    running: ['bulkRunRunning', 'Running'],
    paused: ['bulkRunPaused', 'Paused'],
    stopped: ['bulkRunStopped', 'Stopped'],
    done: ['bulkRunDone', 'Finished']
  };
  const STOP_TEXT = {
    restart: ['bulkStoppedRestart', 'The extension restarted during the run, so it stopped. The pages still waiting were not scanned.'],
    no_window: ['bulkStoppedNoWindow', 'No browser window was open to scan pages in.'],
    off: ['bulkStoppedOff', 'The extension is switched off.'],
    error: ['bulkErrStart', 'The bulk scan could not start.']
  };
  const DIFFICULTY_TEXT = { Low: ['difficultyLow', 'Low'], Medium: ['difficultyMedium', 'Medium'], High: ['difficultyHigh', 'High'] };
  const label = (pair, fallbackKey) => (pair ? tr(pair[0], pair[1]) : fallbackKey || '');

  const state = { run: null, starting: false, colors: { ...Categories.DEFAULT_COLORS }, historyEnabled: true };

  /* ---------- Talking to the worker ---------- */

  function send(type, extra = {}) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, ...extra }, (response) => {
          void chrome.runtime.lastError;
          resolve(response || { status: 'error' });
        });
      } catch (error) {
        resolve({ status: 'error', error: String((error && error.message) || error) });
      }
    });
  }

  function notice(message, tone = '') {
    const node = byId('bulkNotice');
    node.textContent = message || '';
    node.hidden = !message;
    node.classList.toggle('bulk-notice--warn', tone === 'warn');
  }

  /* ---------- The list ---------- */

  function updateCount() {
    const count = BulkScan.linesOf(byId('bulkInput').value).length;
    byId('bulkInputCount').textContent = count ? fmt('bulkCountFmt', 'Addresses: {0}', number(count)) : '';
  }

  async function fetchText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SITEMAP_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'follow' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } finally {
      clearTimeout(timer);
    }
  }

  /** The pages a sitemap lists (a sitemap index is followed), or null when it cannot be read. */
  async function expandSitemap(url, budget) {
    const queue = [url];
    const seen = new Set();
    const pages = [];
    let files = 0;
    let readAny = false;
    while (queue.length && files < SITEMAP_MAX_FILES && pages.length < budget) {
      const next = queue.shift();
      if (seen.has(next)) continue;
      seen.add(next);
      files++;
      let parsed;
      try { parsed = BulkScan.parseSitemap(await fetchText(next)); } catch (_) { continue; }
      if (!parsed.kind) continue;
      readAny = true;
      if (parsed.kind === 'sitemapindex') {
        for (const loc of parsed.locs) { const n = BulkScan.normalize(loc); if (n.url) queue.push(n.url); }
      } else {
        pages.push(...parsed.locs.slice(0, budget - pages.length));
      }
    }
    return readAny ? pages : null;
  }

  /** The list as the worker takes it: addresses, and sitemaps replaced by their pages (or listed as unreadable). */
  async function entriesOf(text, cap) {
    const lines = BulkScan.linesOf(text);
    const entries = [];
    const budget = Math.min(SITEMAP_MAX_URLS, cap * 2 + 50); // room for duplicates and skipped lines
    const sitemaps = lines.filter(line => { const n = BulkScan.normalize(line); return n.url && BulkScan.isSitemap(n.url); });
    if (sitemaps.length) notice(tr('bulkReadingSitemaps', 'Reading sitemaps…'));
    for (const line of lines) {
      if (entries.length >= SITEMAP_MAX_URLS) break;
      const n = BulkScan.normalize(line);
      if (n.url && BulkScan.isSitemap(n.url)) {
        const pages = await expandSitemap(n.url, budget);
        if (pages) entries.push(...pages);
        else entries.push({ url: n.url, reason: 'sitemap' });
      } else {
        entries.push(line);
      }
    }
    return entries.slice(0, SITEMAP_MAX_URLS);
  }

  function numberField(id, min, max, fallback) {
    const value = parseInt(byId(id).value, 10);
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
  }

  async function start(entriesOverride, extra = {}) {
    if (state.starting || BulkScan.isActive(state.run)) return;
    const cap = numberField('bulkCap', 1, BulkScan.MAX_URLS, BulkScan.MAX_URLS);
    const timeoutSec = numberField('bulkTimeout', BulkScan.TIMEOUT_S.min, BulkScan.TIMEOUT_S.max, BulkScan.TIMEOUT_S.default);
    byId('bulkCap').value = cap;
    byId('bulkTimeout').value = timeoutSec;
    state.starting = true;
    syncControls();
    try {
      const entries = entriesOverride || await entriesOf(byId('bulkInput').value, cap);
      if (!entries.length) { notice(tr('bulkNothingToScan', 'There is no address to scan in this list.'), 'warn'); return; }
      const response = await send(M.BULK_SCAN_START, { entries, cap, timeoutSec, ...extra });
      if (response.run) state.run = response.run;
      if (response.status !== 'ok') {
        const errors = {
          busy: ['bulkErrBusy', 'A bulk scan is already running.'],
          no_window: STOP_TEXT.no_window,
          off: STOP_TEXT.off
        };
        notice(label(errors[response.error] || STOP_TEXT.error), 'warn');
      } else if (response.error === 'empty') {
        notice(tr('bulkNothingToScan', 'There is no address to scan in this list.'), 'warn');
      } else {
        notice('');
      }
    } finally {
      state.starting = false;
      render();
    }
  }

  /* ---------- The run ---------- */

  function svgDot(key) {
    const dot = document.createElement('span');
    dot.className = 'bulk-cat-icon';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.color = state.colors[key] || 'var(--text-secondary)';
    const icon = typeof FormatUtils !== 'undefined' ? FormatUtils.categoryIconSvg(key) : '';
    if (icon) dot.innerHTML = icon; // a fixed SVG from FormatUtils, never page data
    else dot.classList.add('bulk-cat-icon--plain');
    return dot;
  }

  function addressCell(item) {
    const cell = document.createElement('td');
    cell.className = 'bulk-col-url';
    let link = null;
    if (/^https?:\/\//i.test(item.url)) {
      link = document.createElement('a');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    const text = link || document.createElement('span');
    text.textContent = item.url;
    text.dir = 'ltr';
    text.className = 'bulk-url';
    cell.appendChild(text);
    if (item.finalUrl) {
      const ended = document.createElement('span');
      ended.className = 'bulk-sub';
      // The address is isolated (FSI … PDI) so it reads left to right inside an Arabic sentence
      ended.textContent = fmt('bulkEndedOnFmt', 'Ended on {0}', `⁨${item.finalUrl}⁩`);
      cell.appendChild(ended);
    }
    return cell;
  }

  function statusCell(item) {
    const cell = document.createElement('td');
    const pill = document.createElement('span');
    pill.className = `bulk-status bulk-status--${item.status}`;
    pill.textContent = label(STATUS_TEXT[item.status], item.status);
    cell.appendChild(pill);
    if (item.reason) {
      const reason = document.createElement('span');
      reason.className = 'bulk-sub';
      reason.textContent = label(REASON_TEXT[item.reason], item.reason);
      cell.appendChild(reason);
    }
    return cell;
  }

  function protectionsCell(item) {
    const cell = document.createElement('td');
    if (item.status !== 'done') return cell;
    const detections = Array.isArray(item.detections) ? item.detections : [];
    if (!detections.length) {
      const none = document.createElement('span');
      none.className = 'bulk-muted';
      none.textContent = tr('bulkNoProtection', 'No protection found');
      cell.appendChild(none);
      return cell;
    }
    const list = document.createElement('ul');
    list.className = 'bulk-protections';
    for (const d of detections) {
      const entry = document.createElement('li');
      entry.className = 'bulk-protection';
      const categoryLabel = Categories.labelOf(d.category);
      entry.title = categoryLabel ? tr(categoryLabel[0], categoryLabel[1]) : String(d.category || '');
      entry.appendChild(svgDot(d.category));
      const name = document.createElement('span');
      name.textContent = d.name;
      entry.appendChild(name);
      if (Number.isFinite(d.confidence)) {
        const confidence = document.createElement('span');
        confidence.className = 'bulk-confidence';
        confidence.textContent = `${number(d.confidence)}%`;
        entry.appendChild(confidence);
      }
      list.appendChild(entry);
    }
    cell.appendChild(list);
    return cell;
  }

  function difficultyCell(item) {
    const cell = document.createElement('td');
    if (item.status === 'done' && item.difficulty) {
      const badge = document.createElement('span');
      badge.className = `bulk-difficulty bulk-difficulty--${String(item.difficulty).toLowerCase()}`;
      badge.textContent = label(DIFFICULTY_TEXT[item.difficulty], item.difficulty);
      cell.appendChild(badge);
    }
    return cell;
  }

  function renderRows(run) {
    const body = byId('bulkRows');
    const fragment = document.createDocumentFragment();
    run.items.forEach((item, index) => {
      const row = document.createElement('tr');
      row.className = `bulk-row bulk-row--${item.status}`;
      const num = document.createElement('td');
      num.className = 'bulk-col-num';
      num.textContent = number(index + 1);
      row.append(num, addressCell(item), statusCell(item), protectionsCell(item), difficultyCell(item));
      fragment.appendChild(row);
    });
    body.replaceChildren(fragment);
  }

  function syncControls() {
    const run = state.run;
    const active = BulkScan.isActive(run);
    const locked = active || state.starting;
    byId('bulkInput').readOnly = locked;
    byId('bulkUploadBtn').disabled = locked;
    byId('bulkCap').disabled = locked;
    byId('bulkTimeout').disabled = locked;
    byId('bulkStartBtn').disabled = locked;
    byId('bulkPauseBtn').hidden = !(run && run.status === 'running');
    byId('bulkResumeBtn').hidden = !(run && run.status === 'paused');
    byId('bulkStopBtn').hidden = !active;
    byId('bulkNewBtn').hidden = !run || active;
    const counts = run ? BulkScan.counts(run) : null;
    byId('bulkWaitingBtn').hidden = !(run && run.status === 'stopped' && counts.waiting > 0);
    byId('bulkRetryFailedBtn').hidden = !(run && (run.status === 'stopped' || run.status === 'done') && counts.failed > 0);
    const exportable = !!(run && run.items.length);
    byId('bulkExportCsvBtn').disabled = !exportable;
    byId('bulkExportJsonBtn').disabled = !exportable;
  }

  function render() {
    const run = state.run;
    byId('bulkRunCard').hidden = !run;
    byId('bulkEmpty').hidden = !!run || !!byId('bulkInput').value.trim();
    byId('bulkHistoryPaused').hidden = state.historyEnabled;
    syncControls();
    if (!run) return;
    const counts = BulkScan.counts(run);
    const finishedCount = counts.done + counts.failed + counts.skipped;
    const toScan = counts.total;
    const percent = toScan ? Math.round((finishedCount / toScan) * 100) : 0;
    byId('bulkProgressBar').style.inlineSize = `${percent}%`;
    byId('bulkProgress').setAttribute('aria-valuenow', String(percent));
    byId('bulkProgress').classList.toggle('is-paused', run.status === 'paused');
    byId('bulkRunStatus').textContent = `${label(RUN_TEXT[run.status], run.status)} · ${fmt('bulkProgressFmt', '{0} of {1} finished', number(finishedCount), number(toScan))}`;
    byId('bulkRunCounts').textContent = fmt('bulkCountsFmt', 'Done: {0} · With protections: {1} · Failed: {2} · Skipped: {3}',
      number(counts.done), number(counts.found), number(counts.failed), number(counts.skipped));
    const reason = run.status === 'stopped' && run.reason && run.reason !== 'user' ? label(STOP_TEXT[run.reason], '') : '';
    byId('bulkRunReason').textContent = reason;
    byId('bulkRunReason').hidden = !reason;
    const notes = [];
    if (run.duplicates) notes.push(fmt('bulkDuplicatesFmt', 'Duplicates removed: {0}', number(run.duplicates)));
    if (run.overCap) notes.push(fmt('bulkOverCapFmt', 'Left out over the limit: {0}', number(run.overCap)));
    if (run.skippedOver) notes.push(fmt('bulkMoreSkippedFmt', 'Other lines left out: {0}', number(run.skippedOver)));
    byId('bulkRunNotes').textContent = notes.join(' · ');
    byId('bulkRunNotes').hidden = !notes.length;
    renderRows(run);
  }

  /* ---------- Exports ---------- */

  function exportRun(format) {
    if (!state.run) return;
    const out = BulkScan.build(state.run, { format });
    const blob = new Blob([out.text], { type: `${out.type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = BulkScan.fileName(format, FormatUtils.localDay(Date.now()));
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Wiring ---------- */

  async function readSettings() {
    try {
      const raw = await StorageManager.readRaw(['scrapfly_settings']);
      const settings = StorageManager.normalizeSettings(raw.scrapfly_settings);
      const colors = settings.categoryColors || {};
      for (const key of Categories.KEYS) {
        if (/^#[0-9a-f]{6}$/i.test(colors[key])) state.colors[key] = colors[key];
      }
      state.historyEnabled = !(settings.history && settings.history.historyEnabled === false);
    } catch (_) { /* defaults */ }
  }

  function wire() {
    const input = byId('bulkInput');
    input.addEventListener('input', () => { updateCount(); if (!state.run) render(); });
    byId('bulkUploadBtn').addEventListener('click', () => byId('bulkFile').click());
    byId('bulkFile').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        input.value = input.value.trim() ? `${input.value.replace(/\s+$/, '')}\n${text}` : text;
        notice('');
      } catch (_) {
        notice(tr('bulkErrFile', 'The file could not be read.'), 'warn');
      }
      updateCount();
      render();
    });
    byId('bulkStartBtn').addEventListener('click', () => start());
    byId('bulkPauseBtn').addEventListener('click', async () => { const r = await send(M.BULK_SCAN_PAUSE); if (r.run) { state.run = r.run; render(); } });
    byId('bulkResumeBtn').addEventListener('click', async () => { const r = await send(M.BULK_SCAN_RESUME); if (r.run) { state.run = r.run; render(); } });
    byId('bulkStopBtn').addEventListener('click', async () => { const r = await send(M.BULK_SCAN_STOP); if (r.run) { state.run = r.run; render(); } });
    byId('bulkNewBtn').addEventListener('click', async () => {
      const r = await send(M.BULK_SCAN_CLEAR);
      if (r.status === 'ok') { state.run = null; notice(''); render(); input.focus(); }
    });
    byId('bulkWaitingBtn').addEventListener('click', () => {
      if (!state.run) return;
      // The pages already finished stay in the table and the exports: the worker carries them into the new run
      start(state.run.items.filter(item => item.status === 'waiting').map(item => item.url), { continueRun: true });
    });
    byId('bulkRetryFailedBtn').addEventListener('click', () => {
      if (!state.run) return;
      // The pages that failed (and any still waiting) are scanned again; the others stay in the table and the exports
      start(state.run.items.filter(item => item.status === 'failed' || item.status === 'waiting').map(item => item.url), { continueRun: true, retryFailed: true });
    });
    byId('bulkExportCsvBtn').addEventListener('click', () => exportRun('csv'));
    byId('bulkExportJsonBtn').addEventListener('click', () => exportRun('json'));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'session' && changes[STATE_KEY]) {
        state.run = changes[STATE_KEY].newValue || null;
        render();
      } else if (area === 'local' && changes.scrapfly_language_override) {
        location.reload();
      } else if (area === 'local' && changes.scrapfly_settings) {
        readSettings().then(render);
      }
    });
  }

  async function init() {
    try { await I18n.syncOverrideFromStorage(); } catch (_) { /* the browser's language */ }
    I18n.apply(document);
    byId('bulkCapLabel').textContent = fmt('bulkCapLabelFmt', 'Pages per run (up to {0})', number(BulkScan.MAX_URLS));
    byId('bulkCap').max = String(BulkScan.MAX_URLS);
    byId('bulkTimeout').min = String(BulkScan.TIMEOUT_S.min);
    byId('bulkTimeout').max = String(BulkScan.TIMEOUT_S.max);
    document.title = `${tr('bulkTitle', 'Bulk scan')} · Scrapfly`;
    document.documentElement.lang = I18n.locale();
    document.documentElement.dir = I18n.dir();
    wire();
    await readSettings();
    const response = await send(M.BULK_SCAN_STATE);
    state.run = response && response.run ? response.run : null;
    if (state.run) {
      byId('bulkTimeout').value = state.run.timeoutSec || BulkScan.TIMEOUT_S.default;
      byId('bulkCap').value = state.run.cap || BulkScan.MAX_URLS;
    }
    updateCount();
    render();
    document.body.classList.add('is-ready');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
