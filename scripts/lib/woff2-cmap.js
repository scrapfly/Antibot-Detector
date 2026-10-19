/**
 * The code points a .woff2 font has glyphs for, read from its cmap table.
 * WOFF2 is a brotli stream of the font's tables (cmap itself is never
 * transformed), so Node's zlib is all it takes: no font tooling needed.
 */
const fs = require('fs');
const zlib = require('zlib');

// The 63 tag indexes of the WOFF2 table directory (spec §5.1)
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function readBase128(buf, cursor) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[cursor.at++];
    value = (value << 7) | (byte & 0x7f);
    if (!(byte & 0x80)) return value >>> 0;
  }
  throw new Error('invalid UIntBase128');
}

/** @returns {Set<number>} the code points the font draws */
function fontCodePoints(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error(`${file}: not a WOFF2 file`);
  const tableCount = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  const cursor = { at: 48 };
  const tables = [];
  for (let i = 0; i < tableCount; i++) {
    const flags = buf[cursor.at++];
    let tag = flags & 0x3f;
    const transform = flags >> 6;
    if (tag === 63) { tag = buf.toString('latin1', cursor.at, cursor.at + 4); cursor.at += 4; } else tag = KNOWN_TAGS[tag];
    const original = readBase128(buf, cursor);
    // glyf and loca are transformed unless version 3; every other table is untouched unless the version is not 0
    const transformed = (tag === 'glyf' || tag === 'loca') ? transform === 0 : transform !== 0;
    tables.push({ tag, length: transformed ? readBase128(buf, cursor) : original });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(cursor.at, cursor.at + compressedSize));
  let offset = 0;
  let cmap = null;
  for (const table of tables) {
    if (table.tag === 'cmap') cmap = data.subarray(offset, offset + table.length);
    offset += table.length;
  }
  if (!cmap) throw new Error(`${file}: no cmap table`);

  const points = new Set();
  const subtables = cmap.readUInt16BE(2);
  for (let i = 0; i < subtables; i++) {
    const start = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(start);
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(start + 6);
      const ends = start + 14, starts = ends + segX2 + 2, deltas = starts + segX2, ranges = deltas + segX2;
      for (let s = 0; s < segX2 / 2; s++) {
        const end = cmap.readUInt16BE(ends + s * 2), first = cmap.readUInt16BE(starts + s * 2);
        const rangeOffset = cmap.readUInt16BE(ranges + s * 2), delta = cmap.readInt16BE(deltas + s * 2);
        for (let c = first; c <= end && c !== 0xffff; c++) {
          let glyph = 0;
          if (rangeOffset === 0) glyph = (c + delta) & 0xffff;
          else {
            glyph = cmap.readUInt16BE(ranges + s * 2 + rangeOffset + (c - first) * 2);
            if (glyph) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph) points.add(c);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(start + 12);
      for (let g = 0; g < groups; g++) {
        const first = cmap.readUInt32BE(start + 16 + g * 12), last = cmap.readUInt32BE(start + 20 + g * 12);
        for (let c = first; c <= last; c++) points.add(c);
      }
    }
  }
  return points;
}

module.exports = { fontCodePoints };
