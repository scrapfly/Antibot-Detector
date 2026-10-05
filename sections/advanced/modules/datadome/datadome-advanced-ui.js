    /**
     * Render DataDome-specific tools
     */
DataDomeAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'datadomeCheckCookies',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckCookies')) || 'Check Cookies'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M9,8A1.5,1.5 0 0,1 10.5,9.5A1.5,1.5 0 0,1 9,11A1.5,1.5 0 0,1 7.5,9.5A1.5,1.5 0 0,1 9,8M16.5,9.5A1.5,1.5 0 0,1 15,11A1.5,1.5 0 0,1 13.5,9.5A1.5,1.5 0 0,1 15,8A1.5,1.5 0 0,1 16.5,9.5M9,15A1.5,1.5 0 0,1 10.5,16.5A1.5,1.5 0 0,1 9,18A1.5,1.5 0 0,1 7.5,16.5A1.5,1.5 0 0,1 9,15M15,14A1.5,1.5 0 0,1 16.5,15.5A1.5,1.5 0 0,1 15,17A1.5,1.5 0 0,1 13.5,15.5A1.5,1.5 0 0,1 15,14Z"/>
                    </svg>
                `
            },
            {
                id: 'datadomeAnalyzeScripts',
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
     * Setup tool-specific event listeners
     */
DataDomeAdvanced.prototype.setupToolListeners = function() {
        Logger.network('[DataDome] Setting up tool listeners...');
        this.bindToolActions([
            { id: 'datadomeCheckCookies', handler: () => this.checkCookies() },
            { id: 'datadomeAnalyzeScripts', handler: () => this.analyzeScripts() }
        ]);
        Logger.network('[DataDome] Added listener to Check Cookies button');
        Logger.network('[DataDome] Added listener to Analyze Scripts button');
    };


    /**
     * Display cookies in a modal
     */
DataDomeAdvanced.prototype.displayCookiesModal = function(dataDomeCookie) {
        const modal = this.createToolModal();

        const cookieFound = dataDomeCookie ? 1 : 0;

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${this._txt('advCommonCookiesTitleFmt', '{0} Cookies', 'DataDome')}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                ${this.buildCookieStatusSummary(cookieFound, 1)}

                ${dataDomeCookie ? `
                    <div style="background: var(--bg-tertiary); padding: 12px; border-radius: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <div class="copy-value" data-copy="datadome" style="font-weight: 500; color: var(--text-primary); font-family: var(--font-mono); cursor: pointer; padding: 4px; border-radius: 3px; transition: background 0.2s;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">datadome</div>
                            <div style="display: flex; gap: 6px;">
                                ${dataDomeCookie.secure ? '<span style="font-size: 10px; background: var(--success); color: white; padding: 2px 6px; border-radius: 3px;">SECURE</span>' : ''}
                                ${dataDomeCookie.httpOnly ? '<span style="font-size: 10px; background: var(--bg-primary); color: var(--text-primary); padding: 2px 6px; border-radius: 3px;">HTTP</span>' : ''}
                            </div>
                        </div>
                        <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(dataDomeCookie.value)}" style="font-size: 11px; color: var(--text-secondary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s;" title="${this._txt('advCommonClickToCopyFull', 'Click to copy full value')}">${AdvancedUtils.escapeHtml(dataDomeCookie.value.substring(0, 60))}${dataDomeCookie.value.length > 60 ? '...' : ''}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${this._txt('advCommonDomainLabel', 'Domain:')} ${AdvancedUtils.escapeHtml(dataDomeCookie.domain)}</div>
                    </div>
                ` : `
                    <div style="text-align: center; padding: 32px 16px; opacity: 0.7;">
                        <div style="font-size: 48px; margin-bottom: 12px;"></div>
                        <div style="font-size: 14px;">${this._txt('advCommonNoCookiesFmt', 'No {0} cookies found', 'DataDome')}</div>
                    </div>
                `}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: this._txt('advDatadomeCookieCopied', 'Cookie copied') });
        this.bindModalClose(modal);
        this.showToolModal(modal);
    };


    /**
     * Display script analysis results in modal
     */
DataDomeAdvanced.prototype.displayAnalysisModal = function(data) {
        Logger.network('[DataDome] Displaying analysis modal with data:', data);

        const modal = this.createToolModal();

        const scripts = data?.scripts || [];

        modal.innerHTML = `
            <div class="modal-content" style="background: var(--bg-secondary); border-radius: 8px; padding: 20px; max-width: 600px; max-height: 80vh; overflow-y: auto; width: 90%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; font-size: 16px; color: var(--text-primary);">${this._txt('advCommonScriptsTitleFmt', '{0} Scripts ({1})', 'DataDome', scripts.length)}</h3>
                    ${CloseButton.html({ className: 'advanced-modal-close-btn' })}
                </div>

                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${scripts.map((script, idx) => {
                        const typeLabel = script.type === 'tags' ? 'tags.js' : 'DATADOME';
                        const typeColor = 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)';
                        return `
                            <div style="background: var(--bg-tertiary); padding: 14px; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                    <span style="font-weight: 500;">${this._txt('advCommonScript', 'Script')} ${idx + 1}</span>
                                    <span style="background: ${typeColor}; color: white; padding: 4px 8px; border-radius: 3px; font-size: 11px; font-weight: 500;">${typeLabel}</span>
                                </div>
                                <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 6px;">${this._txt('advCommonUrl', 'URL')}</div>
                                <div class="copy-value" data-copy="${AdvancedUtils.escapeHtml(script.url)}" style="font-size: 12px; color: var(--text-primary); word-break: break-all; font-family: var(--font-mono); background: var(--bg-primary); padding: 8px; border-radius: 4px; cursor: pointer; transition: background 0.2s;" title="${this._txt('advCommonClickToCopy', 'Click to copy')}">${AdvancedUtils.escapeHtml(script.url)}</div>
                            </div>
                        `;
                    }).join('')}
                </div>

                ${scripts.length > 0 ? `
                    <button class="modal-export-code-btn" style="margin-top: 16px; width: 100%; padding: 10px; background: linear-gradient(135deg, #22C55E 0%, #16A34A 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <span>${this._txt('advCommonExportCode', 'Export Code')}</span>
                    </button>
                ` : ''}
            </div>
        `;

        this.bindCopyValueHandlers(modal, { defaultMessage: this._txt('advCommonUrlCopied', 'URL copied') });
        this.bindModalClose(modal);

        // Export Code button
        const exportBtn = modal.querySelector('.modal-export-code-btn');
        if (exportBtn && scripts.length > 0) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                if (scripts.length === 0) {
                    Logger.error('NETWORK', '[DataDome] No scripts to export!');
                    NotificationHelper.warning(this._txt('advCommonNoScriptsToExport', 'No scripts available to export'));
                    return;
                }

                Logger.network('[DataDome] Calling displayExportCodeModal...');
                try {
                    this.displayExportCodeModal(scripts);
                    Logger.network('[DataDome] displayExportCodeModal called successfully');
                } catch (error) {
                    Logger.error('NETWORK', '[DataDome] Error calling displayExportCodeModal:', error);
                    NotificationHelper.error(this._txt('advCommonFailedOpenExportFmt', 'Failed to open export modal: {0}', error.message));
                }
            });
            Logger.network('[DataDome] Click listener added successfully');
        } else {
            Logger.error('NETWORK', '[DataDome] Export code button not found in modal!');
            Logger.error('NETWORK', '[DataDome] Modal HTML:', modal.innerHTML.substring(0, 500));
        }

        this.showToolModal(modal);
    };


    /**
     * Display export code modal with multi-language support
     */
DataDomeAdvanced.prototype.displayExportCodeModal = function(scripts) {
        return AdvancedCodeDialog.open(this, {
            title: this._txt('advCommonExportCode', 'Export Code'),
            languages: ['JavaScript', 'Python', 'Node.js', 'PHP', 'C#', 'Go'].map(label => ({ id: label, label })),
            getCode: (type, language) => this.generateDataDomeParsingCode(scripts, language)
        });
    };
