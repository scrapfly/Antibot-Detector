    /**
     * Check Shape Security version (V1 or V2)
     */
ShapeSecurityAdvanced.prototype.checkVersion = async function() {
        try {
            Logger.network('[ShapeSecurity] Check version button clicked');

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                NotificationHelper.error(shapeSecurityText('advShapeNoActiveTab', 'No active tab found'));
                return;
            }

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
        Logger.network('[SHAPESECURITY-EXTRACT] ========== STARTING EXTRACTION ==========');
        try {

            // Get current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) {
                Logger.error('NETWORK', '[SHAPESECURITY-EXTRACT] No active tab found');
                throw new Error('No active tab found');
            }

            Logger.network('[SHAPESECURITY-EXTRACT] Tab found:', { id: tab.id, url: tab.url, title: tab.title });

            // Store extraction mode flag
            Logger.debug('NETWORK', '[SHAPESECURITY-EXTRACT] Step 2: Setting up extraction mode');
            this.isExtracting = true;

            // Set up listener for extraction result
            const extractionListener = (message) => {
                Logger.network('[SHAPESECURITY-EXTRACT] Received message:', message.type);
                if (message.type === 'SHAPESECURITY_EXTRACTION_RESULT') {
                    Logger.network('[SHAPESECURITY-EXTRACT] EXTRACTION RESULT RECEIVED!');
                    Logger.network('[SHAPESECURITY-EXTRACT] Extracted data:', message.extractedData);

                    // Display the script data
                    Logger.debug('NETWORK', '[SHAPESECURITY-EXTRACT] Step: Displaying script data modal');
                    this.displayScriptDataModal(message.extractedData);

                    // Clean up
                    Logger.debug('NETWORK', '[SHAPESECURITY-EXTRACT] Step: Cleaning up');
                    this.isExtracting = false;
                    chrome.runtime.onMessage.removeListener(extractionListener);
                    Logger.network('[SHAPESECURITY-EXTRACT] ========== EXTRACTION COMPLETE ==========');
                }
            };

            chrome.runtime.onMessage.addListener(extractionListener);
            Logger.network('[SHAPESECURITY-EXTRACT] Listener added');

            // Send message to start extraction mode
            const response = await this.sendMessage({
                type: 'SHAPESECURITY_START_EXTRACTION',
                tabId: tab.id
            });
            Logger.network('[SHAPESECURITY-EXTRACT] Background response:', response);

            if (response && response.status === 'success') {
                Logger.network('[SHAPESECURITY-EXTRACT] Extraction mode enabled successfully');

                // Reload the page to trigger Shape Security scripts
                await chrome.tabs.reload(tab.id);
                Logger.network('[SHAPESECURITY-EXTRACT] Page reload initiated');

                // Show success notification
                NotificationHelper.info(AdvancedUtils.notifications.analyzeScripts.start('Shape Security'));
            } else {
                throw new Error(response?.error || 'Failed to enable extraction mode');
            }

            Logger.network('[SHAPESECURITY-EXTRACT] ========== EXTRACTION STARTED ==========');
        } catch (error) {
            Logger.error('NETWORK', '[SHAPESECURITY-EXTRACT] Failed to start extraction:', error);
            Logger.error('NETWORK', '[SHAPESECURITY-EXTRACT] Error stack:', error.stack);
            NotificationHelper.error(shapeSecurityText('advCommonFailedStartExtractionFmt', 'Failed to start extraction: {0}', error.message));
        }
    };


    /**
     * Generate parsing code for Shape Security script URLs
     * Template caching for faster repeat exports
     */
