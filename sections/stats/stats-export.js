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
    return { days, now };
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
  const StatsExport = {
    build(items, options = {}) {
      const stats = analytics();
      const { days, now } = settings(options);
      const filtered = stats.filterByRange(Array.isArray(items) ? items : [], days, now);
      const entries = filtered.map((item) => {
        const validDetections = (Array.isArray(item.detections) ? item.detections : []).filter((detection) =>
          detection && typeof detection === 'object' && !Array.isArray(detection));
        const detections = validDetections.map((d) => {
          return {
            name: stats.detectionName(d),
            category: stats.detectionCategory(d),
            confidence: stats.confidenceOf(d)
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
      const summary = JSON.parse(JSON.stringify(stats.compute(entries, { days, now, top: Math.max(1, entries.length, count) })));
      // Preserve production custom difficulty without exporting detector rules/metadata.
      summary.difficulty = { High: 0, Medium: 0, Low: 0, None: 0 };
      entries.forEach((entry) => {
        const level = Object.hasOwn(summary.difficulty, entry.difficulty) ? entry.difficulty : 'Medium';
        summary.difficulty[level] += 1;
      });
      // Analytics must only see normalized rows. Clone its output before freezing.
      return freeze({ schemaVersion: 1, generatedAt: iso(now), range: { days, start, end: iso(now) },
        summary, entries });
    },
    toJSON(payload) {
      return JSON.stringify(payload, null, 2) + '\n';
    },
    toCSV(payload) {
      const rows = [['timestamp', 'hostname', 'difficulty', 'detector', 'category', 'confidence']];
      for (const entry of payload.entries) {
        const detections = entry.detections.length ? entry.detections : [{ name: '', category: '', confidence: null }];
        for (const detection of detections) {
          rows.push([entry.timestamp, entry.hostname, entry.difficulty, detection.name, detection.category, detection.confidence]);
        }
      }
      return rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
    },
    filename(format, options = {}) {
      const { now } = settings(options);
      return `scrapfly-history-statistics-${iso(now).slice(0, 10)}.${formatOf(format)}`;
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
            if (error) reject(new Error(error.message || 'Download failed'));
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
