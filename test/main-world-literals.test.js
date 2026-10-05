const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Guard: MAIN-world code (content-main-world.js and the helpers loaded with it)
// spells no values. Protocol values, identity, labels and markers arrive with
// the bootstrap event (modules/core/bridge-protocol.js), tuning with every
// install event (modules/core/hooks-config.js), API knowledge and the condition
// grammar from the engine. The only literals allowed are the ones below.

require('../modules/core/bridge-protocol.js');
const P = globalThis.ScrapflyBridgeProtocol;
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const MAIN_FILES = manifest.content_scripts.find(cs => cs.world === 'MAIN').js;

// The rendezvous: the one name both worlds know before anything else, spelled
// exactly once, in content-main-world.js (also pinned by bridge-protocol-guard).
const BOOTSTRAP = { file: 'content-main-world.js', value: P.EVENTS.BRIDGE_INIT };

const TYPEOF_TAGS = ['function', 'object', 'string', 'number', 'undefined', 'boolean', 'symbol', 'bigint'];
const ALLOWED_STRINGS = new Set([
  '',
  'use strict',                   // directive
  ...TYPEOF_TAGS,
  'prototype',                    // standard property key (constructor-target check)
  'error', 'unhandledrejection',  // standard window event types (error filters)
  'complete'                      // standard document.readyState value
]);
const ALLOWED_NUMBERS = new Set(['0', '1']);      // -1 is `-` applied to 1

// Human-readable debug-log text is not a value anything depends on: the
// arguments of these log calls and the bodies of these formatters may hold
// prose (levels, labels and caps inside them still come from the protocol/config).
const LOG_CALLS = new Set(['logDebug', 'logWarn', 'logError', '_log']);
const LOG_FORMATTERS = new Set(['formatLogLine', 'formatLogArg', '_log']);

// --- minimal JS tokenizer: strings, templates (nested), regex, numbers, comments
function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;
  const braceStack = []; // for template substitutions: 'tpl' or 'brace'
  const push = (type, value, start) => tokens.push({ type, value, line: start });
  const regexAllowedAfter = (prev) => !prev || (prev.type === 'punct' && !/^[)\]}]$/.test(prev.value)) ||
    (prev.type === 'ident' && /^(return|typeof|case|do|else|in|of|new|delete|void|throw|instanceof|yield|await)$/.test(prev.value));
  const lastSignificant = () => tokens[tokens.length - 1];

  function readTemplate() {
    // at the char after a backtick (or after a closing `}` of a substitution)
    let text = '';
    const start = line;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { text += src[i + 1]; i += 2; continue; }
      if (c === '`') { i++; push('template', text, start); return; }
      if (c === '$' && src[i + 1] === '{') { i += 2; push('template', text, start); braceStack.push('tpl'); push('punct', '${', line); return; }
      if (c === '\n') line++;
      text += c; i++;
    }
    throw new Error('unterminated template');
  }

  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      line += (src.slice(i, end).match(/\n/g) || []).length;
      i = end + 2; continue;
    }
    if (c === '\'' || c === '"') {
      const start = line; let text = ''; i++;
      while (src[i] !== c) { if (src[i] === '\\') { text += src[i + 1]; i += 2; } else { text += src[i]; i++; } }
      i++; push('string', text, start); continue;
    }
    if (c === '`') { i++; readTemplate(); continue; }
    if (c === '}' && braceStack.length && braceStack[braceStack.length - 1] === 'tpl') {
      braceStack.pop(); push('punct', '}$', line); i++; readTemplate(); continue;
    }
    if (c === '/' && regexAllowedAfter(lastSignificant())) {
      const start = line; let j = i + 1; let inClass = false;
      while (j < src.length && (src[j] !== '/' || inClass)) {
        if (src[j] === '\\') j++;
        else if (src[j] === '[') inClass = true;
        else if (src[j] === ']') inClass = false;
        j++;
      }
      j++;
      while (/[a-z]/i.test(src[j])) j++;
      push('regex', src.slice(i, j), start); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      const m = /^(0[xXoObB][0-9a-fA-F_]+n?|\d[\d_]*(\.\d*)?([eE][+-]?\d+)?n?|\.\d+([eE][+-]?\d+)?)/.exec(src.slice(i));
      push('number', m[0], line); i += m[0].length; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
      push('ident', m[0], line); i += m[0].length; continue;
    }
    if (c === '{') braceStack.push('brace');
    if (c === '}') braceStack.pop();
    const three = src.slice(i, i + 4).match(/^(>>>=|===|!==|\*\*=|<<=|>>=|>>>|\.\.\.|=>|&&|\|\||\?\?|\?\.|[+\-*/%&|^<>!=]=|\+\+|--|<<|>>|\*\*)/);
    if (three) { push('punct', three[0], line); i += three[0].length; continue; }
    push('punct', c, line); i++;
  }
  return tokens;
}

// Index of the token closing the group opened at `open` ('(' or '{')
function matching(tokens, open) {
  const pairs = { '(': ')', '{': '}', '${': '}$' };
  const closeFor = { ')': '(', '}': '{', '}$': '${' };
  let depth = 0;
  for (let k = open; k < tokens.length; k++) {
    const v = tokens[k].type === 'punct' ? tokens[k].value : null;
    if (v && pairs[v]) depth++;
    else if (v && closeFor[v]) { depth--; if (depth === 0) return k; }
  }
  throw new Error('unbalanced');
}

function logTextRanges(tokens) {
  const ranges = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.type !== 'ident') continue;
    const next = tokens[k + 1];
    if (LOG_CALLS.has(t.value) || LOG_FORMATTERS.has(t.value)) {
      if (next && next.value === '(') {
        const close = matching(tokens, k + 1);
        ranges.push([k + 1, close]);
        // A definition: the body follows the parameters (optionally after =>)
        let body = close + 1;
        if (tokens[body] && tokens[body].value === '=>') body++;
        if (LOG_FORMATTERS.has(t.value) && tokens[body] && tokens[body].value === '{') ranges.push([body, matching(tokens, body)]);
      } else if (LOG_FORMATTERS.has(t.value) && next && next.value === '=') {
        let body = k + 2;
        while (tokens[body] && tokens[body].value !== '{') body++;
        ranges.push([body, matching(tokens, body)]);
      }
    }
  }
  return ranges;
}

function literalOffenders(file) {
  const tokens = tokenize(fs.readFileSync(path.join(root, file), 'utf8'));
  const exempt = logTextRanges(tokens);
  const inLogText = (k) => exempt.some(([a, b]) => k >= a && k <= b);
  const offenders = [];
  let bootstrapSeen = 0;
  tokens.forEach((t, k) => {
    if (t.type === 'number') {
      if (!ALLOWED_NUMBERS.has(t.value) && !inLogText(k)) offenders.push(`${file}:${t.line} number ${t.value}`);
      return;
    }
    if (t.type === 'regex') {
      offenders.push(`${file}:${t.line} regex ${t.value}`);
      return;
    }
    if (t.type !== 'string' && t.type !== 'template') return;
    if (file === BOOTSTRAP.file && t.type === 'string' && t.value === BOOTSTRAP.value) { bootstrapSeen++; return; }
    if (ALLOWED_STRINGS.has(t.value) || inLogText(k)) return;
    offenders.push(`${file}:${t.line} ${t.type} ${JSON.stringify(t.value)}`);
  });
  return { offenders, bootstrapSeen };
}

test('the tokenizer sees what the guard needs', () => {
  const tokens = tokenize("const a = 'x'; const b = `p${c + `q${d}r`}s`; const r = /a\\/b/g; x = 2 / 3; y = 0.5; // 'no'\n/* \"no\" */");
  const kinds = tokens.filter(t => ['string', 'template', 'regex', 'number'].includes(t.type)).map(t => `${t.type}:${t.value}`);
  assert.deepStrictEqual(kinds, ['string:x', 'template:p', 'template:q', 'template:r', 'template:s', 'regex:/a\\/b/g',
    'number:2', 'number:3', 'number:0.5']);
});

test('the guard covers the MAIN-world scripts', () => {
  assert.deepStrictEqual(MAIN_FILES, ['modules/detection/hooks/window-condition-language.js',
    'modules/detection/hooks/hook-resilience-manager.js', 'modules/detection/hooks/window-property-tracker.js',
    'content-main-world.js']);
});

test('MAIN-world code spells no literals beyond the bootstrap name and the allowlist', () => {
  const all = [];
  for (const file of MAIN_FILES) {
    const { offenders, bootstrapSeen } = literalOffenders(file);
    all.push(...offenders);
    if (file === BOOTSTRAP.file) assert.strictEqual(bootstrapSeen, 1, 'the bootstrap name is spelled exactly once');
  }
  assert.deepStrictEqual(all, []);
});

test('the allowlist holds nothing unused (typeof tags aside)', () => {
  const used = new Set();
  for (const file of MAIN_FILES) {
    for (const t of tokenize(fs.readFileSync(path.join(root, file), 'utf8'))) {
      if (t.type === 'string' || t.type === 'template') used.add(t.value);
    }
  }
  const unused = [...ALLOWED_STRINGS].filter(v => !TYPEOF_TAGS.includes(v) && !used.has(v));
  assert.deepStrictEqual(unused, []);
});

test('the guard fails on a new literal', () => {
  const tmp = path.join(root, 'test', '.literal-guard-probe.js');
  const cases = {
    "window.x = 'scrapfly-something';": 'string',
    'setTimeout(f, 250);': 'number',
    'const re = /^[a-z]+$/;': 'regex',
    'const t = `${a}.${b}`;': 'template',
    "logDebug('fine'); const k = 'not fine';": 'string'
  };
  try {
    for (const [code, kind] of Object.entries(cases)) {
      fs.writeFileSync(tmp, code);
      const { offenders } = literalOffenders(path.relative(root, tmp));
      assert.strictEqual(offenders.length, 1, code);
      assert.ok(offenders[0].includes(` ${kind} `), offenders[0]);
    }
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
