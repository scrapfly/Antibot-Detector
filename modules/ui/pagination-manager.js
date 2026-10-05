class PaginationManager {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.currentPage = 1;
    this.itemsPerPage = options.itemsPerPage || 10;
    this.filteredItems = [];
    this.onPageChange = options.onPageChange || (() => {});
    this.showWhenEmpty = options.showWhenEmpty === true;
    // Optional pageSizer(items) -> array of page start indexes (variable-size pages),
    // or null to fall back to fixed itemsPerPage pages
    this.pageSizer = options.pageSizer || null;
    this.pageStarts = null;
  }

  /**
   * Set the items to paginate
   * @param {Array} items - Array of items to paginate
   */
  setItems(items) {
    this.filteredItems = items;
    this.currentPage = 1;
    this.pageStarts = this.pageSizer ? this.pageSizer(items) : null;
    this.render();
  }

  /**
   * Recompute variable page sizes (e.g. after a resize), staying on the page
   * that holds the first item currently shown
   */
  refit() {
    if (!this.pageSizer) return;
    const [firstShown] = this.getPageRange(this.currentPage);
    this.pageStarts = this.pageSizer(this.filteredItems);
    let page = 1;
    while (page < this.getTotalPages() && this.getPageRange(page + 1)[0] <= firstShown) {
      page++;
    }
    this.currentPage = page;
    this.render();
  }

  /**
   * Get the [start, end) item indexes of a page
   * @param {number} page - Page number
   * @returns {Array<number>} Start (inclusive) and end (exclusive) indexes
   */
  getPageRange(page) {
    const total = this.filteredItems.length;
    if (this.pageStarts) {
      const start = this.pageStarts[page - 1] ?? total;
      const end = this.pageStarts[page] ?? total;
      return [start, end];
    }
    const start = (page - 1) * this.itemsPerPage;
    return [start, Math.min(start + this.itemsPerPage, total)];
  }

  /**
   * Get total number of pages
   * @returns {number} Total pages
   */
  getTotalPages() {
    if (this.pageStarts) {
      return this.pageStarts.length;
    }
    return Math.ceil(this.filteredItems.length / this.itemsPerPage);
  }

  /**
   * Get items for current page
   * @returns {Array} Items for current page
   */
  getCurrentPageItems() {
    const [startIndex, endIndex] = this.getPageRange(this.currentPage);
    return this.filteredItems.slice(startIndex, endIndex);
  }

  /**
   * Go to specific page
   * @param {number} page - Page number to go to
   */
  goToPage(page) {
    const totalPages = Math.max(this.getTotalPages(), 1);
    if (page >= 1 && page <= totalPages) {
      this.currentPage = page;
      this.render();
      this.onPageChange(page, this.getCurrentPageItems());
    }
  }

  /**
   * Go to next page
   */
  nextPage() {
    this.goToPage(this.currentPage + 1);
  }

  /**
   * Go to previous page
   */
  prevPage() {
    this.goToPage(this.currentPage - 1);
  }

  /**
   * Render the pagination UI
   */
  render() {
    const container = document.querySelector(`#${this.containerId}`);
    if (!container) {
      Logger.error('UI', `Pagination container #${this.containerId} not found`);
      return;
    }

    const totalPages = this.getTotalPages();
    const [startIndex, endItem] = this.getPageRange(this.currentPage);
    const totalItems = this.filteredItems.length;
    const startItem = totalItems > 0 ? startIndex + 1 : 0;

    // Update page info
    const pageInput = container.querySelector('.page-input');
    const totalPagesSpan = container.querySelector('.total-pages');
    const paginationInfo = container.querySelector('.pagination-info');

    if (pageInput) {
      pageInput.value = totalItems > 0 ? this.currentPage : 0;
      pageInput.disabled = totalItems === 0;
    }
    if (totalPagesSpan) {
      totalPagesSpan.textContent = totalPages;
    }

    // Update the "Showing X-Y of Z" text (locale-aware)
    if (paginationInfo) {
      const _t = (typeof I18n !== 'undefined') ? I18n : null;
      if (totalItems === 0 && !this.showWhenEmpty) {
        paginationInfo.textContent = (_t && _t.get('paginationNoItems')) || 'No items to display';
      } else {
        const tpl = (_t && _t.get('paginationShowingFmt')) || 'Showing {0}-{1} of {2}';
        // Build DOM piece-by-piece so the translated template's interleaved
        // text and number-spans stay structurally correct.
        const makeCount = (text) => {
          const s = document.createElement('span');
          s.className = 'pagination-count';
          s.textContent = text;
          return s;
        };
        // Tokenize template on placeholders, then rebuild.
        paginationInfo.textContent = '';
        const subs = { '{0}': makeCount(String(startItem)),
                       '{1}': makeCount(String(endItem)),
                       '{2}': makeCount(String(totalItems)) };
        const parts = tpl.split(/(\{[012]\})/g);
        for (const part of parts) {
          if (subs[part]) paginationInfo.appendChild(subs[part]);
          else if (part) paginationInfo.appendChild(document.createTextNode(part));
        }
      }
    }

    // Update pagination controls
    this.renderPaginationControls(container, totalPages);

    // Add event listener for page input
    if (pageInput && !pageInput.hasAttribute('data-listener')) {
      pageInput.setAttribute('data-listener', 'true');
      pageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          const page = parseInt(e.target.value);
          if (page >= 1 && page <= this.getTotalPages()) {
            this.goToPage(page);
          }
        }
      });
    }

    // Searchable lists can retain a stable footer when a query has no matches.
    container.style.display = totalItems > 0 || this.showWhenEmpty ? 'flex' : 'none';

    // Trigger page change callback
    this.onPageChange(this.currentPage, this.getCurrentPageItems());
  }

  /**
   * Render pagination controls (prev, numbers, next)
   * @param {HTMLElement} container - Pagination container
   * @param {number} totalPages - Total number of pages
   */
  renderPaginationControls(container, totalPages) {
    // Update previous button
    const prevBtn = container.querySelector('.pagination-btn-prev, .pagination-prev');
    if (prevBtn) {
      prevBtn.disabled = this.currentPage <= 1;
      prevBtn.onclick = () => this.prevPage();
    }

    // Update next button
    const nextBtn = container.querySelector('.pagination-btn-next, .pagination-next');
    if (nextBtn) {
      nextBtn.disabled = this.currentPage >= totalPages;
      nextBtn.onclick = () => this.nextPage();
    }

    // Don't render page numbers anymore - we're using the page input instead
  }
}

if (typeof window !== 'undefined') {
  window.PaginationManager = PaginationManager;
}
