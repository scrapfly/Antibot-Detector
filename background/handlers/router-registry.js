/**
 * Background message handler registry.
 */
function buildMessageHandlerRegistry(context) {
    const registry = {};

    registry['PING'] = function({ sendResponse }) {
        sendResponse({ status: 'pong', timestamp: Date.now() });
    };

    if (typeof registerLoggingHandlers === 'function') {
        registerLoggingHandlers(registry, context);
    }
    if (typeof registerDetectionHandlers === 'function') {
        registerDetectionHandlers(registry, context);
    }
    if (typeof registerCacheHandlers === 'function') {
        registerCacheHandlers(registry, context);
    }
    if (typeof registerSettingsHandlers === 'function') {
        registerSettingsHandlers(registry, context);
    }
    if (typeof registerLogCollectorHandlers === 'function') {
        registerLogCollectorHandlers(registry, context);
    }
    if (typeof registerAdvancedCaptureHandlers === 'function') {
        registerAdvancedCaptureHandlers(registry, context);
    }

    return registry;
}
