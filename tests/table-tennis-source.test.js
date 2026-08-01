'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

function archive() {
  const directory = path.join(__dirname, '..', '.table-tennis-upload');
  const encoded = fs.readdirSync(directory)
    .filter((name) => /^part-\d{2}$/.test(name))
    .sort()
    .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
    .join('');
  return zlib.gunzipSync(Buffer.from(encoded, 'base64'));
}

function entry(buffer, wanted) {
  let offset = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const read = (start, end) => header.subarray(start, end).toString('utf8').replace(/\0.*$/, '');
    const name = read(0, 100);
    const prefix = read(345, 500);
    const full = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, '');
    const size = Number.parseInt(read(124, 136).trim() || '0', 8);
    const dataStart = offset + 512;
    if (full === wanted) return buffer.subarray(dataStart, dataStart + size).toString('utf8');
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Missing archive entry: ${wanted}`);
}

test('bundled game scripts parse and remain clean-room/local-only', () => {
  const tar = archive();
  const core = entry(tar, 'sketch/ping-pong-core.js');
  const game = entry(tar, 'sketch/ping-pong.js');
  const html = entry(tar, 'sketch/ping-pong.html');
  const css = entry(tar, 'sketch/ping-pong.css');
  new vm.Script(core, { filename: 'ping-pong-core.js' });
  new vm.Script(game, { filename: 'ping-pong.js' });
  assert.match(html, /Palm Cove Table Tennis/);
  assert.ok(css.length > 10000);
  assert.doesNotMatch(`${core}\n${game}\n${html}\n${css}`, /https?:\/\//i);
  assert.doesNotMatch(`${core}\n${game}\n${html}\n${css}`, /Nintendo|Wii Sports/i);
});
