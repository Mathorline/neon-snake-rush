const board = document.getElementById("game-board");
const ctx = board.getContext("2d");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("best-score");
const speedLabelEl = document.getElementById("speed-label");
const statusEl = document.getElementById("status");
const overlayEl = document.getElementById("overlay");
const startButton = document.getElementById("start-button");
const pauseButton = document.getElementById("pause-button");
const shareButton = document.getElementById("share-button");
const musicToggleButton = document.getElementById("music-toggle-button");
const sfxToggleButton = document.getElementById("sfx-toggle-button");
const modeLabelEl = document.getElementById("mode-label");
const viewLabelEl = document.getElementById("view-label");
const neonModeButton = document.getElementById("neon-mode-button");
const realModeButton = document.getElementById("real-mode-button");
const view2dButton = document.getElementById("view-2d-button");
const view3dButton = document.getElementById("view-3d-button");
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

const speedLabels = [
  { max: 4, label: "Chill" },
  { max: 9, label: "Quick" },
  { max: 14, label: "Fast" },
  { max: Infinity, label: "Wild" }
];
const blockLift = 8;

let snake = [];
let direction = { x: 1, y: 0 };
let pendingDirection = { x: 1, y: 0 };
let food = null;
let score = 0;
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
let pulseTick = 0;
let shake = { strength: 0, until: 0 };
let flashTimeoutId = null;
let musicEnabled = true;
let sfxEnabled = true;
let musicStep = 0;
let nextMusicAt = 0;
let touchStartPoint = null;

bestScoreEl.textContent = String(bestScore);
modeLabelEl.textContent = "Real Snake";
viewLabelEl.textContent = "3D";

function ensureAudio() {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }

  if (audioContext?.state === "suspended") {
    audioContext.resume();
  }
}

function playTone({ frequency, duration, type = "sine", volume = 0.06, slideTo = null }) {
  if (!sfxEnabled) {
    return;
  }

  ensureAudio();
  if (!audioContext) {
    return;
  }

  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const now = audioContext.currentTime;

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  if (slideTo) {
    oscillator.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }

  gainNode.gain.setValueAtTime(0.001, now);
  gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function playMusicTone({ frequency, when, duration, type = "triangle", volume = 0.022 }) {
  if (!musicEnabled) {
    return;
  }

  ensureAudio();
  if (!audioContext) {
    return;
  }

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
  if (!musicEnabled) {
    return;
  }

  ensureAudio();
  if (!audioContext) {
    return;
  }

  const leadPattern = [262, 330, 392, 523, 392, 330, 294, 349];
  const bassPattern = [131, 147, 165, 196];

  while (nextMusicAt < audioContext.currentTime + 0.32) {
    const lead = leadPattern[musicStep % leadPattern.length];
    const bass = bassPattern[musicStep % bassPattern.length];
    playMusicTone({ frequency: lead, when: nextMusicAt, duration: 0.22, type: "triangle", volume: 0.018 });
    playMusicTone({ frequency: bass, when: nextMusicAt, duration: 0.28, type: "sine", volume: 0.013 });
    musicStep += 1;
    nextMusicAt += 0.24;
  }
}

function triggerFlash() {
  boardFrame.classList.add("flash");
  if (flashTimeoutId) {
    window.clearTimeout(flashTimeoutId);
  }
  flashTimeoutId = window.setTimeout(() => {
    boardFrame.classList.remove("flash");
  }, 160);
}

function triggerShake(strength = 8, duration = 180) {
  shake = {
    strength,
    until: performance.now() + duration
  };
}

function vibrate(pattern) {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(pattern);
  }
}

function spawnParticles(x, y, color, count) {
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count + Math.random() * 0.35;
    const speed = 1 + Math.random() * 2.6;

    particles.push({
      x,
      y,
      dx: Math.cos(angle) * speed,
      dy: Math.sin(angle) * speed,
      life: 1,
      color,
      size: 2 + Math.random() * 3
    });
  }
}

function updateParticles() {
  particles = particles
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.dx,
      y: particle.y + particle.dy,
      dx: particle.dx * 0.98,
      dy: particle.dy * 0.98 + 0.02,
      life: particle.life - 0.025
    }))
    .filter((particle) => particle.life > 0);
}

function resetGame() {
  snake = [
    { x: 7, y: 14 },
    { x: 6, y: 14 },
    { x: 5, y: 14 }
  ];
  direction = { x: 1, y: 0 };
  pendingDirection = { x: 1, y: 0 };
  food = placeFood();
  score = 0;
  tickMs = initialTick;
  particles = [];
  nextMusicAt = 0;
  musicStep = 0;
  updateScoreUi();
  updateStatus("Press start or hit space to begin.");
  showOverlay(
    "Ready when you are",
    "Guide the snake.",
    "Collect fruit, dodge the edges, and see how long you can keep the run alive."
  );
  gameState = "idle";
}

function placeFood() {
  let nextFood = null;

  while (!nextFood) {
    const candidate = {
      x: Math.floor(Math.random() * tileCount),
      y: Math.floor(Math.random() * tileCount)
    };

    const overlapsSnake = snake.some((segment) => segment.x === candidate.x && segment.y === candidate.y);
    if (!overlapsSnake) {
      nextFood = candidate;
    }
  }

  return nextFood;
}

function updateScoreUi() {
  scoreEl.textContent = String(score);
  const speedLabel = speedLabels.find((entry) => score <= entry.max)?.label || "Wild";
  speedLabelEl.textContent = speedLabel;
}

function updateStatus(message) {
  statusEl.textContent = message;
}

function showOverlay(kicker, title, copy) {
  overlayEl.innerHTML = `
    <div class="overlay-card">
      <p class="overlay-kicker">${kicker}</p>
      <h2>${title}</h2>
      <p>${copy}</p>
    </div>
  `;
  overlayEl.classList.add("visible");
}

function hideOverlay() {
  overlayEl.classList.remove("visible");
}

function startGame() {
  if (gameState === "running") {
    return;
  }

  ensureAudio();
  if (gameState === "game-over") {
    resetGame();
  }

  gameState = "running";
  hideOverlay();
  updateStatus("Run is live. Stay sharp.");
  lastTickAt = performance.now();
  if (audioContext) {
    nextMusicAt = audioContext.currentTime + 0.05;
  }
  playTone({ frequency: 320, duration: 0.18, type: "triangle", slideTo: 480, volume: 0.045 });
  vibrate(20);
  if (!animationFrameId) {
    animationFrameId = requestAnimationFrame(gameLoop);
  }
}

function togglePause() {
  if (gameState === "idle") {
    startGame();
    return;
  }

  if (gameState === "running") {
    gameState = "paused";
    showOverlay("Paused", "Take a breath.", "Hit space or the pause button again when you're ready to jump back in.");
    updateStatus("Game paused.");
    playTone({ frequency: 240, duration: 0.14, type: "square", slideTo: 160, volume: 0.03 });
    return;
  }

  if (gameState === "paused") {
    gameState = "running";
    hideOverlay();
    updateStatus("Back in motion.");
    lastTickAt = performance.now();
    playTone({ frequency: 260, duration: 0.16, type: "triangle", slideTo: 390, volume: 0.03 });
    if (!animationFrameId) {
      animationFrameId = requestAnimationFrame(gameLoop);
    }
  }
}

function endGame() {
  gameState = "game-over";
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem(bestScoreKey, String(bestScore));
    bestScoreEl.textContent = String(bestScore);
  }
  showOverlay(
    "Game over",
    "The trail caught up.",
    `Final score: ${score}. High score: ${bestScore}. Press Enter or Start Game to launch another run.`
  );
  updateStatus("Game over. Press Enter to restart.");
  triggerShake(14, 280);
  triggerFlash();
  playTone({ frequency: 220, duration: 0.34, type: "sawtooth", slideTo: 70, volume: 0.07 });
  vibrate([50, 40, 90]);
}

function buildRedditShareUrl() {
  const title = `I scored ${score} in Neon Snake Rush`;
  const text = [
    `I just scored ${score} in Neon Snake Rush.`,
    `My high score is ${bestScore}.`,
    "Anyone think they can beat that?"
  ].join("\n\n");

  const params = new URLSearchParams({
    title,
    selftext: "true",
    text
  });

  return `https://www.reddit.com/submit?${params.toString()}`;
}

function shareScoreOnReddit() {
  const shareUrl = buildRedditShareUrl();
  window.open(shareUrl, "_blank", "noopener,noreferrer");
  updateStatus("Opened a Reddit draft with your latest score.");
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
  if (audioContext) {
    nextMusicAt = audioContext.currentTime + 0.05;
  }
  updateAudioButtons();
  updateStatus(musicEnabled ? "Music enabled." : "Music muted.");
  if (sfxEnabled) {
    playTone({ frequency: musicEnabled ? 480 : 220, duration: 0.08, type: "triangle", slideTo: musicEnabled ? 620 : 180, volume: 0.022 });
  }
}

function toggleSfx() {
  const nextValue = !sfxEnabled;
  sfxEnabled = nextValue;
  updateAudioButtons();
  if (sfxEnabled) {
    playTone({ frequency: 440, duration: 0.08, type: "triangle", slideTo: 560, volume: 0.022 });
    updateStatus("Sound effects enabled.");
  } else {
    updateStatus("Sound effects muted.");
  }
}

function setVisualMode(nextMode) {
  visualMode = nextMode;
  const isRealMode = nextMode === "real";
  modeLabelEl.textContent = isRealMode ? "Real Snake" : "Neon";
  neonModeButton.classList.toggle("active", !isRealMode);
  realModeButton.classList.toggle("active", isRealMode);
  updateStatus(
    isRealMode
      ? "Real snake mode active. Upload an AI-generated snake image for a custom skin."
      : "Neon mode active."
  );
}

function setBoardViewMode(nextMode) {
  boardViewMode = nextMode;
  const is3dMode = nextMode === "3d";
  document.body.classList.toggle("view-2d", !is3dMode);
  viewLabelEl.textContent = is3dMode ? "3D" : "2D";
  view2dButton.classList.toggle("active", !is3dMode);
  view3dButton.classList.toggle("active", is3dMode);
  updateStatus(is3dMode ? "3D board view active." : "2D board view active.");
}

async function copyImagePrompt() {
  const prompt = imagePromptEl.value.trim();
  if (!prompt) {
    updateStatus("Add a prompt first, then copy it.");
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt);
      updateStatus("Image prompt copied. Generate a snake image, then upload it here.");
      playTone({ frequency: 540, duration: 0.11, type: "triangle", slideTo: 660, volume: 0.025 });
    } else {
      imagePromptEl.select();
      document.execCommand("copy");
      updateStatus("Image prompt copied.");
    }
  } catch (error) {
    updateStatus("Clipboard copy was blocked. You can still copy the prompt manually.");
  }
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
  nextImage.onerror = () => {
    updateStatus("That image could not be loaded. Try another generated snake image.");
  };
  nextImage.src = source;
}

function loadDefaultSnakeTexture() {
  setSnakeTextureFromSource(defaultSnakeTexturePath);
}

function handleSnakeImageUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    setSnakeTextureFromSource(String(reader.result));
  };
  reader.readAsDataURL(file);
}

function clearSnakeTexture() {
  snakeImageInput.value = "";
  loadDefaultSnakeTexture();
  updateStatus("Reverted to the default snake image.");
}

function applyDirection(directionName) {
  if (directionName === "up") {
    setDirection(0, -1);
  } else if (directionName === "down") {
    setDirection(0, 1);
  } else if (directionName === "left") {
    setDirection(-1, 0);
  } else if (directionName === "right") {
    setDirection(1, 0);
  }

  if (gameState === "idle") {
    startGame();
  }
}

function handleBoardTouchStart(event) {
  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  touchStartPoint = {
    x: touch.clientX,
    y: touch.clientY
  };
}

function handleBoardTouchMove(event) {
  if (!touchStartPoint) {
    return;
  }

  const touch = event.touches[0];
  if (!touch) {
    return;
  }

  const deltaX = touch.clientX - touchStartPoint.x;
  const deltaY = touch.clientY - touchStartPoint.y;
  const threshold = 18;

  if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) {
    return;
  }

  event.preventDefault();

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    applyDirection(deltaX > 0 ? "right" : "left");
  } else {
    applyDirection(deltaY > 0 ? "down" : "up");
  }

  touchStartPoint = {
    x: touch.clientX,
    y: touch.clientY
  };
}

function handleBoardTouchEnd() {
  touchStartPoint = null;
}

function stepGame() {
  direction = pendingDirection;

  const nextHead = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  };

  const hitWall =
    nextHead.x < 0 ||
    nextHead.y < 0 ||
    nextHead.x >= tileCount ||
    nextHead.y >= tileCount;

  const willEatFood = nextHead.x === food.x && nextHead.y === food.y;
  const bodyToCheck = willEatFood ? snake : snake.slice(0, -1);
  const hitSelf = bodyToCheck.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y);

  if (hitWall || hitSelf) {
    endGame();
    return;
  }

  snake.unshift(nextHead);

  if (willEatFood) {
    score += 1;
    tickMs = Math.max(70, initialTick - score * 5);
    spawnParticles(
      food.x * gridSize + gridSize / 2,
      food.y * gridSize + gridSize / 2,
      "#ff8a98",
      14
    );
    triggerFlash();
    food = placeFood();
    updateScoreUi();
    updateStatus("Nice catch. Keep the chain going.");
    playTone({ frequency: 540, duration: 0.12, type: "triangle", slideTo: 780, volume: 0.035 });
  } else {
    snake.pop();
  }
}

function drawBoardGlow() {
  ctx.fillStyle = "#04101a";
  ctx.fillRect(0, 0, board.width, board.height);

  const skyGradient = ctx.createLinearGradient(0, 0, board.width, board.height);
  skyGradient.addColorStop(0, "rgba(52, 123, 171, 0.18)");
  skyGradient.addColorStop(0.55, "rgba(10, 26, 41, 0)");
  skyGradient.addColorStop(1, "rgba(87, 242, 194, 0.1)");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, board.width, board.height);

  for (let y = 0; y < tileCount; y += 1) {
    for (let x = 0; x < tileCount; x += 1) {
      ctx.fillStyle =
        (x + y) % 2 === 0
          ? "rgba(24, 50, 69, 0.31)"
          : "rgba(13, 31, 46, 0.28)";
      ctx.fillRect(x * gridSize, y * gridSize, gridSize - 1, gridSize - 1);
    }
  }

  if (boardViewMode !== "3d") {
    return;
  }

  ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
  ctx.fillRect(0, 0, board.width, 3);
  ctx.fillRect(0, 0, 3, board.height);

  ctx.fillStyle = "rgba(3, 10, 17, 0.42)";
  ctx.fillRect(0, board.height - 6, board.width, 6);
  ctx.fillRect(board.width - 6, 0, 6, board.height);
}

function drawRaisedTile(x, y, width, height, lift, topFill, sideFill, frontFill, radius = 6) {
  ctx.fillStyle = sideFill;
  roundRect(ctx, x + lift, y + lift, width, height, radius);
  ctx.fill();

  ctx.fillStyle = frontFill;
  roundRect(ctx, x, y + lift * 0.5, width, height, radius);
  ctx.fill();

  ctx.fillStyle = topFill;
  roundRect(ctx, x, y, width, height, radius);
  ctx.fill();
}

function drawSnakeShadow(x, y, size, lift, alpha) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  roundRect(ctx, x + lift + 2, y + lift + 4, size - 2, size - 2, 7);
  ctx.fill();
}

function drawFood() {
  if (boardViewMode !== "3d") {
    drawFoodFlat();
    return;
  }

  const centerX = food.x * gridSize + gridSize / 2;
  const centerY = food.y * gridSize + gridSize / 2;
  const radius = gridSize * (0.24 + Math.sin(pulseTick) * 0.03 + 0.06);
  const lift = 12 + Math.sin(pulseTick) * 3;

  const foodGlow = ctx.createRadialGradient(centerX, centerY - lift * 0.4, 2, centerX, centerY - lift * 0.4, gridSize * 0.9);
  foodGlow.addColorStop(0, "#ffd8de");
  foodGlow.addColorStop(1, "rgba(255, 95, 114, 0.12)");

  ctx.fillStyle = foodGlow;
  ctx.beginPath();
  ctx.arc(centerX, centerY - lift * 0.4, gridSize * 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  ctx.ellipse(centerX + 7, centerY + 10, gridSize * 0.34, gridSize * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  const fruitGradient = ctx.createRadialGradient(centerX - radius * 0.4, centerY - lift - radius * 0.7, radius * 0.2, centerX, centerY - lift, radius * 1.4);
  fruitGradient.addColorStop(0, "#fff0f2");
  fruitGradient.addColorStop(0.4, "#ff8ea0");
  fruitGradient.addColorStop(1, "#d93c52");
  ctx.fillStyle = fruitGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY - lift, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(centerX, centerY - lift, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFoodFlat() {
  const centerX = food.x * gridSize + gridSize / 2;
  const centerY = food.y * gridSize + gridSize / 2;
  const radius = gridSize * (0.28 + Math.sin(pulseTick) * 0.03 + 0.06);

  const foodGlow = ctx.createRadialGradient(centerX, centerY, 2, centerX, centerY, gridSize * 0.55);
  foodGlow.addColorStop(0, "#ffd8de");
  foodGlow.addColorStop(1, "rgba(255, 95, 114, 0.12)");

  ctx.fillStyle = foodGlow;
  ctx.beginPath();
  ctx.arc(centerX, centerY, gridSize * 0.55, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff5f72";
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawNeonSnake() {
  if (boardViewMode !== "3d") {
    drawNeonSnakeFlat();
    return;
  }

  snake.forEach((segment, index) => {
    const x = segment.x * gridSize;
    const y = segment.y * gridSize;
    const isHead = index === 0;
    const size = gridSize - 3;
    const topFill = isHead ? "#bbfff0" : "#5df4c5";
    const sideFill = isHead ? "rgba(52, 142, 131, 0.95)" : "rgba(30, 111, 101, 0.95)";
    const frontFill = isHead ? "rgba(34, 126, 116, 0.95)" : "rgba(22, 85, 78, 0.95)";

    drawSnakeShadow(x, y, size, blockLift, isHead ? 0.22 : 0.18);
    ctx.shadowColor = isHead ? "rgba(168, 255, 233, 0.55)" : "rgba(87, 242, 194, 0.32)";
    ctx.shadowBlur = isHead ? 14 : 8;
    drawRaisedTile(x + 1.5, y + 1.5, size, size, blockLift, topFill, sideFill, frontFill, 6);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    roundRect(ctx, x + 1.5, y + 1.5, size, size, 6);
    ctx.stroke();
  });

  ctx.shadowBlur = 0;
}

function drawNeonSnakeFlat() {
  snake.forEach((segment, index) => {
    const x = segment.x * gridSize;
    const y = segment.y * gridSize;
    const isHead = index === 0;

    ctx.fillStyle = isHead ? "#a8ffe9" : "#57f2c2";
    ctx.shadowColor = isHead ? "rgba(168, 255, 233, 0.8)" : "rgba(87, 242, 194, 0.45)";
    ctx.shadowBlur = isHead ? 14 : 8;
    roundRect(ctx, x + 1.5, y + 1.5, gridSize - 3, gridSize - 3, 6);
    ctx.fill();
  });

  ctx.shadowBlur = 0;
}

function drawRealSnake() {
  if (boardViewMode !== "3d") {
    drawRealSnakeFlat();
    return;
  }

  snake.forEach((segment, index) => {
    const x = segment.x * gridSize;
    const y = segment.y * gridSize;
    const isHead = index === 0;
    const size = gridSize - 2;

    drawSnakeShadow(x, y, size, blockLift, isHead ? 0.24 : 0.2);

    ctx.fillStyle = isHead ? "rgba(82, 102, 34, 0.95)" : "rgba(67, 82, 28, 0.95)";
    roundRect(ctx, x + blockLift, y + blockLift, size, size, 7);
    ctx.fill();

    ctx.fillStyle = isHead ? "rgba(100, 122, 40, 0.95)" : "rgba(84, 103, 33, 0.95)";
    roundRect(ctx, x + 2, y + blockLift * 0.55, size, size, 7);
    ctx.fill();

    ctx.save();
    roundRect(ctx, x + 1, y + 1, size, size, 7);
    ctx.clip();

    if (snakeTexturePattern) {
      ctx.fillStyle = snakeTexturePattern;
      ctx.save();
      ctx.translate((index * 6) % gridSize, (index * 4) % gridSize);
      ctx.fillRect(x - gridSize, y - gridSize, gridSize * 3, gridSize * 3);
      ctx.restore();
    } else {
      const bodyGradient = ctx.createLinearGradient(x, y, x + gridSize, y + gridSize);
      bodyGradient.addColorStop(0, isHead ? "#a6b56b" : "#8c9b55");
      bodyGradient.addColorStop(0.5, isHead ? "#7f8c46" : "#64732e");
      bodyGradient.addColorStop(1, "#45501f");
      ctx.fillStyle = bodyGradient;
      ctx.fillRect(x, y, gridSize, gridSize);

      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      for (let scaleY = y + 3; scaleY < y + gridSize; scaleY += 5) {
        for (let scaleX = x + ((scaleY / 5) % 2 === 0 ? 3 : 5); scaleX < x + gridSize; scaleX += 7) {
          ctx.beginPath();
          ctx.arc(scaleX, scaleY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();

    ctx.strokeStyle = isHead ? "rgba(255, 248, 214, 0.36)" : "rgba(24, 32, 10, 0.32)";
    ctx.lineWidth = 1.2;
    roundRect(ctx, x + 1, y + 1, size, size, 7);
    ctx.stroke();

    if (isHead) {
      ctx.fillStyle = "#141806";
      const leftEyeX = x + gridSize * 0.34;
      const rightEyeX = x + gridSize * 0.66;
      const eyeY = y + gridSize * 0.38;
      ctx.beginPath();
      ctx.arc(leftEyeX, eyeY, 1.6, 0, Math.PI * 2);
      ctx.arc(rightEyeX, eyeY, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawRealSnakeFlat() {
  snake.forEach((segment, index) => {
    const x = segment.x * gridSize;
    const y = segment.y * gridSize;
    const isHead = index === 0;

    ctx.save();
    roundRect(ctx, x + 1, y + 1, gridSize - 2, gridSize - 2, 7);
    ctx.clip();

    if (snakeTexturePattern) {
      ctx.fillStyle = snakeTexturePattern;
      ctx.save();
      ctx.translate((index * 6) % gridSize, (index * 4) % gridSize);
      ctx.fillRect(x - gridSize, y - gridSize, gridSize * 3, gridSize * 3);
      ctx.restore();
    } else {
      const bodyGradient = ctx.createLinearGradient(x, y, x + gridSize, y + gridSize);
      bodyGradient.addColorStop(0, isHead ? "#a6b56b" : "#8c9b55");
      bodyGradient.addColorStop(0.5, isHead ? "#7f8c46" : "#64732e");
      bodyGradient.addColorStop(1, "#45501f");
      ctx.fillStyle = bodyGradient;
      ctx.fillRect(x, y, gridSize, gridSize);

      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      for (let scaleY = y + 3; scaleY < y + gridSize; scaleY += 5) {
        for (let scaleX = x + ((scaleY / 5) % 2 === 0 ? 3 : 5); scaleX < x + gridSize; scaleX += 7) {
          ctx.beginPath();
          ctx.arc(scaleX, scaleY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();

    ctx.strokeStyle = isHead ? "rgba(255, 248, 214, 0.36)" : "rgba(24, 32, 10, 0.32)";
    ctx.lineWidth = 1.2;
    roundRect(ctx, x + 1, y + 1, gridSize - 2, gridSize - 2, 7);
    ctx.stroke();

    if (isHead) {
      ctx.fillStyle = "#141806";
      const leftEyeX = x + gridSize * 0.34;
      const rightEyeX = x + gridSize * 0.66;
      const eyeY = y + gridSize * 0.38;
      ctx.beginPath();
      ctx.arc(leftEyeX, eyeY, 1.6, 0, Math.PI * 2);
      ctx.arc(rightEyeX, eyeY, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawSnake() {
  if (visualMode === "real") {
    drawRealSnake();
    return;
  }

  drawNeonSnake();
}

function drawParticles() {
  particles.forEach((particle) => {
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
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

function render() {
  ctx.save();
  ctx.clearRect(0, 0, board.width, board.height);

  const now = performance.now();
  const shakeActive = now < shake.until;
  if (shakeActive) {
    const jitter = shake.strength * 0.5;
    ctx.translate((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter);
  }

  drawBoardGlow();
  drawFood();
  drawSnake();
  drawParticles();
  ctx.restore();
}

function gameLoop(timestamp) {
  pulseTick += 0.08;
  updateParticles();
  if (gameState === "running") {
    scheduleMusic();
  }

  if (gameState === "running" && timestamp - lastTickAt >= tickMs) {
    stepGame();
    lastTickAt = timestamp;
  }

  render();

  if (gameState === "running" || gameState === "paused" || gameState === "idle") {
    animationFrameId = requestAnimationFrame(gameLoop);
  } else {
    animationFrameId = null;
  }
}

function setDirection(nextX, nextY) {
  if (direction.x === -nextX && direction.y === -nextY) {
    return;
  }
  pendingDirection = { x: nextX, y: nextY };
}

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "enter", "w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
  }

  if (key === "arrowup" || key === "w") {
    setDirection(0, -1);
  } else if (key === "arrowdown" || key === "s") {
    setDirection(0, 1);
  } else if (key === "arrowleft" || key === "a") {
    setDirection(-1, 0);
  } else if (key === "arrowright" || key === "d") {
    setDirection(1, 0);
  } else if (key === " ") {
    togglePause();
  } else if (key === "enter" && gameState === "game-over") {
    startGame();
  }
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", togglePause);
shareButton.addEventListener("click", shareScoreOnReddit);
musicToggleButton.addEventListener("click", toggleMusic);
sfxToggleButton.addEventListener("click", toggleSfx);
neonModeButton.addEventListener("click", () => setVisualMode("neon"));
realModeButton.addEventListener("click", () => setVisualMode("real"));
view2dButton.addEventListener("click", () => setBoardViewMode("2d"));
view3dButton.addEventListener("click", () => setBoardViewMode("3d"));
copyPromptButton.addEventListener("click", copyImagePrompt);
snakeImageInput.addEventListener("change", handleSnakeImageUpload);
clearImageButton.addEventListener("click", clearSnakeTexture);
touchButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applyDirection(button.dataset.direction);
  });
});

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
