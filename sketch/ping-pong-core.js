'use strict';

(function expose(factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof globalThis === 'object') globalThis.PingPongCore = api;
}(function createCore() {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

  function parsePhoneAddress(address) {
    if (typeof address !== 'string') return null;
    const match = address.match(/^\/phone\/([^/]+)\/(.+)$/);
    return match ? { deviceId: match[1], event: match[2] } : null;
  }

  function normalizedTilt(beta, gamma, preferredAxis = 'auto') {
    const pitch = clamp(beta, -45, 45);
    const roll = clamp(gamma, -45, 45);
    let axis = preferredAxis;
    if (axis === 'auto') axis = Math.abs(roll) > Math.abs(pitch) ? 'roll' : 'pitch';
    const degrees = axis === 'roll' ? roll : pitch;
    return { axis, value: clamp(0.5 + degrees / 90, 0, 1) };
  }

  function paddleBounce(ball, paddle, direction) {
    const relative = clamp((ball.y - paddle.y) / (paddle.height / 2), -1, 1);
    const speed = Math.min(980, Math.hypot(ball.vx, ball.vy) * 1.055 + 12);
    const angle = relative * 0.92;
    const influence = clamp(paddle.velocity / 720, -0.24, 0.24);
    return {
      vx: Math.cos(angle) * speed * direction,
      vy: Math.sin(angle) * speed + influence * speed,
    };
  }

  function winnerForScore(left, right, target = 7, winBy = 2) {
    const high = Math.max(left, right);
    if (high < target || Math.abs(left - right) < winBy) return null;
    return left > right ? 'left' : 'right';
  }

  function nextServeDirection(lastScorer) {
    if (lastScorer === 'left') return -1;
    if (lastScorer === 'right') return 1;
    return Math.random() < 0.5 ? -1 : 1;
  }

  return {
    clamp,
    nextServeDirection,
    normalizedTilt,
    paddleBounce,
    parsePhoneAddress,
    winnerForScore,
  };
}));
