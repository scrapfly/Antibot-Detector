/**
 * Scrapfly Window Condition Language
 *
 * Shared, safe condition evaluation used by:
 * - WindowPropertyTracker (modules/detection/hooks/window-property-tracker.js), MAIN world
 * - Rules UI condition dropdowns (sections/rules/*.js), popup
 *
 * This file is the evaluator only: predicates and comparisons addressed by
 * name. Which condition strings exist and what they mean is the grammar
 * (modules/detection/window-condition-grammar.js). The popup and the tests load
 * the grammar first and it is adopted here at load; in the MAIN world it
 * arrives with the bridge bootstrap and content-main-world.js calls
 * configure(). The first grammar adopted is kept.
 *
 * IMPORTANT:
 * - Conditions come from detector JSON and user-created rules.
 * - Never eval() untrusted condition strings.
 */

(function() {
  'use strict';

  const root = (typeof globalThis !== 'undefined') ? globalThis : window;
  if (root.ScrapflyWindowConditionLanguage) return;

  // Predicates the grammar's EXACT table refers to by name
  const PREDICATES = Object.freeze({
    DEFINED: (v) => v !== undefined,
    UNDEFINED: (v) => v === undefined,
    NOT_NULL: (v) => v !== null,
    NULL: (v) => v === null,
    TRUTHY: (v) => !!v,
    FALSY: (v) => !v,
    ARRAY: (v) => Array.isArray(v),
    EMPTY_ARRAY: (v) => Array.isArray(v) && v.length === 0,
    NON_EMPTY_ARRAY: (v) => Array.isArray(v) && v.length > 0,
    HAS_LENGTH: (v) => v != null && typeof v.length === 'number',
    HAS_KEYS: (v) => v != null && typeof v === 'object' && Object.keys(v).length > 0,
    EMPTY_OBJECT: (v) => v != null && typeof v === 'object' && Object.keys(v).length === 0
  });

  // Comparators the grammar's OPERATORS table refers to by name
  const COMPARATORS = Object.freeze({
    GT: (left, right) => left > right,
    GTE: (left, right) => left >= right,
    LT: (left, right) => left < right,
    LTE: (left, right) => left <= right,
    EQ: (left, right) => left === right,
    NE: (left, right) => left !== right
  });

  let grammar = null;
  let patterns = null;

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const key of Object.keys(value)) deepFreeze(value[key]);
      Object.freeze(value);
    }
    return value;
  }

  function isGrammarShape(g) {
    return !!g && typeof g === 'object' && typeof g.DEFAULT_CONDITION === 'string' &&
      Array.isArray(g.PRESET_GROUPS) && !!g.ALIASES && !!g.EXACT && !!g.OPERATORS && !!g.BOOLEANS &&
      !!g.REASONS && typeof g.SPACE === 'string' && typeof g.DESCRIPTION === 'string' &&
      typeof g.COMPILE_CACHE_MAX_ENTRIES === 'number' && !!g.WHITESPACE && !!g.PATTERNS &&
      !!g.PATTERNS.TYPEOF && !!g.PATTERNS.LENGTH_COMPARISON && !!g.PATTERNS.BOOLEAN_EQUALITY &&
      !!g.PATTERNS.NUMBER_COMPARISON;
  }

  /**
   * Adopt the grammar (first valid one wins; later calls change nothing).
   * @returns {boolean} whether this call adopted it
   */
  function configure(candidate) {
    if (grammar || !isGrammarShape(candidate)) return false;
    try {
      const copy = deepFreeze(JSON.parse(JSON.stringify(candidate)));
      const toRegExp = ({ source, flags }) => new RegExp(source, flags);
      const compiledPatterns = Object.freeze({
        WHITESPACE: toRegExp(copy.WHITESPACE),
        TYPEOF: toRegExp(copy.PATTERNS.TYPEOF),
        LENGTH_COMPARISON: toRegExp(copy.PATTERNS.LENGTH_COMPARISON),
        BOOLEAN_EQUALITY: toRegExp(copy.PATTERNS.BOOLEAN_EQUALITY),
        NUMBER_COMPARISON: toRegExp(copy.PATTERNS.NUMBER_COMPARISON)
      });
      grammar = copy;
      patterns = compiledPatterns;
      return true;
    } catch (e) {
      return false;
    }
  }

  // condition -> compiled, capped (oldest dropped first) so many unique
  // conditions across many detectors cannot grow it without bound
  const cache = new Map();

  function remember(key, compiled) {
    if (cache.size >= grammar.COMPILE_CACHE_MAX_ENTRIES && !cache.has(key)) {
      cache.delete(cache.keys().next().value);
    }
    cache.set(key, compiled);
    return compiled;
  }

  function _toString(value) {
    try {
      return String(value);
    } catch (e) {
      return '';
    }
  }

  function normalize(condition) {
    const raw = (condition == null) ? '' : _toString(condition);
    const trimmed = raw.trim().replace(patterns.WHITESPACE, grammar.SPACE);
    if (!trimmed) return '';
    const alias = grammar.ALIASES[trimmed];
    return alias ? alias : trimmed;
  }

  const has = (table, key) => Object.prototype.hasOwnProperty.call(table, key);

  function compare(op, left, right) {
    const comparator = has(grammar.OPERATORS, op) ? COMPARATORS[grammar.OPERATORS[op]] : null;
    return comparator ? comparator(left, right) : false;
  }

  function compileNormalized(normalized) {
    const { REASONS } = grammar;

    // Empty means the default condition
    if (!normalized) {
      return { ok: true, normalized: grammar.DEFAULT_CONDITION, fn: PREDICATES.TRUTHY };
    }

    // Exact matches first
    if (has(grammar.EXACT, normalized) && PREDICATES[grammar.EXACT[normalized]]) {
      return { ok: true, normalized, fn: PREDICATES[grammar.EXACT[normalized]] };
    }

    // typeof <type>
    const typeofMatch = patterns.TYPEOF.exec(normalized);
    if (typeofMatch) {
      const t = typeofMatch[1].toLowerCase();
      if (t === 'object') {
        return { ok: true, normalized, fn: (v) => typeof v === 'object' && v !== null };
      }
      return { ok: true, normalized, fn: (v) => typeof v === t };
    }

    // length <op> <number>
    const lengthMatch = patterns.LENGTH_COMPARISON.exec(normalized);
    if (lengthMatch) {
      const [, op, operand] = lengthMatch;
      const n = Number(operand);
      if (!Number.isFinite(n)) {
        return { ok: false, normalized, reason: REASONS.INVALID_NUMBER };
      }
      return { ok: true, normalized, fn: (v) => v != null && typeof v.length === 'number' && compare(op, v.length, n) };
    }

    // boolean equality
    const boolEqMatch = patterns.BOOLEAN_EQUALITY.exec(normalized);
    if (boolEqMatch) {
      const [, op, word] = boolEqMatch;
      const b = grammar.BOOLEANS[word.toLowerCase()];
      return { ok: true, normalized, fn: (v) => compare(op, v, b) };
    }

    // numeric comparisons: <op> <number>
    const numMatch = patterns.NUMBER_COMPARISON.exec(normalized);
    if (numMatch) {
      const [, op, operand] = numMatch;
      const n = Number(operand);
      if (!Number.isFinite(n)) {
        return { ok: false, normalized, reason: REASONS.INVALID_NUMBER };
      }
      return { ok: true, normalized, fn: (v) => typeof v === 'number' && compare(op, v, n) };
    }

    return { ok: false, normalized, reason: REASONS.UNSUPPORTED_CONDITION };
  }

  /** @returns {{ok:boolean, normalized:string, reason?:string, fn?:Function}} */
  function compile(condition) {
    // Without a grammar nothing is supported (reason undefined: there is no vocabulary yet)
    if (!grammar) return { ok: false, normalized: _toString(condition ?? '') };
    const normalized = normalize(condition);
    if (cache.has(normalized)) return cache.get(normalized);
    return remember(normalized, compileNormalized(normalized));
  }

  function evaluate(value, condition) {
    const compiled = compile(condition);
    if (!compiled.ok || typeof compiled.fn !== 'function') return false;
    try {
      return !!compiled.fn(value);
    } catch (e) {
      return false;
    }
  }

  function getPresetGroups() {
    if (!grammar) return [];
    // Safe copy; values are primitive strings.
    return grammar.PRESET_GROUPS.map((g) => ({ label: g.label, values: Array.from(g.values) }));
  }

  function getPresetValues() {
    return getPresetGroups().flatMap((group) => group.values);
  }

  function describe() {
    return grammar ? grammar.DESCRIPTION : '';
  }

  // Popup and tests load the grammar before this file
  configure(root.ScrapflyWindowConditionGrammar);

  root.ScrapflyWindowConditionLanguage = Object.freeze({
    // What an empty/missing condition means (undefined until a grammar is adopted)
    get DEFAULT_CONDITION() {
      return grammar ? grammar.DEFAULT_CONDITION : undefined;
    },
    configure,
    compile,
    evaluate,
    getPresetGroups,
    getPresetValues,
    describe
  });
})();
