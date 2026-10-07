CloudflareAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'cloudflareCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'cloudflareExtractSiteKey',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnExtractSiteKey')) || 'Extract Site Key'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3M12,17A2,2 0 0,0 10,19A2,2 0 0,0 12,21A2,2 0 0,0 14,19A2,2 0 0,0 12,17Z"/>
                    </svg>
                `
            },
            {
                id: 'cloudflareAnalyzeScripts',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnAnalyzeScripts')) || 'Analyze Scripts'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"/>
                    </svg>
                `
            }
        ]);
    };


/**
 * Display label for a Cloudflare type (stored English values stay unchanged in history).
 */
CloudflareAdvanced.prototype.cloudflareTypeLabel = function(type) {
        const labels = {
            'Challenge': () => this._txt('advCloudflareTypeChallenge', 'Challenge'),
            'Turnstile + Challenge': () => 'Turnstile + ' + this._txt('advCloudflareTypeChallenge', 'Challenge'),
            'Analytics': () => this._txt('advCloudflareTypeAnalytics', 'Analytics'),
            'Bot Management': () => this._txt('advCloudflareTypeBotManagement', 'Bot Management'),
            'Unknown': () => this._txt('timeUnknown', 'Unknown')
        };
        return labels[type] ? labels[type]() : type;
    };


CloudflareAdvanced.prototype.setupToolListeners = function() {
        Logger.network('[Cloudflare] Setting up tool listeners...');
        this.bindToolActions([
            { id: 'cloudflareCheckCookies', handler: () => this.checkCookies() },
            { id: 'cloudflareExtractSiteKey', handler: () => this.extractSiteKey() },
            { id: 'cloudflareAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
        Logger.network('[Cloudflare] Added listener to Check Cookies button');
        Logger.network('[Cloudflare] Added listener to Extract Site Key button');
        Logger.network('[Cloudflare] Added listener to Analyze Scripts button');
    };


CloudflareAdvanced.prototype.renderCaptureHistoryItems = function(historyItems) {
        const items = Array.isArray(historyItems) ? historyItems : [historyItems];
        return items.map((item, index) => {
            const data = item.captureData || item.data || {};
            const timestamp = new Date(item.timestamp).toLocaleString();
            const type = data.type || 'Unknown';

            let typeColor = '#6366F1';
            if (type === 'Turnstile') {
                typeColor = '#0074BF';
            } else if (type === 'Challenge') {
                typeColor = '#F97316';
            } else if (type === 'Turnstile + Challenge') {
                typeColor = '#9333EA';
            }

            return `
                <div class="history-item" data-id="capture-${index}" style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px; cursor: pointer; transition: background 0.2s; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: linear-gradient(135deg, ${typeColor} 0%, ${typeColor}dd 100%); color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: 500;">${this.cloudflareTypeLabel(type)}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${timestamp}</div>
                    </div>
                    ${data.sitekey ? `<div style="font-size: 12px; color: var(--text-secondary);">${this._txt('advCloudflareSitekeyLabel', 'Sitekey:')} ${data.sitekey.substring(0, 30)}${data.sitekey.length > 30 ? '...' : ''}</div>` : ''}
                    ${data.siteURL ? `<div style="font-size: 12px; color: var(--text-secondary);">${this._txt('advCloudflareUrlLabel', 'URL:')} ${data.siteURL.substring(0, 50)}${data.siteURL.length > 50 ? '...' : ''}</div>` : ''}
                </div>
            `;
        }).join('');
    };


CloudflareAdvanced.prototype.renderCaptureDetailsContent = function(capture) {
        const data = capture.captureData || capture.data || {};
        const timestamp = new Date(capture.timestamp).toLocaleString();
        const url = AdvancedUtils.escapeHtml(capture.url || 'N/A');

        const type = data.type || 'Unknown';
        const cdata = data.cdata || 'N/A';
        const cAction = data.cAction || 'N/A';
        const sitekey = data.sitekey || 'N/A';
        const siteURL = data.siteURL || 'N/A';

        return `
            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advCommonUrl', 'URL')}</label>
                <div class="advanced-modal-code-block" data-copy="${url}">${url}</div>
            </div>

            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advCloudflareTypeLabel', 'Type')}</label>
                <div class="advanced-modal-code-block" data-copy="${type}">${this.cloudflareTypeLabel(type)}</div>
            </div>

            ${type.includes('Turnstile') ? `
                <div class="advanced-modal-section">
                    <label class="advanced-modal-label">${this._txt('advCommonSiteKey', 'Site Key')}</label>
                    <div class="advanced-modal-code-block" data-copy="${sitekey}" style="word-break: break-all;">${FormatUtils.escapeHtml(sitekey)}</div>
                </div>

                <div class="advanced-modal-section">
                    <label class="advanced-modal-label">cdata</label>
                    <div class="advanced-modal-code-block" data-copy="${cdata}" style="word-break: break-all; font-size: 11px;">${cdata === 'N/A' ? cdata : cdata.substring(0, 100) + (cdata.length > 100 ? '...' : '')}</div>
                </div>

                <div class="advanced-modal-section">
                    <label class="advanced-modal-label">cAction</label>
                    <div class="advanced-modal-code-block" data-copy="${cAction}" style="word-break: break-all;">${cAction}</div>
                </div>
            ` : ''}

            <div class="advanced-modal-section">
                <label class="advanced-modal-label">${this._txt('advCommonSiteUrl', 'Site URL')}</label>
                <div class="advanced-modal-code-block" data-copy="${siteURL}" style="word-break: break-all;">${FormatUtils.escapeHtml(siteURL)}</div>
            </div>

            <!-- Timestamp Section (at bottom) -->
            <div class="advanced-modal-section" style="margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
                <div class="advanced-modal-info-row">
                    <span class="advanced-modal-info-label">${this._txt('advCommonCaptured', 'Captured')}</span>
                    <span class="advanced-modal-info-value">${timestamp}</span>
                </div>
            </div>
        `;
    };


CloudflareAdvanced.prototype.displayAnalysisModal = function(data) {
        const modal = this.createToolModal();

        const scripts = data?.scripts || [];

        // Group scripts by type
        const typeColors = {
            'Turnstile': { gradient: 'linear-gradient(135deg, #0074BF 0%, #0061B3 100%)', bg: '#0074BF' },
            'Challenge': { gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)', bg: '#F97316' },
            'CDN': { gradient: 'linear-gradient(135deg, #6B7280 0%, #4B5563 100%)', bg: '#6B7280' },
            'Analytics': { gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', bg: '#10B981' },
            'Bot Management': { gradient: 'linear-gradient(135deg, #9333EA 0%, #7E22CE 100%)', bg: '#9333EA' },
            'Cloudflare': { gradient: 'linear-gradient(135deg, #F97316 0%, #EA580C 100%)', bg: '#F97316' }
        };

        const groupedScripts = {};
        scripts.forEach(script => {
            const type = script.type || 'Cloudflare';
            if (!groupedScripts[type]) {
                groupedScripts[type] = [];
            }
            groupedScripts[type].push(script);
        });

        // Generate HTML for grouped scripts
        let scriptHTML = '';
        Object.keys(groupedScripts).forEach(type => {
            const typeScripts = groupedScripts[type];
            const colors = typeColors[type] || typeColors['Cloudflare'];
            scriptHTML += `
                <div style="margin-bottom: 16px;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                        <span style="font-weight: 600; color: var(--text-primary);">${this._txt('advCommonScriptsTitleFmt', '{0} Scripts ({1})', this.cloudflareTypeLabel(type), typeScripts.length)}</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        ${typeScripts.map((script, idx) => `
                            <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span style="background: ${colors.gradient}; color: white; padding: 3px 8px; border-radius: 3px; font-size: 10px; font-weight: 500;">${this.cloudflareTypeLabel(type)}</span>
                                    <span style="font-size: 12px; color: var(--text-secondary);">#${idx + 1}</span>
                                </div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 11px; color: var(--text-primary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${script.url}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${this._txt('advCommonScriptsTitleFmt', '{0} Scripts ({1})', 'Cloudflare', scripts.length)}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <div style="display: flex; flex-direction: column;">
                    ${scriptHTML}
                </div>

                ${scripts.length > 0 ? `
                    <button class="modal-export-code-btn" style="margin-top: 16px; width: 100%; padding: 10px; background: linear-gradient(135deg, #F97316 0%, #EA580C 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span>${this._txt('advCommonExportCode', 'Export Code')}</span>
                    </button>
                ` : ''}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: this._txt('advCommonUrlCopied', 'URL copied') });
        this.bindModalClose(modal);

        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn && scripts.length > 0) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.displayExportCodeModal(scripts);
            });
        }

        this.showToolModal(modal);
    };


CloudflareAdvanced.prototype.displayExportCodeModal = function(scripts) {
        const urls = scripts.map(s => s.url);
        return AdvancedCodeDialog.open(this, {
            title: this._txt('advCommonExportCode', 'Export Code'),
            languages: ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'].map(label => ({ id: label, label })),
            getCode: (type, language) => this.generateCloudflareParsingCode(urls, language)
        });
    };
