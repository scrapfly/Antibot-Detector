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
  const filled = Object.keys(this.collectDescriptionTranslations()).length;
  count.textContent = ruleTranslateText('ruleTranslationsCountFmt', '{0} of {1}', filled, RULE_TRANSLATION_LOCALES.length);
};

Rules.prototype.updateAutoTranslateButton = function() {
  const button = document.querySelector('#methodTranslateAutoBtn');
  if (!button) return;
  const supported = typeof self !== 'undefined' && 'Translator' in self;
  button.disabled = !supported;
  button.title = supported ? '' : ruleTranslateText('ruleTranslateUnavailable', 'Automatic translation needs Chrome 138 or newer.');
};

/** Fill the empty translation fields from the description, on this device. */
Rules.prototype.autoTranslateDescription = async function() {
  const source = (document.querySelector('#methodDescriptionInput')?.value || '').replace(/\s+/g, ' ').trim();
  const status = document.querySelector('#methodTranslateStatus');
  const button = document.querySelector('#methodTranslateAutoBtn');
  const say = (text) => { if (status) status.textContent = text; };
  if (!source) { say(ruleTranslateText('ruleTranslateNeedsText', 'Write the description first.')); return; }
  if (typeof Translator === 'undefined') { say(ruleTranslateText('ruleTranslateUnavailable', 'Automatic translation needs Chrome 138 or newer.')); return; }
  // The description may be written in any language: detect it when Chrome can
  let from = 'en';
  try {
    if (typeof LanguageDetector !== 'undefined') {
      const detector = await LanguageDetector.create();
      const [best] = await detector.detect(source);
      if (best && best.confidence > 0.6 && best.detectedLanguage && best.detectedLanguage !== 'und') from = best.detectedLanguage.split('-')[0];
    }
  } catch (_) { /* assume English */ }
  if (button) button.disabled = true;
  let filled = 0, failed = 0;
  const empty = [...document.querySelectorAll('#methodTranslationFields .rule-translation-input')].filter(input => !input.value.trim());
  for (const input of empty) {
    const to = ruleTranslatorCode(input.dataset.locale);
    if (to === from) { input.value = source; filled++; continue; }
    say(ruleTranslateText('ruleTranslateWorkingFmt', 'Translating: {0}', ruleTranslationLanguageName(input.dataset.locale)));
    try {
      const availability = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
      if (availability === 'unavailable') { failed++; continue; }
      const translator = await Translator.create({ sourceLanguage: from, targetLanguage: to });
      input.value = (await translator.translate(source)).trim();
      if (typeof translator.destroy === 'function') translator.destroy();
      filled++;
    } catch (error) {
      failed++;
      Logger.debug('UI', `Automatic translation to ${to} failed`, error);
    }
    this.updateTranslationsCount();
  }
  if (button) button.disabled = false;
  this.updateTranslationsCount();
  say(failed
    ? ruleTranslateText('ruleTranslateDonePartialFmt', 'Filled {0}; {1} could not be translated here.', filled, failed)
    : ruleTranslateText('ruleTranslateDoneFmt', 'Filled {0} languages. Check them before saving.', filled));
};

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
  });
}
