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
  const sidebar = solid(164, 314, 7, 16, 19);
  composite(sidebar, resize(source, 106), 29, 27);
  const header = solid(150, 57, 7, 16, 19);
  composite(header, resize(source, 46), 94, 5);
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
