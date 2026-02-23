/**
 * AwsWafAdvanced - AWS WAF Module
 *
 * Extends BaseAdvancedModule for AWS WAF detection and analysis.
 * Includes tools for checking cookies and capturing AWS WAF parameters.
 */

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
}

// Explicitly add to window to ensure it's available
window.AwsWafAdvanced = AwsWafAdvanced;

Logger.network('[AwsWaf] Module loaded, class type:', typeof AwsWafAdvanced);
Logger.network('[AwsWaf] Window.AwsWafAdvanced:', typeof window.AwsWafAdvanced);
