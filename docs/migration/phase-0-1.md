# Phase 0 + 1 Migration Note

## Purpose
- Establish migration guardrails and core module scaffolding for later ES module runtime entrypoint work.
- Keep all runtime behavior unchanged while preparing import-safe adapters.

## What Was Added
- Contract baseline documentation:
  - `docs/contracts.md`
- Coupling audit tooling:
  - `scripts/check-global-coupling.ps1`
  - `scripts/reports/README.md`
- Core ESM adapter modules:
  - `modules/core/logger.module.js`
  - `modules/core/storage-manager.module.js`
  - `modules/core/badge-constants.module.js`
  - `modules/core/update-manager.module.js`
- Core global exposure hardening:
  - `modules/core/storage-manager.js` now guarantees `globalThis.StorageManager`.
  - `modules/core/update-manager.js` now guarantees `globalThis.UpdateManager`.

## What Was Intentionally Not Changed
- No popup loader order/runtime entrypoint changes.
- No background `importScripts` replacement.
- No manifest background module-type switch.
- No content bootstrap/dynamic import conversion.
- No message/storage/badge contract changes.

## Why This Is Safe
- Adapter modules are additive and not wired as runtime entrypoints yet.
- Legacy globals remain available to existing code paths.
- Validation gates catch syntax and duplicate-definition regressions.

## Dependency for Next Phase
- Phase 2 (popup module entrypoint) should consume `modules/core/*.module.js` first, then migrate section registries from global patching to explicit imports.
