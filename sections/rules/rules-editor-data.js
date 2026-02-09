/**
 * Rules extension methods.
 * Dependencies: `sections/rules/rules.js` must be loaded first.
 */

Rules.prototype._collectDetectionFromForm = function() {
    const methodsContainer = document.querySelector('#detectionMethodsContainer');
    if (!methodsContainer) return {};

    const detectionMethods = {};
    const methodSections = methodsContainer.querySelectorAll('.method-section');

    methodSections.forEach(section => {
      const methodTitle = section.querySelector('.method-title')?.textContent.toLowerCase();
      if (!methodTitle) return;

      // Map display titles to detector data keys
      let methodType = methodTitle;
      if (methodTitle === 'js hooks') {
        methodType = 'js_hooks';
      }

      const methods = [];
      const methodItems = section.querySelectorAll('.method-item');

      methodItems.forEach(item => {
        const nameInput = item.querySelector('.method-name');
        const valueInput = item.querySelector('.method-value');

        const hasName = nameInput && nameInput.value.trim();

        if (hasName) {
          let methodData = {
            confidence: parseInt(item.dataset.confidence || '100'),
          };

          // Structure data based on method type
          if (methodType === 'header' || methodType === 'cookie') {
            methodData.name = nameInput.value;
            if (valueInput?.value) {
              methodData.value = valueInput.value;
            }
          } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
            methodData.text = nameInput.value;
            if (valueInput?.value) {
              methodData.description = valueInput.value;
            }
          } else if (methodType === 'dom') {
            methodData.selector = nameInput.value;
            if (valueInput?.value) {
              methodData.description = valueInput.value;
            }
          } else if (methodType === 'js_hooks') {
            methodData.target = nameInput.value;
            if (valueInput?.value) {
              methodData.description = valueInput.value;
            }
          } else if (methodType === 'window') {
            methodData.path = nameInput.value;
            methodData.condition = valueInput?.value || 'exists';
          }

          // Add optional pattern settings based on method type
          if (methodType === 'header' || methodType === 'cookie') {
            if (item.dataset.nameRegex === 'true') methodData.nameRegex = true;
            if (item.dataset.nameWholeword === 'true') methodData.nameWholeWord = true;
            if (item.dataset.nameCase === 'true') methodData.nameCaseSensitive = true;
            if (item.dataset.valueRegex === 'true') methodData.valueRegex = true;
            if (item.dataset.valueWholeword === 'true') methodData.valueWholeWord = true;
            if (item.dataset.valueCase === 'true') methodData.valueCaseSensitive = true;
          } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
            if (item.dataset.nameRegex === 'true') methodData.textRegex = true;
            if (item.dataset.nameWholeword === 'true') methodData.textWholeWord = true;
            if (item.dataset.nameCase === 'true') methodData.textCaseSensitive = true;
          } else if (methodType === 'dom') {
            if (item.dataset.nameRegex === 'true') methodData.selectorRegex = true;
            if (item.dataset.nameWholeword === 'true') methodData.selectorWholeWord = true;
            if (item.dataset.nameCase === 'true') methodData.selectorCaseSensitive = true;
          }

          // Content scope settings
          if (item.dataset.checkScripts === 'true') {
            methodData.checkScripts = true;
          }

          // Save scope settings based on method type
          if (methodType === 'header') {
            methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'response', 'response');
            methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'response', 'response');
          } else if (methodType === 'cookie') {
            methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'request', 'request');
            methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'request', 'request');
          } else if (methodType === 'url') {
            methodData.textScope = item.dataset.textScope || 'all';
          }

          // Save payload-specific settings
          if (methodType === 'payload') {
            const urlPattern = item.dataset.payloadUrlPattern || '';
            if (urlPattern) {
              methodData.urlPattern = urlPattern;
              if (item.dataset.payloadUrlRegex === 'true') {
                methodData.urlRegex = true;
              }
              if (item.dataset.payloadUrlCaseSensitive === 'true') {
                methodData.urlCaseSensitive = true;
              }
            }
            const methodsList = item.dataset.payloadMethods || '';
            if (methodsList) {
              methodData.methods = methodsList.split(',').filter(m => m.trim());
            }
          }

          methods.push(methodData);
        }
      });

      if (methods.length > 0) {
        detectionMethods[methodType] = methods;
      }
    });

    return detectionMethods;
  };

Rules.prototype.updateDetectorBadgeColor = function(detectorName, color) {
    if (!this.categoryManager || !detectorName || !color) return;

    // Get all categories
    const categories = this.categoryManager.getCategories();

    // Find and update the detector's color in categories
    Object.values(categories).forEach(category => {
      if (category.detectors && category.detectors[detectorName]) {
        category.detectors[detectorName].color = color;
      }
    });

    // Save updated categories to storage
    this.categoryManager.saveToStorage();
  };

Rules.prototype.saveRule = function() {
    if (!this.currentEditDetector) return;

    // Get detector information from fields
    const nameInput = document.querySelector('#detectorNameInput');
    const categorySelect = document.querySelector('#detectorCategorySelect');

    if (nameInput) {
      this.currentEditDetector.detector.name = nameInput.value;
      this.currentEditDetector.detector.displayName = nameInput.value;
    }

    if (categorySelect) {
      this.currentEditDetector.detector.category = categorySelect.value;
      // Update the category in the parent structure
      this.currentEditDetector.category = categorySelect.value;
    }

    // Save author field
    const authorInput = document.querySelector('#detectorAuthorInput');
    if (authorInput) {
      const author = authorInput.value.trim() || 'scrapfly';
      this.currentEditDetector.detector.author = author;
    }

    // Colors are managed by CategoryManager in Settings, not stored per detector
    // No need to save color property to detector object anymore

    // Save custom icon if one was selected
    if (this.currentEditDetector.customIcon) {
      this.currentEditDetector.detector.customIcon = this.currentEditDetector.customIcon;
    }

    // Collect detection methods from the modal
    const methodsContainer = document.querySelector('#detectionMethodsContainer');
    if (methodsContainer) {
      const detectionMethods = {};

      // Get all method sections
      const methodSections = methodsContainer.querySelectorAll('.method-section');
      methodSections.forEach(section => {
        const methodTitle = section.querySelector('.method-title')?.textContent.toLowerCase();
        if (!methodTitle) return;

        // Map display titles to detector data keys
        let methodType = methodTitle;
        if (methodTitle === 'js hooks') {
          methodType = 'js_hooks';
        }
        // All other types already match the JSON structure (singular)

        const methods = [];
        const methodItems = section.querySelectorAll('.method-item');

        methodItems.forEach(item => {
          const nameInput = item.querySelector('.method-name');
          const valueInput = item.querySelector('.method-value');

          // Only include items that have the primary field (nameInput)
          // The secondary field (valueInput) is optional (description/condition)
          const hasName = nameInput && nameInput.value.trim();

          if (hasName) {
            // Create method data based on the type
            let methodData = {
              confidence: parseInt(item.dataset.confidence || '100'),
            };

            // Structure data based on method type
            if (methodType === 'header' || methodType === 'cookie') {
              methodData.name = nameInput.value;
              if (valueInput?.value) {
                methodData.value = valueInput.value;
              }
            } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
              methodData.text = nameInput.value;
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'dom') {
              methodData.selector = nameInput.value;
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'js_hooks') {
              methodData.target = nameInput.value;
              if (valueInput?.value) {
                methodData.description = valueInput.value;
              }
            } else if (methodType === 'window') {
              methodData.path = nameInput.value;
              // Default condition to "exists" if not provided
              methodData.condition = valueInput?.value || 'exists';
            }

            // Add optional pattern settings based on method type
            // Note: window and js_hooks do NOT support pattern options
            if (methodType === 'header' || methodType === 'cookie') {
              if (item.dataset.nameRegex === 'true') methodData.nameRegex = true;
              if (item.dataset.nameWholeword === 'true') methodData.nameWholeWord = true;
              if (item.dataset.nameCase === 'true') methodData.nameCaseSensitive = true;
              if (item.dataset.valueRegex === 'true') methodData.valueRegex = true;
              if (item.dataset.valueWholeword === 'true') methodData.valueWholeWord = true;
              if (item.dataset.valueCase === 'true') methodData.valueCaseSensitive = true;
            } else if (methodType === 'url' || methodType === 'content' || methodType === 'payload') {
              if (item.dataset.nameRegex === 'true') methodData.textRegex = true;
              if (item.dataset.nameWholeword === 'true') methodData.textWholeWord = true;
              if (item.dataset.nameCase === 'true') methodData.textCaseSensitive = true;
            } else if (methodType === 'dom') {
              if (item.dataset.nameRegex === 'true') methodData.selectorRegex = true;
              if (item.dataset.nameWholeword === 'true') methodData.selectorWholeWord = true;
              if (item.dataset.nameCase === 'true') methodData.selectorCaseSensitive = true;
            }
            // window and js_hooks: No pattern options at all
            // Content scope settings (only save if enabled - restricts search)
            if (item.dataset.checkScripts === 'true') {
              methodData.checkScripts = true;
            }

            // Save scope settings based on method type
            if (methodType === 'header') {
              methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'response', 'response');
              methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'response', 'response');
            } else if (methodType === 'cookie') {
              methodData.nameScope = normalizeCookieHeaderScope(item.dataset.nameScope || 'request', 'request');
              methodData.valueScope = normalizeCookieHeaderScope(item.dataset.valueScope || 'request', 'request');
            } else if (methodType === 'url') {
              methodData.textScope = item.dataset.textScope || 'all';
            }

            // Save payload-specific settings
            if (methodType === 'payload') {
              // Only include if urlPattern is set
              const urlPattern = item.dataset.payloadUrlPattern || '';
              if (urlPattern) {
                methodData.urlPattern = urlPattern;
                // Only include urlRegex if true
                if (item.dataset.payloadUrlRegex === 'true') {
                  methodData.urlRegex = true;
                }
                // Only include urlCaseSensitive if true
                if (item.dataset.payloadUrlCaseSensitive === 'true') {
                  methodData.urlCaseSensitive = true;
                }
              }
              // Only include methods if set
              const methodsList = item.dataset.payloadMethods || '';
              if (methodsList) {
                methodData.methods = methodsList.split(',').filter(m => m.trim());
              }
            }

            methods.push(methodData);
          }
        });

        if (methods.length > 0) {
          detectionMethods[methodType] = methods;
        }
      });

      // Update the detector's detection methods
      if (Object.keys(detectionMethods).length > 0) {
        this.currentEditDetector.detector.detection = detectionMethods;
        Logger.ui('Updated detection methods:', detectionMethods);
      }
    }

    Logger.ui('Saving rule for:', this.currentEditDetector.detector.displayName);

    // Check if detection methods actually changed (for existing detectors)
    const originalDetection = this.currentEditDetector.originalDetection || {};
    const currentDetection = this.currentEditDetector.detector.detection || {};
    const hasChanges = this.currentEditDetector.isNew ||
      JSON.stringify(originalDetection) !== JSON.stringify(currentDetection);

    // Only update timestamp and version if changes were made
    if (hasChanges) {
      // Generate timestamp for lastUpdated
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const timestamp = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

      // Update lastUpdated timestamp
      this.currentEditDetector.detector.lastUpdated = timestamp;

      // Auto-increment version (1.0 → 1.1 → 1.2, etc.)
      if (this.currentEditDetector.isNew) {
        // New detector starts at version 1.0
        this.currentEditDetector.detector.version = '1.0';
      } else {
        // Increment existing version
        const currentVersion = this.currentEditDetector.detector.version || '1.0';
        const versionNum = parseFloat(currentVersion) || 1.0;
        const newVersion = (versionNum + 0.1).toFixed(1);
        this.currentEditDetector.detector.version = newVersion;
        Logger.ui(`Version incremented: ${currentVersion} → ${newVersion}`);
      }
    } else {
      Logger.ui('No changes detected, version and timestamp unchanged');
    }

    // Handle new detector
    if (this.currentEditDetector.isNew) {
      const detectorName = this.currentEditDetector.detector.name || 'custom';
      const slugName = detectorName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const detectorId = slugName || `custom-${Date.now()}`;

      this.currentEditDetector.detector.id = detectorId;

      this.detectorManager.addDetector(
        this.currentEditDetector.category,
        detectorId,
        this.currentEditDetector.detector
      ).then(success => {
        if (success) {
          Logger.ui('New detector added successfully');
          // Reload detectors in background script
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            Logger.ui('Detectors reloaded in background:', response);
          });
          this.displayRules();
        }
      });

      this.closeEditModal();
      return;
    }

    // Update existing detector in DetectorManager
    if (this.detectorManager) {
      const categoryDetectors = this.detectorManager.detectors[this.currentEditDetector.category];
      if (categoryDetectors && categoryDetectors[this.currentEditDetector.detectorName]) {
        const updatedDetector = {
          ...this.currentEditDetector.detector,
          customIcon: this.currentEditDetector.detector.customIcon
        };
        categoryDetectors[this.currentEditDetector.detectorName] = updatedDetector;

        Logger.ui('Detector updated, lastUpdated:', updatedDetector.lastUpdated);

        // Save to storage
        this.detectorManager.saveDetectorsToStorage().then(() => {
          Logger.ui('Detector saved to storage successfully');
          // Reload detectors in background script
          chrome.runtime.sendMessage({ type: 'RELOAD_DETECTORS' }, (response) => {
            Logger.ui('Detectors reloaded in background:', response);
          });
        }).catch(error => {
          Logger.error('UI', 'Failed to save detector:', error);
        });
      }
    }

    // Update the category's color if it changed
    if (this.categoryManager && this.colorManager) {
      const color = this.colorManager.getColor();
      this.updateDetectorBadgeColor(this.currentEditDetector.detectorName, color);
    }

    // Close modal
    this.closeEditModal();

    // Refresh the rules list to show updated data
    this.displayRules();
  };
