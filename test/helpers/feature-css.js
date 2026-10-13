const fs = require('node:fs');
const path = require('node:path');
module.exports = function featureCss(name) {
  const root = path.join(__dirname, '../..');
  const links = [...fs.readFileSync(path.join(root, 'popup.html'), 'utf8').matchAll(/<link[^>]+href="([^"]+)"/g)];
  return links.map(m => m[1]).filter(p => p.startsWith(`sections/${name}/`)).map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
};
