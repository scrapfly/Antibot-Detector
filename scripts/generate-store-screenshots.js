// Chrome Web Store screenshots (1280x800) taken from the real extension.
//
// The unpacked extension is loaded into Chromium, a few made-up demo sites
// (*.example, served by request interception, no network) are opened so the
// detectors have something to find, and the real popup is captured per tab.
// Each capture is then placed next to a headline on the store background, so
// the images follow every UI change without a hand-drawn copy to keep in sync.
//
// Playwright is not a project dependency. Install it anywhere and point at it:
//   npm i --prefix /tmp/pw playwright && npx --prefix /tmp/pw playwright install chromium
//   NODE_PATH=/tmp/pw/node_modules node scripts/generate-store-screenshots.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'assets', 'store-screenshots');
const viewport = { width: 1280, height: 800 };
const popupSize = { width: 400, height: 580 };

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

const pages = [
    {
        filename: '01-detection-1280x800.png',
        capture: 'detection',
        title: 'Spot anti-bot protection',
        subtitle: 'See which anti-bot, CAPTCHA and fingerprinting systems a page uses, with confidence and difficulty for each.',
        bullets: ['Live scan', 'Confidence score', 'Matched signals']
    },
    {
        filename: '02-history-1280x800.png',
        capture: 'history',
        title: 'Keep every scan in view',
        subtitle: 'Every protected page you visit is saved, searchable and ready to export.',
        bullets: ['Search history', 'Difficulty at a glance', 'CSV & JSON export']
    },
    {
        filename: '03-rules-1280x800.png',
        capture: 'rules',
        title: 'Control every detector rule',
        subtitle: 'Update the built-in detectors, switch them on or off, and write your own rules.',
        bullets: ['Built-in detectors', 'Custom rules', 'Import & export']
    },
    {
        filename: '04-advanced-tools-1280x800.png',
        capture: 'advanced',
        title: 'Capture tools on demand',
        subtitle: 'When a supported protection is found, collect sitekeys, cookies and challenge parameters for analysis.',
        bullets: ['Per-vendor tools', 'Sitekeys & cookies', 'Export captures']
    },
    {
        filename: '05-settings-1280x800.png',
        capture: 'settings',
        title: 'Make it work your way',
        subtitle: 'Notifications, 12 languages, history retention, badge colours, webhooks and excluded domains.',
        bullets: ['12 languages', 'Webhooks', 'Excluded domains']
    }
];

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

async function capturePopup(outDir) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'store-shots-'));
    const context = await chromium.launchPersistentContext(profile, {
        channel: 'chromium',
        headless: true,
        args: [`--disable-extensions-except=${repoRoot}`, `--load-extension=${repoRoot}`],
        viewport,
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
            if (/^https?:$/.test(url.protocol)) {
                // Third-party scripts only need to be requested, not to run.
                return route.fulfill({ status: 200, headers: { 'content-type': 'application/javascript' }, body: '' });
            }
            return route.continue();
        });

        let [worker] = context.serviceWorkers();
        if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
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

        const captures = {};
        const shoot = async (name) => {
            // Park the pointer where it shows no hover state or tooltip.
            await popup.mouse.move(popupSize.width - 2, popupSize.height - 2);
            await popup.waitForTimeout(400);
            await popup.evaluate(() => document.fonts && document.fonts.ready);
            const file = path.join(outDir, `${name}.png`);
            await popup.screenshot({ path: file });
            captures[name] = file;
        };

        // The last demo page may still be scanning: reopen the popup until its results are in.
        for (let attempt = 0; attempt < 10; attempt++) {
            await popup.goto(`chrome-extension://${extensionId}/popup.html`);
            const ready = await popup.waitForSelector('.detection-card', { timeout: 3000 }).catch(() => null);
            if (ready) break;
        }
        await popup.waitForTimeout(1000);
        await shoot('detection');

        for (const tab of ['history', 'rules', 'advanced']) {
            await popup.click(`[data-tab="${tab}"]`);
            await popup.waitForTimeout(1500);
            await shoot(tab);
        }

        await popup.click('#settingsBtn');
        await popup.waitForTimeout(1500);
        await shoot('settings');

        return captures;
    } finally {
        await context.close();
        fs.rmSync(profile, { recursive: true, force: true });
    }
}

function storeHtml(page, captureFile) {
    const data = (file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    const brandIcon = data(path.join(repoRoot, 'icons', 'icon48.png'));
    const fontUrl = (file) => `url("data:font/woff2;base64,${fs.readFileSync(path.join(repoRoot, 'assets', 'fonts', file)).toString('base64')}") format("woff2")`;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    @font-face { font-family: "IBM Plex Sans"; font-weight: 400; src: ${fontUrl('IBMPlexSans-Regular.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 600; src: ${fontUrl('IBMPlexSans-SemiBold.woff2')}; }
    @font-face { font-family: "IBM Plex Sans"; font-weight: 700; src: ${fontUrl('IBMPlexSans-Bold.woff2')}; }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: ${viewport.width}px; height: ${viewport.height}px; overflow: hidden; }
    body {
      font-family: "IBM Plex Sans", system-ui, sans-serif;
      color: #f8fafc;
      background:
        radial-gradient(900px 600px at 82% 50%, rgba(59, 130, 246, 0.22), transparent 65%),
        linear-gradient(180deg, #11141b 0%, #08090d 100%);
    }
    .art {
      position: relative;
      height: 100%;
      display: grid;
      grid-template-columns: 1fr ${popupSize.width + 40}px;
      align-items: center;
      gap: 56px;
      padding: 0 96px 0 88px;
    }
    .art::before {
      content: "";
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: linear-gradient(90deg, #000 0%, rgba(0, 0, 0, 0.6) 50%, transparent 85%);
    }
    .copy, .stage { position: relative; }
    .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 30px; color: #93c5fd; font-size: 17px; font-weight: 600; }
    .brand img { width: 40px; height: 40px; border-radius: 10px; }
    h1 { margin: 0; font-size: 56px; line-height: 1.05; font-weight: 700; letter-spacing: -0.01em; }
    p { margin: 22px 0 32px; max-width: 520px; color: #cbd5e1; font-size: 21px; line-height: 1.45; }
    .chips { display: flex; flex-wrap: wrap; gap: 10px; }
    .chip {
      padding: 8px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; color: #bfdbfe;
      background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(96, 165, 250, 0.32);
    }
    .stage { display: flex; justify-content: center; }
    .popup {
      width: ${popupSize.width}px; height: ${popupSize.height}px; border-radius: 14px; overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.25);
      box-shadow: 0 40px 90px rgba(0, 0, 0, 0.6), 0 0 0 8px rgba(30, 41, 59, 0.55);
    }
    .popup img { display: block; width: 100%; height: 100%; }
  </style>
</head>
<body>
  <section class="art">
    <div class="copy">
      <div class="brand"><img src="${brandIcon}" alt=""><span>Scrapfly Anti-Bot Detector</span></div>
      <h1>${page.title}</h1>
      <p>${page.subtitle}</p>
      <div class="chips">${page.bullets.map((bullet) => `<span class="chip">${bullet}</span>`).join('')}</div>
    </div>
    <div class="stage"><div class="popup"><img src="${data(captureFile)}" alt=""></div></div>
  </section>
</body>
</html>`;
}

async function main() {
    fs.mkdirSync(outputDir, { recursive: true });
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'store-captures-'));

    try {
        const captures = await capturePopup(workDir);
        const browser = await chromium.launch({ channel: 'chromium', headless: true });
        try {
            for (const page of pages) {
                const tab = await browser.newPage({ viewport, deviceScaleFactor: 1 });
                await tab.setContent(storeHtml(page, captures[page.capture]), { waitUntil: 'load' });
                await tab.evaluate(() => document.fonts.ready);
                await tab.screenshot({ path: path.join(outputDir, page.filename) });
                await tab.close();
                console.log(`Wrote assets/store-screenshots/${page.filename}`);
            }
        } finally {
            await browser.close();
        }
    } finally {
        fs.rmSync(workDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
