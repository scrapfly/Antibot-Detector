/** Popup transport and subscription lifetime. Disposing UI never stops worker jobs. */
(function (global) {
    const subscriptions = new Set();
    function unsubscribe(listener) {
        chrome.runtime.onMessage.removeListener(listener);
        subscriptions.delete(listener);
    }
    function subscribe(listener) {
        if (!subscriptions.has(listener)) {
            subscriptions.add(listener);
            chrome.runtime.onMessage.addListener(listener);
        }
        return () => unsubscribe(listener);
    }
    function dispose() { for (const listener of Array.from(subscriptions)) unsubscribe(listener); }
    function send(message) {
        const vendorId = AdvancedVendorRegistry.canonical(String(message.type || '').split('_')[0].toLowerCase());
        const isAdvanced = Boolean(AdvancedVendorRegistry.vendors[vendorId]);
        const payload = isAdvanced ? { ...message, vendorId,
            operation: /CAPTURE/.test(message.type) ? 'capture' : 'analysis',
            requestId: message.requestId || AdvancedResultModel.requestId() } : message;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Advanced request timed out')), 35000);
            try {
                chrome.runtime.sendMessage(payload, response => {
                    clearTimeout(timer);
                    const error = chrome.runtime.lastError;
                    if (error) reject(new Error(error.message));
                    else resolve(response);
                });
            } catch (error) { clearTimeout(timer); reject(error); }
        });
    }
    global.addEventListener?.('pagehide', dispose);
    global.AdvancedToolClient = Object.freeze({ send, subscribe, unsubscribe, dispose });
})(window);
