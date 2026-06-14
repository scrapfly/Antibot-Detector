// Color personalization methods for SettingsUI — extracted from settings-ui.js.
// Requires settings-ui.js to load first (defines const SettingsUI).

SettingsUI.CATEGORY_COLOR_LABELS = [
  { key: 'categoryAntibot', fallback: 'Anti-bot' },
  { key: 'categoryCaptcha', fallback: 'Captcha' },
  { key: 'categoryFingerprint', fallback: 'Fingerprint' }
];

SettingsUI.applyCategoryColorLabels = function(root) {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
  const tr = (typeof I18n !== 'undefined' && I18n.tr) ? I18n.tr.bind(I18n) : null;

  SettingsUI.CATEGORY_COLOR_LABELS.forEach(({ key, fallback }) => {
    scope.querySelectorAll(`.color-row-badge--category[data-i18n="${key}"]`).forEach((el) => {
      let label = tr ? tr(key, fallback) : fallback;
      if (key === 'categoryCaptcha' && label === 'CAPTCHA') {
        label = 'Captcha';
      }
      el.textContent = label;
    });
  });
};

SettingsUI._hexToRgb = function(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const normalized = hex.trim().replace('#', '');
  if (normalized.length !== 6) return null;
  const num = parseInt(normalized, 16);
  if (Number.isNaN(num)) return null;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
};

SettingsUI._applyColorRowBadgeStyle = function(badge, hexColor) {
  if (!badge) return;
  const color = hexColor || '#666666';
  const rgb = SettingsUI._hexToRgb(color);
  if (!rgb) return;
  badge.style.background = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`;
  badge.style.color = color;
  badge.style.borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;
};

SettingsUI.syncColorRowBadges = function() {
  document.querySelectorAll('.color-row-badge[data-color-for]').forEach((badge) => {
    const inputId = badge.dataset.colorFor;
    const input = inputId ? document.querySelector(`#${inputId}`) : null;
    if (input) {
      SettingsUI._applyColorRowBadgeStyle(badge, input.value);
    }
  });
};

SettingsUI.setupColorPagination = function() {
    const prevBtn = document.querySelector('#colorPrevBtn');
    const nextBtn = document.querySelector('#colorNextBtn');
    const pageNum = document.querySelector('#colorPageNum');
    const totalPages = document.querySelector('#colorTotalPages');
    const pages = document.querySelectorAll('.color-page');

    if (!prevBtn || !nextBtn || !pageNum || !totalPages || pages.length === 0) {
      return;
    }

    let currentPage = 1;
    const total = pages.length;

    // JS owns the page count — the static HTML value is only a placeholder.
    totalPages.textContent = total;

    const updatePagination = () => {
      pageNum.textContent = currentPage;

      pages.forEach((page, index) => {
        page.style.display = (index + 1) === currentPage ? 'block' : 'none';
      });

      prevBtn.disabled = currentPage === 1;
      nextBtn.disabled = currentPage === total;
    };

    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        updatePagination();
      }
    });

    nextBtn.addEventListener('click', () => {
      if (currentPage < total) {
        currentPage++;
        updatePagination();
      }
    });

    updatePagination();
};

SettingsUI._setupColorListeners = function() {
  if (SettingsUI._colorListenersReady) return;
  SettingsUI._colorListenersReady = true;

  document.querySelectorAll('.color-row-badge[data-color-for]').forEach((badge) => {
    const inputId = badge.dataset.colorFor;
    const input = inputId ? document.querySelector(`#${inputId}`) : null;
    if (!input) return;

    const syncHex = () => {
      const hexId = input.id.replace(/^color/, 'hex');
      const hexEl = document.querySelector(`#${hexId}`);
      if (hexEl) {
        hexEl.textContent = input.value;
      }
      SettingsUI._applyColorRowBadgeStyle(badge, input.value);
    };

    input.addEventListener('input', syncHex);
    input.addEventListener('change', syncHex);
    syncHex();
  });

  SettingsUI.syncColorRowBadges();
};

if (typeof self !== 'undefined') {
    self.SettingsUI = SettingsUI;
}
