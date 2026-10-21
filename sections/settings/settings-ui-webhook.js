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
      container.innerHTML = `<div class="webhook-headers-empty">${this.escapeHtml(SettingsUI._whTr('webhookNoHeaders', 'No custom headers configured'))}</div>`;
      return;
    }

    const nameLabel = this.escapeHtml(SettingsUI._whTr('webhookHeaderName', 'Header name'));
    const valueLabel = this.escapeHtml(SettingsUI._whTr('webhookHeaderValue', 'Header value'));
    const removeLabel = this.escapeHtml(SettingsUI._whTr('webhookRemoveHeader', 'Remove header'));
    container.innerHTML = headers.map((header, index) => `
      <div class="webhook-header-item" data-index="${index}" style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
        <input type="text" class="webhook-header-name input-field" placeholder="${nameLabel}" aria-label="${nameLabel}" value="${this.escapeHtml(header.name || '')}" style="flex: 1; font-size: 13px; padding: 8px;">
        <input type="text" class="webhook-header-value input-field" placeholder="${valueLabel}" aria-label="${valueLabel}" value="${this.escapeHtml(header.value || '')}" style="flex: 2; font-size: 13px; padding: 8px;">
        <button type="button" class="remove-webhook-header-btn" data-index="${index}" title="${removeLabel}" aria-label="${removeLabel}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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

/** "Send only when": the saved filter, shown in its fields. */
SettingsUI.populateWebhookFilter = function(webhook) {
    const filter = WebhookFilter.settingsOf(webhook);
    const confidence = document.querySelector('#webhookMinConfidence');
    if (confidence) confidence.value = String(filter.minConfidence);
    const colours = (this && this.settings && this.settings.categoryColors) || {};
    document.querySelectorAll('[data-webhook-category]').forEach((box) => {
      const key = box.dataset.webhookCategory;
      box.checked = filter.categories.includes(key);
      // The category's icon, in the colour chosen in Settings
      const icon = box.parentElement && box.parentElement.querySelector('.category-icon');
      if (icon) {
        icon.innerHTML = FormatUtils.categoryIconSvg(key);
        icon.style.color = colours[key] || FormatUtils.DEFAULT_CATEGORY_COLORS[key] || '';
      }
    });
    const domains = document.querySelector('#webhookDomains');
    if (domains) domains.value = filter.domains.join('\n');
};

/** The filter as the fields say it now (the saved one when the fields are not on the page). */
SettingsUI.readWebhookFilter = function() {
    const saved = this.settings.webhook || {};
    const confidence = document.querySelector('#webhookMinConfidence');
    const boxes = [...document.querySelectorAll('[data-webhook-category]')];
    const value = parseInt(confidence && confidence.value, 10);
    return {
      webhookMinConfidence: confidence ? (Number.isFinite(value) ? Math.min(Math.max(value, 0), 100) : 0) : WebhookFilter.settingsOf(saved).minConfidence,
      webhookCategories: boxes.length ? Categories.KEYS.filter(key => boxes.some(box => box.checked && box.dataset.webhookCategory === key)) : WebhookFilter.settingsOf(saved).categories,
      webhookDomains: SettingsUI.readSiteList('#webhookDomains', WebhookFilter.settingsOf(saved).domains)
    };
};

// ---- Signing secret: a password field, Generate (staged until Save) and Copy. The value is only ever set through
// .value and read back from it; it is never logged, put in an attribute or sent anywhere but the signature.

/** Show the saved secret in the field (text only; anything else counts as none). */
SettingsUI.populateWebhookSecret = function(webhook) {
    const field = document.querySelector('#webhookSecret');
    if (field) field.value = webhook && typeof webhook.webhookSecret === 'string' ? webhook.webhookSecret : '';
    SettingsUI.refreshWebhookSecretUI.call(this);
};

/** The secret as the field says it now, trimmed (the saved one when the field is not on the page). */
SettingsUI.readWebhookSecret = function() {
    const field = document.querySelector('#webhookSecret');
    if (field) return WebhookBody.cleanSecret(field.value);
    return WebhookBody.cleanSecret(this.settings && this.settings.webhook && this.settings.webhook.webhookSecret);
};

/** The error under the field when the secret could never verify, and Copy only when there is something to copy. */
SettingsUI.refreshWebhookSecretUI = function() {
    const field = document.querySelector('#webhookSecret');
    if (!field) return;
    const valid = WebhookBody.isValidSecret(field.value);
    const error = document.querySelector('#webhookSecretError');
    if (error) error.hidden = valid;
    field.setAttribute('aria-invalid', valid ? 'false' : 'true');
    const copy = document.querySelector('#webhookSecretCopyBtn');
    if (copy) copy.disabled = !WebhookBody.cleanSecret(field.value);
};

/** Generate: a new random secret in the field, applied with Save like every other change here (Cancel keeps the old one). */
SettingsUI.generateWebhookSecret = function() {
    const field = document.querySelector('#webhookSecret');
    if (!field) return;
    field.value = WebhookBody.newSecret();
    SettingsUI.refreshWebhookSecretUI.call(this);
    NotificationHelper.info(SettingsUI._whTr('settingsDraftPendingToast', 'Change staged. Save settings to apply it.'));
};

/** Copy the secret as it will be used, for the server that checks the signature. */
SettingsUI.copyWebhookSecret = async function() {
    const secret = SettingsUI.readWebhookSecret.call(this);
    if (!secret) return;
    // No element option: that helper would show "Copied" inside the field's own value for a moment
    await FormatUtils.copyToClipboard(secret);
};

/** One line of "Recent deliveries": when, the page, and what came of it. */
SettingsUI.webhookLogLine = function(entry) {
    const text = (key, fallback) => FormatUtils.t(key, fallback);
    const outcome = { sent: text('webhookLogSent', 'Sent'), failed: text('webhookLogFailed', 'Failed'), skipped: text('webhookLogSkipped', 'Not sent') }[entry.outcome];
    const why = entry.reason ? { site: text('webhookLogReasonSite', 'site not on the list'), category: text('webhookLogReasonCategory', 'category not selected'), confidence: text('webhookLogReasonConfidence', 'below the minimum confidence') }[entry.reason]
      : entry.error ? { network: text('webhookLogErrorNetwork', 'no answer'), blocked: text('webhookLogErrorBlocked', 'address not allowed'), config: text('webhookLogErrorConfig', 'invalid method') }[entry.error] : '';
    const parts = [`${outcome}${entry.status ? ` ${entry.status}` : ''}${why ? ` (${why})` : ''}`];
    if (entry.ms !== undefined) parts.push(`${entry.ms} ms`);
    if (entry.trigger === 'cache') parts.push(text('webhookLogTriggerCache', 'cached page'));
    if (entry.trigger === 'test') parts.push(text('webhookLogTriggerTest', 'test'));
    return { when: FormatUtils.formatDateTime(entry.t), page: entry.page, outcome: entry.outcome, text: parts.join(' · ') };
};

SettingsUI.renderWebhookLog = function(entries) {
    const list = document.querySelector('#webhookLogList');
    if (!list) return;
    list.textContent = '';
    const kept = (Array.isArray(entries) ? entries : []).map(WebhookLog.clean).filter(Boolean).reverse();
    if (!kept.length) {
      const empty = document.createElement('li');
      empty.className = 'webhook-log-empty';
      empty.textContent = FormatUtils.t('webhookLogEmpty', 'Nothing sent yet.');
      list.append(empty);
    }
    for (const entry of kept) {
      const line = SettingsUI.webhookLogLine(entry);
      const item = document.createElement('li');
      item.className = `webhook-log-item webhook-log-item--${line.outcome}`;
      const when = document.createElement('span');
      when.className = 'webhook-log-when';
      when.textContent = line.when;
      const page = document.createElement('span');
      page.className = 'webhook-log-page';
      page.textContent = line.page;
      page.dir = 'ltr';
      const text = document.createElement('span');
      text.className = 'webhook-log-text';
      text.textContent = line.text;
      item.append(when, page, text);
      list.append(item);
    }
    const clear = document.querySelector('#webhookLogClearBtn');
    if (clear) clear.disabled = !(Array.isArray(entries) && entries.length);
};

SettingsUI.refreshWebhookLog = async function() {
    try {
      const stored = await chrome.storage.local.get('scrapfly_webhook_log');
      SettingsUI.renderWebhookLog(stored.scrapfly_webhook_log);
    } catch (_) { /* the list stays as it was */ }
    // New lines (a page was sent while Settings is open) show up without reopening
    if (!SettingsUI._webhookLogWatching && chrome.storage && chrome.storage.onChanged) {
      SettingsUI._webhookLogWatching = true;
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.scrapfly_webhook_log) SettingsUI.renderWebhookLog(changes.scrapfly_webhook_log.newValue);
      });
    }
};

SettingsUI._setupWebhookLogListeners = function() {
    const clear = document.querySelector('#webhookLogClearBtn');
    if (clear && !clear.dataset.bound) {
      clear.dataset.bound = '1';
      clear.addEventListener('click', () => { chrome.runtime.sendMessage({ type: WorkerMessages.WEBHOOK_LOG_CLEAR }, () => { void chrome.runtime.lastError; }); });
    }
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
      ${this.escapeHtml(SettingsUI._whTr('webhookSending', 'Sending...'))}
    `;

    let ctx;
    try {
      const webhookUrl = document.querySelector('#webhookUrl')?.value || '';
      const webhookMethod = (document.querySelector('#webhookMethod')?.value || 'POST').toUpperCase();
      const webhookContentType = this.getWebhookContentTypeValue() || 'application/json';
      const webhookPayload = document.querySelector('#webhookPayload')?.value || '';
      const secretField = document.querySelector('#webhookSecret');
      const webhookSecret = SettingsUI.readWebhookSecret.call(this);

      if (!webhookUrl) {
        NotificationHelper.error(SettingsUI._whTr('pleaseEnterWebhookUrl', 'Please enter a webhook URL'));
        return;
      }
      // The same rule as Save: a secret that could never verify is not sent with
      if (secretField && !WebhookBody.isValidSecret(secretField.value)) {
        SettingsUI.refreshWebhookSecretUI.call(this);
        NotificationHelper.error(SettingsUI._whTr('webhookSecretInvalid', 'Signing secret: use up to 512 ASCII characters (no accents or emoji)'));
        return;
      }

      // Sample page + detection; the request is built exactly as the
      // background sender builds it (SettingsRuntime + WebhookBody).
      ctx = WebhookBody.sampleContext();
      ctx.favicon = UrlUtils.getFaviconUrl(ctx.hostname, 64);
      ctx.timestamp = new Date().toISOString();

      const webhook = {
        webhookUrl, webhookMethod, webhookContentType, webhookPayload,
        webhookHeaders: this.settings.webhook?.webhookHeaders || [],
        webhookSecret
      };
      const started = Date.now();
      const response = await SettingsRuntime.sendWebhook(webhook, ctx);
      SettingsUI.recordWebhookTest({ t: started, page: ctx.hostname, outcome: response.ok ? 'sent' : 'failed', status: response.status, ms: Date.now() - started });

      const _tW = (typeof I18n !== 'undefined') ? I18n : null;
      if (response.ok) {
        NotificationHelper.success((_tW && _tW.format('webhookTestSuccessfulFmt', response.status)) || `Webhook test successful! Status: ${response.status}`);
        Logger.network('Test webhook success:', { status: response.status });
      } else {
        NotificationHelper.error((_tW && _tW.format('webhookFailedStatusFmt', response.status)) || `Webhook returned status: ${response.status}`);
        Logger.warn('NETWORK', 'Test webhook failed:', { status: response.status });
      }
    } catch (error) {
      SettingsUI.recordWebhookTest({ t: Date.now(), page: ctx ? ctx.hostname : '', outcome: 'failed', error: WebhookLog.errorClassOf(error) });
      Logger.error('NETWORK', 'Test webhook request failed');
      const _tWE = (typeof I18n !== 'undefined') ? I18n : null;
      NotificationHelper.error((_tWE && _tWE.format('webhookTestFailedFmt', error.message)) || ('Webhook test failed: ' + error.message));
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
};

/** The Test button leaves a line in the record, written by the worker like every other. */
SettingsUI.recordWebhookTest = function(entry) {
    try { chrome.runtime.sendMessage({ type: WorkerMessages.WEBHOOK_LOG_ENTRY, entry: { ...entry, trigger: 'test' } }, () => { void chrome.runtime.lastError; }); } catch (_) { /* the record is a convenience */ }
};

SettingsUI._whTr = function(key, fallback) {
    return (typeof I18n !== 'undefined' && I18n.tr) ? I18n.tr(key, fallback) : fallback;
};

/**
 * Content-Type select: options from WebhookBody.CONTENT_TYPES, a custom
 * type/subtype input for "Custom", and a one-line hint describing the body.
 * A saved value that is not a listed type is a custom type.
 * @param {string} savedValue - settings.webhook.webhookContentType
 */
SettingsUI.setupWebhookContentType = function(savedValue) {
    const select = document.querySelector('#webhookContentType');
    const customBox = document.querySelector('#webhookCustomContentTypeContainer');
    const customInput = document.querySelector('#webhookCustomContentType');
    if (!select || typeof WebhookBody === 'undefined') return;

    select.innerHTML = WebhookBody.CONTENT_TYPES.map(t => {
      const label = t.value === WebhookBody.CUSTOM ? SettingsUI._whTr('webhookCtCustom', 'Custom') : t.value;
      return `<option value="${this.escapeHtml(t.value)}">${this.escapeHtml(label)}</option>`;
    }).join('');

    const resolved = WebhookBody.resolveContentType(savedValue);
    if (resolved.custom) {
      select.value = WebhookBody.CUSTOM;
      if (customInput) customInput.value = resolved.value;
    } else {
      select.value = resolved.value;
      if (customInput) customInput.value = '';
    }

    if (select.dataset.bound !== 'true') {
      select.dataset.bound = 'true';
      select.addEventListener('change', () => {
        this.refreshWebhookContentTypeUI();
        if (select.value === WebhookBody.CUSTOM && customInput) customInput.focus();
      });
      if (customInput) customInput.addEventListener('input', () => this.refreshWebhookContentTypeUI());
    }
    this.refreshWebhookContentTypeUI();
};

SettingsUI.refreshWebhookContentTypeUI = function() {
    const select = document.querySelector('#webhookContentType');
    const customBox = document.querySelector('#webhookCustomContentTypeContainer');
    const customInput = document.querySelector('#webhookCustomContentType');
    const error = document.querySelector('#webhookCustomContentTypeError');
    const hint = document.querySelector('#webhookContentTypeHint');
    if (!select || typeof WebhookBody === 'undefined') return;

    const isCustom = select.value === WebhookBody.CUSTOM;
    if (customBox) customBox.hidden = !isCustom;
    const customValue = (customInput?.value || '').trim();
    const invalid = isCustom && customValue !== '' && !WebhookBody.isValidContentType(customValue);
    if (error) error.hidden = !invalid;
    if (customInput) customInput.setAttribute('aria-invalid', invalid ? 'true' : 'false');

    const type = WebhookBody.CONTENT_TYPES.find(t => t.value === select.value) || WebhookBody.CONTENT_TYPES[0];
    if (hint) hint.textContent = SettingsUI._whTr(type.hintKey, type.hint);

    if (typeof SettingsUI.refreshWebhookPayloadValidation === 'function') SettingsUI.refreshWebhookPayloadValidation.call(this);
};

/**
 * The Content-Type to save: the listed type, or the custom type/subtype.
 * An empty or invalid custom value keeps the previously saved type.
 * @returns {string|undefined}
 */
SettingsUI.getWebhookContentTypeValue = function() {
    const select = document.querySelector('#webhookContentType');
    if (!select) return undefined;
    if (typeof WebhookBody === 'undefined' || select.value !== WebhookBody.CUSTOM) return select.value;
    const custom = (document.querySelector('#webhookCustomContentType')?.value || '').trim();
    if (WebhookBody.isValidContentType(custom)) return custom;
    return this.settings.webhook?.webhookContentType || 'application/json';
};

// ---------------------------------------------------------------------------
// Payload template: variable chips, "?" help with every variable, live JSON
// check and reset. The variable list is WebhookBody.VARIABLES — the same
// definition the sender substitutes.
// ---------------------------------------------------------------------------

SettingsUI.setupWebhookPayloadUI = function() {
    const textarea = document.querySelector('#webhookPayload');
    const chips = document.querySelector('#webhookVariableChips');
    if (!textarea || typeof WebhookBody === 'undefined') return;

    textarea.placeholder = WebhookBody.DEFAULT_TEMPLATE;

    if (chips && !chips.childElementCount) {
      const insertFmt = SettingsUI._whTr('webhookVarsInsertFmt', 'Insert {0}');
      chips.innerHTML = WebhookBody.VARIABLES.map(v => {
        const label = this.escapeHtml(insertFmt.split('{0}').join(v.token));
        return `<button type="button" class="webhook-var-chip" data-token="${this.escapeHtml(v.token)}" title="${label}" aria-label="${label}">${this.escapeHtml(v.token)}</button>`;
      }).join('');
    }

    if (textarea.dataset.bound !== 'true') {
      textarea.dataset.bound = 'true';
      textarea.addEventListener('input', () => SettingsUI.refreshWebhookPayloadValidation.call(this));

      if (chips) {
        // Keep the caret/selection in the textarea while the chip is pressed
        chips.addEventListener('mousedown', (e) => {
          if (e.target.closest('.webhook-var-chip')) e.preventDefault();
        });
        chips.addEventListener('click', (e) => {
          const chip = e.target.closest('.webhook-var-chip');
          if (chip) SettingsUI.insertWebhookVariable(chip.dataset.token);
        });
      }

      const resetBtn = document.querySelector('#webhookPayloadResetBtn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          textarea.value = WebhookBody.DEFAULT_TEMPLATE;
          SettingsUI._fireFieldEvents(textarea);
          textarea.focus();
        });
      }

      const helpBtn = document.querySelector('#webhookVariablesHelpBtn');
      if (helpBtn) helpBtn.addEventListener('click', () => SettingsUI.openWebhookVariablesHelp.call(this));
    }

    SettingsUI.refreshWebhookPayloadValidation.call(this);
};

SettingsUI._fireFieldEvents = function(field) {
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
};

/**
 * Insert a variable at the caret of the payload textarea, replacing the
 * selection, keep focus there and fire the events the form listens to.
 */
SettingsUI.insertWebhookVariable = function(token) {
    const textarea = document.querySelector('#webhookPayload');
    if (!textarea || !token) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.focus();
    textarea.setRangeText(token, start, end, 'end');
    SettingsUI._fireFieldEvents(textarea);
};

/**
 * "JSON válido / JSON inválido (línea X)" under the template, only when the
 * chosen Content-Type sends the template as JSON (everything but text/plain).
 */
SettingsUI.refreshWebhookPayloadValidation = function() {
    const textarea = document.querySelector('#webhookPayload');
    const status = document.querySelector('#webhookPayloadStatus');
    if (!textarea || !status || typeof WebhookBody === 'undefined') return;

    const contentType = (typeof SettingsUI.getWebhookContentTypeValue === 'function')
      ? SettingsUI.getWebhookContentTypeValue.call(this)
      : 'application/json';
    const checks = WebhookBody.expectsJsonTemplate(contentType) && textarea.value.trim() !== '';
    if (!checks) {
      status.hidden = true;
      status.textContent = '';
      status.className = 'webhook-json-status';
      textarea.removeAttribute('aria-invalid');
      return;
    }

    const result = WebhookBody.validateTemplate(textarea.value);
    status.hidden = false;
    if (result.ok) {
      status.className = 'webhook-json-status is-valid';
      status.textContent = SettingsUI._whTr('webhookJsonValid', 'Valid JSON');
      textarea.setAttribute('aria-invalid', 'false');
    } else {
      status.className = 'webhook-json-status is-invalid';
      status.textContent = SettingsUI._whTr('webhookJsonInvalidFmt', 'Invalid JSON (line {0})').split('{0}').join(String(result.line));
      textarea.setAttribute('aria-invalid', 'true');
    }
};

/**
 * Example values for the help list: the active tab and the popup's current
 * detections when there are some, otherwise the sample page.
 */
SettingsUI.webhookExampleContext = async function() {
    const ctx = WebhookBody.sampleContext();
    ctx.timestamp = new Date().toISOString();
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && /^https?:/i.test(tab.url || '')) {
        const url = new URL(tab.url);
        ctx.url = tab.url;
        ctx.hostname = url.hostname;
        ctx.title = tab.title || ctx.title;
        ctx.favicon = UrlUtils.getFaviconUrl(url.hostname, 64);
        const detections = (typeof window !== 'undefined' && Array.isArray(window.scrapflyDetection?.currentResults))
          ? window.scrapflyDetection.currentResults
          : [];
        if (detections.length) {
          ctx.detections = detections;
          ctx.detectionCount = detections.length;
          ctx.categories = [...new Set(detections.map(d => d.category).filter(Boolean))].join(',');
        }
      }
    } catch { /* keep the sample page */ }
    return ctx;
};

SettingsUI._webhookExampleText = function(variable, ctx) {
    if (variable.kind === 'json') {
      const list = (ctx.detections || []).map(d => ({
        name: d?.detector?.name || d?.name || 'Unknown',
        category: d?.category || null,
        confidence: typeof d?.confidence === 'number' ? d.confidence : null
      }));
      return JSON.stringify(list);
    }
    return String(ctx[variable.key] ?? '');
};

SettingsUI.openWebhookVariablesHelp = async function() {
    const host = document.querySelector('#settingsModal .base-modal-content') || document.body;
    const opener = document.querySelector('#webhookVariablesHelpBtn');
    const existing = document.querySelector('#webhookVariablesModal');
    if (existing) existing.remove();

    const ctx = await SettingsUI.webhookExampleContext();
    const copyFmt = SettingsUI._whTr('webhookVarsCopyFmt', 'Copy {0}');
    const exampleLabel = this.escapeHtml(SettingsUI._whTr('webhookVarsExample', 'Example'));
    const rows = WebhookBody.VARIABLES.map(v => {
      const example = SettingsUI._webhookExampleText(v, ctx);
      const copyLabel = this.escapeHtml(copyFmt.split('{0}').join(v.token));
      return `
        <li class="webhook-vars-row">
          <div class="webhook-vars-row-main">
            <div class="webhook-vars-row-top">
              <code class="webhook-var-chip webhook-var-chip--static">${this.escapeHtml(v.token)}</code>
              <span class="webhook-vars-desc">${this.escapeHtml(SettingsUI._whTr(v.descKey, v.desc))}</span>
            </div>
            <span class="webhook-vars-example" title="${this.escapeHtml(example.slice(0, 400))}"><span class="webhook-vars-example-label">${exampleLabel}:</span> ${this.escapeHtml(example)}</span>
          </div>
          <button type="button" class="webhook-vars-copy" data-token="${this.escapeHtml(v.token)}" title="${copyLabel}" aria-label="${copyLabel}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" stroke-width="2"/></svg>
          </button>
        </li>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'webhookVariablesModal';
    overlay.className = 'webhook-vars-overlay';
    overlay.innerHTML = `
      <div class="webhook-vars-card" role="dialog" aria-modal="true" aria-labelledby="webhookVariablesTitle" aria-describedby="webhookVariablesIntro">
        <div class="webhook-vars-header">
          <h3 id="webhookVariablesTitle">${this.escapeHtml(SettingsUI._whTr('webhookVarsTitle', 'Template variables'))}</h3>
          ${CloseButton.html({ className: 'webhook-vars-close' })}
        </div>
        <div class="webhook-vars-body">
          <p id="webhookVariablesIntro" class="webhook-vars-intro">${this.escapeHtml(SettingsUI._whTr('webhookVarsIntro', 'Replaced with the page values when the webhook is sent.'))}</p>
          <ul class="webhook-vars-list">${rows}</ul>
        </div>
      </div>`;
    host.appendChild(overlay);

    const close = () => {
      overlay.remove();
      if (opener) opener.focus();
    };
    overlay.addEventListener('click', async (e) => {
      if (e.target === overlay || e.target.closest('.webhook-vars-close')) { close(); return; }
      const copy = e.target.closest('.webhook-vars-copy');
      if (!copy) return;
      try {
        await navigator.clipboard.writeText(copy.dataset.token);
        NotificationHelper.micro(SettingsUI._whTr('copiedNotification', 'Copied'));
      } catch (error) {
        Logger.warn('UI', 'Copy webhook variable failed', { error: error.message });
      }
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === 'Tab') {
        const items = [...overlay.querySelectorAll('button')];
        const i = items.indexOf(document.activeElement);
        const next = items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length];
        if (next) { e.preventDefault(); next.focus(); }
      }
    });
    overlay.querySelector('.webhook-vars-close')?.focus();
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

    const secretField = document.querySelector('#webhookSecret');
    if (secretField) secretField.addEventListener('input', () => SettingsUI.refreshWebhookSecretUI.call(this));
    const generateSecretBtn = document.querySelector('#webhookSecretGenerateBtn');
    if (generateSecretBtn) generateSecretBtn.addEventListener('click', () => SettingsUI.generateWebhookSecret.call(this));
    const copySecretBtn = document.querySelector('#webhookSecretCopyBtn');
    if (copySecretBtn) copySecretBtn.addEventListener('click', () => SettingsUI.copyWebhookSecret.call(this));
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
