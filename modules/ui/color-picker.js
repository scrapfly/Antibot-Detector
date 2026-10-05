/**
 * ColorPicker — in-popup replacement for Chrome's native <input type="color">
 * chooser (a white OS dialog that cannot be styled).
 *
 * Every <input type="color"> in the popup keeps working as the value holder:
 * it still renders the swatch, its id and value are what the save/sync code
 * reads, and it still receives `input` events while the colour is being
 * picked and one `change` event when the picker closes with a new value —
 * exactly what the native chooser dispatched. Only the native dialog is
 * suppressed (the click's default action is prevented) and this popover is
 * shown instead, anchored to the swatch and kept inside the popup window.
 *
 * Delegated at window level, so inputs injected later (the settings modal is
 * fetched and inserted at runtime) need no per-element setup.
 *
 * Keyboard: Enter/Space on a swatch opens it; arrows move the focused
 * saturation/brightness handle or hue handle (Shift = bigger steps);
 * Enter on a handle applies and closes; Escape restores the original colour
 * and closes; Tab stays inside the popover while it is open.
 */
(function () {
  'use strict';

  const PRESETS = ['#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#06b6d4', '#ec4899', '#6b7280'];
  const EDGE = 8;   // minimum gap to the popup window edges
  const GAP = 6;    // gap between swatch and popover

  const tr = (key, fallback) => (typeof I18n !== 'undefined' && I18n.tr) ? I18n.tr(key, fallback) : fallback;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  // ---- colour maths ------------------------------------------------------
  function parseHex(value) {
    let s = String(value || '').trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    const n = parseInt(s, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function toHex({ r, g, b }) {
    return '#' + [r, g, b].map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0')).join('');
  }

  function rgbToHsv({ r, g, b }) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
    let h = 0;
    if (d) {
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s: max ? d / max : 0, v: max };
  }

  function hsvToRgb({ h, s, v }) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
  }

  // ---- state -------------------------------------------------------------
  let pop = null;          // popover root (built once)
  let els = {};            // popover parts
  let anchor = null;       // the <input type="color"> being edited
  let initial = '';        // value when opened (Escape restores it)
  let hsv = { h: 0, s: 0, v: 0 };

  function build() {
    pop = document.createElement('div');
    pop.className = 'cp-popover';
    pop.setAttribute('role', 'dialog');
    pop.hidden = true;
    pop.innerHTML = `
      <div class="cp-sv">
        <div class="cp-sv-handle" tabindex="0" role="slider"></div>
      </div>
      <div class="cp-row">
        <span class="cp-preview" aria-hidden="true"></span>
        <div class="cp-hue">
          <div class="cp-hue-handle" tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="360"></div>
        </div>
      </div>
      <div class="cp-fields">
        <label class="cp-field cp-field--hex"><input class="cp-input" data-field="hex" type="text" maxlength="7" spellcheck="false" autocomplete="off"><span class="cp-field-label">HEX</span></label>
        <label class="cp-field"><input class="cp-input" data-field="r" type="text" inputmode="numeric" maxlength="3" autocomplete="off"><span class="cp-field-label">R</span></label>
        <label class="cp-field"><input class="cp-input" data-field="g" type="text" inputmode="numeric" maxlength="3" autocomplete="off"><span class="cp-field-label">G</span></label>
        <label class="cp-field"><input class="cp-input" data-field="b" type="text" inputmode="numeric" maxlength="3" autocomplete="off"><span class="cp-field-label">B</span></label>
      </div>
      <div class="cp-presets" role="group">
        ${PRESETS.map((c) => `<button type="button" class="cp-preset" data-color="${c}" style="background:${c}" aria-label="${c.toUpperCase()}" title="${c.toUpperCase()}"></button>`).join('')}
      </div>`;
    document.body.appendChild(pop);

    els = {
      sv: pop.querySelector('.cp-sv'),
      svHandle: pop.querySelector('.cp-sv-handle'),
      hue: pop.querySelector('.cp-hue'),
      hueHandle: pop.querySelector('.cp-hue-handle'),
      preview: pop.querySelector('.cp-preview'),
      hex: pop.querySelector('[data-field="hex"]'),
      r: pop.querySelector('[data-field="r"]'),
      g: pop.querySelector('[data-field="g"]'),
      b: pop.querySelector('[data-field="b"]'),
      presets: pop.querySelector('.cp-presets')
    };

    bindDrag(els.sv, (x, y, rect) => {
      hsv.s = clamp(x / rect.width, 0, 1);
      hsv.v = clamp(1 - y / rect.height, 0, 1);
      commitHsv();
    }, els.svHandle);
    bindDrag(els.hue, (x, _y, rect) => {
      hsv.h = clamp(x / rect.width, 0, 1) * 359.999;
      commitHsv();
    }, els.hueHandle);

    els.svHandle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.1 : 0.01;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      if (moves[e.key]) {
        e.preventDefault();
        hsv.s = clamp(hsv.s + moves[e.key][0], 0, 1);
        hsv.v = clamp(hsv.v + moves[e.key][1], 0, 1);
        commitHsv();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    });
    els.hueHandle.addEventListener('keydown', (e) => {
      const step = e.shiftKey || e.key.startsWith('Page') ? 10 : 1;
      let h = hsv.h;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown' || e.key === 'PageDown') h -= step;
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'PageUp') h += step;
      else if (e.key === 'Home') h = 0;
      else if (e.key === 'End') h = 359;
      else if (e.key === 'Enter') { e.preventDefault(); close(true); return; }
      else return;
      e.preventDefault();
      hsv.h = clamp(h, 0, 359.999);
      commitHsv();
    });

    els.hex.addEventListener('input', () => {
      const rgb = parseHex(els.hex.value);
      if (rgb) setFromRgb(rgb, 'hex');
    });
    ['r', 'g', 'b'].forEach((ch) => {
      const field = els[ch];
      field.addEventListener('input', () => {
        const txt = field.value.replace(/[^0-9]/g, '');
        if (txt !== field.value) field.value = txt;
        if (txt === '') return;
        setFromRgb(currentRgbWith(ch, clamp(parseInt(txt, 10), 0, 255)), ch);
      });
      field.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const cur = parseInt(field.value, 10) || 0;
        const next = clamp(cur + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1), 0, 255);
        setFromRgb(currentRgbWith(ch, next));
      });
    });
    pop.querySelectorAll('.cp-input').forEach((field) => {
      field.addEventListener('blur', () => render());      // normalise partial input
      field.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); close(true); }
      });
    });

    els.presets.addEventListener('click', (e) => {
      const btn = e.target.closest('.cp-preset');
      if (!btn) return;
      setFromRgb(parseHex(btn.dataset.color));
    });
    // Enter on a preset picks it and closes, like Enter on the handles/fields.
    els.presets.addEventListener('keydown', (e) => {
      const btn = e.target.closest('.cp-preset');
      if (!btn || e.key !== 'Enter') return;
      e.preventDefault();
      setFromRgb(parseHex(btn.dataset.color));
      close(true);
    });

    pop.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusables = [...pop.querySelectorAll('[tabindex="0"], input, button')];
      const i = focusables.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? focusables.length - 1 : i - 1) : (i === focusables.length - 1 ? 0 : i + 1);
      e.preventDefault();
      focusables[next].focus();
    });
  }

  function currentRgbWith(ch, value) {
    const rgb = hsvToRgb(hsv);
    const out = { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };
    out[ch] = value;
    return out;
  }

  function bindDrag(area, onMove, handle) {
    area.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      area.setPointerCapture(e.pointerId);
      handle.focus({ preventScroll: true });
      const move = (ev) => {
        const rect = area.getBoundingClientRect();
        onMove(ev.clientX - rect.left, ev.clientY - rect.top, rect);
      };
      move(e);
      const up = () => {
        area.removeEventListener('pointermove', move);
        area.removeEventListener('pointerup', up);
        area.removeEventListener('pointercancel', up);
      };
      area.addEventListener('pointermove', move);
      area.addEventListener('pointerup', up);
      area.addEventListener('pointercancel', up);
    });
  }

  function setFromRgb(rgb, skipField) {
    const next = rgbToHsv(rgb);
    // Greys and black carry no hue/saturation: keep the handles where they are.
    if (next.v === 0) { next.h = hsv.h; next.s = hsv.s; }
    else if (next.s === 0) next.h = hsv.h;
    hsv = next;
    writeValue(toHex(rgb));
    render(skipField);
  }

  function commitHsv() {
    writeValue(toHex(hsvToRgb(hsv)));
    render();
  }

  // Write to the real input and fire `input`, as the native chooser does live.
  function writeValue(hex) {
    if (!anchor || anchor.value === hex) return;
    anchor.value = hex;
    anchor.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function render(skipField) {
    const rgb = hsvToRgb(hsv);
    const hex = toHex(rgb);
    pop.style.setProperty('--cp-hue', `hsl(${hsv.h}, 100%, 50%)`);
    pop.style.setProperty('--cp-color', hex);
    els.svHandle.style.left = `${hsv.s * 100}%`;
    els.svHandle.style.top = `${(1 - hsv.v) * 100}%`;
    els.hueHandle.style.left = `${(hsv.h / 360) * 100}%`;
    els.svHandle.setAttribute('aria-valuetext',
      `${tr('colorPickerSaturation', 'Saturation')} ${Math.round(hsv.s * 100)}%, ${tr('colorPickerBrightness', 'Brightness')} ${Math.round(hsv.v * 100)}%`);
    els.hueHandle.setAttribute('aria-valuenow', String(Math.round(hsv.h)));
    if (skipField !== 'hex') els.hex.value = hex.toUpperCase();
    ['r', 'g', 'b'].forEach((ch) => { if (skipField !== ch) els[ch].value = String(Math.round(rgb[ch])); });
    els.presets.querySelectorAll('.cp-preset').forEach((btn) => {
      btn.setAttribute('aria-pressed', btn.dataset.color === hex ? 'true' : 'false');
    });
  }

  function applyLabels() {
    pop.setAttribute('aria-label', tr('colorPickerTitle', 'Color picker'));
    els.svHandle.setAttribute('aria-label', tr('colorPickerArea', 'Saturation and brightness'));
    els.hueHandle.setAttribute('aria-label', tr('colorPickerHue', 'Hue'));
    els.hex.setAttribute('aria-label', 'HEX');
    els.r.setAttribute('aria-label', tr('colorPickerRed', 'Red'));
    els.g.setAttribute('aria-label', tr('colorPickerGreen', 'Green'));
    els.b.setAttribute('aria-label', tr('colorPickerBlue', 'Blue'));
    els.presets.setAttribute('aria-label', tr('colorPickerPresets', 'Preset colors'));
  }

  // ---- positioning -------------------------------------------------------
  function scrollParent(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if (oy === 'auto' || oy === 'scroll') return p;
    }
    return null;
  }

  function position() {
    if (!anchor || pop.hidden) return;
    const a = anchor.getBoundingClientRect();
    const sp = scrollParent(anchor);
    if (sp) {
      const r = sp.getBoundingClientRect();
      // Swatch scrolled out of its scroll box: the popover would float over nothing.
      if (a.bottom < r.top || a.top > r.bottom) { close(true); return; }
    }
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    const below = vh - EDGE - (a.bottom + GAP);
    const above = a.top - GAP - EDGE;
    let top;
    let placement;
    if (h <= below) { top = a.bottom + GAP; placement = 'below'; }
    else if (h <= above) { top = a.top - GAP - h; placement = 'above'; }
    else { top = clamp(vh - EDGE - h, EDGE, vh); placement = 'overlap'; }
    // Right-align with the swatch (swatches sit at the right of each row), then keep inside.
    const left = clamp(a.right - w, EDGE, vw - EDGE - w);
    pop.style.top = `${Math.round(top)}px`;
    pop.style.left = `${Math.round(left)}px`;
    pop.dataset.placement = placement;
  }

  // ---- open / close ------------------------------------------------------
  function open(input) {
    if (!pop) build();
    if (anchor && anchor !== input) close(true);
    anchor = input;
    initial = input.value;
    const rgb = parseHex(input.value) || { r: 0, g: 0, b: 0 };
    hsv = rgbToHsv(rgb);
    applyLabels();
    render();
    pop.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    position();
    els.svHandle.focus({ preventScroll: true });
    window.addEventListener('pointerdown', onOutsidePointer, true);
    window.addEventListener('keydown', onKeydown, true);
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
  }

  function close(commit, restoreFocus) {
    if (!anchor) return;
    const input = anchor;
    if (!commit && input.value !== initial) {
      input.value = initial;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (input.value !== initial) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    anchor = null;
    pop.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    window.removeEventListener('pointerdown', onOutsidePointer, true);
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('scroll', position, true);
    window.removeEventListener('resize', position);
    if (restoreFocus || pop.contains(document.activeElement)) input.focus({ preventScroll: true });
  }

  function onOutsidePointer(e) {
    if (pop.contains(e.target) || e.target === anchor) return;
    close(true, false);
  }

  function onKeydown(e) {
    if (e.key !== 'Escape') return;
    // Keep the settings modal's own Escape handler from closing the modal.
    e.preventDefault();
    e.stopImmediatePropagation();
    close(false, true);
  }

  function isColorInput(el) {
    return el instanceof HTMLInputElement && el.type === 'color' && !el.disabled;
  }

  // Suppress the native chooser for every colour input and show ours instead.
  // A click's default action is what opens the native dialog (keyboard
  // Enter/Space on the swatch arrive here as a synthesized click too).
  window.addEventListener('click', (e) => {
    const input = e.target;
    if (!isColorInput(input)) return;
    e.preventDefault();
    if (anchor === input) close(true);
    else open(input);
  }, true);

  // Screen readers: the swatch opens a dialog.
  document.addEventListener('focusin', (e) => {
    const input = e.target;
    if (isColorInput(input) && !input.hasAttribute('aria-haspopup')) {
      input.setAttribute('aria-haspopup', 'dialog');
      input.setAttribute('aria-expanded', anchor === input ? 'true' : 'false');
    }
  });

  const api = { open, close: () => close(true), isOpen: () => !!anchor, PRESETS };
  if (typeof window !== 'undefined') window.ColorPicker = api;
})();
