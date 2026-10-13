/** Popup history facade. Only the service worker may mutate Advanced history. */
(function (global) {
    function call(method, args = []) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: AdvancedMessageTypes.ADVANCED_HISTORY, method, args }, response => {
                const error = chrome.runtime.lastError;
                if (error || !response || response.status !== 'ok') {
                    reject(new Error(error?.message || response?.error || 'Advanced history unavailable'));
                    return;
                }
                resolve(response.data);
            });
        });
    }
    global.AdvancedHistoryStore = Object.freeze({
        STORAGE_KEY: 'scrapfly_advanced_history',
        load: (...args) => call('load', args),
        getModule: (...args) => call('getModule', args),
        appendCapture: (...args) => call('appendCapture', args),
        deleteCapture: (...args) => call('deleteCapture', args),
        clear: (...args) => call('clear', args),
        pruneExpired: () => call('pruneExpired')
    });
})(window);
