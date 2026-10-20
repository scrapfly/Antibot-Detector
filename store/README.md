# Chrome Web Store listing

The text and images the Chrome Web Store shows for the extension. Nothing here ships in the
extension package (`.github/workflows/main.yml` leaves `store/*` and `assets/store-screenshots/*` out of the zip).

| What | Where |
| --- | --- |
| Detailed description, one file per language, plain text to paste | `store/listing/<code>.txt` |
| The copy printed on the screenshots | `store/captions/<code>.json` |
| The five screenshots (1280×800, 24-bit PNG) | `assets/store-screenshots/<code>/` |
| Review sheet: the images at the size the store shows them next to the text (not committed) | `store/preview/<code>.png` |

The name and the 132-character summary are not here: the store takes them from `extensionName` and
`extensionDescription` in `_locales/<code>/messages.json`, so they change only with a new package.

## Publishing a language

The Chrome Web Store API only uploads a package, publishes it, sets a rollout and cancels a submission
(see `.github/scripts/webstore.sh`). It cannot edit the description or the screenshots, so the listing is
pasted by hand in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole):

1. Open the item, then **Store listing**.
2. Pick the language in the dropdown at the top. The list comes from the `_locales` folders of the uploaded
   package, so a language appears once a package that contains it is the one in the dashboard.
3. Paste `store/listing/<code>.txt` into **Detailed description** (plain text: no Markdown, bullets stay as "•").
4. Replace the screenshots with the five files of `assets/store-screenshots/<code>/`, in file order.
5. Save the draft. Repeat for every language, then **Submit for review**.

Notes:

- A listing change is reviewed again, but it needs no new package version.
- The text describes the newest version. Paste it once that version is live, not while an earlier submission
  is still `PENDING_REVIEW` (the dashboard may lock the item until the review ends).
- The small promo tile and the marquee tile cannot be localized, so they stay as they are.
- Keep the text policy-safe: no list of vendors or languages beyond a few examples, and no key term more
  than five times (the store treats unnatural repetition and keyword lists as spam).

## Regenerating

Playwright is not a project dependency (see the header of `scripts/generate-store-screenshots.js`).

```bash
# images of one or more languages (English by default); --extension may point at a copy on a fast disk
NODE_PATH=/tmp/pw/node_modules node scripts/generate-store-screenshots.js --lang en

# the review sheet of a language
NODE_PATH=/tmp/pw/node_modules node scripts/build-store-preview.js --lang en
```

A new language needs its three files (`listing`, `captions` and the five images) next to its `_locales` folder.
The README hero (`assets/readme/hero.png`) comes from `scripts/generate-readme-hero.js`; both scripts share
`scripts/lib/store-art.js`.
