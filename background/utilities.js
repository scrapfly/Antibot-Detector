/**
 * Background utility functions for initialization and detection data retrieval.
 */

async function ensureDetectorManagerInitialized() {
    if (!detectorManager || !detectorManager.initialized) {
        if (!categoryManager) {
            categoryManager = new CategoryManager();
        }
        if (!detectorManager) {
            detectorManager = new DetectorManager(categoryManager);
        }
        if (!detectorManager.initialized) {
            await detectorManager.initialize();
        }
    }
    return detectorManager;
}

async function getCurrentTabDetectionData() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            return await DetectionEngineManager.getDetectionData(tab.id);
        }
    } catch (error) {
        Logger.error('BACKGROUND', 'Scrapfly Background: Error getting current tab:', error);
    }
    return null;
}

function initializeServices() {
    Logger.background('Scrapfly Background: Initializing services...');

    setupHeaderCapture();
    setupMessageListeners();
    setupTabListeners();

    Logger.background('Scrapfly Background: Services initialization complete');
}
