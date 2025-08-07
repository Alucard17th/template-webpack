/*********************************************************************
 *  Multiplayer.js  –  Phaser scene (presentation only)
 *    ─ loads textures
 *    ─ draws hands / boards / UI
 *    ─ forwards “request” objects to the RequestQueue ⬅️  (THE brain)
 *********************************************************************/

import Phaser from "phaser";
import {
  onPlayerJoin,
  isHost,
  me,
  myPlayer,
  setState,
  getState,
  getParticipants,
} from "playroomkit";
import { CARDS, CARDS_BY_ID } from "../../data/cards.js";
import { CARD_WIDTH, CARD_HEIGHT } from "../core/constants.js";
import { buildDeck } from "../../helpers/deckUtils.js";
import { Deck } from "../../logic/Deck.js";
import { UI } from "../objects/UI.js";
import { Board } from "../objects/Board.js";
import { PlaceholderCard } from "../objects/PlaceholderCard.js";
import {
  START_HAND_SIZE,
  DECK_COPIES,
  STARTING_MANA,
  MAX_MANA,
  HEALTH_POINTS,
  TICK_MS,
  MY_HAND_Y,
  OPP_HAND_Y,
} from "../core/constants.js";
import { TurnManager } from "../core/TurnManager.js";
import { RequestQueue } from "../core/RequestQueue.js";

// ─────────────────────────────────────────────────────────────
// Cosmetic constants (scene‑only — not needed by core logic)
// ─────────────────────────────────────────────────────────────
const WIDTH = 1920;
const HEIGHT = 1080;
const BAR_SHIFT_X = 240;
const AVATAR_W = 50;
const AVATAR_H = 50;
const BOTTOM_Y = HEIGHT - AVATAR_H - 90;
const TOP_Y = AVATAR_H + 80;
const LEFT_X = WIDTH / 3 - AVATAR_W / 2;
const RIGHT_X = WIDTH / 3 - AVATAR_W / 2;
const DECK_X = WIDTH / 1.28;
const FACE_ZONE_SCALE = 1.8; //  ➟  how wide the hit‑box is vs avatar
// ─────────────────────────────────────────────────────────────
function hexToInt(hex) {
  try {
    return Phaser.Display.Color.HexStringToColor(hex).color;
  } catch {
    return 0xffffff;
  }
}
function loadBase64Texture(scene, key, dataUrl) {
  return new Promise((resolve, reject) => {
    if (!dataUrl) return reject(new Error("No dataUrl"));
    if (scene.textures.exists(key)) return resolve(scene.textures.get(key));

    // Use an HTMLImage and add it when loaded
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        // This creates a Phaser texture from the decoded image
        scene.textures.addImage(key, img);
        resolve(scene.textures.get(key));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = dataUrl; // supports data:image/svg+xml, data:image/png, etc.
  });
}
function makeFaceZone(scene, sprite, owner) {
  const r = (AVATAR_W / 2) * FACE_ZONE_SCALE;
  const z = scene.add
    .zone(sprite.x, sprite.y, r * 2, r * 2)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  z.isFace = true; // flag so pointer‑handler can recognise it
  z.owner = owner; // "me" | "opponent"

  // optional thin outline (debug)
  scene.add
    .graphics()
    .lineStyle(1, 0xff00ff, 0.35)
    .strokeRectShape(z.getBounds());

  return z;
}

export class Multiplayer extends Phaser.Scene {
  players = [];

  constructor() {
    super("Multiplayer");
  }

  // =============== CREATE ===================================================
  create() {
    this.graveyardCounter = this.add.text(50, 50, "", {
      fontSize: 18,
      color: "#ccc",
    });

    this.updateGraveyardCount = () => {
      const myGraveyard = myPlayer().getState("graveyard") || [];
      this.graveyardCounter.setText(`🪦 ${myGraveyard.length}`);
    };

    /* 1. basic UI scaffolding ────────────────────── */
    this.bg = this.add
      .image(this.scale.width / 2, this.scale.height / 2, "boardBg")
      .setOrigin(0.5)
      .setDepth(-100)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setAlpha(0.4);

    this.scale.on("resize", (gs) => {
      this.bg
        .setDisplaySize(gs.width, gs.height)
        .setPosition(gs.width / 2, gs.height / 2);
    });

    this.ui = new UI(this);
    this.myHand = this.add.group();
    this.oppHand = this.add.group();
    this.myBoard = new Board(this, myPlayer()?.id, true);
    this.oppBoard = null;

    const statStyle = { fontSize: 18, color: "#fff", fontFamily: "sans-serif" };
    this.myHpTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9000);
    this.myManaTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9000);
    this.oppHpTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9000);
    this.oppManaTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9000);

    this._createUiElements();
    this.screenMidX = (this.scale.width - 360) / 2;

    /* 2. core helpers ────────────────────────────── */
    this.deckMap = new Map(); // playerId → Deck
    this.turnMan = new TurnManager(this, this.deckMap);
    this.reqQueue = new RequestQueue([], this.turnMan, CARDS_BY_ID, (msg) =>
      this.addLog(msg)
    );

    /* 2.a host must create its own deck immediately */
    if (isHost()) {
      const self = myPlayer();
      const deck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle();
      this.deckMap.set(self.id, deck);
      self.setState("deckSize", deck.size(), true); // 5
      this.reqQueue.players.push(self);
    }

    /* 3. player join ─────────────────────────────── */
    onPlayerJoin((ps) => {
      /* only host owns / mutates decks – but skip self (already done) */
      if (isHost() && ps.id !== me().id) {
        const deck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle();
        this.deckMap.set(ps.id, deck);
        ps.setState("deckSize", deck.size(), true);
      }

      this._updateDeckCounters();

      if (ps.id !== me().id) {
        this.oppState = ps;
        this.oppBoard = new Board(this, ps.id, false, ps);
        this.ui.drawBoardsDivider(this.myBoard, this.oppBoard);
      }

      /* push only if new, and start the game *only* on a real addition */
      let added = false;
      if (!this.reqQueue.players.some((p) => p.id === ps.id)) {
        this.reqQueue.players.push(ps);
        added = true;
      }

      if (isHost() && added && this.reqQueue.players.length === 2) {
        this._dealOpeningHands();
        setState("logs", [], true); // clear old logs
      }
    });

    /* 4. host tick ──────────────────────────────── */
    if (isHost()) {
      this.time.addEvent({
        delay: TICK_MS,
        loop: true,
        callback: () => this.reqQueue.process(),
      });
    }

    /* 5. turn UI etc. (unchanged) ───────────────── */
    this.endBtn = this.ui.createEndTurnButton();
    const b = this.endBtn.getBounds();
    this.turnText = this.add
      .text(b.centerX, b.top - 10, "", {
        fontSize: 22,
        color: "#fff",
      })
      .setOrigin(0.5, 1);

    this.scale.on("resize", () => {
      const nb = this.endBtn.getBounds();
      this.turnText.setPosition(nb.centerX, nb.top - 10);
    });

    this.time.addEvent({
      delay: 100,
      loop: true,
      callback: () => {
        const cur = getState("turnPlayerId");
        if (!cur) return;
        const mine = cur === myPlayer().id;
        this.turnText.setText(mine ? "Your Turn" : "Opponent Turn");
        this.endBtn.setVisible(mine);
      },
    });

    this._initPointerHandlers();
    this._createLogZone();
    // 🔁 Check for animation broadcast
    this._lastAnimEvent = null;

    // 🔄 Watch for deck size changes for all players
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this._updateDeckCounters(),
    });
  }

  // =============== UPDATE ===================================================
  update() {
    if (!this._avatarsBuilt && getState("gameStarted")) {
      this._avatarsBuilt = true;
      this._createAllAvatars();
    }
    this._syncLogs();
    this._syncHand();
    this._syncBoards();
    this._syncBars();
    this._syncBoardState();
    this._syncToasts();
    this._syncRejects();

    this._playCardAnimation();
    this.updateGraveyardCount();

    const resetFlag = getState("resetGame");
    if (resetFlag && this._lastResetFlag !== resetFlag) {
      this._lastResetFlag = resetFlag;

      if (this.gameOverContainer) {
        this.gameOverContainer.destroy(true);
        this.gameOverContainer = null;
      }
      this.gameOverShown = false;
    }

    /* stop updating if game over */
    if (getState("gameOver")) {
      if (!this.gameOverShown) this._showGameOverOverlay();
      return;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // UI helpers  (scene‑only)
  // ─────────────────────────────────────────────────────────────
  _initPointerHandlers() {
    /** Card waiting to attack (set on first click) */
    this.pendingAttacker = null;

    this.input.on("gameobjectup", (pointer, obj) => {
      /* ───  A.  FACE ZONES  ────────────────────── */
      if (obj?.isFace) {
        if (!this.pendingAttacker) return; // need attacker first

        const atkData = CARDS_BY_ID[this.pendingAttacker.cardId];
        const healSpell = atkData.type === "spell" && (atkData.heal ?? 0) > 0;
        const manaSpell =
          atkData.type === "spell" && (atkData.boostMana ?? 0) > 0;
        const offensive = !healSpell;

        if (obj.owner === "me") {
          // clicking my face
          if (!healSpell && !manaSpell) {
            this.ui.toast("You can only heal yourself");
            return;
          }
        } else {
          // clicking opponent face
          if (!offensive) {
            this.ui.toast("Cannot heal the enemy");
            return;
          }
        }

        myPlayer().setState("request", {
          attack: { src: this.pendingAttacker.uid, dst: "player" },
        });

        this.pendingAttacker.highlight(false);
        this.pendingAttacker = null;
        return;
      }

      /* ───  B.  CARD CLICKS  ───────────────────── */
      let card = obj;
      if (!(card && card.isCard)) {
        // child clicked? climb to container
        if (card?.parentContainer && card.parentContainer.isCard) {
          card = card.parentContainer;
        } else {
          return; // not a card – ignore
        }
      }

      /* First click → choose attacker */
      if (!this.pendingAttacker) {
        const myTurn = getState("turnPlayerId") === myPlayer().id;
        const onMySide = this.myBoard.contains(card);
        if (!myTurn || !onMySide) return;

        const acted = myPlayer().getState("hasAttacked") || {};
        if (acted[card.uid]) {
          this.ui.toast("This card already attacked.");
          return;
        }

        this.pendingAttacker = card;
        card.setAttackable(false);
        card.highlight(true);
        this.ui.toast("Choose a target");
        return;
      }

      /* Second click → pick target */
      const healSpell =
        CARDS_BY_ID[this.pendingAttacker.cardId].type === "spell" &&
        (CARDS_BY_ID[this.pendingAttacker.cardId].heal ?? 0) > 0;

      const targetIsMine = this.myBoard.contains(card);

      const boostSpell =
        CARDS_BY_ID[this.pendingAttacker.cardId].type === "spell" &&
        (CARDS_BY_ID[this.pendingAttacker.cardId].boostAttack ?? 0) > 0;

      if (targetIsMine && !healSpell && !boostSpell) {
        this.ui.toast("Cannot target your own card.");
        return;
      }
      if (!targetIsMine && (healSpell || boostSpell)) {
        this.ui.toast("This spell can only target friendly units.");
        return;
      }

      // if (!targetIsMine && healSpell) {
      //   this.ui.toast("Heal can only target friendly units.");
      //   return;
      // }

      myPlayer().setState("request", {
        attack: { src: this.pendingAttacker.uid, dst: card.uid },
      });

      this.pendingAttacker.highlight(false);
      this.pendingAttacker = null;
    });

    /* click on empty space → cancel */
    this.input.on("pointerdown", (p, objs) => {
      if (objs.length === 0 && this.pendingAttacker) {
        this.pendingAttacker.highlight(false);
        this.pendingAttacker = null;
        this.ui.toast("Attack cancelled");
      }
    });
  }

  _createUiElements() {
    // === My Deck UI ===
    const myDeckBoxWidth = CARD_WIDTH;
    const myDeckBoxHeight = CARD_HEIGHT;
    const myDeckX = DECK_X;
    const myDeckY = MY_HAND_Y - myDeckBoxHeight / 2;

    // Draw rectangle (visual deck)
    this.myDeckBg = this.add
      .rectangle(
        myDeckX,
        myDeckY,
        myDeckBoxWidth,
        myDeckBoxHeight,
        0x000000,
        0.5
      )
      .setOrigin(0, 0)
      .setDepth(4999);

    // ✅ Add red border around my deck
    this.myDeckBorder = this.add.graphics();
    this.myDeckBorder
      .lineStyle(3, 0xff0000, 1) // (thickness, color, alpha)
      .strokeRect(myDeckX, myDeckY, myDeckBoxWidth, myDeckBoxHeight)
      .setDepth(5001);

    // Deck counter text centered inside
    this.myDeckCounter = this.add
      .text(myDeckX + myDeckBoxWidth / 2, myDeckY + myDeckBoxHeight / 2, "0", {
        fontSize: 26,
        color: "#fff",
        fontFamily: "sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(5000);

    // === Opponent Deck UI ===
    const oppDeckBoxWidth = CARD_WIDTH;
    const oppDeckBoxHeight = CARD_HEIGHT;
    const oppDeckX = DECK_X;
    const oppDeckY = 20;

    this.oppDeckBg = this.add
      .rectangle(
        oppDeckX,
        oppDeckY,
        oppDeckBoxWidth,
        oppDeckBoxHeight,
        0x000000,
        0.5
      )
      .setOrigin(0, 0)
      .setDepth(4999);

    // ✅ Add red border around opponent deck
    this.oppDeckBorder = this.add.graphics();
    this.oppDeckBorder
      .lineStyle(3, 0xff0000, 1)
      .strokeRect(oppDeckX, oppDeckY, oppDeckBoxWidth, oppDeckBoxHeight)
      .setDepth(5001);

    // this.oppDeckCounter = this.add
    //   .text(
    //     oppDeckX + oppDeckBoxWidth / 2,
    //     oppDeckY + oppDeckBoxHeight / 2,
    //     "0",
    //     {
    //       fontSize: 20,
    //       color: "#fff",
    //       fontFamily: "sans-serif",
    //       fontStyle: "bold",
    //     }
    //   )
    //   .setOrigin(0.5)
    //   .setDepth(5000);
  }

  _createLogZone() {
    // Container & background
    this.logZone = this.add.container(20, this.scale.height - 150);
    this.logBg = this.add.rectangle(0, 0, 400, 120, 0x000000, 0.5).setOrigin(0);
    this.logZone.add(this.logBg);

    // ✅ Create inner container for actual logs
    this.logContent = this.add.container(0, 10);
    this.logZone.add(this.logContent);

    // ✅ Create a mask to limit visible area
    const shape = this.add
      .graphics()
      .fillRect(20, this.scale.height - 150, 400, 120)
      .setVisible(false);
    const mask = shape.createGeometryMask();
    this.logZone.setMask(mask);

    // Card details above logs
    this.cardDetailZone = this.add.container(20, this.scale.height - 280);
    this.cardDetailBg = this.add
      .rectangle(0, 0, 400, 100, 0x000000, 0.7)
      .setOrigin(0);
    this.cardDetailZone.add(this.cardDetailBg);
    this.cardDetailText = this.add
      .text(10, 10, "Hover a card to see details", {
        fontSize: 18,
        color: "#fff",
        wordWrap: { width: 380 },
      })
      .setOrigin(0, 0);
    this.cardDetailZone.add(this.cardDetailText);

    // Logs array
    this.logTexts = [];
    this.logMaxLines = 50; // store more logs now

    this.scrollOffset = 0;
    this.scrollStep = 20;

    // ✅ Add scroll wheel control
    this.input.on("wheel", (pointer, gameObjects, deltaX, deltaY) => {
      this.scrollOffset -= deltaY * 0.5; // smooth scrolling
      this._updateLogScroll();
    });

    this.addLog = (message) => {
      const text = this.add
        .text(10, 0, message, {
          fontSize: 16,
          color: "#fff",
          wordWrap: { width: 380 },
        })
        .setOrigin(0, 0);

      this.logTexts.push(text);
      this.logContent.add(text);

      this._repositionLogs();

      // ✅ Always scroll to bottom after adding
      const totalHeight = this.logTexts.reduce(
        (sum, t) => sum + t.height + 4,
        0
      );
      const visibleHeight = 120;
      const padding = 8;
      if (totalHeight > visibleHeight) {
        // Scroll to show the new message with padding
        this.scrollOffset = visibleHeight - totalHeight - padding;
        this._updateLogScroll();
      }
    };
  }

  // ✅ Reposition all logs
  _repositionLogs() {
    let currentY = 0;
    this.logTexts.forEach((t) => {
      t.setY(currentY);
      currentY += t.height + 4;
    });
  }

  // ✅ Apply scroll offset with limits
  _updateLogScroll() {
    if (this.logTexts.length === 0) return;

    const totalHeight = this.logTexts.reduce((sum, t) => sum + t.height + 4, 0);
    const visibleHeight = 120;
    const padding = 8; // Add some padding at the bottom

    // Calculate max scroll offset (negative value)
    const maxScroll = visibleHeight - totalHeight - padding;

    // Clamp the scroll offset
    this.scrollOffset = Math.min(0, Math.max(maxScroll, this.scrollOffset));

    this.logContent.y = 10 + this.scrollOffset;
  }

  _addAvatar(playerState) {
    const isMe = playerState.id === me().id;
    const startX = isMe ? LEFT_X : RIGHT_X;
    const startY = isMe ? BOTTOM_Y : TOP_Y;

    const profile = playerState.getProfile() ?? {};
    const name = profile.name || (isMe ? "You" : "Opponent");
    const ringColor = hexToInt(profile.color || "#ffffff");
    const photo = profile.photo || profile.avatar;
    const texKey = `avatar_${playerState.id}`;

    // --- placeholder circle we will swap later ---
    let sprite = this.add
      .circle(startX, startY, AVATAR_W / 2, 0x444444)
      .setOrigin(0.5);

    // circular mask geometry (reused after swap)
    const maskG = this.add.graphics();
    maskG.fillStyle(0xffffff, 1).fillCircle(startX, startY, AVATAR_W / 2);
    const mask = maskG.createGeometryMask();
    sprite.setMask(mask);

    // ring
    const ring = this.add.graphics();
    ring
      .lineStyle(4, ringColor, 1)
      .strokeCircle(startX, startY, AVATAR_W / 2 + 1);

    // name
    const labelY = isMe
      ? startY + AVATAR_H / 2 + 12
      : startY - AVATAR_H / 2 - 12;
    const nameText = this.add
      .text(startX, labelY, name, {
        fontSize: 16,
        color: "#ffffff",
        fontStyle: "bold",
        stroke: profile.color ? profile.color : "#000000",
        strokeThickness: profile.color ? 0 : 2,
      })
      .setOrigin(0.5, isMe ? 0 : 1);

    const bgPadX = 6,
      bgPadY = 2;
    const bounds = nameText.getBounds();
    const nameBg = this.add
      .rectangle(
        bounds.centerX,
        bounds.centerY,
        bounds.width + bgPadX * 2,
        bounds.height + bgPadY * 2,
        0x000000,
        0.45
      )
      .setOrigin(0.5);
    this.children.moveBelow(nameBg, nameText);

    // physics (optional)
    this.physics.add.existing(sprite);
    sprite.body.setCircle((AVATAR_W / 2) * (sprite.scaleX || 1));
    sprite.body.setCollideWorldBounds(true);

    const zone = makeFaceZone(this, sprite, isMe ? "me" : "opponent");

    const refreshFromProfile = (prof = {}) => {
      nameText.setText(prof.name || (isMe ? "You" : "Opponent"));

      const col = hexToInt(prof.color || "#ffffff");
      ring
        .clear()
        .lineStyle(4, col, 1)
        .strokeCircle(startX, startY, AVATAR_W / 2 + 1);

      if (prof.photo && prof.photo !== sprite.currentPhoto) {
        sprite.currentPhoto = prof.photo;
        loadBase64Texture(this, texKey, prof.photo)
          .then(() => sprite.setTexture(texKey))
          .catch(console.warn);
      }
    };

    // keep references
    const entry = {
      sprite,
      ring,
      maskG,
      mask,
      nameText,
      nameBg,
      state: playerState,
      mirror: !isMe,
      lastProfile: { ...profile },
      refresh: refreshFromProfile,
      destroy() {
        sprite.destroy();
        ring.destroy();
        maskG.destroy();
        nameText.destroy();
        nameBg.destroy();
      },
    };
    this.players.push(entry);

    // --- Load and swap in the real image asynchronously ---
    if (photo) {
      loadBase64Texture(this, texKey, photo)
        .then((texture) => {
          // create image sprite
          const img = this.add.image(startX, startY, texKey).setOrigin(0.5);
          // fit into box
          const src = texture.getSourceImage();
          const scale = Math.min(AVATAR_W / src.width, AVATAR_H / src.height);
          img.setScale(scale);
          img.setMask(mask);

          // replace placeholder in entry
          // keep depth similar to the old circle
          img.setDepth(entry.sprite.depth);
          entry.sprite.destroy();
          entry.sprite = img;

          // re-add physics if you need it on the new sprite
          this.physics.add.existing(img);
          img.body.setCircle((AVATAR_W / 2) * (img.scaleX || 1));
          img.body.setCollideWorldBounds(true);
        })
        .catch((err) => {
          console.warn("[Multiplayer] avatar load failed:", err);
        });
    } else {
      console.log("[Multiplayer] no photo provided for", playerState.id);
    }

    // cleanup on quit
    playerState.onQuit(() => {
      entry.destroy?.();
      this.players = this.players.filter((p) => p.state !== playerState);
      if (this.textures.exists(texKey)) this.textures.remove(texKey);
    });

    return { sprite, zone };
  }

  _createAllAvatars() {
    this.players.forEach((pEntry) => pEntry.destroy?.()); // safety if re‑joining
    this.players = [];
    const playersList = getParticipants();
    playersList.forEach((ps) => this._addAvatar(ps));
    // this.reqQueue.players.forEach((ps) => this._addAvatar(ps));
  }

  _dealOpeningHands() {
    this.reqQueue.players.forEach((p) => {
      const deck = this.deckMap.get(p.id);
      if (!deck) {
        console.warn("No deck found for player:", p.id);
        return;
      }

      const hand = [];
      for (let i = 0; i < START_HAND_SIZE; i++) {
        const card = deck.draw();
        if (card) hand.push(card.uid);
      }

      p.setState("hand", hand, true);
      p.setState("deckSizeSelf", deck.size(), true); // ✅ fixed
      p.setState("handReady", true, true);
      p.setState("hp", HEALTH_POINTS, true);
      p.setState("mana", STARTING_MANA, true);
      p.setState("maxMana", STARTING_MANA, true);
      p.setState("turnCount", 0, true);
    });

    this.time.delayedCall(100, () => this._updateDeckCounters(), [], this);

    setState("firstPlayerId", me().id, true);
    setState("turnPlayerId", me().id, true);

    const first = this.reqQueue.players.find((p) => p.id === me().id);
    if (first) this.turnMan.startTurn(first);

    setState("gameStarted", true, true);
  }

  _syncLogs() {
    const logs = getState("logs") || [];
    if (this._lastLogKey === JSON.stringify(logs)) return;
    this._lastLogKey = JSON.stringify(logs);

    this.logTexts.forEach((t) => t.destroy());
    this.logTexts = [];

    logs.slice(-this.logMaxLines).forEach((msg) => this.addLog(msg));
  }

  _syncHand() {
    const hand = myPlayer()?.getState("hand") || [];
    const key = hand.join(",");
    const canvas = this.game.canvas;
    if (key === this._lastHandKey) return;
    this._lastHandKey = key;

    this.myHand.clear(true, true);
    hand.forEach((uid, idx) => {
      const base = uid.split("#")[0];
      const card = new PlaceholderCard(
        this,
        base,
        this.screenMidX + idx * 110,
        MY_HAND_Y,
        uid
      );
      this.myHand.add(card);

      card.on("pointerover", () => {
        const baseId = card.uid.split("#")[0];
        const cardData = CARDS_BY_ID[baseId];
        if (cardData) this._updateCardDetails(cardData);
        canvas.classList.add("card-hover");
      });
      card.on("pointerup", () => {
        if (getState("turnPlayerId") !== myPlayer().id) {
          this.ui.toast("⏳ Wait for your turn!");
          this.ui.flashManaBar(); // optional little nudge
          return;
        }
        myPlayer().setState("request", { play: uid });
      });
      card.on("pointerout", () => {
        this.cardDetailText.setText("Hover a card to see details");
        canvas.classList.remove("card-hover");
      });
    });

    // check if deck is empty
    const deckEmpty = myPlayer()?.getState("deckEmpty");
    if (deckEmpty) {
      this.ui.toast("⚠️ Your deck is empty!");
    }
  }

  _syncBoards() {
    /* ---------- My Board ---------- */
    const meBoard = myPlayer()?.getState("board") || [];
    if (meBoard.join() !== this._lastMeBoardKey) {
      this._lastMeBoardKey = meBoard.join();
      this.myBoard.render(meBoard);
      this.myBoard.updateHpTexts(myPlayer().getState("boardState") || {});
      const canvas = this.game.canvas;
      // Attach hover events to my board cards
      this.myBoard.group.getChildren().forEach((card) => {
        if (!card || !card.isCard) return;
        const baseId = (card.uid || "").split("#")[0];
        card.setInteractive({ useHandCursor: false });
        card.on("pointerover", () => {
          const cardData = CARDS_BY_ID[baseId];
          if (cardData) this._updateCardDetails(cardData);
          canvas.classList.add("card-hover");
          console.log("pointerover", cardData, canvas.classList);
        });
        card.on("pointerout", () => {
          this.cardDetailText.setText("Hover a card to see details");
          canvas.classList.remove("card-hover");
          console.log("pointerout");
        });
      });
    }

    /* ---------- Opponent Board ---------- */
    if (this.oppState) {
      const oppBoard = this.oppState.getState("board") || [];
      if (oppBoard.join() !== this._lastOppBoardKey) {
        this._lastOppBoardKey = oppBoard.join();
        this.oppBoard.render(oppBoard);
        this.oppBoard.updateHpTexts(this.oppState.getState("boardState") || {});

        // Attach hover events to opponent board cards
        this.oppBoard.group.getChildren().forEach((card) => {
          if (!card || !card.isCard) return;
          const baseId = (card.uid || "").split("#")[0];
          card.setInteractive({ useHandCursor: false });
          card.on("pointerover", () => {
            const cardData = CARDS_BY_ID[baseId];
            if (cardData) this._updateCardDetails(cardData);
          });
          card.on("pointerout", () =>
            this.cardDetailText.setText("Hover a card to see details")
          );
        });
      }

      /* ---------- Opponent Hand ---------- */
      const oppHand = this.oppState.getState("hand") || [];
      if (oppHand.length !== this._oppHandSize) {
        this._oppHandSize = oppHand.length;
        this.oppHand.clear(true, true);
        oppHand.forEach((_, i) => {
          const back = new PlaceholderCard(
            this,
            "🌒",
            this.screenMidX + i * 85,
            OPP_HAND_Y
          );
          this.oppHand.add(back);
          // No hover for hidden cards
        });
      }
    }
  }

  _syncBars() {
    /* ---------- my bars ---------- */
    const hp = myPlayer()?.getState("hp") ?? 0;
    const mp = myPlayer()?.getState("mana") ?? 0;

    if (hp !== this._lastHp || mp !== this._lastMp) {
      this._lastHp = hp;
      this._lastMp = mp;

      // draw bars (returns positions)
      const hpPos = this.ui.drawHpBar(
        this.screenMidX - BAR_SHIFT_X,
        this.scale.height - 60,
        hp,
        HEALTH_POINTS,
        true
      );
      const mpPos = this.ui.drawManaBar(
        this.screenMidX - BAR_SHIFT_X,
        this.scale.height - 40,
        mp,
        MAX_MANA,
        true
      );

      // place / update labels *after* the bars, so they stay on top
      this.myHpTxt.setText(`HP ${hp}`).setPosition(hpPos.left - 8, hpPos.cy);
      this.myManaTxt
        .setText(`MANA ${mp} / ${MAX_MANA}`)
        .setPosition(mpPos.left - 8, mpPos.cy);
    }

    /* ---------- opponent bars ---------- */
    if (this.oppState) {
      const oh = this.oppState.getState("hp") ?? 0;
      const om = this.oppState.getState("mana") ?? 0;

      if (oh !== this._lastOppHp || om !== this._lastOppMp) {
        this._lastOppHp = oh;
        this._lastOppMp = om;

        const hpPos = this.ui.drawHpBar(
          this.screenMidX - BAR_SHIFT_X,
          10,
          oh,
          HEALTH_POINTS,
          false
        );
        const mpPos = this.ui.drawManaBar(
          this.screenMidX - BAR_SHIFT_X,
          30,
          om,
          MAX_MANA,
          false
        );

        this.oppHpTxt.setText(`HP ${oh}`).setPosition(hpPos.left - 8, hpPos.cy);
        this.oppManaTxt
          .setText(`MANA ${om} / ${MAX_MANA}`)
          .setPosition(mpPos.left - 8, mpPos.cy);
      }
    }
  }

  _syncBoardState() {
    /* ---------- mine ---------- */
    const myBS = myPlayer()?.getState("boardState") || {};
    const myStr = JSON.stringify(myBS);
    if (myStr !== this._lastMyBS) {
      this._lastMyBS = myStr;
      this.myBoard.updateHpTexts(myBS); // << redraw
    }

    /* ---------- opponent ---------- */
    if (this.oppState) {
      const oppBS = this.oppState.getState("boardState") || {};
      const oppStr = JSON.stringify(oppBS);
      if (oppStr !== this._lastOppBS) {
        this._lastOppBS = oppStr;
        this.oppBoard.updateHpTexts(oppBS);
      }
    }
  }

  _syncToasts() {
    const toastMsg = myPlayer()?.getState("toast");
    if (toastMsg) {
      this.ui.toast(toastMsg);
      myPlayer().setState("toast", null, true); // clear after showing
    }
  }

  _syncRejects() {
    const rej = myPlayer()?.getState("reject");
    if (!rej) return;

    if (rej.reason === "mana") {
      this.ui.toast("❌ Not enough mana to play that card!");
    }

    if (rej.reason === "firstTurn") {
      this.ui.toast("❌ You cannot attack on the first turn!");
    }

    if (rej.reason === "protectedFace") {
      this.ui.toast("❌ You cannot attack a protected face!");
    }

    if (rej.reason === "badTarget") {
      this.ui.toast("❌ You cannot attack this card!");
    }

    // clear reject after showing
    myPlayer()?.setState("reject", null);
  }

  _showGameOverOverlay() {
    if (this.gameOverShown) return;
    this.gameOverShown = true;

    const winnerId = getState("gameOver").winnerId;
    const msg = winnerId === myPlayer()?.id ? "YOU WIN!" : "YOU LOSE";

    const Z = 10_000;
    this.gameOverContainer = this.add.container(0, 0).setDepth(Z);

    // Backdrop
    const bg = this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        600,
        300,
        0x000000,
        0.8
      )
      .setOrigin(0.5);
    this.gameOverContainer.add(bg);

    // Message
    const text = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 40, msg, {
        fontSize: 72,
        color: "#fff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    this.gameOverContainer.add(text);

    // Restart Button
    const restartBtn = this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2 + 60,
        "🔄 Restart Game",
        {
          fontSize: 32,
          color: "#00ff00",
          backgroundColor: "#222",
          padding: { x: 20, y: 10 },
        }
      )
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    restartBtn.on("pointerup", () => {
      if (isHost()) this._resetGame();
      else this.ui.toast("Only host can restart the game.");
    });

    this.gameOverContainer.add(restartBtn);

    this.input.enabled = true; // allow clicking restart
  }

  _resetGame() {
    // 🔥 Broadcast reset flag so ALL clients clear their overlays
    setState("resetGame", Date.now(), true);

    // Clear game-specific states
    setState("gameOver", null, true);
    setState("logs", [], true);
    setState("turnPlayerId", null, true);
    setState("firstPlayerId", null, true);

    // Reset each player's state
    getParticipants().forEach((p) => {
      p.setState("hand", [], true);
      p.setState("board", [], true);
      p.setState("boardState", {}, true);
      p.setState("hp", HEALTH_POINTS, true);
      p.setState("mana", 1, true);
      p.setState("maxMana", 1, true);
      p.setState("turnCount", 0, true);
      p.setState("hasAttacked", {}, true);
      p.setState("handReady", false, true);
      p.setState("deckEmpty", false, true);
    });

    // Rebuild decks and deal new hands
    this.deckMap.clear();
    if (isHost()) {
      getParticipants().forEach((p) => {
        const deck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle();
        this.deckMap.set(p.id, deck);
        p.setState("deckSize", deck.size(), true);
      });
      this._dealOpeningHands();
    }

    // Remove old game over UI
    if (this.gameOverContainer) {
      this.gameOverContainer.destroy(true);
      this.gameOverContainer = null;
    }

    this.gameOverShown = false;
  }

  _updateDeckCounters() {
    // ✅ My deck
    // const myCardsLeft =
    //   myPlayer()?.getState("deckSizeSelf") ??
    //   (this.deckMap.get(myPlayer()?.id)?.size() || 0);
    const myCardsLeft =
      this.deckMap.get(myPlayer()?.id)?.size() ||
      myPlayer()?.getState("deckSizeSelf") ||
      0;

    this.myDeckCounter.setText(`${myCardsLeft}`);

    // ✅ Opponent deck
    if (this.oppState) {
      const oppCardsLeft =
        this.oppState.getState("deckSizeSelf") ??
        (this.deckMap.get(this.oppState.id)?.size() || 0);

      if (!this.oppDeckCounter) {
        this.oppDeckCounter = this.add
          .text(
            this.oppDeckBg.x + this.oppDeckBg.width / 2,
            this.oppDeckBg.y + this.oppDeckBg.height / 2,
            `${oppCardsLeft}`,
            {
              fontSize: 26,
              color: "#fff",
              fontFamily: "sans-serif",
              fontStyle: "bold",
            }
          )
          .setOrigin(0.5)
          .setDepth(5000);
      } else {
        this.oppDeckCounter.setText(`${oppCardsLeft}`);
      }
    }
  }

  _updateCardDetails(cardData) {
    this.cardDetailText.setText(
      `${cardData.name}\nType: ${cardData.type}\nCost: ${cardData.cost}\n` +
        (cardData.attack !== undefined ? `Attack: ${cardData.attack}\n` : "") +
        (cardData.health !== undefined ? `Health: ${cardData.health}\n` : "") +
        (cardData.damage !== undefined ? `Damage: ${cardData.damage}\n` : "") +
        (cardData.heal !== undefined ? `Heal: ${cardData.heal}\n` : "") +
        (cardData.description ? `\n${cardData.description}` : "")
    );
  }

  _playCardAnimation() {
    // ✅ Watch for animation events
    const anim = getState("animEvent");
    if (anim && anim !== this._lastAnimEvent) {
      this._lastAnimEvent = anim;

      if (anim.type === "cardPlayed") this._animateCardPlayed(anim);
      if (anim.type === "cardAttack") this._animateCardAttack(anim);

      // ✅ Clear it after triggering (only host or everyone can do this)
      setState("animEvent", null, true);
    }
  }

  _animateCardPlayed({ playerId, uid }) {
    console.log("_animateCardPlayed", playerId, uid);
    const isMe = playerId === myPlayer().id;
    const board = isMe ? this.myBoard : this.oppBoard;
    const card = board?.group?.getChildren()?.find((c) => c.uid === uid);
    if (!card) return;

    this.tweens.add({
      targets: card,
      scale: { from: 0.2, to: 1 },
      alpha: { from: 0, to: 1 },
      duration: 300,
      ease: "Back.Out",
    });
  }

  _animateCardAttack({ src, dst }) {
    console.log("_animateCardAttack", src, dst);
    const findCard = (uid) => {
      return (
        this.myBoard.group.getChildren().find((c) => c.uid === uid) ||
        this.oppBoard?.group.getChildren().find((c) => c.uid === uid)
      );
    };

    const attacker = findCard(src);
    const defender = dst !== "player" ? findCard(dst) : null;
    if (!attacker) return;

    const attackTween = {
      targets: attacker,
      x: defender ? defender.x : attacker.x,
      y: defender ? defender.y : attacker.y - 40,
      yoyo: true,
      duration: 250,
      ease: "Quad.Out",
    };
    this.tweens.add(attackTween);
  }
}
