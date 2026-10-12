/** Pure aggregation of recorded history entries, not a measure of all browsing. */
const HistoryStats = {
  DAY_MS: 86400000,
  isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); },
  parseStoredHistory(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { return []; }
    }
    return (Array.isArray(value) ? value : value && Array.isArray(value.items) ? value.items : []).filter(HistoryStats.isRecord);
  },
  getTimestamp(item) {
    const value = item && item.timestamp;
    let ts = null;
    if (typeof value === 'number') ts = value;
    else if (typeof value === 'string' && value.trim()) {
      ts = Number(value);
      if (!Number.isFinite(ts)) ts = Date.parse(value);
    }
    return Number.isFinite(ts) && Number.isFinite(new Date(ts).getTime()) ? ts : null;
  },
  referenceTime(now) {
    return typeof now === 'number' && Number.isFinite(now) && Number.isFinite(new Date(now).getTime()) ? now : Date.now();
  },
  dayKey(ts) {
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
  rangeDays(days) {
    return typeof days === 'number' && Number.isFinite(days) && days >= 0 ? (days === 0 ? 0 : Math.max(1, Math.floor(days))) : 30;
  },
  /** Zero selects all records, including unknown dates. Positive ranges end at now. */
  filterByRange(items, days = 0, now = Date.now()) {
    const list = Array.isArray(items) ? items.filter(HistoryStats.isRecord) : [];
    const count = HistoryStats.rangeDays(days);
    if (!count) return list;
    const end = HistoryStats.referenceTime(now);
    const start = new Date(end);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - count + 1);
    const startTime = Number.isFinite(start.getTime()) ? start.getTime() : -8640000000000000;
    return list.filter((item) => {
      const ts = HistoryStats.getTimestamp(item);
      return ts !== null && ts >= startTime && ts <= end;
    });
  },
  /** Bounded number of local-calendar timeline buckets, including today. */
  timelineDays(items, days = 30, now = Date.now(), maxDays = 365) {
    const cap = typeof maxDays === 'number' && Number.isFinite(maxDays) && maxDays > 0 ? Math.max(1, Math.floor(maxDays)) : 365;
    const count = HistoryStats.rangeDays(days);
    if (count) return Math.min(count, cap);
    const end = HistoryStats.referenceTime(now);
    const ordinal = (ts) => {
      const d = new Date(ts);
      const calendar = new Date(0);
      calendar.setUTCFullYear(d.getFullYear(), d.getMonth(), d.getDate());
      calendar.setUTCHours(0, 0, 0, 0);
      return calendar.getTime() / HistoryStats.DAY_MS;
    };
    let oldest = ordinal(end);
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item)) continue;
      const ts = HistoryStats.getTimestamp(item);
      if (ts !== null && ts <= end) oldest = Math.min(oldest, ordinal(ts));
    }
    return Math.min(cap, Math.max(1, ordinal(end) - oldest + 1));
  },
  normalizeCategory(category) {
    const normalized = String(category || '').toLowerCase().replace(/[^a-z]/g, '');
    if (normalized.includes('captcha')) return 'captcha';
    if (normalized.includes('fingerprint')) return 'fingerprint';
    if (normalized.includes('antibot') || normalized.includes('bot') || normalized.includes('waf')) return 'antibot';
    return 'other';
  },
  detectionName(detection) {
    if (!HistoryStats.isRecord(detection)) return '';
    const nested = HistoryStats.isRecord(detection.detector) ? detection.detector : {};
    for (const value of [detection.name, nested.name, typeof detection.detector === 'string' ? detection.detector : null, detection.id, nested.id]) {
      if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) return String(value).trim();
    }
    return '';
  },
  detectionCategory(detection) {
    if (!HistoryStats.isRecord(detection)) return 'other';
    const nested = HistoryStats.isRecord(detection.detector) ? detection.detector : {};
    return HistoryStats.normalizeCategory(detection.category || nested.category || detection.type || nested.type);
  },
  /** Reject malformed/out-of-range scores, including numeric strings, without coercion. */
  confidenceOf(detection) {
    const score = HistoryStats.isRecord(detection) ? detection.confidence : null;
    return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
  },
  difficultyOf(detections) {
    if (!Array.isArray(detections) || !detections.length) return 'None';
    const utils = typeof DetectionUtils !== 'undefined' ? DetectionUtils : null;
    if (utils && typeof utils.getDifficultyLevel === 'function') return utils.getDifficultyLevel(detections);
    const categories = detections.map(HistoryStats.detectionCategory);
    if (categories.includes('captcha')) return 'High';
    return categories.every((c) => c === 'fingerprint') ? 'Low' : 'Medium';
  },
  /** Detection methods in the order the rule editor lists them; anything else is 'other'. */
  METHODS: ['cookie', 'header', 'url', 'content', 'dom', 'window', 'js_hooks', 'payload'],
  methodOf(match) {
    const type = String(HistoryStats.isRecord(match) ? match.type || '' : '').toLowerCase();
    const aliases = { cookies: 'cookie', headers: 'header', urls: 'url', hooks: 'js_hooks', jshooks: 'js_hooks' };
    const key = aliases[type] || type;
    return HistoryStats.METHODS.includes(key) ? key : 'other';
  },
  /**
   * What a match is, without the private part History keeps for display:
   * a cookie or header name (never its value), a selector, a hook target, a
   * URL path (never the query) or the pattern text.
   */
  signalLabel(match) {
    if (!HistoryStats.isRecord(match)) return '';
    const method = HistoryStats.methodOf(match);
    const str = (value) => (typeof value === 'string' || typeof value === 'number') ? String(value).trim() : '';
    const before = (value, sep) => { const text = str(value); const at = text.indexOf(sep); return at > 0 ? text.slice(0, at).trim() : text; };
    let label = '';
    if (method === 'cookie') label = str(match.name) || before(match.value, '=');
    else if (method === 'header') label = str(match.name) || before(match.value, ':');
    else if (method === 'dom') {
      // History keeps "selector=text"; an attribute selector has its own "=" inside [ ]
      label = str(match.selector);
      if (!label) {
        const text = str(match.value);
        let depth = 0, at = -1;
        for (let i = 0; i < text.length; i++) {
          if (text[i] === '[') depth++;
          else if (text[i] === ']') depth = Math.max(0, depth - 1);
          else if (text[i] === '=' && depth === 0) { at = i; break; }
        }
        label = (at > 0 ? text.slice(0, at) : text).trim();
      }
    }
    else if (method === 'js_hooks') label = str(match.target) || str(match.pattern) || str(match.value);
    else if (method === 'url') {
      label = str(match.pattern);
      if (!label) {
        const raw = str(match.fullUrl) || str(match.value);
        try { const u = new URL(raw); label = u.hostname + u.pathname; } catch (_) { label = raw.split(/[?#]/)[0]; }
      }
    } else if (method === 'payload') label = str(match.pattern);
    else label = str(match.pattern) || str(match.value) || str(match.name);
    return label.length > 120 ? label.slice(0, 120) + '…' : label;
  },
  /** Start of a positive range (local midnight), or null for "All". */
  rangeStart(days, now = Date.now()) {
    const count = HistoryStats.rangeDays(days);
    if (!count) return null;
    const start = new Date(HistoryStats.referenceTime(now));
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - count + 1);
    return start.getTime();
  },
  /** Protections and domains whose first saved entry (in all of History) falls at or after `since`. */
  firstSeen(allItems, since, now = Date.now()) {
    const out = { protections: [], domains: [] };
    if (typeof since !== 'number' || !Number.isFinite(since)) return out;
    const end = HistoryStats.referenceTime(now);
    const protections = new Map(), domains = new Map();
    for (const item of Array.isArray(allItems) ? allItems : []) {
      if (!HistoryStats.isRecord(item)) continue;
      const ts = HistoryStats.getTimestamp(item);
      if (ts === null || ts > end) continue;
      const hostname = HistoryStats.hostOf(item);
      if (hostname) {
        const d = domains.get(hostname);
        if (!d || ts < d.ts) domains.set(hostname, { hostname, ts });
      }
      for (const detection of Array.isArray(item.detections) ? item.detections : []) {
        const name = HistoryStats.detectionName(detection);
        if (!name) continue;
        const key = name.toLowerCase(), p = protections.get(key);
        if (!p || ts < p.ts) protections.set(key, { name, category: HistoryStats.detectionCategory(detection), ts, hostname });
      }
    }
    const recent = (list) => Array.from(list.values()).filter((row) => row.ts >= since).sort((a, b) => b.ts - a.ts);
    out.protections = recent(protections);
    out.domains = recent(domains);
    return out;
  },
  hostOf(item) {
    return (typeof item.hostname === 'string' && item.hostname.trim() ? item.hostname.trim() : HistoryStats.hostnameFromUrl(item.url)).toLowerCase();
  },
  /**
   * Aggregates every valid record passed in. Call filterByRange first for ranged totals.
   * Duplicate detection rows contribute scores/counts, but page metrics deduplicate names
   * case-insensitively and category pairs per entry. Missing timestamps omit temporal
   * distributions only. All-time totals retain future dates, finite timelines do not.
   * New averages are rounded percentages or null. Legacy totals.avgConfidence stays 0
   * when unknown. Numeric confidence bands use [0,20), [20,40), ... [80,100].
   */
  compute(items, options = {}) {
    options = HistoryStats.isRecord(options) ? options : {};
    const now = HistoryStats.referenceTime(options.now);
    const days = HistoryStats.timelineDays(items, options.days === undefined ? 30 : options.days, now, options.maxDays);
    const top = typeof options.top === 'number' && Number.isFinite(options.top) ? Math.max(1, Math.floor(options.top)) : 8;
    const list = Array.isArray(items) ? items.filter(HistoryStats.isRecord) : [];
    const keys = ['antibot', 'captcha', 'fingerprint', 'other'];
    const emptyCategories = () => Object.fromEntries(keys.map((key) => [key, 0]));
    const bucket = () => ({ entries: 0, detections: 0, categories: emptyCategories(), domains: new Set(), sum: 0, count: 0 });
    const average = (sum, count) => count ? Math.round(sum / count) : null;
    const outputBucket = (b) => ({ entries: b.entries, detections: b.detections, categories: b.categories, uniqueDomains: b.domains.size, avgConfidence: average(b.sum, b.count) });
    const domains = new Map(), detectors = new Map(), perDay = new Map();
    const categories = emptyCategories();
    const difficulty = { High: 0, Medium: 0, Low: 0, None: 0 };
    const hourly = Array.from({ length: 24 }, bucket);
    const weekdays = Array.from({ length: 7 }, bucket);
    const confidenceBuckets = [0, 20, 40, 60, 80].map((min) => ({ label: `${min}-${min === 80 ? 100 : min + 19}`, min, max: min === 80 ? 100 : min + 19, count: 0 }));
    const categoryConfidence = keys.map((category) => ({ category, detections: 0, withConfidence: 0, sum: 0 }));
    const categoryOverlap = Object.fromEntries(keys.map((key) => [key, emptyCategories()]));
    const methodKeys = [...HistoryStats.METHODS, 'other'];
    const emptyMethods = () => Object.fromEntries(methodKeys.map((key) => [key, 0]));
    const methods = emptyMethods();
    const methodsByCategory = Object.fromEntries(keys.map((key) => [key, emptyMethods()]));
    const signals = new Map(), combos = new Map(), pairs = new Map(), visitsByDomain = new Map();
    const decided = { single: { detections: 0, sum: 0, count: 0 }, combination: { detections: 0, sum: 0, count: 0 } };
    let totalMatches = 0;
    let totalDetections = 0, entriesWithDetections = 0, confidenceSum = 0, confidenceCount = 0, first = null, last = null;
    const addBucket = (b, detections, hostname) => {
      b.entries++;
      b.detections += detections.length;
      if (hostname) b.domains.add(hostname);
      for (const detection of detections) {
        b.categories[HistoryStats.detectionCategory(detection)]++;
        const score = HistoryStats.confidenceOf(detection);
        if (score !== null) { b.sum += score; b.count++; }
      }
    };
    for (const item of list) {
      const detections = Array.isArray(item.detections) ? item.detections.filter(HistoryStats.isRecord) : [];
      const hostname = (typeof item.hostname === 'string' && item.hostname.trim() ? item.hostname.trim() : HistoryStats.hostnameFromUrl(item.url)).toLowerCase();
      const ts = HistoryStats.getTimestamp(item);
      totalDetections += detections.length;
      if (detections.length) entriesWithDetections++;
      const level = HistoryStats.difficultyOf(detections);
      difficulty[Object.hasOwn(difficulty, level) ? level : 'Medium']++;
      let domain;
      if (hostname) {
        domain = domains.get(hostname) || { hostname, visits: 0, detections: 0, names: new Set(), sum: 0, count: 0 };
        domain.visits++;
        domain.detections += detections.length;
        domains.set(hostname, domain);
      }
      const seen = new Set(), pageCategories = new Set(), pageNames = new Map();
      for (const detection of detections) {
        const name = HistoryStats.detectionName(detection);
        const category = HistoryStats.detectionCategory(detection);
        const score = HistoryStats.confidenceOf(detection);
        categories[category]++;
        pageCategories.add(category);
        const cc = categoryConfidence[keys.indexOf(category)];
        cc.detections++;
        if (score !== null) {
          confidenceSum += score; confidenceCount++;
          cc.sum += score; cc.withConfidence++;
          confidenceBuckets[Math.min(4, Math.floor(score / 20))].count++;
          if (domain) { domain.sum += score; domain.count++; }
        }
        if (!name) continue;
        const key = name.toLowerCase();
        if (domain) domain.names.add(key);
        const entry = detectors.get(key) || { name, category, id: '', pages: 0, domains: new Set(), sum: 0, count: 0, matchSum: 0, matchCount: 0 };
        if (!seen.has(key)) { entry.pages++; seen.add(key); }
        if (hostname) entry.domains.add(hostname);
        if (score !== null) { entry.sum += score; entry.count++; }
        if (!entry.id) {
          const nested = HistoryStats.isRecord(detection.detector) ? detection.detector : {};
          const id = nested.id || detection.id;
          if (typeof id === 'string' && id) entry.id = id;
        }
        detectors.set(key, entry);
        pageNames.set(key, name);
        // Evidence: each match's method and what it matched
        const matches = Array.isArray(detection.matches) ? detection.matches.filter(HistoryStats.isRecord) : [];
        const pageSignals = new Set();
        for (const match of matches) {
          const method = HistoryStats.methodOf(match);
          methods[method]++;
          methodsByCategory[category][method]++;
          totalMatches++;
          const matchScore = typeof match.confidence === 'number' && Number.isFinite(match.confidence) ? match.confidence : null;
          if (matchScore !== null) { entry.matchSum += matchScore; entry.matchCount++; }
          const label = HistoryStats.signalLabel(match);
          if (!label) continue;
          const signalKey = key + '|' + method + '|' + (method === 'cookie' || method === 'header' ? label.toLowerCase() : label);
          const signal = signals.get(signalKey) || { detector: name, detectorId: entry.id || '', category, method, label, pages: 0, matches: 0, sum: 0, count: 0 };
          signal.matches++;
          if (!pageSignals.has(signalKey)) { signal.pages++; pageSignals.add(signalKey); }
          if (matchScore !== null) { signal.sum += matchScore; signal.count++; }
          signals.set(signalKey, signal);
        }
        // Decided by a combination, or by patterns on their own
        const fired = Array.isArray(detection.combinations) ? detection.combinations.filter(HistoryStats.isRecord) : [];
        const bucketOf = decided[fired.length ? 'combination' : 'single'];
        bucketOf.detections++;
        if (score !== null) { bucketOf.sum += score; bucketOf.count++; }
        for (const combo of fired) {
          const id = typeof combo.id === 'string' && combo.id ? combo.id : (typeof combo.name === 'string' ? combo.name : '');
          if (!id) continue;
          const comboKey = key + '|' + id;
          const row = combos.get(comboKey) || { detector: name, detectorId: entry.id || '', category, id, name: typeof combo.name === 'string' ? combo.name : '', pages: 0, sum: 0, count: 0 };
          row.pages++;
          if (typeof combo.confidence === 'number' && Number.isFinite(combo.confidence)) { row.sum += combo.confidence; row.count++; }
          combos.set(comboKey, row);
        }
      }
      // Protections found on the same page, each pair once
      const pageKeys = [...pageNames.keys()].sort();
      for (let i = 0; i < pageKeys.length; i++) {
        for (let j = i + 1; j < pageKeys.length; j++) {
          const pairKey = pageKeys[i] + '\n' + pageKeys[j];
          const pair = pairs.get(pairKey) || { a: pageNames.get(pageKeys[i]), b: pageNames.get(pageKeys[j]), pages: 0 };
          pair.pages++;
          pairs.set(pairKey, pair);
        }
      }
      // What each saved visit of a domain found, to spot changes between visits
      if (hostname && ts !== null && pageKeys.length) {
        const visits = visitsByDomain.get(hostname) || [];
        visits.push({ ts, keys: pageKeys, names: new Map(pageNames) });
        visitsByDomain.set(hostname, visits);
      }
      for (const a of pageCategories) for (const b of pageCategories) categoryOverlap[a][b]++;
      if (ts !== null) {
        first = first === null ? ts : Math.min(first, ts);
        last = last === null ? ts : Math.max(last, ts);
        const key = HistoryStats.dayKey(ts);
        const day = perDay.get(key) || bucket();
        addBucket(day, detections, hostname);
        perDay.set(key, day);
        const date = new Date(ts);
        addBucket(hourly[date.getHours()], detections, hostname);
        addBucket(weekdays[date.getDay()], detections, hostname);
      }
    }
    const timeline = [];
    const today = new Date(now);
    today.setHours(12, 0, 0, 0);
    // Filter separately so future timestamps on today's date cannot enter the timeline.
    const timelineBuckets = new Map();
    for (const item of HistoryStats.filterByRange(list, days, now)) {
      const key = HistoryStats.dayKey(HistoryStats.getTimestamp(item));
      const b = timelineBuckets.get(key) || bucket();
      const ds = Array.isArray(item.detections) ? item.detections.filter(HistoryStats.isRecord) : [];
      const host = (typeof item.hostname === 'string' && item.hostname.trim() ? item.hostname.trim() : HistoryStats.hostnameFromUrl(item.url)).toLowerCase();
      addBucket(b, ds, host);
      timelineBuckets.set(key, b);
    }
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = HistoryStats.dayKey(date.getTime());
      timeline.push({ date: key, ...outputBucket(timelineBuckets.get(key) || bucket()) });
    }
    const byCount = (field) => (a, b) => b[field] - a[field] || String(a.name || a.hostname).localeCompare(String(b.name || b.hostname));
    const detectorMetrics = Array.from(detectors.values(), (d) => ({ name: d.name, id: d.id, category: d.category, pages: d.pages, domains: d.domains.size, avgConfidence: average(d.sum, d.count),
      matches: d.matchCount, avgMatchConfidence: average(d.matchSum, d.matchCount) })).sort(byCount('pages'));
    const signalMetrics = Array.from(signals.values(), (row) => ({ detector: row.detector, detectorId: row.detectorId, category: row.category, method: row.method, label: row.label,
      pages: row.pages, matches: row.matches, avgConfidence: average(row.sum, row.count) }))
      .sort((a, b) => b.pages - a.pages || b.matches - a.matches || a.label.localeCompare(b.label));
    const weakEvidence = detectorMetrics.filter((row) => row.avgMatchConfidence !== null && row.avgMatchConfidence < 60)
      .sort((a, b) => a.avgMatchConfidence - b.avgMatchConfidence || b.pages - a.pages).slice(0, 12);
    const combinationMetrics = Array.from(combos.values(), (row) => ({ detector: row.detector, detectorId: row.detectorId, category: row.category, id: row.id, name: row.name,
      pages: row.pages, avgConfidence: average(row.sum, row.count) })).sort((a, b) => b.pages - a.pages || a.detector.localeCompare(b.detector));
    const togetherMetrics = Array.from(pairs.values()).sort((a, b) => b.pages - a.pages || a.a.localeCompare(b.a)).slice(0, 50);
    const domainChanges = [];
    for (const [hostname, visits] of visitsByDomain) {
      visits.sort((a, b) => a.ts - b.ts);
      for (let i = 1; i < visits.length; i++) {
        const before = new Set(visits[i - 1].keys), now = new Set(visits[i].keys);
        const added = visits[i].keys.filter((k) => !before.has(k)).map((k) => visits[i].names.get(k));
        const removed = visits[i - 1].keys.filter((k) => !now.has(k)).map((k) => visits[i - 1].names.get(k));
        if (added.length || removed.length) domainChanges.push({ hostname, timestamp: visits[i].ts, previous: visits[i - 1].ts, added, removed });
      }
    }
    domainChanges.sort((a, b) => b.timestamp - a.timestamp || a.hostname.localeCompare(b.hostname));
    const decidedOut = (b) => ({ detections: b.detections, avgConfidence: average(b.sum, b.count) });
    const domainMetrics = Array.from(domains.values(), (d) => ({ hostname: d.hostname, visits: d.visits, detections: d.detections, uniqueDetectors: d.names.size, avgConfidence: average(d.sum, d.count) })).sort(byCount('visits'));
    return {
      totals: { entries: list.length, uniqueDomains: domains.size, detections: totalDetections, uniqueDetectors: detectors.size, entriesWithDetections,
        avgDetectionsPerEntry: list.length ? totalDetections / list.length : 0, avgConfidence: average(confidenceSum, confidenceCount) ?? 0,
        firstTimestamp: first, lastTimestamp: last, activeDays: perDay.size, detectionRate: list.length ? entriesWithDetections / list.length * 100 : 0,
        validConfidenceCount: confidenceCount, unknownConfidenceCount: totalDetections - confidenceCount },
      topDetectors: detectorMetrics.slice(0, top).map(({ name, category, pages, domains }) => ({ name, category, pages, domains })),
      topDomains: domainMetrics.slice(0, top).map(({ hostname, visits, detections }) => ({ hostname, visits, detections })),
      categories, difficulty, timeline,
      hourly: hourly.map((b, hour) => ({ hour, ...outputBucket(b) })),
      weekdays: weekdays.map((b, weekday) => ({ weekday, ...outputBucket(b) })),
      confidenceBuckets,
      categoryConfidence: categoryConfidence.map(({ category, detections, withConfidence, sum }) => ({ category, detections, withConfidence, avgConfidence: average(sum, withConfidence) })),
      categoryOverlap, detectorMetrics, domainMetrics,
      methods, methodsByCategory, totalMatches, signalMetrics, weakEvidence,
      decided: { single: decidedOut(decided.single), combination: decidedOut(decided.combination) },
      combinationMetrics, togetherMetrics, domainChanges: domainChanges.slice(0, 200), domainChangeCount: domainChanges.length
    };
  },
  hostnameFromUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    try { return new URL(url).hostname; } catch (_) { return ''; }
  }
};
if (typeof window !== 'undefined') window.HistoryStats = HistoryStats;
else if (typeof self !== 'undefined') self.HistoryStats = HistoryStats;
if (typeof module !== 'undefined' && module.exports) module.exports = HistoryStats;
