#!/usr/bin/env node
/**
 * 3.1.4 Settings and data fixes, in the real extension (unpacked in Chromium):
 *
 *   Close guard      Esc, ✕ and a click outside Settings ask before dropping edits that are not saved (Save, Discard, Cancel); nothing is
 *                    asked when nothing changed, on any tab; Cancel closes at once; Esc inside the question closes only the question
 *   Invalid values   a Save that finds one keeps its message and goes to the field: its tab, its folded card, focus, aria-invalid
 *   Privacy preset   lists the automatic update check, turns it off, and the update alarm goes with it
 *   Backup           an official rule switched off is in the file and comes back off; the theme travels; the restore dialog says what a
 *                    backup never holds; the webhook address stays out of the file
 *   Counts           the History meter says "entries: 1" for one entry; in Russian a retention counts "2 дня" and sizes use "2,1 MB"
 *
 * Not part of `npm run verify`: it needs Playwright and its Chromium.
 *   npm i --no-save playwright && npx playwright install chromium
 *   node scripts/e2e-v314-settings-data.js [repository] [--shots <folder>]
 * --shots writes screenshots of the new dialogs (light, dark, right to left) to the folder.
 */
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (_) {
  console.error('Playwright is not installed: npm i --no-save playwright && npx playwright install chromium');
  process.exit(2);
}
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const args = process.argv.slice(2);
const shotsAt = args.includes('--shots') ? path.resolve(args[args.indexOf('--shots') + 1]) : null;
const REPO = path.resolve(args.find((arg, index) => !arg.startsWith('--') && args[index - 1] !== '--shots') || path.join(__dirname, '..'));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-v314-settings-data-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      headless: true, channel: 'chromium', viewport: { width: 420, height: 650 }, acceptDownloads: true,
      args: [`--disable-extensions-except=${REPO}`, `--load-extension=${REPO}`]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).host;
    // Automatic rule downloads belong to e2e-updater: this profile never reaches GitHub
    await worker.evaluate(() => { UpdateManager.runAutoUpdate = async () => ({ testOnly: true }); });
    const W = (fn, arg) => worker.evaluate(fn, arg);
    if (shotsAt) fs.mkdirSync(shotsAt, { recursive: true });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const boot = async () => {
      await page.goto(`chrome-extension://${extensionId}/popup.html`);
      await page.waitForFunction(() => window.popupInstance?.settings?.settingsBaseline && window.popupInstance?.detectorManager?.initialized, null, { polling: 250 });
      // The error toasts, for the messages a failed Save keeps
      await page.evaluate(() => {
        window.__toasts = [];
        const original = NotificationHelper.error.bind(NotificationHelper);
        NotificationHelper.error = (...a) => { window.__toasts.push(String(a[0])); return original(...a); };
      });
    };
    const get = (keys) => W((list) => chrome.storage.local.get(list), keys);
    const stored = () => page.evaluate(() => StorageManager.readSettingsStrict());
    const patch = (value) => page.evaluate(async (v) => { if (!await StorageManager.patchSettings(v)) throw new Error('fixture failed'); }, value);
    const click = (selector) => page.$eval(selector, element => element.click());
    // A change as a person makes it: the value, then the events the form listens to
    const setValue = (selector, value) => page.$eval(selector, (element, v) => {
      element.value = v;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    const isOpen = () => page.$eval('#settingsModal', element => element.classList.contains('is-open'));
    const waitClosed = () => page.waitForFunction(() => !document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 100, timeout: 8000 });
    const openSettings = async () => {
      if (!await isOpen()) {
        await click('#settingsBtn');
        await page.waitForFunction(() => document.querySelector('#settingsModal').classList.contains('is-open'), null, { polling: 100 });
      }
      // The form is painted from storage once it has been read: edit after that, not before
      await page.evaluate(() => window.popupInstance.settings.loadSettings());
    };
    const tab = async (name) => { await click(`.settings-tab-btn[data-settings-tab="${name}"]`); await sleep(250); };
    const questions = () => page.$$eval('.notification-confirm[data-open="true"]', dialogs => dialogs.length);
    const waitQuestion = () => page.waitForSelector('.notification-confirm[data-open="true"]', { timeout: 8000 });
    const waitNoQuestion = () => page.waitForFunction(() => document.querySelectorAll('.notification-confirm[data-open="true"]').length === 0, null, { polling: 100, timeout: 8000 });
    const pick = async (label) => {
      await page.evaluate((text) => {
        const button = [...document.querySelectorAll('.notification-confirm[data-open="true"] .notification-btn')].find(item => item.textContent.trim() === text);
        if (!button) throw new Error(`no "${text}" button`);
        button.click();
      }, label);
      await waitNoQuestion();
    };
    const questionText = () => page.$eval('.notification-confirm[data-open="true"]', element => element.textContent.replace(/\s+/g, ' ').trim());
    const buttonLabels = () => page.$$eval('.notification-confirm[data-open="true"] .notification-btn', items => items.map(item => item.textContent.trim()));
    const focusedId = () => page.evaluate(() => document.activeElement && document.activeElement.id);
    const snap = async (name) => { if (shotsAt) await page.screenshot({ path: path.join(shotsAt, `${name}.png`) }); };
    const dismissAll = async () => {
      if (await questions()) await pick('Cancel');
      if (await isOpen()) { await click('#cancelSettingsBtn'); await waitClosed(); }
    };

    await boot();
    await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await patch({
      detection: { cacheDuration: 7, cacheUnit: 'days' }, history: { historyLimit: 0 },
      updates: { autoUpdate: false, checkIntervalHours: 168 },
      webhook: { enableWebhook: false, webhookUrl: 'https://hooks.example/SYNTHETIC_SAVED', webhookSecret: 'SYNTHETIC_SECRET_SAVED' }
    });
    await boot();

    // ---- UI-02: the close guard ---------------------------------------------------------------------------------------
    // Nothing changed: every way out closes at once, whichever tabs were looked at, and no question is asked
    await openSettings();
    for (const name of ['general', 'detection', 'history', 'data']) await tab(name);
    await page.evaluate(() => document.querySelectorAll('.settings-card.is-collapsed').forEach(card => card.classList.remove('is-collapsed')));
    await sleep(300);
    await page.keyboard.press('Escape');
    await waitClosed();
    assert.equal(await questions(), 0, 'Escape with nothing changed asks nothing');
    await openSettings();
    await click('#closeSettingsModal');
    await waitClosed();
    assert.equal(await questions(), 0, '✕ with nothing changed asks nothing');
    await openSettings();
    await click('#settingsModal .base-modal-backdrop');
    await waitClosed();
    assert.equal(await questions(), 0, 'a click outside with nothing changed asks nothing');
    console.log('PASS with nothing changed, Esc, ✕ and a click outside close Settings at once, on every tab');

    // The scenario of the report: a cache duration and a webhook address changed, then Esc
    await openSettings();
    await tab('detection');
    await setValue('#cacheDuration', '3');
    await setValue('#webhookUrl', 'https://hooks.example/SYNTHETIC_EDIT');
    await page.keyboard.press('Escape');
    await waitQuestion();
    assert.equal(await isOpen(), true, 'Settings is still open under the question');
    const asked = await questionText();
    assert.ok(asked.includes('Unsaved settings'), asked);
    assert.ok(asked.includes('Your changes to the settings are not saved yet. Save them before closing?'), asked);
    assert.deepEqual(await buttonLabels(), ['Cancel', 'Discard', 'Save']);
    await snap('close-question-dark');
    // Esc inside the question closes only the question: Settings and the edits stay
    await page.keyboard.press('Escape');
    await waitNoQuestion();
    await sleep(300);
    assert.equal(await isOpen(), true, 'one Escape closed the question, not Settings too');
    assert.equal(await page.$eval('#cacheDuration', element => element.value), '3');
    assert.equal(await page.$eval('#webhookUrl', element => element.value), 'https://hooks.example/SYNTHETIC_EDIT');
    // Cancel in the question: the same
    await page.keyboard.press('Escape');
    await waitQuestion();
    await pick('Cancel');
    assert.equal(await isOpen(), true);
    assert.equal(await page.$eval('#cacheDuration', element => element.value), '3', 'Cancel keeps the edits');
    // ✕ and Discard: closed, and the next open shows what is saved
    await click('#closeSettingsModal');
    await waitQuestion();
    await pick('Discard');
    await waitClosed();
    await openSettings();
    await tab('detection');
    assert.equal(await page.$eval('#cacheDuration', element => element.value), '7', 'Discard: the saved cache duration is back');
    assert.equal(await page.$eval('#webhookUrl', element => element.value), 'https://hooks.example/SYNTHETIC_SAVED');
    assert.equal((await stored()).detection.cacheDuration, 7, 'nothing was written');
    assert.equal(await questions(), 0);
    // A click outside and Save: written, and closed
    await setValue('#cacheDuration', '3');
    await click('#settingsModal .base-modal-backdrop');
    await waitQuestion();
    await pick('Save');
    await waitClosed();
    assert.equal((await stored()).detection.cacheDuration, 3, 'Save in the question saved it');
    // The Cancel button says it already: no question, edits dropped
    await openSettings();
    await tab('detection');
    await setValue('#cacheDuration', '9');
    await click('#cancelSettingsBtn');
    await waitClosed();
    assert.equal(await questions(), 0, 'the Cancel button asks nothing');
    assert.equal((await stored()).detection.cacheDuration, 3);
    await openSettings();
    await tab('detection');
    assert.equal(await page.$eval('#cacheDuration', element => element.value), '3');
    console.log('PASS Esc, ✕ and a click outside ask before dropping edits (Cancel, Discard, Save), Esc in the question closes only it, the Cancel button closes at once');

    // ---- UI-02: invalid values show where --------------------------------------------------------------------------------
    await page.evaluate(() => { window.__toasts = []; });
    await tab('general');
    await setValue('#historyLimit', '-5');
    await click('#saveSettingsBtn');
    await page.waitForFunction(() => document.querySelector('.settings-tab-btn[data-settings-tab="history"]').classList.contains('active'), null, { polling: 100 });
    assert.equal(await isOpen(), true, 'Settings stays open');
    assert.equal(await focusedId(), 'historyLimit', 'the invalid field has the focus');
    assert.equal(await page.$eval('#historyLimit', element => element.getAttribute('aria-invalid')), 'true');
    assert.equal(await page.$eval('#historyLimit', element => element.closest('.settings-card').classList.contains('is-collapsed')), false, 'its card, folded when Settings opened, is open');
    assert.equal(await page.$eval('#historyLimit', element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0; }), true, 'and the field is displayed');
    assert.deepEqual(await page.evaluate(() => window.__toasts), ['Invalid settings: History limit must be between 0 (unlimited) and 10000'], 'the message is kept');
    assert.deepEqual(await page.$$eval('.settings-tab-btn.active', buttons => buttons.map(button => button.dataset.settingsTab)), ['history'], 'only the field\'s tab is selected');
    await sleep(400);
    await snap('invalid-field');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('25');
    assert.equal(await page.$eval('#historyLimit', element => element.getAttribute('aria-invalid')), null, 'editing takes the mark off');
    await click('#saveSettingsBtn');
    await waitClosed();
    assert.equal((await stored()).history.historyLimit, 25);
    // Esc, then Save in the question, with an invalid value: Settings stays open at the field
    await openSettings();
    await tab('general');
    await setValue('#cacheDuration', '0');
    await page.keyboard.press('Escape');
    await waitQuestion();
    await pick('Save');
    await page.waitForFunction(() => document.querySelector('.settings-tab-btn[data-settings-tab="detection"]').classList.contains('active'), null, { polling: 100 });
    assert.equal(await isOpen(), true);
    assert.equal(await focusedId(), 'cacheDuration');
    assert.equal(await page.$eval('#cacheDuration', element => element.getAttribute('aria-invalid')), 'true');
    assert.equal((await stored()).detection.cacheDuration, 3, 'an invalid value is never saved');
    await page.keyboard.press('Control+A');
    await page.keyboard.type('4');
    await click('#saveSettingsBtn');
    await waitClosed();
    assert.equal((await stored()).detection.cacheDuration, 4);
    // The mark does not come back with the next open
    await openSettings();
    assert.equal(await page.$eval('#cacheDuration', element => element.getAttribute('aria-invalid')), null);
    await dismissAll();
    console.log('PASS a Save that finds an invalid value goes to its tab, opens its card, focuses and marks the field, and keeps the message');

    // ---- P1: the Privacy preset turns off the automatic update check -----------------------------------------------------
    await patch({ updates: { autoUpdate: true, checkIntervalHours: 24 }, webhook: { enableWebhook: false } });
    await boot();
    const alarm = async (present) => {
      for (let waited = 0; waited < 8000; waited += 250) {
        const found = await W(() => chrome.alarms.get('scrapfly-update-check'));
        if (!!found === present) return found;
        await sleep(250);
      }
      throw new Error(`the update alarm is ${present ? 'missing' : 'still there'}`);
    };
    await alarm(true);
    await openSettings();
    await tab('data');
    await page.$eval('[data-preset="privacy"]', element => element.closest('.settings-card').querySelector('.data-card-head').click());
    await click('[data-preset="privacy"]');
    await waitQuestion();
    const preset = await questionText();
    assert.ok(preset.includes('Automatic update checks are off'), preset);
    await pick('Apply');
    await page.waitForFunction(() => window.popupInstance.settings.settings.updates.autoUpdate === false, null, { polling: 250 });
    const afterPreset = await stored();
    assert.equal(afterPreset.updates.autoUpdate, false);
    assert.equal(afterPreset.updates.checkIntervalHours, 24, 'only the switch changed');
    await alarm(false);
    // Applied again: nothing left to change
    await click('[data-preset="privacy"]');
    await sleep(600);
    assert.equal(await questions(), 0, 'nothing to ask the second time');
    await dismissAll();
    console.log('PASS the Privacy preset lists the automatic update check, turns it off, and the update alarm goes with it');

    // ---- B1 and R1: Back up and Restore ---------------------------------------------------------------------------------
    // (the Privacy preset turned notifications off and History off: back to what the rest of this run expects)
    await patch({ notificationsEnabled: true, history: { historyEnabled: true, historyClearOnClose: false }, updates: { autoUpdate: false } });
    await boot();
    const dm = {
      setOfficial: (enabled) => page.evaluate(async (on) => {
        const manager = window.popupInstance.detectorManager;
        manager.getDetector('antibot', 'detect-akamai').enabled = on;
        await manager.saveDetectorsToStorage();
      }, enabled),
      enabled: () => page.evaluate(() => window.popupInstance.detectorManager.findDetectorById('detect-akamai').enabled)
    };
    const theme = () => page.evaluate(() => ({ chosen: ScrapflyTheme.get(), shown: document.documentElement.getAttribute('data-theme'), select: document.querySelector('#themeChoice').value }));
    const backupCard = () => page.$eval('#backUpEverythingBtn', element => element.closest('.settings-card').querySelector('.data-card-head').click());
    const restoreFrom = (text) => page.setInputFiles('#restoreBackupFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await page.evaluate(() => ScrapflyTheme.set('light'));
    await dm.setOfficial(false);
    assert.equal(await dm.enabled(), false);
    await openSettings();
    await tab('data');
    await backupCard();
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#backUpEverythingBtn')]);
    const fileText = fs.readFileSync(await download.path(), 'utf8');
    const bundle = JSON.parse(fileText);
    assert.equal(bundle.theme, 'light', 'the theme is in the file');
    assert.deepEqual(Object.keys(bundle.detectors.detectors), ['antibot']);
    assert.deepEqual(Object.keys(bundle.detectors.detectors.antibot), ['detect-akamai'], 'the official rule that is off is in the file, the other 85 are not');
    assert.equal(bundle.detectors.detectors.antibot['detect-akamai'].enabled, false);
    for (const secret of ['SYNTHETIC', 'hooks.example']) assert.ok(!fileText.includes(secret), `the backup leaks ${secret}`);
    console.log('PASS Back up writes the official rule that is switched off and the theme, and no connection detail');

    // The rule is on again and the theme is dark: Restore brings both back
    await dm.setOfficial(true);
    await page.evaluate(() => ScrapflyTheme.set('dark'));
    await boot();
    await openSettings();
    await tab('data');
    await backupCard();
    await restoreFrom(fileText);
    await page.waitForSelector('.notification-confirm input[data-part]');
    const restoreAsk = await questionText();
    assert.ok(restoreAsk.includes('Your rules (1)'), restoreAsk);
    assert.ok(restoreAsk.includes('Not part of a backup: webhook and sharing details, and which History pages are watched.'), restoreAsk);
    await sleep(400);
    await snap('restore-note-dark');
    await pick('Restore');
    await page.waitForFunction(() => /Restored: /.test(document.body.textContent), null, { polling: 250, timeout: 15000 });
    assert.deepEqual(await theme(), { chosen: 'light', shown: 'light', select: 'light' }, 'the theme is back, applied at once, and the list shows it');
    assert.equal((await get(['scrapfly_theme'])).scrapfly_theme, 'light', 'and saved');
    await boot();
    assert.equal(await dm.enabled(), false, 'the official rule is switched off again after the restore');
    // A backup from before the theme travelled leaves the theme alone
    await page.evaluate(() => ScrapflyTheme.set('dark'));
    const older = { ...bundle };
    delete older.theme;
    await openSettings();
    await tab('data');
    await backupCard();
    await restoreFrom(JSON.stringify(older));
    await page.waitForSelector('.notification-confirm input[data-part]');
    await pick('Restore');
    await page.waitForFunction(() => /Restored: /.test(document.body.textContent), null, { polling: 250, timeout: 15000 });
    assert.equal((await theme()).chosen, 'dark', 'no theme in the file: the theme stays');
    await dismissAll();
    // The right-to-left and light looks of the note
    if (shotsAt) {
      await page.evaluate(() => ScrapflyTheme.set('light'));
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'ar' }));
      await boot();
      await openSettings();
      await tab('data');
      await backupCard();
      await restoreFrom(fileText);
      await page.waitForSelector('.notification-confirm input[data-part]');
      await sleep(400);
      await snap('restore-note-ar-light');
      await pick((await buttonLabels())[0]);
      await page.evaluate(() => ScrapflyTheme.set('dark'));
      await tab('general');
      await setValue('#cacheDuration', '5');
      await page.keyboard.press('Escape');
      await waitQuestion();
      await sleep(400);
      await snap('close-question-ar-dark');
      await page.evaluate(() => ScrapflyTheme.set('light'));
      await sleep(300);
      await snap('close-question-ar-light');
      await pick((await buttonLabels())[0]);
      await dismissAll();
      await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
      await boot();
      await openSettings();
      await page.evaluate(() => ScrapflyTheme.set('light'));
      await tab('general');
      await setValue('#cacheDuration', '5');
      await page.keyboard.press('Escape');
      await waitQuestion();
      await sleep(400);
      await snap('close-question-light');
      await pick('Cancel');
      await dismissAll();
      await page.evaluate(() => ScrapflyTheme.set('dark'));
    }
    console.log('PASS Restore brings back the rule that was switched off and the theme, says what a backup never holds, and leaves the theme alone when the file has none');

    // ---- UI-07: counts ----------------------------------------------------------------------------------------------------
    const entry = (id) => ({ id, url: `https://${id}.example/`, hostname: `${id}.example`, title: id, timestamp: Date.now() - 1000,
      detections: [{ detector: { name: 'X' }, category: 'Anti-Bot', confidence: 90 }], detectionCount: 1, categories: ['Anti-Bot'] });
    await W((items) => chrome.storage.local.set({ scrapfly_history: JSON.stringify({ items }) }), [entry('one-page')]);
    await boot();
    await openSettings();
    await tab('history');
    await page.waitForFunction(() => /entries: \d+/.test(document.querySelector('#historyMeterText').textContent), null, { polling: 250, timeout: 8000 });
    assert.match(await page.$eval('#historyMeterText', element => element.textContent), /^\d+ KB of \d+\.\d MB used · entries: 1$/, 'one entry is "entries: 1", not "1 entries"');
    await dismissAll();
    // Russian: the retention counts as Russian does, and sizes use the decimal comma
    await W(() => chrome.storage.local.set({ scrapfly_language_override: 'ru' }));
    await boot();
    const russian = await page.evaluate(() => ({
      locale: I18n.locale(),
      days: [2, 3, 5].map(count => CaptureRetention.label(count * 1440, (key, fallback) => I18n.get(key) || fallback)),
      minutes: [1, 2, 5].map(count => CaptureRetention.label(count, (key, fallback) => I18n.get(key) || fallback)),
      size: SettingsUI.formatStorageSize(2.14 * 1048576),
      matches: I18n.format('historyMatchCountFmt', 3),
      patterns: I18n.format('methodPatternsFmt', 4)
    }));
    assert.equal(russian.locale, 'ru');
    assert.deepEqual(russian.days, ['2 дня', '3 дня', '5 дней']);
    assert.deepEqual(russian.minutes, ['1 минута', '2 минуты', '5 минут']);
    assert.equal(russian.size, '2,1 MB');
    assert.equal(russian.matches, 'Совпадений: 3');
    assert.equal(russian.patterns, 'Шаблонов: 4');
    await W(() => chrome.storage.local.set({ scrapfly_language_override: 'en' }));
    await boot();
    console.log('PASS the History meter says "entries: 1" for one entry; in Russian a retention counts "2 дня" and sizes use "2,1 MB"');

    assert.deepEqual(errors, [], `page errors: ${errors.join(' | ')}`);
    console.log('ALL PASS');
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(profile, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
