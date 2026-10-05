/**
 * FunCaptchaAdvanced - FunCaptcha Module (simplified version)
 */

Logger.network('[FunCaptchaAdvanced] Loading...');

class FunCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'funcaptcha');
    }

    /**
     * Localised UI text with an English fallback; {0}, {1}, ... are filled from args.
     */
    _txt(key, fallback, ...args) {
        const i18n = (typeof I18n !== 'undefined') ? I18n : null;
        const msg = i18n ? (args.length ? i18n.format(key, ...args) : i18n.get(key)) : null;
        if (msg) return msg;
        return args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), fallback);
    }

}

if (typeof window !== 'undefined') {
    window.FunCaptchaAdvanced = FunCaptchaAdvanced;
}

Logger.network('[FunCaptchaAdvanced] Loaded');
