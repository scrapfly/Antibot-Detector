/**
 * Detection modal/copy methods.
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionModals = (typeof self !== 'undefined' && self.DetectionModals) ? self.DetectionModals : {};

// Localised text with {0} placeholders (English fallback when i18n is not loaded)
const _dmText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
const _dmUnknown = () => _dmText('timeUnknown', 'Unknown');
// Difficulty is computed as Low/Medium/High; show it in the UI language
const _dmDifficulty = (value) => {
    const key = { Low: 'difficultyLow', Medium: 'difficultyMedium', High: 'difficultyHigh' }[value];
    return key ? _dmText(key, value) : value;
};

DetectionModals.copyDetection = function(indexOrDetection, triggerElement = null) {
    const detection = typeof indexOrDetection === 'object'
      ? indexOrDetection
      : this.getDetectionByIndex(indexOrDetection);

    if (!detection) {
      return;
    }
    const methods = detection.matches?.map(m => `${m.type}: ${m.pattern || m.name || m.selector}`).join(', ');
    const detailsText = [
      _dmText('clipboardSecuritySystemFmt', 'Security System: {0}', detection.detector?.name || _dmUnknown()),
      _dmText('clipboardCategoryFmt', 'Category: {0}', detection.category || _dmUnknown()),
      _dmText('clipboardConfidenceFmt', 'Confidence: {0}%', detection.confidence || 0),
      _dmText('clipboardDetectionMethodsFmt', 'Detection Methods: {0}', methods || _dmUnknown())
    ].join('\n');

    // Default toast / inline texts of copyToClipboard are already localised
    FormatUtils.copyToClipboard(detailsText, {
      element: triggerElement
    });
};

// Copies exactly what "Upload detections" uploads: the Scrapfly banner and
// the JSON summary (URL without its query string, no cookie or header values)
DetectionModals.copyDetectionOverview = async function() {
    const pageUrl = await DetectionActions.currentPageUrl();
    const { content } = DetectionActions.buildDetectionsPasteContent.call(this, pageUrl);
    await FormatUtils.copyToClipboard(content.trim());
};

DetectionModals.copyMethodValue = function(value, type, triggerElement = null) {
    const textToCopy = `[${type}] ${value}`;
    FormatUtils.copyToClipboard(textToCopy, {
      element: triggerElement
    });
};

/**
 * The detector a detection came from, with its author. Results cached before
 * detections carried `detector.author` are completed from the loaded detector
 * definitions by id.
 */
DetectionModals.resolveDetectorDefinition = function(detection) {
    const detector = detection?.detector || {};
    if (typeof detector.author === 'string' && detector.author.trim()) {
      return detector;
    }
    const all = this.detectorManager?.getAllDetectors?.() || {};
    for (const category of Object.values(all)) {
      for (const [key, definition] of Object.entries(category || {})) {
        if ((definition?.id || key) === detector.id) {
          return { ...detector, id: detector.id, author: definition.author };
        }
      }
    }
    return detector;
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
      confidenceIcon: modal.querySelector('#detectionModalConfidenceIcon'),
      difficultyIcon: modal.querySelector('#detectionModalDifficultyIcon'),
      detections: modal.querySelector('#detectionModalDetections'),
      difficulty: modal.querySelector('#detectionModalDifficulty'),
      description: modal.querySelector('#detectionModalDescription'),
      methods: modal.querySelector('#detectionModalMethods'),
      combinationsSection: modal.querySelector('#detectionModalCombinationsSection'),
      combinations: modal.querySelector('#detectionModalCombinations')
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

    const difficultyInfo = this.getDifficultyInfo([detection], confidence);
    const manualDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
      ? DetectionUtils.normalizeDifficulty(detection?.difficulty || detection?.detector?.difficulty)
      : null;
    const difficulty = manualDifficulty || difficultyInfo.difficulty;

    if (this.modalElements.icon) {
      this.modalElements.icon.innerHTML = this.getDetectorIcon(detection);
    }

    if (this.modalElements.name) {
      this.modalElements.name.textContent = detection.detector?.name || detection.detector || _dmText('unknownDetection', 'Unknown Detection');
    }

    if (this.modalElements.categories) {
      this.modalElements.categories.innerHTML = this.getCategoryBadges(detection);
    }

    const confidenceTone = FormatUtils.confidenceTone(confidence);
    const difficultyTone = { High: 'red', Medium: 'amber', Low: 'green' }[difficulty] || 'green';

    if (this.modalElements.confidence) {
      this.modalElements.confidence.textContent = `${confidence}%`;
      this.modalElements.confidence.className = `history-stat-value tone-${confidenceTone}`;
      // Where the score comes from: the matched combinations, or the strongest signals
      const combos = Array.isArray(detection.combinations) ? detection.combinations : [];
      const matches = Array.isArray(detection.matches) ? detection.matches : [];
      const scoreOf = (match) => Math.round(Number(match.baseConfidence ?? match.confidence) || 0);
      const rows = combos.length
        ? DetectionModals.combinationTipRows(combos, 4)
        : matches.slice().sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 4).map(match => ({
          label: (typeof DetectionUI !== 'undefined' ? DetectionUI.getMethodLabel(String(match.type || 'unknown').toLowerCase()) : match.type),
          value: `${scoreOf(match)}%`, tone: FormatUtils.confidenceTone(scoreOf(match)) }));
      const tile = this.modalElements.confidence.closest('.history-stat-inline');
      FormatUtils.setTip(tile, _dmText('clipboardConfidenceFmt', 'Confidence: {0}%', confidence),
        combos.length ? _dmText('tipConfidenceFromCombinations', 'From the matched combinations')
          : _dmText('tipConfidenceFromSignals', 'The strongest single signal sets the score'), rows);
    }
    if (this.modalElements.confidenceIcon) {
      this.modalElements.confidenceIcon.className = `history-stat-icon tone-${confidenceTone}`;
    }

    if (this.modalElements.detections) {
      const matchList = Array.isArray(detection.matches) ? detection.matches : [];
      const matchCount = matchList.length;
      this.modalElements.detections.textContent = String(matchCount);
      const matchTip = matchCount === 1
        ? _dmText('historyOneMatch', '1 match')
        : (matchCount > 1
          ? _dmText('historyMatchCountFmt', '{0} matches', matchCount)
          : _dmText('noMatchesRecorded', 'No matches recorded'));
      // Matches per detection method
      const byMethod = new Map();
      matchList.forEach(match => {
        const key = String(match.type || 'unknown').toLowerCase();
        byMethod.set(key, (byMethod.get(key) || 0) + 1);
      });
      const rows = [...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({
        label: typeof DetectionUI !== 'undefined' ? DetectionUI.getMethodLabel(key) : key, value: String(count)
      }));
      FormatUtils.setTip(this.modalElements.detections.closest('.history-stat-inline'), matchTip, '', rows);
    }

    if (this.modalElements.difficulty) {
      const difficultyText = _dmDifficulty(difficulty);
      this.modalElements.difficulty.textContent = difficultyText;
      this.modalElements.difficulty.className = `history-stat-value tone-${difficultyTone}`;
      FormatUtils.setTip(this.modalElements.difficulty.closest('.history-stat-inline'),
        _dmText('clipboardDifficultyFmt', 'Difficulty: {0}', difficultyText),
        manualDifficulty
          ? _dmText('tipDifficultyFromRule', 'Set by this detector')
          : _dmText('tipDifficultyFromCategoryFmt', 'Default for {0}', FormatUtils.categoryLabel(FormatUtils.categoryKey(detection))));
    }
    if (this.modalElements.difficultyIcon) {
      this.modalElements.difficultyIcon.className = `history-stat-icon tone-${difficultyTone}`;
    }

    // Populate author field. Detections cached before the author was carried
    // on detection.detector fall back to the loaded detector definition.
    const authorElement = document.querySelector('#detectionModalAuthor');
    if (authorElement) {
      const detectorForAuthor = DetectionModals.resolveDetectorDefinition.call(this, detection);
      const author = (typeof detectorForAuthor?.author === 'string' && detectorForAuthor.author.trim()) || '—';

      // Clear previous content
      authorElement.textContent = '';

      // Add author text (using textContent to prevent XSS)
      const authorText = document.createTextNode(author);
      authorElement.appendChild(authorText);
      const definition = DetectionModals.findDetectorDefinition.call(this, detection) || {};
      const official = typeof DetectionUtils !== 'undefined' && DetectionUtils.isOfficialDetector
        && DetectionUtils.isOfficialDetector({ id: detection?.detector?.id, author });
      const rows = [];
      if (definition.version) rows.push({ label: _dmText('ruleFieldVersion', 'Version'), value: String(definition.version) });
      if (definition.lastUpdated) rows.push({ label: _dmText('tipLastUpdated', 'Updated'), value: String(definition.lastUpdated).slice(0, 10) });
      FormatUtils.setTip(authorElement.closest('.history-stat-inline'), `${_dmText('detectionModalAuthor', 'Author')}: ${author}`,
        official ? _dmText('tipOfficialDetector', 'Official Scrapfly detector') : _dmText('tipCustomDetector', 'Custom detector'), rows);
    }

    if (this.modalElements.description) {
      const description = detection.detector?.description
        || _dmText('detectionUiNoDescription', 'No additional details provided for this detection.');
      this.modalElements.description.textContent = description;
    }

    // Combinations of the detector that matched (see DetectionCombinations),
    // each as a checklist of what it looks for (CombinationChecklist)
    if (this.modalElements.combinations && this.modalElements.combinationsSection) {
      const matched = Array.isArray(detection.combinations) ? detection.combinations : [];
      this.modalElements.combinationsSection.hidden = matched.length === 0;
      DetectionModals.renderCombinations.call(this, detection, matched);
    }

    if (this.modalElements.methods) {
      if (detection.matches && detection.matches.length) {
        this.modalElements.methods.innerHTML = this.getMethodBadges(detection.matches);
        this.attachModalMethodHandlers();
      } else {
        const empty = document.createElement('div');
        empty.className = 'detection-modal-empty';
        empty.textContent = _dmText('detectionUiNoMethodsRecorded', 'No detection methods recorded for this detector.');
        this.modalElements.methods.replaceChildren(empty);
      }
    }
};

/** The detector definition (with its patterns) behind a detection, if loaded. */
DetectionModals.findDetectorDefinition = function(detection) {
    const id = detection?.detector?.id;
    const all = this.detectorManager?.getAllDetectors?.() || {};
    for (const category of Object.values(all)) {
      for (const [key, definition] of Object.entries(category || {})) {
        if ((definition?.id || key) === id) return definition;
      }
    }
    return detection?.detector || null;
};

/** Method labels and the confidence look for combination checklists. */
DetectionModals.checklistOptions = function(idPrefix) {
    return {
      idPrefix,
      methodLabel: (m) => (typeof DetectionUI !== 'undefined' ? DetectionUI.getMethodLabel(m) : m),
      confidenceHtml: (value, cls, tip) => FormatUtils.confidenceHtml(value, cls, tip)
    };
};

/** Matched combinations as checklists (CombinationChecklist). */
DetectionModals.renderCombinations = function(detection, matched) {
    const list = this.modalElements.combinations;
    if (typeof CombinationChecklist === 'undefined') {
      list.textContent = '';
      return;
    }
    const cards = CombinationChecklist.build({
      combinations: matched,
      definition: DetectionModals.findDetectorDefinition.call(this, detection),
      matches: Array.isArray(detection.matches) ? detection.matches : [],
      detectionConfidence: detection.confidence
    });
    list.innerHTML = CombinationChecklist.renderHtml(cards, DetectionModals.checklistOptions.call(this, 'det-combo'));
};

/** Tooltip rows for the combinations behind a score: highest first, unnamed ones numbered in rule order. */
DetectionModals.combinationTipRows = function(combos, limit) {
    return combos.map((combo, index) => ({ combo, index }))
      .sort((a, b) => ((Number(b.combo.confidence) || 0) - (Number(a.combo.confidence) || 0)) || (a.index - b.index))
      .slice(0, limit)
      .map(({ combo, index }) => ({
        label: combo.name || _dmText('combinationDefaultNameFmt', 'Combination {0}', index + 1),
        value: `${Math.round(Number(combo.confidence) || 0)}%`,
        tone: FormatUtils.confidenceTone(combo.confidence)
      }));
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
