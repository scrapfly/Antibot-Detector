/**
 * The webhook, on the sending side (the service worker): whether a page is sent, the send, and the record of what
 * happened. Extends SettingsRuntime: settings-runtime.js builds and sends one request (the Settings page uses it for
 * Test too); this file decides whether a page is sent at all and keeps the log of recent deliveries.
 * Requires settings-runtime.js, modules/core/webhook-filter.js and modules/core/webhook-log.js.
 */

SettingsRuntime.WEBHOOK_LOG_KEY = 'scrapfly_webhook_log';

// Attempts finish in any order and the log is read, extended and written: one at a time
let webhookLogQueue = Promise.resolve();

/** Adds a line to the record of recent deliveries (never an address, header or payload: see WebhookLog). */
SettingsRuntime.recordWebhookDelivery = function(entry) {
    const write = async () => {
        try {
            const key = SettingsRuntime.WEBHOOK_LOG_KEY;
            const stored = await chrome.storage.local.get(key);
            await chrome.storage.local.set({ [key]: WebhookLog.append(stored[key], entry) });
        } catch (_) { /* the record is a convenience: a failed write never affects a delivery */ }
    };
    webhookLogQueue = webhookLogQueue.then(write, write);
    return webhookLogQueue;
};

SettingsRuntime.clearWebhookLog = function() {
    const clear = async () => { await chrome.storage.local.remove(SettingsRuntime.WEBHOOK_LOG_KEY); };
    webhookLogQueue = webhookLogQueue.then(clear, clear);
    return webhookLogQueue;
};

/**
 * Sends the page to the webhook when it is on and the page passes the filter, and records what happened.
 * @param {object} pageData            { url, hostname, title, favicon }
 * @param {Array<object>} detectionResults  the finished results of the page
 * @param {{trigger?: 'scan'|'cache'}} [options]  a page whose result came from the cache is sent only when
 *        "Send on every page load" is on
 */
SettingsRuntime.sendWebhookIfEnabled = async function(pageData, detectionResults, options = {}) {
    const trigger = options.trigger === 'cache' ? 'cache' : 'scan';
    try {
        const settings = await Utils.getSettings();
        const webhook = settings.webhook || {};
        if (!webhook.enableWebhook || !webhook.webhookUrl) return;
        if (trigger === 'cache' && webhook.webhookOnCache !== true) return;
        const ctx = SettingsRuntime._buildWebhookContext(pageData, detectionResults);
        const page = ctx.hostname;
        const decision = WebhookFilter.evaluate(detectionResults, page, WebhookFilter.settingsOf(webhook));
        if (!decision.send) {
            await SettingsRuntime.recordWebhookDelivery({ t: Date.now(), page, outcome: 'skipped', reason: decision.reason, trigger });
            return;
        }
        const started = Date.now();
        try {
            const response = await SettingsRuntime.sendWebhook(webhook, ctx);
            await SettingsRuntime.recordWebhookDelivery({ t: started, page, outcome: response.ok ? 'sent' : 'failed', status: response.status, ms: Date.now() - started, trigger });
            if (response.ok) Logger.network('Webhook sent successfully', { status: response.status });
            else Logger.warn('NETWORK', 'Webhook returned non-OK status', { status: response.status });
        } catch (error) {
            await SettingsRuntime.recordWebhookDelivery({ t: started, page, outcome: 'failed', error: WebhookLog.errorClassOf(error), ms: Date.now() - started, trigger });
            throw error;
        }
    } catch (_) {
        Logger.error('NETWORK', 'Webhook could not be sent');
    }
};
