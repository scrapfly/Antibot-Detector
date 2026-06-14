// TurnstileAdvanced - Extends BaseAdvancedModule for Cloudflare Turnstile detection

Logger.network('[TurnstileAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class TurnstileAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'turnstile');
    }

}

if (typeof window !== 'undefined') {
    window.TurnstileAdvanced = TurnstileAdvanced;
}

Logger.network('[TurnstileAdvanced] Loaded successfully');
