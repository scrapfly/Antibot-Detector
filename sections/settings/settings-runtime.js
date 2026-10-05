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
          type: 'EXTENSION_TOGGLE_CHANGED',
          enabled: enabled
        }).catch(() => {});
      }

      // Restore badges for ALL tabs when re-enabling extension
      if (enabled) {
        // Only restore badges when we have background context (DetectionEngineManager, etc.).
        // In popup context (!hasBackgroundContext), skip — background handles it via EXTENSION_TOGGLE_CHANGED.
        // Without this guard, popup sets all badges to EMPTY which races with background's restore.
        if (hasBackgroundContext) {
          const badgeColors = await context.CategoryManager.getBadgeColors(context.categoryManager);
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
                continue;
              }
              await setPausedIcon(tab.id, false);
              const storedData = await context.DetectionEngineManager.getStoredDetection(tab.url);
              if (storedData && storedData.detectionCount > 0) {
                const detections = Array.isArray(storedData.detectionResults) ? storedData.detectionResults : [];
                const color = DetectionUtils.getBadgeColor(detections, badgeColors);
                await setBadgeTextColor(tab.id, false, color);
                chrome.action.setBadgeText({ text: storedData.detectionCount.toString(), tabId: tab.id }).catch(() => {});
                chrome.action.setBadgeBackgroundColor({ color, tabId: tab.id }).catch(() => {});
              } else {
                chrome.action.setBadgeText({ text: BADGE.TEXT.EMPTY, tabId: tab.id }).catch(() => {});
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
    if (parsed.protocol !== 'https:') return false;

    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost')) return false;

    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        const o = host.split('.').map(Number);
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
        if (v6 === '::1' || v6 === '::' || v6.startsWith('fe80:') || v6.startsWith('fc') || v6.startsWith('fd')) return false;
    }

    return true;
};

SettingsRuntime._redactUrlForLog = function(rawUrl) {
    try {
      const u = new URL(rawUrl);
      return `${u.protocol}//${u.host}${u.pathname}`;
    } catch { return '[unparseable webhook url]'; }
};

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
        headers[name] = SettingsRuntime._substituteWebhookTokens(header.value || '', ctx);
    }
    return headers;
};

// Body + Content-Type for the saved webhookContentType (see WebhookBody.build).
SettingsRuntime._buildWebhookBody = function(webhook, detectionResults, ctx) {
    return WebhookBody.build(webhook.webhookContentType, webhook.webhookPayload, { ...ctx, detections: detectionResults });
};

SettingsRuntime.sendWebhookIfEnabled = async function(pageData, detectionResults) {
    // Outer-scope so the catch block can log even if URL processing threw.
    let redactedUrl = '';
    let method = '';
    try {
        const settings = await Utils.getSettings();
        const webhook = settings.webhook || {};
        if (!webhook.enableWebhook || !webhook.webhookUrl) return;

        if (!SettingsRuntime._isWebhookUrlSafe(webhook.webhookUrl)) {
            Logger.warn('NETWORK', 'Webhook URL rejected (must be https:// to a public host)', {
                url: SettingsRuntime._redactUrlForLog(webhook.webhookUrl)
            });
            return;
        }

        const ctx = SettingsRuntime._buildWebhookContext(pageData, detectionResults);
        method = (webhook.webhookMethod || 'POST').toUpperCase();
        const processedUrl = SettingsRuntime._substituteWebhookTokens(webhook.webhookUrl, ctx, { encode: true });
        redactedUrl = SettingsRuntime._redactUrlForLog(processedUrl);

        const built = method !== 'GET' ? SettingsRuntime._buildWebhookBody(webhook, detectionResults, ctx) : null;
        const fetchOptions = {
            method,
            headers: SettingsRuntime._buildWebhookHeaders(webhook, method, ctx, built && built.contentType),
            redirect: 'error',
            credentials: 'omit',
            referrerPolicy: 'no-referrer'
        };
        if (built) {
            fetchOptions.body = built.body;
        }

        Logger.network('Sending webhook request:', {
            url: redactedUrl,
            method: fetchOptions.method,
            bodyType: built ? built.kind : 'none',
            bodyLength: typeof fetchOptions.body === 'string' ? fetchOptions.body.length : 0
        });

        const response = await fetch(processedUrl, fetchOptions);
        if (response.ok) {
            Logger.network('Webhook sent successfully', { url: redactedUrl, status: response.status });
        } else {
            Logger.warn('NETWORK', 'Webhook returned non-OK status', {
                url: redactedUrl,
                status: response.status,
                statusText: response.statusText
            });
        }
    } catch (error) {
        Logger.error('NETWORK', 'Failed to send webhook:', {
            error: error.message,
            name: error.name,
            url: redactedUrl || '[no url]',
            method: method || '[no method]'
        });
        // "Failed to fetch" usually means server down, CORS issue, firewall, or bad URL.
        if (error.message.includes('Failed to fetch')) {
            Logger.error('NETWORK', 'Hint: Check that your webhook server is running and accepts requests from extensions');
        }
    }
};

SettingsRuntime.dispatchJsApiEvent = async function(eventName, data = {}) {
    try {
      const settings = await Utils.getSettings();
      const jsApiEnabled = settings.jsApi?.enableJsApi ?? true;

      if (!jsApiEnabled) {
        Logger.debug('UI', `JS API off, ${eventName} not sent`);
        return false;
      }

      // ISOLATED world events aren't visible to page scripts; use the authenticated
      // content bridge to reach MAIN world when available.
      const eventData = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString()
      };

      const bridge = typeof window !== 'undefined' ? window.ScrapflyBridge : null;
      const message = {
        type: globalThis.ScrapflyBridgeProtocol.MESSAGE_TYPES.JS_API_EVENT,
        eventName: eventName,
        detail: eventData
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
