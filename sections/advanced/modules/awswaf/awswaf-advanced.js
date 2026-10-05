// AwsWafAdvanced - Extends BaseAdvancedModule for AWS WAF detection

Logger.network('[AwsWafAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class AwsWafAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'awswaf');
        // Analysis results are received via message only (no storage fallback)
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

// Explicitly add to window to ensure it's available
window.AwsWafAdvanced = AwsWafAdvanced;

Logger.network('[AwsWaf] Module loaded, class type:', typeof AwsWafAdvanced);
Logger.network('[AwsWaf] Window.AwsWafAdvanced:', typeof window.AwsWafAdvanced);
