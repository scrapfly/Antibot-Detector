/** Shared Advanced CookieResults capability. */
(function () {
class AdvancedCookieResults {
    static cookieRecord(cookie) {
        return {
            name: String(cookie.name || ''),
            value: String(cookie.value || ''),
            domain: cookie.domain || '',
            path: cookie.path || '',
            expires: Number.isFinite(cookie.expirationDate) ? Math.round(cookie.expirationDate * 1000) : null,
            secure: cookie.secure === true,
            httpOnly: cookie.httpOnly === true,
            sameSite: cookie.sameSite && cookie.sameSite !== 'unspecified' ? String(cookie.sameSite) : ''
        };
    }

    static cookieValueLabel(value) {
        const label = BaseAdvancedModule._tr('advCommonValue', 'Value');
        const length = String(value || '').length;
        if (length <= 120) return label;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let count = String(length);
        try { count = length.toLocaleString(uiLocale); } catch (_) { /* plain digits */ }
        return `${label} · ${BaseAdvancedModule._fmt('advCommonCharsFmt', `${count} chars`, count)}`;
    }

    /**
     * The Check Cookies result: one status line (found / expected, green when all are there, amber when some are
     * missing), then one card per cookie: its name to copy with its flags, its value as one code block to copy, and
     * domain, path and expiry as plain text. Cookies the vendor uses that were not found close the list as chips.
     */
    static cookieResultsBody(result) {
        const K = BaseAdvancedModule;
        const tr = K._tr;
        const esc = FormatUtils.escapeHtml;
        const attr = FormatUtils.escapeAttr;
        const when = (ms) => K.kitDateTime(ms);
        const copyTitle = attr(tr('advCommonClickToCopy', 'Click to copy'));
        const copyIcon = '<svg class="adv-cookie-copy" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
        const cookies = Array.isArray(result.cookies) ? result.cookies : [];
        const missing = Array.isArray(result.missing) ? result.missing : [];
        const total = result.total || cookies.length;
        const status = cookies.length === 0 ? 'none' : cookies.length < total ? 'partial' : 'all';
        const facts = (Array.isArray(result.facts) ? result.facts : [])
            .map(fact => ({ label: String(fact.label || '').replace(/:\s*$/, ''), value: fact.value }));
        const summary = `
            <div class="adv-cookie-summary adv-cookie-summary--${status}">
                <span class="adv-cookie-summary-dot" aria-hidden="true"></span>
                <span>${esc(K._fmt('advPanelCookiesFoundFmt', `Found ${cookies.length}/${total} cookies`, cookies.length, total))}</span>
            </div>${K.kitFacts(facts)}`;
        const meta = (label, value, wide = false) => (value === '' || value === null || value === undefined) ? ''
            : `<div class="adv-cookie-meta-row${wide ? ' is-wide' : ''}"><dt>${esc(label)}</dt><dd>${esc(String(value))}</dd></div>`;
        const cards = cookies.map(cookie => `
            <article class="adv-cookie">
                <div class="adv-cookie-head">
                    <button type="button" class="adv-cookie-name" data-copy="${attr(cookie.name)}" title="${copyTitle}" aria-label="${attr(`${tr('ruleFieldName', 'Name')}: ${cookie.name}`)}">
                        <span class="adv-cookie-name-text">${esc(cookie.name)}</span>${copyIcon}
                    </button>
                    <span class="adv-cookie-flags">${(cookie.secure ? K.kitChip('Secure', 'green') : '')
                        + (cookie.httpOnly ? K.kitChip('HttpOnly', 'purple') : '')
                        + (cookie.sameSite ? K.kitChip(`SameSite=${cookie.sameSite}`, 'neutral') : '')}</span>
                </div>
                ${cookie.value ? `
                <button type="button" class="adv-cookie-value" data-copy="${attr(cookie.value)}" title="${copyTitle}">
                    <span class="adv-cookie-value-head"><span>${esc(K.cookieValueLabel(cookie.value))}</span>${copyIcon}</span>
                    <span class="adv-cookie-value-text">${esc(cookie.value)}</span>
                </button>` : ''}
                <dl class="adv-cookie-meta">
                    ${meta(tr('advCommonDomainLabel', 'Domain:').replace(/:\s*$/, ''), cookie.domain)}
                    ${meta(tr('advCookiePath', 'Path'), cookie.path)}
                    ${meta(tr('advCookieExpires', 'Expires'), cookie.expires ? when(cookie.expires) : tr('advCookieSession', 'Session (deleted when the browser closes)'), true)}
                </dl>
            </article>`).join('');
        const absent = missing.length
            ? K.kitSection(tr('advCookieNotFound', 'Not found'), `<div class="adv-kit-chips">${missing.map(name => K.kitChip(name, 'neutral')).join('')}</div>`, missing.length)
            : '';
        const none = cookies.length ? '' : K.kitNote(K._fmt('advCommonNoCookiesFmt', `No ${result.vendor} cookies found`, result.vendor));
        return summary + cards + none + absent;
    }

    showCookieResults({ vendor, expected = [], cookies = [], facts = [], total = null }) {
        const records = cookies.map(cookie => BaseAdvancedModule.cookieRecord(cookie));
        const matches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
        const missing = expected.filter(pattern => !records.some(cookie => matches(pattern, cookie.name)));
        const result = { kind: 'cookies', vendor, total: Number.isInteger(total) ? total : Math.max(expected.length, records.length), facts, cookies: records, missing };
        const title = BaseAdvancedModule._fmt('advCommonCookiesTitleFmt', `${vendor} Cookies`, vendor);
        this.openKitModal({
            title,
            iconSvg: BaseAdvancedModule.COOKIE_ICON,
            body: BaseAdvancedModule.cookieResultsBody(result),
            copiedMessage: BaseAdvancedModule._tr('copiedNotification', 'Copied'),
            record: false
        });
        const tool = this._lastTool;
        void this.saveToolResult({ ...result, tool: tool?.id || `${this.moduleName}CheckCookies`, label: tool?.label || title, title });
    }

    showSavedCookieResults(capture) {
        const data = capture?.data || capture?.captureData || {};
        const K = BaseAdvancedModule;
        const uiLocale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        let when = '';
        try { when = new Date(capture.timestamp).toLocaleString(uiLocale); } catch (_) { when = new Date(capture.timestamp).toLocaleString(); }
        this.openKitModal({
            title: data.title || K._fmt('advCommonCookiesTitleFmt', `${data.vendor} Cookies`, data.vendor),
            subtitle: when,
            iconSvg: BaseAdvancedModule.COOKIE_ICON,
            body: K.kitCard(K.kitField(K._tr('advCommonPage', 'Page'), capture.url, { mono: false, wrap: true }))
                + BaseAdvancedModule.cookieResultsBody(data),
            copiedMessage: K._tr('copiedNotification', 'Copied'),
            record: false
        });
    }
}
for (const name of ['showCookieResults', 'showSavedCookieResults']) {
    Object.defineProperty(BaseAdvancedModule.prototype, name, Object.getOwnPropertyDescriptor(AdvancedCookieResults.prototype, name));
}
for (const name of ['cookieRecord', 'cookieValueLabel', 'cookieResultsBody']) {
    Object.defineProperty(BaseAdvancedModule, name, Object.getOwnPropertyDescriptor(AdvancedCookieResults, name));
}
})();
