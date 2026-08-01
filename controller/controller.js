'use strict';

const token = new URLSearchParams(location.search).get('token') || '';
const connection = document.querySelector('#connection');
const connectionText = document.querySelector('#connectionText');
const setupCard = document.querySelector('#setupCard');
const enableMotionButton = document.querySelector('#enableMotion');
const permissionNote = document.querySelector('#permissionNote');
const touchpad = document.querySelector('#touchpad');
const crosshair = document.querySelector('#crosshair');
const rateSelect = document.querySelector('#rate');
const rateLabel = document.querySelector('#rateLabel');
const calibrateButton = document.querySelector('#calibrate');
const deviceLabel = document.querySelector('#deviceLabel');
const renameButton = document.querySelector('#rename');
const yawLabel = document.querySelector('#yaw');
const pitchLabel = document.querySelector('#pitch');
const rollLabel = document.querySelector('#roll');

let socket;
let reconnectTimer;
let reconnectDelay = 500;
let deviceId = '';
let sensorEnabled = false;
let lastOrientationSent = 0;
let lastMotionSent = 0;
let latestOrientation = { alpha: 0, beta: 0, gamma: 0, absolute: false };
let calibration = { alpha: 0, beta: 0, gamma: 0 };
let wakeLock;
let phoneName = localStorage.getItem('oscBridgePhoneName') || navigator.platform || 'My phone';

function setConnection(state, label) {
  connection.dataset.state = state;
  connectionText.textContent = label;
}

function send(payload) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify({ ...payload, timestamp: performance.timeOrigin + performance.now() }));
  return true;
}

function connect() {
  clearTimeout(reconnectTimer);
  setConnection('connecting', 'Connecting');
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/ws?token=${encodeURIComponent(token)}`);

  socket.addEventListener('open', () => {
    reconnectDelay = 500;
    setConnection('connected', 'Connected');
    send({ type: 'identify', name: phoneName });
  });

  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'hello') {
      deviceId = message.deviceId;
      deviceLabel.textContent = `${phoneName} · ${deviceId}`;
    }
  });

  socket.addEventListener('close', () => {
    setConnection('offline', 'Reconnecting');
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.7, 8000);
  });

  socket.addEventListener('error', () => socket.close());
}

function wrapAngle(angle) {
  let value = angle;
  while (value > 180) value -= 360;
  while (value < -180) value += 360;
  return value;
}

function sensorInterval() {
  return 1000 / Number(rateSelect.value || 30);
}

function currentScreenAngle() {
  return screen.orientation?.angle ?? window.orientation ?? 0;
}

function handleOrientation(event) {
  latestOrientation = {
    alpha: Number(event.alpha) || 0,
    beta: Number(event.beta) || 0,
    gamma: Number(event.gamma) || 0,
    absolute: Boolean(event.absolute),
  };
  const now = performance.now();
  if (now - lastOrientationSent < sensorInterval()) return;
  lastOrientationSent = now;

  const alpha = wrapAngle(latestOrientation.alpha - calibration.alpha);
  const beta = latestOrientation.beta - calibration.beta;
  const gamma = latestOrientation.gamma - calibration.gamma;
  yawLabel.textContent = `${Math.round(alpha)}°`;
  pitchLabel.textContent = `${Math.round(beta)}°`;
  rollLabel.textContent = `${Math.round(gamma)}°`;
  send({
    type: 'orientation',
    alpha,
    beta,
    gamma,
    absolute: latestOrientation.absolute,
    screen: currentScreenAngle(),
  });
}

function vector(value) {
  return {
    x: Number(value?.x) || 0,
    y: Number(value?.y) || 0,
    z: Number(value?.z) || 0,
  };
}

function handleMotion(event) {
  const now = performance.now();
  if (now - lastMotionSent < sensorInterval()) return;
  lastMotionSent = now;
  send({
    type: 'motion',
    acceleration: vector(event.acceleration),
    accelerationIncludingGravity: vector(event.accelerationIncludingGravity),
    rotationRate: {
      alpha: Number(event.rotationRate?.alpha) || 0,
      beta: Number(event.rotationRate?.beta) || 0,
      gamma: Number(event.rotationRate?.gamma) || 0,
    },
    interval: Number(event.interval) || sensorInterval(),
  });
}

async function requestMotionPermission() {
  if (!('DeviceMotionEvent' in globalThis) && !('DeviceOrientationEvent' in globalThis)) {
    throw new Error('This browser does not expose phone motion sensors. Open the controller in Safari.');
  }
  const requests = [];
  if (typeof globalThis.DeviceMotionEvent?.requestPermission === 'function') {
    requests.push(globalThis.DeviceMotionEvent.requestPermission());
  }
  if (typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function') {
    requests.push(globalThis.DeviceOrientationEvent.requestPermission());
  }
  const results = await Promise.all(requests);
  return results.every((result) => result === 'granted');
}

async function enableMotion() {
  enableMotionButton.disabled = true;
  try {
    if (!window.isSecureContext) {
      throw new Error('Safari does not trust this controller yet. Install and fully trust the OSC Bridge certificate, then reopen the controller.');
    }
    const granted = await requestMotionPermission();
    if (!granted) throw new Error('Motion permission was not granted.');
    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('devicemotion', handleMotion, true);
    sensorEnabled = true;
    setupCard.classList.add('is-enabled');
    send({ type: 'status', event: 'motion-enabled', detail: `${rateSelect.value} Hz` });
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch { /* Wake Lock is optional. */ }
  } catch (error) {
    permissionNote.textContent = error.message || 'Motion access failed. Check Safari settings and reload.';
    enableMotionButton.disabled = false;
  }
}

enableMotionButton.addEventListener('click', enableMotion);
calibrateButton.addEventListener('click', () => {
  calibration = { ...latestOrientation };
  navigator.vibrate?.(20);
  send({ type: 'status', event: 'calibrated', detail: 'Orientation zeroed' });
});
rateSelect.addEventListener('change', () => {
  rateLabel.textContent = `${rateSelect.value} Hz`;
  if (sensorEnabled) send({ type: 'status', event: 'rate-changed', detail: `${rateSelect.value} Hz` });
});

function touchPayload(event, phase) {
  const bounds = touchpad.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
  const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height));
  crosshair.style.left = `${x * 100}%`;
  crosshair.style.top = `${y * 100}%`;
  send({
    type: 'touch',
    phase,
    x,
    y,
    pressure: Number(event.pressure) || (phase === 'end' ? 0 : 1),
    pointerId: event.pointerId,
  });
}

touchpad.addEventListener('pointerdown', (event) => {
  touchpad.setPointerCapture(event.pointerId);
  touchpad.classList.add('is-active');
  touchPayload(event, 'start');
});
touchpad.addEventListener('pointermove', (event) => {
  if (touchpad.hasPointerCapture(event.pointerId)) touchPayload(event, 'move');
});
function endTouch(event, phase = 'end') {
  if (touchpad.hasPointerCapture(event.pointerId)) touchpad.releasePointerCapture(event.pointerId);
  touchpad.classList.remove('is-active');
  touchPayload(event, phase);
}
touchpad.addEventListener('pointerup', (event) => endTouch(event));
touchpad.addEventListener('pointercancel', (event) => endTouch(event, 'cancel'));

for (const button of document.querySelectorAll('[data-button]')) {
  const name = button.dataset.button;
  const update = (pressed) => {
    button.classList.toggle('is-pressed', pressed);
    if (pressed) navigator.vibrate?.(12);
    send({ type: 'button', name, pressed, value: pressed ? 1 : 0 });
  };
  button.addEventListener('pointerdown', () => update(true));
  button.addEventListener('pointerup', () => update(false));
  button.addEventListener('pointercancel', () => update(false));
  button.addEventListener('pointerleave', (event) => {
    if (event.buttons) update(false);
  });
}

renameButton.addEventListener('click', () => {
  const nextName = prompt('Phone name', phoneName)?.trim();
  if (!nextName) return;
  phoneName = nextName.slice(0, 40);
  localStorage.setItem('oscBridgePhoneName', phoneName);
  deviceLabel.textContent = deviceId ? `${phoneName} · ${deviceId}` : phoneName;
  send({ type: 'identify', name: phoneName });
});

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && sensorEnabled && !wakeLock) {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* Optional. */ }
  }
});

if (!window.isSecureContext) {
  permissionNote.textContent = 'Certificate trust is incomplete. Return to the setup page, install the OSC Bridge profile, and enable full trust.';
  enableMotionButton.disabled = true;
}

connect();
