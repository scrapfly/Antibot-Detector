// ImpervaAdvanced - Extends BaseAdvancedModule for Imperva/Incapsula detection

Logger.network('[ImpervaAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    PaginationManager: typeof PaginationManager
});

class ImpervaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'imperva');

        // Setup extraction completion listener
        this.setupExtractionListener();
    }
}

// Translation helpers with English fallbacks ({0}, {1}... placeholders)
ImpervaAdvanced.tr = (key, fallback) => (typeof I18n !== 'undefined' && I18n.get(key)) || fallback;
ImpervaAdvanced.fmt = (key, fallback, ...args) => (typeof I18n !== 'undefined' && I18n.format(key, ...args))
    || args.reduce((text, arg, i) => text.split('{' + i + '}').join(String(arg)), fallback);

if (typeof window !== 'undefined') {
    window.ImpervaAdvanced = ImpervaAdvanced;
}
