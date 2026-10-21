# Extension ownership

The extension uses classic JavaScript scripts with no build step. Four lists are
its dependency graph: `background.js` (the service worker's `importScripts()`),
`popup.html` (the popup), `sections/stats/stats.html` (the Statistics page, a
separate tab opened from Settings → Data) and `manifest.json` (the content
scripts). Register a new dependency before its consumers in every context that
uses it. `test/load-order.test.js` checks these boundaries, and names the shared
modules whose users it traces.

| Directory | Responsibility |
| --- | --- |
| `background/` | Worker initialization, tab/document sessions, caches, scan finalization, History recording, retention (auto-delete, clear on close, the fingerprinting-only clock), scheduled backups, the watchlist (`history-watch.js`), the scan report, and message handlers |
| `background/handlers/` | The worker's message handlers, assembled by `router-registry.js`; History, backups, the watchlist and Settings register their own through `registerHandlers()` |
| `background/advanced/` | Capture jobs, listeners, deadlines, page notices, script analyses, and the single Advanced history writer |
| `background/advanced/vendors/` | Vendor-specific capture and extraction implementations (`<vendor>/interceptor.js`) |
| `modules/core/` | Shared, dependency-light modules used by several contexts: the message registries (`bridge-protocol.js`, `worker-messages.js`, `message-types.js`), categories, logging, i18n, storage and History (`storage-manager.js`, `history-store.js`, `history-policy.js`, `history-export.js`, `history-filter.js`), the site lists (`domain-list.js`, `scan-scope.js`), the webhook (`webhook-body.js`, `webhook-filter.js`, `webhook-log.js`), capture retention, rule translation plans, constants |
| `modules/advanced/` | Vendor identities and names (`vendor-registry.js`), the data-driven CAPTCHA vendors (`captcha-vendors.js`), structured result records, and the popup history client |
| `modules/detection/conditions/` | Window-condition grammar and evaluator (the evaluator also loads in the page's MAIN world) |
| `modules/detection/rules/` | Rule validation, historical migrations, detector persistence (`detector-manager.js`), and official updates |
| `modules/detection/engine/` | Evidence collection and matching, the detection cache (`detection-engine-manager.js`: stored results, bypass for watchlist checks, hooks-off marking, the cache-hit path that serves the badge, the webhook and History) |
| `modules/detection/hooks/` | Hook resilience and window-property polling, loaded in the page's MAIN world; the hook wrappers themselves are installed by `content-main-world.js` |
| `modules/detection/managers/` | Category and confidence state |
| `modules/settings/` | Settings runtime (`settings-runtime.js`, the webhook request builder, every context), serialized worker mutations (`settings-store.js`: merge, patch, reset, site lists), portable settings transfer, and the Settings → Data modules (`backup-bundle.js`, `diagnostics-report.js`, `settings-presets.js`, `storage-overview.js`, popup only) and the webhook delivery runtime (`webhook-runtime.js`, worker only) |
| `modules/integrations/scrapfly/` | Export options, API parameters, code generation, AI export, and its dialog |
| `modules/ui/` | Shared widgets (notifications, modal focus, close buttons, pagination); the notification manager also loads in the worker |
| `utils/` | Helpers used by the worker, the popup and the content script (`utils.js`, `format-utils.js`, `detection-utils.js`, `url-utils.js`, `page-cookies.js`); they read `Categories`, so that module loads before them everywhere |
| `sections/` | Popup controllers, templates, rendering, and feature styles: one folder per popup tab (detection, history, rules, advanced), plus `settings/` (a modal opened from the popup, with `default-settings.json` as the defaults' single source and `settings-ui-<feature>.js` extensions of `SettingsUI`) and `stats/` (the standalone Statistics page) |
| `sections/advanced/` | Two layers. The tab's own controller: `advanced.js` (`class Advanced`) with its `Advanced.prototype` mixins `advanced-runtime.js`, `advanced-tools.js`, `advanced-modals.js`, `history/controller.js` and `history/view.js`. The vendor tools' base: `base-advanced-module.js` (`BaseAdvancedModule`), extended by `components/` (tool grid, dialogs, cookie and script results, site-key probe and view, the code generator dialog) and `history/module-history.js`; `runtime/tool-client.js` is the popup's transport to the worker's capture jobs; `advanced-utils.js` holds popup-side helpers |
| `sections/advanced/vendors/` | Vendor popup actions, views, lifecycle, and code generators (`module.js`, `view.js`, `actions.js`, some with `generators.js`/`lifecycle.js`); `captcha/module.js` builds the data-driven CAPTCHA tools |
| `sections/advanced/vendors/cloudflare/` | Cloudflare tools and the shared Turnstile site-key helpers (used by the Turnstile module and the site-key view) |
| `sections/rules/` | The Rules tab: `rules-*.js` mixins of `class Rules`, `modals/` (icon picker, method help), `helpers/`, `styles/` |
| `background/advanced/vendors/recaptcha/lib/` | Vendored reCAPTCHA decoding libraries (worker side, used by the reCAPTCHA interceptor) |

Shared styling stays under `modules/styles/` (the Scrapfly integration keeps its
own `dialog.css` beside its code); feature styles live beside their sections.
Keep the existing stylesheet order: later theme and scroll rules intentionally
override earlier rules.

## Message types

Every message type is written once, by family, and used by name (a literal that
spells one is caught by a test):

- `ScrapflyBridgeProtocol.MESSAGE_TYPES` (`modules/core/bridge-protocol.js`):
  the page bridge, MAIN world ↔ ISOLATED world ↔ worker, and its shared keys.
  `test/bridge-protocol-guard.test.js` pins that the MAIN world spells only one
  protocol string.
- `WorkerMessages` (`modules/core/worker-messages.js`): what the popup, the
  Statistics page and the content script send to the worker, and what the
  worker sends back (detection, caches, settings, rules, the webhook record,
  logging). `test/worker-messages.test.js` fails on a literal copy and checks
  the registry loads before its users in every context.
- `AdvancedMessageTypes` (`modules/core/message-types.js`): the Advanced tools'
  capture jobs.
- `HistoryStore.Messages`, `HistoryBackup.Messages`, `HistoryWatch.Messages`:
  History's own operations, owned by those modules.

## Execution boundaries

The MAIN-world scripts share the page's JavaScript environment. They receive a
frozen protocol through the authenticated bridge; do not load shared extension
globals into that world (`test/load-order.test.js` forbids `modules/core` and
`modules/settings` there), and add no new page-visible globals beyond the ones
`bridge-protocol.js` lists. `PublicDetectionSummary` projects page-facing events
in the isolated world, keeping raw cookie, header, and payload evidence inside
the extension.

The worker owns settings and History mutations. Popup clients send operations
instead of writing a stale snapshot. Settings edits carry their baseline and
candidate so unrelated concurrent changes survive. Ordinary settings changes
wait for Save; language, theme, "skip/scan this site" from the Detection and
History tabs, Reset and the log collector switch apply immediately. Portable
imports preserve the integration connections (webhook, sharing, the signing
secret) already stored in the current browser.

Each detection session owns its timers and keepalive operation. Asynchronous
work checks session and document identity before completing a scan, updating
the badge, or cleaning up. A site that is skipped, or left out in "only these
sites" mode, is never scanned on request and keeps nothing from a scan that
began before it was excluded. Advanced jobs have independent vendor/tab/operation
identities; closing the popup does not end a worker job.

Advanced history accepts existing records and versioned structured tool results.
Capture-specific extraction remains in vendor modules, while script analyses
share a bounded lifecycle. Keep vendor timeouts and stored formats compatible.

## Verification and release preparation

Run `npm run verify` after changing the graph. The browser checks (Playwright
and its Chromium) are `npm run e2e:methods`, `e2e:settings`, `e2e:editor`,
`e2e:updater`, `e2e:refactor`, `e2e:settings-modal`, `e2e:history` (every
History option), `e2e:languages` (every interface language), `e2e:data`,
`e2e:scope`, `e2e:webhook`, `e2e:hooks` and `e2e:translate`; `e2e:live` needs
the network and is not part of the release checks.

Work that is not released yet stays in `CHANGELOG.md`, under the version being
prepared, until publication is authorized. Creating a tag triggers release/store
workflows, so local preparation must not create or push a release tag.
