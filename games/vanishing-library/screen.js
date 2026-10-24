// The game draws into a 256×192 buffer; present() blits it to the page canvas
// at a whole-number scale so every logical pixel is a square of device pixels.
VL.fitScale = function fitScale(availableWidth, availableHeight, dpr = 1) {
  const { width, height } = VL.TUNING;
  const scale = Math.floor(Math.min((availableWidth * dpr) / width, (availableHeight * dpr) / height));
  return Math.max(1, scale);
};

VL.createScreen = function createScreen(canvas, doc) {
  const { width, height } = VL.TUNING;
  const buffer = doc.createElement('canvas');
  buffer.width = width;
  buffer.height = height;
  const ctx = buffer.getContext('2d');
  const screen = {
    buffer,
    canvas,
    ctx,
    scale: 0,
    fit(availableWidth, availableHeight, dpr = 1) {
      screen.scale = VL.fitScale(availableWidth, availableHeight, dpr);
      canvas.width = width * screen.scale;
      canvas.height = height * screen.scale;
      canvas.style.width = `${(width * screen.scale) / dpr}px`;
      canvas.style.height = `${(height * screen.scale) / dpr}px`;
      canvas.dataset.scale = String(screen.scale);
      return screen.scale;
    },
    present() {
      const out = canvas.getContext('2d');
      out.imageSmoothingEnabled = false;
      out.drawImage(buffer, 0, 0, canvas.width, canvas.height);
    },
  };
  return screen;
};
