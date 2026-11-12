const { test } = require('node:test');
global.WorkerMessages = require('../modules/core/worker-messages.js');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness({ scanMode = 'blocklist', enabled = true } = {}) {
    const messages = [], timers = [], badges = [], errors = [], rendered = [], reloads = [], toasts = [];
    const settings = { detection: { scanMode, blacklistedDomains: ['example.test'], allowedDomains: [] } };
    const tabs = { reloadFails: false };
    const context = vm.createContext({ WorkerMessages: require('../modules/core/worker-messages.js'), 
        Constants: { DEFAULT_MATCH_CONFIDENCE: 80, DEFAULT_DOM_CONFIDENCE: 85, ANALYSIS_CACHE_TTL: 300000,
            PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000, FETCH_TIMEOUT: 1000 },
        Logger: { debugMode: false, ui() {}, debug() {}, detection() {}, cache() {}, warn() {},
            error(...args) { errors.push(args); } },
        chrome: {
            runtime: { sendMessage(message, callback) { messages.push({ message, callback }); } },
            tabs: {
                query: async () => [{ id: 7, url: 'https://example.test/' }],
                reload: async (tabId) => { if (tabs.reloadFails) throw new Error('No tab with id: 7'); reloads.push(tabId); }
            },
            action: Object.fromEntries(['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor']
                .map(method => [method, async details => { badges.push({ method, ...details }); }]))
        },
        Utils: { getSettings: async () => settings },
        StorageManager: { setDomainExcluded: async (domain, excluded) => { settings.detection.blacklistedDomains = excluded ? [...settings.detection.blacklistedDomains, domain] : settings.detection.blacklistedDomains.filter(d => d !== domain); return true; }, setDomainAllowed: async (domain) => { settings.detection.allowedDomains = [...settings.detection.allowedDomains, domain]; return true; }, saveSettings: async () => true, updateSettings: async (mutate) => { mutate(settings); return true; } },
        CategoryManager: { getBadgeColors: async () => ({}), getBadgeCountMode: async () => 'all' },
        DetectionUtils: { getBadgeColor: () => '#4caf50', badgeCount: require('../utils/detection-utils.js').badgeCount, readBadgeCountMode: require('../utils/detection-utils.js').readBadgeCountMode },
        NotificationHelper: { success(text) { toasts.push(['success', text]); }, error(text) { toasts.push(['error', text]); } },
        document: { querySelector: () => ({ style: {} }) },
        setTimeout(callback) { timers.push(callback); }
    });
    context.self = context;
    for (const file of [
        'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js', 'modules/core/domain-list.js', 'modules/core/scan-scope.js',
        'modules/core/badge-constants.js', 'modules/detection/conditions/window-condition-grammar.js',
        'modules/detection/managers/confidence-manager.js', 'modules/detection/detection-combinations.js',
        ...['analysis', 'extractors', 'matching', 'hooks', 'manager']
            .map(name => `modules/detection/engine/detection-engine-${name}.js`),
        'sections/detection/detection.js', 'sections/detection/detection-requests.js',
        'sections/detection/detection-actions.js'
    ]) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    const detectorManager = { getAllDetectors: () => ({ fingerprint: { probe: {
        id: 'probe', name: 'Probe', enabled: true,
        detection: { content: [{ text: 'maxTouchPoints', scope: 'scripts', confidence: 10 }] }
    } } }) };
    const engine = vm.runInContext('new DetectionEngineManager()', context);
    const detect = engine.detectOnPage.bind(engine);
    let engineCalls = 0;
    engine.detectOnPage = async (...args) => { engineCalls++; return await detect(...args); };
    const detection = Object.assign(vm.runInContext('Object.create(Detection.prototype)', context), {
        detectionEngine: engine, detectorManager, initialized: true,
        isExtensionEnabled: enabled, currentResults: [], blacklistedDomain: 'example.test',
        showAnalyzingState() { this.analyzing = (this.analyzing || 0) + 1; }, hideLoadingState() { this.loadingHidden = true; },
        showDisabledState(isBlacklisted) { this.disabledShown = { isBlacklisted }; },
        closeDetectionModal() {}, // the detail dialog's module is not loaded here
        showEmptyState(options = {}) { this.outcome = options.outcome; this.currentResults = []; this.emptyCalls = (this.emptyCalls || 0) + 1; },
        displayResults(results, options) {
            assert.equal(Array.isArray(results), true, 'Only resolved detection arrays reach the renderer');
            this.currentResults = results;
            rendered.push({ results, options });
        }
    });
    return { context, detection, engine, messages, timers, badges, errors, rendered, settings, reloads, toasts, tabs,
        engineCalls: () => engineCalls };
}

const rawData = () => ({ pageData: { content: [{ content: 'navigator.maxTouchPoints' }] } });
const cachedData = () => ({
    detectionResults: [{ id: 'cached-hook', category: 'fingerprint', confidence: 65,
        detector: { id: 'cached-hook', name: 'Cached runtime evidence' }, matches: [] }],
    fromStorage: true, url: 'https://example.test/', expiry: Date.now() + 60000
});

async function respond(h, data, mode) {
    await h.detection.refreshAnalysis();
    const request = h.messages.shift();
    assert.equal(request.message.type, 'REQUEST_DETECTION');
    request.callback({ status: 'started' });
    assert.equal(h.timers.length, 1);
    h.timers.shift()();
    const message = h.messages.shift();
    assert.equal(message.message.type, 'GET_DETECTION_DATA');
    await message.callback({ data });
}

// Resume used to come here too (it asked for the saved result, else for a scan of the page as it was): it reloads the page now,
// see the Resume tests below
for (const mode of ['refresh']) {
    test(`${mode} preserves finalized cached evidence and metadata without re-running detection`, async () => {
        const h = harness(), data = cachedData();
        await respond(h, data, mode);
        assert.equal(h.engineCalls(), 0);
        assert.equal(h.rendered.length, 1);
        assert.equal(h.detection.currentResults[0].confidence, 65);
        assert.equal(h.rendered[0].options.fromStorage, true);
        assert.equal(h.rendered[0].options.cacheMetadata.expiry, data.expiry);
        assert.deepEqual(h.errors, []);
    });

    test(`${mode} awaits the real async engine when only raw page data is available`, async () => {
        const h = harness();
        await respond(h, rawData(), mode);
        assert.equal(h.engineCalls(), 1);
        assert.equal(h.rendered.length, 1);
        assert.equal(h.detection.currentResults.length, 1);
        assert.equal(h.detection.currentResults[0].confidence, 10);
        assert.deepEqual(h.errors, []);
    });

    test(`${mode} restores an empty finalized cache as an array without fabricating results`, async () => {
        const h = harness();
        await respond(h, { detectionResults: [] }, mode);
        assert.equal(h.engineCalls(), 0);
        assert.equal(h.rendered.length, 1);
        assert.equal(h.detection.currentResults.length, 0);
        assert.deepEqual(h.errors, []);
    });
}

test('normal raw-data processing awaits the real detector engine before rendering', async () => {
    const h = harness();
    await h.context.DetectionRequests.processDetectionData({
        detection: h.detection, detectionEngine: h.engine, detectorManager: h.detection.detectorManager
    }, rawData());
    assert.equal(h.rendered.length, 1);
    assert.equal(h.detection.currentResults[0].confidence, 10);
    assert.deepEqual(h.errors, []);
});

test('raw-data detection rejection is handled by the shared result pipeline', async () => {
    const h = harness();
    h.engine.detectOnPage = async () => { throw new Error('Native engine failure'); };
    await h.context.DetectionRequests.processDetectionData({
        detection: h.detection, detectionEngine: h.engine, detectorManager: h.detection.detectorManager
    }, rawData());
    assert.equal(h.rendered.length, 0);
    assert.equal(h.detection.emptyCalls, 1);
    assert.equal(h.detection.outcome, 'failed', 'an engine failure cannot look like a clean scan');
    assert.ok(h.errors.some(args => args.some(arg => String(arg).includes('Native engine failure'))));
});

test('refresh keeps a pending worker scan analyzing after the initial poll', async () => {
    const h = harness();
    await h.detection.refreshAnalysis();
    h.messages.shift().callback({ status: 'started' });
    h.timers.shift()();
    await h.messages.shift().callback({ status: 'pending' });
    assert.equal(h.detection.emptyCalls || 0, 0);
    assert.equal(h.rendered.length, 0);
});

test('refresh: a page that has to load again to be scanned says so at once (No completed scan, Scan again), with no wait', async () => {
    const h = harness();
    await h.detection.refreshAnalysis();
    h.messages.shift().callback({ status: 'needs_reload', reason: 'not_captured' });
    assert.equal(h.detection.outcome, 'unscanned', 'the card that says to reload the page and offers Scan again');
    assert.equal(h.detection.loadingHidden, true);
    assert.equal(h.timers.length, 0, 'no poll for a scan that never starts');
    assert.equal(h.messages.length, 0);
});

// ---- Resume (the paused card's button, "Scan this site" in "only these sites" mode, and the switched-off card's site button)
//
// The page on screen loaded while its site was paused: none of its headers, cookies, request bodies or requests were kept and its
// JS hooks never ran. Resume saves the site and reloads the page, so the scan that follows sees all of it; it never asks the
// worker for a scan, or a saved result, of the page as it is.

const typesSent = (h) => h.messages.map(entry => entry.message.type);

test('Resume saves the site, reloads the page and shows the scanning screen; nothing is asked of the page as it is', async () => {
    const h = harness();
    await h.detection.removeFromBlacklist('example.test');
    assert.deepEqual(h.settings.detection.blacklistedDomains, [], 'the site is scanned again');
    assert.deepEqual(h.reloads, [7], 'the page loads again');
    assert.deepEqual(typesSent(h), [], 'no REQUEST_DETECTION, no GET_DETECTION_DATA');
    assert.equal(h.detection.blacklistedDomain, null);
    assert.equal(h.detection.analyzing, 1, 'the scanning screen, until the new result arrives');
    assert.equal(h.detection.viewedTabId, 7);
    assert.deepEqual([...h.detection.currentResults], []);
    assert.equal(h.engineCalls(), 0);
    assert.deepEqual(h.toasts, [['success', 'Removed "example.test" from blacklist']]);
    assert.deepEqual(h.errors, []);
});

test('"Scan this site" ("only these sites" mode) adds the site and reloads the page the same way', async () => {
    const h = harness({ scanMode: 'allowlist' });
    await h.detection.removeFromBlacklist('example.test');
    assert.deepEqual(h.settings.detection.allowedDomains, ['example.test']);
    assert.deepEqual(h.reloads, [7]);
    assert.deepEqual(typesSent(h), []);
    assert.equal(h.detection.analyzing, 1);
});

test('Resume while the extension is switched off saves the site and reloads nothing: there is nothing to scan', async () => {
    const h = harness({ enabled: false });
    await h.detection.removeFromBlacklist('example.test');
    assert.deepEqual(h.settings.detection.blacklistedDomains, []);
    assert.deepEqual(h.reloads, []);
    assert.deepEqual(typesSent(h), []);
    assert.deepEqual(h.detection.disabledShown, { isBlacklisted: false }, 'the switched-off card, without the paused site');
});

test('Resume on a tab that cannot be reloaded shows the page as not scanned, not a scan that never ends', async () => {
    const h = harness();
    h.tabs.reloadFails = true;
    await h.detection.removeFromBlacklist('example.test');
    assert.deepEqual(h.settings.detection.blacklistedDomains, [], 'the site was saved');
    assert.equal(h.detection.outcome, 'unscanned');
    assert.deepEqual(typesSent(h), []);
    assert.deepEqual(h.toasts.filter(([kind]) => kind === 'error'), [], 'saving worked: no error toast');
});

test('refresh reports failed worker requests without displaying clean results', async () => {
    const h = harness();
    await h.detection.refreshAnalysis();
    h.messages.shift().callback({ status: 'error', error: 'synthetic failure' });
    assert.equal(h.detection.outcome, 'failed');
    assert.equal(h.timers.length, 0);
});
