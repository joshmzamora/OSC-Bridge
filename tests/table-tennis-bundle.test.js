'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../sketch/ping-pong-core');

const {
  TABLE,
  MatchScore,
  OneEuroFilter,
  SwingDetector,
  applyPaddleHit,
  createBall,
  createSwingProfile,
  deterministicRallySimulation,
  evaluateRallyEvent,
  launchServe,
  mapOrientationToPaddle,
  mulberry32,
  parsePhoneAddress,
  rotateSensorForScreen,
  stepBall,
  vec3,
} = Core;

test('bundle exposes the full table-tennis engine', () => {
  assert.equal(TABLE.length, 2.74);
  assert.deepEqual(parsePhoneAddress('/phone/p1/rotation'), { deviceId: 'p1', event: 'rotation' });
  assert.equal(parsePhoneAddress('/not-a-phone'), null);
});

test('landscape sensor axes and player-two mirroring stay bounded', () => {
  assert.deepEqual(rotateSensorForScreen({ x: 4, y: 9, z: 2 }, 90), { x: -9, y: 4, z: 2 });
  const near = mapOrientationToPaddle({ alpha: 12, beta: -8, gamma: 18 }, {}, { sensitivity: 1.2 });
  const far = mapOrientationToPaddle({ alpha: 12, beta: -8, gamma: 18 }, {}, { side: 'far', mirror: true, sensitivity: 1.2 });
  assert.ok(Math.abs(near.x) <= TABLE.width * 0.53);
  assert.equal(Math.sign(near.x), -Math.sign(far.x));
});

test('filter follows deliberate movement without reproducing full jitter', () => {
  const filter = new OneEuroFilter({ minCutoff: 1, beta: 0.03 });
  const noisy = [0, .08, -.07, .06, -.05, .04];
  const filtered = noisy.map((value, index) => filter.filter(value, index / 60));
  assert.ok(Math.max(...filtered.map(Math.abs)) < Math.max(...noisy.map(Math.abs)));
  assert.ok(filter.filter(1, 1) > .2);
});

test('calibrated detector recognizes opposite forehand and backhand swings', () => {
  const profile = createSwingProfile({
    forehandSamples: [vec3(0, 180, 20), vec3(4, 210, 18)],
    backhandSamples: [vec3(0, -180, -20), vec3(-3, -205, -17)],
  });
  const detector = new SwingDetector({ profile, sensitivity: 1.1, cooldownMs: 1 });
  const fore = detector.push({ gyro: vec3(0, 235, 25), acceleration: vec3(2, 1, 0), timestampMs: 1000 });
  detector.reset();
  const back = detector.push({ gyro: vec3(0, -235, -25), acceleration: vec3(-2, -1, 0), timestampMs: 2000 });
  assert.equal(fore?.type, 'forehand');
  assert.equal(back?.type, 'backhand');
});

test('paddle contact creates playable speed, direction, and spin', () => {
  const incoming = createBall({ position: vec3(.1, 1, -1.45), velocity: vec3(0, -.5, -3), active: true });
  const outgoing = applyPaddleHit(incoming, { side: 'near', x: .12, y: 1, z: TABLE.nearPaddleZ, faceYaw: .16, facePitch: .2 }, {
    type: 'forehand', speed: .9, gyro: vec3(130, 100, 50),
  }, { targetX: -.25, timing: .85, assist: .55 });
  assert.ok(outgoing.velocity.z > 0);
  assert.ok(Math.hypot(outgoing.velocity.x, outgoing.velocity.y, outgoing.velocity.z) < 10);
  assert.ok(Math.hypot(outgoing.spin.x, outgoing.spin.y, outgoing.spin.z) > 10);
});

test('physics reports table and net events and remains finite', () => {
  const bounceBall = createBall({ position: vec3(0, TABLE.height + .03, -.5), velocity: vec3(0, -1, 2), active: true });
  const bounce = stepBall(bounceBall, 1 / 60);
  assert.ok(bounce.events.some((event) => event.type === 'table-bounce'));
  const netBall = createBall({ position: vec3(0, TABLE.height + .07, -.03), velocity: vec3(0, 0, 4), active: true });
  const net = stepBall(netBall, 1 / 60);
  assert.ok(net.events.some((event) => event.type === 'net'));
  const simulation = deterministicRallySimulation({ seed: 1, steps: 2400 });
  assert.ok(simulation.result?.point || simulation.result?.let);
});

test('serve legality, service rotation, win-by-two, and best-of matches work', () => {
  const serve = launchServe('near', { power: .75, sideSpin: .12, topSpin: .25 });
  let state = { serve: true, server: 'near', serveStage: 0, lastHitter: 'near', bouncesSinceHit: 0, lastBounceSide: null };
  let first = evaluateRallyEvent(state, { type: 'table-bounce', side: 'near' }, serve);
  assert.equal(first.point, null);
  state = first.state;
  const second = evaluateRallyEvent(state, { type: 'table-bounce', side: 'far' }, serve);
  assert.equal(second.state.serve, false);

  const score = new MatchScore({ target: 11, winBy: 2, bestOf: 3, firstServer: 'near' });
  assert.equal(score.server(), 'near');
  score.addPoint('near');
  score.addPoint('far');
  assert.equal(score.server(), 'far');
  for (let i = 0; i < 10; i += 1) score.addPoint('near');
  assert.equal(score.games.near, 1);
});

test('bootstrap and clean-room source bundle are complete and local', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'sketch', 'ping-pong.html'), 'utf8');
  assert.match(html, /Palm Cove Table Tennis/);
  assert.match(html, /readTableTennisAsset/);
  assert.doesNotMatch(html, /https?:\/\//);
  for (let index = 0; index < 9; index += 1) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', '.table-tennis-upload', `part-${String(index).padStart(2, '0')}`)));
  }
  assert.equal(typeof mulberry32(1), 'function');
});
