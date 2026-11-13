// Settings → General → Keyboard shortcuts: every shortcut there is. The browser's two (open the popup, scan this page
// again) with the keys the browser has for them now (the person may have changed them), the popup's own keys, and the
// button that opens the browser's shortcut page.
// Requires settings-ui.js to load first.

SettingsUI.SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';

/** "Alt+Shift+S", or the "not set" text when the browser has none for it. */
SettingsUI.shortcutText = function(commands, name) {
  const command = Array.isArray(commands) ? commands.find(c => c && c.name === name) : null;
  const key = command && typeof command.shortcut === 'string' ? command.shortcut.trim() : '';
  return key || FormatUtils.t('settingsShortcutNotSet', 'not set');
};

/** The popup's own keys: fixed, so they are written once here. The key text stays left to right in every language. */
SettingsUI.POPUP_SHORTCUTS = Object.freeze([
  { id: 'settingsShortcutSearch', key: 'settingsShortcutSearchFmt', fallback: 'Search the open tab: {0}', keys: '/' },
  { id: 'settingsShortcutHistory', key: 'settingsShortcutHistoryFmt', fallback: 'Move between History entries: {0}', keys: 'j / k, ↓ / ↑' },
  { id: 'settingsShortcutEscape', key: 'settingsShortcutEscapeFmt', fallback: 'Close a dialog: {0}', keys: 'Esc' }
]);

/** Fills a line "What it does: keys", the keys in a <kbd> isolated from the text direction. Returns the line's text. */
SettingsUI._fillShortcutLine = function(line, key, fallback, keys) {
  const marker = '\uE000';
  const [before, after = ''] = FormatUtils.t(key, fallback, marker).split(marker);
  const kbd = document.createElement('kbd');
  kbd.dir = 'ltr';
  kbd.textContent = keys;
  line.replaceChildren(before, kbd, after);
  return line.textContent;
};

SettingsUI.refreshShortcuts = async function() {
  const line = document.querySelector('#settingsShortcutRescan');
  if (!line) return '';
  let commands = [];
  try {
    if (chrome.commands && typeof chrome.commands.getAll === 'function') commands = await chrome.commands.getAll();
  } catch (_) {
    commands = [];
  }
  const open = document.querySelector('#settingsShortcutOpen');
  if (open) SettingsUI._fillShortcutLine(open, 'settingsShortcutOpenFmt', 'Open the extension: {0}', SettingsUI.shortcutText(commands, '_execute_action'));
  for (const item of SettingsUI.POPUP_SHORTCUTS) {
    const target = document.querySelector(`#${item.id}`);
    if (target) SettingsUI._fillShortcutLine(target, item.key, item.fallback, item.keys);
  }
  return SettingsUI._fillShortcutLine(line, 'settingsShortcutRescanFmt', 'Scan this page again: {0}', SettingsUI.shortcutText(commands, 'rescan-tab'));
};

SettingsUI._setupShortcutListeners = function() {
  SettingsUI.refreshShortcuts();
  const button = document.querySelector('#openShortcutsBtn');
  if (button && !button.dataset.bound) {
    button.dataset.bound = '1';
    button.addEventListener('click', async () => {
      try {
        await chrome.tabs.create({ url: SettingsUI.SHORTCUTS_PAGE });
      } catch (error) {
        Logger.warn('UI', 'Could not open the shortcut settings:', error && error.message);
      }
    });
  }
};
