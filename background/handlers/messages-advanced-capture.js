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
                messageTypes.RECAPTCHA_GET_CAPTURE_STATE,
                messageTypes.RECAPTCHA_GET_CAPTURE_RESULTS
            ]
        },
        {
            handler: handlers.akamai,
            messageKeys: [
                messageTypes.AKAMAI_START_CAPTURE,
                messageTypes.AKAMAI_STOP_CAPTURE,
                messageTypes.AKAMAI_GET_CAPTURE_STATE,
                messageTypes.AKAMAI_CAPTURE_COMPLETED,
                messageTypes.AKAMAI_EXTRACT_SENSOR,
                messageTypes.AKAMAI_EXTRACTION_COMPLETED,
                messageTypes.AKAMAI_SHOW_ANALYZING_NOTIFICATION,
                messageTypes.AKAMAI_SHOW_EXTRACTING_NOTIFICATION
            ]
        },
        {
            handler: handlers.imperva,
            messageKeys: [
                messageTypes.IMPERVA_START_CAPTURE,
                messageTypes.IMPERVA_STOP_CAPTURE,
                messageTypes.IMPERVA_EXTRACT_SCRIPTS,
                messageTypes.IMPERVA_GET_CAPTURE_STATE,
                messageTypes.IMPERVA_CAPTURE_COMPLETED,
                messageTypes.IMPERVA_SHOW_ANALYZING_NOTIFICATION
            ]
        },
        {
            handler: handlers.shapesecurity,
            messageKeys: [
                messageTypes.SHAPESECURITY_START_CAPTURE,
                messageTypes.SHAPESECURITY_STOP_CAPTURE,
                messageTypes.SHAPESECURITY_GET_CAPTURE_STATE,
                messageTypes.SHAPESECURITY_CHECK_HEADERS,
                messageTypes.SHAPESECURITY_CHECK_COOKIES,
                messageTypes.SHAPESECURITY_CHECK_VERSION,
                messageTypes.SHAPESECURITY_ANALYZE_SCRIPTS,
                messageTypes.SHAPESECURITY_START_EXTRACTION,
                messageTypes.SHAPESECURITY_SHOW_ANALYZING_NOTIFICATION,
                messageTypes.SHAPESECURITY_EXTRACTION_COMPLETED
            ]
        },
        {
            handler: handlers.awswaf,
            messageKeys: [
                messageTypes.AWSWAF_START_CAPTURE,
                messageTypes.AWSWAF_STOP_CAPTURE,
                messageTypes.AWSWAF_GET_STATE,
                messageTypes.AWSWAF_START_ANALYSIS,
                messageTypes.AWSWAF_SHOW_ANALYZING_NOTIFICATION
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
                messageTypes.DATADOME_START_ANALYSIS,
                messageTypes.DATADOME_SHOW_ANALYZING_NOTIFICATION
            ]
        },
        {
            handler: handlers.cloudflare,
            messageKeys: [
                messageTypes.CLOUDFLARE_START_ANALYSIS,
                messageTypes.CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION,
                messageTypes.CLOUDFLARE_CHECK_VERSION
            ]
        },
        {
            handler: handlers.turnstile,
            messageKeys: [
                messageTypes.TURNSTILE_START_ANALYSIS,
                messageTypes.TURNSTILE_SHOW_ANALYZING_NOTIFICATION
            ]
        },
        {
            handler: handlers.hcaptcha,
            messageKeys: [
                messageTypes.HCAPTCHA_START_ANALYSIS,
                messageTypes.HCAPTCHA_SHOW_ANALYZING_NOTIFICATION,
                messageTypes.HCAPTCHA_SHOW_VERSION_NOTIFICATION,
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
                messageTypes.FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION,
                messageTypes.FUNCAPTCHA_START_CAPTURE,
                messageTypes.FUNCAPTCHA_STOP_CAPTURE,
                messageTypes.FUNCAPTCHA_GET_CAPTURE_STATE,
                messageTypes.FUNCAPTCHA_CAPTURE_COMPLETED
            ]
        }
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
            return handleAwsWafMessage(request, sender, sendResponse, awsWafCaptureState);
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
        funcaptcha: handleFunCaptcha
    }, messageTypes);

    groupedHandlers.forEach(({ handler, messageKeys }) => {
        messageKeys.forEach((messageKey) => {
            registry[messageKey] = handler;
        });
    });
}

