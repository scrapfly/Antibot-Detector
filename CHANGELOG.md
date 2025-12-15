## v2.2

What's New in v2.2

### Fingerprint Detection Changes
- **Disable all 21 fingerprint detectors by default** - Users can enable individually in Settings
- Add `fingerprintEnabled` check for inline hooks - Respects detector enabled state
- Skip disabled detectors entirely when building hook definitions

### Bug Fixes
- **Fix Shape Security false positives** (GitHub issue #4) - Add regex anchors to header patterns
- Add missing `exists` condition to CONDITION_EVALUATORS for window properties
- Fix window property detection when using "exists" condition from UI

### Code Cleanup
- Remove sessionStorage usage for debug mode (chrome.storage only)
- Remove sessionStorage usage for cache cleared flag
- Simplify cache hit detection flow

### New Features
- Add update-manager.js module for checking detector updates
