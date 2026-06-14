// DataDomeAdvanced - Extends BaseAdvancedModule for DataDome detection

Logger.network('[DataDomeAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class DataDomeAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'datadome');
        // Analysis results are received via message only (no storage fallback)
    }
}

if (typeof window !== 'undefined') {
    window.DataDomeAdvanced = DataDomeAdvanced;
}

Logger.network('[DataDomeAdvanced] Loaded successfully');
