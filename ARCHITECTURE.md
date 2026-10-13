# Extension ownership

The extension uses classic JavaScript scripts with no build step. The lists in
`background.js`, `popup.html`, and `manifest.json` are its dependency graph.
Register a new dependency before its consumers in every context that uses it.
`test/load-order.test.js` checks these boundaries.

| Directory | Responsibility |
| --- | --- |
| `background/` | Worker initialization, tab/document sessions, caches, History recording, and message handlers |
| `background/advanced/` | Capture jobs, listeners, deadlines, page notices, and the single Advanced history writer |
| `background/advanced/vendors/` | Vendor-specific capture and extraction implementations |
| `modules/advanced/` | Vendor identities, structured result records, and the popup history client |
| `modules/detection/conditions/` | Window-condition grammar and evaluator |
| `modules/detection/rules/` | Rule validation, historical migrations, detector persistence, and official updates |
| `modules/detection/engine/` | Evidence collection and matching |
| `modules/detection/hooks/` | Page hook instrumentation and resilience |
| `modules/settings/` | Settings runtime, serialized worker mutations, and portable settings transfer |
| `modules/integrations/scrapfly/` | Export options, API parameters, code generation, AI export, and its dialog |
| `sections/` | Popup controllers, templates, rendering, and feature styles |
| `sections/advanced/vendors/` | Vendor popup actions, views, lifecycle, and code generators |
| `sections/advanced/vendors/cloudflare/` | Cloudflare tools and shared Turnstile site-key helpers |
| `vendor/recaptcha/` | Vendored reCAPTCHA decoding libraries |

Shared styling stays under `modules/styles/`; feature styles live beside their
sections. Keep the existing stylesheet order: later theme and scroll rules
intentionally override earlier rules.

## Execution boundaries

The MAIN-world scripts share the page's JavaScript environment. They receive a
frozen protocol through the authenticated bridge; do not load shared extension
globals into that world. `modules/core/bridge-protocol.js` defines that protocol.
`PublicDetectionSummary` projects page-facing events in the isolated world,
keeping raw cookie, header, and payload evidence inside the extension.

The worker owns settings and History mutations. Popup clients send operations
instead of writing a stale snapshot. Settings edits carry their baseline and
candidate so unrelated concurrent changes survive. Ordinary settings changes
wait for Save; language and theme apply immediately. Portable imports preserve
the integration connections already stored in the current browser.

Each detection session owns its timers and keepalive operation. Asynchronous
work checks session and document identity before completing a scan, updating
the badge, or cleaning up. Advanced jobs have independent vendor/tab/operation
identities; closing the popup does not end a worker job.

Advanced history accepts existing records and versioned structured tool results.
Capture-specific extraction remains in vendor modules, while script analyses
share a bounded lifecycle. Keep vendor timeouts and stored formats compatible.

## Verification and release preparation

Run `npm run verify` after changing the graph. Deterministic Chromium checks are
`npm run e2e:methods`, `npm run e2e:settings`, `npm run e2e:editor`, and
`npm run e2e:updater`. Popup regressions are `npm run e2e:refactor` and
`npm run e2e:settings-modal`. These require Playwright and its Chromium browser.

The local 2.8.6 candidate is unreleased. Its user-visible changes stay under
`Unreleased` in `CHANGELOG.md` until publication is authorized. Creating a tag
triggers release/store workflows, so local preparation must not create or push
a release tag.
