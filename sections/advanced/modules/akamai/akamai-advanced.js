// AkamaiAdvanced - Extends BaseAdvancedModule for Akamai Bot Manager detection
class AkamaiAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'akamai');
    }
}

// Translation helpers with English fallbacks ({0}, {1}... placeholders)
AkamaiAdvanced.tr = (key, fallback) => (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
AkamaiAdvanced.fmt = (key, fallback, ...args) => (typeof I18n !== 'undefined' && I18n.format(key, ...args))
    || args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), fallback);

if (typeof window !== 'undefined') {
    window.AkamaiAdvanced = AkamaiAdvanced;
}
