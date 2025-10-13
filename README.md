# Scrapfly Security Detection Chrome Extension

<div align="center">

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green?style=for-the-badge)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

**A powerful browser extension for detecting CAPTCHAs, anti-bot systems and fingerprinting technologies on websites**

</div>

---

## 🎯 Overview

Scrapfly Security Detection is a Manifest V3 Chrome extension that helps security researchers, web developers, and bot detection enthusiasts identify and analyze:

- **CAPTCHAs**: reCAPTCHA, hCaptcha, FunCaptcha, GeeTest
- **Anti-bot systems**: Cloudflare, Akamai, DataDome, PerimeterX, Shape Security, AWS WAF, and more
- **Fingerprinting techniques**: Canvas, WebGL, Audio, Font, WebRTC, and other browser fingerprinting methods
<p align="center">
  <img src="https://github.com/user-attachments/assets/905a0e70-98d6-492d-a8ef-0f769b5f262b" width="406" />
</p>
<p align="center">
<img src="https://github.com/user-attachments/assets/5ec8a24a-3fd4-4359-b71b-0427b11d65ff" width="406" />
  </p>
<p align="center">
    <img src="https://github.com/user-attachments/assets/978b844f-2c97-4aed-a086-30ac9f5dac91" width="406" />
  <img src="https://github.com/user-attachments/assets/a45b01df-aa35-4b60-be6c-7f6d9713adbe" width="406" />
</p>
<p align="center">
  <img src="https://github.com/user-attachments/assets/2d473f6d-b035-4dd9-8ce6-94d014563c45" width="406" />
  <img src="https://github.com/user-attachments/assets/1cfb3a94-7bee-4081-9eb8-a143437b30c9" width="406" />
</p>
<p align="center">
  <img src="https://github.com/user-attachments/assets/4c4f8449-c831-494a-a5b4-fff61eabed1d" width="406" />
  <img src="https://github.com/user-attachments/assets/985a34af-e29b-4f47-bd48-5c70fa0816fe" width="406" />
</p>


## ✨ Features

### 🔍 **Multi-Layer Detection System**

- **DOM Analysis**: Detects scripts, classes, and HTML elements
- **Network Monitoring**: Analyzes cookies, headers, and URLs
- **JavaScript Hooks**: Intercepts fingerprinting API calls (Canvas, WebGL, Audio, etc.)
- **Window Properties**: Checks for anti-bot objects in the global scope
- **CSS Detection**: Identifies protection-specific stylesheets

### 🎨 **Modern UI**

- **Real-time Detection**: Live detection results with confidence scores
- **Detection History**: Track detected systems across browsing sessions
- **Advanced Capture Tools**: Specialized tools for reCAPTCHA, Akamai, Imperva, Shape Security, and AWS WAF
- **Intermediate Page Handling**: Automatically captures data from challenge pages before redirect (AWS WAF, Shape Security)
- **Rules Editor**: Customize and manage detection rules
- **Settings Panel**: Configure cache duration, history limits, and URL blacklists

### ⚡ **Performance Optimized**

- **Smart Caching**: 12-hour detection cache to reduce overhead
- **Pattern Caching**: LRU cache for compiled regex patterns (60-80% faster)
- **Early Exit**: Stops detection after finding high-confidence matches
- **Lazy Evaluation**: On-demand data collection
- **Batched Operations**: Optimized DOM traversal and storage writes

### 🛡️ **Privacy & Security**

- **No Data Collection**: All detection happens locally in your browser
- **CSP Compliant**: No inline event handlers or unsafe-eval
- **Context Isolation**: Proper separation between page and extension contexts
- **Safe Conditions**: Pre-compiled evaluators (no eval/arbitrary code execution)

## 📦 Installation

### From Chrome Web Store
*Coming soon...*

### Manual Installation (Developer Mode)

1. **Download the Extension**
   ```bash
   git clone https://github.com/diegopzz/Antibot-Detector.git
   cd Antibot-Detector/core
   ```

2. **Load in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable **Developer mode** (top-right toggle)
   - Click **Load unpacked**
   - Select the `core/` folder

3. **Start Detecting**
   - Click the extension icon in your toolbar
   - Browse to any website
   - View detected security systems in the popup

## 🚀 Usage

### Basic Detection

1. **Navigate to a Website**: The extension automatically scans pages
2. **Open Popup**: Click the extension icon to view results
3. **View Details**: Click on any detection card to see full details
4. **Copy Results**: Use the copy button to export detection data

### Advanced Capture Tools

#### reCAPTCHA
- Start Capture
- Obtain Selector
- Extract SiteKey
- ReCaptcha CallBack
  
#### Akamai
- Start Capture
- Extract Sensor Data

#### Imperva
- Check Cookies
- Analyze Scripts
- Start Capture

#### Shape Security
- Check Headers
- Analyze Scripts
- Start Capturing

#### AWS WAF
- Check Cookies
- Analyze Scripts

### Rules Editor

1. **Browse Detectors**: View all detection rules by category
2. **Edit Rules**: Modify detection patterns, confidence scores, and settings
3. **Add Methods**: Create new detection methods (Cookie, Header, URL, Content, DOM, Window, JS Hooks, CSS)
4. **Pattern Options**: Configure regex, whole-word, and case-sensitive matching
5. **Import/Export**: Share rules via JSON files

### Settings

- **Cache Duration**: Set detection cache expiry (1-24 hours)
- **History Limit**: Control max history items (10-500)
- **URL Blacklist**: Exclude specific domains from detection
- **Auto-cleanup**: Automatic history expiration

## 🏗️ Architecture

### Project Structure

```
core/
├── manifest.json              # Extension configuration (Manifest V3)
├── background.js              # Service worker (message handling, detection)
├── content.js                 # Content script (page data collection)
├── content-main-world.js      # JS hooks installer (MAIN world)
├── popup.js/html/css          # Extension popup UI
│
├── detectors/                 # JSON detector definitions
│   ├── antibot/              # Cloudflare, Akamai, DataDome, etc.
│   ├── captcha/              # reCAPTCHA, hCaptcha, etc.
│   ├── fingerprint/          # Canvas, WebGL, Audio, etc.
│   └── index.json            # Category configuration
│
├── modules/                   # Core managers (singleton pattern)
│   ├── detection-engine-manager.js    # Detection orchestration
│   ├── detector-manager.js            # Detector CRUD operations
│   ├── category-manager.js            # Category metadata
│   ├── confidence-manager.js          # Confidence calculations
│   ├── notification-manager.js        # Toast notifications
│   ├── pagination-manager.js          # Pagination component
│   ├── color-manager.js               # Color picker UI
│   └── search-manager.js              # Advanced search
│
├── sections/                  # UI sections (modular architecture)
│   ├── detection/            # Detection results tab
│   ├── history/              # Detection history tab
│   ├── rules/                # Detector rules editor
│   ├── settings/             # Settings & configuration
│   └── advanced/             # Advanced capture tools
│       ├── base-interceptor-helpers.js    # Service worker utilities
│       ├── advanced-utils.js              # Popup UI utilities
│       ├── base-advanced-module.js        # Base class for modules
│       └── modules/                        # Detector-specific tools
│           ├── recaptcha/
│           ├── akamai/
│           ├── imperva/
│           ├── shapesecurity/
│           └── awswaf/
│
└── utils/                     # Utility functions
    ├── utils.js              # Core utilities
    └── debug.js              # Debug logging
```

### Detection Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. Page Load                                                │
│     └─> content.js injects content-main-world.js             │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  2. Data Collection (content.js)                             │
│     └─> DetectionEngineManager.collectPageData()            │
│         • DOM elements, scripts, classes                     │
│         • Cookies, headers (via background.js)               │
│         • Window properties (via MAIN world)                 │
│         • JS hooks (via MAIN world)                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  3. Detection (background.js)                                │
│     └─> DetectionEngineManager.detectOnPage()               │
│         • Pattern matching against detectors                 │
│         • Confidence score calculation                       │
│         • Results aggregation                                │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  4. Storage & Display                                        │
│     └─> Cache results (12-hour expiry)                      │
│     └─> Update popup UI with detections                     │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Patterns

- **Singleton Managers**: DetectorManager, CategoryManager for centralized state
- **Event-Driven Communication**: postMessage for MAIN ↔ ISOLATED world communication
- **Modular Sections**: Each UI section is self-contained (JS + HTML + CSS)
- **JSON-Driven Detectors**: All detection rules stored in JSON for easy updates
- **LRU Caching**: Pattern cache, URL hash cache for performance
- **Observer Pattern**: Real-time updates via Chrome extension messaging

## 🔧 Development

### Prerequisites

- Google Chrome (latest version)
- Basic understanding of:
  - Chrome Extension APIs (Manifest V3)
  - JavaScript (ES6+)
  - HTML/CSS
  - Content Script isolation

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/diegopzz/Antibot-Detector.git
cd Antibot-Detector/core

# Load extension in Chrome
# 1. Go to chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select the core/ folder
```

### Development Workflow

1. **Make Changes**: Edit files in `core/`
2. **Reload Extension**: Click reload button in `chrome://extensions/`
3. **Test**: Browse to test websites
4. **Debug**:
   - **Popup**: Right-click extension icon → Inspect popup
   - **Background**: Service worker link in chrome://extensions/
   - **Content Script**: Regular DevTools on any webpage

### Adding a New Detector

1. **Create JSON File**: `detectors/[category]/[name].json`
   ```json
   {
     "id": "my-detector",
     "name": "My Detector",
     "category": "Anti-Bot",
     "color": "#3B82F6",
     "confidence": 85,
     "lastUpdated": "2025-01-15",
     "version": "1.0.0",
     "icon": "my-detector.png",
     "description": "My custom security system detector",
     "detection": {
       "cookie": [
         {
           "name": "__my_cookie",
           "confidence": 90,
           "description": "Main tracking cookie"
         }
       ],
       "content": [
         {
           "content": "my-security-script.js",
           "confidence": 80,
           "description": "Security script identifier"
         }
       ],
       "url": [
         {
           "pattern": "/security/challenge",
           "confidence": 85
         }
       ]
     }
   }
   ```

2. **Test Detection**: Reload extension and visit test page
3. **Adjust Confidence**: Fine-tune based on false positive rate

### Project Guidelines

- **File Naming**: Always use lowercase kebab-case (e.g., `detector-manager.js`)
- **No Build System**: Pure JavaScript/HTML/CSS (no transpilation)
- **CSP Compliance**: No inline event handlers or unsafe-eval
- **Code Style**: ES6+ features, clear variable names, comprehensive comments
- **Performance**: Use caching, lazy evaluation, early exit patterns

## 📊 Performance Metrics

The extension has been extensively optimized across 8 phases:

- **Detection Speed**: 60-80% faster than baseline
- **Memory Usage**: 50-70% reduction
- **Pattern Matching**: 60-80% faster with LRU cache
- **DOM Operations**: 60-70% faster with single-pass tree walk
- **Network Fetching**: 5-10x faster with parallel requests
- **Cache Hit Rate**: ~80% on typical browsing patterns

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

### Adding New Detectors

1. Fork the repository
2. Create a new detector JSON file
3. Test thoroughly on multiple websites
4. Submit a pull request with:
   - Detector JSON file
   - Test cases (URLs where it works)
   - Confidence score justification

### Bug Reports

Please include:
- Chrome version
- Extension version
- Steps to reproduce
- Expected vs actual behavior
- Console logs (if applicable)

### Feature Requests

Open an issue with:
- Use case description
- Proposed solution
- Alternative approaches considered

## 📜 License

This project is licensed under the **Non-Profit Open Software License 3.0 (NPOSL-3.0)**.

Copyright (c) 2025 Scrapfly

### Key Terms

- ✅ **Free to use** for personal and non-profit purposes
- ✅ **Modify and distribute** with attribution
- ✅ **Create derivative works** under the same license
- ✅ **Patent protection** for contributors
- ❌ **Commercial use requires** separate licensing

### Full License

See the [LICENSE](LICENSE) file for complete terms and conditions.

---

<div align="center">


![License](https://img.shields.io/badge/License-NPOSL--3.0-blue?style=for-the-badge)

</div>
