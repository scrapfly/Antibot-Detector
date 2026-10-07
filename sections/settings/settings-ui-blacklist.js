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
      const emptyText = searchTerm
        ? FormatUtils.t('settingsUiBlacklistNoMatches', 'No domains match your search')
        : FormatUtils.t('settingsUiBlacklistEmpty', 'No domains blacklisted');
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 8px; text-align: center;">${FormatUtils.escapeHtml(emptyText)}</div>`;
      return;
    }

    const startIndex = (this.blacklistPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentDomains = filteredDomains.slice(startIndex, endIndex);

    const removeLabel = FormatUtils.escapeAttr(FormatUtils.t('actionRemoveFromBlacklist', 'Remove from Blacklist'));
    const html = currentDomains.map(domain => `
      <div class="blacklist-item" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: var(--bg-tertiary); border-radius: 4px; margin-bottom: 4px;">
        <span style="font-size: 12px; line-height: 14px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${FormatUtils.escapeHtml(domain)}</span>
        <button class="remove-blacklist-btn" data-domain="${FormatUtils.escapeAttr(domain)}" title="${removeLabel}" aria-label="${removeLabel}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
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
