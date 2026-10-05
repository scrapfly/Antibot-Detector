const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'modules/styles/detection.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'sections/detection/detection.html'), 'utf8');

function declarations(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...css.matchAll(new RegExp('^' + escaped + '\\s*\\{([^}]*)\\}', 'gm'))];
    assert.ok(matches.length, `Missing scoped rule: ${selector}`);
    return Object.assign({}, ...matches.map(match => Object.fromEntries(match[1].split(';').map(part => part.trim()).filter(Boolean).map(part => {
        const colon = part.indexOf(':');
        return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
    }))));
}

test('blocked-domain heading centers its icon above the title without affecting other states', () => {
    const heading = declarations('#blacklistWarning .detection-pause-heading');
    assert.equal(heading['flex-direction'], 'column');
    assert.equal(heading['text-align'], 'center');
    assert.equal(declarations('.detection-pause-heading')['align-items'], 'center');
    const icon = declarations('#blacklistWarning .detection-pause-icon');
    assert.equal(icon.flex, '0 0 auto');
    assert.equal(icon.width, '52px');
    assert.equal(declarations('.detection-pause-icon').height, '52px');
    assert.equal(declarations('.detection-pause-card--global .detection-pause-icon').width, '64px');
});

test('blocked card preserves the approved surface, domain and full-width recovery action', () => {
    const card = declarations('.detection-pause-card');
    assert.equal(card['max-width'], '360px');
    assert.equal(card.padding, '28px');
    assert.equal(card.background, 'var(--bg-secondary)');
    assert.equal(card['border-radius'], '12px');
    assert.equal(card['text-align'], 'start');
    const action = declarations('.detection-pause-card .state-card-enable-btn');
    assert.equal(action.width, '100%');
    assert.equal(action['min-height'], '44px');
    assert.match(html, /id="blacklistDomain" class="blacklist-domain-text"/);
    assert.match(html, /id="removeFromBlacklistBtn"[^>]*type="button"/);
    assert.match(html, /class="blacklist-hint" data-i18n="detectionBlacklistHint"/);
});

test('blocked domain field contains only its text, without a globe or replacement icon', () => {
    const site = html.match(/<div class="detection-pause-site">([\s\S]*?)<\/div>/);
    assert.ok(site, 'Blocked domain field remains present');
    assert.equal(site[1].trim(), '<p id="blacklistDomain" class="blacklist-domain-text"></p>');
});

test('centered blocked icon stays decorative and precedes the localized heading', () => {
    const blocked = html.slice(html.indexOf('id="blacklistWarning"'), html.indexOf('id="emptyState"'));
    assert.match(blocked, /class="detection-pause-icon" aria-hidden="true"/);
    assert.ok(blocked.indexOf('class="detection-pause-icon"') < blocked.indexOf('data-i18n="detectionDisabledForDomain"'));
    assert.equal((html.match(/id="removeFromBlacklistBtn"/g) || []).length, 1);
});
