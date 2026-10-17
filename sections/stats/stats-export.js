/** Privacy-safe local history exports. Load after history-stats.js. */
(function(root) {
  'use strict';
  const analytics = () => {
    if (typeof HistoryStats !== 'undefined') return HistoryStats;
    if (root.HistoryStats) return root.HistoryStats;
    if (typeof module !== 'undefined' && module.exports) return require('./history-stats.js');
    throw new Error('History statistics are unavailable');
  };
  const iso = (value) => {
    const date = new Date(value);
    return value !== null && Number.isFinite(date.getTime()) ? date.toISOString() : null;
  };
  const freeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  };
  const settings = (options = {}) => {
    const now = options.now === undefined ? Date.now() : options.now;
    if (typeof now !== 'number' || !iso(now)) throw new Error('Invalid export reference time');
    const days = options.days === undefined ? 30 : options.days;
    if (typeof days !== 'number' || !Number.isFinite(days) || days < 0 || !Number.isInteger(days)) {
      throw new Error('Invalid export time range');
    }
    const timeZone = typeof options.timeZone === 'string' && options.timeZone ? options.timeZone : undefined;
    return { days, now, timeZone };
  };
  /** The time zone the dates of the export are meant in: the one asked for, else this browser's. */
  const zoneOf = (timeZone) => {
    if (timeZone) return timeZone;
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
  };
  const formatOf = (format) => {
    if (format !== 'csv' && format !== 'json') throw new Error('Unsupported export format');
    return format;
  };
  // Prefix spreadsheet expressions before quoting. Numeric values are never altered.
  const cell = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (typeof value !== 'number' && /^\s*[=+\-@]/u.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  };
  const rankOf = { None: 0, Low: 1, Medium: 2, High: 3 };
  const StatsExport = {
    build(items, options = {}) {
      const stats = analytics();
      const { days, now, timeZone } = settings(options);
      const filtered = stats.filterByRange(Array.isArray(items) ? items : [], days, now);
      const entries = filtered.map((item) => {
        const validDetections = (Array.isArray(item.detections) ? item.detections : []).filter((detection) =>
          detection && typeof detection === 'object' && !Array.isArray(detection));
        const detections = validDetections.map((d) => {
          // How it was found (method names only, never matched values) and the combinations that decided it
          const matches = Array.isArray(d.matches) ? d.matches : [];
          const methods = [...new Set(matches.map((m) => stats.methodOf(m)))].sort();
          const combinations = (Array.isArray(d.combinations) ? d.combinations : [])
            .map((c) => c && typeof c === 'object' && typeof c.id === 'string' ? c.id : '').filter(Boolean);
          return {
            name: stats.detectionName(d),
            category: stats.detectionCategory(d),
            confidence: stats.confidenceOf(d),
            methods,
            combinations
          };
        });
        const rawHostname = typeof item.hostname === 'string' ? item.hostname.trim() : '';
        const hostname = rawHostname.includes('://') ? stats.hostnameFromUrl(rawHostname) : rawHostname.split(/[/?#]/)[0];
        return {
          timestamp: iso(stats.getTimestamp(item)),
          hostname: String(hostname || stats.hostnameFromUrl(item.url) || '').toLowerCase(),
          difficulty: stats.difficultyOf(validDetections),
          detections
        };
      });
      let start = null;
      if (days > 0) {
        const date = new Date(now);
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - days + 1);
        start = date.toISOString();
      }
      const count = entries.reduce((sum, entry) => sum + entry.detections.length, 0);
      const forSummary = entries.map((entry) => ({ ...entry, detections: entry.detections.map((d) => ({ ...d, combinations: d.combinations.map((id) => ({ id })) })) }));
      const summary = JSON.parse(JSON.stringify(stats.compute(forSummary, { days, now, top: Math.max(1, entries.length, count) })));
      // Match-level figures need the matched values, which exports leave out; the dashboard-only lists stay out too
      for (const key of ['methods', 'methodsByCategory', 'totalMatches', 'signalMetrics', 'weakEvidence', 'unconfirmed', 'stackMetrics']) delete summary[key];
      // Preserve production custom difficulty without exporting detector rules/metadata.
      summary.difficulty = { High: 0, Medium: 0, Low: 0, None: 0 };
      const worst = new Map();
      entries.forEach((entry) => {
        const level = Object.hasOwn(summary.difficulty, entry.difficulty) ? entry.difficulty : 'Medium';
        summary.difficulty[level] += 1;
        if (entry.hostname && (rankOf[level] > (rankOf[worst.get(entry.hostname)] ?? -1))) worst.set(entry.hostname, level);
      });
      // Per-domain difficulty comes from the same production levels as the entries, not from the stripped rows
      for (const row of summary.domainMetrics) if (worst.has(row.hostname)) row.difficulty = worst.get(row.hostname);
      // Analytics must only see normalized rows. Clone its output before freezing.
      return freeze({ schemaVersion: 1, generatedAt: iso(now), timeZone: zoneOf(timeZone), range: { days, start, end: iso(now) },
        summary, entries });
    },
    toJSON(payload) {
      return JSON.stringify(payload, null, 2) + '\n';
    },
    toCSV(payload) {
      const rows = [['timestamp', 'hostname', 'difficulty', 'detector', 'category', 'confidence', 'methods', 'combinations']];
      for (const entry of payload.entries) {
        const detections = entry.detections.length ? entry.detections : [{ name: '', category: '', confidence: null, methods: [], combinations: [] }];
        for (const detection of detections) {
          rows.push([entry.timestamp, entry.hostname, entry.difficulty, detection.name, detection.category, detection.confidence,
            (detection.methods || []).join(';'), (detection.combinations || []).join(';')]);
        }
      }
      return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
    },
    /** Named after the range and the LOCAL calendar day, e.g. scrapfly-history-statistics-30d-2026-10-03.csv. */
    filename(format, options = {}) {
      const { days, now } = settings(options);
      return `scrapfly-history-statistics-${days ? days + 'd' : 'all'}-${analytics().dayKey(now)}.${formatOf(format)}`;
    },
    async download(format, items, options = {}) {
      formatOf(format);
      const resolved = settings(options);
      const payload = StatsExport.build(items, resolved);
      const filename = StatsExport.filename(format, resolved);
      if (!root.chrome || !root.chrome.downloads || typeof root.chrome.downloads.download !== 'function' ||
          !root.URL || typeof root.URL.createObjectURL !== 'function' || typeof root.Blob !== 'function') {
        throw new Error('Local file downloads are unavailable');
      }
      const content = format === 'csv' ? '\uFEFF' + StatsExport.toCSV(payload) : StatsExport.toJSON(payload);
      const blob = new root.Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
      const url = root.URL.createObjectURL(blob);
      try {
        const downloadId = await new Promise((resolve, reject) => {
          root.chrome.downloads.download({ url, filename, saveAs: true }, (id) => {
            const error = root.chrome.runtime && root.chrome.runtime.lastError;
            if (error) {
              const failure = new Error(error.message || 'Download failed');
              // Dismissing the Save As dialog is a choice, not a failure
              failure.canceled = /cancel/i.test(String(error.message || ''));
              reject(failure);
            }
            else if (typeof id !== 'number') reject(new Error('Download was not started'));
            else resolve(id);
          });
        });
        return { downloadId, filename };
      } finally {
        // Chrome consumes Blob URLs asynchronously, even after assigning the ID.
        root.setTimeout(() => root.URL.revokeObjectURL(url), 60000);
      }
    }
  };
  root.StatsExport = StatsExport;
  if (typeof module !== 'undefined' && module.exports) module.exports = StatsExport;
})(typeof globalThis !== 'undefined' ? globalThis : this);
