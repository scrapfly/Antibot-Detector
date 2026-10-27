/**
 * Rule editor → the header's Translate button, always there: the editor notices the texts of the rule that are not
 * translated into every language (the detector's description, each pattern's description, each combination's name) or
 * were rewritten in the UI language, shows how many on the button, and one click fills them, with Chrome's on-device
 * Translator (Chrome 138+; the text never leaves the browser). With nothing to do it says the rule is translated. The
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

/**
 * Texts the person rewrote in the UI language in this editor: their other languages (and the English original) still
 * say the old text. Each with what was typed and where its original and translations live.
 */
Rules.prototype.collectChangedTexts = function() {
  const locale = typeof Rules.uiLocale === 'function' ? Rules.uiLocale() : null;
  if (!locale) return [];
  const changed = [];
  const local = document.querySelector('#detectorDescriptionLocal');
  if (local && !local.hidden && local.dataset.edited && ruleTranslationClean(local.value)) {
    changed.push({ kind: 'detector', typed: ruleTranslationClean(local.value), local });
  }
  document.querySelectorAll('#editRuleModal .method-item[data-local-edited="1"]').forEach((item) => {
    let own = {};
    try { own = item.dataset.descriptionI18n ? JSON.parse(item.dataset.descriptionI18n) : {}; } catch (_) { own = {}; }
    if (ruleTranslationClean(own[locale])) changed.push({ kind: 'pattern', typed: ruleTranslationClean(own[locale]), item });
  });
  (this.combinationsModel || []).forEach((combo) => {
    const typed = combo.localEdited && combo.nameI18n ? ruleTranslationClean(combo.nameI18n[locale]) : '';
    if (typed) changed.push({ kind: 'combination', typed, combo });
  });
  return changed;
};

/**
 * "Translate the changes": what the person wrote in their language becomes the new English original (translated
 * into English) and every other language's translation (translated from that English, as the rest of the rule is).
 * Every translator is requested at once, while the click still lets Chrome start a download.
 */
Rules.prototype.translateChangedTexts = async function() {
  const button = document.querySelector('#ruleTranslateBtn');
  const locale = Rules.uiLocale();
  const changed = this.collectChangedTexts();
  if (!button || button.dataset.state === 'busy' || !locale || !changed.length || typeof Translator === 'undefined') return;
  const others = RULE_TRANSLATION_LOCALES.filter(code => code !== locale);
  const toEnglish = Translator.create({ sourceLanguage: ruleTranslatorCode(locale), targetLanguage: 'en' });
  const fromEnglish = new Map(others.map(code => [code, Translator.create({ sourceLanguage: 'en', targetLanguage: ruleTranslatorCode(code) })]));
  // Dropped when the editor closed or another rule opened meanwhile (see translateWholeRule)
  const editing = this.currentEditDetector;
  const stale = () => this.currentEditDetector !== editing;
  this.setTranslateButton('busy', changed.length);
  let filled = 0;
  let failed = 0;
  try {
    let english;
    try { english = await toEnglish; } catch (error) { english = null; Logger.debug('UI', 'No translator into English', error); }
    for (const entry of changed) {
      if (stale()) break;
      let original = '';
      try { original = english ? ruleTranslationClean(await english.translate(entry.typed)) : ''; } catch (_) { original = ''; }
      if (!original) { failed++; continue; }
      const map = { [locale]: entry.typed };
      for (const code of others) {
        try {
          const out = ruleTranslationClean(await (await fromEnglish.get(code)).translate(original));
          if (out) { map[code] = out; filled++; } else failed++;
        } catch (_) { failed++; }
      }
      if (stale()) break;
      this.storeChangedText(entry, original, map);
    }
  } finally {
    for (const pending of [toEnglish, ...fromEnglish.values()]) pending.then(t => t && t.destroy && t.destroy()).catch(() => {});
    if (!stale()) button.dataset.state = '';
  }
  if (stale()) return;
  if (typeof this.renderCombinations === 'function') this.renderCombinations();
  this.updateTranslationsCount(detectorTranslationsScope());
  this.reportTranslateResult(filled, failed);
  await this.refreshTranslateBar();
};

/** A rewritten text's new English original and its translations, where the editor keeps that kind of text. */
Rules.prototype.storeChangedText = function(entry, original, map) {
  if (entry.kind === 'detector') {
    const input = document.querySelector('#detectorDescriptionInput');
    if (input) input.value = original;
    detectorTranslationsScope()?.querySelectorAll('.rule-translation-input').forEach((field) => {
      field.value = map[field.dataset.locale] || '';
    });
    this.fillShippedPlaceholders(detectorTranslationsScope(), original);
    delete entry.local.dataset.edited;
    this.updateOriginalPreview(entry.local);
  } else if (entry.kind === 'pattern') {
    entry.item.dataset.description = original;
    entry.item.dataset.descriptionI18n = JSON.stringify(map);
    const inline = entry.item.querySelector('.method-description-inline');
    if (inline) inline.value = original;
    delete entry.item.dataset.localEdited;
  } else if (entry.kind === 'combination') {
    entry.combo.name = original;
    entry.combo.nameI18n = map;
    delete entry.combo.localEdited;
  }
};

Rules.prototype.planRuleTranslations = function() {
  return RuleTranslationPlan.plan(this.collectRuleTexts(), RULE_TRANSLATION_LOCALES, ruleShippedTranslation);
};

/** The header button in one of its states: missing (texts miss a language), changed, done, busy. */
Rules.prototype.setTranslateButton = function(state, count) {
  const button = document.querySelector('#ruleTranslateBtn');
  if (!button) return;
  const supported = typeof self !== 'undefined' && 'Translator' in self;
  const unavailable = ruleBarText('ruleTranslateUnavailable', 'Automatic translation needs Chrome 138 or newer.');
  const labels = {
    missing: ruleBarText('ruleTranslateBtnLabel', 'Translate'),
    changed: ruleBarText('ruleTranslateChangesShort', 'Translate changes'),
    done: ruleBarText('ruleTranslatedLabel', 'Translated'),
    busy: ruleBarText('ruleTranslateBusy', 'Translating…')
  };
  // Only the current state's text is built: the changed one names the UI language, which English has none of
  const titles = {
    missing: () => `${ruleBarText('ruleTranslateBarFmt', 'Texts not yet translated into every language: {0}', count)}\n${ruleBarText('ruleTranslateRuleHint', "Fills the missing translations of the description, the patterns and the combinations with Chrome's on-device translator. Check them before saving.")}`,
    changed: () => `${ruleBarText('ruleTranslateChangedFmt', 'Texts you changed in {0}: {1}. The other languages still show the old text.', ruleTranslationLanguageName(Rules.uiLocale()), count)}\n${ruleBarText('ruleTranslateChangesHint', 'Translates what you wrote into English (the original) and into the other languages, with the browser\'s on-device translator. Check them before saving.')}`,
    done: () => ruleBarText('ruleTranslateAllTranslatedFmt', 'Every text of this rule is translated into all {0} languages.', RULE_TRANSLATION_LOCALES.length),
    busy: () => ruleBarText('ruleTranslateRuleWorkingFmt', 'Translating {0} texts…', count)
  };
  button.dataset.state = state;
  const label = button.querySelector('#ruleTranslateLabel');
  if (label) label.textContent = labels[state];
  const badge = button.querySelector('#ruleTranslateBadge');
  const counted = (state === 'missing' || state === 'changed') && count > 0;
  if (badge) {
    badge.hidden = !counted;
    badge.textContent = counted ? String(count) : '';
  }
  const blocked = !supported && (state === 'missing' || state === 'changed');
  button.disabled = state === 'busy' || blocked;
  const title = titles[state]();
  button.title = blocked ? `${title}\n${unavailable}` : title;
  button.setAttribute('aria-label', counted ? `${labels[state]} (${count})` : labels[state]);
};

/** What the rule needs now, on the header button: texts rewritten in the UI language first, then texts missing a language. */
Rules.prototype.refreshTranslateBar = async function() {
  const button = document.querySelector('#ruleTranslateBtn');
  if (!button || button.dataset.state === 'busy') return;
  await this.loadRuleTranslationFiles();
  if (button.dataset.state === 'busy') return;
  const plan = this.planRuleTranslations();
  // Texts rewritten in the UI language come first: their other languages still say the old text
  const changed = this.collectChangedTexts();
  if (changed.length) this.setTranslateButton('changed', changed.length);
  else if (plan.texts) this.setTranslateButton('missing', plan.texts);
  else this.setTranslateButton('done', 0);
};

/** The header button's click: translate the changes, else fill what is missing, else say the rule is translated. */
Rules.prototype.onTranslateButton = function() {
  const button = document.querySelector('#ruleTranslateBtn');
  if (!button) return;
  const state = button.dataset.state;
  if (state === 'changed') this.translateChangedTexts();
  else if (state === 'missing') this.translateWholeRule();
  else if (state === 'done' && typeof NotificationHelper !== 'undefined') {
    NotificationHelper.info(ruleBarText('ruleTranslateAllTranslatedFmt', 'Every text of this rule is translated into all {0} languages.', RULE_TRANSLATION_LOCALES.length));
  }
};

/** A translation run ended: what it did, as a notice (the button shows what is left). */
Rules.prototype.reportTranslateResult = function(filled, failed) {
  if (typeof NotificationHelper === 'undefined') return;
  if (failed) NotificationHelper.warning(ruleBarText('ruleTranslateRulePartialFmt', 'Filled {0}; {1} could not be translated here.', filled, failed));
  else NotificationHelper.success(ruleBarText('ruleTranslateRuleDoneFmt', 'Filled {0} translations. Check them before saving.', filled));
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
  const button = document.querySelector('#ruleTranslateBtn');
  if (!button || button.dataset.state === 'busy') return;
  const plan = this.planRuleTranslations();
  if (!plan.texts) return;
  if (typeof Translator === 'undefined') return;
  const translators = new Map(plan.locales.map(locale => [locale, Translator.create({ sourceLanguage: 'en', targetLanguage: ruleTranslatorCode(locale) })]));
  const entries = new Map(this.collectRuleTexts().map(entry => [entry.id, entry]));
  // Translating takes a while: if the editor was closed or another rule opened meanwhile, what comes back is about a
  // rule no longer on screen and is dropped (as runLiveTest does)
  const editing = this.currentEditDetector;
  const stale = () => this.currentEditDetector !== editing;
  this.setTranslateButton('busy', plan.texts);
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
      if (stale()) break;
      try {
        const out = ruleTranslationClean(await translator.translate(job.text));
        if (stale()) break;
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
  // The editor that opened since then reset the bar (resetTranslateBar) and owns it now
  if (stale()) return;
  button.dataset.state = '';
  // The combinations are drawn from their model, and the description's count from its fields
  if (typeof this.renderCombinations === 'function') this.renderCombinations();
  this.updateTranslationsCount(detectorTranslationsScope());
  if (typeof this.refreshLocalFields === 'function') this.refreshLocalFields();
  this.reportTranslateResult(filled, failed);
  await this.refreshTranslateBar();
};

/** A new editor session starts without the last result. */
Rules.prototype.resetTranslateBar = function() {
  this.setTranslateButton('done', 0);
};

// The button follows the editing: one delegated listener, since the editor's fields are rebuilt each time it opens
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
    if (rules && event.target.closest && event.target.closest('#ruleTranslateBtn')) {
      rules.onTranslateButton();
      return;
    }
    if (event.target.closest && event.target.closest('#editRuleModal, #methodSettingsModal')) {
      // Whatever the click did to the rule (a pattern added or saved, a combination written) is read a moment later
      soon();
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.closest && event.target.closest('#editRuleModal, #methodSettingsModal')) soon();
  });
}
