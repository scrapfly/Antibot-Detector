const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'assets', 'store-screenshots');
const viewport = { width: 1280, height: 800 };

const cssFiles = [
    'modules/styles/common.css',
    'modules/styles/popup.css',
    'modules/styles/detection.css',
    'modules/styles/history.css',
    'modules/styles/rules.css',
    'modules/styles/advanced.css',
    'modules/styles/settings.css',
    'modules/styles/settings-language.css'
];

const sourceCss = cssFiles
    .map((file) => `/* ${file} */\n${fs.readFileSync(path.join(repoRoot, file), 'utf8')}`)
    .join('\n\n');

const settingsTemplate = fs.readFileSync(path.join(repoRoot, 'sections/settings/settings.html'), 'utf8');

const baseHref = pathToFileURL(`${repoRoot}${path.sep}`).href;
const imageCache = new Map();

function imageDataUri(relativePath) {
    if (imageCache.has(relativePath)) {
        return imageCache.get(relativePath);
    }

    const absolutePath = path.join(repoRoot, relativePath);
    const ext = path.extname(relativePath).toLowerCase();
    const mimeType = ext === '.svg'
        ? 'image/svg+xml'
        : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : 'image/png';
    const data = fs.readFileSync(absolutePath).toString('base64');
    const uri = `data:${mimeType};base64,${data}`;
    imageCache.set(relativePath, uri);
    return uri;
}

function inlineImageSources(html) {
    return html.replace(/src="([^"]+\.(?:png|jpg|jpeg|svg))"/g, (match, src) => {
        if (/^(?:data|file|https?):/i.test(src)) {
            return match;
        }

        return `src="${imageDataUri(src)}"`;
    });
}

const tabMeta = {
    detection: {
        label: 'Detection',
        icon: '<path d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,7C13.4,7 14.8,8.6 14.8,10V11.5C15.4,12.1 16,12.8 16,13.8V17.8C16,18.9 15.1,19.8 14,19.8H10C8.9,19.8 8,18.9 8,17.8V13.8C8,12.8 8.6,12.1 9.2,11.5V10C9.2,8.6 10.6,7 12,7Z" fill="currentColor"/>'
    },
    history: {
        label: 'History',
        icon: '<path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z" fill="currentColor"/>'
    },
    rules: {
        label: 'Rules',
        icon: '<path d="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.98C19.47,12.66 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.97 19.05,5.05L16.56,6.05C16.04,5.65 15.48,5.32 14.87,5.07L14.49,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.51,2.42L9.13,5.07C8.52,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.72,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.52,18.68 9.13,18.93L9.51,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.49,21.58L14.87,18.93C15.48,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.28,19.04 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.98Z" fill="currentColor"/>'
    },
    advanced: {
        label: 'Advanced',
        icon: '<path d="M12,2A2,2 0 0,1 14,4V6H16A2,2 0 0,1 18,8V16A2,2 0 0,1 16,18H8A2,2 0 0,1 6,16V8A2,2 0 0,1 8,6H10V4A2,2 0 0,1 12,2M9,10A1,1 0 0,0 8,11A1,1 0 0,0 9,12A1,1 0 0,0 10,11A1,1 0 0,0 9,10M15,10A1,1 0 0,0 14,11A1,1 0 0,0 15,12A1,1 0 0,0 16,11A1,1 0 0,0 15,10M8,14V16H16V14H8Z" fill="currentColor"/>'
    }
};

function svg(pathMarkup, attrs = '') {
    return `<svg ${attrs} viewBox="0 0 24 24" aria-hidden="true">${pathMarkup}</svg>`;
}

function tabButton(tab, activeTab) {
    const active = tab === activeTab ? ' active' : '';
    return `
        <button class="tab-btn${active}" data-tab="${tab}">
          ${svg(tabMeta[tab].icon, 'width="16" height="16"')}
          <span>${tabMeta[tab].label}</span>
        </button>
    `;
}

function popupFrame(activeTab, content, settingsModal = '') {
    return `
      <div class="popup-device${settingsModal ? ' has-modal' : ''}">
        <div id="app">
          <header class="header">
            <div class="header-content">
              <div class="logo">
                <div class="logo-icon-wrapper">
                  <img src="icons/icon32.png" alt="Scrapfly Robot" width="32" height="32" class="logo-icon">
                </div>
                <div class="logo-text">
                  <span id="appBrand">Scrapfly: anti-bot detector</span>
                </div>
              </div>
              <div class="header-controls">
                <div class="toggle-switch">
                  <input type="checkbox" id="enableToggle" class="toggle-input" checked>
                  <label for="enableToggle" class="toggle-label">
                    <span class="toggle-slider"></span>
                  </label>
                </div>
                <button id="settingsBtn" class="settings-btn" title="Settings">
                  ${svg('<path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>', 'width="20" height="20"')}
                </button>
              </div>
            </div>
            <nav class="tabs-nav">
              ${tabButton('detection', activeTab)}
              ${tabButton('history', activeTab)}
              ${tabButton('rules', activeTab)}
              ${tabButton('advanced', activeTab)}
            </nav>
          </header>
          <main class="main">
            <div id="${activeTab}Tab" class="tab-content active">${content}</div>
          </main>
        </div>
        ${settingsModal}
      </div>
    `;
}

function detectionBadge(text, color, alpha = 0.18) {
    const rgb = hexToRgb(color);
    return `<span class="badge" style="background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha}); color: ${color}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35);">${text}</span>`;
}

function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return {
        r: parseInt(clean.slice(0, 2), 16),
        g: parseInt(clean.slice(2, 4), 16),
        b: parseInt(clean.slice(4, 6), 16)
    };
}

function actionIcon(pathMarkup, className, title) {
    return `
      <button class="url-action-btn ${className}" title="${title}">
        ${svg(pathMarkup, 'width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')}
      </button>
    `;
}

function detectionCard({ name, icon, iconHtml, confidence, badges }) {
    const confidenceClass = confidence >= 90 ? 'confidence-high' : confidence >= 70 ? 'confidence-medium' : 'confidence-low';
    const renderedIcon = iconHtml || `<img src="${icon}" alt="${name}" class="detector-icon">`;
    return `
      <div class="detection-card" data-detection-index="0">
        <div class="card-header">
          <div class="card-icon-section">
            ${renderedIcon}
          </div>
          <div class="card-info">
            <h3 class="detector-name">${name}</h3>
            <div class="category-badges">${badges.join('')}</div>
          </div>
          <div class="card-actions">
            <span class="confidence-display ${confidenceClass}">${confidence}%</span>
            <button class="copy-btn" title="Copy detection details">
              ${svg('<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>', 'width="14" height="14"')}
            </button>
          </div>
        </div>
      </div>
    `;
}

function detectionContent() {
    const cards = [
        detectionCard({
            name: 'Cloudflare Bot Management',
            icon: 'detectors/icons/cloudflare_official.png',
            confidence: 98,
            badges: [
                detectionBadge('Antibot', '#FF5733'),
                detectionBadge('HEADER (3)', '#ec4899'),
                detectionBadge('COOKIE', '#ef4444')
            ]
        }),
        detectionCard({
            name: 'reCAPTCHA Enterprise',
            icon: 'detectors/icons/recaptcha_official.png',
            confidence: 94,
            badges: [
                detectionBadge('Captcha', '#33C3FF'),
                detectionBadge('DOM', '#2196F3'),
                detectionBadge('JS HOOKS', '#8b5cf6')
            ]
        }),
        detectionCard({
            name: 'Canvas Fingerprinting',
            iconHtml: `<div class="detector-icon detector-icon-svg fingerprint-icon fingerprint-icon-shell">${svg('<rect x="3" y="3" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 12h4l2-3 2 6 2-3h2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>')}</div>`,
            confidence: 82,
            badges: [
                detectionBadge('Fingerprint', '#3b82f6'),
                detectionBadge('WINDOW', '#6b7280')
            ]
        })
    ].join('');

    return `
      <div id="detectionResults" class="detection-results" style="display: flex;">
        <div id="detectionOverview" class="detection-overview" style="display: block;">
          <div class="url-display-line">
            <div class="url-display-container">
              <img id="siteFavicon" class="site-favicon" src="icons/icon16.png" alt="">
              <span id="siteUrl" class="site-url" title="https://example-shop.com/checkout">example-shop.com/checkout</span>
            </div>
            <div class="url-action-buttons">
              ${actionIcon('<path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><polyline points="7 9 12 4 17 9"/><line x1="12" y1="4" x2="12" y2="16"/>', 'upload-paste-btn', 'Upload detections')}
              ${actionIcon('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>', 'clear-cache-btn', 'Clear cache')}
              <button class="url-action-btn copy-overview-btn" title="Copy overview">${svg('<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/>', 'width="14" height="14"')}</button>
              ${actionIcon('<circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/>', 'blacklist-btn', 'Block domain')}
            </div>
          </div>
          <div class="stats-line">
            ${statInline('DETECTIONS', '5', '<circle cx="12" cy="12" r="10" opacity="0.3"/><circle cx="12" cy="12" r="6" opacity="0.5"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4M12 18v4"/>', 'detections-count')}
            ${statInline('CONFIDENCE', '96%', '<path d="M12 2a10 10 0 0 1 10 10" opacity="0.3"/><path d="M12 2a10 10 0 0 0-10 10" opacity="0.3"/><path d="M4.93 4.93l4.24 4.24"/><circle cx="12" cy="12" r="2" fill="currentColor"/>', 'overall-confidence')}
            ${statInline('DIFFICULTY', 'High', '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4" opacity="0.7"/>', 'difficulty-level')}
          </div>
          <div class="cache-expiry-line">
            ${statInline('CACHE SCOPE', 'Domain', '<circle cx="12" cy="12" r="10"/><path d="M2 12h20" opacity="0.5"/><path d="M12 2a15 15 0 0 1 0 20" opacity="0.7"/><path d="M12 2a15 15 0 0 0 0 20" opacity="0.7"/>', 'cache-scope-stat')}
            ${statInline('CACHE EXPIRATION', '28 min', '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', 'cache-expiry-stat')}
          </div>
        </div>
        <div class="search-container">
          <input type="text" id="detectionSearch" class="search-input" placeholder="Search detections...">
        </div>
        <div id="resultsList" class="results-list">${cards}</div>
        ${pagination('Showing 1-3 of 5', 1, 2)}
      </div>
    `;
}

function statInline(label, value, iconPath, className = '') {
    const classes = ['stat-inline', className].filter(Boolean).join(' ');
    return `
      <div class="${classes}">
        <div class="stat-icon-inline">${svg(iconPath, 'width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')}</div>
        <div class="stat-content-inline">
          <div class="stat-label-inline">${label}</div>
          <div class="stat-value-inline">${value}</div>
        </div>
      </div>
    `;
}

function pagination(info, page, pages) {
    return `
      <div class="pagination">
        <div class="pagination-info">${info}</div>
        <div class="pagination-controls">
          <button class="pagination-btn pagination-btn-prev" disabled>${svg('<path d="M15.41 7.41L14 6L8 12L14 18L15.41 16.59L10.83 12Z" fill="currentColor"/>', 'width="16" height="16"')}</button>
          <div class="page-info"><span>Page</span><input type="text" class="page-input" value="${page}"><span>of</span><span class="total-pages">${pages}</span></div>
          <button class="pagination-btn pagination-btn-next">${svg('<path d="M10 6L8.59 7.41L13.17 12L8.59 16.59L10 18L16 12Z" fill="currentColor"/>', 'width="16" height="16"')}</button>
        </div>
      </div>
    `;
}

function historyStats(total, confidence, difficulty, color, scope) {
    return `
      <div class="history-stats-line">
        ${historyStat('history-stat-detections', 'Detections', total, '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')}
        ${historyStat('history-stat-confidence', 'Confidence', `${confidence}%`, '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>')}
        ${historyStat('history-stat-difficulty', 'Difficulty', difficulty, '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', color)}
        ${historyStat('history-stat-cache-scope', 'Scope', scope, '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20" opacity="0.7"/><path d="M12 2a15 15 0 0 0 0 20" opacity="0.7"/>')}
      </div>
    `;
}

function historyStat(className, label, value, iconPath, color = '') {
    const style = color ? ` style="color: ${color}"` : '';
    return `
      <div class="history-stat-inline ${className}">
        <div class="history-stat-icon">${svg(iconPath, 'fill="none" stroke="currentColor" stroke-width="2"')}</div>
        <div class="history-stat-content">
          <div class="history-stat-label">${label}</div>
          <div class="history-stat-value"${style}>${value}</div>
        </div>
      </div>
    `;
}

function iconBadge(src, title, className = '') {
    return `<span class="history-detection-tag icon-badge ${className}" title="${title}"><img src="${src}" alt="${title}" class="detection-icon"></span>`;
}

function historyItem({ domain, title, time, stats, badges }) {
    return `
      <div class="history-item">
        <div class="history-item-top">
          <div class="history-item-content">
            <div class="history-header-info">
              <img src="icons/icon16.png" alt="Favicon" class="history-favicon">
              <div class="history-url">${domain}</div>
            </div>
            <div class="history-title">${title}</div>
          </div>
          <div class="history-item-right">
            <div class="history-item-actions">
              ${historyAction('history-clear-cache-btn', '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>')}
              ${historyAction('history-copy-btn', '<path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z" fill="currentColor"/>')}
              ${historyAction('history-export-btn', '<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,19L8,15H10.5V12H13.5V15H16L12,19Z" fill="currentColor"/>')}
            </div>
          </div>
        </div>
        ${stats}
        <div class="history-item-bottom">
          <div class="history-detections">${badges.join('')}</div>
          <div class="history-timestamp">${time}</div>
        </div>
      </div>
    `;
}

function historyAction(className, iconPath) {
    return `<button class="history-item-action-btn ${className}">${svg(iconPath, 'width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"')}</button>`;
}

function historyContent() {
    return `
      <div class="history-header">
        <div class="action-buttons">
          <button class="import-btn-small">Import</button>
          <button class="export-btn-small">Export</button>
          <button class="clear-btn-small">Clear</button>
        </div>
        <div class="search-container">
          <input type="text" id="historySearch" class="search-input" placeholder="Search history...">
        </div>
      </div>
      <div id="historyList" class="history-list">
        ${historyItem({
            domain: 'example-shop.com',
            title: 'Checkout - anti-bot challenge detected',
            time: '2 min ago',
            stats: historyStats(5, 96, 'High', '#ef4444', 'Domain'),
            badges: [
                iconBadge('detectors/icons/cloudflare_official.png', 'Cloudflare'),
                iconBadge('detectors/icons/recaptcha_official.png', 'reCAPTCHA'),
                iconBadge('detectors/icons/canvas_fingerprint.png', 'Canvas', 'fingerprint-badge'),
                '<span class="history-detection-tag more-detections">+2</span>'
            ]
        })}
        ${historyItem({
            domain: 'airline.example',
            title: 'Login page - captcha and browser checks',
            time: '18 min ago',
            stats: historyStats(3, 88, 'Medium', '#f59e0b', 'Path'),
            badges: [
                iconBadge('detectors/icons/akamai_official.png', 'Akamai'),
                iconBadge('detectors/icons/hcaptcha_official.png', 'hCaptcha'),
                iconBadge('detectors/icons/navigator_fingerprint.png', 'Navigator', 'fingerprint-badge')
            ]
        })}
      </div>
      ${pagination('Showing 1-2 of 14', 1, 7)}
    `;
}

function methodTag(text, color) {
    const rgb = hexToRgb(color);
    return `<span class="method-tag" style="background: rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2); color: ${color}; border: 1px solid rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35);">${text}</span>`;
}

function detectorCard({ name, icon, category, methods, updated, meta, disabled = false }) {
    return `
      <div class="detector-card${disabled ? ' detector-disabled' : ''}">
        <div class="detector-header">
          <div class="detector-icon"><img src="${icon}" alt="${name}" class="detector-icon-img"></div>
          <div class="detector-info">
            <div class="detector-name-row">
              <div class="detector-name">${name}</div>
              <div class="detector-actions">
                <button class="edit-btn">${svg('<path d="M3,17.25V21h3.75L17.81,9.94l-3.75-3.75L3,17.25zM20.71,7.04c0.39-0.39,0.39-1.02,0-1.41l-2.34-2.34c-0.39-0.39-1.02-0.39-1.41,0l-1.83,1.83l3.75,3.75L20.71,7.04z" fill="currentColor"/>', 'width="14" height="14"')}</button>
                <button class="delete-btn">${svg('<path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>', 'width="14" height="14"')}</button>
              </div>
            </div>
            <div class="detection-methods">${category}${methodTag(name, '#3b82f6')}</div>
          </div>
        </div>
        <div class="detector-scripts">
          <div class="detection-methods">${methods.join('')}</div>
          <div class="scripts-info">
            <div class="scripts-info-left">
              <div class="last-updated"><span class="last-updated-value">${updated}</span></div>
              <div class="detector-author"><span class="version-author">${meta}</span></div>
            </div>
            <label class="toggle-switch-small">
              <input type="checkbox" class="detector-toggle" ${disabled ? '' : 'checked'}>
              <span class="toggle-slider-small"></span>
            </label>
          </div>
        </div>
      </div>
    `;
}

function rulesContent() {
    return `
      <div class="rules-header">
        <div class="action-buttons">
          <button class="check-updates-btn">Update</button>
          <button class="import-btn-small">Import</button>
          <button class="export-btn-small">Export</button>
          <button class="clear-btn-small">Clear</button>
          <button class="add-btn">Add</button>
        </div>
        <div class="search-container">
          <input type="text" id="rulesSearch" class="search-input" placeholder="Search detectors...">
        </div>
      </div>
      <div id="rulesList" class="rules-list">
        ${detectorCard({
            name: 'Cloudflare Bot Management',
            icon: 'detectors/icons/cloudflare_official.png',
            category: methodTag('ANTI-BOT', '#FF5733'),
            methods: [methodTag('HEADERS', '#ec4899'), methodTag('COOKIES', '#ef4444'), methodTag('DOM', '#2196F3')],
            updated: 'Updated today',
            meta: '2.8.0 | scrapfly'
        })}
        ${detectorCard({
            name: 'reCAPTCHA Enterprise',
            icon: 'detectors/icons/recaptcha_official.png',
            category: methodTag('CAPTCHA', '#33C3FF'),
            methods: [methodTag('DOM', '#2196F3'), methodTag('JS HOOKS', '#8b5cf6'), methodTag('URL', '#06b6d4')],
            updated: 'Updated yesterday',
            meta: '2.4.1 | scrapfly'
        })}
        ${detectorCard({
            name: 'Canvas Fingerprinting',
            icon: 'detectors/icons/canvas_fingerprint.png',
            category: methodTag('FINGERPRINT', '#3b82f6'),
            methods: [methodTag('WINDOW', '#6b7280'), methodTag('JS HOOKS', '#8b5cf6')],
            updated: 'Updated 3 days ago',
            meta: '1.9.0 | scrapfly',
            disabled: true
        })}
      </div>
      ${pagination('Showing 1-3 of 47', 1, 16)}
    `;
}

function toolIcon(pathMarkup, tone) {
    return `<div class="advanced-tool-icon advanced-tool-icon--${tone}">${svg(pathMarkup)}</div>`;
}

function toolCard(label, iconPath, tone, capturing = false) {
    return `
      <button class="advanced-tool-card${capturing ? ' capturing' : ''}">
        ${toolIcon(iconPath, tone)}
        <div class="advanced-tool-label">${label}</div>
      </button>
    `;
}

function advancedContent() {
    return `
      <div id="advancedContent" class="advanced-content" style="display: flex;">
        <div class="advanced-sub-tabs">
          <button class="advanced-sub-tab active">
            <span class="advanced-sub-tab-icon">${svg('<path d="M4.5 7H13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M10.5 12H19.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.5 17H13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="16.5" cy="7" r="1.6" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="12" r="1.6" stroke="currentColor" stroke-width="1.8"/><circle cx="16.5" cy="17" r="1.6" stroke="currentColor" stroke-width="1.8"/>', 'fill="none"')}</span>
            <span class="advanced-sub-tab-label">Tools</span>
          </button>
          <button class="advanced-sub-tab">
            <span class="advanced-sub-tab-icon">${svg('<circle cx="12" cy="12" r="7.5" stroke="currentColor" stroke-width="1.8"/><path d="M12 8.5V12L14.75 13.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>', 'fill="none"')}</span>
            <span class="advanced-sub-tab-label">History</span>
            <span class="capture-count-badge">6</span>
          </button>
        </div>
        <div class="advanced-tab-panel active">
          <div class="captcha-tools-section">
            <div class="tools-panel-header">
              <div class="tools-panel-title">
                <h3>Advanced Detection Tools</h3>
                <p>Capture and analyze protection systems</p>
              </div>
              <button class="help-btn">?</button>
            </div>
            <div class="workflow-section">
              <div class="workflow-step">
                <div class="step-number completed"><span>1</span></div>
                <span class="step-label">Selected Detection</span>
              </div>
              <div class="selector-card">
                <div class="selector-display">
                  <img src="detectors/icons/cloudflare_official.png" alt="" class="detection-icon">
                  <span>Cloudflare Bot Management</span>
                </div>
              </div>
            </div>
            <div class="workflow-section">
              <div class="workflow-step">
                <div class="step-number completed"><span>2</span></div>
                <span class="step-label">Load & Use Tools</span>
              </div>
              <div class="btn-row">
                <button class="btn-primary-lg">${svg('<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,19L8,15H10.5V12H13.5V15H16L12,19Z" fill="currentColor"/>')}Load Tools</button>
                <button class="btn-secondary-lg">${svg('<path d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" fill="currentColor"/>')}Clear All</button>
              </div>
            </div>
            <div class="help-footer">
              <button class="help-link">${svg('<path d="M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z" fill="currentColor"/>', 'width="14" height="14"')}Learn about Advanced Tools</button>
            </div>
          </div>
        </div>
      </div>
    `;
}

function settingsPanelHtml() {
    return settingsTemplate
        .replace('<span class="language-picker-label" id="languagePickerLabel"></span>', '<span class="language-picker-label" id="languagePickerLabel">Browser default</span>')
        .replace('<span class="language-picker-flag-slot" id="languagePickerFlagSlot" aria-hidden="true"></span>', '<span class="language-picker-flag-slot" id="languagePickerFlagSlot" aria-hidden="true">A</span>')
        .replace('id="notificationsEnabled">', 'id="notificationsEnabled" checked>')
        .replace('id="autoUpdate">', 'id="autoUpdate" checked>')
        .replace('<div class="base-modal-backdrop"></div>', '');
}

function settingsFrame() {
    return `
      <div class="popup-device settings-device">
        ${settingsPanelHtml()}
      </div>
    `;
}

const pages = [
    {
        filename: '01-detection-1280x800.png',
        activeTab: 'detection',
        title: 'Spot anti-bot protection',
        subtitle: 'Identify anti-bot, CAPTCHA, fingerprinting, and other signals with confidence scores and matched methods.',
        bullets: ['Live scan', 'Confidence score', 'Matched signals'],
        content: detectionContent()
    },
    {
        filename: '02-history-1280x800.png',
        activeTab: 'history',
        title: 'Keep every scan in view',
        subtitle: 'Review protected pages, compare difficulty, and export detection results whenever you need them.',
        bullets: ['Search history', 'Risk summary', 'Export results'],
        content: historyContent()
    },
    {
        filename: '03-rules-1280x800.png',
        activeTab: 'rules',
        title: 'Control every detector rule',
        subtitle: 'Update built-in detectors, toggle checks, and manage custom rules without leaving the popup.',
        bullets: ['Built-in rules', 'Custom detectors', 'Import/export'],
        content: rulesContent()
    },
    {
        filename: '04-advanced-tools-1280x800.png',
        activeTab: 'advanced',
        title: 'Load capture tools on demand',
        subtitle: 'When a supported protection system is found, collect sitekeys, cookies, and challenge parameters for analysis.',
        bullets: ['Load on demand', 'Sitekeys & cookies', 'Export captures'],
        content: advancedContent()
    },
    {
        filename: '05-settings-1280x800.png',
        title: 'Customize detection behavior',
        subtitle: 'Set notifications, language, updates, history, badge colors, and blacklists to fit your workflow.',
        bullets: ['Notifications', 'Language', 'Blacklists'],
        frame: settingsFrame()
    }
];

function storeCss() {
    return `
      body.store-capture {
        width: ${viewport.width}px !important;
        height: ${viewport.height}px !important;
        margin: 0;
        overflow: hidden !important;
        background: #090b10;
        color: #f8fafc;
      }

      .store-art {
        position: relative;
        width: ${viewport.width}px;
        height: ${viewport.height}px;
        overflow: hidden;
        display: grid;
        grid-template-columns: 1fr 520px;
        gap: 42px;
        align-items: center;
        padding: 58px 78px;
        background:
          linear-gradient(125deg, rgba(59, 130, 246, 0.18), rgba(16, 185, 129, 0.08) 42%, rgba(15, 23, 42, 0) 70%),
          linear-gradient(180deg, #10131a 0%, #07090e 100%);
        box-sizing: border-box;
      }

      .store-art::after {
        content: "";
        position: absolute;
        inset: 0;
        background-image:
          linear-gradient(rgba(255, 255, 255, 0.045) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 255, 255, 0.045) 1px, transparent 1px);
        background-size: 44px 44px;
        mask-image: linear-gradient(90deg, black 0%, black 55%, transparent 100%);
        pointer-events: none;
      }

      .store-copy,
      .store-stage {
        position: relative;
        z-index: 1;
      }

      .store-copy {
        max-width: 585px;
      }

      .store-brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 34px;
        color: #bfdbfe;
        font-size: 16px;
        font-weight: 700;
      }

      .store-brand img {
        width: 42px;
        height: 42px;
        border-radius: 9px;
        box-shadow: 0 12px 26px rgba(59, 130, 246, 0.28);
      }

      .store-title {
        margin: 0;
        max-width: 560px;
        color: #ffffff;
        font-size: 58px;
        line-height: 1.02;
        font-weight: 780;
        letter-spacing: 0;
      }

      .store-subtitle {
        max-width: 520px;
        margin: 24px 0 34px;
        color: #cbd5e1;
        font-size: 22px;
        line-height: 1.42;
        letter-spacing: 0;
      }

      .store-bullets {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
      }

      .store-bullet {
        display: inline-flex;
        align-items: center;
        min-height: 38px;
        padding: 0 15px;
        border-radius: 8px;
        border: 1px solid rgba(148, 163, 184, 0.28);
        background: rgba(15, 23, 42, 0.62);
        color: #e2e8f0;
        font-size: 14px;
        font-weight: 700;
      }

      .store-stage {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .popup-device {
        position: relative;
        width: 400px;
        height: 580px;
        overflow: hidden;
        border-radius: 18px;
        background: var(--bg-primary);
        border: 1px solid rgba(148, 163, 184, 0.22);
        box-shadow:
          0 34px 80px rgba(0, 0, 0, 0.58),
          0 0 0 10px rgba(15, 23, 42, 0.48);
      }

      .popup-device #app {
        width: 400px;
        height: 580px;
      }

      .popup-device.settings-device {
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        padding: 0;
      }

      .popup-device.settings-device .base-modal-content {
        width: 100%;
        max-width: none;
        max-height: none;
        height: 100%;
        border: none;
        border-radius: 0;
        box-shadow: none;
      }

      .popup-device.settings-device .modal-body {
        height: 350px;
        max-height: 350px;
        overflow: hidden;
      }

      .popup-device.settings-device .settings-tab-content[data-tab-content="general"] .settings-card-group:not(:first-of-type) {
        display: none;
      }

      .popup-device .base-modal {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .popup-device .base-modal-content {
        max-height: 92%;
        width: 92%;
      }

      .popup-device .base-modal-content .modal-body {
        height: 388px;
        max-height: 388px;
      }

      .popup-device .language-picker-flag-slot {
        display: inline-flex;
        width: 18px;
        height: 18px;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        background: rgba(59, 130, 246, 0.18);
        color: var(--accent-light);
        font-size: 10px;
        font-weight: 800;
      }

      .popup-device .store-static-only {
        display: block;
      }

      .store-capture .detector-card,
      .store-capture .history-item,
      .store-capture .detection-card,
      .store-capture .advanced-tool-card {
        animation: none !important;
      }

      .store-capture .rules-header .action-buttons {
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }

      .store-capture .rules-header .action-buttons button {
        min-width: 0;
        padding-left: 5px;
        padding-right: 5px;
      }

      .store-capture .selector-display img.detection-icon {
        width: 24px;
        height: 24px;
        border-radius: 5px;
        background: white;
        padding: 2px;
      }

      .store-capture .btn-primary-lg svg,
      .store-capture .btn-secondary-lg svg,
      .store-capture .help-link svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
    `;
}

function pageHtml(page) {
    return inlineImageSources(`
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8">
          <base href="${baseHref}">
          <title>${page.title}</title>
          <style>${sourceCss}</style>
          <style>${storeCss()}</style>
        </head>
        <body class="store-capture">
          <section class="store-art">
            <div class="store-copy">
              <div class="store-brand">
                <img src="icons/icon48.png" alt="">
                <span>Scrapfly Anti-Bot Detector</span>
              </div>
              <h1 class="store-title">${page.title}</h1>
              <p class="store-subtitle">${page.subtitle}</p>
              <div class="store-bullets">
                ${page.bullets.map((bullet) => `<span class="store-bullet">${bullet}</span>`).join('')}
              </div>
            </div>
            <div class="store-stage">
              ${page.frame || popupFrame(page.activeTab, page.content, page.settings || '')}
            </div>
          </section>
        </body>
      </html>
    `);
}

async function main() {
    fs.mkdirSync(outputDir, { recursive: true });

    const executablePath = fs.existsSync('/usr/bin/chromium-browser')
        ? '/usr/bin/chromium-browser'
        : undefined;

    const browser = await chromium.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-crash-reporter', '--disable-crashpad']
    });

    try {
        for (const pageConfig of pages) {
            const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
            await page.setContent(pageHtml(pageConfig), { waitUntil: 'load' });
            await page.evaluate(() => document.fonts && document.fonts.ready);
            await page.screenshot({
                path: path.join(outputDir, pageConfig.filename),
                fullPage: false
            });
            await page.close();
            console.log(`Wrote assets/store-screenshots/${pageConfig.filename}`);
        }
    } finally {
        await browser.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
