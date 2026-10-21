/**
 * Retrying failed webhook deliveries (Settings → Detection → Webhooks → Retry failed deliveries, and the Retry
 * button of Recent deliveries). Pure (no browser APIs), shared by the worker and the tests.
 *
 * The delivery log never holds a payload. To retry, the worker keeps the page data of a FAILED delivery in memory
 * only (chrome.storage.session, gone when the browser closes), for an hour, at most MAX_HELD of them. A retry builds
 * the request again from the webhook settings of that moment, so a corrected address or secret is used, and a
 * header with a token is never stored.
 *
 *   DELAYS_MS       the wait before each automatic retry: 1, 5 and 15 minutes
 *   HOLD_MS         how long a failed delivery can be retried: one hour
 *   MAX_HELD        how many failed deliveries are held
 *   isTransient()   should an automatic retry follow this failure? (no answer, 408, 425, 429, 5xx: not a refused address or another 4xx)
 *   schedule()      when the next automatic retry is due after an attempt, or null
 *   newId()         a short id for a held delivery
 *   hold()          the held map with one more delivery (oldest beyond MAX_HELD and expired ones dropped)
 *   prune()         the held map without the expired
 *   dueIds()        the held deliveries whose automatic retry is due
 *   nextDue()       the earliest due time (for the alarm), or null
 *
 * A held delivery: { id, ctx, first, attempts, due } where ctx is the page data the request is built from,
 * first when it first failed, attempts how many were made, due when its next automatic retry runs (null: none).
 */
(function(root) {
  'use strict';

  const DELAYS_MS = Object.freeze([60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]);
  const HOLD_MS = 60 * 60 * 1000;
  const MAX_HELD = 20;
  const RETRYABLE_STATUSES = Object.freeze([408, 425, 429]);

  /** @param {{status?: number, error?: string}} failure - what a failed attempt came to */
  function isTransient(failure) {
    if (!failure) return false;
    if (failure.error === 'network') return true;
    if (failure.error) return false; // an address that is not allowed, an invalid method: the person fixes those
    const status = Number(failure.status);
    return RETRYABLE_STATUSES.includes(status) || (status >= 500 && status <= 599);
  }

  /**
   * @param {number} attempts - how many attempts were made so far (1 after the first)
   * @param {number} now
   * @param {boolean} auto - Retry failed deliveries is on
   * @param {boolean} transient - the failure is one worth retrying by itself
   * @returns {number|null}
   */
  function schedule(attempts, now, auto, transient) {
    if (!auto || !transient) return null;
    const wait = DELAYS_MS[Math.floor(attempts) - 1];
    return wait === undefined ? null : now + wait;
  }

  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
  function newId(now, random = Math.random) {
    let tail = '';
    for (let i = 0; i < 4; i++) tail += ALPHABET[Math.floor(random() * ALPHABET.length)];
    return `${Math.floor(now).toString(36)}${tail}`;
  }

  const isRecord = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  function prune(held, now) {
    const out = {};
    if (!isRecord(held)) return out;
    for (const [id, item] of Object.entries(held)) {
      if (!isRecord(item) || !isRecord(item.ctx) || !(Number(item.first) > 0)) continue;
      if (now - Number(item.first) >= HOLD_MS) continue;
      out[id] = item;
    }
    return out;
  }

  function hold(held, item, now) {
    const out = prune(held, now);
    out[item.id] = { id: item.id, ctx: item.ctx, first: item.first, attempts: item.attempts, due: item.due === undefined ? null : item.due };
    const ids = Object.keys(out);
    if (ids.length > MAX_HELD) {
      ids.sort((a, b) => out[a].first - out[b].first); // the oldest go
      for (const id of ids.slice(0, ids.length - MAX_HELD)) delete out[id];
    }
    return out;
  }

  function dueIds(held, now) {
    return Object.values(prune(held, now))
      .filter((item) => typeof item.due === 'number' && item.due <= now)
      .sort((a, b) => a.due - b.due)
      .map((item) => item.id);
  }

  function nextDue(held, now) {
    const times = Object.values(prune(held, now)).map((item) => item.due).filter((t) => typeof t === 'number');
    return times.length ? Math.min(...times) : null;
  }

  const api = { DELAYS_MS, HOLD_MS, MAX_HELD, isTransient, schedule, newId, hold, prune, dueIds, nextDue };
  root.WebhookRetry = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.WebhookRetry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
