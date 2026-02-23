// ImpervaAdvanced - Extends BaseAdvancedModule for Imperva/Incapsula detection

Logger.network('[ImpervaAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    PaginationManager: typeof PaginationManager
});

class ImpervaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'imperva');

        // Imperva-specific state
        this.analysisActive = false;
        this.analysisResults = [];
        this.analysisListener = null;
        this.analysisTimer = null;

        // Setup extraction completion listener
        this.setupExtractionListener();
    }
}

if (typeof window !== 'undefined') {
    window.ImpervaAdvanced = ImpervaAdvanced;
}
