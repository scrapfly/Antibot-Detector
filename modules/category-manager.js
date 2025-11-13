/**
 * CategoryManager Module
 * Manages detector categories including loading, storage, and metadata
 * Handles category configuration from index.json and Chrome storage
 */
class CategoryManager {
    constructor() {
        this.categories = {};
        this.initialized = false;
    }

    /**
     * Initialize the CategoryManager by loading categories from storage first,
     * then falling back to index.json if storage is empty.
     * This preserves custom colors (badge, category, tag) across sessions.
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // TRY STORAGE FIRST - preserve custom colors!
            const storageLoaded = await this.loadFromStorage();

            if (!storageLoaded) {
                // Only load from index.json if storage is empty (first run)
                await this.loadCategoriesFromIndex();
                await this.saveToStorage();
            } else {
                // IMPORTANT: Merge any new tags from index.json that aren't in storage
                // This ensures new detection methods (like js_hooks) get their colors even if storage is old
                await this.mergeNewTagsFromIndex();
            }

            // Sync colors from Settings (user customizations take precedence)
            await this.syncColorsFromSettings();

            this.initialized = true;
        } catch (error) {
            Logger.error('DETECTOR', 'CategoryManager failed to initialize', error);
            throw error;
        }
    }

    /**
     * Load categories from detectors/index.json
     * Sets this.categories with the index data
     */
    async loadCategoriesFromIndex() {
        try {
            const indexUrl = chrome.runtime.getURL('detectors/index.json');
            const response = await fetch(indexUrl);

            if (!response.ok) {
                throw new Error(`Failed to load index.json: ${response.statusText}`);
            }

            const indexData = await response.json();
            this.categories = indexData;

            // Warn if badge colors missing
            if (!this.categories.badge) {
                Logger.warn('DETECTOR', 'No badge section found in index.json');
            }

        } catch (error) {
            Logger.error('DETECTOR', 'Failed to load detectors index', error);
            throw error;
        }
    }

    /**
     * Merge new tags from index.json into storage data
     * This ensures new detection methods added to index.json are available even with old storage data
     */
    async mergeNewTagsFromIndex() {
        try {
            const indexUrl = chrome.runtime.getURL('detectors/index.json');
            const response = await fetch(indexUrl);

            if (!response.ok) return;

            const indexData = await response.json();

            // Merge tags from index.json that aren't in storage
            if (indexData.tags) {
                if (!this.categories.tags) {
                    this.categories.tags = {};
                }

                let mergedCount = 0;
                for (const [tagName, tagData] of Object.entries(indexData.tags)) {
                    if (!this.categories.tags[tagName]) {
                        this.categories.tags[tagName] = tagData;
                        mergedCount++;
                    }
                }

                if (mergedCount > 0) {
                    await this.saveToStorage();
                }
            }
        } catch (error) {
            // Silently fail - not critical
        }
    }

    /**
     * Save category data to Chrome storage as 'scrapfly_categories'
     * OPTIMIZATION Phase 1: Uses StorageManager for consistent save patterns
     */
    async saveToStorage() {
        try {
            // Use StorageManager for consistent save with metadata
            const success = await StorageManager.saveToStorage('scrapfly_categories', {
                categories: this.categories,
                totalCategories: Object.keys(this.categories).length
            }, {
                wrapMetadata: true,
                countProperty: null // totalCategories already included in data
            });

            if (!success) {
                throw new Error('StorageManager.saveToStorage returned false');
            }
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to save categories to storage', error);
            throw error;
        }
    }

    /**
     * Load previously saved category data from Chrome storage
     * OPTIMIZATION Phase 1: Uses StorageManager for consistent load patterns
     */
    async loadFromStorage() {
        try {
            // Use StorageManager with backward compatibility support
            const categoriesData = await StorageManager.loadFromStorage(
                'scrapfly_categories',
                'scrapfly_categories.json',
                null // Load full wrapper (timestamp + categories)
            );

            if (categoriesData) {
                this.categories = categoriesData.categories;
                this.initialized = Object.keys(this.categories).length > 0;
                return true;
            }

            return false;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to load categories from storage', error);
            return false;
        }
    }

    /**
     * Get list of available category names
     * @returns {string[]} Array of category names
     */
    getCategories() {
        return Object.keys(this.categories);
    }

    /**
     * Get all categories data
     * @returns {object} All categories with their configurations
     */
    getAllCategories() {
        return this.categories;
    }

    /**
     * Get category information including color and detector list
     * @param {string} categoryName - Category name
     * @returns {object} Category data with colour and detectors array
     */
    getCategoryInfo(categoryName) {
        return this.categories[categoryName];
    }

    /**
     * Get color for a specific category
     * Returns the color from CategoryManager's stored data
     * @param {string} categoryName - Category name
     * @returns {string} Category color hex value or default
     */
    getCategoryColor(categoryName) {
        const categoryInfo = this.categories[categoryName];
        return categoryInfo?.colour || '#3b82f6';
    }

    /**
     * Sync category colors from Settings
     * This should be called after Settings saves category colors
     * @returns {Promise<boolean>} True if colors were synced successfully
     */
    async syncColorsFromSettings() {
        try {
            // Read colors from Settings
            const result = await chrome.storage.local.get('scrapfly_settings');
            if (result.scrapfly_settings) {
                const settingsData = JSON.parse(result.scrapfly_settings);
                const categoryColors = settingsData?.settings?.categoryColors;

                if (categoryColors) {
                    // Update colors in CategoryManager's categories
                    for (const [categoryName, color] of Object.entries(categoryColors)) {
                        if (this.categories[categoryName]) {
                            this.categories[categoryName].colour = color;
                        }
                    }

                    // Save updated categories to storage
                    await this.saveToStorage();
                    return true;
                }
            }
            return false;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to sync colors from Settings', error);
            return false;
        }
    }

    /**
     * Get detector names for a specific category
     * @param {string} categoryName - Category name
     * @returns {string[]} Array of detector names
     */
    getCategoryDetectors(categoryName) {
        const categoryInfo = this.categories[categoryName];
        return categoryInfo ? categoryInfo.detectors : [];
    }

    /**
     * Check if a category exists
     * @param {string} categoryName - Category name
     * @returns {boolean} True if category exists
     */
    hasCategory(categoryName) {
        return categoryName in this.categories;
    }

    /**
     * Get category icon (fallback emojis for categories)
     * @param {string} categoryName - Category name
     * @returns {string} Icon emoji or default
     */
    getCategoryIcon(categoryName) {
        switch (categoryName?.toLowerCase()) {
            case 'antibot':
            case 'anti-bot':
                return '🛡️';
            case 'captcha':
                return '🧩';
            case 'fingerprint':
                return '👆';
            default:
                return '🔍';
        }
    }

    /**
     * Get category display name
     * @param {string} categoryName - Category name
     * @returns {string} Formatted display name
     */
    getCategoryDisplayName(categoryName) {
        switch (categoryName?.toLowerCase()) {
            case 'antibot':
                return 'Anti-Bot';
            case 'captcha':
                return 'CAPTCHA';
            case 'fingerprint':
                return 'Fingerprint';
            default:
                return categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
        }
    }

    /**
     * Get category badge CSS class
     * @param {string} categoryName - Category name
     * @returns {string} CSS class name for badges
     */
    getCategoryBadgeClass(categoryName) {
        switch (categoryName?.toLowerCase()) {
            case 'antibot':
            case 'anti-bot':
                return 'antibot';
            case 'captcha':
                return 'captcha';
            case 'fingerprint':
                return 'fingerprint';
            default:
                return 'primary';
        }
    }

    /**
     * Get all tag colors from index.json
     * @returns {object} Object with tag names as keys and color hex values
     */
    getTagColors() {
        return this.categories.tags || {};
    }

    /**
     * Get color for a specific tag (dom, header, cookie, etc.)
     * @param {string} tagName - Tag name (lowercase)
     * @returns {string} Tag color hex value or default
     */
    getTagColor(tagName) {
        const tags = this.getTagColors();
        const normalizedTagName = tagName.toLowerCase();

        // Get tag data directly (method names now match tag names exactly)
        const tagData = tags[normalizedTagName];

        // Handle both old format (string) and new format (object with colour property)
        if (typeof tagData === 'string') {
            return tagData;
        } else if (tagData && tagData.colour) {
            return tagData.colour;
        }

        return '#666666';
    }

    /**
     * Get badge colors configuration
     * @returns {object} Object with low, medium, high badge colors
     */
    getBadgeColors() {
        return this.categories.badge || {
            low: { colour: '#4CAF50' },
            medium: { colour: '#FFA500' },
            high: { colour: '#FF4444' }
        };
    }

    /**
     * Get color for a specific badge level
     * @param {string} level - Badge level: 'low', 'medium', or 'high'
     * @returns {string} Badge color hex value or default
     */
    getBadgeColor(level) {
        const badgeColors = this.getBadgeColors();
        const normalizedLevel = level.toLowerCase();

        const levelData = badgeColors[normalizedLevel];

        // Handle both old format (string) and new format (object with colour property)
        let color;
        if (typeof levelData === 'string') {
            color = levelData;
        } else if (levelData && levelData.colour) {
            color = levelData.colour;
        } else {
            // Fallback defaults
            const defaults = {
                low: '#4CAF50',
                medium: '#FFA500',
                high: '#FF4444'
            };
            color = defaults[normalizedLevel] || '#4CAF50';
        }

        return color;
    }

    /**
     * Update badge color for a specific level
     * @param {string} level - Badge level: 'low', 'medium', or 'high'
     * @param {string} color - New color hex value
     * @returns {boolean} Success status
     */
    updateBadgeColor(level, color) {
        const normalizedLevel = level.toLowerCase();

        if (!['low', 'medium', 'high'].includes(normalizedLevel)) {
            Logger.error('BADGE', 'Invalid badge level - must be low, medium, or high', { level });
            return false;
        }

        if (!this.categories.badge) {
            this.categories.badge = {
                low: { colour: '#4CAF50' },
                medium: { colour: '#FFA500' },
                high: { colour: '#FF4444' }
            };
        }

        this.categories.badge[normalizedLevel] = { colour: color };
        return true;
    }

    /**
     * Update category color
     * @param {string} categoryName - Category name
     * @param {string} color - New color hex value
     */
    updateCategoryColor(categoryName, color) {
        if (!this.hasCategory(categoryName)) {
            return false;
        }

        this.categories[categoryName].colour = color;
        return true;
    }

    /**
     * Get total count of categories
     * @returns {number} Number of categories
     */
    getCategoryCount() {
        return Object.keys(this.categories).length;
    }

    /**
     * Get total count of all detectors across all categories
     * @returns {number} Total number of detectors
     */
    getTotalDetectorCount() {
        let count = 0;
        for (const category of Object.values(this.categories)) {
            count += (category.detectors?.length || 0);
        }
        return count;
    }

    /**
     * Clear category data from Chrome storage
     * OPTIMIZATION Phase 1: Uses StorageManager for consistent clear patterns
     */
    async clearStorage() {
        try {
            // Remove both old and new keys
            await StorageManager.clearStorage(['scrapfly_categories', 'scrapfly_categories.json']);
        } catch (error) {
            Logger.error('STORAGE', 'Failed to clear category storage', error);
        }
    }

    /**
     * Get storage information
     * @returns {object} Object with category stats
     */
    getStorageInfo() {
        const detectorCounts = {};
        for (const [name, data] of Object.entries(this.categories)) {
            detectorCounts[name] = data.detectors?.length || 0;
        }

        return {
            categoryCount: this.getCategoryCount(),
            totalDetectorCount: this.getTotalDetectorCount(),
            detectorsByCategory: detectorCounts,
            initialized: this.initialized
        };
    }

    /**
     * Export categories data as JSON string
     * @returns {string} JSON string of categories
     */
    exportCategories() {
        return JSON.stringify(this.categories, null, 2);
    }

    /**
     * Import categories from JSON string
     * @param {string} jsonString - JSON string of categories
     * @returns {boolean} Success status
     */
    importCategories(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.categories = imported;
            return true;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to import categories', error);
            return false;
        }
    }

    /**
     * Get badge colors from CategoryManager instance or storage
     * @param {CategoryManager} [categoryManagerInstance] - Optional CategoryManager instance
     * @returns {Promise<Object>} Badge colors {low, medium, high}
     */
    static async getBadgeColors(categoryManagerInstance = null) {
        try {
            // If instance provided and initialized, use it
            if (categoryManagerInstance && categoryManagerInstance.initialized) {
                return {
                    low: categoryManagerInstance.getBadgeColor('low'),
                    medium: categoryManagerInstance.getBadgeColor('medium'),
                    high: categoryManagerInstance.getBadgeColor('high')
                };
            }

            // Otherwise, load from storage directly
            const result = await chrome.storage.local.get(['scrapfly_categories']);
            if (result.scrapfly_categories) {
                const categoriesData = typeof result.scrapfly_categories === 'string'
                    ? JSON.parse(result.scrapfly_categories)
                    : result.scrapfly_categories;

                if (categoriesData.badge) {
                    return {
                        low: categoriesData.badge.low || '#4CAF50',
                        medium: categoriesData.badge.medium || '#FFA500',
                        high: categoriesData.badge.high || '#FF4444'
                    };
                }
            }

            // Fallback defaults
            return {
                low: '#4CAF50',
                medium: '#FFA500',
                high: '#FF4444'
            };
        } catch (error) {
            Logger.error('BADGE', 'Error getting badge colors', error);
            // Fallback defaults
            return {
                low: '#4CAF50',
                medium: '#FFA500',
                high: '#FF4444'
            };
        }
    }
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CategoryManager;
} else if (typeof window !== 'undefined') {
    window.CategoryManager = CategoryManager;
}