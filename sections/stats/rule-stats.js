/** Pure statistics of the rule library (scrapfly_detectors), compared with what History found. */
const RuleStats = {
  /** Pattern list key and the field that names a pattern, per detection method. */
  METHOD_FIELDS: { cookie: 'name', header: 'name', url: 'text', content: 'text', dom: 'selector', window: 'path', js_hooks: 'target', payload: 'text' },
  isRecord(value) { return !!value && typeof value === 'object' && !Array.isArray(value); },
  /** Flat list of stored rules: { id, name, category, detector }. Accepts the stored wrapper, a JSON string or { detectors }. */
  parseDetectors(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { return []; }
    }
    const byCategory = RuleStats.isRecord(value) && RuleStats.isRecord(value.detectors) ? value.detectors : {};
    const list = [];
    for (const [category, detectors] of Object.entries(byCategory)) {
      if (!RuleStats.isRecord(detectors)) continue;
      for (const [key, detector] of Object.entries(detectors)) {
        if (!RuleStats.isRecord(detector)) continue;
        const id = typeof detector.id === 'string' && detector.id ? detector.id : key;
        const name = typeof detector.name === 'string' && detector.name.trim() ? detector.name.trim() : id;
        list.push({ id, name, category: String(category).toLowerCase(), detector });
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  },
  patternsOf(detector) {
    const detection = RuleStats.isRecord(detector && detector.detection) ? detector.detection : {};
    const out = [];
    for (const method of Object.keys(RuleStats.METHOD_FIELDS)) {
      for (const pattern of Array.isArray(detection[method]) ? detection[method] : []) {
        if (RuleStats.isRecord(pattern)) out.push({ method, pattern });
      }
    }
    return out;
  },
  /** Fallback when DetectionUtils is not loaded: an official id written by "Scrapfly". */
  defaultIsOfficial(officialIds) {
    const ids = officialIds instanceof Set ? officialIds : new Set(officialIds || []);
    return (detector) => ids.has(detector.id) && String(detector.author || '').trim().toLowerCase() === 'scrapfly';
  },
  /**
   * @param rules        parseDetectors() output
   * @param options.detectorMetrics HistoryStats detectorMetrics of the selected range
   * @param options.isOfficial      (detector) => boolean
   * @param options.incompatible    stored scrapfly_incompatible_updates
   * @param options.seen            HistoryStats.detectorSeen() of ALL History: tells a rule that was
   *                                seen before ('quiet') from one History never saw ('unseen')
   * @param options.historyEntries  number of entries in all of History; below minHistory a rule
   *                                that never matched proves little, so nothing needs attention
   * @param options.minHistory      default 50
   */
  compute(rules, options = {}) {
    const list = Array.isArray(rules) ? rules : [];
    const isOfficial = typeof options.isOfficial === 'function' ? options.isOfficial : RuleStats.defaultIsOfficial(options.officialIds);
    const metrics = Array.isArray(options.detectorMetrics) ? options.detectorMetrics : [];
    const pagesById = new Map(), pagesByName = new Map();
    for (const row of metrics) {
      if (row.id) pagesById.set(row.id, row);
      if (row.name) pagesByName.set(String(row.name).toLowerCase(), row);
    }
    const found = (rule) => pagesById.get(rule.id) || pagesByName.get(rule.name.toLowerCase()) || null;
    const seen = RuleStats.isRecord(options.seen) ? options.seen : {};
    const wasSeen = (rule) => (seen.byId instanceof Map && seen.byId.has(rule.id)) || (seen.byName instanceof Map && seen.byName.has(rule.name.toLowerCase()));
    const historyEntries = typeof options.historyEntries === 'number' && Number.isFinite(options.historyEntries) ? options.historyEntries : 0;
    const minHistory = typeof options.minHistory === 'number' && Number.isFinite(options.minHistory) ? options.minHistory : 50;
    const totals = { total: list.length, official: 0, custom: 0, modified: 0, disabled: 0, withCombinations: 0, patterns: 0, described: 0, enabled: 0, matched: 0, attention: 0, waiting: 0 };
    const patternsByMethod = Object.fromEntries(Object.keys(RuleStats.METHOD_FIELDS).map((key) => [key, 0]));
    const neverMatched = [], missingDescriptions = [], active = [];
    for (const rule of list) {
      const d = rule.detector;
      const official = !!isOfficial({ ...d, id: rule.id });
      if (official) totals.official++; else totals.custom++;
      if (official && d.userModified) totals.modified++;
      const enabled = d.enabled !== false;
      if (!enabled) totals.disabled++;
      else totals.enabled++;
      if (Array.isArray(d.combinations) && d.combinations.length) totals.withCombinations++;
      const patterns = RuleStats.patternsOf(d);
      let missing = 0;
      for (const { method, pattern } of patterns) {
        patternsByMethod[method]++;
        totals.patterns++;
        if (typeof pattern.description === 'string' && pattern.description.trim()) totals.described++;
        else missing++;
      }
      // Official rules are written and described by Scrapfly; only custom and edited rules are the user's to fix
      const kind = !official ? 'custom' : d.userModified ? 'edited' : 'official';
      const base = { id: rule.id, name: rule.name, category: rule.category, official, kind };
      if (missing && kind !== 'official') missingDescriptions.push({ ...base, missing, patterns: patterns.length });
      const hit = found(rule);
      if (hit) {
        active.push({ ...base, pages: hit.pages, domains: hit.domains, avgConfidence: hit.avgConfidence });
        if (enabled) totals.matched++;
      } else if (enabled) {
        const status = wasSeen(rule) ? 'quiet' : 'unseen';
        neverMatched.push({ ...base, patterns: patterns.length, status, attention: kind !== 'official' && status === 'unseen' && historyEntries >= minHistory });
      }
    }
    missingDescriptions.sort((a, b) => b.missing - a.missing || a.name.localeCompare(b.name));
    active.sort((a, b) => b.pages - a.pages || a.name.localeCompare(b.name));
    const waiting = (Array.isArray(options.incompatible) ? options.incompatible : []).filter(RuleStats.isRecord).map((u) => ({
      id: String(u.id || u.detectorId || ''), name: String(u.name || u.id || u.detectorId || ''),
      category: String(u.category || '').toLowerCase(),
      version: String(u.remoteVersion || ''), minExtensionVersion: String(u.minExtensionVersion || '')
    })).filter((u) => u.name);
    totals.waiting = waiting.length;
    totals.attention = neverMatched.filter((row) => row.attention).length + waiting.length;
    // Rules that need a look come first; the rest keep their name order
    neverMatched.sort((a, b) => Number(b.attention) - Number(a.attention));
    return { totals, patternsByMethod, neverMatched, missingDescriptions, active, waiting };
  },
  /**
   * Pattern descriptions of the rules, keyed by rule (id and lowercased name), method and
   * pattern text as HistoryStats.signalLabel names it, so Statistics can show the description.
   */
  descriptions(rules) {
    const out = new Map();
    for (const rule of Array.isArray(rules) ? rules : []) {
      for (const { method, pattern } of RuleStats.patternsOf(rule.detector)) {
        const description = typeof pattern.description === 'string' ? pattern.description.replace(/\s+/g, ' ').trim() : '';
        const field = pattern[RuleStats.METHOD_FIELDS[method]];
        if (!description || typeof field !== 'string' || !field.trim()) continue;
        const label = method === 'cookie' || method === 'header' ? field.trim().toLowerCase() : field.trim();
        for (const owner of [rule.id, rule.name.toLowerCase()]) out.set(owner + '|' + method + '|' + label, description);
      }
    }
    return out;
  },
  descriptionOf(map, signal) {
    if (!(map instanceof Map) || !signal) return '';
    const label = signal.method === 'cookie' || signal.method === 'header' ? String(signal.label).toLowerCase() : String(signal.label);
    return map.get((signal.detectorId || '') + '|' + signal.method + '|' + label)
      || map.get(String(signal.detector || '').toLowerCase() + '|' + signal.method + '|' + label) || '';
  },
  /** The name a rule gives one of its combinations, else ''. */
  combinationName(rules, detectorId, detectorName, comboId) {
    const rule = (Array.isArray(rules) ? rules : []).find((r) => (detectorId && r.id === detectorId) || r.name.toLowerCase() === String(detectorName || '').toLowerCase());
    const combo = rule && Array.isArray(rule.detector.combinations) ? rule.detector.combinations.find((c) => RuleStats.isRecord(c) && c.id === comboId) : null;
    return combo && typeof combo.name === 'string' ? combo.name.trim() : '';
  }
};
if (typeof window !== 'undefined') window.RuleStats = RuleStats;
else if (typeof self !== 'undefined') self.RuleStats = RuleStats;
if (typeof module !== 'undefined' && module.exports) module.exports = RuleStats;
