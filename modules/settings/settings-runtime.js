/**
 * Settings runtime-safe static APIs for background/content/popup.
 * Dependencies: `Settings` class compatibility wrappers call this registry.
 */
const SettingsRuntime = (typeof self !== 'undefined' && self.SettingsRuntime) ? self.SettingsRuntime : {};

SettingsRuntime.loadToggleState = async function(toggle) {
    if (!toggle) return;

    try {
      const result = await chrome.storage.local.get(['scrapfly_enabled']);
      const isEnabled = result.scrapfly_enabled !== false; // Default to true
      toggle.checked = isEnabled;
      Logger.debug('UI', 'Toggle state loaded:', isEnabled);
    } catch (error) {
      Logger.error('UI', 'Failed to load toggle state:', error);
      toggle.checked = true; // Default to enabled on error
    }
};

SettingsRuntime.loadAndApplyDefaultTab = async function(switchTabCallback) {
    try {
      const settings = await Utils.getSettings();
      const defaultTab = settings.defaultTab || 'detection';
      switchTabCallback(defaultTab);
    } catch (error) {
      Logger.error('UI', 'Failed to load default tab:', error);
      switchTabCallback('detection'); // Fallback to detection tab
    }
};

SettingsRuntime.handleEnableToggle = async function(enabled, context = null) {
    try {
      const hasBackgroundContext = context && context.DetectionEngineManager && context.CategoryManager && context.categoryManager;

      await chrome.storage.local.set({ scrapfly_enabled: enabled });
      Logger.ui('Extension enabled state updated:', enabled);

      if (!hasBackgroundContext) {
        chrome.runtime.sendMessage({
          type: WorkerMessages.EXTENSION_TOGGLE_CHANGED,
          enabled: enabled
        }).catch(() => {});
      }

      // Restore badges for ALL tabs when re-enabling extension
      if (enabled) {
        // Only restore badges when we have background context (DetectionEngineManager, etc.).
        // In popup context (!hasBackgroundContext), skip — background handles it via EXTENSION_TOGGLE_CHANGED.
        // Without this guard, popup sets all badges to EMPTY which races with background's restore.
        if (hasBackgroundContext) {
          const badgeColors = await context.CategoryManager.getBadgeColors();
          const tabs = await chrome.tabs.query({});

          for (const tab of tabs) {
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
              continue;
            }
            try {
              if (await Utils.isUrlBlacklisted(tab.url)) {
                await setPausedIcon(tab.id, true);
                await setBadgeTextColor(tab.id, true);
                await Promise.all([
                  chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId: tab.id }),
                  chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId: tab.id })
                ]);
                if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.apply(chrome, tab.id, 'skipped');
                continue;
              }
              await setPausedIcon(tab.id, false);
              const storedData = await context.DetectionEngineManager.getStoredDetection(tab.url, { privateWindow: tab.incognito === true });
              if (storedData && storedData.detectionCount > 0) {
                const detections = Array.isArray(storedData.detectionResults) ? storedData.detectionResults : [];
                const color = DetectionUtils.getBadgeColor(detections, badgeColors);
                await setBadgeTextColor(tab.id, false, color);
                chrome.action.setBadgeText({ text: storedData.detectionCount.toString(), tabId: tab.id }).catch(() => {});
                chrome.action.setBadgeBackgroundColor({ color, tabId: tab.id }).catch(() => {});
                if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.apply(chrome, tab.id, 'found', detections);
              } else {
                chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: tab.id }).catch(() => {});
                if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.reset(chrome, tab.id);
              }
            } catch (e) {
              // Tab might be closing
            }
          }
        }
      } else {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          await setPausedIcon(tab.id, false);
          await setBadgeTextColor(tab.id, false, BADGE.COLORS.DISABLED);
          chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tab.id }).catch((error) => {
            Logger.debug('UI', `[Settings] Failed to set disabled badge for tab ${tab.id}:`, error.message);
          });
          chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tab.id }).catch((error) => {
            Logger.debug('UI', `[Settings] Failed to set badge color for tab ${tab.id}:`, error.message);
          });
          if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.apply(chrome, tab.id, 'off');
        }
      }
    } catch (error) {
      Logger.error('UI', 'Failed to handle toggle:', error);
      throw error;
    }
};

SettingsRuntime.handleSettingsUpdated = async function(context, sendResponse) {
    try {
      const { chrome, CategoryManager, categoryManager } = context;

      if (categoryManager) {
        await categoryManager.loadFromStorage();
      }

      // The blacklist may have changed in Settings: resync the paused icon so an
      // unblocked tab drops the pause tile right away (and a newly blocked one gets
      // it). Badge text follows on the next detection or page load.
      await SettingsRuntime.syncPausedIcons();

      sendResponse({ status: 'success' });
    } catch (error) {
      Logger.error('UI', 'Failed to handle settings update:', error);
      sendResponse({ status: 'error', error: error.message });
    }
};

SettingsRuntime.syncPausedIcons = async function() {
    try {
      const { scrapfly_enabled: enabled } = await chrome.storage.local.get('scrapfly_enabled');
      const tabs = await chrome.tabs.query({});
      for (const tab of tabs) {
        if (!tab.url || !/^https?:/i.test(tab.url)) continue;
        const paused = enabled !== false && await Utils.isUrlBlacklisted(tab.url);
        await setPausedIcon(tab.id, paused);
        if (paused) {
          await setBadgeTextColor(tab.id, true);
          await Promise.all([
            chrome.action.setBadgeText({ text: BADGE.TEXT.BLACKLISTED, tabId: tab.id }),
            chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.BLACKLISTED, tabId: tab.id })
          ]).catch(() => {});
          if (typeof ToolbarTitle !== 'undefined') ToolbarTitle.apply(chrome, tab.id, 'skipped');
        }
      }
    } catch (error) {
      Logger.warn('UI', '[Settings] Paused icon sync failed:', error);
    }
};

// SSRF guard for the user-supplied webhook URL. Blocks anything that's not
// HTTPS to a publicly-routable host so a hostile/misconfigured webhook URL
// can't probe the user's LAN, AWS metadata service, etc.
//
// Note: this is a static check at validation time — Chrome's fetch() doesn't
// expose a resolve-then-connect API, so a DNS-rebinding host that resolves
// publicly here and privately at fetch time can still slip through. The
// `redirect: 'error'` flag in the fetch options prevents the redirect-based
// variant of the same attack.
SettingsRuntime._isWebhookUrlSafe = function(rawUrl) {
    let parsed;
    try { parsed = new URL(rawUrl); } catch { return false; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return false;

    const host = parsed.hostname.toLowerCase();
    if (!host.includes('.') && !host.startsWith('[')) return false;
    if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) return false;

    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        const o = host.split('.').map(Number);
        if (o[0] >= 224 || (o[0] === 100 && o[1] >= 64 && o[1] <= 127) || (o[0] === 198 && (o[1] === 18 || o[1] === 19))) return false;
        if (o[0] === 0) return false;                              // 0.0.0.0/8     — "this network"
        if (o[0] === 10) return false;                             // 10.0.0.0/8    — RFC 1918 private
        if (o[0] === 127) return false;                            // 127.0.0.0/8   — loopback
        if (o[0] === 169 && o[1] === 254) return false;            // 169.254.0.0/16 — link-local (AWS/GCP metadata)
        if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return false; // 172.16.0.0/12 — RFC 1918 private
        if (o[0] === 192 && o[1] === 168) return false;            // 192.168.0.0/16 — RFC 1918 private
    }

    if (host.startsWith('[') && host.endsWith(']')) {
        const v6 = host.slice(1, -1);
        // ::1 = IPv6 loopback; :: = unspecified; fe80::/10 = link-local;
        // fc00::/7 = unique-local (matched via fc/fd prefix).
        // Restrict literals to global unicast; excludes mapped IPv4, loopback,
        // link-local, unique-local, and multicast addresses.
        if (!/^[23][0-9a-f]{3}:/.test(v6)) return false;
    }

    return true;
};

// Even the path can carry a webhook token. Never log a destination.
SettingsRuntime._redactUrlForLog = function() { return '[configured webhook]'; };

// Builds the template-substitution context for webhook URL/headers/body.
SettingsRuntime._buildWebhookContext = function(pageData, detectionResults) {
    const url = pageData.url || '';
    let hostname = pageData.hostname || '';
    if (!hostname && url) {
        try { hostname = new URL(url).hostname; } catch { /* leave empty */ }
    }
    return {
        url,
        hostname,
        title: pageData.title || 'Untitled',
        favicon: hostname ? UrlUtils.getFaviconUrl(hostname, 64) : '',
        timestamp: new Date().toISOString(),
        detectionCount: detectionResults.length,
        categories: [...new Set(detectionResults.map(d => d.category))].join(','),
        detections: detectionResults
    };
};

// Substitutes <SITEURL>, <HOSTNAME>, etc. tokens (WebhookBody.VARIABLES) into a
// template string. Pass encode=true for URL-component contexts.
SettingsRuntime._substituteWebhookTokens = function(template, ctx, { encode = false } = {}) {
    return WebhookBody.substitute(template, ctx, encode ? 'url' : 'header');
};

// `contentType` is the header the body builder chose (null for multipart:
// fetch adds it with the boundary).
SettingsRuntime._buildWebhookHeaders = function(webhook, method, ctx, contentType) {
    const headers = {};
    if (method !== 'GET' && contentType) {
        headers['Content-Type'] = contentType;
    }
    for (const header of (webhook.webhookHeaders || [])) {
        // Strip everything outside the RFC 7230 token charset (incl. CR/LF and
        // spaces) so a malformed header name throws no opaque fetch TypeError
        // and can't smuggle control characters.
        const name = (header.name || '').trim().replace(/[^!#$%&'*+.^_`|~0-9A-Za-z-]/g, '');
        if (!name) continue;
        headers[name] = WebhookBody.headerValue(SettingsRuntime._substituteWebhookTokens(header.value || '', ctx));
    }
    return headers;
};

// Body + Content-Type for the saved webhookContentType (see WebhookBody.build).
SettingsRuntime._buildWebhookBody = function(webhook, detectionResults, ctx) {
    return WebhookBody.build(webhook.webhookContentType, webhook.webhookPayload, { ...ctx, detections: detectionResults });
};

/** Same post-substitution validation and transport for Test and delivery. */
SettingsRuntime.buildWebhookRequest = function(webhook, ctx) {
    const url = WebhookBody.substitute(webhook.webhookUrl || '', ctx, 'url');
    if (!SettingsRuntime._isWebhookUrlSafe(url)) throw new Error('Webhook requires HTTPS and a public host');
    const method = (webhook.webhookMethod || 'POST').toUpperCase();
    if (!/^[A-Z]+$/.test(method) || ['CONNECT', 'TRACE', 'TRACK'].includes(method)) throw new Error('Invalid webhook method');
    const built = ['GET', 'HEAD'].includes(method) ? null : SettingsRuntime._buildWebhookBody(webhook, ctx.detections || [], ctx);
    const options = {
        method,
        headers: SettingsRuntime._buildWebhookHeaders(webhook, method, ctx, built && built.contentType),
        redirect: 'error',
        credentials: 'omit',
        referrerPolicy: 'no-referrer'
    };
    if (built) options.body = built.body;
    return { url, options };
};

/**
 * Sign a built request when a secret is set (WebhookBody: the HMAC-SHA256 of the text body in Scrapfly's two
 * signature headers). Custom headers named like either one go first, whatever their case: a plain object handed to
 * fetch would otherwise join them into one "forged, real" header. Nothing is sent when signing fails, and the error
 * names neither the secret nor the body.
 */
SettingsRuntime._signWebhookRequest = async function(options, secret) {
    if (!WebhookBody.cleanSecret(secret)) return options;
    const reserved = [WebhookBody.SIGNATURE_HEADER, WebhookBody.SIGNATURE_HEADER_LOWERCASE].map(name => name.toLowerCase());
    for (const name of Object.keys(options.headers || {})) {
        if (reserved.includes(name.toLowerCase())) delete options.headers[name];
    }
    let digest;
    try {
        digest = await WebhookBody.signature(secret, options.body);
    } catch (_) {
        throw new Error('Webhook signing failed');
    }
    if (digest) options.headers = Object.assign(options.headers || {}, WebhookBody.signatureHeaders(digest));
    return options;
};

/** How long a webhook may take to answer: a server that never does would otherwise hold its delivery forever. */
SettingsRuntime.WEBHOOK_TIMEOUT_MS = 10000;

SettingsRuntime.sendWebhook = async function(webhook, ctx) {
    const { url, options } = SettingsRuntime.buildWebhookRequest(webhook, ctx);
    await SettingsRuntime._signWebhookRequest(options, webhook.webhookSecret);
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        options.signal = AbortSignal.timeout(SettingsRuntime.WEBHOOK_TIMEOUT_MS);
    }
    try {
        return await fetch(url, options);
    } catch (_) {
        // Browser/network errors may repeat URLs containing credentials.
        throw new Error('Webhook request failed');
    }
};

// Whether a page is sent, and the record of it: modules/settings/webhook-runtime.js (the service worker's side)

SettingsRuntime.dispatchJsApiEvent = async function(eventName, data = {}) {
    try {
      const settings = await Utils.getSettings();
      const jsApiEnabled = settings.jsApi?.enableJsApi ?? false;

      if (!jsApiEnabled) {
        Logger.debug('UI', `JS API off, ${eventName} not sent`);
        return false;
      }

      // ISOLATED world events aren't visible to page scripts; use the authenticated
      // content bridge to reach MAIN world when available.
      const projected = typeof PublicDetectionSummary !== 'undefined'
        ? PublicDetectionSummary.project(eventName, data)
        : (eventName === 'onDetection' ? { detections: [], detectionCount: 0 } : {});
      const eventData = {
        ...projected,
        timestamp: projected.timestamp || new Date().toISOString()
      };

      const bridge = typeof window !== 'undefined' ? window.ScrapflyBridge : null;
      const message = {
        type: globalThis.ScrapflyBridgeProtocol.MESSAGE_TYPES.JS_API_EVENT,
        eventName: eventName,
        detail: eventData,
        // The on* events may also reach window.<name>(detail); 'ready' never would call a page's own ready() helper
        windowCallback: /^on[A-Z]/.test(eventName)
      };

      if (bridge && typeof bridge.sendToMainWorld === 'function') {
        bridge.sendToMainWorld(message);
      } else {
        Logger.warn('UI', 'JS API: MAIN world bridge unavailable, event skipped');
        return false;
      }

      Logger.debug('UI', `JS API event: ${eventName}`);
      return true;

    } catch (error) {
      Logger.error('UI', `JS API: Failed to dispatch ${eventName} event:`, error);
      return false;
    }
};

SettingsRuntime.dispatchReadyEvent = async function() {
    try {
      return SettingsRuntime.dispatchJsApiEvent('ready', {
        enabled: true,
        version: chrome.runtime.getManifest().version
      });

    } catch (error) {
      Logger.error('UI', 'JS API: Failed to dispatch ready event:', error);
      return false;
    }
};

if (typeof self !== 'undefined') {
    self.SettingsRuntime = SettingsRuntime;
    if (typeof self.Settings === 'undefined') {
      self.Settings = {
        loadToggleState: (...args) => SettingsRuntime.loadToggleState(...args),
        loadAndApplyDefaultTab: (...args) => SettingsRuntime.loadAndApplyDefaultTab(...args),
        handleEnableToggle: (...args) => SettingsRuntime.handleEnableToggle(...args),
        handleSettingsUpdated: (...args) => SettingsRuntime.handleSettingsUpdated(...args),
        sendWebhookIfEnabled: (...args) => SettingsRuntime.sendWebhookIfEnabled(...args),
        dispatchJsApiEvent: (...args) => SettingsRuntime.dispatchJsApiEvent(...args),
        dispatchReadyEvent: (...args) => SettingsRuntime.dispatchReadyEvent(...args)
      };
    }
}
