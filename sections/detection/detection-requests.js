/**
 * Detection static request/process methods.
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionRequests = (typeof self !== 'undefined' && self.DetectionRequests) ? self.DetectionRequests : {};

DetectionRequests.getBadgeStatus = async function(tabId) {
    const badgeText = await Detection.getBadgeText(tabId);
    const badgeColor = await Detection.getBadgeBackgroundColor(tabId);
    const trimmed = badgeText ? badgeText.trim() : '';
    const isGrayBadge = badgeColor === '#6B7280' || badgeColor === '#6b7280';
    const isLegacyInterrupted = trimmed === '?' || trimmed === '\u2715' || trimmed === '\u00D7';

    // Determine if this is a cleared cache badge (gray) or interrupted detection badge (other colors)
    const isCleared = trimmed === BADGE.TEXT.CLEARED && isGrayBadge;
    const isInterrupted = (trimmed === BADGE.TEXT.INTERRUPTED || isLegacyInterrupted) && !isCleared;

    return {
      text: badgeText,
      trimmed: trimmed,
      color: badgeColor,
      isLoading: trimmed === BADGE.TEXT.LOADING,
      isCleared: isCleared,
      isInterrupted: isInterrupted,
      isError: isLegacyInterrupted,
      isQuestion: trimmed === '?',
      isEmpty: trimmed === ''
    };
};

DetectionRequests.requestCurrentTabDetection = async function(context) {
    const { detection, Utils, processDetectionDataCallback } = context;

    // Prevent duplicate concurrent requests
    if (detection.isRequestingDetection) {
      if (detection.debugMode) Logger.ui('Detection: Already requesting detection, skipping duplicate request');
      return;
    }

    try {
      detection.isRequestingDetection = true;

      // Wait for background response before choosing UI state (avoids Analyzing -> Interrupted flicker)

      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        if (this.debugMode) Logger.error('UI', 'Detection: No active tab found');
        detection.showEmptyState();
        detection.isRequestingDetection = false;
        return;
      }

      // Check if extension is enabled
      const result = await chrome.storage.local.get(['scrapfly_enabled']);
      const isEnabled = result.scrapfly_enabled !== false;
      detection.setExtensionEnabled(isEnabled);
      if (!isEnabled) {
        if (this.debugMode) Logger.ui('Detection: Extension is disabled');
        // Check if domain is also blacklisted to show the indicator
        const isBlacklisted = await Utils.isUrlBlacklisted(tab.url);
        detection.showDisabledState(isBlacklisted);
        detection.isRequestingDetection = false;
        return;
      }

      // Check if URL is blacklisted
      if (await Utils.isUrlBlacklisted(tab.url)) {
        if (this.debugMode) Logger.ui('Detection: URL is blacklisted');
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
            if (this.debugMode) Logger.error('UI', 'Detection: Error getting detection data:', chrome.runtime.lastError);
            detection.showEmptyState();
            return;
          }

          // Let badge check determine state when response is null
          if (!response) {
            if (this.debugMode) Logger.ui('Detection: No response yet, continuing to badge check...');
            // Don't return - let badge check handle state
          }

          if (response && response.status === 'pending') {
            if (this.debugMode) Logger.ui('Detection: Detection still running - checking if cached data exists first');

            // Race condition: detection may have completed while status still says pending
            if (response.data && response.data.detectionResults?.length > 0) {
              if (this.debugMode) Logger.ui('Detection: Found cached results despite pending status - displaying');
              await processDetectionDataCallback(response.data);
              return;
            }

            // Badge numeric = detection done but cache write pending; retry after delay
            const badgeStatus = await Detection.getBadgeStatus(tab.id);
            const isNumericBadge = /^\d+\+?$/.test(badgeStatus.trimmed);

            if (isNumericBadge && !response.data) {
              Logger.ui('Detection: Badge shows count but no data yet - retrying in 500ms', { badge: badgeStatus.trimmed });
              // Wait for cache to be ready, then retry (increased from 300ms for slower cache writes)
              await new Promise(resolve => setTimeout(resolve, 500));
              const retryResponse = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                  { type: 'GET_DETECTION_DATA', tabId: tab.id },
                  resolve
                );
              });

              if (retryResponse && retryResponse.data && retryResponse.data.detectionResults?.length > 0) {
                Logger.ui('Detection: Retry successful - displaying results');
                await processDetectionDataCallback(retryResponse.data);
                return;
              }

              // Still no data after retry - try one more time with longer delay (increased from 500ms)
              await new Promise(resolve => setTimeout(resolve, 1000));
              const retryResponse2 = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                  { type: 'GET_DETECTION_DATA', tabId: tab.id },
                  resolve
                );
              });

              if (retryResponse2 && retryResponse2.data && retryResponse2.data.detectionResults?.length > 0) {
                Logger.ui('Detection: Second retry successful - displaying results');
                await processDetectionDataCallback(retryResponse2.data);
                return;
              }

              // Give up and show what we have based on badge
              Logger.warn('UI', 'Detection: Badge shows count but no data after retries', { badge: badgeStatus.trimmed });
            }

            // No cached data, truly still running - show analyzing state
            if (this.debugMode) Logger.ui('Detection: No cached data, showing analyzing state');

            // Skip re-render if already analyzing (prevents UI flicker on popup reopen)
            if (!detection.isShowingAnalyzing) {
              detection.showAnalyzingState();
            } else {
              if (detection.debugMode) Logger.ui('Detection: Already showing analyzing, updating progress only');
              if (!detection.analysisSteps || detection.analysisSteps.length === 0) {
                detection.analysisSteps = detection.createAnalysisSteps();
                detection.renderAnalysisSteps();
              }
            }

            // Color completed steps immediately (one-by-one progress)
            if (response.progress && response.progress.completedMethods) {
              const lastMethod = response.progress.method || response.progress.completedMethods[response.progress.completedMethods.length - 1];
              detection.updateMethodStatus(lastMethod, response.progress.completedMethods);
            }

            return;
          }

          if (response && response.status === 'interrupted') {
            if (this.debugMode) Logger.ui('Detection: Detection status interrupted with no data - showing empty state');
            detection.showEmptyState();
            return;
          }

          if (response && response.status === 'error') {
            if (this.debugMode) Logger.error('UI', 'Detection: Background reported error fetching detection data:', response.error);
            detection.showEmptyState();
            return;
          }

          // Use badge status helper
          const badgeStatus = await Detection.getBadgeStatus(tab.id);

          if (badgeStatus.isLoading) {
            if (this.debugMode) Logger.ui('Detection: Badge shows hourglass - checking if cache exists before showing loading');

            // Badge shows loading - but check cache first in case detection completed
            // and we're in a race condition where badge wasn't updated yet
            chrome.runtime.sendMessage(
              { type: 'GET_DETECTION_DATA', tabId: tab.id },
              async (response) => {
                if (chrome.runtime.lastError) {
                  if (this.debugMode) Logger.error('UI', 'Detection: Error checking cache:', chrome.runtime.lastError);
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
                  if (this.debugMode) Logger.ui('Detection: No cache found, showing analyzing state');
                  if (!detection.wasInterrupted) {
                    detection.showAnalyzingState();
                  }
                }
              }
            );
            return;
          }

          // Gray "CLR" badge = cache was cleared; show empty state
          if (badgeStatus.isCleared) {
            if (this.debugMode) Logger.ui('Detection: Badge indicates cache cleared, showing empty state');
            detection.showEmptyState();
            return;
          }

          // Show interrupted only when no valid data (badge may be stale)
          if (badgeStatus.isInterrupted && (!response || !response.data)) {
            if (this.debugMode) Logger.ui('Detection: Badge indicates interruption with no data, showing empty state');
            detection.showEmptyState();
            return;
          }

          if (response && response.data) {
            // Update step colors from completed methods
            if (response.progress && response.progress.completedMethods) {
              const lastMethod = response.progress.method || response.progress.completedMethods[response.progress.completedMethods.length - 1];
              detection.updateMethodStatus(lastMethod, response.progress.completedMethods);
            }

            await processDetectionDataCallback(response.data);
          } else {
            // Keep analyzing state while detection is in progress
            const currentBadgeStatus = await Detection.getBadgeStatus(tab.id);
            if (currentBadgeStatus.isLoading) {
              if (this.debugMode) Logger.ui('Detection: No data yet but detection in progress, keeping analyzing state');
              if (!detection.isShowingAnalyzing) {
                detection.showAnalyzingState();
              }
            } else {
              if (this.debugMode) Logger.ui('Detection: No detection data available');
              detection.showEmptyState();
            }
          }
        }
      );
    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Detection: Failed to request detection:', error);
      detection.showEmptyState();
    }
};

DetectionRequests.requestFreshDetection = function(context) {
    const { detection, tabId, requestCurrentTabDetectionCallback } = context;

    if (this.debugMode) Logger.ui('Detection: Requesting fresh detection for tab', tabId);
    detection.showAnalyzingState();

    chrome.runtime.sendMessage(
      { type: 'REQUEST_DETECTION', tabId: tabId },
      (response) => {
        if (chrome.runtime.lastError) {
          if (this.debugMode) Logger.error('UI', 'Detection: Error requesting fresh detection:', chrome.runtime.lastError);
          detection.hideLoadingState();
          detection.showEmptyState();
          return;
        }

        if (this.debugMode) Logger.ui('Detection: Fresh detection requested, waiting for completion...');
        // Wait for detection to complete, then request the data
        setTimeout(() => {
          if (this.debugMode) Logger.ui('Detection: Fetching fresh detection results...');
          requestCurrentTabDetectionCallback();
        }, 2000);
      }
    );
};

DetectionRequests.processDetectionData = async function(context, detectionData) {
    const { detection, detectionEngine, detectorManager, history } = context;

    if (detection.debugMode) {
      Logger.ui('[DEBUG processDetectionData] Called with:', {
        hasDetectionData: !!detectionData,
        dataKeys: detectionData ? Object.keys(detectionData) : null,
        hasDetectionResults: !!detectionData?.detectionResults,
        detectionCount: detectionData?.detectionResults?.length
      });
    }

    try {
      if (!detection.isExtensionEnabled) {
        detection.showDisabledState();
        return;
      }

      if (!detectionData) {
        if (detection.debugMode) {
          Logger.ui('[DEBUG processDetectionData] No detection data provided - showing empty state');
        }
        detection.showEmptyState();
        return;
      }

      // Set detectors and run detection
      detectionEngine.setDetectors(detectorManager.getAllDetectors());

      let detections = [];

      // Check if we have pre-processed detection results
      if (detectionData.detectionResults) {
        if (detection.debugMode) {
          Logger.ui('[DEBUG processDetectionData] Using pre-processed results:', detectionData.detectionResults.length);
        }
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
                    Logger.debug('UI', '[Migration] Failed to extract match from URL:', e);
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
        if (this.debugMode) Logger.ui('Detection: Running detection on raw page data');
        detections = detectionEngine.detectOnPage(detectionData.pageData);
      } else {
        if (this.debugMode) Logger.debug('UI', 'Detection: No valid data format in detectionData');
        detection.showEmptyState();
        return;
      }

      if (detection.debugMode) {
        Logger.ui(`[DEBUG processDetectionData] Found ${detections.length} security systems, calling displayResults()`);
      }

      // Display results with metadata
      // Construct cacheMetadata from available fields
      const cacheMetadata = detectionData.expiry ? {
        expiry: detectionData.expiry,
        url: detectionData.url,
        timestamp: detectionData.timestamp,
        favicon: detectionData.favicon,
        cacheScope: detectionData.cacheScope
      } : null;

      if (detection.debugMode) {
        Logger.ui('[DEBUG processDetectionData] Cache metadata:', cacheMetadata);
        Logger.ui('[DEBUG processDetectionData] From storage:', detectionData.fromStorage);
      }

      await detection.displayResults(detections, {
        fromStorage: detectionData.fromStorage || false,
        cacheMetadata: cacheMetadata
      });

      if (detection.debugMode) {
        Logger.ui('[DEBUG processDetectionData] displayResults() completed');
      }

      // Update history if we have detections
      if (detections.length > 0 && history && typeof history.loadHistory === 'function') {
        if (this.debugMode) Logger.ui('Detection: Updating history');
        await history.loadHistory();
      }
    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Detection: Failed to process detection data:', error);
      if (this.debugMode) Logger.error('UI', 'Detection: Stack trace:', error.stack);
      detection.showEmptyState();
    }
};

DetectionRequests.getBadgeText = async function(tabId) {
    try {
      return await new Promise((resolve) => {
        chrome.action.getBadgeText({ tabId }, (text) => {
          if (chrome.runtime.lastError) {
            if (this.debugMode) Logger.debug('UI', 'Detection: Failed to read badge text:', chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          resolve(text || '');
        });
      });
    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Detection: Unexpected error reading badge text:', error);
      return '';
    }
};

DetectionRequests.getBadgeBackgroundColor = async function(tabId) {
    try {
      return await new Promise((resolve) => {
        chrome.action.getBadgeBackgroundColor({ tabId }, (colorInfo) => {
          if (chrome.runtime.lastError) {
            if (this.debugMode) Logger.debug('UI', 'Detection: Failed to read badge color:', chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          // colorInfo is ColorArray [r, g, b, a], not {r, g, b, a}
          if (colorInfo && typeof colorInfo === 'object') {
            const r = (colorInfo[0] || 0).toString(16).padStart(2, '0');
            const g = (colorInfo[1] || 0).toString(16).padStart(2, '0');
            const b = (colorInfo[2] || 0).toString(16).padStart(2, '0');
            resolve(`#${r}${g}${b}`.toUpperCase());
          } else {
            resolve('');
          }
        });
      });
    } catch (error) {
      if (this.debugMode) Logger.error('UI', 'Detection: Unexpected error reading badge color:', error);
      return '';
    }
};

if (typeof self !== 'undefined') {
    self.DetectionRequests = DetectionRequests;
}

