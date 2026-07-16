// Generates the PWA icons (public/icons/*.png) from the app's logo mark —
// three white "balcony ribbon" bars on an ultramarine block — with no image
// dependencies: pixels are rasterized by hand and PNG-encoded via zlib.
// Run: node scripts/generate-pwa-icons.mjs
import { deflateSync } from "zlib";
import { mkdirSync, writeFileSync } from "fs";

const COBALT = [0x25, 0x47, 0xd0]; // #2547D0 — matches --accent (light)
const WHITE = [0xff, 0xff, 0xff];

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
  // raw scanlines: filter byte 0 + RGB triplets
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0;
    rgb.copy(raw, row + 1, y * size * 3, (y + 1) * size * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Anti-aliased coverage of point (px,py) by a horizontal capsule bar. */
function capsuleCoverage(px, py, x0, x1, cy, r) {
  const cx = Math.max(x0 + r, Math.min(x1 - r, px));
  const d = Math.hypot(px - cx, py - cy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

function renderIcon(size) {
  // Logo grid is 16 units; keep the mark inside the maskable safe zone.
  const scale = (size * 0.62) / 16;
  const off = size * 0.19;
  // bars: [x, width, y, opacity] in grid units (y = bar top, height 2.2)
  const bars = [
    [2, 12, 3, 1],
    [2, 9, 7, 0.78],
    [2, 12, 11, 1],
  ];
  const rgb = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let [r, g, b] = COBALT;
      for (const [bx, bw, by, op] of bars) {
        const x0 = off + bx * scale;
        const x1 = off + (bx + bw) * scale;
        const cy = off + (by + 1.1) * scale;
        const rad = 1.1 * scale;
        const a = capsuleCoverage(x + 0.5, y + 0.5, x0, x1, cy, rad) * op;
        if (a > 0) {
          r = r + (WHITE[0] - r) * a;
          g = g + (WHITE[1] - g) * a;
          b = b + (WHITE[2] - b) * a;
        }
      }
      const i = (y * size + x) * 3;
      rgb[i] = Math.round(r);
      rgb[i + 1] = Math.round(g);
      rgb[i + 2] = Math.round(b);
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
