class Detection {
  constructor(detectorManager, detectionEngine) {
    this.detectorManager = detectorManager;
    this.detectionEngine = detectionEngine;
    this.currentResults = [];
    this.searchQuery = '';
    this.initialized = false;
    this.paginationManager = null;
    this.lastNotificationTime = 0;
    this.notificationDebounceTime = 2000; // 2 seconds debounce
    this.analysisSteps = this.createAnalysisSteps();
    this.analysisStepIndex = 0;
    this.analysisProgressInterval = null;
    this.loadingTimeout = null;
    this.loadingTimeoutDuration = 10000; // 10 seconds timeout
    this.modalElements = null;
    this.activeModalIndex = null;
    this.handleModalKeyDown = null;
    this.wasInterrupted = false; // Track if detection was interrupted to prevent confusing state flow
    this.debugMode = false; // Debug logging flag, loaded from settings
    this.isRequestingDetection = false; // FIX: Track if we're already requesting detection
    this.isShowingAnalyzing = false; // FIX: Track if analyzing state is already showing
    this.isShowingResults = false; // FIX: Track if displaying results to prevent message listeners from overriding
    this.cacheCleared = false; // FIX: Track if cache was cleared while tab was hidden - refresh when tab becomes visible

    // Setup message listeners immediately (before initialization) so they work even if tab not accessed yet
    this.setupMessageListeners();
  }

  /**
   * Setup message listeners for background script communication
   * Called from constructor to ensure listeners are active even before tab initialization
   */
  setupMessageListeners() {
    // FIX: Listen for tab URL changes while popup is open
    // When user navigates, transition to analyzing state to show live progress
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        if (this.debugMode) console.log('[Detection] Tab navigated to:', changeInfo.url);
        // Check if detection is starting (badge will show %)
        chrome.action.getBadgeText({ tabId }, (badgeText) => {
          if (badgeText && badgeText.endsWith('%')) {
            // Detection started - transition to analyzing state
            if (this.debugMode) console.log('[Detection] Navigation detected, badge shows progress, transitioning to analyzing state');
            // FIX: Don't override if already showing results
            if (!this.wasInterrupted && !this.isShowingResults) {
              this.showAnalyzingState();
            }
          }
        });
      }
    });

    // FIX: Listen for real-time detection progress from background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'DETECTION_PROGRESS') {
        if (this.debugMode) console.log('[Detection] Received progress update:', message.progress);

        // CRITICAL: If popup is not in analyzing state, transition to it
        // This handles case where popup is open showing old results when new detection starts
        // FIX: Don't override if already showing results (cached detection)
        const loadingState = document.querySelector('#loadingState');
        if (!loadingState || loadingState.style.display === 'none') {
          if (this.debugMode) console.log('[Detection] Progress received but not in analyzing state - transitioning now');
          if (!this.wasInterrupted && !this.isShowingResults) {
            this.showAnalyzingState();
          }
        }

        this.updateRealProgress(message.progress);
      }

      // FIX: Listen for detection completion from background
      if (message.type === 'NEW_DETECTION_DATA') {
        if (this.debugMode) console.log('[Detection] Received detection completion for tab:', message.tabId);

        // Guard: Don't auto-refresh if we just cleared cache and are showing empty state
        // Check both the instance flag and sessionStorage
        const clearedTime = sessionStorage.getItem('scrapfly_just_cleared_cache');
        const recentlyCleared = clearedTime && (Date.now() - parseInt(clearedTime)) < 5000; // 5 second window

        if (this.justClearedCache || recentlyCleared) {
          console.log('[Detection] Ignoring NEW_DETECTION_DATA - showing empty state after cache clear');
          // Reset the flag after 5.5 seconds to allow future updates (after re-detection starts)
          if (!this.clearCacheResetTimer) {
            this.clearCacheResetTimer = setTimeout(() => {
              this.justClearedCache = false;
              sessionStorage.removeItem('scrapfly_just_cleared_cache');
              this.clearCacheResetTimer = null;
            }, 5500);
          }
          return;
        }

        // Clear loading timeout and stop progress animation
        this.clearLoadingTimeout();
        this.stopAnalysisProgress({ markComplete: true });

        // Request the completed detection data and display it
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (tabs[0] && tabs[0].id === message.tabId) {
            if (this.debugMode) console.log('[Detection] Fetching completed detection data...');

            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: message.tabId },
              async (response) => {
                if (chrome.runtime.lastError) {
                  console.error('[Detection] Error fetching completed data:', chrome.runtime.lastError);
                  this.showEmptyState();
                  return;
                }

                if (response && response.data) {
                  // Process and display the completed detection
                  await Detection.processDetectionData(
                    {
                      detection: this,
                      detectionEngine: this.detectionEngine,
                      detectorManager: this.detectorManager,
                      history: this.history
                    },
                    response.data
                  );
                } else {
                  if (this.debugMode) console.warn('[Detection] No data in completion response');
                  this.showEmptyState();
                }
              }
            );
          }
        });
      }

      // Listen for cache scope changes from Settings
      if (message.type === 'DETECTION_CLEAR_CACHE') {
        (async () => {
          console.log('[Detection] Cache scope changed - checking for cached data with new scope');

          // Clear current results display
          this.currentResults = [];

          // Clear pagination
          if (this.paginationManager) {
            this.paginationManager.setItems([]);
          }

          // Clear result cards from DOM
          const detectionResults = document.querySelector('#detectionResults');
          if (detectionResults) {
            detectionResults.innerHTML = '';
          }

          // Set the sessionStorage flag to prevent auto-detection on popup reopen
          // (Treat cache scope change like explicit cache clear for protection)
          sessionStorage.setItem('scrapfly_just_cleared_cache', Date.now().toString());

          // Set flags to prevent auto-detection
          this.justClearedCache = true;
          this.cacheCleared = true;

          // Update cache info display to reflect new cache scope from settings
          this.updateCacheInfo();

          // Check if there's cached detection data for the new scope
          try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) return;

            // Request detection data with new cache scope
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tabs[0].id },
              async (response) => {
                if (chrome.runtime.lastError) {
                  console.log('[Detection] No cached data for new scope - showing empty state');
                  this.showEmptyState();
                  // Set badge to gray X
                  await chrome.action.setBadgeText({ text: '✕', tabId: tabs[0].id });
                  await chrome.action.setBadgeBackgroundColor({
                    color: '#6B7280', // gray-500
                    tabId: tabs[0].id
                  });
                  return;
                }

                if (response && response.data) {
                  // Found cached data for new scope - display it
                  console.log('[Detection] Found cached data for new scope - displaying');

                  // Use ScrapflyPopup's processDetectionData to display results
                  if (window.popupInstance) {
                    await window.popupInstance.processDetectionData(response.data);
                  } else {
                    // Fallback: display directly
                    await this.displayResults(response.data.detections);
                  }
                } else {
                  // No cached data for new scope - show empty state
                  console.log('[Detection] No cached data for new scope - showing empty state');
                  this.showEmptyState();
                  // Set badge to gray X
                  await chrome.action.setBadgeText({ text: '✕', tabId: tabs[0].id });
                  await chrome.action.setBadgeBackgroundColor({
                    color: '#6B7280', // gray-500
                    tabId: tabs[0].id
                  });
                }
              }
            );
          } catch (error) {
            if (this.debugMode) console.warn('[Detection] Error checking for cached data:', error);
            this.showEmptyState();
          }

          if (sendResponse) {
            sendResponse({ success: true });
          }
        })();

        return true; // Keep message channel open for async response
      }
    });
  }

  /**
   * OPTIMIZATION QUICK WIN #5: Extract badge status helper
   * Consolidates 6+ duplicate badge checking logic blocks into single helper
   * Returns object with status and additional metadata for easier state management
   * FIX: Now distinguishes between cleared cache (gray ✕) and interrupted detection (other ✕)
   */
  static async getBadgeStatus(tabId) {
    const badgeText = await Detection.getBadgeText(tabId);
    const badgeColor = await Detection.getBadgeBackgroundColor(tabId);
    const trimmed = badgeText ? badgeText.trim() : '';

    // Determine if this is a cleared cache badge (gray) or interrupted detection badge (other colors)
    const isCleared = trimmed === '✕' && (badgeColor === '#6B7280' || badgeColor === '#6b7280');
    const isInterrupted = (trimmed === '?' || trimmed === '✕') && !isCleared;

    return {
      text: badgeText,
      trimmed: trimmed,
      color: badgeColor,
      isLoading: trimmed === '⏳',
      isCleared: isCleared,        // FIX: New flag for cache cleared state
      isInterrupted: isInterrupted,
      isError: trimmed === '✕',
      isQuestion: trimmed === '?',
      isEmpty: trimmed === ''
    };
  }

  createAnalysisSteps() {
    // GRANULAR PROGRESS: 7 detection methods with individual tracking
    return [
      {
        emoji: '🍪',
        title: 'Cookies',
        description: 'Checking browser cookies for anti-bot signatures',
        method: 'cookies',
        status: 'pending' // pending | in_progress | completed
      },
      {
        emoji: '📋',
        title: 'Headers',
        description: 'Analyzing HTTP response headers',
        method: 'headers',
        status: 'pending'
      },
      {
        emoji: '🔗',
        title: 'URL',
        description: 'Checking URL patterns',
        method: 'url',
        status: 'pending'
      },
      {
        emoji: '🌳',
        title: 'DOM',
        description: 'Scanning DOM elements',
        method: 'dom',
        status: 'pending'
      },
      {
        emoji: '🪝',
        title: 'JS Hooks',
        description: 'Monitoring JavaScript API calls',
        method: 'jsHooks',
        status: 'pending'
      },
      {
        emoji: '🔍',
        title: 'Window Properties',
        description: 'Checking window object properties',
        method: 'windowProperties',
        status: 'pending'
      }
    ];
  }

  /**
   * Show loading state while detection is running
   */
  showLoadingState(message = 'Analyzing page…') {
    this.isShowingResults = false; // FIX: Reset flag when showing loading state
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
  }

  renderAnalysisSteps() {
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
      const emoji = step.emoji || '⚙️';
      const status = step.status || 'pending';
      const method = step.method || '';

      // Determine status icon
      let statusIcon = '';
      if (status === 'completed') {
        statusIcon = '<span class="status-icon status-icon-complete">✓</span>';
      } else if (status === 'in_progress') {
        statusIcon = '<span class="status-icon status-icon-progress">⏳</span>';
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
  }

  startAnalysisProgress() {
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
    // Keeping the old animation would conflict with real updates and cause incorrect percentages
    //
    // const totalSteps = this.analysisSteps.length;
    // if (totalSteps <= 1) {
    //   return;
    // }
    //
    // this.analysisProgressInterval = setInterval(() => {
    //   const containerExists = document.body.contains(stepsContainer);
    //   if (!containerExists) {
    //     this.stopAnalysisProgress();
    //     return;
    //   }
    //
    //   if (this.analysisStepIndex < totalSteps - 1) {
    //     this.analysisStepIndex += 1;
    //     this.updateAnalysisStepStates();
    //     this.updateAnalysisPercent();
    //   } else {
    //     this.updateAnalysisPercent(95);
    //     this.stopAnalysisProgress();
    //   }
    // }, 1500);
  }

  updateAnalysisStepStates(forceComplete = false) {
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
  }

  updateAnalysisPercent(forceValue = null) {
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
  }

  stopAnalysisProgress({ markComplete = false } = {}) {
    if (this.analysisProgressInterval) {
      clearInterval(this.analysisProgressInterval);
      this.analysisProgressInterval = null;
    }

    if (markComplete) {
      this.updateAnalysisPercent(100);
      this.updateAnalysisStepStates(true);
    }
  }

  /**
   * GRANULAR PROGRESS: Update UI with real detection progress from background
   * @param {Object} progress - {method, methodPercent, totalPercent, completedMethods, message}
   */
  updateRealProgress(progress) {
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
  }

  /**
   * GRANULAR PROGRESS: Update status of individual detection methods
   * @param {string} currentMethod - Method that just completed
   * @param {Array<string>} completedMethods - All completed methods
   */
  updateMethodStatus(currentMethod, completedMethods) {
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
  }

  /**
   * FIX: Highlight the current detection phase in analysis steps
   * @param {string} phase - 'main', 'hooks', 'window_props', or 'complete'
   */
  highlightPhase(phase) {
    const stepElements = document.querySelectorAll('.analysis-step');
    if (!stepElements.length) return;

    stepElements.forEach((element) => {
      const stepPhase = element.getAttribute('data-step-phase');
      if (stepPhase === phase) {
        element.classList.remove('is-complete');
        element.classList.add('is-active');
      } else if (phase === 'complete' || this.isPhaseAfter(stepPhase, phase)) {
        element.classList.remove('is-active');
        element.classList.add('is-complete');
      } else {
        element.classList.remove('is-active', 'is-complete');
      }
    });
  }

  /**
   * Check if first phase comes after second phase
   */
  isPhaseAfter(phase1, phase2) {
    const phaseOrder = ['main', 'hooks', 'window_props', 'complete'];
    return phaseOrder.indexOf(phase1) > phaseOrder.indexOf(phase2);
  }

  /**
   * Handle loading timeout - check for results before showing interrupted state
   */
  handleLoadingTimeout() {
    if (this.debugMode) console.log('[Detection] Loading timeout reached - checking if detection completed');

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
                if (this.debugMode) console.warn('[Detection] Error checking for results:', chrome.runtime.lastError);
                this.showInterruptedState();
                return;
              }

              if (response?.data?.detectionResults?.length > 0) {
                // Detection completed! Show results instead of interrupted state
                if (this.debugMode) console.log('[Detection] Timeout but results exist - showing results instead of interrupted state');
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
                // Truly stuck - show interrupted state
                if (this.debugMode) console.log('[Detection] Timeout with no results - showing interrupted state');
                this.showInterruptedState();
              }
            }
          );
        } else {
          // No tab found - show interrupted state
          this.showInterruptedState();
        }
      });
    }
  }

  /**
   * Clear loading timeout
   */
  clearLoadingTimeout() {
    if (this.loadingTimeout) {
      clearTimeout(this.loadingTimeout);
      this.loadingTimeout = null;
    }
  }

  /**
   * Hide loading state
   */
  hideLoadingState() {
    this.stopAnalysisProgress({ markComplete: true });
    this.clearLoadingTimeout(); // Clear timeout when loading completes
    this.isShowingAnalyzing = false; // Reset flag when hiding analyzing state
    const loadingState = document.querySelector('#loadingState');
    if (loadingState) loadingState.style.display = 'none';
  }

  /**
   * Show analyzing state with loading animation
   * @param {string} message - Optional message to display
   */
  showAnalyzingState(message = 'Analyzing page…') {
    // FIX: Prevent re-showing analyzing state if already showing
    // This prevents UI flicker when popup opens during active detection
    if (this.isShowingAnalyzing) {
      if (this.debugMode) console.log('Detection: Already showing analyzing state, skipping re-render');
      return;
    }

    this.wasInterrupted = false; // Reset flag when starting new analysis
    this.isShowingAnalyzing = true; // Track that we're showing analyzing state
    this.analysisSteps = this.createAnalysisSteps();
    this.renderAnalysisSteps();
    this.showLoadingState(message);
    this.startAnalysisProgress();
  }

  /**
   * Show empty state when no detections found
   */
  showEmptyState() {
    this.wasInterrupted = false; // Reset flag when showing successful state
    this.isShowingResults = false; // FIX: Reset flag when showing empty state
    this.hideLoadingState();
    this.clearLoadingTimeout(); // Clear timeout when showing empty state

    // Reset clear cache button to default state
    this.resetClearCacheButton();

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
  }

  /**
   * Show disabled state when detection is turned off
   */
  showDisabledState() {
    this.wasInterrupted = false; // Reset flag when showing disabled state
    this.isShowingResults = false; // FIX: Reset flag when showing disabled state
    this.hideLoadingState();
    this.clearLoadingTimeout(); // Clear timeout when showing disabled state
    const disabledState = document.querySelector('#disabledState');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const detectionPagination = document.querySelector('#detectionPagination');
    const interruptedState = document.querySelector('#interruptedState');

    if (disabledState) disabledState.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
  }

  /**
   * Show interrupted state when detection was cancelled mid-run
   */
  showInterruptedState() {
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
  }

  /**
   * Display detection results with stats and detected items
   * @param {Array} detections - Array of detection results
   * @param {Object} options - Display options (fromCache, cacheExpiry)
   */
  async displayResults(detections = [], options = {}) {
    if (this.debugMode) console.log('Detection.displayResults called with:', detections, options);

    // Ensure HTML is loaded
    if (!this.initialized) {
      await this.initialize();
    }

    this.wasInterrupted = false; // Reset flag when successfully displaying results
    this.isShowingResults = true; // FIX: Mark that we're showing results to prevent message listeners from overriding
    this.currentResults = detections;
    this.displayOptions = options;
    this.cacheMetadata = options.cacheMetadata || null;
    console.log('[DEBUG Detection] ✅ currentResults stored:', this.currentResults.length, 'detections');

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

        // Calculate badge color based on detection count
        const count = detectionCount.toString();
        const color = detectionCount >= 5 ? badgeColors.high :
                     detectionCount >= 3 ? badgeColors.medium :
                     badgeColors.low;

        // Update badge text and color
        await chrome.action.setBadgeText({ text: count, tabId: tabs[0].id });
        await chrome.action.setBadgeBackgroundColor({ color: color, tabId: tabs[0].id });

        if (this.debugMode) {
          console.log(`[Detection] Badge updated to ${count} with color ${color}`);
        }
      }
    } catch (error) {
      if (this.debugMode) {
        console.warn('[Detection] Could not update badge:', error);
      }
    }
  }

  /**
   * Update the stats grid with detection information
   * @param {Array} detections - Array of detection results
   */
  updateStats(detections) {
    const detectionsCount = document.querySelector('#detectionsCount');
    const overallConfidence = document.querySelector('#overallConfidence');
    const difficultyLevel = document.querySelector('#difficultyLevel');
    const difficultyIcon = document.querySelector('#difficultyIcon');
    const detectionTime = document.querySelector('#detectionTime');
    const detectionCount = document.querySelector('#detectionCount');

    const totalDetections = detections.length;
    const avgConfidence = totalDetections > 0
      ? Math.round(detections.reduce((sum, d) => sum + (d.confidence || 0), 0) / totalDetections)
      : 0;

    // Determine difficulty level based on number and confidence of detections
    let difficulty = 'Low';
    let icon = '🛡️';
    if (totalDetections > 5 || avgConfidence > 80) {
      difficulty = 'High';
      icon = '🔥';
    } else if (totalDetections > 2 || avgConfidence > 60) {
      difficulty = 'Medium';
      icon = '⚠️';
    }

    // Update UI elements
    if (detectionsCount) detectionsCount.textContent = totalDetections;
    if (overallConfidence) overallConfidence.textContent = `${avgConfidence}%`;
    if (difficultyLevel) difficultyLevel.textContent = difficulty;
    if (difficultyIcon) difficultyIcon.textContent = icon;

    if (detectionCount) detectionCount.textContent = totalDetections;

  }


  /**
   * Update URL display with favicon and hostname
   * @param {Object} options - Options containing cacheMetadata or URL info
   */
  updateUrlDisplay(options = {}) {
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
  }

  /**
   * Update cache information display
   */
  updateCacheInfo() {
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
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        cacheExpiry.textContent = `${hours}h ${minutes}m`;
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
  }

  /**
   * Clear cached detection for current page
   */
  async clearCache() {
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    let originalText = '';

    try {
      // Show confirmation modal
      const confirmed = await NotificationHelper.confirm({
        title: 'Clear Cache',
        message: 'This will remove cached detection data for this domain and trigger a fresh analysis.',
        confirmText: 'Clear Cache',
        cancelText: 'Cancel',
        type: 'warning'
      });

      if (!confirmed) return;

      // Save original button text and update to "Clearing..."
      if (clearCacheBtn) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          originalText = textSpan.textContent;
          textSpan.textContent = 'Clearing...';
        }
        clearCacheBtn.disabled = true;
      }

      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        // Restore button on error
        if (clearCacheBtn && originalText) {
          const textSpan = clearCacheBtn.querySelector('span');
          if (textSpan) {
            textSpan.textContent = originalText;
          }
          clearCacheBtn.disabled = false;
        }
        return;
      }

      const url = tabs[0].url;

      // OPTION 1: Clean cache clear with automatic silent re-detection
      // Send message to background to clear cache (NO hold period)
      await chrome.runtime.sendMessage({
        type: 'CLEAR_DETECTION_CACHE',
        url: url,
        tabId: tabs[0].id
        // Removed: holdDetectionForMs (we'll trigger background detection instead)
      });

      // Update button to show success
      if (clearCacheBtn) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = '✓ Cleared!';
        }
      }

      NotificationHelper.success('Cache cleared');

      // Set badge to "✕" with gray background to indicate no detection
      try {
        await chrome.action.setBadgeText({ text: '✕', tabId: tabs[0].id });
        await chrome.action.setBadgeBackgroundColor({
          color: '#6B7280', // gray-500
          tabId: tabs[0].id
        });
      } catch (error) {
        if (this.debugMode) console.warn('Could not set badge:', error);
      }

      // Remove debug mode flag from sessionStorage
      sessionStorage.removeItem('scrapfly_debug_mode');

      // Clear current results immediately
      this.currentResults = [];

      // Set flag to prevent auto-refresh from NEW_DETECTION_DATA
      // Store in sessionStorage to persist across popup close/reopen
      this.justClearedCache = true;
      sessionStorage.setItem('scrapfly_just_cleared_cache', Date.now().toString());

      // Show "Nothing Detected" page immediately after cache clear
      this.showEmptyState();
    } catch (error) {
      if (this.debugMode) console.error('Failed to clear cache:', error);
      NotificationHelper.error('Failed to clear cache');

      // Restore button on error
      if (clearCacheBtn && originalText) {
        const textSpan = clearCacheBtn.querySelector('span');
        if (textSpan) {
          textSpan.textContent = originalText;
        }
        clearCacheBtn.disabled = false;
      }
    }
  }

  /**
   * Reset clear cache button to default state
   */
  resetClearCacheButton() {
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    if (clearCacheBtn) {
      const textSpan = clearCacheBtn.querySelector('span');
      if (textSpan) {
        textSpan.textContent = 'Clear Cache';
      }
      clearCacheBtn.disabled = false;
    }
  }

  /**
   * Add current domain to blacklist
   */
  async addToBlacklist() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs[0]) {
        NotificationHelper.error('Unable to get current page');
        return;
      }

      const url = new URL(tabs[0].url);
      const domain = url.hostname;

      if (!domain) {
        NotificationHelper.error('Invalid domain');
        return;
      }

      // Show confirmation modal
      const confirmed = await NotificationHelper.confirm({
        title: 'Add to Blacklist',
        message: `Domain "${domain}" will be excluded from all future detections. You can remove it later in Settings.`,
        confirmText: 'Add to Blacklist',
        cancelText: 'Cancel',
        type: 'danger'
      });

      if (!confirmed) return;

      // Get current settings
      const result = await chrome.storage.local.get('scrapfly_settings');
      let settings = result.scrapfly_settings || {};

      // Parse settings if it's a string
      if (typeof settings === 'string') {
        try {
          settings = JSON.parse(settings);
        } catch (e) {
          if (this.debugMode) console.error('Failed to parse settings JSON:', e);
          settings = {};
        }
      }

      // Handle nested settings structure (settings.settings)
      if (settings.settings && typeof settings.settings === 'object') {
        settings = settings.settings;
      }

      // Initialize detection object if needed
      if (!settings.detection) {
        settings.detection = {};
      }

      // Initialize blacklistedDomains array if needed
      if (!settings.detection.blacklistedDomains) {
        settings.detection.blacklistedDomains = [];
      }

      // Check if already blacklisted
      if (settings.detection.blacklistedDomains.includes(domain)) {
        NotificationHelper.info(`Domain "${domain}" is already blacklisted`);
        return;
      }

      // Add to blacklist
      settings.detection.blacklistedDomains.push(domain);

      // Save settings (maintaining the correct structure)
      await chrome.storage.local.set({ scrapfly_settings: settings });

      // Invalidate settings cache
      if (typeof Utils !== 'undefined' && typeof Utils.invalidateSettingsCache === 'function') {
        Utils.invalidateSettingsCache();
      }

      NotificationHelper.success(`Added "${domain}" to blacklist`);

      // Show blacklist warning state
      this.showBlacklistState(domain);
    } catch (error) {
      if (this.debugMode) console.error('Failed to add to blacklist:', error);
      NotificationHelper.error('Failed to add to blacklist: ' + error.message);
    }
  }

  /**
   * Show blacklist warning state for a domain
   * @param {string} domain - The blacklisted domain
   */
  showBlacklistState(domain) {
    this.hideLoadingState();

    const blacklistWarning = document.querySelector('#blacklistWarning');
    const blacklistDomain = document.querySelector('#blacklistDomain');
    const emptyState = document.querySelector('#emptyState');
    const detectionResults = document.querySelector('#detectionResults');
    const disabledState = document.querySelector('#disabledState');
    const interruptedState = document.querySelector('#interruptedState');
    const detectionPagination = document.querySelector('#detectionPagination');

    // Update domain display
    if (blacklistDomain) {
      blacklistDomain.textContent = domain;
    }

    // Show blacklist warning, hide everything else
    if (blacklistWarning) blacklistWarning.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';
    if (detectionResults) detectionResults.style.display = 'none';
    if (disabledState) disabledState.style.display = 'none';
    if (interruptedState) interruptedState.style.display = 'none';
    if (detectionPagination) detectionPagination.style.display = 'none';

    // Update badge to show orange X for blacklisted domain
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.action.setBadgeText({ text: '✕', tabId: tabs[0].id }).catch((error) => {
          if (this.debugMode) console.log('Failed to set blacklist badge:', error.message);
        });
        chrome.action.setBadgeBackgroundColor({ color: '#FF8C00', tabId: tabs[0].id }).catch((error) => {
          if (this.debugMode) console.log('Failed to set badge color:', error.message);
        });
      }
    });
  }

  /**
   * Remove domain from blacklist
   * @param {string} domain - The domain to remove
   */
  async removeFromBlacklist(domain) {
    try {
      // Get current settings
      const result = await chrome.storage.local.get('scrapfly_settings');
      let settings = result.scrapfly_settings || {};

      // Parse settings if it's a string
      if (typeof settings === 'string') {
        try {
          settings = JSON.parse(settings);
        } catch (e) {
          if (this.debugMode) console.error('Failed to parse settings JSON:', e);
          settings = {};
        }
      }

      // Handle nested settings structure
      if (settings.settings && typeof settings.settings === 'object') {
        settings = settings.settings;
      }

      // Remove from blacklist
      if (settings.detection?.blacklistedDomains) {
        settings.detection.blacklistedDomains = settings.detection.blacklistedDomains.filter(d => d !== domain);

        // Save updated settings
        await chrome.storage.local.set({ scrapfly_settings: settings });

        // Invalidate settings cache
        if (typeof Utils !== 'undefined' && typeof Utils.invalidateSettingsCache === 'function') {
          Utils.invalidateSettingsCache();
        }

        NotificationHelper.success(`Removed "${domain}" from blacklist`);

        // Hide blacklist warning UI before refreshing
        const blacklistWarning = document.querySelector('#blacklistWarning');
        if (blacklistWarning) blacklistWarning.style.display = 'none';

        // Get current tab and check for cached data first
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          // Show analyzing state
          this.showAnalyzingState();

          // Try to get cached data first (doesn't trigger fresh detection)
          chrome.runtime.sendMessage(
            { type: 'GET_DETECTION_DATA', tabId: tab.id },
            async (response) => {
              if (chrome.runtime.lastError) {
                if (this.debugMode) console.error('Detection: Error getting cached data:', chrome.runtime.lastError);
                // Fall back to fresh detection
                this.refreshAnalysis();
                return;
              }

              if (response && response.data) {
                // We have cached data - use it immediately (badge will show count, not %)
                if (this.debugMode) console.log('Detection: Using cached data after blacklist removal');
                this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
                const detections = this.detectionEngine.detectOnPage(response.data);
                this.displayResults(detections);

                // Update badge to show detection count immediately (not percentage)
                if (detections.length > 0) {
                  chrome.action.setBadgeText({ text: detections.length.toString(), tabId: tab.id }).catch((error) => {
                    if (this.debugMode) console.log('Failed to update badge after blacklist removal:', error.message);
                  });
                  // Set appropriate color based on count
                  const color = detections.length >= 5 ? '#ef4444' : // red for high
                               detections.length >= 3 ? '#f59e0b' : // orange for medium
                               '#22c55e'; // green for low
                  chrome.action.setBadgeBackgroundColor({ color: color, tabId: tab.id }).catch((error) => {
                    if (this.debugMode) console.log('Failed to set badge color:', error.message);
                  });
                }
              } else {
                // No cached data available - request fresh detection
                if (this.debugMode) console.log('Detection: No cached data, requesting fresh detection');
                this.refreshAnalysis();
              }
            }
          );
        }
      }
    } catch (error) {
      if (this.debugMode) console.error('Failed to remove from blacklist:', error);
      NotificationHelper.error('Failed to remove from blacklist: ' + error.message);
    }
  }

  /**
   * Render detections page items (called by pagination manager)
   * @param {Array} detections - Detection items for current page
   */
  renderDetectionsPage(detections) {
    console.log(`[renderDetectionsPage] Called with ${detections?.length || 0} detections`);
    const resultsList = document.querySelector('#resultsList');
    if (!resultsList) {
      console.error('[renderDetectionsPage] resultsList not found!');
      return;
    }
    console.log('[renderDetectionsPage] resultsList found, rendering...');

    const totalItems = this.paginationManager?.filteredItems?.length ?? detections.length;
    const shouldUseExpandedLayout = totalItems === 2;
    resultsList.classList.toggle('expanded-results', shouldUseExpandedLayout);

    let resultsHtml = '';

    // Check if we're displaying only 1 detection result for enhanced styling
    const isSingleResult = detections.length === 1;

    detections.forEach((detection, index) => {
      const confidence = detection.confidence || 0;
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      const detectorIcon = this.getDetectorIcon(detection);
      const detectorDescription = detection.detector?.description || '';

      // Get category badges
      const categoryBadges = this.getCategoryBadges(detection);

      const globalIndex = this.getGlobalDetectionIndex(detection, index);

      resultsHtml += `
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
    });

    resultsList.innerHTML = resultsHtml;

    // Add click handlers for expandable cards
    const cards = document.querySelectorAll('.detection-card');
    console.log(`[renderDetectionsPage] Found ${cards.length} detection cards`);

    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        console.log('[renderDetectionsPage] Card clicked');
        if (e.target.closest('.copy-btn')) {
          return;
        }

        const indexAttr = card.getAttribute('data-detection-index');
        const parsedIndex = parseInt(indexAttr, 10);
        console.log('[renderDetectionsPage] Opening modal for index', parsedIndex);
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
  }

  /**
   * Get category badges for detection
   * @param {object} detection - Detection object
   * @returns {string} HTML for category badges
   */
  getCategoryBadges(detection) {
    const badges = [];

    // Main category badge with dynamic color from storage
    if (detection.category) {
      const categoryInfo = this.detectorManager.getCategoryInfo(detection.category.toLowerCase());
      const categoryColor = categoryInfo?.colour || '#666666';
      const categoryName = detection.category.charAt(0).toUpperCase() + detection.category.slice(1);
      badges.push(`<span class="badge" style="background: ${categoryColor}; color: white;">${categoryName}</span>`);
    }

    // Add detection method badges based on actual matches
    if (detection.matches && detection.matches.length > 0) {
      const methodTypes = new Set();
      detection.matches.forEach(match => {
        if (match.type) {
          methodTypes.add(match.type);
        }
      });

      // Convert method types to badges with dynamic colors from CategoryManager
      methodTypes.forEach(type => {
        const typeName = type.toLowerCase();
        const methodName = typeName.replace(/_/g, ' ').toUpperCase();
        const tagColor = this.detectorManager.categoryManager.getTagColor(typeName);

        if (tagColor && tagColor !== '#666666') {
          // Use dynamic color from storage with transparent background
          const r = parseInt(tagColor.slice(1, 3), 16);
          const g = parseInt(tagColor.slice(3, 5), 16);
          const b = parseInt(tagColor.slice(5, 7), 16);
          badges.push(`<span class="badge" style="background: rgba(${r}, ${g}, ${b}, 0.15); color: ${tagColor}; border: 1px solid rgba(${r}, ${g}, ${b}, 0.3);">${methodName}</span>`);
        } else {
          // Fallback to CSS class (use typeName for CSS class)
          const methodClass = `badge-${typeName}`;
          badges.push(`<span class="badge ${methodClass}">${methodName}</span>`);
        }
      });
    }

    return badges.join('');
  }

  /**
   * Get method badges for detection
   * @param {array} matches - Detection matches
   * @returns {string} HTML for method badges
   */
  getMethodBadges(matches) {
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
        case 'scripts':
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

      // Truncate long values for display (keep full value for copy)
      const maxDisplayLength = 50;
      if (displayValue.length > maxDisplayLength) {
        displayValue = displayValue.substring(0, maxDisplayLength) + '...';
      }

      // Get tag color from CategoryManager using original matchType (preserves underscores)
      const tagColor = this.detectorManager.categoryManager.getTagColor(matchType);

      // Always apply solid background color
      const backgroundColor = (tagColor && tagColor !== '#666666') ? tagColor : '#666666';
      const badgeStyle = `style="background: ${backgroundColor}; color: white; border: none;"`;

      // Confidence badge color
      let confidenceClass = 'confidence-low';
      if (confidence >= 90) confidenceClass = 'confidence-high';
      else if (confidence >= 70) confidenceClass = 'confidence-medium';

      // Normalize method type for CSS class using original matchType (preserves underscores/hyphens)
      // Replace underscores with hyphens for CSS compatibility, then handle plural to singular
      const methodClass = matchType.replace(/_/g, '-').replace(/s$/, ''); // js_hooks -> js-hooks, cookies -> cookie

      const encodedValue = encodeURIComponent(copyValue);
      const safeDisplayValue = Utils.escapeHtml(displayValue);
      const safeFullValue = Utils.escapeHtml(copyValue);

      return `
        <div class="method-item-card method-${methodClass}" data-copy-value="${encodedValue}" data-method-type="${methodType}" title="Click to copy">
          <span class="method-type-badge" ${badgeStyle}>${methodType}</span>
          <button type="button" class="method-value-btn" data-copy-target="value" title="${safeFullValue}">${safeDisplayValue}</button>
          <span class="method-confidence ${confidenceClass}">${confidence}%</span>
        </div>
      `;
    });

    return badges.join('');
  }

  /**
   * Copy detection details to clipboard
   * @param {number|object} indexOrDetection - Detection index or object
   */
  copyDetection(indexOrDetection, triggerElement = null) {
    const detection = typeof indexOrDetection === 'object'
      ? indexOrDetection
      : this.getDetectionByIndex(indexOrDetection);

    if (!detection) {
      return;
    }
    const detailsText = `
Security System: ${detection.detector?.name || 'Unknown'}
Category: ${detection.category || 'Unknown'}
Confidence: ${detection.confidence || 0}%
Detection Methods: ${detection.matches?.map(m => `${m.type}: ${m.pattern || m.name || m.selector}`).join(', ') || 'Unknown'}
    `.trim();

    Utils.copyToClipboard(detailsText, {
      element: triggerElement,
      notificationMessage: 'Detection details copied',
      inlineMessage: '✓ Copied!'
    });
  }

  /**
   * Copy individual method value to clipboard
   * @param {string} value - Method value/pattern
   * @param {string} type - Method type
   */
  copyMethodValue(value, type, triggerElement = null) {
    const textToCopy = `[${type}] ${value}`;
    Utils.copyToClipboard(textToCopy, {
      element: triggerElement,
      notificationMessage: 'Method value copied',
      inlineMessage: '✓ Copied!'
    });
  }

  getDetectionByIndex(index) {
    if (typeof index !== 'number') {
      return null;
    }

    if (this.paginationManager && Array.isArray(this.paginationManager.filteredItems)) {
      const filteredDetection = this.paginationManager.filteredItems[index];
      if (filteredDetection) {
        return filteredDetection;
      }
    }

    return this.currentResults[index] || null;
  }

  getGlobalDetectionIndex(detection, fallbackIndex = 0) {
    if (this.paginationManager && Array.isArray(this.paginationManager.filteredItems)) {
      const index = this.paginationManager.filteredItems.indexOf(detection);
      if (index !== -1) {
        return index;
      }
    }
    return fallbackIndex;
  }

  initializeModalElements() {
    const modal = document.querySelector('#detectionDetailModal');
    if (!modal) {
      return;
    }

    const overlay = modal.querySelector('.detection-modal-overlay');
    const closeBtn = modal.querySelector('#closeDetectionModal');
    const copyBtn = modal.querySelector('#copyDetectionModal');

    this.modalElements = {
      modal,
      overlay,
      closeBtn,
      copyBtn,
      icon: modal.querySelector('#detectionModalIcon'),
      name: modal.querySelector('#detectionModalName'),
      categories: modal.querySelector('#detectionModalCategories'),
      confidence: modal.querySelector('#detectionModalConfidence'),
      detections: modal.querySelector('#detectionModalDetections'),
      difficulty: modal.querySelector('#detectionModalDifficulty'),
      description: modal.querySelector('#detectionModalDescription'),
      methods: modal.querySelector('#detectionModalMethods')
    };

    const closeHandler = () => this.closeDetectionModal();

    if (overlay) {
      overlay.addEventListener('click', closeHandler);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeHandler);
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (this.activeModalIndex !== null) {
          const detection = this.getDetectionByIndex(this.activeModalIndex);
          this.copyDetection(detection, copyBtn);
        }
      });
    }

    if (!this.handleModalKeyDown) {
      this.handleModalKeyDown = (event) => {
        if (event.key === 'Escape') {
          this.closeDetectionModal();
        }
      };
      document.addEventListener('keydown', this.handleModalKeyDown);
    }
  }

  openDetectionModal(index) {
    if (!this.modalElements) {
      this.initializeModalElements();
    }

    if (!this.modalElements) {
      return;
    }

    const detection = this.getDetectionByIndex(index);
    if (!detection) {
      return;
    }

    this.activeModalIndex = index;
    this.renderDetectionModalContent(detection);

    this.modalElements.modal.style.display = 'flex';
    requestAnimationFrame(() => {
      this.modalElements.modal.classList.add('is-open');
    });
  }

  closeDetectionModal() {
    if (!this.modalElements) {
      return;
    }

    this.modalElements.modal.classList.remove('is-open');
    this.modalElements.modal.style.display = 'none';
    this.activeModalIndex = null;
  }

  renderDetectionModalContent(detection) {
    if (!this.modalElements) {
      return;
    }

    const confidence = detection.confidence || 0;
    let confidenceClass = 'confidence-low';
    if (confidence >= 90) confidenceClass = 'confidence-high';
    else if (confidence >= 70) confidenceClass = 'confidence-medium';

    const difficulty = detection.difficulty || (confidence >= 80 ? 'High' : confidence >= 50 ? 'Medium' : 'Low');

    if (this.modalElements.icon) {
      this.modalElements.icon.innerHTML = this.getDetectorIcon(detection);
    }

    if (this.modalElements.name) {
      this.modalElements.name.textContent = detection.detector?.name || detection.detector || 'Unknown Detection';
    }

    if (this.modalElements.categories) {
      this.modalElements.categories.innerHTML = this.getCategoryBadges(detection);
    }

    if (this.modalElements.confidence) {
      this.modalElements.confidence.textContent = `${confidence}%`;
      this.modalElements.confidence.className = `meta-value ${confidenceClass}`;
    }

    if (this.modalElements.detections) {
      const matchCount = Array.isArray(detection.matches) ? detection.matches.length : 0;
      if (matchCount > 0) {
        const matchLabel = matchCount === 1 ? 'match' : 'matches';
        this.modalElements.detections.textContent = `${matchCount} ${matchLabel}`;
      } else {
        this.modalElements.detections.textContent = 'No matches recorded';
      }
    }

    if (this.modalElements.difficulty) {
      this.modalElements.difficulty.textContent = difficulty;
    }

    if (this.modalElements.description) {
      const description = detection.detector?.description || 'No additional details provided for this detection.';
      this.modalElements.description.textContent = description;
    }

    if (this.modalElements.methods) {
      if (detection.matches && detection.matches.length) {
        this.modalElements.methods.innerHTML = this.getMethodBadges(detection.matches);
        this.attachModalMethodHandlers();
      } else {
        this.modalElements.methods.innerHTML = '<div class="detection-modal-empty">No detection methods recorded for this detector.</div>';
      }
    }
  }

  attachModalMethodHandlers() {
    const methodCards = document.querySelectorAll('#detectionModalMethods .method-item-card');
    methodCards.forEach(card => {
      const encodedValue = card.getAttribute('data-copy-value') || '';
      const methodType = card.getAttribute('data-method-type') || 'Unknown';
      const decodedValue = encodedValue ? decodeURIComponent(encodedValue) : '';
      const valueButton = card.querySelector('.method-value-btn');

      const handleCopy = (event) => {
        event.stopPropagation();
        this.copyMethodValue(decodedValue, methodType, valueButton || card);
      };

      card.addEventListener('click', handleCopy);

      if (valueButton) {
        valueButton.addEventListener('click', handleCopy);
      }
    });
  }

  /**
   * Get filtered results based on search query
   * @returns {Array} Filtered detection results
   */
  getFilteredResults() {
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
  }

  /**
   * Sort detections by category priority
   * Priority: Anti-Bot > CAPTCHA > Fingerprint
   * Within same category, sort by confidence (highest first)
   * @param {Array} detections - Detection results
   * @returns {Array} Sorted detections
   */
  sortDetectionsByCategory(detections) {
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
  }

  /**
   * Handle search functionality for filtering results
   * @param {string} query - Search query
   */
  handleSearch(query) {
    this.searchQuery = query.toLowerCase().trim();

    // Filter items if search query exists
    const itemsToShow = this.searchQuery
      ? this.getFilteredResults()
      : this.currentResults;

    // Update pagination with filtered results
    if (this.paginationManager) {
      this.paginationManager.setItems(itemsToShow);
    }
  }

  /**
   * Refresh analysis by re-running detection on current page
   */
  async refreshAnalysis() {
    if (this.debugMode) console.log('Refreshing detection analysis...');

    try {
      this.showAnalyzingState();

      // Get current tab information
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active tab found');
      }

      // Request fresh detection from background script
      chrome.runtime.sendMessage(
        { type: 'REQUEST_DETECTION', tabId: tab.id },
        (response) => {
          if (chrome.runtime.lastError) {
            if (this.debugMode) console.error('Detection: Error requesting fresh detection:', chrome.runtime.lastError);
            this.hideLoadingState();
            this.showEmptyState();
            return;
          }

          if (this.debugMode) console.log('Detection: Fresh detection requested:', response);

          // Wait a moment for detection to complete, then request the data
          setTimeout(() => {
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tab.id },
              async (dataResponse) => {
                if (chrome.runtime.lastError) {
                  if (this.debugMode) console.error('Detection: Error getting detection data:', chrome.runtime.lastError);
                  this.hideLoadingState();
                  this.showEmptyState();
                  return;
                }

                if (dataResponse && dataResponse.data) {
                  // Run detection using DetectionEngineManager on real data
                  this.detectionEngine.setDetectors(this.detectorManager.getAllDetectors());
                  const detections = this.detectionEngine.detectOnPage(dataResponse.data);
                  if (this.debugMode) console.log(`Detection: Found ${detections.length} detections after refresh`);

                  // Display results
                  this.displayResults(detections);
                } else {
                  if (this.debugMode) console.log('Detection: No data received after refresh');
                  this.hideLoadingState();
                  this.showEmptyState();
                }
              }
            );
          }, 2000); // Wait 2 seconds for detection to complete
        }
      );

    } catch (error) {
      if (this.debugMode) console.error('Failed to refresh analysis:', error);
      this.hideLoadingState();
      this.showEmptyState();
    }
  }

  /**
   * Get detector icon from detector data or fallback to category icon
   * @param {object} detection - Detection object
   * @returns {string} Icon string (emoji or URL)
   */
  getDetectorIcon(detection) {
    // Check for custom uploaded icon first
    if (detection.detector?.customIcon) {
      return `<img src="${detection.detector.customIcon}" alt="${detection.detector.name || 'Icon'}" />`;
    }

    // Try to get real icon from detector data
    if (detection.detector?.icon) {
      if (typeof detection.detector.icon === 'string') {
        const lowerIcon = detection.detector.icon.toLowerCase();
        if (lowerIcon === 'default') {
          const scrapflyIcon = chrome.runtime.getURL('icons/scrapfly.webp');
          return `<img src="${scrapflyIcon}" alt="${detection.detector.name || 'Icon'}" />`;
        }
        if (lowerIcon === 'custom' || lowerIcon === 'custom.png') {
          const scrapflyIcon = chrome.runtime.getURL('icons/scrapfly.webp');
          return `<img src="${scrapflyIcon}" alt="${detection.detector.name || 'Icon'}" />`;
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
      const defaultIconPath = chrome.runtime.getURL('detectors/icons/custom.png');
      return `<img src="${iconPath}" alt="${detection.detector.name || 'Icon'}" onerror="this.src='${defaultIconPath}'" />`;
    }

    // No icon specified, use default custom.png
    const scrapflyIcon = chrome.runtime.getURL('icons/scrapfly.webp');
    return `<img src="${scrapflyIcon}" alt="${detection.detector?.name || 'Icon'}" />`;
  }

  /**
   * Get category icon for display (fallback)
   * @param {string} category - Category name
   * @returns {string} Icon emoji
   */
  getCategoryIcon(category) {
    switch (category?.toLowerCase()) {
      case 'antibot':
      case 'anti-bot':
        return '🛡️';
      case 'captcha':
        return '🧩';
      case 'fingerprint':
      case 'fingerprinting':
        return '👆';
      default:
        return '🔍';
    }
  }

  /**
   * Initialize detection section with event listeners
   */
  async initialize() {
    if (!this.initialized) {
      await this.loadHTML();
      this.setupPagination();
      this.setupEventListeners();
      this.initialized = true;

      // Load debug mode from settings
      try {
        const result = await chrome.storage.local.get(['scrapfly_settings']);
        const settings = result.scrapfly_settings || {};
        this.debugMode = settings.debugMode || false;
      } catch (e) {
        this.debugMode = false;
      }

      // Expose copy function globally for onclick handlers
      window.scrapflyDetection = this;
    }
  }

  /**
   * Setup pagination manager
   */
  setupPagination() {
    this.paginationManager = new PaginationManager('detectionPagination', {
      itemsPerPage: 2,
      onPageChange: (page, items) => {
        this.renderDetectionsPage(items);
      }
    });
  }

  /**
   * Load HTML template into detection tab
   */
  async loadHTML() {
    try {
      const response = await fetch(chrome.runtime.getURL('sections/detection/detection.html'));
      const html = await response.text();

      const detectionTab = document.querySelector('#detectionTab');
      if (detectionTab) {
        detectionTab.innerHTML = html;
        this.renderAnalysisSteps();
        const loadingState = document.querySelector('#loadingState');
        if (loadingState && loadingState.style.display !== 'none') {
          // FIX: Don't call startAnalysisProgress() - it runs old animation
          // Instead, initialize UI for real progress updates only
          this.stopAnalysisProgress();
          this.clearLoadingTimeout();
          this.analysisStepIndex = 0;
          this.updateAnalysisStepStates();
          this.updateAnalysisPercent(0);
          this.loadingTimeout = setTimeout(() => {
            this.handleLoadingTimeout();
          }, this.loadingTimeoutDuration);

          // FIX: Read current badge percentage and sync popup with it
          // This ensures popup shows same % as badge (in case popup opened after progress updates)
          chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
              try {
                const badgeText = await chrome.action.getBadgeText({ tabId: tabs[0].id });
                // Badge percentage sync removed - no longer showing percentages in badge
              } catch (error) {
                if (this.debugMode) console.warn('[Detection] Could not read badge text:', error);
              }
            }
          });
        }
      }
    } catch (error) {
      if (this.debugMode) console.error('Failed to load detection HTML:', error);
    }
  }

  /**
   * Setup event listeners after HTML is loaded
   */
  setupEventListeners() {
    // Reset modal elements to ensure they are properly initialized
    this.modalElements = null;

    // Setup search functionality
    const searchInput = document.querySelector('#detectionSearch');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    // Setup clear cache button
    const clearCacheBtn = document.querySelector('#clearCacheBtn');
    if (clearCacheBtn) {
      clearCacheBtn.addEventListener('click', () => {
        this.clearCache();
      });
    }

    // Setup add to blacklist button
    const addToBlacklistBtn = document.querySelector('#addToBlacklistBtn');
    if (addToBlacklistBtn) {
      addToBlacklistBtn.addEventListener('click', () => {
        this.addToBlacklist();
      });
    }

    // Reload button removed - users should manually reload the page

    // Setup remove from blacklist button
    const removeFromBlacklistBtn = document.querySelector('#removeFromBlacklistBtn');
    if (removeFromBlacklistBtn) {
      removeFromBlacklistBtn.addEventListener('click', async () => {
        const blacklistDomain = document.querySelector('#blacklistDomain');
        const domain = blacklistDomain ? blacklistDomain.textContent : '';
        if (domain) {
          await this.removeFromBlacklist(domain);
        }
      });
    }

    // NOTE: Message listeners are now set up in setupMessageListeners() called from constructor
    // This ensures they're active even before tab initialization

    this.initializeModalElements();
  }

  // ============================================================================
  // Static Methods (Background & Popup Context)
  // ============================================================================

  /**
   * Request detection data for current tab
   * @param {object} context - {detection, Utils, processDetectionDataCallback}
   */
  static async requestCurrentTabDetection(context) {
    const { detection, Utils, processDetectionDataCallback } = context;

    // FIX: Prevent duplicate requests when popup opens during active detection
    // Check if we're already requesting detection data to avoid interference
    if (detection.isRequestingDetection) {
      if (detection.debugMode) console.log('Detection: Already requesting detection, skipping duplicate request');
      return;
    }

    try {
      // Set flag to prevent concurrent requests
      detection.isRequestingDetection = true;

      // Don't show analyzing state immediately - wait for background response to determine correct state
      // This prevents the confusing double transition (Analyzing → Interrupted) when popup opens on interrupted tab

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        if (this.debugMode) console.error('Detection: No active tab found');
        detection.showEmptyState();
        detection.isRequestingDetection = false;
        return;
      }

      // Check if extension is enabled
      const result = await chrome.storage.local.get(['scrapfly_enabled']);
      if (result.scrapfly_enabled === false) {
        if (this.debugMode) console.log('Detection: Extension is disabled');
        detection.showDisabledState();
        detection.isRequestingDetection = false;
        return;
      }

      // Check if URL is blacklisted
      if (await Utils.isUrlBlacklisted(tab.url)) {
        if (this.debugMode) console.log('Detection: URL is blacklisted');
        const url = new URL(tab.url);
        detection.showBlacklistState(url.hostname);
        detection.isRequestingDetection = false;
        return;
      }

      // Request detection data from background
      chrome.runtime.sendMessage(
        { type: 'GET_DETECTION_DATA', tabId: tab.id },
        async (response) => {
          // Clear the request flag
          detection.isRequestingDetection = false;

          if (chrome.runtime.lastError) {
            if (this.debugMode) console.error('Detection: Error getting detection data:', chrome.runtime.lastError);
            detection.showEmptyState();
            return;
          }

          // FIX: Don't show empty state immediately if response is null/undefined
          // Badge check below will determine the correct state (analyzing, cached data, etc.)
          // Only show empty state if we explicitly get a response with no data
          if (!response) {
            if (this.debugMode) console.log('Detection: No response yet, continuing to badge check...');
            // Don't return - let badge check handle state
          }

          if (response && response.status === 'pending') {
            if (this.debugMode) console.log('Detection: Detection still running - checking if cached data exists first');

            // FIX: Check if cached data exists even though detection is pending
            // This handles race condition where detection completed but status still says pending
            if (response.data && response.data.detectionResults?.length > 0) {
              if (this.debugMode) console.log('Detection: Found cached results despite pending status - displaying');
              await processDetectionDataCallback(response.data);
              return;
            }

            // No cached data, truly still running - show analyzing state
            if (this.debugMode) console.log('Detection: No cached data, showing analyzing state');

            // FIX: Only show analyzing state if we're not already showing it
            // This prevents UI flicker and state resets when popup opens during detection
            if (!detection.isShowingAnalyzing) {
              detection.showAnalyzingState();
            } else {
              // If already showing analyzing state, just ensure progress steps are visible
              // This handles the case where popup reopens during detection
              if (detection.debugMode) console.log('Detection: Already showing analyzing, updating progress only');
              if (!detection.analysisSteps || detection.analysisSteps.length === 0) {
                detection.analysisSteps = detection.createAnalysisSteps();
                detection.renderAnalysisSteps();
              }
            }

            // FIX: Color completed steps immediately, even during active detection
            // This shows progress one-by-one instead of waiting for 100%
            if (response.progress && response.progress.completedMethods) {
              const lastMethod = response.progress.method || response.progress.completedMethods[response.progress.completedMethods.length - 1];
              detection.updateMethodStatus(lastMethod, response.progress.completedMethods);
            }

            return;
          }

          if (response && response.status === 'interrupted') {
            if (this.debugMode) console.log('Detection: Detection was interrupted, prompting reload');
            detection.showInterruptedState();
            return;
          }

          if (response && response.status === 'error') {
            if (this.debugMode) console.error('Detection: Background reported error fetching detection data:', response.error);
            detection.showEmptyState();
            return;
          }

          // OPTIMIZATION QUICK WIN #5: Use badge status helper
          const badgeStatus = await Detection.getBadgeStatus(tab.id);

          if (badgeStatus.isLoading) {
            if (this.debugMode) console.log('Detection: Badge shows hourglass - checking if cache exists before showing loading');

            // Badge shows loading - but check cache first in case detection completed
            // and we're in a race condition where badge wasn't updated yet
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tab.id },
              async (response) => {
                if (chrome.runtime.lastError) {
                  if (this.debugMode) console.error('Detection: Error checking cache:', chrome.runtime.lastError);
                  if (!detection.wasInterrupted) {
                    detection.showAnalyzingState();
                  }
                  return;
                }

                if (response?.data?.detectionResults?.length > 0) {
                  // Cache has data! Detection completed but badge not updated yet
                  // Note: Don't update progress here - cache hit means detection is done
                  // Just show the results directly
                  await processDetectionDataCallback(response.data);
                } else {
                  // No cache yet, truly still loading
                  if (this.debugMode) console.log('Detection: No cache found, showing analyzing state');
                  if (!detection.wasInterrupted) {
                    detection.showAnalyzingState();
                  }
                }
              }
            );
            return;
          }

          // FIX: Check if cache was cleared (gray ✕ badge) - show empty state
          if (badgeStatus.isCleared) {
            if (this.debugMode) console.log('Detection: Badge indicates cache cleared, showing empty state');
            detection.showEmptyState();
            return;
          }

          // FIX: Only show interrupted if we DON'T have valid data
          // Badge might be stale after extension reload or tab return
          if (badgeStatus.isInterrupted && (!response || !response.data)) {
            if (this.debugMode) console.log('Detection: Badge indicates interruption with no data, showing reload state');
            detection.showInterruptedState();
            return;
          }

          if (response && response.data) {
            // FIX: Update step colors to reflect completed methods
            // This works for both pending and cached results
            if (response.progress && response.progress.completedMethods) {
              const lastMethod = response.progress.method || response.progress.completedMethods[response.progress.completedMethods.length - 1];
              detection.updateMethodStatus(lastMethod, response.progress.completedMethods);
            }

            await processDetectionDataCallback(response.data);
          } else {
            // FIX: If badge shows loading/progress but no data yet, keep showing analyzing state
            // Don't switch to empty state while detection is in progress
            const currentBadgeStatus = await Detection.getBadgeStatus(tab.id);
            if (currentBadgeStatus.isLoading) {
              if (this.debugMode) console.log('Detection: No data yet but detection in progress, keeping analyzing state');
              if (!detection.isShowingAnalyzing) {
                detection.showAnalyzingState();
              }
            } else {
              if (this.debugMode) console.log('Detection: No detection data available');
              detection.showEmptyState();
            }
          }
        }
      );
    } catch (error) {
      if (this.debugMode) console.error('Detection: Failed to request detection:', error);
      detection.showEmptyState();
    }
  }

  /**
   * Request fresh detection for specific tab
   * @param {object} context - {detection, tabId, requestCurrentTabDetectionCallback}
   */
  static requestFreshDetection(context) {
    const { detection, tabId, requestCurrentTabDetectionCallback } = context;

    if (this.debugMode) console.log('Detection: Requesting fresh detection for tab', tabId);
    detection.showAnalyzingState();

    chrome.runtime.sendMessage(
      { type: 'REQUEST_DETECTION', tabId: tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          if (this.debugMode) console.error('Detection: Error requesting fresh detection:', chrome.runtime.lastError);
          detection.hideLoadingState();
          detection.showEmptyState();
          return;
        }

        if (this.debugMode) console.log('Detection: Fresh detection requested, waiting for completion...');
        // Wait for detection to complete, then request the data
        setTimeout(() => {
          if (this.debugMode) console.log('Detection: Fetching fresh detection results...');
          requestCurrentTabDetectionCallback();
        }, 2000);
      }
    );
  }

  /**
   * Process detection data from background
   * @param {object} context - {detection, detectionEngine, detectorManager, history}
   * @param {object} detectionData - Detection data from background
   */
  static async processDetectionData(context, detectionData) {
    const { detection, detectionEngine, detectorManager, history } = context;

    try {
      if (!detectionData) {
        if (this.debugMode) console.warn('Detection: No detection data provided');
        detection.showEmptyState();
        return;
      }

      if (this.debugMode) console.log('Detection: Processing detection data:', detectionData);

      // Set detectors and run detection
      detectionEngine.setDetectors(detectorManager.getAllDetectors());

      let detections = [];

      // Check if we have pre-processed detection results
      if (detectionData.detectionResults) {
        if (this.debugMode) console.log('Detection: Using pre-processed results from background');
        detections = detectionData.detectionResults;

        // MIGRATION: Handle old cached data format
        // Old format stored full URL in 'value', new format stores matched substring
        detections = detections.map(detection => {
          if (detection.matches) {
            detection.matches = detection.matches.map(match => {
              if (match.type === 'url' || match.type === 'urls') {
                // Case 1: No value field at all
                if (!match.value) {
                  return { ...match, value: match.fullUrl || match.pattern };
                }
                // Case 2: Value contains full URL (old format: https://...)
                // Need to extract matched part from full URL using pattern
                else if (match.value.includes('://') && match.pattern) {
                  try {
                    // Try to extract the matched substring from the full URL
                    const regex = new RegExp(match.pattern, 'gi');
                    const extracted = regex.exec(match.value);
                    if (extracted && extracted[0]) {
                      return { ...match, value: extracted[0], fullUrl: match.value };
                    }
                  } catch (e) {
                    // If regex fails, keep the full URL
                    console.warn('[Migration] Failed to extract match from URL:', e);
                  }
                }
              }
              // For non-URL matches without value field
              else if (!match.value && match.pattern) {
                return { ...match, value: match.pattern };
              }
              return match;
            });
          }
          return detection;
        });
      } else if (detectionData.pageData) {
        if (this.debugMode) console.log('Detection: Running detection on raw page data');
        detections = detectionEngine.detectOnPage(detectionData.pageData);
      } else {
        if (this.debugMode) console.warn('Detection: No valid data format in detectionData');
        detection.showEmptyState();
        return;
      }

      if (this.debugMode) console.log(`Detection: Found ${detections.length} security systems`);

      // Display results with metadata
      // Construct cacheMetadata from available fields
      const cacheMetadata = detectionData.expiry ? {
        expiry: detectionData.expiry,
        url: detectionData.url,
        timestamp: detectionData.timestamp,
        favicon: detectionData.favicon,
        cacheScope: detectionData.cacheScope
      } : null;

      await detection.displayResults(detections, {
        fromStorage: detectionData.fromStorage || false,
        cacheMetadata: cacheMetadata
      });

      // Update history if we have detections
      if (detections.length > 0 && history && typeof history.loadHistory === 'function') {
        if (this.debugMode) console.log('Detection: Updating history');
        await history.loadHistory();
      }
    } catch (error) {
      if (this.debugMode) console.error('Detection: Failed to process detection data:', error);
      if (this.debugMode) console.error('Detection: Stack trace:', error.stack);
      detection.showEmptyState();
    }
  }

  static async getBadgeText(tabId) {
    try {
      return await new Promise((resolve) => {
        chrome.action.getBadgeText({ tabId }, (text) => {
          if (chrome.runtime.lastError) {
            if (this.debugMode) console.warn('Detection: Failed to read badge text:', chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          resolve(text || '');
        });
      });
    } catch (error) {
      if (this.debugMode) console.error('Detection: Unexpected error reading badge text:', error);
      return '';
    }
  }

  /**
   * FIX: Get badge background color to distinguish cache cleared from interrupted
   * Cache cleared uses gray (#6b7280), interrupted uses other colors
   */
  static async getBadgeBackgroundColor(tabId) {
    try {
      return await new Promise((resolve) => {
        chrome.action.getBadgeBackgroundColor({ tabId }, (colorInfo) => {
          if (chrome.runtime.lastError) {
            if (this.debugMode) console.warn('Detection: Failed to read badge color:', chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          // colorInfo is {r, g, b, a}, convert to hex
          if (colorInfo && typeof colorInfo === 'object') {
            const r = colorInfo.r.toString(16).padStart(2, '0');
            const g = colorInfo.g.toString(16).padStart(2, '0');
            const b = colorInfo.b.toString(16).padStart(2, '0');
            resolve(`#${r}${g}${b}`.toUpperCase());
          } else {
            resolve('');
          }
        });
      });
    } catch (error) {
      if (this.debugMode) console.error('Detection: Unexpected error reading badge color:', error);
      return '';
    }
  }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Detection;
} else if (typeof window !== 'undefined') {
  window.Detection = Detection;
}