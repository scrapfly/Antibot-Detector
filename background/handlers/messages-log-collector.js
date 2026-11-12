/**
 * registerLogCollectorHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerLogCollectorHandlers(registry, context) {
    void context;

    const handle_log_collector_enable = function({ request, sendResponse }) {
        (async () => {
            try {
                const saved = typeof logCollector !== 'undefined' && await logCollector.enable();
                sendResponse(saved ? { status: 'success' } : { status: 'error', message: 'Log settings could not be saved' });
            } catch (_) {
                sendResponse({ status: 'error', message: 'Log settings could not be saved' });
            }
        })();
        return true;
    };
    registry[WorkerMessages.LOG_COLLECTOR_ENABLE] = MessageSender.extensionPagesOnly(handle_log_collector_enable);

    const handle_log_collector_disable = function({ request, sendResponse }) {
        (async () => {
            try {
                const saved = typeof logCollector !== 'undefined' && await logCollector.disable();
                sendResponse(saved ? { status: 'success' } : { status: 'error', message: 'Log settings could not be saved' });
            } catch (_) {
                sendResponse({ status: 'error', message: 'Log settings could not be saved' });
            }
        })();
        return true;
    };
    registry[WorkerMessages.LOG_COLLECTOR_DISABLE] = MessageSender.extensionPagesOnly(handle_log_collector_disable);

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
    registry[WorkerMessages.LOG_COLLECTOR_CLEAR] = MessageSender.extensionPagesOnly(handle_log_collector_clear);

    // Export: the worker builds the file and hands it over ({ filename, type, text }); Settings saves it from a Blob and says
    // whether the download started (a full log is over the size of a data: address, and a worker cannot make a Blob address)
    const exportAnswer = (build) => {
        if (typeof logCollector === 'undefined') return { status: 'error', message: 'LogCollector not available' };
        try {
            const file = build(logCollector);
            if (typeof Logger !== 'undefined' && typeof Logger.storage === 'function') Logger.storage('[LogCollector] Built log export:', file.filename);
            return { status: 'success', filename: file.filename, type: file.type, text: file.text };
        } catch (error) {
            return { status: 'error', message: String((error && error.message) || error) };
        }
    };

    const handle_log_collector_export_json = function({ request, sender, sendResponse, context }) {
        void context;
        sendResponse(exportAnswer(collector => collector.buildJSON()));
        return true; // Keep message channel open for response
    };
    registry[WorkerMessages.LOG_COLLECTOR_EXPORT_JSON] = MessageSender.extensionPagesOnly(handle_log_collector_export_json);

    const handle_log_collector_export_text = function({ request, sender, sendResponse, context }) {
        void context;
        sendResponse(exportAnswer(collector => collector.buildText()));
        return true; // Keep message channel open for response
    };
    registry[WorkerMessages.LOG_COLLECTOR_EXPORT_TEXT] = MessageSender.extensionPagesOnly(handle_log_collector_export_text);

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
    registry[WorkerMessages.LOG_COLLECTOR_GET_COUNT] = MessageSender.extensionPagesOnly(handle_log_collector_get_count);

    const handle_log_collector_set_max_logs = function({ request, sendResponse }) {
        (async () => {
            try {
                const saved = typeof logCollector !== 'undefined' && await logCollector.setMaxLogs(request.maxLogs);
                sendResponse(saved ? { status: 'success', maxLogs: logCollector.maxLogs } : { status: 'error', message: 'Log settings could not be saved' });
            } catch (_) {
                sendResponse({ status: 'error', message: 'Log settings could not be saved' });
            }
        })();
        return true;
    };
    registry[WorkerMessages.LOG_COLLECTOR_SET_MAX_LOGS] = MessageSender.extensionPagesOnly(handle_log_collector_set_max_logs);

}
