/**
 * Hook Resilience Manager
 * Provides reliability improvements for JS hooks detection
 *
 * Key Features:
 * - Verify hook installation success with property descriptor checks
 * - Monitor hook integrity (detect tampering)
 * - Report installation failures to background for diagnostics
 * - Track hook statistics for debugging
 *
 * NOTE: Hook targets are derived from detector JSON files (detectors/fingerprint/*.json)
 * loaded by the ISOLATED world content script and passed via CustomEvent.
 * We don't hardcode API lists - they come from the detector definitions.
 */

(function() {
  'use strict';

  // Skip if already initialized
  if (window.__HookResilienceManager) {
    return;
  }

  /**
   * HookResilienceManager - Singleton for hook reliability
   */
  class HookResilienceManager {
    constructor() {
      // Installation tracking
      this.installedHooks = new Map(); // target -> { originalDescriptor, wrapperDescriptor, installTime }
      this.failedHooks = new Map(); // target -> { error, timestamp, retryCount }
      this.tamperedHooks = new Set(); // targets that were detected as tampered

      // Expected hook targets (populated when hook definitions arrive)
      this.expectedTargets = new Set();

      // Integrity monitoring
      this.integrityCheckInterval = null;
      this.integrityCheckPeriodMs = 5000; // Check every 5 seconds

      // Statistics
      this.stats = {
        installAttempts: 0,
        installSuccesses: 0,
        installFailures: 0,
        verificationFailures: 0,
        tamperingsDetected: 0,
        recoveryAttempts: 0,
        recoverySuccesses: 0
      };
    }

    /**
     * Set expected hook targets from detector definitions
     * Called when hook definitions are received from ISOLATED world
     * @param {Array} hookDefinitions - Array of detector objects with hooks array
     */
    setExpectedTargets(hookDefinitions) {
      this.expectedTargets.clear();

      for (const detector of hookDefinitions) {
        if (detector.hooks && Array.isArray(detector.hooks)) {
          for (const hook of detector.hooks) {
            if (hook.target) {
              this.expectedTargets.add(hook.target);
            }
          }
        }
      }
    }

    /**
     * Resolve a string path to an object (e.g., "Navigator.prototype" -> Navigator.prototype)
     * @param {string} path - Object path
     * @returns {Object|null} Resolved object or null
     */
    _resolveObjectPath(path) {
      const parts = path.split('.');
      let obj = window;

      for (const part of parts) {
        if (obj == null) return null;
        obj = obj[part];
      }

      return obj;
    }

    /**
     * Verify hook can be installed on target
     * @param {string} target - Hook target (e.g., "Performance.prototype.now")
     * @returns {Object} { canInstall: boolean, reason: string, descriptor: Object }
     */
    verifyHookTarget(target) {
      try {
        const parts = target.split('.');
        if (parts.length < 2) {
          return { canInstall: false, reason: 'INVALID_PATH', descriptor: null };
        }

        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (obj == null) {
            return { canInstall: false, reason: 'PATH_NOT_FOUND', descriptor: null };
          }
        }

        const propertyName = parts[parts.length - 1];
        const descriptor = Object.getOwnPropertyDescriptor(obj, propertyName);

        if (!descriptor) {
          return { canInstall: false, reason: 'PROPERTY_NOT_FOUND', descriptor: null };
        }

        const isAccessor = typeof descriptor.get === 'function' && !descriptor.value;
        const isMethod = typeof descriptor.value === 'function';

        // Accessor hooks require configurable=true because we need to replace the getter/setter.
        if (isAccessor) {
          if (!descriptor.configurable) {
            return { canInstall: false, reason: 'NOT_CONFIGURABLE', descriptor };
          }
          return { canInstall: true, reason: 'OK_ACCESSOR', descriptor };
        }

        // Method hooks can work even when configurable=false if writable=true (value swap is allowed).
        if (isMethod) {
          if (!descriptor.configurable && !descriptor.writable) {
            return { canInstall: false, reason: 'NOT_WRITABLE', descriptor };
          }
          return { canInstall: true, reason: 'OK_METHOD', descriptor };
        }

        return { canInstall: false, reason: 'NOT_HOOKABLE', descriptor };
      } catch (error) {
        return { canInstall: false, reason: `ERROR: ${error.message}`, descriptor: null };
      }
    }

    /**
     * Register a successful hook installation
     * @param {string} target - Hook target
     * @param {Object} originalDescriptor - Original property descriptor
     * @param {Object} wrapperDescriptor - New wrapper descriptor
     */
    registerHookInstall(target, originalDescriptor, wrapperDescriptor) {
      this.stats.installAttempts++;

      this.installedHooks.set(target, {
        originalDescriptor,
        wrapperDescriptor,
        installTime: Date.now(),
        verified: false
      });

      // Verify installation immediately
      const verified = this._verifyHookInstallation(target, wrapperDescriptor);
      if (verified) {
        this.stats.installSuccesses++;
        this.installedHooks.get(target).verified = true;
      } else {
        this.stats.verificationFailures++;
        this._reportFailure(target, 'VERIFICATION_FAILED', 'Hook installed but verification failed');
      }
    }

    /**
     * Register a hook installation failure
     * @param {string} target - Hook target
     * @param {string} error - Error message
     */
    registerHookFailure(target, error) {
      this.stats.installAttempts++;
      this.stats.installFailures++;

      const existing = this.failedHooks.get(target);
      this.failedHooks.set(target, {
        error,
        timestamp: Date.now(),
        retryCount: existing ? existing.retryCount + 1 : 1
      });

      this._reportFailure(target, 'INSTALL_FAILED', error);
    }

    /**
     * Verify a hook is still installed correctly
     * @param {string} target - Hook target
     * @param {Object} expectedDescriptor - Expected descriptor
     * @returns {boolean} True if hook is intact
     */
    _verifyHookInstallation(target, expectedDescriptor) {
      try {
        const parts = target.split('.');
        let obj = window;

        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (obj == null) return false;
        }

        const propertyName = parts[parts.length - 1];
        const currentDescriptor = Object.getOwnPropertyDescriptor(obj, propertyName);

        if (!currentDescriptor) return false;

        // Check if the wrapper function is still in place
        if (expectedDescriptor.value) {
          return currentDescriptor.value === expectedDescriptor.value;
        }

        if (expectedDescriptor.get) {
          return currentDescriptor.get === expectedDescriptor.get;
        }

        return false;
      } catch (e) {
        return false;
      }
    }

    /**
     * Start integrity monitoring (called after hooks are installed)
     */
    startIntegrityMonitoring() {
      if (this.integrityCheckInterval) {
        return; // Already running
      }

      this.integrityCheckInterval = setInterval(() => {
        this._checkHookIntegrity();
      }, this.integrityCheckPeriodMs);
    }

    /**
     * Stop integrity monitoring
     */
    stopIntegrityMonitoring() {
      if (this.integrityCheckInterval) {
        clearInterval(this.integrityCheckInterval);
        this.integrityCheckInterval = null;
      }
    }

    /**
     * Check all installed hooks for tampering
     */
    _checkHookIntegrity() {
      for (const [target, hookData] of this.installedHooks.entries()) {
        if (!hookData.wrapperDescriptor) continue;

        const isIntact = this._verifyHookInstallation(target, hookData.wrapperDescriptor);

        if (!isIntact && !this.tamperedHooks.has(target)) {
          this.tamperedHooks.add(target);
          this.stats.tamperingsDetected++;

          this._reportTampering(target);

          // Attempt recovery
          this._attemptHookRecovery(target, hookData);
        }
      }
    }

    /**
     * Attempt to recover a tampered hook
     * @param {string} target - Hook target
     * @param {Object} hookData - Original hook data
     */
    _attemptHookRecovery(target, hookData) {
      this.stats.recoveryAttempts++;

      try {
        const parts = target.split('.');
        let obj = window;

        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (obj == null) return;
        }

        const propertyName = parts[parts.length - 1];

        // Reinstall the wrapper
        Object.defineProperty(obj, propertyName, hookData.wrapperDescriptor);

        // Verify recovery
        if (this._verifyHookInstallation(target, hookData.wrapperDescriptor)) {
          this.stats.recoverySuccesses++;
          this.tamperedHooks.delete(target);
          this._reportRecovery(target, true);
        } else {
          this._reportRecovery(target, false);
        }
      } catch (e) {
        this._reportRecovery(target, false, e.message);
      }
    }

    /**
     * Report a hook failure to the content script
     * @param {string} target - Hook target
     * @param {string} type - Failure type
     * @param {string} message - Error message
     */
    _reportFailure(target, type, message) {
      try {
        window.postMessage({
          type: 'HOOK_FAILURE_REPORT',
          target,
          failureType: type,
          message,
          timestamp: Date.now()
        }, '*');
      } catch (e) {
        // Silently fail
      }
    }

    /**
     * Report hook tampering detected
     * @param {string} target - Hook target
     */
    _reportTampering(target) {
      try {
        window.postMessage({
          type: 'HOOK_TAMPERING_DETECTED',
          target,
          timestamp: Date.now()
        }, '*');
      } catch (e) {
        // Silently fail
      }
    }

    /**
     * Report hook recovery attempt result
     * @param {string} target - Hook target
     * @param {boolean} success - Whether recovery succeeded
     * @param {string} error - Error message if failed
     */
    _reportRecovery(target, success, error = null) {
      try {
        window.postMessage({
          type: 'HOOK_RECOVERY_RESULT',
          target,
          success,
          error,
          timestamp: Date.now()
        }, '*');
      } catch (e) {
        // Silently fail
      }
    }

    /**
     * Get current statistics
     * @returns {Object} Statistics object
     */
    getStats() {
      return {
        ...this.stats,
        installedCount: this.installedHooks.size,
        failedCount: this.failedHooks.size,
        tamperedCount: this.tamperedHooks.size,
        successRate: this.stats.installAttempts > 0
          ? Math.round((this.stats.installSuccesses / this.stats.installAttempts) * 100)
          : 0
      };
    }

    /**
     * Cleanup when detection completes
     */
    cleanup() {
      this.stopIntegrityMonitoring();
      this.installedHooks.clear();
      this.failedHooks.clear();
      this.tamperedHooks.clear();
    }
  }

  // Create singleton instance
  window.__HookResilienceManager = new HookResilienceManager();
})();
