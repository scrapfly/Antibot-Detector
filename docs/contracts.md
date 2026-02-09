# Contracts Baseline (Phase 0)

## No-Behavior-Change Constraint
- This migration phase is architecture scaffolding only.
- No user-visible behavior changes are allowed.
- Existing message contracts, storage schema/keys, badge semantics, and runtime globals must remain stable.

## Migration Constraints
- Keep current runtime loader model unchanged in this phase:
  - Popup: classic ordered `<script>` tags.
  - Background: `importScripts(...)`.
  - Content scripts: current manifest entries and execution model.
- No manifest background module-type switch in this phase.
- No schema or detector JSON contract migrations.

## Runtime Message Contracts (Immutable in this phase)

### Core message types (must remain exact strings)
- `GET_DETECTION_DATA`
- `REQUEST_DETECTION`
- `DETECTION_DATA`
- `DETECTION_PROGRESS`
- `NEW_DETECTION_DATA`
- `EXTENSION_TOGGLE_CHANGED`
- `PAGE_LOAD_NOTIFICATION`
- `RELOAD_DETECTORS`
- `DETECTION_CLEAR_CACHE`
- `DETECTION_ERROR`

### Advanced/capture message families (must remain stable)
- `<MODULE>_START_CAPTURE`
- `<MODULE>_STOP_CAPTURE`
- `<MODULE>_GET_CAPTURE_STATE`
- `<MODULE>_GET_CAPTURE_HISTORY`
- `<MODULE>_CLEAR_CAPTURE_HISTORY`

### Response shape invariants
- `GET_DETECTION_DATA`:
  - `{ status: 'ok', data: <DetectionPayload> }`
  - `{ status: 'pending', progress?: <ProgressPayload>, data?: <DetectionPayload> }`
  - `{ status: 'interrupted' }`
  - `{ status: 'error', error: <string> }`
- Generic command responses:
  - `{ status: 'success' | 'ok' }`
  - `{ status: 'error', error: <string> }`

## Storage Contracts (Immutable keys)
- `scrapfly_enabled`
- `scrapfly_settings`
- `scrapfly_detectors`
- `scrapfly_categories`
- `scrapfly_detection_storage`
- `scrapfly_detection_state`
- `scrapfly_detection_states`
- `scrapfly_history`
- `scrapfly_advanced_history`
- `scrapfly_js_hook_detections`
- `scrapfly_collected_logs`
- `scrapfly_log_collector_enabled`
- `scrapfly_log_collector_max`
- `scrapfly_pending_updates`
- `scrapfly_incompatible_updates`
- `scrapfly_last_update_check`
- `scrapfly_update_errors`
- `scrapfly_cache_*` (scoped cache keys)

## Badge Semantics (Immutable in this phase)
- `BADGE.TEXT.DISABLED` indicates extension disabled.
- `BADGE.TEXT.LOADING` indicates active detection in progress.
- `BADGE.TEXT.CLEARED` indicates cache-cleared reload-needed state.
- `BADGE.TEXT.INTERRUPTED` indicates interrupted/reload-needed state.
- Detection count badges and color thresholds (`LOW`, `MEDIUM`, `HIGH`) remain unchanged.

## Compatibility Globals (Required During Migration)
- `globalThis.Logger`
- `globalThis.StorageManager`
- `globalThis.BADGE`
- `globalThis.getBadgeColorForCount`
- `globalThis.setBadge`
- `globalThis.clearBadge`
- `globalThis.UpdateManager`
- Section compatibility surfaces remain:
  - `window.Settings`
  - `window.Rules`
  - `window.Detection`
