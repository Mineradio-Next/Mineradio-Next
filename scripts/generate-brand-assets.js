'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.join(__dirname, '..');
const sourcePath = path.join(root, 'public', 'assets', 'brand', 'mineradio-next-icon-source.png');
const buildDir = path.join(root, 'build');

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath, png) {
  fs.writeFileSync(filePath, PNG.sync.write(png, { colorType: 6 }));
}

function resize(source, width, height = width) {
  const output = new PNG({ width, height });
  const xScale = source.width / width;
  const yScale = source.height / height;

  for (let y = 0; y < height; y += 1) {
    const sy = (y + .5) * yScale - .5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(source.height - 1, y0 + 1);
    const fy = Math.max(0, sy - y0);
    for (let x = 0; x < width; x += 1) {
      const sx = (x + .5) * xScale - .5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(source.width - 1, x0 + 1);
      const fx = Math.max(0, sx - x0);
      const target = (y * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const p00 = source.data[(y0 * source.width + x0) * 4 + channel];
        const p10 = source.data[(y0 * source.width + x1) * 4 + channel];
        const p01 = source.data[(y1 * source.width + x0) * 4 + channel];
        const p11 = source.data[(y1 * source.width + x1) * 4 + channel];
        output.data[target + channel] = Math.round(
          p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy,
        );
      }
    }
  }
  return output;
}

function composite(base, overlay, offsetX, offsetY) {
  for (let y = 0; y < overlay.height; y += 1) {
    for (let x = 0; x < overlay.width; x += 1) {
      const dx = x + offsetX;
      const dy = y + offsetY;
      if (dx < 0 || dy < 0 || dx >= base.width || dy >= base.height) continue;
      const source = (y * overlay.width + x) * 4;
      const target = (dy * base.width + dx) * 4;
      const alpha = overlay.data[source + 3] / 255;
      const inverse = 1 - alpha;
      base.data[target] = Math.round(overlay.data[source] * alpha + base.data[target] * inverse);
      base.data[target + 1] = Math.round(overlay.data[source + 1] * alpha + base.data[target + 1] * inverse);
      base.data[target + 2] = Math.round(overlay.data[source + 2] * alpha + base.data[target + 2] * inverse);
      base.data[target + 3] = Math.min(255, Math.round((alpha + base.data[target + 3] / 255 * inverse) * 255));
    }
  }
}

function solid(width, height, r, g, b, a = 255) {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = a;
  }
  return png;
}

function blendPixel(png, x, y, r, g, b, alpha = 1) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height || alpha <= 0) return;
  const offset = (Math.floor(y) * png.width + Math.floor(x)) * 4;
  const inverse = 1 - Math.min(1, alpha);
  png.data[offset] = Math.round(r * alpha + png.data[offset] * inverse);
  png.data[offset + 1] = Math.round(g * alpha + png.data[offset + 1] * inverse);
  png.data[offset + 2] = Math.round(b * alpha + png.data[offset + 2] * inverse);
  png.data[offset + 3] = 255;
}

function fillRect(png, x, y, width, height, color, alpha = 1) {
  for (let py = Math.max(0, y); py < Math.min(png.height, y + height); py += 1) {
    for (let px = Math.max(0, x); px < Math.min(png.width, x + width); px += 1) {
      blendPixel(png, px, py, color[0], color[1], color[2], alpha);
    }
  }
}

function strokeCircle(png, cx, cy, radius, thickness, color, alpha = 1) {
  const outer = radius + thickness / 2;
  const inner = Math.max(0, radius - thickness / 2);
  const x0 = Math.floor(cx - outer - 1);
  const x1 = Math.ceil(cx + outer + 1);
  const y0 = Math.floor(cy - outer - 1);
  const y1 = Math.ceil(cy + outer + 1);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const distance = Math.hypot(x + .5 - cx, y + .5 - cy);
      if (distance >= inner && distance <= outer) blendPixel(png, x, y, color[0], color[1], color[2], alpha);
    }
  }
}

function drawWaveform(png, left, centerY, heights, color) {
  heights.forEach((height, index) => {
    const x = left + index * 6;
    fillRect(png, x, Math.round(centerY - height / 2), 2, height, color, .78);
    blendPixel(png, x - 1, centerY, color[0], color[1], color[2], .18);
    blendPixel(png, x + 2, centerY, color[0], color[1], color[2], .18);
  });
}

function createIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(images.length * 16);
  let offset = header.length + directory.length;
  images.forEach(({ size, png }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...images.map(({ png }) => png)]);
}

function toBmp24(png) {
  const rowSize = Math.ceil((png.width * 3) / 4) * 4;
  const pixels = Buffer.alloc(rowSize * png.height, 248);
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const source = (y * png.width + x) * 4;
      const target = (png.height - y - 1) * rowSize + x * 3;
      const alpha = png.data[source + 3] / 255;
      pixels[target] = Math.round(png.data[source + 2] * alpha + 7 * (1 - alpha));
      pixels[target + 1] = Math.round(png.data[source + 1] * alpha + 16 * (1 - alpha));
      pixels[target + 2] = Math.round(png.data[source] * alpha + 19 * (1 - alpha));
    }
  }
  const header = Buffer.alloc(54);
  header.write('BM', 0, 'ascii');
  header.writeUInt32LE(header.length + pixels.length, 2);
  header.writeUInt32LE(header.length, 10);
  header.writeUInt32LE(40, 14);
  header.writeInt32LE(png.width, 18);
  header.writeInt32LE(png.height, 22);
  header.writeUInt16LE(1, 26);
  header.writeUInt16LE(24, 28);
  header.writeUInt32LE(pixels.length, 34);
  header.writeInt32LE(3780, 38);
  header.writeInt32LE(3780, 42);
  return Buffer.concat([header, pixels]);
}

function installerArt(source) {
  const sidebar = solid(164, 314, 16, 23, 25);
  fillRect(sidebar, 0, 0, 164, 314, [25, 37, 40], .28);
  fillRect(sidebar, 0, 0, 6, 314, [85, 221, 181], .92);
  composite(sidebar, resize(source, 62), 24, 24);

  strokeCircle(sidebar, 16, 280, 86, 1, [88, 201, 232], .30);
  strokeCircle(sidebar, 16, 280, 65, 1, [85, 221, 181], .18);
  strokeCircle(sidebar, 16, 280, 44, 1, [244, 248, 247], .08);
  drawWaveform(sidebar, 96, 158, [25, 54, 82, 43, 104, 68, 35, 91, 48, 72], [85, 221, 181]);
  fillRect(sidebar, 24, 112, 34, 2, [85, 221, 181], .82);
  fillRect(sidebar, 24, 123, 62, 1, [244, 248, 247], .20);
  fillRect(sidebar, 24, 130, 46, 1, [244, 248, 247], .12);
  fillRect(sidebar, 24, 271, 54, 1, [244, 248, 247], .16);

  const header = solid(150, 57, 16, 23, 25);
  fillRect(header, 0, 0, 5, 57, [85, 221, 181], .92);
  drawWaveform(header, 14, 29, [9, 19, 31, 14, 38, 24, 12, 29, 17, 22], [85, 221, 181]);
  composite(header, resize(source, 42), 101, 7);
  return { sidebar, header };
}

const source = readPng(sourcePath);
fs.mkdirSync(buildDir, { recursive: true });
writePng(path.join(buildDir, 'icon.png'), resize(source, 512));

const sizes = [16, 24, 32, 48, 64, 128, 256];
const iconImages = sizes.map(size => ({ size, png: PNG.sync.write(resize(source, size), { colorType: 6 }) }));
fs.writeFileSync(path.join(buildDir, 'icon.ico'), createIco(iconImages));

const { sidebar, header } = installerArt(source);
fs.writeFileSync(path.join(buildDir, 'installerSidebar.bmp'), toBmp24(sidebar));
fs.writeFileSync(path.join(buildDir, 'installerHeader.bmp'), toBmp24(header));
console.log('Generated Mineradio Next brand assets from approved A source.');
