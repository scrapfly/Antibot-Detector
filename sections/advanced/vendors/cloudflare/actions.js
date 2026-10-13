CloudflareAdvanced.prototype.checkCookies = async function() {
        Logger.network('[Cloudflare] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const cfUnderscoreBmCookie = cookies.find(c => c.name === '__cf_bm');
            const cfBmCookie = cookies.find(c => c.name === 'cf_bm');
            const cfClearanceCookie = cookies.find(c => c.name === 'cf_clearance');
            const cfuvIdCookie = cookies.find(c => c.name === '_cfuvid');

            const foundCookies = [cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie].filter(Boolean).length;
            const totalCookies = 4;

            if (foundCookies > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(foundCookies, totalCookies));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Cloudflare'));
            }

            this.showCookieResults({ vendor: 'Cloudflare', expected: ['__cf_bm', 'cf_bm', 'cf_clearance', '_cfuvid'],
                cookies: [cfUnderscoreBmCookie, cfBmCookie, cfClearanceCookie, cfuvIdCookie].filter(Boolean) });
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check cookies:', error);
            NotificationHelper.error(this._txt('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
        }
    };


CloudflareAdvanced.prototype.checkVersion = async function() {
        Logger.network('[Cloudflare] ========== CHECK VERSION ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            // Popup notification only; nothing is drawn on the page
            NotificationHelper.info(this._txt('advCloudflareCheckingVersion', 'Checking Cloudflare version... Page will reload'));

            // Reload page to trigger fresh Cloudflare analysis
            await chrome.tabs.reload(this.tabInfo.id);

        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check version:', error);
            NotificationHelper.error(this._txt('advCommonFailedCheckVersionFmt', 'Failed to check version: {0}', error.message));
        }
    };


CloudflareAdvanced.prototype.extractSiteKey = async function() {
        // Cloudflare's CAPTCHA is Turnstile: same keys, same dialog as Advanced → Turnstile
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }
            const keys = await TurnstileSiteKeys.extract(this.tabInfo.id);
            if (keys.length === 0) {
                NotificationHelper.error(this._txt('advCloudflareNoSitekey', 'No sitekey found on page'));
                return;
            }
            CloudflareSiteKeyView.show(this, keys);
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to extract the site key:', error);
            NotificationHelper.error(this._txt('advCloudflareFailedExtractSitekey', 'Failed to extract sitekey'));
        }
    };


CloudflareAdvanced.prototype.analyzeScripts = async function() {
        Logger.network('[Cloudflare] ========== ANALYZE SCRIPTS ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            let analysisRequestId = null;
            const analysisListener = (message) => {
                if (message.type === 'CLOUDFLARE_ANALYSIS_RESULT' && message.tabId === this.tabInfo.id && (!analysisRequestId || message.requestId === analysisRequestId)) {
                    if (message.status !== 'completed') {
                        AdvancedToolClient.unsubscribe(analysisListener);
                        NotificationHelper.error(message.error || BaseAdvancedModule._tr('advCommonFailedStartAnalysis', 'Failed to start analysis'));
                        return;
                    }
                    message.data._advancedPersisted = true;
                    Logger.network('[Cloudflare] Analysis result received:', message.data);
                    this.displayAnalysisModal(message.data);
                    AdvancedToolClient.unsubscribe(analysisListener);
                }
            };

            this._analysisDispose?.();
            this._analysisDispose = AdvancedToolClient.subscribe(analysisListener);

            const response = await AdvancedUtils.sendMessage({
                type: 'CLOUDFLARE_START_ANALYSIS',
                tabId: this.tabInfo.id,
                url: this.tabInfo.url
            });

            Logger.network('[Cloudflare] Analysis mode response:', response);

            analysisRequestId = response?.requestId;
            if (response && response.status === 'started') {
                NotificationHelper.info(this._txt('advCommonAnalyzingReloadFmt', 'Analyzing {0} scripts... Page will reload', 'Cloudflare'));

                await new Promise(resolve => setTimeout(resolve, 500));
                await chrome.tabs.reload(this.tabInfo.id);
            } else {
                AdvancedToolClient.unsubscribe(analysisListener);
                NotificationHelper.error(this._txt('advCommonFailedStartAnalysis', 'Failed to start analysis'));
            }
        } catch (error) {
            this._analysisDispose?.();
            Logger.error('NETWORK', '[Cloudflare] Failed to analyze scripts:', error);
            NotificationHelper.error(this._txt('advCommonFailedAnalyzeScriptsFmt', 'Failed to analyze scripts: {0}', error.message));
        }
    };
