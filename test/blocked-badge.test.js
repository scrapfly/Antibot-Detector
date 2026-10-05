const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(textColorMode = 'supported') {
    const calls = [];
    const state = { enabled: true, blacklisted: true };
    const timers = new Map();
    const action = {};
    for (const method of ['setBadgeText', 'setBadgeBackgroundColor', 'setBadgeTextColor', 'setIcon']) {
        action[method] = async (details) => {
            if (method === 'setBadgeTextColor') assert.equal(typeof details.color, 'string');
            calls.push({ method, ...details });
        };
    }
    if (textColorMode === 'missing') delete action.setBadgeTextColor;
    if (textColorMode === 'rejected') action.setBadgeTextColor = async () => { throw new Error('unsupported'); };
    if (textColorMode === 'throws') action.setBadgeTextColor = () => { throw new Error('closed tab'); };
    const context = vm.createContext({
        chrome: { action, storage: { local: {
            get: async () => ({ scrapfly_enabled: state.enabled }),
            set: async (details) => { state.enabled = details.scrapfly_enabled; }
        } },
            runtime: { sendMessage: async () => {} }, tabs: {
                sendMessage: async () => {}, query: async () => [{ id: 7, url: 'https://example.com' }]
            } },
        isExtensionEnabled: async () => state.enabled,
        Utils: { isUrlBlacklisted: async () => state.blacklisted, getHistorySettings: async () => ({}) },
        CategoryManager: { getBadgeColors: async () => ({}) }, categoryManager: {},
        DetectionUtils: { getBadgeColor: () => '#112233' }, PatternCache: class {},
        Logger: { debugMode: false, background() {}, detection() {}, debug() {}, hostOf: u => u, warn() {}, ui() {}, error(...args) { throw new Error(args.join(' ')); } },
        detectionStates: new Map(), activeDetections: new Map(),
        ScrapflyBridgeProtocol: { MESSAGE_TYPES: { CACHE_HIT_DISABLE_MONITORING: 'cache-hit' } },
        setInterval: (callback) => { timers.set(1, callback); return 1; },
        clearInterval: (id) => timers.delete(id)
    });
    for (const file of ['modules/core/badge-constants.js', 'background/utilities.js',
        'modules/detection/engine/detection-engine-manager.js', 'sections/settings/settings-runtime.js',
        'sections/detection/detection-ui.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
    }
    vm.runInContext('globalThis.Engine = DetectionEngineManager; globalThis.Settings = SettingsRuntime; globalThis.UI = DetectionUI', context);
    const last = (method) => calls.filter((call) => call.method === method).at(-1);
    return { context, state, calls, timers, last };
}

test('blocked toolbar draws the pause tile into the icon instead of a font glyph', () => {
    const h = harness();
    // Badge text uses the browser UI font: the bars merged into a block on some
    // machines and became hairlines on others, so the sign lives in the icon.
    assert.equal(h.context.BADGE.TEXT.BLACKLISTED, '');
    assert.deepEqual({ ...h.context.BADGE.PAUSED_ICON }, { 16: 'icons/paused16.png', 32: 'icons/paused32.png' });
    for (const file of Object.values(h.context.BADGE.PAUSED_ICON)) {
        assert.ok(fs.existsSync(path.join(__dirname, '..', file)), `${file} must ship`);
    }
    assert.equal(h.context.BADGE.COLORS.BLACKLISTED, '#1e293b');
    assert.equal(h.context.BADGE.TEXT_COLORS.BLACKLISTED, '#7dd3fc');
    assert.equal(h.context.BADGE.TEXT.DISABLED, 'OFF');
});

test('the paused icon follows the blocked state and the normal icon returns on every exit', async () => {
    const h = harness();
    await h.context.setBadgeForDetections(7, 'https://blocked.example', []);
    assert.deepEqual({ ...h.last('setIcon').path }, { ...h.context.BADGE.PAUSED_ICON });
    assert.equal(h.last('setIcon').tabId, 7);
    h.state.blacklisted = false;
    await h.context.setBadgeForDetections(7, 'https://normal.example', [{}]);
    assert.deepEqual({ ...h.last('setIcon').path }, { ...h.context.BADGE.ICON }, 'unblocked tab gets the normal icon');
    h.state.blacklisted = true;
    await h.context.setBadgeForDetections(7, 'https://blocked.example', []);
    h.state.enabled = false;
    await h.context.setBadgeForDetections(7, 'https://blocked.example', []);
    assert.deepEqual({ ...h.last('setIcon').path }, { ...h.context.BADGE.ICON }, 'global OFF replaces the pause tile');
    h.state.enabled = true;
    h.state.blacklisted = true;
    await h.context.setBadgeForDetections(7, 'https://blocked.example', []);
    h.context.activeDetections.set(7, {});
    h.context.startBadgeSpinner(7);
    assert.deepEqual({ ...h.last('setIcon').path }, { ...h.context.BADGE.ICON }, 'a new scan shows the normal icon');
    h.context.stopBadgeSpinner(7);
});

test('the shipped paused icons are the generator output for the current logo', () => {
    const { decodePng, encodePng, drawPausedIcon } = require('../scripts/generate-paused-icons.js');
    for (const size of [16, 32]) {
        const logo = decodePng(fs.readFileSync(path.join(__dirname, '..', 'icons', `icon${size}.png`)));
        const expected = encodePng(drawPausedIcon(logo));
        const shipped = fs.readFileSync(path.join(__dirname, '..', 'icons', `paused${size}.png`));
        assert.ok(expected.equals(shipped), `icons/paused${size}.png is stale: run node scripts/generate-paused-icons.js`);
        const decoded = decodePng(shipped);
        assert.equal(decoded.width, size);
        // Two light-blue bars on the navy tile, with navy between them
        const s = size / 16;
        const at = (x, y) => [...decoded.pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4)];
        assert.deepEqual(at(9 * s, 10 * s), [0x7d, 0xd3, 0xfc, 255]);
        assert.deepEqual(at(13 * s, 10 * s), [0x7d, 0xd3, 0xfc, 255]);
        assert.deepEqual(at(11 * s, 10 * s), [0x1e, 0x29, 0x3b, 255]);
    }
});

for (const results of [[], [{ name: 'detector' }]]) {
    test(`production final badge preserves blacklist with ${results.length} detections`, async () => {
        const h = harness();
        await h.context.setBadgeForDetections(7, 'https://blocked.example', results);
        assert.equal(h.last('setBadgeText').text, h.context.BADGE.TEXT.BLACKLISTED);
        assert.equal(h.last('setBadgeBackgroundColor').color, '#1e293b');
        assert.equal(h.last('setBadgeTextColor').color, '#7dd3fc');
        assert.equal(h.last('setBadgeTextColor').tabId, 7);
    });
}

test('production transitions restore readable contrast for custom detection, clean, disabled and spinner states', async () => {
    const h = harness();
    await h.context.setBadgeForDetections(7, 'https://blocked.example', []);
    h.state.blacklisted = false;
    await h.context.setBadgeForDetections(7, 'https://normal.example', [{}]);
    assert.equal(h.last('setBadgeText').text, '1');
    assert.equal(h.last('setBadgeBackgroundColor').color, '#112233');
    assert.equal(h.last('setBadgeTextColor').color, '#ffffff');
    await h.context.setBadgeForDetections(7, 'https://normal.example', []);
    assert.equal(h.last('setBadgeText').text, '');
    assert.equal(h.last('setBadgeTextColor').color, '#000000');
    h.state.enabled = false;
    h.state.blacklisted = true;
    await h.context.setBadgeForDetections(7, 'https://blocked.example', [{}]);
    assert.equal(h.last('setBadgeText').text, 'OFF');
    assert.equal(h.last('setBadgeTextColor').color, '#000000');
    h.context.activeDetections.set(7, {});
    h.context.startBadgeSpinner(7);
    assert.equal(h.last('setBadgeText').text, h.context.BADGE.SPINNER_FRAMES[0]);
    assert.equal(h.last('setBadgeBackgroundColor').color, '#2563eb');
    assert.equal(h.last('setBadgeTextColor').color, '#ffffff');
    // Chrome drops per-tab badge colours on navigation: wipe what the start
    // frame set, then check the next frame restores both colours, not only text.
    h.calls.length = 0;
    h.timers.get(1)();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.last('setBadgeText').text, h.context.BADGE.SPINNER_FRAMES[1]);
    assert.equal(h.last('setBadgeBackgroundColor').color, '#2563eb');
    assert.equal(h.last('setBadgeTextColor').color, '#ffffff');
    assert.ok(h.calls.every((call) => call.tabId === 7), 'spinner frames stay on their tab');
    await h.context.setBadgeForDetections(7, 'https://blocked.example', []);
    assert.equal(h.timers.size, 0);
    assert.equal(h.last('setBadgeText').text, 'OFF');
});

test('spinner frames stay white on the loading blue even where badge text colour is unsupported', async () => {
    for (const mode of ['missing', 'rejected', 'throws']) {
        const h = harness(mode);
        h.context.activeDetections.set(7, {});
        h.context.startBadgeSpinner(7);
        h.timers.get(1)();
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(h.last('setBadgeText').text, h.context.BADGE.SPINNER_FRAMES[1], mode);
        assert.equal(h.last('setBadgeBackgroundColor').color, '#2563eb', mode);
        assert.equal(h.timers.size, 1, `${mode} text-colour API must not stop the spinner`);
        h.context.stopBadgeSpinner(7);
    }
});

for (const mode of ['missing', 'rejected', 'throws']) {
    test(`production badges survive ${mode} text color API`, async () => {
        const h = harness(mode);
        await h.context.setBadgeForDetections(7, 'https://blocked.example', []);
        assert.equal(h.last('setBadgeText').text, h.context.BADGE.TEXT.BLACKLISTED);
        assert.equal(h.last('setBadgeBackgroundColor').color, '#1e293b');
        h.state.blacklisted = false;
        await h.context.setBadgeForDetections(7, 'https://normal.example', [{}]);
        assert.equal(h.last('setBadgeText').text, '1');
    });
}

test('normal glyph contrast follows light, dark, shorthand and RGB backgrounds', async () => {
    const h = harness();
    for (const [background, expected] of [
        ['#ffffff', '#000000'], ['#000000', '#ffffff'],
        ['#fff', '#000000'], ['#123', '#ffffff'],
        [[255, 255, 255, 255], '#000000'], [[0, 0, 0, 255], '#ffffff']
    ]) {
        await h.context.setBadgeTextColor(7, false, background);
        assert.equal(h.last('setBadgeTextColor').color, expected);
    }
});

for (const cached of [null, { detectionCount: 0, detectionResults: [] },
    { detectionCount: 2, detectionResults: [{}, {}] }]) {
    test(`production global enable preserves blocked state with ${cached ? cached.detectionCount : 'missing'} cache`, async () => {
        const h = harness();
        h.state.enabled = false;
        let cacheReads = 0;
        h.context.Engine.getStoredDetection = async () => { cacheReads++; return cached; };
        await h.context.Settings.handleEnableToggle(true, {
            DetectionEngineManager: h.context.Engine,
            CategoryManager: h.context.CategoryManager,
            categoryManager: h.context.categoryManager
        });
        assert.equal(h.state.enabled, true);
        assert.equal(cacheReads, 0, 'blacklist priority must prevent cache badge restoration');
        assert.equal(h.last('setBadgeText').text, h.context.BADGE.TEXT.BLACKLISTED);
        assert.equal(h.last('setBadgeBackgroundColor').color, '#1e293b');
        assert.equal(h.last('setBadgeTextColor').color, '#7dd3fc');
        assert.equal(h.last('setBadgeTextColor').tabId, 7);
    });
}

test('production global disable replaces the pause glyph with readable black OFF on orange', async () => {
    const h = harness();
    await h.context.setBadgeForDetections(7, 'https://example.com', []);
    assert.equal(h.last('setBadgeTextColor').color, '#7dd3fc');
    await h.context.Settings.handleEnableToggle(false);
    assert.equal(h.state.enabled, false);
    assert.equal(h.last('setBadgeText').text, 'OFF');
    assert.equal(h.last('setBadgeBackgroundColor').color, h.context.BADGE.COLORS.DISABLED);
    assert.equal(h.last('setBadgeTextColor').color, '#000000');
});

for (const [background, expected] of [['#112233', '#ffffff'], ['#eeeeee', '#000000']]) {
    test(`production global enable restores readable cached count on custom ${background} background`, async () => {
        const h = harness();
        await h.context.setBadgeForDetections(7, 'https://example.com', []);
        await h.context.Settings.handleEnableToggle(false);
        h.state.blacklisted = false;
        h.context.DetectionUtils.getBadgeColor = () => background;
        h.context.Engine.getStoredDetection = async () => ({ detectionCount: 2, detectionResults: [{}, {}] });
        await h.context.Settings.handleEnableToggle(true, {
            DetectionEngineManager: h.context.Engine,
            CategoryManager: h.context.CategoryManager,
            categoryManager: h.context.categoryManager
        });
        assert.equal(h.last('setBadgeText').text, '2');
        assert.equal(h.last('setBadgeBackgroundColor').color, background);
        assert.equal(h.last('setBadgeTextColor').color, expected);
    });
}

test('production page-load blacklist and cached restore paths set and reset glyph color', async () => {
    const h = harness();
    const dependencies = { chrome: h.context.chrome, Utils: h.context.Utils,
        CategoryManager: h.context.CategoryManager, categoryManager: {}, History: {} };
    const notify = () => h.context.Engine.handlePageLoadNotification(
        { url: 'https://example.com' }, { tab: { id: 7 } }, dependencies);
    await notify();
    assert.equal(h.last('setBadgeText').text, h.context.BADGE.TEXT.BLACKLISTED);
    assert.equal(h.last('setBadgeTextColor').color, '#7dd3fc');
    h.state.enabled = false;
    await notify();
    assert.equal(h.last('setBadgeText').text, 'OFF');
    assert.equal(h.last('setBadgeTextColor').color, '#000000');
    h.state.enabled = true;
    h.state.blacklisted = false;
    for (const count of [1, 0]) {
        h.context.Engine.getStoredDetection = async () => ({ detectionCount: count, detectionResults: count ? [{}] : [] });
        await notify();
        assert.equal(h.last('setBadgeText').text, count ? '1' : '');
        assert.equal(h.last('setBadgeTextColor').color, count ? '#ffffff' : '#000000');
    }
});

for (const [enabled, blacklisted, expected] of [
    [true, true, ''], [false, true, 'OFF'], [false, false, 'OFF'], [true, false, '']
]) {
    test(`production empty-result badge update respects enabled=${enabled} and blacklisted=${blacklisted}`, async () => {
        const h = harness();
        h.state.enabled = enabled;
        h.state.blacklisted = blacklisted;
        await h.context.setBadgeForDetections(7, 'https://example.com', [{}]);
        await h.context.UI.clearBadgeForEmptyState();
        assert.equal(h.last('setBadgeText').text, expected);
    });
}

test('production empty-result badge update rechecks exclusion after its asynchronous tab lookup', async () => {
    const h = harness();
    h.state.blacklisted = false;
    let resolveTabs;
    h.context.chrome.tabs.query = () => new Promise(resolve => { resolveTabs = resolve; });
    const clearing = h.context.UI.clearBadgeForEmptyState();
    h.state.blacklisted = true;
    await h.context.setBadgeForDetections(7, 'https://example.com', []);
    resolveTabs([{ id: 7, url: 'https://example.com' }]);
    await clearing;
    assert.equal(h.last('setBadgeText').text, h.context.BADGE.TEXT.BLACKLISTED);
    assert.equal(h.last('setBadgeTextColor').color, '#7dd3fc');
});
