#!/usr/bin/env node
/**
 * One-off helper: merge TRANSLATIONS into every locale messages.json.
 * Run once when adding new UI keys across all supported locales.
 */

const fs = require('fs');
const path = require('path');

const localesDir = path.resolve(__dirname, '..', '_locales');

/** @type {Record<string, Record<string, string>>} */
const TRANSLATIONS = {
    rulesModalDetectorLabel: {
        en: 'Detection Rule',
        es: 'Regla de detección',
        pt_BR: 'Regra de detecção',
        fr: 'Règle de détection',
        de: 'Erkennungsregel',
        it: 'Regola di rilevamento',
        ru: 'Правило обнаружения',
        ja: '検出ルール',
        ko: '탐지 규칙',
        zh_CN: '检测规则',
        ar: 'قاعدة الكشف',
        hi: 'डिटेक्शन नियम'
    },
    rulesAuthorHelpHint: {
        en: 'Who created this detector',
        es: 'Quién creó este detector',
        pt_BR: 'Quem criou este detector',
        fr: 'Qui a créé ce détecteur',
        de: 'Wer hat diesen Detektor erstellt',
        it: 'Chi ha creato questo detector',
        ru: 'Кто создал этот детектор',
        ja: 'この検出器の作成者',
        ko: '이 탐지기를 만든 사람',
        zh_CN: '谁创建了此检测器',
        ar: 'من أنشأ هذا المُكتشف',
        hi: 'इस डिटेक्टर को किसने बनाया'
    },
    rulesWindowConditionExamplesTitle: {
        en: 'Window Condition Examples',
        es: 'Ejemplos de condiciones de ventana',
        pt_BR: 'Exemplos de condição de janela',
        fr: 'Exemples de conditions window',
        de: 'Window-Bedingungsbeispiele',
        it: 'Esempi di condizioni window',
        ru: 'Примеры условий window',
        ja: 'Window 条件の例',
        ko: 'Window 조건 예시',
        zh_CN: 'Window 条件示例',
        ar: 'أمثلة شروط Window',
        hi: 'Window शर्त के उदाहरण'
    },
    rulesWindowConditionExamplesHint: {
        en: 'Click on an example to use it:',
        es: 'Haz clic en un ejemplo para usarlo:',
        pt_BR: 'Clique em um exemplo para usá-lo:',
        fr: 'Cliquez sur un exemple pour l\'utiliser :',
        de: 'Klicken Sie auf ein Beispiel, um es zu verwenden:',
        it: 'Fai clic su un esempio per usarlo:',
        ru: 'Нажмите на пример, чтобы использовать его:',
        ja: '例をクリックして使用:',
        ko: '예시를 클릭하여 사용:',
        zh_CN: '点击示例以使用:',
        ar: 'انقر على مثال لاستخدامه:',
        hi: 'उपयोग के लिए किसी उदाहरण पर क्लिक करें:'
    },
    rulesBtnNextFmt: {
        en: 'Next: {0}',
        es: 'Siguiente: {0}',
        pt_BR: 'Próximo: {0}',
        fr: 'Suivant : {0}',
        de: 'Weiter: {0}',
        it: 'Avanti: {0}',
        ru: 'Далее: {0}',
        ja: '次へ: {0}',
        ko: '다음: {0}',
        zh_CN: '下一步：{0}',
        ar: 'التالي: {0}',
        hi: 'अगला: {0}'
    },
    rulesUsePropertyBtn: {
        en: 'Use Property',
        es: 'Usar propiedad',
        pt_BR: 'Usar propriedade',
        fr: 'Utiliser la propriété',
        de: 'Eigenschaft verwenden',
        it: 'Usa proprietà',
        ru: 'Использовать свойство',
        ja: 'プロパティを使用',
        ko: '속성 사용',
        zh_CN: '使用属性',
        ar: 'استخدام الخاصية',
        hi: 'प्रॉपर्टी उपयोग करें'
    }
};

const locales = fs.readdirSync(localesDir).filter((name) => {
    return fs.statSync(path.join(localesDir, name)).isDirectory();
});

for (const locale of locales) {
    const filePath = path.join(localesDir, locale, 'messages.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let changed = false;

    for (const [key, byLocale] of Object.entries(TRANSLATIONS)) {
        const message = byLocale[locale] || byLocale.en;
        if (!data[key] || data[key].message !== message) {
            data[key] = { message };
            changed = true;
        }
    }

    if (changed) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        console.log(`Updated ${locale}`);
    }
}
