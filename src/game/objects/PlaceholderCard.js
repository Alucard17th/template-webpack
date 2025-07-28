import Phaser from "phaser";
import { CARDS } from "../../data/cards";

export class PlaceholderCard extends Phaser.GameObjects.Container {
  constructor(scene, baseId, x, y, uid = null) {
    super(scene, x, y);
    this.scene = scene;
    this.cardId = baseId; // base id for stats
    this.uid = uid ?? baseId; // unique id for state
    this.isCard = true; // tag used in hit tests
    
    // 1) add the base graphic (replace with your PNG later)
    const WIDTH = 80,
      HEIGHT = 100;
    const bg = scene.add
      .rectangle(0, 0, WIDTH, HEIGHT, 0x444444)
      .setStrokeStyle(2, 0xffffff)
      .setOrigin(0.5);
    this.add(bg);

    // store sizes for positioning helpers
    this.cardWidth = WIDTH;
    this.cardHeight = HEIGHT;

    // 2) add name + cost INSIDE the container
    const data = CARDS.find((c) => c.id === baseId) || {};
    this.addNameAndCost(data);

    this.addTypeOverlay(data);

    // 3) enable input on the whole card
    this.setSize(WIDTH, HEIGHT); // important for hit area
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, WIDTH, HEIGHT),
      Phaser.Geom.Rectangle.Contains
    );

    // 4) add to display list
    scene.add.existing(this);
  }

  addNameAndCost(data) {
    const PAD_X = 6; // horizontal padding for the bar
    const PAD_Y = 0; // vertical padding for the bar
    const NAME_TOP = 45; // distance from top edge where the name starts
    const r = 10; // cost badge radius

    // ---- Name text (wrap to multiple lines if needed)
    const usableWidth = this.cardWidth - PAD_X * 2;
    const nameYTop = -this.cardHeight / 2 + NAME_TOP;

    const nameText = this.scene.add
      .text(0, nameYTop, data.name || "?", {
        fontSize: 14,
        color: "#fff",
        align: "center",
        wordWrap: { width: usableWidth, useAdvancedWrap: true },
      })
      .setOrigin(0.5, 0);

    // Measure the rendered text (accounts for wrapping & current scale)
    const nameBounds = nameText.getBounds();
    const nameHeight = nameBounds.height; // already includes any internal line spacing

    // ---- Background sized to the actual text height
    const bgW = this.cardWidth - 8;
    const bgH = nameHeight + PAD_Y * 2;
    const bgCenterY = nameYTop + bgH / 2;

    const nameBg = this.scene.add
      .rectangle(0, bgCenterY, bgW, bgH, 0x000000, 0.45)
      .setOrigin(0.5);

    // Ensure text stays above the background
    nameBg.setDepth(1);
    nameText.setDepth(2);

    // ---- Centered cost badge near the top, but never overlapping the name bar
    const topEdge = -this.cardHeight / 2;
    let badgeY = topEdge + r - 8;

    // Prevent overlap: if badge bottom would touch the name bar top, push it up
    const nameBgTop = nameYTop - PAD_Y; // actual top edge of the bar
    if (badgeY + r > nameBgTop) {
      badgeY = nameBgTop - r - 2; // 2px gap
    }

    const badge = this.scene.add.graphics();
    badge.fillStyle(0x0080ff).fillCircle(0, 0, r);
    badge.lineStyle(2, 0xffffff).strokeCircle(0, 0, r);

    const costText = this.scene.add
      .text(0, 0, String(data.cost ?? "?"), {
        fontSize: 14,
        color: "#fff",
      })
      .setOrigin(0.5);

    // Fit digits inside the circle
    const maxTextW = r * 1.6;
    const costBounds = costText.getBounds();
    if (costBounds.width > maxTextW && costBounds.width > 0) {
      costText.setScale(maxTextW / costBounds.width);
    }

    const overlay = this.scene.add.container(0, badgeY, [badge, costText]);
    overlay.setDepth(3);

    // ---- Keep refs & add in z-order (bg → text → badge)
    this.nameText = nameText;
    this.costOverlay = overlay;
    this.add([nameBg, nameText, overlay]);
  }

  addTypeOverlay(data) {
    switch (data.type) {
      case "creature":
        this.addAtkDefText(data.attack, data.health);
        break;
      case "spell":
        this.addSpellTag(data);
        break;
      default:
        // nothing
        break;
    }
  }

  addAtkDefText(atk = "?", hp = "?") {
    const barY = this.cardHeight / 2 - 16;

    const bar = this.scene.add
      .rectangle(0, barY, this.cardWidth - 8, 18, 0x000000, 0.45)
      .setOrigin(0.5);

    const atkText = this.scene.add
      .text(-this.cardWidth / 2 + 5, barY, `⚔️${atk}`, {
        fontSize: 14,
        color: "#fff",
      })
      .setOrigin(0, 0.5);

    const hpText = this.scene.add
      .text(this.cardWidth / 2 - 5, barY, `❤️${hp}`, {
        fontSize: 14,
        color: "#fff",
      })
      .setOrigin(1, 0.5);

    this.add([bar, atkText, hpText]);

    this.atkText = atkText;
    this.hpText = hpText;
  }

  addSpellTag(data) {
    // Choose what to show: damage or heal
    let text = "";
    if (data.damage != null) text = `DMG ${data.damage}`;
    if (data.heal != null) text = `HEAL ${data.heal}`;
    if (!text) text = "SPELL";

    const tag = this.scene.add
      .text(0, this.cardHeight / 2 - 16, text, {
        fontSize: 13,
        color: "#ffe066",
        backgroundColor: "#00000099",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5);

    this.add(tag);
    this.spellTag = tag;
  }

  highlight(on) {
    if (on) {
      if (this.hlGfx) return;
      const w = this.cardWidth,
        h = this.cardHeight;
      const g = this.scene.add.graphics();
      g.lineStyle(4, 0xffff00).strokeRoundedRect(
        -w / 2 - 4,
        -h / 2 - 4,
        w + 8,
        h + 8,
        6
      );
      this.addAt(g, 0); // behind
      this.hlGfx = g;
      this.setScale(1.05);
    } else {
      this.setScale(1);
      this.hlGfx?.destroy();
      this.hlGfx = null;
    }
  }

  // optional: if you want to swap art later
  setTexture(textureKey) {
    // remove old bg, add image, etc.
  }
}
