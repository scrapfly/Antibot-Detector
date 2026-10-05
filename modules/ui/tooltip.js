/**
 * Tooltip - one shared 2.8-style hover tip for the popup.
 *
 * Any element with `data-tip="Text"` shows it above itself on hover or
 * keyboard focus. Optional:
 *   data-tip-detail="second line"   muted line under the title
 *   data-tip-dot="cat-captcha"      coloured dot (a class that sets --cat)
 *   data-tip-rows='[{"label":"Captcha","value":"3","dot":"cat-captcha"}]'
 *                                   breakdown rows: label left, value right,
 *                                   optional dot class and tone (green,
 *                                   amber, red) for the value colour
 * Works for markup added later (event delegation), so renderers only add
 * attributes.
 *
 * Plain `title` attributes get the same tip: on first hover the title moves
 * to data-tip (before the browser's own tooltip delay), so every hint in the
 * popup looks the same. An element with no text keeps the title as its
 * aria-label. Code that sets .title again is picked up on the next hover.
 */
(function () {
  'use strict';

  let tip = null;
  let current = null;

  function node() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.className = 'ui-tip';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    return tip;
  }

  function show(target) {
    const text = target.getAttribute('data-tip');
    if (!text) return;
    const el = node();
    const title = document.createElement('div');
    title.className = 'ui-tip-title';
    // Mixed-script text (Arabic words, Latin names, digits) reads in its own direction
    title.dir = 'auto';
    const dot = target.getAttribute('data-tip-dot');
    if (dot) {
      const i = document.createElement('i');
      i.className = `ui-tip-dot ${dot}`;
      title.appendChild(i);
    }
    const label = document.createElement('span');
    label.className = 'ui-tip-label';
    label.textContent = text;
    title.appendChild(label);
    const parts = [title];
    const detail = target.getAttribute('data-tip-detail');
    if (detail) {
      const line = document.createElement('div');
      line.className = 'ui-tip-detail';
      line.dir = 'auto';
      line.textContent = detail;
      parts.push(line);
    }
    const rows = rowsOf(target);
    if (rows.length) parts.push(rowsNode(rows));
    el.replaceChildren(...parts);
    // Measure at a neutral position; a previous right-edge tip must not
    // constrain the next tip's available width.
    el.style.top = '0px';
    el.style.left = '0px';
    el.hidden = false;
    current = target;

    // Centred above the element; flips below when there is no room
    const r = target.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    const gap = 6;
    let top = r.top - t.height - gap;
    let below = false;
    if (top < 6) { top = r.bottom + gap; below = true; }
    top = Math.max(gap, Math.min(top, window.innerHeight - t.height - gap));
    const left = Math.max(gap, Math.min(r.left + r.width / 2 - t.width / 2, window.innerWidth - t.width - gap));
    el.style.top = `${Math.round(top)}px`;
    el.style.left = `${Math.round(left)}px`;
    el.classList.toggle('ui-tip--below', below);
  }

  /** Breakdown rows from data-tip-rows; malformed JSON shows no rows. */
  function rowsOf(target) {
    const raw = target.getAttribute('data-tip-rows');
    if (!raw) return [];
    try {
      const rows = JSON.parse(raw);
      return Array.isArray(rows)
        ? rows.filter(row => row && typeof row === 'object' && (row.label || row.value)).slice(0, 12)
        : [];
    } catch (_) {
      return [];
    }
  }

  function rowsNode(rows) {
    const list = document.createElement('div');
    list.className = 'ui-tip-rows';
    for (const row of rows) {
      const line = document.createElement('div');
      line.className = 'ui-tip-row';
      const name = document.createElement('span');
      name.className = 'ui-tip-row-label';
      if (typeof row.dot === 'string' && /^[a-z0-9 -]+$/i.test(row.dot)) {
        const i = document.createElement('i');
        i.className = `ui-tip-dot ${row.dot}`;
        name.appendChild(i);
      }
      name.appendChild(document.createTextNode(String(row.label ?? '')));
      // Each label orders its own mixed-script text (Arabic words, Latin names, digits)
      name.dir = 'auto';
      line.appendChild(name);
      if (row.value !== undefined && row.value !== null && row.value !== '') {
        const value = document.createElement('span');
        value.className = 'ui-tip-row-value';
        value.dir = 'auto';
        if (['green', 'amber', 'red'].includes(row.tone)) value.classList.add(`tone-${row.tone}`);
        value.textContent = String(row.value);
        line.appendChild(value);
      }
      list.appendChild(line);
    }
    return list;
  }

  function hide() {
    if (tip) tip.hidden = true;
    current = null;
  }

  /** Move a native title into data-tip so the browser tooltip never shows. */
  function adoptTitle(el) {
    const title = el.getAttribute('title');
    if (title === null) return;
    el.removeAttribute('title');
    if (!title.trim()) return;
    el.setAttribute('data-tip', title);
    if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', title);
  }

  function init() {
    document.addEventListener('mouseover', (e) => {
      if (!e.target.closest) return;
      const titled = e.target.closest('[title]');
      if (titled && !(titled instanceof SVGElement)) adoptTitle(titled);
      const target = e.target.closest('[data-tip]');
      if (target && target !== current) show(target);
      else if (!target && current) hide();
    });
    document.addEventListener('focusin', (e) => {
      if (!e.target.closest) return;
      const titled = e.target.closest('[title]');
      if (titled && !(titled instanceof SVGElement)) adoptTitle(titled);
      const target = e.target.closest('[data-tip]');
      if (target) show(target);
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('scroll', hide, true);
    document.addEventListener('click', hide, true);
    window.addEventListener('resize', hide);
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof self !== 'undefined') self.Tooltip = { show, hide, rowsOf };
})();
