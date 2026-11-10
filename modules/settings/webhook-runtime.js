/**
 * The webhook, on the sending side (the service worker): whether a page is sent, the send, and the record of what
 * happened. Extends SettingsRuntime: settings-runtime.js builds and sends one request (the Settings page uses it for
 * Test too); this file decides whether a page is sent at all and keeps the log of recent deliveries.
 * Requires settings-runtime.js, modules/core/domain-list.js, modules/core/webhook-filter.js, modules/core/webhook-log.js and
 * modules/core/webhook-retry.js.
 *
 * The log is kept in storage.local, where it outlives the browser, and it names pages: a line names none that History is told
 * to keep out (History paused, or an ignored site), and the worker forgets the whole log where it forgets History's own record
 * (background/history-retention.js: Clear on close, History emptied).
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
 * The saved settings, or null when they cannot be read (the storage did not answer, or what is stored is not settings).
 * Utils.getSettings answers {} then, and {} is "the webhook is off": a held delivery must not be let go for that.
 */
SettingsRuntime._readSettings = async function() {
    try {
        if (typeof StorageManager !== 'undefined' && typeof StorageManager.readSettingsStrict === 'function') return await StorageManager.readSettingsStrict();
        return await Utils.getSettings();
    } catch (_) {
        return null;
    }
};

/** Is this page one that History is told to keep out (History paused, or an ignored site or a subdomain of one)? */
SettingsRuntime._historyKeepsOut = function(settings, hostname) {
    const history = (settings && settings.history) || {};
    return history.historyEnabled === false || DomainList.matches(hostname, history.historyExcludedDomains);
};

// A failed delivery's page data, in memory only (storage.session: gone when the browser closes), so it can be retried:
// modules/core/webhook-retry.js says for how long, how many, and when. Never the address, headers or secret.
SettingsRuntime.WEBHOOK_HELD_KEY = 'session_webhook_held';
SettingsRuntime.WEBHOOK_RETRY_ALARM = 'scrapfly-webhook-retry';

let webhookHeldQueue = Promise.resolve();

/** Reads, changes and writes the held deliveries one at a time; `change(held)` returns the new map (or nothing to keep it). */
SettingsRuntime._changeHeld = function(change) {
    const run = async () => {
        const area = chrome.storage && chrome.storage.session;
        if (!area) return {};
        const stored = await area.get(SettingsRuntime.WEBHOOK_HELD_KEY);
        const before = WebhookRetry.prune(stored[SettingsRuntime.WEBHOOK_HELD_KEY], Date.now());
        const after = await change(before);
        if (after) await area.set({ [SettingsRuntime.WEBHOOK_HELD_KEY]: after });
        return after || before;
    };
    webhookHeldQueue = webhookHeldQueue.then(run, run);
    return webhookHeldQueue.catch(() => ({}));
};

/** The alarm follows the earliest automatic retry that is due (not sooner than `wait` ms from now). */
SettingsRuntime._scheduleWebhookRetries = async function(wait = 1000) {
    if (!chrome.alarms) return;
    try {
        const held = await SettingsRuntime._changeHeld(() => undefined);
        const next = WebhookRetry.nextDue(held, Date.now());
        if (next === null) await chrome.alarms.clear(SettingsRuntime.WEBHOOK_RETRY_ALARM);
        else chrome.alarms.create(SettingsRuntime.WEBHOOK_RETRY_ALARM, { when: Math.max(next, Date.now() + wait) });
    } catch (_) { /* the retries are a convenience: a failed alarm never affects a delivery */ }
};

/** One attempt: what came of it, never throwing. */
SettingsRuntime._deliverWebhook = async function(webhook, ctx) {
    const started = Date.now();
    try {
        const response = await SettingsRuntime.sendWebhook(webhook, ctx);
        return { started, ms: Date.now() - started, ok: response.ok === true, status: response.status };
    } catch (error) {
        return { started, ms: Date.now() - started, ok: false, error: WebhookLog.errorClassOf(error) };
    }
};

/** The log line of an attempt (never the address, headers or payload). */
SettingsRuntime._webhookAttemptEntry = function(page, result, trigger, extra = {}) {
    const entry = { t: result.started, page, outcome: result.ok ? 'sent' : 'failed', ms: result.ms, trigger, ...extra };
    if (result.status !== undefined && !result.error) entry.status = result.status;
    if (result.error) entry.error = result.error;
    return entry;
};

/**
 * A delivery that failed: its page data is held for a retry (when Retry failed deliveries is on and storage.session
 * exists), and the next automatic retry is planned.
 * @param {object} [held] the delivery as it was held, when this is a retry of it (it keeps what it was triggered by)
 * @param {'scan'|'cache'} [trigger] what sent the page (a first attempt)
 * @returns {Promise<{id?: string, retryAt?: number}>} what the log line should carry
 */
SettingsRuntime._holdFailedWebhook = async function(webhook, ctx, result, held, trigger) {
    if (!(chrome.storage && chrome.storage.session)) return {};
    if (webhook.webhookRetry === false) {
        // Retries were switched off after this delivery was held: it is let go, or its old due time would fire again and again
        if (held && held.id) await SettingsRuntime._changeHeld((all) => { delete all[held.id]; return all; });
        return {};
    }
    const now = Date.now();
    const id = held && held.id ? held.id : WebhookRetry.newId(now);
    const attempts = held ? held.attempts + 1 : 1;
    const due = WebhookRetry.schedule(attempts, now, true, WebhookRetry.isTransient(result));
    const kept = held && held.trigger ? held.trigger : trigger;
    await SettingsRuntime._changeHeld((all) => WebhookRetry.hold(all, { id, ctx, first: held ? held.first : result.started, attempts, due, trigger: kept }, now));
    await SettingsRuntime._scheduleWebhookRetries();
    return { id, ...(due ? { retryAt: due } : {}), attempt: attempts };
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
        const keptOut = SettingsRuntime._historyKeepsOut(settings, ctx.hostname);
        // What a line of the log may call the page: nothing, for a page History keeps out
        const page = keptOut ? '' : ctx.hostname;
        const decision = WebhookFilter.evaluate(detectionResults, ctx.hostname, WebhookFilter.settingsOf(webhook));
        if (!decision.send) {
            // A page that was not sent is a line about where the person goes and nothing else: none for a page History keeps out
            if (!keptOut) await SettingsRuntime.recordWebhookDelivery({ t: Date.now(), page, outcome: 'skipped', reason: decision.reason, trigger });
            return;
        }
        const result = await SettingsRuntime._deliverWebhook(webhook, ctx);
        // Held before it is recorded, so a Retry button never points at a delivery that is not held yet
        const extra = result.ok ? {} : await SettingsRuntime._holdFailedWebhook(webhook, ctx, result, undefined, trigger).catch(() => ({}));
        await SettingsRuntime.recordWebhookDelivery(SettingsRuntime._webhookAttemptEntry(page, result, trigger, extra));
        if (result.ok) Logger.network('Webhook sent successfully', { status: result.status });
        else if (result.error) Logger.error('NETWORK', 'Webhook could not be sent');
        else Logger.warn('NETWORK', 'Webhook returned non-OK status', { status: result.status });
    } catch (_) {
        Logger.error('NETWORK', 'Webhook could not be sent');
    }
};

/**
 * Sends a held failed delivery again now, from the current webhook settings, and records the attempt.
 * @param {string} id
 * @param {{manual?: boolean}} [options] - manual: the person pressed Retry (kept for another try when it fails again)
 * @returns {Promise<{status: 'sent'|'failed'|'gone'|'off'}>}
 */
/** How long a retry in flight keeps its delivery for itself (longer than any answer takes). */
SettingsRuntime.WEBHOOK_RETRY_CLAIM_MS = 60 * 1000;
/** How long the alarm waits to look again when the settings could not be read. */
SettingsRuntime.WEBHOOK_UNREADABLE_RETRY_MS = 60 * 1000;

/**
 * Why a held delivery is not sent any more, or null when it still goes out. The person may have narrowed "Send only when",
 * skipped the site, or turned off "Send on every page load" (for a page held for a cached result) while it waited.
 * @returns {Promise<null|{reason?: 'site'|'category'|'confidence', hidden?: boolean}>} reason: the filter's, for the record;
 *          hidden: the site is skipped, so no line names it
 */
SettingsRuntime._noLongerSent = async function(webhook, item) {
    const ctx = item.ctx;
    if (item.trigger === 'cache' && webhook.webhookOnCache !== true) return {};
    const decision = WebhookFilter.evaluate(ctx.detections, ctx.hostname, WebhookFilter.settingsOf(webhook));
    if (!decision.send) return { reason: decision.reason };
    if (await Utils.isUrlBlacklisted(ctx.url, { failClosed: true })) return { hidden: true };
    return null;
};

SettingsRuntime.retryWebhook = async function(id, options = {}) {
    const manual = options.manual === true;
    const settings = await SettingsRuntime._readSettings();
    // Settings that cannot be read are not "the webhook is off": nothing is sent and nothing is let go, the delivery stays held
    if (!settings) return { status: 'failed' };
    const webhook = settings.webhook || {};
    if (!webhook.enableWebhook || !webhook.webhookUrl) {
        let known = false;
        await SettingsRuntime._changeHeld((all) => {
            known = !!all[id];
            if (!known || manual) return undefined;
            delete all[id];
            return all;
        });
        return { status: known ? 'off' : 'gone' };
    }
    let item = null;
    let busy = false;
    // Claimed inside the queue: a Retry press and the alarm can never send the same delivery twice
    await SettingsRuntime._changeHeld((all) => {
        const held = all[id];
        if (!held) return undefined;
        if (typeof held.sending === 'number' && Date.now() - held.sending < SettingsRuntime.WEBHOOK_RETRY_CLAIM_MS) { busy = true; return undefined; }
        item = { ...held };
        // An automatic retry stays due once the claim has run out: a worker stopped while sending must not lose it
        all[id] = { ...held, sending: Date.now(), due: held.due ? Date.now() + SettingsRuntime.WEBHOOK_RETRY_CLAIM_MS : null };
        return all;
    });
    if (busy) return { status: 'busy' };
    if (!item) return { status: 'gone' };
    // What the person changed while it was held still applies: a page the webhook would not send now is let go, not sent
    const why = await SettingsRuntime._noLongerSent(webhook, item);
    if (why) {
        await SettingsRuntime._changeHeld((all) => { delete all[id]; return all; });
        const hostname = item.ctx.hostname || '';
        if (!why.hidden && !SettingsRuntime._historyKeepsOut(settings, hostname)) {
            await SettingsRuntime.recordWebhookDelivery({ t: Date.now(), page: hostname, outcome: 'skipped', trigger: 'retry', attempt: item.attempts + 1, ...(why.reason ? { reason: why.reason } : {}) });
        }
        await SettingsRuntime._scheduleWebhookRetries();
        return { status: 'gone' };
    }
    // The alarm that started an automatic retry has fired: arm the next one for when the claim runs out, so a worker
    // stopped while sending is not the end of this delivery
    await SettingsRuntime._scheduleWebhookRetries();
    const result = await SettingsRuntime._deliverWebhook(webhook, item.ctx);
    const page = SettingsRuntime._historyKeepsOut(settings, item.ctx.hostname || '') ? '' : (item.ctx.hostname || '');
    let extra = { attempt: item.attempts + 1 };
    if (result.ok) {
        await SettingsRuntime._changeHeld((all) => { delete all[id]; return all; });
    } else {
        const held = await SettingsRuntime._holdFailedWebhook(webhook, item.ctx, result, item).catch(() => ({}));
        extra = { ...extra, ...held };
    }
    await SettingsRuntime.recordWebhookDelivery(SettingsRuntime._webhookAttemptEntry(page, result, 'retry', extra));
    await SettingsRuntime._scheduleWebhookRetries();
    return { status: result.ok ? 'sent' : 'failed' };
};

/** The alarm: every held delivery whose automatic retry is due, one after the other. */
SettingsRuntime.runDueWebhookRetries = async function() {
    // The extension is switched off: it sends nothing (a held delivery waits, and goes with its hour if it stays off)
    if (typeof isExtensionEnabled === 'function' && !(await isExtensionEnabled())) {
        // The alarm that brought us here is a one-shot and has fired: without a new one, switching the extension back on
        // within the hour would leave the held deliveries with no alarm until the worker next starts
        await SettingsRuntime._scheduleWebhookRetries(SettingsRuntime.WEBHOOK_UNREADABLE_RETRY_MS);
        return;
    }
    const settings = await SettingsRuntime._readSettings();
    if (!settings) {
        // The settings cannot be read, which is not "everything is off": the held deliveries wait, and the alarm looks again in a minute
        await SettingsRuntime._scheduleWebhookRetries(SettingsRuntime.WEBHOOK_UNREADABLE_RETRY_MS);
        return;
    }
    if ((settings.webhook || {}).webhookRetry === false) {
        // Switched off: nothing more is retried, and nothing is kept for it
        await SettingsRuntime._changeHeld(() => ({}));
        await SettingsRuntime._scheduleWebhookRetries();
        return;
    }
    let ids = [];
    await SettingsRuntime._changeHeld((all) => { ids = WebhookRetry.dueIds(all, Date.now()); return undefined; });
    for (const id of ids) {
        try { await SettingsRuntime.retryWebhook(id, { manual: false }); } catch (_) { /* the next one still runs */ }
    }
    await SettingsRuntime._scheduleWebhookRetries();
};

/** Registered in the worker's first turn (background/init.js). */
SettingsRuntime.initWebhookRetries = function() {
    if (SettingsRuntime._retriesInitialized || !chrome.alarms || !chrome.alarms.onAlarm) return;
    SettingsRuntime._retriesInitialized = true;
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm && alarm.name === SettingsRuntime.WEBHOOK_RETRY_ALARM) SettingsRuntime.runDueWebhookRetries().catch(() => {});
    });
    // A delivery held by the worker before this one (due, but its alarm gone) gets its alarm again
    Promise.resolve().then(() => SettingsRuntime._scheduleWebhookRetries()).catch(() => {});
};
