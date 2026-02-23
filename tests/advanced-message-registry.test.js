const test = require('node:test');
const assert = require('node:assert/strict');

const { AdvancedMessageTypes } = require('../modules/core/message-types.js');
const {
    registerAdvancedCaptureHandlers
} = require('../background/handlers/messages-advanced-capture.js');

global.AdvancedMessageTypes = AdvancedMessageTypes;

// Provide capture-state globals referenced by handler closures.
global.reCaptchaCaptureState = new Map();
global.funcaptchaCaptureState = new Map();

test('registerAdvancedCaptureHandlers registers every advanced message type', () => {
    const registry = {};
    registerAdvancedCaptureHandlers(registry, {});

    const messageKeys = Object.values(AdvancedMessageTypes);
    assert.equal(Object.keys(registry).length, messageKeys.length, 'Registry key count does not match message constants');
    messageKeys.forEach((messageKey) => {
        assert.equal(typeof registry[messageKey], 'function', `Missing handler for ${messageKey}`);
    });
});

test('advanced message constants are unique', () => {
    const values = Object.values(AdvancedMessageTypes);
    const unique = new Set(values);
    assert.equal(unique.size, values.length);
});
