/**
 * Rule editor → "Check against History": runs RuleHistoryCheck on the rule as
 * it is in the form (unsaved edits included) and lists, per pattern and per
 * combination, on how many saved pages it matches.
 */
const ruleCheckText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);

Rules.prototype.resetHistoryCheck = function() {
  const results = document.querySelector('#ruleHistoryCheckResults');
  if (results) results.replaceChildren();
};

Rules.prototype.runHistoryCheck = async function() {
  const results = document.querySelector('#ruleHistoryCheckResults');
  if (!results || !this.currentEditDetector) return;
  const esc = FormatUtils.escapeHtml;
  const detection = this._collectDetectionFromForm();
  const combinations = this.buildCombinationsForSave(detection, { validate: false }).combinations || [];
  const nameInput = document.querySelector('#detectorNameInput');
  const rule = {
    id: this.currentEditDetector.id || this.currentEditDetector.detectorId || '',
    name: (nameInput && nameInput.value.trim()) || this.currentEditDetector.name || '',
    detection,
    combinations
  };
  let items = [];
  try {
    const stored = await chrome.storage.local.get('scrapfly_history');
    items = RuleHistoryCheck.parseHistory(stored.scrapfly_history);
  } catch (error) {
    Logger.warn('UI', 'History check could not read History', error);
  }
  if (!items.length) {
    results.innerHTML = `<p class="rule-check-empty">${esc(ruleCheckText('ruleHistoryCheckNoHistory', 'History is empty: browse some pages first.'))}</p>`;
    return;
  }
  const r = RuleHistoryCheck.check(rule, items, typeof DetectionCombinations !== 'undefined' ? DetectionCombinations : null);
  if (!r.patterns.length) {
    results.innerHTML = `<p class="rule-check-empty">${esc(ruleCheckText('ruleHistoryCheckEmpty', 'Add patterns to check them.'))}</p>`;
    return;
  }
  // How much of the History a count covers, as a thin bar under it and a bar for the whole rule
  const share = (pages) => (r.pages > 0 ? Math.min(100, Math.round((pages / r.pages) * 100)) : 0);
  const bar = (pages) => `<span class="rule-check-bar" aria-hidden="true"><span style="width:${share(pages)}%"></span></span>`;
  const count = (row) => {
    const own = ruleCheckText('ruleHistoryCheckRulePagesFmt', '{0} of {1} pages', row.rulePages, r.rulePages);
    const other = row.otherPages ? ` <span class="rule-check-other">${esc(ruleCheckText('ruleHistoryCheckOtherFmt', '+{0} other pages', row.otherPages))}</span>` : '';
    return `<span class="rule-check-count${row.rulePages || row.otherPages ? '' : ' is-zero'}">${esc(own)}</span>${other}${bar(row.rulePages)}`;
  };
  const patternRows = r.patterns.map(row => `
    <li class="rule-check-row${row.rulePages || row.otherPages ? '' : ' is-zero'}">
      ${this.renderMethodChip(row.method, 'rule-check-chip')}
      <span class="rule-check-text">${row.description ? `<span class="rule-check-desc" dir="auto">${esc(FormatUtils.ruleText(row.description))}</span>` : ''}<code class="rule-check-raw" dir="ltr">${esc(row.label)}</code></span>
      <span class="rule-check-counts">${count(row)}</span>
    </li>`).join('');
  const comboRows = r.combinations.map((row, index) => `
    <li class="rule-check-row${row.pages ? '' : ' is-zero'}">
      <span class="rule-check-text"><span class="rule-check-desc">${esc(FormatUtils.ruleText(row.name) || ruleCheckText('combinationDefaultNameFmt', 'Combination {0}', index + 1))}</span></span>
      <span class="rule-check-counts"><span class="rule-check-count${row.pages ? '' : ' is-zero'}">${esc(ruleCheckText('ruleHistoryCheckCombinationFmt', 'fires on {0} pages', row.pages))}</span>${bar(row.pages)}</span>
    </li>`).join('');
  const heading = (key, fallback) => `<h4 class="rule-check-heading">${esc(ruleCheckText(key, fallback))}</h4>`;
  results.innerHTML = `
    <div class="rule-check-summary${r.rulePages ? '' : ' is-zero'}">
      <span class="rule-check-summary-text">${esc(ruleCheckText('ruleHistoryCheckSummaryFmt', 'This rule matches {1} of {0} saved pages', r.pages, r.rulePages))}</span>
      <span class="rule-check-meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${share(r.rulePages)}"><span style="width:${share(r.rulePages)}%"></span></span>
    </div>
    ${heading('ruleHistoryCheckPatterns', 'Patterns')}
    <ul class="rule-check-list">${patternRows}</ul>
    ${comboRows ? `${heading('ruleHistoryCheckCombinations', 'Combinations')}<ul class="rule-check-list rule-check-combos">${comboRows}</ul>` : ''}
    <p class="rule-check-note">${esc(ruleCheckText('ruleHistoryCheckNote', 'An estimate: History keeps the matched values, not whole pages.'))}</p>`;
};
