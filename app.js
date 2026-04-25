const board = document.getElementById("game-board");
const ctx = board.getContext("2d");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const speedLabelEl = document.getElementById("speed-label");
const comboLabelEl = document.getElementById("combo-label");
const powerLabelEl = document.getElementById("power-label");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("overlay");
const startButton = document.getElementById("start-button");
const pauseButton = document.getElementById("pause-button");
const shareButton = document.getElementById("share-button");
const shareOptionButtons = document.querySelectorAll(".share-option");
const musicToggleButton = document.getElementById("music-toggle-button");
const sfxToggleButton = document.getElementById("sfx-toggle-button");
const modeLabelEl = document.getElementById("mode-label");
const viewLabelEl = document.getElementById("view-label");
const neonModeButton = document.getElementById("neon-mode-button");
const realModeButton = document.getElementById("real-mode-button");
const view2dButton = document.getElementById("view-2d-button");
const view3dButton = document.getElementById("view-3d-button");
const viewChaseButton = document.getElementById("view-chase-button");
const imagePromptEl = document.getElementById("image-prompt");
const copyPromptButton = document.getElementById("copy-prompt-button");
const snakeImageInput = document.getElementById("snake-image-input");
const clearImageButton = document.getElementById("clear-image-button");
const boardFrame = document.querySelector(".board-frame");
const touchButtons = document.querySelectorAll(".control-button");

const gridSize = 20;
const tileCount = board.width / gridSize;
const initialTick = 150;
const bestScoreKey = "neon-snake-rush-best-score";
const defaultSnakeTexturePath = "snake-skin.svg";
const canonicalShareUrl = "https://mathorline.github.io/neon-snake-rush/";
const speedLabels = [
  { max: 4, label: "Chill" },
  { max: 9, label: "Quick" },
  { max: 14, label: "Fast" },
  { max: Infinity, label: "Wild" }
];

let snake = [];
let direction = { x: 1, y: 0 };
let pendingDirection = { x: 1, y: 0 };
let food = null;
let score = 0;
let combo = 0;
let foodEaten = 0;
let bestScore = Number.parseInt(localStorage.getItem(bestScoreKey) || "0", 10);
let tickMs = initialTick;
let lastTickAt = 0;
let animationFrameId = null;
let gameState = "idle";
let visualMode = "real";
let boardViewMode = "3d";
let snakeTextureImage = null;
let snakeTexturePattern = null;
let audioContext = null;
let particles = [];
let floatingScores = [];
let obstacles = [];
let powerUp = null;
let pulseTick = 0;
let shake = { strength: 0, until: 0 };
let flashTimeoutId = null;
let slowUntil = 0;
let shieldCharges = 0;
let musicEnabled = true;
let sfxEnabled = true;
let musicStep = 0;
let nextMusicAt = 0;
let touchStartPoint = null;

bestScoreEl.textContent = String(bestScore);

function ensureAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) audioContext = new AudioContextClass();
  }
  if (audioContext && audioContext.state === "suspended") audioContext.resume();
}

function playTone({ frequency, duration, type = "sine", volume = 0.06, slideTo = null }) {
  if (!sfxEnabled) return;
  ensureAudio();
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playMusicTone({ frequency, when, duration, type = "triangle", volume = 0.02 }) {
  if (!musicEnabled || !audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  gainNode.gain.setValueAtTime(0.0001, when);
  gainNode.gain.linearRampToValueAtTime(volume, when + 0.03);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(when);
  oscillator.stop(when + duration + 0.03);
}

function scheduleMusic() {
  if (!musicEnabled) return;
  ensureAudio();
  if (!audioContext) return;
  const leadPattern = [262, 330, 392, 523, 392, 330, 294, 349];
  const bassPattern = [131, 147, 165, 196];
  while (nextMusicAt < audioContext.currentTime + 0.32) {
    playMusicTone({ frequency: leadPattern[musicStep % leadPattern.length], when: nextMusicAt, duration: 0.22, volume: 0.018 });
    playMusicTone({ frequency: bassPattern[musicStep % bassPattern.length], when: nextMusicAt, duration: 0.28, type: "sine", volume: 0.013 });
    musicStep += 1;
    nextMusicAt += 0.24;
  }
}

function triggerFlash() {
  boardFrame.classList.add("flash");
  if (flashTimeoutId) window.clearTimeout(flashTimeoutId);
  flashTimeoutId = window.setTimeout(() => boardFrame.classList.remove("flash"), 160);
}

function triggerShake(strength = 8, duration = 180) {
  shake = { strength, until: performance.now() + duration };
}

function vibrate(pattern) {
  if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
}

function spawnParticles(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.35;
    const speed = 1 + Math.random() * 2.6;
    particles.push({ x, y, dx: Math.cos(angle) * speed, dy: Math.sin(angle) * speed, life: 1, color, size: 2 + Math.random() * 3 });
  }
}

function updateParticles() {
  particles = particles.map((p) => ({ ...p, x: p.x + p.dx, y: p.y + p.dy, dx: p.dx * 0.98, dy: p.dy * 0.98 + 0.02, life: p.life - 0.025 })).filter((p) => p.life > 0);
  floatingScores = floatingScores.map((s) => ({ ...s, y: s.y - 0.8, life: s.life - 0.022 })).filter((s) => s.life > 0);
}

function spawnFloatingScore(text, x, y, color = "#f3fbff") {
  floatingScores.push({ text, x, y, color, life: 1 });
}

function isCellOccupied(x, y, extraCells = []) {
  return snake.some((segment) => segment.x === x && segment.y === y) || obstacles.some((obstacle) => obstacle.x === x && obstacle.y === y) || extraCells.some((cell) => cell.x === x && cell.y === y) || (food && food.x === x && food.y === y) || (powerUp && powerUp.x === x && powerUp.y === y);
}

function placeFreeCell(extraCells = []) {
  for (let tries = 0; tries < 800; tries += 1) {
    const candidate = { x: Math.floor(Math.random() * tileCount), y: Math.floor(Math.random() * tileCount) };
    const nearHead = snake[0] && Math.abs(candidate.x - snake[0].x) + Math.abs(candidate.y - snake[0].y) < 4;
    if (!nearHead && !isCellOccupied(candidate.x, candidate.y, extraCells)) return candidate;
  }
  return { x: 1, y: 1 };
}

function getComboMultiplier() {
  if (combo >= 12) return 4;
  if (combo >= 7) return 3;
  if (combo >= 3) return 2;
  return 1;
}

function updateScoreUi() {
  scoreEl.textContent = String(score);
  speedLabelEl.textContent = (speedLabels.find((entry) => score <= entry.max) || speedLabels[3]).label;
  comboLabelEl.textContent = `x${Math.max(1, getComboMultiplier())}`;
}

function updatePowerUi() {
  const slowActive = performance.now() < slowUntil;
  document.body.classList.toggle("shield-ready", shieldCharges > 0);
  document.body.classList.toggle("slow-motion", slowActive);
  if (shieldCharges > 0) powerLabelEl.textContent = "Shield";
  else if (slowActive) powerLabelEl.textContent = "Slow-mo";
  else if (powerUp) powerLabelEl.textContent = powerUp.label;
  else powerLabelEl.textContent = "None";
}

function updateStatus(message) {
  statusEl.textContent = message;
}

function showOverlay(kicker, title, copy) {
  overlayEl.innerHTML = `<div class="overlay-card"><p class="overlay-kicker">${kicker}</p><h2>${title}</h2><p>${copy}</p></div>`;
  overlayEl.classList.add("visible");
}

function hideOverlay() {
  overlayEl.classList.remove("visible");
}

function resetGame() {
  snake = [{ x: 7, y: 14 }, { x: 6, y: 14 }, { x: 5, y: 14 }];
  direction = { x: 1, y: 0 };
  pendingDirection = { x: 1, y: 0 };
  score = 0;
  combo = 0;
  foodEaten = 0;
  tickMs = initialTick;
  particles = [];
  floatingScores = [];
  obstacles = [];
  powerUp = null;
  food = placeFreeCell();
  slowUntil = 0;
  shieldCharges = 0;
  nextMusicAt = 0;
  musicStep = 0;
  updateScoreUi();
  updatePowerUi();
  updateStatus("Press start or hit space to begin.");
  showOverlay("Ready when you are", "Guide the snake.", "Collect fruit, dodge the edges, and see how long you can keep the run alive.");
  gameState = "idle";
}

function spawnPowerUp() {
  const types = [
    { type: "bonus", label: "Gold", color: "#ffd166" },
    { type: "slow", label: "Slow-mo", color: "#72c6ff" },
    { type: "shield", label: "Shield", color: "#57f2c2" }
  ];
  powerUp = { ...placeFreeCell(), ...types[Math.floor(Math.random() * types.length)], expiresAt: performance.now() + 9000 };
  updatePowerUi();
}

function ensureObstaclePressure() {
  const desired = Math.min(12, Math.floor(score / 5));
  while (obstacles.length < desired) obstacles.push(placeFreeCell());
}

function startGame() {
  if (gameState === "running") return;
  ensureAudio();
  if (gameState === "game-over") resetGame();
  gameState = "running";
  hideOverlay();
  updateStatus("Run is live. Stay sharp.");
  lastTickAt = performance.now();
  if (audioContext) nextMusicAt = audioContext.currentTime + 0.05;
  playTone({ frequency: 320, duration: 0.18, type: "triangle", slideTo: 480, volume: 0.045 });
  vibrate(20);
  if (!animationFrameId) animationFrameId = requestAnimationFrame(gameLoop);
}

function togglePause() {
  if (gameState === "idle") return startGame();
  if (gameState === "running") {
    gameState = "paused";
    showOverlay("Paused", "Take a breath.", "Hit space or the pause button again when you are ready to jump back in.");
    updateStatus("Game paused.");
    playTone({ frequency: 240, duration: 0.14, type: "square", slideTo: 160, volume: 0.03 });
    return;
  }
  if (gameState === "paused") {
    gameState = "running";
    hideOverlay();
    updateStatus("Back in motion.");
    lastTickAt = performance.now();
    if (!animationFrameId) animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function endGame() {
  gameState = "game-over";
  combo = 0;
  updateScoreUi();
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
  }
  showOverlay("Game over", "The trail caught up.", `Final score: ${score}. High score: ${bestScore}. Press Enter or Start Game to launch another run.`);
  updateStatus("Game over. Press Enter to restart.");
  triggerShake(14, 280);
  triggerFlash();
  playTone({ frequency: 220, duration: 0.34, type: "sawtooth", slideTo: 70, volume: 0.07 });
  vibrate([50, 40, 90]);
}

function getSharePayload() {
  return { title: `I scored ${score} in Neon Snake Rush`, text: `I just scored ${score} in Neon Snake Rush. My high score is ${bestScore}. Can you beat it?`, url: canonicalShareUrl };
}

function buildShareUrl(target) {
  const { title, text, url } = getSharePayload();
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(text);
  const encodedCombined = encodeURIComponent(`${text}\n\n${url}`);
  const encodedUrl = encodeURIComponent(url);
  return {
    reddit: `https://www.reddit.com/submit?title=${encodedTitle}&url=${encodedUrl}&text=${encodedCombined}`,
    x: `https://twitter.com/intent/tweet?text=${encodedCombined}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
    whatsapp: `https://wa.me/?text=${encodedCombined}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
    email: `mailto:?subject=${encodedTitle}&body=${encodedCombined}`
  }[target] || null;
}

async function copyShareText() {
  const { title, text, url } = getSharePayload();
  const copyText = `${title}\n\n${text}\n\n${url}`;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(copyText);
    else {
      const textArea = document.createElement("textarea");
      textArea.value = copyText;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.append(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    updateStatus("Share text copied. Go make the internet fear your score.");
    playTone({ frequency: 410, duration: 0.12, type: "triangle", slideTo: 520, volume: 0.025 });
  } catch (error) {
    updateStatus("Copy was blocked. Try one of the app share buttons instead.");
  }
}

async function shareScoreNative() {
  const payload = getSharePayload();
  if (!navigator.share) {
    updateStatus("Pick an app below to share your score.");
    return;
  }
  try {
    await navigator.share(payload);
    updateStatus("Opened your device share sheet.");
  } catch (error) {
    if (error.name !== "AbortError") updateStatus("Share sheet was blocked. Pick an app below instead.");
  }
}

function shareScoreToTarget(target) {
  if (target === "copy") return copyShareText();
  const shareUrl = buildShareUrl(target);
  if (!shareUrl) return;
  window.open(shareUrl, "_blank", "noopener,noreferrer");
  updateStatus("Opened share with your latest score.");
  playTone({ frequency: 410, duration: 0.12, type: "triangle", slideTo: 520, volume: 0.025 });
}

function updateAudioButtons() {
  musicToggleButton.textContent = musicEnabled ? "Music On" : "Music Off";
  sfxToggleButton.textContent = sfxEnabled ? "SFX On" : "SFX Off";
  musicToggleButton.classList.toggle("active", musicEnabled);
  sfxToggleButton.classList.toggle("active", sfxEnabled);
}

function toggleMusic() {
  musicEnabled = !musicEnabled;
  ensureAudio();
  if (audioContext) nextMusicAt = audioContext.currentTime + 0.05;
  updateAudioButtons();
  updateStatus(musicEnabled ? "Music enabled." : "Music muted.");
}

function toggleSfx() {
  sfxEnabled = !sfxEnabled;
  updateAudioButtons();
  updateStatus(sfxEnabled ? "Sound effects enabled." : "Sound effects muted.");
  if (sfxEnabled) playTone({ frequency: 440, duration: 0.08, type: "triangle", slideTo: 560, volume: 0.022 });
}

function setVisualMode(nextMode) {
  visualMode = nextMode;
  const isReal = nextMode === "real";
  modeLabelEl.textContent = isReal ? "Real Snake" : "Neon";
  neonModeButton.classList.toggle("active", !isReal);
  realModeButton.classList.toggle("active", isReal);
}

function setBoardViewMode(nextMode) {
  boardViewMode = nextMode;
  const is2d = nextMode === "2d";
  const isChase = nextMode === "chase";
  document.body.classList.toggle("view-2d", is2d);
  document.body.classList.toggle("view-chase", isChase);
  viewLabelEl.textContent = isChase ? "Chase" : is2d ? "2D" : "3D";
  view2dButton.classList.toggle("active", is2d);
  view3dButton.classList.toggle("active", nextMode === "3d");
  viewChaseButton.classList.toggle("active", isChase);
  updateStatus(isChase ? "Chase camera active. Stay on the snake's tail." : `${viewLabelEl.textContent} board view active.`);
}

function setSnakeTextureFromSource(source) {
  const nextImage = new Image();
  nextImage.onload = () => {
    snakeTextureImage = nextImage;
    snakeTexturePattern = ctx.createPattern(nextImage, "repeat");
    setVisualMode("real");
    updateStatus("Custom snake image loaded. Real snake mode is ready.");
    playTone({ frequency: 420, duration: 0.18, type: "triangle", slideTo: 610, volume: 0.03 });
  };
  nextImage.onerror = () => updateStatus("That snake image could not be loaded. Try another one.");
  nextImage.src = source;
}

function loadDefaultSnakeTexture() {
  setSnakeTextureFromSource(defaultSnakeTexturePath);
}

function handleSnakeImageUpload(event) {
  const file = (event.target.files || [])[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setSnakeTextureFromSource(String(reader.result));
  reader.readAsDataURL(file);
}

function clearSnakeTexture() {
  snakeImageInput.value = "";
  loadDefaultSnakeTexture();
}

async function copyImagePrompt() {
  const prompt = imagePromptEl.value.trim();
  if (!prompt) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(prompt);
    else {
      imagePromptEl.select();
      document.execCommand("copy");
    }
    updateStatus("Image prompt copied. Generate a snake image, then upload it here.");
  } catch (error) {
    updateStatus("Clipboard copy was blocked. You can still copy the prompt manually.");
  }
}

function applyDirection(name) {
  const directions = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const next = directions[name];
  if (next) setDirection(next[0], next[1]);
}

function collectPowerUp(item) {
  const centerX = item.x * gridSize + gridSize / 2;
  const centerY = item.y * gridSize + gridSize / 2;
  if (item.type === "bonus") {
    const bonus = 5 * getComboMultiplier();
    score += bonus;
    spawnFloatingScore(`+${bonus}`, centerX, centerY, "#ffd166");
    updateStatus("Golden prey caught. Big bonus.");
  } else if (item.type === "slow") {
    slowUntil = performance.now() + 6500;
    spawnFloatingScore("SLOW", centerX, centerY, "#72c6ff");
    updateStatus("Slow-mo venom active. The board bends to you.");
  } else {
    shieldCharges = Math.min(2, shieldCharges + 1);
    spawnFloatingScore("SHIELD", centerX, centerY, "#57f2c2");
    updateStatus("Shield charged. One crash gets forgiven.");
  }
  spawnParticles(centerX, centerY, item.color, 20);
  triggerFlash();
  vibrate(25);
  updateScoreUi();
  updatePowerUi();
}

function stepGame() {
  direction = pendingDirection;
  const nextHead = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
  const hitWall = nextHead.x < 0 || nextHead.y < 0 || nextHead.x >= tileCount || nextHead.y >= tileCount;
  const hitObstacle = obstacles.some((obstacle) => obstacle.x === nextHead.x && obstacle.y === nextHead.y);
  const willEatFood = nextHead.x === food.x && nextHead.y === food.y;
  const willEatPowerUp = powerUp && nextHead.x === powerUp.x && nextHead.y === powerUp.y;
  const bodyToCheck = willEatFood ? snake : snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);
  if (hitWall || hitSelf || hitObstacle) {
    if (shieldCharges > 0) {
      shieldCharges -= 1;
      combo = 0;
      updateScoreUi();
      updatePowerUi();
      updateStatus("Shield shattered. You're still alive.");
      triggerShake(9, 160);
      triggerFlash();
      return;
    }
    return endGame();
  }
  snake.unshift(nextHead);
  if (willEatFood) {
    combo += 1;
    foodEaten += 1;
    const points = getComboMultiplier();
    score += points;
    tickMs = Math.max(70, initialTick - score * 5);
    spawnParticles(food.x * gridSize + gridSize / 2, food.y * gridSize + gridSize / 2, "#ff8a98", 14);
    spawnFloatingScore(`+${points}`, food.x * gridSize + gridSize / 2, food.y * gridSize + gridSize / 2, "#ffd8de");
    food = placeFreeCell();
    ensureObstaclePressure();
    if (foodEaten % 4 === 0) spawnPowerUp();
    updateScoreUi();
    updatePowerUi();
    updateStatus(combo >= 3 ? `Combo x${getComboMultiplier()}. Keep the chain venomous.` : "Nice catch. Keep the chain going.");
    triggerFlash();
    playTone({ frequency: 540, duration: 0.12, type: "triangle", slideTo: 780, volume: 0.035 });
  } else {
    snake.pop();
  }
  if (willEatPowerUp) {
    collectPowerUp(powerUp);
    powerUp = null;
  }
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function isRaisedBoardView() {
  return boardViewMode === "3d" || boardViewMode === "chase";
}

function drawBoardGlow() {
  ctx.fillStyle = "#04101a";
  ctx.fillRect(0, 0, board.width, board.height);
  const gradient = ctx.createLinearGradient(0, 0, board.width, board.height);
  gradient.addColorStop(0, "rgba(52,123,171,0.18)");
  gradient.addColorStop(0.55, "rgba(10,26,41,0)");
  gradient.addColorStop(1, "rgba(87,242,194,0.1)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, board.width, board.height);
  for (let y = 0; y < tileCount; y += 1) {
    for (let x = 0; x < tileCount; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(24,50,69,0.31)" : "rgba(13,31,46,0.28)";
      ctx.fillRect(x * gridSize, y * gridSize, gridSize - 1, gridSize - 1);
    }
  }
}

function drawRaisedTile(x, y, size, lift, topFill, sideFill, radius = 6) {
  ctx.fillStyle = sideFill;
  roundRect(ctx, x + lift, y + lift, size, size, radius);
  ctx.fill();
  ctx.fillStyle = topFill;
  roundRect(ctx, x, y, size, size, radius);
  ctx.fill();
}

function drawFood() {
  const cx = food.x * gridSize + gridSize / 2;
  const cy = food.y * gridSize + gridSize / 2;
  const radius = gridSize * (0.3 + Math.sin(pulseTick) * 0.03);
  ctx.shadowColor = "rgba(255,95,114,0.8)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#ff5f72";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPowerUp() {
  if (!powerUp) return;
  const cx = powerUp.x * gridSize + gridSize / 2;
  const cy = powerUp.y * gridSize + gridSize / 2;
  const radius = gridSize * (0.34 + Math.sin(pulseTick * 1.8) * 0.04);
  ctx.save();
  ctx.shadowColor = powerUp.color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = powerUp.color;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(3,10,17,0.72)";
  ctx.font = "700 10px Bahnschrift, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(powerUp.type === "bonus" ? "+" : powerUp.type === "slow" ? "S" : "O", cx, cy + 0.5);
  ctx.restore();
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    const x = obstacle.x * gridSize;
    const y = obstacle.y * gridSize;
    if (isRaisedBoardView()) {
      drawRaisedTile(x + 2, y + 2, gridSize - 4, 6, "#31445a", "rgba(12,21,32,0.95)", 5);
    } else {
      ctx.fillStyle = "#31445a";
      roundRect(ctx, x + 2, y + 2, gridSize - 4, gridSize - 4, 5);
      ctx.fill();
    }
  });
}

function drawSnake() {
  snake.forEach((segment, index) => {
    const x = segment.x * gridSize;
    const y = segment.y * gridSize;
    const isHead = index === 0;
    ctx.save();
    if (isRaisedBoardView()) {
      ctx.fillStyle = "rgba(0,0,0,0.22)";
      roundRect(ctx, x + 8, y + 10, gridSize - 3, gridSize - 3, 7);
      ctx.fill();
    }
    roundRect(ctx, x + 1, y + 1, gridSize - 2, gridSize - 2, 7);
    ctx.clip();
    if (visualMode === "real" && snakeTexturePattern) {
      ctx.fillStyle = snakeTexturePattern;
      ctx.translate((index * 6) % gridSize, (index * 4) % gridSize);
      ctx.fillRect(x - gridSize, y - gridSize, gridSize * 3, gridSize * 3);
    } else {
      const gradient = ctx.createLinearGradient(x, y, x + gridSize, y + gridSize);
      gradient.addColorStop(0, isHead ? "#a8ffe9" : "#57f2c2");
      gradient.addColorStop(1, visualMode === "real" ? "#45501f" : "#128a78");
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, gridSize, gridSize);
    }
    ctx.restore();
    ctx.strokeStyle = isHead ? "rgba(255,248,214,0.44)" : "rgba(24,32,10,0.32)";
    ctx.lineWidth = 1.2;
    roundRect(ctx, x + 1, y + 1, gridSize - 2, gridSize - 2, 7);
    ctx.stroke();
    if (isHead) {
      ctx.fillStyle = "#141806";
      ctx.beginPath();
      ctx.arc(x + gridSize * 0.34, y + gridSize * 0.38, 1.6, 0, Math.PI * 2);
      ctx.arc(x + gridSize * 0.66, y + gridSize * 0.38, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawParticles() {
  particles.forEach((p) => {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawFloatingScores() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 16px Bahnschrift, sans-serif";
  floatingScores.forEach((entry) => {
    ctx.globalAlpha = Math.max(0, entry.life);
    ctx.fillStyle = entry.color;
    ctx.shadowColor = entry.color;
    ctx.shadowBlur = 12;
    ctx.fillText(entry.text, entry.x, entry.y);
  });
  ctx.restore();
  ctx.globalAlpha = 1;
}

function applyChaseCamera() {
  if (boardViewMode !== "chase" || !snake.length) return;
  const head = snake[0];
  const headCenterX = head.x * gridSize + gridSize / 2;
  const headCenterY = head.y * gridSize + gridSize / 2;
  const headingAngle = Math.atan2(direction.y, direction.x);
  const rotateToForward = -Math.PI / 2 - headingAngle;
  ctx.translate(board.width / 2, board.height * 0.72);
  ctx.rotate(rotateToForward);
  ctx.scale(1.62, 1.62);
  ctx.translate(-headCenterX, -headCenterY);
}

function render() {
  ctx.save();
  ctx.clearRect(0, 0, board.width, board.height);
  if (performance.now() < shake.until) ctx.translate((Math.random() - 0.5) * shake.strength, (Math.random() - 0.5) * shake.strength);
  applyChaseCamera();
  drawBoardGlow();
  drawObstacles();
  drawFood();
  drawPowerUp();
  drawSnake();
  drawParticles();
  drawFloatingScores();
  ctx.restore();
}

function gameLoop(timestamp) {
  pulseTick += 0.08;
  updateParticles();
  if (powerUp && performance.now() > powerUp.expiresAt) powerUp = null;
  updatePowerUi();
  if (gameState === "running") scheduleMusic();
  const effectiveTickMs = performance.now() < slowUntil ? tickMs * 1.45 : tickMs;
  if (gameState === "running" && timestamp - lastTickAt >= effectiveTickMs) {
    stepGame();
    lastTickAt = timestamp;
  }
  render();
  if (["running", "paused", "idle"].includes(gameState)) animationFrameId = requestAnimationFrame(gameLoop);
  else animationFrameId = null;
}

function setDirection(nextX, nextY) {
  if (direction.x === -nextX && direction.y === -nextY) return;
  pendingDirection = { x: nextX, y: nextY };
}

function handleBoardTouchStart(event) {
  const touch = event.touches[0];
  if (touch) touchStartPoint = { x: touch.clientX, y: touch.clientY };
}

function handleBoardTouchMove(event) {
  if (!touchStartPoint) return;
  const touch = event.touches[0];
  if (!touch) return;
  const dx = touch.clientX - touchStartPoint.x;
  const dy = touch.clientY - touchStartPoint.y;
  if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
  event.preventDefault();
  applyDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  touchStartPoint = { x: touch.clientX, y: touch.clientY };
}

function handleBoardTouchEnd() {
  touchStartPoint = null;
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter", "w", "a", "s", "d"].includes(key)) event.preventDefault();
  if (key === "arrowup" || key === "w") setDirection(0, -1);
  else if (key === "arrowdown" || key === "s") setDirection(0, 1);
  else if (key === "arrowleft" || key === "a") setDirection(-1, 0);
  else if (key === "arrowright" || key === "d") setDirection(1, 0);
  else if (key === " ") togglePause();
  else if (key === "enter" && gameState === "game-over") startGame();
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", togglePause);
shareButton.addEventListener("click", shareScoreNative);
shareOptionButtons.forEach((button) => button.addEventListener("click", () => shareScoreToTarget(button.dataset.shareTarget)));
musicToggleButton.addEventListener("click", toggleMusic);
sfxToggleButton.addEventListener("click", toggleSfx);
neonModeButton.addEventListener("click", () => setVisualMode("neon"));
realModeButton.addEventListener("click", () => setVisualMode("real"));
view2dButton.addEventListener("click", () => setBoardViewMode("2d"));
view3dButton.addEventListener("click", () => setBoardViewMode("3d"));
viewChaseButton.addEventListener("click", () => setBoardViewMode("chase"));
copyPromptButton.addEventListener("click", copyImagePrompt);
snakeImageInput.addEventListener("change", handleSnakeImageUpload);
clearImageButton.addEventListener("click", clearSnakeTexture);
touchButtons.forEach((button) => button.addEventListener("click", () => applyDirection(button.dataset.direction)));
board.addEventListener("touchstart", handleBoardTouchStart, { passive: true });
board.addEventListener("touchmove", handleBoardTouchMove, { passive: false });
board.addEventListener("touchend", handleBoardTouchEnd);
board.addEventListener("touchcancel", handleBoardTouchEnd);

resetGame();
updateAudioButtons();
setVisualMode("real");
setBoardViewMode("3d");
loadDefaultSnakeTexture();
render();
