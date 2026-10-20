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
//
// Playwright is not a project dependency. Install it anywhere and point at it:
//   npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   NODE_PATH=/tmp/pw/node_modules node scripts/generate-store-screenshots.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { storeArtHtml, checkStoreArtLayout, STORE_ART } = require('./lib/store-art.js');

const repoRoot = path.resolve(__dirname, '..');
const localesDir = path.join(repoRoot, '_locales');
const captionsDir = path.join(repoRoot, 'store', 'captions');
const popupSize = { width: 400, height: 580 };
const captureScale = 2;

function parseArgs(argv) {
    const options = { langs: ['en'], extension: repoRoot, out: path.join(repoRoot, 'assets', 'store-screenshots') };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--lang') options.langs = String(argv[++i] || '').split(',').filter(Boolean);
        else if (arg === '--extension') options.extension = path.resolve(argv[++i]);
        else if (arg === '--out') options.out = path.resolve(argv[++i]);
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

// The five store images, in the order the store shows them. `capture` is the popup
// state a popup image shows (none for the drawn hero); `screen` is the key of the
// language's captions file.
const storeImages = [
    { filename: '01-detection-1280x800.png', screen: 'detection', kind: 'hero' },
    { filename: '02-history-1280x800.png', screen: 'history', kind: 'popup', capture: 'history' },
    { filename: '03-rules-1280x800.png', screen: 'rules', kind: 'popup', capture: 'rules' },
    { filename: '04-advanced-tools-1280x800.png', screen: 'advanced', kind: 'popup', capture: 'advanced-tool' },
    { filename: '05-settings-1280x800.png', screen: 'settings', kind: 'popup', capture: 'settings-languages' }
];

function readCaptions(lang) {
    const file = path.join(captionsDir, `${lang}.json`);
    if (!fs.existsSync(file)) throw new Error(`store/captions/${lang}.json is missing`);
    const captions = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const { screen } of storeImages) {
        const copy = captions.screens && captions.screens[screen];
        if (!copy || !copy.highlight || !copy.subtitle || !(copy.chips === 'categories' || Array.isArray(copy.chips))) {
            throw new Error(`store/captions/${lang}.json: screens.${screen} needs highlight, subtitle and chips`);
        }
    }
    if (!captions.demo || !captions.demo.note || !String(captions.demo.detected).includes('{0}')) {
        throw new Error(`store/captions/${lang}.json: demo needs note and detected (with {0})`);
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

// The Rules list scrolls under a sticky pagination bar, and the first page opens
// on Akamai, whose method chips take two rows, so the bar covers the second
// card's version and switch until the list is scrolled. Search for the demo
// page's vendor instead: real cards, all of them in view.
const rulesSearch = 'cloudflare';

async function showRulesThatFit(popup) {
    await popup.fill('#rulesSearch', rulesSearch);
    await popup.waitForTimeout(800);
    const hidden = await popup.evaluate(() => {
        const bar = document.getElementById('rulesPagination');
        const barTop = bar && bar.offsetParent ? bar.getBoundingClientRect().top : window.innerHeight;
        return [...document.querySelectorAll('#rulesList .detector-card')]
            .filter((card) => card.offsetParent && card.getBoundingClientRect().bottom > barTop)
            .map((card) => card.dataset.detectorId);
    });
    if (hidden.length) {
        throw new Error(`Rules shot: the pagination bar covers ${hidden.join(', ')}; pick another search than "${rulesSearch}"`);
    }
}

// History as a person would have it after a morning of browsing: scans spread over the
// day instead of seconds ago, and the newest page pinned with a note and a Changed badge
// (the 3.0 features), written through the same store the extension uses.
async function seedHistory(worker, demo) {
    await worker.evaluate(async ({ note }) => {
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
            shop.note = note;
            shop.changed = { at: minutes(60), added: ['Google reCAPTCHA'], removed: ['hCaptcha'] };
            return [shop, news, travel, ...items.filter((item) => ![shop, news, travel].includes(item))];
        }, chrome.storage.local);
    }, { note: demo.note });
}

async function capturePopups({ extensionDir, langs, captionsByLang, workDir }) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'store-shots-'));
    const context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`],
        viewport: { width: 1280, height: 800 },
        locale: 'en-US'
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
        await seedHistory(worker, captionsByLang[langs[0]].demo);

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
            await shoot('settings-languages');
        }
        return captures;
    } finally {
        await context.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
}

async function renderStoreImages({ langs, captionsByLang, captures, outDir }) {
    const browser = await chromium.launch({ channel: 'chromium', headless: true });
    try {
        for (const lang of langs) {
            const copyOf = captionsByLang[lang];
            const labels = categoryLabels(lang);
            const langOut = path.join(outDir, lang);
            fs.mkdirSync(langOut, { recursive: true });
            for (const image of storeImages) {
                const html = storeArtHtml({
                    kind: image.kind,
                    copy: copyOf.screens[image.screen],
                    captureFile: image.capture ? captures[lang][image.capture] : undefined,
                    categoryLabels: labels,
                    detectedLabel: copyOf.demo.detected
                });
                const tab = await browser.newPage({ viewport: { width: STORE_ART.width, height: STORE_ART.height }, deviceScaleFactor: STORE_ART.scale });
                await tab.setContent(html, { waitUntil: 'load' });
                await tab.evaluate(async () => {
                    await document.fonts.ready;
                    await Promise.all([...document.images].map((img) => img.decode()));
                });
                await checkStoreArtLayout(tab, `${lang}/${image.filename}`);
                await tab.screenshot({ path: path.join(langOut, image.filename) });
                await tab.close();
                console.log(`Wrote ${path.relative(repoRoot, path.join(langOut, image.filename))}`);
            }
        }
    } finally {
        await browser.close();
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    const captionsByLang = Object.fromEntries(options.langs.map((lang) => [lang, readCaptions(lang)]));
    options.langs.forEach(categoryLabels); // fails early on a language without its category names
    fs.mkdirSync(options.out, { recursive: true });
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-captures-'));

    try {
        const captures = await capturePopups({ extensionDir: options.extension, langs: options.langs, captionsByLang, workDir });
        await renderStoreImages({ langs: options.langs, captionsByLang, captures, outDir: options.out });
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
