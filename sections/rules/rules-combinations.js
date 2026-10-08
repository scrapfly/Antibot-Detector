/**
 * Popup combination builder. Edits the stored condition tree directly, so
 * nested All / One of / At least groups survive opening, renaming and saving.
 *
 * Each row shows the pattern's own description first (from the stored rule,
 * while its text is unchanged) and the raw pattern under it; groups can be
 * added at the top level, changed and deleted; a sentence says when the
 * combination fires. "These patterns only count together" sets the
 * patterns' standalone flag, which is shared by the whole rule; it never
 * changes on its own when rows are added or removed.
 */
const combosText = (key, fallback) =>
  (typeof I18n !== 'undefined' && typeof I18n.tr === 'function') ? I18n.tr(key, fallback) : fallback;
const combosFormat = (key, fallback, ...args) => {
  const translated = (typeof I18n !== 'undefined' && typeof I18n.format === 'function') ? I18n.format(key, ...args) : '';
  return translated || args.reduce((text, arg, i) => text.split(`{${i}}`).join(String(arg)), fallback);
};
const COMBO_METHODS = ['url', 'header', 'cookie', 'content', 'dom', 'js_hooks', 'window', 'payload'];
// Field that holds a pattern's text, per method (as in the engine)
const COMBO_KEY_FIELD = { url: 'text', content: 'text', payload: 'text', cookie: 'name', header: 'name', dom: 'selector', window: 'path', js_hooks: 'target' };
const COMBO_ICONS = {
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  chevron: '<svg class="combo-collapse-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 15 6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

Rules.comboUnwrap = function(node) {
  let negative = false;
  while (node?.not) { negative = !negative; node = node.not; }
  return { node, negative };
};
Rules.comboGroupKey = function(node) {
  return ['all', 'any', 'of'].find(key => Array.isArray(node?.[key]));
};
Rules.comboLeaves = function(tree, out = []) {
  const { node, negative } = Rules.comboUnwrap(tree);
  if (typeof node?.pattern === 'string') out.push({ kind: 'pattern', id: node.pattern, not: negative });
  else if (typeof node?.method === 'string') out.push({ kind: 'method', method: node.method, not: negative });
  else (node?.[Rules.comboGroupKey(node)] || []).forEach(child => Rules.comboLeaves(child, out));
  return out;
};
Rules.comboGroupAt = function(combo, path = '') {
  let node = combo.when;
  for (const index of path === '' ? [] : path.split('.').map(Number)) {
    node = Rules.comboUnwrap(node).node;
    node = node?.[Rules.comboGroupKey(node)]?.[index];
  }
  return Rules.comboUnwrap(node).node;
};
Rules.comboPrune = function(tree, liveIds) {
  if (!tree || typeof tree !== 'object') return null;
  if (typeof tree.pattern === 'string') return liveIds.has(tree.pattern) ? { ...tree } : null;
  if (tree.not) {
    const inner = Rules.comboPrune(tree.not, liveIds);
    return inner ? { ...tree, not: inner } : null;
  }
  const key = Rules.comboGroupKey(tree);
  return key ? { ...tree, [key]: tree[key].map(child => Rules.comboPrune(child, liveIds)).filter(Boolean) } : { ...tree };
};
/** The tree without nested groups that ended up empty (the top group stays). */
Rules.comboDropEmptyGroups = function(tree, top = true) {
  if (!tree || typeof tree !== 'object') return null;
  if (tree.not) {
    const inner = Rules.comboDropEmptyGroups(tree.not, false);
    return inner ? { ...tree, not: inner } : null;
  }
  const key = Rules.comboGroupKey(tree);
  if (!key) return tree;
  const children = tree[key].map(child => Rules.comboDropEmptyGroups(child, false)).filter(Boolean);
  if (!top && children.length === 0) return null;
  return { ...tree, [key]: children };
};
/** How many children of a group must be found (NOT rows only say what must be absent). */
Rules.comboPositiveCount = function(group) {
  const key = Rules.comboGroupKey(group);
  return key ? group[key].filter(DetectionCombinations.hasPositive).length : 0;
};
/** Why a tree cannot be saved, or '' when it can. */
Rules.comboProblem = function(tree, top = true) {
  if (!tree || typeof tree !== 'object') return combosText('combinationInvalidNoPattern', 'Add at least one pattern that must be found.');
  if (tree.not) return Rules.comboProblem(tree.not, false);
  const key = Rules.comboGroupKey(tree);
  if (!key) return (typeof tree.pattern === 'string' || typeof tree.method === 'string') ? '' : combosText('combinationInvalidNoPattern', 'Add at least one pattern that must be found.');
  if (top && !DetectionCombinations.hasPositive(tree)) return combosText('combinationInvalidNoPattern', 'Add at least one pattern that must be found.');
  if (!tree[key].length) return combosText('combinationInvalidNoPattern', 'Add at least one pattern that must be found.');
  for (const child of tree[key]) {
    const problem = Rules.comboProblem(child, false);
    if (problem) return problem;
  }
  if (key === 'any' && !tree.any.every(DetectionCombinations.hasPositive)) {
    return combosText('combinationInvalidOneOf', 'A “One of these” list needs a pattern that must be found in each option.');
  }
  if (key === 'of' && (!Number.isInteger(tree.atLeast) || tree.atLeast < 1 || tree.atLeast > Rules.comboPositiveCount(tree))) {
    return combosFormat('combinationInvalidAtLeastFmt', '“At least {0}” needs {0} patterns that must be found.', tree.atLeast);
  }
  return '';
};
/** Kept for callers of the old name: a tree is valid when it has no problem. */
Rules.comboValidTree = function(tree) {
  return !Rules.comboProblem(tree);
};
/** The text of a stored pattern, as the editor row shows it ("name = value" for cookies and headers). */
Rules.comboPatternText = function(method, pattern) {
  if (!pattern || typeof pattern !== 'object') return '';
  const key = String(pattern[COMBO_KEY_FIELD[method]] ?? '').trim();
  const value = (method === 'cookie' || method === 'header') && pattern.value ? String(pattern.value).trim() : '';
  return key && value ? `${key} = ${value}` : key;
};

Rules.prototype.initCombinationsEditor = function(detector) {
  this._comboPickerOpen = null;
  this._comboPickerPath = '';
  this._comboPickerSelected = new Set();
  this._comboOpenIds = new Set();
  // Descriptions of the stored patterns; a row shows one only while its text still matches
  this._comboStored = new Map();
  if (detector && typeof DetectionCombinations !== 'undefined') {
    for (const p of DetectionCombinations.listPatterns(detector)) {
      this._comboStored.set(p.id, { text: Rules.comboPatternText(p.method, p.pattern), description: String(p.pattern?.description || '').trim() });
    }
  }
  this.combinationsModel = (detector?.combinations || []).map((combo, i) => {
    const when = JSON.parse(JSON.stringify(combo.when || { all: [] }));
    return {
      id: combo.id || `c${i + 1}`, name: combo.name || '',
      confidence: Number.isFinite(Number(combo.confidence)) && Number(combo.confidence) > 0
        ? Math.min(100, Math.round(Number(combo.confidence))) : null,
      when: Rules.comboGroupKey(Rules.comboUnwrap(when).node) ? when : { all: [when] }
    };
  });
  this._comboModelOwner = this.currentEditDetector;
  // Every combination starts collapsed; only one added with + Add opens
  this.bindCombinationsEditor();
  this.renderCombinations();
  this.currentEditDetector.originalCombinations = this.buildCombinationsForSave(null, { validate: false }).combinations;
};
Rules.prototype.bindCombinationsEditor = function() {
  if (this._combinationsBound) return;
  const container = document.querySelector('#combinationsContainer');
  const addBtn = document.querySelector('#addCombinationBtn');
  if (!container || !addBtn) return;
  this._combinationsBound = true;
  addBtn.addEventListener('click', () => {
    const used = new Set(this.combinationsModel.map(c => c.id));
    let n = 1;
    while (used.has(`c${n}`)) n++;
    const combo = { id: `c${n}`, name: '', confidence: null, when: { all: [] } };
    this.combinationsModel.push(combo);
    this.setComboOpen(combo, true);
    this._comboPickerOpen = this.combinationsModel.length - 1;
    this._comboPickerPath = '';
    this._comboPickerSelected = new Set();
    this.renderCombinations({ focusPicker: true });
  });
  ['click', 'input', 'change'].forEach(kind => container.addEventListener(kind, event => this.handleCombinationAction(event, kind)));
  container.addEventListener('keydown', event => {
    if (event.key === 'Escape' && this._comboPickerOpen !== null) {
      event.stopPropagation();
      const index = this._comboPickerOpen;
      const path = this._comboPickerPath;
      this.closeComboPicker();
      this.focusCombo(`.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"] > .combo-group-actions [data-combo-action="open-picker"]`);
    }
  });
  const methods = document.querySelector('#detectionMethodsContainer');
  if (methods) {
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => this.renderCombinations(), 250); };
    methods.addEventListener('input', refresh);
    methods.addEventListener('click', event => {
      // "Not in any combination": let the pattern count on its own again
      const release = event.target.closest('[data-pattern-release]');
      if (release) {
        event.preventDefault();
        event.stopPropagation();
        this.setComboPatternStrict(release.dataset.patternRelease, false);
        this.renderCombinations();
        return;
      }
      if (event.target.closest('.method-action-btn.delete, .add-method-btn')) refresh();
    });
  }
};
Rules.prototype.focusCombo = function(selector) {
  const el = typeof document !== 'undefined' && document.querySelector ? document.querySelector(selector) : null;
  if (el && typeof el.focus === 'function') el.focus();
  return el;
};
Rules.prototype.getComboPatternOptions = function() {
  return [...document.querySelectorAll('#detectionMethodsContainer .method-item[data-pattern-id]')].map(row => {
    const method = this.getMethodSectionType(row.closest('.method-section'));
    const name = row.querySelector('.method-name')?.value.trim() || '';
    const value = ['cookie', 'header'].includes(method) ? row.querySelector('.method-value')?.value.trim() || '' : '';
    return { id: row.dataset.patternId, method, label: name && value ? `${name} = ${value}` : name,
      strict: row.dataset.standalone === 'false', confidence: Math.max(0, Math.min(100, Number(row.dataset.confidence) || 100)) };
  }).filter(p => p.method);
};
/** The stored description of a pattern, while the row still shows the stored text. */
Rules.prototype.comboDescriptionOf = function(option) {
  const stored = option && this._comboStored?.get(option.id);
  return stored && stored.description && stored.text === String(option.label || '').trim() ? stored.description : '';
};
Rules.prototype.getComboPatternRow = function(id) {
  return [...document.querySelectorAll('#detectionMethodsContainer .method-item[data-pattern-id]')].find(row => row.dataset.patternId === id) || null;
};
Rules.prototype.setComboPatternStrict = function(id, strict) {
  const row = this.getComboPatternRow(id);
  if (!row) return;
  row.dataset.standalone = strict ? 'false' : 'true';
  this.updateMethodIndicators?.(row);
};
Rules.prototype.comboReferencedOptions = function(combo, options = this.getComboPatternOptions()) {
  const refs = DetectionCombinations.references(combo.when);
  return options.filter(p => refs.patterns.has(p.id) || refs.methods.has(p.method));
};
Rules.prototype.comboRequiresTogether = function(combo, options) {
  const refs = this.comboReferencedOptions(combo, options);
  return refs.length > 0 && refs.every(p => p.strict);
};
/** Pattern ids any combination of this rule refers to (directly or through a method row). */
Rules.prototype.comboUsedPatternIds = function(options = this.getComboPatternOptions()) {
  return new Set((this.combinationsModel || []).flatMap(combo => this.comboReferencedOptions(combo, options).map(p => p.id)));
};
/** Is this pattern combination-only but used by no combination (so it never detects)? */
Rules.prototype.isComboPatternUnused = function(id) {
  if (!id || this._comboModelOwner !== this.currentEditDetector || !Array.isArray(this.combinationsModel)) return false;
  return !this.comboUsedPatternIds().has(id);
};
/** Redraw the pattern-row badges of combination-only patterns (used / not used). */
Rules.prototype.refreshComboPatternBadges = function() {
  if (typeof this.updateMethodIndicators !== 'function' || typeof document === 'undefined' || !document.querySelectorAll) return;
  document.querySelectorAll('#detectionMethodsContainer .method-item[data-standalone="false"]').forEach(row => this.updateMethodIndicators(row));
};
Rules.prototype.closeComboPicker = function() {
  this._comboPickerOpen = null;
  this._comboPickerSelected = new Set();
  this.renderCombinations();
};
Rules.prototype.addComboItems = function(combo, values, path = '') {
  const group = Rules.comboGroupAt(combo, path);
  const key = Rules.comboGroupKey(group);
  if (!key) return;
  for (const value of values) {
    const colon = value.indexOf(':');
    const type = value.slice(0, colon), ref = value.slice(colon + 1);
    const leaf = type === 'method' ? { method: ref } : { pattern: ref };
    if (Rules.comboLeaves(group).some(item => type === 'method' ? item.method === ref : item.id === ref)) continue;
    group[key].push(leaf);
  }
};
Rules.prototype.handleCombinationAction = function(event, kind) {
  const target = event.target;
  const card = target.closest('.combo-card');
  const index = Number(card?.dataset.combo);
  const combo = card && this.combinationsModel[index];
  if (!combo) return;
  const field = target.dataset.comboField;
  if (field && kind === 'input') {
    if (field === 'name') combo.name = target.value;
    if (field === 'confidence') {
      const digits = target.value.replace(/[^0-9]/g, '').slice(0, 3);
      const value = Number(digits);
      combo.confidence = value > 0 ? Math.min(100, value) : null;
      target.value = combo.confidence || '';
      this.updateComboSentences(card, combo);
    }
    return;
  }
  const el = target.closest('[data-combo-action]');
  if (!el) return;
  const action = el.dataset.comboAction;
  if (action === 'picker-search') {
    if (kind === 'input') this.filterComboPicker(el.closest('.combo-picker'), el.value);
    return;
  }
  const isControl = ['mode', 'threshold', 'presence', 'require'].includes(action);
  if (kind !== (isControl ? 'change' : 'click')) return;
  const path = el.closest('.combo-group')?.dataset.path || '';
  const group = Rules.comboGroupAt(combo, path);
  const key = Rules.comboGroupKey(group);
  const children = group?.[key];
  const itemIndex = Number(el.closest('.combo-item')?.dataset.idx);
  let focus = null;
  if (action === 'toggle-pick') {
    const value = el.dataset.value;
    if (this._comboPickerSelected.has(value)) this._comboPickerSelected.delete(value);
    else this._comboPickerSelected.add(value);
    const selected = this._comboPickerSelected.has(value);
    el.classList.toggle('selected', selected);
    el.setAttribute('aria-pressed', String(selected));
    this.updateComboPickerFooter(el.closest('.combo-picker'));
    return;
  }
  if (action === 'toggle-card') {
    this.setComboOpen(combo, !this.isComboOpen(combo));
    focus = `.combo-card[data-combo="${index}"] .combo-toggle`;
  } else if (action === 'open-picker') {
    const same = this._comboPickerOpen === index && this._comboPickerPath === path;
    this._comboPickerOpen = same ? null : index;
    this._comboPickerPath = path;
    this._comboPickerSelected = new Set();
  } else if (action === 'close-picker') {
    this.closeComboPicker();
    this.focusCombo(`.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"] > .combo-group-actions [data-combo-action="open-picker"]`);
    return;
  } else if (action === 'add-selected' || action === 'pick-any') {
    this.addComboItems(combo, action === 'pick-any' ? [el.dataset.value] : [...this._comboPickerSelected], path);
    this._comboPickerOpen = null;
    this._comboPickerSelected = new Set();
    focus = `.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"] > .combo-group-actions [data-combo-action="open-picker"]`;
  } else if (action === 'add-group') {
    // A "one of" group at the top level, opened with its picker
    const root = Rules.comboGroupAt(combo, '');
    const rootKey = Rules.comboGroupKey(root);
    if (!rootKey) return;
    root[rootKey].push({ any: [] });
    this._comboPickerOpen = index;
    this._comboPickerPath = String(root[rootKey].length - 1);
    this._comboPickerSelected = new Set();
    this.renderCombinations({ focusPicker: true });
    return;
  } else if (action === 'delete-group' && path !== '') {
    const parts = path.split('.');
    const childIndex = Number(parts.pop());
    const parent = Rules.comboGroupAt(combo, parts.join('.'));
    const parentKey = Rules.comboGroupKey(parent);
    if (!parentKey) return;
    parent[parentKey].splice(childIndex, 1);
    this.clampComboThresholds(combo);
    this._comboPickerOpen = null;
    focus = `.combo-card[data-combo="${index}"] [data-combo-action="add-group"]`;
  } else if (action === 'mode' && children) {
    const next = el.value;
    if (!['all', 'any', 'of'].includes(next)) return;
    delete group[key]; delete group.atLeast;
    group[next] = children;
    if (next === 'of') group.atLeast = Math.min(2, Math.max(1, Rules.comboPositiveCount(group)));
    focus = `.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"] > .combo-group-head [data-combo-action="mode"]`;
  } else if (['threshold', 'threshold-increase', 'threshold-decrease'].includes(action) && key === 'of') {
    const requested = action === 'threshold' ? Number(el.value)
      : Number(group.atLeast) + (action === 'threshold-increase' ? 1 : -1);
    const max = Math.max(1, Rules.comboPositiveCount(group));
    group.atLeast = Math.max(1, Math.min(max, Math.floor(requested) || 1));
    // Keep the controls mounted: a change on blur must not swallow an arrow click.
    const stepper = el.closest('.combo-number-stepper');
    if (stepper) {
      const input = stepper.querySelector('[data-combo-action="threshold"]');
      input.value = group.atLeast;
      stepper.querySelector('[data-combo-action="threshold-decrease"]').disabled = group.atLeast <= 1;
      stepper.querySelector('[data-combo-action="threshold-increase"]').disabled = group.atLeast >= max;
      this.updateComboSentences(card, combo);
      if (el.disabled) input.focus();
    }
    return;
  } else if (action === 'presence' && children?.[itemIndex]) {
    const item = Rules.comboUnwrap(children[itemIndex]).node;
    children[itemIndex] = el.value === 'absent' ? { not: item } : item;
    // A row that must not be found no longer counts towards "at least"
    this.clampComboThresholds(combo);
    focus = `.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"] > .combo-items > .combo-item[data-idx="${itemIndex}"] [data-combo-action="presence"]`;
  } else if (action === 'require') {
    this.comboReferencedOptions(combo).forEach(p => this.setComboPatternStrict(p.id, el.checked));
    focus = `.combo-card[data-combo="${index}"] [data-combo-action="require"]`;
  } else if (action === 'remove' && children?.[itemIndex]) {
    children.splice(itemIndex, 1);
    this.clampComboThresholds(combo);
    this._comboPickerOpen = null;
    // Focus the next row's remove button, else this group's "+ Add pattern"
    const scope = `.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"]`;
    focus = itemIndex < children.length
      ? `${scope} > .combo-items > .combo-item[data-idx="${itemIndex}"] [data-combo-action="remove"]`
      : `${scope} > .combo-group-actions [data-combo-action="open-picker"]`;
  } else if (action === 'delete-combo') {
    const name = combo.name.trim() || combosFormat('combinationDefaultNameFmt', 'Combination {0}', index + 1);
    const ask = typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.confirm === 'function'
      ? NotificationHelper.confirm({ title: combosText('combinationDelete', 'Delete combination'),
          message: combosFormat('combinationDeleteConfirmFmt', 'Delete the combination "{0}"? Its patterns stay in the rule.', FormatUtils.escapeHtml(name)),
          type: 'danger', confirmText: combosText('btnDelete', 'Delete'), cancelText: combosText('btnCancel', 'Cancel'), emphasizeAction: true })
      : Promise.resolve(true);
    ask.then(confirmed => {
      if (!confirmed) return;
      this.combinationsModel = this.combinationsModel.filter(c => c !== combo);
      this.setComboOpen(combo, false);
      this._comboPickerOpen = null;
      this.renderCombinations();
      this.focusCombo('#addCombinationBtn');
    });
    return;
  } else return;
  if (!this.isComboOpen(combo) && this._comboPickerOpen === index) this._comboPickerOpen = null;
  this.renderCombinations({ focusPicker: action === 'open-picker' && this._comboPickerOpen !== null });
  if (focus) this.focusCombo(focus);
};
/** Lower every "at least" to what its group can still reach. */
Rules.prototype.clampComboThresholds = function(combo) {
  const walk = (tree) => {
    const { node } = Rules.comboUnwrap(tree);
    const key = Rules.comboGroupKey(node);
    if (!key) return;
    if (key === 'of') node.atLeast = Math.max(1, Math.min(Number(node.atLeast) || 1, Math.max(1, Rules.comboPositiveCount(node))));
    node[key].forEach(walk);
  };
  walk(combo.when);
};
/** Show only the picker rows whose text, description or method matches the query. */
Rules.prototype.filterComboPicker = function(picker, query) {
  if (!picker) return;
  const q = String(query || '').trim().toLowerCase();
  picker.querySelectorAll('.combo-picker-method').forEach(block => {
    const methodHit = !q || block.dataset.search.includes(q);
    let anyRow = false;
    block.querySelectorAll('.combo-picker-pattern').forEach(row => {
      const hit = methodHit || row.dataset.search.includes(q);
      row.hidden = !hit;
      anyRow = anyRow || hit;
    });
    block.hidden = !(methodHit || anyRow);
  });
};

Rules.prototype.updateComboPickerFooter = function(picker) {
  const button = picker && picker.querySelector('.combo-picker-add');
  if (!button) return;
  const count = this._comboPickerSelected.size;
  button.disabled = count === 0;
  button.textContent = count === 0
    ? combosText('combinationPickHint', 'Tick the patterns to add')
    : combosFormat('combinationAddSelectedFmt', 'Add {0} selected', count);
};


Rules.prototype.isComboOpen = function(combo) { return !!this._comboOpenIds?.has(combo.id); };
Rules.prototype.setComboOpen = function(combo, open) {
  if (!this._comboOpenIds) this._comboOpenIds = new Set();
  if (open) this._comboOpenIds.add(combo.id); else this._comboOpenIds.delete(combo.id);
};

/**
 * When the combination fires, in plain sentences built from whole-sentence
 * templates (no grammar from fragments): when, then the confidence, then
 * notes about groups, "must not be found" rows and patterns that also count
 * on their own.
 */
Rules.prototype.comboSentences = function(combo, options = this.getComboPatternOptions()) {
  const root = Rules.comboUnwrap(combo.when).node;
  const key = Rules.comboGroupKey(root);
  const children = key ? root[key] : [];
  if (!Rules.comboLeaves(combo.when).length) return [combosText('combinationPreviewEmpty', 'Add patterns to build this combination')];
  const count = children.length;
  const when = count === 1
    ? combosText('combinationSentenceOne', 'Fires when this condition is met.')
    : key === 'any' ? combosFormat('combinationSentenceAnyFmt', 'Fires when any one of these {0} conditions is met.', count)
      : key === 'of' ? combosFormat('combinationSentenceAtLeastFmt', 'Fires when at least {0} of these {1} conditions are met.', root.atLeast, count)
        : combosFormat('combinationSentenceAllFmt', 'Fires when all {0} conditions are met.', count);
  const refs = this.comboReferencedOptions(combo, options);
  const positive = new Set(DetectionCombinations.references({ all: children.filter(DetectionCombinations.hasPositive) }).patterns);
  const top = Math.max(0, ...refs.filter(p => positive.has(p.id)).map(p => p.confidence));
  const confidence = combo.confidence
    ? combosFormat('combinationSentenceConfidenceFmt', 'Confidence: {0}%.', combo.confidence)
    : combosFormat('combinationSentenceAutoFmt', 'Confidence: Auto, up to {0}%.', top);
  const out = [when, confidence];
  if (children.some(child => Rules.comboGroupKey(Rules.comboUnwrap(child).node))) out.push(combosText('combinationSentenceGroup', 'A group counts as one condition.'));
  if (Rules.comboLeaves(combo.when).some(item => item.not)) out.push(combosText('combinationSentenceNot', 'It does not fire if a “Must not be found” pattern is present.'));
  if (refs.some(p => !p.strict)) out.push(combosText('combinationSentenceAlone', 'Patterns not marked “Combinations only” also detect on their own, at their own confidence.'));
  return out;
};
Rules.prototype.updateComboSentences = function(card, combo) {
  const sentences = this.comboSentences(combo);
  const preview = card?.querySelector?.('.combo-preview');
  if (preview) preview.textContent = sentences.join(' ');
  const summary = card?.querySelector?.('.combo-summary-count');
  if (summary) summary.textContent = sentences[0];
  const chip = card?.querySelector?.('.combo-summary-confidence');
  if (chip) chip.textContent = combo.confidence ? `${combo.confidence}%` : combosText('combinationAutoConfidence', 'Auto');
};
Rules.prototype.renderCombinations = function({ focusPicker = false } = {}) {
  const container = document.querySelector('#combinationsContainer');
  if (!container || !Array.isArray(this.combinationsModel)) return;
  const query = container.querySelector('.combo-picker-search')?.value || '';
  const scroll = container.querySelector('.combo-picker-list')?.scrollTop || 0;
  const options = this.getComboPatternOptions();
  const liveIds = new Set(options.map(p => p.id));
  this.combinationsModel.forEach(combo => { combo.when = Rules.comboPrune(combo.when, liveIds) || { all: [] }; });
  if (!this.combinationsModel.length) {
    container.innerHTML = `<p class="combinations-empty">${FormatUtils.escapeHtml(combosText('combinationsEmpty', 'No combinations yet.'))}</p>`;
    this.refreshComboPatternBadges();
    return;
  }
  const labels = new Map(options.map(p => [p.id, p]));
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  container.innerHTML = this.combinationsModel.map((combo, index) => {
    const open = this.isComboOpen(combo);
    const refs = this.comboReferencedOptions(combo, options);
    const require = refs.length > 0 && refs.every(p => p.strict);
    const mixed = refs.some(p => p.strict) && !require;
    const sentences = this.comboSentences(combo, options);
    return `<div class="combo-card${open ? '' : ' collapsed'}" data-combo="${index}">
      <div class="combo-summary">
        <button type="button" class="combo-toggle" data-combo-action="toggle-card" aria-expanded="${open}"
          aria-label="${attr(combosText('combinationEditConditions', 'Edit conditions'))}">${COMBO_ICONS.chevron}</button>
        <div class="combo-summary-main">
          <input type="text" class="combo-summary-name" data-combo-field="name" value="${attr(combo.name)}" dir="auto"
            placeholder="${attr(combosFormat('combinationDefaultNameFmt', 'Combination {0}', index + 1))}"
            aria-label="${attr(combosText('ruleFieldName', 'Name'))}">
          <button type="button" class="combo-summary-count" data-combo-action="toggle-card" aria-expanded="${open}">${esc(sentences[0])}</button>
        </div>
        <span class="combo-summary-confidence${combo.confidence ? '' : ' is-auto'}">${esc(combo.confidence ? `${combo.confidence}%` : combosText('combinationAutoConfidence', 'Auto'))}</span>
        <button type="button" class="combo-remove combo-delete" data-combo-action="delete-combo" aria-label="${attr(combosText('combinationDelete', 'Delete combination'))}" title="${attr(combosText('combinationDelete', 'Delete combination'))}">${COMBO_ICONS.trash}</button>
      </div>
      <div class="combo-body">
        ${this.renderComboGroup(combo.when, '', index, options, labels)}
        <label class="combo-confidence"><span>${esc(combosText('combinationConfidenceWhenFound', 'Confidence when found'))}</span>
          <span class="combo-confidence-input"><input type="text" inputmode="numeric" maxlength="3" data-combo-field="confidence" value="${combo.confidence || ''}"
            placeholder="${attr(combosText('combinationAutoConfidence', 'Auto'))}"
            aria-label="${attr(combosText('combinationConfidenceWhenFound', 'Confidence when found'))}"
            title="${attr(combosText('combinationConfidenceAutoHint', 'Leave empty for Auto: the highest confidence of the patterns found.'))}"><span>%</span></span>
        </label>
        <label class="combo-require"><input type="checkbox" data-combo-action="require"${require ? ' checked' : ''}${mixed ? ' data-mixed="true"' : ''}${refs.length ? '' : ' disabled'}>
          <span><strong>${esc(combosText('combinationOnlyTogether', 'These patterns only count together'))}</strong>
          <small>${esc(mixed
            ? combosText('combinationOnlyTogetherMixed', 'Some of these patterns also count on their own. Tick to make them all count only in combinations.')
            : combosText('combinationOnlyTogetherHint', 'On their own they detect nothing. Applies to these patterns in every combination of this rule.'))}</small></span>
        </label>
        <p class="combo-preview" aria-live="polite">${esc(sentences.join(' '))}</p>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('[data-mixed]').forEach(input => { input.indeterminate = true; });
  const search = container.querySelector('.combo-picker-search');
  if (search && query) { search.value = query; this.filterComboPicker(search.closest('.combo-picker'), query); }
  const list = container.querySelector('.combo-picker-list');
  if (list) list.scrollTop = scroll;
  if (search && focusPicker) search.focus();
  this.refreshComboPatternBadges();
};
/** Mode select (+ "at least" stepper) of a group; ids include the path so nested ones stay unique. */
Rules.prototype.renderComboMode = function(node, key, path, index) {
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const nested = path !== '';
  const modes = nested
    ? [['any', 'combinationModeAny', 'One of these'], ['all', 'combinationModeAll', 'All of these'], ['of', 'combinationModeAtLeast', 'At least… of these']]
    : [['all', 'combinationModeRootAll', 'all of these are found'], ['any', 'combinationModeRootAny', 'one of these is found'], ['of', 'combinationModeRootAtLeast', 'at least… of these are found']];
  const id = `combo-mode-${index}-${path.replace(/\./g, '-') || 'root'}`;
  const max = Math.max(1, Rules.comboPositiveCount(node));
  const select = `<select id="${id}" data-combo-action="mode"${nested ? ` aria-label="${attr(combosText('combinationGroupMode', 'Group'))}"` : ''}>${modes.map(([value, message, fallback]) =>
    `<option value="${value}"${key === value ? ' selected' : ''}>${esc(combosText(message, fallback))}</option>`).join('')}</select>`;
  const stepper = key === 'of' ? `<div class="combo-threshold">
      <label for="combo-minimum-${index}-${path.replace(/\./g, '-') || 'root'}">${esc(combosText('combinationMinimum', 'Minimum matches'))}</label>
      <div class="combo-number-stepper">
        <button type="button" data-combo-action="threshold-decrease"${node.atLeast <= 1 ? ' disabled' : ''}
          aria-label="${attr(combosText('combinationDecreaseMinimum', 'Decrease minimum matches'))}"
          title="${attr(combosText('combinationDecreaseMinimum', 'Decrease minimum matches'))}">${COMBO_ICONS.down}</button>
        <input id="combo-minimum-${index}-${path.replace(/\./g, '-') || 'root'}" type="number" inputmode="numeric" step="1" min="1" max="${max}" value="${node.atLeast}" data-combo-action="threshold">
        <button type="button" data-combo-action="threshold-increase"${node.atLeast >= max ? ' disabled' : ''}
          aria-label="${attr(combosText('combinationIncreaseMinimum', 'Increase minimum matches'))}"
          title="${attr(combosText('combinationIncreaseMinimum', 'Increase minimum matches'))}">${COMBO_ICONS.up}</button>
      </div>
    </div>` : '';
  return nested
    ? `${select}${stepper}`
    : `<label class="combo-mode" for="${id}"><span>${esc(combosText('combinationDetectWhen', 'Detect when'))}</span>${select}</label>${stepper}`;
};
Rules.prototype.renderComboGroup = function(tree, path, index, options, labels) {
  const { node, negative } = Rules.comboUnwrap(tree);
  const key = Rules.comboGroupKey(node);
  if (!key) return '';
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const picker = this._comboPickerOpen === index && this._comboPickerPath === path;
  const nested = path !== '';
  const headId = `combo-group-${index}-${path.replace(/\./g, '-') || 'root'}`;
  const items = node[key].length ? node[key].map((child, i) => {
    const unwrapped = Rules.comboUnwrap(child).node;
    if (Rules.comboGroupKey(unwrapped)) {
      const childPath = path ? `${path}.${i}` : String(i);
      return `<div class="combo-item combo-subgroup${Rules.comboUnwrap(child).negative ? ' is-not' : ''}" data-idx="${i}">${this.renderComboGroup(child, childPath, index, options, labels)}</div>`;
    }
    return this.renderComboItem(child, i, labels);
  }).join('') : `<p class="combo-group-empty">${esc(combosText(nested ? 'combinationGroupEmptyHint' : 'combinationGroupEmpty', nested ? 'Add a pattern to this group' : 'Add a pattern below'))}</p>`;
  const head = nested
    ? `<div class="combo-group-head" id="${headId}">
        ${this.renderComboMode(node, key, path, index)}
        <button type="button" class="combo-remove combo-delete-group" data-combo-action="delete-group"
          aria-label="${attr(combosText('combinationDeleteGroup', 'Delete group'))}" title="${attr(combosText('combinationDeleteGroup', 'Delete group'))}">${COMBO_ICONS.trash}</button>
      </div>`
    : `<div class="combo-group-head" id="${headId}">${this.renderComboMode(node, key, path, index)}</div>`;
  const actions = `<div class="combo-group-actions">
      <button type="button" class="combo-add-btn" data-combo-action="open-picker" aria-expanded="${picker}">+ ${esc(combosText('combinationAddPattern', 'Add pattern'))}</button>
      ${nested ? '' : `<button type="button" class="combo-add-btn combo-add-group" data-combo-action="add-group">+ ${esc(combosText('combinationAddGroup', 'Add “one of” group'))}</button>`}
    </div>`;
  return `<div class="combo-group${nested ? ' combo-group-nested' : ''}" data-path="${path}" role="group" aria-labelledby="${headId}">
    ${head}
    ${negative ? `<p class="combo-excluded-group">${esc(combosText('combinationGroupExcluded', 'These conditions must not match.'))}</p>` : ''}
    <div class="combo-items">${items}</div>
    ${actions}
    ${picker ? this.renderComboPicker(options, node) : ''}
  </div>`;
};
Rules.prototype.renderComboItem = function(tree, index, labels) {
  const { node, negative } = Rules.comboUnwrap(tree);
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const option = labels.get(node.pattern);
  const method = node.method || option?.method || '';
  const raw = node.method ? '' : (option?.label || combosText('combinationEmptyPattern', '(empty pattern)'));
  const description = node.method ? combosFormat('combinationAnyOfMethodFmt', 'Any {0} pattern', this.getMethodLabel(method)) : this.comboDescriptionOf(option);
  const strict = option?.strict ? `<span class="combo-item-tag">${esc(combosText('patternCombinationsOnlyBadge', 'Combinations only'))}</span>` : '';
  // The method chip starts the first line and the text flows after it, so a
  // wide chip ("Window properties") does not squeeze the description
  return `<div class="combo-item${negative ? ' is-not' : ''}" data-idx="${index}">
    <div class="combo-item-row">
      <div class="combo-item-body">
        ${description
          ? `<p class="combo-item-line">${this.renderMethodChip(method, 'combo-chip')}<span class="combo-item-desc" dir="auto">${esc(description)}</span></p>${raw ? `<span class="combo-leaf-text" dir="ltr" title="${attr(raw)}">${esc(raw)}</span>` : ''}`
          : `<p class="combo-item-line">${this.renderMethodChip(method, 'combo-chip')}<span class="combo-leaf-text is-main" dir="ltr" title="${attr(raw)}">${esc(raw)}</span></p>`}
        <div class="combo-item-meta">
          <select data-combo-action="presence" aria-label="${attr(combosText('combinationMatchState', 'Pattern condition'))}">
            <option value="present"${negative ? '' : ' selected'}>${esc(combosText('combinationMustBeFound', 'Must be found'))}</option>
            <option value="absent"${negative ? ' selected' : ''}>${esc(combosText('combinationMustNotBeFound', 'Must not be found'))}</option>
          </select>
          ${strict}
        </div>
      </div>
      <button type="button" class="combo-remove" data-combo-action="remove" aria-label="${attr(combosText('combinationRemove', 'Remove'))}" title="${attr(combosText('combinationRemove', 'Remove'))}">×</button>
    </div>
  </div>`;
};
/** Pattern picker: tick patterns (several at once) or take "any pattern" of a method. */
Rules.prototype.renderComboPicker = function(options, group) {
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const inCombo = new Set(Rules.comboLeaves(group).map(item => (item.kind === 'method' ? `method:${item.method}` : `pattern:${item.id}`)));
  const ordered = COMBO_METHODS.filter(m => options.some(o => o.method === m));
  const blocks = ordered.map(method => {
    const methodLabel = this.getMethodLabel(method);
    const patterns = options.filter(o => o.method === method);
    const rows = patterns.map(o => {
      const value = `pattern:${o.id}`;
      const text = o.label || combosText('combinationEmptyPattern', '(empty pattern)');
      const description = this.comboDescriptionOf(o);
      const selected = this._comboPickerSelected.has(value);
      const added = inCombo.has(value);
      return `<button type="button" class="combo-picker-pattern${selected ? ' selected' : ''}" data-combo-action="toggle-pick"
        data-value="${attr(value)}" data-search="${attr(`${description} ${text}`.toLowerCase())}"
        aria-pressed="${selected}" title="${attr(text)}"${added ? ' disabled' : ''}>
        <span class="combo-picker-check" aria-hidden="true"></span>
        <span class="combo-picker-text">${description
          ? `<span class="combo-picker-desc" dir="auto">${esc(description)}</span><span class="combo-picker-raw" dir="ltr">${esc(text)}</span>`
          : `<span class="combo-picker-raw is-main" dir="ltr">${esc(text)}</span>`}</span>
      </button>`;
    }).join('');
    const anyValue = `method:${method}`;
    return `
      <div class="combo-picker-method" data-search="${attr(methodLabel.toLowerCase())}">
        <div class="combo-picker-method-head">
          ${this.renderMethodChip(method, 'combo-chip')}
          ${patterns.length > 0
            ? `<button type="button" class="combo-picker-any" data-combo-action="pick-any" data-value="${anyValue}"
                title="${attr(combosFormat('combinationAnyOfMethodFmt', 'Any {0} pattern', methodLabel))}"${inCombo.has(anyValue) ? ' disabled' : ''}>
                ${esc(combosText('combinationAnyPattern', 'any pattern'))}</button>`
            : `<span class="combo-picker-none">${esc(combosText('combinationNoPatterns', 'No patterns added'))}</span>`}
        </div>
        ${rows}
      </div>`;
  }).join('');
  const count = this._comboPickerSelected.size;
  return `
    <div class="combo-picker">
      <div class="combo-picker-heading">${esc(combosText('combinationChoosePatterns', 'Choose patterns'))}
        <button type="button" class="combo-remove" data-combo-action="close-picker" aria-label="${attr(combosText('btnClose', 'Close'))}">×</button>
      </div>
      <input type="text" class="method-input combo-picker-search" data-combo-action="picker-search" aria-label="${attr(combosText('methodSearchPatterns', 'Search patterns...'))}"
        placeholder="${attr(combosText('methodSearchPatterns', 'Search patterns...'))}">
      <div class="combo-picker-list">${blocks || `<p class="combo-picker-none">${esc(combosText('combinationNoPatterns', 'No patterns added'))}</p>`}</div>
      <button type="button" class="combo-picker-add" data-combo-action="add-selected"${count === 0 ? ' disabled' : ''}>
        ${esc(count === 0
          ? combosText('combinationPickHint', 'Tick the patterns to add')
          : combosFormat('combinationAddSelectedFmt', 'Add {0} selected', count))}
      </button>
    </div>`;
};


Rules.prototype.describeCombo = function(combo) {
  return this.comboSentences(combo).join(' ');
};
Rules.prototype.buildCombinationsForSave = function(detection, { validate = true } = {}) {
  const savedIds = detection ? new Set(COMBO_METHODS.flatMap(method => (detection[method] || []).map(p => p.id)).filter(Boolean)) : null;
  let invalidIndex = -1;
  let invalidMessage = '';
  const combinations = (this.combinationsModel || []).map((combo, index) => {
    const kept = savedIds ? Rules.comboPrune(combo.when, savedIds) || { all: [] } : JSON.parse(JSON.stringify(combo.when));
    // A group emptied by removing its rows is dropped instead of blocking Save
    const when = Rules.comboDropEmptyGroups(kept) || { all: [] };
    if (validate && invalidIndex < 0) {
      const problem = Rules.comboProblem(when);
      if (problem) { invalidIndex = index; invalidMessage = problem; }
    }
    const name = combo.name.trim() || combosFormat('combinationDefaultNameFmt', 'Combination {0}', index + 1);
    return { id: combo.id, name, ...(combo.confidence ? { confidence: combo.confidence } : {}), when };
  });
  return { combinations, invalidIndex, invalidMessage };
};
Rules.prototype.reportInvalidCombination = function(index, message) {
  const combo = this.combinationsModel?.[index];
  if (combo) { this.setComboOpen(combo, true); this.renderCombinations(); }
  const card = document.querySelector(`#combinationsContainer .combo-card[data-combo="${index}"]`);
  if (card) {
    card.classList.add('combo-invalid');
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.querySelector('select')?.focus();
    setTimeout(() => card.classList.remove('combo-invalid'), 2500);
  }
  if (typeof NotificationHelper !== 'undefined') NotificationHelper.warning?.(message || combosText('combinationInvalidNoPattern', 'Add at least one pattern that must be found.'));
};
