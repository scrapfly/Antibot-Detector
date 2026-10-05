// ReCaptchaAdvanced - Extends BaseAdvancedModule for reCAPTCHA detection
class ReCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'recaptcha');
    }
}

/**
 * Translated UI text for the reCAPTCHA module (English fallback when missing).
 * @param {string} key - Message key
 * @param {string} fallback - English text, with {0}, {1}... placeholders
 * @param {...*} args - Placeholder values
 * @returns {string}
 */
function recaptchaText(key, fallback, ...args) {
    const I18nRef = (typeof I18n !== 'undefined') ? I18n : null;
    const translated = I18nRef ? (args.length ? I18nRef.format(key, ...args) : I18nRef.get(key)) : null;
    if (translated) return translated;
    return args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), fallback);
}

/**
 * Date and time in the UI language.
 * @param {number|string|Date} value
 * @returns {string}
 */
function recaptchaDateTime(value) {
    const locale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
    return new Date(value).toLocaleString(locale);
}

if (typeof window !== 'undefined') {
    window.ReCaptchaAdvanced = ReCaptchaAdvanced;
}
