// Chrome Web Store screenshots (1280x800), taken from the real extension and shown on the
// README too.
//
// The unpacked extension is loaded into Chromium, a few made-up demo sites
// (*.example, served by request interception) are opened so the detectors have
// something to find, and the real popup is captured per tab at 2x. The only
// request let through to the network is the language flag in Settings
// (flagcdn.com); without a connection that box is simply left empty.
//
// A store image is README-style artwork (scripts/lib/store-art.js): a headline,
// a subtitle and three chips next to either the drawn detection card of the README
// hero (image 1) or the real popup capture (images 2 to 5), laid out at 640x400 CSS
// px and rendered at 2x because Chrome shows every screenshot at about 640x400.
// The copy of each language is store/captions/<code>.json. Every run writes, for each
// language in --lang:
//   assets/store-screenshots/<code>/NN-<name>-1280x800.png
// and follows every UI change, with no hand-drawn copy to keep in sync.
//
// Options:
//   --lang en,es   languages to render (default en; "all" = every folder of _locales)
//   --extension D  load the extension from D instead of this checkout (a copy on a
//                  fast disk starts much quicker than a Windows drive seen from WSL)
//   --out D        where the store images go (default assets/store-screenshots)
//   --captions-dir D  read the copy of the images from D/<code>.json (default store/captions)
//   --captures D   keep the popup captures in D/<code>/*.png, and reuse the ones already
//                  there instead of opening the extension again: after a caption changes,
//                  only the artwork is drawn again (a few seconds a language)
//   --fontconfig F a fontconfig file for the browsers, when the machine lacks a font a
//                  language needs. Traditional Chinese is drawn with the system's
//                  Traditional font (Microsoft JhengHei, PingFang TC, Noto Sans TC);
//                  on Linux or WSL point F at a config that adds one (store/README.md)
//
// Playwright is not a project dependency. Install it anywhere and point at it:
//   npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   NODE_PATH=/tmp/pw/node_modules node scripts/generate-store-screenshots.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { storeArtHtml, openStoreArt, checkStoreArtLayout, checkStoreArtFonts, visiblePopupHeight, STORE_ART } = require('./lib/store-art.js');
const { STORE_IMAGES } = require('./lib/store-images.js');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, '_locales');
const popupSize = { width: 400, height: 580 };
const captureScale = 2;

function parseArgs(argv) {
    const options = { langs: ['en'], extension: repoRoot, out: path.join(repoRoot, 'assets', 'store-screenshots'), captions: path.join(repoRoot, 'store', 'captions'), captures: null, fontconfig: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--lang') options.langs = String(argv[++i] || '').split(',').filter(Boolean);
        else if (arg === '--extension') options.extension = path.resolve(argv[++i]);
        else if (arg === '--out') options.out = path.resolve(argv[++i]);
        else if (arg === '--captions-dir') options.captions = path.resolve(argv[++i]);
        else if (arg === '--captures') options.captures = path.resolve(argv[++i]);
        else if (arg === '--fontconfig') options.fontconfig = path.resolve(argv[++i]);
        else throw new Error(`Unknown option ${arg}`);
    }
    if (options.langs.length === 1 && options.langs[0] === 'all') {
        const folders = fs.readdirSync(localesDir).filter((name) => fs.statSync(path.join(localesDir, name)).isDirectory()).sort();
        options.langs = ['en', ...folders.filter((name) => name !== 'en')];
    }
    return options;
}

// Demo sites. Only *.example hosts and placeholder values: nothing here comes
// from a real browsing session.
const demoSites = [
    {
        host: 'travel.example',
        path: '/login',
        title: 'Sign in - Example Travel',
        headers: { server: 'AkamaiGHost' },
        cookies: { _abck: '0~-1~demo~0~-1~-1', bm_sz: 'demo', ak_bmsc: 'demo' },
        body: `<script src="/akam/13/5f3a9c21"></script>
               <script>var bmak = {};</script>
               <script src="https://js.hcaptcha.com/1/api.js"></script>
               <div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div>`
    },
    {
        host: 'news.example',
        path: '/',
        title: 'Example News',
        headers: { 'x-datadome': 'protected', 'x-datadome-cid': 'demo' },
        cookies: { datadome: 'demo' },
        body: `<script>window.ddjskey = 'DEMO';</script>
               <script src="https://js.datadome.co/tags.js"></script>`
    },
    {
        // Opened last, so it is the page the Detection and Advanced shots describe.
        host: 'shop.example',
        path: '/checkout',
        title: 'Checkout - Example Shop',
        headers: { server: 'cloudflare', 'cf-ray': '8f1a2b3c4d5e6f70-MAD' },
        cookies: { cf_clearance: 'demo', __cf_bm: 'demo' },
        body: `<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>
               <script src="https://www.google.com/recaptcha/api.js?render=6LeDemoSiteKeyForStoreScreenshots000000"></script>
               <div class="g-recaptcha" data-sitekey="6LeDemoSiteKeyForStoreScreenshots000000"></div>
               <canvas id="c" width="8" height="8"></canvas>
               <script>var c = document.getElementById('c'); c.getContext('2d').fillText('x', 1, 1); c.toDataURL();</script>`
    }
];

function readCaptions(captionsDir, lang) {
    const file = path.join(captionsDir, `${lang}.json`);
    if (!fs.existsSync(file)) throw new Error(`${path.relative(repoRoot, file)} is missing`);
    const captions = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const { screen } of STORE_IMAGES) {
        const copy = captions.screens && captions.screens[screen];
        if (!copy || !copy.highlight || !copy.subtitle || !(copy.chips === 'categories' || Array.isArray(copy.chips))) {
            throw new Error(`${path.relative(repoRoot, file)}: screens.${screen} needs highlight, subtitle and chips`);
        }
    }
    if (!captions.demo || !captions.demo.note || !String(captions.demo.detected).includes('{0}')) {
        throw new Error(`${path.relative(repoRoot, file)}: demo needs note and detected (with {0})`);
    }
    return captions;
}

function categoryLabels(lang) {
    const messages = JSON.parse(fs.readFileSync(path.join(localesDir, lang, 'messages.json'), 'utf8'));
    const label = (key) => {
        if (!messages[key] || !messages[key].message) throw new Error(`_locales/${lang}: ${key} is missing`);
        return messages[key].message;
    };
    return { antibot: label('categoryAntibot'), captcha: label('categoryCaptcha'), fingerprint: label('categoryFingerprint') };
}

function demoResponse(site) {
    return {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            ...site.headers,
            'set-cookie': Object.entries(site.cookies)
                .map(([name, value]) => `${name}=${value}; Path=/; Secure`)
                .join('\n')
        },
        body: `<!doctype html><html><head><meta charset="utf-8"><title>${site.title}</title></head>`
            + `<body><h1>${site.title}</h1>${site.body}</body></html>`
    };
}

// The Rules list scrolls under a sticky pagination bar at the bottom of the popup. A store image
// shows only the top of the popup (visiblePopupHeight), so a card hidden by the bar matters only
// when the bar reaches into that part. The first page opens on Akamai, whose method chips take two
// rows, so its second card is covered early: search for the demo page's vendor instead.
const rulesSearch = 'cloudflare';

async function showRulesThatFit(popup) {
    await popup.fill('#rulesSearch', rulesSearch);
    await popup.waitForTimeout(800);
    const visible = visiblePopupHeight(popupSize.width);
    const hidden = await popup.evaluate((limit) => {
        const bar = document.getElementById('rulesPagination');
        const barTop = bar && bar.offsetParent ? bar.getBoundingClientRect().top : window.innerHeight;
        if (barTop >= limit) return [];
        return [...document.querySelectorAll('#rulesList .detector-card')]
            .filter((card) => card.offsetParent && card.getBoundingClientRect().bottom > barTop)
            .map((card) => card.dataset.detectorId);
    }, visible);
    if (hidden.length) {
        throw new Error(`Rules shot: the pagination bar covers ${hidden.join(', ')}; pick another search than "${rulesSearch}"`);
    }
}

// History as a person would have it after a morning of browsing: scans spread over the
// day instead of seconds ago, and the newest page pinned with a note and a Changed badge
// (the 3.0 features), written through the same store the extension uses.
async function seedHistory(worker) {
    await worker.evaluate(async () => {
        const now = Date.now();
        const minutes = (n) => now - n * 60000;
        await HistoryStore.mutate((items) => {
            const byHost = (host) => items.find((item) => item.hostname === host);
            const shop = byHost('shop.example');
            const news = byHost('news.example');
            const travel = byHost('travel.example');
            if (!shop || !news || !travel) throw new Error('A demo page is missing from History');
            shop.timestamp = minutes(12);
            news.timestamp = minutes(95);
            travel.timestamp = minutes(250);
            shop.pinned = true;
            shop.changed = { at: minutes(60), added: ['Google reCAPTCHA'], removed: ['hCaptcha'] };
            return [shop, news, travel, ...items.filter((item) => ![shop, news, travel].includes(item))];
        }, chrome.storage.local);
    });
}

// The note on the pinned page is typed by a person, so it is written in each language's own words
async function setDemoNote(worker, note) {
    await worker.evaluate(async (text) => {
        await HistoryStore.mutate((items) => {
            const shop = items.find((item) => item.hostname === 'shop.example');
            if (!shop) throw new Error('The demo page is missing from History');
            shop.note = text;
            return items;
        }, chrome.storage.local);
    }, note);
}

// The browsers inherit this machine's environment, plus the fontconfig file the options name
const browserEnv = (fontconfig) => ({ ...process.env, ...(fontconfig ? { FONTCONFIG_FILE: fontconfig } : {}) });

async function capturePopups({ extensionDir, langs, captionsByLang, workDir, fontconfig }) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'store-shots-'));
    const context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
        viewport: { width: 1280, height: 800 },
        locale: 'en-US',
        env: browserEnv(fontconfig)
    });

    try {
        const sitesByHost = new Map(demoSites.map((site) => [site.host, site]));
        await context.route('**/*', (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const site = sitesByHost.get(url.hostname);
            if (site && request.resourceType() === 'document') {
                return route.fulfill(demoResponse(site));
            }
            if (url.hostname === 'flagcdn.com') {
                // The flag beside the language name in Settings.
                return route.continue().catch(() => {});
            }
            if (/^https?:$/.test(url.protocol)) {
                // Third-party scripts only need to be requested, not to run.
                return route.fulfill({ status: 200, headers: { 'content-type': 'application/javascript' }, body: '' });
            }
            return route.continue();
        });

        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 90000 });
        const extensionId = new URL(worker.url()).host;

        // Show each page in front and wait until its scan is saved to History, reloading
        // once in a while: with several tabs open a scan occasionally never finishes.
        const savedHosts = () => worker.evaluate(async () => {
            const { scrapfly_history: history } = await chrome.storage.local.get('scrapfly_history');
            return JSON.stringify(history || '');
        });
        for (const site of demoSites) {
            const page = await context.newPage();
            await page.bringToFront();
            let saved = false;
            for (let attempt = 0; attempt < 4 && !saved; attempt++) {
                await page.goto(`https://${site.host}${site.path}`);
                for (let poll = 0; poll < 10 && !saved; poll++) {
                    await page.waitForTimeout(1500);
                    saved = (await savedHosts()).includes(site.host);
                }
            }
            if (!saved) throw new Error(`Demo page ${site.host} was never saved to History`);
        }
        await seedHistory(worker);

        const demoTabId = await worker.evaluate(async () => {
            const [tab] = await chrome.tabs.query({ url: 'https://shop.example/*' });
            return tab.id;
        });

        const popup = await context.newPage();
        await popup.setViewportSize(popupSize);
        // Opened as a tab, the popup would describe itself. Point it at the demo page instead.
        await popup.addInitScript((tabId) => {
            chrome.tabs.query = (query, callback) => {
                const result = chrome.tabs.get(tabId).then((tab) => [tab]);
                if (typeof callback === 'function') {
                    result.then(callback);
                    return undefined;
                }
                return result;
            };
        }, demoTabId);

        // A persistent context fixes its device scale at launch, so the 2x capture
        // switches the scale of this one page through DevTools and back again,
        // and is taken through DevTools too: page.screenshot() keeps to the launch
        // scale and would return 400x580.
        const devtools = await context.newCDPSession(popup);
        const setScale = async (deviceScaleFactor) => {
            await devtools.send('Emulation.setDeviceMetricsOverride', { ...popupSize, deviceScaleFactor, mobile: false });
            await popup.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            await popup.waitForTimeout(300);
        };

        const captures = {};
        for (const lang of langs) {
            const langDir = path.join(workDir, lang);
            fs.mkdirSync(langDir, { recursive: true });
            captures[lang] = {};
            // The extension's own language, as Settings → General sets it
            await worker.evaluate((code) => chrome.storage.local.set({ scrapfly_language_override: code }), lang);

            const shoot = async (name) => {
                // The version under the title would make every image out of date at the next release
                await popup.evaluate(() => { const version = document.getElementById('appVersion'); if (version) version.style.visibility = 'hidden'; });
                // Park the pointer where it shows no hover state or tooltip.
                await popup.mouse.move(popupSize.width - 2, popupSize.height - 2);
                await popup.waitForTimeout(400);
                await popup.evaluate(() => document.fonts && document.fonts.ready);
                await setScale(captureScale);
                const { data } = await devtools.send('Page.captureScreenshot', { format: 'png' });
                const file = path.join(langDir, `${name}.png`);
                fs.writeFileSync(file, Buffer.from(data, 'base64'));
                captures[lang][name] = file;
                await setScale(1);
            };

            // The last demo page may still be scanning: reopen the popup until its results are in.
            for (let attempt = 0; attempt < 10; attempt++) {
                await popup.goto(`chrome-extension://${extensionId}/popup.html`);
                const ready = await popup.waitForSelector('.detection-card', { timeout: 3000 }).catch(() => null);
                if (ready) break;
            }
            await popup.waitForTimeout(1000);

            for (const tab of ['history', 'rules']) {
                if (tab === 'history') {
                    // The note is read when History renders: write it before the tab opens
                    await setDemoNote(worker, captionsByLang[lang].demo.note);
                }
                await popup.click(`[data-tab="${tab}"]`);
                await popup.waitForTimeout(1500);
                if (tab === 'rules') await showRulesThatFit(popup);
                await shoot(tab);
            }

            // The Advanced image opens the tools of the demo page's CAPTCHA, instead of the mostly empty list
            await popup.click('[data-tab="advanced"]');
            await popup.waitForTimeout(800);
            await popup.locator('.advanced-launch-card', { hasText: 'reCAPTCHA' }).click();
            await popup.waitForTimeout(2000);
            await shoot('advanced-tool');

            // The Settings image shows the language list open: 22 names with their flags
            await popup.click('#settingsBtn');
            await popup.waitForTimeout(1500);
            await popup.click('#languagePickerTrigger');
            await popup.waitForSelector('#languagePickerMenu:not([hidden])', { timeout: 5000 });
            await popup.waitForTimeout(1500);
            // Opening the list scrolls Settings down until the whole list is in view, by an amount that depends on how
            // many lines the language's own texts take: back to the top, so the first card's title is never cut off
            await popup.evaluate(() => { document.querySelector('#languagePicker').closest('.modal-body').scrollTop = 0; });
            await popup.waitForTimeout(300);
            await shoot('settings-languages');
        }
        return captures;
    } finally {
        await context.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
}

async function renderStoreImages({ langs, captionsByLang, captures, outDir, fontconfig }) {
    const browser = await chromium.launch({ channel: 'chromium', headless: true, env: browserEnv(fontconfig) });
    const failures = [];
    try {
        const context = await browser.newContext({ viewport: { width: STORE_ART.width, height: STORE_ART.height }, deviceScaleFactor: STORE_ART.scale });
        for (const lang of langs) {
            const copyOf = captionsByLang[lang];
            const labels = categoryLabels(lang);
            const langOut = path.join(outDir, lang);
            fs.mkdirSync(langOut, { recursive: true });
            const fonts = new Set();
            for (const image of STORE_IMAGES) {
                const label = `${lang}/${image.filename}`;
                const html = storeArtHtml({
                    lang,
                    kind: image.kind,
                    copy: copyOf.screens[image.screen],
                    captureFile: image.capture ? captures[lang][image.capture] : undefined,
                    categoryLabels: labels,
                    detectedLabel: copyOf.demo.detected
                });
                const tab = await openStoreArt(context, html);
                try {
                    await checkStoreArtLayout(tab, label);
                    (await checkStoreArtFonts(tab, label, lang)).forEach((family) => fonts.add(family));
                    await tab.screenshot({ path: path.join(langOut, image.filename) });
                    console.log(`Wrote ${path.relative(repoRoot, path.join(langOut, image.filename))}`);
                } catch (error) {
                    // Keep going so one run reports every language that needs shorter copy
                    failures.push(error.message);
                    fs.rmSync(path.join(langOut, image.filename), { force: true });
                } finally {
                    await tab.close();
                }
            }
            console.log(`  ${lang}: fonts ${[...fonts].join(', ')}`);
        }
    } finally {
        await browser.close();
    }
    if (failures.length) throw new Error(`${failures.length} image(s) not written:\n${failures.join('\n')}`);
}

const captureNames = [...new Set(STORE_IMAGES.filter((image) => image.capture).map((image) => image.capture))];
const captureFile = (dir, lang, name) => path.join(dir, lang, `${name}.png`);

// A long run now and then loses its browser, so the popup captures are taken a few languages at
// a time, and a batch that fails is taken again (what it already saved is kept)
const CAPTURE_BATCH = 5;
const CAPTURE_FAILURES = 3;

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const captionsByLang = Object.fromEntries(options.langs.map((lang) => [lang, readCaptions(options.captions, lang)]));
    options.langs.forEach(categoryLabels); // fails early on a language without its category names
    fs.mkdirSync(options.out, { recursive: true });
    const workDir = options.captures || fs.mkdtempSync(path.join(os.tmpdir(), 'store-captures-'));
    fs.mkdirSync(workDir, { recursive: true });

    try {
        // Captures an earlier run kept (--captures) are reused: delete a language's folder to take them again
        const missing = () => options.langs.filter((lang) => !captureNames.every((name) => fs.existsSync(captureFile(workDir, lang, name))));
        let failures = 0;
        for (let todo = missing(); todo.length; todo = missing()) {
            const batch = todo.slice(0, CAPTURE_BATCH);
            try {
                await capturePopups({ extensionDir: options.extension, langs: batch, captionsByLang, workDir, fontconfig: options.fontconfig });
                failures = 0;
            } catch (error) {
                console.warn(`Capturing ${batch.join(', ')} failed: ${String(error.message).split('\n')[0]}`);
                if (++failures >= CAPTURE_FAILURES) throw error;
            }
        }
        const captures = Object.fromEntries(options.langs.map((lang) => [
            lang,
            Object.fromEntries(captureNames.map((name) => [name, captureFile(workDir, lang, name)]))
        ]));
        await renderStoreImages({ langs: options.langs, captionsByLang, captures, outDir: options.out, fontconfig: options.fontconfig });
    } finally {
        if (!options.captures) fs.rmSync(workDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
