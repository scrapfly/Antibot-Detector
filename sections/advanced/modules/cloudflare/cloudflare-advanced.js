/**
 * CloudflareAdvanced - Cloudflare Bot Management Module
 *
 * Extends BaseAdvancedModule for Cloudflare detection and analysis.
 * Includes tools for checking cookies and capturing Cloudflare challenge scripts.
 */

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
