// Manages detector categories, colors, and storage
class CategoryManager {
    constructor() {
        this.categories = {};
        this.initialized = false;
    }

    static getPackagedFallbackIndex() {
        return {
            version: '1.0.0',
            antibot: {
                colour: '#FF5733',
                detectors: [
                    'detect-akamai',
                    'detect-cloudflare',
                    'detect-aws-waf',
                    'detect-botguard',
                    'detect-f5',
                    'detect-datadome',
                    'detect-incapsula',
                    'detect-perimeterx',
                    'detect-shapesecurity',
                    'detect-sucuri',
                    'detect-reblaze',
                    'detect-threatmetrix',
                    'detect-meetrics',
                    'detect-ocule',
                    'detect-cheq',
                    'detect-kasada'
                ]
            },
            captcha: {
                colour: '#33C3FF',
                detectors: [
                    'detect-hcaptcha',
                    'detect-recaptcha',
                    'detect-geetest',
                    'detect-qcloud',
                    'detect-funcaptcha',
                    'detect-aliexpress',
                    'detect-friendlycaptcha',
                    'detect-captchaeu'
                ]
            },
            fingerprint: {
                colour: '#3b82f6',
                detectors: [
                    'detect-audio-fingerprint',
                    'detect-battery-fingerprint',
                    'detect-canvas-fingerprint',
                    'detect-clipboard-fingerprint',
                    'detect-crypto-fingerprint',
                    'detect-css-fingerprint',
                    'detect-font-fingerprint',
                    'detect-gamepads-fingerprint',
                    'detect-geolocation-fingerprint',
                    'detect-hardware-fingerprint',
                    'detect-indexeddb-fingerprint',
                    'detect-media-fingerprint',
                    'detect-navigator-fingerprint',
                    'detect-orientation-fingerprint',
                    'detect-performance-fingerprint',
                    'detect-screen-fingerprint',
                    'detect-storage-fingerprint',
                    'detect-timezone-fingerprint',
                    'detect-usb-fingerprint',
                    'detect-webgl-fingerprint',
                    'detect-webrtc-fingerprint'
                ]
            },
            tags: {
                dom: { colour: '#3b82f6' },
                header: { colour: '#FF33A8' },
                cookie: { colour: '#FFC133' },
                content: { colour: '#33FFF3' },
                url: { colour: '#00BCD4' },
                js_hooks: { colour: '#00E5FF' },
                window: { colour: '#4CAF50' },
                payload: { colour: '#9C27B0' }
            },
            badge: {
                low: { colour: '#4CAF50' },
                medium: { colour: '#FFA500' },
                high: { colour: '#FF4444' }
            }
        };
    }

    /**
     * Initialize the CategoryManager by loading categories from storage first,
     * then falling back to index.json if storage is empty.
     * This preserves custom colors (badge, category, tag) across sessions.
     */
    async initialize() {
        if (this.initialized) return;

        try {
            // Load from storage first (preserves custom colors)
            const storageLoaded = await this.loadFromStorage();

            if (!storageLoaded) {
                await this.loadCategoriesFromIndex();
                await this.saveToStorage();
            } else {
                // Merge new tags from index.json not yet in storage
                await this.mergeNewTagsFromIndex();
            }

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

            if (!this.categories.badge) {
                Logger.warn('DETECTOR', 'No badge section found in index.json');
            }

        } catch (error) {
            Logger.error('DETECTOR', 'Failed to load detectors index, using packaged fallback', error);
            this.categories = CategoryManager.getPackagedFallbackIndex();
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

    async saveToStorage() {
        try {
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

    async loadFromStorage() {
        try {
            const categoriesData = await StorageManager.loadFromStorage(
                'scrapfly_categories',
                'scrapfly_categories.json',
                null // Load full wrapper (timestamp + categories)
            );

            if (categoriesData && categoriesData.categories && typeof categoriesData.categories === 'object') {
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
            const settingsData = await Utils.getSettings();
            const categoryColors = settingsData?.categoryColors;

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
            return false;
        } catch (error) {
            Logger.error('DETECTOR', 'Failed to sync colors from Settings', error);
            return false;
        }
    }

    /**
     * Get category display name
     * @param {string} categoryName - Category name
     * @returns {string} Formatted display name
     */
    getCategoryDisplayName(categoryName) {
        const i18nKeyByCategory = {
            antibot: 'categoryAntibot',
            captcha: 'categoryCaptcha',
            fingerprint: 'categoryFingerprint'
        };
        const key = i18nKeyByCategory[categoryName?.toLowerCase()];
        if (key && typeof I18n !== 'undefined') {
            const translated = I18n.get(key);
            if (translated) return translated;
        }

        switch (categoryName?.toLowerCase()) {
            case 'antibot':
                return 'Anti-Bot';
            case 'captcha':
                return 'Captcha';
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

        const tagData = tags[normalizedTagName];

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
            low: { colour: BADGE.COLORS.LOW },
            medium: { colour: BADGE.COLORS.MEDIUM },
            high: { colour: BADGE.COLORS.HIGH }
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

        let color;
        if (typeof levelData === 'string') {
            color = levelData;
        } else if (levelData && levelData.colour) {
            color = levelData.colour;
        } else {
            const defaults = {
                low: BADGE.COLORS.LOW,
                medium: BADGE.COLORS.MEDIUM,
                high: BADGE.COLORS.HIGH
            };
            color = defaults[normalizedLevel] || BADGE.COLORS.LOW;
        }

        return color;
    }

    /**
     * Get badge colors from CategoryManager instance or storage
     * @param {CategoryManager} [categoryManagerInstance] - Optional CategoryManager instance
     * @returns {Promise<Object>} Badge colors {low, medium, high}
     */
    static async getBadgeColors(categoryManagerInstance = null) {
        try {
            if (categoryManagerInstance && categoryManagerInstance.initialized) {
                return {
                    low: categoryManagerInstance.getBadgeColor('low'),
                    medium: categoryManagerInstance.getBadgeColor('medium'),
                    high: categoryManagerInstance.getBadgeColor('high')
                };
            }

            const normalizeColor = (value, fallback) => {
                if (typeof value === 'string') return value;
                if (value && typeof value === 'object') {
                    if (typeof value.colour === 'string') return value.colour;
                    if (typeof value.color === 'string') return value.color;
                }
                return fallback;
            };

            const result = await chrome.storage.local.get(['scrapfly_categories', 'scrapfly_settings']);

            if (result.scrapfly_categories) {
                const categoriesData = typeof result.scrapfly_categories === 'string'
                    ? JSON.parse(result.scrapfly_categories)
                    : result.scrapfly_categories;

                const categoriesRoot = categoriesData?.categories || categoriesData;
                const badge = categoriesRoot?.badge;

                if (badge) {
                    return {
                        low: normalizeColor(badge.low, BADGE.COLORS.LOW),
                        medium: normalizeColor(badge.medium, BADGE.COLORS.MEDIUM),
                        high: normalizeColor(badge.high, BADGE.COLORS.HIGH)
                    };
                }
            }

            const settingsData = await Utils.getSettings();
            const badgeColors = settingsData?.badgeColors;
            if (badgeColors) {
                return {
                    low: badgeColors.low || BADGE.COLORS.LOW,
                    medium: badgeColors.medium || BADGE.COLORS.MEDIUM,
                    high: badgeColors.high || BADGE.COLORS.HIGH
                };
            }

            return {
                low: BADGE.COLORS.LOW,
                medium: BADGE.COLORS.MEDIUM,
                high: BADGE.COLORS.HIGH
            };
        } catch (error) {
            Logger.error('BADGE', 'Error getting badge colors', error);
            return {
                low: BADGE.COLORS.LOW,
                medium: BADGE.COLORS.MEDIUM,
                high: BADGE.COLORS.HIGH
            };
        }
    }
}

if (typeof window !== 'undefined') {
    window.CategoryManager = CategoryManager;
}
