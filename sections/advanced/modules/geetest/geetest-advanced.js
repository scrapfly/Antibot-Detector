/**
 * GeetestAdvanced - Geetest CAPTCHA Advanced Tools Module
 * Version: 1.0.0 - 2024-10-22
 * Extends BaseAdvancedModule for Geetest V3/V4 detection and parameter extraction
 */

class GeetestAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'geetest');
    }
}

if (typeof window !== 'undefined') {
    window.GeetestAdvanced = GeetestAdvanced;
    Logger.network('[GeetestAdvanced] ✓ Loaded and exported to window.GeetestAdvanced');
}
