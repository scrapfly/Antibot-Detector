class PaginationManager {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.currentPage = 1;
    this.itemsPerPage = options.itemsPerPage || 10;
    this.maxPageButtons = options.maxPageButtons || 5;
    this.items = [];
    this.filteredItems = [];
    this.onPageChange = options.onPageChange || (() => {});
    this.renderItem = options.renderItem || ((item) => item.toString());
  }

  /**
   * Set the items to paginate
   * @param {Array} items - Array of items to paginate
   */
  setItems(items) {
    this.items = items;
    this.filteredItems = items;
    this.currentPage = 1;
    this.render();
  }

  /**
   * Filter items and update pagination
   * @param {Function} filterFn - Filter function
   */
  filter(filterFn) {
    this.filteredItems = this.items.filter(filterFn);
    this.currentPage = 1;
    this.render();
  }

  /**
   * Get total number of pages
   * @returns {number} Total pages
   */
  getTotalPages() {
    return Math.ceil(this.filteredItems.length / this.itemsPerPage);
  }

  /**
   * Get items for current page
   * @returns {Array} Items for current page
   */
  getCurrentPageItems() {
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
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
    const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
    const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredItems.length);

    // Update page info
    const pageInput = container.querySelector('.page-input');
    const totalPagesSpan = container.querySelector('.total-pages');
    const paginationInfo = container.querySelector('.pagination-info');

    if (pageInput) {
      pageInput.value = this.currentPage;
    }
    if (totalPagesSpan) {
      totalPagesSpan.textContent = totalPages;
    }

    // Update the "Showing X-Y of Z" text
    if (paginationInfo) {
      const totalItems = this.filteredItems.length;
      if (totalItems === 0) {
        paginationInfo.textContent = 'No items to display';
      } else {
        paginationInfo.innerHTML = `Showing <span class="pagination-count">${startItem}-${endItem}</span> <span class="static-label">of</span> <span class="pagination-count">${totalItems}</span>`;
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
          if (page >= 1 && page <= totalPages) {
            this.goToPage(page);
          }
        }
      });
    }

    // Show/hide pagination based on whether pagination is needed
    // Hide only if no items
    if (this.filteredItems.length === 0) {
      container.style.display = 'none';
    } else {
      container.style.display = 'flex';
    }

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

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PaginationManager;
} else if (typeof window !== 'undefined') {
  window.PaginationManager = PaginationManager;
}