'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeOscMessage,
  normalizePhoneMessage,
  oscPatternToRegex,
  phoneMessageToOsc,
  quaternionFromEuler,
} = require('../main/bridge-utils');

test('normalizes current node-osc array messages', () => {
  assert.deepEqual(normalizeOscMessage(['/test', 1, { value: 2 }]), {
    address: '/test',
    args: [1, 2],
  });
});

test('normalizes legacy object-shaped OSC messages', () => {
  assert.deepEqual(normalizeOscMessage({ address: '/legacy', args: [{ value: 4 }] }), {
    address: '/legacy',
    args: [4],
  });
});

test('supports catch-all, single-segment, and recursive OSC routes', () => {
  assert.equal(oscPatternToRegex('*').test('/phone/a/touch'), true);
  assert.equal(oscPatternToRegex('/phone/*/touch').test('/phone/a/touch'), true);
  assert.equal(oscPatternToRegex('/phone/*/touch').test('/phone/a/extra/touch'), false);
  assert.equal(oscPatternToRegex('/phone/**').test('/phone/a/extra/touch'), true);
});

test('clamps phone touch values and converts them to OSC', () => {
  const message = normalizePhoneMessage({
    type: 'touch',
    x: 2,
    y: -1,
    pressure: 4,
    phase: 'start',
    pointerId: 3,
  });
  assert.deepEqual(message.data, {
    phase: 'start',
    x: 1,
    y: 0,
    pressure: 1,
    pointerId: 3,
  });
  assert.deepEqual(phoneMessageToOsc(message, 'abc'), [{
    address: '/phone/abc/touch',
    args: [1, 0, 1, 'start', 3],
  }]);
});

test('creates a unit quaternion for a zero orientation', () => {
  assert.deepEqual(quaternionFromEuler(0, 0, 0), { x: 0, y: 0, z: 0, w: 1 });
});

test('rejects unknown phone payload types', () => {
  assert.equal(normalizePhoneMessage({ type: 'not-supported' }), null);
});
