/** What each UI language is written in, shared by the translation checkers. */

// A text in these languages must contain letters of the script
const SCRIPT = {
  ar: /[؀-ۿ]/, hi: /[ऀ-ॿ]/, ja: /[぀-ヿ一-鿿]/, ko: /[가-힯]/,
  ru: /[Ѐ-ӿ]/, uk: /[Ѐ-ӿ]/, th: /[฀-๿]/, zh_CN: /[一-鿿]/, zh_TW: /[一-鿿]/
};

// Letters the language does not use but its sister language does: a sign of the wrong variant
const NOT_USED = {
  uk: /[ыэъё]/i,
  ru: /[іїєґ]/i,
  zh_TW: /[设检测数据历录规则进阶验证码护为开关与时间来说无这个们对应类别显隐选择储汇导网页脚启标头获复错误载线备览语确认]/,
  zh_CN: /[設檢測資歷錄規則進階驗證碼護為開關與時間來說無這個們對應類別顯隱選擇儲匯導網頁腳啟標頭獲複錯誤載線備覽語確認]/
};

// Languages whose script has no bundled font: the system draws them (none today: every script ships its IBM Plex family)
const SYSTEM_FONT_LOCALES = new Set();

module.exports = { SCRIPT, NOT_USED, SYSTEM_FONT_LOCALES };
