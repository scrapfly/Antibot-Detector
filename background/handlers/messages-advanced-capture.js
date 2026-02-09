/**
 * registerAdvancedCaptureHandlers registration.
 * Extracted from message-router switch cases for maintainability.
 */
function registerAdvancedCaptureHandlers(registry, context) {
    void context;

    const handle_recaptcha_start_capture = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
            if (typeof reCaptchaHandleMessage === 'function') {
                return reCaptchaHandleMessage(request, sendResponse, reCaptchaCaptureState);
            }
            return false;

        // Akamai messages - delegate to akamaiHandleMessage
    };
    registry['RECAPTCHA_START_CAPTURE'] = handle_recaptcha_start_capture;
    registry['RECAPTCHA_STOP_CAPTURE'] = handle_recaptcha_start_capture;
    registry['RECAPTCHA_GET_CAPTURE_STATE'] = handle_recaptcha_start_capture;
    registry['RECAPTCHA_GET_CAPTURE_RESULTS'] = handle_recaptcha_start_capture;

    const handle_akamai_start_capture = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
            if (typeof akamaiHandleMessage === 'function') {
                return akamaiHandleMessage(request, sendResponse);
            }
            return false;

        // Imperva messages - delegate to impervaHandleMessage
    };
    registry['AKAMAI_START_CAPTURE'] = handle_akamai_start_capture;
    registry['AKAMAI_STOP_CAPTURE'] = handle_akamai_start_capture;
    registry['AKAMAI_GET_CAPTURE_STATE'] = handle_akamai_start_capture;
    registry['AKAMAI_CAPTURE_COMPLETED'] = handle_akamai_start_capture;
    registry['AKAMAI_EXTRACT_SENSOR'] = handle_akamai_start_capture;
    registry['AKAMAI_EXTRACTION_COMPLETED'] = handle_akamai_start_capture;
    registry['AKAMAI_SHOW_ANALYZING_NOTIFICATION'] = handle_akamai_start_capture;
    registry['AKAMAI_SHOW_EXTRACTING_NOTIFICATION'] = handle_akamai_start_capture;

    const handle_imperva_start_capture = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
            if (typeof impervaHandleMessage === 'function') {
                return impervaHandleMessage(request, sendResponse);
            }
            return false;

        // Shape Security messages - delegate to shapeSecurityHandleMessage
    };
    registry['IMPERVA_START_CAPTURE'] = handle_imperva_start_capture;
    registry['IMPERVA_STOP_CAPTURE'] = handle_imperva_start_capture;
    registry['IMPERVA_EXTRACT_SCRIPTS'] = handle_imperva_start_capture;
    registry['IMPERVA_GET_CAPTURE_STATE'] = handle_imperva_start_capture;
    registry['IMPERVA_CAPTURE_COMPLETED'] = handle_imperva_start_capture;
    registry['IMPERVA_SHOW_ANALYZING_NOTIFICATION'] = handle_imperva_start_capture;

    const handle_shapesecurity_start_capture = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
            if (typeof shapeSecurityHandleMessage === 'function') {
                return shapeSecurityHandleMessage(request, sendResponse);
            }
            return false;

        // AWS WAF messages - delegate to handleAwsWafMessage
    };
    registry['SHAPESECURITY_START_CAPTURE'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_STOP_CAPTURE'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_GET_CAPTURE_STATE'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_CHECK_HEADERS'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_CHECK_COOKIES'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_CHECK_VERSION'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_ANALYZE_SCRIPTS'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_START_EXTRACTION'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_SHOW_ANALYZING_NOTIFICATION'] = handle_shapesecurity_start_capture;
    registry['SHAPESECURITY_EXTRACTION_COMPLETED'] = handle_shapesecurity_start_capture;

    const handle_awswaf_start_capture = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.1: Interceptor loaded via importScripts, no initialization needed
            if (typeof handleAwsWafMessage === 'function') {
                return handleAwsWafMessage(request, sender, sendResponse);
            }
            return false;

        // Geetest messages - delegate to geetestHandleMessage (simplified - no capture)
    };
    registry['AWSWAF_START_CAPTURE'] = handle_awswaf_start_capture;
    registry['AWSWAF_STOP_CAPTURE'] = handle_awswaf_start_capture;
    registry['AWSWAF_GET_STATE'] = handle_awswaf_start_capture;
    registry['AWSWAF_START_ANALYSIS'] = handle_awswaf_start_capture;
    registry['AWSWAF_SHOW_ANALYZING_NOTIFICATION'] = handle_awswaf_start_capture;

    const handle_geetest_check_version = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.1: Interceptor already loaded via importScripts (not lazy)
            if (typeof geetestHandleMessage === 'function') {
                return geetestHandleMessage(request, sender, sendResponse);
            }
            return false;

        // DataDome messages - delegate to handleDataDomeMessage
    };
    registry['GEETEST_CHECK_VERSION'] = handle_geetest_check_version;
    registry['GEETEST_ANALYZE_SCRIPTS'] = handle_geetest_check_version;
    registry['GEETEST_SHOW_VERSION_NOTIFICATION'] = handle_geetest_check_version;
    registry['GEETEST_SHOW_ANALYZING_NOTIFICATION'] = handle_geetest_check_version;

    const handle_datadome_start_analysis = function({ request, sender, sendResponse, context }) {
        void context;

            // OPTIMIZED 3.1: Interceptor loaded via importScripts, no initialization needed
            if (typeof handleDataDomeMessage === 'function') {
                return handleDataDomeMessage(request, sender, sendResponse);
            }
            return false;

        // Cloudflare messages
    };
    registry['DATADOME_START_ANALYSIS'] = handle_datadome_start_analysis;
    registry['DATADOME_SHOW_ANALYZING_NOTIFICATION'] = handle_datadome_start_analysis;

    const handle_cloudflare_start_analysis = function({ request, sender, sendResponse, context }) {
        void context;

            if (typeof handleCloudflareMessage === 'function') {
                return handleCloudflareMessage(request, sender, sendResponse);
            }
            return false;

        // Turnstile messages
    };
    registry['CLOUDFLARE_START_ANALYSIS'] = handle_cloudflare_start_analysis;
    registry['CLOUDFLARE_SHOW_ANALYZING_NOTIFICATION'] = handle_cloudflare_start_analysis;
    registry['CLOUDFLARE_CHECK_VERSION'] = handle_cloudflare_start_analysis;

    const handle_turnstile_start_analysis = function({ request, sender, sendResponse, context }) {
        void context;

            if (typeof handleTurnstileMessage === 'function') {
                return handleTurnstileMessage(request, sender, sendResponse);
            }
            return false;

        // hCaptcha messages
    };
    registry['TURNSTILE_START_ANALYSIS'] = handle_turnstile_start_analysis;
    registry['TURNSTILE_SHOW_ANALYZING_NOTIFICATION'] = handle_turnstile_start_analysis;

    const handle_hcaptcha_start_analysis = function({ request, sender, sendResponse, context }) {
        void context;

            if (typeof handleHCaptchaMessage === 'function') {
                return handleHCaptchaMessage(request, sender, sendResponse);
            }
            return false;

        // FunCaptcha messages
    };
    registry['HCAPTCHA_START_ANALYSIS'] = handle_hcaptcha_start_analysis;
    registry['HCAPTCHA_SHOW_ANALYZING_NOTIFICATION'] = handle_hcaptcha_start_analysis;
    registry['HCAPTCHA_SHOW_VERSION_NOTIFICATION'] = handle_hcaptcha_start_analysis;
    registry['HCAPTCHA_CHECK_VERSION'] = handle_hcaptcha_start_analysis;
    registry['HCAPTCHA_START_CAPTURE'] = handle_hcaptcha_start_analysis;
    registry['HCAPTCHA_STOP_CAPTURE'] = handle_hcaptcha_start_analysis;
    registry['HCAPTCHA_GET_CAPTURE_STATE'] = handle_hcaptcha_start_analysis;
    registry['HCAPTCHA_CAPTURE_COMPLETED'] = handle_hcaptcha_start_analysis;

    const handle_funcaptcha_start_analysis = function({ request, sender, sendResponse, context }) {
        void context;

            if (typeof handleFunCaptchaMessage === 'function') {
                return handleFunCaptchaMessage(request, sendResponse, funcaptchaCaptureState);
            }
            return false;

        // Log Collector messages
    };
    registry['FUNCAPTCHA_START_ANALYSIS'] = handle_funcaptcha_start_analysis;
    registry['FUNCAPTCHA_SHOW_ANALYZING_NOTIFICATION'] = handle_funcaptcha_start_analysis;
    registry['FUNCAPTCHA_START_CAPTURE'] = handle_funcaptcha_start_analysis;
    registry['FUNCAPTCHA_STOP_CAPTURE'] = handle_funcaptcha_start_analysis;
    registry['FUNCAPTCHA_GET_CAPTURE_STATE'] = handle_funcaptcha_start_analysis;
    registry['FUNCAPTCHA_CAPTURE_COMPLETED'] = handle_funcaptcha_start_analysis;

}
