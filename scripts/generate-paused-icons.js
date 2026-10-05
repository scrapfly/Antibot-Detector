#!/usr/bin/env node
/**
 * Generates icons/paused16.png and icons/paused32.png, the toolbar icon shown
 * on excluded (paused) domains: the extension logo at 45% opacity with a navy
 * tile and two light-blue pause bars in the bottom-right corner.
 *
 * The pause sign is drawn into the icon rather than written as badge text,
 * because badge text uses the browser's UI font: the same characters rendered
 * as one merged block on some machines and as thin hairlines on others.
 *
 * Pure Node (zlib only). Rerun after changing icons/icon16.png or icon32.png:
 *   node scripts/generate-paused-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = path.join(__dirname, '..');
const NAVY = [0x1e, 0x29, 0x3b]; // BADGE.COLORS.BLACKLISTED
const SKY = [0x7d, 0xd3, 0xfc];  // BADGE.TEXT_COLORS.BLACKLISTED
const LOGO_OPACITY = 0.45;
const SUPERSAMPLE = 16; // per axis, for anti-aliased rounded corners

// ── PNG decode (8-bit RGBA, non-interlaced: the format of icons/*.png) ──────
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0, height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const [depth, colourType, , , interlace] = data.subarray(8, 13);
      if (depth !== 8 || colourType !== 6 || interlace !== 0) {
        throw new Error(`unsupported PNG (depth ${depth}, colour type ${colourType}, interlace ${interlace})`);
      }
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let value = row[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += Math.floor((a + b) / 2);
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
      } else if (filter !== 0) throw new Error(`bad PNG filter ${filter}`);
      pixels[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, pixels };
}

// ── PNG encode (8-bit RGBA, filter 0) ──────────────────────────────────────
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}
function encodePng({ width, height, pixels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// ── Drawing ─────────────────────────────────────────────────────────────────
// Fraction of pixel (px, py) covered by a rounded rectangle, by supersampling.
function roundRectCoverage(px, py, left, top, width, height, radius) {
  const right = left + width, bottom = top + height;
  let inside = 0;
  for (let sy = 0; sy < SUPERSAMPLE; sy++) {
    for (let sx = 0; sx < SUPERSAMPLE; sx++) {
      const x = px + (sx + 0.5) / SUPERSAMPLE;
      const y = py + (sy + 0.5) / SUPERSAMPLE;
      if (x < left || x > right || y < top || y > bottom) continue;
      const cx = Math.min(Math.max(x, left + radius), right - radius);
      const cy = Math.min(Math.max(y, top + radius), bottom - radius);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) inside++;
    }
  }
  return inside / (SUPERSAMPLE * SUPERSAMPLE);
}

function drawPausedIcon(logo) {
  const size = logo.width;
  const s = size / 16;
  // Straight-alpha float canvas: [r, g, b, a] per pixel, colour 0-255, alpha 0-1
  const canvas = Array.from({ length: size * size }, (_, i) => {
    const p = logo.pixels.subarray(i * 4, i * 4 + 4);
    return [p[0], p[1], p[2], (p[3] / 255) * LOGO_OPACITY];
  });
  const sourceOver = (i, colour, coverage) => {
    if (coverage <= 0) return;
    const [r, g, b, a] = canvas[i];
    const outA = coverage + a * (1 - coverage);
    canvas[i] = colour.map((c, k) => (c * coverage + [r, g, b][k] * a * (1 - coverage)) / outA).concat(outA);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      // 1px transparent ring around the tile, like Chrome's own badge cutout
      canvas[i][3] *= 1 - roundRectCoverage(x, y, 5 * s, 5 * s, 11 * s, 11 * s, 3 * s);
      sourceOver(i, NAVY, roundRectCoverage(x, y, 6 * s, 6 * s, 10 * s, 10 * s, 2 * s));
      // Two pixel-aligned pause bars, 2 units wide, 6 tall, 2 apart
      const inBar = (x0) => x >= x0 * s && x < (x0 + 2) * s && y >= 8 * s && y < 14 * s;
      if (inBar(8) || inBar(12)) sourceOver(i, SKY, 1);
    }
  }
  const pixels = Buffer.alloc(size * size * 4);
  canvas.forEach(([r, g, b, a], i) => {
    pixels.set([r, g, b].map(Math.round).concat(Math.round(a * 255)), i * 4);
  });
  return { width: size, height: size, pixels };
}

function generate() {
  const outputs = [];
  for (const size of [16, 32]) {
    const logo = decodePng(fs.readFileSync(path.join(ROOT, 'icons', `icon${size}.png`)));
    if (logo.width !== size || logo.height !== size) throw new Error(`icon${size}.png is ${logo.width}x${logo.height}`);
    const file = path.join(ROOT, 'icons', `paused${size}.png`);
    fs.writeFileSync(file, encodePng(drawPausedIcon(logo)));
    outputs.push(path.relative(ROOT, file));
  }
  return outputs;
}

if (require.main === module) {
  console.log(`Wrote ${generate().join(', ')}`);
}

module.exports = { decodePng, encodePng, drawPausedIcon, generate };
