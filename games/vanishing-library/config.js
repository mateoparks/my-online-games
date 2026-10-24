// Gameplay numbers are starting values to tune in playtesting (design doc).
VL.TUNING = {
  width: 256,
  height: 192,
  tile: 16,
  cols: 16,
  rows: 11,
  hudHeight: 16,

  startMaxHp: 6,
  heroSpeed: 80,
  heroBox: { w: 10, h: 8 },

  step: 1 / 60,
  maxDt: 0.05,
  maxFrame: 0.1,
  slideSeconds: 0.35,

  // Tiles of gap a chicken flight clears (README "Flight contract"). W7 owns
  // these and moves them into its own VL.tune call; the overworld test reads them.
  chickenFlightShort: 2,
  chickenFlightLong: 4,
};

// Each system file adds its own numbers here instead of editing this file;
// a name two lanes both pick is an error, not a silent override.
VL.tune = function tune(values) {
  for (const [key, value] of Object.entries(values)) {
    if (key in VL.TUNING) throw new Error(`tuning ${key} is already defined`);
    VL.TUNING[key] = value;
  }
  return VL.TUNING;
};
