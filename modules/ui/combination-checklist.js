/**
 * CombinationChecklist - a fired combination as a plain-language checklist:
 * its name and confidence, then every condition with ✓ found / ○ not found,
 * the method and the pattern's own description. Detection and History
 * details both draw it.
 *
 * build() turns combinations into cards, renderHtml() draws them and
 * copyText() gives the same content as text. Popup only: the service worker
 * and pages never load this file (detection-combinations.js is the engine).
 */
(function initCombinationChecklist(root) {
  'use strict';

  const engine = () => (typeof DetectionCombinations !== 'undefined' ? DetectionCombinations : root.DetectionCombinations);

  // Field that holds a pattern's text, per method (as in the engine)
  const KEY_FIELD = {
    url: 'text', content: 'text', payload: 'text',
    cookie: 'name', header: 'name', dom: 'selector',
    window: 'path', js_hooks: 'target'
  };

  const tr = (key, fallback) => {
    const text = (typeof I18n !== 'undefined' && I18n && typeof I18n.get === 'function') ? I18n.get(key) : '';
    return text || fallback;
  };
  const fmt = (key, fallback, ...args) => {
    const text = (typeof I18n !== 'undefined' && I18n && typeof I18n.format === 'function') ? I18n.format(key, ...args) : '';
    return text || args.reduce((out, arg, i) => out.split(`{${i}}`).join(String(arg)), fallback);
  };
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const oneLine = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

  /** Text of a pattern as written in the rule, with " = value" for cookies and headers. */
  function patternText(method, pattern) {
    if (!pattern || typeof pattern !== 'object') return '';
    const key = String(pattern[KEY_FIELD[method]] ?? '');
    const value = (method === 'cookie' || method === 'header') && pattern.value ? ` = ${pattern.value}` : '';
    return key + value;
  }

  /** The value a match showed on the page, for the row tooltip. */
  function matchedValue(match) {
    if (!match) return '';
    const value = match.fullUrl || match.value || match.selector || match.name || '';
    return oneLine(value).slice(0, 300);
  }

  /**
   * Cards for the combinations of one detection.
   * @param {object} input
   * @param {Array<object>} input.combinations - {id, name, confidence, when?, found?}
   * @param {object} [input.definition] - the detector as loaded now (patterns, combinations)
   * @param {Array<object>} [input.matches] - the detection's matches (Detection details)
   * @param {Array<string>} [input.found] - History: the stored found rows the rule does not imply
   * @param {number} [input.detectionConfidence] - the detection's score
   * @param {boolean} [input.fromHistory] - History entry: the tree comes from the rule by id and
   *   its key (h) must still match, otherwise only the name and score are shown
   * @returns {Array<object>} cards, highest confidence first
   */
  function build(input = {}) {
    const C = engine();
    const definition = input.definition && typeof input.definition === 'object' ? input.definition : null;
    const matches = Array.isArray(input.matches) ? input.matches : [];
    const patterns = new Map();
    if (definition && C) {
      for (const p of C.listPatterns(definition)) patterns.set(p.id, p);
    }
    const definedCombos = new Map((Array.isArray(definition?.combinations) ? definition.combinations : [])
      .filter(c => c && c.id).map(c => [c.id, c]));
    const matchesById = new Map();
    if (C) {
      for (const match of matches) {
        const ids = definition ? C.matchPatternIds(definition, match)
          : (typeof match?.patternId === 'string' && match.patternId ? [match.patternId] : []);
        ids.forEach(id => { if (!matchesById.has(id)) matchesById.set(id, match); });
      }
    }
    const score = Math.round(Number(input.detectionConfidence) || 0);

    const cards = (Array.isArray(input.combinations) ? input.combinations : [])
      .filter(combo => combo && typeof combo === 'object')
      .map((combo, index) => {
        const defined = combo.id ? definedCombos.get(combo.id) : null;
        const confidence = Math.max(0, Math.min(100, Math.round(Number(combo.confidence) || 0)));
        const card = {
          id: combo.id || '',
          // History may have lost the name with the rule: its id says more than a number
          name: oneLine(combo.name) || oneLine(defined?.name)
            || (input.fromHistory && combo.id) || fmt('combinationDefaultNameFmt', 'Combination {0}', index + 1),
          confidence,
          auto: Boolean(defined) && !(Number(defined.confidence) > 0),
          setsScore: false,
          order: index,
          tree: null,
          unavailable: ''
        };
        if (!C) {
          card.unavailable = 'changed';
          return card;
        }
        let when = combo.when || null;
        let found;
        if (input.fromHistory) {
          // Saved before checklists: nothing to rebuild it from
          if (typeof combo.h !== 'string') {
            card.unavailable = 'notSaved';
            return card;
          }
          // The rule was edited or removed since the scan
          if (!defined || !defined.when || C.treeKey(defined.when) !== combo.h) {
            card.unavailable = 'changed';
            return card;
          }
          when = defined.when;
          found = [...(Array.isArray(input.found) ? input.found : []), ...C.mustHaveFound(when)];
        } else {
          when = when || defined?.when || null;
          if (!when) {
            card.unavailable = 'changed';
            return card;
          }
          found = Array.isArray(combo.found) ? combo.found
            : (definition ? C.foundFromMatches(definition, { when }, matches) : []);
        }
        card.tree = node(when, false, C.seenFromFound(found), patterns, matchesById, C);
        return card;
      });

    cards.sort((a, b) => (b.confidence - a.confidence) || (a.order - b.order));
    if (score > 0 && cards.length && Math.max(...cards.map(c => c.confidence)) >= score) {
      cards.forEach(card => { card.setsScore = card.confidence === score; });
    }
    return cards;
  }

  function node(tree, negative, seen, patterns, matchesById, C) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.not) return node(tree.not, !negative, seen, patterns, matchesById, C);
    const mode = ['all', 'any', 'of'].find(key => Array.isArray(tree[key]));
    if (mode) {
      const held = C.evaluate(tree, seen);
      return {
        kind: 'group',
        mode,
        atLeast: mode === 'of' ? Number(tree.atLeast) || 1 : null,
        negative,
        met: negative ? !held : held,
        items: tree[mode].map(child => node(child, false, seen, patterns, matchesById, C)).filter(Boolean)
      };
    }
    if (typeof tree.method === 'string') {
      const found = seen.methods.has(tree.method);
      return { kind: 'method', method: tree.method, negative, found, met: negative ? !found : found };
    }
    if (typeof tree.pattern === 'string') {
      const id = tree.pattern;
      const defined = patterns.get(id);
      const match = matchesById.get(id);
      const found = seen.patterns.has(id);
      const method = defined?.method || C.methodOf(match?.type) || '';
      const text = defined ? patternText(defined.method, defined.pattern) : oneLine(match?.pattern || '');
      const description = oneLine(defined?.pattern?.description || match?.description || '');
      return {
        kind: 'pattern', id, method, negative, found, met: negative ? !found : found,
        description, text: text || id, value: found ? matchedValue(match) : ''
      };
    }
    return null;
  }

  function groupHeading(group, isRoot) {
    if (group.negative) return tr('combinationNoneOfThese', 'None of these:');
    if (group.mode === 'of') return fmt('combinationAtLeastOfTheseFmt', 'At least {0} of these:', group.atLeast);
    if (group.mode === 'any') return tr('combinationOneOfThese', 'One of these:');
    return isRoot ? tr('combinationAllFound', 'All of these were found:') : tr('combinationAllOfThese', 'All of these:');
  }

  function markOf(item) {
    if (item.negative) {
      return item.met
        ? { symbol: '✓', cls: 'is-found', label: tr('combinationAbsentAsRequired', 'Not found, as required') }
        : { symbol: '✕', cls: 'is-blocked', label: tr('combinationFound', 'Found') };
    }
    return item.met
      ? { symbol: '✓', cls: 'is-found', label: tr('combinationFound', 'Found') }
      : { symbol: '○', cls: 'is-missing', label: tr('combinationNotFound', 'Not found') };
  }

  function unavailableText(card) {
    return card.unavailable === 'notSaved'
      ? tr('combinationDetailsNotSaved', 'Its conditions were not saved with this scan; only its name and score are shown.')
      : tr('combinationDetailsUnavailable', 'This rule changed or was removed after the scan, so only its name and score are shown.');
  }

  // Icons for the marks: the ✓ character renders as √ in some UI fonts
  const MARK_ICONS = {
    'is-found': '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3.2 8.4l3 3 6.6-6.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'is-missing': '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><circle cx="8" cy="8" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
    'is-blocked': '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  function hexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return '';
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
  }

  function chipHtml(method, options) {
    const label = (options.methodLabel && options.methodLabel(method)) || method;
    const color = options.tagColor ? options.tagColor(method) : '';
    const style = color && hexToRgba(color, 1)
      ? ` style="color:${esc(color)};background:${esc(hexToRgba(color, 0.15))};border-color:${esc(hexToRgba(color, 0.35))}"`
      : '';
    return `<span class="match-combo-chip badge-${esc(method)}"${style}>${esc(label)}</span>`;
  }

  function leafText(item, options) {
    if (item.kind === 'method') {
      const label = (options.methodLabel && options.methodLabel(item.method)) || item.method;
      return fmt('combinationAnyOfMethodFmt', 'Any {0} pattern', label);
    }
    return item.description || item.text;
  }

  /** The rows of a group; `labelId` names the heading that labels them. */
  function rowsHtml(group, options, labelId) {
    const items = group.items.map(item => {
      const mark = markOf(item);
      const markHtml = `<span class="match-combo-mark ${mark.cls}" role="img" aria-label="${esc(mark.label)}">${MARK_ICONS[mark.cls]}</span>`;
      if (item.kind === 'group') {
        const subId = `${options.idPrefix || 'match-combo'}-${options.nextId()}`;
        return `<li class="match-combo-row match-combo-sub ${mark.cls}">
          <div class="match-combo-sub-head">${markHtml}<span class="match-combo-sub-title" id="${subId}">${esc(groupHeading(item, false))}</span></div>
          ${rowsHtml(item, options, subId)}
        </li>`;
      }
      const text = leafText(item, options);
      const raw = item.kind === 'pattern' && item.description ? item.text : '';
      const tip = [raw, item.value && item.value !== raw ? item.value : ''].filter(Boolean);
      const tipAttrs = tip.length
        ? ` data-tip="${esc(tip[0])}"${tip[1] ? ` data-tip-detail="${esc(tip[1])}"` : ''}`
        : '';
      const plain = item.kind === 'pattern' && !item.description;
      return `<li class="match-combo-row ${mark.cls}${item.negative ? ' is-not' : ''}"${tipAttrs}>
        ${markHtml}
        ${chipHtml(item.method, options)}
        <span class="match-combo-text${plain ? ' is-raw' : ''}" dir="${plain ? 'ltr' : 'auto'}">${item.negative ? `<span class="match-combo-not">${esc(tr('combinationMustNotBeFound', 'Must not be found'))}:</span> ` : ''}${esc(text)}</span>
      </li>`;
    }).join('');
    return `<ul class="match-combo-rows" role="group" aria-labelledby="${labelId}">${items}</ul>`;
  }

  /** A card's whole checklist: the lead line, then its rows. */
  function treeHtml(tree, options) {
    const group = tree.kind === 'group' ? tree : { kind: 'group', mode: 'all', negative: false, items: [tree] };
    const leadId = `${options.idPrefix || 'match-combo'}-${options.nextId()}`;
    return `<p class="match-combo-lead" id="${leadId}">${esc(groupHeading(group, true))}</p>${rowsHtml(group, options, leadId)}`;
  }

  /**
   * HTML for the cards.
   * @param {Array<object>} cards - from build()
   * @param {object} [options] - { methodLabel(method), tagColor(method), confidenceHtml(value, cls, tip), idPrefix }
   */
  function renderHtml(cards, options = {}) {
    let counter = 0;
    const opts = { ...options, nextId: () => ++counter };
    const confidence = (value, card) => {
      const tip = card.auto ? { title: tr('combinationAutoTip', 'Auto: the highest confidence of the patterns that made it fire') } : null;
      if (typeof options.confidenceHtml === 'function') return options.confidenceHtml(value, 'match-combo-confidence', tip);
      return `<span class="match-combo-confidence">${esc(value)}%</span>`;
    };
    return (Array.isArray(cards) ? cards : []).map((card, index) => {
      const head = `<div class="match-combo-head">
          <h5 class="match-combo-name" dir="auto">${esc(card.name)}</h5>
          ${confidence(card.confidence, card)}
        </div>`;
      const score = card.setsScore
        ? `<p class="match-combo-score"><span aria-hidden="true">★</span> ${esc(tr('combinationSetsScore', 'Sets the detection score'))}</p>`
        : '';
      const body = card.unavailable || !card.tree
        ? `<p class="match-combo-unavailable">${esc(unavailableText(card))}</p>`
        : treeHtml(card.tree, opts);
      const copy = card.unavailable ? '' : `<div class="match-combo-foot">
          <button type="button" class="match-combo-copy" data-combo-index="${index}" aria-label="${esc(fmt('combinationCopyFmt', 'Copy “{0}”', card.name))}">${esc(tr('advCommonCopy', 'Copy'))}</button>
        </div>`;
      return `<article class="match-combo${card.setsScore ? ' sets-score' : ''}" data-combo-id="${esc(card.id)}">${head}${score}${body}${copy}</article>`;
    }).join('');
  }

  /** The card as text: name and confidence, then one line per condition. */
  function copyText(card, options = {}) {
    if (!card) return '';
    const lines = [`${card.name} (${card.confidence}%)`];
    if (card.setsScore) lines.push(tr('combinationSetsScore', 'Sets the detection score'));
    if (card.unavailable || !card.tree) {
      lines.push(unavailableText(card));
      return lines.join('\n');
    }
    const label = (method) => (options.methodLabel && options.methodLabel(method)) || method;
    const walk = (group, depth, isRoot) => {
      const pad = '  '.repeat(depth);
      if (isRoot) lines.push(groupHeading(group, true));
      for (const item of group.items) {
        const mark = markOf(item).symbol;
        if (item.kind === 'group') {
          lines.push(`${pad}${mark} ${groupHeading(item, false)}`);
          walk(item, depth + 1, false);
          continue;
        }
        const not = item.negative ? `${tr('combinationMustNotBeFound', 'Must not be found')}: ` : '';
        const raw = item.kind === 'pattern' && item.description && item.text ? ` — ${item.text}` : '';
        lines.push(`${pad}${mark} ${label(item.method)}: ${not}${leafText(item, options)}${raw}`);
      }
    };
    walk(card.tree.kind === 'group' ? card.tree : { kind: 'group', mode: 'all', negative: false, items: [card.tree] }, 0, true);
    return lines.join('\n');
  }

  const api = Object.freeze({ build, renderHtml, copyText, patternText });
  root.CombinationChecklist = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
