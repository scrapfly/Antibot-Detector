/**
 * Site tab: one site over time (SiteReport), opened from Domains, Hardest sites or History's ⋯ → Site report
 * (stats.html?site=<host>). It reads every saved scan of the site, whatever the date range; the category chips apply.
 */
(function(root) {
  'use strict';
  const U = StatsUI;
  const { byId, tr, fmt, num, element } = U;
  const V = root.StatsViews = root.StatsViews || {};
  /** Rows of "Pages whose protections changed" before Show more. */
  const CHANGE_PAGE = 20;

  /** The report of the open site, built once per History load, category scope and site. */
  function reportOf(app) {
    const { state } = app;
    const key = [state.historyVersion, [...state.scope].sort().join(','), state.site].join('|');
    if (!state.siteCache || state.siteCache.key !== key) {
      // The chips narrow the pages' changes too: a protection of a category left out is not named there
      let keepChange;
      if (state.scoped !== state.items) {
        const categories = SiteReport.categoriesOf(state.items, state.site);
        keepChange = (name) => {
          const category = categories.get(Categories.protectionKey(name));
          return !category || state.scope.has(category);
        };
      }
      state.siteCache = { key, report: SiteReport.build(state.scoped, state.site, { keepChange }) };
    }
    return state.siteCache.report;
  }

  const ltr = (node) => { node.setAttribute('dir', 'ltr'); return node; };
  const when = (ts) => (ts === null ? '–' : U.dateText(ts));
  /** "Oct 3": a column of the timeline. */
  function shortDate(ts) {
    try { return new Intl.DateTimeFormat(U.locale(), { day: 'numeric', month: 'short' }).format(new Date(ts)); } catch (_) { return U.dateText(ts); }
  }
  /** "Oct 3, 2026, 4:28 PM": the hover text of a column. */
  function longDate(ts) {
    try { return new Intl.DateTimeFormat(U.locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts)); } catch (_) { return U.dateText(ts); }
  }
  function rangeOf(report) {
    if (report.first === null) return '–';
    return U.dateText(report.first) === U.dateText(report.last) ? U.dateText(report.last) : U.rangeText(report.first, report.last);
  }
  function protectionName(row) {
    const label = element('span', 'stats-stack');
    label.append(U.brandMark(row.name, row.category, U.ink(row.category)), document.createTextNode(row.name));
    return label;
  }
  /** A status code with its tone: amber for 4xx, red for 5xx (the same tones as History's cards). */
  function statusBadge(code) {
    const tone = typeof HttpStatus !== 'undefined' ? HttpStatus.tone(code) : '';
    const node = element('span', 'stats-site-status' + (tone ? ' is-' + tone : ''), String(code));
    return ltr(node);
  }

  function renderHead(app, report) {
    U.setText('statsSiteHost', report.site);
    byId('statsSiteHost').setAttribute('title', report.site);
    U.setText('statsSiteSummary', fmt('statsSiteSummaryFmt', 'Pages: {0} · Scans: {1} · {2}', num(report.pages), num(report.scans), rangeOf(report)));
    const others = report.hosts.filter(host => host !== report.site);
    byId('statsSiteAlso').hidden = !others.length;
    U.setText('statsSiteAlso', others.length ? fmt('statsSiteAlsoFmt', 'Also saved as: {0}', U.list(others)) : '');
    const empty = !report.scans;
    byId('statsSiteExportMd').disabled = empty || app.state.exporting;
    byId('statsSiteExportJson').disabled = empty || app.state.exporting;
    byId('statsSiteEmpty').hidden = !empty;
    U.setText('statsSiteEmpty', empty ? fmt('statsSiteEmptyFmt', 'No saved scans of {0}.', report.site) : '');
    document.querySelectorAll('[data-site-part]').forEach(node => { node.hidden = empty; });
  }

  function renderProtections(report) {
    U.table(byId('statsSiteProtectionTable'), {
      caption: tr('statsSiteProtections', 'Protections on this site'),
      headers: [tr('statsProtectionColumn', 'Protection'), tr('statsCategoryColumn', 'Category'), { text: tr('statsFirstSeenColumn', 'First seen'), nowrap: true },
        { text: tr('statsLastSeenColumn', 'Last seen'), nowrap: true }, { text: tr('statsPagesColumn', 'Pages'), num: true }, { text: tr('statsScansColumn', 'Scans'), num: true },
        { text: tr('statConfidence', 'Confidence'), num: true }],
      rows: report.protections.map(row => [protectionName(row), U.categoryBadge(row.category), when(row.firstSeen), when(row.lastSeen), num(row.pages), num(row.scans),
        confidenceRange(row.confidence)]),
      empty: tr('statsSiteNoProtections', 'No protection found in this site\'s saved scans.')
    });
  }
  /** "70% – 95%" in the page language; '–' when no score is known. */
  function confidenceRange(range) {
    if (!range || range.min === null) return '–';
    return range.min === range.max ? U.percent(range.max) : U.percent(range.min) + ' – ' + U.percent(range.max);
  }

  /**
   * Protection × scan, oldest scan first. A table: its columns follow the writing direction, so in a right-to-left language
   * the oldest scan is on the right and time reads leftward, like the text. It opens scrolled to the newest scans.
   */
  function renderTimeline(report) {
    const host = byId('statsSiteTimeline'), t = report.timeline;
    host.replaceChildren();
    U.setText('statsSiteTimelineMeta', t.shown ? U.rangeText(t.scans[0].timestamp, t.scans[t.shown - 1].timestamp) : '');
    byId('statsSiteTimelineLimit').hidden = !t.capped;
    U.setText('statsSiteTimelineLimit', t.capped ? fmt('statsSiteTimelineLimitFmt', 'Showing the latest {0} of {1} scans.', num(t.shown), num(t.total)) : '');
    if (!t.rows.length) { host.appendChild(U.none(tr('statsSiteNoProtections', 'No protection found in this site\'s saved scans.'))); return; }
    const table = element('table', 'stats-table stats-site-grid');
    table.appendChild(element('caption', 'stats-sr-only', tr('statsSiteTimeline', 'Timeline')));
    const head = element('thead'), headRow = element('tr');
    const corner = element('th', 'stats-site-corner', tr('statsProtectionColumn', 'Protection'));
    corner.scope = 'col';
    headRow.appendChild(corner);
    const columns = t.scans.map(scan => {
      const full = [longDate(scan.timestamp), scan.path, scan.httpStatus ? fmt('detectionHttpStatusFmt', 'HTTP status: {0}', scan.httpStatus) : ''].filter(Boolean).join(' · ');
      const th = element('th', 'stats-site-col' + (scan.httpStatus && typeof HttpStatus !== 'undefined' && HttpStatus.isError(scan.httpStatus) ? ' is-error' : ''), shortDate(scan.timestamp));
      th.scope = 'col';
      th.setAttribute('title', full);
      headRow.appendChild(th);
      return longDate(scan.timestamp);
    });
    head.appendChild(headRow);
    const body = element('tbody');
    for (const row of t.rows) {
      const tr_ = element('tr');
      const name = element('th', 'stats-site-row');
      name.scope = 'row';
      name.setAttribute('title', row.name);
      name.appendChild(protectionName(row));
      tr_.appendChild(name);
      row.cells.forEach((cell, i) => {
        const value = cell.found ? (cell.confidence === null ? tr('statsSiteFound', 'found') : U.percent(cell.confidence)) : tr('statsSiteNotFound', 'not found');
        const td = element('td', 'stats-site-cell' + (cell.found ? ' is-on' : ''));
        const text = fmt('statsSiteCellFmt', '{0}, {1}: {2}', row.name, columns[i], value);
        td.setAttribute('title', text);
        if (cell.found) {
          const mark = element('i', 'stats-site-mark');
          mark.setAttribute('aria-hidden', 'true');
          U.setVar(mark, '--c', U.ink(row.category));
          // A weak score is a lighter mark: the confidence reads at a glance, the number is in the hover and for screen readers
          if (cell.confidence !== null) U.setVar(mark, '--a', String(Math.max(0.35, cell.confidence / 100)));
          td.appendChild(mark);
        }
        td.appendChild(element('span', 'stats-sr-only', text));
        tr_.appendChild(td);
      });
      body.appendChild(tr_);
    }
    table.append(head, body);
    host.appendChild(table);
    host.setAttribute('tabindex', '0');
    host.setAttribute('role', 'region');
    host.setAttribute('aria-label', tr('statsSiteTimeline', 'Timeline'));
    // Newest scans in view: the end of the row, whichever side that is (scrollLeft runs negative in right-to-left)
    const rtl = document.documentElement && document.documentElement.dir === 'rtl';
    if (Number.isFinite(host.scrollWidth)) host.scrollLeft = rtl ? -host.scrollWidth : host.scrollWidth;
  }

  function renderStatuses(report) {
    U.table(byId('statsSiteStatusTable'), {
      caption: tr('statsSiteStatuses', 'HTTP statuses'), stack: false,
      headers: [tr('statsHttpStatusColumn', 'HTTP status'), { text: tr('statsScansColumn', 'Scans'), num: true }, { text: tr('statsLastSeenColumn', 'Last seen'), nowrap: true }],
      rows: report.statuses.map(row => [statusBadge(row.code), num(row.scans), when(row.last)]),
      empty: tr('statsNoData', 'No data in this range')
    });
    // With no known status at all, the empty line above says nothing more than this one: it is left out
    if (!report.statuses.length) byId('statsSiteStatusTable').replaceChildren();
    byId('statsSiteStatusUnknown').hidden = !report.unknownStatus;
    U.setText('statsSiteStatusUnknown', report.unknownStatus ? fmt('statsSiteStatusUnknownFmt', 'Scans without a known status: {0}', num(report.unknownStatus)) : '');
  }

  function renderChanges(app, report) {
    const all = report.changes, rows = all.slice(0, app.state.limits.siteChange || CHANGE_PAGE);
    const change = row => {
      const chips = element('div', 'stats-change');
      const part = (items, cls, glyph, key, text) => items.forEach(name => {
        const span = element('span', cls), mark = element('span', '', glyph);
        mark.setAttribute('aria-hidden', 'true');
        span.append(mark, element('span', 'stats-sr-only', tr(key, text) + ' '), document.createTextNode(' ' + name));
        chips.appendChild(span);
      });
      part(row.added, 'stats-change-added', '+', 'statsChangeAddedSr', 'Added:');
      part(row.removed, 'stats-change-removed', '−', 'statsChangeRemovedSr', 'Removed:');
      return chips;
    };
    // The page opens that scan's details in History, over the list narrowed to the site (a search by address alone would also
    // find the site's other pages: every address of the site starts like its home page)
    const page = row => {
      const link = ltr(element('button', 'stats-link-btn stats-host-link', (row.host !== report.site ? row.host : '') + row.path));
      link.type = 'button';
      link.setAttribute('title', fmt('statsOpenInHistoryFmt', 'Open {0} in History', row.host + row.path));
      link.addEventListener('click', () => app.openHistory(SiteReport.siteOf(row.host), row.id));
      return link;
    };
    U.table(byId('statsSiteChangeTable'), {
      caption: tr('statsSiteChanges', 'Pages whose protections changed'), ltrFirst: true,
      headers: [tr('statsChangePageColumn', 'Page'), tr('statsChangeColumn', 'Change'), { text: tr('statsSiteScanDateColumn', 'Scan date'), nowrap: true }],
      rows: rows.map(row => [page(row), change(row), when(row.timestamp)]),
      empty: tr('statsSiteNoChanges', 'No saved scan of this site changed its protections.')
    });
    U.tableCount('statsSiteChange', rows.length, all.length);
  }

  function render(app) {
    if (!app.state.site) return;
    const report = reportOf(app);
    renderHead(app, report);
    if (!report.scans) return;
    renderProtections(report);
    renderTimeline(report);
    renderStatuses(report);
    renderChanges(app, report);
  }

  /** The report as a file. Exports hold every category, whatever the chips show, like the page's other exports. */
  async function exportReport(app, format) {
    const { state } = app;
    if (state.exporting || !state.site) return;
    const now = Date.now();
    const report = SiteReport.build(state.items, state.site);
    if (!report.scans) return;
    state.exporting = true;
    app.updateExportButtons();
    app.status('');
    try {
      const content = format === 'json' ? SiteReport.toJSON(report, { now })
        : SiteReport.toMarkdown(report, { t: (key, fallback, ...args) => (args.length ? fmt(key, fallback, ...args) : tr(key, fallback)), categoryLabel: U.categoryLabel, dateText: U.dateText, number: num });
      const result = await StatsExport.save(content, SiteReport.filename(report.site, format, now), format);
      app.status(fmt('statsExportStartedFmt', 'Download started: {0}', result.filename));
    } catch (error) {
      if (error && error.canceled) app.status(tr('statsExportCanceled', 'Export canceled'));
      else app.status(tr('statsExportFailed', 'Could not export the data. Please try again.'), true);
    } finally {
      state.exporting = false;
      app.updateExportButtons();
    }
  }

  function init(app) {
    const { state } = app;
    byId('statsSiteHistory').addEventListener('click', () => app.openHistory(state.site));
    byId('statsSiteBack').addEventListener('click', () => app.openDomain(state.site));
    byId('statsSiteExportMd').addEventListener('click', () => exportReport(app, 'md'));
    byId('statsSiteExportJson').addEventListener('click', () => exportReport(app, 'json'));
    byId('statsSiteChangeMore').addEventListener('click', () => {
      state.limits.siteChange = (state.limits.siteChange || CHANGE_PAGE) + CHANGE_PAGE;
      if (state.d) renderChanges(app, reportOf(app));
    });
  }

  V.site = { init, render, CHANGE_PAGE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
