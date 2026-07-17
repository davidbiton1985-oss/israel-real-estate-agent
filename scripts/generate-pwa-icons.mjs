// Generates the PWA icons (public/icons/*.png): the Boton mark — "The
// Landing" (three rounded towers + the green dot settled in the open spot) —
// on a white tile, monday.com icon grammar. No image dependencies: pixels are
// rasterized by hand (2x supersampled) and PNG-encoded via zlib.
// Run: node scripts/generate-pwa-icons.mjs
import { deflateSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";

const WHITE = [0xff, 0xff, 0xff];
const BLUE = [0x00, 0x73, 0xea];
const YELLOW = [0xff, 0xcb, 0x00];
const PURPLE = [0xa2, 0x5d, 0xdc];
const GREEN = [0x00, 0xc8, 0x75];

// CRC32 (PNG chunk checksums)
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePng(size, rgb) {
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3);
    raw[rowStart] = 0;
    rgb.copy(raw, rowStart + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// signed distance to a rounded rect (grid units); inside <= 0
function roundRectDist(px, py, x, y, w, hgt, r) {
  const cx = x + w / 2;
  const cy = y + hgt / 2;
  const dx = Math.abs(px - cx) - (w / 2 - r);
  const dy = Math.abs(py - cy) - (hgt / 2 - r);
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

// The Landing in its 48-unit grid: [x, y, w, h, r, color]
const BARS = [
  [5.5, 6, 9, 36, 4.5, BLUE],
  [19.5, 30, 9, 12, 4.5, YELLOW],
  [33.5, 14, 9, 28, 4.5, PURPLE],
];

function sampleColor(gx, gy) {
  // green dot paints last (it overlaps nothing, but keep it on top anyway)
  if (Math.hypot(gx - 24, gy - 24) <= 6) return GREEN;
  for (const [x, y, w, hgt, r, col] of BARS) {
    if (roundRectDist(gx, gy, x, y, w, hgt, r) <= 0) return col;
  }
  return WHITE;
}

function renderIcon(size) {
  const rgb = Buffer.alloc(size * size * 3);
  // mark at 62% of the tile, centered (maskable-safe)
  const scale = (size * 0.62) / 48;
  const off = (size - 48 * scale) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0;
      for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const c = sampleColor((x + ox - off) / scale, (y + oy - off) / scale);
        r += c[0]; g += c[1]; b += c[2];
      }
      const i = (y * size + x) * 3;
      rgb[i] = Math.round(r / 4);
      rgb[i + 1] = Math.round(g / 4);
      rgb[i + 2] = Math.round(b / 4);
    }
  }
  return encodePng(size, rgb);
}

mkdirSync("public/icons", { recursive: true });
for (const [file, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  const png = renderIcon(size);
  writeFileSync(`public/icons/${file}`, png);
  console.log(`public/icons/${file}  ${size}x${size}  ${(png.length / 1024).toFixed(1)}KB`);
}
