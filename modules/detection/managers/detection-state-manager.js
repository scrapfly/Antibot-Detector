/**
 * Detection State Manager
 * Provides persistent detection state that survives service worker crashes
 *
 * Key Features:
 * - Persistent detection state in chrome.storage (survives worker crashes)
 * - Recovery on worker restart: find stale detections, force complete
 * - State transitions: detecting → completed/failed/recovered
 * - Cleanup of orphaned states
 */

/**
 * Detection States
 */
const DetectionStateStatus = {
  DETECTING: 'detecting',     // Detection in progress
  COMPLETED: 'completed',     // Detection finished successfully
  FAILED: 'failed',           // Detection failed with error
  RECOVERED: 'recovered',     // Detection was recovered after crash
  ABANDONED: 'abandoned'      // Detection abandoned (tab closed, etc.)
};

/**
 * DetectionStateManager - Manages persistent detection states
 */
class DetectionStateManager {
  constructor() {
    // Storage key for persistent states
    this.storageKey = 'scrapfly_detection_states';

    // In-memory cache of states (synced with storage)
    this.states = new Map(); // tabId -> DetectionState

    // Configuration
    this.config = {
      maxStateAge: 60000,        // 60 seconds - max time for detection
      staleCheckInterval: 30000, // 30 seconds - check for stale states
      maxStatesPerStorage: 50    // Limit storage size
    };

    // Stale check interval
    this.staleCheckInterval = null;
  }

  /**
   * Initialize the manager (call on service worker startup)
   */
  async initialize() {
    // Load existing states from storage
    await this._loadFromStorage();

    // Check for and recover stale detections
    await this._recoverStaleDetections();

    // Start periodic stale check
    this._startStaleCheck();

    Logger.background('[DetectionStateManager] Initialized');
  }

  /**
   * Start a new detection
   * @param {number} tabId - Tab ID
   * @param {string} url - Page URL
   * @returns {Object} Detection state
   */
  async startDetection(tabId, url) {
    const state = {
      tabId,
      url,
      status: DetectionStateStatus.DETECTING,
      startTime: Date.now(),
      lastActivityTime: Date.now(),
      hooksComplete: false,
      windowPropsComplete: false,
      mainComplete: false,
      detectionCount: 0,
      error: null
    };

    this.states.set(tabId, state);
    await this._saveToStorage();

    Logger.background(`[DetectionStateManager] Started detection for tab ${tabId}: ${url}`);
    return state;
  }

  /**
   * Update detection activity (extends timeout)
   * @param {number} tabId - Tab ID
   */
  async updateActivity(tabId) {
    const state = this.states.get(tabId);
    if (state && state.status === DetectionStateStatus.DETECTING) {
      state.lastActivityTime = Date.now();
      // Don't save to storage on every activity update (too frequent)
      // Storage is updated on state transitions and periodically
    }
  }

  /**
   * Mark hooks as complete
   * @param {number} tabId - Tab ID
   */
  async markHooksComplete(tabId) {
    const state = this.states.get(tabId);
    if (state) {
      state.hooksComplete = true;
      state.lastActivityTime = Date.now();
      await this._saveToStorage();
    }
  }

  /**
   * Mark window properties as complete
   * @param {number} tabId - Tab ID
   */
  async markWindowPropsComplete(tabId) {
    const state = this.states.get(tabId);
    if (state) {
      state.windowPropsComplete = true;
      state.lastActivityTime = Date.now();
      await this._saveToStorage();
    }
  }

  /**
   * Mark main detection as complete
   * @param {number} tabId - Tab ID
   */
  async markMainComplete(tabId) {
    const state = this.states.get(tabId);
    if (state) {
      state.mainComplete = true;
      state.lastActivityTime = Date.now();
      await this._saveToStorage();
    }
  }

  /**
   * Complete a detection successfully
   * @param {number} tabId - Tab ID
   * @param {number} detectionCount - Number of detections found
   */
  async completeDetection(tabId, detectionCount) {
    const state = this.states.get(tabId);
    if (state) {
      state.status = DetectionStateStatus.COMPLETED;
      state.detectionCount = detectionCount;
      state.completedTime = Date.now();
      await this._saveToStorage();

      Logger.background(`[DetectionStateManager] Completed detection for tab ${tabId}: ${detectionCount} detections`);

      // Clean up after a short delay
      setTimeout(() => this._cleanupState(tabId), 5000);
    }
  }

  /**
   * Mark a detection as failed
   * @param {number} tabId - Tab ID
   * @param {string} error - Error message
   */
  async failDetection(tabId, error) {
    const state = this.states.get(tabId);
    if (state) {
      state.status = DetectionStateStatus.FAILED;
      state.error = error;
      state.failedTime = Date.now();
      await this._saveToStorage();

      Logger.background(`[DetectionStateManager] Failed detection for tab ${tabId}: ${error}`);

      // Clean up after a short delay
      setTimeout(() => this._cleanupState(tabId), 5000);
    }
  }

  /**
   * Abandon a detection (tab closed, navigation, etc.)
   * @param {number} tabId - Tab ID
   * @param {string} reason - Reason for abandonment
   */
  async abandonDetection(tabId, reason) {
    const state = this.states.get(tabId);
    if (state && state.status === DetectionStateStatus.DETECTING) {
      state.status = DetectionStateStatus.ABANDONED;
      state.error = reason;
      state.abandonedTime = Date.now();
      await this._saveToStorage();

      Logger.background(`[DetectionStateManager] Abandoned detection for tab ${tabId}: ${reason}`);

      // Immediate cleanup for abandoned
      this._cleanupState(tabId);
    }
  }

  /**
   * Get detection state for a tab
   * @param {number} tabId - Tab ID
   * @returns {Object|null} Detection state or null
   */
  getState(tabId) {
    return this.states.get(tabId) || null;
  }

  /**
   * Check if a tab has an active detection
   * @param {number} tabId - Tab ID
   * @returns {boolean}
   */
  isDetecting(tabId) {
    const state = this.states.get(tabId);
    return state && state.status === DetectionStateStatus.DETECTING;
  }

  /**
   * Get all active detections
   * @returns {Array} Array of active detection states
   */
  getActiveDetections() {
    const active = [];
    for (const state of this.states.values()) {
      if (state.status === DetectionStateStatus.DETECTING) {
        active.push(state);
      }
    }
    return active;
  }

  /**
   * Load states from chrome.storage
   */
  async _loadFromStorage() {
    try {
      const result = await chrome.storage.local.get([this.storageKey]);
      const stored = result[this.storageKey];

      if (stored && typeof stored === 'object') {
        for (const [tabIdStr, state] of Object.entries(stored)) {
          const tabId = parseInt(tabIdStr, 10);
          if (!isNaN(tabId)) {
            this.states.set(tabId, state);
          }
        }
        Logger.background(`[DetectionStateManager] Loaded ${this.states.size} states from storage`);
      }
    } catch (error) {
      Logger.error('STORAGE', '[DetectionStateManager] Failed to load states:', error);
    }
  }

  /**
   * Save states to chrome.storage
   */
  async _saveToStorage() {
    try {
      // Convert Map to object for storage
      const stored = {};
      let count = 0;

      for (const [tabId, state] of this.states.entries()) {
        // Limit storage size
        if (count >= this.config.maxStatesPerStorage) break;

        stored[tabId.toString()] = state;
        count++;
      }

      await chrome.storage.local.set({ [this.storageKey]: stored });
    } catch (error) {
      Logger.error('STORAGE', '[DetectionStateManager] Failed to save states:', error);
    }
  }

  /**
   * Recover stale detections (called on service worker restart)
   */
  async _recoverStaleDetections() {
    const now = Date.now();
    const recovered = [];

    for (const [tabId, state] of this.states.entries()) {
      if (state.status !== DetectionStateStatus.DETECTING) continue;

      const age = now - state.startTime;
      const timeSinceActivity = now - state.lastActivityTime;

      // Check if detection is stale (older than max age or no activity for too long)
      if (age > this.config.maxStateAge || timeSinceActivity > this.config.maxStateAge / 2) {
        // Check if tab still exists
        try {
          await chrome.tabs.get(tabId);
          // Tab exists - force complete the detection
          Logger.background(`[DetectionStateManager] Recovering stale detection for tab ${tabId} (age: ${age}ms)`);

          state.status = DetectionStateStatus.RECOVERED;
          state.recoveredTime = now;
          recovered.push({ tabId, state });

          // Set badge to recovered state (shows ? mark)
          try {
            await chrome.action.setBadgeText({ text: '?', tabId });
            await chrome.action.setBadgeBackgroundColor({ color: '#FF9800', tabId });
          } catch (e) {
            // Tab might be closed
          }
        } catch (e) {
          // Tab doesn't exist - abandon
          state.status = DetectionStateStatus.ABANDONED;
          state.error = 'tab_closed_during_crash';
          state.abandonedTime = now;
        }
      }
    }

    if (recovered.length > 0) {
      Logger.background(`[DetectionStateManager] Recovered ${recovered.length} stale detections`);
      await this._saveToStorage();
    }
  }

  /**
   * Start periodic stale check
   */
  _startStaleCheck() {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
    }

    this.staleCheckInterval = setInterval(async () => {
      await this._checkAndCleanupStale();
    }, this.config.staleCheckInterval);
  }

  /**
   * Check for and cleanup stale states
   */
  async _checkAndCleanupStale() {
    const now = Date.now();
    let cleanedUp = 0;

    for (const [tabId, state] of this.states.entries()) {
      // Cleanup completed/failed/recovered states older than 30s
      if (state.status !== DetectionStateStatus.DETECTING) {
        const endTime = state.completedTime || state.failedTime || state.abandonedTime || state.recoveredTime;
        if (endTime && now - endTime > 30000) {
          this.states.delete(tabId);
          cleanedUp++;
        }
        continue;
      }

      // Check if detecting state is stale
      const age = now - state.startTime;
      if (age > this.config.maxStateAge) {
        // Force complete stale detection
        Logger.background(`[DetectionStateManager] Force completing stale detection for tab ${tabId}`);

        try {
          // Only set "!" badge if extension is enabled
          const { scrapfly_enabled = true } = await chrome.storage.local.get('scrapfly_enabled');
          if (scrapfly_enabled) {
            // Update badge to show stale/failed state
            await chrome.action.setBadgeText({ text: '!', tabId });
            await chrome.action.setBadgeBackgroundColor({ color: '#F44336', tabId });
          }
          // If disabled, don't override the "OFF" badge
        } catch (e) {
          // Tab might be closed
        }

        state.status = DetectionStateStatus.FAILED;
        state.error = 'stale_timeout';
        state.failedTime = now;
        cleanedUp++;
      }
    }

    if (cleanedUp > 0) {
      await this._saveToStorage();
    }
  }

  /**
   * Cleanup a single state
   */
  _cleanupState(tabId) {
    this.states.delete(tabId);
    // Don't save immediately - batched with next save
  }

  /**
   * Force complete a detection (for manual recovery)
   * @param {number} tabId - Tab ID
   */
  async forceComplete(tabId) {
    const state = this.states.get(tabId);
    if (state && state.status === DetectionStateStatus.DETECTING) {
      state.status = DetectionStateStatus.RECOVERED;
      state.recoveredTime = Date.now();
      await this._saveToStorage();

      Logger.background(`[DetectionStateManager] Force completed detection for tab ${tabId}`);
    }
  }

  /**
   * Get statistics
   */
  getStats() {
    const stats = {
      total: this.states.size,
      detecting: 0,
      completed: 0,
      failed: 0,
      recovered: 0,
      abandoned: 0
    };

    for (const state of this.states.values()) {
      switch (state.status) {
        case DetectionStateStatus.DETECTING:
          stats.detecting++;
          break;
        case DetectionStateStatus.COMPLETED:
          stats.completed++;
          break;
        case DetectionStateStatus.FAILED:
          stats.failed++;
          break;
        case DetectionStateStatus.RECOVERED:
          stats.recovered++;
          break;
        case DetectionStateStatus.ABANDONED:
          stats.abandoned++;
          break;
      }
    }

    return stats;
  }

  /**
   * Cleanup all states (for testing/reset)
   */
  async clearAll() {
    this.states.clear();
    await chrome.storage.local.remove([this.storageKey]);
    Logger.background('[DetectionStateManager] Cleared all states');
  }
}

// Export for use in background.js
// Note: This runs in service worker context, so we use globalThis
if (typeof globalThis !== 'undefined') {
  globalThis.DetectionStateManager = DetectionStateManager;
  globalThis.DetectionStateStatus = DetectionStateStatus;
}
