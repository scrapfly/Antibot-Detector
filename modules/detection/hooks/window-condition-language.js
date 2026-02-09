/**
 * Scrapfly Window Condition Language
 *
 * Shared, safe condition evaluation used by:
 * - MAIN world window-property checks (content-main-world.js)
 * - WindowPropertyTracker (modules/detection/hooks/window-property-tracker.js)
 * - Rules UI condition dropdowns (sections/rules/*.js)
 *
 * NOTE:
 * - Canonical location: modules/detection/hooks/window-condition-language.js (loaded by popup + MAIN world).
 *
 * IMPORTANT:
 * - Conditions come from detector JSON and user-created rules.
 * - Never eval() untrusted condition strings.
 */

(function() {
  'use strict';

  const root = (typeof globalThis !== 'undefined') ? globalThis : window;
  if (root.ScrapflyWindowConditionLanguage) return;

  const PRESET_GROUPS = Object.freeze([
    {
      label: 'Type',
      values: Object.freeze([
        'typeof object',
        'typeof function',
        'typeof string',
        'typeof number',
        'typeof boolean',
        'typeof symbol',
        'typeof bigint'
      ])
    },
    {
      label: 'Existence',
      values: Object.freeze([
        'exists',
        'truthy',
        'falsy',
        '!== undefined',
        '=== undefined',
        '!== null',
        '=== null'
      ])
    },
    {
      label: 'Collections',
      values: Object.freeze([
        'array',
        'non-empty array',
        'empty array',
        'has length',
        'has keys',
        'empty object'
      ])
    },
    {
      label: 'Numeric',
      values: Object.freeze([
        '> 0',
        '>= 0',
        '=== 0',
        '!== 0',
        '> 1',
        '>= 1'
      ])
    },
    {
      label: 'String',
      values: Object.freeze([
        'length > 0',
        'length === 0'
      ])
    },
    {
      label: 'Boolean',
      values: Object.freeze([
        '=== true',
        '=== false'
      ])
    }
  ]);

  const ALIASES = Object.freeze({
    'not undefined': '!== undefined',
    'not null': '!== null',
    'defined': '!== undefined',
    'present': '!== undefined'
  });

  const cache = new Map(); // condition -> compiled

  function _toString(value) {
    try {
      return String(value);
    } catch (e) {
      return '';
    }
  }

  function normalize(condition) {
    const raw = (condition == null) ? '' : _toString(condition);
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (!trimmed) return '';
    const alias = ALIASES[trimmed];
    return alias ? alias : trimmed;
  }

  function _compare(op, left, right) {
    switch (op) {
      case '>': return left > right;
      case '>=': return left >= right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '===': return left === right;
      case '!==': return left !== right;
      default: return false;
    }
  }

  function compile(condition) {
    const normalized = normalize(condition);

    if (cache.has(normalized)) return cache.get(normalized);

    /** @type {{ok:boolean, normalized:string, reason?:string, fn?:Function}} */
    let compiled;

    // Empty means "truthy" in our engines.
    if (!normalized) {
      compiled = { ok: true, normalized: 'truthy', fn: (v) => !!v };
      cache.set(normalized, compiled);
      return compiled;
    }

    // Exact matches first
    switch (normalized) {
      case 'exists':
      case '!== undefined':
        compiled = { ok: true, normalized, fn: (v) => v !== undefined };
        cache.set(normalized, compiled);
        return compiled;
      case '=== undefined':
        compiled = { ok: true, normalized, fn: (v) => v === undefined };
        cache.set(normalized, compiled);
        return compiled;
      case '!== null':
        compiled = { ok: true, normalized, fn: (v) => v !== null };
        cache.set(normalized, compiled);
        return compiled;
      case '=== null':
        compiled = { ok: true, normalized, fn: (v) => v === null };
        cache.set(normalized, compiled);
        return compiled;
      case 'truthy':
        compiled = { ok: true, normalized, fn: (v) => !!v };
        cache.set(normalized, compiled);
        return compiled;
      case 'falsy':
        compiled = { ok: true, normalized, fn: (v) => !v };
        cache.set(normalized, compiled);
        return compiled;
      case 'array':
        compiled = { ok: true, normalized, fn: (v) => Array.isArray(v) };
        cache.set(normalized, compiled);
        return compiled;
      case 'empty array':
        compiled = { ok: true, normalized, fn: (v) => Array.isArray(v) && v.length === 0 };
        cache.set(normalized, compiled);
        return compiled;
      case 'non-empty array':
        compiled = { ok: true, normalized, fn: (v) => Array.isArray(v) && v.length > 0 };
        cache.set(normalized, compiled);
        return compiled;
      case 'has length':
        compiled = { ok: true, normalized, fn: (v) => v != null && typeof v.length === 'number' };
        cache.set(normalized, compiled);
        return compiled;
      case 'has keys':
        compiled = { ok: true, normalized, fn: (v) => v != null && typeof v === 'object' && Object.keys(v).length > 0 };
        cache.set(normalized, compiled);
        return compiled;
      case 'empty object':
        compiled = { ok: true, normalized, fn: (v) => v != null && typeof v === 'object' && Object.keys(v).length === 0 };
        cache.set(normalized, compiled);
        return compiled;
      default:
        break;
    }

    // typeof <type>
    const typeofMatch = /^typeof\s+([a-z]+)$/i.exec(normalized);
    if (typeofMatch) {
      const t = typeofMatch[1].toLowerCase();
      if (t === 'object') {
        compiled = { ok: true, normalized, fn: (v) => typeof v === 'object' && v !== null };
        cache.set(normalized, compiled);
        return compiled;
      }
      compiled = { ok: true, normalized, fn: (v) => typeof v === t };
      cache.set(normalized, compiled);
      return compiled;
    }

    // length <op> <number>
    const lengthMatch = /^length\s*(>=|<=|>|<|===|!==)\s*(-?\d+(?:\.\d+)?)$/i.exec(normalized);
    if (lengthMatch) {
      const op = lengthMatch[1];
      const n = Number(lengthMatch[2]);
      if (!Number.isFinite(n)) {
        compiled = { ok: false, normalized, reason: 'INVALID_NUMBER' };
        cache.set(normalized, compiled);
        return compiled;
      }
      compiled = {
        ok: true,
        normalized,
        fn: (v) => v != null && typeof v.length === 'number' && _compare(op, v.length, n)
      };
      cache.set(normalized, compiled);
      return compiled;
    }

    // boolean equality
    const boolEqMatch = /^(===|!==)\s*(true|false)$/i.exec(normalized);
    if (boolEqMatch) {
      const op = boolEqMatch[1];
      const b = boolEqMatch[2].toLowerCase() === 'true';
      compiled = { ok: true, normalized, fn: (v) => _compare(op, v, b) };
      cache.set(normalized, compiled);
      return compiled;
    }

    // numeric comparisons: <op> <number>
    const numMatch = /^(>=|<=|>|<|===|!==)\s*(-?\d+(?:\.\d+)?)$/i.exec(normalized);
    if (numMatch) {
      const op = numMatch[1];
      const n = Number(numMatch[2]);
      if (!Number.isFinite(n)) {
        compiled = { ok: false, normalized, reason: 'INVALID_NUMBER' };
        cache.set(normalized, compiled);
        return compiled;
      }
      compiled = { ok: true, normalized, fn: (v) => typeof v === 'number' && _compare(op, v, n) };
      cache.set(normalized, compiled);
      return compiled;
    }

    compiled = { ok: false, normalized, reason: 'UNSUPPORTED_CONDITION' };
    cache.set(normalized, compiled);
    return compiled;
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
    // Safe shallow copy; values are primitive strings.
    return PRESET_GROUPS.map((g) => ({ label: g.label, values: Array.from(g.values) }));
  }

  function getPresetValues() {
    const out = [];
    for (const group of PRESET_GROUPS) {
      for (const value of group.values) out.push(value);
    }
    return out;
  }

  function describe() {
    return 'Supported: exists/truthy/falsy, typeof <type>, numeric comparisons (<op> N), length comparisons (length <op> N), arrays/objects helpers.';
  }

  root.ScrapflyWindowConditionLanguage = Object.freeze({
    normalize,
    compile,
    evaluate,
    getPresetGroups,
    getPresetValues,
    describe
  });
})();
