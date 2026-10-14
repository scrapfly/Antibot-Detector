HCaptchaAdvanced.prototype.checkVersion = async function() {
        if (!this.tabInfo || !this.tabInfo.id) throw new Error('Tab information not available');
        const tabId = this.tabInfo.id;
        let timeoutId = null;
        const stop = () => {
            clearTimeout(timeoutId);
            chrome.runtime.onMessage.removeListener(versionListener);
        };
        // Only this tab's result; a result clears the timeout so no late "timeout" follows it
        const versionListener = (message) => {
            if (message.type !== 'HCAPTCHA_VERSION_RESULT' || message.tabId !== tabId) return;
            stop();
            this.displayVersionModal(message.data);
        };
        chrome.runtime.onMessage.addListener(versionListener);
        try {
            const response = await AdvancedUtils.sendMessage({ type: 'HCAPTCHA_CHECK_VERSION', tabId });
            if (!response || response.status !== 'started') {
                stop();
                NotificationHelper.error(hcaptchaText('advHcaptchaFailedStartVersionCheck', 'Failed to start version check'));
                return { awaitingResult: false };
            }
            NotificationHelper.info(hcaptchaText('advHcaptchaCheckingVersionReload', 'Checking hCaptcha version... Page will reload'));
            // Armed before the reload, so it also covers a reload that never finishes
            timeoutId = setTimeout(() => {
                chrome.runtime.onMessage.removeListener(versionListener);
                NotificationHelper.error(hcaptchaText('advHcaptchaVersionTimeout', 'hCaptcha version detection timeout'));
            }, 15000);
            await chrome.tabs.reload(tabId);
            return { awaitingResult: true };
        } catch (error) {
            stop();
            throw error;
        }
    };


HCaptchaAdvanced.prototype.analyzeScripts = function() {
        return this.startScriptAnalysis();
    };


/** Extract Site Key: the widget, its frames and requests, or the page's inline config */
HCaptchaAdvanced.prototype.extractSiteKey = function() {
        return AdvancedSiteKeyView.extractFor(this, AdvancedCaptchaVendors.siteKeyOnly.hcaptcha);
    };
