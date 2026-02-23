/**
 * HCaptchaAdvanced - hCaptcha Module (simplified version)
 */

Logger.network('[HCaptchaAdvanced] Loading...');

class HCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'hcaptcha');
    }

}

if (typeof window !== 'undefined') {
    window.HCaptchaAdvanced = HCaptchaAdvanced;
}

Logger.network('[HCaptchaAdvanced] Loaded');
