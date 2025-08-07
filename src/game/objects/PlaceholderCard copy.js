import Phaser from "phaser";
import { CARDS } from "../../data/cards";
import { CARD_WIDTH, CARD_HEIGHT } from "../core/constants.js";

export class PlaceholderCard extends Phaser.GameObjects.Container {
  static W = CARD_WIDTH;
  static H = CARD_HEIGHT;
  static CORNER = 4;

  static COLORS = {
    base: 0x723c05,
    frame: 0x2e1802,
    shadow: 0x000000,
    gradientTop: 0xeeeeee,
    gradientBottom: 0x999999,
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

  constructor(scene, baseId, x = PlaceholderCard.W + 10, y, uid = null) {
    super(scene, x, y);
    this.scene = scene;
    this.cardId = baseId;
    this.uid = uid ?? baseId;
    this.isCard = true;

    this.cardWidth = PlaceholderCard.W;
    this.cardHeight = PlaceholderCard.H;

    // ✅ Draw card layers
    this._addDropShadow();
    this._addBaseShape();
    this._addArtwork();

    const data = CARDS.find((c) => c.id === baseId) || {};
    this._buildNameAndCost(data);
    this._buildTypeOverlay(data);

    this.setSize(this.cardWidth, this.cardHeight);
    // ✅ Ensure the whole card container is interactive
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, this.cardWidth, this.cardHeight),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      // useHandCursor: true, // ← ✋ shows when hovered
    });
    this._setupHover();

    scene.add.existing(this);

    this.hlGfx = null;
    this.attackableGfx = null;
  }

  preDestroy() {
    // make sure the orphaned geometry mask goes away
    if (this._artMaskG) {
      this._artMaskG.destroy();
      this._artMaskG = null;
    }
    // let Phaser’s Container cleanup continue
    super.preDestroy && super.preDestroy();
  }

  // ──────────────────────────────
  // Visual Layers
  // ──────────────────────────────
  _addDropShadow() {
    const g = this.scene.add.graphics();
    g.fillStyle(PlaceholderCard.COLORS.shadow, 0.3);
    g.fillRoundedRect(
      -this.cardWidth / 2 + 4,
      -this.cardHeight / 2 + 6,
      this.cardWidth + 2,
      this.cardHeight + 8,
      PlaceholderCard.CORNER + 4
    );
    this.add(g);
  }

  _addBaseShape() {
    const g = this.scene.add.graphics();
    g.fillStyle(PlaceholderCard.COLORS.frame, 0.9);
    g.fillRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      PlaceholderCard.CORNER
    );
    g.lineStyle(10, PlaceholderCard.COLORS.base, 1);
    g.strokeRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      PlaceholderCard.CORNER
    );
    this.add(g);
  }

  _addArtwork() {
    const data = CARDS.find((c) => c.id === this.cardId) || {};
    const texKey = (data.frame || "").trim();

    // ✅ Create proper local-space mask
    // const maskG = this.scene.make.graphics({ add: false });
    // maskG.fillStyle(0xFF0000, 0);
    // maskG.fillRoundedRect(
    //   -this.cardWidth / 2,
    //   -this.cardHeight / 2,
    //   this.cardWidth,
    //   this.cardHeight,
    //   PlaceholderCard.CORNER
    // );
    // maskG.x = this.x; // Sync mask position with card
    // maskG.y = this.y;
    // const geomMask = maskG.createGeometryMask();

    // 🖼️ Artwork
    let art;
    if (texKey && this.scene.textures.exists(texKey)) {
      art = this.scene.add.image(0, 0, texKey).setOrigin(0.5);
      const src = this.scene.textures.get(texKey).getSourceImage();
      const scale = Math.min(
        this.cardWidth / src.width,
        this.cardHeight / src.height
      );
      art.setScale(scale);
    } else {
      art = this.scene.add
        .rectangle(0, 0, this.cardWidth, this.cardHeight, 0xffffff)
        .setOrigin(0.5);
    }

    // art.setMask(geomMask);

    // ✅ Add art AFTER background so it's visible
    this.add(art);

    this._addDepthFaces(6, 0x3a2409);

    this._art = art;
    // this._artMaskG = maskG;
  }

  _addDepthFaces(depthPx = 6, mainColor = 0x352108) {
    // Right face ─ trapezoid
    const r = this.scene.add.graphics();
    r.fillStyle(mainColor, 0.9);
    r.beginPath();
    r.moveTo(this.cardWidth / 2, -this.cardHeight / 2);
    r.lineTo(
      this.cardWidth / 2 + depthPx,
      -this.cardHeight / 2 - depthPx * 0.4
    );
    r.lineTo(this.cardWidth / 2 + depthPx, this.cardHeight / 2 - depthPx * 0.4);
    r.lineTo(this.cardWidth / 2, this.cardHeight / 2);
    r.closePath();
    r.fillPath();

    // Bottom face ─ trapezoid
    const b = this.scene.add.graphics();
    b.fillStyle(mainColor, 0.75);
    b.beginPath();
    b.moveTo(-this.cardWidth / 2, this.cardHeight / 2);
    b.lineTo(this.cardWidth / 2, this.cardHeight / 2);
    b.lineTo(this.cardWidth / 2 + depthPx, this.cardHeight / 2 - depthPx * 0.4);
    b.lineTo(
      -this.cardWidth / 2 + depthPx,
      this.cardHeight / 2 - depthPx * 0.4
    );
    b.closePath();
    b.fillPath();

    // Slide both faces behind everything else in the container
    this.addAt([r, b], 0);

    // Remember them so scale / tint tweens can include them later
    this._depthRight = r;
    this._depthBottom = b;
  }

  // ──────────────────────────────
  // Name + Cost Overlay
  // ──────────────────────────────
  _buildNameAndCost(data) {
    const PAD_X = 1;
    const NAME_TOP = 0;
    const r = 22;

    const usableW = this.cardWidth - PAD_X * 2;
    const yTop = -this.cardHeight / 2 + NAME_TOP;

    const nameText = this.scene.add
      .text(0, yTop, data.name || "?", {
        fontSize: "18px",
        color: "#fff",
        fontStyle: "bold",
        align: "center",
        wordWrap: { width: usableW, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);

    const bounds = nameText.getBounds();
    const bgH = bounds.height + 4;

    const nameBg = this.scene.add
      .rectangle(0, yTop + bgH / 2, this.cardWidth, bgH, 0x000000, 0.3)
      .setOrigin(0.5);

    const badgeY = -this.cardHeight / 2 + r - 30;
    const badgeG = this.scene.add.graphics();
    badgeG
      .fillStyle(PlaceholderCard.COLORS.costFill, 1)
      .fillEllipse(0, 0, r, r);
    badgeG.lineStyle(2, PlaceholderCard.COLORS.costStroke, 1);
    // .strokeCircle(0, 0, r);

    const costText = this.scene.add
      .text(0, 0, String(data.cost ?? "?"), {
        fontSize: "20px",
        color: "#fff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const costOverlay = this.scene.add.container(
      -this.cardWidth / 2 - 4,
      badgeY,
      [badgeG, costText]
    );

    this.add([nameBg, nameText, costOverlay]);

    this.nameText = nameText;
    this.nameBg = nameBg;
    this.costText = costText;
  }

  // ──────────────────────────────
  // Type Overlay (Attack/HP or Spell)
  // ──────────────────────────────
  _buildTypeOverlay(data) {
    const y = this.cardHeight / 2 - 12;

    if (data.type === "creature") {
      const bar = this.scene.add
        .rectangle(0, y, this.cardWidth - 10, 20, 0x000000, 0.3)
        .setOrigin(0.5);

      const atkText = this.scene.add
        .text(-this.cardWidth / 2 + 8, y, `⚔️${data.attack ?? "?"}`, {
          fontSize: "20px",
          color: "#fff",
          fontStyle: "bold",
        })
        .setOrigin(0, 0.5);

      const hpText = this.scene.add
        .text(this.cardWidth / 2 - 8, y, `❤️${data.health ?? "?"}`, {
          fontSize: "20px",
          color: "#fff",
          fontStyle: "bold",
        })
        .setOrigin(1, 0.5);

      this.add([bar, atkText, hpText]);
      this.atkText = atkText;
      this.hpText = hpText;
    } else {
      let label =
        data.damage != null
          ? `DMG ${data.damage}`
          : data.heal != null
          ? `HEAL ${data.heal}`
          : data.boostAttack != null
          ? `ATK+ ${data.boostAttack}`
          : data.boostMana != null
          ? `MANA+ ${data.boostMana}`
          : "?";

      const tag = this.scene.add
        .text(0, y, label, {
          fontSize: "22px",
          color: "#fff",
          backgroundColor: "#0000002d",
          padding: { x: 6, y: 2 },
          fontStyle: "bold",
        })
        .setFixedSize(this.cardWidth, 0)
        .setAlign("center")
        .setOrigin(0.5);
      this.add(tag);
      this.spellTag = tag;
    }
  }

  // ──────────────────────────────
  // Hover Animation
  // ──────────────────────────────
  _setupHover() {
    const BASE_SCALE = 1;
    const HOVER_SCALE = 1.3;
    const ZOOM_MS = 150;

    this.on("pointerover", () => {
      this.setDepth(9999);
      this.scene.tweens.add({
        targets: this,
        scale: HOVER_SCALE,
        duration: ZOOM_MS,
        ease: "quad.out",
        overwrite: true,
      });
      if (this._depthRight && this._depthBottom) {
        this.scene.tweens.add({
          targets: [this._depthRight, this._depthBottom],
          alpha: 1,
          duration: 150,
          ease: "quad.out",
          overwrite: true,
        });
      }
    });

    this.on("pointerout", () => {
      this.setDepth(0);
      this.scene.tweens.add({
        targets: this,
        scale: BASE_SCALE,
        duration: ZOOM_MS,
        ease: "quad.in",
        overwrite: true,
      });
      if (this._depthRight && this._depthBottom) {
        this.scene.tweens.add({
          targets: [this._depthRight, this._depthBottom],
          alpha: 0.75,
          duration: 150,
          ease: "quad.in",
          overwrite: true,
        });
      }
    });
  }

  // ──────────────────────────────
  // Public setters
  // ──────────────────────────────
  setHp(v) {
    if (this.hpText) this.hpText.setText(`❤️${v}`);
  }

  setAtk(v) {
    if (this.atkText) this.atkText.setText(`⚔️${v}`);
  }

  setStats(atk, hp) {
    this.setAtk(atk);
    this.setHp(hp);
  }

  setCost(cost) {
    if (this.costText) this.costText.setText(String(cost));
  }

  highlight(on) {
    if (on) {
      if (this.hlGfx) return;
      this.hlGfx = this._drawOutline(PlaceholderCard.COLORS.selectOutline, 5);
    } else {
      if (this.hlGfx) this.hlGfx.destroy();
      this.hlGfx = null;
    }
  }

  setAttackable(on) {
    if (on) {
      if (this.attackableGfx || this.hlGfx) return;
      this.attackableGfx = this._drawOutline(
        PlaceholderCard.COLORS.attackableOutline,
        4
      );
    } else {
      if (this.attackableGfx) this.attackableGfx.destroy();
      this.attackableGfx = null;
    }
  }

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
    this.addAt(g, 100);
    return g;
  }
}
