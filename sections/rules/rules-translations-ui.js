/**
 * Translations of a rule text: one field per extension language, saved in
 * the rule and shown instead of the text when the extension is in that
 * language. Pattern settings → Description → Translations (descriptionI18n)
 * and a combination's Name translations (nameI18n, rules-combinations.js).
 * "Translate automatically" fills the empty fields with Chrome's on-device
 * Translator (Chrome 138+); the text never leaves the browser.
 */
const RULE_TRANSLATION_LOCALES = (typeof RuleI18n !== 'undefined' && RuleI18n.LOCALES)
  || ['ar', 'de', 'es', 'fr', 'hi', 'it', 'ja', 'ko', 'pt_BR', 'ru', 'zh_CN'];
const ruleTranslateText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);

/** "Español", "Deutsch"…: each language in its own name. */
function ruleTranslationLanguageName(locale) {
  const tag = locale.replace('_', '-');
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag);
    return name ? name.charAt(0).toLocaleUpperCase(tag) + name.slice(1) : locale;
  } catch (_) {
    return locale;
  }
}

/** Language code Chrome's Translator expects ("pt_BR" → "pt", "zh_CN" → "zh"). */
function ruleTranslatorCode(locale) {
  return locale === 'pt_BR' ? 'pt' : locale === 'zh_CN' ? 'zh' : locale;
}

const ruleTranslationClean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

/**
 * The fields of a Translations panel, one per language: the text's own
 * translations, and the one the extension ships greyed as a placeholder.
 * @param {string} idPrefix unique per panel (the inputs are labelled by id)
 */
Rules.translationRowsHtml = function(english, saved, idPrefix, { maxLength = 200 } = {}) {
  const own = saved && typeof saved === 'object' ? saved : {};
  const source = ruleTranslationClean(english);
  return RULE_TRANSLATION_LOCALES.map((locale) => {
    const id = `${idPrefix}-${locale}`;
    const value = typeof own[locale] === 'string' ? own[locale] : '';
    const shipped = source && typeof RuleI18n !== 'undefined' ? RuleI18n.t(source, locale) : '';
    const placeholder = shipped && shipped !== source ? shipped : '';
    const lang = locale.replace('_', '-');
    return `<label class="rule-translation-row" for="${id}">
      <span class="rule-translation-lang" lang="${lang}">${FormatUtils.escapeHtml(ruleTranslationLanguageName(locale))}</span>
      <textarea id="${id}" class="input-field rule-translation-input" data-locale="${locale}" rows="1" maxlength="${maxLength}" dir="${locale === 'ar' ? 'rtl' : 'auto'}"
        lang="${lang}" placeholder="${FormatUtils.escapeAttr(placeholder)}">${FormatUtils.escapeHtml(value)}</textarea>
    </label>`;
  }).join('');
};

/** { locale: text } for the filled fields of a Translations panel. */
Rules.collectTranslations = function(scope) {
  const out = {};
  (scope ? [...scope.querySelectorAll('.rule-translation-input')] : []).forEach((input) => {
    const value = ruleTranslationClean(input.value);
    if (value) out[input.dataset.locale] = value;
  });
  return out;
};

const methodTranslationsScope = () => document.querySelector('#methodDescriptionTranslations');

Rules.prototype.renderDescriptionTranslations = function(methodItem) {
  const host = document.querySelector('#methodTranslationFields');
  if (!host) return;
  let saved = {};
  try { saved = methodItem?.dataset.descriptionI18n ? JSON.parse(methodItem.dataset.descriptionI18n) : {}; } catch (_) { saved = {}; }
  // An official text already has a shipped translation: shown greyed until you write your own
  host.innerHTML = Rules.translationRowsHtml(methodItem?.dataset.description || '', saved, 'methodTranslation');
  const scope = methodTranslationsScope();
  this.fillShippedPlaceholders(scope, methodItem?.dataset.description || '', { load: true });
  const status = scope?.querySelector('.rule-translations-status');
  if (status) status.textContent = '';
  if (scope) scope.open = Object.keys(saved).length > 0 && scope.open;
  this.updateAutoTranslateButton(scope);
};

/** { locale: text } for the filled fields. */
Rules.prototype.collectDescriptionTranslations = function() {
  return Rules.collectTranslations(methodTranslationsScope());
};

/**
 * The greyed shipped translations of a panel, looked up by the text as it is
 * now; `load` first reads the languages whose file is not loaded yet.
 */
Rules.prototype.fillShippedPlaceholders = function(scope, english, { load = false } = {}) {
  if (!scope) return;
  const source = ruleTranslationClean(english);
  scope.querySelectorAll('.rule-translation-input').forEach((input) => {
    const locale = input.dataset.locale;
    const apply = () => {
      const shipped = source && typeof RuleI18n !== 'undefined' ? RuleI18n.t(source, locale) : '';
      input.placeholder = shipped && shipped !== source ? shipped : '';
    };
    apply();
    if (load && source && typeof RuleI18n !== 'undefined') {
      RuleI18n.load(locale).then(() => { apply(); this.updateTranslationsCount(scope); }).catch(() => {});
    }
  });
  this.updateTranslationsCount(scope);
};

Rules.prototype.updateTranslationsCount = function(scope = methodTranslationsScope()) {
  const count = scope?.querySelector('.rule-translations-count');
  if (!count) return;
  // A language counts when it has a translation: one typed here, or the one
  // the extension ships for this text (shown greyed in its field)
  const filled = [...scope.querySelectorAll('.rule-translation-input')]
    .filter(input => input.value.trim() || input.placeholder).length;
  count.textContent = ruleTranslateText('ruleTranslationsCountFmt', '{0} of {1}', filled, RULE_TRANSLATION_LOCALES.length);
  count.classList.toggle('is-complete', filled === RULE_TRANSLATION_LOCALES.length);
  count.classList.toggle('is-empty', filled === 0);
};

Rules.prototype.updateAutoTranslateButton = function(scope = methodTranslationsScope()) {
  const button = scope?.querySelector('[data-rule-translate]');
  if (!button) return;
  const supported = typeof self !== 'undefined' && 'Translator' in self;
  button.disabled = !supported;
  button.title = supported ? '' : ruleTranslateText('ruleTranslateUnavailable', 'Automatic translation needs Chrome 138 or newer.');
};

/**
 * "Translate automatically": fills the languages that have no translation
 * yet, neither typed here nor shipped with the extension, with Chrome's
 * on-device Translator (Chrome 138+; the text never leaves the browser).
 *
 * Chrome lets a page start a language model download only right after a
 * click, so every translator is requested at once, before anything is
 * awaited: requested one after another, only the first got through and the
 * others failed once the click had expired.
 *
 * @param {() => Element|null} getScope the panel; looked up again after each
 *   await, since a combination's panel is redrawn while it translates
 * @param {{needsText?: string, onFill?: Function, onStatus?: Function}} [options]
 *   onFill(locale, text) for each translation, onStatus(text, busy) for the progress
 */
Rules.prototype.autoTranslateFields = function(getScope, sourceText, { needsText, onFill, onStatus } = {}) {
  const source = ruleTranslationClean(sourceText);
  const say = (text, busy) => {
    const scope = getScope();
    const status = scope?.querySelector('.rule-translations-status');
    if (status) status.textContent = text;
    const button = scope?.querySelector('[data-rule-translate]');
    if (button) button.disabled = busy;
    if (onStatus) onStatus(text, busy);
  };
  if (!source) { say(needsText || ruleTranslateText('ruleTranslateNeedsText', 'Write the description first.'), false); return Promise.resolve(); }
  if (typeof Translator === 'undefined') { say(ruleTranslateText('ruleTranslateUnavailable', 'Automatic translation needs Chrome 138 or newer.'), false); return Promise.resolve(); }
  const scope = getScope();
  const missing = (scope ? [...scope.querySelectorAll('.rule-translation-input')] : [])
    .filter(input => !input.value.trim() && !input.placeholder);
  if (missing.length === 0) {
    say(ruleTranslateText('ruleTranslateAllDone', 'Every language already has a translation.'), false);
    return Promise.resolve();
  }
  // Rule texts are written in English, like the official ones
  const from = 'en';
  const jobs = missing.map((input) => {
    const locale = input.dataset.locale;
    const to = ruleTranslatorCode(locale);
    // Started now, while the click still counts
    const created = to === from ? Promise.resolve(null) : Translator.create({ sourceLanguage: from, targetLanguage: to });
    return { locale, to, created };
  });
  say(ruleTranslateText('ruleTranslateWorkingFmt', 'Translating: {0}', jobs.map(j => ruleTranslationLanguageName(j.locale)).join(', ')), true);
  let filled = 0, failed = 0;
  return Promise.all(jobs.map(async ({ locale, to, created }) => {
    try {
      const translator = await created;
      const text = translator ? (await translator.translate(source)).trim() : source;
      if (translator && typeof translator.destroy === 'function') translator.destroy();
      const input = getScope()?.querySelector(`.rule-translation-input[data-locale="${locale}"]`);
      if (input) input.value = text;
      if (onFill) onFill(locale, text);
      filled++;
    } catch (error) {
      failed++;
      Logger.debug('UI', `Automatic translation to ${to} failed`, error);
    }
    this.updateTranslationsCount(getScope());
  })).then(() => {
    this.updateTranslationsCount(getScope());
    say(failed
      ? ruleTranslateText('ruleTranslateDonePartialFmt', 'Filled {0}; {1} could not be translated here.', filled, failed)
      : ruleTranslateText('ruleTranslateDoneFmt', 'Filled {0} languages. Check them before saving.', filled), false);
  });
};

// The detector's own description (Detector Information → Description):
// longer than a pattern's, and its translations a little longer still
const DETECTOR_DESCRIPTION_MAX = 300;
const DETECTOR_TRANSLATION_MAX = 400;
const detectorTranslationsScope = () => document.querySelector('#detectorDescriptionTranslations');
const detectorDescriptionInput = () => document.querySelector('#detectorDescriptionInput');

/** Fill Detector Information → Description and its Translations from a detector. */
Rules.prototype.renderDetectorDescription = function(detector) {
  const input = detectorDescriptionInput();
  const host = document.querySelector('#detectorTranslationFields');
  if (!input || !host) return;
  const description = typeof detector?.description === 'string' ? detector.description : '';
  const saved = detector?.descriptionI18n && typeof detector.descriptionI18n === 'object' && !Array.isArray(detector.descriptionI18n)
    ? detector.descriptionI18n : {};
  input.maxLength = Math.max(DETECTOR_DESCRIPTION_MAX, description.length);
  input.value = description;
  host.innerHTML = Rules.translationRowsHtml(description, saved, 'detectorTranslation', { maxLength: DETECTOR_TRANSLATION_MAX });
  const scope = detectorTranslationsScope();
  this.fillShippedPlaceholders(scope, description, { load: true });
  const status = scope?.querySelector('.rule-translations-status');
  if (status) status.textContent = '';
  if (scope) scope.open = Object.keys(saved).length > 0;
  this.updateAutoTranslateButton(scope);
};

/**
 * The description to save and its translations; translations belong to the
 * text they translate, so there are none without a description.
 * @returns {{description: string, descriptionI18n: object}}
 */
Rules.prototype.collectDetectorDescription = function() {
  const description = ruleTranslationClean(detectorDescriptionInput()?.value);
  return { description, descriptionI18n: description ? Rules.collectTranslations(detectorTranslationsScope()) : {} };
};

/** Detector Information → Description → Translations → Translate automatically. */
Rules.prototype.autoTranslateDetectorDescription = function() {
  return this.autoTranslateFields(detectorTranslationsScope, detectorDescriptionInput()?.value || '');
};

/** Pattern settings → Description → Translations → Translate automatically. */
Rules.prototype.autoTranslateDescription = function() {
  return this.autoTranslateFields(methodTranslationsScope, document.querySelector('#methodDescriptionInput')?.value || '');
};

/** The greyed shipped translations follow the description as it is edited (they are looked up by its text). */
Rules.prototype.refreshShippedPlaceholders = function() {
  this.fillShippedPlaceholders(methodTranslationsScope(), document.querySelector('#methodDescriptionInput')?.value || '');
};

/**
 * An editable rule text (a pattern description or a combination name) shown
 * in the UI language: the field shows the translation, and switches to the
 * text itself while it is being edited, so a save never stores a translation
 * in place of the original.
 * @returns {{shown: string, attrs: string}} the text to show and the attributes for the field
 */
Rules.localizedEditable = function(text, map) {
  const source = String(text || '');
  const shown = source && typeof FormatUtils !== 'undefined' ? FormatUtils.ruleText(source, map) : source;
  if (!source || shown === source) return { shown: source, attrs: '' };
  const attr = FormatUtils.escapeAttr;
  return { shown, attrs: ` data-i18n-source="${attr(source)}" data-i18n-shown="${attr(shown)}" data-i18n-showing="1"` };
};

const ruleEditableText = (el) => (el.isContentEditable ? el.textContent : el.value);
const setRuleEditableText = (el, text) => { if (el.isContentEditable) el.textContent = text; else el.value = text; };

// One delegated listener: the fields are rebuilt each time the dialog opens
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('click', (event) => {
    if (event.target.closest && event.target.closest('[data-rule-translate="description"]') && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.autoTranslateDescription();
    }
    if (event.target.closest && event.target.closest('[data-rule-translate="detector-description"]') && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.autoTranslateDetectorDescription();
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.classList && event.target.classList.contains('rule-translation-input') && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.updateTranslationsCount(event.target.closest('.rule-translations'));
    }
    if (event.target.id === 'methodDescriptionInput' && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.refreshShippedPlaceholders();
    }
    if (event.target.id === 'detectorDescriptionInput' && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.fillShippedPlaceholders(detectorTranslationsScope(), event.target.value);
    }
  });
  // Translated rule texts: the original while editing, the translation again if left unchanged
  document.addEventListener('focusin', (event) => {
    const el = event.target.closest?.('[data-i18n-source]');
    if (!el || el.dataset.i18nShowing !== '1') return;
    el.dataset.i18nShowing = '0';
    setRuleEditableText(el, el.dataset.i18nSource);
  });
  document.addEventListener('focusout', (event) => {
    const el = event.target.closest?.('[data-i18n-source]');
    if (!el || el.dataset.i18nShowing !== '0') return;
    if (ruleEditableText(el).replace(/\s+/g, ' ').trim() === el.dataset.i18nSource.replace(/\s+/g, ' ').trim()) {
      el.dataset.i18nShowing = '1';
      setRuleEditableText(el, el.dataset.i18nShown);
    } else {
      // Edited: the field now shows what was typed (a new text has no translation)
      delete el.dataset.i18nSource;
      delete el.dataset.i18nShown;
      delete el.dataset.i18nShowing;
    }
  });
}
