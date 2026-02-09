/**
 * Worker Keepalive Manager
 * Prevents service worker suspension during active detections
 *
 * Key Features:
 * - Periodic chrome.runtime.getPlatformInfo() every 20s to keep worker alive
 * - Auto-cleanup when no active detections
 * - Reference counting for multiple active detections
 * - Minimal CPU/memory overhead
 */

/**
 * WorkerKeepaliveManager - Keeps service worker alive during detections
 */
class WorkerKeepaliveManager {
  constructor() {
    // Keepalive state
    this.keepaliveInterval = null;
    this.keepalivePeriodMs = 20000; // 20 seconds (Chrome suspends after 30s)
    this.staleOperationMs = 120000; // 2 minutes

    // Reference counting for active operations
    this.activeOperations = new Map(); // operationId -> { tabId, startTime, reason }

    // Statistics
    this.stats = {
      keepalivesSent: 0,
      operationsStarted: 0,
      operationsCompleted: 0,
      maxConcurrentOperations: 0
    };

    // State
    this.isRunning = false;
  }

  /**
   * Apply configuration overrides
   * @param {Object} config - Reliability config
   */
  applyConfig(config = {}) {
    let shouldRestart = false;

    if (Number.isFinite(config.workerKeepalivePeriodMs) && config.workerKeepalivePeriodMs >= 0) {
      this.keepalivePeriodMs = config.workerKeepalivePeriodMs;
      shouldRestart = true;
    }

    if (Number.isFinite(config.workerKeepaliveStaleOpMs) && config.workerKeepaliveStaleOpMs >= 0) {
      this.staleOperationMs = config.workerKeepaliveStaleOpMs;
    }

    if (this.isRunning && shouldRestart) {
      if (this.keepaliveInterval) {
        clearInterval(this.keepaliveInterval);
      }
      this._sendKeepalive();
      this.keepaliveInterval = setInterval(() => {
        this._sendKeepalive();
      }, this.keepalivePeriodMs);
    }
  }

  /**
   * Start a keepalive for an operation
   * @param {string} operationId - Unique operation identifier
   * @param {Object} context - Operation context { tabId, reason }
   */
  startOperation(operationId, context = {}) {
    this.activeOperations.set(operationId, {
      tabId: context.tabId || null,
      reason: context.reason || 'unknown',
      startTime: Date.now()
    });

    this.stats.operationsStarted++;
    this.stats.maxConcurrentOperations = Math.max(
      this.stats.maxConcurrentOperations,
      this.activeOperations.size
    );

    // Start keepalive if not already running
    if (!this.isRunning) {
      this._startKeepalive();
    }

    Logger.background(`[WorkerKeepalive] Started operation: ${operationId} (${this.activeOperations.size} active)`);
  }

  /**
   * End a keepalive operation
   * @param {string} operationId - Operation identifier
   */
  endOperation(operationId) {
    if (this.activeOperations.has(operationId)) {
      this.activeOperations.delete(operationId);
      this.stats.operationsCompleted++;

      Logger.background(`[WorkerKeepalive] Ended operation: ${operationId} (${this.activeOperations.size} remaining)`);

      // Stop keepalive if no more operations
      if (this.activeOperations.size === 0) {
        this._stopKeepalive();
      }
    }
  }

  /**
   * End all operations for a specific tab
   * @param {number} tabId - Tab ID
   */
  endOperationsForTab(tabId) {
    const toRemove = [];

    for (const [opId, context] of this.activeOperations.entries()) {
      if (context.tabId === tabId) {
        toRemove.push(opId);
      }
    }

    for (const opId of toRemove) {
      this.endOperation(opId);
    }

    if (toRemove.length > 0) {
      Logger.background(`[WorkerKeepalive] Ended ${toRemove.length} operations for tab ${tabId}`);
    }
  }

  /**
   * Check if any operations are active
   * @returns {boolean}
   */
  hasActiveOperations() {
    return this.activeOperations.size > 0;
  }

  /**
   * Get active operation count
   * @returns {number}
   */
  getActiveCount() {
    return this.activeOperations.size;
  }

  /**
   * Start the keepalive interval
   */
  _startKeepalive() {
    if (this.isRunning) return;

    this.isRunning = true;

    // Initial keepalive
    this._sendKeepalive();

    // Start periodic keepalives
    this.keepaliveInterval = setInterval(() => {
      this._sendKeepalive();
    }, this.keepalivePeriodMs);

    Logger.background('[WorkerKeepalive] Started keepalive');
  }

  /**
   * Stop the keepalive interval
   */
  _stopKeepalive() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval);
      this.keepaliveInterval = null;
    }

    Logger.background('[WorkerKeepalive] Stopped keepalive');
  }

  /**
   * Send a keepalive ping
   * Uses chrome.runtime.getPlatformInfo() as a lightweight keepalive
   */
  async _sendKeepalive() {
    try {
      // This API call keeps the service worker alive
      await chrome.runtime.getPlatformInfo();
      this.stats.keepalivesSent++;
    } catch (error) {
      // Silently fail - worker might be terminating
      Logger.warn('BACKGROUND', '[WorkerKeepalive] Keepalive failed:', error.message);
    }
  }

  /**
   * Cleanup stale operations (called periodically)
   * Operations older than 2 minutes are considered stale
   */
  cleanupStaleOperations() {
    const now = Date.now();
    const maxAge = this.staleOperationMs;
    const toRemove = [];

    for (const [opId, context] of this.activeOperations.entries()) {
      if (now - context.startTime > maxAge) {
        toRemove.push(opId);
      }
    }

    for (const opId of toRemove) {
      Logger.background(`[WorkerKeepalive] Cleaning up stale operation: ${opId}`);
      this.activeOperations.delete(opId);
      this.stats.operationsCompleted++;
    }

    // Stop keepalive if no more operations
    if (this.activeOperations.size === 0 && this.isRunning) {
      this._stopKeepalive();
    }

    return toRemove.length;
  }

  /**
   * Get statistics
   * @returns {Object} Statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeOperations: this.activeOperations.size,
      isRunning: this.isRunning,
      operations: Array.from(this.activeOperations.entries()).map(([id, ctx]) => ({
        id,
        tabId: ctx.tabId,
        reason: ctx.reason,
        age: Date.now() - ctx.startTime
      }))
    };
  }

  /**
   * Force stop all operations (emergency cleanup)
   */
  forceStopAll() {
    this.activeOperations.clear();
    this._stopKeepalive();
    Logger.background('[WorkerKeepalive] Force stopped all operations');
  }
}

// Export for use in background.js
if (typeof globalThis !== 'undefined') {
  globalThis.WorkerKeepaliveManager = WorkerKeepaliveManager;
}
