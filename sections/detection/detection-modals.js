/**
 * Detection modal/copy methods.
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionModals = (typeof self !== 'undefined' && self.DetectionModals) ? self.DetectionModals : {};

DetectionModals.copyDetection = function(indexOrDetection, triggerElement = null) {
    const detection = typeof indexOrDetection === 'object'
      ? indexOrDetection
      : this.getDetectionByIndex(indexOrDetection);

    if (!detection) {
      return;
    }
    const detailsText = `
Security System: ${detection.detector?.name || 'Unknown'}
Category: ${detection.category || 'Unknown'}
Confidence: ${detection.confidence || 0}%
Detection Methods: ${detection.matches?.map(m => `${m.type}: ${m.pattern || m.name || m.selector}`).join(', ') || 'Unknown'}
    `.trim();

    FormatUtils.copyToClipboard(detailsText, {
      element: triggerElement,
      notificationMessage: 'Copied',
      inlineMessage: '✓ Copied!'
    });
};

DetectionModals.copyDetectionOverview = async function() {
    const detections = Array.isArray(this.currentResults) ? this.currentResults : [];
    const totalDetections = detections.length;

    const avgConfidence = DetectionUtils.computeAverageConfidence(detections);
    const { difficulty } = this.getDifficultyInfo(detections, avgConfidence);

    const siteUrlNode = document.querySelector('#siteUrl');
    let url = (this.cacheMetadata?.url || siteUrlNode?.title || '').trim();
    const host = (siteUrlNode?.textContent || '').trim();

    if (!url) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        url = (tab?.url || '').trim();
      } catch {
        // ignore
      }
    }

    const cacheScope = (document.querySelector('#cacheScopeDisplay')?.textContent || '').trim();
    const cacheExpiry = (document.querySelector('#cacheExpiry')?.textContent || '').trim();

    const formatMethodCounts = (detection) => {
      const matches = Array.isArray(detection?.matches) ? detection.matches : [];
      if (matches.length === 0) return '';

      const methodCounts = new Map();
      for (const match of matches) {
        const type = match?.type;
        if (!type) continue;
        methodCounts.set(type, (methodCounts.get(type) || 0) + 1);
      }

      if (methodCounts.size === 0) return '';

      return Array.from(methodCounts.entries()).map(([type, count]) => {
        const label = String(type).replace(/_/g, ' ').toUpperCase();
        return count > 1 ? `${label} (${count})` : label;
      }).join(', ');
    };

    const sortedDetections = this.sortDetectionsByCategory(detections);

    let text = '';
    text += `URL: ${url || host || 'Unknown'}\n`;
    if (url && host && url !== host) {
      text += `Host: ${host}\n`;
    }
    text += `Detections: ${totalDetections}\n`;
    text += `Confidence: ${avgConfidence}%\n`;
    text += `Difficulty: ${difficulty}\n`;
    if (cacheScope && cacheScope !== '-') text += `Cache Scope: ${cacheScope}\n`;
    if (cacheExpiry && cacheExpiry !== '-') text += `Cache Expiration: ${cacheExpiry}\n`;

    if (sortedDetections.length > 0) {
      text += `\nDetections (${sortedDetections.length}):\n`;
      text += `${'-'.repeat(50)}\n\n`;

      sortedDetections.forEach((detection, index) => {
        const name = detection?.detector?.name || detection?.detector || detection?.name || 'Unknown';
        const category = detection?.category || detection?.detector?.category || '';
        const confidence = detection?.confidence || 0;
        const methods = formatMethodCounts(detection);

        text += `${index + 1}. ${name}\n`;
        if (category) text += `   Category: ${category}\n`;
        text += `   Confidence: ${confidence}%\n`;
        if (methods) text += `   Methods: ${methods}\n`;
        text += '\n';
      });
    }

    await FormatUtils.copyToClipboard(text.trim(), { notificationMessage: 'Copied' });
};

DetectionModals.copyMethodValue = function(value, type, triggerElement = null) {
    const textToCopy = `[${type}] ${value}`;
    FormatUtils.copyToClipboard(textToCopy, {
      element: triggerElement,
      notificationMessage: 'Copied',
      inlineMessage: '✓ Copied!'
    });
};

DetectionModals.getDetectionByIndex = function(index) {
    if (typeof index !== 'number') {
      return null;
    }

    if (this.paginationManager && Array.isArray(this.paginationManager.filteredItems)) {
      const filteredDetection = this.paginationManager.filteredItems[index];
      if (filteredDetection) {
        return filteredDetection;
      }
    }

    return this.currentResults[index] || null;
};

DetectionModals.getGlobalDetectionIndex = function(detection, fallbackIndex = 0) {
    if (this.paginationManager && Array.isArray(this.paginationManager.filteredItems)) {
      const index = this.paginationManager.filteredItems.indexOf(detection);
      if (index !== -1) {
        return index;
      }
    }
    return fallbackIndex;
};

DetectionModals.initializeModalElements = function() {
    const modal = document.querySelector('#detectionDetailModal');
    if (!modal) {
      return;
    }

    const overlay = modal.querySelector('.detection-modal-overlay');
    const closeBtn = modal.querySelector('#closeDetectionModal');
    const copyBtn = modal.querySelector('#copyDetectionModal');

    this.modalElements = {
      modal,
      overlay,
      closeBtn,
      copyBtn,
      icon: modal.querySelector('#detectionModalIcon'),
      name: modal.querySelector('#detectionModalName'),
      categories: modal.querySelector('#detectionModalCategories'),
      confidence: modal.querySelector('#detectionModalConfidence'),
      detections: modal.querySelector('#detectionModalDetections'),
      difficulty: modal.querySelector('#detectionModalDifficulty'),
      description: modal.querySelector('#detectionModalDescription'),
      methods: modal.querySelector('#detectionModalMethods')
    };

    const closeHandler = () => this.closeDetectionModal();

    if (overlay) {
      overlay.addEventListener('click', closeHandler);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeHandler);
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        if (this.activeModalIndex !== null) {
          const detection = this.getDetectionByIndex(this.activeModalIndex);
          this.copyDetection(detection, copyBtn);
        }
      });
    }

    if (!this.handleModalKeyDown) {
      this.handleModalKeyDown = (event) => {
        if (event.key === 'Escape') {
          this.closeDetectionModal();
        }
      };
      document.addEventListener('keydown', this.handleModalKeyDown);
    }
};

DetectionModals.openDetectionModal = function(index) {
    if (!this.modalElements) {
      this.initializeModalElements();
    }

    if (!this.modalElements) {
      return;
    }

    const detection = this.getDetectionByIndex(index);
    if (!detection) {
      return;
    }

    this.activeModalIndex = index;
    this.renderDetectionModalContent(detection);

    this.modalElements.modal.style.display = 'flex';
    requestAnimationFrame(() => {
      this.modalElements.modal.classList.add('is-open');
    });
};

DetectionModals.closeDetectionModal = function() {
    if (!this.modalElements) {
      return;
    }

    this.modalElements.modal.classList.remove('is-open');
    this.modalElements.modal.style.display = 'none';
    this.activeModalIndex = null;
};

DetectionModals.renderDetectionModalContent = function(detection) {
    if (!this.modalElements) {
      return;
    }

    const confidence = detection.confidence || 0;
    let confidenceClass = 'confidence-low';
    if (confidence >= 90) confidenceClass = 'confidence-high';
    else if (confidence >= 70) confidenceClass = 'confidence-medium';

    const difficultyInfo = this.getDifficultyInfo([detection], confidence);
    const difficulty = detection.difficulty || difficultyInfo.difficulty;

    if (this.modalElements.icon) {
      this.modalElements.icon.innerHTML = this.getDetectorIcon(detection);
    }

    if (this.modalElements.name) {
      this.modalElements.name.textContent = detection.detector?.name || detection.detector || 'Unknown Detection';
    }

    if (this.modalElements.categories) {
      this.modalElements.categories.innerHTML = this.getCategoryBadges(detection);
    }

    if (this.modalElements.confidence) {
      this.modalElements.confidence.textContent = `${confidence}%`;
      this.modalElements.confidence.className = `meta-value ${confidenceClass}`;
    }

    if (this.modalElements.detections) {
      const matchCount = Array.isArray(detection.matches) ? detection.matches.length : 0;
      if (matchCount > 0) {
        const matchLabel = matchCount === 1 ? 'match' : 'matches';
        this.modalElements.detections.textContent = `${matchCount} ${matchLabel}`;
      } else {
        this.modalElements.detections.textContent = 'No matches recorded';
      }
    }

    if (this.modalElements.difficulty) {
      const difficultyClass = `difficulty-${difficulty.toLowerCase()}`;
      this.modalElements.difficulty.textContent = difficulty;
      this.modalElements.difficulty.className = `meta-value ${difficultyClass}`;
    }

    // Populate author field
    const authorElement = document.querySelector('#detectionModalAuthor');
    if (authorElement) {
      const author = detection.detector?.author || 'Scrapfly';

      // Clear previous content
      authorElement.textContent = '';

      // Add author text (using textContent to prevent XSS)
      const authorText = document.createTextNode(author);
      authorElement.appendChild(authorText);

      // Add verified badge for official scrapfly detectors
      if (author.toLowerCase() === 'scrapfly') {
        const verifiedBadge = document.createElement('i');
        verifiedBadge.className = 'fas fa-check-circle verified-badge';
        verifiedBadge.title = 'Official Scrapfly detector';
        verifiedBadge.style.marginLeft = '6px';
        authorElement.appendChild(verifiedBadge);
      }
    }

    if (this.modalElements.description) {
      const description = detection.detector?.description || 'No additional details provided for this detection.';
      this.modalElements.description.textContent = description;
    }

    if (this.modalElements.methods) {
      if (detection.matches && detection.matches.length) {
        this.modalElements.methods.innerHTML = this.getMethodBadges(detection.matches);
        this.attachModalMethodHandlers();
      } else {
        this.modalElements.methods.innerHTML = '<div class="detection-modal-empty">No detection methods recorded for this detector.</div>';
      }
    }
};

DetectionModals.attachModalMethodHandlers = function() {
    const methodCards = document.querySelectorAll('#detectionModalMethods .method-item-card');
    methodCards.forEach(card => {
      const encodedValue = card.getAttribute('data-copy-value') || '';
      const methodType = card.getAttribute('data-method-type') || 'Unknown';
      const decodedValue = encodedValue ? decodeURIComponent(encodedValue) : '';
      const valueButton = card.querySelector('.method-value-btn');

      const handleCopy = (event) => {
        event.stopPropagation();
        this.copyMethodValue(decodedValue, methodType, valueButton || card);
      };

      card.addEventListener('click', handleCopy);

      if (valueButton) {
        valueButton.addEventListener('click', handleCopy);
      }
    });
};

if (typeof self !== 'undefined') {
    self.DetectionModals = DetectionModals;
}
