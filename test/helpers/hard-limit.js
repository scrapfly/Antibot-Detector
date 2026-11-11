'use strict';
// A synchronous call that has to finish at all: a pattern that must not backtrack without end, a list that must not be walked
// quadratically. It runs under the vm watchdog, which stops it where it is once `ms` have passed, so a regression fails at once
// and names its input instead of hanging the whole run. The limit is a hang detector, far above what a healthy call needs (a few
// milliseconds): no test measures how long a call took, because that depends on how busy the machine is, and such checks flaked.
const assert = require('node:assert/strict');
const vm = require('node:vm');

const context = vm.createContext({ run: null });
const script = new vm.Script('run()');

/**
 * @param {Function} fn - the call, synchronous; its result is returned
 * @param {string} what - names the input in the failure
 * @param {number} [ms] - the hard limit
 */
module.exports = function withinLimit(fn, what, ms = 5000) {
  context.run = fn;
  try {
    return script.runInContext(context, { timeout: ms });
  } catch (error) {
    if (error && error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') assert.fail(`${what}: still running after ${ms} ms`);
    throw error;
  } finally {
    context.run = null;
  }
};
