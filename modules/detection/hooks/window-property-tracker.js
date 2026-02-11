/**
 * Window Property Tracker
 * Provides reliable detection of window properties with retry strategies
 *
 * Key Features:
 * - State machine tracking: PENDING → PATH_NOT_FOUND → DETECTED → ERROR
 * - 4-phase adaptive polling: EARLY (100ms) → NORMAL (200ms) → LATE (500ms) → FINAL (1000ms)
 * - Retry strategies: linear backoff for missing props, exponential for getter errors
 * - Error classification: recoverable (retry) vs non-recoverable (abandon)
 */

(function() {
  'use strict';

  // Skip if already initialized
  if (window.__WindowPropertyTracker) {
    return;
  }

  // Suppression depth key shared with content-main-world.js
  const HOOK_SUPPRESSION_DEPTH_KEY = '__scrapflyHookSuppressionDepth';

  /**
   * Property States
   */
  const PropertyState = {
    PENDING: 'pending',           // Not yet checked
    PATH_NOT_FOUND: 'path_not_found',  // Parent path doesn't exist (retry)
    PROPERTY_ABSENT: 'property_absent', // Property doesn't exist on object (may appear later)
    DETECTED: 'detected',         // Property found and condition met
    NOT_MATCHED: 'not_matched',   // Property found but condition not met
    ERROR: 'error',               // Non-recoverable error
    ABANDONED: 'abandoned'        // Max retries exceeded
  };

  /**
   * Polling Phases - Adaptive timing based on script loading patterns
   */
  const DEFAULT_POLLING_PHASES = {
    EARLY: {
      name: 'EARLY',
      duration: 2000,    // First 2 seconds
      interval: 100,     // Fast polling for immediate properties
      description: 'Fast polling for immediately available properties'
    },
    NORMAL: {
      name: 'NORMAL',
      duration: 8000,    // 2-10 seconds
      interval: 200,     // Typical script loading
      description: 'Normal polling for script-loaded properties'
    },
    LATE: {
      name: 'LATE',
      duration: 20000,   // 10-30 seconds
      interval: 500,     // Lazy-loaded scripts
      description: 'Slow polling for lazy-loaded properties'
    },
    FINAL: {
      name: 'FINAL',
      duration: 30000,   // 30-60 seconds
      interval: 1000,    // Very late properties
      description: 'Final polling for extremely late properties'
    }
  };

  /**
   * Retry Configuration
   */
  const DEFAULT_RETRY_CONFIG = {
    // Linear backoff for missing paths (may appear as scripts load)
    pathNotFound: {
      maxRetries: 100,       // Many retries since paths can appear late
      baseDelay: 100,        // Start at 100ms
      maxDelay: 1000         // Cap at 1 second
    },
    // Exponential backoff for getter errors (usually temporary)
    getterError: {
      maxRetries: 10,        // Fewer retries for errors
      baseDelay: 50,
      multiplier: 1.5,
      maxDelay: 2000
    },
    // Property absent (not an error, just doesn't exist yet)
    propertyAbsent: {
      maxRetries: 50,        // Moderate retries
      baseDelay: 200
    }
  };

  const cloneConfig = (obj) => JSON.parse(JSON.stringify(obj));

  /**
   * WindowPropertyTracker - Manages reliable window property detection
   */
  class WindowPropertyTracker {
    constructor() {
      // Property tracking state
      this.properties = new Map(); // path -> PropertyTrackingData
      this.detectedProperties = new Set();

      // Polling state
      this.currentPhase = null;
      this.phaseStartTime = 0;
      this.pollingInterval = null;
      this.isPolling = false;
      this.completed = false;

      // Callbacks
      this.onDetection = null;
      this.onComplete = null;

      // Statistics
      this.stats = {
        totalProperties: 0,
        detected: 0,
        notMatched: 0,
        errors: 0,
        abandoned: 0,
        totalChecks: 0,
        phaseTransitions: 0
      };

      // Debug mode
      this.debugMode = false;

      // Configurable polling + retry settings
      this.pollingPhases = cloneConfig(DEFAULT_POLLING_PHASES);
      this.retryConfig = cloneConfig(DEFAULT_RETRY_CONFIG);
    }

    /**
     * Initialize tracking for a set of property definitions
     * @param {Array} propertyDefinitions - Array of property definitions from detectors
     * @param {Object} options - Configuration options
     */
    initialize(propertyDefinitions, options = {}) {
      this.onDetection = options.onDetection || null;
      this.onComplete = options.onComplete || null;
      this.debugMode = options.debugMode || false;
      if (options.config) {
        this.applyConfig(options.config);
      }

      // Initialize tracking state for each property
      for (const propDef of propertyDefinitions) {
        if (!propDef.path) continue;

        this.properties.set(propDef.path, {
          definition: propDef,
          state: PropertyState.PENDING,
          retryCount: 0,
          lastError: null,
          lastCheckTime: 0,
          nextRetryTime: 0,
          checkCount: 0
        });
      }

      this.stats.totalProperties = this.properties.size;
      this._log(`Initialized tracking for ${this.properties.size} properties`);
    }

    /**
     * Apply configuration overrides
     * @param {Object} config - Window property config or reliability config
     */
    applyConfig(config = {}) {
      const windowConfig = config.windowPropertyConfig || config || {};
      const nextPollingPhases = cloneConfig(DEFAULT_POLLING_PHASES);
      const nextRetryConfig = cloneConfig(DEFAULT_RETRY_CONFIG);

      const phases = windowConfig.pollingPhases;
      if (phases && typeof phases === 'object') {
        for (const phaseName of Object.keys(nextPollingPhases)) {
          const phaseOverride = phases[phaseName];
          if (!phaseOverride) continue;

          const duration = phaseOverride.duration;
          const interval = phaseOverride.interval;

          if (Number.isFinite(duration) && duration >= 0) {
            nextPollingPhases[phaseName].duration = duration;
          }
          if (Number.isFinite(interval) && interval >= 0) {
            nextPollingPhases[phaseName].interval = interval;
          }
        }
      }

      const retry = windowConfig.retry;
      if (retry && typeof retry === 'object') {
        const pathNotFound = retry.pathNotFound;
        if (pathNotFound) {
          if (Number.isFinite(pathNotFound.maxRetries) && pathNotFound.maxRetries >= 0) {
            nextRetryConfig.pathNotFound.maxRetries = pathNotFound.maxRetries;
          }
          if (Number.isFinite(pathNotFound.baseDelay) && pathNotFound.baseDelay >= 0) {
            nextRetryConfig.pathNotFound.baseDelay = pathNotFound.baseDelay;
          }
          if (Number.isFinite(pathNotFound.maxDelay) && pathNotFound.maxDelay >= 0) {
            nextRetryConfig.pathNotFound.maxDelay = pathNotFound.maxDelay;
          }
        }

        const getterError = retry.getterError;
        if (getterError) {
          if (Number.isFinite(getterError.maxRetries) && getterError.maxRetries >= 0) {
            nextRetryConfig.getterError.maxRetries = getterError.maxRetries;
          }
          if (Number.isFinite(getterError.baseDelay) && getterError.baseDelay >= 0) {
            nextRetryConfig.getterError.baseDelay = getterError.baseDelay;
          }
          if (Number.isFinite(getterError.multiplier) && getterError.multiplier >= 0) {
            nextRetryConfig.getterError.multiplier = getterError.multiplier;
          }
          if (Number.isFinite(getterError.maxDelay) && getterError.maxDelay >= 0) {
            nextRetryConfig.getterError.maxDelay = getterError.maxDelay;
          }
        }

        const propertyAbsent = retry.propertyAbsent;
        if (propertyAbsent) {
          if (Number.isFinite(propertyAbsent.maxRetries) && propertyAbsent.maxRetries >= 0) {
            nextRetryConfig.propertyAbsent.maxRetries = propertyAbsent.maxRetries;
          }
          if (Number.isFinite(propertyAbsent.baseDelay) && propertyAbsent.baseDelay >= 0) {
            nextRetryConfig.propertyAbsent.baseDelay = propertyAbsent.baseDelay;
          }
        }
      }

      this.pollingPhases = nextPollingPhases;
      this.retryConfig = nextRetryConfig;

      if (this.currentPhase && this.currentPhase.name) {
        this.currentPhase = this.pollingPhases[this.currentPhase.name] || this.pollingPhases.EARLY;
      }
    }

    /**
     * Start adaptive polling
     */
    startPolling() {
      if (this.isPolling) return;

      this.isPolling = true;
      this.phaseStartTime = Date.now();
      this.currentPhase = this.pollingPhases.EARLY;

      this._log(`Starting adaptive polling in ${this.currentPhase.name} phase`);
      this._scheduleNextPoll();
    }

    /**
     * Schedule the next polling check
     */
    _scheduleNextPoll() {
      if (!this.isPolling) return;

      const now = Date.now();
      const elapsed = now - this.phaseStartTime;

      // Check for phase transition
      const newPhase = this._determinePhase(elapsed);
      if (newPhase !== this.currentPhase) {
        this._log(`Phase transition: ${this.currentPhase.name} → ${newPhase.name} at ${elapsed}ms`);
        this.currentPhase = newPhase;
        this.stats.phaseTransitions++;
      }

      // Check if we've exceeded total duration
      const totalDuration = this.pollingPhases.EARLY.duration +
                           this.pollingPhases.NORMAL.duration +
                           this.pollingPhases.LATE.duration +
                           this.pollingPhases.FINAL.duration;

      if (elapsed >= totalDuration) {
        this._log(`Polling complete after ${elapsed}ms (max duration reached)`);
        this._completePolling('max_duration');
        return;
      }

      // Check if all properties are in terminal state
      if (this._allPropertiesTerminal()) {
        this._log(`Polling complete after ${elapsed}ms (all properties terminal)`);
        this._completePolling('all_terminal');
        return;
      }

      // Schedule next check
      this.pollingInterval = setTimeout(() => {
        this._performPollingCheck();
        this._scheduleNextPoll();
      }, this.currentPhase.interval);
    }

    /**
     * Determine which polling phase based on elapsed time
     * @param {number} elapsed - Milliseconds since polling started
     * @returns {Object} Current phase
     */
    _determinePhase(elapsed) {
      if (elapsed < this.pollingPhases.EARLY.duration) {
        return this.pollingPhases.EARLY;
      } else if (elapsed < this.pollingPhases.EARLY.duration + this.pollingPhases.NORMAL.duration) {
        return this.pollingPhases.NORMAL;
      } else if (elapsed < this.pollingPhases.EARLY.duration + this.pollingPhases.NORMAL.duration + this.pollingPhases.LATE.duration) {
        return this.pollingPhases.LATE;
      } else {
        return this.pollingPhases.FINAL;
      }
    }

    /**
     * Perform a single polling check on all pending properties
     */
    _performPollingCheck() {
      const now = Date.now();

      for (const [path, trackingData] of this.properties.entries()) {
        // Skip terminal states
        if (this._isTerminalState(trackingData.state)) continue;

        // Skip if not ready for retry
        if (now < trackingData.nextRetryTime) continue;

        // Check the property
        this._checkProperty(path, trackingData);
      }
    }

    /**
     * Check a single property and update its state
     * @param {string} path - Property path
     * @param {Object} trackingData - Tracking data for this property
     */
    _checkProperty(path, trackingData) {
      const now = Date.now();
      trackingData.lastCheckTime = now;
      trackingData.checkCount++;
      this.stats.totalChecks++;

      try {
        // Navigate to property
        const result = this._navigateToProperty(path);

        if (result.error) {
          this._handlePropertyError(path, trackingData, result.error, result.errorType);
          return;
        }

        if (!result.found) {
          this._handlePropertyNotFound(path, trackingData, result.reason);
          return;
        }

        // Property exists, check condition
        const conditionMet = this._checkCondition(result.value, trackingData.definition);

        if (conditionMet) {
          this._handlePropertyDetected(path, trackingData, result.value);
        } else {
          trackingData.state = PropertyState.NOT_MATCHED;
          // Keep checking - condition might become true later
          this._scheduleRetry(path, trackingData, 'propertyAbsent');
        }
      } catch (error) {
        this._handlePropertyError(path, trackingData, error.message, 'exception');
      }
    }

    /**
     * Navigate to a property path and return its value
     * @param {string} path - Property path (e.g., "navigator.brave")
     * @returns {Object} { found: boolean, value: any, error: string, errorType: string, reason: string }
     */
    _navigateToProperty(path) {
      const parts = path.split('.');
      let obj = window;
      let traversedPath = 'window';

      const prevSuppressionDepth = typeof window[HOOK_SUPPRESSION_DEPTH_KEY] === 'number'
        ? window[HOOK_SUPPRESSION_DEPTH_KEY]
        : 0;
      window[HOOK_SUPPRESSION_DEPTH_KEY] = prevSuppressionDepth + 1;

      try {
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          traversedPath += `.${part}`;

          if (obj == null) {
            return {
              found: false,
              reason: `Parent path null at ${traversedPath}`,
              errorType: 'path_null'
            };
          }

          try {
            // Check if property exists
            if (!(part in obj)) {
              if (i < parts.length - 1) {
                // Intermediate path missing
                return {
                  found: false,
                  reason: `Path not found: ${traversedPath}`,
                  errorType: 'path_not_found'
                };
              } else {
                // Final property missing
                return {
                  found: false,
                  reason: `Property absent: ${traversedPath}`,
                  errorType: 'property_absent'
                };
              }
            }

            // Access the property (might throw for getters)
            obj = obj[part];
          } catch (e) {
            return {
              found: false,
              error: e.message,
              errorType: 'getter_error',
              reason: `Getter error at ${traversedPath}: ${e.message}`
            };
          }
        }

        return {
          found: true,
          value: obj
        };
      } finally {
        window[HOOK_SUPPRESSION_DEPTH_KEY] = prevSuppressionDepth;
      }
    }

    /**
     * Check if a value meets the condition
     * @param {any} value - Property value
     * @param {Object} definition - Property definition with condition
     * @returns {boolean} True if condition is met
     */
    _checkCondition(value, definition) {
      const condition = definition.condition || 'truthy';

      // Shared, safe condition language (no eval).
      const lang = globalThis.ScrapflyWindowConditionLanguage;
      if (lang && typeof lang.evaluate === 'function') {
        return lang.evaluate(value, condition);
      }

      // Fallback: default to truthy
      return !!value;
    }

    /**
     * Handle property detection
     */
    _handlePropertyDetected(path, trackingData, value) {
      trackingData.state = PropertyState.DETECTED;
      this.detectedProperties.add(path);
      this.stats.detected++;

      const detection = {
        detectorId: trackingData.definition.detectorId,
        detectorName: trackingData.definition.detectorName,
        category: trackingData.definition.category,
        property: {
          path: path,
          actualType: value === null ? 'null' : typeof value,
          actualValue: typeof value === 'object' ? '[object]' : String(value).substring(0, 100),
          condition: trackingData.definition.condition || 'truthy',
          confidence: trackingData.definition.confidence || 80,
          description: trackingData.definition.description
        }
      };

      this._log(`Detected: ${path} (${trackingData.definition.detectorName})`);

      if (this.onDetection) {
        this.onDetection([detection]);
      }
    }

    /**
     * Handle property not found
     */
    _handlePropertyNotFound(path, trackingData, reason) {
      const errorType = reason.includes('Path not found') ? 'path_not_found' : 'property_absent';

      if (errorType === 'path_not_found') {
        trackingData.state = PropertyState.PATH_NOT_FOUND;
        this._scheduleRetry(path, trackingData, 'pathNotFound');
      } else {
        trackingData.state = PropertyState.PROPERTY_ABSENT;
        this._scheduleRetry(path, trackingData, 'propertyAbsent');
      }
    }

    /**
     * Handle property access error
     */
    _handlePropertyError(path, trackingData, error, errorType) {
      trackingData.lastError = error;

      if (errorType === 'getter_error') {
        // Getter errors might be temporary (e.g., cross-origin)
        this._scheduleRetry(path, trackingData, 'getterError');
      } else {
        // Non-recoverable error
        trackingData.state = PropertyState.ERROR;
        this.stats.errors++;
        this._log(`Error checking ${path}: ${error}`);
      }
    }

    /**
     * Schedule a retry for a property
     */
    _scheduleRetry(path, trackingData, retryType) {
      const config = this.retryConfig[retryType];
      if (!config) return;

      trackingData.retryCount++;

      if (trackingData.retryCount > config.maxRetries) {
        trackingData.state = PropertyState.ABANDONED;
        this.stats.abandoned++;
        this._log(`Abandoned ${path} after ${trackingData.retryCount} retries`);
        return;
      }

      // Calculate delay based on retry type
      let delay;
      if (retryType === 'getterError') {
        // Exponential backoff
        delay = Math.min(
          config.baseDelay * Math.pow(config.multiplier, trackingData.retryCount - 1),
          config.maxDelay
        );
      } else {
        // Linear backoff for path/property not found
        delay = Math.min(
          config.baseDelay + (trackingData.retryCount * 50),
          config.maxDelay || config.baseDelay * 10
        );
      }

      trackingData.nextRetryTime = Date.now() + delay;
    }

    /**
     * Check if all properties are in a terminal state
     */
    _allPropertiesTerminal() {
      for (const trackingData of this.properties.values()) {
        if (!this._isTerminalState(trackingData.state)) {
          return false;
        }
      }
      return true;
    }

    /**
     * Check if a state is terminal (won't change)
     */
    _isTerminalState(state) {
      return [
        PropertyState.DETECTED,
        PropertyState.ERROR,
        PropertyState.ABANDONED
      ].includes(state);
    }

    /**
     * Complete polling and report results
     */
    _completePolling(reason) {
      if (this.completed) return;
      this.completed = true;
      this.isPolling = false;

      if (this.pollingInterval) {
        clearTimeout(this.pollingInterval);
        this.pollingInterval = null;
      }

      const elapsed = Date.now() - this.phaseStartTime;

      this._log(`Polling complete: ${this.stats.detected}/${this.stats.totalProperties} detected`);
      this._log(`Stats: ${JSON.stringify(this.stats)}`);

      if (this.onComplete) {
        this.onComplete({
          detectedCount: this.stats.detected,
          totalChecked: this.stats.totalProperties,
          elapsedMs: elapsed,
          reason: reason,
          stats: this.getStats()
        });
      }

      window.postMessage({
        type: 'WINDOW_PROPS_COMPLETE',
        url: window.location.href,
        timestamp: Date.now(),
        detectedCount: this.stats.detected,
        totalChecked: this.stats.totalProperties,
        elapsedMs: elapsed,
        reason: reason
      }, '*');
    }

    /**
     * Stop polling (called on cache hit or disable)
     */
    stop() {
      this.isPolling = false;

      if (this.pollingInterval) {
        clearTimeout(this.pollingInterval);
        this.pollingInterval = null;
      }

      this._log('Polling stopped');
    }

    /**
     * Get current statistics
     */
    getStats() {
      const stateBreakdown = {};
      for (const state of Object.values(PropertyState)) {
        stateBreakdown[state] = 0;
      }

      for (const trackingData of this.properties.values()) {
        stateBreakdown[trackingData.state]++;
      }

      return {
        ...this.stats,
        stateBreakdown,
        currentPhase: this.currentPhase?.name || 'none',
        isPolling: this.isPolling
      };
    }

    /**
     * Cleanup
     */
    cleanup() {
      this.stop();
      this.completed = false;
      this.properties.clear();
      this.detectedProperties.clear();
    }

    /**
     * Log helper (only logs if debugMode is enabled)
     */
    _log(message, data = null) {
      if (!this.debugMode) return;

      const logMsg = `[WindowPropertyTracker] ${message}`;
      if (data) {
        window.postMessage({
          type: 'SCRAPFLY_DEBUG_LOG',
          level: 'log',
          message: `${logMsg} ${JSON.stringify(data)}`,
          source: 'window-property-tracker',
          timestamp: Date.now()
        }, '*');
      } else {
        window.postMessage({
          type: 'SCRAPFLY_DEBUG_LOG',
          level: 'log',
          message: logMsg,
          source: 'window-property-tracker',
          timestamp: Date.now()
        }, '*');
      }
    }
  }

  // Create singleton instance
  window.__WindowPropertyTracker = new WindowPropertyTracker();

  // Also export PropertyState for external use
  window.__PropertyState = PropertyState;
})();
