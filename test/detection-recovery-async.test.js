const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
    const messages = [], timers = [], badges = [], errors = [], rendered = [];
    const settings = { detection: { blacklistedDomains: ['example.test'] } };
    const context = vm.createContext({
        Constants: { DEFAULT_MATCH_CONFIDENCE: 80, ANALYSIS_CACHE_TTL: 300000,
            PATTERN_CACHE_MAX_SIZE: 500, MATCH_CACHE_TTL: 300000, FETCH_TIMEOUT: 1000 },
        Logger: { debugMode: false, ui() {}, debug() {}, detection() {}, cache() {}, warn() {},
            error(...args) { errors.push(args); } },
        chrome: {
            runtime: { sendMessage(message, callback) { messages.push({ message, callback }); } },
            tabs: { query: async () => [{ id: 7, url: 'https://example.test/' }] },
            action: Object.fromEntries(['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor']
                .map(method => [method, async details => { badges.push({ method, ...details }); }]))
        },
        Utils: { getSettings: async () => settings },
        StorageManager: { saveSettings: async () => true },
        CategoryManager: { getBadgeColors: async () => ({}) },
        DetectionUtils: { getBadgeColor: () => '#4caf50' },
        NotificationHelper: { success() {}, error() {} },
        document: { querySelector: () => ({ style: {} }) },
        setTimeout(callback) { timers.push(callback); }
    });
    context.self = context;
    for (const file of [
        'utils/pattern-cache.js', 'modules/core/bridge-protocol.js', 'modules/core/hooks-config.js',
        'modules/core/badge-constants.js', 'modules/detection/window-condition-grammar.js',
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
        isExtensionEnabled: true, currentResults: [], blacklistedDomain: 'example.test',
        showAnalyzingState() {}, hideLoadingState() {},
        showEmptyState() { this.currentResults = []; this.emptyCalls = (this.emptyCalls || 0) + 1; },
        displayResults(results, options) {
            assert.equal(Array.isArray(results), true, 'Only resolved detection arrays reach the renderer');
            this.currentResults = results;
            rendered.push({ results, options });
        }
    });
    return { context, detection, engine, messages, timers, badges, errors, rendered, settings,
        engineCalls: () => engineCalls };
}

const rawData = () => ({ pageData: { content: [{ content: 'navigator.maxTouchPoints' }] } });
const cachedData = () => ({
    detectionResults: [{ id: 'cached-hook', category: 'fingerprint', confidence: 65,
        detector: { id: 'cached-hook', name: 'Cached runtime evidence' }, matches: [] }],
    fromStorage: true, url: 'https://example.test/', expiry: Date.now() + 60000
});

async function respond(h, data, mode) {
    if (mode === 'unblock') {
        await h.detection.removeFromBlacklist('example.test');
        assert.equal(h.settings.detection.blacklistedDomains.length, 0);
    } else {
        await h.detection.refreshAnalysis();
        const request = h.messages.shift();
        assert.equal(request.message.type, 'REQUEST_DETECTION');
        request.callback({ status: 'started' });
        assert.equal(h.timers.length, 1);
        h.timers.shift()();
    }
    const message = h.messages.shift();
    assert.equal(message.message.type, 'GET_DETECTION_DATA');
    await message.callback({ data });
}

for (const mode of ['unblock', 'refresh']) {
    test(`${mode} preserves finalized cached evidence and metadata without re-running detection`, async () => {
        const h = harness(), data = cachedData();
        await respond(h, data, mode);
        assert.equal(h.engineCalls(), 0);
        assert.equal(h.rendered.length, 1);
        assert.equal(h.detection.currentResults[0].confidence, 65);
        assert.equal(h.rendered[0].options.fromStorage, true);
        assert.equal(h.rendered[0].options.cacheMetadata.expiry, data.expiry);
        assert.deepEqual(h.errors, []);
        if (mode === 'unblock') assert.equal(h.badges.find(call => call.method === 'setBadgeText').text, '1');
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
    assert.ok(h.errors.some(args => args.some(arg => String(arg).includes('Native engine failure'))));
});
