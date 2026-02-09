/**
 * Background message routing and handlers.
 * Dispatcher-based registry implementation.
 */

let __messageHandlerRegistry = null;
let __messageHandlerContext = null;

function buildMessageHandlerContext() {
    return {
        chrome,
        Logger,
        Utils,
        Settings,
        CategoryManager,
        History,
        DetectionEngineManager,
        logCollector: typeof logCollector !== 'undefined' ? logCollector : undefined,
        categoryManager: typeof categoryManager !== 'undefined' ? categoryManager : undefined,
        detectorManager: typeof detectorManager !== 'undefined' ? detectorManager : undefined,
        recentDetectionRequests: typeof recentDetectionRequests !== 'undefined' ? recentDetectionRequests : undefined,
        interruptedDetections: typeof interruptedDetections !== 'undefined' ? interruptedDetections : undefined,
        detectionStates: typeof detectionStates !== 'undefined' ? detectionStates : undefined,
        headersStore: typeof headersStore !== 'undefined' ? headersStore : undefined,
        requestHeadersStore: typeof requestHeadersStore !== 'undefined' ? requestHeadersStore : undefined,
        responseCookiesStore: typeof responseCookiesStore !== 'undefined' ? responseCookiesStore : undefined,
        payloadStore: typeof payloadStore !== 'undefined' ? payloadStore : undefined,
        networkUrlsStore: typeof networkUrlsStore !== 'undefined' ? networkUrlsStore : undefined,
        activeDetections: typeof activeDetections !== 'undefined' ? activeDetections : undefined,
        tabsUsingCache: typeof tabsUsingCache !== 'undefined' ? tabsUsingCache : undefined,
        ensureDetectorManagerInitialized: typeof ensureDetectorManagerInitialized !== 'undefined' ? ensureDetectorManagerInitialized : undefined,
        processDetectionData: typeof processDetectionData !== 'undefined' ? processDetectionData : undefined,
        checkAndFinalizeDetection: typeof checkAndFinalizeDetection !== 'undefined' ? checkAndFinalizeDetection : undefined,
        markMethodComplete: typeof markMethodComplete !== 'undefined' ? markMethodComplete : undefined
    };
}

function setupMessageListeners() {
    if (!__messageHandlerContext) {
        __messageHandlerContext = buildMessageHandlerContext();
    }
    if (!__messageHandlerRegistry) {
        __messageHandlerRegistry = buildMessageHandlerRegistry(__messageHandlerContext);
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (!request || !request.type) {
            sendResponse({ status: 'error', error: 'Invalid message' });
            return false;
        }

        const handler = __messageHandlerRegistry[request.type];
        if (!handler) {
            Logger.background('Scrapfly Background: Unknown message type:', request.type);
            return unknownType(sendResponse);
        }

        try {
            const result = handler({
                request,
                sender,
                sendResponse,
                context: __messageHandlerContext
            });
            return result === true;
        } catch (error) {
            Logger.error('BACKGROUND', '[Router] Unhandled message handler error:', error);
            return fail(sendResponse, error);
        }
    });
}
