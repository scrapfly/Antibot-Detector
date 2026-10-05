  /**
   * Called when Detection section has new detection data ready
   * This fixes the timing issue where Advanced tab checks before Detection has loaded
   * @param {Array} results - Detection results array
   */
Advanced.prototype.onDetectionDataReady = function(results) {
    this.cachedDetectionResults = results || [];
    Logger.debug('UI', `[Advanced] Detection data received: ${this.cachedDetectionResults.length} detections cached`);

    // If Advanced tab is currently visible, refresh the display
    const advancedTab = document.querySelector('.tab-btn[data-tab="advanced"]');
    if (advancedTab?.classList.contains('active')) {
      Logger.debug('UI', '[Advanced] Advanced tab is active, refreshing tools display');
      this.displayAdvancedTools();
    }
  };


  /**
   * Display advanced tools interface
   */
Advanced.prototype.displayAdvancedTools = async function() {
    Logger.debug('UI', 'Advanced.displayAdvancedTools called');

    // Clean expired captures when displaying advanced tools
    await this.cleanExpiredCaptureData();

    // Check if DetectorManager is initialized
    if (!this.detectorManager.initialized) {
      this.showPlaceholderState();
      return;
    }

    // Get current tab info
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = tab;
    } catch (error) {
      Logger.error('UI', 'Failed to get current tab:', error);
    }

    // Setup message listener for capture completion
    this.setupCaptureCompletionListener();

    // v2.8 always shows the tools layout; the detection selector itself shows
    // the empty state when the page has no supported detection
    await this.showToolsInterface();
  };


  /**
   * Transition from landing page to tools interface
   */
Advanced.prototype.showToolsInterface = async function() {
    // Rendering decides which complete state to reveal after the lookup.
    await this.renderAdvancedInterface();
  };


  /**
   * Setup listener for capture completion messages
   */
Advanced.prototype.setupCaptureCompletionListener = function() {
    if (this.captureCompletionListener) return; // Already setup

    this.captureCompletionListener = async (message) => {
      if (message.type === 'AKAMAI_CAPTURE_COMPLETED' || message.type === 'RECAPTCHA_CAPTURE_COMPLETED' || message.type === 'HCAPTCHA_CAPTURE_COMPLETED') {
        Logger.debug('UI', '[Advanced] Capture completed, updating captured data display');

        // Don't clear the tools panel, just update the captured data section
        if (this.activeModule) {
          // Update capture button state for Akamai
          if (message.type === 'AKAMAI_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#akamaiStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = (typeof I18n !== 'undefined')
                ? I18n.tr('btnStartCapturing', 'Start Capturing')
                : 'Start Capturing';
            }
          }

          // Update capture button state for reCAPTCHA
          if (message.type === 'RECAPTCHA_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#recaptchaStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = (typeof I18n !== 'undefined')
                ? I18n.tr('btnStartCapturing', 'Start Capturing')
                : 'Start Capturing';
            }
          }

          // Update capture button state for hCaptcha
          if (message.type === 'HCAPTCHA_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#hcaptchaStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = (typeof I18n !== 'undefined')
                ? I18n.tr('btnStartCapturing', 'Start Capturing')
                : 'Start Capturing';
            }
          }

          // Update capture count badge
          await this.updateCaptureCountBadge();

          // Refresh the active module's capture history display immediately
          if (this.activeModule && typeof this.activeModule.renderCapturedDataSection === 'function') {
            await this.activeModule.renderCapturedDataSection();
          }

          // If on captures tab, also refresh the unified history
          const capturesPanel = document.querySelector('#capturesPanel');
          if (capturesPanel && capturesPanel.classList.contains('active')) {
            await this.renderUnifiedCaptureHistory();
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(this.captureCompletionListener);
  };


  /**
   * Show placeholder state for advanced tools
   */
Advanced.prototype.showPlaceholderState = function() {
    const noAdvancedState = document.querySelector('#noAdvancedState');
    const advancedContent = document.querySelector('#advancedContent');

    const loading = document.querySelector('#advancedLoadingState');
    if (loading) loading.style.display = 'none';
    if (noAdvancedState) noAdvancedState.style.display = 'flex';
    if (advancedContent) advancedContent.style.display = 'none';
  };


  /**
   * Get current detection results
   * @returns {Array} Current detections from Detection section
   */
Advanced.prototype.getCurrentDetections = async function() {
    // PRIORITY 0: Check cached results from Detection notification (most reliable)
    Logger.debug('UI', '[Advanced] DETECTION RETRIEVAL STEP 0: Check cachedDetectionResults');
    Logger.debug('UI', '[Advanced]   - cachedDetectionResults length:', this.cachedDetectionResults?.length || 0);

    if (this.cachedDetectionResults && this.cachedDetectionResults.length > 0) {
      Logger.debug('UI', '[Advanced] Found', this.cachedDetectionResults.length, 'detections in cache');
      const firstDet = this.cachedDetectionResults[0];
      Logger.debug('UI', '[Advanced] First cached detection:', {
        hasDetector: !!firstDet.detector,
        detectorId: firstDet.detector?.id,
        detectorName: firstDet.detector?.name
      });
      return this.cachedDetectionResults;
    }

    // PRIORITY 1: Try to get from Detection section's currentResults (fastest, in-memory)
    let results = this.detectionSection && this.detectionSection.currentResults ?
      this.detectionSection.currentResults : [];

    Logger.debug('UI', '[Advanced] DETECTION RETRIEVAL STEP 1: Check detectionSection.currentResults');
    Logger.debug('UI', '[Advanced]   - detectionSection exists:', !!this.detectionSection);
    Logger.debug('UI', '[Advanced]   - currentResults length:', results.length);

    // If results found, validate structure and cache them
    if (results.length > 0) {
      Logger.debug('UI', '[Advanced] Found', results.length, 'detections in detectionSection');
      // Cache for future use
      this.cachedDetectionResults = results;
      // Log first detection structure for validation
      const firstDet = results[0];
      Logger.debug('UI', '[Advanced] First detection structure:', {
        hasDetector: !!firstDet.detector,
        detectorId: firstDet.detector?.id,
        detectorName: firstDet.detector?.name
      });
      return results;
    }

    // PRIORITY 2: Fetch from background service worker with retries
    Logger.debug('UI', '[Advanced] DETECTION RETRIEVAL STEP 2: Background fetch');
    if (!this.currentTab) {
      Logger.debug('UI', '[Advanced] No currentTab available, cannot fetch from background');
      return results;
    }

    Logger.debug('UI', '[Advanced]   - Fetching for tab ID:', this.currentTab.id, 'URL:', this.currentTab.url);

    // Try to fetch with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    while (results.length === 0 && retryCount < maxRetries) {
      try {
        const response = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            Logger.debug('UI', '[Advanced] Background message timeout after 3s');
            resolve(null);
          }, 3000);

          chrome.runtime.sendMessage({
            type: 'GET_DETECTION_DATA',
            tabId: this.currentTab.id
          }, (response) => {
            clearTimeout(timeout);

            if (chrome.runtime.lastError) {
              Logger.error('UI', '[Advanced] Chrome error in message:', chrome.runtime.lastError);
              resolve(null);
            } else {
              Logger.debug('UI', '[Advanced] ✓ Background response received (attempt', retryCount + 1, ')', response ? 'with data' : 'empty');
              resolve(response);
            }
          });
        });

        // Current responses wrap matches in data.detectionResults. Retain
        // support for the older array response used by previous versions.
        const responseResults = Array.isArray(response?.data)
          ? response.data : response?.data?.detectionResults;
        // An authoritative empty response is complete, not a reason to retry.
        if (response?.status === 'ok' &&
            (response.data === null || (Array.isArray(responseResults) && responseResults.length === 0))) {
          return [];
        }
        if (Array.isArray(responseResults)) {
          if (responseResults.length > 0) {
            results = responseResults;
            this.cachedDetectionResults = results;
            Logger.debug('UI', '[Advanced] Fetched', results.length, 'detections from background');

            // Validate first detection
            const firstDet = results[0];
            Logger.debug('UI', '[Advanced] First detection from background:', {
              hasDetector: !!firstDet.detector,
              detectorId: firstDet.detector?.id,
              detectorName: firstDet.detector?.name
            });
            return results;
          } else {
            Logger.debug('UI', '[Advanced] Background returned empty array');
          }
        } else if (response && response.status === 'error') {
          Logger.debug('UI', '[Advanced] Background returned error:', response.error);
        }
      } catch (error) {
        Logger.error('UI', '[Advanced] Error in background fetch attempt', retryCount + 1, ':', error);
      }

      // Retry if failed
      if (results.length === 0 && retryCount < maxRetries - 1) {
        retryCount++;
        Logger.debug('UI', '[Advanced]   - Retrying... (attempt', retryCount + 1, 'of', maxRetries, ')');
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retry
      } else {
        break;
      }
    }

    Logger.debug('UI', '[Advanced] FINAL: Returning', results.length, 'detections');
    return results;
  };


  /**
   * Get available detection modules for current detections
   * @returns {Array} Array of {detection, module} objects
   */
Advanced.prototype.getDetectionModules = async function() {
    const detections = await this.getCurrentDetections();
    const availableTools = [];

    Logger.debug('UI', '[Advanced] CHECKING AVAILABLE MODULES');
    Logger.debug('UI', '[Advanced] Total detections to check:', detections.length);
    Logger.debug('UI', '[Advanced] Available module keys:', Object.keys(Advanced.AVAILABLE_MODULES));

    detections.forEach((detection, index) => {
      const rawDetectorId = detection.detector?.id;
      // Strip "detect-" prefix to match AVAILABLE_MODULES keys (e.g., "detect-akamai" → "akamai")
      const detectorId = rawDetectorId ? rawDetectorId.replace(/^detect-/, '') : null;
      const detectorName = detection.detector?.name;
      const hasModule = !!Advanced.AVAILABLE_MODULES[detectorId];

      Logger.debug('UI', `[Advanced] [${index + 1}/${detections.length}] Checking:`, {
        rawDetectorId,
        detectorId,
        detectorName,
        hasModule: hasModule ? 'YES' : 'NO'
      });

      if (detectorId && Advanced.AVAILABLE_MODULES[detectorId]) {
        Logger.debug('UI', `[Advanced]   → Adding "${detectorName}" to available tools`);
        availableTools.push({
          detection,
          module: Advanced.AVAILABLE_MODULES[detectorId]
        });
      } else if (detectorId) {
        Logger.debug('UI', `[Advanced]   → "${detectorName}" not in AVAILABLE_MODULES (missing implementation)`);
      } else {
        Logger.debug('UI', `[Advanced] Detection missing detector.id`);
      }
    });

    Logger.debug('UI', '[Advanced] MODULE CHECK COMPLETE:', {
      detectedTotal: detections.length,
      withTools: availableTools.length,
      withoutTools: detections.length - availableTools.length
    });

    return availableTools;
  };


  /**
   * Load and initialize a detection module
   * @param {string} moduleId - Module ID (e.g., 'recaptcha')
   * @param {object} detection - Detection result object
   * @returns {object} Module instance
   */
Advanced.prototype.loadDetectionModule = async function(moduleId, detection) {
    // Strip "detect-" prefix to match AVAILABLE_MODULES keys (e.g., "detect-incapsula" → "incapsula")
    const normalizedId = moduleId ? moduleId.replace(/^detect-/, '') : moduleId;

    if (this.loadedModules[normalizedId]) {
      return this.loadedModules[normalizedId];
    }

    const moduleInfo = Advanced.AVAILABLE_MODULES[normalizedId];
    if (!moduleInfo) {
      Logger.error('UI', `Module ${normalizedId} not found in registry`);
      return null;
    }

    try {
      const ModuleClass = window[moduleInfo.name];
      if (!ModuleClass) {
        Logger.error('UI', `Module class ${moduleInfo.name} not loaded`);
        return null;
      }

      const moduleInstance = new ModuleClass(detection, this.currentTab);
      this.loadedModules[normalizedId] = moduleInstance;
      return moduleInstance;
    } catch (error) {
      Logger.error('UI', `Failed to initialize module ${normalizedId}:`, error);
      return null;
    }
  };