/**
 * advanced-tools.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */


  /**
   * Render advanced tools interface
   */
Advanced.prototype.renderAdvancedInterface = async function() {
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
  };



  /**
   * Setup sub-tab navigation listeners
   */
Advanced.prototype.setupSubTabListeners = function() {
    const toolsTab = document.querySelector('#advancedToolsTab');
    const captureTab = document.querySelector('#advancedCaptureTab');

    if (toolsTab) {
      toolsTab.addEventListener('click', () => this.switchAdvancedTab('tools'));
    }

    if (captureTab) {
      captureTab.addEventListener('click', () => this.switchAdvancedTab('captures'));
    }
  };


  /**
   * Switch between Tools and Capture History tabs
   * @param {string} tabName - 'tools' or 'captures'
   */
Advanced.prototype.switchAdvancedTab = async function(tabName) {
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
  };


  /**
   * Update workflow step state (completed or not)
   * @param {number} step - Step number (1 or 2)
   * @param {boolean} completed - Whether the step is completed
   */
Advanced.prototype.updateStepState = function(step, completed) {
    const stepEl = document.getElementById(`step${step}Number`);
    if (!stepEl) return;

    if (completed) {
      stepEl.classList.add('completed');
      // The CSS ::after will show the checkmark
    } else {
      stepEl.classList.remove('completed');
    }
  };


  /**
   * Reset all workflow steps to initial state
   */
Advanced.prototype.resetWorkflowSteps = function() {
    this.updateStepState(1, false);
    this.updateStepState(2, false);
  };


  /**
   * Setup detection tools selection listeners
   */
Advanced.prototype.setupDetectionToolsListeners = function() {
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
  };


  /**
   * Load tools for selected detection
   */
Advanced.prototype.loadSelectedDetectionTools = async function() {
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
      Logger.debug('UI', '[Advanced] No detector selected');
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
  };


  /**
   * Clear detection tools panel
   */
Advanced.prototype.clearDetectionToolsPanel = function() {
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
  };


  /**
   * Restore previously selected detection after popup reopens
   * Note: Selection is no longer persisted - user must reselect each time
   */
Advanced.prototype.restoreSelectedDetection = async function() {
    // Selection persistence removed - each popup open starts fresh
  };


  /**
   * Show help information for CAPTCHA tools
   */
Advanced.prototype.showCaptchaHelp = function() {
    this.openAdvancedInfoModal();
  };