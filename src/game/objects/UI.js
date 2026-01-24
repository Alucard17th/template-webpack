import { myPlayer, getState } from "playroomkit";
const MANA_POINTS = 10;
const BAR_W = 180;
const BAR_H = 15;

export class UI {
  constructor(scene) {
    this.scene = scene;
    // use the scene’s correct value
    this.screenMiddle = scene.screenMiddle ?? (scene.scale.width - BAR_W) / 2;
    // fallback if ever undefined
    if (
      typeof this.screenMiddle !== "number" ||
      Number.isNaN(this.screenMiddle)
    ) {
      this.screenMiddle = (scene.scale.width - 360) / 2; // 360 = bar width
    }

    // Initialize UI elements
    this.hpBars = {};
    this.manaBars = {};
    this.textElements = {};

    // cache of last drawn positions/values
    this.lastPlayerManaBar = null;
    this.lastOpponentManaBar = null;

    // ⬇️ divider graphics
    this.dividerGfx = this.scene.add.graphics().setDepth(0);

    this.initBars();
    this.initTexts();
  }

  initBars() {
    // Health bars
    this.hpBars = {
      player: this.scene.add.graphics(),
      opponent: this.scene.add.graphics(),
    };

    // Mana bars
    this.manaBars = {
      player: this.scene.add.graphics(),
      opponent: this.scene.add.graphics(),
    };
  }

  initTexts() {
    // Create text elements once
    this.texts = {
      playerHp: this.scene.add
        .text(0, 0, "", { fontSize: 18, color: "#fff" })
        .setOrigin(1, 0.5),
      playerMana: this.scene.add
        .text(0, 0, "", { fontSize: 18, color: "#fff" })
        .setOrigin(1, 0.5),
      opponentHp: this.scene.add
        .text(0, 0, "", { fontSize: 18, color: "#fff" })
        .setOrigin(1, 0.5),
      opponentMana: this.scene.add
        .text(0, 0, "", { fontSize: 18, color: "#fff" })
        .setOrigin(1, 0.5),
    };
  }

  drawHpBar(x, y, hp, max = 100, isPlayer = true) {
    const gfx = isPlayer ? this.hpBars.player : this.hpBars.opponent;
    const w = 180,
      h = 15;
    const pct = Phaser.Math.Clamp(hp / max, 0, 1);

    gfx.clear();
    gfx.fillStyle(0x222222);
    gfx.fillRect(x, y, w, h);
    gfx.fillStyle(0xff3b3b);
    gfx.fillRect(x, y, w * pct, h);
    gfx.lineStyle(1, 0xffffff);
    gfx.strokeRect(x, y, w, h);

    return { left: x, cy: y + h / 2 };
  }

  drawManaBar(x, y, mana, max = 10, isPlayer = true) {
    const gfx = isPlayer ? this.manaBars.player : this.manaBars.opponent;
    const w = BAR_W,
      h = BAR_H;
    const pct = Phaser.Math.Clamp(mana / max, 0, 1);

    gfx.clear();
    gfx.fillStyle(0x222222);
    gfx.fillRect(x, y, w, h);
    gfx.fillStyle(0x0080ff);
    gfx.fillRect(x, y, w * pct, h);
    gfx.lineStyle(1, 0xffffff);
    gfx.strokeRect(x, y, w, h);

    // cache geometry & value for flashing
    const cache = { x, y, w, h, mana, max };
    if (isPlayer) this.lastPlayerManaBar = cache;
    else this.lastOpponentManaBar = cache;

    return { left: x, cy: y + h / 2 };
  }

  // End Turn Button
  createEndTurnButton(offsetX = 30, offsetY = 30) {
    const w = 180,
      h = 48;

    // Start position: bottom-right minus offsets
    const x = this.scene.scale.width - w / 2 - offsetX;
    const y = this.scene.scale.height - h / 2 - offsetY;

    const rect = this.scene.add
      .rectangle(x, y, w, h, 0x145214)
      .setStrokeStyle(2, 0xffffff)
      .setInteractive({ useHandCursor: true });

    const label = this.scene.add
      .text(x, y, "End Turn", {
        fontSize: 24,
        color: "#fff",
      })
      .setOrigin(0.5);

    rect.on("pointerover", () => rect.setAlpha(0.85));
    rect.on("pointerout", () => rect.setAlpha(1));
    rect.on("pointerdown", () => rect.setFillStyle(0x0aff0a));
    rect.on("pointerup", () => {
      rect.setFillStyle(0x145214);
      if (getState("turnPlayerId") === myPlayer().id) {
        myPlayer().setState("request", { endTurn: true });
      }
    });

    const container = this.scene.add
      .container(0, 0, [rect, label])
      .setSize(w, h)
      .setVisible(false);

    // ✅ Listen for resize and reposition dynamically
    this.scene.scale.on("resize", (gameSize) => {
      const { width, height } = gameSize;
      const newX = width - w / 2 - offsetX;
      const newY = height - h / 2 - offsetY;
      rect.setPosition(newX, newY);
      label.setPosition(newX, newY);
    });

    return container;
  }

  // Toast Message
  // toast(msg, duration = 2400) {
  //   const x = this.scene.scale.width / 2;
  //   const y = this.scene.scale.height / 2;

  //   const t = this.scene.add
  //     .text(x, y, msg, {
  //       fontSize: 24,
  //       color: "#ff6666",
  //       backgroundColor: "#000000aa",
  //       padding: { x: 12, y: 6 },
  //     })
  //     .setOrigin(0.5)
  //     .setScrollFactor(0) // stays fixed if the camera moves
  //     .setDepth(100000); // <<< ensure on top

  //   // also force to top of display list (belt & suspenders)
  //   this.scene.children.bringToTop(t);

  //   this.scene.tweens.add({
  //     targets: t,
  //     alpha: 0,
  //     y: y - 40,
  //     duration,
  //     ease: "Quad.easeOut",
  //     onComplete: () => t.destroy(),
  //   });
  // }
  // Drop-in replacement (backwards compatible):
  // toast("msg") OR toast("msg", 2400) OR toast("msg", { duration, variant, maxToasts, ... })
  toast(msg, opts = 2400) {
    // ---- options (keep old signature working) ----
    const isNum = typeof opts === "number";
    const {
      duration,
      variant = "error", // 'error' | 'warning' | 'info' | 'success'
      maxToasts = 3,
      widthRatio = 0.72,
      margin = 16,
      spacing = 10,
      fontSize = 20,
      padding = { x: 16, y: 10 },
    } = isNum ? { duration: opts } : opts || {};

    // palette per variant
    const palette = {
      error: { bg: 0x2b0d12, stroke: 0xff6b6b, text: "#ffecec", bar: 0xff6b6b },
      warning: {
        bg: 0x2b220b,
        stroke: 0xffd166,
        text: "#fff6dd",
        bar: 0xffd166,
      },
      info: { bg: 0x0b1f2b, stroke: 0x66c5ff, text: "#e8f4ff", bar: 0x66c5ff },
      success: {
        bg: 0x0e2617,
        stroke: 0x4bde97,
        text: "#e6fff4",
        bar: 0x4bde97,
      },
    };
    const colors = palette[variant] || palette.info;

    const scene = this.scene;
    const maxWidth = Math.floor(scene.scale.width * widthRatio);

    // Auto duration based on message length (if not provided)
    const baseMs = 2200,
      perChar = 35,
      minMs = 1800,
      maxMs = 6500;
    const autoDuration = Phaser.Math.Clamp(
      baseMs + perChar * String(msg).length,
      minMs,
      maxMs
    );
    const lifeMs = isNum ? opts : duration ?? autoDuration;

    // Keep a stack on 'this'
    this._toasts = this._toasts || [];
    // Trim extra toasts (oldest first)
    while (this._toasts.length >= maxToasts) {
      const oldest = this._toasts.pop();
      oldest?.container?.destroy();
      oldest?.timer && scene.time.removeEvent(oldest.timer);
    }

    // ---- build toast elements ----
    const text = scene.add
      .text(0, 0, msg, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        fontSize: `${fontSize}px`,
        color: colors.text,
        wordWrap: { width: maxWidth - padding.x * 2 },
        lineSpacing: 4,
      })
      .setDepth(100002);

    const w = Math.min(maxWidth, text.width + padding.x * 2);
    const h = text.height + padding.y * 2 + 6; // +6 for progress bar

    const bg = scene.add.graphics().setDepth(100000);
    bg.fillStyle(colors.bg, 0.92).fillRoundedRect(0, 0, w, h, 10);
    bg.lineStyle(2, colors.stroke, 0.9).strokeRoundedRect(0, 0, w, h, 10);

    const bar = scene.add.graphics().setDepth(100003);
    const drawBar = (pct) => {
      bar.clear();
      bar
        .fillStyle(colors.bar, 0.95)
        .fillRoundedRect(4, h - 6, (w - 8) * pct, 3, 1.5);
    };
    drawBar(1);

    const container = scene.add
      .container(0, 0, [bg, text, bar])
      .setSize(w, h)
      .setScrollFactor(0)
      .setDepth(100000)
      .setAlpha(0);

    // position text inside
    text.setPosition(padding.x, padding.y);
    scene.children.bringToTop(container);

    // pause on hover
    container.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, h),
      Phaser.Geom.Rectangle.Contains
    );
    let paused = false;
    container.on("pointerover", () => {
      paused = true;
    });
    container.on("pointerout", () => {
      paused = false;
    });

    // ---- stack layout (bottom-center) ----
    const layout = () => {
      const screenW = scene.scale.width;
      const screenH = scene.scale.height;
      let y = screenH - margin;
      for (let i = 0; i < this._toasts.length; i++) {
        const t = this._toasts[i];
        const c = t.container;
        const x = Math.floor(screenW / 2 - c.width / 2);
        y -= c.height;
        c.setPosition(x, y);
        y -= spacing;
      }
    };

    // Push new toast at start (so it sits at the bottom of stack)
    const meta = { container, timer: null };
    this._toasts.unshift(meta);
    layout();

    // ---- animate in ----
    scene.tweens.add({
      targets: container,
      alpha: 1,
      y: container.y - 24,
      duration: 160,
      ease: "Quad.easeOut",
      onComplete: () => {
        scene.tweens.add({
          targets: container,
          y: container.y + 6,
          duration: 120,
          ease: "Quad.easeOut",
        });
      },
    });

    // ---- lifetime loop (progress + auto close) ----
    let elapsed = 0;
    meta.timer = scene.time.addEvent({
      delay: 16,
      loop: true,
      callback: () => {
        if (!container.active) return;
        if (!paused) elapsed += 16;
        const pct = Phaser.Math.Clamp(1 - elapsed / lifeMs, 0, 1);
        drawBar(pct);
        if (elapsed >= lifeMs) close();
      },
    });

    // ---- close helper ----
    const close = () => {
      if (!container.active) return;
      scene.time.removeEvent(meta.timer);
      scene.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y + 20,
        duration: 180,
        ease: "Quad.easeIn",
        onComplete: () => {
          container.destroy();
          const idx = this._toasts.indexOf(meta);
          if (idx >= 0) this._toasts.splice(idx, 1);
          layout();
        },
      });
    };

    // optional: click to dismiss
    container.once("pointerup", close);
  }

  /** Flash the *player* mana bar at its last drawn position */
  flashManaBar() {
    // fall back to something sensible if not drawn yet
    const cache = this.lastPlayerManaBar ?? {
      x: this.screenMiddle,
      y: 720,
      w: BAR_W,
      h: BAR_H,
      mana: 0,
      max: 10,
    };

    const { x, y, w, h, mana, max } = cache;
    const g = this.manaBars.player;

    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 200,
      yoyo: true,
      repeat: 1,
      onUpdate: (tween) => {
        const v = tween.getValue();
        g.clear();

        g.fillStyle(0x222222);
        g.fillRect(x, y, w, h);

        g.fillStyle(0x0080ff);
        g.fillRect(x, y, w * (mana / max), h);

        if (v > 0.5) {
          g.lineStyle(2, 0xff0000);
        } else {
          g.lineStyle(1, 0xffffff);
        }
        g.strokeRect(x, y, w, h);
      },
      onComplete: () => {
        // clean redraw using the cached geometry/value
        this.drawManaBar(x, y, mana, max, true);
      },
    });
  }

  /** Draw a horizontal separator and colored backgrounds for boards */
  drawBoardsDivider(
    myBoard,
    oppBoard,
    { pad = 60, width = 4, dashed = false } = {}
  ) {
    const g = this.dividerGfx;
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const midY = Math.round(h / 2);

    g.clear();

    // 🔵 Player board background (bottom half)
    g.fillStyle(0x003366, 0.25); // dark blue with opacity
    g.fillRect(0, midY, w, h - midY);

    // 🔴 Opponent board background (top half)
    g.fillStyle(0x660000, 0.25); // dark red with opacity
    g.fillRect(0, 0, w, midY);

    // Divider line
    if (dashed) {
      this._strokeDashed(g, pad, midY, w - pad, {
        color: 0xff3b3b,
        width,
        dash: 14,
        gap: 8,
      });
    } else {
      g.lineStyle(width, 0xff3b3b, 1);
      g.beginPath();
      g.moveTo(pad, midY);
      g.lineTo(w - pad, midY);
      g.strokePath();
    }
  }

  /** helper for dashed strokes */
  _strokeDashed(
    g,
    x1,
    y,
    x2,
    { color = 0xffffff, width = 2, dash = 10, gap = 6 } = {}
  ) {
    g.lineStyle(width, color, 1);
    let x = x1;
    while (x < x2) {
      const xEnd = Math.min(x + dash, x2);
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(xEnd, y);
      g.strokePath();
      x = xEnd + gap;
    }
  }

  /** Call this on resize to keep the line correctly sized */
  redrawBoardsDivider(myBoard, oppBoard, opts) {
    this.drawBoardsDivider(myBoard, oppBoard, opts);
  }
}
