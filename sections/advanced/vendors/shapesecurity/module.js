// ShapeSecurityAdvanced - Extends BaseAdvancedModule for Shape Security detection

Logger.network('[ShapeSecurityAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    PaginationManager: typeof PaginationManager
});

class ShapeSecurityAdvanced extends BaseAdvancedModule {
    // Cache for code generation templates
    // Eliminates 80-90% of template generation overhead on repeat exports
    static codeTemplateCache = new Map();
    static CODE_CACHE_MAX_SIZE = 20;

    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'shapesecurity');

        // Shape Security specific state
        this.analysisActive = false;
        this.analysisResults = [];
        this.analysisListener = null;
        this.analysisTimer = null;
        this.listenersSetup = false; // Flag to prevent duplicate listener setup
    }
}

/**
 * Translated UI text for the Shape Security module (English fallback when missing).
 * @param {string} key - Message key
 * @param {string} fallback - English text, with {0}, {1}... placeholders
 * @param {...*} args - Placeholder values
 * @returns {string}
 */
function shapeSecurityText(key, fallback, ...args) {
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
function shapeSecurityDateTime(value) {
    const locale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
    return new Date(value).toLocaleString(locale);
}

if (typeof window !== 'undefined') {
    window.ShapeSecurityAdvanced = ShapeSecurityAdvanced;
    Logger.network('[ShapeSecurityAdvanced] Loaded and exported to window.ShapeSecurityAdvanced');
}
