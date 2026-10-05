/**
 * RuleHelperKit - the shared building blocks of every rule helper modal
 * (window property, DOM selector, regex, whole word, case sensitive and the
 * "What is ...?" explanations).
 *
 * Every helper is one compact screen: a pinned search bar, a list of compact
 * rows (mono value + short description + outlined chip), paginated with the
 * extension's pagination bar when it does not fit, an optional pinned "dock"
 * (condition picker / preview) and a pinned footer.
 * The markup lives in sections/rules/rules.html (class `rh-modal`), the look
 * in modules/styles/rule-helpers.css, and this file owns the behaviour that
 * all of them share: ranking, row rendering, keyboard navigation, the empty /
 * no-results state and Escape-to-close.
 *
 * Dependencies: none (I18n and FormatUtils are optional at runtime).
 * The pure helpers (rankItems) are also used by node tests.
 */
(function() {
  'use strict';

  const root = (typeof globalThis !== 'undefined') ? globalThis : window;

  function tr(key, fallback) {
    if (typeof I18n !== 'undefined' && I18n && typeof I18n.tr === 'function') {
      return I18n.tr(key, fallback);
    }
    return fallback;
  }

  function fmt(key, fallback, ...args) {
    let msg = null;
    if (typeof I18n !== 'undefined' && I18n && typeof I18n.format === 'function') {
      msg = I18n.format(key, ...args);
    }
    if (msg === null || msg === undefined) {
      msg = fallback;
      for (let i = 0; i < args.length; i++) {
        msg = msg.split('{' + i + '}').join(String(args[i]));
      }
    }
    return msg;
  }

  /**
   * Rank catalog items against a query. Items are {value, desc?, chip?}.
   * Order: exact value, value prefix, value segment prefix (after . _ - $),
   * value substring, then description/chip substring. Stable within a rank.
   * An empty query returns the items unchanged (catalog order).
   */
  function rankItems(items, query, limit) {
    const max = typeof limit === 'number' ? limit : Infinity;
    const q = String(query || '').trim().toLowerCase();
    const list = Array.isArray(items) ? items : [];
    if (!q) return list.slice(0, max);

    const scored = [];
    list.forEach((item, index) => {
      const value = String(item.value || '').toLowerCase();
      const desc = String(item.desc || '').toLowerCase();
      const chip = String(item.chip || '').toLowerCase();
      let score = -1;
      if (value === q) score = 0;
      else if (value.startsWith(q)) score = 1;
      else if (value.split(/[.\-_$[\]#:]+/).some((part) => part && part.startsWith(q))) score = 2;
      else if (value.includes(q)) score = 3;
      else if (desc.includes(q) || chip.includes(q)) score = 4;
      if (score >= 0) scored.push({ item, score, index });
    });
    scored.sort((a, b) => (a.score - b.score) || (a.index - b.index));
    return scored.slice(0, max).map((entry) => entry.item);
  }

  /** De-duplicate items by value, keeping the first occurrence. */
  function uniqueByValue(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = String(item.value || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  const SEARCH_OFF_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true" focusable="false">'
    + '<circle cx="10.5" cy="10.5" r="6" stroke="currentColor" stroke-width="1.7"/>'
    + '<path d="M15 15l5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'
    + '<path d="M8 10.5h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

  /**
   * A keyboard-navigable list of compact rows.
   *
   *   const list = new RuleHelperKit.List({
   *     listEl, input, onSelect(item), onApply(item)
   *   });
   *   list.render(items, { selectedValue, empty: {title, hint} });
   *
   * Arrow keys in `input` move the active row, Enter selects it (a second
   * Enter on the already-selected row applies it), click selects and
   * double-click applies. Rows with `static: true` are display-only.
   *
   * Pagination: when the modal holds a `#<listId>Pagination` bar (the shared
   * .pagination markup), the list is paged with PaginationManager. A page
   * holds as many rows as fit the list area without scrolling, recomputed
   * when the area resizes; the bar is hidden when everything fits. Custom
   * (typed-value) rows are pinned below the page rows on every page. ↑/↓
   * roll over to the previous/next page at the edges, PageUp/PageDown switch
   * pages, and a new render (e.g. typing in the search) starts on page 1 —
   * or on the page holding the selected value.
   */
  class List {
    constructor(options) {
      this.listEl = options.listEl;
      this.input = options.input || null;
      this.onSelect = options.onSelect || (() => {});
      this.onApply = options.onApply || (() => {});
      this.items = [];
      this.rows = [];
      this.activeIndex = -1;
      this.selectedValue = null;
      this.pager = null;
      this.pagedItems = [];
      this.pinnedItems = [];
      this.renderOptions = {};

      const barId = this.listEl && this.listEl.id ? this.listEl.id + 'Pagination' : '';
      const bar = barId && typeof document !== 'undefined' ? document.getElementById(barId) : null;
      if (bar && typeof PaginationManager !== 'undefined') this.setupPagination(bar);

      if (this.listEl) {
        this.listEl.setAttribute('role', 'listbox');
        this.listEl.addEventListener('mousedown', (e) => {
          // Keep focus in the search box so the keyboard keeps working.
          if (e.target.closest('.rh-row[data-index]')) e.preventDefault();
        });
        this.listEl.addEventListener('click', (e) => {
          const row = e.target.closest('.rh-row[data-index]');
          if (!row || !this.listEl.contains(row)) return;
          e.stopPropagation();
          const index = Number(row.dataset.index);
          this.setActive(index, false);
          this.onSelect(this.items[index]);
        });
        this.listEl.addEventListener('dblclick', (e) => {
          const row = e.target.closest('.rh-row[data-index]');
          if (!row) return;
          const index = Number(row.dataset.index);
          this.onApply(this.items[index]);
        });
      }

      if (this.input) {
        this.input.addEventListener('keydown', (e) => this.handleKey(e));
      }
    }

    interactiveCount() {
      return this.rows.length;
    }

    // ---- pagination -------------------------------------------------------
    setupPagination(bar) {
      this.paginationEl = bar;
      this.scrollEl = this.listEl.closest('.rh-body') || this.listEl.parentElement;
      this.pager = new PaginationManager(bar.id, {
        pageSizer: (items) => this.measurePageStarts(items),
        onPageChange: (page, items) => this.renderPage(items)
      });
      this.lastBaseHeight = 0;
      if (typeof ResizeObserver !== 'undefined' && this.scrollEl) {
        // Re-pack when the list area changes size (dock shown, popup resized);
        // the bar's own show/hide is not a change of the area it frees.
        this.resizeObserver = new ResizeObserver(() => {
          const base = this.baseHeight();
          if (!(base > 0) || Math.abs(base - this.lastBaseHeight) < 1) return;
          if (this.refitFrame) return;
          this.refitFrame = requestAnimationFrame(() => {
            this.refitFrame = null;
            if (this.pagedItems.length) this.pager.refit();
          });
        });
        this.resizeObserver.observe(this.scrollEl);
      }
    }

    barShown() {
      return !!this.paginationEl && this.paginationEl.style.display !== 'none' && this.paginationEl.getClientRects().length > 0;
    }

    barHeight() {
      const bar = this.paginationEl;
      const previous = bar.style.display;
      bar.style.display = 'flex';
      const style = getComputedStyle(bar);
      const height = bar.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
      bar.style.display = previous;
      return height;
    }

    /** Height of the list area with the bar hidden. */
    baseHeight() {
      if (!this.scrollEl) return 0;
      return this.scrollEl.clientHeight + (this.barShown() ? this.barHeightCache || 0 : 0);
    }

    /**
     * Page start indexes: rows are packed while they fit the list area with
     * no scrolling (the bar and the pinned rows reserve their space).
     */
    measurePageStarts(items) {
      const scrollEl = this.scrollEl;
      this.barHeightCache = this.barHeight();
      const base = this.baseHeight();
      this.lastBaseHeight = base;
      if (!items.length || !(base > 0)) return [0];

      scrollEl.scrollTop = 0;
      this.listEl.replaceChildren(...items.concat(this.pinnedItems).map((item) => renderRow(item, false)));
      const rowEls = Array.from(this.listEl.children);
      const heights = rowEls.map((row) => row.getBoundingClientRect().height);
      const gap = parseFloat(getComputedStyle(this.listEl).rowGap) || 0;
      // Room for the rows: the area minus what sits above the list (section
      // head, no-results note) and the bottom padding. Sections after the
      // list (the regex quick reference) stay reachable by scrolling.
      const areaTop = scrollEl.getBoundingClientRect().top - scrollEl.scrollTop;
      const above = this.listEl.getBoundingClientRect().top - areaTop;
      const room = base - above - parseFloat(getComputedStyle(scrollEl).paddingBottom);

      const total = heights.reduce((sum, h) => sum + h, 0) + gap * Math.max(0, heights.length - 1);
      if (total <= room + 0.5) return [0];

      const pinnedHeights = heights.slice(items.length);
      const pinned = pinnedHeights.reduce((sum, h) => sum + h + gap, 0);
      const capacity = room - this.barHeightCache - pinned;
      const starts = [0];
      let used = 0;
      heights.slice(0, items.length).forEach((height, index) => {
        if (index === starts[starts.length - 1]) used = height;
        else if (used + gap + height <= capacity + 0.5) used += gap + height;
        else { starts.push(index); used = height; }
      });
      return starts;
    }

    renderPage(pageItems) {
      if (this.paginationEl) {
        this.paginationEl.style.display = this.pager.getTotalPages() > 1 ? 'flex' : 'none';
      }
      this.drawRows(pageItems.concat(this.pinnedItems), this.renderOptions);
    }

    hasPage(page) {
      return !!this.pager && page >= 1 && page <= this.pager.getTotalPages();
    }

    goToPage(page, activeIndex) {
      if (!this.hasPage(page)) return false;
      this.pager.goToPage(page);
      if (typeof activeIndex === 'number') {
        const count = this.interactiveCount();
        this.setActive(activeIndex < 0 ? count - 1 : Math.min(activeIndex, count - 1), true);
      }
      return true;
    }

    handleKey(e) {
      const count = this.interactiveCount();
      const page = this.pager ? this.pager.currentPage : 1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!count) return;
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        // Roll over to the neighbouring page at the edges
        if (delta > 0 && this.activeIndex === count - 1 && this.goToPage(page + 1, 0)) return;
        if (delta < 0 && this.activeIndex === 0) {
          const lastPagedRow = this.pager ? this.pager.getPageRange(page - 1)[1] - this.pager.getPageRange(page - 1)[0] - 1 : -1;
          if (this.goToPage(page - 1, lastPagedRow)) return;
        }
        const start = this.activeIndex < 0 ? (delta > 0 ? -1 : count) : this.activeIndex;
        const next = Math.max(0, Math.min(count - 1, start + delta));
        this.setActive(next, true);
      } else if (e.key === 'PageDown' || e.key === 'PageUp') {
        if (!this.pager) return;
        e.preventDefault();
        this.goToPage(page + (e.key === 'PageDown' ? 1 : -1), 0);
      } else if (e.key === 'Enter') {
        if (e.isComposing) return;
        e.preventDefault();
        if (this.activeIndex < 0 && count) this.setActive(0, true);
        const item = this.items[this.activeIndex];
        if (!item) return;
        if (this.selectedValue !== null && item.value === this.selectedValue) {
          this.onApply(item);
        } else {
          this.onSelect(item);
        }
      }
    }

    setActive(index, scroll) {
      this.rows.forEach((row, i) => row.classList.toggle('is-active', i === index));
      this.activeIndex = index;
      const row = this.rows[index];
      if (row) {
        if (this.input) this.input.setAttribute('aria-activedescendant', row.id);
        if (scroll) row.scrollIntoView({ block: 'nearest' });
      }
    }

    setSelected(value) {
      this.selectedValue = value === undefined ? null : value;
      this.rows.forEach((row, i) => {
        const selected = this.selectedValue !== null && this.items[i]?.value === this.selectedValue;
        row.setAttribute('aria-selected', selected ? 'true' : 'false');
      });
    }

    /**
     * items: [{value, desc?, chip?, tone?, title?, custom?, chips?: [{text, tone}]}]
     * options: {selectedValue, empty: {title, hint}, staticRows}
     */
    render(items, options = {}) {
      if (!this.listEl) return;
      if (!this.pager || options.staticRows) {
        this.drawRows(items, options);
        return;
      }
      // The selection lives in this.selectedValue (it changes between renders)
      const { selectedValue, ...rest } = options;
      this.renderOptions = rest;
      if (selectedValue !== undefined) this.selectedValue = selectedValue;
      this.pinnedItems = items.filter((item) => item.custom);
      this.pagedItems = items.filter((item) => !item.custom);
      this.pager.setItems(this.pagedItems);
      // Start on the page holding the selected value, if it is paged
      const selectedIndex = this.pagedItems.findIndex((item) => item.value === this.selectedValue);
      if (selectedIndex > 0) {
        for (let page = 1; page <= this.pager.getTotalPages(); page++) {
          const [start, end] = this.pager.getPageRange(page);
          if (selectedIndex >= start && selectedIndex < end) {
            if (page !== this.pager.currentPage) this.pager.goToPage(page);
            break;
          }
        }
      }
    }

    drawRows(items, options = {}) {
      const staticRows = !!options.staticRows;
      this.items = staticRows ? [] : items.slice();
      this.rows = [];
      this.activeIndex = -1;
      this.listEl.replaceChildren();

      if (!items.length && options.empty && !(this.pager && this.pagedItems.length)) {
        this.listEl.appendChild(renderEmpty(options.empty.title, options.empty.hint));
      }

      const idBase = this.listEl.id || 'rhList';
      items.forEach((item, index) => {
        const row = renderRow(item, staticRows);
        if (!staticRows) {
          row.dataset.index = String(index);
          row.id = idBase + '-opt-' + index;
          row.setAttribute('role', 'option');
          this.rows.push(row);
        }
        this.listEl.appendChild(row);
      });

      if (!staticRows) {
        this.setSelected(options.selectedValue === undefined ? this.selectedValue : options.selectedValue);
        const selectedIndex = this.items.findIndex((item) => item.value === this.selectedValue);
        if (selectedIndex >= 0) this.setActive(selectedIndex, false);
      }
    }
  }

  function renderChip(text, tone) {
    const chip = el('span', 'rh-chip' + (tone ? ' tone-' + tone : ''), text);
    return chip;
  }

  function renderRow(item, isStatic) {
    const row = el('div', 'rh-row' + (isStatic ? ' is-static' : '') + (item.custom ? ' is-custom' : ''));
    // Tip only when it adds something: a description, or a name long enough to be cut off
    const tip = item.title || (String(item.value).length > 28 ? item.value : '');
    if (tip) row.title = tip;
    const main = el('div', 'rh-row-main');
    main.appendChild(el('span', 'rh-row-value', item.value));
    if (item.desc) main.appendChild(el('span', 'rh-row-desc', item.desc));
    row.appendChild(main);
    const chips = item.chips || (item.chip ? [{ text: item.chip, tone: item.tone }] : []);
    chips.forEach((chip) => row.appendChild(renderChip(chip.text, chip.tone)));
    return row;
  }

  function renderEmpty(title, hint) {
    const box = el('div', 'rh-empty');
    const icon = el('span', 'rh-empty-icon');
    icon.innerHTML = SEARCH_OFF_ICON;
    box.appendChild(icon);
    const text = el('div', 'rh-empty-text');
    text.appendChild(el('div', 'rh-empty-title', title));
    if (hint) text.appendChild(el('div', 'rh-empty-hint', hint));
    box.appendChild(text);
    return box;
  }

  /** Update a section head: <div class="rh-section-head"><span title/><span count/></div> */
  function setSectionHead(headEl, title, count, options) {
    if (!headEl) return;
    // "plain" heads quote a user value, so they must not be upper-cased.
    headEl.classList.toggle('is-plain', !!(options && options.plain));
    const titleEl = headEl.querySelector('.rh-section-title');
    const countEl = headEl.querySelector('.rh-section-count');
    if (titleEl) titleEl.textContent = title;
    if (countEl) countEl.textContent = (count === null || count === undefined) ? '' : String(count);
  }

  /**
   * Build a "custom value" row for a typed value that is not in the catalog.
   */
  function customItem(value) {
    return {
      value,
      desc: tr('rhUseAsTyped', 'Use exactly as typed'),
      chip: tr('rhCustomChip', 'Custom'),
      tone: 'accent',
      custom: true
    };
  }

  function isVisible(modal) {
    return !!modal && modal.style.display !== 'none' && modal.style.display !== '';
  }

  // Escape closes the top-most open helper (helpers stack above the editor
  // and the method settings modal; only one helper is open at a time).
  const escapeHandlers = [];
  let escapeBound = false;
  function onEscape(modalSelector, closeFn) {
    escapeHandlers.push({ modalSelector, closeFn });
    if (escapeBound || typeof document === 'undefined') return;
    escapeBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      for (let i = escapeHandlers.length - 1; i >= 0; i--) {
        const handler = escapeHandlers[i];
        const modal = document.querySelector(handler.modalSelector);
        if (isVisible(modal)) {
          e.preventDefault();
          e.stopPropagation();
          handler.closeFn();
          return;
        }
      }
    }, true);
  }

  /** Render a compact mono preview into a code box from [{text, cls}] tokens. */
  function renderCode(codeEl, tokens) {
    if (!codeEl) return;
    codeEl.replaceChildren();
    tokens.filter((t) => t && t.text).forEach((token, i) => {
      if (i > 0) codeEl.appendChild(document.createTextNode(' '));
      codeEl.appendChild(el('span', token.cls || '', token.text));
    });
  }

  const RuleHelperKit = Object.freeze({
    tr,
    fmt,
    rankItems,
    uniqueByValue,
    el,
    List,
    renderRow,
    renderChip,
    renderEmpty,
    renderCode,
    setSectionHead,
    customItem,
    onEscape,
    isVisible
  });

  root.RuleHelperKit = RuleHelperKit;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RuleHelperKit;
  }
})();
