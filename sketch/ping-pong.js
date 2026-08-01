'use strict';

const { clamp, nextServeDirection, normalizedTilt, paddleBounce, parsePhoneAddress, winnerForScore } = PingPongCore;
const canvas = document.querySelector('#gameCanvas');
const context = canvas.getContext('2d');
const elements = Object.fromEntries([...document.querySelectorAll('[id]')].map((element) => [element.id, element]));

const WORLD = { width: 1280, height: 720 };
const PADDLE = { width: 24, height: 132, inset: 54 };
const BALL_RADIUS = 15;
const TARGET_SCORE = 7;
const TOUCH_OVERRIDE_MS = 1600;

const game = {
  state: 'ready',
  mode: 'ai',
  difficulty: 'normal',
  sound: true,
  leftScore: 0,
  rightScore: 0,
  rally: 0,
  lastScorer: null,
  serveDirection: 1,
  countdown: 0,
  countdownStarted: 0,
  particles: [],
  flash: 0,
  phones: new Map(),
  phoneOrder: [],
  keys: new Set(),
  left: { x: PADDLE.inset, y: WORLD.height / 2, targetY: WORLD.height / 2, velocity: 0 },
  right: { x: WORLD.width - PADDLE.inset, y: WORLD.height / 2, targetY: WORLD.height / 2, velocity: 0 },
  ball: { x: WORLD.width / 2, y: WORLD.height / 2, vx: 0, vy: 0, trail: [] },
  lastFrame: performance.now(),
};

let audioContext;

function playTone(frequency, duration = 0.06, gain = 0.05, type = 'sine') {
  if (!game.sound) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const volume = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(volume).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Sound is optional.
  }
}

function resetBall(direction = nextServeDirection(game.lastScorer)) {
  game.ball.x = WORLD.width / 2;
  game.ball.y = WORLD.height / 2 + (Math.random() - 0.5) * 90;
  game.ball.vx = 0;
  game.ball.vy = 0;
  game.ball.trail.length = 0;
  game.serveDirection = direction;
  game.rally = 0;
  updateScoreboard();
}

function beginServe() {
  if (!['ready', 'serve'].includes(game.state)) return;
  game.state = 'countdown';
  game.countdown = 3;
  game.countdownStarted = performance.now();
  hideOverlay();
  elements.matchState.textContent = 'Serve';
  playTone(440, 0.05, 0.035);
}

function launchBall() {
  const angle = (Math.random() - 0.5) * 0.52;
  const speed = 545;
  game.ball.vx = Math.cos(angle) * speed * game.serveDirection;
  game.ball.vy = Math.sin(angle) * speed;
  game.state = 'playing';
  elements.matchState.textContent = 'Playing';
  playTone(720, 0.08, 0.055, 'triangle');
}

function newMatch(autoStart = false) {
  game.leftScore = 0;
  game.rightScore = 0;
  game.lastScorer = null;
  game.state = 'ready';
  game.left.y = game.left.targetY = WORLD.height / 2;
  game.right.y = game.right.targetY = WORLD.height / 2;
  game.particles.length = 0;
  resetBall(Math.random() < 0.5 ? -1 : 1);
  elements.overlayEyebrow.textContent = 'PHONE-CONTROLLED ARCADE';
  elements.overlayTitle.textContent = 'Ready to rally?';
  elements.overlayMessage.textContent = 'Connect your phone, tap Enable motion, then tilt to move your paddle. The phone touchpad and keyboard also work.';
  elements.startButton.textContent = 'Start match';
  elements.matchState.textContent = 'Ready';
  showOverlay();
  if (autoStart) beginServe();
}

function showOverlay() { elements.overlay.classList.remove('hidden'); }
function hideOverlay() { elements.overlay.classList.add('hidden'); }

function togglePause() {
  if (game.state === 'playing' || game.state === 'countdown') {
    game.state = 'paused';
    elements.overlayEyebrow.textContent = 'MATCH PAUSED';
    elements.overlayTitle.textContent = 'Take a breather';
    elements.overlayMessage.textContent = 'Press B, P, or Resume when you are ready.';
    elements.startButton.textContent = 'Resume';
    elements.matchState.textContent = 'Paused';
    showOverlay();
  } else if (game.state === 'paused') {
    game.state = 'playing';
    elements.matchState.textContent = 'Playing';
    hideOverlay();
  }
}

function scorePoint(side) {
  if (side === 'left') game.leftScore += 1;
  else game.rightScore += 1;
  game.lastScorer = side;
  game.flash = side === 'left' ? 1 : -1;
  playTone(side === 'left' ? 880 : 190, 0.18, 0.07, side === 'left' ? 'triangle' : 'sawtooth');
  updateScoreboard();

  const winner = winnerForScore(game.leftScore, game.rightScore, TARGET_SCORE, 2);
  if (winner) {
    game.state = 'gameover';
    elements.overlayEyebrow.textContent = 'MATCH COMPLETE';
    elements.overlayTitle.textContent = winner === 'left' ? 'You win!' : (game.mode === 'ai' ? 'CPU wins' : 'Player 2 wins');
    elements.overlayMessage.textContent = `Final score: ${game.leftScore}–${game.rightScore}. First to ${TARGET_SCORE}, win by two.`;
    elements.startButton.textContent = 'Play again';
    elements.matchState.textContent = 'Finished';
    burst(WORLD.width / 2, WORLD.height / 2, winner === 'left' ? '#67e8f9' : '#c084fc', 56);
    showOverlay();
    return;
  }

  game.state = 'serve';
  resetBall(nextServeDirection(side));
  elements.matchState.textContent = side === 'left' ? 'Your point' : 'Opponent point';
  setTimeout(() => {
    if (game.state === 'serve') beginServe();
  }, 900);
}

function updateScoreboard() {
  elements.leftScore.textContent = game.leftScore;
  elements.rightScore.textContent = game.rightScore;
  elements.rallyCount.textContent = game.rally;
  elements.rightName.textContent = game.mode === 'ai' ? 'CPU' : 'P2';
}

function updatePhoneStatus(status) {
  const connected = status?.connectedPhones || [];
  const activeIds = new Set(connected.map((phone) => phone.id));
  game.phoneOrder = game.phoneOrder.filter((id) => activeIds.has(id));
  for (const phone of connected) {
    if (!game.phoneOrder.includes(phone.id)) game.phoneOrder.push(phone.id);
    const existing = game.phones.get(phone.id) || { id: phone.id, y: 0.5, touchUntil: 0, axis: 'auto' };
    existing.name = phone.name || `Phone ${game.phoneOrder.indexOf(phone.id) + 1}`;
    game.phones.set(phone.id, existing);
  }
  for (const id of [...game.phones.keys()]) if (!activeIds.has(id)) game.phones.delete(id);
  renderPhones();
}

function renderPhones() {
  const count = game.phoneOrder.length;
  elements.phoneCount.textContent = `${count} connected`;
  elements.connectionBadge.dataset.state = count ? 'connected' : 'waiting';
  elements.connectionText.textContent = count ? `${count} phone${count === 1 ? '' : 's'} ready` : 'Waiting for phone';

  if (!count) {
    elements.phoneList.innerHTML = '<p class="empty">Scan the QR code on the dashboard to connect a phone.</p>';
    return;
  }
  elements.phoneList.replaceChildren(...game.phoneOrder.map((id, index) => {
    const phone = game.phones.get(id);
    const row = document.createElement('div');
    row.className = 'phone';
    const dot = document.createElement('i');
    const name = document.createElement('strong');
    name.textContent = phone?.name || id;
    const side = document.createElement('span');
    side.textContent = index === 0 ? 'P1' : index === 1 ? 'P2' : 'Standby';
    row.append(dot, name, side);
    return row;
  }));
}

function handlePhoneMessage(args, address) {
  const parsed = parsePhoneAddress(address);
  if (!parsed) return;
  const phone = game.phones.get(parsed.deviceId) || { id: parsed.deviceId, name: parsed.deviceId, y: 0.5, touchUntil: 0, axis: 'auto' };
  if (!game.phoneOrder.includes(parsed.deviceId)) game.phoneOrder.push(parsed.deviceId);
  game.phones.set(parsed.deviceId, phone);

  if (parsed.event === 'orientation') {
    if (performance.now() < phone.touchUntil) return;
    const [, beta, gamma] = args;
    const mapped = normalizedTilt(beta, gamma, elements.tiltAxis.value);
    phone.axis = mapped.axis;
    phone.y = mapped.value;
  } else if (parsed.event === 'touch') {
    const [, y, , phase] = args;
    if (phase !== 'end' && phase !== 'cancel') {
      phone.y = clamp(y, 0, 1);
      phone.touchUntil = performance.now() + TOUCH_OVERRIDE_MS;
    }
  } else if (parsed.event === 'button/a' && Number(args[0]) === 1) {
    if (game.state === 'gameover') newMatch(true);
    else if (game.state === 'ready' || game.state === 'serve') beginServe();
  } else if (parsed.event === 'button/b' && Number(args[0]) === 1) {
    togglePause();
  }
  renderPhones();
}

function targetFromPhone(index) {
  const phone = game.phones.get(game.phoneOrder[index]);
  return phone ? PADDLE.height / 2 + phone.y * (WORLD.height - PADDLE.height) : null;
}

function updatePaddles(dt) {
  const phoneLeft = targetFromPhone(0);
  if (phoneLeft !== null) game.left.targetY = phoneLeft;
  else if (game.keys.has('KeyW') || game.keys.has('ArrowUp')) game.left.targetY -= 620 * dt;
  else if (game.keys.has('KeyS') || game.keys.has('ArrowDown')) game.left.targetY += 620 * dt;

  if (game.mode === 'two-player') {
    const phoneRight = targetFromPhone(1);
    if (phoneRight !== null) game.right.targetY = phoneRight;
    else if (game.keys.has('KeyI')) game.right.targetY -= 620 * dt;
    else if (game.keys.has('KeyK')) game.right.targetY += 620 * dt;
  } else {
    const settings = {
      easy: { speed: 360, error: 72, anticipation: 0.2 },
      normal: { speed: 505, error: 34, anticipation: 0.48 },
      hard: { speed: 650, error: 12, anticipation: 0.76 },
    }[game.difficulty];
    const approaching = game.ball.vx > 0;
    const projected = approaching
      ? game.ball.y + game.ball.vy * ((game.right.x - game.ball.x) / Math.max(1, game.ball.vx)) * settings.anticipation
      : WORLD.height / 2;
    const wobble = Math.sin(performance.now() / 510) * settings.error;
    game.right.targetY = projected + wobble;
    const delta = clamp(game.right.targetY - game.right.y, -settings.speed * dt, settings.speed * dt);
    game.right.targetY = game.right.y + delta;
  }

  for (const paddle of [game.left, game.right]) {
    paddle.targetY = clamp(paddle.targetY, PADDLE.height / 2 + 10, WORLD.height - PADDLE.height / 2 - 10);
    const previous = paddle.y;
    const smoothing = 1 - Math.exp(-dt * 15);
    paddle.y += (paddle.targetY - paddle.y) * smoothing;
    paddle.velocity = (paddle.y - previous) / Math.max(dt, 0.001);
  }
}

function updateBall(dt) {
  if (game.state !== 'playing') return;
  const ball = game.ball;
  ball.trail.unshift({ x: ball.x, y: ball.y });
  if (ball.trail.length > 14) ball.trail.length = 14;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y - BALL_RADIUS <= 10 && ball.vy < 0) {
    ball.y = 10 + BALL_RADIUS;
    ball.vy *= -1;
    playTone(330, 0.035, 0.025);
  } else if (ball.y + BALL_RADIUS >= WORLD.height - 10 && ball.vy > 0) {
    ball.y = WORLD.height - 10 - BALL_RADIUS;
    ball.vy *= -1;
    playTone(330, 0.035, 0.025);
  }

  const leftFace = game.left.x + PADDLE.width / 2;
  const rightFace = game.right.x - PADDLE.width / 2;
  if (
    ball.vx < 0
    && ball.x - BALL_RADIUS <= leftFace
    && ball.x > game.left.x - PADDLE.width
    && Math.abs(ball.y - game.left.y) <= PADDLE.height / 2 + BALL_RADIUS
  ) {
    ball.x = leftFace + BALL_RADIUS;
    Object.assign(ball, paddleBounce(ball, { ...game.left, height: PADDLE.height }, 1));
    game.rally += 1;
    hitEffect(leftFace, ball.y, '#67e8f9');
  } else if (
    ball.vx > 0
    && ball.x + BALL_RADIUS >= rightFace
    && ball.x < game.right.x + PADDLE.width
    && Math.abs(ball.y - game.right.y) <= PADDLE.height / 2 + BALL_RADIUS
  ) {
    ball.x = rightFace - BALL_RADIUS;
    Object.assign(ball, paddleBounce(ball, { ...game.right, height: PADDLE.height }, -1));
    game.rally += 1;
    hitEffect(rightFace, ball.y, '#c084fc');
  }

  if (ball.x < -60) scorePoint('right');
  else if (ball.x > WORLD.width + 60) scorePoint('left');
  updateScoreboard();
}

function hitEffect(x, y, color) {
  playTone(520 + Math.min(420, game.rally * 20), 0.045, 0.045, 'square');
  burst(x, y, color, 12);
}

function burst(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 280;
    game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.55 + Math.random() * 0.5, color });
  }
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= Math.pow(0.15, dt);
    particle.vy *= Math.pow(0.15, dt);
    particle.life -= dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
  game.flash *= Math.pow(0.035, dt);
}

function updateCountdown(now) {
  if (game.state !== 'countdown') return;
  const elapsed = (now - game.countdownStarted) / 1000;
  const next = 3 - Math.floor(elapsed);
  if (next !== game.countdown && next > 0) {
    game.countdown = next;
    playTone(420 + (3 - next) * 100, 0.05, 0.035);
  }
  if (elapsed >= 3) launchBall();
}

function drawRoundedRect(x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function render() {
  const scaleX = canvas.width / WORLD.width;
  const scaleY = canvas.height / WORLD.height;
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  context.clearRect(0, 0, WORLD.width, WORLD.height);

  const gradient = context.createLinearGradient(0, 0, WORLD.width, WORLD.height);
  gradient.addColorStop(0, '#08131b');
  gradient.addColorStop(0.5, '#070c12');
  gradient.addColorStop(1, '#120a19');
  context.fillStyle = gradient;
  context.fillRect(0, 0, WORLD.width, WORLD.height);

  context.strokeStyle = 'rgba(148, 163, 184, .16)';
  context.lineWidth = 2;
  context.setLineDash([13, 16]);
  context.beginPath();
  context.moveTo(WORLD.width / 2, 18);
  context.lineTo(WORLD.width / 2, WORLD.height - 18);
  context.stroke();
  context.setLineDash([]);

  context.strokeStyle = 'rgba(103, 232, 249, .1)';
  context.lineWidth = 18;
  context.strokeRect(9, 9, WORLD.width - 18, WORLD.height - 18);

  for (let index = game.ball.trail.length - 1; index >= 0; index -= 1) {
    const trail = game.ball.trail[index];
    const alpha = (1 - index / game.ball.trail.length) * 0.26;
    context.fillStyle = `rgba(255,255,255,${alpha})`;
    context.beginPath();
    context.arc(trail.x, trail.y, Math.max(2, BALL_RADIUS * (1 - index / 20)), 0, Math.PI * 2);
    context.fill();
  }

  drawPaddle(game.left, '#67e8f9', 'rgba(34,211,238,.34)');
  drawPaddle(game.right, '#c084fc', 'rgba(168,85,247,.32)');

  context.shadowColor = '#ffffff';
  context.shadowBlur = 24;
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.arc(game.ball.x, game.ball.y, BALL_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.shadowBlur = 0;

  for (const particle of game.particles) {
    context.globalAlpha = clamp(particle.life * 1.8, 0, 1);
    context.fillStyle = particle.color;
    context.beginPath();
    context.arc(particle.x, particle.y, 3.5, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  if (game.state === 'countdown') {
    context.fillStyle = 'rgba(5,8,13,.35)';
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    context.fillStyle = '#fff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '900 160px Inter, system-ui, sans-serif';
    context.shadowColor = '#67e8f9';
    context.shadowBlur = 34;
    context.fillText(String(Math.max(1, game.countdown)), WORLD.width / 2, WORLD.height / 2 + 16);
    context.shadowBlur = 0;
  }

  if (Math.abs(game.flash) > 0.01) {
    const color = game.flash > 0 ? '103,232,249' : '192,132,252';
    const flashGradient = context.createLinearGradient(game.flash > 0 ? 0 : WORLD.width, 0, game.flash > 0 ? WORLD.width : 0, 0);
    flashGradient.addColorStop(0, `rgba(${color},${Math.abs(game.flash) * .24})`);
    flashGradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = flashGradient;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
  }
}

function drawPaddle(paddle, color, glow) {
  context.shadowColor = glow;
  context.shadowBlur = 28;
  context.fillStyle = color;
  drawRoundedRect(paddle.x - PADDLE.width / 2, paddle.y - PADDLE.height / 2, PADDLE.width, PADDLE.height, 12);
  context.fill();
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,.38)';
  drawRoundedRect(paddle.x - 4, paddle.y - PADDLE.height / 2 + 10, 5, PADDLE.height - 20, 3);
  context.fill();
}

function resizeCanvas() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const bounds = canvas.getBoundingClientRect();
  canvas.width = Math.max(640, Math.round(bounds.width * ratio));
  canvas.height = Math.max(360, Math.round(bounds.height * ratio));
}

function frame(now) {
  const dt = Math.min(0.032, Math.max(0, (now - game.lastFrame) / 1000));
  game.lastFrame = now;
  updateCountdown(now);
  if (game.state !== 'paused' && game.state !== 'gameover') {
    updatePaddles(dt);
    updateBall(dt);
    updateParticles(dt);
  }
  render();
  requestAnimationFrame(frame);
}

OSC.route('/phone/**', handlePhoneMessage);
Bridge.onStatus(updatePhoneStatus);
Bridge.getStatus().then(updatePhoneStatus).catch(() => renderPhones());

for (const button of elements.modePicker.querySelectorAll('button')) {
  button.addEventListener('click', () => {
    game.mode = button.dataset.mode;
    for (const candidate of elements.modePicker.querySelectorAll('button')) candidate.classList.toggle('active', candidate === button);
    elements.difficulty.disabled = game.mode === 'two-player';
    newMatch();
  });
}

elements.difficulty.addEventListener('change', () => { game.difficulty = elements.difficulty.value; });
elements.soundToggle.addEventListener('change', () => { game.sound = elements.soundToggle.checked; });
elements.startButton.addEventListener('click', () => {
  if (game.state === 'gameover') newMatch(true);
  else if (game.state === 'paused') togglePause();
  else beginServe();
});
elements.resetButton.addEventListener('click', () => newMatch());
elements.backButton.addEventListener('click', () => { location.href = 'index.html'; });

window.addEventListener('keydown', (event) => {
  game.keys.add(event.code);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space') {
    if (game.state === 'gameover') newMatch(true);
    else beginServe();
  }
  if (event.code === 'KeyP' || event.code === 'Escape') togglePause();
});
window.addEventListener('keyup', (event) => game.keys.delete(event.code));
window.addEventListener('resize', resizeCanvas);

new ResizeObserver(resizeCanvas).observe(canvas);
newMatch();
resizeCanvas();
requestAnimationFrame(frame);
