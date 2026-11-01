/**
 * A raw byte-order mark (U+FEFF) inside a source file: it is invisible in an editor and in a diff, so it survives review, and the
 * file still parses (JavaScript allows it in a string or a regular expression). Where one is needed, write it as an escape
 * sequence or build it with String.fromCharCode(0xFEFF), so it can be seen. check-syntax.js fails on any that is left.
 */
'use strict';

const MARK = String.fromCharCode(0xFEFF);

/** Where a text holds one: [{line, column}] (1-based; line 1 column 1 is a mark at the very start of the file). */
function findRawBom(text) {
  const found = [];
  const lines = String(text).split('\n');
  lines.forEach((line, index) => {
    for (let at = line.indexOf(MARK); at !== -1; at = line.indexOf(MARK, at + 1)) found.push({ line: index + 1, column: at + 1 });
  });
  return found;
}

module.exports = { MARK, findRawBom };
