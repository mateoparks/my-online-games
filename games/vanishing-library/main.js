// Browser boot: canvas, scaling, input and the frame loop.
VL.boot = function boot(doc, win) {
  const canvas = doc.getElementById('game');
  const screen = VL.createScreen(canvas, doc);
  const input = VL.createKeyboardInput(win, doc);
  // The storage getter itself throws when a browser blocks site data.
  const app = VL.createApp({ storage: VL.createStorage(() => win.localStorage) });
  const gutter = 16;

  function fit() {
    const top = canvas.getBoundingClientRect().top + win.scrollY;
    screen.fit(win.innerWidth - gutter * 2, win.innerHeight - top - gutter, win.devicePixelRatio || 1);
  }

  // A window dragged to a monitor with another pixel density changes
  // devicePixelRatio without a resize; a resolution media query sees it.
  function watchPixelRatio() {
    const query = win.matchMedia?.(`(resolution: ${win.devicePixelRatio || 1}dppx)`);
    query?.addEventListener('change', () => {
      fit();
      watchPixelRatio();
    }, { once: true });
  }

  fit();
  win.addEventListener('resize', fit);
  watchPixelRatio();
  canvas.addEventListener('click', () => canvas.focus());

  const loop = VL.createLoop({
    // The hand keys follow the game being played (W40); title and name use the defaults.
    poll: () => {
      input.setHands(VL.handKeys(app.game));
      return input.poll();
    },
    update: (actions, dt) => app.update(actions, dt),
    draw: (t) => {
      app.draw(screen.ctx, t);
      screen.present();
    },
    now: () => win.performance.now(),
    raf: (frame) => win.requestAnimationFrame(frame),
  });
  loop.start();

  VL.app = app;
  VL.input = input;
  VL.screen = screen;
  return app;
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => VL.boot(document, window));
  } else {
    VL.boot(document, window);
  }
}
