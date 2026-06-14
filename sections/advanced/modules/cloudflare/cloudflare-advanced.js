// CloudflareAdvanced - Extends BaseAdvancedModule for Cloudflare Bot Management detection

Logger.network('[CloudflareAdvanced] Loading... Dependencies check:', {
    BaseAdvancedModule: typeof BaseAdvancedModule,
    NotificationHelper: typeof NotificationHelper,
    AdvancedUtils: typeof AdvancedUtils
});

class CloudflareAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'cloudflare');
    }

}

if (typeof window !== 'undefined') {
    window.CloudflareAdvanced = CloudflareAdvanced;
}

Logger.network('[CloudflareAdvanced] Loaded successfully');
