/** Shared Advanced ToolGrid capability. */
(function () {
class AdvancedToolGrid {
    resolveToolAction(tool = {}) {
        const id = typeof tool.id === 'string' ? tool.id.toLowerCase() : '';
        if (id.endsWith(BaseAdvancedModule.SCRAPFLY_TOOL_SUFFIX.toLowerCase())) return 'scrapfly';
        if (tool.kind === 'capture' || id.endsWith('startcapture')) return 'capture';
        if (id.endsWith('checkcookies')) return 'cookies';
        if (id.endsWith('extractsensor')) return 'sensor';
        if (id.endsWith('version')) return 'version';
        if (id === 'recaptchaclick') return 'selector';
        if (id === 'recaptchaextract' || id.endsWith('extractsitekey')) return 'sitekey';
        if (id.endsWith('callback')) return 'callback';
        if (id.includes('analyze')) return 'scripts';
        return 'inspect';
    }

    resolveToolTone(tool = {}) {
        const action = this.resolveToolAction(tool);
        if (action === 'cookies') return 'green';
        if (action === 'sensor' || action === 'sitekey') return 'purple';
        return 'blue';
    }

    getToolHint(action, stopping = false) {
        const hints = {
            cookies: ['advToolCookiesHint', 'Inspect cookies used by this protection'],
            scripts: ['advToolReloadScriptsHint', 'Reload the page to analyze protection scripts'],
            version: ['advToolVersionHint', 'Read available version information'],
            sitekey: ['advToolSiteKeyHint', 'Find the CAPTCHA site key on this page'],
            selector: ['advToolSelectorHint', 'Find a selector for the CAPTCHA widget'],
            callback: ['advToolCallbackHint', 'Inspect CAPTCHA callbacks'],
            sensor: ['advToolSensorHint', 'Reset protection cookies and reload to record sensor data'],
            scrapfly: ['scrapflyExportHint', 'Code to scrape this page with the Unblocker'],
            capture: stopping
                ? ['advToolStopCaptureHint', 'Stop recording data from this page']
                : ['advToolCaptureHint', 'Record data from this page']
        };
        if (action === 'scripts' && ['awswaf', 'imperva'].includes(this.moduleName)) {
            hints.scripts = ['advToolResetScriptsHint', 'Reset protection cookies and reload to analyze scripts'];
        }
        if (action === 'version' && ['cloudflare', 'hcaptcha', 'geetest'].includes(this.moduleName)) {
            hints.version = ['advToolReloadVersionHint', 'Reload the page to detect the protection version'];
        }
        if (action === 'capture' && !stopping && this.moduleName === 'akamai') {
            hints.capture = ['advToolCaptureResetHint', 'Reset the protection cookie and start recording'];
        }
        const hint = hints[action];
        return hint ? BaseAdvancedModule._tr(...hint) : '';
    }

    static toolIcon(action) {
        // Scrape with Scrapfly carries the Scrapfly logo instead of a glyph
        if (action === 'scrapfly') return ScrapflyExport.logoHtml('advanced-tool-logo');
        const shapes = {
            cookies: '<path d="M21 12a9 9 0 1 1-9-9 4 4 0 0 0 4 4 4 4 0 0 0 5 5Z"/><circle cx="8" cy="9" r=".8"/><circle cx="8" cy="15" r=".8"/><circle cx="14" cy="14" r=".8"/>',
            scripts: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-14-2 18"/>',
            version: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
            sitekey: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9m-2 2 3 3m-6 0 3 3"/>',
            selector: '<path d="M4 8V4h4m8 0h4v4m0 8v4h-4m-8 0H4v-4m5-7 7 3-3 1-1 3-3-7Z"/>',
            callback: '<path d="M7 7h10v5m-3-3 3 3 3-3M17 17H7v-5m3 3-3-3-3 3"/>',
            sensor: '<path d="M4 4v16h16M8 16v-5m5 5V7m5 9v-3"/>',
            capture: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
            stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
            inspect: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
            next: '<path d="m9 5 7 7-7 7"/>'
        };
        return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes[action] || shapes.inspect}</svg>`;
    }

    static captureLast(tools, actionOf) {
        const list = Array.isArray(tools) ? tools : [];
        return [...list.filter(tool => actionOf(tool) !== 'capture'), ...list.filter(tool => actionOf(tool) === 'capture')];
    }

    renderToolGrid(tools = [], options = {}) {
        const esc = FormatUtils.escapeHtml;
        const extraClass = options.className ? ` ${FormatUtils.escapeAttr(options.className)}` : '';
        // Every protection also gets "Scrape with Scrapfly"; the capture
        // action is always the last row, for every vendor
        const withScrapfly = [...(Array.isArray(tools) ? tools : []), this.scrapflyTool()];
        const ordered = BaseAdvancedModule.captureLast(withScrapfly, tool => this.resolveToolAction(tool));
        const items = ordered.map(tool => {
            const action = this.resolveToolAction(tool);
            const capture = action === 'capture';
            const stopping = capture && this.isCapturing;
            const kind = capture ? 'capture' : 'default';
            const label = stopping ? BaseAdvancedModule._tr('btnStopCapturing', 'Stop Capturing') : tool.label;
            const hint = tool.hint || this.getToolHint(action, stopping);
            return `
                <button type="button" class="advanced-tool-card${stopping ? ' capturing' : ''}" id="${FormatUtils.escapeAttr(tool.id)}" data-tool-kind="${kind}" data-tool-action="${action}"${capture ? ` aria-pressed="${Boolean(stopping)}"` : ''}>
                    <span class="advanced-tool-icon advanced-tool-icon--${this.resolveToolTone(tool)}" data-icon-style="outline" aria-hidden="true">${BaseAdvancedModule.toolIcon(stopping ? 'stop' : action)}</span>
                    <span class="advanced-tool-copy">
                        <span class="advanced-tool-label">${esc(label)}</span>
                        <span class="advanced-tool-hint" aria-live="polite">${esc(hint)}</span>
                    </span>
                    <span class="advanced-tool-indicator" aria-hidden="true">${BaseAdvancedModule.toolIcon('next')}</span>
                </button>
            `;
        }).join('');
        return `<div class="advanced-tool-grid${extraClass}">${items}</div>`;
    }

    scrapflyTool() {
        return {
            id: `${this.moduleName}${BaseAdvancedModule.SCRAPFLY_TOOL_SUFFIX}`,
            label: BaseAdvancedModule._tr('scrapflyExportTitle', 'Scrape with Scrapfly')
        };
    }

    openScrapflyExport() {
        const detection = this.detection || {};
        const isCaptcha = BaseAdvancedModule.CAPTCHA_MODULES.includes(this.moduleName);
        ScrapflyExport.open({
            url: this.tabInfo?.url || '',
            detections: [{
                ...detection,
                name: detection.name || detection.detector?.name || this.displayName,
                category: detection.category || detection.detector?.category || (isCaptcha ? 'CAPTCHA' : 'Anti-Bot')
            }]
        });
    }

    bindToolActions(actions = []) {
        if (!this.toolActionBindings) this.toolActionBindings = new WeakMap();
        if (!this.pendingToolActions) this.pendingToolActions = new Set();
        const scrapfly = this.scrapflyTool();
        const all = actions.some(action => action && action.id === scrapfly.id)
            ? actions
            : [...actions, { id: scrapfly.id, method: () => this.openScrapflyExport() }];
        all.forEach(({ id, handler, method }) => {
            const fn = typeof handler === 'function' ? handler : method;
            if (!id || typeof fn !== 'function') return;
            const btn = document.querySelector(`#${id}`);
            if (!btn) return;
            const previous = this.toolActionBindings.get(btn);
            if (previous) btn.removeEventListener('click', previous);
            const listener = async event => {
                if (btn.disabled || this.pendingToolActions.has(id)) return;
                this.pendingToolActions.add(id);
                // The result dialog this click opens (now or after a reload) goes to History
                this._lastTool = {
                    id,
                    label: (btn.querySelector('.advanced-tool-label')?.textContent || id).trim(),
                    action: btn.dataset?.toolAction || ''
                };
                const hint = btn.querySelector('.advanced-tool-hint');
                const originalHint = hint ? hint.textContent : '';
                btn.disabled = true;
                btn.classList.add('is-working');
                btn.setAttribute('aria-busy', 'true');
                if (hint) hint.textContent = BaseAdvancedModule._tr('advToolWorking', 'Working…');
                try {
                    await fn.call(this, event);
                } catch (error) {
                    Logger.error('UI', `[${this.moduleName}] Tool action failed:`, error);
                    const reason = error && error.message ? error.message : String(error);
                    NotificationHelper.error(BaseAdvancedModule._fmt('advToolActionFailedFmt', `Could not complete this action: ${reason}`, reason));
                } finally {
                    this.pendingToolActions.delete(id);
                    btn.disabled = false;
                    btn.classList.remove('is-working');
                    btn.removeAttribute('aria-busy');
                    if (hint) hint.textContent = originalHint;
                    if (id === `${this.moduleName}StartCapture`) this.updateCaptureButtonState(this.isCapturing, false);
                }
            };
            this.toolActionBindings.set(btn, listener);
            btn.addEventListener('click', listener);
        });
    }
}
for (const name of ['resolveToolAction', 'resolveToolTone', 'getToolHint', 'renderToolGrid', 'scrapflyTool', 'openScrapflyExport', 'bindToolActions']) {
    Object.defineProperty(BaseAdvancedModule.prototype, name, Object.getOwnPropertyDescriptor(AdvancedToolGrid.prototype, name));
}
for (const name of ['toolIcon', 'captureLast']) {
    Object.defineProperty(BaseAdvancedModule, name, Object.getOwnPropertyDescriptor(AdvancedToolGrid, name));
}
})();
