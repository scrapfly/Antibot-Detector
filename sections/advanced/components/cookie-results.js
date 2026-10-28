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

    /** The page's site's protection cookie timeline from the worker ({ cookies: { name: events[] }, now }), or null. */
    static fetchCookieTimeline(url, timeoutMs = 1500) {
        if (!url || typeof chrome === 'undefined' || !chrome.runtime || typeof WorkerMessages === 'undefined') return Promise.resolve(null);
        return new Promise((resolve) => {
            const timer = setTimeout(() => resolve(null), timeoutMs);
            try {
                chrome.runtime.sendMessage({ type: WorkerMessages.COOKIE_TIMELINE_GET, url }, (response) => {
                    clearTimeout(timer);
                    const ok = !chrome.runtime.lastError && response && response.status === 'ok' && response.cookies;
                    resolve(ok ? { cookies: response.cookies, now: Number(response.now) || Date.now() } : null);
                });
            } catch (_) { clearTimeout(timer); resolve(null); }
        });
    }

    /** "set 4 min. ago · changed 3 times · last change 40 sec. ago · expires in 1 hr." for one cookie's events. */
    static cookieTimelineSummary(events, now) {
        const K = BaseAdvancedModule;
        const locale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        const ago = (t) => CookieTimeline.relative(t - now, locale);
        const s = CookieTimeline.summarize(events);
        if (s.state === 'none') return '';
        const parts = [];
        if (s.state !== 'live') {
            parts.push(s.state === 'expired'
                ? K._fmt('advCookieTimelineExpiredFmt', `expired ${ago(s.endedAt)}`, ago(s.endedAt))
                : K._fmt('advCookieTimelineRemovedFmt', `removed ${ago(s.endedAt)}`, ago(s.endedAt)));
        }
        if (s.setAt !== null) parts.push(K._fmt('advCookieTimelineSetFmt', `set ${ago(s.setAt)}`, ago(s.setAt)));
        if (s.changes === 1) parts.push(K._tr('advCookieTimelineChangedOnce', 'changed once'));
        else if (s.changes > 1) parts.push(K._fmt('advCookieTimelineChangedFmt', `changed ${s.changes} times`, s.changes));
        if (s.lastChangeAt !== null) parts.push(K._fmt('advCookieTimelineLastChangeFmt', `last change ${ago(s.lastChangeAt)}`, ago(s.lastChangeAt)));
        if (s.state === 'live') {
            parts.push(s.expiresAt !== null
                ? K._fmt('advCookieTimelineExpiresFmt', `expires ${CookieTimeline.relative(s.expiresAt - now, locale)}`, CookieTimeline.relative(s.expiresAt - now, locale))
                : K._tr('advCookieTimelineSession', 'session cookie'));
        }
        return parts.join(' · ');
    }

    /**
     * One cookie's timeline: the summary line, then its events (newest first) folded under "Timeline". Nothing
     * recorded yet: the line that says when recording starts.
     */
    static cookieTimelineBlock(events, now) {
        const K = BaseAdvancedModule;
        const tr = K._tr;
        const esc = FormatUtils.escapeHtml;
        const attr = FormatUtils.escapeAttr;
        const list = Array.isArray(events) ? events : [];
        if (!list.length) {
            return `<p class="adv-cookie-timeline-empty">${esc(tr('advCookieTimelineEmpty', 'Recording starts when the page sets the cookie'))}</p>`;
        }
        const locale = (typeof I18n !== 'undefined' && typeof I18n.locale === 'function') ? I18n.locale() : undefined;
        const labels = {
            set: tr('advCookieTimelineEventSet', 'Set'),
            changed: tr('advCookieTimelineEventChanged', 'Changed'),
            removed: tr('advCookieTimelineEventRemoved', 'Removed'),
            expired: tr('advCookieTimelineEventExpired', 'Expired')
        };
        const markerHint = attr(tr('advCookieTimelineMarkerHint', 'Short fingerprint of the value: tells values apart, never stores the value'));
        const clock = (t) => {
            try { return new Date(t).toLocaleTimeString(locale); } catch (_) { return new Date(t).toLocaleTimeString(); }
        };
        const rows = list.slice().reverse().map((event) => {
            const facts = [];
            if (Number.isFinite(event.l) && (event.e === 'set' || event.e === 'changed')) {
                const count = String(event.l);
                facts.push(esc(K._fmt('advCommonCharsFmt', `${count} chars`, count)));
                if (event.m) facts.push(`<code class="adv-cookie-timeline-marker" title="${markerHint}">${esc(event.m)}</code>`);
            }
            return `
                    <li class="adv-cookie-timeline-event is-${esc(event.e)}">
                        <span class="adv-cookie-timeline-dot" aria-hidden="true"></span>
                        <span class="adv-cookie-timeline-label">${esc(labels[event.e] || event.e)}</span>
                        <time class="adv-cookie-timeline-time" datetime="${attr(new Date(event.t).toISOString())}" title="${attr(K.kitDateTime(event.t))}">${esc(clock(event.t))} · ${esc(CookieTimeline.relative(event.t - now, locale))}</time>
                        ${facts.length ? `<span class="adv-cookie-timeline-facts">${facts.join(' · ')}</span>` : ''}
                    </li>`;
        }).join('');
        return `
            <div class="adv-cookie-timeline">
                <p class="adv-cookie-timeline-summary">${esc(K.cookieTimelineSummary(list, now))}</p>
                <details class="adv-cookie-timeline-details">
                    <summary><span>${esc(tr('advCookieTimelineTitle', 'Timeline'))}</span><span class="adv-kit-count">${list.length}</span></summary>
                    <ol class="adv-cookie-timeline-list">${rows}
                    </ol>
                </details>
            </div>`;
    }

    /**
     * The Check Cookies result: one status line (found / expected, green when all are there, amber when some are
     * missing), then one card per cookie: its name to copy with its flags, its value as one code block to copy, and
     * domain, path and expiry as plain text. Cookies the vendor uses that were not found close the list as chips.
     */
    static cookieResultsBody(result, timeline = null) {
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
                </dl>${timeline ? K.cookieTimelineBlock(timeline.cookies[CookieTimeline.keyOf(cookie.name, cookie.domain)], timeline.now) : ''}
            </article>`).join('');
        // Protection cookies recorded on this site that the page no longer has (removed, expired, or renamed by a site)
        const expected = Array.isArray(result.expected) ? result.expected : [];
        const nameMatches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
        const gone = timeline ? Object.keys(timeline.cookies)
            .filter(key => !cookies.some(cookie => CookieTimeline.keyOf(cookie.name, cookie.domain) === key)
                && expected.some(pattern => nameMatches(pattern, CookieTimeline.nameOf(key))))
            .sort() : [];
        const earlier = gone.length ? K.kitSection(tr('advCookieTimelineEarlier', 'Recorded earlier'), gone.map(key => `
            <article class="adv-cookie adv-cookie--gone">
                <div class="adv-cookie-head"><span class="adv-cookie-name-text">${esc(CookieTimeline.nameOf(key))}</span><span class="adv-cookie-domain">${esc(key.slice(CookieTimeline.nameOf(key).length + 1))}</span></div>
                ${K.cookieTimelineBlock(timeline.cookies[key], timeline.now)}
            </article>`).join(''), gone.length) : '';
        const absent = missing.length
            ? K.kitSection(tr('advCookieNotFound', 'Not found'), `<div class="adv-kit-chips">${missing.map(name => K.kitChip(name, 'neutral')).join('')}</div>`, missing.length)
            : '';
        const none = cookies.length ? '' : K.kitNote(K._fmt('advCommonNoCookiesFmt', `No ${result.vendor} cookies found`, result.vendor));
        return summary + cards + none + earlier + absent;
    }

    async showCookieResults({ vendor, expected = [], cookies = [], facts = [], total = null }) {
        const records = cookies.map(cookie => BaseAdvancedModule.cookieRecord(cookie));
        const matches = (pattern, name) => pattern.endsWith('*') ? name.startsWith(pattern.slice(0, -1)) : name === pattern;
        const missing = expected.filter(pattern => !records.some(cookie => matches(pattern, cookie.name)));
        const result = { kind: 'cookies', vendor, total: Number.isInteger(total) ? total : Math.max(expected.length, records.length), facts, cookies: records, missing };
        const title = BaseAdvancedModule._fmt('advCommonCookiesTitleFmt', `${vendor} Cookies`, vendor);
        // The timeline is shown here only: it lives in the worker's memory and is never saved with the result
        // Never in a private window: the timeline records regular windows only, and would show their browsing there
        const timeline = this.tabInfo && this.tabInfo.incognito === true
            ? null : await BaseAdvancedModule.fetchCookieTimeline(this.tabInfo && this.tabInfo.url);
        this.openKitModal({
            title,
            iconSvg: BaseAdvancedModule.COOKIE_ICON,
            body: BaseAdvancedModule.cookieResultsBody({ ...result, expected }, timeline),
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
for (const name of ['cookieRecord', 'cookieValueLabel', 'fetchCookieTimeline', 'cookieTimelineSummary', 'cookieTimelineBlock', 'cookieResultsBody']) {
    Object.defineProperty(BaseAdvancedModule, name, Object.getOwnPropertyDescriptor(AdvancedCookieResults, name));
}
})();
