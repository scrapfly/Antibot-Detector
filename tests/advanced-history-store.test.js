const test = require('node:test');
const assert = require('node:assert/strict');

global.Logger = {
    error: () => {},
    warn: () => {},
    ui: () => {}
};

const storage = {};
global.chrome = {
    storage: {
        local: {
            async get(keys) {
                if (Array.isArray(keys)) {
                    const result = {};
                    keys.forEach((key) => {
                        result[key] = storage[key];
                    });
                    return result;
                }

                if (typeof keys === 'string') {
                    return { [keys]: storage[keys] };
                }

                return {};
            },
            async set(payload) {
                Object.assign(storage, payload);
            }
        }
    }
};

const { AdvancedHistoryStore } = require('../sections/advanced/advanced-history-store.js');

function resetStorage() {
    Object.keys(storage).forEach((key) => delete storage[key]);
}

test('AdvancedHistoryStore.load migrates legacy string items format', async () => {
    resetStorage();
    storage[AdvancedHistoryStore.STORAGE_KEY] = JSON.stringify({
        items: [
            {
                id: 'legacy_1',
                type: 'akamai',
                timestamp: 123,
                url: 'https://example.com',
                captureData: { value: 'ok' }
            }
        ]
    });

    const history = await AdvancedHistoryStore.load();
    assert.ok(Array.isArray(history.akamai));
    assert.equal(history.akamai.length, 1);
    assert.equal(history.akamai[0].data.value, 'ok');
    assert.equal(history.akamai[0].captureData.value, 'ok');

    const persisted = storage[AdvancedHistoryStore.STORAGE_KEY];
    assert.equal(typeof persisted, 'object');
    assert.ok(Array.isArray(persisted.akamai));
});

test('AdvancedHistoryStore.appendCapture removes expired and enforces limit', async () => {
    resetStorage();
    storage[AdvancedHistoryStore.STORAGE_KEY] = {
        akamai: [
            {
                id: 'expired',
                type: 'akamai',
                timestamp: 1,
                url: 'https://expired.example',
                data: { old: true },
                expiresAt: Date.now() - 60_000
            }
        ]
    };

    await AdvancedHistoryStore.appendCapture('akamai', {
        id: 'new_capture',
        timestamp: Date.now(),
        url: 'https://fresh.example',
        data: { fresh: true }
    }, {
        expiryMinutes: 30,
        limit: 1
    });

    const history = await AdvancedHistoryStore.load();
    assert.equal(history.akamai.length, 1);
    assert.equal(history.akamai[0].id, 'new_capture');
    assert.equal(history.akamai[0].data.fresh, true);
});

test('AdvancedHistoryStore.clear removes a single module without deleting others', async () => {
    resetStorage();
    storage[AdvancedHistoryStore.STORAGE_KEY] = {
        akamai: [{ id: 'a1', timestamp: Date.now(), data: {} }],
        recaptcha: [{ id: 'r1', timestamp: Date.now(), data: {} }]
    };

    await AdvancedHistoryStore.clear('akamai');
    const history = await AdvancedHistoryStore.load();
    assert.equal(history.akamai, undefined);
    assert.equal(Array.isArray(history.recaptcha), true);
});
