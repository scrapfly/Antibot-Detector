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


    // ========================================================================
    // REQUIRED OVERRIDES
    // ========================================================================