/**
 * DetectionCombinations - scores a detector whose patterns combine with
 * AND / OR / NOT instead of each counting on its own.
 *
 * A detector may carry, next to `detection`, a list of combinations:
 *
 *   "combinations": [
 *     { "id": "c1", "name": "Akamai challenge",
 *       "when": { "all": [ { "pattern": "url-1" },
 *                          { "any": [ { "pattern": "cookie-1" }, { "method": "header" } ] },
 *                          { "not": { "pattern": "header-2" } } ] } }
 *   ]
 *
 * Nodes: { pattern: id } (that pattern matched), { method: name } (any
 * pattern of that method matched), { all: [...] }, { any: [...] },
 * { atLeast: n, of: [...] } and { not: node }. A pattern with
 * `standalone: false` only counts inside combinations.
 *
 * A satisfied combination scores its own `confidence` when the rule sets one
 * (1-100); without it, the highest confidence of the patterns that made it
 * true (each pattern's own confidence from its settings). NOT rows add nothing.
 * It also lists in `found` which of the patterns it refers to were seen (and
 * `method:<name>` for method rows), so the popup can show it as a checklist.
 *
 * A detector with neither combinations nor such patterns is untouched: every
 * match counts on its own and the confidence is the highest one, as before.
 *
 * Evidence arrives over time (URL first, hooks later), so the score is always
 * "as of the matches seen so far": a combination that needs NOT y stops
 * counting once y shows up.
 */
(function initDetectionCombinations(root) {
  'use strict';

  const METHODS = ['url', 'header', 'cookie', 'content', 'dom', 'window', 'js_hooks', 'payload'];

  // Match `type` values the engine emits, mapped to the detector method key
  const TYPE_TO_METHOD = {
    url: 'url', urls: 'url',
    header: 'header', headers: 'header',
    cookie: 'cookie', cookies: 'cookie',
    content: 'content', dom: 'dom', window: 'window',
    js_hooks: 'js_hooks', payload: 'payload'
  };

  // Field that identifies a pattern, and the match fields that echo it
  const KEY_FIELD = {
    url: 'text', content: 'text', payload: 'text',
    cookie: 'name', header: 'name', dom: 'selector',
    window: 'path', js_hooks: 'target'
  };

  const idCache = new WeakMap();

  function methodOf(type) {
    return TYPE_TO_METHOD[String(type || '').toLowerCase()] || null;
  }

  /** Id of the pattern at `index` of `method`: its own, else `<method>-<n>`. */
  function defaultId(method, index) {
    return `${method}-${index + 1}`;
  }

  /** Map pattern object -> id for every pattern of a detector (cached). */
  function patternIds(detector) {
    const detection = detector && detector.detection;
    if (!detection || typeof detection !== 'object') return new Map();
    const size = METHODS.reduce((n, m) => n + (Array.isArray(detection[m]) ? detection[m].length : 0), 0);
    let ids = idCache.get(detection);
    if (ids && ids.size === size) return ids;
    ids = new Map();
    for (const method of METHODS) {
      const list = Array.isArray(detection[method]) ? detection[method] : [];
      list.forEach((pattern, index) => {
        if (pattern && typeof pattern === 'object') {
          ids.set(pattern, (typeof pattern.id === 'string' && pattern.id) || defaultId(method, index));
        }
      });
    }
    idCache.set(detection, ids);
    return ids;
  }

  /** Id of one pattern object of this detector, or null. */
  function idOf(detector, pattern) {
    return patternIds(detector).get(pattern) || null;
  }

  /** Every pattern of the detector as { id, method, pattern }. */
  function listPatterns(detector) {
    const out = [];
    for (const [pattern, id] of patternIds(detector)) {
      out.push({ id, method: methodOfPattern(detector, pattern), pattern });
    }
    return out;
  }

  function methodOfPattern(detector, pattern) {
    const detection = detector.detection || {};
    for (const method of METHODS) {
      if (Array.isArray(detection[method]) && detection[method].includes(pattern)) return method;
    }
    return null;
  }

  function hasCombinations(detector) {
    return Array.isArray(detector && detector.combinations) && detector.combinations.length > 0;
  }

  /** True when this detector is scored here rather than by max confidence. */
  function applies(detector) {
    if (!detector || !detector.detection) return false;
    if (hasCombinations(detector)) return true;
    for (const pattern of patternIds(detector).keys()) {
      if (pattern.standalone === false) return true;
    }
    return false;
  }

  /** Ids of the patterns a match came from. */
  function matchPatternIds(detector, match) {
    if (!match) return [];
    if (typeof match.patternId === 'string' && match.patternId) return [match.patternId];
    const method = methodOf(match.type);
    if (!method) return [];
    const field = KEY_FIELD[method];
    const echoes = [match.pattern, match.target, match.path, match.selector].filter(v => typeof v === 'string' && v);
    const list = Array.isArray(detector.detection?.[method]) ? detector.detection[method] : [];
    const ids = [];
    list.forEach((pattern) => {
      if (pattern && echoes.includes(pattern[field])) ids.push(idOf(detector, pattern));
    });
    return ids;
  }

  /** Does the node hold anything that must be present (outside a NOT)? */
  function hasPositive(node) {
    if (!node || typeof node !== 'object') return false;
    if (typeof node.pattern === 'string' || typeof node.method === 'string') return true;
    if (node.not) return false;
    const children = node.all || node.any || node.of;
    return Array.isArray(children) && children.some(hasPositive);
  }

  function evalNode(node, seen) {
    if (!node || typeof node !== 'object') return false;
    if (typeof node.pattern === 'string') return seen.patterns.has(node.pattern);
    if (typeof node.method === 'string') return seen.methods.has(node.method);
    if (node.not) return !evalNode(node.not, seen);
    if (Array.isArray(node.all)) return node.all.length > 0 && node.all.every(n => evalNode(n, seen));
    // An OR branch made only of NOT would hold on any page without that
    // pattern, so only branches with something that must match count
    if (Array.isArray(node.any)) return node.any.some(n => hasPositive(n) && evalNode(n, seen));
    if (Array.isArray(node.of)) {
      const need = Number(node.atLeast);
      if (!Number.isFinite(need) || need < 1) return false;
      return node.of.filter(n => hasPositive(n) && evalNode(n, seen)).length >= need;
    }
    return false;
  }

  /** Does every OR branch of the node hold something that must match? */
  function everyBranchPositive(node) {
    if (node && Array.isArray(node.any)) return node.any.length > 0 && node.any.every(everyBranchPositive);
    return hasPositive(node);
  }

  /** Pattern ids and methods seen in a list of matches. */
  function seenIn(detector, matches) {
    const seen = { patterns: new Set(), methods: new Set() };
    for (const match of (Array.isArray(matches) ? matches : [])) {
      const method = methodOf(match && match.type);
      if (method) seen.methods.add(method);
      matchPatternIds(detector, match).forEach(id => seen.patterns.add(id));
    }
    return seen;
  }

  /**
   * What a combination refers to that was seen: its pattern ids, then
   * `method:<name>` for method rows, in the order the rule lists them. NOT
   * rows and branches that did not hold are included, so the checklist can
   * show every row.
   */
  function foundIn(when, seen) {
    const refs = references(when);
    return [
      ...[...refs.patterns].filter(id => seen.patterns.has(id)),
      ...[...refs.methods].filter(m => seen.methods.has(m)).map(m => `method:${m}`)
    ];
  }

  /** `found` for a detection cached before combinations recorded it. */
  function foundFromMatches(detector, combination, matches) {
    return foundIn(combination && combination.when, seenIn(detector, matches));
  }

  /** Is this combination true for the matches seen? A pure NOT never is. */
  function isSatisfied(combination, seen) {
    if (!combination || !hasPositive(combination.when)) return false;
    return evalNode(combination.when, seen);
  }

  /**
   * Confidence of a satisfied combination: the highest confidence among the
   * patterns that made it true (positive references that matched). NOT rows
   * only say what must be absent, so they never add confidence. A `method`
   * node contributes the best match of that method.
   */
  function combinationConfidence(node, seen, best) {
    if (!node || typeof node !== 'object' || node.not) return 0;
    if (typeof node.pattern === 'string') return seen.patterns.has(node.pattern) ? (best.patterns.get(node.pattern) || 0) : 0;
    if (typeof node.method === 'string') return seen.methods.has(node.method) ? (best.methods.get(node.method) || 0) : 0;
    let top = 0;
    for (const key of ['all', 'any', 'of']) {
      if (Array.isArray(node[key])) {
        for (const child of node[key]) {
          if (key !== 'all' && !(hasPositive(child) && evalNode(child, seen))) continue;
          top = Math.max(top, combinationConfidence(child, seen, best));
        }
      }
    }
    return top;
  }

  /** Positive pattern ids / methods that made a satisfied node true. */
  function contributors(node, seen, out = { patterns: new Set(), methods: new Set() }) {
    if (!node || typeof node !== 'object' || node.not) return out;
    if (typeof node.pattern === 'string') { if (seen.patterns.has(node.pattern)) out.patterns.add(node.pattern); return out; }
    if (typeof node.method === 'string') { if (seen.methods.has(node.method)) out.methods.add(node.method); return out; }
    for (const key of ['all', 'any', 'of']) {
      if (!Array.isArray(node[key])) continue;
      for (const child of node[key]) {
        if (key !== 'all' && !(hasPositive(child) && evalNode(child, seen))) continue;
        contributors(child, seen, out);
      }
    }
    return out;
  }

  /**
   * Score a detector against its matches.
   * @returns {{detected:boolean, confidence:number, combinations:Array<{id,name,confidence,when,found}>}}
   */
  /** A match's own confidence, before any combination raised it. */
  function baseConfidence(match) {
    const base = Number(match && match.baseConfidence);
    return Number.isFinite(base) ? base : (Number(match && match.confidence) || 0);
  }

  function score(detector, matches = []) {
    const list = Array.isArray(matches) ? matches : [];
    const byId = new Map();
    for (const [pattern, id] of patternIds(detector)) byId.set(id, pattern);

    const seen = { patterns: new Set(), methods: new Set() };
    // Best confidence seen per pattern id and per method, for combination scores
    const best = { patterns: new Map(), methods: new Map() };
    let confidence = 0;
    for (const match of list) {
      const method = methodOf(match && match.type);
      const value = baseConfidence(match);
      if (method) {
        seen.methods.add(method);
        best.methods.set(method, Math.max(best.methods.get(method) || 0, value));
      }
      const ids = matchPatternIds(detector, match);
      ids.forEach(id => {
        seen.patterns.add(id);
        const own = Number(byId.get(id)?.confidence);
        best.patterns.set(id, Math.max(best.patterns.get(id) || 0, Number.isFinite(own) ? own : value));
      });
      // A match counts alone unless every pattern it came from is combination-only
      const standalone = ids.length === 0 || ids.some(id => byId.get(id)?.standalone !== false);
      if (standalone) confidence = Math.max(confidence, value);
    }

    const satisfied = [];
    for (const combination of (hasCombinations(detector) ? detector.combinations : [])) {
      if (isSatisfied(combination, seen)) {
        // Its own confidence when the rule sets one; otherwise the best pattern that made it true
        const own = Number(combination.confidence);
        const raw = Number.isFinite(own) && own > 0 ? own : combinationConfidence(combination.when, seen, best);
        const c = Math.max(0, Math.min(100, Math.round(raw)));
        satisfied.push({ id: combination.id, name: combination.name || '', confidence: c, when: combination.when,
          found: foundIn(combination.when, seen), made: contributors(combination.when, seen) });
        confidence = Math.max(confidence, c);
      }
    }
    // A match that helped a combination fire shows that combination's
    // confidence (its own stays in baseConfidence); the rest keep theirs
    const scored = list.map(match => {
      if (!match || typeof match !== 'object') return match;
      const own = baseConfidence(match);
      const method = methodOf(match.type);
      const ids = matchPatternIds(detector, match);
      let top = 0;
      for (const combo of satisfied) {
        if (ids.some(id => combo.made.patterns.has(id)) || (method && combo.made.methods.has(method))) top = Math.max(top, combo.confidence);
      }
      const { baseConfidence: _b, ...rest } = match;
      return top > own ? { ...rest, confidence: top, baseConfidence: own } : { ...rest, confidence: own };
    });
    satisfied.forEach(combo => { delete combo.made; });
    return { detected: confidence > 0, confidence, combinations: satisfied, matches: scored };
  }

  /**
   * Re-score a detection object in place when its detector uses
   * combinations. Returns false when the detection no longer holds.
   */
  function rescore(detector, detection) {
    if (!detection) return false;
    if (!applies(detector)) return detection.detected !== false;
    const result = score(detector, detection.matches);
    if (Array.isArray(detection.matches)) detection.matches = result.matches;
    detection.confidence = result.confidence;
    detection.detected = result.detected;
    if (result.combinations.length > 0) detection.combinations = result.combinations;
    else delete detection.combinations;
    if (result.detected) delete detection.partial;
    return result.detected;
  }

  /** Every pattern/method id a combination node refers to. */
  function references(node, out = { patterns: new Set(), methods: new Set() }) {
    if (!node || typeof node !== 'object') return out;
    if (typeof node.pattern === 'string') out.patterns.add(node.pattern);
    if (typeof node.method === 'string') out.methods.add(node.method);
    if (node.not) references(node.not, out);
    for (const key of ['all', 'any', 'of']) {
      if (Array.isArray(node[key])) node[key].forEach(n => references(n, out));
    }
    return out;
  }

  /** Copy of a node with every reference to a removed pattern dropped. */
  function dropPattern(node, patternId) {
    if (!node || typeof node !== 'object') return node;
    if (node.pattern === patternId) return null;
    if (node.not) {
      const inner = dropPattern(node.not, patternId);
      return inner ? { not: inner } : null;
    }
    for (const key of ['all', 'any', 'of']) {
      if (Array.isArray(node[key])) {
        return { ...node, [key]: node[key].map(n => dropPattern(n, patternId)).filter(Boolean) };
      }
    }
    return node;
  }

  /**
   * One-line text for a combination rule, e.g. "Dom [data-sitekey] AND NOT Url /x".
   * @param {object} detector - Detector (to name the patterns)
   * @param {object} node - combination.when
   * @param {object} [words] - { and, or, not, any: (method) => text, method: (method) => label }
   */
  function describe(detector, node, words = {}) {
    const and = words.and || 'AND', or = words.or || 'OR', not = words.not || 'NOT';
    const label = words.method || ((m) => m);
    const any = words.any || ((m) => `Any ${label(m)} pattern`);
    const byId = new Map();
    for (const p of listPatterns(detector)) byId.set(p.id, p);
    const leaf = (n) => {
      if (typeof n.method === 'string') return any(n.method);
      const p = byId.get(n.pattern);
      if (!p) return n.pattern;
      const field = KEY_FIELD[p.method];
      const key = String(p.pattern[field] ?? n.pattern);
      const value = (p.method === 'cookie' || p.method === 'header') && p.pattern.value ? ` = ${p.pattern.value}` : '';
      return `${label(p.method)} ${key}${value}`;
    };
    const walk = (n, top) => {
      if (!n || typeof n !== 'object') return '';
      if (n.not) return `${not} ${walk(n.not, false)}`;
      if (typeof n.pattern === 'string' || typeof n.method === 'string') return leaf(n);
      if (Array.isArray(n.all)) return n.all.map(c => walk(c, false)).join(` ${and} `);
      if (Array.isArray(n.any)) {
        const parts = n.any.map(c => (Array.isArray(c.all) && c.all.length > 1 ? `(${walk(c, false)})` : walk(c, false)));
        return parts.join(` ${or} `);
      }
      if (Array.isArray(n.of)) return `${n.atLeast}× (${n.of.map(c => walk(c, false)).join(', ')})`;
      return '';
    };
    return walk(node, true);
  }

  /** Is a condition node true for the patterns and methods seen? */
  function evaluate(node, seen) {
    const s = seen || {};
    const asSet = (v) => (v instanceof Set ? v : new Set(Array.isArray(v) ? v : []));
    return evalNode(node, { patterns: asSet(s.patterns), methods: asSet(s.methods) });
  }

  /** `seen` sets from a `found` list: pattern ids and `method:<name>` entries. */
  function seenFromFound(found) {
    const seen = { patterns: new Set(), methods: new Set() };
    for (const item of (Array.isArray(found) ? found : [])) {
      if (typeof item !== 'string') continue;
      if (item.startsWith('method:')) seen.methods.add(item.slice(7));
      else seen.patterns.add(item);
    }
    return seen;
  }

  const api = Object.freeze({
    METHODS, methodOf, defaultId, patternIds, idOf, listPatterns, applies,
    hasCombinations, matchPatternIds, hasPositive, everyBranchPositive, isSatisfied, score, rescore,
    references, dropPattern, describe, evaluate, seenFromFound, foundFromMatches
  });

  root.DetectionCombinations = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
