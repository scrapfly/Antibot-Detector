/**
 * Shared router response helpers.
 */
function fail(sendResponse, error, extra = {}) {
    const message = error && error.message ? error.message : String(error);
    sendResponse({ status: 'error', error: message, ...extra });
    return false;
}

function unknownType(sendResponse) {
    sendResponse({ status: 'unknown' });
    return false;
}
