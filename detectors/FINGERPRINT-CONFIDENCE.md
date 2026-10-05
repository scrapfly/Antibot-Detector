# Fingerprint evidence weights

Reviewed 2026-10-02 for all 21 definitions; combination tiers re-checked 2026-10-05 against the v1.2.0 JSON. Confidence means strength of evidence
that a page is fingerprinting. These numbers are conservative engineering weights,
not measured probabilities. There is no labeled sample or base-rate measurement
supporting a claim that a particular API call is fingerprinting X% of the time.

A detector scores the **maximum** of its standalone matches and its satisfied
combinations. Every detector now has graded combinations; single rules stay at
30 or below, so only co-occurring accesses reach the higher tiers. Repeated
calls do not complete a profile. These hooks report one access per target, without examining
arguments, results, canvas contents, call counts, or what the page does with data.
Thus even a sensitive API call cannot establish identification or tracking intent.

## Rubric

- API availability: no evidence of page activity; remove these window rules.
- 5–10: routine application infrastructure or permission-based user functionality.
- 15–30: a potentially identifying attribute or operation with common benign uses.
- 35–50: enumeration, hardware detail or rendered-data extraction; still ambiguous
  without observing arguments, a sequence, or an identifying use of the result.
- Script references: 5–20, weaker than observed access. Comments, unused library
  code and feature checks can match. Generic words receive the lowest weight.
- No current single-call rule exceeds 30. High confidence needs additional evidence
  this engine does not observe. Disabled hooks are reviewed too, so enabling one
  later does not restore an unjustified score.

Weights are intentionally coarse. A five-point difference is a judgment about
signal specificity, not a measured difference in accuracy. Information entropy
and proof of fingerprinting intent are different properties.

## Combination tiers

Combinations are defined in each JSON file (`combinations`) and scored by
`DetectionCombinations`. Semantic pattern IDs keep references stable when rules
are reordered. The table lists the strongest tier and the lower ones.

| Detector | Strongest combination | Score | Lower tiers |
| --- | --- | --- | --- |
| Audio | Offline rendering, oscillator, compressor and sample APIs | 65 | 60, 50, 40, 30 |
| Battery | Battery request with status and time-property reads (intent unconfirmed) | 35 | 30, 15 |
| Canvas | Characteristic test-text source with drawing, path-test and export APIs | 70 | 60, 55, 50, 40 |
| Clipboard | Clipboard read and write methods called (access and intent unconfirmed) | 15 | 10, 10 |
| Crypto | Random-value and digest methods called (inputs and intent unconfirmed) | 15 | 10 |
| CSS | CSS declaration names, values and priorities accessed | 30 | 20, 15 |
| Font | Font-set iteration, availability checks and text metrics | 55 | 40, 30, 15 |
| Gamepads | Gamepad identity, mapping and control-array access | 45 | 35, 30 |
| Geolocation | Location updates with horizontal, altitude and motion access | 40 | 35, 25 |
| Hardware | CPU, memory, and touch capability reads | 65 | 50, 35, 15 |
| IndexedDB | Enumeration with opening and transactions | 30 | 25, 15, 10 |
| Media | Battery access with voice, codec and plugin or MIME observations | 55 | 45, 35, 30 |
| Navigator | Automation, client hints, compute capabilities, and language preference reads | 75 | 65, 60, 50, 30, 15 |
| Device Orientation | Orientation and motion event names referenced in scripts; collection unconfirmed | 15 | 10 |
| Performance | Memory statistics, timestamps and performance entries accessed; intent unconfirmed | 30 | 25, 20, 15, 15 |
| Screen | Reads screen geometry, color depth and pixel ratio | 50 | 35, 35, 25, 15 |
| Web Storage | Storage key lookup with reads and writes | 25 | 20, 15, 10 |
| Timezone/Intl | Reads formatter options and date offset with locale comparison | 35 | 25, 25, 15 |
| USB | USB enumeration with model and serial identity reads | 50 | 40, 30 |
| WebGL | WebGL capabilities, numeric precision and pixel readback | 65 | 65, 55, 55, 45, 45, 30, 30 |
| WebRTC | Device enumeration with peer setup and candidate address access | 60 | 50, 40, 20 |

The highest tiers (65–75) need three or more distinct accesses, for example
automation flag, client hints and CPU/memory reads together. Profiles built only
from script references stay at 10–15.

Combinations observe co-occurrence on the page, not a sequence within one script.
Different libraries may supply the calls, and legitimate applications can match.
Scores stay moderate for that reason. Missing or unsupported APIs prevent a
combination from completing, reducing recall; these profiles do not cover every
fingerprinting implementation (for example, WebGL1-only readback). Font metrics
are correlated with measurement, so that combination stays at 40.

## Audit by detector

The JSON files carry the exact per-rule values. Ranges below include disabled hooks.

| Detector | Hook scores | Script scores | Reason |
| --- | --- | --- | --- |
| Audio | 5–30 | 5–10 | Channel data may expose rendering differences; visualizers and synthesis are normal audio uses. |
| Battery | 5–25 | 5–10 | Battery state can contribute to identification; battery-aware behavior also reads it. |
| Canvas | 5–30 | 5–10 | Pixel reads and export expose rendering; editors, charts and text layout use the same methods. |
| Clipboard | 5 | 5 | Copy and paste operate on user content; access alone gives almost no evidence of device identification. |
| Crypto | 5–10 | 5 | Random generation is ordinary security infrastructure; hashing may process any application data. |
| CSS | 5–10 | 5–10 | Feature checks and style reads are normal layout behavior; no probe sequence is observed. |
| Font | 10–15 | 10 | Text widths and font-set access also support layout/loading; font enumeration is unconfirmed. |
| Gamepads | 5–20 | 5–10 | Device enumeration may expose hardware; games need it too. |
| Geolocation | 5–10 | 5 | Permission-based location functionality does not establish fingerprinting intent. |
| Hardware | 15–25 | 10 | Core count and memory directly expose device characteristics, also used for adaptive workloads. |
| IndexedDB | 5–20 | 5–10 | Opening/transactions are ordinary persistence; database enumeration is somewhat more specific. |
| Media | 10–20 | 10 | Plugin/MIME counts expose capabilities; speech access and playback checks have common functional uses. |
| Navigator | 5–30 | 10 | User agent/languages support compatibility/localization; automation and high-entropy hints are more specific. |
| Orientation | — | 5–10 | Only weak script references remain; the generic listener hook cannot identify sensor events. |
| Performance | 5–15 | 5–10 | Timers and resource metrics support animation and monitoring; memory exposes some device information. |
| Screen | 5–20 | 10 | Dimensions/pixel ratio support responsive layout; color depth is a more identifying characteristic. |
| Storage | 5–10 | 5 | Preferences, sessions and offline applications use storage; no identifier or respawning is inspected. |
| Timezone | 5–20 | 10 | Resolved options expose locale/timezone; string comparison is ordinary localization. |
| USB | 5–25 | 5–10 | Device enumeration may contribute identifying details; selecting a device is normal user functionality. |
| WebGL | 5–25 | 10 | Extension/parameter queries and pixel reads can expose graphics differences; rendering libraries also use them. |
| WebRTC | 10–25 | 10 | Candidate addresses are more identifying; offers, channels and device selection also enable calls. |

## Rules removed or corrected

- Remove all 20 built-in `window` checks. Merely finding `Intl`, storage,
  navigator properties or a sensor constructor does not mean a page accessed it.
  Setting confidence to zero would not fix this: some consumers use `value || 80`.
- Remove the three `EventTarget.prototype.addEventListener` rules in Battery,
  Gamepads and Orientation. `windowPath` supplies a fallback receiver, not an
  event-type or receiver filter; a click listener was sufficient to report all three.
- Correct WebUSB to `USB.prototype.getDevices` and `USB.prototype.requestDevice`,
  with `navigator.usb` as receiver. These are instance methods, not static methods.
- Match scores for targets shared between detectors, including text measurements,
  battery status, CPU cores and memory. The same observation is not stronger merely
  because another detector names it.

## Sources and limits

[Privacy Working Group fingerprinting guidance](https://www.w3.org/TR/fingerprinting-guidance/)
defines identification/re-identification and describes multiple fingerprinting
surfaces. A surface's availability does not establish that a site uses it to identify
visitors. This distinction underlies the rubric; the document does not specify scores.

[Englehardt and Narayanan's measurement study](https://cyberlaw.stanford.edu/content/files/publications/openwpm_1_million_site_tracking_measurement.pdf)
uses multiple behavioral criteria for canvas classification and repeated font
measurements. The extension's unqualified single-call hooks do not implement those
classifiers, so their reported precision cannot be transferred to these rules.

[Web Audio specification](https://webaudio.github.io/web-audio-api/)
documents audio processing and visualization uses.
[Khronos renderer-info specification](https://registry.khronos.org/webgl/extensions/WEBGL_debug_renderer_info/)
describes the specific extension exposing renderer/vendor details. A generic
`getExtension` hook does not tell us which extension was requested.

To obtain empirical probabilities, label fingerprinting and benign scripts from
a representative population, observe the actual probe behavior, and validate on
held-out samples. Record precision, recall, sample sizes and population before
replacing the heuristic weights.

## Apply and verify

Fresh extension storage loads the bundled definitions. Existing installations
keep stored rules when the extension reloads; Rules → Update fetches definitions
from remote main, so it cannot install this local change before that branch ships.
For a local smoke test, load the checkout in a fresh test profile and clear its
detection cache before re-evaluating pages. Saved history retains its original
scores. Global scoring and custom-rule definitions are unchanged.

Run `npm run verify`; `test/fingerprint-confidence.test.js` exercises the real
installation and aggregation pipeline, complete/incomplete/duplicate profiles,
alternative OR branches and background scoring across batches with synthetic data. A browser
smoke test is still needed for native API interception. Revert the calibration
commit to restore the preceding definitions.
