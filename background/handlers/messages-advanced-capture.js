/**
 * registerAdvancedCaptureHandlers registration.
 * Uses canonical AdvancedMessageTypes + declarative handler groups.
 */

function getAdvancedCaptureMessageTypes() {
    if (typeof AdvancedMessageTypes !== 'undefined' && AdvancedMessageTypes) {
        return AdvancedMessageTypes;
    }

    Logger.error('BACKGROUND', '[AdvancedCapture] AdvancedMessageTypes is not loaded');
    return {};
}

function buildAdvancedCaptureRegistryMap(handlers, messageTypes) {
    return [
        {
            handler: handlers.recaptcha,
            messageKeys: [
                messageTypes.RECAPTCHA_START_CAPTURE,
                messageTypes.RECAPTCHA_STOP_CAPTURE,
                messageTypes.RECAPTCHA_GET_CAPTURE_STATE
            ]
        },
        {
            handler: handlers.akamai,
            messageKeys: [
                messageTypes.AKAMAI_START_CAPTURE,
                messageTypes.AKAMAI_STOP_CAPTURE,
                messageTypes.AKAMAI_GET_CAPTURE_STATE,
                messageTypes.AKAMAI_CAPTURE_COMPLETED,
                messageTypes.AKAMAI_EXTRACT_SENSOR
            ]
        },
        {
            handler: handlers.imperva,
            messageKeys: [
                messageTypes.IMPERVA_START_CAPTURE,
                messageTypes.IMPERVA_STOP_CAPTURE,
                messageTypes.IMPERVA_EXTRACT_SCRIPTS,
                messageTypes.IMPERVA_GET_CAPTURE_STATE,
                messageTypes.IMPERVA_CAPTURE_COMPLETED
            ]
        },
        {
            handler: handlers.shapesecurity,
            messageKeys: [
                messageTypes.SHAPESECURITY_START_CAPTURE,
                messageTypes.SHAPESECURITY_STOP_CAPTURE,
                messageTypes.SHAPESECURITY_GET_CAPTURE_STATE,
                messageTypes.SHAPESECURITY_CHECK_VERSION,
                messageTypes.SHAPESECURITY_START_EXTRACTION
            ]
        },
        {
            handler: handlers.awswaf,
            messageKeys: [
                messageTypes.AWSWAF_START_ANALYSIS
            ]
        },
        {
            handler: handlers.geetest,
            messageKeys: [
                messageTypes.GEETEST_CHECK_VERSION,
                messageTypes.GEETEST_ANALYZE_SCRIPTS
            ]
        },
        {
            handler: handlers.datadome,
            messageKeys: [
                messageTypes.DATADOME_START_ANALYSIS
            ]
        },
        {
            handler: handlers.cloudflare,
            messageKeys: [
                messageTypes.CLOUDFLARE_START_ANALYSIS
            ]
        },
        {
            handler: handlers.turnstile,
            messageKeys: [
                messageTypes.TURNSTILE_START_ANALYSIS
            ]
        },
        {
            handler: handlers.hcaptcha,
            messageKeys: [
                messageTypes.HCAPTCHA_START_ANALYSIS,
                messageTypes.HCAPTCHA_CHECK_VERSION,
                messageTypes.HCAPTCHA_START_CAPTURE,
                messageTypes.HCAPTCHA_STOP_CAPTURE,
                messageTypes.HCAPTCHA_GET_CAPTURE_STATE,
                messageTypes.HCAPTCHA_CAPTURE_COMPLETED
            ]
        },
        {
            handler: handlers.funcaptcha,
            messageKeys: [
                messageTypes.FUNCAPTCHA_START_ANALYSIS,
                messageTypes.FUNCAPTCHA_START_CAPTURE,
                messageTypes.FUNCAPTCHA_STOP_CAPTURE,
                messageTypes.FUNCAPTCHA_GET_CAPTURE_STATE,
                messageTypes.FUNCAPTCHA_CAPTURE_COMPLETED
            ]
        },
        // CAPTCHA vendors described as data: one Analyze Scripts message each
        ...((typeof AdvancedCaptchaVendors !== 'undefined' && AdvancedCaptchaVendors.list) || [])
            .filter(vendor => Array.isArray(vendor.scripts) && messageTypes[`${vendor.vendorId.toUpperCase()}_START_ANALYSIS`])
            .map(vendor => ({ handler: handlers.captcha, messageKeys: [messageTypes[`${vendor.vendorId.toUpperCase()}_START_ANALYSIS`]] }))
    ];
}

function registerAdvancedCaptureHandlers(registry, context) {
    void context;

    const handleRecaptcha = function({ request, sendResponse }) {
        if (typeof reCaptchaHandleMessage === 'function') {
            return reCaptchaHandleMessage(request, sendResponse, reCaptchaCaptureState);
        }
        return false;
    };

    const handleAkamai = function({ request, sendResponse }) {
        if (typeof akamaiHandleMessage === 'function') {
            return akamaiHandleMessage(request, sendResponse);
        }
        return false;
    };

    const handleImperva = function({ request, sendResponse }) {
        if (typeof impervaHandleMessage === 'function') {
            return impervaHandleMessage(request, sendResponse);
        }
        return false;
    };

    const handleShapeSecurity = function({ request, sendResponse }) {
        if (typeof shapeSecurityHandleMessage === 'function') {
            return shapeSecurityHandleMessage(request, sendResponse, shapesecurityCaptureState, shapeSecurityExtractionState);
        }
        return false;
    };

    const handleAwsWaf = function({ request, sender, sendResponse }) {
        if (typeof handleAwsWafMessage === 'function') {
            return handleAwsWafMessage(request, sender, sendResponse);
        }
        return false;
    };

    const handleGeetest = function({ request, sender, sendResponse }) {
        if (typeof geetestHandleMessage === 'function') {
            return geetestHandleMessage(request, sender, sendResponse);
        }
        return false;
    };

    const handleDataDome = function({ request, sender, sendResponse }) {
        if (typeof handleDataDomeMessage === 'function') {
            return handleDataDomeMessage(request, sender, sendResponse);
        }
        return false;
    };

    const handleCloudflare = function({ request, sender, sendResponse }) {
        if (typeof handleCloudflareMessage === 'function') {
            return handleCloudflareMessage(request, sender, sendResponse);
        }
        return false;
    };

    const handleTurnstile = function({ request, sender, sendResponse }) {
        if (typeof handleTurnstileMessage === 'function') {
            return handleTurnstileMessage(request, sender, sendResponse);
        }
        return false;
    };

    const handleHCaptcha = function({ request, sender, sendResponse }) {
        if (typeof handleHCaptchaMessage === 'function') {
            return handleHCaptchaMessage(request, sender, sendResponse, hcaptchaCaptureState);
        }
        return false;
    };

    const handleCaptcha = function({ request, sendResponse }) {
        if (typeof AdvancedCaptchaAnalysis !== 'undefined') {
            return AdvancedCaptchaAnalysis.handle(request, sendResponse);
        }
        return false;
    };

    const handleFunCaptcha = function({ request, sendResponse }) {
        if (typeof handleFunCaptchaMessage === 'function') {
            return handleFunCaptchaMessage(request, sendResponse, funcaptchaCaptureState);
        }
        return false;
    };

    const messageTypes = getAdvancedCaptureMessageTypes();
    if (Object.keys(messageTypes).length === 0) {
        return;
    }

    registry[messageTypes.ADVANCED_PAGE_NOTICE] = ({ request, sender, sendResponse }) => {
        if (sender?.tab || !Number.isInteger(request.tabId)) {
            sendResponse({ status: 'error', error: 'Invalid Advanced notice request' });
            return false;
        }
        showNotification(request.tabId, request.options || {})
            .then(() => sendResponse({ status: 'ok' }))
            .catch(error => sendResponse({ status: 'error', error: error.message }));
        return true;
    };

    registry[messageTypes.ADVANCED_HISTORY] = ({ request, sender, sendResponse }) => {
        // This channel handles extension UI data, never page/content-script requests.
        if (sender?.tab) {
            sendResponse({ status: 'error', error: 'Advanced history is available only to extension pages' });
            return false;
        }
        const methods = ['load', 'getModule', 'appendCapture', 'deleteCapture', 'clear', 'pruneExpired'];
        if (!methods.includes(request.method) || !Array.isArray(request.args)) {
            sendResponse({ status: 'error', error: 'Invalid Advanced history operation' });
            return false;
        }
        Promise.resolve().then(() => AdvancedHistoryStore[request.method](...request.args))
            .then(data => sendResponse({ status: 'ok', data }))
            .catch(error => sendResponse({ status: 'error', error: error.message }));
        return true;
    };

    const groupedHandlers = buildAdvancedCaptureRegistryMap({
        recaptcha: handleRecaptcha,
        akamai: handleAkamai,
        imperva: handleImperva,
        shapesecurity: handleShapeSecurity,
        awswaf: handleAwsWaf,
        geetest: handleGeetest,
        datadome: handleDataDome,
        cloudflare: handleCloudflare,
        turnstile: handleTurnstile,
        hcaptcha: handleHCaptcha,
        funcaptcha: handleFunCaptcha,
        captcha: handleCaptcha
    }, messageTypes);

    const captureStores = {
        recaptcha: () => reCaptchaCaptureState,
        akamai: () => akamaiCaptureState,
        imperva: () => impervaCaptureState,
        shapesecurity: () => shapesecurityCaptureState,
        hcaptcha: () => hcaptchaCaptureState,
        funcaptcha: () => funcaptchaCaptureState
    };
    const pendingCaptureStarts = new Map();
    groupedHandlers.forEach(({ handler, messageKeys }) => {
        messageKeys.forEach((messageKey) => {
            registry[messageKey] = args => {
                const { request, sendResponse } = args;
                const vendorId = messageKey.split('_')[0].toLowerCase();
                if (!messageKey.endsWith('_START_CAPTURE') || !captureStores[vendorId]) {
                    const captureJob = AdvancedJobManager.current(request.tabId, vendorId);
                    const identity = /CAPTURE/.test(messageKey)
                        ? AdvancedJobManager.state(request.tabId, vendorId, 'capture') : null;
                    return handler({ ...args, sendResponse(response) {
                        if (messageKey.endsWith('_STOP_CAPTURE') && ['stopped', 'not_capturing', 'no_capture'].includes(response?.status)) {
                            captureJob?.finish('completed');
                        }
                        sendResponse({ ...response, ...(identity ? {
                            requestId: identity.requestId, tabId: identity.tabId,
                            vendorId: identity.vendorId, operation: identity.operation
                        } : {}) });
                    } });
                }
                const pendingKey = `${request.tabId}:${vendorId}`;
                if (pendingCaptureStarts.get(pendingKey)?.finished) {
                    sendResponse({ status: 'error', error: 'Previous capture is stopping. Retry shortly.' });
                    return false;
                }
                try {
                    const { job, reused } = AdvancedJobManager.begin({
                        tabId: request.tabId, vendorId, operation: 'capture', url: request.url,
                        requestId: request.requestId
                    });
                    if (reused) {
                        sendResponse({ ...AdvancedJobManager.snapshot(job), status: 'already_capturing' });
                        return false;
                    }
                    pendingCaptureStarts.set(pendingKey, job);
                    return handler({ ...args, sendResponse(response) {
                        pendingCaptureStarts.delete(pendingKey);
                        if (response?.status === 'error') job.finish('failed');
                        const store = captureStores[vendorId]();
                        const state = store?.get(request.tabId);
                        if (state) {
                            job.url = job.url || state.captureUrl;
                            AdvancedJobManager.bindCaptureState(state, job);
                            job.addCleanup(() => {
                                if (store.get(request.tabId) === state) removeCaptureState(store, request.tabId);
                                cleanupManagedListeners(request.tabId, vendorId);
                            });
                        }
                        if (job.finished && response?.status !== 'error') {
                            sendResponse({ ...AdvancedJobManager.snapshot(job), status: 'error', error: 'Capture cancelled' });
                            return;
                        }
                        sendResponse({ ...response, requestId: job.requestId, tabId: job.tabId,
                            vendorId: job.vendorId, operation: job.operation });
                    } });
                } catch (error) {
                    pendingCaptureStarts.delete(pendingKey);
                    AdvancedJobManager.current(request.tabId, vendorId)?.finish('failed');
                    sendResponse({ status: 'error', error: error.message });
                    return false;
                }
            };
        });
    });
}
