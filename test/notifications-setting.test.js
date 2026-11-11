const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Settings → Notifications is one switch. What it really gates is what the worker raises through chrome.notifications: the History
// change alert, the "History is almost full" notice and the failed-backup notice. Its text used to say "Show alerts when security
// systems are detected", which no code path does. The text now names what the switch gates, and this test fails when the extension
// gains another browser notification that ignores the switch (or one of the three loses its gate), so text and code cannot drift apart.

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const KEY = 'settingsCardNotificationsDesc';

// Folders that ship in the package and can hold JavaScript (the rest is tests, tooling, data and assets)
const SHIPPED = ['background', 'modules', 'sections', 'utils', 'popup.js', 'content.js', 'content-main-world.js', 'background.js'];

function jsFiles(entry) {
  const full = path.join(root, entry);
  if (!fs.existsSync(full)) return [];
  if (fs.statSync(full).isFile()) return full.endsWith('.js') ? [entry] : [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(item => jsFiles(path.posix.join(entry, item.name)));
}

/** Every file that raises a browser notification: how many calls it makes and how many times it reads the switch. */
function notificationSources() {
  const found = {};
  for (const file of SHIPPED.flatMap(jsFiles)) {
    const source = read(file);
    // `notifications.create(` and `notifications?.create(`; a mere check that the API exists (`!chrome.notifications.create)`) is not a call
    const calls = (source.match(/\bnotifications\??\.create\(/g) || []).length;
    if (!calls) continue;
    found[file] = { calls, gates: (source.match(/\.notificationsEnabled === false/g) || []).length };
  }
  return found;
}

// Not behind the switch, and not one of the three notices its text names: the Advanced capture tools draw their status inside the
// page, and when that cannot be done (a page scripts cannot reach) the same text goes out as a browser notification instead.
const FALLBACKS = { 'background/advanced/page-notice.js': 1 };

test('every browser notification the extension raises is behind Settings → Notifications, except the capture tools\' fallback', () => {
  const sources = notificationSources();
  assert.deepEqual(Object.keys(sources).sort(), [
    'background/advanced/page-notice.js',
    'background/history-backup.js',
    'background/history-recorder.js'
  ], 'the files that raise a notification: a new one has to answer to the switch, and to the text, before it is listed here');
  for (const [file, { calls, gates }] of Object.entries(sources)) {
    if (FALLBACKS[file] !== undefined) {
      assert.equal(calls, FALLBACKS[file], `${file}: the fallback is still the only notification there`);
      assert.equal(gates, 0, `${file}: it reads the switch now, so it is no longer a fallback that ignores it: update FALLBACKS and the text`);
    } else {
      assert.ok(gates >= calls, `${file}: ${calls} notification(s) but the switch is read ${gates} time(s)`);
    }
  }
  // Which three: the change alert and the storage notice (History recorder) and the failed backup
  assert.equal(sources['background/history-recorder.js'].calls, 2);
  assert.equal(sources['background/history-backup.js'].calls, 1);
});

test('the text names what the switch controls, and no longer promises alerts on detection', () => {
  const english = JSON.parse(read('_locales/en/messages.json'))[KEY].message;
  assert.match(english, /protections change/, 'the History change alert');
  assert.match(english, /History is almost full/, 'the storage notice');
  assert.match(english, /backup fails/, 'the failed backup');
  assert.doesNotMatch(english, /detect/i, 'nothing is raised when a protection is detected');
});

test('the card title stays "Notifications"; every language has its own text, and it calls History by the word its History tab uses', () => {
  const english = JSON.parse(read('_locales/en/messages.json'));
  assert.equal(english.settingsCardNotifications.message, 'Notifications');
  for (const locale of fs.readdirSync(path.join(root, '_locales'))) {
    const messages = JSON.parse(read(`_locales/${locale}/messages.json`));
    const entry = messages[KEY];
    assert.ok(entry && typeof entry.message === 'string' && entry.message.trim(), `${locale} has it`);
    if (locale !== 'en') assert.notEqual(entry.message, english[KEY].message, `${locale} is translated`);
    // Not a translation check, a consistency one: the person reads "History" here and on the tab, so it is the same word
    const tag = locale.replace('_', '-');
    assert.ok(entry.message.toLocaleLowerCase(tag).includes(messages.tabHistory.message.toLocaleLowerCase(tag)),
      `${locale}: the text names History with the word of its tab ("${messages.tabHistory.message}")`);
  }
  assert.ok(read('sections/settings/settings.html').includes(`data-i18n="${KEY}"`), 'the Settings row shows this key');
});
