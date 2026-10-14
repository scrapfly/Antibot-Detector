/**
 * Analyze Scripts for the CAPTCHA vendors described as data
 * (modules/advanced/captcha-vendors.js): <VENDOR>_START_ANALYSIS watches the
 * tab through AdvancedScriptAnalysis with that vendor's host-anchored rules.
 */
(function (global) {
    function vendorForMessage(type) {
        const id = String(type || '').replace(/_START_ANALYSIS$/, '').toLowerCase();
        const vendor = global.AdvancedCaptchaVendors && global.AdvancedCaptchaVendors.byVendorId[id];
        return vendor && Array.isArray(vendor.scripts) ? vendor : null;
    }

    function handle(request, sendResponse) {
        const vendor = vendorForMessage(request && request.type);
        if (!vendor) {
            sendResponse({ status: 'error', error: 'Unknown CAPTCHA vendor' });
            return false;
        }
        sendResponse(AdvancedScriptAnalysis.start({
            tabId: request.tabId, url: request.url, requestId: request.requestId, vendorId: vendor.vendorId,
            classify: url => global.AdvancedCaptchaVendors.classify(vendor, url)
        }));
        return false;
    }

    global.AdvancedCaptchaAnalysis = Object.freeze({ handle, vendorForMessage });
})(globalThis);
