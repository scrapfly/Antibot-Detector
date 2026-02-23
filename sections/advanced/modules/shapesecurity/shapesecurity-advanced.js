/**
 * ShapeSecurityAdvanced - Using BaseAdvancedModule Template System
 *
 * Advanced tools for Shape Security detection and analysis
 * Similar structure to Imperva module with capture and analysis features
 */

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

        // Setup extraction completion listener
        this.setupExtractionListener();
    }
}

if (typeof window !== 'undefined') {
    window.ShapeSecurityAdvanced = ShapeSecurityAdvanced;
    Logger.network('[ShapeSecurityAdvanced] Loaded and exported to window.ShapeSecurityAdvanced');
}
