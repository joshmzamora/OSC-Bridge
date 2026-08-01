'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizedTilt,
  paddleBounce,
  parsePhoneAddress,
  winnerForScore,
} = require('../sketch/ping-pong-core');

test('parses OSC phone addresses', () => {
  assert.deepEqual(parsePhoneAddress('/phone/abc123/orientation'), { deviceId: 'abc123', event: 'orientation' });
  assert.deepEqual(parsePhoneAddress('/phone/player-2/button/a'), { deviceId: 'player-2', event: 'button/a' });
  assert.equal(parsePhoneAddress('/slider'), null);
});

test('maps calibrated tilt into a normalized paddle position', () => {
  assert.deepEqual(normalizedTilt(0, 0, 'pitch'), { axis: 'pitch', value: 0.5 });
  assert.equal(normalizedTilt(45, 0, 'pitch').value, 1);
  assert.equal(normalizedTilt(-45, 0, 'pitch').value, 0);
  assert.equal(normalizedTilt(5, 30, 'auto').axis, 'roll');
});

test('paddle bounce reverses horizontal direction and adds angle', () => {
  const result = paddleBounce(
    { y: 260, vx: -500, vy: 0 },
    { y: 200, height: 120, velocity: 100 },
    1,
  );
  assert.ok(result.vx > 0);
  assert.ok(result.vy > 0);
});

test('match requires target score and a two-point lead', () => {
  assert.equal(winnerForScore(7, 6), null);
  assert.equal(winnerForScore(8, 6), 'left');
  assert.equal(winnerForScore(4, 7), 'right');
});
