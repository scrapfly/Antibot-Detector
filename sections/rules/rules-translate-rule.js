/**
 * Rule editor → "Translate the rule": the editor notices the texts of the rule that are not translated into every
 * language (the detector's description, each pattern's description, each combination's name) and offers one button that
 * fills what is missing, with Chrome's on-device Translator (Chrome 138+; the text never leaves the browser). The
 * per-text "Translate automatically" buttons stay for one text at a time.
 *
 * What is missing is decided by RuleTranslationPlan from the rule as it is in the editor now (unsaved edits included),
 * counting a language as covered when the text has a translation typed in the rule or one the extension ships. The
 * fills go where the editor keeps each kind of text, so Save stores them like typed ones: the Translations fields of
 * the description, the pattern's description translations, the combination's name translations.
 */
const ruleBarText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);

/** The translatable texts of the rule as the editor holds them now, each with its translations and where to put a new one. */
Rules.prototype.collectRuleTexts = function() {
  const texts = [];
  const description = document.querySelector('#detectorDescriptionInput');
  if (description) texts.push({ id: 'detector', kind: 'detector', text: description.value, own: Rules.collectTranslations(detectorTranslationsScope()) });
  document.querySelectorAll('#editRuleModal .method-item').forEach((item, index) => {
    let own = {};
    try { own = item.dataset.descriptionI18n ? JSON.parse(item.dataset.descriptionI18n) : {}; } catch (_) { own = {}; }
    texts.push({ id: `pattern:${item.dataset.patternId || index}`, kind: 'pattern', text: item.dataset.description || '', own, item });
  });
  (this.combinationsModel || []).forEach((combo) => {
    texts.push({ id: `combination:${combo.id}`, kind: 'combination', text: combo.name || '', own: combo.nameI18n || {}, combo });
  });
  return texts;
};

/** The translation the extension ships for a text, or '' when it ships none (the files must be loaded: loadRuleTranslationFiles). */
const ruleShippedTranslation = (source, locale) => {
  const shipped = typeof RuleI18n !== 'undefined' ? RuleI18n.t(source, locale) : '';
  return shipped && shipped !== source ? shipped : '';
};

/** The shipped translation files, read once: a language counts as covered only when its file has been looked at. */
Rules.prototype.loadRuleTranslationFiles = function() {
  if (!this._ruleTranslationFiles) {
    this._ruleTranslationFiles = typeof RuleI18n === 'undefined'
      ? Promise.resolve([])
      : Promise.all(RuleI18n.LOCALES.map(locale => RuleI18n.load(locale).catch(() => false)));
  }
  return this._ruleTranslationFiles;
};

Rules.prototype.planRuleTranslations = function() {
  return RuleTranslationPlan.plan(this.collectRuleTexts(), RULE_TRANSLATION_LOCALES, ruleShippedTranslation);
};

/** The bar above the editor: how many texts miss a language, and the button. Hidden when nothing is missing. */
Rules.prototype.refreshTranslateBar = async function() {
  const bar = document.querySelector('#ruleTranslateBar');
  if (!bar || bar.dataset.busy === '1') return;
  await this.loadRuleTranslationFiles();
  const plan = this.planRuleTranslations();
  const status = this._ruleTranslateResult;
  const supported = typeof self !== 'undefined' && 'Translator' in self;
  bar.hidden = plan.texts === 0 && !status;
  const text = bar.querySelector('#ruleTranslateText');
  if (text) text.textContent = plan.texts ? ruleBarText('ruleTranslateBarFmt', 'Texts not yet translated into every language: {0}', plan.texts) : (status || '');
  const button = bar.querySelector('#ruleTranslateAllBtn');
  if (button) {
    button.hidden = plan.texts === 0;
    button.disabled = !supported;
    button.title = supported
      ? ruleBarText('ruleTranslateRuleHint', "Fills the missing translations of the description, the patterns and the combinations with Chrome's on-device translator. Check them before saving.")
      : ruleBarText('ruleTranslateUnavailable', 'Automatic translation needs Chrome 138 or newer.');
  }
};

/** Put one translation where the editor keeps that kind of text. */
Rules.prototype.storeRuleTranslation = function(entry, locale, text) {
  if (entry.kind === 'detector') {
    const input = detectorTranslationsScope()?.querySelector(`.rule-translation-input[data-locale="${locale}"]`);
    if (input) input.value = text;
  } else if (entry.kind === 'pattern') {
    entry.item.dataset.descriptionI18n = JSON.stringify({ ...entry.own, [locale]: text });
    entry.own = { ...entry.own, [locale]: text };
  } else if (entry.kind === 'combination') {
    this.setComboNameTranslation(entry.combo, locale, text);
  }
};

/**
 * "Translate the rule". Chrome lets a page start a language model download only right after a click, so a translator
 * for every language that is missing is requested at once, before anything is awaited.
 */
Rules.prototype.translateWholeRule = async function() {
  const bar = document.querySelector('#ruleTranslateBar');
  if (!bar || bar.dataset.busy === '1') return;
  const plan = this.planRuleTranslations();
  if (!plan.texts) return;
  if (typeof Translator === 'undefined') return;
  const translators = new Map(plan.locales.map(locale => [locale, Translator.create({ sourceLanguage: 'en', targetLanguage: ruleTranslatorCode(locale) })]));
  const entries = new Map(this.collectRuleTexts().map(entry => [entry.id, entry]));
  const button = bar.querySelector('#ruleTranslateAllBtn');
  const text = bar.querySelector('#ruleTranslateText');
  bar.dataset.busy = '1';
  if (button) button.disabled = true;
  if (text) text.textContent = ruleBarText('ruleTranslateRuleWorkingFmt', 'Translating {0} texts…', plan.texts);
  let filled = 0;
  let failed = 0;
  await Promise.all(plan.locales.map(async (locale) => {
    let translator;
    try {
      translator = await translators.get(locale);
    } catch (error) {
      failed += plan.jobs.filter(job => job.missing.includes(locale)).length;
      Logger.debug('UI', `Automatic translation to ${locale} is not available`, error);
      return;
    }
    for (const job of plan.jobs.filter(item => item.missing.includes(locale))) {
      try {
        const out = ruleTranslationClean(await translator.translate(job.text));
        if (!out) { failed++; continue; }
        this.storeRuleTranslation(entries.get(job.id), locale, out);
        filled++;
      } catch (error) {
        failed++;
        Logger.debug('UI', `Automatic translation to ${locale} failed`, error);
      }
    }
    if (translator && typeof translator.destroy === 'function') translator.destroy();
  }));
  delete bar.dataset.busy;
  // The combinations are drawn from their model, and the description's count from its fields
  if (typeof this.renderCombinations === 'function') this.renderCombinations();
  this.updateTranslationsCount(detectorTranslationsScope());
  this._ruleTranslateResult = failed
    ? ruleBarText('ruleTranslateRulePartialFmt', 'Filled {0}; {1} could not be translated here.', filled, failed)
    : ruleBarText('ruleTranslateRuleDoneFmt', 'Filled {0} translations. Check them before saving.', filled);
  await this.refreshTranslateBar();
};

/** A new editor session starts without the last result. */
Rules.prototype.resetTranslateBar = function() {
  this._ruleTranslateResult = '';
  const bar = document.querySelector('#ruleTranslateBar');
  if (bar) { bar.hidden = true; delete bar.dataset.busy; }
};

// The bar follows the editing: one delegated listener, since the editor's fields are rebuilt each time it opens
if (typeof document !== 'undefined' && document.addEventListener) {
  let timer = null;
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const rules = typeof window !== 'undefined' && window.popupInstance && window.popupInstance.rules;
      const open = document.querySelector('#editRuleModal');
      if (rules && open && open.style.display !== 'none') rules.refreshTranslateBar();
    }, 300);
  };
  document.addEventListener('click', (event) => {
    const rules = typeof window !== 'undefined' && window.popupInstance && window.popupInstance.rules;
    if (rules && event.target.closest && event.target.closest('#ruleTranslateAllBtn')) {
      rules.translateWholeRule();
      return;
    }
    if (event.target.closest && event.target.closest('#editRuleModal, #methodSettingsModal')) {
      // Whatever the click did to the rule (a pattern added or saved, a combination written) is read a moment later
      if (rules) rules._ruleTranslateResult = '';
      soon();
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.closest && event.target.closest('#editRuleModal, #methodSettingsModal')) soon();
  });
}
