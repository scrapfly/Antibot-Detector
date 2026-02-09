/**
 * registerLogCollectorHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerLogCollectorHandlers(registry, context) {
    void context;

    const handle_log_collector_enable = function({ request, sender, sendResponse, context }) {
        void context;

        if (typeof logCollector !== 'undefined') {
            logCollector.enable();
            Logger.storage('[LogCollector] Log collection enabled via settings');
        }
        if (typeof globalThis !== 'undefined') {
            globalThis.logCollectorEnabled = true;
        }
        sendResponse({ status: 'success' });
    };
    registry['LOG_COLLECTOR_ENABLE'] = handle_log_collector_enable;

    const handle_log_collector_disable = function({ request, sender, sendResponse, context }) {
        void context;

        if (typeof logCollector !== 'undefined') {
            logCollector.disable();
            Logger.storage('[LogCollector] Log collection disabled via settings');
        }
        if (typeof globalThis !== 'undefined') {
            globalThis.logCollectorEnabled = false;
        }
        sendResponse({ status: 'success' });
    };
    registry['LOG_COLLECTOR_DISABLE'] = handle_log_collector_disable;

    const handle_log_collector_clear = function({ request, sender, sendResponse, context }) {
        void context;

        if (typeof logCollector !== 'undefined') {
            logCollector.clear();
            Logger.storage('[LogCollector] Logs cleared');
            sendResponse({ status: 'success' });
        } else {
            sendResponse({ status: 'error', message: 'LogCollector not available' });
        }
        return true; // Keep message channel open for response
    };
    registry['LOG_COLLECTOR_CLEAR'] = handle_log_collector_clear;

    const handle_log_collector_export_json = function({ request, sender, sendResponse, context }) {
        void context;

        if (typeof logCollector !== 'undefined') {
            const jsonFilename = logCollector.exportAsJSON();
            Logger.storage('[LogCollector] Exported logs as JSON:', jsonFilename);
            sendResponse({ status: 'success', filename: jsonFilename });
        } else {
            sendResponse({ status: 'error', message: 'LogCollector not available' });
        }
        return true; // Keep message channel open for response
    };
    registry['LOG_COLLECTOR_EXPORT_JSON'] = handle_log_collector_export_json;

    const handle_log_collector_export_text = function({ request, sender, sendResponse, context }) {
        void context;

        if (typeof logCollector !== 'undefined') {
            const textFilename = logCollector.exportAsText();
            Logger.storage('[LogCollector] Exported logs as text:', textFilename);
            sendResponse({ status: 'success', filename: textFilename });
        } else {
            sendResponse({ status: 'error', message: 'LogCollector not available' });
        }
        return true; // Keep message channel open for response
    };
    registry['LOG_COLLECTOR_EXPORT_TEXT'] = handle_log_collector_export_text;

    const handle_log_collector_get_count = function({ request, sender, sendResponse, context }) {
        void context;

        if (typeof logCollector !== 'undefined') {
            // getLogCount is async, so handle it with Promise
            logCollector.getLogCount().then((count) => {
                sendResponse({ status: 'success', count: count });
            }).catch((error) => {
                Logger.error('STORAGE', '[LogCollector] Error getting log count:', error);
                sendResponse({ status: 'error', message: 'Failed to get log count', count: 0 });
            });
            return true; // Indicate async response
        } else {
            sendResponse({ status: 'error', message: 'LogCollector not available', count: 0 });
        }
    };
    registry['LOG_COLLECTOR_GET_COUNT'] = handle_log_collector_get_count;

    const handle_log_collector_set_max_logs = function({ request, sender, sendResponse, context }) {
        void context;

        if (typeof logCollector !== 'undefined') {
            const maxLogs = request.maxLogs;
            logCollector.setMaxLogs(maxLogs);
            Logger.storage('[LogCollector] Max logs set to:', maxLogs);
            sendResponse({ status: 'success', maxLogs: maxLogs });
        } else {
            sendResponse({ status: 'error', message: 'LogCollector not available' });
        }
    };
    registry['LOG_COLLECTOR_SET_MAX_LOGS'] = handle_log_collector_set_max_logs;

}
