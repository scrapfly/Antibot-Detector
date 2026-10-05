// Window property detection with adaptive polling and retry strategies

(function() {
  'use strict';

  if (window.__WindowPropertyTracker) {
    return;
  }

  // Frozen enum whose values are its own key names (internal state only)
  function keyed(shape) {
    const out = {};
    for (const key of Object.keys(shape)) out[key] = key;
    return Object.freeze(out);
  }

  /**
   * Property States
   */
  const PropertyState = keyed({
    PENDING: null,          // Not yet checked
    PATH_NOT_FOUND: null,   // Parent path doesn't exist (retry)
    PROPERTY_ABSENT: null,  // Property doesn't exist on object (may appear later)
    DETECTED: null,         // Property found and condition met
    NOT_MATCHED: null,      // Property found but condition not met
    ERROR: null,            // Non-recoverable error
    ABANDONED: null         // Max retries exceeded
  });

  // States that never change again
  const TERMINAL_STATES = new Set([PropertyState.DETECTED, PropertyState.ERROR, PropertyState.ABANDONED]);

  // What walking a property path found
  const Lookup = keyed({
    FOUND: null,
    PARENT_NULL: null,       // an intermediate value is null/undefined
    PATH_NOT_FOUND: null,    // an intermediate property is missing
    PROPERTY_ABSENT: null,   // the final property is missing
    GETTER_ERROR: null       // a getter (or `in` on a primitive) threw
  });

  /**
   * Polling phases and retry backoffs from the tuning config the ISOLATED world
   * resolves (modules/core/hooks-config.js, WINDOW_* keys). This module holds no
   * timing values of its own.
   */
  function phasesFromConfig(config) {
    const byName = {
      EARLY: { duration: config.WINDOW_PHASE_EARLY_MS, interval: config.WINDOW_PHASE_EARLY_INTERVAL_MS },
      NORMAL: { duration: config.WINDOW_PHASE_NORMAL_MS, interval: config.WINDOW_PHASE_NORMAL_INTERVAL_MS },
      LATE: { duration: config.WINDOW_PHASE_LATE_MS, interval: config.WINDOW_PHASE_LATE_INTERVAL_MS },
      FINAL: { duration: config.WINDOW_PHASE_FINAL_MS, interval: config.WINDOW_PHASE_FINAL_INTERVAL_MS }
    };
    // In order; each phase lasts until `endsAt` ms after polling started
    let endsAt = 0;
    return Object.entries(byName).map(([name, phase]) => {
      endsAt += phase.duration;
      return Object.freeze({ name, interval: phase.interval, endsAt });
    });
  }

  function retryFromConfig(config) {
    const linear = (base, max) => (retry) => Math.min(base + retry * config.WINDOW_RETRY_STEP_MS, max);
    return {
      // Linear backoff: missing parent paths may appear as scripts load
      pathNotFound: {
        maxRetries: config.WINDOW_RETRY_PATH_MAX,
        delay: linear(config.WINDOW_RETRY_PATH_BASE_MS, config.WINDOW_RETRY_PATH_MAX_DELAY_MS)
      },
      // Exponential backoff: getter errors are usually temporary
      getterError: {
        maxRetries: config.WINDOW_RETRY_GETTER_MAX,
        delay: (retry) => Math.min(
          config.WINDOW_RETRY_GETTER_BASE_MS * Math.pow(config.WINDOW_RETRY_GETTER_MULTIPLIER, retry - 1),
          config.WINDOW_RETRY_GETTER_MAX_DELAY_MS
        )
      },
      // Linear backoff: property absent (or condition not met) may change later
      propertyAbsent: {
        maxRetries: config.WINDOW_RETRY_ABSENT_MAX,
        delay: linear(config.WINDOW_RETRY_ABSENT_BASE_MS, config.WINDOW_RETRY_ABSENT_MAX_DELAY_MS)
      }
    };
  }

  function createStats() {
    return {
      totalProperties: 0,
      detected: 0,
      notMatched: 0,
      errors: 0,
      abandoned: 0,
      totalChecks: 0,
      phaseTransitions: 0
    };
  }

  /**
   * WindowPropertyTracker - Manages reliable window property detection
   */
  class WindowPropertyTracker {
    constructor() {
      // Property tracking state
      this.properties = new Map(); // path -> PropertyTrackingData

      // Polling state
      this.currentPhase = null;
      this.phaseStartTime = 0;
      this.pollingInterval = null;
      this.isPolling = false;
      this.completed = false;

      // Callbacks
      this.onDetection = null;
      this.onComplete = null;
      this.postMessageToIsolated = null;

      // Statistics
      this.stats = createStats();

      // Debug mode
      this.debugMode = false;

      // Bridge protocol (message types, reasons, shared global keys, log labels,
      // report placeholders, path syntax), handed over by content-main-world.js in initialize()
      this.protocol = null;
      // Tuning config (modules/core/hooks-config.js), also from initialize()
      this.config = null;
      // Condition evaluator (window-condition-language.js), captured by
      // content-main-world.js before any page script, also from initialize()
      this.conditionLanguage = null;

      // Polling phases (ordered) + retry policies, built from the config passed to initialize()
      this.pollingPhases = null;
      this.retryConfig = null;
    }

    reset() {
      if (this.pollingInterval) {
        clearTimeout(this.pollingInterval);
        this.pollingInterval = null;
      }

      this.properties.clear();
      this.currentPhase = null;
      this.phaseStartTime = 0;
      this.isPolling = false;
      this.completed = false;
      this.onDetection = null;
      this.onComplete = null;
      this.postMessageToIsolated = null;
      this.stats = createStats();
      this.pollingPhases = null;
      this.retryConfig = null;
      this.config = null;
    }

    /**
     * Initialize tracking for a set of property definitions
     * @param {Array} propertyDefinitions - Array of property definitions from detectors
     * @param {Object} options - Configuration options
     */
    initialize(propertyDefinitions, options = {}) {
      this.reset();
      this.onDetection = options.onDetection || null;
      this.onComplete = options.onComplete || null;
      this.postMessageToIsolated = typeof options.postMessageToIsolated === 'function'
        ? options.postMessageToIsolated
        : null;
      this.debugMode = options.debugMode || false;
      this.protocol = options.protocol || null;
      this.config = options.config || null;
      this.conditionLanguage = options.conditionLanguage || null;
      if (options.config) {
        this.pollingPhases = phasesFromConfig(options.config);
        this.retryConfig = retryFromConfig(options.config);
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

    _postToIsolated(message) {
      if (typeof this.postMessageToIsolated !== 'function' || !this.protocol) {
        return false;
      }
      return this.postMessageToIsolated(message);
    }

    /**
     * Start adaptive polling
     */
    startPolling() {
      if (this.isPolling || !this.protocol) return;

      this.isPolling = true;
      this.phaseStartTime = Date.now();
      if (!this.pollingPhases || !this.retryConfig) {
        // Never invent timings: without a config there is nothing to poll with
        this._completePolling(this.protocol.COMPLETION_REASONS.WINDOW.NO_CONFIG);
        return;
      }
      this.currentPhase = this.pollingPhases[0];

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

      // Check if we've exceeded total duration (the end of the last phase)
      if (elapsed >= this.pollingPhases[this.pollingPhases.length - 1].endsAt) {
        this._log(`Polling complete after ${elapsed}ms (max duration reached)`);
        this._completePolling(this.protocol.COMPLETION_REASONS.WINDOW.MAX_DURATION);
        return;
      }

      // Check if all properties are in terminal state
      if (this._allPropertiesTerminal()) {
        this._log(`Polling complete after ${elapsed}ms (all properties terminal)`);
        this._completePolling(this.protocol.COMPLETION_REASONS.WINDOW.ALL_TERMINAL);
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
     * @returns {Object} Current phase (the last one once all have elapsed)
     */
    _determinePhase(elapsed) {
      return this.pollingPhases.find(phase => elapsed < phase.endsAt) ||
        this.pollingPhases[this.pollingPhases.length - 1];
    }

    /**
     * Perform a single polling check on all pending properties
     */
    _performPollingCheck() {
      const now = Date.now();

      for (const [path, trackingData] of this.properties.entries()) {
        // Skip terminal states
        if (TERMINAL_STATES.has(trackingData.state)) continue;

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
        const result = this._navigateToProperty(path);

        switch (result.lookup) {
          case Lookup.GETTER_ERROR:
            // Getter errors might be temporary (e.g., cross-origin); the state is left as it was
            trackingData.lastError = result.error;
            this._scheduleRetry(path, trackingData, this.retryConfig.getterError);
            return;
          case Lookup.PATH_NOT_FOUND:
            trackingData.state = PropertyState.PATH_NOT_FOUND;
            this._scheduleRetry(path, trackingData, this.retryConfig.pathNotFound);
            return;
          case Lookup.PARENT_NULL:
          case Lookup.PROPERTY_ABSENT:
            trackingData.state = PropertyState.PROPERTY_ABSENT;
            this._scheduleRetry(path, trackingData, this.retryConfig.propertyAbsent);
            return;
          default:
            break;
        }

        // Property exists, check condition
        if (this._checkCondition(result.value, trackingData.definition)) {
          this._handlePropertyDetected(path, trackingData, result.value);
        } else {
          trackingData.state = PropertyState.NOT_MATCHED;
          // Keep checking - condition might become true later
          this._scheduleRetry(path, trackingData, this.retryConfig.propertyAbsent);
        }
      } catch (error) {
        // Non-recoverable error
        trackingData.lastError = error.message;
        trackingData.state = PropertyState.ERROR;
        this.stats.errors++;
        this._log(`Error checking ${path}: ${error.message}`);
      }
    }

    /**
     * Navigate to a property path and return its value
     * @param {string} path - Property path (e.g., "navigator.brave")
     * @returns {{lookup: string, value?: any, error?: string}}
     */
    _navigateToProperty(path) {
      const parts = path.split(this.protocol.MAIN_WORLD.PATH_SEPARATOR);
      let obj = window;
      // Suppression depth shared with content-main-world.js
      const HOOK_SUPPRESSION_DEPTH_KEY = this.protocol.GLOBALS.HOOK_SUPPRESSION_DEPTH;

      const prevSuppressionDepth = typeof window[HOOK_SUPPRESSION_DEPTH_KEY] === 'number'
        ? window[HOOK_SUPPRESSION_DEPTH_KEY]
        : 0;
      window[HOOK_SUPPRESSION_DEPTH_KEY] = prevSuppressionDepth + 1;

      try {
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];

          if (obj == null) {
            return { lookup: Lookup.PARENT_NULL };
          }

          try {
            // Check if property exists
            if (!(part in obj)) {
              const isLast = i === parts.length - 1;
              return { lookup: isLast ? Lookup.PROPERTY_ABSENT : Lookup.PATH_NOT_FOUND };
            }

            // Access the property (might throw for getters)
            obj = obj[part];
          } catch (e) {
            return { lookup: Lookup.GETTER_ERROR, error: e.message };
          }
        }

        return { lookup: Lookup.FOUND, value: obj };
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
      // Shared, safe condition language (no eval); it owns what an empty condition means.
      const lang = this.conditionLanguage;
      if (lang && typeof lang.evaluate === 'function') {
        return lang.evaluate(value, definition.condition);
      }

      // Fallback: default to truthy
      return !!value;
    }

    /**
     * Handle property detection
     */
    _handlePropertyDetected(path, trackingData, value) {
      trackingData.state = PropertyState.DETECTED;
      this.stats.detected++;

      const REPORTED = this.protocol.REPORTED_VALUE;
      const detection = {
        detectorId: trackingData.definition.detectorId,
        detectorName: trackingData.definition.detectorName,
        category: trackingData.definition.category,
        property: {
          path: path,
          actualType: value === null ? REPORTED.NULL_TYPE : typeof value,
          actualValue: typeof value === 'object' ? REPORTED.OBJECT : String(value).substring(0, this.config.REPORTED_VALUE_MAX_CHARS),
          condition: trackingData.definition.condition || this.conditionLanguage?.DEFAULT_CONDITION,
          // Filled by the engine from the detector (or its default) before install
          confidence: trackingData.definition.confidence,
          description: trackingData.definition.description
        }
      };

      this._log(`Detected: ${path} (${trackingData.definition.detectorName})`);

      if (this.onDetection) {
        this.onDetection([detection]);
      }
    }

    /**
     * Schedule a retry for a property under one of this.retryConfig's policies
     */
    _scheduleRetry(path, trackingData, policy) {
      trackingData.retryCount++;

      if (trackingData.retryCount > policy.maxRetries) {
        trackingData.state = PropertyState.ABANDONED;
        this.stats.abandoned++;
        this._log(`Abandoned ${path} after ${trackingData.retryCount} retries`);
        return;
      }

      trackingData.nextRetryTime = Date.now() + policy.delay(trackingData.retryCount);
    }

    /**
     * Check if all properties are in a terminal state
     */
    _allPropertiesTerminal() {
      for (const trackingData of this.properties.values()) {
        if (!TERMINAL_STATES.has(trackingData.state)) {
          return false;
        }
      }
      return true;
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
          reason: reason
        });
      }

      this._postToIsolated({
        type: this.protocol.MESSAGE_TYPES.WINDOW_PROPS_COMPLETE,
        url: window.location.href,
        timestamp: Date.now(),
        detectedCount: this.stats.detected,
        totalChecked: this.stats.totalProperties,
        elapsedMs: elapsed,
        reason: reason
      });
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
     * Log helper (only logs if debugMode is enabled)
     */
    _log(message) {
      if (!this.debugMode || !this.protocol) return;

      const LOG = this.protocol.LOG;
      this._postToIsolated({
        type: this.protocol.MESSAGE_TYPES.DEBUG_LOG,
        level: LOG.LEVELS.LOG,
        message: [LOG.PREFIXES.WINDOW_TRACKER, message].join(' '),
        source: LOG.SOURCES.WINDOW_TRACKER,
        timestamp: Date.now()
      });
    }
  }

  // Create singleton instance
  window.__WindowPropertyTracker = new WindowPropertyTracker();
})();
