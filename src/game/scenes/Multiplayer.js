/*********************************************************************
 *  Multiplayer.js  –  Phaser scene (presentation only)
 *    ─ loads textures
 *    ─ draws hands / boards / UI
 *    ─ forwards “request” objects to the RequestQueue ⬅️  (THE brain)
 *********************************************************************/

import Phaser, { AUTO, Game } from "phaser";
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
import { buildDeck } from "../../helpers/deckUtils.js";
import { Deck } from "../../logic/Deck.js";

import { UI } from "../objects/UI.js";
import { Board } from "../objects/Board.js";
import { PlaceholderCard } from "../objects/PlaceholderCard.js";

import {
  START_HAND_SIZE,
  DECK_COPIES,
  MAX_MANA,
  HEALTH_POINTS,
  TICK_MS,
} from "../core/constants.js";

import { TurnManager } from "../core/TurnManager.js";
import { RequestQueue } from "../core/RequestQueue.js";

// ─────────────────────────────────────────────────────────────
// Cosmetic constants (scene‑only — not needed by core logic)
// ─────────────────────────────────────────────────────────────
const WIDTH = 1920;
const HEIGHT = 1080;

const MY_HAND_Y = 985;
const OPP_HAND_Y = 80;
const BAR_SHIFT_X = 240;

const AVATAR_W = 50;
const AVATAR_H = 50;
const BOTTOM_Y = HEIGHT - AVATAR_H - 30;
const TOP_Y = AVATAR_H + 20;
const LEFT_X = WIDTH / 3 - 250;
const RIGHT_X = WIDTH / 3 - 250;
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
const FACE_ZONE_SCALE = 1.8; //  ➟  how wide the hit‑box is vs avatar
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

  // =============== PRELOAD ==================================================
  preload() {
    CARDS.forEach((c) => {
      const key = c.frame;
      const url = `/assets/cards/${key}.png`;
      if (!this.textures.exists(key)) this.load.image(key, url);
    });
  }

  // =============== CREATE ===================================================
  create() {
    /* ------------------------------------------------\
     | 1.  Basic UI scaffolding                        |
    \* ------------------------------------------------*/
    this.ui = new UI(this);
    this.myHand = this.add.group();
    this.oppHand = this.add.group();
    this.myBoard = new Board(this, myPlayer()?.id, true);
    this.oppBoard = null; // when opponent joins

    // text style once – adjust to taste
    const statStyle = { fontSize: 18, color: "#fff", fontFamily: "sans-serif" };

    // my side
    this.myHpTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9_000);
    this.myManaTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9_000);

    // opponent
    this.oppHpTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9_000);
    this.oppManaTxt = this.add
      .text(0, 0, "", statStyle)
      .setOrigin(1, 0.5)
      .setDepth(9_000);

    this.screenMidX = (this.scale.width - 360) / 2;

    /* ------------------------------------------------\
     | 2.  Prepare core helpers                        |
    \* ------------------------------------------------*/
    this.deckMap = new Map(); // playerId → Deck
    this.turnMan = new TurnManager(this.deckMap);
    this.reqQueue = new RequestQueue(
      [], // roster will be filled later
      this.turnMan,
      CARDS_BY_ID,
      (msg) => this.addLog(msg)
    );

    /* ------------------------------------------------\
     | 3.  Player join                                 |
    \* ------------------------------------------------*/
    onPlayerJoin((ps) => {
      // build a shuffled deck for *each* new player
      const deck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle();
      this.deckMap.set(ps.id, deck);

      // first one to join becomes host’s opponent etc.
      if (ps.id !== me().id) {
        this.oppState = ps;
        this.oppBoard = new Board(this, ps.id, false, ps);
        this.ui.drawBoardsDivider(this.myBoard, this.oppBoard);
      }

      this.reqQueue.players.push(ps); // register into RequestQueue roster

      // once both present, host deals starting hands
      if (isHost() && this.reqQueue.players.length === 2) {
        this._dealOpeningHands();
        setState("logs", [], true); // clear old logs
      }
    });

    /* ------------------------------------------------\
     | 4.  Host‑only tick to process rules             |
    \* ------------------------------------------------*/
    if (isHost()) {
      this.time.addEvent({
        delay: TICK_MS,
        loop: true,
        callback: () => this.reqQueue.process(),
      });
    }

    /* ------------------------------------------------\
     | 5.  End‑turn button + turn‑indicator            |
    \* ------------------------------------------------*/
    this.endBtn = this.ui.createEndTurnButton();
    // Get the button's center
    const btnBounds = this.endBtn.getBounds();
    const x = btnBounds.centerX;
    const y = btnBounds.top - 10; // 10px above the button

    this.turnText = this.add
      .text(x, y, "", {
        fontSize: 22,
        color: "#fff",
      })
      .setOrigin(0.5, 1); // Center horizontally, align bottom to the y position

    // 🔄 Update position on resize
    this.scale.on("resize", () => {
      const bounds = this.endBtn.getBounds();
      const newX = bounds.centerX;
      const newY = bounds.top - 10;
      this.turnText.setPosition(newX, newY);
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
    this._syncRejects();

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
        const offensive = !healSpell;

        if (obj.owner === "me") {
          // clicking my face
          if (!healSpell) {
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

      if (targetIsMine && !healSpell) {
        this.ui.toast("Cannot target your own card.");
        return;
      }
      if (!targetIsMine && healSpell) {
        this.ui.toast("Heal can only target friendly units.");
        return;
      }

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

  _createLogZone() {
    this.logZone = this.add.container(20, this.scale.height - 150); // bottom-left
    this.logBg = this.add.rectangle(0, 0, 400, 120, 0x000000, 0.5).setOrigin(0);
    this.logZone.add(this.logBg);

    this.logTexts = [];
    this.logMaxLines = 6; // number of visible log entries

    this.addLog = (message) => {
      const text = this.add
        .text(10, 0, message, {
          fontSize: 16,
          color: "#fff",
          wordWrap: { width: 380 },
        })
        .setOrigin(0, 0);

      // Push to array and position lines
      this.logTexts.push(text);
      this.logZone.add(text);

      // Shift up if exceeding max lines
      if (this.logTexts.length > this.logMaxLines) {
        const old = this.logTexts.shift();
        old.destroy();
      }

      // Update Y positions for all lines
      this.logTexts.forEach((t, i) => t.setY(10 + i * 18));
    };
  }

  _addAvatar(playerState) {
    const isMe = playerState.id === me().id;
    const startX = isMe ? LEFT_X : RIGHT_X;
    const startY = isMe ? BOTTOM_Y : TOP_Y;

    const profile = playerState.getProfile() ?? {};
    console.log("[Multiplayer] _addAvatar()", playerState, profile);
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
      console.log("[Multiplayer] refreshFromProfile()", prof);
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

          console.log(
            "[Multiplayer] avatar image ready:",
            texKey,
            src.width,
            src.height
          );
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
    console.log("[Multiplayer] _createAllAvatars()", playersList);
    this.reqQueue.players.forEach((ps) => this._addAvatar(ps));
  }

  _dealOpeningHands() {
    // host draws START_HAND_SIZE cards for each player
    this.reqQueue.players.forEach((p) => {
      const deck = this.deckMap.get(p.id);
      const hand = [];
      for (let i = 0; i < START_HAND_SIZE; i++) {
        const card = deck.draw();
        if (card) hand.push(card.uid);
      }
      p.setState("hand", hand, true);
      p.setState("handReady", true, true);
      p.setState("hp", HEALTH_POINTS, true);
      p.setState("mana", MAX_MANA, true);
      p.setState("maxMana", MAX_MANA, true);
      p.setState("turnCount", 1, true); // ✅ initialize turn counter
    });

    // pick first player
    setState("firstPlayerId", me().id, true);
    // host starts
    setState("turnPlayerId", me().id, true);
    // start game
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
      card.on("pointerup", () =>
        myPlayer()?.setState("request", { play: uid })
      );
    });
  }

  _syncBoards() {
    // own board
    const meBoard = myPlayer()?.getState("board") || [];
    if (meBoard.join() !== this._lastMeBoardKey) {
      this._lastMeBoardKey = meBoard.join();
      this.myBoard.render(meBoard);
    }

    // opponent board / hand
    if (this.oppState) {
      const oppBoard = this.oppState.getState("board") || [];
      if (oppBoard.join() !== this._lastOppBoardKey) {
        this._lastOppBoardKey = oppBoard.join();
        this.oppBoard.render(oppBoard);
      }

      const oppHand = this.oppState.getState("hand") || [];
      if (oppHand.length !== this._oppHandSize) {
        this._oppHandSize = oppHand.length;
        // Draw backs only – hide type
        this.oppHand.clear(true, true);
        oppHand.forEach((_, i) =>
          this.oppHand.add(
            new PlaceholderCard(
              this,
              "🌒",
              this.screenMidX + i * 85,
              OPP_HAND_Y
            )
          )
        );
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
        965,
        hp,
        HEALTH_POINTS,
        true
      );
      const mpPos = this.ui.drawManaBar(
        this.screenMidX - BAR_SHIFT_X,
        985,
        mp,
        MAX_MANA,
        true
      );

      // place / update labels *after* the bars, so they stay on top
      this.myHpTxt.setText(`HP ${hp}`).setPosition(hpPos.left - 8, hpPos.cy);
      this.myManaTxt
        .setText(`MANA ${mp}`)
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
          60,
          oh,
          HEALTH_POINTS,
          false
        );
        const mpPos = this.ui.drawManaBar(
          this.screenMidX - BAR_SHIFT_X,
          80,
          om,
          MAX_MANA,
          false
        );

        this.oppHpTxt.setText(`HP ${oh}`).setPosition(hpPos.left - 8, hpPos.cy);
        this.oppManaTxt
          .setText(`MANA ${om}`)
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

  _syncRejects() {
    const rej = myPlayer()?.getState("reject");
    if (!rej) return;

    if (rej.reason === "mana") {
      this.ui.toast("❌ Not enough mana to play that card!");
    }

    if (rej.reason === "firstTurn") {
      this.ui.toast("❌ You cannot attack on the first turn!");
    }

    // clear reject after showing
    myPlayer()?.setState("reject", null);
  }

  _showGameOverOverlay() {
    // do this only once
    if (this.gameOverShown) return;
    this.gameOverShown = true;

    const winnerId = getState("gameOver").winnerId;
    const msg = winnerId === myPlayer()?.id ? "YOU WIN!" : "YOU LOSE";

    // choose one large number and reuse it for every overlay child
    const Z = 10_000; // safely above everything in this scene

    // --- black translucent backdrop ---
    this.add
      .rectangle(
        this.scale.width / 2,
        this.scale.height / 2,
        600,
        240,
        0x000000,
        0.8
      )
      .setOrigin(0.5)
      .setDepth(Z);

    // --- text ---
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, msg, {
        fontSize: 72,
        color: "#fff",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(Z + 1); // a tiny bit above the backdrop

    // optional: block further clicks
    this.input.enabled = false;
  }
}
