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

  static THEME = {
    ink: 0x2a1b12,
    parchment: 0xf2e3c6,
    parchmentDark: 0xd8c39a,
    gold: 0xd0a84d,
    goldDark: 0x7a5a18,
  };

  constructor(scene, baseId, x = PlaceholderCard.W + 10, y, uid = null) {
    super(scene, x, y);
    this.scene = scene;
    this.cardId = baseId;
    this.uid = uid ?? baseId;
    this.isCard = true;

    this.isCardBack = baseId === "CARD_BACK";

    this._baseX = x;
    this._baseY = y;

    this.cardWidth = PlaceholderCard.W;
    this.cardHeight = PlaceholderCard.H;

    this._layout = {
      headerH: 34,
      footerH: 26,
      innerPad: 8,
    };

    // ── layers
    this._addDropShadow();
    this._addBaseShape();
    this._addArtwork();

    const data = this.isCardBack ? {} : CARDS.find((c) => c.id === baseId) || {};
    if (!this.isCardBack) {
      this._buildNameAndCost(data);
      this._buildTypeOverlay(data);
    }

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
    g.fillStyle(PlaceholderCard.THEME.ink, 0.22);
    g.fillRoundedRect(
      -this.cardWidth / 2 + 4,
      -this.cardHeight / 2 + 6,
      this.cardWidth + 2,
      this.cardHeight + 8,
      PlaceholderCard.CORNER + 4
    );
    this.add(g);
    this._shadowGfx = g;
  }

  _addBaseShape() {
    const g = this.scene.add.graphics();
    const { parchment, parchmentDark, gold, goldDark } = PlaceholderCard.THEME;
    g.fillStyle(parchmentDark, 0.98);
    g.fillRoundedRect(
      -this.cardWidth / 2,
      -this.cardHeight / 2,
      this.cardWidth,
      this.cardHeight,
      PlaceholderCard.CORNER
    );

    // inner parchment plate
    g.fillStyle(parchment, 0.94);
    g.fillRoundedRect(
      -this.cardWidth / 2 + 5,
      -this.cardHeight / 2 + 5,
      this.cardWidth - 10,
      this.cardHeight - 10,
      PlaceholderCard.CORNER
    );

    // trim
    g.lineStyle(6, goldDark, 0.75);
    g.strokeRoundedRect(
      -this.cardWidth / 2 + 1,
      -this.cardHeight / 2 + 1,
      this.cardWidth - 2,
      this.cardHeight - 2,
      PlaceholderCard.CORNER + 2
    );
    g.lineStyle(2, gold, 0.7);
    g.strokeRoundedRect(
      -this.cardWidth / 2 + 5,
      -this.cardHeight / 2 + 5,
      this.cardWidth - 10,
      this.cardHeight - 10,
      PlaceholderCard.CORNER
    );
    this.add(g);
    this._frameGfx = g;
  }

  _addArtwork() {
    const data = this.isCardBack ? {} : CARDS.find((c) => c.id === this.cardId) || {};
    const texKey = this.isCardBack ? "appLogo" : (data.frame || "").trim();

    // Reserve space for the title plate and bottom stats bar.
    const topInset = (this._layout?.headerH ?? 38) + 8;
    const bottomInset = this._layout?.footerH ?? 26;
    const innerPad = this._layout?.innerPad ?? 8;
    const safeH = this.cardHeight - topInset - bottomInset;
    const safeY = -this.cardHeight / 2 + topInset + safeH / 2;

    // NOTE: We intentionally avoid GeometryMask here. In Phaser, GeometryMask + Containers
    // can be brittle and may clip the artwork entirely depending on transform/order.
    // Instead, we keep the layout UX-friendly by sizing/centering the artwork into the
    // safe region (between header and footer).
    if (this._artMaskG) {
      this._artMaskG.destroy();
      this._artMaskG = null;
    }

    let art;
    if (texKey && this.scene.textures.exists(texKey)) {
      art = this.scene.add.image(0, safeY, texKey).setOrigin(0.5);
      const src = this.scene.textures.get(texKey).getSourceImage();
      const scale = Math.min(
        (this.cardWidth - innerPad * 2) / src.width,
        safeH / src.height
      );
      art.setScale(scale);
    } else {
      art = this.scene.add
        .rectangle(0, safeY, this.cardWidth - innerPad * 2, safeH, 0xffffff)
        .setOrigin(0.5);
    }

    if (this.isCardBack) {
      art.setAlpha(0.9);
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
    const PAD = 6;
    const yTop = -this.cardHeight / 2;
    const headerH = this._layout?.headerH ?? 38;
    const fixedWidth = this.cardWidth - PAD * 2;

    const { ink, parchment, parchmentDark, gold, goldDark } =
      PlaceholderCard.THEME;

    const fullName = data.name || "?";

    const nameText = this.scene.add
      .text(0, yTop + PAD, fullName, {
        fontFamily: "Georgia, serif",
        fontSize: "17px",
        color: "#2a1b12",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    const nameBg = this.scene.add.graphics();
    const bgX = -this.cardWidth / 2 + PAD;
    const bgY = yTop + PAD;
    const bgW = this.cardWidth - PAD * 2;
    const bgH = headerH;
    nameBg
      .fillStyle(parchmentDark, 0.85)
      .fillRoundedRect(bgX + 1, bgY + 2, bgW, bgH, PlaceholderCard.CORNER + 5)
      .fillStyle(parchment, 0.92)
      .fillRoundedRect(bgX, bgY, bgW, bgH, PlaceholderCard.CORNER + 5)
      .lineStyle(2, goldDark, 0.7)
      .strokeRoundedRect(bgX, bgY, bgW, bgH, PlaceholderCard.CORNER + 5)
      .lineStyle(1, gold, 0.55)
      .strokeRoundedRect(
        bgX + 2,
        bgY + 2,
        bgW - 4,
        bgH - 4,
        PlaceholderCard.CORNER + 4
      );

    // Pixel-width based ellipsis so the title always fits the header.
    // The cost badge sits outside the centered title area, so do not reserve most of the header width.
    const maxTextW = Math.max(10, bgW - 8);
    if (typeof fullName === "string") {
      nameText.setText(fullName);
      if (nameText.width > maxTextW) {
        let s = fullName;
        // prevent pathological loops
        for (let i = 0; i < 80 && s.length > 0; i++) {
          s = s.slice(0, -1);
          nameText.setText(`${s}...`);
          if (nameText.width <= maxTextW) break;
        }
      }
    }

    // Keep the title inside the header plate (no overlap with artwork)
    const availableH = bgH - 10;
    for (let fs = 17; fs >= 12; fs--) {
      nameText.setFontSize(fs);
      if (nameText.height <= availableH) break;
    }
    nameText.setY(bgY + Math.max(4, Math.floor((bgH - nameText.height) / 2)));

    const radius = 20;
    const badge = this.scene.add.graphics();
    badge
      .fillStyle(ink, 0.22)
      .fillEllipse(2, 3, radius, radius)
      .fillStyle(goldDark, 0.95)
      .fillEllipse(0, 0, radius, radius)
      .lineStyle(2, gold, 0.85)
      .strokeEllipse(0, 0, radius, radius);

    const costText = this.scene.add
      .text(0, 0, String(data.cost ?? "?"), {
        fontFamily: "Georgia, serif",
        fontSize: "18px",
        color: "#fff8e6",
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
    const footerH = this._layout?.footerH ?? 26;
    const y = this.cardHeight / 2 - (footerH / 2 + 4);

    /* full-width background bar, perfectly centred */
    const bar = this.scene.add
      .rectangle(0, y, innerW - PAD * 2, footerH, PlaceholderCard.THEME.parchmentDark, 0.9)
      .setOrigin(0.5);

    const barStroke = this.scene.add.graphics();
    barStroke
      .lineStyle(2, PlaceholderCard.THEME.goldDark, 0.7)
      .strokeRoundedRect(
        -(innerW - PAD * 2) / 2,
        y - footerH / 2,
        innerW - PAD * 2,
        footerH,
        PlaceholderCard.CORNER + 4
      );

    if (data.type === "creature") {
      /* ⚔️ ATK on the left, inside padding */
      const atkText = this.scene.add
        .text(-innerW / 2 + PAD, y, `⚔️${data.attack ?? "?"}`, {
          fontSize: "20px",
          color: "#2a1b12",
          fontStyle: "bold",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(0, 0.5);

      /* ❤️ HP on the right, inside padding */
      const hpText = this.scene.add
        .text(innerW / 2 - PAD, y, `❤️${data.health ?? "?"}`, {
          fontSize: "20px",
          color: "#2a1b12",
          fontStyle: "bold",
          padding: { x: 6, y: 2 },
        })
        .setOrigin(1, 0.5);

      this.add([bar, atkText, hpText]);
      this.add(barStroke);
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
          color: "#2a1b12",
          fontStyle: "bold",
          padding: { x: 8, y: 4 },
          fixedWidth: innerW,
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      this.add([bar, tag]);
      this.add(barStroke);
      this.spellTag = tag;
    }
  }

  // Hover tween uses depth faces too
  _setupHover() {
    const BASE = 1;
    const HOVER = 1.22;
    this.on("pointerover", () => {
      this.setDepth(9999);

      if (!this._hoverGlow) {
        const g = this.scene.add.graphics();
        g.lineStyle(5, PlaceholderCard.THEME.gold, 0.22);
        g.strokeRoundedRect(
          -this.cardWidth / 2 - 6,
          -this.cardHeight / 2 - 6,
          this.cardWidth + 12,
          this.cardHeight + 12,
          PlaceholderCard.CORNER + 6
        );
        this.addAt(g, 99);
        this._hoverGlow = g;
      }
      this._hoverGlow.setAlpha(1);

      if (this._shadowGfx) this._shadowGfx.setAlpha(0.32);
      this.scene.tweens.add({
        targets: this,
        scale: HOVER,
        y: this._baseY - 12,
        duration: 150,
        ease: "quad.out",
      });
      const faces = [this._depthRight, this._depthBottom].filter(Boolean);
      if (faces.length) {
        this.scene.tweens.add({
          targets: faces,
          alpha: 1,
          duration: 150,
          ease: "quad.out",
        });
      }
    });
    this.on("pointerout", () => {
      this.setDepth(0);

      if (this._hoverGlow) this._hoverGlow.setAlpha(0);
      if (this._shadowGfx) this._shadowGfx.setAlpha(0.22);
      this.scene.tweens.add({
        targets: this,
        scale: BASE,
        y: this._baseY,
        duration: 150,
        ease: "quad.in",
      });
      const faces = [this._depthRight, this._depthBottom].filter(Boolean);
      if (faces.length) {
        this.scene.tweens.add({
          targets: faces,
          alpha: 0.75,
          duration: 150,
          ease: "quad.in",
        });
      }
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
