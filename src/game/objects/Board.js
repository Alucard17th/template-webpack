import { myPlayer } from "playroomkit";
import { PlaceholderCard } from "../objects/PlaceholderCard";
import { CARDS, CARDS_BY_ID } from "../../data/cards";

const CARD_W = 80;
const CARD_SPACING = 90;
const ROW_PADDING_Y = 113;

export class Board extends Phaser.GameObjects.Group {
  constructor(scene, playerId, isMe, oppState) {
    super(scene);

    this.scene = scene;
    this.playerId = playerId;
    this.isMe = isMe;
    this.oppState = oppState;

    this.group = scene.add.group();

    // Row Y positions:
    if (isMe) {
      this.creaturesY = 460;                     // my top row
      this.spellsY = this.creaturesY + ROW_PADDING_Y;
      this.orderTop = "creature";
    } else {
      this.spellsY = 210;                        // opponent top row
      this.creaturesY = this.spellsY + ROW_PADDING_Y;
      this.orderTop = "spell";
    }

    this.selectedCard = null;

    this.centerLine = scene.add.graphics().setDepth(0);
    this.drawCenterLine();
  }

  /** ids MUST be UIDs like "005#17" */
  render(ids) {
    console.log('[Board] render()', ids);
    if (!ids || !this.group) return;

    this.group.clear(true, true);

    const creatureUids = [];
    const spellUids = [];

    // Split by base type using uid → baseId
    ids.forEach((uid) => {
      const baseId = (uid || "").split("#")[0];
      const c = CARDS_BY_ID[baseId];
      if (c?.type === "creature") creatureUids.push(uid);
      else spellUids.push(uid);
    });

    if (this.orderTop === "creature") {
      this.layoutRow(creatureUids, this.creaturesY, this.isMe, true, 2);
      this.layoutRow(spellUids, this.spellsY, this.isMe, false, 1);
    } else {
      this.layoutRow(spellUids, this.spellsY, this.isMe, false, 1);
      this.layoutRow(creatureUids, this.creaturesY, this.isMe, true, 2);
    }
  }

  /**
   * Lay out a single row. `uids` are instance ids ("005#17").
   */
  layoutRow(uids, y, interactiveForMe, isCreatureRow, depth) {
    if (!uids.length) return;

    const w = this.scene.scale?.width ?? 1024;
    const hSpacing = Math.max(CARD_W + 12, CARD_SPACING);
    const totalSpan = (uids.length - 1) * hSpacing;
    const cx = w / 2;

    const LEFT_GUTTER = 110;
    let startX = cx - totalSpan / 2;
    if (startX < LEFT_GUTTER) startX = LEFT_GUTTER;

    const pState = this.isMe ? myPlayer() : this.oppState;
    const hpMap = pState?.getState("boardState") || {};

    uids.forEach((uid, i) => {
      const x = startX + i * hSpacing;
      const fx = Number.isFinite(x) ? x : LEFT_GUTTER;

      const baseId = (uid || "").split("#")[0];
      const data = CARDS_BY_ID[baseId] || {};

      // Pass uid to card
    //   console.log('rendering', baseId, uid);
      const card = new PlaceholderCard(this.scene, baseId, fx, y, uid);
      card.setDepth(depth);
      this.group.add(card);

      // Interactivity: only my creatures are selectable as attackers
      if (interactiveForMe && isCreatureRow) {
        card.on("pointerup", () => this.selectCard(card));
      }

      if (data.type === "creature") {
        const hpToShow = hpMap[uid] ?? data.health;
        if (card.hpText) {
          card.hpText.setText(`❤️${hpToShow}`);
        } else if (card.atkDefText) {
          card.atkDefText.setText(`⚔️${data.attack}|❤️${hpToShow}`);
        }
      } else {
        // spells — optional tag/value
        if (card.atkDefText) {
          const val = data.damage ?? data.heal ?? "";
          card.atkDefText.setText(val !== "" ? `✦${val}` : ``);
        }
      }
    });
  }

  selectCard(card) {
    if (this.selectedCard && this.selectedCard !== card) {
      this.selectedCard.highlight(false);
    }
    const same = this.selectedCard === card;
    if (same) {
      card.highlight(false);
      this.selectedCard = null;
    } else {
      card.highlight(true);
      this.selectedCard = card;
    }
    return this.selectedCard;
  }

  /** Update text using uid keys */
  updateHpTexts(hpMap) {
    this.group.getChildren().forEach((card) => {
      // accept container or child; prefer tag
      const c = card?.isCard ? card : card?.parentContainer?.isCard ? card.parentContainer : null;
      if (!c) return;

      const baseId = c.cardId;
      const data = CARDS_BY_ID[baseId] || {};
      if (data.type !== "creature") return;

      const uid = c.uid ?? baseId; // fallback
      const hpToShow = hpMap[uid] ?? data.health;

      if (c.hpText) {
        c.hpText.setText(`❤️${hpToShow}`);
      } else if (c.atkDefText) {
        c.atkDefText.setText(`⚔️${data.attack}|❤️${hpToShow}`);
      }
    });
  }

  drawCenterLine() {
    const w = this.scene.scale.width;
    const g = this.centerLine;
    const pad = 60;
    const width = 0.5;

    const midY = (this.creaturesY + this.spellsY) / 2;

    this._strokeDashed(g, pad, midY, w - pad, {
      color: 0xdcdcdc,
      width,
      dash: 14,
      gap: 8,
    });
  }

  _strokeDashed(g, x1, y, x2, { color = 0xffffff, width = 2, dash = 10, gap = 6 } = {}) {
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

  /** Accept container or child */
  contains(obj) {
    if (!this.group) return false;
    const card =
      obj?.isCard
        ? obj
        : obj?.parentContainer?.isCard
        ? obj.parentContainer
        : null;
    if (!card) return false;
    return this.group.contains(card);
  }
}
