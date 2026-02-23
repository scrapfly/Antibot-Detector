/**
 * ReCaptchaAdvanced - Using BaseAdvancedModule Template System
 *
 * Extends base class for reCAPTCHA-specific capture and analysis tools.
 * Includes tools for clicking reCAPTCHA, extracting sitekeys, checking versions, and capturing callbacks.
 */
class ReCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'recaptcha');
    }
}

if (typeof window !== 'undefined') {
    window.ReCaptchaAdvanced = ReCaptchaAdvanced;
}
