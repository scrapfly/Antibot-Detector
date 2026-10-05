// Custom language picker for settings (replaces native <select>).

// Requires settings-ui.js to load first.



SettingsUI.LANGUAGE_OPTIONS = [

  { value: 'auto', labelKey: 'settingsLanguageAuto', label: 'Use browser language' },

  { value: 'en', label: 'English' },

  { value: 'es', label: 'Español' },

  { value: 'pt_BR', label: 'Português (Brasil)' },

  { value: 'fr', label: 'Français' },

  { value: 'de', label: 'Deutsch' },

  { value: 'it', label: 'Italiano' },

  { value: 'ru', label: 'Русский' },

  { value: 'ja', label: '日本語' },

  { value: 'ko', label: '한국어' },

  { value: 'zh_CN', label: '简体中文' },

  { value: 'ar', label: 'العربية' },

  { value: 'hi', label: 'हिन्दी' }

];



SettingsUI._stripLeadingEmoji = function(text) {

  if (!text || typeof text !== 'string') return text;

  return text.replace(/^(\s*\p{Extended_Pictographic}\uFE0F?\s*)+/u, '').trim() || text;

};



SettingsUI._languageOptionLabel = function(option) {

  if (option.labelKey && typeof I18n !== 'undefined') {

    const translated = I18n.get(option.labelKey);

    if (translated) {

      return SettingsUI._stripLeadingEmoji(translated);

    }

  }

  return option.label;

};



SettingsUI._getLocaleFlagUrl = function(locale) {

  if (typeof UrlUtils === 'undefined' || typeof UrlUtils.getLocaleFlagUrl !== 'function') {

    return null;

  }

  return UrlUtils.getLocaleFlagUrl(locale, 40);

};



SettingsUI._languageFlagMarkup = function(option) {

  const url = SettingsUI._getLocaleFlagUrl(option.value);

  if (!url) {

    return '<span class="language-picker-flag-slot language-picker-flag-slot--empty" aria-hidden="true"></span>';

  }

  const safeUrl = FormatUtils.escapeHtml(url);

  return `<span class="language-picker-flag-slot" aria-hidden="true"><img class="language-picker-flag" src="${safeUrl}" width="22" height="16" alt="" loading="lazy" decoding="async"></span>`;

};



SettingsUI._applyLanguagePickerFlag = function(slotEl, locale) {

  if (!slotEl) return;



  const url = SettingsUI._getLocaleFlagUrl(locale);

  if (!url) {

    slotEl.innerHTML = '';

    slotEl.classList.add('language-picker-flag-slot--empty');

    return;

  }



  slotEl.classList.remove('language-picker-flag-slot--empty');

  let img = slotEl.querySelector('img.language-picker-flag');

  if (!img) {

    img = document.createElement('img');

    img.className = 'language-picker-flag';

    img.width = 22;

    img.height = 16;

    img.alt = '';

    img.loading = 'lazy';

    img.decoding = 'async';

    slotEl.appendChild(img);

  }

  img.src = url;

};



// BCP 47 tag of an option's own language ('zh_CN' -> 'zh-CN'); '' for 'auto',
// whose label is written in the UI language. Lets CSS pick the right Han
// glyph forms for the language names.
SettingsUI._languageTag = function(option) {

  return option && option.value !== 'auto' ? option.value.replace('_', '-') : '';

};



SettingsUI._setLanguageTag = function(el, option) {

  const tag = SettingsUI._languageTag(option);

  if (tag) el.setAttribute('lang', tag);

  else el.removeAttribute('lang');

};



SettingsUI._findLanguageOption = function(value) {

  return SettingsUI.LANGUAGE_OPTIONS.find((opt) => opt.value === value)

    || SettingsUI.LANGUAGE_OPTIONS[0];

};



// Option matching the browser UI language (used to label the 'auto' choice).

SettingsUI._resolveAutoLanguageOption = function() {

  let ui = '';

  try {

    ui = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || '';

  } catch (_) {

    ui = '';

  }

  const normalized = String(ui).replace('-', '_');

  const base = normalized.split('_')[0];

  return SettingsUI.LANGUAGE_OPTIONS.find((opt) => opt.value === normalized)

    || SettingsUI.LANGUAGE_OPTIONS.find((opt) => opt.value === base)

    || SettingsUI.LANGUAGE_OPTIONS.find((opt) => opt.value !== 'auto' && opt.value.split('_')[0] === base)

    || SettingsUI._findLanguageOption('en');

};



SettingsUI.setLanguagePickerValue = function(value) {

  const picker = document.querySelector('#languagePicker');

  const hidden = document.querySelector('#languageOverride');

  const labelEl = document.querySelector('#languagePickerLabel');

  const flagSlot = document.querySelector('#languagePickerFlagSlot');

  const menu = document.querySelector('#languagePickerMenu');

  if (!picker || !hidden) return;



  const choice = value || 'auto';

  hidden.value = choice;

  const option = SettingsUI._findLanguageOption(choice);

  // The compact 2.8 trigger shows a flag + language name even when following

  // the browser: 'auto' displays the language the browser resolves to, and

  // the menu keeps "Use browser language" as the selected entry.

  const shown = choice === 'auto' ? SettingsUI._resolveAutoLanguageOption() : option;



  SettingsUI._applyLanguagePickerFlag(flagSlot, shown.value);

  if (labelEl) {

    labelEl.textContent = SettingsUI._languageOptionLabel(shown);

    SettingsUI._setLanguageTag(labelEl, shown);

  }

  const trigger = document.querySelector('#languagePickerTrigger');

  if (trigger) {

    trigger.title = SettingsUI._languageOptionLabel(option);

  }



  if (menu) {

    menu.querySelectorAll('.language-picker-option').forEach((el) => {

      const selected = el.dataset.value === choice;

      el.classList.toggle('is-selected', selected);

      el.setAttribute('aria-selected', selected ? 'true' : 'false');

    });

  }

};



SettingsUI._syncLanguagePickerOpenState = function() {

  const picker = document.querySelector('#languagePicker');

  const card = document.querySelector('.settings-row--language');

  const isOpen = picker && picker.classList.contains('open');

  if (card) {

    card.classList.toggle('is-picker-open', !!isOpen);

  }

};



SettingsUI._closeLanguagePicker = function() {

  const picker = document.querySelector('#languagePicker');

  const trigger = document.querySelector('#languagePickerTrigger');

  const menu = document.querySelector('#languagePickerMenu');

  if (!picker || !menu) return;

  picker.classList.remove('open');

  menu.hidden = true;

  if (trigger) trigger.setAttribute('aria-expanded', 'false');

  SettingsUI._syncLanguagePickerOpenState();

};



SettingsUI._openLanguagePicker = function() {

  const picker = document.querySelector('#languagePicker');

  const trigger = document.querySelector('#languagePickerTrigger');

  const menu = document.querySelector('#languagePickerMenu');

  if (!picker || !menu) return;



  picker.classList.add('open');

  menu.hidden = false;

  if (trigger) trigger.setAttribute('aria-expanded', 'true');

  SettingsUI._syncLanguagePickerOpenState();



  menu.classList.remove('language-picker-menu--up');

  requestAnimationFrame(() => {

    const modalBody = picker.closest('.modal-body');

    if (!modalBody) return;

    const menuRect = menu.getBoundingClientRect();

    const bodyRect = modalBody.getBoundingClientRect();

    if (menuRect.bottom > bodyRect.bottom - 4) {

      modalBody.scrollTop += (menuRect.bottom - bodyRect.bottom) + 12;

    }

  });

};



SettingsUI._applyLanguageChoice = async function(choice) {

  SettingsUI.setLanguagePickerValue(choice);

  SettingsUI._closeLanguagePicker();



  try {

    await chrome.storage.local.set({ scrapfly_language_override: choice });

  } catch (err) {

    Logger.error('UI', 'Failed to save language override', err);

  }



  // Sections build most of their text in JS, so a partial refresh leaves

  // it in the old language: reload the popup and reopen Settings.

  SettingsUI.reloadForLanguageChange();

};



// Reload the popup after a language change, remembering the main tab and

// the Settings sub-tab so ScrapflyPopup.restoreAfterLanguageChange() can

// bring the user back to where they were.

SettingsUI.RELOAD_STATE_KEY = 'scrapfly_reopen_after_language';



SettingsUI.reloadForLanguageChange = function() {

  try {

    const activeSettingsTab = document.querySelector('.settings-tab-btn.active');

    sessionStorage.setItem(SettingsUI.RELOAD_STATE_KEY, JSON.stringify({

      tab: (window.popupInstance && window.popupInstance.currentTab) || null,

      settingsTab: activeSettingsTab ? activeSettingsTab.getAttribute('data-settings-tab') : null

    }));

  } catch (_) { /* sessionStorage unavailable: the popup opens on its default tab */ }

  location.reload();

};



SettingsUI.initLanguagePicker = function() {

  const picker = document.querySelector('#languagePicker');

  const menu = document.querySelector('#languagePickerMenu');

  const trigger = document.querySelector('#languagePickerTrigger');

  if (!picker || !menu || !trigger || picker.dataset.initialized === '1') {

    return;

  }

  picker.dataset.initialized = '1';



  menu.innerHTML = SettingsUI.LANGUAGE_OPTIONS.map((option) => {

    const label = SettingsUI._languageOptionLabel(option);

    return `<li class="language-picker-option" role="option" data-value="${option.value}" aria-selected="false">

      ${SettingsUI._languageFlagMarkup(option)}

      <span class="language-picker-option-label"${SettingsUI._languageTag(option) ? ` lang="${SettingsUI._languageTag(option)}"` : ''}>${FormatUtils.escapeHtml(label)}</span>

    </li>`;

  }).join('');



  const initial = document.querySelector('#languageOverride')?.value || 'auto';

  SettingsUI.setLanguagePickerValue(initial);



  trigger.addEventListener('click', (e) => {

    e.stopPropagation();

    if (picker.classList.contains('open')) {

      SettingsUI._closeLanguagePicker();

    } else {

      SettingsUI._openLanguagePicker();

    }

  });



  menu.addEventListener('click', (e) => {

    const option = e.target.closest('.language-picker-option');

    if (!option) return;

    SettingsUI._applyLanguageChoice(option.dataset.value || 'auto');

  });



  document.addEventListener('click', (e) => {

    if (!picker.contains(e.target)) {

      SettingsUI._closeLanguagePicker();

    }

  });



  document.addEventListener('keydown', (e) => {

    if (e.key === 'Escape') {

      SettingsUI._closeLanguagePicker();

    }

  });

};



if (typeof self !== 'undefined') {

  self.SettingsUI = SettingsUI;

}


