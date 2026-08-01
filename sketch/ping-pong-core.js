'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function bundleDirectory() {
  const packaged = path.join(process.resourcesPath || '', 'table-tennis-bundle');
  if (process.resourcesPath && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', '.table-tennis-upload');
}

function readBundleArchive() {
  const directory = bundleDirectory();
  const encoded = fs.readdirSync(directory)
    .filter((name) => /^part-\d{2}$/.test(name))
    .sort()
    .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
    .join('');
  return zlib.gunzipSync(Buffer.from(encoded, 'base64'));
}

function readTarEntry(archive, requestedPath) {
  let offset = 0;
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/, '');
    const fullName = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '');
    const sizeText = header.subarray(124, 136).toString('ascii').replace(/\0.*$/, '').trim();
    const size = Number.parseInt(sizeText || '0', 8);
    const dataStart = offset + 512;
    if (fullName === requestedPath) return archive.subarray(dataStart, dataStart + size).toString('utf8');
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Missing table-tennis asset: ${requestedPath}`);
}

const source = readTarEntry(readBundleArchive(), 'sketch/ping-pong-core.js');
const compiled = new Function('module', 'exports', 'require', '__filename', '__dirname', source);
compiled(module, module.exports, require, __filename, __dirname);
