/**
 * FunCaptchaAdvanced - FunCaptcha Module (simplified version)
 */

Logger.network('[FunCaptchaAdvanced] Loading...');

class FunCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'funcaptcha');
    }

}

if (typeof window !== 'undefined') {
    window.FunCaptchaAdvanced = FunCaptchaAdvanced;
}

Logger.network('[FunCaptchaAdvanced] Loaded');
