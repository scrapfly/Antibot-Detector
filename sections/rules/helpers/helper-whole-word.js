/**
 * Rules helper modal extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype.generateWholeWordExamples = function(input) {
  return [
    { text: input, match: true, reason: 'Exact word, surrounded by boundaries' },
    { text: `test${input}`, match: false, reason: 'Connected to "test", not isolated' },
    { text: `${input}More`, match: false, reason: 'Connected to "More", not isolated' },
    { text: `test ${input} more`, match: true, reason: 'Separated by spaces (word boundaries)' }
  ];
};

Rules.prototype.filterWholeWordPatterns = function(keyword) {
  const examplesContainer = document.querySelector('#wholeWordExamples');
  if (!examplesContainer) return;

  // If no keyword, show placeholder
  if (!keyword) {
    examplesContainer.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 12px;">Start typing above to see examples...</div>';
    return;
  }

  // Generate examples dynamically from user input
  const examples = this.generateWholeWordExamples(keyword);

  examplesContainer.innerHTML = `
    <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: 6px;">
      <div style="font-weight: 600; color: #10b981; margin-bottom: 8px;">Pattern: ${keyword}</div>
      <table style="font-size: 10px; width: 100%; border-collapse: collapse;">
        <tr style="background: var(--bg-tertiary);">
          <td style="padding: 6px; border: 1px solid var(--border);">Text</td>
          <td style="padding: 6px; border: 1px solid var(--border);">Match?</td>
          <td style="padding: 6px; border: 1px solid var(--border);">Reason</td>
        </tr>
        ${examples.map(e => `
          <tr>
            <td style="padding: 6px; border: 1px solid var(--border); color: var(--accent); font-family: monospace;">${e.text}</td>
            <td style="padding: 6px; border: 1px solid var(--border); color: ${e.match ? '#10b981' : '#ef4444'};">${e.match ? '✓ Match' : '✗ No match'}</td>
            <td style="padding: 6px; border: 1px solid var(--border);">${e.reason}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
};

Rules.prototype.setupWholeWordHelperModal = function() {
  const modal = document.querySelector('#wholeWordHelperModal');
  const helpBtn = document.querySelector('#wholeWordHelperBtn');
  const closeBtn = document.querySelector('#closeWholeWordHelper');
  const closeFooterBtn = document.querySelector('#closeWholeWordHelperBtn');
  const backdrop = modal?.querySelector('.rule-modal-backdrop');
  const keywordInput = document.querySelector('#wholeWordKeywordInput');

  // Open modal when help button is clicked
  if (helpBtn) {
    helpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openWholeWordHelperModal();
    });
  }

  // Close modal events
  if (closeBtn) {
    closeBtn.addEventListener('click', () => this.closeWholeWordHelperModal());
  }
  if (closeFooterBtn) {
    closeFooterBtn.addEventListener('click', () => this.closeWholeWordHelperModal());
  }
  if (backdrop) {
    backdrop.addEventListener('click', () => this.closeWholeWordHelperModal());
  }

  // Setup keyword input for filtering
  if (keywordInput) {
    keywordInput.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase().trim();
      this.filterWholeWordPatterns(keyword);
    });
  }
};

Rules.prototype.openWholeWordHelperModal = function() {
  const modal = document.querySelector('#wholeWordHelperModal');
  if (!modal) return;

  // Hide parent modal backdrop to prevent blur stacking
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = 'none';

  // Reset keyword input and show all patterns
  const keywordInput = document.querySelector('#wholeWordKeywordInput');
  if (keywordInput) {
    keywordInput.value = '';
    keywordInput.focus();
  }

  // Display all patterns initially
  this.filterWholeWordPatterns('');

  // Update step indicators
  const step1 = document.querySelector('#wholeWordStep1');
  const step2 = document.querySelector('#wholeWordStep2');
  if (step1) step1.classList.add('active');
  if (step2) step2.classList.remove('active');

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
};

Rules.prototype.closeWholeWordHelperModal = function() {
  const modal = document.querySelector('#wholeWordHelperModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Restore parent modal backdrop
  const methodSettingsBackdrop = document.querySelector('#methodSettingsModal .rule-modal-backdrop');
  if (methodSettingsBackdrop) methodSettingsBackdrop.style.display = '';
};

// ============================================
// Case Sensitive Helper Modal
// ============================================
