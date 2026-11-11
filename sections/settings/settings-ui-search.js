// Settings search: the box above the tabs that narrows all four tabs to the settings whose text holds what was typed.
// Requires settings-ui.js to load first (it defines const SettingsUI and the card folding this reuses).
//
// It reads the page's own text, which I18n has already translated, so it works in every language. Matching ignores case and
// accents; every typed word must be somewhere in the setting (its name, its description, the title of its card, the title of its
// group); fewer than two letters is not a search (one character is enough in Chinese, Japanese and Korean, where it is a word).
// It only hides, with a class (never an inline style or [hidden]: the page's own switches use those); it unfolds the cards that
// match with the card folding's own foldCard and changes tab with switchTab; and it reads and writes no setting value.

SettingsUI.SEARCH_HIDDEN_CLASS = 'settings-search-hidden';
SettingsUI.SEARCH_REVEAL_CLASS = 'settings-search-reveal';
SettingsUI.SEARCH_MIN_LENGTH = 2;

// One setting: a row with a title and a description, a row of a card body, one group of the webhook fields, a colour, a data item;
// and a page of the Tag colours, which the pager shows one at a time
SettingsUI.SEARCH_ROW_SELECTOR = '.settings-row, .setting-row, .setting-group, .color-row, .data-item, .color-page';
SettingsUI.SEARCH_PAGE_SELECTOR = '.color-page';
// Under a card's title, the element that holds its rows
SettingsUI.SEARCH_BODY_SELECTOR = '.settings-card-body, .data-card-body, .settings-stats-body';

// Accents are marks that NFKD splits off: the Latin and Greek ones, the Arabic vowel signs and tatweel, the Hebrew points.
// Marks that are part of the letter (Thai, Devanagari, the Japanese voicing marks) are kept.
SettingsUI.SEARCH_ACCENTS = /[̀-ͯـً-ְٰٟ-ׇ]/g;
// Letters with no accent to split off, written as plain letters: sharp s, ae, oe, o with a stroke, d with a stroke, eth, l with a
// stroke, thorn, and the Turkish dotless i (a person types i)
SettingsUI.SEARCH_LETTERS = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ł': 'l', 'þ': 'th', 'ı': 'i' };
// Hangul jamo, kana, and the Chinese characters: one of them is a word
SettingsUI.SEARCH_WORD_CHARACTER = /[ᄀ-ᇿ぀-ヿ㐀-䶿一-鿿豈-﫿]/;

/** Text as the search compares it: no case, no accents, compatibility forms (full-width letters) in their plain form */
SettingsUI.searchFold = function(text) {
    return String(text).normalize('NFKD').replace(SettingsUI.SEARCH_ACCENTS, '').toLowerCase()
      .replace(/[ßæœøđðłþı]/g, (letter) => SettingsUI.SEARCH_LETTERS[letter]);
};

/** The words of a query, folded; none when the query is empty or too short to be a search */
SettingsUI.searchTerms = function(query) {
    const terms = [...new Set(SettingsUI.searchFold(query).split(/\s+/).filter(Boolean))];
    const long = terms.some((term) => [...term].length >= SettingsUI.SEARCH_MIN_LENGTH || SettingsUI.SEARCH_WORD_CHARACTER.test(term));
    return long ? terms : [];
};

/** The text of an element as the page holds it (what is translated is in the DOM, shown or not) */
SettingsUI.searchText = function(element) {
    return element.textContent || '';
};

/** Shown as the page itself has it, not counting what the search hid: no [hidden], no inline display: none (a switch's) */
SettingsUI.searchShownByPage = function(element) {
    return !element.hidden && !(element.style && element.style.display === 'none');
};

/**
 * What the search reads of one tab: its groups (a title, then the cards and blocks under it) and, inside a block, its settings.
 * A setting is a row with what follows it up to the next row (its hint, the panel its switch opens). What comes before the first
 * row (a card's description) and the card's own title belong to the block and count for every setting in it. A block the page has
 * switched off (the webhook fields while the webhook is off) is read together with the block before it, which is where its switch is.
 * @param {Element} panel - a .settings-tab-content
 * @returns {Array<{element: Element, title: string, blocks: Array<{elements: Element[], units: ?Array, head: string, text: string}>}>}
 */
SettingsUI.searchModel = function(panel) {
    const headSelector = SettingsUI.CARD_HEAD_SELECTOR.replace(/:scope > /g, '');
    const kids = (element) => Array.from(element.children || []);
    const textOf = SettingsUI.searchText;
    const isRow = (element) => element.matches(SettingsUI.SEARCH_ROW_SELECTOR) && !element.matches(headSelector);
    const rowsIn = (element) => kids(element).some(isRow);

    const blockOf = (elements) => {
      const block = { elements, units: null, head: '', text: elements.map(textOf).join(' ') };
      const first = elements[0];
      // Where the rows are: the card itself (Core Settings, or a switch row and what it opens), the body under the card's title,
      // or a plain block of rows (the webhook fields)
      const holder = first.matches('.settings-card')
        ? (rowsIn(first) ? first : kids(first).find((child) => child.matches(SettingsUI.SEARCH_BODY_SELECTOR) && rowsIn(child)))
        : (rowsIn(first) ? first : null);
      if (!holder) return block;
      block.units = [];
      for (const child of kids(holder)) {
        if (child.matches(headSelector)) block.head += ` ${textOf(child)}`;
        else if (isRow(child)) block.units.push({ elements: [child], behind: '' });
        else if (block.units.length) block.units[block.units.length - 1].elements.push(child);
        else block.head += ` ${textOf(child)}`;
      }
      if (holder !== first) for (const child of kids(first)) if (child !== holder) block.head += ` ${textOf(child)}`;
      block.units[block.units.length - 1].behind = elements.slice(1).map(textOf).join(' ');
      return block;
    };

    const groupOf = (group) => {
      const children = kids(group);
      const isTitle = (child) => child.classList.contains('settings-card-group-title');
      const blocks = [];
      for (const child of children) {
        if (isTitle(child)) continue;
        if (blocks.length && !SettingsUI.searchShownByPage(child)) blocks[blocks.length - 1].push(child);
        else blocks.push([child]);
      }
      const title = children.filter((child) => isTitle(child) && SettingsUI.searchShownByPage(child)).map(textOf).join(' ');
      return { element: group, title, blocks: blocks.map(blockOf) };
    };

    return kids(panel).map((child) => (child.classList.contains('settings-card-group')
      ? groupOf(child) : { element: child, title: '', blocks: [blockOf([child])] }));
};

/** A card the search found is opened, with the card folding's own function, so its head says it (aria-expanded) */
SettingsUI.unfoldSearchedCard = function(card) {
    if (!card.classList.contains('is-collapsible') || !card.classList.contains('is-collapsed')) return;
    SettingsUI.foldCard(card, card.querySelector(SettingsUI.CARD_HEAD_SELECTOR), false);
};

/**
 * Hides, in one tab, every setting, card and group that does not hold all the terms, and unfolds the cards that do.
 * A setting is read with the titles above it (its group's and its card's), so "webhook secret" finds the signing secret and
 * "cache settings" finds both rows of that card.
 * @param {Element} panel - a .settings-tab-content
 * @param {string[]} terms - folded words, all of which must be found
 * @param {{unfold?: boolean}} [options]
 * @returns {number} how many settings (or whole cards, where a card is not split into rows) match
 */
SettingsUI.filterSettingsPanel = function(panel, terms, { unfold = true } = {}) {
    const textOf = SettingsUI.searchText;
    const hide = (elements, hidden) => elements.forEach((element) => element.classList.toggle(SettingsUI.SEARCH_HIDDEN_CLASS, hidden));
    const holds = (...parts) => {
      const text = SettingsUI.searchFold(parts.join(' '));
      return terms.every((term) => text.includes(term));
    };
    let found = 0;
    for (const group of SettingsUI.searchModel(panel)) {
      let groupShown = false;
      for (const block of group.blocks) {
        let blockShown = false;
        if (block.units) {
          for (const unit of block.units) {
            const match = holds(group.title, block.head, ...unit.elements.map(textOf), unit.behind);
            hide(unit.elements, !match);
            if (match) { found += 1; blockShown = true; }
            // A page of the colour pager is a view of one list, not a switch that turns something on: the page that matches is
            // shown even though the pager has another one open (the pager's own state is left as it is)
            const page = unit.elements[0];
            if (match && page.matches(SettingsUI.SEARCH_PAGE_SELECTOR) && !SettingsUI.searchShownByPage(page)) page.classList.add(SettingsUI.SEARCH_REVEAL_CLASS);
          }
        } else {
          blockShown = holds(group.title, block.text);
          if (blockShown) found += 1;
        }
        hide(block.elements, !blockShown);
        if (blockShown && unfold) SettingsUI.unfoldSearchedCard(block.elements[0]);
        groupShown = groupShown || blockShown;
      }
      hide([group.element], !groupShown);
    }
    return found;
};

/** Takes off what a search put on the page: the classes that hide and the one that shows a page of the pager */
SettingsUI.clearSearchMarks = function(root) {
    for (const name of [SettingsUI.SEARCH_HIDDEN_CLASS, SettingsUI.SEARCH_REVEAL_CLASS]) {
      root.querySelectorAll(`.${name}`).forEach((element) => element.classList.remove(name));
    }
};

/** The tab that is open, by name ('general', 'detection', 'history', 'data') */
SettingsUI.openSettingsTab = function() {
    const button = document.querySelector('.settings-tab-btn.active');
    return button ? button.getAttribute('data-settings-tab') : null;
};

/** Where the person is before a search starts, to put back when it ends: the tab, which cards are folded, how far it is scrolled */
SettingsUI.snapshotSettingsView = function(modal) {
    const body = modal.querySelector('.modal-body');
    return {
      tab: SettingsUI.openSettingsTab(),
      folds: Array.from(modal.querySelectorAll('.settings-card.is-collapsible')).map((card) => [card, card.classList.contains('is-collapsed')]),
      scroll: body ? body.scrollTop : 0
    };
};

SettingsUI.restoreSettingsView = function(snapshot) {
    for (const [card, folded] of snapshot.folds) SettingsUI.foldCard(card, card.querySelector(SettingsUI.CARD_HEAD_SELECTOR), folded);
    if (snapshot.tab && snapshot.tab !== SettingsUI.openSettingsTab()) {
      if (typeof this.switchTab === 'function') this.switchTab(snapshot.tab);
      else SettingsUI.switchTab.call(this, snapshot.tab);
    }
    const body = document.querySelector('#settingsModal .modal-body');
    if (body) body.scrollTop = snapshot.scroll;
};

/**
 * The line that says there is nothing here: shown while a search is open and the tab that is open has no setting for it. Run by
 * the search itself and, from switchTab, when a tab is opened by hand during a search.
 */
SettingsUI.syncSettingsSearchView = function() {
    const empty = document.querySelector('#settingsSearchEmpty');
    if (!empty) return;
    const state = this && this.settingsSearch;
    empty.hidden = !(state && state.active && !(state.counts[SettingsUI.openSettingsTab()] > 0));
};

/**
 * Say, to a screen reader, how many settings the search found (or that none), through the line that is always in the page: a
 * region shown together with its text is not announced. It is emptied at once, so the same words are news again, filled after a
 * short wait so a word typed over is said once, and emptied again so it never keeps what stopped being true.
 */
SettingsUI.announceSettingsSearch = function(total) {
    const region = document.querySelector('#settingsSearchStatus');
    if (!region) return;
    const timers = this.settingsSearchTimers || (this.settingsSearchTimers = {});
    clearTimeout(timers.say);
    clearTimeout(timers.clear);
    region.textContent = '';
    if (total === null) return;
    const text = total > 0
      ? FormatUtils.t('settingsSearchCountFmt', 'Settings found: {0}', total)
      : FormatUtils.t('settingsSearchNoMatch', 'No settings match your search.');
    timers.say = setTimeout(() => {
      region.textContent = text;
      timers.clear = setTimeout(() => { region.textContent = ''; }, 6000);
    }, 400);
};

/**
 * Search the four tabs for a query. Too short is no search: the page goes back to how it was. Otherwise: the first search of a
 * run remembers where the person was; every setting that does not hold all the words is hidden; the cards that match unfold; the
 * first tab that has a match opens (the open one stays when it has one, so a person who opened a tab by hand keeps it); and the
 * count is said.
 * @param {string} query
 * @param {{refresh?: boolean}} [options] refresh: read the page again (a switch changed what is there) without moving the tab,
 *   the folds or the scroll, and without saying anything
 * @returns {number} the settings found
 */
SettingsUI.runSettingsSearch = function(query, { refresh = false } = {}) {
    const terms = SettingsUI.searchTerms(query);
    const modal = document.querySelector('#settingsModal');
    if (!terms.length || !modal) {
      SettingsUI.endSettingsSearch.call(this);
      return 0;
    }
    const state = this.settingsSearch && this.settingsSearch.active ? this.settingsSearch : { active: true, snapshot: SettingsUI.snapshotSettingsView(modal) };
    // Every pass starts from the page as it is: what an earlier pass hid never stays hidden
    SettingsUI.clearSearchMarks(modal);
    const counts = {};
    let total = 0;
    modal.querySelectorAll('.settings-tab-content').forEach((panel) => {
      const found = SettingsUI.filterSettingsPanel(panel, terms, { unfold: !refresh });
      counts[panel.getAttribute('data-tab-content')] = found;
      total += found;
    });
    Object.assign(state, { terms, counts, total });
    this.settingsSearch = state;
    if (!refresh) {
      const first = Object.keys(counts).find((name) => counts[name] > 0);
      if (first && !(counts[SettingsUI.openSettingsTab()] > 0)) {
        if (typeof this.switchTab === 'function') this.switchTab(first);
        else SettingsUI.switchTab.call(this, first);
      }
      const body = modal.querySelector('.modal-body');
      if (body) body.scrollTop = 0;
    }
    SettingsUI.syncSettingsSearchView.call(this);
    if (!refresh) SettingsUI.announceSettingsSearch.call(this, total);
    return total;
};

/** The search is over (the box is empty, or too short): everything is shown, and the tab and the folds are as they were */
SettingsUI.endSettingsSearch = function({ restore = true } = {}) {
    const state = this.settingsSearch;
    this.settingsSearch = { active: false, counts: {}, total: 0 };
    const modal = document.querySelector('#settingsModal');
    if (modal) SettingsUI.clearSearchMarks(modal);
    SettingsUI.announceSettingsSearch.call(this, null);
    if (restore && state && state.active && state.snapshot) SettingsUI.restoreSettingsView.call(this, state.snapshot);
    SettingsUI.syncSettingsSearchView.call(this);
};

/** The clear button, Escape, and a failed Save: empty the box and end the search */
SettingsUI.clearSettingsSearch = function(options) {
    const input = document.querySelector('#settingsSearchInput');
    const clear = document.querySelector('#settingsSearchClear');
    if (input) input.value = '';
    if (clear) clear.hidden = true;
    SettingsUI.endSettingsSearch.call(this, options);
};

/** Settings opens with an empty box and nothing hidden; its cards start folded again, as they always did, so nothing is restored */
SettingsUI.resetSettingsSearch = function() {
    SettingsUI.clearSettingsSearch.call(this, { restore: false });
};

SettingsUI._setupSearchListeners = function() {
    const input = document.querySelector('#settingsSearchInput');
    if (!input || input.dataset.searchBound) return;
    input.dataset.searchBound = '1';
    const owner = this;
    const clear = document.querySelector('#settingsSearchClear');
    const showClear = () => { if (clear) clear.hidden = !input.value; };
    const search = () => {
      showClear();
      SettingsUI.runSettingsSearch.call(owner, input.value);
    };
    // A word still being composed (an input method) is searched when it is committed
    input.addEventListener('input', (event) => { if (event.isComposing) showClear(); else search(); });
    input.addEventListener('compositionend', search);
    if (clear) {
      clear.addEventListener('click', () => {
        SettingsUI.clearSettingsSearch.call(owner);
        input.focus();
      });
    }
    // Escape in the box clears it; with the box empty it closes Settings, as it always did. The focus trap (ModalFocus) closes
    // Settings from a capture listener on the document, so this listens on the window, which sees the key first.
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || event.target !== input) return;
        // Escape that cancels an input method's composition belongs to the input method
        if (event.isComposing) { event.stopPropagation(); return; }
        if (!input.value) return;
        event.preventDefault();
        event.stopPropagation();
        SettingsUI.clearSettingsSearch.call(owner);
      }, true);
    }
    // A switch turned on or off during a search shows or hides fields: read the page again
    const modal = document.querySelector('#settingsModal');
    if (modal) {
      modal.addEventListener('change', (event) => {
        if (event.target !== input && owner.settingsSearch && owner.settingsSearch.active) SettingsUI.runSettingsSearch.call(owner, input.value, { refresh: true });
      });
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
