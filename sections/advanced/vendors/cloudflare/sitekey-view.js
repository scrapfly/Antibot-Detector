/** Cloudflare owns the shared Turnstile site-key presentation. */
(function (global) {
    function show(keys) {
        this.recordStructuredResult('displaySiteKeysModal', keys);
        const K = BaseAdvancedModule;
        const cards = keys.map(key => K.kitCard(
            K.kitField(this._txt('advCommonSiteKey', 'Site Key'), key.sitekey, { wrap: true })
            + K.kitField(this._txt('advCommonPage', 'Page'), key.pageUrl, { mono: false, wrap: true })
        )).join('');
        this.openKitModal({
            title: this._txt('advTurnstileSiteKeysTitle', 'Turnstile site keys'),
            subtitle: keys.length === 1 ? keys[0].sitekey : String(keys.length),
            iconSvg: TurnstileAdvanced.KEY_ICON,
            body: cards,
            copiedMessage: this._txt('advCloudflareSiteKeyCopied', 'Site Key copied')
        });

    }
    global.CloudflareSiteKeyView = Object.freeze({ show: (owner, keys) => show.call(owner, keys) });
})(window);
