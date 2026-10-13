/**
 * Pattern settings → Description → Translations: one field per extension
 * language, saved in the rule (descriptionI18n) and shown instead of the
 * description when the extension is in that language. "Translate
 * automatically" fills the empty fields with Chrome's on-device Translator
 * (Chrome 138+); the text never leaves the browser.
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

Rules.prototype.renderDescriptionTranslations = function(methodItem) {
  const host = document.querySelector('#methodTranslationFields');
  if (!host) return;
  let saved = {};
  try { saved = methodItem?.dataset.descriptionI18n ? JSON.parse(methodItem.dataset.descriptionI18n) : {}; } catch (_) { saved = {}; }
  // An official text already has a shipped translation: shown greyed until you write your own
  const english = methodItem?.dataset.description || '';
  host.innerHTML = RULE_TRANSLATION_LOCALES.map((locale) => {
    const id = `methodTranslation-${locale}`;
    const value = typeof saved[locale] === 'string' ? saved[locale] : '';
    const shipped = english && typeof RuleI18n !== 'undefined' ? RuleI18n.t(english, locale) : '';
    const placeholder = shipped && shipped !== english ? shipped : '';
    const dir = locale === 'ar' ? 'rtl' : 'auto';
    return `<label class="rule-translation-row" for="${id}">
      <span class="rule-translation-lang" lang="${locale.replace('_', '-')}">${FormatUtils.escapeHtml(ruleTranslationLanguageName(locale))}</span>
      <input type="text" id="${id}" class="input-field rule-translation-input" data-locale="${locale}" maxlength="200" dir="${dir}"
        lang="${locale.replace('_', '-')}" value="${FormatUtils.escapeAttr(value)}" placeholder="${FormatUtils.escapeAttr(placeholder)}">
    </label>`;
  }).join('');
  // Placeholders for the languages whose file is not loaded yet
  if (english && typeof RuleI18n !== 'undefined') {
    host.querySelectorAll('.rule-translation-input').forEach((input) => {
      const locale = input.dataset.locale;
      RuleI18n.load(locale).then(() => {
        const shipped = RuleI18n.t(english, locale);
        if (shipped && shipped !== english && !input.placeholder) input.placeholder = shipped;
        this.updateTranslationsCount();
      }).catch(() => {});
    });
  }
  const status = document.querySelector('#methodTranslateStatus');
  if (status) status.textContent = '';
  const details = document.querySelector('#methodDescriptionTranslations');
  if (details) details.open = Object.keys(saved).length > 0 && details.open;
  this.updateTranslationsCount();
  this.updateAutoTranslateButton();
};

/** { locale: text } for the filled fields. */
Rules.prototype.collectDescriptionTranslations = function() {
  const out = {};
  document.querySelectorAll('#methodTranslationFields .rule-translation-input').forEach((input) => {
    const value = input.value.replace(/\s+/g, ' ').trim();
    if (value) out[input.dataset.locale] = value;
  });
  return out;
};

Rules.prototype.updateTranslationsCount = function() {
  const count = document.querySelector('#methodTranslationsCount');
  if (!count) return;
  // A language counts when it has a translation: one typed here, or the one
  // the extension ships for this text (shown greyed in its field)
  const filled = [...document.querySelectorAll('#methodTranslationFields .rule-translation-input')]
    .filter(input => input.value.trim() || input.placeholder).length;
  count.textContent = ruleTranslateText('ruleTranslationsCountFmt', '{0} of {1}', filled, RULE_TRANSLATION_LOCALES.length);
};

Rules.prototype.updateAutoTranslateButton = function() {
  const button = document.querySelector('#methodTranslateAutoBtn');
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
 */
Rules.prototype.autoTranslateDescription = function() {
  const source = (document.querySelector('#methodDescriptionInput')?.value || '').replace(/\s+/g, ' ').trim();
  const status = document.querySelector('#methodTranslateStatus');
  const button = document.querySelector('#methodTranslateAutoBtn');
  const say = (text) => { if (status) status.textContent = text; };
  if (!source) { say(ruleTranslateText('ruleTranslateNeedsText', 'Write the description first.')); return Promise.resolve(); }
  if (typeof Translator === 'undefined') { say(ruleTranslateText('ruleTranslateUnavailable', 'Automatic translation needs Chrome 138 or newer.')); return Promise.resolve(); }
  const missing = [...document.querySelectorAll('#methodTranslationFields .rule-translation-input')]
    .filter(input => !input.value.trim() && !input.placeholder);
  if (missing.length === 0) {
    say(ruleTranslateText('ruleTranslateAllDone', 'Every language already has a translation.'));
    return Promise.resolve();
  }
  // Rule texts are written in English; a text in another language is handled below
  const from = 'en';
  const jobs = missing.map((input) => {
    const to = ruleTranslatorCode(input.dataset.locale);
    // Started now, while the click still counts
    const created = to === from ? Promise.resolve(null) : Translator.create({ sourceLanguage: from, targetLanguage: to });
    return { input, to, created };
  });
  if (button) button.disabled = true;
  say(ruleTranslateText('ruleTranslateWorkingFmt', 'Translating: {0}', jobs.map(j => ruleTranslationLanguageName(j.input.dataset.locale)).join(', ')));
  let filled = 0, failed = 0;
  return Promise.all(jobs.map(async ({ input, to, created }) => {
    try {
      const translator = await created;
      input.value = translator ? (await translator.translate(source)).trim() : source;
      if (translator && typeof translator.destroy === 'function') translator.destroy();
      filled++;
    } catch (error) {
      failed++;
      Logger.debug('UI', `Automatic translation to ${to} failed`, error);
    }
    this.updateTranslationsCount();
  })).then(() => {
    if (button) button.disabled = false;
    this.updateTranslationsCount();
    say(failed
      ? ruleTranslateText('ruleTranslateDonePartialFmt', 'Filled {0}; {1} could not be translated here.', filled, failed)
      : ruleTranslateText('ruleTranslateDoneFmt', 'Filled {0} languages. Check them before saving.', filled));
  });
};

/** The greyed shipped translations follow the description as it is edited (they are looked up by its text). */
Rules.prototype.refreshShippedPlaceholders = function() {
  const english = (document.querySelector('#methodDescriptionInput')?.value || '').replace(/\s+/g, ' ').trim();
  document.querySelectorAll('#methodTranslationFields .rule-translation-input').forEach((input) => {
    const shipped = english && typeof RuleI18n !== 'undefined' ? RuleI18n.t(english, input.dataset.locale) : '';
    input.placeholder = shipped && shipped !== english ? shipped : '';
  });
  this.updateTranslationsCount();
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
    if (event.target.closest && event.target.closest('#methodTranslateAutoBtn') && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.autoTranslateDescription();
    }
  });
  document.addEventListener('input', (event) => {
    if (event.target.classList && event.target.classList.contains('rule-translation-input') && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.updateTranslationsCount();
    }
    if (event.target.id === 'methodDescriptionInput' && typeof window !== 'undefined' && window.popupInstance?.rules) {
      window.popupInstance.rules.refreshShippedPlaceholders();
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
