// Manages detector categories, colors, and storage
class CategoryManager {
    constructor() {
        this.categories = {};
        this.initialized = false;
        this.watchStorage();
    }

    /**
     * Colours saved elsewhere reach this instance too: the worker syncs them after a Save in Settings, and an open
     * popup would otherwise draw its chips with the colours it loaded.
     */
    watchStorage() {
        if (typeof chrome === 'undefined' || !chrome.storage?.onChanged?.addListener) return;
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.scrapfly_categories || !this.initialized) return;
            const value = typeof StorageManager !== 'undefined'
                ? StorageManager.parseStoredValue(changes.scrapfly_categories.newValue, 'scrapfly_categories')
                : changes.scrapfly_categories.newValue;
            const categories = value && (value.categories || value);
            if (categories && typeof categories === 'object') this.categories = categories;
        });
    }

    static getPackagedFallbackIndex() {
        return {
            version: '1.0.0',
            antibot: {
                colour: Categories.DEFAULT_COLORS.antibot,
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
                    'detect-kasada',
                    'detect-anubis',
                    'detect-aliyunwaf',
                    'detect-jiasule',
                    'detect-ruishu',
                    'detect-fingerprintjs',
                    'detect-netacea',
                    'detect-azurefrontdoor',
                    'detect-yundun',
                    'detect-radware',
                    'detect-amazon',
                    'detect-cloudflare-waitingroom',
                    'detect-hunt',
                    'detect-deepseek-pow',
                    'detect-openai-sentinel'
                ]
            },
            captcha: {
                colour: Categories.DEFAULT_COLORS.captcha,
                detectors: [
                    'detect-hcaptcha',
                    'detect-recaptcha',
                    'detect-geetest',
                    'detect-qcloud',
                    'detect-funcaptcha',
                    'detect-aliexpress',
                    'detect-friendlycaptcha',
                    'detect-captchaeu',
                    'detect-turnstile',
                    'detect-yidun',
                    'detect-aliyun',
                    'detect-smartcaptcha',
                    'detect-dingxiang',
                    'detect-capy',
                    'detect-shumei',
                    'detect-mtcaptcha',
                    'detect-binance-captcha',
                    'detect-prosopo',
                    'detect-basilisk'
                ]
            },
            fingerprint: {
                colour: Categories.DEFAULT_COLORS.fingerprint,
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
            tags: Object.fromEntries(Object.entries(FormatUtils.METHOD_TAG_COLOR_KEYS)
                .map(([method, key]) => [method, { colour: FormatUtils.DEFAULT_TAG_COLORS[key] }]))
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

                // The tag colours (Settings → Tag colours) reach the chips of the details, History and Rules the same way
                const tagColors = settingsData?.tagColors || {};
                for (const [method, key] of Object.entries(FormatUtils.METHOD_TAG_COLOR_KEYS)) {
                    if (typeof tagColors[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(tagColors[key])) continue;
                    this.categories.tags = this.categories.tags || {};
                    this.categories.tags[method] = { ...this.categories.tags[method], colour: tagColors[key] };
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
        const known = Categories.labelOf(categoryName);
        if (known) {
            const translated = typeof I18n !== 'undefined' ? I18n.get(known[0]) : null;
            return translated || known[1];
        }
        return categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
    }

    /**
     * Get category badge CSS class
     * @param {string} categoryName - Category name
     * @returns {string} CSS class name for badges
     */
    getCategoryBadgeClass(categoryName) {
        return Categories.badgeClass(categoryName);
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
     * Badge colours explicitly saved from the settings modal, read raw from
     * storage (not merged with defaults), or null when none were saved.
     * @returns {Promise<Object|null>} {low, medium, high}
     */
    static async getSavedBadgeColors() {
        try {
            const result = await chrome.storage.local.get(['scrapfly_settings']);
            const raw = result.scrapfly_settings;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const colors = (parsed?.settings || parsed)?.badgeColors;
            if (!colors || typeof colors !== 'object') return null;
            const valid = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
            if (![colors.low, colors.medium, colors.high].some(valid)) return null;
            return {
                low: valid(colors.low) ? colors.low : BADGE.COLORS.LOW,
                medium: valid(colors.medium) ? colors.medium : BADGE.COLORS.MEDIUM,
                high: valid(colors.high) ? colors.high : BADGE.COLORS.HIGH
            };
        } catch (error) {
            return null;
        }
    }

    /**
     * The toolbar badge colours: the ones saved in Settings → Badge colors, else the shared defaults
     * (the same ones Settings shows before anything is saved).
     * @returns {Promise<Object>} Badge colors {low, medium, high}
     */
    static async getBadgeColors() {
        const saved = await CategoryManager.getSavedBadgeColors();
        return saved || { low: BADGE.COLORS.LOW, medium: BADGE.COLORS.MEDIUM, high: BADGE.COLORS.HIGH };
    }
}

if (typeof window !== 'undefined') {
    window.CategoryManager = CategoryManager;
}
