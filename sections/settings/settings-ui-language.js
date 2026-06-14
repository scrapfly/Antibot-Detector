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



SettingsUI._findLanguageOption = function(value) {

  return SettingsUI.LANGUAGE_OPTIONS.find((opt) => opt.value === value)

    || SettingsUI.LANGUAGE_OPTIONS[0];

};



SettingsUI.refreshLanguagePickerLabels = function() {

  const menu = document.querySelector('#languagePickerMenu');

  if (!menu) return;



  menu.querySelectorAll('.language-picker-option').forEach((el) => {

    const option = SettingsUI._findLanguageOption(el.dataset.value);

    const labelEl = el.querySelector('.language-picker-option-label');

    const flagSlot = el.querySelector('.language-picker-flag-slot');

    if (labelEl) {

      labelEl.textContent = SettingsUI._languageOptionLabel(option);

    }

    if (flagSlot) {

      SettingsUI._applyLanguagePickerFlag(flagSlot, option.value);

    }

  });



  const hidden = document.querySelector('#languageOverride');

  if (hidden) {

    SettingsUI.setLanguagePickerValue(hidden.value || 'auto');

  }

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



  SettingsUI._applyLanguagePickerFlag(flagSlot, option.value);

  if (labelEl) {

    labelEl.textContent = SettingsUI._languageOptionLabel(option);

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

  const card = document.querySelector('.settings-card--language');

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



  if (typeof I18n !== 'undefined') {

    try {

      await I18n.loadOverride(choice === 'auto' ? null : choice);

      I18n.apply(document);

      if (typeof SettingsUI.applyCategoryColorLabels === 'function') {

        SettingsUI.applyCategoryColorLabels();

      }

      if (typeof SettingsUI.syncColorRowBadges === 'function') {

        SettingsUI.syncColorRowBadges();

      }

      SettingsUI.refreshLanguagePickerLabels();

      const detection = window.popupInstance?.detection;
      if (detection && typeof detection.refreshDetectionStateI18n === 'function') {
        detection.refreshDetectionStateI18n();
      } else if (detection && typeof detection.refreshEmptyStateI18n === 'function') {
        detection.refreshEmptyStateI18n();
      }

    } catch (_) { /* best-effort */ }

  }

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

      <span class="language-picker-option-label">${FormatUtils.escapeHtml(label)}</span>

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


