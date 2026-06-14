// Blacklist UI methods for SettingsUI — extracted from settings-ui.js.
// Requires settings-ui.js to load first (defines const SettingsUI).

SettingsUI.renderBlacklistUI = function() {
    const container = document.querySelector('#blacklistContainer');
    const paginationContainer = document.querySelector('#blacklistPagination');
    const pageNumEl = document.querySelector('#blacklistPageNum');
    const totalPagesEl = document.querySelector('#blacklistTotalPages');
    const prevBtn = document.querySelector('#blacklistPrevBtn');
    const nextBtn = document.querySelector('#blacklistNextBtn');
    const searchInput = document.querySelector('#blacklistSearchInput');

    if (!container) return;

    const allDomains = this.settings.detection?.blacklistedDomains || [];
    const itemsPerPage = 3;

    if (typeof this.blacklistPage === 'undefined') {
      this.blacklistPage = 1;
    }
    if (typeof this.blacklistSearch === 'undefined') {
      this.blacklistSearch = '';
    }

    const searchTerm = this.blacklistSearch.toLowerCase().trim();
    const filteredDomains = searchTerm
      ? allDomains.filter(d => d.toLowerCase().includes(searchTerm))
      : allDomains;

    const totalPages = Math.ceil(filteredDomains.length / itemsPerPage) || 1;

    if (this.blacklistPage > totalPages) this.blacklistPage = totalPages;
    if (this.blacklistPage < 1) this.blacklistPage = 1;

    if (paginationContainer) {
      paginationContainer.style.display = filteredDomains.length > itemsPerPage ? 'flex' : 'none';
    }

    if (pageNumEl) pageNumEl.textContent = this.blacklistPage;
    if (totalPagesEl) totalPagesEl.textContent = totalPages;

    if (prevBtn) prevBtn.disabled = this.blacklistPage <= 1;
    if (nextBtn) nextBtn.disabled = this.blacklistPage >= totalPages;

    if (filteredDomains.length === 0) {
      container.innerHTML = searchTerm
        ? '<div style="color: var(--text-muted); font-size: 12px; padding: 8px; text-align: center;">No domains match your search</div>'
        : '<div style="color: var(--text-muted); font-size: 12px; padding: 8px; text-align: center;">No domains blacklisted</div>';
      return;
    }

    const startIndex = (this.blacklistPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentDomains = filteredDomains.slice(startIndex, endIndex);

    const html = currentDomains.map(domain => `
      <div class="blacklist-item" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-tertiary); border-radius: 4px; margin-bottom: 4px;">
        <span style="font-size: 12px; line-height: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${FormatUtils.escapeHtml(domain)}</span>
        <button class="remove-blacklist-btn" data-domain="${domain}" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; transition: color 0.2s; flex-shrink: 0; margin-left: 8px;">
          <svg width="14" height="14" viewBox="0 0 24 24">
            <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" fill="currentColor"/>
          </svg>
        </button>
      </div>
    `).join('');

    container.innerHTML = html;

    container.querySelectorAll('.remove-blacklist-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const domain = btn.getAttribute('data-domain');
        this.settings.detection.blacklistedDomains = this.settings.detection.blacklistedDomains.filter(d => d !== domain);
        this.renderBlacklistUI();
        const saved = await this.saveSettings({ notify: false });
        if (!saved) {
          return;
        }

        const _tBL = (typeof I18n !== 'undefined') ? I18n : null;
        NotificationHelper.success((_tBL && _tBL.format('removedDomainFromBlacklistFmt', domain)) || `Removed ${domain} from blacklist`);
      });
    });
};

SettingsUI.setupBlacklistEventListeners = function() {
    const searchInput = document.querySelector('#blacklistSearchInput');
    const prevBtn = document.querySelector('#blacklistPrevBtn');
    const nextBtn = document.querySelector('#blacklistNextBtn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.blacklistSearch = e.target.value;
        this.blacklistPage = 1; // Reset to first page on search
        this.renderBlacklistUI();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.blacklistPage > 1) {
          this.blacklistPage--;
          this.renderBlacklistUI();
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const allDomains = this.settings.detection?.blacklistedDomains || [];
        const searchTerm = (this.blacklistSearch || '').toLowerCase().trim();
        const filteredDomains = searchTerm
          ? allDomains.filter(d => d.toLowerCase().includes(searchTerm))
          : allDomains;
        const totalPages = Math.ceil(filteredDomains.length / 3) || 1;

        if (this.blacklistPage < totalPages) {
          this.blacklistPage++;
          this.renderBlacklistUI();
        }
      });
    }
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
