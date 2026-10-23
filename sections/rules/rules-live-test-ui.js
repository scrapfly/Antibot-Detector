/**
 * Rule editor → "Test on this page": sends the rule as it is in the form (unsaved edits included) to the worker, which
 * runs it against the page of the tab this popup belongs to (background/rule-test.js), and lists what each pattern
 * found there. Cookies, URLs, content and DOM patterns can be tested; the rest are listed as needing a real scan,
 * never as "no match" (modules/core/rule-test.js). Nothing is saved or sent anywhere.
 */
const liveTestText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);

Rules.prototype.resetLiveTest = function() {
  const results = document.querySelector('#ruleLiveTestResults');
  if (results) results.replaceChildren();
};

/** The rule as the form has it, the same one "Check against History" reads. */
Rules.prototype.liveTestRule = function() {
  const detection = this._collectDetectionFromForm();
  const combinations = this.buildCombinationsForSave(detection, { validate: false }).combinations || [];
  const nameInput = document.querySelector('#detectorNameInput');
  const category = document.querySelector('#detectorCategorySelect');
  return {
    id: (this.currentEditDetector && (this.currentEditDetector.id || this.currentEditDetector.detectorId)) || 'rule-test',
    name: (nameInput && nameInput.value.trim()) || (this.currentEditDetector && this.currentEditDetector.name) || '',
    category: (category && category.value) || (this.currentEditDetector && this.currentEditDetector.category) || 'antibot',
    detection,
    combinations
  };
};

/** The words of a reply that carries no answer. */
Rules.prototype.liveTestProblem = function(status) {
  if (status === 'unsupported') return liveTestText('ruleLiveTestUnsupported', 'Open the popup on a web page to test a rule on it.');
  if (status === 'unreachable') return liveTestText('ruleLiveTestUnreachable', 'The page did not answer. Reload it and try again.');
  // The worker does not know the request: it still runs the code from before an update of the extension
  if (status === 'unknown') return liveTestText('workerOutdatedHint', "The extension's background part is out of date. Reload the extension on the extensions page and try again.");
  return liveTestText('ruleLiveTestError', 'The test could not run.');
};

/** The answer as markup (text only: every value is escaped). */
Rules.prototype.renderLiveTest = function(rule, reply) {
  const esc = FormatUtils.escapeHtml;
  const rows = RuleTest.patterns(rule.detection);
  const byKey = new Map((reply.rows || []).map(row => [`${row.method}:${row.index}`, row]));
  const found = reply.verdict && reply.verdict.confidence > 0;
  const partial = reply.verdict && reply.verdict.partial && !found;
  const summary = found
    ? liveTestText('ruleLiveTestMatchesFmt', 'The rule matches {0} (confidence {1}%)', reply.host, reply.verdict.confidence)
    : partial
      ? liveTestText('ruleLiveTestPartialFmt', 'The rule is only partly matched on {0}: a combination needs more evidence', reply.host)
      : liveTestText('ruleLiveTestNoMatchFmt', 'The rule does not match {0}', reply.host);
  const patternRows = rows.map((row) => {
    const result = byKey.get(`${row.method}:${row.index}`) || { tested: row.testable, count: 0 };
    const state = !result.tested ? 'is-untested' : result.count > 0 ? 'is-match' : 'is-zero';
    const status = !result.tested
      ? liveTestText('ruleLiveTestNeedsScan', 'needs a real scan')
      : result.count > 0 ? liveTestText('ruleLiveTestCountFmt', '{0} found', result.count) : liveTestText('ruleLiveTestNone', 'no match');
    return `
    <li class="rule-check-row ${state}">
      ${this.renderMethodChip(row.method, 'rule-check-chip')}
      <span class="rule-check-text">${row.description ? `<span class="rule-check-desc" dir="auto">${esc(FormatUtils.ruleText(row.description))}</span>` : ''}<code class="rule-check-raw" dir="ltr">${esc(row.label)}</code></span>
      <span class="rule-check-counts"><span class="rule-check-count live-test-status">${esc(status)}</span></span>
    </li>`;
  }).join('');
  const fired = new Set(((reply.verdict && reply.verdict.combinations) || []).map(c => c.id));
  const comboRows = (Array.isArray(rule.combinations) ? rule.combinations : []).map((combo, index) => {
    const on = fired.has(combo.id);
    return `
    <li class="rule-check-row ${on ? 'is-match' : 'is-zero'}">
      <span class="rule-check-text"><span class="rule-check-desc">${esc(FormatUtils.ruleText(combo.name) || liveTestText('combinationDefaultNameFmt', 'Combination {0}', index + 1))}</span></span>
      <span class="rule-check-counts"><span class="rule-check-count live-test-status">${esc(on ? liveTestText('ruleLiveTestFires', 'fires') : liveTestText('ruleLiveTestNoFire', 'does not fire'))}</span></span>
    </li>`;
  }).join('');
  const heading = (key, fallback) => `<h4 class="rule-check-heading">${esc(liveTestText(key, fallback))}</h4>`;
  const page = reply.page || {};
  const hasUrlPatterns = rows.some(row => row.method === 'url');
  const notes = [liveTestText('ruleLiveTestPageFmt', 'Read {0} scripts, {1} elements, {2} cookies and {3} requests.', page.scripts || 0, page.elements || 0, page.cookies || 0, page.requests || 0)];
  if (hasUrlPatterns && !page.requests) notes.push(liveTestText('ruleLiveTestNoRequests', 'The requests the page made are not available now, so URL patterns were checked against its address and scripts only.'));
  if ((reply.untested || []).length) notes.push(liveTestText('ruleLiveTestUntestedNote', 'Patterns marked "needs a real scan" are not part of this test: the answer above covers the others.'));
  return `
    <div class="rule-check-summary live-test-summary${found ? '' : ' is-zero'}">
      <span class="rule-check-summary-text">${esc(summary)}</span>
    </div>
    ${heading('ruleHistoryCheckPatterns', 'Patterns')}
    <ul class="rule-check-list">${patternRows}</ul>
    ${comboRows ? `${heading('ruleHistoryCheckCombinations', 'Combinations')}<ul class="rule-check-list rule-check-combos">${comboRows}</ul>` : ''}
    ${notes.map(note => `<p class="rule-check-note">${esc(note)}</p>`).join('')}`;
};

Rules.prototype.runLiveTest = async function() {
  const results = document.querySelector('#ruleLiveTestResults');
  const button = document.querySelector('#ruleLiveTestBtn');
  if (!results || !this.currentEditDetector) return;
  const esc = FormatUtils.escapeHtml;
  const rule = this.liveTestRule();
  if (!RuleTest.patterns(rule.detection).length) {
    results.innerHTML = `<p class="rule-check-empty">${esc(liveTestText('ruleHistoryCheckEmpty', 'Add patterns to check them.'))}</p>`;
    return;
  }
  const label = button ? button.textContent : '';
  if (button) { button.disabled = true; button.textContent = liveTestText('ruleLiveTestRunning', 'Testing…'); }
  results.replaceChildren();
  // The page can take up to 25 s to answer: if the editor was closed or another rule opened meanwhile, the answer is
  // about a rule no longer on screen and is dropped
  const editing = this.currentEditDetector;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const reply = await chrome.runtime.sendMessage({ type: WorkerMessages.RULE_TEST, detector: rule, tabId: tab && tab.id });
    if (this.currentEditDetector !== editing) return;
    if (!reply || reply.status !== 'ok') {
      results.innerHTML = `<p class="rule-check-empty">${esc(this.liveTestProblem(reply && reply.status))}</p>`;
    } else {
      results.innerHTML = this.renderLiveTest(rule, reply);
    }
  } catch (error) {
    Logger.warn('UI', 'Test on this page failed', error);
    if (this.currentEditDetector !== editing) return;
    results.innerHTML = `<p class="rule-check-empty">${esc(this.liveTestProblem('error'))}</p>`;
  } finally {
    if (button) { button.disabled = false; button.textContent = label; }
  }
};
