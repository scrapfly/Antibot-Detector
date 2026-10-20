# Chrome Web Store listing

The text and images the Chrome Web Store shows for the extension, in every language of `_locales`. Nothing here ships in the
extension package (`.github/workflows/main.yml` leaves `store/*` and `assets/store-screenshots/*` out of the zip).

| What | Where |
| --- | --- |
| Detailed description, one file per language, plain text to paste | `store/listing/<code>.txt` |
| The copy printed on the screenshots | `store/captions/<code>.json` |
| The five screenshots (1280×800, 24-bit PNG) | `assets/store-screenshots/<code>/` |
| Review sheet: the images at the size the store shows them next to the text (not committed) | `store/preview/<code>.png` |

The name and the 132-character summary are not here: the store takes them from `extensionName` and
`extensionDescription` in `_locales/<code>/messages.json`, so they change only with a new package.

## Publishing the listing

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
- The dashboard locks the whole item (description, screenshots, **Save draft**, **Submit for review**) while a
  submission is pending: the Package page shows the draft version next to the published one. Wait for the review to
  end, or cancel the submission and submit the listing together with the package.
- The text describes the newest version. Paste it once that version is live.
- The small promo tile and the marquee tile cannot be localized, so they stay as they are.
- The store treats a keyword repeated more than five times and lists of vendors or keywords as spam, and testimonials
  without a source: the checker below enforces the first, the English text avoids the rest.

## The rules of a listing

`npm run check:store-listing` and `npm run check:store-images` (both part of `npm run verify`) hold every language to
the English reference. The rules are in `scripts/lib/store-text.js` and `scripts/lib/store-images.js`:

- **Description**: UTF-8, LF, plain text. The same seven blocks as English (intro; "What you see" with 3 bullets; "Inside the popup"
  with 6; "Made for"; "Privacy"; "Languages"; "Open source"), bullets are `• ` on one line, the intro is at most 250 characters and
  ends like a sentence, the numbers are the English ones, the tabs and pages are named the way the language's own interface names them
  (`tabHistory`, `settingsOpenStats`...), and no category term or "Scrapfly" appears more than five times. No Markdown, HTML, emoji or web addresses.
- **Image copy**: the same JSON keys as `en.json`, headline, subtitle and chips within a length budget per script, `demo.detected` keeps `{0}`.
  The budgets are guardrails; the generator's layout check decides what fits.
- **Images**: five files named as `scripts/lib/store-images.js` lists them, 1280×800, 24-bit RGB without transparency (the store refuses alpha).

Translating a new language: copy `en.txt` and `en.json`, translate them (the interface's own words are in `_locales/<code>/messages.json`),
and check the drafts wherever they are:

```bash
node scripts/check-store-listing.js --listing-dir /tmp/drafts/listing --captions-dir /tmp/drafts/captions --lang es
```

## Regenerating the images

Playwright is not a project dependency (see the header of `scripts/generate-store-screenshots.js`).

```bash
# images of one or more languages (English by default; "all" = every folder of _locales)
NODE_PATH=/tmp/pw/node_modules node scripts/generate-store-screenshots.js --lang en,es

# the review sheet of a language (add --images-only for a quick look at many)
NODE_PATH=/tmp/pw/node_modules node scripts/build-store-preview.js --lang es
```

Useful options of the generator: `--extension <dir>` loads the extension from a copy on a fast disk (the repository on a Windows drive
starts in about 40 s from WSL), `--captures <dir>` keeps the popup captures so a caption change redraws only the artwork (delete a language's
folder to capture it again, for example after changing `demo.note`), `--captions-dir <dir>` reads the copy from elsewhere.

How a language is drawn: the popup is captured from the real extension in that language, and the artwork around it uses the extension's
own fonts and font stacks (`modules/styles/common.css`). Arabic mirrors the text column, Japanese and Chinese put each part of the headline
on its own line, Korean and Japanese break lines between words and phrases. The run fails, and writes nothing for that image, when a text
overflows, a headline takes more than three lines, the chips take more than two rows, or a text is drawn with a font the extension does not
bundle.

**Traditional Chinese needs a system font.** The bundled Han fonts draw Simplified and Japanese forms, so `zh_TW` is drawn with the
system's Traditional font (Microsoft JhengHei, PingFang TC or Noto Sans TC) and the run fails without one. On Linux or WSL give the browsers
a fontconfig file that adds only that font, so no other system font leaks into the images:

```bash
mkdir -p ~/store-fonts && ln -s /mnt/c/Windows/Fonts/msjh.ttc /mnt/c/Windows/Fonts/msjhbd.ttc ~/store-fonts/
cat > ~/store-fonts/fonts.conf <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>$HOME/store-fonts</dir>
</fontconfig>
EOF
NODE_PATH=/tmp/pw/node_modules node scripts/generate-store-screenshots.js --lang zh_TW --fontconfig ~/store-fonts/fonts.conf
```

The README hero (`assets/readme/hero.png`) comes from `scripts/generate-readme-hero.js`; both scripts share `scripts/lib/store-art.js`.
