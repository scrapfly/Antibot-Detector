    /**
     * Render reCAPTCHA-specific tools
     */
ReCaptchaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'recaptchaClick',
                label: 'Obtain selector',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
                    </svg>
                `
            },
            {
                id: 'recaptchaExtract',
                label: 'Extract SiteKey',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/>
                    </svg>
                `
            },
            {
                id: 'recaptchaCallback',
                label: 'reCAPTCHA callback',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M17.45,15.18L22,7.31V19L17.45,15.18M1,3.24L3.77,6L5.55,7.78L16.78,19C16.84,19 16.89,19.05 16.95,19.06L19,21.07L20.59,19.48L2.59,1.48L1,3.24M8,8.97L8.02,5H17.64L15.27,9.45L8,8.97M12.65,12.74L18.13,18.23L15.76,22H8L10.14,17.94L12.65,12.74Z"/>
                    </svg>
                `
            },
            {
                id: 'recaptchaStartCapture',
                label: 'Start Capturing',
                kind: 'capture',
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22A9,9 0 0,0 21,13A9,9 0 0,0 12,4M12,8A5,5 0 0,0 7,13A5,5 0 0,0 12,18A5,5 0 0,0 17,13A5,5 0 0,0 12,8M12,10.5A2.5,2.5 0 0,1 14.5,13A2.5,2.5 0 0,1 12,15.5A2.5,2.5 0 0,1 9.5,13A2.5,2.5 0 0,1 12,10.5Z"/>
                    </svg>
                `
            }
        ]);
    };


    /**
     * Setup tool-specific event listeners
     */
ReCaptchaAdvanced.prototype.setupToolListeners = function() {
        Logger.network('[ReCAPTCHA] Setting up tool listeners...');
        Logger.network('[ReCAPTCHA] this.clickRecaptcha exists:', typeof this.clickRecaptcha);
        Logger.network('[ReCAPTCHA] this.extractSiteKey exists:', typeof this.extractSiteKey);
        Logger.network('[ReCAPTCHA] this.captureCallback exists:', typeof this.captureCallback);
        Logger.network('[ReCAPTCHA] this.startCapturing exists:', typeof this.startCapturing);

        this.bindToolActions([
            { id: 'recaptchaClick', method: () => {
                Logger.network('[ReCAPTCHA] Click button pressed!');
                try {
                    this.clickRecaptcha();
                } catch (e) {
                    Logger.error('NETWORK', '[ReCAPTCHA] Error in clickRecaptcha:', e);
                }
            }},
            { id: 'recaptchaExtract', method: () => {
                Logger.network('[ReCAPTCHA] Extract button pressed!');
                try {
                    this.extractSiteKey();
                } catch (e) {
                    Logger.error('NETWORK', '[ReCAPTCHA] Error in extractSiteKey:', e);
                }
            }},
            { id: 'recaptchaCallback', method: () => {
                Logger.network('[ReCAPTCHA] Callback button pressed!');
                try {
                    this.captureCallback();
                } catch (e) {
                    Logger.error('NETWORK', '[ReCAPTCHA] Error in captureCallback:', e);
                }
            }},
            { id: 'recaptchaStartCapture', method: () => this.startCapturing() }
        ]);

        ['recaptchaClick', 'recaptchaExtract', 'recaptchaCallback', 'recaptchaStartCapture'].forEach((id) => {
            const btn = document.querySelector(`#${id}`);
            Logger.network(`[ReCAPTCHA] Button #${id}:`, btn ? 'FOUND' : 'NOT FOUND');
            if (btn) {
                Logger.network(`[ReCAPTCHA] Added listener to #${id}`);
            }
        });
    };


    /**
     * Display selector click result modal
     */
ReCaptchaAdvanced.prototype.displaySelectorModal = function(result) {
        Logger.network('[ReCAPTCHA] displaySelectorModal called with:', result);
        const modal = this.createToolModal({ width: '95%' });
        modal.classList.add('advanced-modal-overlay');

        modal.innerHTML = `
            <div class="advanced-modal-container" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 24px; max-width: 600px; width: 95%;">
                <div class="advanced-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff); font-size: 16px; font-weight: 600;">Selector Detection</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="advanced-modal-body">
                    ${result.success ? `
                        <div class="advanced-modal-section" style="margin-bottom: 20px;">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Method</div>
                            <div style="color: var(--text-primary, #fff); font-size: 13px; padding: 10px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);">${result.method}</div>
                        </div>
                        ${result.selector ? `
                            <div class="advanced-modal-section">
                                <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Selector</div>
                                <code class="clickable-copy-value" data-copy="${result.selector}" data-copy-message="Selector copied to clipboard!" style="display: block; background: var(--bg-tertiary, #1a1a1a); padding: 14px; border-radius: 6px; color: var(--success, #4ade80); font-family: monospace; word-break: break-all; font-size: 13px; line-height: 1.5; cursor: pointer; transition: all 0.2s; user-select: text; border: 1px solid rgba(255, 255, 255, 0.1);">${result.selector}</code>
                            </div>
                        ` : ''}
                    ` : `
                        <div class="advanced-modal-section">
                            <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Error</div>
                            <div style="color: var(--error, #ef4444); font-size: 13px; padding: 10px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);">${result.error}</div>
                        </div>
                    `}
                </div>
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'Selector copied to clipboard!' });
        this.bindModalClose(modal);
        this.showToolModal(modal);

        // Add hover effect
        modal.querySelectorAll('.clickable-copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = 'var(--bg-tertiary)';
            });
        });
    };


    /**
     * Display extracted sitekey modal
     */
ReCaptchaAdvanced.prototype.displaySiteKeyModal = function(sitekey) {
        Logger.network('[ReCAPTCHA] displaySiteKeyModal called with:', sitekey);
        const modal = this.createToolModal({ width: '95%' });
        modal.classList.add('recaptcha-modal-overlay');

        modal.innerHTML = `
            <div class="recaptcha-modal" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 24px; max-width: 600px; width: 95%;">
                <div class="recaptcha-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff); font-size: 16px;">Extracted SiteKey</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="recaptcha-modal-content">
                    <div class="sitekey-display" style="display: flex; flex-direction: column; gap: 14px;">
                        <code class="sitekey-code clickable-copy-value" data-copy="${sitekey}" data-copy-message="SiteKey copied to clipboard!" style="display: block; background: var(--bg-tertiary, #1a1a1a); padding: 14px; border-radius: 6px; color: var(--success, #4ade80); font-family: monospace; word-break: break-all; font-size: 13px; line-height: 1.5; cursor: pointer; transition: all 0.2s; user-select: text;">${sitekey}</code>
                    </div>
                </div>
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: 'SiteKey copied to clipboard!' });
        this.bindModalClose(modal);
        this.showToolModal(modal);

        // Add hover effect
        modal.querySelectorAll('.clickable-copy-value').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = 'var(--bg-tertiary)';
            });
        });
    };


    /**
     * Display version check results modal
     */
ReCaptchaAdvanced.prototype.displayVersionModal = function(versionData) {
        Logger.network('[ReCAPTCHA] displayVersionModal called with:', versionData);
        const modal = this.createToolModal();
        modal.classList.add('recaptcha-modal-overlay');

        modal.innerHTML = `
            <div class="recaptcha-modal" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 20px; max-width: 500px; width: 90%;">
                <div class="recaptcha-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff);">Version Detection</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="recaptcha-modal-content">
                    <div class="version-info" style="margin-bottom: 16px;">
                        <div class="version-main" style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; margin-bottom: 8px;">
                            <span class="version-label" style="color: var(--text-secondary, #aaa);">Version:</span>
                            <span class="version-value" style="color: var(--text-primary, #fff); font-weight: 600;">${versionData.version}</span>
                        </div>
                        <div class="version-type" style="display: flex; justify-content: space-between; padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px;">
                            <span class="version-label" style="color: var(--text-secondary, #aaa);">Type:</span>
                            <span class="version-value" style="color: var(--text-primary, #fff); font-weight: 600;">${versionData.type}</span>
                        </div>
                        ${versionData.enterprise ? '<div class="enterprise-badge" style="margin-top: 8px; padding: 8px; background: var(--warning, #fbbf24); color: #000; border-radius: 4px; text-align: center; font-weight: 600;">⭐ Enterprise</div>' : ''}
                    </div>
                    <div class="version-checks" style="display: flex; flex-direction: column; gap: 8px;">
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV2Checkbox ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV2Checkbox ? 'Yes' : 'No'} V2 Checkbox
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV2Iframe ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV2Iframe ? 'Yes' : 'No'} V2 Iframe
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasV3Script ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasV3Script ? 'Yes' : 'No'} V3 Script
                        </div>
                        <div class="check-item" style="padding: 8px; background: var(--bg-tertiary, #1a1a1a); border-radius: 4px; color: ${versionData.checks.hasInvisible ? 'var(--success, #4ade80)' : 'var(--text-secondary, #aaa)'};">
                            ${versionData.checks.hasInvisible ? 'Yes' : 'No'} Invisible
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindModalClose(modal);
        this.showToolModal(modal);
    };


    /**
     * Display callback functions modal
     */
ReCaptchaAdvanced.prototype.displayCallbackModal = function(data) {
        Logger.network('[ReCAPTCHA] displayCallbackModal called with:', data);
        const modal = this.createToolModal();
        modal.classList.add('recaptcha-modal-overlay');

        const { clients = [], domCallbacks = [], scriptCallbacks = [] } = data;
        const hasClients = clients.length > 0;
        const hasDomCallbacks = domCallbacks.length > 0;
        const hasScriptCallbacks = scriptCallbacks.length > 0;

        modal.innerHTML = `
            <div class="recaptcha-modal" style="background: var(--bg-secondary, #2a2a2a); border-radius: 8px; padding: 24px; max-width: 650px; width: 95%; max-height: 85vh; overflow-y: auto;">
                <div class="recaptcha-modal-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h3 style="margin: 0; color: var(--text-primary, #fff); font-size: 16px; font-weight: 600;">reCAPTCHA Callbacks</h3>
                    <button class="advanced-modal-close-btn">×</button>
                </div>
                <div class="recaptcha-modal-content" style="display: flex; flex-direction: column; gap: 24px;">

                    ${hasClients ? `
                    <!-- reCAPTCHA Clients Section -->
                    <div class="clients-section">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">reCAPTCHA Clients</h4>
                        <div style="display: flex; flex-direction: column; gap: 14px;">
                            ${clients.map(client => `
                                <div class="client-card" style="background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; padding: 16px; border: 1px solid rgba(255, 255, 255, 0.1);">
                                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
                                        <div style="display: flex; align-items: center; gap: 10px;">
                                            <span style="background: ${client.version === 'V3' ? '#8b5cf6' : '#3b82f6'}; color: white; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 700;">
                                                ${client.version}
                                            </span>
                                            <span style="color: var(--text-secondary); font-size: 12px;">Client ID: ${client.id}</span>
                                        </div>
                                    </div>

                                    ${client.sitekey ? `
                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">SiteKey</div>
                                        <code class="callback-value-clickable" data-copy="${client.sitekey}" data-copy-message="Copied to clipboard!" style="color: var(--success, #4ade80); font-size: 12px; font-family: monospace; background: var(--bg-primary); padding: 8px 10px; border-radius: 4px; display: block; overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.05); cursor: pointer; transition: all 0.2s; user-select: text;">${client.sitekey}</code>
                                    </div>
                                    ` : ''}

                                    ${client.callback ? `
                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Callback Function</div>
                                        <code class="callback-value-clickable" data-copy="${client.callback}" data-copy-message="Copied to clipboard!" style="color: var(--success, #4ade80); font-size: 12px; font-family: monospace; background: var(--bg-primary); padding: 8px 10px; border-radius: 4px; display: block; border: 1px solid rgba(255, 255, 255, 0.05); cursor: pointer; transition: all 0.2s; user-select: text;">${client.callback}</code>
                                    </div>

                                    <div style="margin-bottom: 12px;">
                                        <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Callback Path</div>
                                        <code class="callback-value-clickable" data-copy="${client.callbackPath}" data-copy-message="Copied to clipboard!" style="color: var(--text-secondary); font-size: 11px; font-family: monospace; background: var(--bg-primary); padding: 8px 10px; border-radius: 4px; display: block; overflow-x: auto; white-space: nowrap; border: 1px solid rgba(255, 255, 255, 0.05); cursor: pointer; transition: all 0.2s; user-select: text;">${client.callbackPath}</code>
                                    </div>
                                    ` : `
                                    <div style="padding: 10px; background: var(--bg-secondary); border-radius: 4px; font-size: 12px; color: var(--text-secondary);">
                                        No callback defined
                                    </div>
                                    `}

                                    ${client.pageurl ? `
                                    <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px; color: var(--text-secondary);">
                                        ${client.pageurl}
                                    </div>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${hasDomCallbacks ? `
                    <!-- DOM Callbacks Section -->
                    <div class="dom-callbacks-section">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">DOM Callbacks</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${domCallbacks.map(cb => `
                                <code class="callback-value-clickable" data-copy="${cb}" data-copy-message="Copied to clipboard!" style="color: var(--success, #4ade80); font-family: monospace; font-size: 12px; padding: 12px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1); display: block; overflow-x: auto; cursor: pointer; transition: all 0.2s; user-select: text;">${cb}</code>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${hasScriptCallbacks ? `
                    <!-- Script Callbacks Section -->
                    <div class="script-callbacks-section">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">Script Callbacks</h4>
                        <div style="display: flex; flex-direction: column; gap: 10px;">
                            ${scriptCallbacks.map(cb => `
                                <code class="callback-value-clickable" data-copy="${cb}" data-copy-message="Copied to clipboard!" style="color: var(--success, #4ade80); font-family: monospace; font-size: 12px; padding: 12px; background: var(--bg-tertiary, #1a1a1a); border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1); display: block; overflow-x: auto; cursor: pointer; transition: all 0.2s; user-select: text;">${cb}</code>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}

                    ${hasDomCallbacks ? `
                    <!-- DOM Callbacks Usage Examples -->
                    <div class="usage-examples-section" style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 24px;">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">Callback Usage Examples</h4>
                        ${domCallbacks.map(cb => `
                        <div style="margin-bottom: 16px;">
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Using callback: <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px; color: var(--success)">${cb}</code></div>
                            <code style="color: var(--success, #4ade80); font-family: monospace; font-size: 11px; padding: 12px; background: var(--bg-primary); border-radius: 4px; display: block; overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.05); line-height: 1.6; white-space: pre-wrap; word-break: break-word;">// When reCAPTCHA loads, this callback is called
function ${cb}(token) {
  Logger.network('reCAPTCHA token:', token);

  // NOTE: Endpoint and method may vary - change to match your backend
  fetch('/verify-captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      Logger.network('Verification successful!');
    }
  });
}</code>
                        </div>
                        `).join('')}
                    </div>
                    ` : ''}

                    ${hasScriptCallbacks && !hasDomCallbacks ? `
                    <!-- Script Callbacks Usage Examples -->
                    <div class="usage-examples-section" style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 24px;">
                        <h4 style="margin: 0 0 16px 0; color: var(--text-primary, #fff); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--accent);">Callback Usage Examples</h4>
                        ${scriptCallbacks.map(cb => `
                        <div style="margin-bottom: 16px;">
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">Using callback: <code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 3px; color: var(--success)">${cb}</code></div>
                            <code style="color: var(--success, #4ade80); font-family: monospace; font-size: 11px; padding: 12px; background: var(--bg-primary); border-radius: 4px; display: block; overflow-x: auto; border: 1px solid rgba(255, 255, 255, 0.05); line-height: 1.6; white-space: pre-wrap; word-break: break-word;">// When reCAPTCHA completes, this callback is invoked
function ${cb}(token) {
  Logger.network('reCAPTCHA token:', token);

  // NOTE: Endpoint and method may vary - change to match your backend
  fetch('/verify-captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: token })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      Logger.network('Verification successful!');
    }
  });
}</code>
                        </div>
                        `).join('')}
                    </div>
                    ` : ''}

                </div>
            </div>
        `;

        this.bindCopyValueHandlers(modal, {
            defaultMessage: 'Copied to clipboard!',
            selector: '.callback-value-clickable[data-copy]'
        });
        this.bindModalClose(modal);
        this.showToolModal(modal);

        // Add hover effect
        modal.querySelectorAll('.callback-value-clickable').forEach(element => {
            element.addEventListener('mouseenter', () => {
                element.style.background = 'rgba(255, 255, 255, 0.08)';
            });
            element.addEventListener('mouseleave', () => {
                element.style.background = 'var(--bg-primary)';
            });
        });
    };


    /**
     * Render capture history items (reCAPTCHA-specific format)
     */
ReCaptchaAdvanced.prototype.renderCaptureHistoryItems = function(items) {
        return items.map((item) => {
            const { url, hostname, captureData, timestamp } = item;
            const { version, siteKey, isEnterprise, isInvisible } = captureData;

            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname);

            let versionDisplay = version;
            if (isEnterprise) {
                versionDisplay += ' Enterprise';
            }
            if (version === 'v2' && isInvisible) {
                versionDisplay += ' Invisible';
            }

            return `
                <div class="capture-card" data-capture-id="${item.id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${hostname}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${hostname}</span>
                                <span class="capture-time">${timeAgo}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">Version</span>
                                <span class="capture-type-value">${versionDisplay}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${item.id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                    <div class="capture-sitekey-container">
                        <code class="capture-sitekey-code">${siteKey}</code>
                    </div>
                </div>
            `;
        }).join('');
    };


    /**
     * Override renderCaptureDetailsContent to show reCAPTCHA-specific fields in modal
     * @param {object} capture - Capture data object
     * @returns {string} HTML for modal body content
     */
ReCaptchaAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        if (!capture || !capture.captureData) {
            return '<div class="advanced-modal-section"><span class="advanced-modal-error">No capture data available</span></div>';
        }

        const data = capture.captureData;
        const siteUrl = AdvancedUtils.escapeHtml(data.siteUrl || capture.url || '');
        const timestamp = new Date(capture.timestamp).toLocaleString();

        // Transform version display: v2 -> reCAPTCHA v2, v3 -> reCAPTCHA v3
        const versionDisplay = data.version ? `reCAPTCHA ${data.version}` : null;

        // Build features list (only show true/yes features)
        let features = [];
        if (data.isEnterprise) features.push('Enterprise');
        if (data.isInvisible) features.push('Invisible');
        if (data.isSRequired) features.push('S Parameter Required');
        if (data.hasSession) features.push('Has Session');

        return `
            <div style="display: flex; flex-direction: column; gap: 14px;">
                <!-- Primary Info Card -->
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
                    ${versionDisplay ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Version</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; font-weight: 600;" data-copy="${AdvancedUtils.escapeHtml(data.version)}" data-copy-message="Version copied" title="Click to copy">${AdvancedUtils.escapeHtml(versionDisplay)}</div>
                    </div>
                    ` : ''}
                    ${data.action ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Action</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all;" data-copy="${AdvancedUtils.escapeHtml(data.action)}" data-copy-message="Action copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.action)}</div>
                    </div>
                    ` : ''}
                </div>

                <!-- Site Key Card -->
                ${data.siteKey ? `
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Site Key</div>
                    <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all; padding: 8px;" data-copy="${AdvancedUtils.escapeHtml(data.siteKey)}" data-copy-message="Site Key copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.siteKey)}</div>
                </div>
                ` : ''}

                <!-- API Domain & Cookie Card -->
                ${data.apiDomain || data.requiredCookie ? `
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px; display: grid; grid-template-columns: ${data.apiDomain && data.requiredCookie ? '1fr 1fr' : '1fr'}; gap: 14px;">
                    ${data.apiDomain ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">API Domain</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all;" data-copy="${AdvancedUtils.escapeHtml(data.apiDomain)}" data-copy-message="API Domain copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.apiDomain)}</div>
                    </div>
                    ` : ''}
                    ${data.requiredCookie ? `
                    <div>
                        <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 6px;">Required Cookie</div>
                        <div class="copy-value" style="color: #4ade80; font-family: monospace; font-size: 12px; word-break: break-all;" data-copy="${AdvancedUtils.escapeHtml(data.requiredCookie)}" data-copy-message="Cookie copied" title="Click to copy">${AdvancedUtils.escapeHtml(data.requiredCookie)}</div>
                    </div>
                    ` : ''}
                </div>
                ` : ''}

                <!-- Features Card (only if features exist) -->
                ${features.length > 0 ? `
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 10px;">Features Detected</div>
                    <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                        ${features.map(f => `<span style="background: rgba(74, 222, 128, 0.15); color: #4ade80; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;">${f}</span>`).join('')}
                    </div>
                </div>
                ` : ''}

                <!-- Site URL Card -->
                <div style="background: var(--bg-tertiary); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;">Site URL</div>
                    <div class="copy-value" style="color: #60a5fa; font-size: 12px; word-break: break-all; padding: 8px;" data-copy="${siteUrl}" data-copy-message="URL copied" title="Click to copy">${siteUrl}</div>
                </div>

                <!-- Metadata Card -->
                <div style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 14px;">
                    <div style="font-size: 10px; color: var(--text-secondary);">Captured: <span style="color: var(--text-primary); font-weight: 600;">${timestamp}</span></div>
                </div>
            </div>
        `;
    };
