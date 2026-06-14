// AkamaiAdvanced - Extends BaseAdvancedModule for Akamai Bot Manager detection
class AkamaiAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo) {
        super(detection, tabInfo, 'akamai');
    }
}

if (typeof window !== 'undefined') {
    window.AkamaiAdvanced = AkamaiAdvanced;
}
