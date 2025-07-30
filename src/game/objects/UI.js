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
  toast(msg, duration = 2400) {
    const x = this.scene.scale.width / 2;
    const y = this.scene.scale.height / 2;

    const t = this.scene.add
      .text(x, y, msg, {
        fontSize: 24,
        color: "#ff6666",
        backgroundColor: "#000000aa",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0) // stays fixed if the camera moves
      .setDepth(100000); // <<< ensure on top

    // also force to top of display list (belt & suspenders)
    this.scene.children.bringToTop(t);

    this.scene.tweens.add({
      targets: t,
      alpha: 0,
      y: y - 40,
      duration,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy(),
    });
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

  /** Draw a horizontal separator between the two boards */
  drawBoardsDivider(
    myBoard,
    oppBoard,
    { pad = 60, width = 4, dashed = false } = {}
  ) {
    const g = this.dividerGfx;
    const w = this.scene.scale.width;
    const midY = Math.round(this.scene.scale.height / 2); // <-- true center

    g.clear();
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
