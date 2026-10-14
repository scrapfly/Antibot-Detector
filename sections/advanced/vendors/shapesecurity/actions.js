    /**
     * Check Shape Security version (V1 or V2)
     */
ShapeSecurityAdvanced.prototype.checkVersion = async function() {
        try {
            Logger.network('[ShapeSecurity] Check version button clicked');

            // The tab these tools were opened for
            const tab = this.tabInfo;
            if (!tab || !tab.id) throw new Error('Tab information not available');

            // Request version check from background
            Logger.network('[ShapeSecurity] Sending SHAPESECURITY_CHECK_VERSION message');
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_CHECK_VERSION',
                tabId: tab.id,
                url: tab.url
            });

            Logger.network('[ShapeSecurity] Response:', response);

            if (response && response.error) {
                NotificationHelper.error(shapeSecurityText('advShapeErrorFmt', 'Error: {0}', response.error));
                return;
            }

            // Show result modal
            if (response && response.version) {
                Logger.network('[ShapeSecurity] Version detected:', response.version);
                NotificationHelper.success(AdvancedUtils.notifications.checkVersion.success('Shape Security', response.version.toUpperCase()));
                this.showVersionModal(response.version);
            } else {
                NotificationHelper.warning(AdvancedUtils.notifications.checkVersion.none('Shape Security'));
            }

        } catch (error) {
            Logger.error('NETWORK', '[ShapeSecurity] Check version error:', error);
            NotificationHelper.error(shapeSecurityText('advCommonFailedCheckVersionFmt', 'Failed to check version: {0}', error.message));
        }
    };


    /**
     * Show version detection result in a modal
     */
ShapeSecurityAdvanced.prototype.checkCookies = async function() {
        Logger.network('[ShapeSecurity] ========== CHECK COOKIES ==========');
        try {
            if (!this.tabInfo || !this.tabInfo.url) {
                throw new Error('Tab information not available');
            }

            // Get cookies directly without reload (like AWS WAF/Akamai)
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            Logger.network('[ShapeSecurity] Total cookies found:', cookies.length);
            Logger.network('[ShapeSecurity] URL:', this.tabInfo.url);

            // DEBUG: Log all cookies with details
            Logger.network('[ShapeSecurity] ===== ALL COOKIES =====');
            cookies.forEach((cookie, index) => {
                Logger.network(`[ShapeSecurity] Cookie ${index + 1}:`, {
                    name: cookie.name,
                    nameLength: cookie.name.length,
                    domain: cookie.domain,
                    path: cookie.path,
                    secure: cookie.secure,
                    httpOnly: cookie.httpOnly,
                    valueSnippet: cookie.value ? cookie.value.substring(0, 50) + (cookie.value.length > 50 ? '...' : '') : '(empty)'
                });
            });

            // DEBUG: Log matching criteria
            Logger.network('[ShapeSecurity] ===== MATCHING CRITERIA =====');
            Logger.network('[ShapeSecurity] Looking for cookies with:');
            Logger.network('[ShapeSecurity]   - Name length: exactly 8 characters');
            Logger.network('[ShapeSecurity]   - Value pattern: contains "|1|0|" or "|1|1|"');

            // Find Shape Security cookie (8-character name with |1|0| or |1|1| pattern in value)
            Logger.network('[ShapeSecurity] ===== EVALUATING COOKIES =====');
            let shapeCookie = null;

            for (let i = 0; i < cookies.length; i++) {
                const c = cookies[i];
                const nameMatches = c.name.length === 8;
                const valueMatches = c.value && (c.value.includes('|1|0|') || c.value.includes('|1|1|'));

                Logger.network(`[ShapeSecurity] Cookie ${i + 1}: "${c.name}"`);
                Logger.network(`[ShapeSecurity]   ├─ Name length: ${c.name.length} ${nameMatches ? 'YES' : 'NO'} (need: 8)`);
                Logger.network(`[ShapeSecurity]   ├─ Value contains |1|0| or |1|1|: ${valueMatches ? 'YES' : 'NO'}`);

                if (nameMatches && valueMatches) {
                    Logger.network(`[ShapeSecurity]   └─ MATCH! This is a Shape Security cookie`);
                    shapeCookie = c;
                    break; // Found match, stop searching
                } else {
                    Logger.network(`[ShapeSecurity]   └─ Not a match ${nameMatches ? '(name OK but value pattern missing)' : '(name length wrong)'}`);
                }
            }

            // DEBUG: Log final result
            Logger.network('[ShapeSecurity] ===== RESULT =====');
            if (shapeCookie) {
                Logger.network('[ShapeSecurity] Shape Security cookie found!');
                Logger.network('[ShapeSecurity] Cookie details:', {
                    name: shapeCookie.name,
                    domain: shapeCookie.domain,
                    path: shapeCookie.path,
                    secure: shapeCookie.secure,
                    httpOnly: shapeCookie.httpOnly,
                    valueLength: shapeCookie.value.length,
                    valueSnippet: shapeCookie.value.substring(0, 100) + (shapeCookie.value.length > 100 ? '...' : ''),
                    fullValue: shapeCookie.value
                });
            } else {
                Logger.network('[ShapeSecurity] No Shape Security cookie found');
                Logger.network('[ShapeSecurity] Possible reasons:');
                Logger.network('[ShapeSecurity]   - No cookies with 8-character names');
                Logger.network('[ShapeSecurity]   - No cookies with |1|0| or |1|1| pattern in value');
                Logger.network('[ShapeSecurity]   - Shape Security not active on this page');
            }
            Logger.network('[ShapeSecurity] ========== END CHECK COOKIES ==========');

            // Show notification
            if (shapeCookie) {
                NotificationHelper.success(AdvancedUtils.notifications.checkCookies.success(1, 1));
            } else {
                NotificationHelper.info(AdvancedUtils.notifications.checkCookies.none('Shape Security'));
            }

            // Display modal with cookie details immediately
            // Its name is random (8 characters): one expected cookie, no fixed name to list
            this.showCookieResults({ vendor: 'Shape Security', cookies: [shapeCookie].filter(Boolean), total: 1 });

        } catch (error) {
            Logger.error('NETWORK', '[ShapeSecurity] Check cookies error:', error);
            NotificationHelper.error(shapeSecurityText('advCommonFailedCheckCookiesFmt', 'Failed to check cookies: {0}', error.message));
        }
    };


    /**
     * Extract and analyze Shape Security scripts - Reload page and capture URLs
     */
ShapeSecurityAdvanced.prototype.extractScripts = async function() {
        // The tab these tools were opened for, not whichever tab is active now
        const tab = this.tabInfo;
        if (!tab || !tab.id) throw new Error('Tab information not available');
        this.isExtracting = true;
        let timeoutId = null;
        const stop = () => {
            clearTimeout(timeoutId);
            this.isExtracting = false;
            chrome.runtime.onMessage.removeListener(extractionListener);
        };
        // Only this tab's result (older workers sent no tabId)
        const extractionListener = (message) => {
            if (message.type !== 'SHAPESECURITY_EXTRACTION_RESULT') return;
            if (message.tabId !== undefined && message.tabId !== tab.id) return;
            stop();
            this.displayScriptDataModal(message.extractedData);
        };
        chrome.runtime.onMessage.addListener(extractionListener);
        try {
            const response = await this.sendMessage({ type: 'SHAPESECURITY_START_EXTRACTION', tabId: tab.id });
            if (!response || response.status !== 'success') throw new Error(response?.error || 'Failed to enable extraction mode');
            NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Shape Security'));
            timeoutId = setTimeout(() => {
                stop();
                NotificationHelper.error(shapeSecurityText('advToolNoResult', 'No result: the protection sent no data. Reload the page and try again.'));
            }, 35000);
            await chrome.tabs.reload(tab.id);
            return { awaitingResult: true };
        } catch (error) {
            stop();
            NotificationHelper.error(shapeSecurityText('advCommonFailedStartExtractionFmt', 'Failed to start extraction: {0}', error.message));
            return { awaitingResult: false };
        }
    };


    /**
     * Generate parsing code for Shape Security script URLs
     * Template caching for faster repeat exports
     */
