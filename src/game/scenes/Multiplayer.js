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
import { on, off } from "../core/events.js";
import { getKeyword, Keyword } from "../core/KeywordRegistry.js";
import { createAllAvatars } from "./multiplayerAvatars.js";
import {
  createLogZone,
  repositionLogs,
  updateLogScroll,
  updateCardDetails,
} from "./multiplayerLogUi.js";
import { playCardAnimation } from "./multiplayerAnimations.js";
import {
  syncLogs,
  syncHand,
  syncBoards,
  syncBars,
  syncBoardState,
  syncToasts,
  syncRejects,
} from "./multiplayerSync.js";
import { showGameOverOverlay, resetGame } from "./multiplayerGameFlow.js";

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


export class Multiplayer extends Phaser.Scene {
  players = [];

  constructor() {
    super("Multiplayer");
  }

  // =============== CREATE ===================================================
  create() {
    this._setupReconnectKey();
    this._setupGraveyardUi();
    this._setupSceneUi();
    this._setupAmbientFx();
    this._setupCoreSystems();
    this._setupHostOnly();
    this._setupHostSnapshotSync();
    this._setupPlayerJoinHandling();
    this._setupHostTick();
    this._setupTurnUi();
    this._setupInputAndLogs();
    this._setupPeriodicDeckCounterSync();
  }

  _setupReconnectKey() {
    // A stable, per-browser identifier so the host can restore the correct seat after refresh.
    // IDs from Playroomkit can change on refresh; this one should not.
    try {
      // NOTE: localStorage is shared between tabs in the same Chrome profile.
      // If you test host+guest in two tabs, they would get the same key.
      // sessionStorage is per-tab and persists across refresh, which is what we want.
      const keyName = "ms_reconnectKey";
      let rk = window.sessionStorage.getItem(keyName);
      if (!rk) {
        rk = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        window.sessionStorage.setItem(keyName, rk);
      }
      myPlayer()?.setState("reconnectKey", rk, true);
    } catch {
      // ignore (privacy mode / blocked storage)
    }
  }

  _setupGraveyardUi() {
    this.graveyardCounter = this.add.text(50, 50, "", {
      fontSize: 18,
      color: "#ccc",
    });

    this.updateGraveyardCount = () => {
      const myGraveyard = myPlayer().getState("graveyard") || [];
      this.graveyardCounter.setText(`🪦 ${myGraveyard.length}`);
    };
  }

  _setupSceneUi() {
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

    this._bgDriftTween?.stop();
    this._bgDriftTween = this.tweens.add({
      targets: this.bg,
      x: this.scale.width / 2 + 14,
      y: this.scale.height / 2 + 10,
      duration: 5200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
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
  }

  _setupAmbientFx() {
    const ensureDustTex = () => {
      if (this.textures.exists("dustParticle")) return;
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 6);
      g.generateTexture("dustParticle", 12, 12);
      g.destroy();
    };

    const layout = () => {
      const w = this.scale.width;
      const h = this.scale.height;
      this._vignette?.clear();
      if (this._vignette) {
        this._vignette.fillStyle(0x000000, 0.14);
        this._vignette.fillRect(0, 0, w, 70);
        this._vignette.fillRect(0, h - 70, w, 70);
        this._vignette.fillStyle(0x000000, 0.12);
        this._vignette.fillRect(0, 0, 70, h);
        this._vignette.fillRect(w - 70, 0, 70, h);
      }

      if (this._bloom) {
        this._bloom.setPosition(w / 2, h / 2);
      }
    };

    this._vignette?.destroy();
    this._vignette = this.add.graphics().setDepth(-50).setScrollFactor(0);
    this._vignette.setBlendMode(Phaser.BlendModes.MULTIPLY);

    this._bloom?.destroy();
    this._bloom = this.add
      .circle(this.scale.width / 2, this.scale.height / 2, 340, 0xffffff, 0.06)
      .setDepth(-60)
      .setScrollFactor(0);
    this._bloom.setBlendMode(Phaser.BlendModes.ADD);

    this._bloomTween?.stop();
    this._bloomTween = this.tweens.add({
      targets: this._bloom,
      alpha: 0.09,
      duration: 3200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    ensureDustTex();
    this._dustEmitter?.manager?.destroy();
    this._dustParticles = this.add.particles(0, 0, "dustParticle", {
      x: { min: -40, max: this.scale.width + 40 },
      y: { min: -40, max: this.scale.height + 40 },
      lifespan: { min: 5200, max: 9200 },
      speedX: { min: -10, max: 10 },
      speedY: { min: -6, max: 6 },
      scale: { start: 0.10, end: 0 },
      alpha: { start: 0.10, end: 0 },
      quantity: 1,
      frequency: 140,
      blendMode: "ADD",
    });
    this._dustParticles.setDepth(-70).setScrollFactor(0);
    this._dustEmitter = this._dustParticles.emitters?.getAt?.(0) || null;

    layout();
    this.scale.on("resize", () => {
      layout();
      if (this._dustEmitter) {
        this._dustEmitter.setEmitZone({
          type: "random",
          source: new Phaser.Geom.Rectangle(
            -40,
            -40,
            this.scale.width + 80,
            this.scale.height + 80
          ),
        });
      }
    });
  }

  _setupCoreSystems() {
    /* 2. core helpers ────────────────────────────── */
    this.deckMap = new Map(); // playerId → Deck
    this.turnMan = new TurnManager(this, this.deckMap);
    this.reqQueue = new RequestQueue([], this.turnMan, CARDS_BY_ID, (msg) =>
      this.addLog(msg)
    );
  }

  _setupHostOnly() {
    /* 2.a host must create its own deck immediately */
    if (!isHost()) return;

    // If we're reloading into an already-started game, rebuild host-only runtime state.
    if (getState("gameStarted")) {
      this._restoreHostRuntimeFromSnapshot();
      return;
    }

    const self = myPlayer();
    const deck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle();
    this.deckMap.set(self.id, deck);
    self.setState("deckSize", deck.size(), true); // 5
    this.reqQueue.players.push(self);

    // guard against hot-reloads/scene re-entry registering twice
    if (!this._keywordsListenersBound) {
      on("minionPlayed", (ctx) =>
        getKeyword(Keyword.BATTLECRY)?.onMinionPlayed?.(ctx)
      );
      on("minionDied", (ctx) =>
        getKeyword(Keyword.DEATHRATTLE)?.onMinionDied?.(ctx)
      );
      on("turnStart", (ctx) => {
        getKeyword(Keyword.WINDFURY)?.onTurnStart?.(ctx);
        getKeyword(Keyword.START_OF_TURN)?.onTurnStart?.(ctx);
      });

      this._keywordsListenersBound = true;

      // Optional: clean up on scene shutdown to avoid leaks on remounts
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        off("minionPlayed");
        off("minionDied");
        off("turnStart");
        this._keywordsListenersBound = false;
      });
    }
  }

  _restoreHostRuntimeFromSnapshot() {
    const snap = getState("gameSnapshot");
    if (!snap?.seats?.length) return;

    // Rebuild deckMap from snapshot deck stacks
    this.deckMap.clear();
    for (const seat of snap.seats) {
      const stack = seat?.data?.deckStack;
      if (Array.isArray(stack)) {
        this.deckMap.set(seat.id, new Deck(stack));
      }
    }

    // Ensure request queue roster includes current participants.
    // (On refresh, onPlayerJoin may not fire for already-present participants.)
    const players = getParticipants().slice(0, 2);
    this.reqQueue.players = [...players];
  }

  _setupHostSnapshotSync() {
    if (!isHost()) return;

    // Periodically persist a lightweight snapshot so reconnecting clients can be restored.
    // This is intentionally redundant with per-player state; it protects against refresh/rejoin
    // where the player gets a new PlayerState id and would otherwise come back empty.
    this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => this._persistGameSnapshot(),
    });
  }

  _persistGameSnapshot() {
    if (!isHost()) return;
    if (!getState("gameStarted")) return;

    const prev = getState("gameSnapshot") || { seats: [] };
    const seats = [prev.seats?.[0] || null, prev.seats?.[1] || null];

    const isMeaningful = (p) => {
      const hand = p.getState("hand") || [];
      const board = p.getState("board") || [];
      const bs = p.getState("boardState") || {};
      const gy = p.getState("graveyard") || [];
      const handReady = p.getState("handReady");
      return (
        hand.length > 0 ||
        board.length > 0 ||
        Object.keys(bs).length > 0 ||
        gy.length > 0 ||
        handReady === true
      );
    };

    // Update snapshot by stable seatIndex, and never overwrite a seat with empty/default state.
    const assignments = getState("seatAssignments") || {};
    for (const p of getParticipants()) {
      const rk = p.getState("reconnectKey");
      const mapped = rk ? assignments[rk] : undefined;
      const si = p.getState("seatIndex");
      const seatIndex = si === 0 || si === 1 ? si : mapped;

      if (seatIndex !== 0 && seatIndex !== 1) continue;

      const shouldWrite = isMeaningful(p);
      if (!shouldWrite && seats[seatIndex]) continue;

      seats[seatIndex] = {
        id: p.id,
        data: {
          reconnectKey: rk || seats[seatIndex]?.data?.reconnectKey || null,
          seatIndex: seatIndex,
          // host-only: persist remaining deck stack so reconnecting player can keep drawing
          deckStack: this.deckMap.get(p.id)?.stack || seats[seatIndex]?.data?.deckStack || null,
          hand: p.getState("hand") || [],
          board: p.getState("board") || [],
          boardState: p.getState("boardState") || {},
          graveyard: p.getState("graveyard") || [],
          hp: p.getState("hp") ?? null,
          mana: p.getState("mana") ?? null,
          maxMana: p.getState("maxMana") ?? null,
          turnCount: p.getState("turnCount") ?? 0,
          hasAttacked: p.getState("hasAttacked") || {},
          handReady: p.getState("handReady") ?? false,
          deckEmpty: p.getState("deckEmpty") ?? false,
          deckSizeSelf: p.getState("deckSizeSelf") ?? null,
        },
      };
    }

    setState("gameSnapshot", { seats }, true);
  }

  _setupPlayerJoinHandling() {
    /* 3. player join ─────────────────────────────── */
    const handleJoin = (ps) => {
      // Always assign a stable seat to this participant first.
      if (isHost()) this._assignSeat(ps);

      // Host can restore a reconnecting client from a global snapshot.
      if (isHost() && getState("gameStarted")) {
        this._tryRestoreRejoiningPlayer(ps);
      }

      /* only host owns / mutates decks – but skip self (already done) */
      // NOTE: if game is already started, decks are restored from snapshot.
      // Creating a fresh deck here would overwrite the restored mapping.
      if (isHost() && !getState("gameStarted") && ps.id !== me().id) {
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

      if (
        isHost() &&
        !getState("gameStarted") &&
        added &&
        this.reqQueue.players.length === 2
      ) {
        this._dealOpeningHands();
        setState("logs", [], true); // clear old logs
      }
    };

    onPlayerJoin(handleJoin);

    // Bootstrap already-present participants (important after refresh).
    getParticipants().forEach(handleJoin);
  }

  _assignSeat(ps) {
    const rk = ps.getState("reconnectKey");
    if (!rk) {
      const k = `_seatRetry_${ps.id}`;
      const tries = this[k] ?? 0;
      if (tries >= 40) return;
      this[k] = tries + 1;
      this.time.delayedCall(150, () => this._assignSeat(ps));
      return;
    }

    const assignments = getState("seatAssignments") || {};
    let seatIndex = assignments[rk];

    if (seatIndex !== 0 && seatIndex !== 1) {
      const used = new Set(Object.values(assignments));
      seatIndex = used.has(0) ? 1 : 0;
      assignments[rk] = seatIndex;
      setState("seatAssignments", assignments, true);
    }

    if (ps.getState("seatIndex") !== seatIndex) {
      ps.setState("seatIndex", seatIndex, true);
    }
  }

  _tryRestoreRejoiningPlayer(ps) {
    const snap = getState("gameSnapshot");
    if (!snap?.seats?.length) return;

    const hand = ps.getState("hand") || [];
    const board = ps.getState("board") || [];
    const bs = ps.getState("boardState") || {};
    const gy = ps.getState("graveyard") || [];
    const handReady = ps.getState("handReady");

    // If the joining player already has meaningful game state, don't overwrite it.
    // (Do NOT use mana/hp as a signal, since 0 is a valid value and some clients may default it.)
    const hasAnyState =
      hand.length > 0 ||
      board.length > 0 ||
      Object.keys(bs).length > 0 ||
      gy.length > 0 ||
      handReady === true;
    if (hasAnyState) return;

    const psKey = ps.getState("reconnectKey") || null;
    const psSeatIndex = ps.getState("seatIndex");

    // On refresh, onPlayerJoin can fire before the reconnectKey state is visible to the host.
    // If we restore too early, we may pick the wrong seat (guest gets host hand).
    if (!psKey) {
      const k = `_restoreRetry_${ps.id}`;
      const tries = this[k] ?? 0;
      if (tries >= 40) return;
      this[k] = tries + 1;
      this.time.delayedCall(150, () => this._tryRestoreRejoiningPlayer(ps));
      return;
    }

    // Prefer seat match by seatIndex (works even if BOTH players refreshed and keys exist).
    let seat =
      (psSeatIndex === 0 || psSeatIndex === 1)
        ? snap.seats.find((s) => s?.data?.seatIndex === psSeatIndex)
        : null;

    // Fallback: match by reconnectKey
    if (!seat) {
      seat = snap.seats.find(
        (s) => s?.data?.reconnectKey && s.data.reconnectKey === psKey
      );
    }

    // Fallback heuristic only if the snapshot doesn't have reconnectKeys yet.
    if (!seat) {
      const snapshotHasKeys = snap.seats.some((s) => s?.data?.reconnectKey);
      if (snapshotHasKeys) return;

      const currentIds = new Set(getParticipants().map((p) => p.id));
      seat = snap.seats.find((s) => !currentIds.has(s.id)) || snap.seats[0];
    }
    if (!seat?.data) return;

    const oldId = seat.id;
    const d = seat.data;
    ps.setState("hand", d.hand || [], true);
    ps.setState("board", d.board || [], true);
    ps.setState("boardState", d.boardState || {}, true);
    ps.setState("graveyard", d.graveyard || [], true);

    if (d.hp != null) ps.setState("hp", d.hp, true);
    if (d.mana != null) ps.setState("mana", d.mana, true);
    if (d.maxMana != null) ps.setState("maxMana", d.maxMana, true);
    ps.setState("turnCount", d.turnCount ?? 0, true);
    ps.setState("hasAttacked", d.hasAttacked || {}, true);
    ps.setState("handReady", d.handReady ?? false, true);
    ps.setState("deckEmpty", d.deckEmpty ?? false, true);
    if (d.deckSizeSelf != null) ps.setState("deckSizeSelf", d.deckSizeSelf, true);

    // Restore host-only deck map under the new id so TurnManager draws keep working.
    if (d.deckStack && Array.isArray(d.deckStack)) {
      // Remove the old deck entry if it exists (refresh usually changes player id).
      if (oldId && oldId !== ps.id) this.deckMap.delete(oldId);

      // Deck objects are plain {id, uid} so they are safe to store/restore.
      const restoredDeck = new Deck(d.deckStack);
      this.deckMap.set(ps.id, restoredDeck);
      ps.setState("deckSize", restoredDeck.size(), true);
      ps.setState("deckSizeSelf", restoredDeck.size(), true);
    }

    // Replace old PlayerState reference in request queue roster so host processes the reconnecting player.
    if (oldId && oldId !== ps.id) {
      const idx = this.reqQueue.players.findIndex((p) => p.id === oldId);
      if (idx >= 0) this.reqQueue.players[idx] = ps;
    }

    // Update snapshot seat id to the new joining id (so future refreshes still work).
    seat.id = ps.id;
    // keep reconnectKey/seatIndex on seat as well
    if (psKey) seat.data.reconnectKey = psKey;
    if (psSeatIndex === 0 || psSeatIndex === 1) seat.data.seatIndex = psSeatIndex;
    setState("gameSnapshot", snap, true);
  }

  _setupHostTick() {
    /* 4. host tick ──────────────────────────────── */
    if (!isHost()) return;
    this.time.addEvent({
      delay: TICK_MS,
      loop: true,
      callback: () => this.reqQueue.process(),
    });
  }

  _setupTurnUi() {
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
  }

  _setupInputAndLogs() {
    this._initPointerHandlers();
    this._createLogZone();
    // 🔁 Check for animation broadcast
    this._lastAnimEvent = null;
  }

  _setupPeriodicDeckCounterSync() {
    // 🔄 Watch for deck size changes for all players
    this.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => this._updateDeckCounters(),
    });
  }

  // =============== UPDATE ===================================================
  update() {
    this._ensureAvatarsBuilt();
    this._syncFrame();
    this._handleResetFlag();

    /* stop updating if game over */
    if (this._handleGameOver()) return;
  }

  _ensureAvatarsBuilt() {
    if (!this._avatarsBuilt && getState("gameStarted")) {
      this._avatarsBuilt = true;
      this._createAllAvatars();
    }
  }

  _syncFrame() {
    this._syncLogs();
    this._syncHand();
    this._syncBoards();
    this._syncBars();
    this._syncBoardState();
    this._syncToasts();
    this._syncRejects();

    this._playCardAnimation();
    this.updateGraveyardCount();
  }

  _handleResetFlag() {
    const resetFlag = getState("resetGame");
    if (resetFlag && this._lastResetFlag !== resetFlag) {
      this._lastResetFlag = resetFlag;

      if (this.gameOverContainer) {
        this.gameOverContainer.destroy(true);
        this.gameOverContainer = null;
      }
      this.gameOverShown = false;
    }
  }

  _handleGameOver() {
    if (getState("gameOver")) {
      if (!this.gameOverShown) this._showGameOverOverlay();
      return true;
    }
    return false;
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
    createLogZone(this);
  }

  // ✅ Reposition all logs
  _repositionLogs() {
    repositionLogs(this);
  }

  // ✅ Apply scroll offset with limits
  _updateLogScroll() {
    updateLogScroll(this);
  }

  _createAllAvatars() {
    createAllAvatars(this, {
      leftX: LEFT_X,
      rightX: RIGHT_X,
      bottomY: BOTTOM_Y,
      topY: TOP_Y,
      avatarW: AVATAR_W,
      avatarH: AVATAR_H,
      faceZoneScale: FACE_ZONE_SCALE,
    });
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
      p.setState("mana", 0, true);
      p.setState("maxMana", 0, true);
      p.setState("turnCount", 0, true);
    });

    this.time.delayedCall(100, () => this._updateDeckCounters(), [], this);

    setState("firstPlayerId", me().id, true);
    setState("turnPlayerId", me().id, true);

    const first = this.reqQueue.players.find((p) => p.id === me().id);
    if (first) this.turnMan.startTurn(first);

    setState("gameStarted", true, true);

    // Force an immediate snapshot once the game is fully initialized.
    // This avoids a window where a quick refresh can happen before the periodic snapshot runs.
    if (isHost()) this._persistGameSnapshot();
  }

  _syncLogs() {
    syncLogs(this);
  }

  _syncHand() {
    syncHand(this);
  }

  _syncBoards() {
    syncBoards(this);
  }

  _syncBars() {
    syncBars(this, { barShiftX: BAR_SHIFT_X });
  }

  _syncBoardState() {
    syncBoardState(this);
  }

  _syncToasts() {
    syncToasts(this);
  }

  _syncRejects() {
    syncRejects(this);
  }

  _showGameOverOverlay() {
    showGameOverOverlay(this);
  }

  _resetGame() {
    resetGame(this);
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
    updateCardDetails(this, cardData);
  }

  _playCardAnimation() {
    playCardAnimation(this);
  }
}
