const fs = require('node:fs');
const path = require('node:path');
// Evaluate the same classic-script graph as popup.html, in this test realm.
const source = ['options', 'parameters', 'codegen', 'ai-export', 'dialog']
  .map(name => fs.readFileSync(path.join(__dirname, '../../modules/integrations/scrapfly', `${name}.js`), 'utf8')).join('\n');
module.exports = new Function(source + '\nreturn ScrapflyExport;')();
