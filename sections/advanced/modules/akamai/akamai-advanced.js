/**
 * AkamaiAdvanced - Using BaseAdvancedModule Template System
 *
 * Extends the base template for cleaner, more maintainable code.
 * Keeps all 4 tools: Check Cookies, Analyze Scripts, Start Capturing, Extract Sensor Information
 */
class AkamaiAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'akamai');
    }
}

if (typeof window !== 'undefined') {
    window.AkamaiAdvanced = AkamaiAdvanced;
}
