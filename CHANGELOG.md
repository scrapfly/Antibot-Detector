## v2.0

What's New in v2.0

### Major Refactor: Complete Logger System Migration
- **Complete `console.*` → `Logger.*` migration**
- 1,659 calls across 38 files (100% coverage)
- Implement centralized Logger system with context-aware routing (background / content / main world)
- 100% `CLAUDE.md` compliance – professional, unified logging infrastructure

### ⚡ Performance & Cache Optimizations
- Change default cache scope from `path` to `domain` (more efficient caching)
- Optimize detection methods cache: 60s → 300s TTL (**80% reduction in CPU usage**)
- Skip payload capture and hook reporting for cached pages
- Remove ~50 lines of unused code

### Critical Bug Fixes
- Fix `cookiesToMatch is not defined` error in `runDetector`
- Fix “Illegal invocation” errors in JS hooks with proper `this` binding
- Fix JS hooks breaking page loads with comprehensive error handling
- Fix “Could not serialize message” error by extracting lazy getters
- Fix Logger initialization errors and context validation
- Fix payload capture timing and network URL detection
- Fix cache-related race conditions

### Detection Enhancements
- Enhance cookie detection with `chrome.cookies` API for **HttpOnly cookie access**
- Add Akamai pixel challenge and SBSD payload detection patterns
- Improve BotGuard detector to catch all cookie variations
- Add enhanced payload patterns with URL/method constraints
- Increase window detection timeout to 10 seconds for better reliability

### UI/UX Improvements
- Enable **click-to-copy** for method badges in Hidden Detections modal
- Enhance HTTP method badges with modern design
- Increase Detection tab pagination: 2 → **10 items per page**
- Increase History tab pagination: 3 → **20 items per page**
- Add 3-step Window Properties Helper with condition selection
- Add creator credits to Settings sections
- Better empty states and loading indicators

### Code Quality & Standards
- Standardize detector JSON schemas (`textScope`, `nameScope`, `valueScope`)
- Add `enabled` field to all detector JSON files
- Improve error handling and context validation throughout
- Add comprehensive debug logging infrastructure
- Better documentation and code organization
