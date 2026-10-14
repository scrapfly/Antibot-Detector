    /**
     * Analyze page content for Akamai scripts and patterns
     */
AkamaiAdvanced.prototype.analyzeContent = async function() {
        try {
            if (!this.tabInfo || !this.tabInfo.id) {
                throw new Error('Tab information not available');
            }

            NotificationHelper.info(AkamaiAdvanced.tr('advAkamaiReloadingToAnalyze', 'Reloading page to analyze Akamai data…'));

            // Reload the page
            await chrome.tabs.reload(this.tabInfo.id);

            // Wait for page to load
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get cookies
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            const abckCookie = cookies.find(c => c.name === '_abck');
            const sbsdCookie = cookies.find(c => c.name === 'sbsd');
            const sbsdOCookie = cookies.find(c => c.name === 'sbsd_o');
            const akBmscCookie = cookies.find(c => c.name === 'ak_bmsc');
            const bmSzCookie = cookies.find(c => c.name === 'bm_sz');

            // Analyze page content and parse scripts
            const results = await chrome.scripting.executeScript({
                target: { tabId: this.tabInfo.id },
                func: () => {
                    const htmlContent = document.documentElement.outerHTML;
                    const analysis = {
                        scripts: [],
                        sensorElements: [],
                        sensorDataUrls: [],
                        sbsdUrls: [],
                        patterns: {
                            bmak: false,
                            sensorData: false,
                            pixelChallenge: false,
                            abckVariable: false,
                            secCpt: false
                        },
                        scriptCount: 0,
                        requiresSecCpt: false,
                        requiresPixel: false,
                        akamaiScriptPath: null,
                        pixelHtmlVar: null,
                        pixelScriptUrls: null,
                        pixelScriptVar: null,
                        parsingCode: null
                    };

                    // Detect sec_cpt challenge
                    analysis.requiresSecCpt = htmlContent.includes('/sec_cpt/') || htmlContent.includes('cp_challenge');
                    if (analysis.requiresSecCpt) {
                        analysis.patterns.secCpt = true;
                    }

                    // Parse Akamai script path
                    const scriptMatch = /<script type="text\/javascript"\s*(?:nonce=".*?")?\s*src="([a-z\d/\-_]+)"><\/script>/i.exec(htmlContent);
                    if (scriptMatch && scriptMatch[1]) {
                        // Convert relative path to full URL
                        const scriptPath = scriptMatch[1];
                        const pageUrl = window.location.origin;
                        analysis.akamaiScriptPath = pageUrl + scriptPath;
                    }

                    // Parse pixel HTML variable
                    const pixelVarMatch = /bazadebezolkohpepadr="(\d+)"/.exec(htmlContent);
                    if (pixelVarMatch && pixelVarMatch[1]) {
                        analysis.requiresPixel = true;
                        analysis.patterns.pixelChallenge = true;
                        analysis.pixelHtmlVar = parseInt(pixelVarMatch[1]);
                    }

                    // Parse pixel script URL
                    const pixelUrlMatch = /src="(https?:\/\/.+\/akam\/\d+\/\w+)"/.exec(htmlContent);
                    if (pixelUrlMatch && pixelUrlMatch[1]) {
                        const scriptUrl = pixelUrlMatch[1];
                        const parts = scriptUrl.split("/");
                        parts[parts.length - 1] = "pixel_" + parts[parts.length - 1];
                        const postUrl = parts.join("/");
                        analysis.pixelScriptUrls = { scriptUrl, postUrl };
                    }

                    // Check all script tags
                    const scripts = Array.from(document.querySelectorAll('script'));
                    analysis.scriptCount = scripts.length;

                    scripts.forEach(script => {
                        const content = script.textContent;
                        const src = script.src;

                        // Check for Akamai patterns in script content
                        if (content) {
                            if (content.includes('bmak.')) {
                                analysis.patterns.bmak = true;
                            }
                            if (content.includes('sensor_data')) {
                                analysis.patterns.sensorData = true;
                            }
                            if (content.includes('bazadebezolkohpepadr')) {
                                analysis.patterns.pixelChallenge = true;
                            }
                            if (content.includes('_abck')) {
                                analysis.patterns.abckVariable = true;
                            }

                            // Parse pixel script variable
                            if (!analysis.pixelScriptVar) {
                                const indexMatch = /g=_\[(\d+)]/.exec(content);
                                if (indexMatch && indexMatch[1]) {
                                    const index = parseInt(indexMatch[1]);
                                    const arrayMatch = /var _=\[(.+?)];/.exec(content);
                                    if (arrayMatch && arrayMatch[1]) {
                                        const rawStrings = arrayMatch[1].match(/"[^"]*"/g);
                                        if (rawStrings && index < rawStrings.length) {
                                            analysis.pixelScriptVar = rawStrings[index].replace(/^"|"$/g, "");
                                        }
                                    }
                                }
                            }

                            // Store script info if it contains specific Akamai patterns (pixel, sensor, sbsd only)
                            const hasPixelPattern = content.includes('bazadebezolkohpepadr') || content.includes('pixel_') || /g=_\[\d+\]/.test(content);
                            const hasSensorPattern = content.includes('sensor_data') || content.includes('bmak.');
                            const hasSbsdPattern = content.includes('.well-known/sbsd') || content.includes('sbsd');

                            if (hasPixelPattern || hasSensorPattern || hasSbsdPattern) {
                                const scriptInfo = {
                                    type: 'inline',
                                    length: content.length,
                                    categories: []
                                };

                                if (hasPixelPattern) scriptInfo.categories.push('pixel');
                                if (hasSensorPattern) scriptInfo.categories.push('sensor');
                                if (hasSbsdPattern) scriptInfo.categories.push('sbsd');

                                analysis.scripts.push(scriptInfo);
                            }
                        }

                        // Check script sources for specific patterns only
                        if (src) {
                            const hasPixelUrl = src.includes('pixel_') || /\/akam\/\d+\/\w+/.test(src);
                            const hasSensorUrl = src.includes('sensor_data') || src.includes('/akam/');
                            const hasSbsdUrl = src.includes('.well-known/sbsd');

                            if (hasPixelUrl || hasSensorUrl || hasSbsdUrl) {
                                const scriptInfo = {
                                    type: 'external',
                                    src: src,
                                    categories: []
                                };

                                if (hasPixelUrl) scriptInfo.categories.push('pixel');
                                if (hasSensorUrl) scriptInfo.categories.push('sensor');
                                if (hasSbsdUrl) scriptInfo.categories.push('sbsd');

                                analysis.scripts.push(scriptInfo);
                            }
                        }

                        // Detect sensor_data URLs in script content
                        if (content) {
                            // Look for common Akamai endpoint patterns
                            const urlPatterns = [
                                /(?:https?:)?\/\/[^"'\s]+\/akam\/[^"'\s]+/g,
                                /(?:https?:)?\/\/[^"'\s]+akamai[^"'\s]+/g,
                                /['"]([^'"]*sensor_data[^'"]*)['"]/g,
                                /['"]([^'"]*\/pixel_[^'"]*)['"]/g
                            ];

                            urlPatterns.forEach(pattern => {
                                const matches = content.match(pattern);
                                if (matches) {
                                    matches.forEach(match => {
                                        const cleanUrl = match.replace(/['"]/g, '');
                                        if (!analysis.sensorDataUrls.includes(cleanUrl)) {
                                            analysis.sensorDataUrls.push(cleanUrl);
                                        }
                                    });
                                }
                            });
                        }
                    });

                    // Extract SBSD URLs from scripts with 'sbsd' category
                    analysis.scripts.forEach(script => {
                        if (script.categories && script.categories.includes('sbsd') && script.src) {
                            if (!analysis.sbsdUrls.includes(script.src)) {
                                analysis.sbsdUrls.push(script.src);
                            }
                        }
                    });

                    // Check for sensor elements
                    const sensorSelectors = ['#akam-sensor', '.bm-sensor-container', '[data-akamai]'];
                    sensorSelectors.forEach(selector => {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            analysis.sensorElements.push({
                                selector: selector,
                                count: elements.length
                            });
                        }
                    });

                    return analysis;
                }
            });

            if (results && results[0] && results[0].result) {
                const analysis = results[0].result;

                // Add cookie data to analysis
                analysis.cookies = {
                    _abck: abckCookie,
                    sbsd: sbsdCookie,
                    sbsd_o: sbsdOCookie,
                    ak_bmsc: akBmscCookie,
                    bm_sz: bmSzCookie
                };

                // Check Easy Mode
                analysis.isEasyMode = abckCookie && abckCookie.value.includes('~0~');
                analysis.requiresSbsd = !!(sbsdCookie || sbsdOCookie);

                // Console log all captured data
                Logger.debug('NETWORK', '[Akamai Debug] ========== ANALYZE CONTENT - FULL DATA ==========');
                Logger.debug('NETWORK', '[Akamai Debug] COOKIES:');
                Logger.debug('NETWORK', '[Akamai Debug]   _abck:', abckCookie ? {
                    value: abckCookie.value,
                    length: abckCookie.value.length,
                    domain: abckCookie.domain
                } : 'NOT FOUND');
                Logger.debug('NETWORK', '[Akamai Debug]   sbsd:', sbsdCookie ? sbsdCookie.value : 'NOT FOUND');
                Logger.debug('NETWORK', '[Akamai Debug]   sbsd_o:', sbsdOCookie ? sbsdOCookie.value : 'NOT FOUND');
                Logger.debug('NETWORK', '[Akamai Debug]   ak_bmsc:', akBmscCookie ? 'FOUND' : 'NOT FOUND');
                Logger.debug('NETWORK', '[Akamai Debug]   bm_sz:', bmSzCookie ? 'FOUND' : 'NOT FOUND');

                Logger.debug('NETWORK', '[Akamai Debug] MODE DETECTION:');
                Logger.debug('NETWORK', '[Akamai Debug]   Easy Mode:', analysis.isEasyMode);
                Logger.debug('NETWORK', '[Akamai Debug]   SBSD Required:', analysis.requiresSbsd);
                Logger.debug('NETWORK', '[Akamai Debug]   sec_cpt Required:', analysis.requiresSecCpt);
                Logger.debug('NETWORK', '[Akamai Debug]   Pixel Challenge:', analysis.requiresPixel);

                Logger.debug('NETWORK', '[Akamai Debug] PIXEL CHALLENGE DATA:');
                Logger.debug('NETWORK', '[Akamai Debug]   HTML Var (bazadebezolkohpepadr):', analysis.pixelHtmlVar || 'NOT FOUND');
                Logger.debug('NETWORK', '[Akamai Debug]   Script URL:', analysis.pixelScriptUrls?.scriptUrl || 'NOT FOUND');
                Logger.debug('NETWORK', '[Akamai Debug]   Post URL:', analysis.pixelScriptUrls?.postUrl || 'NOT FOUND');
                Logger.debug('NETWORK', '[Akamai Debug]   Script Var:', analysis.pixelScriptVar || 'NOT FOUND');

                Logger.debug('NETWORK', '[Akamai Debug] SCRIPTS:');
                Logger.debug('NETWORK', '[Akamai Debug]   Total Scripts:', analysis.scriptCount);
                Logger.debug('NETWORK', '[Akamai Debug]   Akamai Scripts:', analysis.scripts.length);
                Logger.debug('NETWORK', '[Akamai Debug]   Script Path:', analysis.akamaiScriptPath || 'NOT FOUND');

                Logger.debug('NETWORK', '[Akamai Debug] DETECTED PATTERNS:');
                Logger.debug('NETWORK', '[Akamai Debug]   bmak API:', analysis.patterns.bmak);
                Logger.debug('NETWORK', '[Akamai Debug]   sensor_data:', analysis.patterns.sensorData);
                Logger.debug('NETWORK', '[Akamai Debug]   _abck variable:', analysis.patterns.abckVariable);
                Logger.debug('NETWORK', '[Akamai Debug]   Pixel in content:', analysis.patterns.pixelChallenge);
                Logger.debug('NETWORK', '[Akamai Debug]   sec_cpt in content:', analysis.patterns.secCpt);

                Logger.debug('NETWORK', '[Akamai Debug] SENSOR ELEMENTS:', analysis.sensorElements.length > 0 ? analysis.sensorElements : 'NONE FOUND');

                Logger.debug('NETWORK', '[Akamai Debug] SENSOR DATA URLS:');
                if (analysis.sensorDataUrls && analysis.sensorDataUrls.length > 0) {
                    analysis.sensorDataUrls.forEach((url, idx) => {
                        Logger.debug('NETWORK', `[Akamai Debug]   ${idx + 1}. ${url}`);
                    });
                } else {
                    Logger.debug('NETWORK', '[Akamai Debug]   NONE FOUND');
                }

                Logger.debug('NETWORK', '[Akamai Debug] ========================================');

                this.displayAnalysisModal(analysis);
            }
        } catch (error) {
            Logger.error('NETWORK', 'Failed to analyze content:', error);
            NotificationHelper.error(AkamaiAdvanced.fmt('advAkamaiAnalyzeFailedFmt', 'Failed to analyze content: {0}', error.message));
        }
    };



    /**
     * Generate parsing code for specific script types
     */
AkamaiAdvanced.prototype.processCapturedData = async function() {
        // History saving is handled by the worker's AKAMAI_CAPTURE_COMPLETED handler
        try {
            const cookies = await chrome.cookies.getAll({ url: this.tabInfo.url });
            if (!cookies.some(cookie => cookie.name === '_abck')) {
                NotificationHelper.error(AkamaiAdvanced.tr('advAkamaiNoAbckCookie', 'No _abck cookie found'));
                return;
            }
            if (this.renderCapturedDataSection) await this.renderCapturedDataSection();
        } catch (error) {
            Logger.error('NETWORK', 'Failed to process captured data:', error);
            NotificationHelper.error(AkamaiAdvanced.fmt('advAkamaiProcessFailedFmt', 'Failed to process data: {0}', error.message));
        }
    };







    /**
     * Extract Sensor Information - Delete cookies and capture raw sensor data
     */
AkamaiAdvanced.prototype.extractSensorInformation = async function() {
        const tr = AkamaiAdvanced.tr;
        // The tab these tools were opened for, not whichever tab is active now
        const tab = this.tabInfo;
        if (!tab || !tab.id || !tab.url) throw new Error('Tab information not available');
        NotificationHelper.info(tr('advAkamaiExtractingSensor', 'Extracting sensor information…'));

        // Delete Akamai-related cookies to force regeneration
        for (const cookieName of ['_abck', 'sbsd', 'sbsd_o', 'ak_bmsc', 'bm_sz', 'bm_sv', 'bm_mi']) {
            try {
                await chrome.cookies.remove({ url: tab.url, name: cookieName });
            } catch (err) {
                Logger.network(`[AKAMAI-EXTRACT] Could not delete cookie ${cookieName}:`, err.message);
            }
        }

        this.isExtracting = true;
        let timeoutId = null;
        const stop = () => {
            clearTimeout(timeoutId);
            this.isExtracting = false;
            chrome.runtime.onMessage.removeListener(extractionListener);
        };
        // Only this tab's result (older workers sent no tabId)
        const extractionListener = (message) => {
            if (message.type !== 'AKAMAI_EXTRACTION_RESULT') return;
            if (message.tabId !== undefined && message.tabId !== tab.id) return;
            stop();
            this.displaySensorDataModal(message.extractedData);
        };
        chrome.runtime.onMessage.addListener(extractionListener);
        try {
            const response = await chrome.runtime.sendMessage({ type: 'AKAMAI_EXTRACT_SENSOR', tabId: tab.id });
            if (!response || response.status !== 'success') throw new Error('Failed to start extraction mode');
            // The worker gives up after 30 s without a word: say so here
            timeoutId = setTimeout(() => {
                stop();
                NotificationHelper.error(tr('advToolNoResult', 'No result: the protection sent no data. Reload the page and try again.'));
            }, 35000);
            await chrome.tabs.reload(tab.id);
            return { awaitingResult: true };
        } catch (error) {
            stop();
            NotificationHelper.error(AkamaiAdvanced.fmt('advAkamaiExtractSensorFailedFmt', 'Failed to extract sensor information: {0}', error.message));
            return { awaitingResult: false };
        }
    };
























