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
  // A text counts when it differs from what it said before the first edit: typing it back (or deleting the change)
  // leaves nothing to translate
  const differs = (typed, initial) => !!typed && typed !== ruleTranslationClean(initial || '');
  if (local && !local.hidden && local.dataset.edited && differs(ruleTranslationClean(local.value), local.dataset.initial)) {
    changed.push({ kind: 'detector', typed: ruleTranslationClean(local.value), local });
  }
  document.querySelectorAll('#editRuleModal .method-item[data-local-edited="1"]').forEach((item) => {
    let own = {};
    try { own = item.dataset.descriptionI18n ? JSON.parse(item.dataset.descriptionI18n) : {}; } catch (_) { own = {}; }
    const typed = ruleTranslationClean(own[locale]);
    if (differs(typed, item.dataset.localInitial)) changed.push({ kind: 'pattern', typed, item });
  });
  (this.combinationsModel || []).forEach((combo) => {
    const typed = combo.localEdited && combo.nameI18n ? ruleTranslationClean(combo.nameI18n[locale]) : '';
    if (differs(typed, combo.localInitial)) changed.push({ kind: 'combination', typed, combo });
  });
  return changed;
};

/**
 * Translators for these language pairs ({ key, from, to } with locale codes). The browser downloads a language it does
 * not have yet only on a click, and only one per click (Chrome and Brave refuse the others with NotAllowedError, even
 * in the same click): the pairs it already has are created at once, plus the first one it still has to download. A
 * downloaded language stays, so each click brings one more until every language is ready.
 * @returns {Promise<{ translators: Map<string, Promise>, waiting: string[], downloading: string|null }>}
 */
Rules.prototype.ruleTranslators = async function(pairs) {
  // A Translator without availability() (an older build) is asked for every pair, as before
  const check = (pair) => typeof Translator.availability === 'function'
    ? Promise.resolve().then(() => Translator.availability({ sourceLanguage: ruleTranslatorCode(pair.from), targetLanguage: ruleTranslatorCode(pair.to) })).catch(() => 'unavailable')
    : Promise.resolve('available');
  const states = await Promise.all(pairs.map(check));
  const translators = new Map();
  const waiting = [];
  let downloading = null;
  pairs.forEach((pair, index) => {
    const state = states[index];
    if (state === 'unavailable') return;
    const ready = state === 'available';
    if (!ready && downloading) { waiting.push(pair.key); return; }
    if (!ready) downloading = pair.key;
    const pending = Translator.create({ sourceLanguage: ruleTranslatorCode(pair.from), targetLanguage: ruleTranslatorCode(pair.to) });
    pending.catch(() => {}); // a refusal is read where the translator is awaited
    translators.set(pair.key, pending);
  });
  return { translators, waiting, downloading };
};

/** The notice after a click that downloaded a language while others still wait for theirs. */
Rules.prototype.reportLanguageDownload = function(language, ready, total) {
  if (typeof NotificationHelper === 'undefined') return;
  NotificationHelper.info(ruleBarText('ruleTranslateDownloadedFmt', 'Downloaded {0}: {1} of {2} languages ready. The browser downloads each language once, one per click: click Translate again for the next.',
    ruleTranslationLanguageName(language), ready, total));
};

/**
 * "Translate the changes": what the person wrote in their language becomes the new English original (translated
 * into English) and every other language's translation (translated from that English, as the rest of the rule is).
 * Each click downloads one language the browser does not have yet (ruleTranslators); a text is applied only once all
 * of its languages are ready.
 */
Rules.prototype.translateChangedTexts = function() {
  return this.untilTranslated(() => this.translateChangedTextsNow());
};

/** Runs a translation; an unexpected error is logged and leaves the button usable instead of stuck on Translating. */
Rules.prototype.untilTranslated = async function(run) {
  try {
    await run();
  } catch (error) {
    Logger.warn('UI', 'Translating the rule failed', error);
    const button = document.querySelector('#ruleTranslateBtn');
    if (button && button.dataset.state === 'busy') button.dataset.state = '';
    await this.refreshTranslateBar();
  }
};

Rules.prototype.translateChangedTextsNow = async function() {
  const button = document.querySelector('#ruleTranslateBtn');
  const locale = Rules.uiLocale();
  const changed = this.collectChangedTexts();
  if (!button || button.dataset.state === 'busy' || !locale || !changed.length || typeof Translator === 'undefined') return;
  const others = RULE_TRANSLATION_LOCALES.filter(code => code !== locale);
  // Dropped when the editor closed or another rule opened meanwhile (see translateWholeRule)
  const editing = this.currentEditDetector;
  const stale = () => this.currentEditDetector !== editing;
  this.setTranslateButton('busy', changed.length);
  const { translators, waiting, downloading } = await this.ruleTranslators([
    { key: 'en', from: locale, to: 'en' },
    ...others.map(code => ({ key: code, from: 'en', to: code }))
  ]);
  const toEnglish = translators.get('en') || Promise.reject(new Error('English is not available'));
  toEnglish.catch(() => {});
  const fromEnglish = new Map(others.map(code => [code, translators.get(code) || Promise.reject(new Error(`${code} is not ready`))]));
  fromEnglish.forEach(pending => pending.catch(() => {}));
  if (waiting.length) {
    // Not every language is ready, so no text can be complete: this click downloads one more and stops there
    let ok = false;
    try { ok = !!(await translators.get(downloading)); } catch (error) { Logger.debug('UI', `Downloading ${downloading} failed`, error); }
    for (const pending of translators.values()) pending.then(t => t && t.destroy && t.destroy()).catch(() => {});
    if (stale()) return;
    button.dataset.state = '';
    const total = others.length + 1;
    if (ok) this.reportLanguageDownload(downloading, total - waiting.length, total);
    else if (typeof NotificationHelper !== 'undefined') NotificationHelper.warning(ruleBarText('ruleTranslateChangesKeptFmt', 'Could not translate {0} of {1} changed texts into every language here (the browser may still be downloading them). Nothing was lost: those texts are as they were. Try again in a moment.', changed.length, changed.length));
    await this.refreshTranslateBar();
    return;
  }
  let filled = 0;
  let kept = 0;
  try {
    let english;
    try { english = await toEnglish; } catch (error) { english = null; Logger.debug('UI', 'No translator into English', error); }
    for (const entry of changed) {
      if (stale()) break;
      let original = '';
      try { original = english ? ruleTranslationClean(await english.translate(entry.typed)) : ''; } catch (_) { original = ''; }
      const map = { [locale]: entry.typed };
      let complete = !!original;
      for (const code of complete ? others : []) {
        try {
          const out = ruleTranslationClean(await (await fromEnglish.get(code)).translate(original));
          if (out) map[code] = out; else complete = false;
        } catch (error) {
          complete = false;
          Logger.debug('UI', `Automatic translation to ${code} failed`, error);
        }
      }
      if (stale()) break;
      // All or nothing: a text whose languages could not all be translated keeps its original and every translation it
      // had (the browser may still be downloading a language), and stays counted for another try
      if (!complete) { kept++; continue; }
      this.storeChangedText(entry, original, map);
      filled += others.length + 1;
    }
  } finally {
    for (const pending of [toEnglish, ...fromEnglish.values()]) pending.then(t => t && t.destroy && t.destroy()).catch(() => {});
    if (!stale()) button.dataset.state = '';
  }
  if (stale()) return;
  if (typeof this.renderCombinations === 'function') this.renderCombinations();
  this.updateTranslationsCount(detectorTranslationsScope());
  if (kept && typeof NotificationHelper !== 'undefined') {
    NotificationHelper.warning(ruleBarText('ruleTranslateChangesKeptFmt', 'Could not translate {0} of {1} changed texts into every language here (the browser may still be downloading them). Nothing was lost: those texts are as they were. Try again in a moment.', kept, changed.length));
  } else {
    this.reportTranslateResult(filled, 0);
  }
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
    entry.local.dataset.initial = entry.local.value;
    this.updateOriginalPreview(entry.local);
  } else if (entry.kind === 'pattern') {
    entry.item.dataset.description = original;
    entry.item.dataset.descriptionI18n = JSON.stringify(map);
    const inline = entry.item.querySelector('.method-description-inline');
    if (inline) inline.value = original;
    delete entry.item.dataset.localEdited;
    delete entry.item.dataset.localInitial;
  } else if (entry.kind === 'combination') {
    entry.combo.name = original;
    entry.combo.nameI18n = map;
    delete entry.combo.localEdited;
    delete entry.combo.localInitial;
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
Rules.prototype.translateWholeRule = function() {
  return this.untilTranslated(() => this.translateWholeRuleNow());
};

Rules.prototype.translateWholeRuleNow = async function() {
  const button = document.querySelector('#ruleTranslateBtn');
  if (!button || button.dataset.state === 'busy') return;
  const plan = this.planRuleTranslations();
  if (!plan.texts) return;
  if (typeof Translator === 'undefined') return;
  const entries = new Map(this.collectRuleTexts().map(entry => [entry.id, entry]));
  // Translating takes a while: if the editor was closed or another rule opened meanwhile, what comes back is about a
  // rule no longer on screen and is dropped (as runLiveTest does)
  const editing = this.currentEditDetector;
  const stale = () => this.currentEditDetector !== editing;
  this.setTranslateButton('busy', plan.texts);
  // The languages the browser has, plus one it downloads on this click; the others wait for the next clicks
  const { translators, waiting, downloading } = await this.ruleTranslators(plan.locales.map(locale => ({ key: locale, from: 'en', to: locale })));
  let filled = 0;
  let failed = 0;
  await Promise.all(plan.locales.filter(locale => translators.has(locale)).map(async (locale) => {
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
  if (waiting.length && downloading && translators.has(downloading)) {
    let ok = false;
    try { ok = !!(await translators.get(downloading)); } catch (_) { ok = false; }
    const total = plan.locales.length;
    if (ok) this.reportLanguageDownload(downloading, total - waiting.length, total);
    else this.reportTranslateResult(filled, failed);
  } else {
    this.reportTranslateResult(filled, failed);
  }
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
