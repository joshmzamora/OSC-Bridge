'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const partsDir = path.join(root, '.table-tennis-upload');
const outputDir = path.resolve(process.argv[2] || path.join(root, '.table-tennis-source'));
const encoded = fs.readdirSync(partsDir)
  .filter((name) => /^part-\d{2}$/.test(name))
  .sort()
  .map((name) => fs.readFileSync(path.join(partsDir, name), 'utf8'))
  .join('');
const archive = zlib.gunzipSync(Buffer.from(encoded, 'base64'));

function clean(value) {
  return value.toString('utf8').replace(/\0.*$/, '');
}

let offset = 0;
let written = 0;
while (offset + 512 <= archive.length) {
  const header = archive.subarray(offset, offset + 512);
  if (header.every((value) => value === 0)) break;
  const name = clean(header.subarray(0, 100));
  const prefix = clean(header.subarray(345, 500));
  const relative = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '');
  const size = Number.parseInt(clean(header.subarray(124, 136)).trim() || '0', 8);
  const start = offset + 512;
  if (relative && !relative.endsWith('/')) {
    const target = path.join(outputDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, archive.subarray(start, start + size));
    written += 1;
  }
  offset = start + Math.ceil(size / 512) * 512;
}

console.log(`Extracted ${written} table-tennis source files to ${outputDir}`);
