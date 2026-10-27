/**
 * Rules editor → Cookies, Headers and Url: a "From this page" button on each pattern row, beside its settings and
 * delete buttons. It folds out, under the row, the active tab's cookies, response headers or scripts from other sites
 * (the worker's RULE_SUGGEST_PAGE answer), each marked with the installed rules that already detect it (the engine's
 * runDetector, through RuleSuggest.annotate) or as already in this rule. The first item ticked fills that row; any
 * other becomes a new row, as Add Pattern makes them, to review and save with the rule.
 *
 * The page is read once per editor opening; a page the extension cannot read (a browser page, the popup opened in its
 * own tab) leaves the buttons greyed out, with the reason as their title.
 *
 * Dependencies: rules.js, rules-editor.js (populateDetectionMethods, addNewMethodItem), modules/core/rule-suggest.js
 */
const ruleSuggestText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);

/** The editor's methods that can be filled from the page, and what each shows when the page has none. */
const RULE_PAGE_PICK_KINDS = {
  cookie: ['suggestRuleNoCookies', 'The page has no cookies.'],
  header: ['suggestRuleNoHeaders', 'No response headers: reload the page to capture them.'],
  url: ['suggestRuleNoScripts', 'No scripts from other sites.']
};

/** True for a tab whose page the worker can read: an http(s) address. */
Rules.isSuggestableTab = function(tab) {
  return !!tab && typeof tab.url === 'string' && /^https?:\/\//i.test(tab.url);
};

/** The active tab, or null (no tab, or a popup without the tabs API). */
Rules.prototype.suggestActiveTab = async function() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab || null;
  } catch (_) {
    return null;
  }
};

/** Every installed rule, with the name the person sees, for the "already detected by" marks. */
Rules.prototype.suggestDetectors = function() {
  const all = this.detectorManager?.getAllDetectors?.() || {};
  const out = [];
  for (const group of Object.values(all)) {
    for (const [id, detector] of Object.entries(group || {})) {
      if (!detector) continue;
      out.push({ id, detector: { ...detector, displayName: this.getDetectorDisplayName(detector.name) || id } });
    }
  }
  return out;
};

/**
 * Called by populateDetectionMethods on every editor opening: the button on every row of the sections the page can
 * fill, and a fresh read of the page the next time a list is opened.
 */
Rules.prototype.addPagePickButtons = function(container) {
  this.pagePickLoad = null;
  this.pagePickSupported = null;
  if (!container) return;
  container.querySelectorAll('.method-section .method-item').forEach(item => this.decoratePagePickRow(item));
  this.setupPagePick(container);
  this.refreshPagePickAvailability(container);
};

/** The row's "From this page" button, before its settings button (also for a row Add Pattern just made). */
Rules.prototype.decoratePagePickRow = function(item) {
  if (!item || !item.classList || !item.classList.contains('method-item')) return;
  const kind = item.closest('.method-section')?.dataset.methodType;
  const actions = item.querySelector('.field-actions[data-field-type="name"]');
  if (!RULE_PAGE_PICK_KINDS[kind] || !actions || actions.querySelector('.page-pick-btn')) return;
  const label = ruleSuggestText('pagePickButton', 'From this page');
  actions.insertAdjacentHTML('afterbegin', `
                  <button type="button" class="method-action-btn page-pick-btn" aria-expanded="false" title="${FormatUtils.escapeAttr(label)}" aria-label="${FormatUtils.escapeAttr(label)}">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M12 12v5"/><path d="M9.5 14.5L12 17l2.5-2.5"/></svg>
                  </button>`);
  if (this.pagePickSupported === false) this.markPagePickUnsupported(actions.querySelector('.page-pick-btn'));
};

Rules.prototype.markPagePickUnsupported = function(button) {
  if (!button) return;
  button.title = `${ruleSuggestText('pagePickButton', 'From this page')}: ${ruleSuggestText('suggestRuleUnsupported', 'Open the popup on a website to build a rule from it.')}`;
  button.setAttribute('aria-disabled', 'true');
};

/** Greys the buttons out on a page the extension cannot read, with the reason as their title. */
Rules.prototype.refreshPagePickAvailability = async function(container) {
  this.pagePickSupported = Rules.isSuggestableTab(await this.suggestActiveTab());
  if (this.pagePickSupported) return;
  container.querySelectorAll('.page-pick-btn').forEach(button => this.markPagePickUnsupported(button));
};

/** One delegated listener on the methods container (it is kept across openings; its content is redrawn). */
Rules.prototype.setupPagePick = function(container) {
  if (container.dataset.pagePickBound === 'true') return;
  container.dataset.pagePickBound = 'true';
  container.addEventListener('click', (event) => {
    const toggle = event.target.closest('.page-pick-btn');
    if (toggle) {
      event.stopPropagation();
      if (toggle.getAttribute('aria-disabled') === 'true') return;
      this.togglePagePick(toggle.closest('.method-item'));
      return;
    }
    const panel = event.target.closest('.page-pick-panel');
    if (!panel) return;
    event.stopPropagation();
    if (event.target.closest('.page-pick-cancel')) this.closePagePick(panel.closest('.method-item'), true);
    else if (event.target.closest('.page-pick-add')) this.addPagePicks(panel.closest('.method-item'));
  });
  container.addEventListener('change', (event) => {
    const panel = event.target.closest('.page-pick-panel');
    if (panel) this.updatePagePickAdd(panel);
  });
  container.addEventListener('input', (event) => {
    if (event.target.classList.contains('page-pick-filter')) this.filterPagePick(event.target.closest('.page-pick-panel'));
  });
  // Escape folds the list away and leaves the editor open
  container.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const panel = event.target.closest('.page-pick-panel');
    if (!panel) return;
    event.preventDefault();
    event.stopPropagation();
    this.closePagePick(panel.closest('.method-item'), true);
  });
};

/** The page's candidates, read once per editor opening: { candidates } or { message }. */
Rules.prototype.pagePickData = function() {
  if (!this.pagePickLoad) this.pagePickLoad = this.readPagePick();
  return this.pagePickLoad;
};

Rules.prototype.readPagePick = async function() {
  const tab = await this.suggestActiveTab();
  if (!Rules.isSuggestableTab(tab)) {
    return { message: ruleSuggestText('suggestRuleUnsupported', 'Open the popup on a website to build a rule from it.') };
  }
  let reply = null;
  // A worker that is starting up can drop the first message: one more try before giving up
  for (let attempt = 0; attempt < 2 && !(reply && reply.status); attempt++) {
    try {
      reply = await chrome.runtime.sendMessage({ type: WorkerMessages.RULE_SUGGEST_PAGE, tabId: tab.id });
    } catch (error) {
      Logger.warn('UI', 'From this page: the worker did not answer', error);
    }
  }
  if (!reply || reply.status !== 'ok') {
    Logger.warn('UI', 'From this page: the page could not be read', reply);
    // 'unknown': the worker does not know the message, so it still runs the code from before an update (an
    // unpacked extension's pages read the new files at once, its worker only after the extension is reloaded)
    const status = reply && reply.status;
    return { message: status === 'unsupported'
      ? ruleSuggestText('suggestRuleUnsupported', 'Open the popup on a website to build a rule from it.')
      : status === 'unknown'
        ? ruleSuggestText('suggestRuleOutdated', 'The extension was updated but its background part still runs the old version. Reload the extension in the browser\'s Extensions page and try again.')
        : ruleSuggestText('suggestRuleError', 'The page could not be read. Reload it and try again.') };
  }
  const engine = new DetectionEngineManager();
  return { host: reply.host, candidates: RuleSuggest.suggest(reply, this.suggestDetectors(), (detector, pageData) => engine.runDetector(detector, pageData)) };
};

Rules.prototype.togglePagePick = async function(item) {
  if (!item) return;
  if (item.querySelector('.page-pick-panel')) {
    this.closePagePick(item, false);
    return;
  }
  // One list at a time in the editor
  document.querySelectorAll('#detectionMethodsContainer .page-pick-panel').forEach(open => this.closePagePick(open.closest('.method-item'), false));
  const panel = document.createElement('div');
  panel.className = 'page-pick-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', ruleSuggestText('pagePickButton', 'From this page'));
  panel.innerHTML = this.pagePickMessageHtml(ruleSuggestText('suggestRuleLoading', 'Reading the page…'));
  item.appendChild(panel);
  item.querySelector('.page-pick-btn')?.setAttribute('aria-expanded', 'true');
  const data = await this.pagePickData();
  if (!panel.isConnected) return; // closed, or the editor redrawn, meanwhile
  this.renderPagePick(item, panel, data);
};

Rules.prototype.closePagePick = function(item, focusButton) {
  if (!item) return;
  item.querySelector('.page-pick-panel')?.remove();
  const button = item.querySelector('.page-pick-btn');
  if (!button) return;
  button.setAttribute('aria-expanded', 'false');
  if (focusButton) button.focus();
};

Rules.prototype.pagePickMessageHtml = function(text) {
  return `<p class="page-pick-message" dir="auto">${FormatUtils.escapeHtml(text)}</p>`;
};

/** What the section already has, lower-cased, so the page's items it covers are marked "in this rule". */
Rules.prototype.pagePickExisting = function(section, except) {
  return new Set([...section.querySelectorAll('.method-item .method-name')]
    .filter(input => input.closest('.method-item') !== except)
    .map(input => String(input.value || '').trim().toLowerCase())
    .filter(Boolean));
};

/** A row's hover text: who already detects it, else what the new pattern will match. */
Rules.prototype.suggestRowDescription = function(candidate) {
  if (candidate.matchedBy.length) {
    return ruleSuggestText('suggestRuleDetectedByFmt', 'Already detected by {0}', candidate.matchedBy.join(', '));
  }
  if (candidate.kind === 'cookie' && candidate.prefix) {
    return ruleSuggestText('suggestRuleCookiePrefixFmt', 'Names starting with {0}: the rest looks random', candidate.text);
  }
  if (candidate.kind === 'url') {
    return ruleSuggestText('suggestRuleScriptFmt', 'Script addresses containing this: {0}', candidate.sources.length);
  }
  return ruleSuggestText('suggestRuleExactName', 'Matched by its exact name');
};

/** One line per candidate: the box, the name and, only when it says something, a short tag. */
Rules.prototype.suggestRowHtml = function(candidate, index, inRule) {
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const hover = this.suggestRowDescription(candidate);
  let tag = '';
  if (inRule) {
    tag = `<span class="sr-tag is-in-rule" dir="auto">${esc(ruleSuggestText('pagePickInRule', 'in this rule'))}</span>`;
  } else if (candidate.matchedBy.length) {
    tag = `<span class="sr-tag is-known" dir="auto">${esc(candidate.matchedBy.join(', '))}</span>`;
  } else if (candidate.kind === 'cookie' && candidate.prefix) {
    tag = `<span class="sr-tag" dir="auto">${esc(ruleSuggestText('suggestRulePrefixTag', 'starts with'))}</span>`;
  } else if (candidate.kind === 'url' && candidate.sources.length > 1) {
    tag = `<span class="sr-tag">×${esc(String(candidate.sources.length))}</span>`;
  }
  return `
          <label class="sr-row${candidate.matchedBy.length ? ' is-known' : ''}${inRule ? ' is-in-rule' : ''}" title="${attr(hover)}" data-filter="${attr(String(candidate.value).toLowerCase())}">
            <input type="checkbox" class="sr-check" data-index="${attr(String(index))}"${inRule ? ' disabled' : ''}>
            <span class="sr-name" dir="ltr">${esc(candidate.value)}</span>
            ${tag}
          </label>`;
};

Rules.prototype.renderPagePick = function(item, panel, data) {
  const section = item.closest('.method-section');
  const kind = section.dataset.methodType;
  if (!data || !Array.isArray(data.candidates)) {
    panel.innerHTML = this.pagePickMessageHtml(data && data.message ? data.message : ruleSuggestText('suggestRuleError', 'The page could not be read. Reload it and try again.'));
    return;
  }
  panel.pagePickCandidates = data.candidates;
  const existing = this.pagePickExisting(section, item);
  const rows = data.candidates.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => candidate.kind === kind);
  if (!rows.length) {
    const [key, fallback] = RULE_PAGE_PICK_KINDS[kind];
    panel.innerHTML = this.pagePickMessageHtml(ruleSuggestText(key, fallback));
    return;
  }
  const inRule = ({ candidate }) => existing.has(String(candidate.text).toLowerCase());
  const fresh = rows.filter(row => !row.candidate.matchedBy.length && !inRule(row));
  const known = rows.filter(row => row.candidate.matchedBy.length || inRule(row));
  const group = (items) => `<div class="sr-group">${items.map(row => this.suggestRowHtml(row.candidate, row.index, inRule(row))).join('')}</div>`;
  const esc = FormatUtils.escapeHtml;
  // What an installed rule (or this one) already finds is folded: rarely what a new pattern is made of
  panel.innerHTML = `
    ${rows.length > 6 ? `<input type="search" class="sr-input sr-filter page-pick-filter" dir="auto" autocomplete="off" spellcheck="false"
      placeholder="${FormatUtils.escapeAttr(ruleSuggestText('suggestRuleFilter', 'Filter'))}" aria-label="${FormatUtils.escapeAttr(ruleSuggestText('suggestRuleFilter', 'Filter'))}">` : ''}
    <div class="page-pick-list">
      ${fresh.length ? group(fresh) : ''}
      ${known.length ? `
      <details class="sr-known"${fresh.length ? '' : ' open'}>
        <summary dir="auto">${esc(ruleSuggestText('suggestRuleKnownFmt', 'Already detected: {0}', known.length))}</summary>
        ${group(known)}
      </details>` : ''}
    </div>
    <div class="page-pick-actions">
      <button type="button" class="page-pick-cancel">${esc(ruleSuggestText('btnCancel', 'Cancel'))}</button>
      <button type="button" class="page-pick-add" disabled>${esc(ruleSuggestText('pagePickAddFmt', 'Add {0}', 0))}</button>
    </div>`;
  (panel.querySelector('.page-pick-filter') || panel.querySelector('.sr-check:not(:disabled)'))?.focus();
};

Rules.prototype.filterPagePick = function(panel) {
  if (!panel) return;
  const input = panel.querySelector('.page-pick-filter');
  const query = input ? String(input.value || '').trim().toLowerCase() : '';
  for (const row of panel.querySelectorAll('.sr-row')) {
    row.hidden = !!query && !String(row.dataset.filter || '').includes(query);
  }
  const known = panel.querySelector('.sr-known');
  if (known && query) known.open = !!known.querySelector('.sr-row:not([hidden])');
};

Rules.prototype.pagePickPicked = function(panel) {
  const candidates = panel.pagePickCandidates || [];
  return [...panel.querySelectorAll('.sr-check:checked')].map(box => candidates[Number(box.dataset.index)]).filter(Boolean);
};

Rules.prototype.updatePagePickAdd = function(panel) {
  const count = this.pagePickPicked(panel).length;
  const add = panel.querySelector('.page-pick-add');
  if (!add) return;
  add.disabled = count === 0;
  add.textContent = ruleSuggestText('pagePickAddFmt', 'Add {0}', count);
};

/** The text a picked item becomes in the section's name field: as the editor reads it, without a regex. */
Rules.pagePickPatternText = function(candidate) {
  // A cookie name without a regex matches names starting with it, so the prefix of a random-looking name is enough
  return String(candidate.text || '');
};

/** The first ticked item fills the row the list was opened from; any other becomes a new row, as Add Pattern makes them. */
Rules.prototype.addPagePicks = function(item) {
  const panel = item && item.querySelector('.page-pick-panel');
  if (!panel) return;
  const picked = this.pagePickPicked(panel);
  if (!picked.length) return;
  const section = item.closest('.method-section');
  const addButton = section.querySelector('.add-method-btn');
  picked.forEach((candidate, index) => {
    let input = index === 0 ? item.querySelector('.method-name') : null;
    if (!input) {
      this.addNewMethodItem(addButton);
      const items = section.querySelectorAll('.method-item');
      input = items[items.length - 1]?.querySelector('.method-name');
    }
    if (!input) return;
    input.value = Rules.pagePickPatternText(candidate);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  this.closePagePick(item, true);
  this.updateMethodPatternCount(section);
  this.updateAddPatternButtonState(section);
};
