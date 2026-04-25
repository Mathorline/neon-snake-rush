(async function loadGame() {
  const response = await fetch("app.js", { cache: "no-store" });
  let source = await response.text();

  if (!source.includes("shareOptionButtons")) {
    source = source.replace(
      'const shareButton = document.getElementById("share-button");',
      'const shareButton = document.getElementById("share-button");\nconst shareOptionButtons = document.querySelectorAll(".share-option");'
    );

    source = source.replace(
      'const defaultSnakeTexturePath = "snake-skin.svg";',
      'const defaultSnakeTexturePath = "snake-skin.svg";\nconst canonicalShareUrl = "https://mathorline.github.io/neon-snake-rush/";'
    );

    source = source.replace(
      /function buildRedditShareUrl\(\) \{[\s\S]*?function updateAudioButtons\(\) \{/,
      `function getSharePayload() {
  const title = \`I scored \${score} in Neon Snake Rush\`;
  const text = [
    \`I just scored \${score} in Neon Snake Rush.\`,
    \`My high score is \${bestScore}.\`,
    "Can you beat it?"
  ].join("\\n\\n");

  return { title, text, url: canonicalShareUrl };
}

function buildShareUrl(target) {
  const { title, text, url } = getSharePayload();
  const combinedText = \`\${text}\\n\\n\${url}\`;
  const encodedTitle = encodeURIComponent(title);
  const encodedText = encodeURIComponent(text);
  const encodedCombinedText = encodeURIComponent(combinedText);
  const encodedUrl = encodeURIComponent(url);
  const shareUrls = {
    reddit: \`https://www.reddit.com/submit?title=\${encodedTitle}&selftext=true&text=\${encodedCombinedText}\`,
    x: \`https://twitter.com/intent/tweet?text=\${encodedCombinedText}\`,
    facebook: \`https://www.facebook.com/sharer/sharer.php?u=\${encodedUrl}&quote=\${encodedText}\`,
    whatsapp: \`https://wa.me/?text=\${encodedCombinedText}\`,
    telegram: \`https://t.me/share/url?url=\${encodedUrl}&text=\${encodedText}\`,
    email: \`mailto:?subject=\${encodedTitle}&body=\${encodedCombinedText}\`
  };
  return shareUrls[target] || null;
}

function getShareTargetLabel(target) {
  return {
    reddit: "Reddit",
    x: "X",
    facebook: "Facebook",
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    email: "email"
  }[target] || "that app";
}

function playShareTone() {
  playTone({ frequency: 410, duration: 0.12, type: "triangle", slideTo: 520, volume: 0.025 });
}

async function copyShareText() {
  const { title, text, url } = getSharePayload();
  const copyText = \`\${title}\\n\\n\${text}\\n\\n\${url}\`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(copyText);
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = copyText;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.append(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }
    updateStatus("Share text copied. Go make the internet fear your score.");
    playShareTone();
  } catch (error) {
    updateStatus("Copy was blocked. Try one of the app share buttons instead.");
  }
}

async function shareScoreNative() {
  const payload = getSharePayload();
  if (!navigator.share) {
    updateStatus("Pick an app below to share your score.");
    playShareTone();
    return;
  }
  try {
    await navigator.share(payload);
    updateStatus("Opened your device share sheet.");
    playShareTone();
  } catch (error) {
    if (error.name !== "AbortError") {
      updateStatus("Share sheet was blocked. Pick an app below instead.");
    }
  }
}

function shareScoreToTarget(target) {
  if (target === "copy") {
    copyShareText();
    return;
  }
  const shareUrl = buildShareUrl(target);
  if (!shareUrl) {
    updateStatus("That share option is not ready yet.");
    return;
  }
  window.open(shareUrl, "_blank", "noopener,noreferrer");
  updateStatus(\`Opened \${getShareTargetLabel(target)} share with your latest score.\`);
  playShareTone();
}

function updateAudioButtons() {`
    );

    source = source.replace(
      'shareButton.addEventListener("click", shareScoreOnReddit);',
      `shareButton.addEventListener("click", shareScoreNative);
shareOptionButtons.forEach((button) => {
  button.addEventListener("click", () => shareScoreToTarget(button.dataset.shareTarget));
});`
    );
  }

  if (!source.includes("viewChaseButton")) {
    source = source.replace(
      'const view3dButton = document.getElementById("view-3d-button");',
      'const view3dButton = document.getElementById("view-3d-button");\nconst viewChaseButton = document.getElementById("view-chase-button");'
    );

    source = source.replace(
      /function setBoardViewMode\(nextMode\) \{[\s\S]*?\n\}/,
      `function setBoardViewMode(nextMode) {
  boardViewMode = nextMode;
  const is3dMode = nextMode === "3d";
  const is2dMode = nextMode === "2d";
  const isChaseMode = nextMode === "chase";
  document.body.classList.toggle("view-2d", is2dMode);
  document.body.classList.toggle("view-chase", isChaseMode);
  viewLabelEl.textContent = isChaseMode ? "Chase" : is3dMode ? "3D" : "2D";
  view2dButton.classList.toggle("active", is2dMode);
  view3dButton.classList.toggle("active", is3dMode);
  viewChaseButton.classList.toggle("active", isChaseMode);
  updateStatus(isChaseMode ? "Chase camera active. Stay on the snake's tail." : \`\${viewLabelEl.textContent} board view active.\`);
}

function isRaisedBoardView() {
  return boardViewMode === "3d" || boardViewMode === "chase";
}`
    );

    source = source.replaceAll('boardViewMode !== "3d"', '!isRaisedBoardView()');

    source = source.replace(
      'function roundRect(context, x, y, width, height, radius) {',
      `function applyChaseCamera() {
  if (boardViewMode !== "chase" || !snake.length) {
    return;
  }
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

function roundRect(context, x, y, width, height, radius) {`
    );

    source = source.replace(
      "  drawBoardGlow();",
      "  applyChaseCamera();\n  drawBoardGlow();"
    );

    source = source.replace(
      'view3dButton.addEventListener("click", () => setBoardViewMode("3d"));',
      'view3dButton.addEventListener("click", () => setBoardViewMode("3d"));\nviewChaseButton.addEventListener("click", () => setBoardViewMode("chase"));'
    );
  }

  const script = document.createElement("script");
  script.text = source;
  document.body.append(script);
})();
