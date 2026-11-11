/**
 * The record of what the webhook did (Settings → Detection → Webhooks → Recent deliveries): the last few attempts, a
 * line each. Pure (no browser APIs). It holds the page's host, never the webhook's address, headers or payload.
 *
 *   MAX_ENTRIES   how many lines are kept
 *   clean()       an entry as the log keeps it: known fields only, short values
 *   errorClassOf() 'network' | 'blocked' | 'config' for a failed request: the kind, never the error's own text (it could name the address)
 *   append()      the log with one more entry (newest last), cut to MAX_ENTRIES
 *   forget()      the log with the page blanked on the lines that name a page the person has since left out
 *
 * An entry: { t, page, outcome: 'sent' | 'failed' | 'skipped', trigger: 'scan' | 'cache' | 'test' | 'retry',
 *             status?, error?: 'network' | 'blocked' | 'config', reason?: 'site' | 'category' | 'confidence', ms?,
 *             id?, attempt?, retryAt? }
 * id names a failed delivery the worker still holds for a retry (modules/core/webhook-retry.js), attempt is which try this line is
 * (a retry is 2 and up), retryAt when the next automatic retry runs.
 */
(function(root) {
  'use strict';

  const MAX_ENTRIES = 20;
  const OUTCOMES = Object.freeze(['sent', 'failed', 'skipped']);
  const TRIGGERS = Object.freeze(['scan', 'cache', 'test', 'retry']);
  const ERRORS = Object.freeze(['network', 'blocked', 'config']);
  const REASONS = Object.freeze(['site', 'category', 'confidence']);

  const whole = (value, max) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.min(Math.round(Number(value)), max) : undefined);

  /** @returns {object|null} null when the entry is not one a log may hold */
  function clean(entry) {
    if (!entry || typeof entry !== 'object' || !OUTCOMES.includes(entry.outcome)) return null;
    const out = {
      t: whole(entry.t, 8.64e15) || Date.now(),
      page: String(entry.page || '').slice(0, 253),
      outcome: entry.outcome,
      trigger: TRIGGERS.includes(entry.trigger) ? entry.trigger : 'scan'
    };
    const status = whole(entry.status, 999);
    if (status !== undefined) out.status = status;
    if (ERRORS.includes(entry.error)) out.error = entry.error;
    if (REASONS.includes(entry.reason)) out.reason = entry.reason;
    const ms = whole(entry.ms, 600000);
    if (ms !== undefined) out.ms = ms;
    if (typeof entry.id === 'string' && /^[a-z0-9]{1,24}$/.test(entry.id)) out.id = entry.id;
    const attempt = whole(entry.attempt, 99);
    if (attempt !== undefined && attempt > 1) out.attempt = attempt; // the first try needs no number
    const retryAt = whole(entry.retryAt, 8.64e15);
    if (retryAt !== undefined && retryAt > 0) out.retryAt = retryAt;
    return out;
  }

  function errorClassOf(error) {
    const message = String((error && error.message) || '');
    if (/HTTPS and a public host/.test(message)) return 'blocked';
    if (/Invalid webhook method/.test(message)) return 'config';
    return 'network';
  }

  function append(log, entry) {
    const kept = (Array.isArray(log) ? log : []).map(clean).filter(Boolean);
    const next = clean(entry);
    if (next) kept.push(next);
    return kept.slice(-MAX_ENTRIES);
  }

  /**
   * The log with `page` blanked on every line whose page `isKeptOut` says must not be named any more: a site added to Skipped sites
   * or to History's ignored sites after the line was written, History paused, a site left out of "only these sites". Only the page
   * goes: what happened, when and the status stay, and so does the id a Retry button still uses. A line that names no page is not
   * asked about. Pure: the log it is given is not changed.
   * @param {Array<object>} log
   * @param {(page: string) => boolean} isKeptOut  `true` for a page to forget; any other answer (a promise from an async check
   *        included) leaves the line as it is, so a page that was not judged is never blanked
   * @returns {Array<object>} a new log in which the lines that are not blanked are the same objects as before; the log itself when
   *          no line was blanked, so a caller can tell by identity that there is nothing to write
   */
  function forget(log, isKeptOut) {
    if (!Array.isArray(log)) return [];
    if (typeof isKeptOut !== 'function') return log;
    let blanked = false;
    const next = log.map((line) => {
      if (!line || typeof line !== 'object' || !line.page) return line;
      if (isKeptOut(String(line.page)) !== true) return line;
      blanked = true;
      return { ...line, page: '' };
    });
    return blanked ? next : log;
  }

  const api = { MAX_ENTRIES, OUTCOMES, TRIGGERS, ERRORS, REASONS, clean, errorClassOf, append, forget };
  root.WebhookLog = api;
  if (typeof globalThis !== 'undefined' && globalThis !== root) globalThis.WebhookLog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : globalThis));
