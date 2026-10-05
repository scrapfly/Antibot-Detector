/**
 * Background message handler registry.
 */
function buildMessageHandlerRegistry(context) {
    const registry = {};

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
    // History writes (delete / import / clear) from the popup: the worker is the only writer
    if (typeof HistoryStore !== 'undefined') {
        HistoryStore.registerHandlers(registry);
    }

    return registry;
}
