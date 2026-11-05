/**
 * WorkerVersion: is the service worker as new as the popup that talks to it?
 *
 * A popup's files are read fresh every time it opens; the service worker only runs the code it had when the extension was
 * loaded or reloaded. After the files change without a reload (an unpacked extension being edited, an update that did not
 * restart the worker) the popup asks for things the worker does not know, and a button fails with a message that says
 * nothing about the cause. Both sides write down the names of the messages they know (WorkerMessages), so a fingerprint of
 * that list says whether they run the same code: the worker answers WORKER_FINGERPRINT with its own, the popup compares it
 * with its own, and says so when they differ or when the worker does not know the question (one older than this check).
 *
 *   fingerprintOf(registry)      a short text for the names in a registry; the same names give the same text, in any order
 *   answer(registry)             what the worker answers to WORKER_FINGERPRINT
 *   isOutdated(send, registry)   true: the worker is older; false: it is current; null: it could not be told (no answer)
 *
 * Pure but for the messaging, which is a parameter. Loads after worker-messages.js in the worker (background.js) and the
 * popup (popup.html). No dependencies.
 */
(function(root) {
  'use strict';

  /** FNV-1a (32 bit) of the sorted names, and how many there are. */
  function fingerprintOf(registry) {
    const names = Object.keys(registry || {}).sort();
    const text = names.join('|');
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `${(hash >>> 0).toString(16).padStart(8, '0')}-${names.length}`;
  }

  function answer(registry) {
    return { status: 'ok', fingerprint: fingerprintOf(registry) };
  }

  /**
   * Ask the worker for its fingerprint and compare it with this context's own.
   * @param {function} send - (message) => Promise of the worker's answer (chrome.runtime.sendMessage)
   * @param {object} registry - WorkerMessages
   * @returns {Promise<boolean|null>} null when the worker did not answer (it is starting, or gone): that says nothing
   */
  async function isOutdated(send, registry) {
    let reply;
    try {
      reply = await send({ type: registry.WORKER_FINGERPRINT });
    } catch (_) {
      return null;
    }
    // A worker that does not know the question answers { status: 'unknown' }: it is from before this check
    if (reply && reply.status === 'unknown') return true;
    if (reply && reply.status === 'ok' && typeof reply.fingerprint === 'string') return reply.fingerprint !== fingerprintOf(registry);
    return null;
  }

  const api = { fingerprintOf, answer, isOutdated };
  root.WorkerVersion = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.WorkerVersion = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
