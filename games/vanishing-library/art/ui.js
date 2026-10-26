// The HUD strip (hearts, whole shells, the main-hand and off-hand slots) and
// the framed box every popup, dialogue and menu is drawn in.
(() => {
  const { rect, text } = VL.ART;

  // What the HUD shows besides hearts. The file that owns each value (the
  // inventory, the equipment screen) plugs its reader in once.
  const sources = { shells: () => 0, mainHand: () => null, offHand: () => null };
  const plugged = new Set();

  VL.ART.hudSource = function hudSource(name, read) {
    if (!(name in sources)) throw new Error(`no HUD value ${name}`);
    if (plugged.has(name)) throw new Error(`HUD value ${name} already has a source`);
    plugged.add(name);
    sources[name] = read;
  };

  // hp counts half hearts, so maxHp 6 is three hearts.
  VL.ART.hudModel = function hudModel(state) {
    const hearts = [];
    for (let i = 0; i < Math.ceil(state.maxHp / 2); i += 1) {
      hearts.push(state.hp >= (i + 1) * 2 ? 'full' : state.hp === i * 2 + 1 ? 'half' : 'empty');
    }
    return {
      hearts,
      shells: sources.shells(state),
      mainHand: sources.mainHand(state),
      offHand: sources.offHand(state),
    };
  };

  VL.ART.HUD_LAYOUT = {
    heartX: 5, heartY: 5, heartStep: 9, heartsPerRow: 10,
    shellX: 104, shellY: 5,
    // The SAVED / COULD NOT SAVE note (scenes/play.js), right-aligned here so
    // it never covers the play area or the dungeon keys under it.
    note: { right: 197, y: 5, twoLineY: 1 },
    slots: [
      { hand: 'mainHand', label: '␣', x: 200 },
      { hand: 'offHand', label: 'D', x: 228 },
    ],
    slotY: 1, slotW: 24, slotH: 14,
  };

  // An item in a hand slot is drawn with the sprite `item-<id>`.
  function drawSlot(ctx, slot, item) {
    const { slotY, slotW, slotH } = VL.ART.HUD_LAYOUT;
    const edge = item ? 'text' : 'slotEmpty';
    rect(ctx, edge, slot.x + 1, slotY, slotW - 2, 1);
    rect(ctx, edge, slot.x + 1, slotY + slotH - 1, slotW - 2, 1);
    rect(ctx, edge, slot.x, slotY + 1, 1, slotH - 2);
    rect(ctx, edge, slot.x + slotW - 1, slotY + 1, 1, slotH - 2);
    if (!item) return;
    text(ctx, slot.label, slot.x + 2, slotY + 2, { size: 'small', color: 'textDim' });
    const id = `item-${item}`;
    // A missing sprite shows, like the missing tile style, instead of an empty slot.
    if (!VL.ART.SPRITES[id]) {
      text(ctx, '?', slot.x + 14, slotY + 3, { color: 'text', align: 'center' });
      return;
    }
    const sprite = VL.ART.sprite(id);
    VL.ART.drawSprite(ctx, id, slot.x + 14 - Math.floor(sprite.w / 2), slotY + Math.floor((slotH - sprite.h) / 2));
  }

  VL.ART.drawHud = function drawHud(ctx, state) {
    VL.ART.drawHudModel(ctx, VL.ART.hudModel(state));
  };

  VL.ART.drawHudModel = function drawHudModel(ctx, model) {
    const { width, hudHeight } = VL.TUNING;
    const layout = VL.ART.HUD_LAYOUT;
    rect(ctx, 'hud', 0, 0, width, hudHeight);
    rect(ctx, 'boxShade', 0, hudHeight - 1, width, 1);
    const twoRows = model.hearts.length > layout.heartsPerRow;
    model.hearts.forEach((kind, i) => {
      const row = Math.floor(i / layout.heartsPerRow);
      const x = layout.heartX + (i % layout.heartsPerRow) * layout.heartStep;
      const y = twoRows ? 1 + row * 7 : layout.heartY;
      VL.ART.drawSprite(ctx, `heart-${kind}`, x, y);
    });
    VL.ART.drawSprite(ctx, 'icon-shell', layout.shellX, layout.shellY);
    text(ctx, String(model.shells).padStart(3, '0'), layout.shellX + 10, layout.shellY - 1, { color: 'text' });
    for (const slot of layout.slots) drawSlot(ctx, slot, model[slot.hand]);
  };

  // ---------- boxes and popups ----------

  // A framed panel: dark outline with clipped corners, a light inner edge.
  VL.ART.drawBox = function drawBox(ctx, x, y, w, h) {
    rect(ctx, 'shadow', x + 2, y + h, w - 2, 2);
    rect(ctx, 'outline', x + 1, y, w - 2, h);
    rect(ctx, 'outline', x, y + 1, w, h - 2);
    rect(ctx, 'boxEdge', x + 2, y + 1, w - 4, h - 2);
    rect(ctx, 'boxEdge', x + 1, y + 2, w - 2, h - 4);
    rect(ctx, 'boxFill', x + 2, y + 2, w - 4, h - 4);
    rect(ctx, 'boxShade', x + 2, y + h - 3, w - 4, 1);
  };

  VL.ART.POPUP = { width: 224, pad: 6, maxLines: 4, margin: 6 };

  // Where a popup goes and how its text wraps. `overflow` is true when the
  // text needs more than maxLines; a content test should treat that as a bug.
  VL.ART.popupLayout = function popupLayout({ text: body = '', title = null, at = 'bottom', width = VL.ART.POPUP.width, maxLines = VL.ART.POPUP.maxLines }) {
    const { pad, margin } = VL.ART.POPUP;
    const { width: screenW, height: screenH, hudHeight } = VL.TUNING;
    const line = VL.ART.lineHeight('normal');
    const wrapped = VL.ART.wrapText(body, width - pad * 2, 'normal');
    const lines = wrapped.slice(0, maxLines);
    const titleHeight = title ? line + 2 : 0;
    const h = pad * 2 + titleHeight + lines.length * line - 2;
    const x = Math.floor((screenW - width) / 2);
    const y = at === 'top' ? hudHeight + margin : at === 'center' ? hudHeight + Math.floor((screenH - hudHeight - h) / 2) : screenH - margin - h;
    return { x, y, w: width, h, title, lines, overflow: wrapped.length > maxLines, textX: x + pad, textY: y + pad + titleHeight };
  };

  // Draws over the whole canvas (HUD included); returns the layout.
  VL.ART.drawPopup = function drawPopup(ctx, popup, t = 0) {
    const layout = VL.ART.popupLayout(popup);
    const { x, y, w, h, lines } = layout;
    const line = VL.ART.lineHeight('normal');
    VL.ART.drawBox(ctx, x, y, w, h);
    if (layout.title) text(ctx, layout.title, x + VL.ART.POPUP.pad, y + VL.ART.POPUP.pad, { color: 'goldLight', shadow: 'boxShade' });
    lines.forEach((content, i) => text(ctx, content, layout.textX, layout.textY + i * line, { color: 'text' }));
    if (popup.prompt !== false && Math.floor(t * 2.5) % 2 === 0) {
      rect(ctx, 'gold', x + w - 12, y + h - 7, 5, 1);
      rect(ctx, 'gold', x + w - 11, y + h - 6, 3, 1);
      rect(ctx, 'gold', x + w - 10, y + h - 5, 1, 1);
    }
    return layout;
  };
})();
