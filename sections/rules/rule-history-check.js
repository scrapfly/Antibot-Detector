/**
 * Rules → edit a rule → "Check against History": how often each pattern and
 * combination of the rule being edited (unsaved edits included) matches the
 * evidence History saved. History keeps the matched values of each detection
 * (cookie and header names, URLs, selectors, hook targets…), not whole pages,
 * so the counts are an estimate over that evidence.
 */
(function(root) {
  'use strict';

  const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v) => (typeof v === 'string' || typeof v === 'number') ? String(v) : '';
  const aliases = { cookies: 'cookie', headers: 'header', urls: 'url', hooks: 'js_hooks' };
  const methodOf = (type) => { const t = String(type || '').toLowerCase(); return aliases[t] || t; };

  /** History entries from the stored value (JSON string, { items } or an array). */
  function parseHistory(raw) {
    let value = raw;
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch (_) { return []; }
    }
    const list = Array.isArray(value) ? value : (isRecord(value) && Array.isArray(value.items) ? value.items : []);
    return list.filter(isRecord);
  }

  /** "selector=text" as History keeps a DOM match: the selector, with "=" inside [ ] kept. */
  function domSelector(value) {
    const text = str(value);
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '[') depth++;
      else if (text[i] === ']') depth = Math.max(0, depth - 1);
      else if (text[i] === '=' && depth === 0) return text.slice(0, i).trim();
    }
    return text.trim();
  }

  function split(value, sep) {
    const text = str(value);
    const at = text.indexOf(sep);
    return at > 0 ? [text.slice(0, at).trim(), text.slice(at + sep.length).trim()] : [text.trim(), ''];
  }

  /** Same switches the rule editor offers: regex, whole word, case sensitive. */
  function textMatches(needle, hay, { regex = false, wholeWord = false, caseSensitive = false } = {}) {
    const n = str(needle), h = str(hay);
    if (!n) return true;
    if (regex) {
      try { return new RegExp(n, caseSensitive ? '' : 'i').test(h); } catch (_) { return false; }
    }
    if (wholeWord) {
      const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\W)${escaped}(\\W|$)`, caseSensitive ? '' : 'i').test(h);
    }
    return caseSensitive ? h.includes(n) : h.toLowerCase().includes(n.toLowerCase());
  }

  /** Does one saved match carry what this pattern looks for? */
  function patternMatches(method, pattern, match) {
    if (!isRecord(pattern) || !isRecord(match) || methodOf(match.type) !== method) return false;
    switch (method) {
      case 'cookie': {
        const [name, value] = match.name ? [str(match.name), split(match.value, '=')[1]] : split(match.value, '=');
        // A plain cookie name is a prefix (cf_chl matches cf_chl_rc_m)
        const nameOk = pattern.nameRegex
          ? textMatches(pattern.name, name, { regex: true, caseSensitive: pattern.nameCaseSensitive })
          : (pattern.nameCaseSensitive ? name.startsWith(str(pattern.name)) : name.toLowerCase().startsWith(str(pattern.name).toLowerCase()));
        return nameOk && (!pattern.value || textMatches(pattern.value, value,
          { regex: pattern.valueRegex, wholeWord: pattern.valueWholeWord, caseSensitive: pattern.valueCaseSensitive }));
      }
      case 'header': {
        const [name, value] = split(match.value, ':');
        const headerName = str(match.name) || name;
        const nameOk = pattern.nameRegex
          ? textMatches(pattern.name, headerName, { regex: true, caseSensitive: pattern.nameCaseSensitive })
          : headerName.toLowerCase() === str(pattern.name).toLowerCase();
        return nameOk && (!pattern.value || textMatches(pattern.value, value,
          { regex: pattern.valueRegex, wholeWord: pattern.valueWholeWord, caseSensitive: pattern.valueCaseSensitive }));
      }
      case 'url':
        return textMatches(pattern.text, str(match.fullUrl) || str(match.value),
          { regex: pattern.textRegex, wholeWord: pattern.textWholeWord, caseSensitive: pattern.textCaseSensitive });
      case 'content':
      case 'payload':
        return textMatches(pattern.text, str(match.pattern) || str(match.value),
          { regex: pattern.textRegex, wholeWord: pattern.textWholeWord, caseSensitive: pattern.textCaseSensitive });
      case 'dom':
        return (str(match.selector) || domSelector(match.value)) === str(pattern.selector).trim();
      case 'js_hooks': {
        const target = str(match.target) || str(match.value);
        const wanted = str(pattern.target).trim();
        return !!wanted && (target === wanted || target.endsWith('.' + wanted) || wanted.endsWith('.' + target));
      }
      case 'window': {
        const path = (str(match.path) || str(match.value)).split(/[=\s]/)[0];
        const wanted = str(pattern.path).trim();
        return !!wanted && (path === wanted || path.startsWith(wanted + '.'));
      }
      default:
        return false;
    }
  }

  const PATTERN_TEXT = { cookie: 'name', header: 'name', url: 'text', content: 'text', payload: 'text', dom: 'selector', js_hooks: 'target', window: 'path' };

  function detectionIsRule(detection, rule) {
    if (!isRecord(detection)) return false;
    const d = isRecord(detection.detector) ? detection.detector : {};
    const id = d.id || detection.id;
    const name = str(d.name || (typeof detection.detector === 'string' ? detection.detector : '') || detection.name).toLowerCase();
    return (rule.id && id === rule.id) || (!!rule.name && name === str(rule.name).toLowerCase());
  }

  /**
   * @param rule {id, name, detection: {method: [pattern]}, combinations: [{id, name, when}]}
   * @param items History entries
   * @param engine DetectionCombinations (ids and combination evaluation)
   * @returns {{pages, rulePages, patterns: Array, combinations: Array}}
   */
  function check(rule, items, engine) {
    const detection = isRecord(rule && rule.detection) ? rule.detection : {};
    const patterns = [];
    for (const method of Object.keys(PATTERN_TEXT)) {
      (Array.isArray(detection[method]) ? detection[method] : []).forEach((pattern, index) => {
        if (!isRecord(pattern) || !str(pattern[PATTERN_TEXT[method]]).trim()) return;
        const id = (engine && typeof engine.idOf === 'function' && engine.idOf({ detection }, pattern)) || pattern.id || `${method}-${index + 1}`;
        patterns.push({ id, method, label: str(pattern[PATTERN_TEXT[method]]), description: str(pattern.description), pattern, rulePages: 0, otherPages: 0 });
      });
    }
    const combinations = (Array.isArray(rule && rule.combinations) ? rule.combinations : []).filter(isRecord)
      .map((combo, index) => ({ id: combo.id || `c${index + 1}`, name: str(combo.name), when: combo.when, pages: 0, rulePages: 0 }));
    let rulePages = 0;
    const list = Array.isArray(items) ? items : [];
    for (const item of list) {
      const detections = Array.isArray(item.detections) ? item.detections.filter(isRecord) : [];
      const own = detections.some(d => detectionIsRule(d, rule || {}));
      if (own) rulePages++;
      // Every saved match on the page is evidence, whichever rule found it
      const matches = detections.flatMap(d => (Array.isArray(d.matches) ? d.matches : []));
      const seen = { patterns: new Set(), methods: new Set() };
      for (const p of patterns) {
        if (matches.some(m => patternMatches(p.method, p.pattern, m))) {
          seen.patterns.add(p.id);
          seen.methods.add(p.method);
          if (own) p.rulePages++; else p.otherPages++;
        }
      }
      // Rows the combination checklist recorded for this rule
      detections.filter(d => detectionIsRule(d, rule || {})).forEach(d => {
        (Array.isArray(d.comboFound) ? d.comboFound : []).forEach(id => { if (typeof id === 'string' && !id.startsWith('method:')) seen.patterns.add(id); });
      });
      for (const combo of combinations) {
        const fires = engine && typeof engine.isSatisfied === 'function' && engine.isSatisfied(combo, seen);
        if (fires) { combo.pages++; if (own) combo.rulePages++; }
      }
    }
    return {
      pages: list.length,
      rulePages,
      patterns: patterns.map(({ pattern, ...row }) => row),
      combinations: combinations.map(({ when, ...row }) => row)
    };
  }

  const api = Object.freeze({ parseHistory, patternMatches, textMatches, domSelector, check });
  root.RuleHistoryCheck = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
