/**
 * registerLoggingHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerLoggingHandlers(registry, context) {
    void context;
    const BRIDGE_TYPES = globalThis.ScrapflyBridgeProtocol.MESSAGE_TYPES;

    // Content-script lines arrive batched ({ logs: [...] }); older pages send { log }
    const handle_log = function({ request, sender, sendResponse, context }) {
        void context;

        const logs = Array.isArray(request.logs) ? request.logs : (request.log ? [request.log] : []);
        for (const log of logs.slice(0, Logger.MAX_BATCH)) {
            if (log && typeof log === 'object') Logger._outputToConsole({ ...log, context: 'content' });
        }
    };
    registry['LOG'] = handle_log;

    // MAIN-world lines. The MAIN world only sends them in Debug mode; the
    // worker's own Logger flags (refreshed on start and on every settings
    // change, see background.js) decide without a storage read per line.
    const handle_scrapfly_debug_log = function({ request, sender, sendResponse, context }) {
        void context;

        if (!Logger.debugMode || typeof request.message !== 'string') return;
        const LOG = globalThis.ScrapflyBridgeProtocol.LOG;
        const level = request.level === LOG.LEVELS.ERROR ? Logger.LEVELS.ERROR
            : request.level === LOG.LEVELS.WARN ? Logger.LEVELS.WARN : Logger.LEVELS.DEBUG;
        // Routine MAIN-world traces belong to the verbose tier
        if (level === Logger.LEVELS.DEBUG && !Logger.verboseMode) return;
        const prefix = request.source === LOG.SOURCES.WINDOW_TRACKER ? LOG.PREFIXES.WINDOW_TRACKER : LOG.PREFIXES.MAIN_WORLD;
        const message = request.message.startsWith(prefix) ? request.message.slice(prefix.length).trim() : request.message;
        const area = request.source === LOG.SOURCES.WINDOW_TRACKER ? 'window' : 'hooks';
        const tab = sender?.tab?.url ? ` ${Logger.hostOf(sender.tab.url)}:` : '';
        Logger._outputToConsole({
            timestamp: typeof request.timestamp === 'number' ? request.timestamp : Date.now(),
            context: 'main', category: area, level,
            message: Logger._cut(`${tab} ${message}`.trim(), Logger.MAX_MESSAGE_LENGTH)
        });
    };
    registry[BRIDGE_TYPES.DEBUG_LOG] = handle_scrapfly_debug_log;

    const handle_hook_failure_report = function({ request, sender, sendResponse, context }) {
        void context;

        // Hook diagnostics from MAIN world (Debug mode only)
        if (Logger.debugMode) {
            Logger.warn('HOOKS', `Hook ${request.failureType || 'failure'}: ${request.target}`, {
                reason: request.message, error: request.error
            });
        }
        sendResponse({ status: 'ignored' });
    };
    registry[BRIDGE_TYPES.HOOK_FAILURE_REPORT] = handle_hook_failure_report;

}
