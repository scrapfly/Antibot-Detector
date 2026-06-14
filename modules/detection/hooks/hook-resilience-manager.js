// Hook reliability: installation verification, integrity checks, failure reporting

(function() {
  'use strict';

  if (window.__HookResilienceManager) {
    return;
  }

  class HookResilienceManager {
    constructor() {
      this.expectedTargets = new Set();
      this.failureReporter = null;
    }

    setFailureReporter(reporter) {
      this.failureReporter = typeof reporter === 'function' ? reporter : null;
    }

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

        // Method hooks work if writable=true even when not configurable
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

    registerHookInstall(target, originalDescriptor, wrapperDescriptor) {
      const verified = this._verifyHookInstallation(target, wrapperDescriptor);
      if (!verified) {
        this._reportFailure(target, 'VERIFICATION_FAILED', 'Hook installed but verification failed');
      }
    }

    registerHookFailure(target, error) {
      this._reportFailure(target, 'INSTALL_FAILED', error);
    }

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

    _reportFailure(target, type, message) {
      try {
        if (!this.failureReporter) return;
        this.failureReporter({
          type: 'HOOK_FAILURE_REPORT',
          target,
          failureType: type,
          message,
          timestamp: Date.now()
        });
      } catch (e) {
        // Silently fail
      }
    }

  }

  window.__HookResilienceManager = new HookResilienceManager();
})();
