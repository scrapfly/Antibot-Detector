CloudflareAdvanced.prototype.checkCookies = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }
            // Bot management, clearance, rate limiting, load balancer and challenge-in-progress cookies
            const expected = ['__cf_bm', 'cf_clearance', '_cfuvid', '__cflb', 'cf_chl_*'];
            const matches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
            const cookies = (await PageCookies.getAll({ url: this.tabInfo.url }, this.tabInfo.id))
                .filter(cookie => expected.some(pattern => matches(pattern, cookie.name)));
            // Same count as the window, which lists every matching cookie
            if (cookies.length > 0) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(cookies.length, Math.max(expected.length, cookies.length)));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Cloudflare'));
            }
            this.showCookieResults({ vendor: 'Cloudflare', expected, cookies });
        } catch (error) {
            Logger.error('NETWORK', '[Cloudflare] Failed to check cookies:', error);
            NotificationHelper.error(this._txt('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
        }
    };



CloudflareAdvanced.prototype.analyzeScripts = function() {
        // Cloudflare injects its bot-management scripts only until cf_clearance is set
        return this.startScriptAnalysis({ clearCookies: ['cf_clearance'] });
    };
