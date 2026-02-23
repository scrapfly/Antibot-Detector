// GeetestAdvanced - Extends BaseAdvancedModule for Geetest V3/V4 detection

class GeetestAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'geetest');
    }
}

if (typeof window !== 'undefined') {
    window.GeetestAdvanced = GeetestAdvanced;
    Logger.network('[GeetestAdvanced] ✓ Loaded and exported to window.GeetestAdvanced');
}
