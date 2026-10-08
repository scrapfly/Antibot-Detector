/**
 * Test pattern - the rule editor's one place to understand and try the
 * Regex / Whole word / Case sensitive options of a pattern.
 *
 * PatternTester (pure, also used by node tests) matches sample text the way
 * detection does: it calls the detection engine's own matchers
 * (DetectionEngineManager.prototype.matchCookieName / matchPatternWithCapture /
 * matchPattern), which the popup loads anyway. It also says in plain words
 * what a pattern matches and warns about the usual traps.
 *
 * Rules.prototype.*PatternTester* is the dialog (#patternTesterModal in
 * rules.html), opened by the Test button of each pattern card in the method
 * settings. Apply hands the pattern and options back to that settings dialog;
 * they are saved only by its own Apply, so its Cancel still undoes them.
 *
 * Dependencies: detection engine (popup.html), helper-kit.js, rules-modal-lifecycle.js
 */
(function() {
  'use strict';

  const root = (typeof globalThis !== 'undefined') ? globalThis : window;

  // Which text a pattern is matched against, and how (detection-engine-manager.js runDetector)
  const KINDS = {
    url: { matcher: 'capture', label: ['ptKindUrl', 'URL'] },
    content: { matcher: 'pattern', label: ['ptKindContent', 'Page content'] },
    cookieName: { matcher: 'cookieName', label: ['ptKindCookieName', 'Cookie name'] },
    cookieValue: { matcher: 'pattern', label: ['ptKindCookieValue', 'Cookie value'] },
    headerName: { matcher: 'pattern', label: ['ptKindHeaderName', 'Header name'] },
    headerValue: { matcher: 'pattern', label: ['ptKindHeaderValue', 'Header value'] },
    payloadText: { matcher: 'pattern', label: ['ptKindPayloadText', 'Request body'] },
    // Detection matches the request URL of a payload rule without Whole word
    payloadUrl: { matcher: 'pattern', label: ['ptKindPayloadUrl', 'Request URL'], noWholeWord: true }
  };

  /** Field kind of a pattern being edited: method key + which input */
  function kindFor(methodKey, field) {
    const method = String(methodKey || '').toLowerCase();
    if (field === 'payloadUrl') return 'payloadUrl';
    if (method === 'url' || method === 'urls') return 'url';
    if (method === 'content') return 'content';
    if (method === 'payload') return 'payloadText';
    if (method === 'cookie') return field === 'value' ? 'cookieValue' : 'cookieName';
    if (method === 'header') return field === 'value' ? 'headerValue' : 'headerName';
    return null; // dom, js_hooks, window: no text pattern options
  }

  function optionsFor(kind, options) {
    const spec = KINDS[kind] || KINDS.content;
    return {
      regex: !!(options && options.regex),
      wholeWord: !spec.noWholeWord && !!(options && options.wholeWord),
      caseSensitive: !!(options && options.caseSensitive)
    };
  }

  function engine() {
    // A class declaration is a global binding but not a property of window
    const Manager = (typeof DetectionEngineManager !== 'undefined') ? DetectionEngineManager : root.DetectionEngineManager;
    if (!Manager || !Manager.prototype) throw new Error('PatternTester: the detection engine is not loaded');
    return Manager;
  }

  /** Why a regex can never match: { error } for invalid syntax, { rejected } for the ReDoS guard */
  function regexProblem(pattern, options) {
    if (!options.regex || !pattern) return null;
    if (typeof root.isLikelyEvilRegex === 'function' && root.isLikelyEvilRegex(pattern)) return { rejected: true };
    try {
      new RegExp(pattern, options.caseSensitive ? '' : 'i');
    } catch (error) {
      return { error: String(error && error.message || error) };
    }
    return null;
  }

  /** Where the match is, for the highlight (the decision itself comes from the engine) */
  function locate(kind, text, pattern, options) {
    const Manager = engine();
    if (kind === 'cookieName' && !options.regex && !options.wholeWord) {
      return pattern.includes('*') ? { start: 0, end: text.length } : { start: 0, end: pattern.length };
    }
    let regex = null;
    if (options.regex) {
      regex = Manager.patternCache.getCompiledPattern(pattern, { regex: true, caseSensitive: options.caseSensitive });
    } else if (options.wholeWord) {
      const compiled = options.caseSensitive ? pattern : pattern.toLowerCase();
      regex = Manager.patternCache.getCompiledPattern(compiled, { wholeWord: true, caseSensitive: options.caseSensitive });
    }
    if (regex) {
      const found = regex.exec(text);
      return found ? { start: found.index, end: found.index + found[0].length } : { start: -1, end: -1 };
    }
    const haystack = options.caseSensitive ? text : text.toLowerCase();
    const index = haystack.indexOf(options.caseSensitive ? pattern : pattern.toLowerCase());
    return index >= 0 ? { start: index, end: index + pattern.length } : { start: -1, end: -1 };
  }

  /**
   * Match one sample the way detection matches this kind of field.
   * @returns {{matched: boolean, start: number, end: number, error?: string, rejected?: boolean}}
   */
  function evaluate(kind, text, pattern, rawOptions) {
    const options = optionsFor(kind, rawOptions);
    const sample = String(text === undefined || text === null ? '' : text);
    const value = String(pattern === undefined || pattern === null ? '' : pattern);
    const result = { matched: false, start: -1, end: -1 };
    const problem = regexProblem(value, options);
    if (problem) Object.assign(result, problem);
    if (!sample || !value) return result;

    const Manager = engine();
    const self = Manager.prototype;
    const matcher = (KINDS[kind] || KINDS.content).matcher;
    let matched;
    if (matcher === 'cookieName') matched = self.matchCookieName.call(self, sample, value, options);
    else if (matcher === 'capture') matched = self.matchPatternWithCapture.call(self, sample, value, options) !== null;
    else matched = self.matchPattern.call(self, sample, value, options);
    result.matched = !!matched;
    if (result.matched) Object.assign(result, locate(kind, sample, value, options));
    return result;
  }

  /** What the pattern matches, in plain words: [{key, fallback, args}] (whole sentences) */
  function describe(kind, pattern, rawOptions) {
    const options = optionsFor(kind, rawOptions);
    const value = String(pattern || '');
    if (!value) return [{ key: 'ptSaysEmpty', fallback: 'Type a pattern to see what it matches.', args: [] }];
    const sentences = [];
    if (options.regex) {
      sentences.push({ key: 'ptSaysRegex', fallback: 'Matches text where the regex finds a match.', args: [] });
    } else if (options.wholeWord) {
      sentences.push({ key: 'ptSaysWordFmt', fallback: 'Matches “{0}” as a whole word, not inside a longer word.', args: [value] });
    } else if (kind === 'cookieName' && value.includes('*')) {
      sentences.push({ key: 'ptSaysWildcardFmt', fallback: 'Matches names like “{0}”, where * stands for any text.', args: [value] });
    } else if (kind === 'cookieName') {
      sentences.push({ key: 'ptSaysPrefixFmt', fallback: 'Matches names that start with “{0}”.', args: [value] });
    } else {
      sentences.push({ key: 'ptSaysContainsFmt', fallback: 'Matches text that contains “{0}”.', args: [value] });
    }
    sentences.push(options.caseSensitive
      ? { key: 'ptCaseExact', fallback: 'Upper and lower case must match exactly.', args: [] }
      : { key: 'ptCaseIgnored', fallback: 'Upper and lower case are treated the same.', args: [] });
    return sentences;
  }

  const LOOKS_LIKE_REGEX = /\\[.dwsDWSbB/]|^\^|[^\\]\$$|\.\*|\.\+|\(\?:|\[[^\]]+\]\{?|\{\d+(,\d*)?\}/;

  /** Traps worth a line: [{tone: 'danger'|'warning'|'info', key, fallback, args}] */
  function notes(kind, pattern, rawOptions) {
    const options = optionsFor(kind, rawOptions);
    const value = String(pattern || '');
    const list = [];
    if (!value) return list;
    const problem = regexProblem(value, options);
    if (problem && problem.error) {
      list.push({ tone: 'danger', key: 'ptNoteInvalidFmt', fallback: 'This regex is not valid, so it never matches: {0}', args: [problem.error] });
    } else if (problem && problem.rejected) {
      list.push({ tone: 'danger', key: 'ptNoteRejected', fallback: 'Detection rejects this regex because it could freeze pages (a repeat inside a repeat, or over 1000 characters), so it never matches.', args: [] });
    }
    if (options.regex && /^\/.+\/[a-z]*$/.test(value)) {
      list.push({ tone: 'warning', key: 'ptNoteSlashes', fallback: 'Leave out the / at both ends: they are matched as part of the text.', args: [] });
    }
    if (!options.regex && LOOKS_LIKE_REGEX.test(value)) {
      list.push({ tone: 'warning', key: 'ptNoteLooksRegex', fallback: 'This looks like a regex: turn on Regex, otherwise its symbols are matched as plain text.', args: [] });
    }
    if (options.regex && rawOptions && rawOptions.wholeWord && !KINDS[kind]?.noWholeWord) {
      list.push({ tone: 'info', key: 'ptNoteWordIgnored', fallback: 'Whole word is ignored while Regex is on.', args: [] });
    }
    if (kind === 'headerName' && options.caseSensitive && /[A-Z]/.test(value.replace(/\\[A-Z]/g, ''))) {
      list.push({ tone: 'warning', key: 'ptNoteHeaderCase', fallback: 'Header names are stored in lower case, so with Case sensitive on this pattern never matches.', args: [] });
    }
    if (options.wholeWord && !options.regex && (/^\W/.test(value) || /\W$/.test(value))) {
      list.push({ tone: 'info', key: 'ptNoteWordEdges', fallback: 'This pattern starts or ends with a symbol, so Whole word needs a letter, digit or _ right next to that symbol.', args: [] });
    }
    return list;
  }

  function swapCase(text) {
    return Array.from(text, (ch) => (ch === ch.toUpperCase() ? ch.toLowerCase() : ch.toUpperCase())).join('');
  }

  /**
   * Sample lines that show how a literal pattern behaves: itself, joined to
   * text before and after, and in another case. Nothing for a regex (the user
   * pastes real text).
   */
  function defaultSamples(kind, pattern, rawOptions) {
    const options = optionsFor(kind, rawOptions);
    const value = String(pattern || '');
    if (!value || options.regex) return [];
    const base = (kind === 'cookieName' && value.includes('*')) ? value.replace(/\*+/g, 'abc') : value;
    const samples = [base, `x${base}`, `${base}_2`, swapCase(base)];
    return samples.filter((sample, index) => sample && samples.indexOf(sample) === index);
  }

  /** Lines of the samples box (blank lines ignored, at most 20) */
  function sampleLines(text) {
    return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20);
  }

  const PatternTester = Object.freeze({ KINDS, kindFor, optionsFor, evaluate, describe, notes, defaultSamples, sampleLines, regexProblem });
  root.PatternTester = PatternTester;
  if (typeof module !== 'undefined' && module.exports) module.exports = PatternTester;
})();

// ============================================
// Dialog (popup only)
// ============================================

if (typeof Rules !== 'undefined') {
  // Regex cheat sheet rows: token, key, English fallback
  const PATTERN_TESTER_CHEATS = [
    ['^', 'rhRefStart', 'start'],
    ['$', 'rhRefEnd', 'end'],
    ['.', 'rhRefAny', 'any character'],
    ['\\.', 'rhRefDot', 'a real dot'],
    ['\\d', 'rhRefDigit', 'digit'],
    ['\\w', 'rhRefWord', 'letter, digit or _'],
    ['\\s', 'rhRefSpace', 'whitespace'],
    ['[abc]', 'rhRefSet', 'one of a, b, c'],
    ['+', 'rhRefOneMore', '1 or more'],
    ['*', 'rhRefZeroMore', '0 or more'],
    ['?', 'rhRefOptional', 'optional'],
    ['{2,5}', 'rhRefCount', '2 to 5 times'],
    ['(a|b)', 'rhRefOr', 'a or b']
  ];

  // Settings dialog inputs of each pattern field
  const PATTERN_TESTER_FIELDS = {
    name: { regex: '#nameRegex', wholeWord: '#nameWholeWord', caseSensitive: '#nameCaseSensitive' },
    value: { regex: '#valueRegex', wholeWord: '#valueWholeWord', caseSensitive: '#valueCaseSensitive' },
    payloadUrl: { regex: '#payloadUrlRegex', caseSensitive: '#payloadUrlCaseSensitive' }
  };

  const ptText = (item) => RuleHelperKit.fmt(item.key, item.fallback, ...(item.args || []));

  /** The pattern text of a settings field: pending (tested and applied) or the input's */
  Rules.prototype.getSettingsPatternText = function(field) {
    if (field === 'payloadUrl') return document.querySelector('#payloadUrlPattern')?.value || '';
    if (this._pendingPatternText && field in this._pendingPatternText) return this._pendingPatternText[field];
    const selector = field === 'value' ? '.method-input.method-value' : '.method-input.method-name';
    return this.currentMethodItem?.querySelector(selector)?.value || '';
  };

  Rules.prototype.getSettingsPatternOptions = function(field) {
    const inputs = PATTERN_TESTER_FIELDS[field] || {};
    const read = (selector) => !!(selector && document.querySelector(selector)?.checked);
    return { regex: read(inputs.regex), wholeWord: read(inputs.wholeWord), caseSensitive: read(inputs.caseSensitive) };
  };

  Rules.prototype.getSettingsPatternKind = function(field) {
    return PatternTester.kindFor(this.getMethodItemType(this.currentMethodItem), field);
  };

  /**
   * Refresh the pattern line and the plain-words sentence of the settings
   * cards (on open, when an option changes, after the tester applied).
   */
  Rules.prototype.refreshSettingsPatternCards = function() {
    if (!this.currentMethodItem) return;
    for (const field of ['name', 'value', 'payloadUrl', 'dom', 'window']) {
      // 'dom' and 'window' are the CSS selector and Window property cards:
      // the name field of a DOM / WINDOW rule, no matching options
      const card = field === 'dom' || field === 'window';
      const kind = card ? null : this.getSettingsPatternKind(field);
      const text = this.getSettingsPatternText(card ? 'name' : field);
      const preview = document.querySelector(`[data-pattern-preview="${field}"]`);
      if (preview) {
        preview.textContent = text || RuleHelperKit.tr('ptNoPattern', 'No pattern yet');
        preview.classList.toggle('is-empty', !text);
        preview.title = text;
        preview.classList.toggle('is-pending', !!(this._pendingPatternText && (card ? 'name' : field) in this._pendingPatternText));
      }
      const says = document.querySelector(`[data-pattern-says="${field}"]`);
      if (says && field === 'window') {
        // "Matches pages where window.grecaptcha.render is a function"
        const condition = this.getSettingsPatternText('value') || 'exists';
        const label = typeof this.windowConditionLabel === 'function' ? this.windowConditionLabel(condition) : condition;
        says.textContent = text
          ? RuleHelperKit.fmt('rhWindowSentenceFmt', 'Matches pages where {0} {1}', `window.${text.replace(/^window\./, '')}`, label)
          : '';
      } else if (says) {
        says.textContent = kind && text
          ? PatternTester.describe(kind, text, this.getSettingsPatternOptions(field)).map(ptText).join(' ')
          : '';
      }
    }
  };

  Rules.prototype.setupPatternTesterModal = function() {
    this._ptSamples = {};
    this._patternTesterModal = new RulesModalLifecycle('#patternTesterModal');
    const modal = this._patternTesterModal;
    modal.setupCloseListeners('#closePatternTester', '#cancelPatternTester');
    RuleHelperKit.onEscape('#patternTesterModal', () => modal.close());

    const patternInput = document.querySelector('#ptPattern');
    const samples = document.querySelector('#ptSamples');
    patternInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) event.preventDefault();
    });
    patternInput?.addEventListener('input', () => {
      if (/[\r\n]/.test(patternInput.value)) patternInput.value = patternInput.value.replace(/[\r\n]+/g, '');
      this.fitPatternTesterInput();
      this.renderPatternTester();
    });
    samples?.addEventListener('input', () => {
      if (this._ptState) this._ptSamples[this._ptState.kind] = samples.value;
      this.renderPatternTester();
    });
    document.querySelectorAll('#patternTesterModal .pt-option').forEach((button) => {
      button.addEventListener('click', () => {
        if (!this._ptState) return;
        const option = button.dataset.option;
        this._ptState.options[option] = !this._ptState.options[option];
        this.renderPatternTester();
      });
    });
    document.querySelector('#ptResetSamples')?.addEventListener('click', () => {
      if (!this._ptState || !samples) return;
      delete this._ptSamples[this._ptState.kind];
      samples.value = PatternTester.defaultSamples(this._ptState.kind, patternInput?.value || '', this._ptState.options).join('\n');
      this.renderPatternTester();
      samples.focus();
    });
    document.querySelector('#applyPatternTester')?.addEventListener('click', () => this.applyPatternTester());

    // Cheat sheet rows (static)
    const cheat = document.querySelector('#ptCheatList');
    if (cheat) {
      cheat.replaceChildren(...PATTERN_TESTER_CHEATS.map(([token, key, fallback]) => {
        const item = RuleHelperKit.el('div', 'rh-ref-item');
        const dt = RuleHelperKit.el('dt', 'rh-ref-token', token);
        dt.dir = 'ltr';
        item.appendChild(dt);
        item.appendChild(RuleHelperKit.el('dd', 'rh-ref-text', RuleHelperKit.tr(key, fallback)));
        return item;
      }));
    }

    // Test buttons of the settings cards, and live sentences while options change
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-pattern-test]');
      if (!button) return;
      event.stopPropagation();
      this.openPatternTester(button.dataset.patternTest);
    });
    const refresh = () => this.refreshSettingsPatternCards();
    Object.values(PATTERN_TESTER_FIELDS).forEach((inputs) => Object.values(inputs).forEach((selector) => {
      document.querySelector(selector)?.addEventListener('change', refresh);
    }));
    document.querySelector('#payloadUrlPattern')?.addEventListener('input', refresh);
  };

  /** Open the tester for a settings field: 'name', 'value' or 'payloadUrl' */
  Rules.prototype.openPatternTester = function(field) {
    if (!this.currentMethodItem || !this._patternTesterModal) return;
    const kind = this.getSettingsPatternKind(field);
    if (!kind) return;
    const pattern = this.getSettingsPatternText(field);
    const options = this.getSettingsPatternOptions(field);
    this._ptState = { field, kind, options };

    const title = document.querySelector('#patternTesterTitle');
    if (title) {
      const [key, fallback] = PatternTester.KINDS[kind].label;
      title.textContent = RuleHelperKit.fmt('ptTitleFmt', 'Test pattern · {0}', RuleHelperKit.tr(key, fallback));
    }
    const wholeWordButton = document.querySelector('#patternTesterModal .pt-option[data-option="wholeWord"]');
    if (wholeWordButton) wholeWordButton.hidden = !!PatternTester.KINDS[kind].noWholeWord;

    const patternInput = document.querySelector('#ptPattern');
    if (patternInput) patternInput.value = pattern;
    const samples = document.querySelector('#ptSamples');
    if (samples) {
      samples.value = this._ptSamples[kind] !== undefined
        ? this._ptSamples[kind]
        : PatternTester.defaultSamples(kind, pattern, options).join('\n');
    }
    const cheat = document.querySelector('#ptCheatSheet');
    if (cheat) cheat.open = !!options.regex;

    this.renderPatternTester();
    this._patternTesterModal.open();
    this.fitPatternTesterInput();
    const body = document.querySelector('#patternTesterModal .rh-body');
    if (body) body.scrollTop = 0;
    if (patternInput) {
      patternInput.focus();
      patternInput.setSelectionRange(patternInput.value.length, patternInput.value.length);
    }
  };

  /** Grow the pattern box with its text (wrapped), up to four lines */
  Rules.prototype.fitPatternTesterInput = function() {
    const input = document.querySelector('#ptPattern');
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 92)}px`;
  };

  /** Results row text with the matched part in <mark> */
  function ptSampleNode(sample, result) {
    const code = RuleHelperKit.el('code', 'pt-sample');
    code.dir = 'ltr';
    if (result.matched && result.end > result.start) {
      code.appendChild(document.createTextNode(sample.slice(0, result.start)));
      code.appendChild(RuleHelperKit.el('mark', '', sample.slice(result.start, result.end)));
      code.appendChild(document.createTextNode(sample.slice(result.end)));
    } else {
      code.textContent = sample;
    }
    return code;
  }

  Rules.prototype.renderPatternTester = function() {
    const state = this._ptState;
    if (!state) return;
    const pattern = document.querySelector('#ptPattern')?.value || '';

    document.querySelectorAll('#patternTesterModal .pt-option').forEach((button) => {
      button.setAttribute('aria-pressed', state.options[button.dataset.option] ? 'true' : 'false');
    });

    const says = document.querySelector('#ptSays');
    if (says) says.textContent = PatternTester.describe(state.kind, pattern, state.options).map(ptText).join(' ');

    const notesEl = document.querySelector('#ptNotes');
    if (notesEl) {
      notesEl.replaceChildren(...PatternTester.notes(state.kind, pattern, state.options).map((note) => {
        const line = RuleHelperKit.el('p', `pt-note tone-${note.tone}`, ptText(note));
        line.dir = 'auto';
        return line;
      }));
    }

    const resultsEl = document.querySelector('#ptResults');
    if (resultsEl) {
      const lines = PatternTester.sampleLines(document.querySelector('#ptSamples')?.value);
      if (!lines.length) {
        resultsEl.replaceChildren(RuleHelperKit.el('li', 'pt-result is-empty',
          RuleHelperKit.tr('ptNoSamples', 'Type or paste text above, one per line, to see whether it matches.')));
      } else {
        resultsEl.replaceChildren(...lines.map((line) => {
          const result = pattern ? PatternTester.evaluate(state.kind, line, pattern, state.options) : { matched: false, start: -1, end: -1 };
          const row = RuleHelperKit.el('li', 'pt-result' + (result.matched ? ' is-match' : ''));
          row.appendChild(RuleHelperKit.renderChip(result.matched
            ? '✓ ' + RuleHelperKit.tr('rhMatch', 'Match')
            : '× ' + RuleHelperKit.tr('rhNoMatch', 'No match'), result.matched ? 'success' : 'danger'));
          row.appendChild(ptSampleNode(line, result));
          return row;
        }));
      }
    }
  };

  /** Hand the tested pattern and options back to the settings dialog */
  Rules.prototype.applyPatternTester = function() {
    const state = this._ptState;
    if (!state || !this.currentMethodItem) return;
    const pattern = document.querySelector('#ptPattern')?.value || '';
    const inputs = PATTERN_TESTER_FIELDS[state.field] || {};
    for (const [option, selector] of Object.entries(inputs)) {
      const box = selector && document.querySelector(selector);
      if (box) box.checked = !!state.options[option];
    }
    if (state.field === 'payloadUrl') {
      const input = document.querySelector('#payloadUrlPattern');
      if (input) input.value = pattern;
    } else {
      // Written to the rule by the settings dialog's Apply (saveMethodSettings)
      this._pendingPatternText = { ...(this._pendingPatternText || {}), [state.field]: pattern };
    }
    this.refreshSettingsPatternCards();
    this._patternTesterModal.close();
    document.querySelector(`[data-pattern-test="${state.field}"]`)?.focus();
  };

  /** Settings Apply: write the pending pattern texts into the rule's inputs */
  Rules.prototype.commitPendingPatternText = function() {
    const pending = this._pendingPatternText;
    this._pendingPatternText = null;
    if (!pending || !this.currentMethodItem) return;
    for (const [field, text] of Object.entries(pending)) {
      const input = this.currentMethodItem.querySelector(field === 'value' ? '.method-input.method-value' : '.method-input.method-name');
      if (!input || input.value === text) continue;
      input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // A Window rule's condition lives in the row's dropdown (hidden input + label)
    this.syncInlineConditionDropdown?.(this.currentMethodItem);
  };
}
