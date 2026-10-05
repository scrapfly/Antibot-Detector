/**
 * Popup combination builder. Edits the stored condition tree directly, so
 * nested All / Any / At least groups survive opening, renaming and saving.
 * Pattern independence is shared across every combination in the rule.
 */
const combosText = (key, fallback) =>
  (typeof I18n !== 'undefined' && typeof I18n.tr === 'function') ? I18n.tr(key, fallback) : fallback;
const combosFormat = (key, fallback, ...args) => {
  const translated = (typeof I18n !== 'undefined' && typeof I18n.format === 'function') ? I18n.format(key, ...args) : '';
  return translated || args.reduce((text, arg, i) => text.replace(`{${i}}`, arg), fallback);
};
const COMBO_METHODS = ['url', 'header', 'cookie', 'content', 'dom', 'js_hooks', 'window', 'payload'];

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

Rules.prototype.initCombinationsEditor = function(detector) {
  this._comboPickerOpen = null;
  this._comboPickerPath = '';
  this._comboPickerSelected = new Set();
  this._comboOpenIds = new Set();
  this.combinationsModel = (detector?.combinations || []).map((combo, i) => {
    const when = JSON.parse(JSON.stringify(combo.when || { all: [] }));
    return {
      id: combo.id || `c${i + 1}`, name: combo.name || '',
      confidence: Number.isFinite(Number(combo.confidence)) && Number(combo.confidence) > 0
        ? Math.min(100, Math.round(Number(combo.confidence))) : null,
      when: Rules.comboGroupKey(Rules.comboUnwrap(when).node) ? when : { all: [when] }
    };
  });
  if (this.combinationsModel.length) this.setComboOpen(this.combinationsModel[0], true);
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
    const combo = { id: `c${n}`, name: '', confidence: null, when: { all: [] }, requireNew: true };
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
      container.querySelector(`.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"] > .combo-group-actions [data-combo-action="open-picker"]`)?.focus();
    }
  });
  const methods = document.querySelector('#detectionMethodsContainer');
  if (methods) {
    let timer;
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => this.renderCombinations(), 250); };
    methods.addEventListener('input', refresh);
    methods.addEventListener('click', event => {
      if (event.target.closest('.method-action-btn.delete, .add-method-btn')) refresh();
    });
  }
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
  return refs.length ? refs.every(p => p.strict) : !!combo.requireNew;
};
Rules.prototype.releaseUnusedStrict = function(ids) {
  const used = new Set(this.combinationsModel.flatMap(combo => this.comboReferencedOptions(combo).map(p => p.id)));
  ids.filter(id => !used.has(id)).forEach(id => this.setComboPatternStrict(id, false));
};
Rules.prototype.closeComboPicker = function() {
  this._comboPickerOpen = null;
  this._comboPickerSelected = new Set();
  this.renderCombinations();
};
Rules.prototype.addComboItems = function(combo, values, path = '') {
  const require = this.comboRequiresTogether(combo);
  const group = Rules.comboGroupAt(combo, path);
  const key = Rules.comboGroupKey(group);
  if (!key) return;
  for (const value of values) {
    const colon = value.indexOf(':');
    const type = value.slice(0, colon), ref = value.slice(colon + 1);
    const leaf = type === 'method' ? { method: ref } : { pattern: ref };
    if (Rules.comboLeaves(group).some(item => type === 'method' ? item.method === ref : item.id === ref)) continue;
    group[key].push(leaf);
    if (require) this.comboReferencedOptions({ when: leaf }).forEach(p => this.setComboPatternStrict(p.id, true));
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
  if (action === 'toggle-card') this.setComboOpen(combo, !this.isComboOpen(combo));
  else if (action === 'open-picker') {
    const same = this._comboPickerOpen === index && this._comboPickerPath === path;
    this._comboPickerOpen = same ? null : index;
    this._comboPickerPath = path;
    this._comboPickerSelected = new Set();
  } else if (action === 'close-picker') {
    this.closeComboPicker();
    return;
  } else if (action === 'add-selected' || action === 'pick-any') {
    this.addComboItems(combo, action === 'pick-any' ? [el.dataset.value] : [...this._comboPickerSelected], path);
    this._comboPickerOpen = null;
    this._comboPickerSelected = new Set();
  } else if (action === 'mode' && children) {
    const next = el.value;
    if (!['all', 'any', 'of'].includes(next)) return;
    delete group[key]; delete group.atLeast;
    group[next] = children;
    if (next === 'of') group.atLeast = Math.min(2, Math.max(1, children.length));
  } else if (['threshold', 'threshold-increase', 'threshold-decrease'].includes(action) && key === 'of') {
    const requested = action === 'threshold' ? Number(el.value)
      : Number(group.atLeast) + (action === 'threshold-increase' ? 1 : -1);
    group.atLeast = Math.max(1, Math.min(Math.max(1, children.length), Math.floor(requested) || 1));
    // Keep the controls mounted: a change on blur must not swallow an arrow click.
    const stepper = el.closest('.combo-number-stepper');
    if (stepper) {
      const input = stepper.querySelector('[data-combo-action="threshold"]');
      input.value = group.atLeast;
      stepper.querySelector('[data-combo-action="threshold-decrease"]').disabled = group.atLeast <= 1;
      stepper.querySelector('[data-combo-action="threshold-increase"]').disabled = group.atLeast >= Math.max(1, children.length);
      card.querySelector('.combo-summary-count').textContent = `${this.comboPatternCountText(combo)} · ${combosFormat('combinationAtLeastSummaryFmt', 'At least {0} conditions match', group.atLeast)}`;
      card.querySelector('.combo-preview').textContent = this.describeCombo(combo);
      if (el.disabled) input.focus();
    }
    return;
  } else if (action === 'presence' && children?.[itemIndex]) {
    const item = Rules.comboUnwrap(children[itemIndex]).node;
    children[itemIndex] = el.value === 'absent' ? { not: item } : item;
  } else if (action === 'require') {
    combo.requireNew = el.checked;
    this.comboReferencedOptions(combo).forEach(p => this.setComboPatternStrict(p.id, el.checked));
  } else if (action === 'remove' && children?.[itemIndex]) {
    const refs = this.comboReferencedOptions({ when: children[itemIndex] }).map(p => p.id);
    children.splice(itemIndex, 1);
    this._comboPickerOpen = null;
    this.releaseUnusedStrict(refs);
  } else if (action === 'delete-combo') {
    const name = combo.name.trim() || combosFormat('combinationDefaultNameFmt', 'Combination {0}', index + 1);
    const ask = typeof NotificationHelper !== 'undefined' && typeof NotificationHelper.confirm === 'function'
      ? NotificationHelper.confirm({ title: combosText('combinationDelete', 'Delete combination'),
          message: combosFormat('combinationDeleteConfirmFmt', 'Delete the combination "{0}"? Its patterns stay in the rule.', FormatUtils.escapeHtml(name)),
          type: 'danger', confirmText: combosText('btnDelete', 'Delete'), cancelText: combosText('btnCancel', 'Cancel'), emphasizeAction: true })
      : Promise.resolve(true);
    ask.then(confirmed => {
      if (!confirmed) return;
      const refs = this.comboReferencedOptions(combo).map(p => p.id);
      this.combinationsModel = this.combinationsModel.filter(c => c !== combo);
      this.setComboOpen(combo, false);
      this._comboPickerOpen = null;
      this.releaseUnusedStrict(refs);
      this.renderCombinations();
    });
    return;
  } else return;
  if (!this.isComboOpen(combo) && this._comboPickerOpen === index) this._comboPickerOpen = null;
  this.renderCombinations({ focusPicker: action === 'open-picker' && this._comboPickerOpen !== null });
  if (['mode', 'presence', 'require', 'toggle-card'].includes(action)) {
    const selector = action === 'presence' ? `.combo-item[data-idx="${itemIndex}"] > .combo-item-row [data-combo-action="presence"]` : `[data-combo-action="${action}"]`;
    const scope = document.querySelector(`.combo-card[data-combo="${index}"] .combo-group[data-path="${path}"]`);
    const control = action === 'require' || action === 'toggle-card'
      ? document.querySelector(`.combo-card[data-combo="${index}"] [data-combo-action="${action}"]`) : scope?.querySelector(selector);
    (control?.disabled ? scope?.querySelector('[data-combo-action="threshold"]') : control)?.focus();
  }
};
/** Show only the picker rows whose text or method matches the query. */
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
Rules.prototype.comboPatternCountText = function(combo) {
  const n = Rules.comboLeaves(combo.when).length;
  return n === 1 ? combosText('methodOnePattern', '1 pattern') : combosFormat('methodPatternsFmt', '{0} patterns', n);
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
    return;
  }
  const labels = new Map(options.map(p => [p.id, p]));
  container.innerHTML = this.combinationsModel.map((combo, index) => {
    const open = this.isComboOpen(combo);
    const require = this.comboRequiresTogether(combo, options);
    const refs = this.comboReferencedOptions(combo, options);
    const mixed = refs.some(p => p.strict) && !require;
    const mode = Rules.comboGroupKey(Rules.comboUnwrap(combo.when).node);
    const modeText = mode === 'all' ? combosText('combinationMatchAll', 'All conditions match')
      : mode === 'any' ? combosText('combinationMatchAny', 'Any condition matches')
      : combosFormat('combinationAtLeastSummaryFmt', 'At least {0} conditions match', Rules.comboUnwrap(combo.when).node.atLeast);
    return `<div class="combo-card${open ? '' : ' collapsed'}" data-combo="${index}">
      <div class="combo-summary">
        <button type="button" class="combo-toggle" data-combo-action="toggle-card" aria-expanded="${open}"
          aria-label="${FormatUtils.escapeAttr(combosText('combinationEditConditions', 'Edit conditions'))}">
          <svg class="combo-collapse-icon" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <div class="combo-summary-main">
          <input type="text" class="combo-summary-name" data-combo-field="name" value="${FormatUtils.escapeAttr(combo.name)}"
            placeholder="${FormatUtils.escapeAttr(combosFormat('combinationDefaultNameFmt', 'Combination {0}', index + 1))}"
            aria-label="${FormatUtils.escapeAttr(combosText('ruleFieldName', 'Name'))}">
          <button type="button" class="combo-summary-count" data-combo-action="toggle-card" aria-expanded="${open}">${FormatUtils.escapeHtml(this.comboPatternCountText(combo))} · ${FormatUtils.escapeHtml(modeText)}</button>
        </div>
        <button type="button" class="combo-remove" data-combo-action="delete-combo" aria-label="${FormatUtils.escapeAttr(combosText('combinationDelete', 'Delete combination'))}" title="${FormatUtils.escapeAttr(combosText('combinationDelete', 'Delete combination'))}">×</button>
      </div>
      <div class="combo-body">
        ${this.renderComboGroup(combo.when, '', index, options, labels)}
        <label class="combo-require"><input type="checkbox" data-combo-action="require"${require ? ' checked' : ''}${mixed ? ' data-mixed="true"' : ''}>
          <span><strong>${FormatUtils.escapeHtml(combosText('combinationRequireTogether', 'Use patterns only in combinations'))}</strong>
          <small>${FormatUtils.escapeHtml(combosText('combinationRequireHint', 'Applies to these patterns everywhere in this rule.'))}</small></span>
        </label>
        <label class="combo-confidence">${FormatUtils.escapeHtml(combosText('combinationConfidence', 'Confidence when it matches'))}
          <span><input type="text" inputmode="numeric" maxlength="3" data-combo-field="confidence" value="${combo.confidence || ''}"
            placeholder="${FormatUtils.escapeAttr(combosText('combinationAutoConfidence', 'Auto'))}"
            aria-label="${FormatUtils.escapeAttr(combosText('combinationConfidence', 'Confidence when it matches'))}"
            title="${FormatUtils.escapeAttr(combosText('combinationConfidenceFromPatterns', 'Leave empty to use the confidence of the patterns that match'))}"><span>%</span></span>
        </label>
        <p class="combo-preview">${FormatUtils.escapeHtml(this.describeCombo(combo))}</p>
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('[data-mixed]').forEach(input => { input.indeterminate = true; });
  const search = container.querySelector('.combo-picker-search');
  if (search && query) { search.value = query; this.filterComboPicker(search.closest('.combo-picker'), query); }
  const list = container.querySelector('.combo-picker-list');
  if (list) list.scrollTop = scroll;
  if (search && focusPicker) search.focus();
};
Rules.prototype.renderComboGroup = function(tree, path, index, options, labels) {
  const { node, negative } = Rules.comboUnwrap(tree);
  const key = Rules.comboGroupKey(node);
  if (!key) return '';
  const picker = this._comboPickerOpen === index && this._comboPickerPath === path;
  const nested = path !== '';
  const modes = [['all', 'combinationMatchAll', 'All conditions match'], ['any', 'combinationMatchAny', 'Any condition matches'], ['of', 'combinationMatchAtLeast', 'At least… match']];
  return `<div class="combo-group${path ? ' combo-group-nested' : ''}" data-path="${path}">
    ${nested
      ? `<p class="combo-alternative-hint">${FormatUtils.escapeHtml(key === 'of'
          ? combosFormat('combinationAtLeastSummaryFmt', 'At least {0} conditions match', node.atLeast)
          : combosText(key === 'all' ? 'combinationMatchAll' : 'combinationMatchAny', key === 'all' ? 'All conditions match' : 'Any condition matches'))}</p>`
      : `<label class="combo-mode"><span>${FormatUtils.escapeHtml(combosText('combinationDetectWhen', 'Detect when'))}</span>
          <select data-combo-action="mode">${modes.map(([value, message, fallback]) => `<option value="${value}"${key === value ? ' selected' : ''}>${FormatUtils.escapeHtml(combosText(message, fallback))}</option>`).join('')}</select>
        </label>`}
    ${negative ? `<p class="combo-excluded-group">${FormatUtils.escapeHtml(combosText('combinationGroupExcluded', 'These conditions must not match.'))}</p>` : ''}
    ${!nested && key === 'of' ? `<div class="combo-threshold">
      <label for="combo-minimum-${index}">${FormatUtils.escapeHtml(combosText('combinationMinimum', 'Minimum matches'))}</label>
      <div class="combo-number-stepper">
        <button type="button" data-combo-action="threshold-decrease"${node.atLeast <= 1 ? ' disabled' : ''}
          aria-label="${FormatUtils.escapeAttr(combosText('combinationDecreaseMinimum', 'Decrease minimum matches'))}"
          title="${FormatUtils.escapeAttr(combosText('combinationDecreaseMinimum', 'Decrease minimum matches'))}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <input id="combo-minimum-${index}" type="number" inputmode="numeric" step="1" min="1" max="${Math.max(1, node[key].length)}" value="${node.atLeast}" data-combo-action="threshold">
        <button type="button" data-combo-action="threshold-increase"${node.atLeast >= Math.max(1, node[key].length) ? ' disabled' : ''}
          aria-label="${FormatUtils.escapeAttr(combosText('combinationIncreaseMinimum', 'Increase minimum matches'))}"
          title="${FormatUtils.escapeAttr(combosText('combinationIncreaseMinimum', 'Increase minimum matches'))}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 15 6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>` : ''}
    <div class="combo-items">${node[key].length ? node[key].map((child, i) => {
      const unwrapped = Rules.comboUnwrap(child).node;
      if (Rules.comboGroupKey(unwrapped)) {
        const childPath = path ? `${path}.${i}` : String(i);
        return `<div class="combo-item combo-alternatives" data-idx="${i}">${this.renderComboGroup(child, childPath, index, options, labels)}</div>`;
      }
      return this.renderComboItem(child, i, labels);
    }).join('') : `<p class="combo-group-empty">${FormatUtils.escapeHtml(combosText('combinationGroupEmpty', 'Add a pattern below'))}</p>`}</div>
    ${!nested ? `<div class="combo-group-actions">
      <button type="button" class="combo-add-btn" data-combo-action="open-picker" aria-expanded="${picker}">+ ${FormatUtils.escapeHtml(combosText('combinationAddPattern', 'Add pattern'))}</button>
    </div>` : ''}
    ${picker ? this.renderComboPicker(options, node) : ''}
  </div>`;
};
Rules.prototype.renderComboItem = function(tree, index, labels) {
  const { node, negative } = Rules.comboUnwrap(tree);
  const option = labels.get(node.pattern);
  const method = node.method || option?.method || '';
  const text = node.method ? combosFormat('combinationAnyOfMethodFmt', 'Any {0} pattern', this.getMethodLabel(method))
    : option?.label || combosText('combinationEmptyPattern', '(empty pattern)');
  return `<div class="combo-item${negative ? ' is-not' : ''}" data-idx="${index}">
    <div class="combo-item-row">
      <div class="combo-item-body">
        <div class="combo-item-meta">${this.renderMethodChip(method, 'combo-chip')}
          <select data-combo-action="presence" aria-label="${FormatUtils.escapeAttr(combosText('combinationMatchState', 'Pattern condition'))}">
            <option value="present"${negative ? '' : ' selected'}>${FormatUtils.escapeHtml(combosText('combinationMatches', 'Matches'))}</option>
            <option value="absent"${negative ? ' selected' : ''}>${FormatUtils.escapeHtml(combosText('combinationDoesNotMatch', 'Does not match'))}</option>
          </select>
        </div>
        <span class="combo-leaf-text">${FormatUtils.escapeHtml(text)}</span>
      </div>
      <button type="button" class="combo-remove" data-combo-action="remove" aria-label="${FormatUtils.escapeAttr(combosText('combinationRemove', 'Remove'))}" title="${FormatUtils.escapeAttr(combosText('combinationRemove', 'Remove'))}">×</button>
    </div>
  </div>`;
};
/** Pattern picker: tick patterns (several at once) or take "any pattern" of a method. */
Rules.prototype.renderComboPicker = function(options, group) {
  const inCombo = new Set(Rules.comboLeaves(group).map(item => (item.kind === 'method' ? `method:${item.method}` : `pattern:${item.id}`)));
  const withPatterns = (m) => options.some(o => o.method === m);
  const ordered = [...COMBO_METHODS.filter(withPatterns), ];
  const blocks = ordered.map(method => {
    const methodLabel = this.getMethodLabel(method);
    const patterns = options.filter(o => o.method === method);
    const rows = patterns.map(o => {
      const value = `pattern:${o.id}`;
      const text = o.label || combosText('combinationEmptyPattern', '(empty pattern)');
      const selected = this._comboPickerSelected.has(value);
      const added = inCombo.has(value);
      return `<button type="button" class="combo-picker-pattern${selected ? ' selected' : ''}" data-combo-action="toggle-pick"
        data-value="${FormatUtils.escapeAttr(value)}" data-search="${FormatUtils.escapeAttr(text.toLowerCase())}"
        aria-pressed="${selected}" title="${FormatUtils.escapeAttr(text)}"${added ? ' disabled' : ''}>
        <span class="combo-picker-check" aria-hidden="true"></span>
        <span class="combo-picker-text">${FormatUtils.escapeHtml(text)}</span>
      </button>`;
    }).join('');
    const anyValue = `method:${method}`;
    return `
      <div class="combo-picker-method" data-search="${FormatUtils.escapeAttr(methodLabel.toLowerCase())}">
        <div class="combo-picker-method-head">
          ${this.renderMethodChip(method, 'combo-chip')}
          ${patterns.length > 0
            ? `<button type="button" class="combo-picker-any" data-combo-action="pick-any" data-value="${anyValue}"
                title="${FormatUtils.escapeAttr(combosFormat('combinationAnyOfMethodFmt', 'Any {0} pattern', methodLabel))}"${inCombo.has(anyValue) ? ' disabled' : ''}>
                ${FormatUtils.escapeHtml(combosText('combinationAnyPattern', 'any pattern'))}</button>`
            : `<span class="combo-picker-none">${FormatUtils.escapeHtml(combosText('combinationNoPatterns', 'No patterns added'))}</span>`}
        </div>
        ${rows}
      </div>`;
  }).join('');
  const count = this._comboPickerSelected.size;
  return `
    <div class="combo-picker">
      <div class="combo-picker-heading">${FormatUtils.escapeHtml(combosText('combinationChoosePatterns', 'Choose patterns'))}
        <button type="button" class="combo-remove" data-combo-action="close-picker" aria-label="${FormatUtils.escapeAttr(combosText('btnClose', 'Close'))}">×</button>
      </div>
      <input type="text" class="method-input combo-picker-search" data-combo-action="picker-search" aria-label="${FormatUtils.escapeAttr(combosText('methodSearchPatterns', 'Search patterns...'))}"
        placeholder="${FormatUtils.escapeAttr(combosText('methodSearchPatterns', 'Search patterns...'))}">
      <div class="combo-picker-list">${blocks || `<p class="combo-picker-none">${FormatUtils.escapeHtml(combosText('combinationNoPatterns', 'No patterns added'))}</p>`}</div>
      <button type="button" class="combo-picker-add" data-combo-action="add-selected"${count === 0 ? ' disabled' : ''}>
        ${FormatUtils.escapeHtml(count === 0
          ? combosText('combinationPickHint', 'Tick the patterns to add')
          : combosFormat('combinationAddSelectedFmt', 'Add {0} selected', count))}
      </button>
    </div>`;
};


Rules.prototype.describeCombo = function(combo) {
  const node = Rules.comboUnwrap(combo.when).node;
  const key = Rules.comboGroupKey(node);
  if (!Rules.comboLeaves(combo.when).length) return combosText('combinationPreviewEmpty', 'Add patterns to build this combination');
  const sentence = key === 'all' ? combosText('combinationSummaryAll', 'Detect when all required conditions match.')
    : key === 'any' ? combosText('combinationSummaryAny', 'Detect when at least one condition matches.')
    : combosFormat('combinationSummaryMinimumFmt', 'Detect when at least {0} of {1} conditions match.', node.atLeast, node.of.length);
  return sentence + (Rules.comboLeaves(combo.when).some(item => item.not)
    ? ' ' + combosText('combinationSummaryExcluded', 'Excluded patterns must be absent.') : '');
};
Rules.comboValidTree = function(tree) {
  if (!tree || typeof tree !== 'object') return false;
  if (tree.not) return Rules.comboValidTree(tree.not);
  const key = Rules.comboGroupKey(tree);
  if (!key) return typeof tree.pattern === 'string' || typeof tree.method === 'string';
  if (!tree[key].length || !tree[key].every(Rules.comboValidTree)) return false;
  if (key === 'of' && (!Number.isInteger(tree.atLeast) || tree.atLeast < 1 || tree.atLeast > tree.of.filter(DetectionCombinations.hasPositive).length)) return false;
  return key !== 'any' || tree.any.every(DetectionCombinations.hasPositive);
};
Rules.prototype.buildCombinationsForSave = function(detection, { validate = true } = {}) {
  const savedIds = detection ? new Set(COMBO_METHODS.flatMap(method => (detection[method] || []).map(p => p.id)).filter(Boolean)) : null;
  let invalidIndex = -1;
  const combinations = (this.combinationsModel || []).map((combo, index) => {
    const when = savedIds ? Rules.comboPrune(combo.when, savedIds) || { all: [] } : JSON.parse(JSON.stringify(combo.when));
    if (validate && invalidIndex < 0 && (!Rules.comboValidTree(when) || !DetectionCombinations.hasPositive(when))) invalidIndex = index;
    const name = combo.name.trim() || combosFormat('combinationDefaultNameFmt', 'Combination {0}', index + 1);
    return { id: combo.id, name, ...(combo.confidence ? { confidence: combo.confidence } : {}), when };
  });
  return { combinations, invalidIndex };
};
Rules.prototype.reportInvalidCombination = function(index) {
  const combo = this.combinationsModel?.[index];
  if (combo) { this.setComboOpen(combo, true); this.renderCombinations(); }
  const card = document.querySelector(`#combinationsContainer .combo-card[data-combo="${index}"]`);
  if (card) {
    card.classList.add('combo-invalid');
    card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    card.querySelector('select')?.focus();
    setTimeout(() => card.classList.remove('combo-invalid'), 2500);
  }
  if (typeof NotificationHelper !== 'undefined') NotificationHelper.warning?.(combosText('combinationInvalid', 'Choose patterns that must match and check the minimum match count.'));
};
