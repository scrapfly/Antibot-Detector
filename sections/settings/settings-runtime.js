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
      Logger.ui('Toggle state loaded:', isEnabled);
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
      await chrome.storage.local.set({ scrapfly_enabled: enabled });
      Logger.ui('Extension enabled state updated:', enabled);

      chrome.runtime.sendMessage({
        type: 'EXTENSION_TOGGLE_CHANGED',
        enabled: enabled
      }).catch(() => {});

      // Restore badges for ALL tabs when re-enabling extension
      if (enabled) {
        const hasContext = context && context.DetectionEngineManager && context.CategoryManager && context.categoryManager;

        // Only restore badges when we have background context (DetectionEngineManager, etc.).
        // In popup context (!hasContext), skip — background handles it via EXTENSION_TOGGLE_CHANGED.
        // Without this guard, popup sets all badges to EMPTY which races with background's restore.
        if (hasContext) {
          const badgeColors = await context.CategoryManager.getBadgeColors(context.categoryManager);
          const tabs = await chrome.tabs.query({});

          for (const tab of tabs) {
            if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
                tab.url.startsWith('about:') || tab.url.startsWith('edge://')) {
              continue;
            }
            try {
              const storedData = await context.DetectionEngineManager.getStoredDetection(tab.url);
              if (storedData && storedData.detectionCount > 0) {
                const detections = Array.isArray(storedData.detectionResults) ? storedData.detectionResults : [];
                let color;
                if (detections.length > 0) {
                  const avgConfidence = DetectionUtils.computeAverageConfidence(detections);
                  const difficulty = DetectionUtils.getDifficultyLevel(detections, avgConfidence);
                  color = difficulty === 'High' ? badgeColors.high :
                         difficulty === 'Medium' ? badgeColors.medium : badgeColors.low;
                } else {
                  color = storedData.detectionCount >= 3 ? badgeColors.medium : badgeColors.low;
                }
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
          chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tab.id }).catch((error) => {
            Logger.ui(`[Settings] Failed to set disabled badge for tab ${tab.id}:`, error.message);
          });
          chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tab.id }).catch((error) => {
            Logger.ui(`[Settings] Failed to set badge color for tab ${tab.id}:`, error.message);
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

      sendResponse({ status: 'success' });
    } catch (error) {
      Logger.error('UI', 'Failed to handle settings update:', error);
      sendResponse({ status: 'error', error: error.message });
    }
};

SettingsRuntime.sendWebhookIfEnabled = async function(pageData, detectionResults) {
    try {
      const settings = await Utils.getSettings();
      const webhook = settings.webhook || {};

      if (!webhook.enableWebhook || !webhook.webhookUrl) {
        return;
      }

      const url = pageData.url || '';
      const hostname = pageData.hostname || new URL(url).hostname || '';
      const title = pageData.title || 'Untitled';
      const favicon = hostname ? UrlUtils.getFaviconUrl(hostname, 64) : '';
      const timestamp = new Date().toISOString();
      const detectionCount = detectionResults.length;
      const categories = [...new Set(detectionResults.map(d => d.category))].join(',');

      const headers = {};
      const method = (webhook.webhookMethod || 'POST').toUpperCase();
      if (method !== 'GET') {
        headers['Content-Type'] = webhook.webhookContentType || 'application/json';
      }

      const customHeaders = webhook.webhookHeaders || [];
      for (const header of customHeaders) {
        if (header.name && header.name.trim()) {
          let headerValue = header.value || '';
          headerValue = headerValue
            .replace(/<SITEURL>/g, url)
            .replace(/<HOSTNAME>/g, hostname)
            .replace(/<TITLE>/g, title)
            .replace(/<FAVICON>/g, favicon)
            .replace(/<TIMESTAMP>/g, timestamp)
            .replace(/<DETECTION_COUNT>/g, String(detectionCount))
            .replace(/<CATEGORIES>/g, categories);
          headers[header.name.trim()] = headerValue;
        }
      }

      let processedUrl = webhook.webhookUrl
        .replace(/<SITEURL>/g, encodeURIComponent(url))
        .replace(/<HOSTNAME>/g, encodeURIComponent(hostname))
        .replace(/<TITLE>/g, encodeURIComponent(title))
        .replace(/<FAVICON>/g, encodeURIComponent(favicon))
        .replace(/<TIMESTAMP>/g, encodeURIComponent(timestamp))
        .replace(/<DETECTION_COUNT>/g, String(detectionCount))
        .replace(/<CATEGORIES>/g, encodeURIComponent(categories));

      const fetchOptions = {
        method: method,
        headers: headers
      };

      if (method !== 'GET') {
        let payload = webhook.webhookPayload || '';

        if (!payload.trim()) {
          payload = JSON.stringify({
            url: url,
            hostname: hostname,
            title: title,
            favicon: favicon,
            detections: detectionResults,
            timestamp: timestamp,
            count: detectionCount
          });
        } else {
          payload = payload
            .replace(/<SITEURL>/g, url)
            .replace(/<HOSTNAME>/g, hostname)
            .replace(/<TITLE>/g, title)
            .replace(/<FAVICON>/g, favicon)
            .replace(/<TIMESTAMP>/g, timestamp)
            .replace(/<DETECTION_COUNT>/g, String(detectionCount))
            .replace(/<CATEGORIES>/g, categories)
            .replace(/<DETECTIONS>/g, JSON.stringify(detectionResults));
        }

        fetchOptions.body = payload;
      }

      Logger.network('Sending webhook request:', {
        url: processedUrl,
        method: fetchOptions.method,
        headers: fetchOptions.headers,
        bodyLength: fetchOptions.body?.length || 0
      });

      const response = await fetch(processedUrl, fetchOptions);

      if (response.ok) {
        Logger.network('Webhook sent successfully', { url: processedUrl, status: response.status });
      } else {
        const errorText = await response.text().catch(() => 'Could not read response');
        Logger.warn('NETWORK', 'Webhook returned non-OK status', {
          url: processedUrl,
          status: response.status,
          statusText: response.statusText,
          errorText: errorText
        });
      }
    } catch (error) {
      Logger.error('NETWORK', 'Failed to send webhook:', {
        error: error.message,
        name: error.name,
        url: processedUrl,
        method: fetchOptions.method
      });

      // "Failed to fetch" usually means server down, CORS issue, firewall, or bad URL
      if (error.message.includes('Failed to fetch')) {
        Logger.error('NETWORK', 'Hint: Check that your webhook server is running and accepts requests from extensions');
      }
    }
};

SettingsRuntime.dispatchJsApiEvent = async function(eventName, data = {}) {
    try {
      Logger.ui(`[Settings] dispatchJsApiEvent called: ${eventName}`);

      const settings = await Utils.getSettings();
      const jsApiEnabled = settings.jsApi?.enableJsApi ?? true;

      if (!jsApiEnabled) {
        Logger.ui(`JS API: Disabled in settings, skipping ${eventName} event`);
        return false;
      }

      // ISOLATED world events aren't visible to page scripts; use postMessage to reach MAIN world
      const eventData = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString()
      };

      Logger.ui(`[Settings] Sending postMessage to MAIN world: scrapfly:${eventName}`);
      window.postMessage({
        type: 'SCRAPFLY_JS_API_EVENT',
        eventName: eventName,
        detail: eventData
      }, '*');

      Logger.ui(`JS API: Sent ${eventName} event to MAIN world`, data);
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
