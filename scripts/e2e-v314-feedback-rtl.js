#!/usr/bin/env node
/**
 * The 3.1.4 answers (toasts) and right-to-left layout, end to end in the real extension (unpacked in Chromium):
 *
 *   Answers         with Settings → Notifications off (the Privacy preset turns it off), a preset, a copy and Copy diagnostics still
 *                   answer with a toast; errors, successes and notes alike
 *   Update check    the four messages of Rules → Update / Settings → Check now are each on screen for the time asked for, two at a
 *                   time; Restore official keeps its failure message on screen while the notes after it wait for a place
 *   Pause           the pointer over a toast, or the keyboard in it, stops its time; leaving gives back what was left
 *   Language list   Settings → General in English and Arabic: the list of languages opens from the picker's outer edge and stays
 *                   inside the dialog (in Arabic it ran 42px past the picker's left edge, 18px of it cut)
 *   Info steps      Advanced → info dialog → How it works: the connector joins the numbers, on the number's side in both directions
 *   Help bullets    Rules → rule editor → a method's "?" dialog: the dots come before the text in both directions
 *   Toasts          the stack, the type line, the padding and the close button follow the reading direction
 *   Arabic text     the arrow of a change points from the first value to the second, and a signed change keeps its sign on the left
 *   Tip title       the difficulty tip says "label: value" the way the language does (French, Traditional Chinese)
 *
 * The popup is opened as a page, as in the other suites. English is measured too: it must not change.
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm run e2e:setup
 *   node scripts/e2e-v314-feedback-rtl.js [<extension folder>] [--only=<text>]
 *   FEEDBACK_RTL_SHOTS=<folder> [FEEDBACK_RTL_LABEL=before|after]   also saves a screenshot of every layout (<label>-<name>.png)
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm run e2e:setup (or npm i --no-save playwright && npx playwright install chromium)');
  process.exit(2);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || path.join(__dirname, '..'));
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const SHOTS = process.env.FEEDBACK_RTL_SHOTS || '';
const LABEL = process.env.FEEDBACK_RTL_LABEL || 'after';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const say = (locale, key) => JSON.parse(fs.readFileSync(path.join(REPO, '_locales', locale, 'messages.json'), 'utf8'))[key].message;

const results = [];
async function scenario(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name} (${Math.round((Date.now() - started) / 1000)}s)`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log(`FAIL  ${name}\n      ${String((error && error.stack) || error).split('\n').slice(0, 7).join('\n      ')}`);
  }
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-feedback-rtl-'));
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium', viewport: { width: 400, height: 600 },
    args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
  });
  const worker = ctx.serviceWorkers().find(w => w.url().startsWith('chrome-extension://')) || await ctx.waitForEvent('serviceworker');
  const extId = new URL(worker.url()).host;
  const W = (fn, arg) => worker.evaluate(fn, arg);
  const pageErrors = [];

  /** The popup, as a page, in a language. */
  async function popup(lang = 'en') {
    await W((l) => chrome.storage.local.set({ scrapfly_language_override: l }), lang);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(`${lang}: ${e.message}`));
    await page.goto(`chrome-extension://${extId}/popup.html`);
    await page.waitForFunction(() => window.popupInstance && window.popupInstance.detectorManager && window.popupInstance.detectorManager.initialized
      && window.popupInstance.settings && window.popupInstance.settings.settingsBaseline, null, { polling: 250, timeout: 30000 });
    await sleep(400);
    return page;
  }
  const click = (page, selector) => page.$eval(selector, el => el.click());
  async function openSettings(page, tab) {
    await click(page, '#settingsBtn');
    await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 250 });
    if (tab) await click(page, `.settings-tab-btn[data-settings-tab="${tab}"]`);
    await sleep(350);
  }
  const toastTexts = (page) => page.$$eval('.notification-toast[data-show="true"] .notification-message', els => els.map(el => el.textContent.trim()));
  const waitToast = (page, regex, ms = 8000) => page.waitForFunction((source) => [...document.querySelectorAll('.notification-toast .notification-message')]
    .some(el => new RegExp(source).test(el.textContent)), regex.source, { polling: 100, timeout: ms });
  const noToasts = (page, ms = 9000) => page.waitForFunction(() => document.querySelectorAll('.notification-toast').length === 0, null, { polling: 100, timeout: ms });
  const clearToasts = (page) => page.evaluate(() => document.querySelectorAll('.notification-toast').forEach(el => el.remove()));
  async function shot(page, name, clip) {
    if (!SHOTS) return;
    await sleep(350);
    await page.screenshot({ path: path.join(SHOTS, `${LABEL}-${name}.png`), ...(clip ? { clip } : {}) });
  }
  const close = async (page) => { await page.close(); };

  // The first load right after the browser starts can lose a startup fetch: open the popup once, unobserved
  await (await popup('en')).close();

  // ===============================================================================================
  await scenario('Notifications off: a preset, a copy and Copy diagnostics still answer with a toast', async () => {
    const page = await popup('en');
    try {
      await openSettings(page, 'data');
      await page.$eval('[data-preset="privacy"]', el => el.closest('.settings-card').querySelector('.data-card-head').click());
      await page.click('[data-preset="privacy"]');
      await page.waitForSelector('.notification-confirm .notification-btn-confirm');
      await click(page, '.notification-confirm .notification-btn-confirm');
      // The Privacy preset is what turns Notifications off
      await waitToast(page, new RegExp(say('en', 'presetApplied')), 8000);
      assert.equal((await page.evaluate(() => StorageManager.readSettingsStrict())).notificationsEnabled, false, 'Notifications are off now');
      await clearToasts(page);

      // Copy data, Copy as Markdown and the Detection copy menu all end in FormatUtils.copyToClipboard
      await page.evaluate(() => { navigator.clipboard.writeText = async () => {}; });
      await page.evaluate(() => FormatUtils.copyToClipboard('hello'));
      await waitToast(page, new RegExp(`^${say('en', 'copiedNotification')}$`), 4000);
      await clearToasts(page);

      await page.$eval('#copyDiagnosticsBtn', el => el.closest('.settings-card').querySelector('.data-card-head').click());
      await page.waitForSelector('#copyDiagnosticsBtn', { state: 'visible' });
      await page.click('#copyDiagnosticsBtn');
      await waitToast(page, new RegExp(say('en', 'diagnosticsCopied')), 8000);
    } finally {
      await W(() => SettingsStore.mutate({ operation: 'patch', patch: { notificationsEnabled: true } }).then(r => r.success === true));
      await close(page);
    }
  });

  // ===============================================================================================
  await scenario('an update check that says four things shows all four, each for its whole time, two at a time', async () => {
    const page = await popup('en');
    try {
      await page.evaluate(() => {
        // What Settings → Check now does with the result of an update check (settings-ui-updates.js)
        const result = { error: null, errorCode: null, release: 'v3.1.2', installed: [{ name: 'F5' }], needsDecision: [{ name: 'Cloudflare' }],
          incompatible: [{ name: 'Kasada', minExtensionVersion: '3.2.0' }], failed: [{ id: 'detect-a', name: 'A' }] };
        window.__seen = new Map();
        window.__most = 0;
        const t0 = performance.now();
        window.__t0 = t0;
        window.__recorder = setInterval(() => {
          const now = [...document.querySelectorAll('.notification-toast[data-show="true"] .notification-message')].map(el => el.textContent);
          window.__most = Math.max(window.__most, now.length);
          for (const text of now) {
            const entry = window.__seen.get(text) || { first: performance.now() - t0, last: 0 };
            entry.last = performance.now() - t0;
            window.__seen.set(text, entry);
          }
        }, 40);
        for (const message of UpdateManager.resultMessages(result, { t: FormatUtils.t, list: FormatUtils.formatList, mentionEdited: true })) {
          NotificationHelper[message.type](message.text, message.type === 'success' ? {} : { duration: 8000 });
        }
      });
      // Until the last one has gone (about 17 s when each is shown for its whole time)
      await page.waitForFunction(() => performance.now() - window.__t0 > 1500 && !document.querySelector('.notification-toast'), null, { polling: 100, timeout: 30000 });
      const { seen, most } = await page.evaluate(() => { clearInterval(window.__recorder); return { seen: [...window.__seen], most: window.__most }; });
      console.log(`      on screen: ${seen.map(([text, t]) => `"${text.slice(0, 28)}…" ${Math.round(t.first)}–${Math.round(t.last)} ms`).join(' | ')}; most at once ${most}`);
      assert.equal(seen.length, 4, 'every message was on screen');
      assert.ok(most <= 2, `${most} at once`);
      const lasted = (pattern) => { const [, t] = seen.find(([text]) => pattern.test(text)); return t.last - t.first; };
      assert.ok(lasted(/updated from release/) >= 2850, `the success note: ${lasted(/updated from release/)} ms`);
      for (const pattern of [/Waiting for extension/, /Could not download/, /wait for your decision/]) {
        assert.ok(lasted(pattern) >= 7850, `${pattern} stays 8 s: ${lasted(pattern)} ms`);
      }
    } finally {
      await close(page);
    }
  });

  await scenario('Restore official: the failure message stays on screen while the notes after it wait for a place', async () => {
    const page = await popup('en');
    try {
      await page.evaluate(() => {
        NotificationHelper.error('Could not restore: Kasada');
        NotificationHelper.success('DataDome restored');
        NotificationHelper.info('Run Rules → Update to install the rest.');
      });
      await sleep(600);
      assert.deepEqual(await toastTexts(page), ['Could not restore: Kasada', 'DataDome restored'], 'two places; the third waits');
      await sleep(4100);
      const late = await toastTexts(page);
      assert.ok(late.includes('Could not restore: Kasada'), `the error at 4.7 s: ${late.join(' | ')}`);
      assert.ok(late.includes('Run Rules → Update to install the rest.'), 'the last note took the success note\'s place');
      await noToasts(page);
    } finally {
      await close(page);
    }
  });

  // ===============================================================================================
  await scenario('the time of a toast stands still under the pointer and in the keyboard focus, and goes on when they leave', async () => {
    const page = await popup('en');
    try {
      const barWidth = () => page.$eval('.notification-toast .notification-progress-bar', el => parseFloat(getComputedStyle(el).width) / parseFloat(getComputedStyle(el.parentElement).width));
      await page.evaluate(() => NotificationHelper.success('Settings saved'));
      await page.waitForSelector('.notification-toast[data-show="true"]');
      await sleep(900);
      await page.hover('.notification-toast');
      const frozen = await barWidth();
      await sleep(4200); // longer than its 3 s
      assert.deepEqual(await toastTexts(page), ['Settings saved'], 'still there under the pointer');
      assert.ok(Math.abs(await barWidth() - frozen) < 0.02, 'and its line has not moved');
      assert.ok(frozen > 0.4 && frozen < 0.9, `the line stopped part of the way: ${frozen.toFixed(2)}`);
      await page.mouse.move(5, 590);
      await sleep(1000);
      assert.deepEqual(await toastTexts(page), ['Settings saved'], 'what was left still runs (about 2 s)');
      await noToasts(page, 4000);

      // Keyboard: the close button takes focus
      await page.evaluate(() => NotificationHelper.warning('Check the address', { duration: 2000 }));
      await page.waitForSelector('.notification-toast[data-show="true"] .notification-close');
      await page.focus('.notification-toast .notification-close');
      await sleep(3200);
      assert.deepEqual(await toastTexts(page), ['Check the address'], 'still there with the focus in it');
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await noToasts(page, 5000);
    } finally {
      await close(page);
    }
  });

  // ===============================================================================================
  const measurePicker = () => {
    const rect = (el) => { const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), r: +b.right.toFixed(1), w: +b.width.toFixed(1) }; };
    const picker = document.querySelector('#settingsModal .settings-row--language .language-picker');
    const menu = picker.querySelector('.language-picker-menu');
    const body = document.querySelector('#settingsModal .modal-body');
    return { picker: rect(picker), menu: rect(menu), body: rect(body), hidden: menu.hidden, sideways: body.scrollWidth - body.clientWidth };
  };
  for (const lang of ['en', 'ar']) {
    await scenario(`${lang}: the list of languages opens from the picker's outer edge and stays inside the dialog`, async () => {
      const page = await popup(lang);
      try {
        await openSettings(page, 'general');
        await page.evaluate(() => document.querySelector('.language-picker-trigger').click());
        await sleep(450);
        const g = await page.evaluate(measurePicker);
        console.log(`      ${lang} picker ${JSON.stringify(g)}`);
        await shot(page, `language-picker-${lang}`); // before the checks: a failing run still leaves its picture
        assert.equal(g.hidden, false, 'the list is open');
        if (lang === 'ar') assert.ok(Math.abs(g.menu.l - g.picker.l) <= 1, `Arabic: the list starts at the picker's left edge (${g.menu.l} vs ${g.picker.l})`);
        else assert.ok(Math.abs(g.menu.r - g.picker.r) <= 1, `English: the list ends at the picker's right edge (${g.menu.r} vs ${g.picker.r})`);
        assert.ok(g.menu.l >= g.body.l - 0.5 && g.menu.r <= g.body.r + 0.5, `inside the dialog's body: list ${g.menu.l}–${g.menu.r}, body ${g.body.l}–${g.body.r}`);
        assert.ok(g.sideways <= 0, `the body does not scroll sideways: ${g.sideways}px`);
      } finally {
        await close(page);
      }
    });
  }

  for (const lang of ['en', 'ar']) {
    await scenario(`${lang}: the connector of the How it works steps joins the numbers`, async () => {
      const page = await popup(lang);
      try {
        await page.evaluate(() => window.popupInstance.switchTab('advanced'));
        await sleep(700);
        await page.evaluate(() => window.popupInstance.advanced.openAdvancedInfoModal());
        await sleep(500);
        const g = await page.evaluate(() => {
          const step = document.querySelector('#advancedInfoModal .advanced-info-step');
          step.scrollIntoView({ block: 'center' });
          const number = step.querySelector('.advanced-info-step-number').getBoundingClientRect();
          const box = step.getBoundingClientRect();
          const line = getComputedStyle(step, '::after');
          return { numberCenter: +((number.left + number.right) / 2).toFixed(1), lineCenter: +(box.left + parseFloat(line.left) + parseFloat(line.width) / 2).toFixed(1) };
        });
        console.log(`      ${lang} info steps ${JSON.stringify(g)}`);
        await shot(page, `advanced-info-${lang}`);
        assert.ok(Math.abs(g.lineCenter - g.numberCenter) <= 1, `the connector runs through the number's centre (${g.lineCenter} vs ${g.numberCenter})`);
      } finally {
        await close(page);
      }
    });
  }

  for (const lang of ['en', 'ar']) {
    await scenario(`${lang}: the dots of the Rules help dialogs come before the text`, async () => {
      const page = await popup(lang);
      try {
        await page.evaluate(() => window.popupInstance.switchTab('rules'));
        await sleep(900);
        await click(page, '#addDetectorBtn');
        await page.waitForSelector('#saveRuleEdit', { state: 'attached', timeout: 8000 });
        await sleep(500);
        await page.evaluate(() => window.popupInstance.rules.openMethodHelpModal('cookie'));
        await sleep(600);
        const g = await page.evaluate(() => {
          const item = document.querySelector('#methodHelpContent .rh-bullets li');
          item.scrollIntoView({ block: 'center' });
          const box = item.getBoundingClientRect();
          const style = getComputedStyle(item);
          const dot = getComputedStyle(item, '::before');
          const dotCenter = box.left + parseFloat(dot.left) + parseFloat(dot.width) / 2;
          return { fromStart: +(style.direction === 'rtl' ? box.right - dotCenter : dotCenter - box.left).toFixed(1),
            padStart: style.direction === 'rtl' ? style.paddingRight : style.paddingLeft, padEnd: style.direction === 'rtl' ? style.paddingLeft : style.paddingRight, dir: style.direction };
        });
        console.log(`      ${lang} bullets ${JSON.stringify(g)}`);
        await shot(page, `rules-helper-${lang}`);
        assert.equal(g.dir, lang === 'ar' ? 'rtl' : 'ltr');
        assert.ok(g.fromStart > 0 && g.fromStart <= 4, `the dot is at the start of the line: ${g.fromStart}px from it`);
        assert.equal(g.padStart, '12px', 'the room for the dot is at the start');
        assert.equal(g.padEnd, '0px');
      } finally {
        await close(page);
      }
    });
  }

  for (const lang of ['en', 'ar']) {
    await scenario(`${lang}: a toast has its type line, its padding and its close button on the sides of the reading direction`, async () => {
      const page = await popup(lang);
      try {
        const needs = await page.evaluate(() => FormatUtils.t('updateResultNeedsExtensionFmt', 'Waiting for extension {0} or newer: {1}. They install once Chrome updates the extension.', '3.2.0', 'Kasada, X'));
        const copied = await page.evaluate(() => FormatUtils.t('copiedNotification', 'Copied'));
        // Until they are closed: a still picture (no moving line, no sliding)
        await page.evaluate(([a, b]) => { NotificationHelper.warning(a, { duration: 0 }); NotificationHelper.success(b, { duration: 0 }); }, [needs, copied]);
        await page.waitForSelector('.notification-toast[data-show="true"]');
        await sleep(450);
        const g = await page.evaluate(() => {
          const toast = document.querySelector('.notification-toast');
          const box = toast.getBoundingClientRect();
          const message = toast.querySelector('.notification-message').getBoundingClientRect();
          const closeBox = toast.querySelector('.notification-close').getBoundingClientRect();
          const line = getComputedStyle(toast, '::before');
          const rtl = getComputedStyle(toast).direction === 'rtl';
          // The line is placed from the padding edge, inside the 1px border
          const lineCenter = box.left + toast.clientLeft + parseFloat(line.left) + parseFloat(line.width) / 2;
          return { rtl, viewport: window.innerWidth, toast: { l: +box.left.toFixed(1), r: +box.right.toFixed(1) },
            lineFromStart: +(rtl ? box.right - lineCenter : lineCenter - box.left).toFixed(1),
            textFromStart: +(rtl ? box.right - message.right : message.left - box.left).toFixed(1),
            closeFromEnd: +(rtl ? closeBox.left - box.left : box.right - closeBox.right).toFixed(1),
            closeCenter: +((closeBox.left + closeBox.right) / 2).toFixed(1), toastCenter: +((box.left + box.right) / 2).toFixed(1) };
        });
        console.log(`      ${lang} toast ${JSON.stringify(g)}`);
        await shot(page, `toast-${lang}`, { x: 0, y: 0, width: 400, height: 190 });
        if (lang === 'ar') {
          assert.ok(g.rtl);
          assert.ok(Math.abs(g.toast.l - 10) <= 1, `the stack is at the left, the end of the line: ${g.toast.l}`);
          assert.ok(g.closeCenter < g.toastCenter, 'the close button is at the left, the end');
        } else {
          assert.ok(Math.abs(g.viewport - 10 - g.toast.r) <= 1, `the stack is at the right: ${g.toast.r}`);
          assert.ok(g.closeCenter > g.toastCenter, 'the close button is at the right');
        }
        assert.ok(Math.abs(g.lineFromStart - 2.5) <= 1, `the type line is at the start edge (${lang === 'ar' ? 'right' : 'left'}): ${g.lineFromStart}px from it`);
        assert.ok(g.textFromStart >= 13 && g.textFromStart <= 15, `the text starts past the type line: ${g.textFromStart}px`);
        assert.ok(g.closeFromEnd >= 4 && g.closeFromEnd <= 8, `the close button is 6px from the end: ${g.closeFromEnd}px`);
      } finally {
        await close(page);
      }
    });
  }

  // ===============================================================================================
  await scenario('Arabic: the arrow of a change points from the first value to the second, and its sign stays on the left', async () => {
    const page = await popup('ar');
    try {
      const g = await page.evaluate(() => {
        const text = I18n.format('historyCompareChangeFmt', 70, 95, '+25');
        document.body.innerHTML = '';
        document.body.style.cssText = 'background:#1a1a1a;color:#eee;padding:16px;font-size:16px';
        const el = document.createElement('div');
        el.setAttribute('dir', 'rtl');
        el.lang = 'ar';
        el.id = 'compareProbe';
        el.textContent = text;
        document.body.appendChild(el);
        const node = el.firstChild;
        const at = (needle) => { const i = text.indexOf(needle); const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1); return +r.getBoundingClientRect().left.toFixed(1); };
        const arrow = text.includes('←') ? '←' : '→';
        return { text, arrow: arrow === '←' ? 'left' : 'right', first: at('7'), arrowX: at(arrow), second: at('9'), sign: at('+'), digit: at('2') };
      });
      console.log(`      ar change ${JSON.stringify(g)}`);
      await shot(page, 'compare-ar', { x: 0, y: 0, width: 400, height: 70 });
      assert.ok(g.first > g.second, 'the first value is at the right, where an Arabic line starts');
      assert.equal(g.arrow, 'left', 'the arrow points left, toward the second value');
      assert.ok(g.arrowX < g.first && g.arrowX > g.second, 'between the two values');
      assert.ok(g.sign < g.digit, `the sign is left of its digits ("+25", not "25+"): ${g.sign} vs ${g.digit}`);
    } finally {
      await close(page);
    }
  });

  for (const [lang, level, expected] of [['fr', 'High', null], ['zh_TW', 'High', null], ['en', 'High', 'Difficulty: High']]) {
    await scenario(`${lang}: the difficulty tip is titled the way the language writes "difficulty: level"`, async () => {
      const page = await popup(lang);
      try {
        const title = await page.evaluate((l) => FormatUtils.difficultyTip([{ detector: { name: 'hCaptcha' }, category: 'CAPTCHA', confidence: 90, difficulty: 'High' }], l).title, level);
        const wanted = expected || say(lang, 'clipboardDifficultyFmt').replace('{0}', say(lang, `difficulty${level}`));
        assert.equal(title, wanted);
        console.log(`      ${lang}: "${title}"`);
      } finally {
        await close(page);
      }
    });
  }

  // ---- Report ----------------------------------------------------------------------------------------
  const failed = results.filter(r => !r.ok);
  if (pageErrors.length) console.log(`Page errors:\n  ${pageErrors.join('\n  ')}`);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  console.log(failed.length || pageErrors.length ? 'RESULT FAILED' : `RESULT ALL PASS (${results.length} scenarios)`);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(failed.length || pageErrors.length ? 1 : 0);
})().catch((error) => { console.error(error); process.exit(1); });
