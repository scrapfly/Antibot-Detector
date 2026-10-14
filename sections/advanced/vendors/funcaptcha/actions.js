FunCaptchaAdvanced.prototype.analyzeScripts = function() {
        return this.startScriptAnalysis();
    };


/** Extract Site Key: the widget, its frames and requests, or the page's inline config */
FunCaptchaAdvanced.prototype.extractSiteKey = function() {
        return AdvancedSiteKeyView.extractFor(this, AdvancedCaptchaVendors.siteKeyOnly.funcaptcha);
    };
