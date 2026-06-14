// Webhook UI methods for SettingsUI — extracted from settings-ui.js
// to keep the main file under the 800-line cap.
// Requires settings-ui.js to load first (defines const SettingsUI).

SettingsUI.setupWebhookMethodRadios = function() {
    const radios = document.querySelectorAll('input[name="webhookMethodRadio"]');
    const webhookMethodInput = document.querySelector('#webhookMethod');
    const customContainer = document.querySelector('#webhookCustomMethodContainer');
    const customInput = document.querySelector('#webhookCustomMethod');

    radios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        radios.forEach(r => {
          const badge = r.closest('.http-method-badge');
          if (badge) badge.classList.remove('checked');
        });

        const badge = e.target.closest('.http-method-badge');
        if (badge) badge.classList.add('checked');

        if (e.target.value === 'CUSTOM') {
          if (customContainer) customContainer.style.display = 'block';
          if (customInput) customInput.focus();
        } else {
          if (customContainer) customContainer.style.display = 'none';
          if (webhookMethodInput) webhookMethodInput.value = e.target.value;
        }
      });
    });

    if (customInput) {
      customInput.addEventListener('input', () => {
        const customValue = customInput.value.trim().toUpperCase();
        if (customValue && webhookMethodInput) {
          webhookMethodInput.value = customValue;
        }
      });
    }
};

SettingsUI.renderWebhookHeadersUI = function() {
    const container = document.querySelector('#webhookHeadersContainer');
    if (!container) return;

    const headers = this.settings.webhook?.webhookHeaders || [];

    if (headers.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 12px; padding: 8px; text-align: center;">No custom headers configured</div>';
      return;
    }

    container.innerHTML = headers.map((header, index) => `
      <div class="webhook-header-item" data-index="${index}" style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
        <input type="text" class="webhook-header-name input-field" placeholder="Header name" value="${this.escapeHtml(header.name || '')}" style="flex: 1; font-size: 13px; padding: 8px;">
        <input type="text" class="webhook-header-value input-field" placeholder="Header value" value="${this.escapeHtml(header.value || '')}" style="flex: 2; font-size: 13px; padding: 8px;">
        <button type="button" class="remove-webhook-header-btn" data-index="${index}" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 6px; display: flex; align-items: center;">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `).join('');

    container.querySelectorAll('.remove-webhook-header-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.getAttribute('data-index'));
        this.settings.webhook.webhookHeaders.splice(index, 1);
        this.renderWebhookHeadersUI();
      });
    });

    container.querySelectorAll('.webhook-header-item').forEach(item => {
      const index = parseInt(item.getAttribute('data-index'));
      const nameInput = item.querySelector('.webhook-header-name');
      const valueInput = item.querySelector('.webhook-header-value');

      nameInput.addEventListener('input', () => {
        this.settings.webhook.webhookHeaders[index].name = nameInput.value;
      });

      valueInput.addEventListener('input', () => {
        this.settings.webhook.webhookHeaders[index].value = valueInput.value;
      });
    });
};

SettingsUI.handleTestWebhook = async function() {
    const btn = document.querySelector('#testWebhookBtn');
    if (!btn) return;

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" class="spin">
        <path d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" fill="currentColor"/>
      </svg>
      Sending...
    `;

    try {
      const webhookUrl = document.querySelector('#webhookUrl')?.value || '';
      const webhookMethod = document.querySelector('#webhookMethod')?.value || 'POST';
      const webhookContentType = document.querySelector('#webhookContentType')?.value || 'application/json';
      const webhookPayload = document.querySelector('#webhookPayload')?.value || '';

      if (!webhookUrl) {
        const _tWH = (typeof I18n !== 'undefined') ? I18n : null;
        NotificationHelper.error((_tWH && _tWH.get('pleaseEnterWebhookUrl')) || 'Please enter a webhook URL');
        return;
      }

      const customHeaders = this.settings.webhook?.webhookHeaders || [];
      const testUrl = 'https://example.com/test-page';
      const testHostname = 'example.com';
      const testTitle = 'Test Page - Webhook Test';
      const testFavicon = UrlUtils.getFaviconUrl('example.com', 64);
      const testTimestamp = new Date().toISOString();
      const testDetections = [
        {
          id: 'test-detector',
          name: 'Test Detector',
          category: 'Anti-Bot',
          confidence: 95,
          color: '#F48120',
          methods: ['dom', 'cookie']
        }
      ];
      const testCount = 1;
      const testCategories = 'Anti-Bot';

      const headers = {};
      if (webhookMethod.toUpperCase() !== 'GET') {
        headers['Content-Type'] = webhookContentType;
      }

      for (const header of customHeaders) {
        if (header.name && header.name.trim()) {
          let headerValue = header.value || '';
          headerValue = headerValue
            .replace(/<SITEURL>/g, testUrl)
            .replace(/<HOSTNAME>/g, testHostname)
            .replace(/<TITLE>/g, testTitle)
            .replace(/<FAVICON>/g, testFavicon)
            .replace(/<TIMESTAMP>/g, testTimestamp)
            .replace(/<DETECTION_COUNT>/g, String(testCount))
            .replace(/<CATEGORIES>/g, testCategories);
          headers[header.name.trim()] = headerValue;
        }
      }

      let processedUrl = webhookUrl
        .replace(/<SITEURL>/g, encodeURIComponent(testUrl))
        .replace(/<HOSTNAME>/g, encodeURIComponent(testHostname))
        .replace(/<TITLE>/g, encodeURIComponent(testTitle))
        .replace(/<FAVICON>/g, encodeURIComponent(testFavicon))
        .replace(/<TIMESTAMP>/g, encodeURIComponent(testTimestamp))
        .replace(/<DETECTION_COUNT>/g, String(testCount))
        .replace(/<CATEGORIES>/g, encodeURIComponent(testCategories));

      const fetchOptions = {
        method: webhookMethod.toUpperCase(),
        headers: headers
      };

      if (webhookMethod.toUpperCase() !== 'GET') {
        let payload = webhookPayload;

        if (!payload.trim()) {
          payload = JSON.stringify({
            url: testUrl,
            hostname: testHostname,
            title: testTitle,
            favicon: testFavicon,
            detections: testDetections,
            timestamp: testTimestamp,
            count: testCount
          });
        } else {
          payload = payload
            .replace(/<SITEURL>/g, testUrl)
            .replace(/<HOSTNAME>/g, testHostname)
            .replace(/<TITLE>/g, testTitle)
            .replace(/<FAVICON>/g, testFavicon)
            .replace(/<TIMESTAMP>/g, testTimestamp)
            .replace(/<DETECTION_COUNT>/g, String(testCount))
            .replace(/<CATEGORIES>/g, testCategories)
            .replace(/<DETECTIONS>/g, JSON.stringify(testDetections));
        }

        fetchOptions.body = payload;
      }

      Logger.network('Test webhook:', { url: processedUrl, options: fetchOptions });

      const response = await fetch(processedUrl, fetchOptions);

      const _tW = (typeof I18n !== 'undefined') ? I18n : null;
      if (response.ok) {
        NotificationHelper.success((_tW && _tW.format('webhookTestSuccessfulFmt', response.status)) || `Webhook test successful! Status: ${response.status}`);
        Logger.network('Test webhook success:', { status: response.status });
      } else {
        NotificationHelper.error((_tW && _tW.format('webhookFailedStatusFmt', response.status)) || `Webhook returned status: ${response.status}`);
        Logger.warn('NETWORK', 'Test webhook failed:', { status: response.status });
      }
    } catch (error) {
      Logger.error('NETWORK', 'Test webhook error:', error);
      const _tWE = (typeof I18n !== 'undefined') ? I18n : null;
      NotificationHelper.error((_tWE && _tWE.format('webhookTestFailedFmt', error.message)) || ('Webhook test failed: ' + error.message));
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
};

SettingsUI._setupWebhookListeners = function() {
    const addWebhookHeaderBtn = document.querySelector('#addWebhookHeaderBtn');
    if (addWebhookHeaderBtn) {
      addWebhookHeaderBtn.addEventListener('click', () => {
        if (!this.settings.webhook) {
          this.settings.webhook = { webhookHeaders: [] };
        }
        if (!this.settings.webhook.webhookHeaders) {
          this.settings.webhook.webhookHeaders = [];
        }
        this.settings.webhook.webhookHeaders.push({ name: '', value: '' });
        this.renderWebhookHeadersUI();
      });
    }

    const enableWebhookToggle = document.querySelector('#enableWebhook');
    const webhookSettingsContainer = document.querySelector('#webhookSettings');
    const webhookOnCacheGroup = document.querySelector('#webhookOnCacheGroup');
    if (enableWebhookToggle) {
      enableWebhookToggle.addEventListener('change', () => {
        SettingsUI.setToggleControlledVisibility(enableWebhookToggle, [
          { element: webhookSettingsContainer, onDisplay: 'block' },
          { element: webhookOnCacheGroup, onDisplay: 'flex' }
        ]);
      });
      SettingsUI.setToggleControlledVisibility(enableWebhookToggle, [
        { element: webhookSettingsContainer, onDisplay: 'block' },
        { element: webhookOnCacheGroup, onDisplay: 'flex' }
      ]);
    }

    const testWebhookBtn = document.querySelector('#testWebhookBtn');
    if (testWebhookBtn) {
      testWebhookBtn.addEventListener('click', () => this.handleTestWebhook());
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
