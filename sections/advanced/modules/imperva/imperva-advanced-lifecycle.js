/**
 * imperva-advanced-lifecycle.js
 * Split from monolithic file; method bodies intentionally unchanged.
 */


    /**
     * Setup listener for extraction completion messages
     */
ImpervaAdvanced.prototype.setupExtractionListener = function() {
        if (this.extractionListener) return; // Already setup

        this.extractionListener = (message) => {
            if (message.type === 'IMPERVA_EXTRACTION_COMPLETED') {
                Logger.network('[IMPERVA-EXTRACT] Extraction completed message received:', message);
                this.displayExtractionResults(message.extractedData);
            }
        };

        chrome.runtime.onMessage.addListener(this.extractionListener);
    };


    /**
     * Cleanup method - removes event listeners to prevent memory leaks
     * Called when the module is unloaded or popup closes
     */
ImpervaAdvanced.prototype.destroy = function() {
        // Remove extraction listener to prevent memory leak
        if (this.extractionListener) {
            chrome.runtime.onMessage.removeListener(this.extractionListener);
            this.extractionListener = null;
        }

        // Clear any pending analysis timer
        if (this.analysisTimer) {
            clearTimeout(this.analysisTimer);
            this.analysisTimer = null;
        }

        // Clear analysis state
        this.analysisActive = false;
        this.analysisResults = [];
    };



    // ========================================================================
    // REQUIRED OVERRIDES
    // ========================================================================