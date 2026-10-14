CloudflareAdvanced.prototype.checkCookies = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }
            // Bot management, clearance, rate limiting, load balancer and challenge-in-progress cookies
            const expected = ['__cf_bm', 'cf_clearance', '_cfuvid', '__cflb', 'cf_chl_*'];
            const matches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
            const cookies = (await chrome.cookies.getAll({ url: this.tabInfo.url }))
                .filter(cookie => expected.some(pattern => matches(pattern, cookie.name)));
            const found = expected.filter(pattern => cookies.some(cookie => matches(pattern, cookie.name))).length;
            if (found > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(found, expected.length));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Cloudflare'));
            }
            this.showCookieResults({ vendor: 'Cloudflare', expected, cookies });
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check cookies:', error);
            NotificationHelper.error(this._txt('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
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


CloudflareAdvanced.prototype.analyzeScripts = function() {
        return this.startScriptAnalysis();
    };
