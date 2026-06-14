// ReCaptchaAdvanced - Extends BaseAdvancedModule for reCAPTCHA detection
class ReCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'recaptcha');
    }
}

if (typeof window !== 'undefined') {
    window.ReCaptchaAdvanced = ReCaptchaAdvanced;
}
