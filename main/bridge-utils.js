'use strict';

const MAX_TEXT_LENGTH = 256;

function clamp(value, min, max, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeText(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, MAX_TEXT_LENGTH);
}

function unwrapOscArg(value) {
  if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'value')) {
    return value.value;
  }
  return value;
}

function normalizeOscMessage(message) {
  if (Array.isArray(message)) {
    const [address, ...args] = message;
    if (typeof address !== 'string' || !address.startsWith('/')) return null;
    return { address, args: args.map(unwrapOscArg) };
  }

  if (message && typeof message === 'object' && typeof message.address === 'string') {
    const args = Array.isArray(message.args) ? message.args : [];
    return { address: message.address, args: args.map(unwrapOscArg) };
  }

  return null;
}

function oscPatternToRegex(pattern) {
  if (pattern === '*' || pattern === '/**') return /^\/.*$/;
  if (typeof pattern !== 'string' || pattern.length === 0) {
    throw new TypeError('OSC route pattern must be a non-empty string.');
  }

  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*';
        index += 1;
      } else {
        source += '[^/]+';
      }
      continue;
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(`^${source}$`);
}

function quaternionFromEuler(alpha, beta, gamma) {
  const degToRad = Math.PI / 180;
  const x = finite(beta) * degToRad;
  const y = finite(gamma) * degToRad;
  const z = finite(alpha) * degToRad;

  const cX = Math.cos(x / 2);
  const cY = Math.cos(y / 2);
  const cZ = Math.cos(z / 2);
  const sX = Math.sin(x / 2);
  const sY = Math.sin(y / 2);
  const sZ = Math.sin(z / 2);

  return {
    x: sX * cY * cZ - cX * sY * sZ,
    y: cX * sY * cZ + sX * cY * sZ,
    z: cX * cY * sZ + sX * sY * cZ,
    w: cX * cY * cZ - sX * sY * sZ,
  };
}

function normalizePhoneMessage(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const type = safeText(payload.type).toLowerCase();
  const timestamp = finite(payload.timestamp, Date.now());

  if (type === 'orientation') {
    const alpha = finite(payload.alpha);
    const beta = finite(payload.beta);
    const gamma = finite(payload.gamma);
    const quaternion = quaternionFromEuler(alpha, beta, gamma);
    return {
      type,
      timestamp,
      data: {
        alpha,
        beta,
        gamma,
        absolute: Boolean(payload.absolute),
        screen: finite(payload.screen),
        quaternion,
      },
    };
  }

  if (type === 'motion') {
    const vector = (input = {}) => ({
      x: finite(input.x),
      y: finite(input.y),
      z: finite(input.z),
    });
    return {
      type,
      timestamp,
      data: {
        acceleration: vector(payload.acceleration),
        accelerationIncludingGravity: vector(payload.accelerationIncludingGravity),
        rotationRate: {
          alpha: finite(payload.rotationRate?.alpha),
          beta: finite(payload.rotationRate?.beta),
          gamma: finite(payload.rotationRate?.gamma),
        },
        interval: clamp(payload.interval, 0, 1000),
      },
    };
  }

  if (type === 'touch') {
    const allowedPhases = new Set(['start', 'move', 'end', 'cancel']);
    const phase = safeText(payload.phase).toLowerCase();
    return {
      type,
      timestamp,
      data: {
        phase: allowedPhases.has(phase) ? phase : 'move',
        x: clamp(payload.x, 0, 1),
        y: clamp(payload.y, 0, 1),
        pressure: clamp(payload.pressure, 0, 1),
        pointerId: Math.trunc(clamp(payload.pointerId, 0, Number.MAX_SAFE_INTEGER)),
      },
    };
  }

  if (type === 'button') {
    const name = safeText(payload.name, 'button') || 'button';
    return {
      type,
      timestamp,
      data: {
        name,
        pressed: Boolean(payload.pressed),
        value: finite(payload.value, payload.pressed ? 1 : 0),
      },
    };
  }

  if (type === 'status') {
    return {
      type,
      timestamp,
      data: {
        event: safeText(payload.event, 'status') || 'status',
        detail: safeText(payload.detail),
      },
    };
  }

  return null;
}

function phoneMessageToOsc(message, deviceId = 'phone') {
  if (!message) return [];
  const prefix = `/phone/${safeText(deviceId, 'phone').replace(/[^a-zA-Z0-9_-]/g, '_') || 'phone'}`;
  const { data } = message;

  switch (message.type) {
    case 'orientation':
      return [
        { address: `${prefix}/orientation`, args: [data.alpha, data.beta, data.gamma, data.absolute ? 1 : 0, data.screen] },
        { address: `${prefix}/quaternion`, args: [data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w] },
      ];
    case 'motion':
      return [
        { address: `${prefix}/accel`, args: [data.acceleration.x, data.acceleration.y, data.acceleration.z] },
        { address: `${prefix}/accel-gravity`, args: [data.accelerationIncludingGravity.x, data.accelerationIncludingGravity.y, data.accelerationIncludingGravity.z] },
        { address: `${prefix}/rotation-rate`, args: [data.rotationRate.alpha, data.rotationRate.beta, data.rotationRate.gamma] },
      ];
    case 'touch':
      return [{ address: `${prefix}/touch`, args: [data.x, data.y, data.pressure, data.phase, data.pointerId] }];
    case 'button':
      return [{ address: `${prefix}/button/${data.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`, args: [data.pressed ? 1 : 0, data.value] }];
    case 'status':
      return [{ address: `${prefix}/status`, args: [data.event, data.detail] }];
    default:
      return [];
  }
}

module.exports = {
  clamp,
  normalizeOscMessage,
  normalizePhoneMessage,
  oscPatternToRegex,
  phoneMessageToOsc,
  quaternionFromEuler,
};
