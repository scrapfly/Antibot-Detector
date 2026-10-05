/**
 * Scrapfly Window Condition Grammar
 *
 * The data of the window-property condition language: which condition strings
 * exist, what they mean, how they are written and described. The evaluator
 * (modules/detection/hooks/window-condition-language.js) holds only the
 * predicate and comparison functions, addressed by the names used here.
 *
 * Loaded as the `ScrapflyWindowConditionGrammar` global by the ISOLATED content
 * script, the popup and the tests. It is NOT loaded into the MAIN world (that
 * would be a new page-visible global): content.js hands it over in the bridge
 * bootstrap event (detection-engine-hooks.js, demMainWorldBootstrapDetail) and
 * the MAIN-world evaluator adopts the first copy it receives.
 */

(function initWindowConditionGrammar(root) {
  'use strict';

  if (root.ScrapflyWindowConditionGrammar) return;

  const deepFreeze = (value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      for (const key of Object.keys(value)) deepFreeze(value[key]);
      Object.freeze(value);
    }
    return value;
  };

  root.ScrapflyWindowConditionGrammar = deepFreeze({
    // What an empty/missing condition means, and how it is reported back
    DEFAULT_CONDITION: 'truthy',

    // Canonical conditions offered by the rules UI, grouped for its dropdowns
    PRESET_GROUPS: [
      {
        label: 'Type',
        values: ['typeof object', 'typeof function', 'typeof string', 'typeof number', 'typeof boolean',
          'typeof symbol', 'typeof bigint']
      },
      {
        label: 'Existence',
        values: ['exists', 'truthy', 'falsy', '!== undefined', '=== undefined', '!== null', '=== null']
      },
      {
        label: 'Collections',
        values: ['array', 'non-empty array', 'empty array', 'has length', 'has keys', 'empty object']
      },
      {
        label: 'Numeric',
        values: ['> 0', '>= 0', '=== 0', '!== 0', '> 1', '>= 1']
      },
      {
        label: 'String',
        values: ['length > 0', 'length === 0']
      },
      {
        label: 'Boolean',
        values: ['=== true', '=== false']
      }
    ],

    // Older spellings still accepted in saved rules
    ALIASES: {
      'not undefined': '!== undefined',
      'not null': '!== null',
      'defined': '!== undefined',
      'present': '!== undefined'
    },

    // Whole conditions -> the evaluator's predicate of that name
    EXACT: {
      'exists': 'DEFINED',
      '!== undefined': 'DEFINED',
      '=== undefined': 'UNDEFINED',
      '!== null': 'NOT_NULL',
      '=== null': 'NULL',
      'truthy': 'TRUTHY',
      'falsy': 'FALSY',
      'array': 'ARRAY',
      'empty array': 'EMPTY_ARRAY',
      'non-empty array': 'NON_EMPTY_ARRAY',
      'has length': 'HAS_LENGTH',
      'has keys': 'HAS_KEYS',
      'empty object': 'EMPTY_OBJECT'
    },

    // Parametrised forms (RegExp source + flags), tried in the order the
    // evaluator lists them: typeof, length comparison, boolean equality,
    // numeric comparison
    PATTERNS: {
      TYPEOF: { source: '^typeof\\s+([a-z]+)$', flags: 'i' },
      LENGTH_COMPARISON: { source: '^length\\s*(>=|<=|>|<|===|!==)\\s*(-?\\d+(?:\\.\\d+)?)$', flags: 'i' },
      BOOLEAN_EQUALITY: { source: '^(===|!==)\\s*(true|false)$', flags: 'i' },
      NUMBER_COMPARISON: { source: '^(>=|<=|>|<|===|!==)\\s*(-?\\d+(?:\\.\\d+)?)$', flags: 'i' }
    },

    // Comparison operators -> the evaluator's comparator of that name
    OPERATORS: { '>': 'GT', '>=': 'GTE', '<': 'LT', '<=': 'LTE', '===': 'EQ', '!==': 'NE' },

    // Boolean words (lower-cased) -> value
    BOOLEANS: { 'true': true, 'false': false },

    // Whitespace runs in a condition collapse to one SPACE before matching
    WHITESPACE: { source: '\\s+', flags: 'g' },
    SPACE: ' ',

    // compile() failure reasons
    REASONS: {
      INVALID_NUMBER: 'INVALID_NUMBER',
      UNSUPPORTED_CONDITION: 'UNSUPPORTED_CONDITION'
    },

    // One-line help for logs and the rules UI
    DESCRIPTION: 'Supported: exists/truthy/falsy, typeof <type>, numeric comparisons (<op> N), length comparisons (length <op> N), arrays/objects helpers.',

    // Compiled conditions kept (oldest dropped first)
    COMPILE_CACHE_MAX_ENTRIES: 500
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : window));
