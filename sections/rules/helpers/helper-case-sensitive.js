/**
 * Rules helper modal extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.generateCaseSensitiveExamples = function(input) {
  const variations = [
    { text: input, sensitive: true, insensitive: true }  // Original (always matches both)
  ];

  // Add lowercase version if different
  const lower = input.toLowerCase();
  if (lower !== input) {
    variations.push({ text: lower, sensitive: false, insensitive: true });
  }

  // Add uppercase version if different
  const upper = input.toUpperCase();
  if (upper !== input && upper !== lower) {
    variations.push({ text: upper, sensitive: false, insensitive: true });
  }

  // Add capitalized version if different from all above
  const capitalized = input.charAt(0).toUpperCase() + input.slice(1).toLowerCase();
  if (capitalized !== input && capitalized !== lower && capitalized !== upper) {
    variations.push({ text: capitalized, sensitive: false, insensitive: true });
  }

  return variations;
};

Rules.prototype.filterCaseSensitivePatterns = function(keyword) {
  const examplesContainer = document.querySelector('#caseSensitiveExamples');
  if (!examplesContainer) return;

  // If no keyword, show placeholder
  if (!keyword) {
    examplesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">Start typing above to see examples...</div>';
    return;
  }

  // Generate examples dynamically from user input
  const examples = this.generateCaseSensitiveExamples(keyword);

  examplesContainer.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
      <div style="font-weight: 600; color: #ef4444; margin-bottom: 8px;">Pattern: ${keyword}</div>
      <table style="font-size: 10px; width: 100%; border-collapse: collapse;">
        <tr style="background: var(--bg-tertiary);">
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Text Found</td>
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Case Sensitive</td>
          <td style="padding: 6px; border: 1px solid var(--border); font-weight: 600;">Case Insensitive</td>
        </tr>
        ${examples.map(e => `
          <tr>
            <td style="padding: 6px; border: 1px solid var(--border); color: var(--accent); font-family: monospace;">${e.text}</td>
            <td style="padding: 6px; border: 1px solid var(--border); color: ${e.sensitive ? '#10b981' : '#ef4444'};">${e.sensitive ? '✓ Match' : '✗ No match'}</td>
            <td style="padding: 6px; border: 1px solid var(--border); color: ${e.insensitive ? '#10b981' : '#ef4444'};">${e.insensitive ? '✓ Match' : '✗ No match'}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
};

Rules.prototype.setupCaseSensitiveHelperModal = function() {
  const modal = document.querySelector('#caseSensitiveHelperModal');
  const helpBtn = document.querySelector('#caseSensitiveHelperBtn');
  const closeBtn = document.querySelector('#closeCaseSensitiveHelper');
  const closeFooterBtn = document.querySelector('#closeCaseSensitiveHelperBtn');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');
  const keywordInput = document.querySelector('#caseSensitiveKeywordInput');

  // Open modal when help button is clicked
  if (helpBtn) {
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openCaseSensitiveHelperModal();
    });
  }

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeCaseSensitiveHelperModal());
  }
  if (closeFooterBtn) {
    closeFooterBtn.addEventListener('click', () => this.closeCaseSensitiveHelperModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeCaseSensitiveHelperModal());
  }

  // Setup keyword input for filtering
  if (keywordInput) {
    keywordInput.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase().trim();
      this.filterCaseSensitivePatterns(keyword);
    });
  }
};

Rules.prototype.openCaseSensitiveHelperModal = function() {
  const modal = document.querySelector('#caseSensitiveHelperModal');
  if (!modal) return;

  // Hide parent modal backdrop to prevent blur stacking
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = 'none';

  // Reset keyword input and show all patterns
  const keywordInput = document.querySelector('#caseSensitiveKeywordInput');
  if (keywordInput) {
    keywordInput.value = '';
    keywordInput.focus();
  }

  // Display all patterns initially
  this.filterCaseSensitivePatterns('');

  // Update step indicators
  const step1 = document.querySelector('#caseSensitiveStep1');
  const step2 = document.querySelector('#caseSensitiveStep2');
  if (step1) step1.classList.add('active');
  if (step2) step2.classList.remove('active');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

Rules.prototype.closeCaseSensitiveHelperModal = function() {
  const modal = document.querySelector('#caseSensitiveHelperModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Restore parent modal backdrop
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = '';
};
