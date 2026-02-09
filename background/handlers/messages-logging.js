/**
 * registerLoggingHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerLoggingHandlers(registry, context) {
    void context;

    const handle_debug_log = function({ request, sender, sendResponse, context }) {
        void context;

        // Centralized logging - display all logs in service worker console
        if (request.context && request.level && request.args) {
            // NOTE: Avoid JSON.parse here: it can allocate huge objects and crash Chrome.
            const levelMap = {
                warn: Logger.LEVELS.WARN,
                error: Logger.LEVELS.ERROR,
                debug: Logger.LEVELS.DEBUG,
                info: Logger.LEVELS.INFO,
                log: Logger.LEVELS.INFO
            };

            const mappedLevel = levelMap[request.level] || Logger.LEVELS.INFO;
            const safeArgs = Array.isArray(request.args) ? request.args.slice(0, 5).map((arg) => Logger.sanitize(arg)) : [];

            Logger._outputToConsole({
                timestamp: new Date(request.timestamp || Date.now()).toISOString(),
                context: request.context,
                category: Logger.CATEGORIES.BACKGROUND,
                level: mappedLevel,
                message: safeArgs.join(' '),
                data: null
            });
        }
    };
    registry['DEBUG_LOG'] = handle_debug_log;

    const handle_log = function({ request, sender, sendResponse, context }) {
        void context;

        // Logger system - output logs from content scripts and main world
        if (request.log) {
            Logger._outputToConsole(request.log);
        }
    };
    registry['LOG'] = handle_log;

    const handle_scrapfly_debug_log = function({ request, sender, sendResponse, context }) {
        void context;

        // Debug logs from content scripts (only output when debug mode is enabled)
        (async () => {
            try {
                const settings = await Utils.getSettings(chrome);
                const logCollectorActive = typeof logCollector !== 'undefined' && logCollector.enabled;
                if (settings?.debugMode) {
                    if (logCollectorActive && request.level === 'log') {
                        return;
                    }
                    const timestamp = new Date(request.timestamp).toISOString().split('T')[1].slice(0, -1);
                    const prefix = `[${timestamp}] [${request.source || 'hooks'}]`;
                    switch (request.level) {
                        case 'log': Logger.background(prefix, request.message); break;
                        case 'warn': Logger.warn('BACKGROUND', prefix, request.message); break;
                        case 'error': Logger.error('BACKGROUND', prefix, request.message); break;
                        default: Logger.background(prefix, request.message);
                    }
                }
            } catch (e) {
                // Silently fail if settings can't be read
            }
        })();
    };
    registry['SCRAPFLY_DEBUG_LOG'] = handle_scrapfly_debug_log;

    const handle_hook_failure_report = function({ request, sender, sendResponse, context }) {
        void context;

        // Internal diagnostics from MAIN-world HookResilienceManager.
        // Popup doesn't need these; keep background quiet unless debug mode is enabled.
        (async () => {
            try {
                const settings = await Utils.getSettings(chrome);
                if (!settings?.debugMode) return;
                Logger.warn('HOOKS', `[Hooks] ${request.type}`, {
                    target: request.target,
                    failureType: request.failureType,
                    message: request.message,
                    success: request.success,
                    error: request.error
                });
            } catch (e) {
                // ignore
            }
        })();
        sendResponse({ status: 'ignored' });
    };
    registry['HOOK_FAILURE_REPORT'] = handle_hook_failure_report;
    registry['HOOK_TAMPERING_DETECTED'] = handle_hook_failure_report;
    registry['HOOK_RECOVERY_RESULT'] = handle_hook_failure_report;

}
