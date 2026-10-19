    /**
     * Render reCAPTCHA-specific tools
     */
ReCaptchaAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'recaptchaClick',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnObtainSelector')) || 'Obtain selector'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,2A3,3 0 0,1 15,5V11A3,3 0 0,1 12,14A3,3 0 0,1 9,11V5A3,3 0 0,1 12,2M19,11C19,14.53 16.39,17.44 13,17.93V21H11V17.93C7.61,17.44 5,14.53 5,11H7A5,5 0 0,0 12,16A5,5 0 0,0 17,11H19Z"/>
                    </svg>
                `
            },
            {
                id: 'recaptchaExtract',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnExtractSiteKey')) || 'Extract SiteKey'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/>
                    </svg>
                `
            },
            {
                id: 'recaptchaCallback',
                label: recaptchaText('advRecaptchaCallbackTool', 'reCAPTCHA callback'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M17.45,15.18L22,7.31V19L17.45,15.18M1,3.24L3.77,6L5.55,7.78L16.78,19C16.84,19 16.89,19.05 16.95,19.06L19,21.07L20.59,19.48L2.59,1.48L1,3.24M8,8.97L8.02,5H17.64L15.27,9.45L8,8.97M12.65,12.74L18.13,18.23L15.76,22H8L10.14,17.94L12.65,12.74Z"/>
                    </svg>
                `
            },
            {
                id: 'recaptchaStartCapture',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnStartCapturing')) || 'Start Capturing'),
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
        Logger.debug('NETWORK', '[ReCAPTCHA] Setting up tool listeners');
        Logger.network('[ReCAPTCHA] this.clickRecaptcha exists:', typeof this.clickRecaptcha);
        Logger.network('[ReCAPTCHA] this.extractSiteKey exists:', typeof this.extractSiteKey);
        Logger.network('[ReCAPTCHA] this.captureCallback exists:', typeof this.captureCallback);
        Logger.network('[ReCAPTCHA] this.startCapturing exists:', typeof this.startCapturing);

        this.bindToolActions([
            { id: 'recaptchaClick', method: () => this.clickRecaptcha() },
            { id: 'recaptchaExtract', method: () => this.extractSiteKey() },
            { id: 'recaptchaCallback', method: () => this.captureCallback() },
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
        this.recordStructuredResult('displaySelectorModal', result);
        Logger.network('[ReCAPTCHA] displaySelectorModal called with:', result);
        const K = BaseAdvancedModule;
        let errorText = result.error;
        if (result.errorKey === 'noElements') {
            errorText = recaptchaText('advRecaptchaNoElements', 'No reCAPTCHA elements found');
        } else if (result.errorKey === 'executeFailed') {
            errorText = recaptchaText('advRecaptchaExecuteFailedFmt', 'grecaptcha.execute() failed: {0}', result.errorDetail || '');
        }
        const body = result.success
            ? K.kitField(recaptchaText('advRecaptchaMethod', 'Method'), result.method, { mono: false })
              + K.kitField(recaptchaText('advRecaptchaSelector', 'Selector'), result.selector, { wrap: true })
            : K.kitNote(errorText || '', 'error');
        this.openKitModal({
            title: recaptchaText('advRecaptchaSelectorDetection', 'Selector Detection'),
            subtitle: 'reCAPTCHA',
            iconSvg: ReCaptchaAdvanced.KIT_ICONS.selector,
            body,
            copiedMessage: recaptchaText('advRecaptchaSelectorCopied', 'Selector copied to clipboard!')
        });
    };



    /**
     * Display callback functions modal: one card per grecaptcha client
     * (version, site key, callback name and path), then the callbacks found
     * in the DOM and in scripts, then a ready-to-adapt example.
     */
ReCaptchaAdvanced.prototype.displayCallbackModal = function(data) {
        this.recordStructuredResult('displayCallbackModal', data);
        Logger.network('[ReCAPTCHA] displayCallbackModal called with:', data);
        const K = BaseAdvancedModule;
        const { clients = [], domCallbacks = [], scriptCallbacks = [] } = data || {};

        const clientCards = clients.map((client) => K.kitCard(
            (client.callback
                ? K.kitField(recaptchaText('advRecaptchaCallbackFunction', 'Callback Function'), client.callback)
                  + K.kitField(recaptchaText('advRecaptchaCallbackPath', 'Callback Path'), client.callbackPath)
                : K.kitNote(recaptchaText('advRecaptchaNoCallback', 'No callback defined')))
            + K.kitField(recaptchaText('advCommonPage', 'Page'), client.pageurl, { mono: false })
        )).join('');

        const list = (items) => items.map(cb => K.kitField(recaptchaText('advRecaptchaCallbackFunction', 'Callback Function'), cb)).join('');

        // One example, for the first callback found anywhere
        const exampleName = (clients.find(c => c.callback) || {}).callback || domCallbacks[0] || scriptCallbacks[0] || '';
        const example = exampleName ? `// reCAPTCHA calls ${exampleName}(token) once it is solved.
// Call it yourself with a solved token to submit the form the same way:
${exampleName}(token);

// Or define it before the widget loads to receive the token:
window.${exampleName} = function (token) {
  // Endpoint and payload depend on the site: adapt them
  fetch('/verify-captcha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token })
  });
};` : '';

        const empty = !clients.length && !domCallbacks.length && !scriptCallbacks.length;
        const body = empty
            ? K.kitNote(recaptchaText('advRecaptchaNoCallbacksFound', 'No reCAPTCHA clients or callbacks were found on this page.'))
            : K.kitSection(recaptchaText('advRecaptchaClientsTitle', 'reCAPTCHA Clients'), clientCards, clients.length || '')
              + K.kitSection(recaptchaText('advRecaptchaDomCallbacks', 'DOM Callbacks'), list(domCallbacks), domCallbacks.length || '')
              + K.kitSection(recaptchaText('advRecaptchaScriptCallbacks', 'Script Callbacks'), list(scriptCallbacks), scriptCallbacks.length || '')
              + K.kitSection(recaptchaText('advRecaptchaCallbackExamples', 'Callback Usage Examples'), K.kitCode(exampleName, example));

        this.openKitModal({
            title: recaptchaText('advRecaptchaCallbacksTitle', 'reCAPTCHA Callbacks'),
            subtitle: (clients[0] && clients[0].pageurl) || '',
            iconSvg: ReCaptchaAdvanced.KIT_ICONS.callback,
            body,
            copiedMessage: recaptchaText('advRecaptchaCopiedToClipboard', 'Copied to clipboard!')
        });
    };

/** Header icons for the reCAPTCHA result dialogs (stroke icons, 24px grid). */
ReCaptchaAdvanced.KIT_ICONS = {
    selector: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l7 17 2.5-7.5L20 10z"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L20 3M16 7l3 3M14 9l2 2"/></svg>',
    callback: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>'
};


    /**
     * Render capture history items (reCAPTCHA-specific format)
     */
ReCaptchaAdvanced.prototype.renderCaptureHistoryItems = function(items) {
        return items.map((item) => {
            const { captureData, timestamp } = item;
            const { version, siteKey, isEnterprise, isInvisible } = captureData;
            const esc = FormatUtils.escapeHtml, attr = FormatUtils.escapeAttr;
            const hostname = String(item.hostname || '');
            const id = attr(String(item.id || timestamp || ''));

            const timeAgo = this.getTimeAgo(timestamp);
            const faviconUrl = attr(UrlUtils.resolveDisplayFavicon(item.favicon, item.url || hostname));

            const versionParts = [version];
            if (isEnterprise) {
                versionParts.push(recaptchaText('advCommonEnterprise', 'Enterprise'));
            }
            if (version === 'v2' && isInvisible) {
                versionParts.push(recaptchaText('advRecaptchaInvisible', 'Invisible'));
            }
            const versionDisplay = versionParts.join(' ');

            return `
                <div class="capture-card" data-capture-id="${id}">
                    <div class="capture-card-top">
                        <img src="${faviconUrl}" class="capture-favicon" alt="${attr(hostname)}">
                        <div class="capture-info">
                            <div class="capture-hostname-row">
                                <span class="capture-hostname">${esc(hostname)}</span>
                                <span class="capture-time">${esc(timeAgo)}</span>
                            </div>
                            <div class="capture-type-row">
                                <span class="capture-type-label">${recaptchaText('ruleFieldVersion', 'Version')}</span>
                                <span class="capture-type-value">${esc(versionDisplay)}</span>
                            </div>
                        </div>
                        <button class="capture-expand" data-capture-id="${id}">
                            <span class="expand-arrow">›</span>
                        </button>
                    </div>
                    <div class="capture-sitekey-container">
                        <code class="capture-sitekey-code">${FormatUtils.escapeHtml(siteKey)}</code>
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
        const K = BaseAdvancedModule;
        if (!capture || !capture.captureData) {
            return K.kitNote(recaptchaText('advCommonNoCaptureData', 'No capture data available'));
        }
        const data = capture.captureData;
        // Only the features that are on, as chips
        const features = [
            data.isEnterprise ? recaptchaText('advCommonEnterprise', 'Enterprise') : '',
            data.isInvisible ? recaptchaText('advRecaptchaInvisible', 'Invisible') : '',
            data.isSRequired ? recaptchaText('advRecaptchaSParamRequired', 'S Parameter Required') : '',
            data.hasSession ? recaptchaText('advRecaptchaHasSession', 'Has Session') : ''
        ].filter(Boolean);
        const facts = K.kitFacts([
            data.version ? { label: recaptchaText('ruleFieldVersion', 'Version'), value: `reCAPTCHA ${data.version}` } : null,
            features.length ? { label: recaptchaText('advRecaptchaFeaturesDetected', 'Features Detected'), html: true,
                value: `<span class="adv-kit-chips">${features.map(name => K.kitChip(name, 'green')).join('')}</span>` } : null,
            { label: recaptchaText('advCommonCaptured', 'Captured'), value: recaptchaDateTime(capture.timestamp) }
        ]);
        const fields = K.kitField(recaptchaText('advCommonSiteKey', 'Site Key'), data.siteKey, { wrap: true })
            + K.kitField(recaptchaText('advRecaptchaAction', 'Action'), data.action)
            + K.kitField(recaptchaText('advCommonApiDomain', 'API Domain'), data.apiDomain)
            + K.kitField(recaptchaText('advRecaptchaRequiredCookie', 'Required Cookie'), data.requiredCookie)
            + K.kitField(recaptchaText('advCommonSiteUrl', 'Site URL'), data.siteUrl || capture.url, { mono: false, wrap: true });
        return facts + (fields ? K.kitCard(fields) : '');
    };
