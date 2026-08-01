'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  compareVersions,
  isNewerVersion,
  normalizeRelease,
  parseVersion,
  safeInstallerName,
  selectWindowsInstaller,
} = require('../main/update-utils');

test('parseVersion accepts stable and prerelease tags', () => {
  assert.deepEqual(parseVersion('v2.3.0'), { numeric: [2, 3, 0], prerelease: [] });
  assert.deepEqual(parseVersion('2.3-beta.2'), { numeric: [2, 3, 0], prerelease: ['beta', '2'] });
  assert.equal(parseVersion('release-two'), null);
});

test('compareVersions handles patch numbers and prereleases', () => {
  assert.equal(compareVersions('2.2.10', '2.2.9'), 1);
  assert.equal(compareVersions('2.3.0', '2.3.0-beta.4'), 1);
  assert.equal(compareVersions('2.3.0-beta.2', '2.3.0-beta.10'), -1);
  assert.equal(compareVersions('2.3', '2.3.0'), 0);
  assert.equal(compareVersions('invalid', '2.3.0'), null);
  assert.equal(isNewerVersion('3.0.0', '2.9.9'), true);
});

test('safeInstallerName blocks traversal and unrelated executables', () => {
  assert.equal(safeInstallerName('OSC.Bridge.Setup.2.3.0.exe'), 'OSC.Bridge.Setup.2.3.0.exe');
  assert.equal(safeInstallerName('OSC Bridge Setup 2.3.0.exe'), 'OSC Bridge Setup 2.3.0.exe');
  assert.equal(safeInstallerName('../OSC.Bridge.Setup.2.3.0.exe'), null);
  assert.equal(safeInstallerName('something.exe'), null);
});

test('selectWindowsInstaller prefers the canonical NSIS asset', () => {
  const selected = selectWindowsInstaller([
    { name: 'OSC Bridge Setup 2.3.0.exe', browser_download_url: 'https://example.com/spaced.exe' },
    { name: 'OSC.Bridge.Setup.2.3.0.exe', browser_download_url: 'https://example.com/canonical.exe' },
  ]);
  assert.equal(selected.browser_download_url, 'https://example.com/canonical.exe');
});

test('normalizeRelease returns a verified newer Windows release', () => {
  const normalized = normalizeRelease({
    tag_name: 'v2.3.0',
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/joshmzamora/OSC-Bridge/releases/tag/v2.3.0',
    assets: [{
      name: 'OSC.Bridge.Setup.2.3.0.exe',
      browser_download_url: 'https://github.com/joshmzamora/OSC-Bridge/releases/download/v2.3.0/OSC.Bridge.Setup.2.3.0.exe',
      size: 98_000_000,
      digest: `sha256:${'a'.repeat(64)}`,
    }],
  }, '2.2.1');

  assert.deepEqual(normalized, {
    version: '2.3.0',
    assetName: 'OSC.Bridge.Setup.2.3.0.exe',
    downloadUrl: 'https://github.com/joshmzamora/OSC-Bridge/releases/download/v2.3.0/OSC.Bridge.Setup.2.3.0.exe',
    releaseUrl: 'https://github.com/joshmzamora/OSC-Bridge/releases/tag/v2.3.0',
    size: 98_000_000,
    sha256: 'a'.repeat(64),
  });
});

test('normalizeRelease ignores unsafe, old, draft, and prerelease releases', () => {
  const base = {
    tag_name: 'v2.3.0',
    draft: false,
    prerelease: false,
    assets: [{
      name: 'OSC.Bridge.Setup.2.3.0.exe',
      browser_download_url: 'https://example.com/OSC.Bridge.Setup.2.3.0.exe',
      size: 98_000_000,
    }],
  };
  assert.equal(normalizeRelease({ ...base, tag_name: 'v2.2.1' }, '2.2.1'), null);
  assert.equal(normalizeRelease({ ...base, draft: true }, '2.2.1'), null);
  assert.equal(normalizeRelease({ ...base, prerelease: true }, '2.2.1'), null);
  assert.equal(normalizeRelease({ ...base, assets: [{ ...base.assets[0], name: '../malware.exe' }] }, '2.2.1'), null);
  assert.equal(normalizeRelease({ ...base, assets: [{ ...base.assets[0], size: 1000 }] }, '2.2.1'), null);
});
