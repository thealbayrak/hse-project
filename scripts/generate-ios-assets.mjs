import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
const splashDir = join(root, "public", "splash");

const BG = [9, 13, 22, 255];
const AMBER = [245, 158, 11, 255];
const INK = [15, 23, 42, 255];

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function fill(rgba, color) {
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = color[0];
    rgba[i + 1] = color[1];
    rgba[i + 2] = color[2];
    rgba[i + 3] = color[3];
  }
}

function setPixel(rgba, width, x, y, color) {
  if (x < 0 || y < 0 || x >= width) return;
  const i = (y * width + x) * 4;
  if (i < 0 || i + 3 >= rgba.length) return;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillCircle(rgba, width, cx, cy, radius, color) {
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.ceil(cy + radius);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPixel(rgba, width, x, y, color);
    }
  }
}

function fillRect(rgba, width, x0, y0, x1, y1, color) {
  const left = Math.max(0, Math.floor(x0));
  const right = Math.ceil(x1);
  const top = Math.max(0, Math.floor(y0));
  const bottom = Math.ceil(y1);
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      setPixel(rgba, width, x, y, color);
    }
  }
}

function fillRoundRect(rgba, width, x0, y0, x1, y1, radius, color) {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const r = Math.min(radius, (right - left) / 2, (bottom - top) / 2);
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y += 1) {
    for (let x = Math.floor(left); x <= Math.ceil(right); x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const cx = Math.min(Math.max(px, left + r), right - r);
      const cy = Math.min(Math.max(py, top + r), bottom - r);
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(rgba, width, x, y, color);
    }
  }
}

function drawMark(rgba, width, height) {
  const size = Math.min(width, height);
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;
  const s = (nx, ny) => [ox + nx * size, oy + ny * size];

  fillRoundRect(rgba, width, ...s(0.08, 0.08), ...s(0.92, 0.92), size * 0.22, AMBER);
  fillCircle(rgba, width, ox + size * 0.5, oy + size * 0.46, size * 0.22, INK);
  fillRoundRect(rgba, width, ...s(0.22, 0.52), ...s(0.78, 0.64), size * 0.08, INK);
  fillRect(rgba, width, ...s(0.46, 0.24), ...s(0.54, 0.34), AMBER);
}

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  fill(rgba, BG);
  drawMark(rgba, size, size);
  return encodePng(size, size, rgba);
}

function makeSplash(width, height, mark) {
  const rgba = Buffer.alloc(width * height * 4);
  fill(rgba, BG);
  const markSize = Math.round(Math.min(width, height) * 0.28);
  const destX = Math.round((width - markSize) / 2);
  const destY = Math.round((height - markSize) / 2);
  for (let y = 0; y < markSize; y += 1) {
    const srcY = Math.min(mark.size - 1, Math.floor((y / markSize) * mark.size));
    for (let x = 0; x < markSize; x += 1) {
      const srcX = Math.min(mark.size - 1, Math.floor((x / markSize) * mark.size));
      const src = (srcY * mark.size + srcX) * 4;
      const dest = ((destY + y) * width + destX + x) * 4;
      mark.rgba.copy(rgba, dest, src, src + 4);
    }
  }
  return encodePng(width, height, rgba);
}

const SPLASH = [
  [640, 1136],
  [750, 1334],
  [828, 1792],
  [1125, 2436],
  [1170, 2532],
  [1179, 2556],
  [1206, 2622],
  [1242, 2208],
  [1242, 2688],
  [1284, 2778],
  [1290, 2796],
  [1320, 2868],
];

mkdirSync(iconsDir, { recursive: true });
mkdirSync(splashDir, { recursive: true });

const markSize = 512;
const markRgba = Buffer.alloc(markSize * markSize * 4);
fill(markRgba, BG);
drawMark(markRgba, markSize, markSize);

writeFileSync(join(iconsDir, "icon-192x192.png"), makeIcon(192));
writeFileSync(join(iconsDir, "icon-512x512.png"), makeIcon(512));
writeFileSync(join(iconsDir, "apple-touch-icon.png"), makeIcon(180));
writeFileSync(join(root, "app", "apple-icon.png"), makeIcon(180));
writeFileSync(join(root, "app", "icon.png"), makeIcon(512));

for (const [width, height] of SPLASH) {
  writeFileSync(
    join(splashDir, `apple-splash-${width}-${height}.png`),
    makeSplash(width, height, { size: markSize, rgba: markRgba })
  );
}

console.log("Generated iOS icons and splash screens.");
