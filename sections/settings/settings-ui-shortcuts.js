// Settings → General → Keyboard shortcuts: shows the rescan shortcut the browser
// has for it (the person may have changed it) and opens the browser's shortcut page.
// Requires settings-ui.js to load first.

SettingsUI.SHORTCUTS_PAGE = 'chrome://extensions/shortcuts';

/** "Alt+Shift+S", or the "not set" text when the browser has none for it. */
SettingsUI.shortcutText = function(commands, name) {
  const command = Array.isArray(commands) ? commands.find(c => c && c.name === name) : null;
  const key = command && typeof command.shortcut === 'string' ? command.shortcut.trim() : '';
  return key || FormatUtils.t('settingsShortcutNotSet', 'not set');
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
  const text = FormatUtils.t('settingsShortcutRescanFmt', 'Scan this page again: {0}', SettingsUI.shortcutText(commands, 'rescan-tab'));
  line.textContent = text;
  return text;
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
