// Fixed-step loop: real time is accumulated (clamped, so a background tab
// doesn't fast-forward the game) and simulated in TUNING.step slices.
// Pressed actions apply to the first step of a frame only.
VL.createLoop = function createLoop({ poll, update, draw, now, raf, step = VL.TUNING.step, maxFrame = VL.TUNING.maxFrame }) {
  let last = null;
  let accumulated = 0;
  let running = false;

  function frame() {
    if (!running) return;
    const t = now() / 1000;
    accumulated += last === null ? step : Math.min(t - last, maxFrame);
    last = t;
    // Polling consumes presses, so on displays faster than the step rate
    // (frames with no step) leave them latched for the next frame that steps.
    if (accumulated >= step - 1e-9) {
      let actions = poll();
      while (accumulated >= step - 1e-9) {
        update(actions, step);
        actions = VL.heldOnly(actions);
        accumulated -= step;
      }
    }
    draw(t);
    raf(frame);
  }

  return {
    start() {
      running = true;
      last = null;
      accumulated = 0;
      raf(frame);
    },
    stop() {
      running = false;
    },
  };
};
