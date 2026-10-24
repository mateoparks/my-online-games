// Browser boot: canvas, scaling, input and the frame loop.
VL.boot = function boot(doc, win) {
  const canvas = doc.getElementById('game');
  const screen = VL.createScreen(canvas, doc);
  const input = VL.createKeyboardInput(win, doc);
  const app = VL.createApp();
  const gutter = 16;

  function fit() {
    const top = canvas.getBoundingClientRect().top + win.scrollY;
    screen.fit(win.innerWidth - gutter * 2, win.innerHeight - top - gutter, win.devicePixelRatio || 1);
  }

  fit();
  win.addEventListener('resize', fit);
  canvas.addEventListener('click', () => canvas.focus());

  const loop = VL.createLoop({
    poll: input.poll,
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
