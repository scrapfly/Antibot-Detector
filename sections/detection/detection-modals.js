/**
 * Detection details dialog methods.
 * Dependencies: `Detection` class must be loaded first.
 */
const DetectionModals = (typeof self !== 'undefined' && self.DetectionModals) ? self.DetectionModals : {};

// Localised text with {0} placeholders (English fallback when i18n is not loaded)
const _dmText = (key, fallback, ...args) => FormatUtils.t(key, fallback, ...args);
// Difficulty is computed as Low/Medium/High; show it in the UI language
const _dmDifficulty = (value) => {
    const key = { Low: 'difficultyLow', Medium: 'difficultyMedium', High: 'difficultyHigh' }[value];
    return key ? _dmText(key, value) : value;
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

    this.modalElements = {
      modal,
      overlay,
      closeBtn,
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
      combinations: modal.querySelector('#detectionModalCombinations'),
      difficultyNote: modal.querySelector('#detectionModalDifficultyNote'),
      links: modal.querySelector('#detectionModalLinks'),
      website: modal.querySelector('#detectionModalWebsite'),
      docs: modal.querySelector('#detectionModalDocs'),
      openTools: modal.querySelector('#detectionModalOpenTools')
    };
    DetectionModals.bindAboutLinks.call(this);

    const closeHandler = () => this.closeDetectionModal();

    // Evidence values copy on click or Enter (the rows are re-rendered for each detection: one delegated listener)
    if (this.modalElements.methods) {
      // A click on a method row's head shows or hides its value
      this.modalElements.methods.addEventListener('click', (e) => {
        const head = e.target instanceof Element ? e.target.closest('.method-fold-head') : null;
        if (!head) return;
        const folded = head.closest('.method-item-card').classList.toggle('is-folded');
        head.setAttribute('aria-expanded', String(!folded));
      });
      this.modalElements.methods.addEventListener('click', (e) => DetectionUI.handleCopyableValueClick.call(this, e));
      this.modalElements.methods.addEventListener('keydown', (e) => DetectionUI.handleCopyableValueKeyDown.call(this, e));
    }
    // The signals of a combination are rows like these: the head shows or hides the value, the value copies
    if (this.modalElements.combinations) {
      this.modalElements.combinations.addEventListener('click', (e) => {
        const head = e.target instanceof Element ? e.target.closest('.method-fold-head') : null;
        if (!head) return;
        const folded = head.closest('.method-item-card').classList.toggle('is-folded');
        head.setAttribute('aria-expanded', String(!folded));
      });
      this.modalElements.combinations.addEventListener('click', (e) => DetectionUI.handleCopyableValueClick.call(this, e));
      this.modalElements.combinations.addEventListener('keydown', (e) => DetectionUI.handleCopyableValueKeyDown.call(this, e));
    }

    if (overlay) {
      overlay.addEventListener('click', closeHandler);
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', closeHandler);
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
    // Keyboard: focus moves into the dialog, Tab stays in it, Escape closes it and focus goes back to the card
    const dialog = this.modalElements.modal.querySelector('.detection-modal-container');
    if (dialog && typeof ModalFocus !== 'undefined' && !this.releaseModalFocus) {
      this.releaseModalFocus = ModalFocus.activate(dialog, { onClose: () => this.closeDetectionModal(), initialFocus: this.modalElements.closeBtn || undefined });
    }
};

DetectionModals.closeDetectionModal = function() {
    if (!this.modalElements) {
      return;
    }

    this.modalElements.modal.classList.remove('is-open');
    this.modalElements.modal.style.display = 'none';
    this.activeModalIndex = null;
    const release = this.releaseModalFocus;
    this.releaseModalFocus = null;
    if (release) release();
};

DetectionModals.renderDetectionModalContent = function(detection) {
    if (!this.modalElements) {
      return;
    }

    const confidence = detection.confidence || 0;

    const difficultyInfo = this.getDifficultyInfo([detection]);
    const manualDifficulty = (typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.normalizeDifficulty === 'function')
      ? DetectionUtils.normalizeDifficulty(detection?.difficulty || detection?.detector?.difficulty)
      : null;
    const difficulty = manualDifficulty || difficultyInfo.difficulty;

    if (this.modalElements.icon) {
      this.modalElements.icon.innerHTML = this.getDetectorIcon(detection);
    }

    if (this.modalElements.name) {
      this.modalElements.name.textContent = FormatUtils.detectorName(detection) || _dmText('unknownDetection', 'Unknown Detection');
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
      const defined = DetectionModals.findDetectorDefinition.call(this, detection) || {};
      const description = FormatUtils.ruleText(defined.description || detection.detector?.description, defined.descriptionI18n)
        || _dmText('detectionUiNoDescription', 'No additional details provided for this detection.');
      this.modalElements.description.textContent = description;
    }

    // What the difficulty means, the vendor's site, its docs page and its Advanced tools
    DetectionModals.renderAbout.call(this, detection, difficulty);

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
      } else {
        const empty = document.createElement('div');
        empty.className = 'detection-modal-empty';
        empty.textContent = _dmText('detectionUiNoMethodsRecorded', 'No detection methods recorded for this detector.');
        this.modalElements.methods.replaceChildren(empty);
      }
    }
};

/** What each difficulty level means for the protection, in the dialog under its description. */
DetectionModals.DIFFICULTY_MEANINGS = Object.freeze({
    Low: ['detectionModalDifficultyLow', 'Low difficulty: it usually lets ordinary traffic through, and requests with realistic headers and cookies often pass.'],
    Medium: ['detectionModalDifficultyMedium', 'Medium difficulty: plain HTTP clients are often challenged; a real browser with consistent settings usually gets through.'],
    High: ['detectionModalDifficultyHigh', 'High difficulty: hard to get past. It checks the browser, its behaviour and the network it comes from, and blocks plain HTTP clients.']
});

/** The links row's listener, bound once per dialog: Open tools goes to the Advanced tools of the protection shown. */
DetectionModals.bindAboutLinks = function() {
    const button = this.modalElements && this.modalElements.openTools;
    if (!button || button.dataset?.bound === 'true') return;
    if (button.dataset) button.dataset.bound = 'true';
    button.addEventListener('click', () => DetectionModals.openVendorTools.call(this));
};

/** A link of the row: shown with its address, or hidden with none (no address of an earlier protection left behind). */
const _dmSetLink = (link, url) => {
    if (!link) return;
    link.hidden = !url;
    if (url) {
      link.setAttribute('href', url);
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    } else {
      link.removeAttribute('href');
    }
};

/** The Advanced tools entry (AdvancedVendorRegistry) for a detector id, if the vendor has tools. */
const _dmToolsEntry = (detectorId) => {
    const modules = typeof AdvancedVendorRegistry !== 'undefined' ? AdvancedVendorRegistry.modules : null;
    const key = typeof detectorId === 'string' ? detectorId.replace(/^detect-/, '') : '';
    return modules && key && Object.prototype.hasOwnProperty.call(modules, key) ? modules[key] : null;
};

/**
 * Under the description: what the difficulty means, the vendor's website and the protection's docs page (VendorLinks: official
 * detectors only, the page in the interface language when it exists), and Open tools when Advanced lists the protection (the
 * vendor has tools and the confidence is above Settings → Detection → Advanced tools' minimum, as Advanced decides).
 * @returns {Promise<void>} settles once the minimum confidence is read and Open tools shown or hidden
 */
DetectionModals.renderAbout = async function(detection, difficulty) {
    const elements = this.modalElements || {};
    const meaning = DetectionModals.DIFFICULTY_MEANINGS[difficulty];
    if (elements.difficultyNote) {
      elements.difficultyNote.textContent = meaning ? _dmText(meaning[0], meaning[1]) : '';
      elements.difficultyNote.hidden = !meaning;
    }

    const detectorId = detection?.detector?.id;
    const definition = DetectionModals.findDetectorDefinition.call(this, detection) || {};
    const author = DetectionModals.resolveDetectorDefinition.call(this, detection)?.author;
    const official = typeof DetectionUtils !== 'undefined' && typeof DetectionUtils.isOfficialDetector === 'function'
      && DetectionUtils.isOfficialDetector({ id: detectorId, author });
    const links = typeof VendorLinks !== 'undefined' ? VendorLinks : null;
    const locale = typeof I18n !== 'undefined' && typeof I18n.locale === 'function' ? I18n.locale() : 'en';
    const website = links ? links.websiteUrl(definition, { official }) : '';
    const docs = links ? links.docsUrl({ id: detectorId }, { official, category: FormatUtils.categoryKey(detection), locale }) : '';
    _dmSetLink(elements.website, website);
    _dmSetLink(elements.docs, docs);

    // Open tools: hidden until the minimum is read, so it never offers tools Advanced would not list
    const token = {};
    this.aboutRenderToken = token;
    this.modalToolsDetectorId = null;
    if (elements.openTools) elements.openTools.hidden = true;
    const syncRow = () => {
      if (elements.links) elements.links.hidden = !website && !docs && !(elements.openTools && !elements.openTools.hidden);
    };
    syncRow();
    if (!elements.openTools || !_dmToolsEntry(detectorId) || typeof Advanced === 'undefined') return;
    let minimum = Advanced.MIN_TOOL_CONFIDENCE;
    try {
      if (typeof Advanced.readMinToolConfidence === 'function') minimum = await Advanced.readMinToolConfidence();
    } catch (_) { /* keep the default */ }
    if (this.aboutRenderToken !== token) return;
    const offered = (Number(detection?.confidence) || 0) > minimum;
    elements.openTools.hidden = !offered;
    this.modalToolsDetectorId = offered ? detectorId : null;
    syncRow();
};

/** Open tools: the dialog closes and the Advanced tab opens with this protection's tools. */
DetectionModals.openVendorTools = async function() {
    const detectorId = this.modalToolsDetectorId;
    const popup = typeof window !== 'undefined' ? window.popupInstance : null;
    if (!detectorId || !popup || typeof popup.switchTab !== 'function' || typeof Advanced === 'undefined') return;
    if (typeof Advanced.requestTools === 'function') Advanced.requestTools(detectorId);
    this.closeDetectionModal();
    try {
      await popup.switchTab('advanced');
    } catch (error) {
      Logger.warn('UI', '[Detection] Could not open the Advanced tools', error);
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
      confidenceHtml: (value, cls, tip) => FormatUtils.confidenceHtml(value, cls, tip),
      // What a combination found, drawn as the Detection methods are: a row per signal, folded, the value when opened
      ...(typeof DetectionUI !== 'undefined' && typeof DetectionUI.methodRowHtml === 'function' ? {
        signalHtml: (spec) => DetectionUI.methodRowHtml.call(this, {
          matchType: spec.method, confidence: spec.confidence, displayValue: spec.value, caption: spec.caption, absent: spec.absent
        }),
        signalsClass: 'detection-modal-methods-list'
      } : {})
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
        label: FormatUtils.ruleText(combo.name) || _dmText('combinationDefaultNameFmt', 'Combination {0}', index + 1),
        value: `${Math.round(Number(combo.confidence) || 0)}%`,
        tone: FormatUtils.confidenceTone(combo.confidence)
      }));
};

if (typeof self !== 'undefined') {
    self.DetectionModals = DetectionModals;
}
