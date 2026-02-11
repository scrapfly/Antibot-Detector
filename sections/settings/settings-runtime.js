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

      // Broadcast to all contexts
      chrome.runtime.sendMessage({
        type: 'EXTENSION_TOGGLE_CHANGED',
        enabled: enabled
      }).catch(() => {
        // Ignore if popup not open
      });

      // Update badges efficiently
      if (enabled) {
        // When enabling, only update the currently active tab from cache
        // Other tabs will update naturally when user navigates to them
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab && context && context.DetectionEngineManager && context.CategoryManager && context.categoryManager) {
          const storedData = await context.DetectionEngineManager.getStoredDetection(activeTab.url);
          if (storedData && storedData.detectionCount > 0) {
            // Restore badge from cached data for active tab only
            const badgeColors = await context.CategoryManager.getBadgeColors(context.categoryManager);
            const count = storedData.detectionCount.toString();
            const detections = Array.isArray(storedData.detectionResults) ? storedData.detectionResults : [];
            let color;
            if (detections.length > 0) {
              const avgConfidence = DetectionUtils.computeAverageConfidence(detections);
              const difficulty = DetectionUtils.getDifficultyLevel(detections, avgConfidence);
              color = difficulty === 'High' ? badgeColors.high :
                     difficulty === 'Medium' ? badgeColors.medium :
                     badgeColors.low;
            } else {
              // Fallback for older stored payloads without detectionResults
              // Prefer matching difficulty semantics: don't treat "many detections" as automatically "High".
              color = storedData.detectionCount >= 3 ? badgeColors.medium : badgeColors.low;
            }

            chrome.action.setBadgeText({ text: count, tabId: activeTab.id }).catch((error) => {
              Logger.ui(`[Settings] Failed to set badge for active tab ${activeTab.id}:`, error.message);
            });
            chrome.action.setBadgeBackgroundColor({ color: color, tabId: activeTab.id }).catch((error) => {
              Logger.ui(`[Settings] Failed to set badge color for active tab ${activeTab.id}:`, error.message);
            });
          } else {
            // No cached detections, clear badge
            chrome.action.setBadgeText({ text: '', tabId: activeTab.id }).catch((error) => {
              Logger.ui(`[Settings] Failed to clear badge for active tab ${activeTab.id}:`, error.message);
            });
          }
        }
      } else {
        // When disabling, set OFF badge for all tabs
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          chrome.action.setBadgeText({ text: BADGE.TEXT.DISABLED, tabId: tab.id }).catch((error) => {
            // Expected: Tab might be closed
            Logger.ui(`[Settings] Failed to set disabled badge for tab ${tab.id}:`, error.message);
          });
          chrome.action.setBadgeBackgroundColor({ color: BADGE.COLORS.DISABLED, tabId: tab.id }).catch((error) => {
            // Expected: Tab might be closed
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

      // Invalidate settings cache
      Utils.invalidateSettingsCache();

      // Reload category manager if colors changed
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

      // Debug: Log full settings structure
      Logger.network('Full settings object keys:', Object.keys(settings));
      Logger.network('Settings.webhook:', settings.webhook);

      // Check both flat and nested paths for backwards compatibility
      const webhook = settings.webhook || {};

      Logger.network('Webhook check:', {
        enableWebhook: webhook.enableWebhook,
        webhookUrl: webhook.webhookUrl,
        detectionCount: detectionResults?.length || 0
      });

      if (!webhook.enableWebhook || !webhook.webhookUrl) {
        Logger.network('Webhook skipped: not enabled or no URL', {
          enableWebhook: webhook.enableWebhook,
          hasUrl: !!webhook.webhookUrl
        });
        return;
      }

      const url = pageData.url || '';
      const hostname = pageData.hostname || new URL(url).hostname || '';
      const title = pageData.title || 'Untitled';
      const favicon = hostname ? `https://www.google.com/s2/favicons?domain=${hostname}&sz=64` : '';
      const timestamp = new Date().toISOString();
      const detectionCount = detectionResults.length;
      const categories = [...new Set(detectionResults.map(d => d.category))].join(',');

      // Build headers object
      const headers = {};

      // Add Content-Type header (not for GET requests without body)
      const method = (webhook.webhookMethod || 'POST').toUpperCase();
      if (method !== 'GET') {
        headers['Content-Type'] = webhook.webhookContentType || 'application/json';
      }

      // Add custom headers
      const customHeaders = webhook.webhookHeaders || [];
      for (const header of customHeaders) {
        if (header.name && header.name.trim()) {
          // Process header value with variable substitution
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

      // Process webhook URL with variable substitution
      let processedUrl = webhook.webhookUrl
        .replace(/<SITEURL>/g, encodeURIComponent(url))
        .replace(/<HOSTNAME>/g, encodeURIComponent(hostname))
        .replace(/<TITLE>/g, encodeURIComponent(title))
        .replace(/<FAVICON>/g, encodeURIComponent(favicon))
        .replace(/<TIMESTAMP>/g, encodeURIComponent(timestamp))
        .replace(/<DETECTION_COUNT>/g, String(detectionCount))
        .replace(/<CATEGORIES>/g, encodeURIComponent(categories));

      // Build fetch options
      const fetchOptions = {
        method: method,
        headers: headers
      };

      // Add body for non-GET requests
      if (method !== 'GET') {
        let payload = webhook.webhookPayload || '';

        // If payload template is empty, use default JSON payload
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
          // Process payload template with variable substitution
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

      // Send webhook
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

      // Common causes for "Failed to fetch":
      // 1. Server not running at the specified URL
      // 2. CORS blocking the request (server needs Access-Control-Allow-Origin header)
      // 3. Network/firewall blocking the request
      // 4. Invalid URL format
      if (error.message.includes('Failed to fetch')) {
        Logger.error('NETWORK', 'Hint: Check that your webhook server is running and accepts requests from extensions');
      }
    }
};

SettingsRuntime.isUrlBlacklisted = async function(url) {
    return Utils.isUrlBlacklisted(url);
};

SettingsRuntime.dispatchJsApiEvent = async function(eventName, data = {}) {
    try {
      Logger.ui(`[Settings] dispatchJsApiEvent called: ${eventName}`);

      // Check if JS API is enabled in settings (default to TRUE if not set)
      const settings = await Utils.getSettings();
      // Default to true when setting doesn't exist (matches default-settings.json)
      const jsApiEnabled = settings.jsApi?.enableJsApi ?? true;
      Logger.ui(`[Settings] JS API enabled: ${jsApiEnabled}`, settings.jsApi);

      if (!jsApiEnabled) {
        Logger.ui(`JS API: Disabled in settings, skipping ${eventName} event`);
        return false;
      }

      // IMPORTANT: Content scripts run in ISOLATED world, page scripts run in MAIN world
      // window.dispatchEvent() in ISOLATED world is NOT visible to page scripts!
      // We must use postMessage to communicate with MAIN world
      const eventData = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString()
      };

      // Send to MAIN world via postMessage - content-main-world.js will dispatch the CustomEvent
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
        isUrlBlacklisted: (...args) => SettingsRuntime.isUrlBlacklisted(...args),
        dispatchJsApiEvent: (...args) => SettingsRuntime.dispatchJsApiEvent(...args),
        dispatchReadyEvent: (...args) => SettingsRuntime.dispatchReadyEvent(...args)
      };
    }
}
