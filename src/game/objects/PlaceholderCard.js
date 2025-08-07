import Phaser from "phaser";
import { CARDS } from "../../data/cards";
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_COLORS, // 🎨 single‑source palette
} from "../core/constants.js";

// ----------------------------------------------------------------------------
//  PlaceholderCard  – visuals only. *Strictly* no game‑logic inside here.
//  All colour values now come from CARD_COLORS so theme tweaks live in one file.
// ----------------------------------------------------------------------------
export class PlaceholderCard extends Phaser.GameObjects.Container {
  static W = CARD_WIDTH;
  static H = CARD_HEIGHT;
  static CORNER = 4;

  // ⬇️  expose palette locally for brevity (no mutation!)
  static COLORS = CARD_COLORS;

  constructor(scene, baseId, x = PlaceholderCard.W + 10, y, uid = null) {
    super(scene, x, y);
    this.scene = scene;
    this.cardId = baseId;
    this.uid = uid ?? baseId;
    this.isCard = true;

    this.cardWidth = PlaceholderCard.W;
    this.cardHeight = PlaceholderCard.H;

    // ── layers
    this._addDropShadow();
    // this._addBaseShape();
    this._addArtwork();

    const data = CARDS.find((c) => c.id === baseId) || {};
    this._buildNameAndCost(data);
    this._buildTypeOverlay(data);

    this.setSize(this.cardWidth, this.cardHeight);
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, this.cardWidth, this.cardHeight),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    });
    this._setupHover();

    scene.add.existing(this);

    this.hlGfx = null;
    this.attackableGfx = null;
  }

  // Clean up mask graphics when container is destroyed
  preDestroy() {
    if (this._artMaskG) {
      this._artMaskG.destroy();
      this._artMaskG = null;
    }
    super.preDestroy && super.preDestroy();
  }

  // ─────────────────────────────────────────────────────────── visuals
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
    this.add(art);

    // faux 3‑D depth faces use frame colour so they inherit theme
    // this._addDepthFaces(6, PlaceholderCard.COLORS.frame);
  }

  _addDepthFaces(depthPx = 6, clr = PlaceholderCard.COLORS.frame) {
    // right face
    const r = this.scene.add.graphics();
    r.fillStyle(clr, 0.9);
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

    // bottom face
    const b = this.scene.add.graphics();
    b.fillStyle(clr, 0.75);
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

    this.addAt([r, b], 0);
    this._depthRight = r;
    this._depthBottom = b;
  }

  // ───────────────────────────────────────────────────── overlays
  _buildNameAndCost(data) {
    const PAD = 4;
    const yTop = -this.cardHeight / 2;
    const fixedWidth = this.cardWidth - PAD * 2;

    const nameText = this.scene.add
      .text(PAD, yTop, data.name || "?", {
        fontSize: "18px",
        color: PlaceholderCard.COLORS.hexNameText,
        fontStyle: "bold",
        align: "center",
        padding: { y: PAD },
        wordWrap: { width: fixedWidth, useAdvancedWrap: true },
        fixedWidth,
      })
      .setOrigin(0.5, 0);

    const nb = nameText.getBounds();
    const nameBg = this.scene.add.graphics();
    nameBg.fillStyle(PlaceholderCard.COLORS.nameBg, 0.3).fillRoundedRect(
      -this.cardWidth / 2 + PAD, // x
      yTop + PAD, // y
      this.cardWidth, // width
      nb.height + PAD * 2, // height
      PlaceholderCard.CORNER + 4 // corner radius
    );

    const radius = 22;
    const badge = this.scene.add.graphics();
    badge
      .fillStyle(PlaceholderCard.COLORS.costFill, 1)
      .fillEllipse(0, 0, radius, radius);
    badge.lineStyle(2, PlaceholderCard.COLORS.costStroke, 1);

    const costText = this.scene.add
      .text(0, 0, String(data.cost ?? "?"), {
        fontSize: "20px",
        color: PlaceholderCard.COLORS.hexCostText,
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const costBox = this.scene.add.container(
      -this.cardWidth / 2 - 4,
      -this.cardHeight / 2 + radius - 30,
      [badge, costText]
    );

    this.add([nameBg, nameText, costBox]);
    this.costText = costText;
  }

  _buildTypeOverlay(data) {
    const PAD = 4;
    const innerW = this.cardWidth; // usable width inside the card
    const y = this.cardHeight / 2 - 8;

    /* full-width background bar, perfectly centred */
    const bar = this.scene.add
      .rectangle(0 + PAD, y, innerW, 20, PlaceholderCard.COLORS.atkHpBg, 1)
      .setOrigin(0.5);

    if (data.type === "creature") {
      /* ⚔️ ATK on the left, inside padding */
      const atkText = this.scene.add
        .text(-innerW / 2 + PAD, y, `⚔️${data.attack ?? "?"}`, {
          fontSize: "20px",
          color: PlaceholderCard.COLORS.hexAtkText,
          fontStyle: "bold",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0, 0.5);

      /* ❤️ HP on the right, inside padding */
      const hpText = this.scene.add
        .text(innerW / 2 - PAD, y, `❤️${data.health ?? "?"}`, {
          fontSize: "20px",
          color: PlaceholderCard.COLORS.hexHpText,
          fontStyle: "bold",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(1, 0.5);

      this.add([bar, atkText, hpText]);
      this.atkText = atkText;
      this.hpText = hpText;
    } else {
      /* spell label spans the inner width */
      const label =
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
          color: PlaceholderCard.COLORS.hexSpellText,
          fontStyle: "bold",
          padding: { x: 8, y: 4 },
          fixedWidth: innerW,
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      this.add([bar, tag]);
      this.spellTag = tag;
    }
  }

  // Hover tween uses depth faces too
  _setupHover() {
    const BASE = 1;
    const HOVER = 1.3;
    this.on("pointerover", () => {
      this.setDepth(9999);
      this.scene.tweens.add({
        targets: this,
        scale: HOVER,
        duration: 150,
        ease: "quad.out",
      });
      this.scene.tweens.add({
        targets: [this._depthRight, this._depthBottom],
        alpha: 1,
        duration: 150,
        ease: "quad.out",
      });
    });
    this.on("pointerout", () => {
      this.setDepth(0);
      this.scene.tweens.add({
        targets: this,
        scale: BASE,
        duration: 150,
        ease: "quad.in",
      });
      this.scene.tweens.add({
        targets: [this._depthRight, this._depthBottom],
        alpha: 0.75,
        duration: 150,
        ease: "quad.in",
      });
    });
  }

  // ─────────────────────────────────────────────── public setters
  setHp(v) {
    this.hpText && this.hpText.setText(`❤️${v}`);
  }
  setAtk(v) {
    this.atkText && this.atkText.setText(`⚔️${v}`);
  }
  setStats(atk, hp) {
    this.setAtk(atk);
    this.setHp(hp);
  }
  setCost(c) {
    this.costText && this.costText.setText(String(c));
  }

  highlight(on) {
    if (on && !this.hlGfx)
      this.hlGfx = this._drawOutline(PlaceholderCard.COLORS.selectOutline, 5);
    if (!on && this.hlGfx) {
      this.hlGfx.destroy();
      this.hlGfx = null;
    }
  }

  setAttackable(on) {
    if (on && !this.attackableGfx && !this.hlGfx)
      this.attackableGfx = this._drawOutline(
        PlaceholderCard.COLORS.attackOutline,
        4
      );
    if (!on && this.attackableGfx) {
      this.attackableGfx.destroy();
      this.attackableGfx = null;
    }
  }

  _drawOutline(col, w) {
    const g = this.scene.add.graphics();
    g.lineStyle(w, col, 1);
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
