import Phaser from "phaser";
import { CARDS } from "../../data/cards";

export class PlaceholderCard extends Phaser.GameObjects.Container {
  // tweak visuals here if you like
  static W = 100;
  static H = 150;
  static CORNER = 10;

  static COLORS = {
    frame: 0xffffff,
    shadow: 0x000000,
    nameBg: 0x000000,
    nameText: 0xffffff,
    costFill: 0x0080ff,
    costStroke: 0xffffff,
    atkHpBg: 0x000000,
    atkText: 0xffffff,
    hpText: 0xffffff,
    spellText: 0xffe066,
    selectOutline: 0xffff00,
    attackableOutline: 0x00ff66,
  };

  constructor(scene, baseId, x = W + 10, y, uid = null) {
    super(scene, x, y);
    this.scene = scene;
    this.cardId = baseId; // base stats id
    this.uid = uid ?? baseId; // unique instance id
    this.isCard = true; // used by hit tests

    this.cardWidth = PlaceholderCard.W;
    this.cardHeight = PlaceholderCard.H;

    // ── soft drop shadow
    this._addDropShadow();

    // ── artwork with rounded mask (falls back to gray if missing)
    this._addArtwork();

    // ── outer frame
    this._addFrame();

    // data for overlays
    const data = CARDS.find((c) => c.id === baseId) || {};

    // ── overlays
    this._buildNameAndCost(data);
    this._buildTypeOverlay(data);

    // input on whole card (correct local coords)
    this.setSize(this.cardWidth, this.cardHeight);
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, this.cardWidth, this.cardHeight),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true, // ← ✋ shows when hovered
    });
    const BASE_SCALE = 1; // normal size
    const HOVER_SCALE = 1.25; // 25 % bigger
    const ZOOM_MS = 150; // tween duration
    // keep the depth you were created with so you can restore it later
    this.baseDepth = this.depth;
    // grow + bring to front
    this.on("pointerover", () => {
      this.setDepth(9999); // draw over everything
      this.scene.tweens.add({
        targets: this,
        scale: HOVER_SCALE, // scaleX + scaleY together
        duration: ZOOM_MS,
        ease: "quad.out",
        overwrite: true, // cancel previous tween
      });
    });
    // shrink + put depth back
    this.on("pointerout", () => {
      this.scene.tweens.add({
        targets: this,
        scale: BASE_SCALE,
        duration: ZOOM_MS,
        ease: "quad.in",
        overwrite: true,
      });
      this.setDepth(this.baseDepth);
    });

    scene.add.existing(this);

    // highlight graphics refs
    this.hlGfx = null; // yellow selected outline
    this.attackableGfx = null; // green "can attack" outline
  }

  // ─────────────────────────────────────────────
  // Build parts
  // ─────────────────────────────────────────────
  _addDropShadow() {
    const g = this.scene.add.graphics();
    g.fillStyle(PlaceholderCard.COLORS.shadow, 0.28);
    g.fillRoundedRect(
      -this.cardWidth / 2 + 3,
      -this.cardHeight / 2 + 5,
      this.cardWidth + 2,
      this.cardHeight + 6,
      PlaceholderCard.CORNER + 2
    );
    this.add(g);
  }

  _addArtwork() {
    const data = CARDS.find((c) => c.id === this.cardId) || {};
    const texKey = (data.frame || "").trim();

    // Debug once per card
    if (!texKey) {
      console.warn("[Card] no frame for", this.cardId);
    } else if (!this.scene.textures.exists(texKey)) {
      console.warn(
        "[Card] texture missing:",
        texKey,
        "available:",
        Object.keys(this.scene.textures.list)
      );
    }

    // Off-display graphics used only for the mask
    const maskG = this.scene.make.graphics({ x: 0, y: 0, add: false });
    maskG.fillStyle(0xffffff, 1);
    maskG.fillRoundedRect(
      this.x - this.cardWidth / 2,
      this.y - this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      PlaceholderCard.CORNER
    );
    const geomMask = maskG.createGeometryMask();

    let art;
    if (texKey && this.scene.textures.exists(texKey)) {
      art = this.scene.add.image(0, 0, texKey).setOrigin(0.5);

      // scale to fit
      const src = this.scene.textures.get(texKey).getSourceImage();
      const scale = Math.min(
        this.cardWidth / src.width,
        this.cardHeight / src.height
      );
      art.setScale(scale);
    } else {
      // fallback neutral bg
      art = this.scene.add
        .rectangle(0, 0, this.cardWidth, this.cardHeight, 0x444444)
        .setOrigin(0.5);
    }

    art.setMask(geomMask);
    this.add(art);

    // subtle glass highlight on top
    const glass = this.scene.add.graphics();
    const h = this.cardHeight * 0.45;
    glass.fillStyle(0xffffff, 0.07);
    glass.fillRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      h,
      { tl: PlaceholderCard.CORNER, tr: PlaceholderCard.CORNER, bl: 0, br: 0 }
    );
    this.add(glass);

    // keep a reference so you can destroy later if needed
    this._art = art;
    this._artMaskG = maskG;
  }

  _addFrame() {
    const g = this.scene.add.graphics();
    g.lineStyle(2, PlaceholderCard.COLORS.frame, 1);
    g.strokeRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      PlaceholderCard.CORNER
    );
    this.add(g);
  }

  // ─────────────────────────────────────────────
  // Name + Cost
  // ─────────────────────────────────────────────
  _buildNameAndCost(data) {
    const PAD_X = 6;
    const NAME_TOP = 46; // px from top edge
    const r = 11;

    const usableW = this.cardWidth - PAD_X * 2;
    const yTop = -this.cardHeight / 2 + NAME_TOP;

    const nameText = this.scene.add
      .text(0, yTop, data.name || "?", {
        fontSize: "18px",
        color: "#ffffff",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: usableW, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);

    const bounds = nameText.getBounds();
    const bgH = bounds.height + 2;

    const nameBg = this.scene.add
      .rectangle(0, yTop + bgH / 2, this.cardWidth - 10, bgH, 0x000000, 0.48)
      .setOrigin(0.5);

    // cost badge (center), avoid overlapping name bar
    const topEdge = -this.cardHeight / 2;
    let badgeY = topEdge + r + 2;
    if (badgeY + r > yTop) badgeY = yTop - r - 2;

    const badgeG = this.scene.add.graphics();
    badgeG.fillStyle(PlaceholderCard.COLORS.costFill, 1).fillCircle(0, 0, r);
    badgeG
      .lineStyle(2, PlaceholderCard.COLORS.costStroke, 1)
      .strokeCircle(0, 0, r);

    const costText = this.scene.add
      .text(0, 0, String(data.cost ?? "?"), {
        fontSize: "14px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    // fit inside circle if necessary
    const maxW = r * 1.6;
    const cBounds = costText.getBounds();
    if (cBounds.width > maxW && cBounds.width > 0) {
      costText.setScale(maxW / cBounds.width);
    }

    const costOverlay = this.scene.add.container(0, badgeY, [badgeG, costText]);

    // z-order
    nameBg.setDepth(1);
    nameText.setDepth(2);
    costOverlay.setDepth(3);

    this.add([nameBg, nameText, costOverlay]);

    // keep refs
    this.nameText = nameText;
    this.nameBg = nameBg;
    this.costText = costText;
    this.costOverlay = costOverlay;
  }

  // ─────────────────────────────────────────────
  // Type overlays
  // ─────────────────────────────────────────────
  _buildTypeOverlay(data) {
    if (data.type === "creature") {
      const y = this.cardHeight / 2 - 16;

      const bar = this.scene.add
        .rectangle(0, y, this.cardWidth - 8, 18, 0x000000, 0.45)
        .setOrigin(0.5);

      const atkText = this.scene.add
        .text(-this.cardWidth / 2 + 5, y, `⚔️${data.attack ?? "?"}`, {
          fontSize: "24px",
          color: "#ffffff",
        })
        .setOrigin(0, 0.5);

      const hpText = this.scene.add
        .text(this.cardWidth / 2 - 5, y, `❤️${data.health ?? "?"}`, {
          fontSize: "24px",
          color: "#ffffff",
        })
        .setOrigin(1, 0.5);

      this.add([bar, atkText, hpText]);

      this.atkText = atkText;
      this.hpText = hpText;
    } else {
      const y = this.cardHeight / 2 - 16;
      let label = "XXXXX"; 
      if (data.damage != null) label = `DMG ${data.damage}`;
      if (data.heal != null) label = `HEAL ${data.heal}`;

      const tag = this.scene.add
        .text(0, y, label, {
          fontSize: "24px",
          color: "#ffe066",
          backgroundColor: "#00000099",
          padding: { x: 4, y: 2 },
        })
        .setOrigin(0.5);

      this.add(tag);
      this.spellTag = tag;
    }
  }

  // ─────────────────────────────────────────────
  // Public setters (used by your Board/UI code)
  // ─────────────────────────────────────────────
  setHp(v) {
    if (this.hpText) this.hpText.setText(`❤️${v}`);
  }
  setAtk(v) {
    if (this.atkText) this.atkText.setText(`⚔️${v}`);
  }
  setStats(atk, hp) {
    if (atk != null) this.setAtk(atk);
    if (hp != null) this.setHp(hp);
  }
  setCost(cost) {
    if (!this.costText) return;
    this.costText.setText(String(cost));
    const r = 11;
    const maxW = r * 1.6;
    const b = this.costText.getBounds();
    if (b.width > maxW && b.width > 0) {
      this.costText.setScale(maxW / b.width);
    } else {
      this.costText.setScale(1);
    }
  }
  setSpellValue(val, kind) {
    if (!this.spellTag) return;
    this.spellTag.setText(kind === "heal" ? `HEAL ${val}` : `DMG ${val}`);
  }

  highlight(on) {
    if (on) {
      if (this.hlGfx) return;
      this.hlGfx = this._drawOutline(PlaceholderCard.COLORS.selectOutline, 4);
      this.setScale(1.05);
    } else {
      this.setScale(1);
      if (this.hlGfx) this.hlGfx.destroy();
      this.hlGfx = null;
    }
  }

  setAttackable(on) {
    if (on) {
      if (this.attackableGfx || this.hlGfx) return;
      this.attackableGfx = this._drawOutline(
        PlaceholderCard.COLORS.attackableOutline,
        3
      );
    } else {
      if (this.attackableGfx) this.attackableGfx.destroy();
      this.attackableGfx = null;
    }
  }

  // ─────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────
  _drawOutline(color, width) {
    const g = this.scene.add.graphics();
    g.lineStyle(width, color, 1);
    g.strokeRoundedRect(
      -this.cardWidth / 2 - 3,
      -this.cardHeight / 2 - 3,
      this.cardWidth + 6,
      this.cardHeight + 6,
      PlaceholderCard.CORNER + 2
    );
    this.addAt(g, 100); // above art/glass
    return g;
  }
}
