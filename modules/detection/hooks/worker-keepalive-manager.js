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
    this.keepalivePeriodMs = Constants.KEEPALIVE_PERIOD_MS;
    this.staleOperationMs = Constants.STALE_OPERATION_MS;

    // Reference counting for active operations
    this.activeOperations = new Map(); // operationId -> { tabId, startTime, reason }

    // State
    this.isRunning = false;
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
  /**
   * Drop operations older than staleOperationMs. These leak when a detection
   * state is evicted by TTL/LRU before finalize/tab-close/url-change ends its
   * keepalive op; without this sweep the leaked op pins the worker awake forever.
   */
  _sweepStaleOperations() {
    const now = Date.now();
    for (const [opId, ctx] of this.activeOperations.entries()) {
      if (now - ctx.startTime > this.staleOperationMs) {
        Logger.background(`[WorkerKeepalive] Sweeping stale operation: ${opId} (age ${now - ctx.startTime}ms)`);
        this.activeOperations.delete(opId);
      }
    }
    if (this.activeOperations.size === 0) {
      this._stopKeepalive();
    }
  }

  async _sendKeepalive() {
    // Reap leaked operations first; this may stop the keepalive if none remain.
    this._sweepStaleOperations();
    if (!this.isRunning) return;

    try {
      // This API call keeps the service worker alive
      await chrome.runtime.getPlatformInfo();
    } catch (error) {
      // Silently fail - worker might be terminating
      Logger.warn('BACKGROUND', '[WorkerKeepalive] Keepalive failed:', error.message);
    }
  }

}

// Export for use in background.js
if (typeof globalThis !== 'undefined') {
  globalThis.WorkerKeepaliveManager = WorkerKeepaliveManager;
}

// Node test export (no-op in the browser/SW, where `module` is undefined).
if (typeof module !== 'undefined' && module.exports) { module.exports = WorkerKeepaliveManager; }
