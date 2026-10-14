/**
 * Advanced tools for the CAPTCHA vendors described as data in
 * modules/advanced/captcha-vendors.js: Extract Site Key (when the vendor has a
 * site key) and Analyze Scripts, plus the Scrape with Scrapfly card every
 * protection gets. One named subclass per vendor goes on window, so the
 * Advanced loader creates it like any other vendor module.
 */
class GenericCaptchaAdvanced extends BaseAdvancedModule {
    constructor(detection, tabInfo, vendor) {
        super(detection, tabInfo, vendor.vendorId);
        this.vendor = vendor;
        this.displayName = vendor.productName;
    }

    renderTools() {
        const tools = [];
        if (this.vendor.siteKey) {
            tools.push({ id: `${this.vendor.vendorId}ExtractSiteKey`, label: BaseAdvancedModule._tr('btnExtractSiteKey', 'Extract Site Key') });
        }
        tools.push({ id: `${this.vendor.vendorId}AnalyzeScripts`, label: BaseAdvancedModule._tr('btnAnalyzeScripts', 'Analyze Scripts') });
        return this.renderToolGrid(tools);
    }

    setupToolListeners() {
        const actions = [{ id: `${this.vendor.vendorId}AnalyzeScripts`, handler: () => this.analyzeScripts() }];
        if (this.vendor.siteKey) actions.unshift({ id: `${this.vendor.vendorId}ExtractSiteKey`, handler: () => this.extractSiteKey() });
        this.bindToolActions(actions);
    }

    extractSiteKey() {
        return AdvancedSiteKeyView.extractFor(this, this.vendor);
    }

    analyzeScripts() {
        return this.startScriptAnalysis();
    }

    displayAnalysisModal(data) {
        return this.showScriptResults(data, { vendor: this.vendor.productName });
    }
}

(function registerGenericCaptchaModules() {
    const vendors = (typeof AdvancedCaptchaVendors !== 'undefined' && AdvancedCaptchaVendors.list) || [];
    for (const vendor of vendors) {
        // A named class, so it shows by name in stack traces and the loader finds it on window
        const Module = { [vendor.className]: class extends GenericCaptchaAdvanced {
            constructor(detection, tabInfo) { super(detection, tabInfo, vendor); }
        } }[vendor.className];
        BaseAdvancedModule.DISPLAY_NAMES[vendor.vendorId] = vendor.productName;
        if (!BaseAdvancedModule.CAPTCHA_MODULES.includes(vendor.vendorId)) BaseAdvancedModule.CAPTCHA_MODULES.push(vendor.vendorId);
        if (typeof window !== 'undefined') window[vendor.className] = Module;
    }
    if (typeof window !== 'undefined') window.GenericCaptchaAdvanced = GenericCaptchaAdvanced;
})();
