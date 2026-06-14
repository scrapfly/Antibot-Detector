    /**
     * Setup listener for extraction completion messages
     */
ShapeSecurityAdvanced.prototype.setupExtractionListener = function() {
        if (this.extractionListener) return; // Already setup

        this.extractionListener = (message) => {
            if (message.type === 'SHAPESECURITY_EXTRACTION_COMPLETED') {
                Logger.network('[SHAPESECURITY-EXTRACT] Extraction completed message received:', message);
                this.displayExtractionResults(message.extractedData);
            } else if (message.type === 'SHAPESECURITY_COOKIE_RESULT') {
                Logger.network('[SHAPESECURITY-COOKIE] Cookie check result received:', message);
                this.displayCookieResults(message.cookie);
            }
        };

        chrome.runtime.onMessage.addListener(this.extractionListener);
    };


    // ========================================================================
    // REQUIRED OVERRIDES
    // ========================================================================

    // ========================================================================
    // SHAPE SECURITY SPECIFIC METHODS
    // ========================================================================