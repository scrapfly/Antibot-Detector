/**
 * Rules → "New rule from this page": a dialog listing the active tab's cookies, third-party scripts and response
 * headers (the worker's RULE_SUGGEST_PAGE answer), each marked with the installed rules that already detect it (the
 * engine's runDetector, through RuleSuggest.annotate). The person ticks what belongs to the protection, names it and
 * picks a category; "Create rule" opens the rule editor with a new rule made of those patterns (RuleSuggest.buildRule),
 * to review and save as any other (the editor validates on Save).
 *
 * On a page the extension cannot read (a browser page, the popup opened in its own tab) the button stays focusable
 * with aria-disabled and says why.
 *
 * Dependencies: rules.js, rules-modal-lifecycle.js, rules-handlers.js (newDetectorTemplate), rules-editor-modal.js,
 * modules/core/rule-suggest.js, modules/ui/modal-focus.js
 */
const ruleSuggestText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);

const RULE_SUGGEST_SECTIONS = [
  { kind: 'cookie', title: ['suggestRuleCookies', 'Cookies'], empty: ['suggestRuleNoCookies', 'The page has no cookies.'] },
  { kind: 'url', title: ['suggestRuleScripts', 'Third-party scripts'], empty: ['suggestRuleNoScripts', 'No scripts from other sites.'] },
  { kind: 'header', title: ['suggestRuleHeaders', 'Response headers'], empty: ['suggestRuleNoHeaders', 'No response headers: reload the page to capture them.'] }
];

/** True for a tab whose page the worker can read: an http(s) address. */
Rules.isSuggestableTab = function(tab) {
  return !!tab && typeof tab.url === 'string' && /^https?:\/\//i.test(tab.url);
};

Rules.prototype.setupSuggestRule = function() {
  const button = document.querySelector('#suggestRuleBtn');
  if (!button || button.dataset.bound === 'true') return;
  button.dataset.bound = 'true';
  button.addEventListener('click', () => this.openSuggestRule());

  this._suggestModal = new RulesModalLifecycle('#suggestRuleModal', { hideParentOnOpen: false });
  this._suggestModal.setupCloseListeners('#closeSuggestRule', '#cancelSuggestRule');
  this._suggestModal.onClose = () => {
    this.releaseSuggestFocus?.();
    this.releaseSuggestFocus = null;
    this.suggestCandidates = [];
    this.suggestLoad = null;
  };

  const list = document.querySelector('#suggestRuleList');
  if (list) list.addEventListener('change', () => this.updateSuggestCreate());
  const name = document.querySelector('#suggestRuleName');
  if (name) {
    name.addEventListener('input', () => {
      name.removeAttribute('aria-invalid');
      const error = document.querySelector('#suggestRuleNameError');
      if (error) error.hidden = true;
    });
  }
  document.querySelector('#createSuggestRule')?.addEventListener('click', () => this.createRuleFromSuggestions());
  this.refreshSuggestAvailability();
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

/** Enables the button on a web page; elsewhere marks it aria-disabled, with the reason as its title. */
Rules.prototype.refreshSuggestAvailability = async function() {
  const button = document.querySelector('#suggestRuleBtn');
  if (!button) return false;
  const supported = Rules.isSuggestableTab(await this.suggestActiveTab());
  const title = supported
    ? ruleSuggestText('suggestRuleTitle', 'New rule from this page')
    : `${ruleSuggestText('suggestRuleTitle', 'New rule from this page')}: ${ruleSuggestText('suggestRuleUnsupported', 'Open the popup on a website to build a rule from it.')}`;
  button.title = title;
  button.setAttribute('aria-label', title);
  if (supported) button.removeAttribute('aria-disabled');
  else button.setAttribute('aria-disabled', 'true');
  return supported;
};

Rules.prototype.openSuggestRule = async function() {
  const tab = await this.suggestActiveTab();
  if (!Rules.isSuggestableTab(tab)) {
    await this.refreshSuggestAvailability();
    NotificationHelper.info(ruleSuggestText('suggestRuleUnsupported', 'Open the popup on a website to build a rule from it.'));
    return;
  }
  const modal = document.querySelector('#suggestRuleModal');
  if (!modal || !this._suggestModal) return;
  const name = document.querySelector('#suggestRuleName');
  if (name) { name.value = ''; name.removeAttribute('aria-invalid'); }
  const error = document.querySelector('#suggestRuleNameError');
  if (error) error.hidden = true;
  const category = document.querySelector('#suggestRuleCategory');
  if (category) category.value = 'antibot';
  let host = '';
  try { host = new URL(tab.url).hostname; } catch (_) { /* shown without it */ }
  this.setSuggestIntro(host);
  this.suggestCandidates = [];
  this.renderSuggestMessage(ruleSuggestText('suggestRuleLoading', 'Reading the page…'));
  this.updateSuggestCreate();
  // Focus goes back to the button on close, also when it was opened without focusing it
  const trigger = document.querySelector('#suggestRuleBtn');
  if (trigger && (!document.activeElement || document.activeElement === document.body)) trigger.focus({ preventScroll: true });
  this._suggestModal.open();
  this.releaseSuggestFocus?.();
  this.releaseSuggestFocus = ModalFocus.activate(modal.querySelector('.rule-modal-content'), {
    onClose: () => this._suggestModal.close(),
    initialFocus: name || undefined
  });
  await this.loadSuggestions(tab);
};

Rules.prototype.setSuggestIntro = function(host) {
  const intro = document.querySelector('#suggestRuleIntro');
  if (!intro) return;
  intro.textContent = ruleSuggestText('suggestRuleIntroFmt',
    'Tick what belongs to the protection on {0}. What no installed rule detects comes first.', host || '—');
};

/** The installed rules, each with the name the Rules list shows. */
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

Rules.prototype.loadSuggestions = async function(tab) {
  const load = {};
  this.suggestLoad = load;
  let reply = null;
  // A worker that is starting up can drop the first message: one more try before giving up
  for (let attempt = 0; attempt < 2 && !(reply && reply.status); attempt++) {
    try {
      reply = await chrome.runtime.sendMessage({ type: WorkerMessages.RULE_SUGGEST_PAGE, tabId: tab.id });
    } catch (error) {
      Logger.warn('UI', 'New rule from this page: the worker did not answer', error);
    }
  }
  if (this.suggestLoad !== load) return; // closed, or opened again, meanwhile
  if (!reply || reply.status !== 'ok') {
    Logger.warn('UI', 'New rule from this page: the page could not be read', reply);
    // 'unknown': the worker does not know the message, so it still runs the code from before an update (an
    // unpacked extension's pages read the new files at once, its worker only after the extension is reloaded)
    const status = reply && reply.status;
    this.renderSuggestMessage(status === 'unsupported'
      ? ruleSuggestText('suggestRuleUnsupported', 'Open the popup on a website to build a rule from it.')
      : status === 'unknown'
        ? ruleSuggestText('suggestRuleOutdated', 'The extension was updated but its background part still runs the old version. Reload the extension in the browser\'s Extensions page and try again.')
        : ruleSuggestText('suggestRuleError', 'The page could not be read. Reload it and try again.'));
    return;
  }
  if (reply.host) this.setSuggestIntro(reply.host);
  const engine = new DetectionEngineManager();
  this.suggestCandidates = RuleSuggest.suggest(reply, this.suggestDetectors(), (detector, pageData) => engine.runDetector(detector, pageData));
  this.renderSuggestions();
};

Rules.prototype.renderSuggestMessage = function(text) {
  const list = document.querySelector('#suggestRuleList');
  if (!list) return;
  list.innerHTML = `<p class="sr-message" dir="auto">${FormatUtils.escapeHtml(text)}</p>`;
};

/** What a row's second line says: who already detects it, else how the new pattern will match it. */
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

Rules.prototype.renderSuggestions = function() {
  const list = document.querySelector('#suggestRuleList');
  if (!list) return;
  const esc = FormatUtils.escapeHtml;
  const attr = FormatUtils.escapeAttr;
  const candidates = this.suggestCandidates || [];
  list.innerHTML = RULE_SUGGEST_SECTIONS.map(({ kind, title, empty }) => {
    const rows = candidates.map((candidate, index) => ({ candidate, index })).filter(({ candidate }) => candidate.kind === kind);
    const headingId = `suggestRuleHead-${kind}`;
    const body = rows.length
      ? `<div class="rh-list" role="group" aria-labelledby="${attr(headingId)}">${rows.map(({ candidate, index }) => {
        const description = this.suggestRowDescription(candidate);
        const full = [candidate.value, ...candidate.sources.filter(source => source !== candidate.value)].join('\n');
        return `
          <label class="rh-row sr-row${candidate.matchedBy.length ? ' is-known' : ''}" title="${attr(full)}">
            <input type="checkbox" class="sr-check" data-index="${attr(String(index))}">
            <span class="rh-row-main">
              <span class="rh-row-value" dir="ltr">${esc(candidate.value)}</span>
              <span class="rh-row-desc" dir="auto">${esc(description)}</span>
            </span>
          </label>`;
      }).join('')}</div>`
      : `<p class="sr-empty" dir="auto">${esc(ruleSuggestText(empty[0], empty[1]))}</p>`;
    return `
      <section class="rh-section">
        <div class="rh-section-head">
          <span class="rh-section-title" id="${attr(headingId)}">${esc(ruleSuggestText(title[0], title[1]))}</span>
          <span class="rh-section-count">${esc(String(rows.length))}</span>
        </div>
        ${body}
      </section>`;
  }).join('');
  this.updateSuggestCreate();
};

/** The candidates ticked in the list, in list order. */
Rules.prototype.suggestPicked = function() {
  const candidates = this.suggestCandidates || [];
  return [...document.querySelectorAll('#suggestRuleList .sr-check:checked')]
    .map(box => candidates[Number(box.dataset.index)])
    .filter(Boolean);
};

Rules.prototype.updateSuggestCreate = function() {
  const create = document.querySelector('#createSuggestRule');
  if (create) create.disabled = this.suggestPicked().length === 0;
};

Rules.prototype.createRuleFromSuggestions = function() {
  const picked = this.suggestPicked();
  if (!picked.length) return;
  const nameInput = document.querySelector('#suggestRuleName');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    const error = document.querySelector('#suggestRuleNameError');
    if (error) {
      error.textContent = ruleSuggestText('suggestRuleNameMissing', 'Name the protection first.');
      error.hidden = false;
    }
    if (nameInput) { nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); }
    return;
  }
  const category = document.querySelector('#suggestRuleCategory')?.value || 'antibot';
  const template = this.newDetectorTemplate();
  const rule = RuleSuggest.buildRule({ id: template.id, name, category, candidates: picked, lastUpdated: template.lastUpdated });
  this._suggestModal.close();
  this.openEditModal(rule, category, rule.id, true);
  // Not saved yet: closing the editor asks before dropping the patterns it was opened with
  this.ruleEditorSnapshot = null;
  this.ruleEditorEdited = true;
};
