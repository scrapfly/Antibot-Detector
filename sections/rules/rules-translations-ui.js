/**
 * Translations of a rule text: one field per extension language, saved in
 * the rule and shown instead of the text when the extension is in that
 * language. Pattern settings → Description → Translations (descriptionI18n)
 * and a combination's Name translations (nameI18n, rules-combinations.js).
 * "Translate automatically" fills the empty fields with Chrome's on-device
 * Translator (Chrome 138+); the text never leaves the browser.
 */
const RULE_TRANSLATION_LOCALES = (typeof RuleI18n !== 'undefined' && RuleI18n.LOCALES)
  || ['ar', 'cs', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'nl', 'pl', 'pt_BR', 'ru', 'sv', 'th', 'tr', 'uk', 'vi', 'zh_CN', 'zh_TW'];
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

/** Language code Chrome's Translator expects ("pt_BR" → "pt", "zh_CN" → "zh", "zh_TW" → "zh-Hant"). */
function ruleTranslatorCode(locale) {
  return locale === 'pt_BR' ? 'pt' : locale === 'zh_CN' ? 'zh' : locale === 'zh_TW' ? 'zh-Hant' : locale;
}

const ruleTranslationClean = (text) => String(text || '').replace(/\s+/g, ' ').trim();

/**
 * The fields of a Translations panel, one per language: the text's own
 * translations, and the one the extension ships greyed as a placeholder.
 * @param {string} idPrefix unique per panel (the inputs are labelled by id)
 */
Rules.translationRowsHtml = function(english, saved, idPrefix, { maxLength = 200, hide = null } = {}) {
  const own = saved && typeof saved === 'object' ? saved : {};
  const source = ruleTranslationClean(english);
  return RULE_TRANSLATION_LOCALES.map((locale) => {
    const id = `${idPrefix}-${locale}`;
    const value = typeof own[locale] === 'string' ? own[locale] : '';
    const shipped = source && typeof RuleI18n !== 'undefined' ? RuleI18n.t(source, locale) : '';
    const placeholder = shipped && shipped !== source ? shipped : '';
    const lang = locale.replace('_', '-');
    // `hide`: the UI language, whose translation is edited in the field itself
    return `<label class="rule-translation-row" for="${id}"${locale === hide ? ' hidden' : ''}>
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

/**
 * Editing in the UI language. Rule texts are written in English (the original, the key every translation hangs
 * on); in another language the editor shows each text in that language and saves what is typed there as its
 * translation, leaving the original alone. The original and the other languages stay one click away.
 */
/** The UI language as a rule-translation locale ('es', 'pt_BR'…), or null for English. */
Rules.uiLocale = function() {
  return typeof RuleI18n !== 'undefined' && typeof RuleI18n.current === 'function' ? RuleI18n.current() : null;
};

/** The translation the extension ships for a text in a locale, or ''. */
Rules.shippedText = function(english, locale) {
  const source = ruleTranslationClean(english);
  const shipped = source && locale && typeof RuleI18n !== 'undefined' ? ruleTranslationClean(RuleI18n.t(source, locale)) : '';
  return shipped && shipped !== source ? shipped : '';
};

/** What a text shows in a locale: the rule's own translation, the shipped one, else the original. */
Rules.shownText = function(english, own, locale) {
  const mine = locale && own && typeof own[locale] === 'string' ? ruleTranslationClean(own[locale]) : '';
  return mine || Rules.shippedText(english, locale) || ruleTranslationClean(english);
};

/**
 * The rule's own translations after `typed` was written in `locale`: kept as that language's translation, unless it
 * is the shipped translation or the original itself (nothing of the rule's own to keep then) or empty.
 * @returns {object} a new { locale: text } map
 */
Rules.withLocalEdit = function(english, own, locale, typed) {
  const map = { ...(own && typeof own === 'object' ? own : {}) };
  if (!locale) return map;
  const value = ruleTranslationClean(typed);
  if (!value || value === ruleTranslationClean(english) || value === Rules.shippedText(english, locale)) delete map[locale];
  else map[locale] = value;
  return map;
};

/**
 * Set up a description that has a field in the UI language (detector or pattern description): in English the
 * original is edited as before; in another language the localized field shows the text in that language (it writes
 * that language's row of the Translations panel), the English original is hidden and the Translations panel stays.
 * @param {HTMLTextAreaElement} local the field in the UI language (data-local-english, -scope, -original)
 */
Rules.prototype.setupLocalField = function(local) {
  if (!local) return;
  const english = document.getElementById(local.dataset.localEnglish);
  const scope = document.getElementById(local.dataset.localScope);
  const original = document.getElementById(local.dataset.localOriginal);
  const locale = Rules.uiLocale();
  local.hidden = !locale;
  // In another language the text is edited in that language, so the English original is not shown; its Translations
  // panel (Translate automatically, the other languages) stays, as in English
  if (original) {
    original.classList.toggle('is-plain', !locale);
    original.classList.toggle('is-local', !!locale);
    original.open = true;
  }
  const label = local.closest('.form-group, .modal-card')?.querySelector(`label[for="${local.dataset.localEnglish}"], label[for="${local.id}"]`);
  if (label) label.htmlFor = locale ? local.id : local.dataset.localEnglish;
  scope?.querySelectorAll('.rule-translation-row').forEach((row) => {
    row.hidden = !!locale && row.querySelector('.rule-translation-input')?.dataset.locale === locale;
  });
  if (!locale) return;
  local.lang = locale.replace('_', '-');
  local.dir = locale === 'ar' ? 'rtl' : 'auto';
  local.placeholder = english?.placeholder || '';
  local.dataset.edited = '';
  const show = () => {
    if (local.dataset.edited) return;
    const own = Rules.collectTranslations(scope);
    local.value = Rules.shownText(english?.value || '', own, locale);
    // What it says before any edit: typing it back is no change (collectChangedTexts)
    local.dataset.initial = local.value;
    this.updateOriginalPreview(local);
  };
  show();
  // The shipped translations may still be loading
  if (typeof RuleI18n !== 'undefined') RuleI18n.load(locale).then(show).catch(() => {});
};

/** Localized fields nobody typed in show what the Translations now hold (after an automatic translation). */
Rules.prototype.refreshLocalFields = function() {
  const locale = Rules.uiLocale();
  if (!locale) return;
  document.querySelectorAll('.rule-local-input').forEach((local) => {
    if (local.hidden || local.dataset.edited) return;
    const english = document.getElementById(local.dataset.localEnglish)?.value || '';
    local.value = Rules.shownText(english, Rules.collectTranslations(document.getElementById(local.dataset.localScope)), locale);
  });
};

/** The original's first words on the folded "Original (English)" line. */
Rules.prototype.updateOriginalPreview = function(local) {
  const english = document.getElementById(local.dataset.localEnglish);
  const preview = document.getElementById(local.dataset.localOriginal)?.querySelector('.rule-original-preview');
  if (preview) preview.textContent = ruleTranslationClean(english?.value || '');
};

/** Typed in the UI language: written to that language's row of the Translations panel, which Save collects. */
Rules.prototype.onLocalFieldInput = function(local) {
  const locale = Rules.uiLocale();
  const english = document.getElementById(local.dataset.localEnglish)?.value || '';
  const scope = document.getElementById(local.dataset.localScope);
  const row = scope?.querySelector(`.rule-translation-input[data-locale="${locale}"]`);
  local.dataset.edited = '1';
  if (row) row.value = Rules.withLocalEdit(english, {}, locale, local.value)[locale] || '';
  this.updateTranslationsCount(scope);
};

/** The original changed: a localized field nobody typed in follows it (its translation is looked up by the new text). */
Rules.prototype.onOriginalInput = function(englishInput) {
  const local = document.querySelector(`.rule-local-input[data-local-english="${englishInput.id}"]`);
  if (!local || local.hidden) return;
  this.updateOriginalPreview(local);
  if (local.dataset.edited) return;
  const scope = document.getElementById(local.dataset.localScope);
  local.value = Rules.shownText(englishInput.value, Rules.collectTranslations(scope), Rules.uiLocale());
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
  this.setupLocalField(document.querySelector('#methodDescriptionLocal'));
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
Rules.prototype.autoTranslateFields = function(getScope, sourceText, { needsText, onFill, onStatus, followsMethodItem = false } = {}) {
  const source = ruleTranslationClean(sourceText);
  // A translation that comes back after the editor closed, another rule opened, or (for a pattern's description)
  // Method Settings moved to another pattern belongs to what is no longer on screen: dropped
  const editing = this.currentEditDetector;
  const methodItem = this.currentMethodItem;
  const stale = () => this.currentEditDetector !== editing || (followsMethodItem && this.currentMethodItem !== methodItem);
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
      if (stale()) return;
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
    if (stale()) return;
    this.updateTranslationsCount(getScope());
    this.refreshLocalFields();
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
  this.setupLocalField(document.querySelector('#detectorDescriptionLocal'));
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
  return this.autoTranslateFields(methodTranslationsScope, document.querySelector('#methodDescriptionInput')?.value || '', { followsMethodItem: true });
};

/** The greyed shipped translations follow the description as it is edited (they are looked up by its text). */
Rules.prototype.refreshShippedPlaceholders = function() {
  this.fillShippedPlaceholders(methodTranslationsScope(), document.querySelector('#methodDescriptionInput')?.value || '');
};

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
      window.popupInstance.rules.onOriginalInput(event.target);
    }
    if (event.target.id === 'detectorDescriptionInput' && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.fillShippedPlaceholders(detectorTranslationsScope(), event.target.value);
      window.popupInstance.rules.onOriginalInput(event.target);
    }
    if (event.target.classList?.contains('rule-local-input') && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.onLocalFieldInput(event.target);
    }
  });
}
