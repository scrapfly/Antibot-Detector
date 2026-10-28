/** Pure aggregation of recorded history entries, not a measure of all browsing. */
// The detection categories are described once, in modules/core/categories.js (the stats page loads it first)
if (typeof Categories === 'undefined' && typeof module !== 'undefined' && typeof require === 'function') {
  globalThis.Categories = require('../../modules/core/categories.js');
}
const HistoryStats = {
  DAY_MS: 86400000,
  /** Category keys of a detection, the scope a page can show, and how stacks and chips are ordered. */
  SCOPE_KEYS: [...Categories.KEYS_AND_OTHER],
  /** Fingerprinting is API-use telemetry, so it starts hidden. */
  DEFAULT_SCOPE: ['antibot', 'captcha', 'other'],
  CATEGORY_ORDER: ['captcha', 'antibot', 'other', 'fingerprint'],
  DIFFICULTY_RANK: { None: 0, Low: 1, Medium: 2, High: 3 },
  /** Evidence tiers: strong >= 80, moderate 40 to 79, weak < 40. 100 is a signal only that vendor produces. */
  STRONG_MIN: 80,
  MODERATE_MIN: 40,
  /** A protection moves when it changes by at least this many pages and this share of its previous pages. */
  MOVER_MIN: 3,
  MOVER_RATIO: 0.25,
  /** The previous period needs this share of its days covered by History before it is compared. */
  COMPARE_MIN_COVERAGE: 0.8,
  MIN_TIMESTAMP: 946684800000, // 2000-01-01: earlier dates are not saved visits
  /** Below this previous value a change is shown as an absolute number; below this share it is flat. */
  DELTA_SMALL_BASE: 10,
  DELTA_FLAT_RATIO: 0.05,
  UNCONFIRMED_MIN_PAGES: 3,
  _categoryCache: new Map(),
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
    // A date before 2000 is not a saved visit (0, a negative number, seconds instead of milliseconds): unknown, not 1970
    return Number.isFinite(ts) && Number.isFinite(new Date(ts).getTime()) && ts >= HistoryStats.MIN_TIMESTAMP ? ts : null;
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
    const cache = HistoryStats._categoryCache;
    const text = typeof category === 'string';
    if (text) { const hit = cache.get(category); if (hit !== undefined) return hit; }
    const result = Categories.keyOf(category);
    if (text && cache.size < 256) cache.set(category, result);
    return result;
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
  /**
   * Protections and domains whose first saved entry (in all of History) falls at or after `since`.
   * oldestTs is the oldest saved entry up to now; baselineComplete says History reaches back past
   * `since`, so "first seen in this range" means new rather than "History starts here".
   */
  firstSeen(allItems, since, now = Date.now()) {
    const out = { protections: [], domains: [], oldestTs: null, baselineComplete: false };
    const end = HistoryStats.referenceTime(now);
    const track = typeof since === 'number' && Number.isFinite(since);
    const protections = new Map(), domains = new Map();
    let oldest = null;
    for (const item of Array.isArray(allItems) ? allItems : []) {
      if (!HistoryStats.isRecord(item)) continue;
      const ts = HistoryStats.getTimestamp(item);
      if (ts === null || ts > end) continue;
      if (oldest === null || ts < oldest) oldest = ts;
      if (!track) continue;
      const hostname = HistoryStats.hostOf(item);
      if (hostname) {
        const d = domains.get(hostname);
        if (!d || ts < d.ts) domains.set(hostname, { hostname, ts });
      }
      for (const detection of Array.isArray(item.detections) ? item.detections : []) {
        const name = HistoryStats.detectionName(detection);
        if (!name) continue;
        const key = Categories.protectionKey(name), p = protections.get(key);
        if (!p || ts < p.ts) protections.set(key, { name, category: HistoryStats.detectionCategory(detection), ts, hostname });
      }
    }
    out.oldestTs = oldest;
    out.baselineComplete = track && oldest !== null && oldest < since;
    if (!track) return out;
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
   * It never reads a category scope: call scopeItems first. The result holds no Sets or Maps.
   */
  compute(items, options = {}) {
    options = HistoryStats.isRecord(options) ? options : {};
    const now = HistoryStats.referenceTime(options.now);
    const days = HistoryStats.timelineDays(items, options.days === undefined ? 30 : options.days, now, options.maxDays);
    const top = typeof options.top === 'number' && Number.isFinite(options.top) ? Math.max(1, Math.floor(options.top)) : 8;
    const list = Array.isArray(items) ? items.filter(HistoryStats.isRecord) : [];
    const keys = HistoryStats.SCOPE_KEYS;
    const emptyCategories = () => Object.fromEntries(keys.map((key) => [key, 0]));
    const bucket = () => ({ entries: 0, detections: 0, categories: emptyCategories(), domains: new Set(), sum: 0, count: 0 });
    const dayBucket = () => ({ ...bucket(), names: new Set(), layeredHosts: new Set() });
    const average = (sum, count) => count ? Math.round(sum / count) : null;
    const outputBucket = (b) => ({ entries: b.entries, detections: b.detections, categories: b.categories, uniqueDomains: b.domains.size, avgConfidence: average(b.sum, b.count) });
    const domains = new Map(), detectors = new Map(), perDay = new Map();
    const categories = emptyCategories();
    const difficulty = { High: 0, Medium: 0, Low: 0, None: 0 };
    const levelOfRank = ['None', 'Low', 'Medium', 'High'];
    const hourly = Array.from({ length: 24 }, bucket);
    const weekdays = Array.from({ length: 7 }, bucket);
    const confidenceBuckets = [0, 20, 40, 60, 80].map((min) => ({ label: `${min}-${min === 80 ? 100 : min + 19}`, min, max: min === 80 ? 100 : min + 19, count: 0 }));
    const confidenceByCategory = confidenceBuckets.map(({ min, max }) => ({ min, max, ...emptyCategories() }));
    const categoryConfidence = keys.map((category) => ({ category, detections: 0, withConfidence: 0, sum: 0, strong: 0 }));
    const categoryOverlap = Object.fromEntries(keys.map((key) => [key, emptyCategories()]));
    const methodKeys = [...HistoryStats.METHODS, 'other'];
    const emptyMethods = () => Object.fromEntries(methodKeys.map((key) => [key, 0]));
    const methods = emptyMethods();
    const methodsByCategory = Object.fromEntries(keys.map((key) => [key, emptyMethods()]));
    const signals = new Map(), combos = new Map(), pairs = new Map(), visitsByDomain = new Map();
    const decided = { single: { detections: 0, sum: 0, count: 0 }, combination: { detections: 0, sum: 0, count: 0 } };
    const decidedBy = Object.fromEntries(keys.map((key) => [key, { single: { detections: 0, sum: 0, count: 0 }, combination: { detections: 0, sum: 0, count: 0 } }]));
    const pageTiers = { both: 0, antibot: 0, captcha: 0, none: 0 };
    const timelineBuckets = new Map();
    // The timeline ends at `now`: a future timestamp on today's date must not enter it.
    const tlStart = HistoryStats.rangeStart(days, now);
    const timelineStart = Number.isFinite(tlStart) ? tlStart : -8640000000000000;
    const { STRONG_MIN, CATEGORY_ORDER, DIFFICULTY_RANK } = HistoryStats;
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
      const safeLevel = Object.hasOwn(difficulty, level) ? level : 'Medium';
      difficulty[safeLevel]++;
      let domain;
      if (hostname) {
        domain = domains.get(hostname) || { hostname, visits: 0, detections: 0, names: new Map(), sum: 0, count: 0, rank: 0, hasCaptcha: false, maxStack: 0, firstTs: null, lastTs: null, latestTs: 0, latestNames: null, latestCats: null };
        domain.visits++;
        domain.detections += detections.length;
        const rank = DIFFICULTY_RANK[safeLevel];
        if (rank > domain.rank) domain.rank = rank;
        if (ts !== null) {
          if (domain.firstTs === null || ts < domain.firstTs) domain.firstTs = ts;
          if (domain.lastTs === null || ts > domain.lastTs) domain.lastTs = ts;
        }
        domains.set(hostname, domain);
      }
      const seen = new Set(), pageCategories = new Set(), pageNames = new Map(), pageCats = new Map();
      for (const detection of detections) {
        const name = HistoryStats.detectionName(detection);
        const category = HistoryStats.detectionCategory(detection);
        const score = HistoryStats.confidenceOf(detection);
        categories[category]++;
        pageCategories.add(category);
        if (domain && category === 'captcha') domain.hasCaptcha = true;
        const cc = categoryConfidence[keys.indexOf(category)];
        cc.detections++;
        if (score !== null) {
          confidenceSum += score; confidenceCount++;
          cc.sum += score; cc.withConfidence++;
          if (score >= STRONG_MIN) cc.strong++;
          const band = Math.min(4, Math.floor(score / 20));
          confidenceBuckets[band].count++;
          confidenceByCategory[band][category]++;
          if (domain) { domain.sum += score; domain.count++; }
        }
        if (!name) continue;
        const key = Categories.protectionKey(name);
        if (domain && !domain.names.has(key)) domain.names.set(key, { name, category });
        const entry = detectors.get(key) || { name, category, id: '', pages: 0, domains: new Set(), sum: 0, count: 0, matchSum: 0, matchCount: 0, strong: 0, moderate: 0, weak: 0 };
        if (!seen.has(key)) { entry.pages++; seen.add(key); }
        if (hostname) entry.domains.add(hostname);
        if (score !== null) {
          entry.sum += score; entry.count++;
          entry[HistoryStats.tierOf(score)]++;
        }
        if (!entry.id) {
          const nested = HistoryStats.isRecord(detection.detector) ? detection.detector : {};
          const id = nested.id || detection.id;
          if (typeof id === 'string' && id) entry.id = id;
        }
        detectors.set(key, entry);
        pageNames.set(key, name);
        if (!pageCats.has(key)) pageCats.set(key, category);
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
        const way = fired.length ? 'combination' : 'single';
        const bucketOf = decided[way], bucketBy = decidedBy[category][way];
        bucketOf.detections++;
        bucketBy.detections++;
        if (score !== null) { bucketOf.sum += score; bucketOf.count++; bucketBy.sum += score; bucketBy.count++; }
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
      // Layered means protections together on ONE saved page; a site that changed provider is not layered
      let pageProtections = 0;
      for (const category of pageCats.values()) if (category !== 'fingerprint') pageProtections++;
      if (domain && pageProtections > domain.maxStack) domain.maxStack = pageProtections;
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
      // The latest saved entry of a domain says what protects it now; an entry without a date counts as earlier
      if (domain) {
        const at = ts === null ? -Infinity : ts;
        if (domain.latestNames === null || at > domain.latestTs) { domain.latestTs = at; domain.latestNames = pageNames; domain.latestCats = pageCats; }
      }
      // How protected the page is: CAPTCHA together with anti-bot, one of them, or neither
      const hasCaptcha = pageCategories.has('captcha'), hasBot = pageCategories.has('antibot') || pageCategories.has('other');
      if (hasCaptcha && hasBot) pageTiers.both++;
      else if (hasBot) pageTiers.antibot++;
      else if (hasCaptcha) pageTiers.captcha++;
      else pageTiers.none++;
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
        if (ts >= timelineStart && ts <= now) {
          const b = timelineBuckets.get(key) || dayBucket();
          addBucket(b, detections, hostname);
          for (const name of pageNames.keys()) b.names.add(name);
          if (hostname && pageProtections >= 2) b.layeredHosts.add(hostname);
          timelineBuckets.set(key, b);
        }
      }
    }
    const timeline = [];
    const today = new Date(now);
    today.setHours(12, 0, 0, 0);
    const todayKey = HistoryStats.dayKey(now);
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const key = HistoryStats.dayKey(date.getTime());
      const b = timelineBuckets.get(key) || dayBucket();
      timeline.push({ date: key, ...outputBucket(b), protections: b.names.size, layeredDomains: b.layeredHosts.size, partial: key === todayKey });
    }
    const byCount = (field) => (a, b) => b[field] - a[field] || String(a.name || a.hostname).localeCompare(String(b.name || b.hostname));
    const detectorMetrics = Array.from(detectors.values(), (d) => ({ name: d.name, id: d.id, category: d.category, pages: d.pages, domains: d.domains.size, avgConfidence: average(d.sum, d.count),
      matches: d.matchCount, avgMatchConfidence: average(d.matchSum, d.matchCount), strong: d.strong, moderate: d.moderate, weak: d.weak })).sort(byCount('pages'));
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
    const byOrder = (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name);
    const domainMetrics = Array.from(domains.values(), (d) => ({ hostname: d.hostname, visits: d.visits, detections: d.detections, uniqueDetectors: d.names.size, avgConfidence: average(d.sum, d.count),
      difficulty: levelOfRank[d.rank], hasCaptcha: d.hasCaptcha,
      stack: Array.from(d.names.values()).sort(byOrder).slice(0, 8).map(({ name, category }) => ({ name, category })), stackTotal: d.names.size, maxStack: d.maxStack,
      firstTimestamp: d.firstTs, lastTimestamp: d.lastTs })).sort(byCount('visits'));
    // Protections found often but rarely with strong evidence: text mentions or unused scripts rather than a challenge
    const unconfirmed = detectorMetrics.filter((row) => {
      const scored = row.strong + row.moderate + row.weak;
      return row.category !== 'fingerprint' && row.pages >= HistoryStats.UNCONFIRMED_MIN_PAGES && scored > 0 && row.strong / scored < 0.5;
    }).sort((a, b) => b.weak - a.weak || b.pages - a.pages || a.name.localeCompare(b.name)).slice(0, 12).map((row) => {
      const lower = Categories.protectionKey(row.name);
      let driver = null;
      for (const signal of signalMetrics) {
        if (Categories.protectionKey(signal.detector) !== lower || (signal.avgConfidence !== null && signal.avgConfidence >= HistoryStats.MODERATE_MIN)) continue;
        if (!driver || signal.pages > driver.pages || (signal.pages === driver.pages && (signal.matches > driver.matches || (signal.matches === driver.matches && signal.label.localeCompare(driver.label) < 0)))) driver = signal;
      }
      return { name: row.name, id: row.id, category: row.category, pages: row.pages, strong: row.strong, moderate: row.moderate, weak: row.weak,
        driver: driver ? { method: driver.method, label: driver.label, pages: driver.pages, avgConfidence: driver.avgConfidence, detectorId: driver.detectorId } : null };
    });
    // Which anti-bot and CAPTCHA protections sit together on a domain's latest saved page
    const stackGroups = new Map();
    for (const d of domains.values()) {
      if (!d.latestNames) continue;
      const found = [];
      for (const [key, name] of d.latestNames) {
        const category = d.latestCats.get(key);
        if (category !== 'fingerprint') found.push({ key, name, category });
      }
      if (!found.length) continue;
      const sortedKeys = found.map((row) => row.key).sort();
      const groupKey = sortedKeys.join('\n');
      const group = stackGroups.get(groupKey) || { keys: sortedKeys, names: found.sort(byOrder).map((row) => row.name), domains: [] };
      group.domains.push(d);
      stackGroups.set(groupKey, group);
    }
    const stackMetrics = Array.from(stackGroups.values(), (g) => ({ keys: g.keys, names: g.names, domains: g.domains.length,
      hostnames: g.domains.sort((a, b) => b.visits - a.visits || a.hostname.localeCompare(b.hostname)).slice(0, 3).map((d) => d.hostname) }))
      .sort((a, b) => b.domains - a.domains || b.keys.length - a.keys.length || a.names.join('\n').localeCompare(b.names.join('\n'))).slice(0, 20);
    return {
      totals: { entries: list.length, uniqueDomains: domains.size, detections: totalDetections, uniqueDetectors: detectors.size, entriesWithDetections,
        avgDetectionsPerEntry: list.length ? totalDetections / list.length : 0, avgConfidence: average(confidenceSum, confidenceCount) ?? 0,
        firstTimestamp: first, lastTimestamp: last, activeDays: perDay.size, detectionRate: list.length ? entriesWithDetections / list.length * 100 : 0,
        validConfidenceCount: confidenceCount, unknownConfidenceCount: totalDetections - confidenceCount },
      topDetectors: detectorMetrics.slice(0, top).map(({ name, category, pages, domains }) => ({ name, category, pages, domains })),
      topDomains: domainMetrics.slice(0, top).map(({ hostname, visits, detections }) => ({ hostname, visits, detections })),
      categories, difficulty, timeline, pageTiers,
      hourly: hourly.map((b, hour) => ({ hour, ...outputBucket(b) })),
      weekdays: weekdays.map((b, weekday) => ({ weekday, ...outputBucket(b) })),
      confidenceBuckets, confidenceByCategory,
      categoryConfidence: categoryConfidence.map(({ category, detections, withConfidence, sum, strong }) => ({ category, detections, withConfidence, avgConfidence: average(sum, withConfidence), strong })),
      categoryOverlap, detectorMetrics, domainMetrics,
      methods, methodsByCategory, totalMatches, signalMetrics, weakEvidence,
      decided: { single: decidedOut(decided.single), combination: decidedOut(decided.combination) },
      decidedByCategory: Object.fromEntries(keys.map((key) => [key, { single: decidedOut(decidedBy[key].single), combination: decidedOut(decidedBy[key].combination) }])),
      combinationMetrics, togetherMetrics, domainChanges: domainChanges.slice(0, 200), domainChangeCount: domainChanges.length,
      unconfirmed, stackMetrics
    };
  },
  /** 'strong' (80 and up), 'moderate' (40 to 79), 'weak' (below 40), or 'unknown' when there is no score in 0..100. */
  tierOf(score) {
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) return 'unknown';
    return score >= HistoryStats.STRONG_MIN ? 'strong' : score >= HistoryStats.MODERATE_MIN ? 'moderate' : 'weak';
  },
  /**
   * Keeps only the detections whose category is in `scope` (an array or Set of SCOPE_KEYS).
   * Entries are never dropped, so page and domain counts do not depend on the scope. A scope
   * holding every category, or none we know, returns the same array at no cost.
   */
  scopeItems(items, scope) {
    if (!Array.isArray(items)) return [];
    const keep = new Set();
    for (const key of scope instanceof Set || Array.isArray(scope) ? scope : []) {
      if (HistoryStats.SCOPE_KEYS.includes(key)) keep.add(key);
    }
    if (!keep.size || keep.size === HistoryStats.SCOPE_KEYS.length) return items;
    return items.map((item) => {
      if (!HistoryStats.isRecord(item) || !Array.isArray(item.detections)) return item;
      const detections = item.detections.filter((d) => HistoryStats.isRecord(d) && keep.has(HistoryStats.detectionCategory(d)));
      return detections.length === item.detections.length ? item : { ...item, detections };
    });
  },
  /** Detections per category, and the entries that hold at least one fingerprint detection. */
  categoryCounts(items) {
    const out = { ...Object.fromEntries(HistoryStats.SCOPE_KEYS.map((key) => [key, 0])), total: 0, fingerprintPages: 0 };
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item) || !Array.isArray(item.detections)) continue;
      let fingerprint = false;
      for (const detection of item.detections) {
        if (!HistoryStats.isRecord(detection)) continue;
        const category = HistoryStats.detectionCategory(detection);
        out[category]++;
        out.total++;
        if (category === 'fingerprint') fingerprint = true;
      }
      if (fingerprint) out.fingerprintPages++;
    }
    return out;
  },
  /** One category on its own: pages, detections, distinct techniques, average confidence and the three most common techniques. */
  categoryProfile(items, category) {
    const names = new Map();
    let pages = 0, detections = 0, sum = 0, count = 0;
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item) || !Array.isArray(item.detections)) continue;
      let hit = false;
      const seen = new Set();
      for (const detection of item.detections) {
        if (!HistoryStats.isRecord(detection) || HistoryStats.detectionCategory(detection) !== category) continue;
        hit = true;
        detections++;
        const score = HistoryStats.confidenceOf(detection);
        if (score !== null) { sum += score; count++; }
        const name = HistoryStats.detectionName(detection);
        if (!name) continue;
        const key = Categories.protectionKey(name);
        const row = names.get(key) || { name, pages: 0 };
        if (!seen.has(key)) { row.pages++; seen.add(key); }
        names.set(key, row);
      }
      if (hit) pages++;
    }
    const techniques = Array.from(names.values()).sort((a, b) => b.pages - a.pages || a.name.localeCompare(b.name)).slice(0, 3).map(({ name, pages: p }) => ({ name, pages: p }));
    return { pages, detections, distinct: names.size, avgConfidence: count ? Math.round(sum / count) : null, techniques };
  },
  /**
   * The window of the same number of local calendar days right before the range that starts at
   * rangeStart(days). null for "All". coverage is the share of that window History reaches back
   * to; the comparison is usable from COMPARE_MIN_COVERAGE.
   */
  previousWindow(items, days, now = Date.now()) {
    if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) return null;
    const count = HistoryStats.rangeDays(days);
    const current = HistoryStats.rangeStart(count, now);
    if (current === null || !Number.isFinite(current)) return null;
    const startDate = new Date(current);
    startDate.setDate(startDate.getDate() - count);
    const start = startDate.getTime();
    const rows = [];
    let oldest = null;
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item)) continue;
      const ts = HistoryStats.getTimestamp(item);
      if (ts === null) continue;
      if (oldest === null || ts < oldest) oldest = ts;
      if (ts >= start && ts < current) rows.push(item);
    }
    const coverage = oldest === null ? 0 : Math.min(1, Math.max(0, (current - Math.max(start, oldest)) / (current - start)));
    return { start, end: current - 1, items: rows, oldest, coverage, usable: coverage >= HistoryStats.COMPARE_MIN_COVERAGE };
  },
  /** Light single pass over the entries: what the comparison with the previous period needs. */
  summary(items) {
    const out = { pages: 0, pagesWithDetections: 0, domains: 0, domainsWithDetections: 0, layeredDomains: 0, captchaDomains: 0, protections: 0, detections: 0 };
    const hosts = new Map(), names = new Set();
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item)) continue;
      out.pages++;
      const host = HistoryStats.hostOf(item);
      let row = null;
      if (host) {
        row = hosts.get(host);
        if (!row) { row = { found: false, captcha: false, names: new Set(), maxPage: 0 }; hosts.set(host, row); }
      }
      let found = false;
      const pageProtections = new Set();
      for (const detection of Array.isArray(item.detections) ? item.detections : []) {
        if (!HistoryStats.isRecord(detection)) continue;
        found = true;
        out.detections++;
        const category = HistoryStats.detectionCategory(detection);
        const name = HistoryStats.detectionName(detection);
        if (name) names.add(Categories.protectionKey(name));
        if (!row) continue;
        row.found = true;
        if (category === 'captcha') row.captcha = true;
        if (name && category !== 'fingerprint') { row.names.add(Categories.protectionKey(name)); pageProtections.add(Categories.protectionKey(name)); }
      }
      if (row && pageProtections.size > row.maxPage) row.maxPage = pageProtections.size;
      if (found) out.pagesWithDetections++;
    }
    out.domains = hosts.size;
    out.protections = names.size;
    for (const row of hosts.values()) {
      if (row.found) out.domainsWithDetections++;
      if (row.maxPage >= 2) out.layeredDomains++;
      if (row.captcha) out.captchaDomains++;
    }
    return out;
  },
  /** Map of lower-cased protection name to { name, category, pages }: entries that hold it at least once. */
  protectionIndex(items) {
    const index = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item) || !Array.isArray(item.detections)) continue;
      const seen = new Set();
      for (const detection of item.detections) {
        const name = HistoryStats.detectionName(detection);
        if (!name) continue;
        const key = Categories.protectionKey(name);
        const row = index.get(key) || { name, category: HistoryStats.detectionCategory(detection), pages: 0 };
        if (!seen.has(key)) { row.pages++; seen.add(key); }
        index.set(key, row);
      }
    }
    return index;
  },
  /**
   * Change between two values, as a neutral kind. Below DELTA_SMALL_BASE the previous value is too
   * small for a percentage, so ratio is null; under DELTA_FLAT_RATIO of change counts as flat.
   */
  delta(cur, prev) {
    if (typeof cur !== 'number' || typeof prev !== 'number' || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
    if (cur === 0 && prev === 0) return null;
    if (prev === 0) return cur > 0 ? { kind: 'new', diff: cur, ratio: null } : null;
    const diff = cur - prev;
    if (prev < HistoryStats.DELTA_SMALL_BASE) return { kind: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat', diff, ratio: null };
    const ratio = diff / prev;
    if (Math.abs(ratio) < HistoryStats.DELTA_FLAT_RATIO) return { kind: 'flat', diff, ratio };
    return { kind: diff > 0 ? 'up' : 'down', diff, ratio };
  },
  /**
   * Protections that rose, fell or vanished between two protectionIndex() maps. `exclude` holds
   * lower-cased names first seen in the range: those are new, not rising.
   */
  movers(cur, prev, options = {}) {
    options = HistoryStats.isRecord(options) ? options : {};
    const min = typeof options.min === 'number' ? options.min : HistoryStats.MOVER_MIN;
    const ratio = typeof options.ratio === 'number' ? options.ratio : HistoryStats.MOVER_RATIO;
    const limit = typeof options.limit === 'number' && options.limit >= 0 ? Math.floor(options.limit) : 4;
    const exclude = options.exclude instanceof Set ? options.exclude : new Set(Array.isArray(options.exclude) ? options.exclude : []);
    const now = cur instanceof Map ? cur : new Map(), before = prev instanceof Map ? prev : new Map();
    const rows = [];
    for (const [key, row] of now) {
      const old = before.get(key);
      rows.push({ key, name: row.name, category: row.category, now: row.pages, before: old ? old.pages : 0 });
    }
    for (const [key, row] of before) {
      if (!now.has(key)) rows.push({ key, name: row.name, category: row.category, now: 0, before: row.pages });
    }
    const big = (row) => Math.abs(row.diff) >= min && (row.before === 0 || Math.abs(row.diff) / row.before >= ratio);
    const order = (a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name);
    const out = { rising: [], falling: [], gone: [] };
    for (const r of rows) {
      const row = { name: r.name, category: r.category, now: r.now, before: r.before, diff: r.now - r.before };
      if (row.diff > 0 && big(row) && !exclude.has(r.key)) out.rising.push(row);
      else if (row.diff < 0 && row.now > 0 && big(row)) out.falling.push(row);
      else if (row.now === 0 && row.before >= min) out.gone.push(row);
    }
    for (const key of Object.keys(out)) out[key] = out[key].sort(order).slice(0, limit);
    return out;
  },
  /** The domains that are hardest to scrape first: difficulty, then protections, then pages. Same row objects. */
  hardestDomains(rows, limit) {
    const rank = (row) => HistoryStats.DIFFICULTY_RANK[row.difficulty] || 0;
    const list = (Array.isArray(rows) ? rows : []).filter((row) => HistoryStats.isRecord(row) && row.uniqueDetectors > 0)
      .sort((a, b) => rank(b) - rank(a) || b.uniqueDetectors - a.uniqueDetectors || b.visits - a.visits || String(a.hostname).localeCompare(String(b.hostname)));
    return typeof limit === 'number' && Number.isFinite(limit) ? list.slice(0, Math.max(0, Math.floor(limit))) : list;
  },
  // History's Changed rule (HistoryPolicy): found from SURE, gone below MAYBE
  CHANGE_SURE: 50,
  CHANGE_MAYBE: 25,
  /** A path segment that names one record rather than one page: digits, a UUID or a long opaque token. */
  isIdSegment(segment) {
    return /^\d+$/.test(segment) || /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment) ||
      (segment.length >= 20 && /\d/.test(segment) && /^[0-9a-z_-]+$/.test(segment));
  },
  /**
   * The page an entry belongs to: its lower-cased path without trailing slashes, ids replaced by
   * ':id'. Never the query or the hash. '' when the entry has no usable URL.
   */
  pageKey(item) {
    const raw = typeof item === 'string' ? item : HistoryStats.isRecord(item) ? item.url : null;
    if (typeof raw !== 'string' || !raw) return '';
    let path;
    try { path = new URL(raw).pathname; } catch (_) { return ''; }
    let key = path.toLowerCase().split('/').map((segment) => HistoryStats.isIdSegment(segment) ? ':id' : segment).join('/').replace(/\/+$/, '');
    if (key && !key.startsWith('/')) key = '/' + key;
    return key || '/';
  },
  /**
   * Protections a page gained or lost between two saved copies of the same page (same domain and
   * pageKey). `items` is all of History, already scoped, so the first copy inside the range is
   * compared with the last one before it. Rows with a timestamp before `since` are dropped.
   * The same rule as History's Changed mark (HistoryPolicy.diffProtections): anti-bot and CAPTCHA
   * only, gained from 50% and lost below 25%, and a copy recorded from the cache is not a visit.
   */
  protectionChanges(items, options = {}) {
    options = HistoryStats.isRecord(options) ? options : {};
    const now = HistoryStats.referenceTime(options.now);
    const since = typeof options.since === 'number' && Number.isFinite(options.since) ? options.since : null;
    const groups = new Map(), paths = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item) || item.fromCache === true) continue;
      const ts = HistoryStats.getTimestamp(item);
      if (ts === null || ts > now) continue;
      const hostname = HistoryStats.hostOf(item);
      if (!hostname) continue;
      let path = typeof item.url === 'string' ? paths.get(item.url) : '';
      if (path === undefined) { path = HistoryStats.pageKey(item); paths.set(item.url, path); }
      const groupKey = hostname + '\n' + path;
      let group = groups.get(groupKey);
      if (!group) { group = { hostname, path, visits: [] }; groups.set(groupKey, group); }
      const names = new Map(), seen = new Set();
      for (const detection of Array.isArray(item.detections) ? item.detections : []) {
        const name = HistoryStats.detectionName(detection);
        const category = HistoryStats.detectionCategory(detection);
        if (!name || category === 'fingerprint') continue;
        const key = Categories.protectionKey(name);
        const score = HistoryStats.confidenceOf(detection);
        const value = score === null ? 100 : score; // saved without a score: found
        if (value >= HistoryStats.CHANGE_MAYBE) seen.add(key);
        if (value >= HistoryStats.CHANGE_SURE && !names.has(key)) names.set(key, { name, category });
      }
      group.visits.push({ ts, names, seen, order: group.visits.length });
    }
    const { CATEGORY_ORDER } = HistoryStats;
    const byOrder = (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) || a.name.localeCompare(b.name);
    const rows = [];
    for (const group of groups.values()) {
      const visits = group.visits;
      if (visits.length < 2) continue;
      visits.sort((a, b) => a.ts - b.ts || a.order - b.order);
      for (let i = 1; i < visits.length; i++) {
        const current = visits[i], previous = visits[i - 1];
        if (since !== null && current.ts < since) continue;
        const added = [], removed = [];
        for (const [key, row] of current.names) if (!previous.seen.has(key)) added.push(row);
        for (const [key, row] of previous.names) if (!current.seen.has(key)) removed.push(row);
        if (!added.length && !removed.length) continue;
        rows.push({ hostname: group.hostname, path: group.path, timestamp: current.ts, previous: previous.ts, added: added.sort(byOrder), removed: removed.sort(byOrder),
          kind: added.length && removed.length ? 'replaced' : added.length ? 'gained' : 'dropped' });
      }
    }
    rows.sort((a, b) => b.timestamp - a.timestamp || a.hostname.localeCompare(b.hostname) || a.path.localeCompare(b.path));
    return { rows: rows.slice(0, 200), count: rows.length, hostnames: [...new Set(rows.map((row) => row.hostname))] };
  },
  /** Light per-protection summary, same values and order as compute().detectorMetrics, for rule statistics. */
  detectorSummary(items) {
    const map = new Map();
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item) || !Array.isArray(item.detections)) continue;
      const hostname = HistoryStats.hostOf(item);
      const seen = new Set();
      for (const detection of item.detections) {
        const name = HistoryStats.detectionName(detection);
        if (!name) continue;
        const key = Categories.protectionKey(name);
        const row = map.get(key) || { name, id: '', category: HistoryStats.detectionCategory(detection), pages: 0, domains: new Set(), sum: 0, count: 0 };
        if (!seen.has(key)) { row.pages++; seen.add(key); }
        if (hostname) row.domains.add(hostname);
        const score = HistoryStats.confidenceOf(detection);
        if (score !== null) { row.sum += score; row.count++; }
        if (!row.id) {
          const nested = HistoryStats.isRecord(detection.detector) ? detection.detector : {};
          const id = nested.id || detection.id;
          if (typeof id === 'string' && id) row.id = id;
        }
        map.set(key, row);
      }
    }
    return Array.from(map.values(), (row) => ({ name: row.name, id: row.id, category: row.category, pages: row.pages, domains: row.domains.size,
      avgConfidence: row.count ? Math.round(row.sum / row.count) : null })).sort((a, b) => b.pages - a.pages || a.name.localeCompare(b.name));
  },
  /** Over all of History: pages and first and last saved date per detector id and per lower-cased name. */
  detectorSeen(items) {
    const byId = new Map(), byName = new Map();
    const touch = (map, key, ts) => {
      let row = map.get(key);
      if (!row) { row = { pages: 0, firstTs: null, lastTs: null }; map.set(key, row); }
      row.pages++;
      if (ts !== null) {
        if (row.firstTs === null || ts < row.firstTs) row.firstTs = ts;
        if (row.lastTs === null || ts > row.lastTs) row.lastTs = ts;
      }
    };
    for (const item of Array.isArray(items) ? items : []) {
      if (!HistoryStats.isRecord(item) || !Array.isArray(item.detections)) continue;
      const ts = HistoryStats.getTimestamp(item);
      const ids = new Set(), names = new Set();
      for (const detection of item.detections) {
        if (!HistoryStats.isRecord(detection)) continue;
        const nested = HistoryStats.isRecord(detection.detector) ? detection.detector : {};
        const id = nested.id || detection.id;
        if (typeof id === 'string' && id) ids.add(id);
        const name = HistoryStats.detectionName(detection);
        if (name) names.add(Categories.protectionKey(name));
      }
      for (const id of ids) touch(byId, id, ts);
      for (const name of names) touch(byName, name, ts);
    }
    return { byId, byName };
  },
  /**
   * Facts for the activity tab, from compute()'s timeline and hourly. options.from (a YYYY-MM-DD
   * date key) ignores earlier timeline days, e.g. those before History began.
   */
  activityFacts(stats, options = {}) {
    const timeline = stats && Array.isArray(stats.timeline) ? stats.timeline : [];
    const hourly = stats && Array.isArray(stats.hourly) ? stats.hourly : [];
    const from = options && typeof options.from === 'string' ? options.from : null;
    const count = (row) => typeof row.entries === 'number' && Number.isFinite(row.entries) ? row.entries : 0;
    let busiest = null, streak = 0, longestStreak = 0, quietDays = 0;
    for (const row of timeline) {
      if (!HistoryStats.isRecord(row) || (from && String(row.date) < from)) continue;
      const entries = count(row);
      if (entries > 0) {
        streak++;
        longestStreak = Math.max(longestStreak, streak);
        if (!busiest || entries > busiest.entries || (entries === busiest.entries && String(row.date) > busiest.date)) busiest = { date: row.date, entries };
      } else {
        streak = 0;
        if (row.partial !== true) quietDays++;
      }
    }
    let peakHour = null;
    for (const row of hourly) {
      if (!HistoryStats.isRecord(row)) continue;
      const entries = count(row);
      if (entries > 0 && (!peakHour || entries > peakHour.entries || (entries === peakHour.entries && row.hour < peakHour.hour))) peakHour = { hour: row.hour, entries };
    }
    return { busiest, longestStreak, peakHour, quietDays };
  },
  hostnameFromUrl(url) {
    if (typeof url !== 'string' || !url) return '';
    try { return new URL(url).hostname; } catch (_) { return ''; }
  }
};
if (typeof window !== 'undefined') window.HistoryStats = HistoryStats;
else if (typeof self !== 'undefined') self.HistoryStats = HistoryStats;
if (typeof module !== 'undefined' && module.exports) module.exports = HistoryStats;
