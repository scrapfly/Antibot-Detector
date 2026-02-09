class Advanced {
  static AVAILABLE_MODULES = {
    'recaptcha': {
      name: 'ReCaptchaAdvanced',
      file: 'ReCaptcha/ReCaptchaAdvanced.js',
      displayName: 'reCAPTCHA Detection Tools',
      icon: '🔴'
    },
    'akamai': {
      name: 'AkamaiAdvanced',
      file: 'Akamai/AkamaiAdvanced.js',
      displayName: 'Akamai Bot Manager Tools',
      icon: '🔷'
    },
    'shapesecurity': {
      name: 'ShapeSecurityAdvanced',
      file: 'shapesecurity/shapesecurity-advanced.js',
      displayName: 'Shape Security Tools',
      icon: '🔶'
    },
    'incapsula': {
      name: 'ImpervaAdvanced',
      file: 'imperva/imperva-advanced.js',
      displayName: 'Imperva/Incapsula Tools',
      icon: '🔷'
    },
    'aws-waf': {
      name: 'AwsWafAdvanced',
      file: 'awswaf/awswaf-advanced.js',
      displayName: 'AWS WAF Tools',
      icon: '🟠'
    },
    'geetest': {
      name: 'GeetestAdvanced',
      file: 'geetest/geetest-advanced.js',
      displayName: 'GeeTest Tools',
      icon: '🟣'
    },
    'datadome': {
      name: 'DataDomeAdvanced',
      file: 'datadome/datadome-advanced.js',
      displayName: 'DataDome Tools',
      icon: '🟢'
    },
    'cloudflare': {
      name: 'CloudflareAdvanced',
      file: 'cloudflare/cloudflare-advanced.js',
      displayName: 'Cloudflare Tools',
      icon: '🟠'
    },
    'turnstile': {
      name: 'TurnstileAdvanced',
      file: 'turnstile/turnstile-advanced.js',
      displayName: 'Turnstile Tools',
      icon: '🔵'
    },
    'hcaptcha': {
      name: 'HCaptchaAdvanced',
      file: 'hcaptcha/hcaptcha-advanced.js',
      displayName: 'hCaptcha Tools',
      icon: '🔷'
    },
    'funcaptcha': {
      name: 'FunCaptchaAdvanced',
      file: 'funcaptcha/funcaptcha-advanced.js',
      displayName: 'FunCaptcha Tools',
      icon: '🟣'
    },
  };

  constructor(detectorManager, detectionSection) {
    this.detectorManager = detectorManager;
    this.detectionSection = detectionSection;
    this.analysisResults = null;
    this.isRunningAnalysis = false;
    this.loadedModules = {};
    this.currentTab = null;
    this.selectedDetection = null;
    this.availableDetectionTools = [];
    this.captureHistoryPagination = null;
    this.cachedDetectionResults = []; // Cache detection results for reliable access
  }

  /**
   * Called when Detection section has new detection data ready
   * This fixes the timing issue where Advanced tab checks before Detection has loaded
   * @param {Array} results - Detection results array
   */
  onDetectionDataReady(results) {
    this.cachedDetectionResults = results || [];
    Logger.ui(`[Advanced] Detection data received: ${this.cachedDetectionResults.length} detections cached`);

    // If Advanced tab is currently visible, refresh the display
    const advancedTab = document.querySelector('.tab-btn[data-tab="advanced"]');
    if (advancedTab?.classList.contains('active')) {
      Logger.ui('[Advanced] Advanced tab is active, refreshing tools display');
      this.displayAdvancedTools();
    }
  }

  /**
   * Display advanced tools interface
   */
  async displayAdvancedTools() {
    Logger.ui('Advanced.displayAdvancedTools called');

    // Clean expired captures when displaying advanced tools
    await this.cleanExpiredCaptureData();

    const noAdvancedState = document.querySelector('#noAdvancedState');
    const advancedContent = document.querySelector('#advancedContent');

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

    // Check if we have available detection modules
    const detectionTools = await this.getDetectionModules();

    if (detectionTools.length > 0) {
      // We have detections - show tools interface automatically
      await this.showToolsInterface();
    } else {
      // No compatible detections - show empty state
      if (noAdvancedState) noAdvancedState.style.display = 'flex';
      if (advancedContent) advancedContent.style.display = 'none';
    }
  }

  /**
   * Transition from landing page to tools interface
   */
  async showToolsInterface() {
    const noAdvancedState = document.querySelector('#noAdvancedState');
    const advancedContent = document.querySelector('#advancedContent');

    // Hide landing page, show tools
    if (noAdvancedState) noAdvancedState.style.display = 'none';
    if (advancedContent) {
      advancedContent.style.display = 'flex';
      await this.renderAdvancedInterface();
      await this.restoreSelectedDetection();
    }
  }

  /**
   * Setup listener for capture completion messages
   */
  setupCaptureCompletionListener() {
    if (this.captureCompletionListener) return; // Already setup

    this.captureCompletionListener = async (message) => {
      if (message.type === 'AKAMAI_CAPTURE_COMPLETED' || message.type === 'RECAPTCHA_CAPTURE_COMPLETED' || message.type === 'HCAPTCHA_CAPTURE_COMPLETED') {
        Logger.ui('[Advanced] Capture completed, updating captured data display');

        // Don't clear the tools panel, just update the captured data section
        if (this.activeModule) {
          // Update capture button state for Akamai
          if (message.type === 'AKAMAI_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#akamaiStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = 'Start Capturing';
            }
          }

          // Update capture button state for reCAPTCHA
          if (message.type === 'RECAPTCHA_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#recaptchaStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = 'Start Capturing';
            }
          }

          // Update capture button state for hCaptcha
          if (message.type === 'HCAPTCHA_CAPTURE_COMPLETED') {
            const captureBtn = document.querySelector('#hcaptchaStartCapture');
            if (captureBtn) {
              captureBtn.classList.remove('capturing');
              captureBtn.querySelector('.tool-btn-label').textContent = 'Start Capturing';
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
  }

  /**
   * Show placeholder state for advanced tools
   */
  showPlaceholderState() {
    const noAdvancedState = document.querySelector('#noAdvancedState');
    const advancedContent = document.querySelector('#advancedContent');

    if (noAdvancedState) noAdvancedState.style.display = 'flex';
    if (advancedContent) advancedContent.style.display = 'none';
  }

  /**
   * Get current detection results
   * @returns {Array} Current detections from Detection section
   */
  async getCurrentDetections() {
    // PRIORITY 0: Check cached results from Detection notification (most reliable)
    Logger.ui('[Advanced] DETECTION RETRIEVAL STEP 0: Check cachedDetectionResults');
    Logger.ui('[Advanced]   - cachedDetectionResults length:', this.cachedDetectionResults?.length || 0);

    if (this.cachedDetectionResults && this.cachedDetectionResults.length > 0) {
      Logger.ui('[Advanced] Found', this.cachedDetectionResults.length, 'detections in cache');
      const firstDet = this.cachedDetectionResults[0];
      Logger.ui('[Advanced] First cached detection:', {
        hasDetector: !!firstDet.detector,
        detectorId: firstDet.detector?.id,
        detectorName: firstDet.detector?.name
      });
      return this.cachedDetectionResults;
    }

    // PRIORITY 1: Try to get from Detection section's currentResults (fastest, in-memory)
    let results = this.detectionSection && this.detectionSection.currentResults ?
      this.detectionSection.currentResults : [];

    Logger.ui('[Advanced] DETECTION RETRIEVAL STEP 1: Check detectionSection.currentResults');
    Logger.ui('[Advanced]   - detectionSection exists:', !!this.detectionSection);
    Logger.ui('[Advanced]   - currentResults length:', results.length);

    // If results found, validate structure and cache them
    if (results.length > 0) {
      Logger.ui('[Advanced] Found', results.length, 'detections in detectionSection');
      // Cache for future use
      this.cachedDetectionResults = results;
      // Log first detection structure for validation
      const firstDet = results[0];
      Logger.ui('[Advanced] First detection structure:', {
        hasDetector: !!firstDet.detector,
        detectorId: firstDet.detector?.id,
        detectorName: firstDet.detector?.name
      });
      return results;
    }

    // PRIORITY 2: Fetch from background service worker with retries
    Logger.ui('[Advanced] DETECTION RETRIEVAL STEP 2: Background fetch');
    if (!this.currentTab) {
      Logger.warn('UI', '[Advanced] No currentTab available, cannot fetch from background');
      return results;
    }

    Logger.ui('[Advanced]   - Fetching for tab ID:', this.currentTab.id, 'URL:', this.currentTab.url);

    // Try to fetch with retry logic
    let retryCount = 0;
    const maxRetries = 3;
    while (results.length === 0 && retryCount < maxRetries) {
      try {
        const response = await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            Logger.warn('UI', '[Advanced] Background message timeout after 3s');
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
              Logger.ui('[Advanced] ✓ Background response received (attempt', retryCount + 1, ')', response ? 'with data' : 'empty');
              resolve(response);
            }
          });
        });

        if (response && response.data && Array.isArray(response.data)) {
          if (response.data.length > 0) {
            results = response.data;
            Logger.ui('[Advanced] Fetched', results.length, 'detections from background');

            // Validate first detection
            const firstDet = results[0];
            Logger.ui('[Advanced] First detection from background:', {
              hasDetector: !!firstDet.detector,
              detectorId: firstDet.detector?.id,
              detectorName: firstDet.detector?.name
            });
            return results;
          } else {
            Logger.ui('[Advanced] Background returned empty array');
          }
        } else if (response && response.status === 'error') {
          Logger.warn('UI', '[Advanced] Background returned error:', response.error);
        }
      } catch (error) {
        Logger.error('UI', '[Advanced] Error in background fetch attempt', retryCount + 1, ':', error);
      }

      // Retry if failed
      if (results.length === 0 && retryCount < maxRetries - 1) {
        retryCount++;
        Logger.ui('[Advanced]   - Retrying... (attempt', retryCount + 1, 'of', maxRetries, ')');
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait before retry
      } else {
        break;
      }
    }

    Logger.ui('[Advanced] FINAL: Returning', results.length, 'detections');
    return results;
  }

  /**
   * Get available detection modules for current detections
   * @returns {Array} Array of {detection, module} objects
   */
  async getDetectionModules() {
    const detections = await this.getCurrentDetections();
    const availableTools = [];

    Logger.ui('[Advanced] CHECKING AVAILABLE MODULES');
    Logger.ui('[Advanced] Total detections to check:', detections.length);
    Logger.ui('[Advanced] Available module keys:', Object.keys(Advanced.AVAILABLE_MODULES));

    detections.forEach((detection, index) => {
      const rawDetectorId = detection.detector?.id;
      // Strip "detect-" prefix to match AVAILABLE_MODULES keys (e.g., "detect-akamai" → "akamai")
      const detectorId = rawDetectorId ? rawDetectorId.replace(/^detect-/, '') : null;
      const detectorName = detection.detector?.name;
      const hasModule = !!Advanced.AVAILABLE_MODULES[detectorId];

      Logger.ui(`[Advanced] [${index + 1}/${detections.length}] Checking:`, {
        rawDetectorId,
        detectorId,
        detectorName,
        hasModule: hasModule ? 'YES' : 'NO'
      });

      if (detectorId && Advanced.AVAILABLE_MODULES[detectorId]) {
        Logger.ui(`[Advanced]   → Adding "${detectorName}" to available tools`);
        availableTools.push({
          detection,
          module: Advanced.AVAILABLE_MODULES[detectorId]
        });
      } else if (detectorId) {
        Logger.ui(`[Advanced]   → "${detectorName}" not in AVAILABLE_MODULES (missing implementation)`);
      } else {
        Logger.warn('UI', `[Advanced]   → Detection missing detector.id!`);
      }
    });

    Logger.ui('[Advanced] MODULE CHECK COMPLETE:', {
      detectedTotal: detections.length,
      withTools: availableTools.length,
      withoutTools: detections.length - availableTools.length
    });

    return availableTools;
  }

  /**
   * Load and initialize a detection module
   * @param {string} moduleId - Module ID (e.g., 'recaptcha')
   * @param {object} detection - Detection result object
   * @returns {object} Module instance
   */
  async loadDetectionModule(moduleId, detection) {
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
  }

  /**
   * Render advanced tools interface
   */
  async renderAdvancedInterface() {
    try {
      Logger.ui('[Advanced] renderAdvancedInterface called');
      const advancedContent = document.querySelector('#advancedContent');
      const noAdvancedState = document.querySelector('#noAdvancedState');

      if (!advancedContent) {
        Logger.error('UI', '[Advanced] #advancedContent not found in DOM!');
        return;
      }
      Logger.ui('[Advanced] ✓ Found #advancedContent');

      // Show loading state
      Logger.ui('[Advanced] Setting display state...');
      advancedContent.style.display = 'flex';
      if (noAdvancedState) {
        noAdvancedState.style.display = 'none';
      }

      Logger.ui('[Advanced] Fetching detection modules...');
      const detectionTools = await this.getDetectionModules();
      Logger.ui('[Advanced] Fetching complete:', detectionTools.length, 'tools available');
      this.availableDetectionTools = detectionTools;

      // If no detections available, show empty state
      if (detectionTools.length === 0) {
        Logger.ui('[Advanced] No detection tools available (no matching modules)');
        advancedContent.style.display = 'none';
        if (noAdvancedState) {
          noAdvancedState.style.display = 'flex';
          Logger.ui('[Advanced] ✓ Showed empty state');
        }
        return;
      }

      Logger.ui('[Advanced] Found', detectionTools.length, 'available tools, rendering interface');

      // Get toolsPanel
      const toolsPanel = document.querySelector('#toolsPanel');
      if (!toolsPanel) {
        Logger.error('UI', '[Advanced] #toolsPanel not found in DOM!');
        return;
      }
      Logger.ui('[Advanced] ✓ Found #toolsPanel');

      // Generate tools HTML
      Logger.ui('[Advanced] Generating tools HTML...');
      let captchaToolsHtml = '';
      if (detectionTools.length > 0) {
        const detectionsOptions = detectionTools.map(({ detection, module }) => {
          const detectorId = detection.detector?.id;
          const displayName = detection.detector?.name || module.displayName;
          const iconPath = detection.detector?.icon ?
            chrome.runtime.getURL(`detectors/icons/${detection.detector.icon}`) : '';

          return `
            <div class="detection-option" data-detector-id="${detectorId}">
              ${iconPath ? `<img src="${iconPath}" class="detection-icon" alt="${displayName}">` : '<span class="detection-icon-placeholder"></span>'}
              <span class="detection-name">${displayName}</span>
            </div>
          `;
        }).join('');

        captchaToolsHtml = `
          <div class="captcha-tools-section">
            <!-- Compact Detection Bar (hidden by default, shown in compact mode) -->
            <div class="compact-detection-bar" id="compactDetectionBar">
              <div class="compact-detection-info">
                <img src="" class="compact-detection-icon" id="compactDetectionIcon" alt="">
                <span class="compact-detection-name" id="compactDetectionName">Detection Name</span>
              </div>
              <button class="compact-change-btn" id="changeDetectionBtn">Change</button>
            </div>

            <!-- Header with title and help button -->
            <div class="tools-panel-header">
              <div class="tools-panel-title">
                <h3>Advanced Detection Tools</h3>
                <p>Capture and analyze protection systems</p>
              </div>
              <button class="help-btn" id="showCaptchaHelp" title="Help">?</button>
            </div>

            <!-- Step 1: Select Detection -->
            <div class="workflow-section">
              <div class="workflow-step">
                <div class="step-number" id="step1Number"><span>1</span></div>
                <span class="step-label">Select Detection</span>
              </div>
              <div class="selector-card">
                <div id="detectionSelector" class="detection-selector-custom">
                  <div class="selector-display">
                    <span class="placeholder-text">Choose a detection...</span>
                  </div>
                  <div class="selector-dropdown" style="display: none;">
                    ${detectionsOptions}
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 2: Load & Use Tools -->
            <div class="workflow-section">
              <div class="workflow-step">
                <div class="step-number" id="step2Number"><span>2</span></div>
                <span class="step-label">Load & Use Tools</span>
              </div>
              <div class="btn-row">
                <button class="btn-primary-lg" id="loadDetectionTools" disabled>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,19L8,15H10.5V12H13.5V15H16L12,19Z"/>
                  </svg>
                  Load Tools
                </button>
                <button class="btn-secondary-lg" id="clearDetectionTools">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z"/>
                  </svg>
                  Clear All
                </button>
              </div>
            </div>

            <!-- Detection Tools Panel (animated reveal) -->
            <div id="detectionToolsPanel" class="detection-tools-panel-animated" style="display: none;">
              <!-- Selected detection tools will be rendered here -->
            </div>

            <!-- Clear Tools Footer (shown in compact mode) -->
            <div class="tools-clear-footer" id="toolsClearFooter">
              <button class="clear-tools-btn-footer" id="clearToolsFooter">Clear All Tools</button>
            </div>

            <!-- Help Footer -->
            <div class="help-footer">
              <button class="help-link" id="showAdvancedHelp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z"/>
                </svg>
                Learn about Advanced Tools
              </button>
            </div>
          </div>
        `;
      }

      const interfaceHtml = `
        ${captchaToolsHtml}
      `;

      // Inject into tools panel instead of entire content
      Logger.ui('[Advanced] Injecting HTML into toolsPanel...');
      toolsPanel.innerHTML = interfaceHtml;
      Logger.ui('[Advanced] ✓ HTML injected successfully');

      // Setup sub-tab listeners
      Logger.ui('[Advanced] Setting up listeners...');
      this.setupSubTabListeners();

      // Update capture count badge
      await this.updateCaptureCountBadge();

      this.setupDetectionToolsListeners();
      this.setupAdvancedEventListeners();
      Logger.ui('[Advanced] renderAdvancedInterface complete!');

    } catch (error) {
      Logger.error('UI', '[Advanced] ERROR in renderAdvancedInterface:', error);
      Logger.error('UI', '[Advanced] Stack trace:', error.stack);

      // Show error state
      const advancedContent = document.querySelector('#advancedContent');
      if (advancedContent) {
        advancedContent.style.display = 'none';
      }
      const noAdvancedState = document.querySelector('#noAdvancedState');
      if (noAdvancedState) {
        noAdvancedState.style.display = 'flex';
        noAdvancedState.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;"><strong>Error loading Advanced tools</strong><br>Check console for details</div>';
      }
    }
  }


  /**
   * Setup sub-tab navigation listeners
   */
  setupSubTabListeners() {
    const toolsTab = document.querySelector('#advancedToolsTab');
    const captureTab = document.querySelector('#advancedCaptureTab');

    if (toolsTab) {
      toolsTab.addEventListener('click', () => this.switchAdvancedTab('tools'));
    }

    if (captureTab) {
      captureTab.addEventListener('click', () => this.switchAdvancedTab('captures'));
    }
  }

  /**
   * Switch between Tools and Capture History tabs
   * @param {string} tabName - 'tools' or 'captures'
   */
  async switchAdvancedTab(tabName) {
    Logger.ui('[Advanced] Switching to tab:', tabName);

    // Update tab buttons
    const allTabs = document.querySelectorAll('.advanced-sub-tab');
    allTabs.forEach(tab => tab.classList.remove('active'));

    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }

    // Update tab panels
    const allPanels = document.querySelectorAll('.advanced-tab-panel');
    allPanels.forEach(panel => {
      panel.classList.remove('active');
      panel.style.display = 'none';
    });

    const activePanel = document.querySelector(`#${tabName}Panel`);
    if (activePanel) {
      activePanel.classList.add('active');
      activePanel.style.display = 'flex';
    }

    // If switching to captures tab, render unified history
    if (tabName === 'captures') {
      await this.renderUnifiedCaptureHistory();
    }

    // Update capture count badge
    await this.updateCaptureCountBadge();
  }

  /**
   * Update the capture count badge on the Capture History tab
   */
  async updateCaptureCountBadge() {
    try {
      const badge = document.querySelector('#captureCountBadge');
      if (!badge) return;

      // Clean expired captures first (keeps badge count in sync with displayed content)
      await this.cleanExpiredCaptureData();

      // Get all captures from all modules
      const result = await chrome.storage.local.get('scrapfly_advanced_history');
      const allHistory = result.scrapfly_advanced_history || {};

      // Always filter by current site by default
      const currentSite = await this.getCurrentSite();

      // Collect all captures with module info
      const allCaptures = [];
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          moduleHistory.forEach(capture => {
            // Only count valid captures
            if (capture && typeof capture === 'object' && capture.id && capture.timestamp) {
              allCaptures.push({
                ...capture,
                moduleId: moduleId,
                moduleName: this.getModuleName(moduleId),
                site: capture.url ? new URL(capture.url).hostname : 'unknown'
              });
            }
          });
        }
      });

      // Filter by current site only
      const currentSiteCaptures = allCaptures.filter(c => c.site === currentSite);
      const countToShow = currentSiteCaptures.length;

      if (countToShow > 0) {
        badge.textContent = countToShow;
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error updating capture count:', error);
    }
  }

  /**
   * Clean expired captures from history (30 minute expiry)
   * Automatically removes captures that have passed their expiration time
   */
  async cleanExpiredCaptureData() {
    try {
      const result = await chrome.storage.local.get('scrapfly_advanced_history');
      let allHistory = result.scrapfly_advanced_history || {};

      if (!allHistory || Object.keys(allHistory).length === 0) {
        return; // No data to clean
      }

      const now = Date.now();
      let hadExpiredData = false;

      // Clean each module's history
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          const originalLength = moduleHistory.length;

          // Filter out expired items
          allHistory[moduleId] = moduleHistory.filter(capture => {
            // Keep items without expiry or that haven't expired yet
            if (!capture.expiresAt) {
              return true; // Keep items without expiry
            }
            const isExpired = capture.expiresAt <= now;
            if (isExpired) {
              hadExpiredData = true;
            }
            return !isExpired;
          });

          // Log cleanup if items were removed
          if (allHistory[moduleId].length < originalLength) {
            const removedCount = originalLength - allHistory[moduleId].length;
            Logger.ui(`[Advanced] Cleaned ${removedCount} expired captures from ${moduleId}`);
          }
        }
      });

      // Save cleaned history if any items were removed
      if (hadExpiredData) {
        await chrome.storage.local.set({
          scrapfly_advanced_history: allHistory
        });
        Logger.ui('[Advanced] ✓ Expired capture data cleaned and saved');
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error cleaning expired captures:', error);
    }
  }

  /**
   * Render unified capture history from all modules with filters and search
   */
  async renderUnifiedCaptureHistory() {
    Logger.ui('[Advanced] Rendering unified capture history');
    const capturesPanel = document.querySelector('#capturesPanel');
    if (!capturesPanel) return;

    // Initialize filter state if not exists
    if (!this.captureFilters) {
      this.captureFilters = {
        site: 'current',
        module: 'all',
        date: 'all',
        sort: 'newest',
        search: ''
      };
    }

    try {
      // Clean expired captures before rendering
      await this.cleanExpiredCaptureData();

      // Get current site
      const currentSite = await this.getCurrentSite();

      // Get all captures from storage
      const result = await chrome.storage.local.get('scrapfly_advanced_history');
      let allHistory = result.scrapfly_advanced_history || {};

      // MIGRATION: Convert old { items: [] } format to new { moduleId: [] } format
      if (allHistory.items && Array.isArray(allHistory.items)) {
        Logger.ui('[Advanced] Migrating old storage format to new format');
        const migratedHistory = {};

        // Group items by type (moduleId)
        for (const item of allHistory.items) {
          if (!item.type) continue;

          const moduleId = item.type;
          if (!migratedHistory[moduleId]) {
            migratedHistory[moduleId] = [];
          }

          // Convert to new format
          migratedHistory[moduleId].push({
            id: item.id || `${moduleId}_${item.timestamp}`,
            timestamp: item.timestamp,
            url: item.url,
            data: item.captureData || item.data,
            expiresAt: item.expiresAt
          });
        }

        allHistory = migratedHistory;

        // Save migrated format back to storage
        await chrome.storage.local.set({
          scrapfly_advanced_history: migratedHistory
        });

        Logger.ui('[Advanced] Migration complete:', Object.keys(allHistory));
      }

      // Collect all captures with module info
      const allCaptures = [];
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          moduleHistory.forEach(capture => {
            allCaptures.push({
              ...capture,
              moduleId: moduleId,
              moduleName: this.getModuleName(moduleId),
              site: capture.url ? new URL(capture.url).hostname : 'unknown'
            });
          });
        }
      });

      // Apply filters
      let filteredCaptures = this.applyFilters(allCaptures, currentSite);

      // Render empty state if no captures
      if (allCaptures.length === 0) {
        this.renderEmptyState(capturesPanel);
        return;
      }

      // Render no results if filtered out everything
      if (filteredCaptures.length === 0 && allCaptures.length > 0) {
        this.renderNoResults(capturesPanel);
        return;
      }

      // Setup site filter options
      this.updateSiteFilterOptions(allCaptures, currentSite);

      // Update filter banner
      this.updateFilterBanner(currentSite);

      // Render filtered captures
      this.renderCaptureCards(filteredCaptures, capturesPanel);

      // Setup event listeners
      this.setupCaptureHistoryListeners();

    } catch (error) {
      Logger.error('UI', '[Advanced] Error rendering unified capture history:', error);
      capturesPanel.innerHTML = `
        <div class="error-state">
          <p>Error loading captures: ${error.message}</p>
        </div>
      `;
    }
  }

  /**
   * Get current site hostname
   * @returns {string|null} Current site hostname
   */
  async getCurrentSite() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        return new URL(tab.url).hostname;
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error getting current site:', error);
    }
    return null;
  }

  /**
   * Apply all active filters to captures
   * @param {Array} captures - Array of capture objects
   * @param {string} currentSite - Current site hostname
   * @returns {Array} Filtered captures
   */
  applyFilters(captures, currentSite) {
    let filtered = [...captures];

    // Site filter
    if (this.captureFilters.site === 'current' && currentSite) {
      filtered = filtered.filter(c => c.site === currentSite);
    } else if (this.captureFilters.site !== 'all' && this.captureFilters.site !== 'current') {
      filtered = filtered.filter(c => c.site === this.captureFilters.site);
    }

    // Module filter
    if (this.captureFilters.module !== 'all') {
      filtered = filtered.filter(c => c.moduleId === this.captureFilters.module);
    }

    // Date filter
    if (this.captureFilters.date !== 'all') {
      const now = Date.now();
      const ranges = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      const range = ranges[this.captureFilters.date];
      if (range) {
        filtered = filtered.filter(c => (now - c.timestamp) <= range);
      }
    }

    // Search filter
    if (this.captureFilters.search) {
      const query = this.captureFilters.search.toLowerCase();
      filtered = filtered.filter(c => {
        const searchableText = [
          c.url || '',
          c.site || '',
          c.moduleName || '',
          c.moduleId || '',
          JSON.stringify(c.data || {})
        ].join(' ').toLowerCase();
        return searchableText.includes(query);
      });
    }

    // Sort
    switch (this.captureFilters.sort) {
      case 'newest':
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        break;
      case 'oldest':
        filtered.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        break;
      case 'site':
        filtered.sort((a, b) => (a.site || '').localeCompare(b.site || ''));
        break;
      case 'module':
        filtered.sort((a, b) => (a.moduleName || '').localeCompare(b.moduleName || ''));
        break;
      case 'size':
        filtered.sort((a, b) => {
          const sizeA = JSON.stringify(a.data || {}).length;
          const sizeB = JSON.stringify(b.data || {}).length;
          return sizeB - sizeA;
        });
        break;
    }

    return filtered;
  }

  /**
   * Update site filter dropdown options
   * @param {Array} captures - All captures
   * @param {string} currentSite - Current site hostname
   */
  updateSiteFilterOptions(captures, currentSite) {
    const siteFilter = document.querySelector('#captureSiteFilter');
    if (!siteFilter) return;

    // Build options HTML - only show "All Sites" and "Current Site"
    let optionsHtml = `
      <option value="all">All Sites</option>
      <option value="current" ${this.captureFilters.site === 'current' ? 'selected' : ''} data-site="${currentSite || ''}">
        Current Site ${currentSite ? `(${currentSite})` : ''}
      </option>
    `;

    siteFilter.innerHTML = optionsHtml;
  }

  /**
   * Update filter info banner
   * @param {string} currentSite - Current site hostname
   */
  updateFilterBanner(currentSite) {
    const banner = document.querySelector('#captureFilterBanner');
    const bannerText = document.querySelector('#filterBannerText');

    if (!banner || !bannerText) return;

    if (this.captureFilters.site === 'current' && currentSite) {
      banner.style.display = 'flex';
      // Use safe DOM manipulation to avoid XSS
      bannerText.textContent = '';
      bannerText.appendChild(document.createTextNode('Showing captures from '));
      const strong = document.createElement('strong');
      strong.textContent = currentSite;
      bannerText.appendChild(strong);
    } else if (this.captureFilters.site !== 'all' && this.captureFilters.site !== 'current') {
      banner.style.display = 'flex';
      // Use safe DOM manipulation to avoid XSS
      bannerText.textContent = '';
      bannerText.appendChild(document.createTextNode('Showing captures from '));
      const strong = document.createElement('strong');
      strong.textContent = this.captureFilters.site;
      bannerText.appendChild(strong);
    } else {
      banner.style.display = 'none';
    }
  }

  /**
   * Render empty state
   * @param {HTMLElement} container - Container element
   */
  renderEmptyState(container) {
    container.innerHTML = `
      <div id="captureEmptyState" class="empty-state">
        <div class="empty-state-card">
          <div class="empty-state-icon">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <path d="M28 10L12 18V28C12 38 18 46 28 48C38 46 44 38 44 28V18L28 10Z" stroke="#3b82f6" stroke-width="2" fill="rgba(59,130,246,0.1)"/>
              <circle cx="28" cy="28" r="8" fill="#3b82f6"/>
            </svg>
          </div>
          <h3 class="empty-state-title">No captures yet</h3>
          <p class="empty-state-text">Use the Tools tab to capture data from detected anti-bot systems, CAPTCHAs, and fingerprinting technologies.</p>
          <div class="empty-state-footnote">Captures are stored for 30 minutes</div>
        </div>
      </div>
    `;
  }

  /**
   * Render no results state
   * @param {HTMLElement} container - Container element
   */
  renderNoResults(container) {
    const grid = container.querySelector('#captureGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div id="captureNoResults" class="capture-no-results">
        <div class="no-results-icon"></div>
        <h3 class="no-results-title">No captures found</h3>
        <p class="no-results-text">Try adjusting your filters or search query to find captures.</p>
        <button id="resetAllFiltersBtn" class="reset-filters-btn">Reset All Filters</button>
      </div>
    `;

    // Add reset listener
    const resetBtn = document.querySelector('#resetAllFiltersBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetAllFilters());
    }
  }

  /**
   * Render capture cards
   * @param {Array} captures - Filtered captures
   * @param {HTMLElement} container - Container element
   */
  renderCaptureCards(captures, container) {
    const grid = container.querySelector('#captureGrid');
    if (!grid) return;

    const capturesHtml = captures.map(capture => {
      const moduleName = capture.moduleName || capture.moduleId || 'Unknown';
      const moduleClass = capture.moduleId || 'unknown';
      const timestamp = AdvancedUtils.getTimeAgo(capture.timestamp);
      const url = capture.url || 'No URL';
      const site = capture.site || 'unknown';
      const size = AdvancedUtils.formatBytes(JSON.stringify(capture.data || {}).length);
      const favicon = AdvancedUtils.getFaviconUrl(url);

      return `
        <div class="capture-card" data-module-id="${capture.moduleId}" data-capture-id="${capture.id}">
          <div class="capture-card-header">
            <div class="capture-card-badges">
              <span class="capture-module-badge ${moduleClass}">${moduleName}</span>
              <span class="capture-site-badge">${site}</span>
            </div>
          </div>
          <div class="capture-card-body">
            <div class="capture-url-row">
              <img src="${favicon}" class="capture-url-favicon" alt="Favicon" data-hide-on-error="true">
              <span class="capture-url-text" title="${AdvancedUtils.escapeHtml(url)}">${AdvancedUtils.truncate(url, 60)}</span>
            </div>
            <div class="capture-meta-row">
              <span class="capture-size">${size}</span>
              <span class="capture-timestamp">${timestamp}</span>
            </div>
          </div>
          <div class="capture-card-actions">
            <button class="capture-action-btn view-btn" data-action="view">
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" fill="currentColor"/></svg>
              View
            </button>
            <button class="capture-action-btn copy-btn" data-action="copy">
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>
              Copy
            </button>
            <button class="capture-action-btn delete-btn" data-action="delete">
              <svg width="14" height="14" viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" fill="currentColor"/></svg>
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    grid.innerHTML = capturesHtml;

    // CSP-compliant image error handling
    grid.querySelectorAll('img[data-hide-on-error]').forEach(img => {
      img.addEventListener('error', function() {
        this.style.display = 'none';
      }, { once: true });
    });

    // Add click listeners
    this.setupCaptureCardListeners();
  }

  /**
   * Setup capture card action listeners
   */
  setupCaptureCardListeners() {
    const cards = document.querySelectorAll('.capture-card');

    cards.forEach(card => {
      const viewBtn = card.querySelector('[data-action="view"]');
      const copyBtn = card.querySelector('[data-action="copy"]');
      const deleteBtn = card.querySelector('[data-action="delete"]');

      const moduleId = card.getAttribute('data-module-id');
      const captureId = card.getAttribute('data-capture-id');

      // Main card click - opens modal when clicking anywhere on the card
      card.addEventListener('click', (e) => {
        // Don't trigger if clicking on action buttons
        if (!e.target.closest('.capture-action-btn')) {
          this.viewCaptureDetails(moduleId, captureId);
        }
      });

      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.viewCaptureDetails(moduleId, captureId);
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.copyCaptureData(moduleId, captureId);
        });
      }

      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.deleteSingleCapture(moduleId, captureId);
        });
      }
    });
  }

  /**
   * View capture details in modal
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
  async viewCaptureDetails(moduleId, captureId) {
    try {
      // Get the capture data
      const result = await chrome.storage.local.get('scrapfly_advanced_history');
      let allHistory = result.scrapfly_advanced_history || {};

      // MIGRATION: Convert old { items: [] } format to new { moduleId: [] } format
      if (allHistory.items && Array.isArray(allHistory.items)) {
        Logger.ui('[Advanced] viewCaptureDetails: Migrating old storage format to new format');
        const migratedHistory = {};

        // Group items by type (moduleId)
        for (const item of allHistory.items) {
          if (!item.type) continue;

          const itemModuleId = item.type;
          if (!migratedHistory[itemModuleId]) {
            migratedHistory[itemModuleId] = [];
          }

          // Convert to new format
          migratedHistory[itemModuleId].push({
            id: item.id || `${itemModuleId}_${item.timestamp}`,
            timestamp: item.timestamp,
            url: item.url,
            data: item.captureData || item.data,
            expiresAt: item.expiresAt
          });
        }

        allHistory = migratedHistory;

        // Save migrated format back to storage
        await chrome.storage.local.set({
          scrapfly_advanced_history: migratedHistory
        });

        Logger.ui('[Advanced] viewCaptureDetails: Migration complete:', Object.keys(allHistory));
      }

      const moduleHistory = allHistory[moduleId] || [];
      const captureData = moduleHistory.find(c => c.id === captureId);

      if (!captureData) {
        NotificationHelper.error('Capture not found');
        return;
      }

      // Load the module instance if needed
      if (!this.loadedModules[moduleId]) {
        // Create a temporary detection object for viewing captures
        const detector = this.detectorManager.findDetectorById(moduleId);
        if (!detector) {
          NotificationHelper.error('Detector not found: ' + moduleId);
          return;
        }

        const tempDetection = {
          detector: detector,
          confidence: 100,
          methods: []
        };

        await this.loadDetectionModule(moduleId, tempDetection);
      }

      const moduleInstance = this.loadedModules[moduleId];
      if (!moduleInstance) {
        NotificationHelper.error('Module class not found. Please ensure the module is properly loaded.');
        return;
      }

      if (moduleInstance.renderCaptureDetailsContent && moduleInstance.displayCaptureDetailsModal) {
        // Transform capture data to match module expectations
        // Storage format: { id, timestamp, url, data, expiresAt }
        // Module expects: { timestamp, url, captureData, ... }
        const transformedCaptureData = {
          timestamp: captureData.timestamp,
          url: captureData.url,
          captureData: captureData.data || {},
          ...captureData  // Include all other properties for module-specific use
        };

        const detailsContent = moduleInstance.renderCaptureDetailsContent(transformedCaptureData);
        moduleInstance.displayCaptureDetailsModal(captureData.id, detailsContent);
      } else {
        NotificationHelper.info('Details view not available for this module');
      }
    } catch (error) {
      Logger.error('UI', '[Advanced] Error viewing capture details:', error);
      NotificationHelper.error('Failed to view capture details');
    }
  }

  /**
   * Copy capture data to clipboard
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
  async copyCaptureData(moduleId, captureId) {
    try {
      const result = await chrome.storage.local.get('scrapfly_advanced_history');
      const moduleHistory = result.scrapfly_advanced_history?.[moduleId] || [];
      const captureData = moduleHistory.find(c => c.id === captureId);

      if (!captureData) {
        NotificationHelper.error('Capture not found');
        return;
      }

      await AdvancedUtils.copyToClipboard(JSON.stringify(captureData, null, 2));
      NotificationHelper.success('Capture data copied to clipboard');
    } catch (error) {
      Logger.error('UI', '[Advanced] Error copying capture:', error);
      NotificationHelper.error('Failed to copy capture data');
    }
  }

  /**
   * Delete single capture
   * @param {string} moduleId - Module ID
   * @param {string} captureId - Capture ID
   */
  async deleteSingleCapture(moduleId, captureId) {
    try {
      const result = await chrome.storage.local.get('scrapfly_advanced_history');
      const allHistory = result.scrapfly_advanced_history || {};
      const moduleHistory = allHistory[moduleId] || [];

      // Filter out the capture
      allHistory[moduleId] = moduleHistory.filter(c => c.id !== captureId);

      await chrome.storage.local.set({ scrapfly_advanced_history: allHistory });

      NotificationHelper.success('Capture deleted');

      // Re-render
      await this.renderUnifiedCaptureHistory();
      await this.updateCaptureCountBadge();
    } catch (error) {
      Logger.error('UI', '[Advanced] Error deleting capture:', error);
      NotificationHelper.error('Failed to delete capture');
    }
  }

  /**
   * Export all filtered captures
   */
  async exportCaptures() {
    try {
      const currentSite = await this.getCurrentSite();
      const result = await chrome.storage.local.get('scrapfly_advanced_history');
      const allHistory = result.scrapfly_advanced_history || {};

      // Collect all captures
      const allCaptures = [];
      Object.entries(allHistory).forEach(([moduleId, moduleHistory]) => {
        if (Array.isArray(moduleHistory)) {
          moduleHistory.forEach(capture => {
            allCaptures.push({
              ...capture,
              moduleId,
              moduleName: this.getModuleName(moduleId),
              site: capture.url ? new URL(capture.url).hostname : 'unknown'
            });
          });
        }
      });

      // Apply current filters
      const filteredCaptures = this.applyFilters(allCaptures, currentSite);

      if (filteredCaptures.length === 0) {
        NotificationHelper.warning('No captures to export');
        return;
      }

      // Export as JSON
      const exportData = {
        exported: new Date().toISOString(),
        count: filteredCaptures.length,
        filters: this.captureFilters,
        captures: filteredCaptures
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrapfly-captures-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);

      NotificationHelper.success(`Exported ${filteredCaptures.length} captures`);
    } catch (error) {
      Logger.error('UI', '[Advanced] Error exporting captures:', error);
      NotificationHelper.error('Failed to export captures');
    }
  }

  /**
   * Show warning confirmation modal
   * @param {string} message - Confirmation message
   * @param {string} title - Modal title
   * @returns {Promise<boolean>} True if confirmed, false if cancelled
   */
  showWarningConfirmation(message, title = 'Mensaje de la extensión Scrapfly') {
    return new Promise((resolve) => {
      // Create modal HTML
      const modalHtml = `
        <div class="confirmation-modal-overlay" id="confirmationModalOverlay">
          <div class="confirmation-modal">
            <div class="confirmation-modal-header">
              <div class="confirmation-modal-icon"></div>
              <h3 class="confirmation-modal-title">${title}</h3>
            </div>
            <div class="confirmation-modal-content">
              <p class="confirmation-modal-message">${message}</p>
            </div>
            <div class="confirmation-modal-footer">
              <button class="confirmation-modal-btn confirmation-modal-btn-cancel" id="confirmCancelBtn">
                Cancelar
              </button>
              <button class="confirmation-modal-btn confirmation-modal-btn-danger" id="confirmAcceptBtn">
                Aceptar
              </button>
            </div>
          </div>
        </div>
      `;

      // Add modal to document
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      const overlay = document.getElementById('confirmationModalOverlay');
      const cancelBtn = document.getElementById('confirmCancelBtn');
      const acceptBtn = document.getElementById('confirmAcceptBtn');

      // Handle cancel
      const handleCancel = () => {
        overlay.remove();
        resolve(false);
      };

      // Handle accept
      const handleAccept = () => {
        overlay.remove();
        resolve(true);
      };

      // Click handlers
      cancelBtn.addEventListener('click', handleCancel);
      acceptBtn.addEventListener('click', handleAccept);

      // Click on overlay background to cancel
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }
      });

      // ESC key to cancel
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', handleEscape);
          handleCancel();
        }
      };
      document.addEventListener('keydown', handleEscape);

      // Focus accept button
      setTimeout(() => acceptBtn.focus(), 0);
    });
  }

  /**
   * Clear all captures
   */
  async clearAllCaptures() {
    try {
      // Show warning confirmation modal
      const confirmed = await this.showWarningConfirmation(
        'Are you sure you want to delete all captures? This cannot be undone.'
      );
      if (!confirmed) return;

      await chrome.storage.local.set({ scrapfly_advanced_history: {} });

      NotificationHelper.success('All captures cleared');

      // Re-render
      await this.renderUnifiedCaptureHistory();
      await this.updateCaptureCountBadge();
    } catch (error) {
      Logger.error('UI', '[Advanced] Error clearing captures:', error);
      NotificationHelper.error('Failed to clear captures');
    }
  }

  /**
   * Reset all filters
   */
  async resetAllFilters() {
    this.captureFilters = {
      site: 'current',
      module: 'all',
      date: 'all',
      sort: 'newest',
      search: ''
    };

    // Update UI
    const siteFilter = document.querySelector('#captureSiteFilter');
    const moduleFilter = document.querySelector('#captureModuleFilter');
    const sortFilter = document.querySelector('#captureSortFilter');
    const searchInput = document.querySelector('#captureSearchInput');

    if (siteFilter) siteFilter.value = 'current';
    if (moduleFilter) moduleFilter.value = 'all';
    if (sortFilter) sortFilter.value = 'newest';
    if (searchInput) searchInput.value = '';

    // Re-render
    await this.renderUnifiedCaptureHistory();
  }

  /**
   * Setup capture history event listeners
   */
  setupCaptureHistoryListeners() {
    // Export button
    const exportBtn = document.querySelector('#exportCapturesBtn');
    if (exportBtn) {
      exportBtn.removeEventListener('click', this._exportHandler);
      this._exportHandler = () => this.exportCaptures();
      exportBtn.addEventListener('click', this._exportHandler);
    }

    // Clear all button
    const clearBtn = document.querySelector('#clearAllCapturesBtn');
    if (clearBtn) {
      clearBtn.removeEventListener('click', this._clearAllHandler);
      this._clearAllHandler = () => this.clearAllCaptures();
      clearBtn.addEventListener('click', this._clearAllHandler);
    }

    // Site filter
    const siteFilter = document.querySelector('#captureSiteFilter');
    if (siteFilter) {
      siteFilter.removeEventListener('change', this._siteFilterHandler);
      this._siteFilterHandler = (e) => {
        this.captureFilters.site = e.target.value;
        this.renderUnifiedCaptureHistory();
      };
      siteFilter.addEventListener('change', this._siteFilterHandler);
    }

    // Module filter
    const moduleFilter = document.querySelector('#captureModuleFilter');
    if (moduleFilter) {
      moduleFilter.removeEventListener('change', this._moduleFilterHandler);
      this._moduleFilterHandler = (e) => {
        this.captureFilters.module = e.target.value;
        this.renderUnifiedCaptureHistory();
      };
      moduleFilter.addEventListener('change', this._moduleFilterHandler);
    }

    // Date filter removed from UI
    // const dateFilter = document.querySelector('#captureDateFilter');
    // if (dateFilter) {
    //   dateFilter.removeEventListener('change', this._dateFilterHandler);
    //   this._dateFilterHandler = (e) => {
    //     this.captureFilters.date = e.target.value;
    //     this.renderUnifiedCaptureHistory();
    //   };
    //   dateFilter.addEventListener('change', this._dateFilterHandler);
    // }

    // Sort filter
    const sortFilter = document.querySelector('#captureSortFilter');
    if (sortFilter) {
      sortFilter.removeEventListener('change', this._sortFilterHandler);
      this._sortFilterHandler = (e) => {
        this.captureFilters.sort = e.target.value;
        this.renderUnifiedCaptureHistory();
      };
      sortFilter.addEventListener('change', this._sortFilterHandler);
    }

    // Search input (with debounce)
    const searchInput = document.querySelector('#captureSearchInput');
    if (searchInput) {
      searchInput.removeEventListener('input', this._searchHandler);
      let searchTimeout;
      this._searchHandler = (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.captureFilters.search = e.target.value;
          this.renderUnifiedCaptureHistory();
        }, 300);
      };
      searchInput.addEventListener('input', this._searchHandler);
    }

    // Show all sites button
    const showAllBtn = document.querySelector('#showAllSitesBtn');
    if (showAllBtn) {
      showAllBtn.removeEventListener('click', this._showAllHandler);
      this._showAllHandler = () => {
        this.captureFilters.site = 'all';
        const siteFilter = document.querySelector('#captureSiteFilter');
        if (siteFilter) siteFilter.value = 'all';
        this.renderUnifiedCaptureHistory();
      };
      showAllBtn.addEventListener('click', this._showAllHandler);
    }
  }

  /**
   * Setup click listeners for unified capture cards
   */
  setupUnifiedCaptureClickListeners() {
    const captureCards = document.querySelectorAll('.capture-card');
    captureCards.forEach(card => {
      card.addEventListener('click', async () => {
        const moduleId = card.getAttribute('data-module-id');
        const captureId = card.getAttribute('data-capture-id');

        // Use the viewCaptureDetails method which handles module loading properly
        await this.viewCaptureDetails(moduleId, captureId);
      });
    });
  }


  /**
   * Get module display name from module ID
   * @param {string} moduleId - Module ID
   * @returns {string} Module display name
   */
  getModuleName(moduleId) {
    const moduleInfo = Advanced.AVAILABLE_MODULES[moduleId];
    return moduleInfo ? moduleInfo.displayName.replace(' Tools', '') : moduleId;
  }

  /**
   * Update workflow step state (completed or not)
   * @param {number} step - Step number (1 or 2)
   * @param {boolean} completed - Whether the step is completed
   */
  updateStepState(step, completed) {
    const stepEl = document.getElementById(`step${step}Number`);
    if (!stepEl) return;

    if (completed) {
      stepEl.classList.add('completed');
      // The CSS ::after will show the checkmark
    } else {
      stepEl.classList.remove('completed');
    }
  }

  /**
   * Reset all workflow steps to initial state
   */
  resetWorkflowSteps() {
    this.updateStepState(1, false);
    this.updateStepState(2, false);
  }

  /**
   * Setup detection tools selection listeners
   */
  setupDetectionToolsListeners() {
    const selector = document.querySelector('#detectionSelector');
    const loadBtn = document.querySelector('#loadDetectionTools');
    const clearBtn = document.querySelector('#clearDetectionTools');

    if (selector) {
      const display = selector.querySelector('.selector-display');
      const dropdown = selector.querySelector('.selector-dropdown');
      const options = selector.querySelectorAll('.detection-option');

      if (display) {
        display.addEventListener('click', () => {
          const isOpen = dropdown.style.display === 'block';
          dropdown.style.display = isOpen ? 'none' : 'block';
          selector.classList.toggle('open', !isOpen);
        });
      }

      options.forEach(option => {
        option.addEventListener('click', () => {
          const detectorId = option.getAttribute('data-detector-id');
          const iconHtml = option.querySelector('.detection-icon, .detection-icon-placeholder')?.outerHTML || '';
          const name = option.querySelector('.detection-name')?.textContent || '';

          if (display) {
            // Using innerHTML with controlled content from DOM elements (safe - no user input)
            display.innerHTML = `${iconHtml}<span class="selected-name">${name}</span>`;
            display.setAttribute('data-selected', detectorId);
          }

          dropdown.style.display = 'none';
          selector.classList.remove('open');

          if (loadBtn) {
            loadBtn.disabled = false;
          }

          // Mark step 1 as completed when a detection is selected
          this.updateStepState(1, true);
        });
      });

      document.addEventListener('click', (e) => {
        if (!selector.contains(e.target)) {
          dropdown.style.display = 'none';
          selector.classList.remove('open');
        }
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener('click', () => this.loadSelectedDetectionTools());
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearDetectionToolsPanel());
    }

    // Compact mode buttons
    const changeBtn = document.getElementById('changeDetectionBtn');
    if (changeBtn) {
      changeBtn.addEventListener('click', () => this.clearDetectionToolsPanel());
    }

    const clearFooterBtn = document.getElementById('clearToolsFooter');
    if (clearFooterBtn) {
      clearFooterBtn.addEventListener('click', () => this.clearDetectionToolsPanel());
    }
  }

  /**
   * Load tools for selected detection
   */
  async loadSelectedDetectionTools() {
    Logger.ui('[Advanced] loadSelectedDetectionTools called');

    // Clean expired captures when loading tools
    await this.cleanExpiredCaptureData();

    const selector = document.querySelector('#detectionSelector');
    const panel = document.querySelector('#detectionToolsPanel');

    if (!selector || !panel) {
      Logger.error('UI', '[Advanced] Required elements not found:', { selector: !!selector, panel: !!panel });
      return;
    }

    const display = selector.querySelector('.selector-display');
    const detectorId = display?.getAttribute('data-selected');
    Logger.ui('[Advanced] Selected detector ID:', detectorId);

    if (!detectorId) {
      Logger.warn('UI', '[Advanced] No detector selected');
      NotificationHelper.warning('Please select a detection first');
      return;
    }

    const selected = this.availableDetectionTools.find(({ detection }) => detection.detector?.id === detectorId);
    Logger.ui('[Advanced] Found selected tool:', selected);

    if (!selected) {
      Logger.error('UI', '[Advanced] Selected tool not found in availableDetectionTools');
      return;
    }

    const { detection, module } = selected;
    const moduleInstance = await this.loadDetectionModule(detectorId, detection);

    if (moduleInstance && moduleInstance.renderTools) {
      // Render tools only (capture history is now in separate tab)
      const toolsContent = moduleInstance.renderTools();

      panel.innerHTML = toolsContent;
      panel.style.display = 'block';

      // Enable compact mode to save vertical space
      const section = document.querySelector('.captcha-tools-section');
      if (section) {
        section.classList.add('compact-mode');
      }

      // Update compact bar with selected detection info
      const compactIcon = document.getElementById('compactDetectionIcon');
      const compactName = document.getElementById('compactDetectionName');
      if (compactIcon && detection.detector?.icon) {
        compactIcon.src = chrome.runtime.getURL(`detectors/icons/${detection.detector.icon}`);
        compactIcon.style.display = 'block';
      } else if (compactIcon) {
        compactIcon.style.display = 'none';
      }
      if (compactName) {
        compactName.textContent = detection.detector?.name || detectorId;
      }

      // Mark step 2 as completed when tools are loaded
      this.updateStepState(2, true);

      // Store the active module reference
      this.activeModule = moduleInstance;

      if (moduleInstance.setupEventListeners) {
        moduleInstance.setupEventListeners();
      }

      this.selectedDetection = detectorId;
      this.currentModuleInstance = moduleInstance;

      // Check for pending analysis results (AWS WAF analyze scripts)
      if (moduleInstance.checkPendingAnalysisResults) {
        await moduleInstance.checkPendingAnalysisResults();
      }

      // Hide explanation section when tools are loaded
      const explanation = document.querySelector('#toolsExplanation');
      if (explanation) {
        explanation.style.display = 'none';
      }

      NotificationHelper.success(AdvancedUtils.notifications.moduleLoaded(detection.detector?.name || detectorId));
    }
  }

  /**
   * Clear detection tools panel
   */
  clearDetectionToolsPanel() {
    const panel = document.querySelector('#detectionToolsPanel');
    const selector = document.querySelector('#detectionSelector');
    const loadBtn = document.querySelector('#loadDetectionTools');

    if (panel) {
      panel.innerHTML = '';
      panel.style.display = 'none';
    }

    if (selector) {
      const display = selector.querySelector('.selector-display');
      const dropdown = selector.querySelector('.selector-dropdown');

      if (display) {
        display.innerHTML = '<span class="placeholder-text">Select a detection...</span>';
        display.removeAttribute('data-selected');
      }

      if (dropdown) {
        dropdown.style.display = 'none';
      }

      selector.classList.remove('open');
    }

    if (loadBtn) {
      loadBtn.disabled = true;
    }

    this.selectedDetection = null;
    this.activeModule = null; // Clear active module reference
    this.loadedModules = {};

    // Disable compact mode to show full workflow UI
    const section = document.querySelector('.captcha-tools-section');
    if (section) {
      section.classList.remove('compact-mode');
    }

    // Reset workflow steps to initial state
    this.resetWorkflowSteps();

    // Show explanation section when tools are cleared
    const explanation = document.querySelector('#toolsExplanation');
    if (explanation) {
      explanation.style.display = 'block';
    }
  }

  /**
   * Restore previously selected detection after popup reopens
   * Note: Selection is no longer persisted - user must reselect each time
   */
  async restoreSelectedDetection() {
    // Selection persistence removed - each popup open starts fresh
  }

  /**
   * Show help information for CAPTCHA tools
   */
  showCaptchaHelp() {
    this.openAdvancedInfoModal();
  }

  /**
   * Open Advanced Info Modal
   */
  openAdvancedInfoModal() {
    const modal = document.querySelector('#advancedInfoModal');
    if (modal) {
      modal.style.display = 'flex';
      // CSS fadeIn animation handles the fade-in effect automatically
    }
  }

  /**
   * Close Advanced Info Modal
   */
  closeAdvancedInfoModal() {
    const modal = document.querySelector('#advancedInfoModal');
    if (modal) {
      modal.style.display = 'none';
      // Reset opacity for next open (CSS fadeIn animation handles the fade in)
      modal.style.opacity = '1';
    }
  }

  /**
   * Setup Advanced Info Modal event listeners
   */
  setupAdvancedInfoModalListeners() {
    // Help icon (? button) in empty state - opens info modal
    const helpIcon = document.querySelector('.empty-state-help');
    if (helpIcon) {
      helpIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openAdvancedInfoModal();
      });
    }

    // Close button
    const closeBtn = document.querySelector('#closeAdvancedInfoModal');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent event bubbling
        e.preventDefault(); // Prevent default button behavior
        this.closeAdvancedInfoModal();
      });
    }

    // Overlay click to close (only when clicking overlay itself, not children)
    const modal = document.querySelector('#advancedInfoModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        // Only close if clicking the modal background, not the container
        if (e.target === modal || e.target.classList.contains('advanced-info-overlay')) {
          this.closeAdvancedInfoModal();
        }
      });
    }

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.querySelector('#advancedInfoModal');
        if (modal && modal.style.display === 'flex') {
          this.closeAdvancedInfoModal();
        }
      }
    });
  }

  /**
   * Setup event listeners for advanced tools
   */
  setupAdvancedEventListeners() {
    // Help button (in header)
    const helpBtn = document.querySelector('#showCaptchaHelp');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => this.showCaptchaHelp());
    }

    // Help footer link
    const helpFooterBtn = document.querySelector('#showAdvancedHelp');
    if (helpFooterBtn) {
      helpFooterBtn.addEventListener('click', () => this.showCaptchaHelp());
    }

    // Modal listeners are set up in loadHTML() after template loads
    // Don't call setupAdvancedInfoModalListeners() here to avoid duplicate listeners

    // Deep analysis button
    const runDeepAnalysisBtn = document.querySelector('#runDeepAnalysis');
    if (runDeepAnalysisBtn) {
      runDeepAnalysisBtn.addEventListener('click', () => this.runDeepAnalysis());
    }

    // Export options button
    const showExportBtn = document.querySelector('#showExportOptions');
    if (showExportBtn) {
      showExportBtn.addEventListener('click', () => this.showExportModal());
    }

    // Generate report button
    const generateReportBtn = document.querySelector('#generateReport');
    if (generateReportBtn) {
      generateReportBtn.addEventListener('click', () => this.generateSecurityReport());
    }

    // Bypass analysis button
    const analyzeBypassBtn = document.querySelector('#analyzeBypass');
    if (analyzeBypassBtn) {
      analyzeBypassBtn.addEventListener('click', () => this.analyzeBypassTechniques());
    }

    // Clear results button
    const clearResultsBtn = document.querySelector('#clearResults');
    if (clearResultsBtn) {
      clearResultsBtn.addEventListener('click', () => this.clearAnalysisResults());
    }

    // Export modal handlers
    const closeExportBtn = document.querySelector('#closeExportModal');
    if (closeExportBtn) {
      closeExportBtn.addEventListener('click', () => this.hideExportModal());
    }

    // Export option handlers
    document.querySelectorAll('.export-option').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const format = e.target.dataset.format;
        this.exportData(format);
      });
    });
  }

  /**
   * Run deep analysis with advanced algorithms
   */
  async runDeepAnalysis() {
    if (this.isRunningAnalysis) return;

    this.isRunningAnalysis = true;
    const btn = document.querySelector('#runDeepAnalysis');
    const btnText = btn?.querySelector('.btn-text');
    const btnSpinner = btn?.querySelector('.btn-spinner');

    try {
      // Update UI to show loading
      if (btnText) btnText.textContent = 'Analyzing...';
      if (btnSpinner) btnSpinner.style.display = 'block';
      if (btn) btn.disabled = true;

      // Get current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found');

      // Simulate deep analysis (in real implementation, this would be more comprehensive)
      Logger.ui('Running deep analysis on:', tab.url);

      const analysisData = await this.performDeepAnalysis(tab);
      this.displayAnalysisResults(analysisData);

    } catch (error) {
      Logger.error('UI', 'Deep analysis failed:', error);
      this.displayError('Failed to run deep analysis: ' + error.message);
    } finally {
      // Reset UI
      if (btnText) btnText.textContent = 'Run Analysis';
      if (btnSpinner) btnSpinner.style.display = 'none';
      if (btn) btn.disabled = false;
      this.isRunningAnalysis = false;
    }
  }

  /**
   * Perform deep analysis (placeholder implementation)
   * @param {object} tab - Chrome tab object
   * @returns {object} Analysis results
   */
  async performDeepAnalysis(tab) {
    // Simulate analysis delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    const detectors = this.detectorManager.getAllDetectors();
    const categories = Object.keys(detectors);

    return {
      url: tab.url,
      title: tab.title,
      timestamp: new Date().toISOString(),
      totalDetectors: Object.values(detectors).reduce((sum, cat) => sum + Object.keys(cat).length, 0),
      categories: categories.length,
      detectionScore: Math.floor(Math.random() * 100) + 1,
      riskLevel: this.calculateRiskLevel(Math.floor(Math.random() * 100) + 1),
      recommendations: this.generateRecommendations(),
      detectedSystems: this.generateMockDetections()
    };
  }

  /**
   * Display analysis results
   * @param {object} results - Analysis results
   */
  displayAnalysisResults(results) {
    this.analysisResults = results;

    const analysisResults = document.querySelector('#analysisResults');
    const resultsContent = document.querySelector('#resultsContent');

    if (!analysisResults || !resultsContent) return;

    const resultsHtml = `
      <div class="analysis-summary">
        <div class="summary-stat">
          <span class="stat-label">Detection Score</span>
          <span class="stat-value ${this.getScoreClass(results.detectionScore)}">${results.detectionScore}/100</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Risk Level</span>
          <span class="stat-value risk-${results.riskLevel.toLowerCase()}">${results.riskLevel}</span>
        </div>
        <div class="summary-stat">
          <span class="stat-label">Systems Detected</span>
          <span class="stat-value">${results.detectedSystems.length}</span>
        </div>
      </div>

      <div class="detected-systems">
        <h5>Detected Security Systems</h5>
        <div class="systems-list">
          ${results.detectedSystems.map(system => `
            <div class="system-item">
              <span class="system-name">${system.name}</span>
              <span class="system-type">${system.type}</span>
              <span class="system-confidence">${system.confidence}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="recommendations">
        <h5>Recommendations</h5>
        <ul class="recommendations-list">
          ${results.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
      </div>
    `;

    resultsContent.innerHTML = resultsHtml;
    analysisResults.style.display = 'block';

    // Scroll to results
    analysisResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Calculate risk level based on detection score
   * @param {number} score - Detection score
   * @returns {string} Risk level
   */
  calculateRiskLevel(score) {
    if (score >= 80) return 'High';
    if (score >= 60) return 'Medium';
    if (score >= 30) return 'Low';
    return 'Minimal';
  }

  /**
   * Get CSS class for detection score
   * @param {number} score - Detection score
   * @returns {string} CSS class name
   */
  getScoreClass(score) {
    if (score >= 80) return 'score-high';
    if (score >= 60) return 'score-medium';
    return 'score-low';
  }

  /**
   * Generate mock recommendations
   * @returns {Array} Array of recommendation strings
   */
  generateRecommendations() {
    const recommendations = [
      'Consider using residential proxies to avoid detection',
      'Implement request throttling to reduce suspicious activity',
      'Randomize user agent strings to appear more natural',
      'Use session persistence to maintain consistent behavior',
      'Monitor response patterns for detection indicators'
    ];

    return recommendations.slice(0, 3 + Math.floor(Math.random() * 3));
  }

  /**
   * Generate mock detected systems
   * @returns {Array} Array of detected system objects
   */
  generateMockDetections() {
    const systems = [
      { name: 'Cloudflare Bot Management', type: 'Anti-bot', confidence: 95 },
      { name: 'reCAPTCHA v3', type: 'Captcha', confidence: 87 },
      { name: 'FingerprintJS', type: 'Fingerprinting', confidence: 78 },
      { name: 'DataDome', type: 'Anti-bot', confidence: 92 },
      { name: 'PerimeterX', type: 'Bot Protection', confidence: 85 }
    ];

    return systems.slice(0, 2 + Math.floor(Math.random() * 4));
  }

  /**
   * Show export modal
   */
  showExportModal() {
    const exportModal = document.querySelector('#exportModal');
    if (exportModal) exportModal.style.display = 'flex';
  }

  /**
   * Hide export modal
   */
  hideExportModal() {
    const exportModal = document.querySelector('#exportModal');
    if (exportModal) exportModal.style.display = 'none';
  }

  /**
   * Export data in specified format
   * @param {string} format - Export format (json, csv, pdf, txt)
   */
  async exportData(format) {
    try {
      let data;
      let filename;
      let mimeType;

      switch (format) {
        case 'json':
          data = JSON.stringify(this.analysisResults, null, 2);
          filename = 'scrapfly-analysis.json';
          mimeType = 'application/json';
          break;
        case 'csv':
          data = this.convertToCSV(this.analysisResults);
          filename = 'scrapfly-analysis.csv';
          mimeType = 'text/csv';
          break;
        case 'txt':
          data = this.convertToText(this.analysisResults);
          filename = 'scrapfly-analysis.txt';
          mimeType = 'text/plain';
          break;
        case 'pdf':
          // PDF generation would require a library like jsPDF
          NotificationHelper.info('PDF export feature coming soon!', {
            duration: 3000
          });
          return;
        default:
          throw new Error('Unsupported format');
      }

      // Download file
      const blob = new Blob([data], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      Logger.ui(`Exported data as ${format}`);
      this.hideExportModal();
      NotificationHelper.success(`Data exported successfully as ${format.toUpperCase()}`);

    } catch (error) {
      Logger.error('UI', 'Export failed:', error);
      NotificationHelper.error('Export failed: ' + error.message);
    }
  }

  /**
   * Convert analysis results to CSV format
   * @param {object} results - Analysis results
   * @returns {string} CSV data
   */
  convertToCSV(results) {
    if (!results) return '';

    let csv = 'Property,Value\n';
    csv += `URL,${results.url}\n`;
    csv += `Detection Score,${results.detectionScore}\n`;
    csv += `Risk Level,${results.riskLevel}\n`;
    csv += `Systems Detected,${results.detectedSystems?.length || 0}\n`;

    if (results.detectedSystems) {
      csv += '\nDetected Systems\n';
      csv += 'Name,Type,Confidence\n';
      results.detectedSystems.forEach(system => {
        csv += `${system.name},${system.type},${system.confidence}\n`;
      });
    }

    return csv;
  }

  /**
   * Convert analysis results to text format
   * @param {object} results - Analysis results
   * @returns {string} Text data
   */
  convertToText(results) {
    if (!results) return '';

    let text = 'Scrapfly Security Analysis Report\n';
    text += '=' .repeat(40) + '\n\n';
    text += `URL: ${results.url}\n`;
    text += `Analysis Time: ${new Date(results.timestamp).toLocaleString()}\n`;
    text += `Detection Score: ${results.detectionScore}/100\n`;
    text += `Risk Level: ${results.riskLevel}\n\n`;

    if (results.detectedSystems?.length) {
      text += 'Detected Security Systems:\n';
      text += '-'.repeat(30) + '\n';
      results.detectedSystems.forEach(system => {
        text += `• ${system.name} (${system.type}) - ${system.confidence}% confidence\n`;
      });
      text += '\n';
    }

    if (results.recommendations?.length) {
      text += 'Recommendations:\n';
      text += '-'.repeat(20) + '\n';
      results.recommendations.forEach((rec, index) => {
        text += `${index + 1}. ${rec}\n`;
      });
    }

    return text;
  }

  /**
   * Generate security report
   */
  generateSecurityReport() {
    Logger.ui('Generating security report...');
    NotificationHelper.info('Security report generation feature coming soon!', {
      duration: 3000
    });
  }

  /**
   * Analyze bypass techniques
   */
  analyzeBypassTechniques() {
    Logger.ui('Analyzing bypass techniques...');
    NotificationHelper.info('Bypass analysis feature coming soon!', {
      duration: 3000
    });
  }

  /**
   * Clear analysis results
   */
  clearAnalysisResults() {
    const analysisResults = document.querySelector('#analysisResults');
    if (analysisResults) analysisResults.style.display = 'none';
    this.analysisResults = null;
  }

  /**
   * Display error message
   * @param {string} message - Error message
   */
  displayError(message) {
    const resultsContent = document.querySelector('#resultsContent');
    const analysisResults = document.querySelector('#analysisResults');

    if (resultsContent && analysisResults) {
      resultsContent.innerHTML = `
        <div class="error-message">
          <div class="error-icon"></div>
          <div class="error-text">${message}</div>
        </div>
      `;
      analysisResults.style.display = 'block';
    }
  }

  /**
   * Initialize advanced section
   */
  async initialize() {
    await this.loadHTML();
    Logger.ui('Advanced section initialized');
  }

  /**
   * Load HTML template into advanced tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/advanced/advanced.html'));
      const html = await response.text();

      const advancedTab = document.querySelector('#advancedTab');
      if (advancedTab) {
        advancedTab.innerHTML = html;
        // Setup modal listeners after HTML is loaded
        this.setupAdvancedInfoModalListeners();
      }
    } catch (error) {
      Logger.error('UI', 'Failed to load advanced HTML:', error);
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Advanced;
} else if (typeof window !== 'undefined') {
  window.Advanced = Advanced;
}