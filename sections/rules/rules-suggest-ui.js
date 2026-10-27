/**
 * Rules editor → Cookies, Headers and Url: "From this page" beside Add Pattern. It folds out, under the section, the
 * active tab's cookies, response headers or scripts from other sites (the worker's RULE_SUGGEST_PAGE answer), each
 * marked with the installed rules that already detect it (the engine's runDetector, through RuleSuggest.annotate) or
 * as already in this rule. The ticked ones become pattern rows of the section, as Add Pattern makes them, to review
 * and save with the rule.
 *
 * The page is read once per editor opening; a page the extension cannot read (a browser page, the popup opened in its
 * own tab) leaves the button greyed out, with the reason as its title.
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
 * Called by populateDetectionMethods on every editor opening: a "From this page" button next to Add Pattern in the
 * sections the page can fill, and a fresh read of the page the next time one is opened.
 */
Rules.prototype.addPagePickButtons = function(container) {
  this.pagePickLoad = null;
  if (!container) return;
  const label = ruleSuggestText('pagePickButton', 'From this page');
  for (const section of container.querySelectorAll('.method-section')) {
    const kind = section.dataset.methodType;
    const add = section.querySelector(':scope > .add-method-btn');
    if (!RULE_PAGE_PICK_KINDS[kind] || !add || section.querySelector('.page-pick-btn')) continue;
    const row = document.createElement('div');
    row.className = 'method-add-row';
    add.replaceWith(row);
    row.appendChild(add);
    row.insertAdjacentHTML('beforeend', `
      <button type="button" class="page-pick-btn" data-method-type="${FormatUtils.escapeAttr(kind)}" aria-expanded="false">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
        <span>${FormatUtils.escapeHtml(label)}</span>
      </button>`);
  }
  this.setupPagePick(container);
  this.refreshPagePickAvailability(container);
};

/** Greys the buttons out on a page the extension cannot read, with the reason as their title. */
Rules.prototype.refreshPagePickAvailability = async function(container) {
  const supported = Rules.isSuggestableTab(await this.suggestActiveTab());
  const label = ruleSuggestText('pagePickButton', 'From this page');
  for (const button of container.querySelectorAll('.page-pick-btn')) {
    // The label says what it does; only a greyed-out button needs its reason as hover text
    if (supported) {
      button.removeAttribute('title');
      button.removeAttribute('aria-disabled');
    } else {
      button.title = `${label}: ${ruleSuggestText('suggestRuleUnsupported', 'Open the popup on a website to build a rule from it.')}`;
      button.setAttribute('aria-disabled', 'true');
    }
  }
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
      this.togglePagePick(toggle.closest('.method-section'));
      return;
    }
    const panel = event.target.closest('.page-pick-panel');
    if (!panel) return;
    event.stopPropagation();
    if (event.target.closest('.page-pick-cancel')) this.closePagePick(panel.closest('.method-section'), true);
    else if (event.target.closest('.page-pick-add')) this.addPagePicks(panel.closest('.method-section'));
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
    this.closePagePick(panel.closest('.method-section'), true);
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

Rules.prototype.togglePagePick = async function(section) {
  if (!section) return;
  if (section.querySelector('.page-pick-panel')) {
    this.closePagePick(section, false);
    return;
  }
  if (section.classList.contains('collapsed')) section.querySelector('.method-header-left')?.click();
  const row = section.querySelector('.method-add-row');
  if (!row) return;
  const panel = document.createElement('div');
  panel.className = 'page-pick-panel';
  panel.setAttribute('role', 'group');
  panel.setAttribute('aria-label', ruleSuggestText('pagePickButton', 'From this page'));
  panel.innerHTML = this.pagePickMessageHtml(ruleSuggestText('suggestRuleLoading', 'Reading the page…'));
  row.after(panel);
  section.querySelector('.page-pick-btn')?.setAttribute('aria-expanded', 'true');
  const data = await this.pagePickData();
  if (!panel.isConnected) return; // closed, or the editor redrawn, meanwhile
  this.renderPagePick(section, panel, data);
};

Rules.prototype.closePagePick = function(section, focusButton) {
  if (!section) return;
  section.querySelector('.page-pick-panel')?.remove();
  const button = section.querySelector('.page-pick-btn');
  if (!button) return;
  button.setAttribute('aria-expanded', 'false');
  if (focusButton) button.focus();
};

Rules.prototype.pagePickMessageHtml = function(text) {
  return `<p class="page-pick-message" dir="auto">${FormatUtils.escapeHtml(text)}</p>`;
};

/** What the section already has, lower-cased, so the page's items it covers are marked "in this rule". */
Rules.prototype.pagePickExisting = function(section) {
  return new Set([...section.querySelectorAll('.method-item .method-name')]
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
  const hover = [this.suggestRowDescription(candidate), ...candidate.sources.filter(source => source !== candidate.value)].join('\n');
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

Rules.prototype.renderPagePick = function(section, panel, data) {
  const kind = section.dataset.methodType;
  if (!data || !Array.isArray(data.candidates)) {
    panel.innerHTML = this.pagePickMessageHtml(data && data.message ? data.message : ruleSuggestText('suggestRuleError', 'The page could not be read. Reload it and try again.'));
    return;
  }
  panel.pagePickCandidates = data.candidates;
  const existing = this.pagePickExisting(section);
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

/** Each ticked item becomes a pattern row, as Add Pattern makes them; an empty row left in the section is used first. */
Rules.prototype.addPagePicks = function(section) {
  const panel = section && section.querySelector('.page-pick-panel');
  if (!panel) return;
  const picked = this.pagePickPicked(panel);
  if (!picked.length) return;
  const addButton = section.querySelector('.add-method-btn');
  for (const candidate of picked) {
    let input = [...section.querySelectorAll('.method-item .method-name')].find(field => !String(field.value || '').trim());
    if (!input) {
      this.addNewMethodItem(addButton);
      const items = section.querySelectorAll('.method-item');
      input = items[items.length - 1]?.querySelector('.method-name');
    }
    if (!input) continue;
    input.value = Rules.pagePickPatternText(candidate);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  this.closePagePick(section, true);
  this.updateMethodPatternCount(section);
  this.updateMethodSectionPagination(section, { goToLastPage: true });
  this.updateAddPatternButtonState(section);
};
