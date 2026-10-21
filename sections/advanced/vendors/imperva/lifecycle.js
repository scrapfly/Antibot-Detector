    /**
     * Setup listener for extraction completion messages
     */
ImpervaAdvanced.prototype.setupExtractionListener = function() {
        if (this.extractionListener) return; // Already setup

        this.extractionListener = (message) => {
            // Only this tab's extraction (older workers sent no tabId)
            if (message.type === 'IMPERVA_EXTRACTION_COMPLETED' && (message.tabId === undefined || message.tabId === this.tabInfo?.id)) {
                Logger.network('[IMPERVA-EXTRACT] Extraction completed message received:', message);
                this.displayExtractionResults(message.extractedData);
            }
        };

        chrome.runtime.onMessage.addListener(this.extractionListener);
    };

ImpervaAdvanced.prototype.dispose = function() {
        BaseAdvancedModule.prototype.dispose.call(this);
        if (this.extractionListener) chrome.runtime.onMessage.removeListener(this.extractionListener);
        this.extractionListener = null;
    };
