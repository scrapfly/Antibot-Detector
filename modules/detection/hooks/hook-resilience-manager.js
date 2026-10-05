// Hook reliability: installation verification, integrity checks, failure reporting

(function() {
  'use strict';

  if (window.__HookResilienceManager) {
    return;
  }

  // Bridge protocol vocabulary, handed over by content-main-world.js (setProtocol)
  // once the ISOLATED world has bootstrapped the bridge. Used before any install.
  let MESSAGE_TYPES = null;
  let HOOK_FAILURE_TYPES = null;
  let REASONS = null;
  let MESSAGES = null;
  let PATH_SEPARATOR = null;

  class HookResilienceManager {
    constructor() {
      this.expectedTargets = new Set();
      this.failureReporter = null;
    }

    setProtocol(protocol) {
      MESSAGE_TYPES = protocol.MESSAGE_TYPES;
      HOOK_FAILURE_TYPES = protocol.HOOK_FAILURE_TYPES;
      REASONS = protocol.HOOK_FAILURE_REASONS;
      MESSAGES = protocol.HOOK_FAILURE_MESSAGES;
      PATH_SEPARATOR = protocol.MAIN_WORLD.PATH_SEPARATOR;
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

    /**
     * Resolve a dotted hook target ("Navigator.prototype.getBattery") and decide
     * whether it can be wrapped.
     * @returns {{canInstall: boolean, reason: string, descriptor: ?Object, obj?: Object, propertyName?: string}}
     *   obj/propertyName/descriptor are what the MAIN world hooks when canInstall
     */
    verifyHookTarget(target) {
      try {
        // An owner path and a property name, at least
        const parts = target.split(PATH_SEPARATOR);
        if (parts.length <= 1) {
          return { canInstall: false, reason: REASONS.INVALID_PATH, descriptor: null };
        }

        let obj = window;
        for (let i = 0; i < parts.length - 1; i++) {
          obj = obj[parts[i]];
          if (obj == null) {
            return { canInstall: false, reason: REASONS.PATH_NOT_FOUND, descriptor: null };
          }
        }

        const propertyName = parts[parts.length - 1];
        const descriptor = Object.getOwnPropertyDescriptor(obj, propertyName);

        if (!descriptor) {
          return { canInstall: false, reason: REASONS.PROPERTY_NOT_FOUND, descriptor: null };
        }

        const isAccessor = typeof descriptor.get === 'function' && !descriptor.value;
        const isMethod = typeof descriptor.value === 'function';

        // Accessor hooks require configurable=true because we need to replace the getter/setter.
        if (isAccessor) {
          if (!descriptor.configurable) {
            return { canInstall: false, reason: REASONS.NOT_CONFIGURABLE, descriptor };
          }
          return { canInstall: true, reason: REASONS.OK_ACCESSOR, descriptor, obj, propertyName };
        }

        // Method hooks work if writable=true even when not configurable
        if (isMethod) {
          if (!descriptor.configurable && !descriptor.writable) {
            return { canInstall: false, reason: REASONS.NOT_WRITABLE, descriptor };
          }
          return { canInstall: true, reason: REASONS.OK_METHOD, descriptor, obj, propertyName };
        }

        return { canInstall: false, reason: REASONS.NOT_HOOKABLE, descriptor };
      } catch (error) {
        return { canInstall: false, reason: `${MESSAGES.EXCEPTION_PREFIX}${error.message}`, descriptor: null };
      }
    }

    // Confirm the wrapper is really in place on the object it was installed on
    registerHookInstall(target, obj, propertyName, wrapperDescriptor) {
      if (!this._isWrapperInPlace(obj, propertyName, wrapperDescriptor)) {
        this._reportFailure(target, HOOK_FAILURE_TYPES.VERIFICATION_FAILED, MESSAGES.VERIFICATION_FAILED);
      }
    }

    registerHookFailure(target, error) {
      this._reportFailure(target, HOOK_FAILURE_TYPES.INSTALL_FAILED, error);
    }

    _isWrapperInPlace(obj, propertyName, expectedDescriptor) {
      try {
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
        if (!this.failureReporter || !MESSAGE_TYPES) return;
        this.failureReporter({
          type: MESSAGE_TYPES.HOOK_FAILURE_REPORT,
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
