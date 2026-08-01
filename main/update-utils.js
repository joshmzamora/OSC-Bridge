'use strict';

const path = require('path');

function parseVersion(value) {
  const cleaned = String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split('+', 1)[0];
  const [core, prerelease = ''] = cleaned.split('-', 2);
  const numeric = core.split('.').map((part) => {
    if (!/^\d+$/.test(part)) return null;
    const parsed = Number(part);
    return Number.isSafeInteger(parsed) ? parsed : null;
  });
  if (!numeric.length || numeric.some((part) => part === null)) return null;
  while (numeric.length < 3) numeric.push(0);
  return {
    numeric,
    prerelease: prerelease ? prerelease.split('.') : [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    const leftNumeric = /^\d+$/.test(left[index]);
    const rightNumeric = /^\d+$/.test(right[index]);
    if (leftNumeric && rightNumeric) {
      const difference = Number(left[index]) - Number(right[index]);
      if (difference) return Math.sign(difference);
    } else if (leftNumeric !== rightNumeric) {
      return leftNumeric ? -1 : 1;
    } else {
      const difference = left[index].localeCompare(right[index]);
      if (difference) return Math.sign(difference);
    }
  }
  return 0;
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (!left || !right) return null;
  const length = Math.max(left.numeric.length, right.numeric.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left.numeric[index] || 0) - (right.numeric[index] || 0);
    if (difference) return Math.sign(difference);
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function isNewerVersion(candidate, current) {
  return compareVersions(candidate, current) === 1;
}

function safeInstallerName(name) {
  const normalized = path.win32.basename(String(name || '').trim());
  if (!normalized || normalized !== String(name || '').trim()) return null;
  if (!/^OSC[ ._-]*Bridge[ ._-]*Setup[ ._-]*[\w.-]+\.exe$/i.test(normalized)) return null;
  return normalized;
}

function selectWindowsInstaller(assets) {
  const candidates = Array.isArray(assets) ? assets : [];
  return candidates
    .filter((asset) => asset && safeInstallerName(asset.name) && /^https:\/\//i.test(asset.browser_download_url || ''))
    .sort((left, right) => {
      const leftExact = /^OSC\.Bridge\.Setup\./i.test(left.name) ? 1 : 0;
      const rightExact = /^OSC\.Bridge\.Setup\./i.test(right.name) ? 1 : 0;
      return rightExact - leftExact;
    })[0] || null;
}

function normalizeRelease(release, currentVersion) {
  if (!release || release.draft || release.prerelease) return null;
  const version = String(release.tag_name || release.name || '').trim().replace(/^v/i, '');
  if (!isNewerVersion(version, currentVersion)) return null;
  const asset = selectWindowsInstaller(release.assets);
  if (!asset) return null;
  const size = Number(asset.size);
  if (!Number.isSafeInteger(size) || size < 1024 * 1024) return null;
  const digestMatch = /^sha256:([a-f0-9]{64})$/i.exec(String(asset.digest || '').trim());
  return {
    version,
    assetName: safeInstallerName(asset.name),
    downloadUrl: asset.browser_download_url,
    releaseUrl: /^https:\/\//i.test(release.html_url || '') ? release.html_url : null,
    size,
    sha256: digestMatch ? digestMatch[1].toLowerCase() : null,
  };
}

module.exports = {
  compareVersions,
  isNewerVersion,
  normalizeRelease,
  parseVersion,
  safeInstallerName,
  selectWindowsInstaller,
};
