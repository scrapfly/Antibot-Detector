/**
 * Detection UI rendering/state methods.
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionUI = (typeof self !== 'undefined' && self.DetectionUI) ? self.DetectionUI : {};

DetectionUI.createAnalysisSteps = function() {
    // GRANULAR PROGRESS: 7 detection methods with individual tracking
    return [
      {
        emoji: '',
        title: 'Cookies',
        description: 'Checking browser cookies for anti-bot signatures',
        method: 'cookies',
        status: 'pending' // pending | in_progress | completed
      },
      {
        emoji: '',
        title: 'Headers',
        description: 'Analyzing HTTP response headers',
        method: 'headers',
        status: 'pending'
      },
      {
        emoji: '',
        title: 'URL',
        description: 'Checking URL patterns',
        method: 'url',
        status: 'pending'
      },
      {
        emoji: '',
        title: 'DOM',
        description: 'Scanning DOM elements',
        method: 'dom',
        status: 'pending'
      },
      {
        emoji: '',
        title: 'JS Hooks',
        description: 'Monitoring JavaScript API calls',
        method: 'jsHooks',
        status: 'pending'
      },
      {
        emoji: '',
        title: 'Window Properties',
        description: 'Checking window object properties',
        method: 'windowProperties',
        status: 'pending'
      }
    ];
};

DetectionUI.showLoadingState = function(message = 'Analyzing page…') {
    this.isShowingResults = false; // FIX: Reset flag when showing loading state
    if (this.uiStateMachine) {
      if (this.uiStateMachine.getState() !== this.uiStates.ANALYZING) {
        this.uiStateMachine.setState(this.uiStates.LOADING, { message });
      }
    }
    const loadingState = document.querySelector('#loadingState');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const interruptedState = document.querySelector('#interruptedState');
    const detectionPagination = document.querySelector('#detectionPagination');

    if (loadingState) {
      loadingState.style.display = 'flex';
      const loadingTitle = loadingState.querySelector('.loading-title');
      if (loadingTitle && message) {
        loadingTitle.textContent = message;
      }
    }
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
};

DetectionUI.renderAnalysisSteps = function() {
    const stepsContainer = document.querySelector('#analysisStepsList');
    if (!stepsContainer) {
      return;
    }

    if (!Array.isArray(this.analysisSteps) || this.analysisSteps.length === 0) {
      stepsContainer.innerHTML = '';
      return;
    }

    // GRANULAR PROGRESS: Render steps with status-based classes (pending/in_progress/completed)
    const stepsHtml = this.analysisSteps.map((step, index) => {
      const stepNumber = index + 1;
      const emoji = step.emoji || '';
      const status = step.status || 'pending';
      const method = step.method || '';

      // Determine status icon
      let statusIcon = '';
      if (status === 'completed') {
        statusIcon = '<span class="status-icon status-icon-complete">✓</span>';
      } else if (status === 'in_progress') {
        statusIcon = '<span class="status-icon status-icon-progress"></span>';
      } else {
        statusIcon = '<span class="status-icon status-icon-pending">○</span>';
      }

      const classString = `analysis-step status-${status}`;

      return `
        <div class="${classString}" data-step-index="${index}" data-step-method="${method}">
          <div class="analysis-step-badge">
            <span class="analysis-step-emoji">${emoji}</span>
          </div>
          <div class="analysis-step-content">
            <div class="analysis-step-title">${step.title || `Step ${stepNumber}`} ${statusIcon}</div>
            <div class="analysis-step-description">${step.description || ''}</div>
          </div>
        </div>
      `;
    }).join('');

    stepsContainer.innerHTML = stepsHtml;
};

DetectionUI.startAnalysisProgress = function() {
    const stepsContainer = document.querySelector('#analysisStepsList');

    if (!stepsContainer) {
      return;
    }

    this.stopAnalysisProgress();
    this.clearLoadingTimeout(); // Clear any existing timeout
    this.analysisStepIndex = 0;
    this.updateAnalysisStepStates();

    // Set timeout for stuck detection
    this.loadingTimeout = setTimeout(() => {
      this.handleLoadingTimeout();
    }, this.loadingTimeoutDuration);

    // FIX: Removed simulated progress animation - we use real progress updates from background now
    // The real progress is sent via DETECTION_PROGRESS messages which are more accurate
};

DetectionUI.updateAnalysisStepStates = function(forceComplete = false) {
    if (forceComplete) {
      // Mark all steps as completed
      this.analysisSteps.forEach(step => {
        step.status = 'completed';
      });
      // Re-render to apply status-completed classes with green background
      this.renderAnalysisSteps();
      return;
    }

    // Update status based on current step index
    this.analysisSteps.forEach((step, index) => {
      if (index < this.analysisStepIndex) {
        step.status = 'completed';
      } else if (index === this.analysisStepIndex) {
        step.status = 'in_progress';
      } else {
        step.status = 'pending';
      }
    });

    // Re-render to apply proper status classes
    this.renderAnalysisSteps();
};

DetectionUI.updateAnalysisPercent = function(forceValue = null) {
    const progressBarFill = document.querySelector('#progressBarFill');

    if (!progressBarFill) {
      return;
    }

    if (typeof forceValue === 'number') {
      const clamped = Math.max(0, Math.min(100, Math.round(forceValue)));

      // Update progress bar fill (visual only, no percentage text)
      if (progressBarFill) {
        progressBarFill.style.width = `${clamped}%`;
      }

      return;
    }

    // FIX: Use real progress updates only - don't auto-calculate
    // This function should only be called with forceValue now
    // If called without forceValue, just return (don't override real progress)
};

DetectionUI.stopAnalysisProgress = function({ markComplete = false } = {}) {
    if (this.analysisProgressInterval) {
      clearInterval(this.analysisProgressInterval);
      this.analysisProgressInterval = null;
    }

    if (markComplete) {
      this.updateAnalysisPercent(100);
      this.updateAnalysisStepStates(true);
    }
};

DetectionUI.updateRealProgress = function(progress) {
    if (!progress) return;

    const { method, totalPercent, completedMethods, message } = progress;

    // Update progress bar fill (visual only, no percentage text)
    const progressBarFill = document.querySelector('#progressBarFill');
    if (progressBarFill) {
      progressBarFill.style.width = `${totalPercent}%`;
    }

    // Update progress label with current message
    const progressLabel = document.querySelector('#progressLabel');
    if (progressLabel && message) {
      progressLabel.textContent = message;
    }

    // Update loading title message
    const loadingTitle = document.querySelector('.loading-title');
    if (loadingTitle && message) {
      loadingTitle.textContent = message;
    }

    // Update method status in analysis steps
    if (method && completedMethods) {
      this.updateMethodStatus(method, completedMethods);
    }
};

DetectionUI.updateMethodStatus = function(currentMethod, completedMethods) {
    // Update the step states based on which methods are complete
    this.analysisSteps.forEach((step, index) => {
      if (completedMethods.includes(step.method)) {
        step.status = 'completed';
      } else if (step.method === currentMethod) {
        step.status = 'in_progress';
      } else {
        step.status = 'pending';
      }
    });

    // Re-render the steps with updated status
    this.renderAnalysisSteps();
};

DetectionUI.handleLoadingTimeout = function() {
    if (this.debugMode) Logger.ui('[Detection] Loading timeout reached - checking if detection completed');

    // Clear any existing intervals
    this.stopAnalysisProgress();

    // Clear the timeout itself
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }

    // Check if we're still in loading state
    const loadingState = document.querySelector('#loadingState');
    if (loadingState && loadingState.style.display !== 'none') {
      // CRITICAL: Check if detection actually completed with results
      // Don't show interrupted state if results exist!
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.runtime.sendMessage(
            { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
            async (response) => {
              if (chrome.runtime.lastError) {
                if (this.debugMode) Logger.warn('UI', '[Detection] Error checking for results:', chrome.runtime.lastError);
                this.showInterruptedState();
                return;
              }

              if (response?.data?.detectionResults?.length > 0) {
                // Detection completed! Show results instead of interrupted state
                if (this.debugMode) Logger.ui('[Detection] Timeout but results exist - showing results instead of interrupted state');
                await Detection.processDetectionData(
                  {
                    detection: this,
                    detectionEngine: window.detectionEngine,
                    detectorManager: window.detectorManager,
                    history: window.History
                  },
                  response.data
                );
              } else {
                // FIX: Check badge before showing interrupted - if numeric, detection is complete
                const badgeStatus = await Detection.getBadgeStatus(tabs[0].id);
                const isNumericBadge = /^\d+\+?$/.test(badgeStatus.trimmed);

                if (isNumericBadge) {
                  // Badge shows completion but no data yet - retry instead of showing interrupted
                  if (this.debugMode) Logger.ui('[Detection] Timeout but badge shows completion - retrying fetch...');
                  await this.refreshAnalysis();
                } else {
                  // Truly stuck - show interrupted state
                  if (this.debugMode) Logger.ui('[Detection] Timeout with no results - showing interrupted state');
                  this.showInterruptedState();
                }
              }
            }
          );
        } else {
          // No tab found - show interrupted state
          this.showInterruptedState();
        }
      });
    }
};

DetectionUI.clearLoadingTimeout = function() {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
};

DetectionUI.hideLoadingState = function() {
    this.stopAnalysisProgress({ markComplete: true });
    this.clearLoadingTimeout(); // Clear timeout when loading completes
    this.isShowingAnalyzing = false; // Reset flag when hiding analyzing state
    const loadingState = document.querySelector('#loadingState');
    if (loadingState) loadingState.style.display = 'none';
};

DetectionUI.showAnalyzingState = function(message = 'Analyzing page…') {
    if (!this.isExtensionEnabled) {
      return;
    }

    // FIX: Prevent re-showing analyzing state if already showing
    // This prevents UI flicker when popup opens during active detection
    if (this.isShowingAnalyzing) {
      if (this.debugMode) Logger.ui('Detection: Already showing analyzing state, skipping re-render');
      return;
    }

    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.ANALYZING, { message });
    }
    this.wasInterrupted = false; // Reset flag when starting new analysis
    this.isShowingAnalyzing = true; // Track that we're showing analyzing state
    this.analysisSteps = this.createAnalysisSteps();
    this.renderAnalysisSteps();
    this.showLoadingState(message);
    this.startAnalysisProgress();
};

DetectionUI.showEmptyState = function() {
    if (!this.isExtensionEnabled) {
      this.showDisabledState();
      return;
    }

    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.EMPTY);
    }
    this.wasInterrupted = false; // Reset flag when showing successful state
    this.isShowingResults = false; // FIX: Reset flag when showing empty state
    this.hideLoadingState();
    this.clearLoadingTimeout(); // Clear timeout when showing empty state

    // FIX: Clear stale state to prevent re-rendering old data on tab switch
    this.currentResults = [];
    this.cacheMetadata = null;

    // Reset clear cache button to default state
    this.resetClearCacheButton();

    // FIX: Clear badge to empty (cache expired or no detections)
    this.clearBadgeForEmptyState();

    const emptyState = document.querySelector('#emptyState');
    const emptyStateIcon = document.querySelector('#emptyStateIcon');
    const emptyStateTitle = document.querySelector('.empty-state-title');
    const emptyStateText = document.querySelector('.empty-state-description');
    const emptyStateFooter = document.querySelector('.empty-state-footer');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const detectionPagination = document.querySelector('#detectionPagination');
    const interruptedState = document.querySelector('#interruptedState');

    if (emptyStateIcon) {
      emptyStateIcon.src = chrome.runtime.getURL('icons/icon48.png');
      emptyStateIcon.alt = 'Scrapfly';
    }

    // Show normal empty state
    if (emptyStateTitle) {
      emptyStateTitle.textContent = 'Nothing Detected';
    }
    if (emptyStateText) {
      emptyStateText.textContent = 'This page is clean and free from bot detection systems. No CAPTCHAs, anti-bot challenges, or fingerprinting techniques were found during the scan.';
    }
    if (emptyStateFooter) {
      emptyStateFooter.style.display = 'block';
    }

    if (emptyState) emptyState.style.display = 'flex';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
};

DetectionUI.showDisabledState = function(isBlacklisted = false) {
    this.setExtensionEnabled(false);

    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.DISABLED, { isBlacklisted });
    }
    this.wasInterrupted = false; // Reset flag when showing disabled state
    this.isShowingResults = false; // FIX: Reset flag when showing disabled state
    this.hideLoadingState();
    this.clearLoadingTimeout(); // Clear timeout when showing disabled state
    const disabledState = document.querySelector('#disabledState');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const detectionPagination = document.querySelector('#detectionPagination');
    const interruptedState = document.querySelector('#interruptedState');
    const disabledBlacklistBtn = document.querySelector('#disabledBlacklistBtn');

    if (disabledState) disabledState.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';

    // Show/hide blacklist button based on whether domain is blacklisted
    if (disabledBlacklistBtn) {
      disabledBlacklistBtn.classList.toggle('visible', isBlacklisted);
    }
};

DetectionUI.showInterruptedState = function() {
    if (!this.isExtensionEnabled) {
      this.showDisabledState();
      return;
    }

    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.INTERRUPTED);
    }
    this.hideLoadingState();
    this.clearLoadingTimeout(); // Clear timeout when showing interrupted state
    this.wasInterrupted = true; // Set flag to prevent re-showing analyzing state
    this.isShowingResults = false; // FIX: Reset flag when showing interrupted state

    const interruptedState = document.querySelector('#interruptedState');
    const detectionResults = document.querySelector('#detectionResults');
    const emptyState = document.querySelector('#emptyState');
    const disabledState = document.querySelector('#disabledState');
    const detectionPagination = document.querySelector('#detectionPagination');

    if (interruptedState) interruptedState.style.display = 'flex';
    if (detectionResults) detectionResults.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';

    // Badge is managed exclusively by background script - removed popup badge management
    // This prevents vicious cycle where popup sets badge which then causes interrupted state on next open
};

DetectionUI.displayResults = async function(detections = [], options = {}) {
    if (!this.isExtensionEnabled) {
      this.showDisabledState();
      return;
    }

    if (this.debugMode) Logger.ui('Detection.displayResults called with:', detections, options);
    if (this.uiStateMachine) {
      this.uiStateMachine.setState(this.uiStates.RESULTS, { count: detections?.length || 0 });
    }

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    this.wasInterrupted = false; // Reset flag when successfully displaying results
    this.isShowingResults = true; // FIX: Mark that we're showing results to prevent message listeners from overriding
    this.currentResults = detections;
    this.displayOptions = options;
    this.cacheMetadata = options.cacheMetadata || null;
    Logger.ui('[DEBUG Detection] currentResults stored:', this.currentResults.length, 'detections');

    // Notify Advanced section that detection data is ready (fixes timing race condition)
    if (this.advancedSection && typeof this.advancedSection.onDetectionDataReady === 'function') {
      Logger.ui('[Detection] Notifying Advanced section of detection data');
      this.advancedSection.onDetectionDataReady(detections);
    }

    // FIX: Clear the loading timeout when results arrive
    // This prevents the "Cleaned" modal from appearing after detection completes
    this.clearLoadingTimeout();

    this.hideLoadingState();
    this.closeDetectionModal();

    // Reset clear cache button to default state
    this.resetClearCacheButton();

    const detectionResults = document.querySelector('#detectionResults');
    const emptyState = document.querySelector('#emptyState');
    const disabledState = document.querySelector('#disabledState');

    // Check if cache is expired - don't show stale data
    if (options.fromStorage && options.cacheMetadata?.expiry) {
      const isExpired = Date.now() > options.cacheMetadata.expiry;
      if (isExpired) {
        Logger.ui('[Detection] Cache expired, showing empty state instead of stale data');
        this.showEmptyState();
        return;
      }
    }

    if (detections.length === 0) {
      this.showEmptyState();
      // Badge is managed by background script now
      return;
    }

    // Badge is now handled by background script for real-time updates
    const totalDetections = detections.length;

    // DISABLED: Toast notification for detections (per user request)
    // Keeping the code commented in case it needs to be re-enabled
    /*
    // Show toast notification ONLY for fresh detections (not when opening popup with cached data)
    if (totalDetections > 0 && options.fromStorage === false) {
      const now = Date.now();

      // Only show notification if enough time has passed since last one
      if (now - this.lastNotificationTime > this.notificationDebounceTime) {
        const detectionMessage = totalDetections === 1
          ? '1 security system detected'
          : `${totalDetections} security systems detected`;

        NotificationHelper.info(detectionMessage, {
          duration: 3000
        });

        this.lastNotificationTime = now;
      }
    }
    */

    // Show results container
    if (detectionResults) detectionResults.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';

    // Update URL display
    this.updateUrlDisplay(options);

    // Update stats
    this.updateStats(detections);

    // Filter items if search query exists
    let itemsToShow = this.searchQuery
      ? this.getFilteredResults()
      : detections;

    // Sort items by category priority before displaying
    itemsToShow = this.sortDetectionsByCategory(itemsToShow);

    // Use pagination to display results
    // PaginationManager will handle showing/hiding pagination based on whether it's needed
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }

    // Show overview if there are detections
    const detectionOverview = document.querySelector('#detectionOverview');
    if (detectionOverview && detections.length > 0) {
      detectionOverview.style.display = 'block';
    }

    // Update cache info
    this.updateCacheInfo();

    // FIX: Update badge when displaying cached results
    // The background script only updates badge during active detection, not when returning cached data
    // So we need to update it here when displayResults() is called with cached detections
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        const detectionCount = detections.length;

        // Get badge colors from CategoryManager
        const badgeColors = await CategoryManager.getBadgeColors();

        // Badge color should match the UI difficulty (not raw detection count)
        const count = detectionCount.toString();
        const avgConfidence = detectionCount > 0
          ? Math.round(detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / detectionCount)
          : 0;
        const { difficulty } = this.getDifficultyInfo(detections, avgConfidence);
        const color = difficulty === 'High' ? badgeColors.high :
                     difficulty === 'Medium' ? badgeColors.medium :
                     badgeColors.low;

        // Update badge text and color
        await chrome.action.setBadgeText({ text: count, tabId: tabs[0].id });
        await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabs[0].id });

        if (this.debugMode) {
          Logger.ui(`[Detection] Badge updated to ${count} with color ${color}`);
        }
      }
    } catch (error) {
      if (this.debugMode) {
        Logger.warn('UI', '[Detection] Could not update badge:', error);
      }
    }
};

DetectionUI.updateStats = function(detections) {
    const detectionsCount = document.querySelector('#detectionsCount');
    const overallConfidence = document.querySelector('#overallConfidence');
    const difficultyLevel = document.querySelector('#difficultyLevel');
    const detectionTime = document.querySelector('#detectionTime');
    const detectionCount = document.querySelector('#detectionCount');

    const totalDetections = detections.length;
    const avgConfidence = totalDetections > 0
      ? Math.round(detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / totalDetections)
      : 0;

    // Determine difficulty level based on detections mix + confidence
    const { difficulty, difficultyColor } = this.getDifficultyInfo(detections, avgConfidence);

    // Update UI elements
    if (detectionsCount) detectionsCount.textContent = totalDetections;
    if (overallConfidence) overallConfidence.textContent = `${avgConfidence}%`;
    if (difficultyLevel) {
      difficultyLevel.textContent = difficulty;
      difficultyLevel.style.color = difficultyColor;
    }
    // Icon is now SVG in HTML, no need to update textContent

    if (detectionCount) detectionCount.textContent = totalDetections;
};

DetectionUI.updateUrlDisplay = function(options = {}) {
    const siteFavicon = document.querySelector('#siteFavicon');
    const siteUrl = document.querySelector('#siteUrl');

    if (!siteFavicon || !siteUrl) {
      return;
    }

    // Try to get URL from various sources
    let url = '';
    let favicon = '';

    if (options.cacheMetadata) {
      url = options.cacheMetadata.url || '';
      favicon = options.cacheMetadata.favicon || '';
    }

    // If no URL yet, try to get from current tab
    if (!url) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          url = tabs[0].url || '';
          favicon = tabs[0].favIconUrl || '';

          // Update display
          if (url) {
            try {
              const urlObj = new URL(url);
              siteUrl.textContent = urlObj.hostname;
              siteUrl.title = url;
            } catch (e) {
              siteUrl.textContent = url;
              siteUrl.title = url;
            }
          }

          if (favicon) {
            siteFavicon.src = favicon;
          }
        }
      });
    } else {
      // We have URL from cache metadata
      try {
        const urlObj = new URL(url);
        siteUrl.textContent = urlObj.hostname;
        siteUrl.title = url;
      } catch (e) {
        siteUrl.textContent = url;
        siteUrl.title = url;
      }

      // Set favicon if available
      if (favicon) {
        siteFavicon.src = favicon;
      } else {
        // Try to get favicon from Chrome tab API as fallback
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].favIconUrl) {
            siteFavicon.src = tabs[0].favIconUrl;
          } else {
            // Try to use default favicon.ico from the domain
            try {
              const urlObj = new URL(url);
              siteFavicon.src = `${urlObj.origin}/favicon.ico`;
            } catch (e) {
              // Use default icon
              siteFavicon.src = 'icons/icon16.png';
            }
          }
        });
      }
    }
};

DetectionUI.updateCacheInfo = function() {
    const cacheExpiry = document.querySelector('#cacheExpiry');
    const cacheScopeDisplay = document.querySelector('#cacheScopeDisplay');

    if (!cacheExpiry) {
      return;
    }

    // Update cache expiry time
    if (this.cacheMetadata && this.cacheMetadata.expiry) {
      const expiryDate = new Date(this.cacheMetadata.expiry);
      const now = new Date();
      const diff = expiryDate - now;

      if (diff > 0) {
        cacheExpiry.textContent = this.formatExpiryRemaining(diff);
      } else {
        cacheExpiry.textContent = 'Expired';
      }
    } else {
      cacheExpiry.textContent = '-';
    }

    // Update cache scope display
    if (cacheScopeDisplay) {
      if (this.cacheMetadata && this.cacheMetadata.cacheScope) {
        // Map scope values to user-friendly display names
        const scopeDisplayNames = {
          'domain': 'Domain',
          'path': 'Path',
          'full': 'Full URL'
        };
        cacheScopeDisplay.textContent = scopeDisplayNames[this.cacheMetadata.cacheScope] || 'Path';
      } else {
        // Fallback: read current setting from storage
        chrome.storage.local.get(['scrapfly_settings'], (result) => {
          if (result.scrapfly_settings) {
            const settings = typeof result.scrapfly_settings === 'string'
              ? JSON.parse(result.scrapfly_settings)
              : result.scrapfly_settings;
            const actualSettings = settings.settings || settings;
            const cacheScope = actualSettings.cacheScope || actualSettings.detection?.cacheScope || 'path';

            const scopeDisplayNames = {
              'domain': 'Domain',
              'path': 'Path',
              'full': 'Full URL'
            };
            cacheScopeDisplay.textContent = scopeDisplayNames[cacheScope] || 'Path';
          }
        });
      }
    }
};

DetectionUI.formatExpiryRemaining = function(msRemaining) {
    const ms = Number(msRemaining);
    if (!Number.isFinite(ms) || ms <= 0) return 'Expired';

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const MONTH = 30 * DAY; // Approximation is fine for TTL display
    const YEAR = 365 * DAY;

    // Prefer large units when applicable:
    // - >= 1 year: y + mo
    // - >= 1 month: mo + d
    // - >= 1 day: d + h
    // - >= 1 hour: h + m
    // - otherwise: m (or <1m)
    let remaining = ms;

    const parts = [];
    const push = (value, label) => {
      if (value > 0) parts.push(`${value}${label}`);
    };

    if (remaining >= YEAR) {
      const years = Math.floor(remaining / YEAR);
      remaining -= years * YEAR;
      push(years, 'y');

      const months = Math.floor(remaining / MONTH);
      push(months, 'mo');
      return parts.length ? parts.slice(0, 2).join(' ') : '0m';
    }

    if (remaining >= MONTH) {
      const months = Math.floor(remaining / MONTH);
      remaining -= months * MONTH;
      push(months, 'mo');

      const days = Math.floor(remaining / DAY);
      push(days, 'd');
      return parts.length ? parts.slice(0, 2).join(' ') : '0m';
    }

    if (remaining >= DAY) {
      const days = Math.floor(remaining / DAY);
      remaining -= days * DAY;
      push(days, 'd');

      const hours = Math.floor(remaining / HOUR);
      push(hours, 'h');
      return parts.length ? parts.slice(0, 2).join(' ') : '0m';
    }

    if (remaining >= HOUR) {
      const hours = Math.floor(remaining / HOUR);
      remaining -= hours * HOUR;
      push(hours, 'h');

      const minutes = Math.floor(remaining / MINUTE);
      push(minutes, 'm');
      return parts.length ? parts.slice(0, 2).join(' ') : '0m';
    }

    if (remaining < MINUTE) return '<1m';
    const minutes = Math.floor(remaining / MINUTE);
    return `${minutes}m`;
};

DetectionUI.renderDetectionsPage = function(detections) {
    Logger.ui(`[renderDetectionsPage] Called with ${detections?.length || 0} detections`);
    const resultsList = document.querySelector('#resultsList');
    if (!resultsList) {
      Logger.error('UI', '[renderDetectionsPage] resultsList not found!');
      return;
    }
    Logger.ui('[renderDetectionsPage] resultsList found, rendering...');

    const totalItems = this.paginationManager?.filteredItems?.length ?? detections.length;
    const shouldUseExpandedLayout = totalItems === 2;
    resultsList.classList.toggle('expanded-results', shouldUseExpandedLayout);

    // Check if we're displaying only 1 detection result for enhanced styling
    const isSingleResult = detections.length === 1;

    const buildCardHtml = (detection, index) => {
      const confidence = detection.confidence || 0;
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      const detectorIcon = this.getDetectorIcon(detection);

      // Get category badges
      const categoryBadges = this.getCategoryBadges(detection);

      const globalIndex = this.getGlobalDetectionIndex(detection, index);

      return `
        <div class="detection-card ${isSingleResult ? 'single-result' : ''}" data-detection-index="${globalIndex}">
          <div class="card-header">
            <div class="card-icon-section">
              ${detectorIcon}
            </div>
            <div class="card-info">
              <h3 class="detector-name">${detection.detector?.name || detection.detector || 'Unknown'}</h3>
              <div class="category-badges">
                ${categoryBadges}
              </div>
            </div>
            <div class="card-actions">
              <span class="confidence-display ${confidenceClass}">${confidence}%</span>
              <button class="copy-btn" data-detection-index="${globalIndex}" title="Copy detection details">
                <svg width="14" height="14" viewBox="0 0 24 24">
                  <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      `;
    };

    const finalizeRender = () => {
      if (renderToken !== this._detectionsRenderToken) {
        return;
      }

      // Add click handlers for expandable cards
      const cards = document.querySelectorAll('.detection-card');
      Logger.ui(`[renderDetectionsPage] Found ${cards.length} detection cards`);

      cards.forEach(card => {
        card.addEventListener('click', (e) => {
          Logger.ui('[renderDetectionsPage] Card clicked');
          if (e.target.closest('.copy-btn')) {
            return;
          }

          const indexAttr = card.getAttribute('data-detection-index');
          const parsedIndex = parseInt(indexAttr, 10);
          Logger.ui('[renderDetectionsPage] Opening modal for index', parsedIndex);
          if (!Number.isNaN(parsedIndex)) {
            this.openDetectionModal(parsedIndex);
          }
        });
      });

      // Add click handlers for copy buttons
      document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const index = parseInt(btn.getAttribute('data-detection-index'));
          this.copyDetection(index, btn);
        });
      });
    };

    this._detectionsRenderToken = (this._detectionsRenderToken || 0) + 1;
    const renderToken = this._detectionsRenderToken;
    const shouldBatchRender = detections.length > 20;

    if (!shouldBatchRender) {
      let resultsHtml = '';
      detections.forEach((detection, index) => {
        resultsHtml += buildCardHtml(detection, index);
      });
      resultsList.innerHTML = resultsHtml;
      finalizeRender();
      return;
    }

    resultsList.innerHTML = '';
    const batchSize = 8;
    let offset = 0;

    const renderBatch = () => {
      if (renderToken !== this._detectionsRenderToken) {
        return;
      }

      const slice = detections.slice(offset, offset + batchSize);
      let batchHtml = '';
      slice.forEach((detection, index) => {
        batchHtml += buildCardHtml(detection, offset + index);
      });
      resultsList.insertAdjacentHTML('beforeend', batchHtml);
      offset += batchSize;

      if (offset < detections.length) {
        requestAnimationFrame(renderBatch);
      } else {
        finalizeRender();
      }
    };

    renderBatch();
};

DetectionUI.getCategoryBadges = function(detection) {
    const badges = [];

    // Main category badge with dynamic color from storage (muted style)
    if (detection.category) {
      const categoryInfo = this.detectorManager.getCategoryInfo(detection.category.toLowerCase());
      const categoryColor = categoryInfo?.colour || '#666666';
      const categoryName = detection.category.charAt(0).toUpperCase() + detection.category.slice(1);
      const rgb = this.hexToRgb(categoryColor);
      const bgStyle = rgb
        ? `background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2); color: ${categoryColor}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35);`
        : `background: ${categoryColor}; color: white;`;
      badges.push(`<span class="badge" style="${bgStyle}">${categoryName}</span>`);
    }

    // Add detection method badges based on actual matches (with counts)
    if (detection.matches && detection.matches.length > 0) {
      // Count matches per type instead of just collecting unique types
      const methodCounts = new Map();
      detection.matches.forEach(match => {
        if (match.type) {
          methodCounts.set(match.type, (methodCounts.get(match.type) || 0) + 1);
        }
      });

      // Convert method types to badges with counts and dynamic colors from CategoryManager
      methodCounts.forEach((count, type) => {
        const typeName = type.toLowerCase();
        const methodName = typeName.replace(/_/g, ' ').toUpperCase();
        const displayText = count > 1 ? `${methodName} (${count})` : methodName;
        const tagColor = this.detectorManager.categoryManager.getTagColor(typeName);

        if (tagColor && tagColor !== '#666666') {
          // Use muted/transparent background with colored text
          const rgb = this.hexToRgb(tagColor);
          const bgStyle = rgb
            ? `background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3);`
            : `background: ${tagColor}; color: white;`;
          badges.push(`<span class="badge" style="${bgStyle}">${displayText}</span>`);
        } else {
          // Fallback to CSS class (use typeName for CSS class)
          const methodClass = `badge-${typeName}`;
          badges.push(`<span class="badge ${methodClass}">${displayText}</span>`);
        }
      });
    }

    return badges.join('');
};

DetectionUI.getMethodBadges = function(matches) {
    if (!matches || matches.length === 0) {
      return '<div class="method-item-card">Unknown method</div>';
    }

    // Show all methods as individual cards
    const badges = matches.map((match, index) => {
      let methodType = (match.type || 'unknown').toLowerCase();
      methodType = methodType.replace(/_/g, ' ').toUpperCase();
      const confidence = match.confidence || 0;

      // Format the display value based on type
      let displayValue = '';
      let copyValue = '';

      const matchType = (match.type || '').toLowerCase();

      switch (matchType) {
        case 'cookie':
        case 'cookies':
          // Show: name=value format if available, otherwise just name
          displayValue = match.value || match.name || 'unknown';
          copyValue = displayValue;
          break;

        case 'header':
        case 'headers':
          // Show: name: value format if available, otherwise just name
          displayValue = match.value || match.name || 'unknown';
          copyValue = displayValue;
          break;

        case 'content':
        case 'script':
          // Show: pattern first (e.g., "recaptcha"), then value (location)
          displayValue = match.pattern || match.content || match.value || 'unknown';
          copyValue = displayValue;
          break;

        case 'url':
        case 'urls':
          // Show: full URL inline (like cookie format)
          displayValue = match.fullUrl || match.value || match.pattern || 'unknown';
          copyValue = displayValue;
          break;

        case 'dom':
          // Show: selector=text format if available, otherwise just selector
          displayValue = match.value || match.selector || match.pattern || 'unknown';
          copyValue = displayValue;
          break;

        default:
          displayValue = match.pattern || match.name || match.value || match.selector || 'unknown';
          copyValue = displayValue;
      }

      // Get tag color from CategoryManager using original matchType (preserves underscores)
      const tagColor = this.detectorManager.categoryManager.getTagColor(matchType);

      // Use muted/transparent background with colored text
      const effectiveColor = (tagColor && tagColor !== '#666666') ? tagColor : '#666666';
      const rgb = this.hexToRgb(effectiveColor);
      const badgeStyle = rgb
        ? `style="background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15); color: ${effectiveColor}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3);"`
        : `style="background: ${effectiveColor}; color: white; border: none;"`;

      // Confidence badge color
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      // Normalize method type for CSS class using original matchType (preserves underscores/hyphens)
      // Replace underscores with hyphens for CSS compatibility, then handle plural to singular
      const methodClass = matchType.replace(/_/g, '-').replace(/s$/, ''); // js_hooks -> js-hooks, cookies -> cookie

      const encodedValue = encodeURIComponent(copyValue);
      const safeDisplayValue = FormatUtils.escapeHtml(displayValue);
      const safeFullValue = FormatUtils.escapeHtml(copyValue);

      return `
        <div class="method-item-card method-${methodClass}" data-copy-value="${encodedValue}" data-method-type="${methodType}" title="Click to copy">
          <span class="method-type-badge" ${badgeStyle}>${methodType}</span>
          <button type="button" class="method-value-btn" data-copy-target="value" title="${safeFullValue}">${safeDisplayValue}</button>
          <span class="method-confidence ${confidenceClass}">${confidence}%</span>
        </div>
      `;
    });

    return badges.join('');
};

DetectionUI.getFilteredResults = function() {
    if (!this.searchQuery) return this.currentResults;

    const filtered = this.currentResults.filter(detection => {
      const name = (detection.detector?.name || detection.detector || '').toLowerCase();
      const category = (detection.category || '').toLowerCase();
      const description = (detection.detector?.description || '').toLowerCase();

      return name.includes(this.searchQuery) ||
             category.includes(this.searchQuery) ||
             description.includes(this.searchQuery);
    });

    // Sort filtered results by category priority
    return this.sortDetectionsByCategory(filtered);
};

DetectionUI.sortDetectionsByCategory = function(detections) {
    const categoryPriority = {
      'antibot': 1,
      'anti-bot': 1,
      'captcha': 2,
      'fingerprint': 3,
      'fingerprinting': 3
    };

    return [...detections].sort((a, b) => {
      const categoryA = (a.category || '').toLowerCase();
      const categoryB = (b.category || '').toLowerCase();

      const priorityA = categoryPriority[categoryA] || 999;
      const priorityB = categoryPriority[categoryB] || 999;

      // Sort by priority (lower number = higher priority)
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // If same category, sort by confidence (higher first)
      return (b.confidence || 0) - (a.confidence || 0);
    });
};

DetectionUI.handleSearch = function(query) {
    this.searchQuery = query.toLowerCase().trim();

    // Filter items if search query exists
    const itemsToShow = this.searchQuery
      ? this.getFilteredResults()
      : this.currentResults;

    // Update pagination with filtered results
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }
};

DetectionUI.getDetectorIcon = function(detection) {
    // Helper to escape alt text for HTML attribute safety
    const escapeAlt = (text) => (text || 'Icon').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Fingerprint SVG icons mapping
    const fingerprintIcons = {
      'audio_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M8 6v12M4 9v6M16 6v12M20 9v6"/></svg>',
      'battery_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="7" width="18" height="10" rx="2"/><path d="M22 11v2"/><path d="M6 11v2M10 11v2M14 11v2"/></svg>',
      'canvas_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h4l2-3 2 6 2-3h2"/></svg>',
      'clipboard_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
      'crypto_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>',
      'css_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 3h16l-1.5 15L12 21l-6.5-3L4 3z"/><path d="M8 8h8M7 12h6"/></svg>',
      'font_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
      'gamepads_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="4"/><circle cx="8" cy="12" r="2"/><path d="M15 10v4M13 12h4"/></svg>',
      'geolocation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>',
      'hardware_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9h6v6H9z"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>',
      'indexeddb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>',
      'media_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><polygon points="10,8 16,11 10,14" fill="currentColor"/></svg>',
      'navigator_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="none"/></svg>',
      'orientation_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/><path d="M9 6h6"/></svg>',
      'performance_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/><path d="M12 2v2M22 12h-2M12 22v-2M2 12h2"/></svg>',
      'screen_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      'storage_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7V4h16v3M4 20v-3h16v3M4 7v10h16V7"/><path d="M4 11h16M4 15h16"/><circle cx="7" cy="9" r="1" fill="currentColor"/></svg>',
      'timezone_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/></svg>',
      'usb_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v10M7 7l5 5 5-5"/><circle cx="12" cy="16" r="2"/><path d="M6 12v4a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-4"/></svg>',
      'webgl_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
      'webrtc_fingerprint.png': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 10l5-5M20 10V5h-5"/><path d="M9 14l-5 5M4 14v5h5"/><circle cx="12" cy="12" r="3"/></svg>'
    };

    // Check for custom uploaded icon first
    if (detection.detector?.customIcon) {
      return `<img src="${detection.detector.customIcon}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
    }

    // Try to get real icon from detector data
    if (detection.detector?.icon) {
      if (typeof detection.detector.icon === 'string') {
        const lowerIcon = detection.detector.icon.toLowerCase();
        if (lowerIcon === 'default') {
          const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
          return `<img src="${scrapflyIcon}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
        }
        if (lowerIcon === 'custom' || lowerIcon === 'custom.png') {
          const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
          return `<img src="${scrapflyIcon}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
        }

        // Check for fingerprint SVG icons
        if (fingerprintIcons[lowerIcon]) {
          return `<div class="detector-icon detector-icon-svg fingerprint-icon">${fingerprintIcons[lowerIcon]}</div>`;
        }
      }
      // Check if it's an emoji (not a file name)
      if (!detection.detector.icon.includes('.png') &&
          !detection.detector.icon.includes('.jpg') &&
          !detection.detector.icon.includes('.svg') &&
          !detection.detector.icon.includes('http')) {
        // It's an emoji or text, return it directly
        return detection.detector.icon;
      }

      // It's a file, build path to icon in detectors/icons folder
      const iconPath = chrome.runtime.getURL(`detectors/icons/${detection.detector.icon}`);
      return `<img src="${iconPath}" alt="${escapeAlt(detection.detector.name)}" class="detector-icon" />`;
    }

    // No icon specified, use default custom.png
    const scrapflyIcon = chrome.runtime.getURL('icons/icon128.png');
    return `<img src="${scrapflyIcon}" alt="${escapeAlt(detection.detector?.name)}" class="detector-icon" />`;
};

DetectionUI.clearBadgeForEmptyState = async function() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs[0]) {
        await chrome.action.setBadgeText({ text: '', tabId: tabs[0].id });
      }
    } catch (error) {
      // Silently fail if tab no longer exists
    }
};

DetectionUI.hexToRgb = function(hex) {
    const result = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
};

DetectionUI.getDifficultyInfo = function(detections = [], avgConfidence = 0) {
    return DetectionUtils.getDifficultyInfo(detections, avgConfidence);
};

if (typeof self !== 'undefined') {
    self.DetectionUI = DetectionUI;
}
