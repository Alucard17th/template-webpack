export function createLogZone(scene) {
  const LOG_W = 400;
  const LOG_H = 120;
  const DETAIL_W = 460;
  const DETAIL_H = 170;

  const THEME = {
    ink: "#2a1b12",
    parchment: 0xf2e3c6,
    parchmentDark: 0xd8c39a,
    gold: 0xd0a84d,
    goldDark: 0x7a5a18,
  };

  scene.logZone = scene.add.container(20, scene.scale.height - 150);

  scene.logBg = scene.add.graphics();
  scene.logBg
    .fillStyle(THEME.goldDark, 0.18)
    .fillRoundedRect(2, 4, LOG_W, LOG_H, 14)
    .fillStyle(THEME.parchment, 0.92)
    .fillRoundedRect(0, 0, LOG_W, LOG_H, 14)
    .lineStyle(2, THEME.goldDark, 0.7)
    .strokeRoundedRect(0, 0, LOG_W, LOG_H, 14)
    .lineStyle(1, THEME.gold, 0.55)
    .strokeRoundedRect(2, 2, LOG_W - 4, LOG_H - 4, 12);

  scene.logZone.add(scene.logBg);

  scene.logContent = scene.add.container(0, 10);
  scene.logZone.add(scene.logContent);

  const shape = scene.add
    .graphics()
    .fillRect(20, scene.scale.height - 150, LOG_W, LOG_H)
    .setVisible(false);
  const mask = shape.createGeometryMask();
  scene.logZone.setMask(mask);

  // Place details panel above log zone
  scene.cardDetailZone = scene.add.container(
    20,
    scene.scale.height - 150 - (DETAIL_H + 14)
  );

  scene.cardDetailBg = scene.add.graphics();
  scene.cardDetailBg
    .fillStyle(THEME.goldDark, 0.18)
    .fillRoundedRect(2, 4, DETAIL_W, DETAIL_H, 14)
    .fillStyle(THEME.parchment, 0.94)
    .fillRoundedRect(0, 0, DETAIL_W, DETAIL_H, 14)
    .lineStyle(2, THEME.goldDark, 0.7)
    .strokeRoundedRect(0, 0, DETAIL_W, DETAIL_H, 14)
    .lineStyle(1, THEME.gold, 0.55)
    .strokeRoundedRect(2, 2, DETAIL_W - 4, DETAIL_H - 4, 12);

  scene.cardDetailZone.add(scene.cardDetailBg);
  scene.cardDetailText = scene.add
    .text(10, 10, "Hover a card to see details", {
      fontSize: 24,
      color: THEME.ink,
      fontStyle: "bold",
      wordWrap: { width: DETAIL_W - 20 },
    })
    .setOrigin(0, 0);
  scene.cardDetailZone.add(scene.cardDetailText);

  scene.logTexts = [];
  scene.logMaxLines = 50;

  scene.scrollOffset = 0;
  scene.scrollStep = 26;

  // visible scrollbar (visual only)
  scene.logScrollTrack = scene.add.graphics();
  scene.logScrollThumb = scene.add.graphics();
  scene.logZone.add(scene.logScrollTrack);
  scene.logZone.add(scene.logScrollThumb);

  scene.logScrollTrackHit = scene.add.zone(0, 0, 1, 1).setOrigin(0);
  scene.logZone.add(scene.logScrollTrackHit);
  scene.logScrollTrackHit.setInteractive({ useHandCursor: true });
  scene.logScrollTrackHit.setAlpha(0.001);

  scene.logScrollThumbHit = scene.add.zone(0, 0, 1, 1).setOrigin(0);
  scene.logZone.add(scene.logScrollThumbHit);
  scene.logScrollThumbHit.setInteractive({ useHandCursor: true });
  scene.logScrollThumbHit.setAlpha(0.001);

  scene._logScrollDrag = {
    active: false,
    pointerOffsetY: 0,
  };

  scene._logScrollMeta = {
    totalHeight: 0,
    visibleHeight: LOG_H,
    padding: 8,
    trackX: 0,
    trackY: 0,
    trackW: 0,
    trackH: 0,
    thumbY: 0,
    thumbH: 0,
  };

  const updateScrollbar = () => {
    const totalHeight = scene.logTexts.reduce((sum, t) => sum + t.height + 4, 0);
    const visibleHeight = LOG_H;
    const padding = 8;

    const trackX = LOG_W - 14;
    const trackY = 8;
    const trackW = 10;
    const trackH = visibleHeight - 16;

    scene.logScrollTrack.clear();
    scene.logScrollThumb.clear();

    scene._logScrollMeta.totalHeight = totalHeight;
    scene._logScrollMeta.visibleHeight = visibleHeight;
    scene._logScrollMeta.padding = padding;
    scene._logScrollMeta.trackX = trackX;
    scene._logScrollMeta.trackY = trackY;
    scene._logScrollMeta.trackW = trackW;
    scene._logScrollMeta.trackH = trackH;

    // Only show scrollbar if there's overflow
    if (totalHeight <= visibleHeight - padding) {
      scene.logScrollThumbHit.setActive(false);
      scene.logScrollTrackHit.setActive(false);
      return;
    }

    scene.logScrollTrack
      .fillStyle(0x7a5a18, 0.25)
      .fillRoundedRect(trackX, trackY, trackW, trackH, 3)
      .lineStyle(1, 0xd0a84d, 0.25)
      .strokeRoundedRect(trackX, trackY, trackW, trackH, 3);

    scene.logScrollTrackHit
      .setActive(true)
      .setVisible(true)
      .setPosition(trackX, trackY)
      .setSize(trackW, trackH);

    const maxScroll = visibleHeight - totalHeight - padding;
    const denom = Math.abs(maxScroll) || 1;
    const scrollRatio = Phaser.Math.Clamp(Math.abs(scene.scrollOffset) / denom, 0, 1);

    const thumbH = Phaser.Math.Clamp(
      Math.floor((visibleHeight / totalHeight) * trackH),
      18,
      trackH
    );
    const thumbY = trackY + Math.floor((trackH - thumbH) * scrollRatio);

    scene._logScrollMeta.thumbY = thumbY;
    scene._logScrollMeta.thumbH = thumbH;

    scene.logScrollThumb
      .fillStyle(0xd0a84d, 0.55)
      .fillRoundedRect(trackX, thumbY, trackW, thumbH, 3)
      .lineStyle(1, 0x2a1b12, 0.25)
      .strokeRoundedRect(trackX, thumbY, trackW, thumbH, 3);

    scene.logScrollThumbHit
      .setActive(true)
      .setVisible(true)
      .setPosition(trackX, thumbY)
      .setSize(trackW, thumbH);
  };

  scene._updateLogScrollbar = updateScrollbar;

  scene.logScrollTrackHit.on("pointerdown", (pointer, localX, localY) => {
    const m = scene._logScrollMeta;
    const totalHeight = m.totalHeight;
    const visibleHeight = m.visibleHeight;
    const padding = m.padding;
    if (!totalHeight || totalHeight <= visibleHeight - padding) return;

    const maxScroll = visibleHeight - totalHeight - padding;
    const denom = Math.abs(maxScroll) || 1;

    const clamped = Phaser.Math.Clamp(localY + m.trackY, m.trackY, m.trackY + m.trackH);

    // map click to scroll ratio, centering the thumb on click
    const thumbCenter = m.thumbH ? m.thumbH / 2 : 0;
    const desiredThumbY = Phaser.Math.Clamp(
      clamped - thumbCenter,
      m.trackY,
      m.trackY + m.trackH - m.thumbH
    );
    const ratio = Phaser.Math.Clamp(
      (desiredThumbY - m.trackY) / Math.max(1, m.trackH - m.thumbH),
      0,
      1
    );

    scene.scrollOffset = -ratio * denom;
    updateLogScroll(scene);
  });

  scene.logScrollThumbHit.on("pointerdown", (pointer, localX, localY) => {
    const localThumbY = localY + (scene._logScrollMeta.thumbY || 0);
    scene._logScrollDrag.active = true;
    scene._logScrollDrag.pointerOffsetY = localThumbY - (scene._logScrollMeta.thumbY || 0);
  });

  scene.input.on("pointerup", () => {
    scene._logScrollDrag.active = false;
  });

  scene.input.on("pointermove", (pointer) => {
    if (!scene._logScrollDrag.active) return;

    const m = scene._logScrollMeta;
    const totalHeight = m.totalHeight;
    const visibleHeight = m.visibleHeight;
    const padding = m.padding;
    if (!totalHeight || totalHeight <= visibleHeight - padding) return;

    const maxScroll = visibleHeight - totalHeight - padding;
    const denom = Math.abs(maxScroll) || 1;

    const p = scene.logZone.getLocalPoint(pointer.x, pointer.y);
    const localY = p.y;
    const desiredThumbY = Phaser.Math.Clamp(
      localY - scene._logScrollDrag.pointerOffsetY,
      m.trackY,
      m.trackY + m.trackH - m.thumbH
    );
    const ratio = Phaser.Math.Clamp(
      (desiredThumbY - m.trackY) / Math.max(1, m.trackH - m.thumbH),
      0,
      1
    );

    scene.scrollOffset = -ratio * denom;
    updateLogScroll(scene);
  });

  scene.input.on("wheel", (pointer, gameObjects, deltaX, deltaY) => {
    scene.scrollOffset -= deltaY * 0.5;
    updateLogScroll(scene);
  });

  scene.addLog = (message) => {
    const text = scene.add
      .text(10, 0, message, {
        fontSize: 20,
        color: THEME.ink,
        wordWrap: { width: 380 },
      })
      .setOrigin(0, 0);

    scene.logTexts.push(text);
    scene.logContent.add(text);

    repositionLogs(scene);

    const totalHeight = scene.logTexts.reduce((sum, t) => sum + t.height + 4, 0);
    const visibleHeight = LOG_H;
    const padding = 8;
    if (totalHeight > visibleHeight) {
      scene.scrollOffset = visibleHeight - totalHeight - padding;
      updateLogScroll(scene);
    }

    scene._updateLogScrollbar?.();
  };
}

export function repositionLogs(scene) {
  let currentY = 0;
  scene.logTexts.forEach((t) => {
    t.setY(currentY);
    currentY += t.height + 4;
  });
}

export function updateLogScroll(scene) {
  if (scene.logTexts.length === 0) return;

  const totalHeight = scene.logTexts.reduce((sum, t) => sum + t.height + 4, 0);
  const visibleHeight = scene.logBg ? scene.logBg.height ?? 120 : 120;
  const padding = 8;

  const maxScroll = visibleHeight - totalHeight - padding;

  scene.scrollOffset = Math.min(0, Math.max(maxScroll, scene.scrollOffset));

  scene.logContent.y = 10 + scene.scrollOffset;

  scene._updateLogScrollbar?.();
}

export function updateCardDetails(scene, cardData) {
  scene.cardDetailText.setText(
    `${cardData.name}\nType: ${cardData.type}\nCost: ${cardData.cost}\n` +
      (cardData.attack !== undefined ? `Attack: ${cardData.attack}\n` : "") +
      (cardData.health !== undefined ? `Health: ${cardData.health}\n` : "") +
      (cardData.damage !== undefined ? `Damage: ${cardData.damage}\n` : "") +
      (cardData.heal !== undefined ? `Heal: ${cardData.heal}\n` : "") +
      (cardData.description ? `\n${cardData.description}` : "")
  );
}
