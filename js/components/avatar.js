const FPS = 36;
const MAX_FRAMES = 90;
const FORWARD_SPEED = 1;
const REVERSE_SPEED = 1.35;
const END_EPSILON = 0.08;

export function bindAvatar(source) {
  const profile = document.querySelector(".profile");
  const image = document.getElementById("avatarImage");
  const video = document.getElementById("avatarVideo");
  const canvas = document.getElementById("avatarCanvas");
  if (!profile || !(video instanceof HTMLVideoElement) || !(canvas instanceof HTMLCanvasElement)) return;

  const isSpriteSource = /\.json(?:[?#].*)?$/i.test(source || "");
  if (isSpriteSource) {
    image?.classList.add("is-hidden");
    video.classList.add("is-hidden");
    bindSpriteAvatar({ profile, canvas, source });
    return;
  }

  const isImageSource = /\.(gif|png|jpe?g|webp|avif|svg)(?:[?#].*)?$/i.test(source || "");
  if (isImageSource && image instanceof HTMLImageElement) {
    image.src = source;
    image.classList.remove("is-hidden");
    video.classList.add("is-hidden");
    canvas.classList.add("is-hidden");
    return;
  }

  image?.classList.add("is-hidden");
  const context = canvas.getContext("2d");
  if (!context) return;

  video.src = source;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const frames = [];
  let captureId = 0;
  let reverseId = 0;
  let forwardGuardId = 0;
  let reverseIndex = 0;
  let lastReverseStep = 0;

  const showVideo = () => {
    video.classList.remove("is-hidden");
    canvas.classList.add("is-hidden");
  };

  const showCanvas = () => {
    canvas.classList.remove("is-hidden");
    video.classList.add("is-hidden");
  };

  const drawCover = (sourceElement, targetContext = context) => {
    const sourceWidth = sourceElement.videoWidth || sourceElement.width;
    const sourceHeight = sourceElement.videoHeight || sourceElement.height;
    if (!sourceWidth || !sourceHeight) return false;

    const scale = Math.max(canvas.width / sourceWidth, canvas.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;

    targetContext.clearRect(0, 0, canvas.width, canvas.height);
    targetContext.drawImage(sourceElement, x, y, width, height);
    return true;
  };

  const captureFrame = () => {
    const frame = document.createElement("canvas");
    frame.width = canvas.width;
    frame.height = canvas.height;
    const frameContext = frame.getContext("2d");
    if (!frameContext) return null;

    if (!drawCover(video, frameContext)) return null;
    frames.push(frame);
    if (frames.length > MAX_FRAMES) frames.shift();
    return frame;
  };

  const stopCapture = () => {
    if (!captureId) return;
    cancelAnimationFrame(captureId);
    captureId = 0;
  };

  const stopForwardGuard = () => {
    if (!forwardGuardId) return;
    cancelAnimationFrame(forwardGuardId);
    forwardGuardId = 0;
  };

  const stopReverse = () => {
    if (!reverseId) return;
    cancelAnimationFrame(reverseId);
    reverseId = 0;
    lastReverseStep = 0;
  };

  const captureLoop = () => {
    if (video.paused || video.ended) {
      captureId = 0;
      return;
    }

    captureFrame();
    captureId = requestAnimationFrame(captureLoop);
  };

  const reverseLoop = (time) => {
    if (!lastReverseStep || time - lastReverseStep >= 1000 / FPS) {
      const frame = frames[Math.floor(reverseIndex)];
      if (frame) context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      reverseIndex -= REVERSE_SPEED;
      lastReverseStep = time;
    }

    if (reverseIndex < 0) {
      reverseId = 0;
      lastReverseStep = 0;
      video.currentTime = 0;
      return;
    }

    reverseId = requestAnimationFrame(reverseLoop);
  };

  const forwardGuardLoop = () => {
    if (video.paused || !Number.isFinite(video.duration)) {
      forwardGuardId = 0;
      return;
    }

    const stableEnd = Math.max(video.duration - END_EPSILON, 0);
    if (video.currentTime >= stableEnd) {
      const frame = captureFrame();
      video.pause();
      if (frame) {
        context.drawImage(frame, 0, 0, canvas.width, canvas.height);
      }
      showCanvas();
      stopCapture();
      forwardGuardId = 0;
      return;
    }

    forwardGuardId = requestAnimationFrame(forwardGuardLoop);
  };

  const playForward = () => {
    stopReverse();
    stopCapture();
    stopForwardGuard();
    showVideo();

    if (video.ended || (Number.isFinite(video.duration) && video.currentTime >= video.duration - END_EPSILON)) {
      video.currentTime = 0;
    }
    video.playbackRate = FORWARD_SPEED;
    frames.length = 0;
    captureFrame();
    video.play().then(() => {
      captureId = requestAnimationFrame(captureLoop);
      forwardGuardId = requestAnimationFrame(forwardGuardLoop);
    }).catch(() => {
      showCanvas();
    });
  };

  const playBackward = () => {
    stopCapture();
    stopReverse();
    stopForwardGuard();
    video.pause();
    captureFrame();
    showCanvas();
    reverseIndex = frames.length - 1;
    reverseId = requestAnimationFrame(reverseLoop);
  };

  video.addEventListener("loadeddata", () => {
    drawCover(video);
    showCanvas();
  }, { once: true });

  video.addEventListener("ended", () => {
    stopCapture();
    stopForwardGuard();
    const frame = captureFrame();
    if (frame) {
      context.drawImage(frame, 0, 0, canvas.width, canvas.height);
    }
    showCanvas();
  });

  video.load();
  showCanvas();
  profile.addEventListener("pointerenter", playForward);
  profile.addEventListener("pointerleave", playBackward);
}

function bindSpriteAvatar({ profile, canvas, source }) {
  const context = canvas.getContext("2d");
  if (!context) return;

  const avatarTarget = profile;
  canvas.classList.remove("is-hidden");
  let sprite = null;
  let metadata = null;
  let frameIndex = 0;
  let animationId = 0;

  const drawFrame = (index) => {
    if (!sprite || !metadata) return;

    const frameWidth = metadata.frameWidth;
    const frameHeight = metadata.frameHeight;
    const scale = Math.max(canvas.width / frameWidth, canvas.height / frameHeight);
    const width = frameWidth * scale;
    const height = frameHeight * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    const safeIndex = Math.max(metadata.startFrame, Math.min(metadata.endFrame, Math.round(index)));

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      sprite,
      safeIndex * frameWidth,
      0,
      frameWidth,
      frameHeight,
      x,
      y,
      width,
      height
    );
  };

  const stopAnimation = () => {
    if (!animationId) return;
    cancelAnimationFrame(animationId);
    animationId = 0;
  };

  const playTo = (target, speed) => {
    stopAnimation();

    const framesPerSecond = Math.max(24, Math.min(48, Number(metadata.frameRate) || FPS)) * speed;
    frameIndex = Math.max(metadata.startFrame, Math.min(metadata.endFrame, frameIndex));
    const startFrame = frameIndex;
    const distance = target - startFrame;
    const duration = Math.max(120, Math.abs(distance) / framesPerSecond * 1000);
    const startTime = performance.now();
    drawFrame(frameIndex);

    const step = (time) => {
      const elapsed = Math.max(16, time - startTime);
      const progress = Math.min(elapsed / duration, 1);
      frameIndex = startFrame + distance * progress;

      if (progress >= 1) {
        frameIndex = target;
        drawFrame(frameIndex);
        animationId = 0;
        return;
      }

      drawFrame(frameIndex);
      animationId = requestAnimationFrame(step);
    };

    step(performance.now());
  };

  fetch(source)
    .then((response) => response.json())
    .then((data) => {
      metadata = {
        image: data.image,
        frameWidth: Number(data.frameWidth) || 1,
        frameHeight: Number(data.frameHeight) || 1,
        frames: Number(data.frames) || 1,
        startFrame: Math.max(1, Number(data.startFrame) || 1),
        endFrame: Math.min(
          Number(data.frames) - 1 || 1,
          Number(data.endFrame) || Math.max(1, (Number(data.frames) || 1) - 2)
        ),
        frameRate: Number(data.frameRate) || FPS
      };
      sprite = new Image();
      sprite.decoding = "async";
      sprite.onload = () => {
        frameIndex = metadata.startFrame;
        drawFrame(frameIndex);
      };
      sprite.src = metadata.image;
    })
    .catch(() => {
      canvas.classList.add("is-hidden");
    });

  avatarTarget.addEventListener("pointerenter", () => {
    if (!metadata) return;
    profile.classList.add("is-avatar-active");
    playTo(metadata.endFrame, FORWARD_SPEED);
  });

  avatarTarget.addEventListener("pointerleave", () => {
    if (!metadata) return;
    profile.classList.remove("is-avatar-active");
    frameIndex = Math.min(frameIndex, metadata.endFrame);
    drawFrame(frameIndex);
    playTo(metadata.startFrame, REVERSE_SPEED);
  });
}
