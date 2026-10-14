    /**
     * Render Geetest-specific tools (simplified - 2 buttons only, standardized icons)
     */
GeetestAdvanced.prototype.renderTools = function() {
        return this.renderToolGrid([
            {
                id: 'geetestVersion',
                label: ((typeof I18n !== 'undefined' && I18n.get('btnCheckVersion')) || 'Check Version'),
                iconSvg: `
                    <svg width="20" height="20" viewBox="0 0 24 24">
                        <path d="M5.5,7A1.5,1.5 0 0,1 4,5.5A1.5,1.5 0 0,1 5.5,4A1.5,1.5 0 0,1 7,5.5A1.5,1.5 0 0,1 5.5,7M21.41,11.58L12.41,2.58C12.05,2.22 11.55,2 11,2H4C2.89,2 2,2.89 2,4V11C2,11.55 2.22,12.05 2.59,12.41L11.58,21.41C11.95,21.77 12.45,22 13,22C13.55,22 14.05,21.77 14.41,21.41L21.41,14.41C21.77,14.05 22,13.55 22,13C22,12.45 21.77,11.95 21.41,11.58Z"/>
                    </svg>
                `
            },
            {
                id: 'geetestAnalyze',
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
     * Setup tool-specific event listeners (2 buttons only)
     */
GeetestAdvanced.prototype.setupToolListeners = function() {
        this.bindToolActions([
            { id: 'geetestVersion', method: () => this.checkVersion() },
            { id: 'geetestAnalyze', method: () => this.analyzeScripts() }
        ]);
    };


    /**
     * Display analyzed scripts with parsed captchaId, detection source, and Export Code button
     */
GeetestAdvanced.prototype.displayScriptsModal = function(scripts) {
        this.recordStructuredResult('displayScriptsModal', scripts);
        const K = BaseAdvancedModule;
        const list = Array.isArray(scripts) ? scripts : [];
        const sourceLabels = {
            'inline-script': this._txt('advGeetestSourceInlineScript', 'Inline Script'),
            'dom-attribute': this._txt('advGeetestSourceDomAttribute', 'DOM Attribute'),
            'script-url': this._txt('advGeetestSourceScriptUrl', 'Script URL'),
            'json-config': this._txt('advGeetestSourceJsonConfig', 'JSON Config')
        };
        // One card per finding: version and where it was found, then its keys and the snippet
        const cards = list.map(script => {
            const isV4 = script.type === 'v4';
            const head = K.kitChip(isV4 ? 'V4' : 'V3', isV4 ? 'green' : 'blue')
                + (script.source ? K.kitChip(sourceLabels[script.source] || script.source, 'neutral') : '');
            const keys = isV4
                ? K.kitField(this._txt('advGeetestExtractedCaptchaId', 'Extracted captchaId'), script.captchaId)
                    + K.kitField(this._txt('advGeetestProductLabel', 'Product:').replace(/:\s*$/, ''), script.product, { mono: false })
                : K.kitField('gt', script.gt) + K.kitField('challenge', script.challenge);
            return K.kitCard(keys
                + K.kitField(this._txt('advCommonUrl', 'URL'), script.url, { clamp: true })
                + K.kitCode(this._txt('advGeetestScriptSnippet', 'Script Snippet'), script.snippet), head);
        }).join('');
        let host = '';
        try { host = new URL(this.tabInfo && this.tabInfo.url).hostname; } catch (_) { host = ''; }
        return this.openKitModal({
            title: this._txt('advCommonScriptsTitleFmt', '{0} Scripts ({1})', 'Geetest', list.length),
            subtitle: host,
            iconSvg: K.toolIcon('scripts'),
            body: cards || K.kitNote(this._txt('advGeetestNoScriptsFound', 'No Geetest scripts found')),
            copiedMessage: this._txt('advValueCopied', 'Value copied'),
            actions: list.length ? [{
                label: this._txt('advGeetestExportParsingCode', 'Export Parsing Code'),
                primary: true,
                onClick: () => this.exportParsingCode(list)
            }] : [],
            record: false
        });
    };
