import Phaser from "phaser";
import {
  onPlayerJoin,
  isHost,
  myPlayer,
  me,
  setState,
  getState,
} from "playroomkit";
import { Deck } from "../../logic/Deck";
import { PlayerState } from "../../logic/PlayerState";
import { CARDS, CARDS_BY_ID } from "../../data/cards";
import { PlaceholderCard } from "../objects/PlaceholderCard";
import { Board } from "../objects/Board";
import { UI } from "../objects/UI";
import { buildDeck } from "../../helpers/deckUtils";

const AVATAR_W = 50;
const AVATAR_H = 50;
const BOTTOM_Y = 0 + AVATAR_H;
const TOP_Y = 768 - AVATAR_H;
const LEFT_X = 0 + AVATAR_W;
const RIGHT_X = 1024 - AVATAR_W;

const MANA_POINTS = 10;
const HEALTH_POINTS = 100;
const HP_BAR_W = 360;
const HP_BAR_H = 15;

const START_HAND_SIZE = 5;
const MY_START_HAND_Y_POSITION = 700;
const OPP_START_HAND_Y_POSITION = 80;
const HP_MANA_BAR_START_X_TUNER = 240;

const DECK_COPIES = 8;

export class Multiplayer extends Phaser.Scene {
  players = [];
  dealt = false;
  roster = [];
  lastMyHandStr = "";
  lastOppHandStr = "";
  lastMyBoardStr = "";
  lastOppBoardStr = "";
  lastMyBoardStateStr = "";
  lastOppBoardStateStr = "";

  create() {
    this.screenMiddle = (this.scale.width - HP_BAR_W) / 2;
    this.ui = new UI(this);
    this.myHand = this.add.group();
    this.oppHand = this.add.group();

    // this.myBoard = this.add.group();
    // this.oppBoard = this.add.group();

    this.myBoard = new Board(this, myPlayer()?.id, true, null);
    this.oppBoard = null; // Will be initialized when opponent joins

    this.logicById = new Map(); // id -> PlayerState (your local logic)
    this.deckById = new Map(); // id -> Deck

    this.lastMyMana = -1;
    this.lastOppMana = -1;

    // 1. Handle players joining and quitting.
    onPlayerJoin((ps) => {
      this.addPlayer(ps); // keep your sprite code

      if (ps.id !== me().id) {
        this.oppState = ps; // remember opponent
        this.oppBoard = new Board(this, ps.id, false, ps); // Initialize opponent board
        // create divider now if opp is already here
        this.ui.drawBoardsDivider(this.myBoard, this.oppBoard);
      }

      this.roster.push(ps);

      /* deal once both players present ------------------------------- */
      if (isHost() && !this.dealt && this.roster.length === 2) {
        this.dealOpeningHands(); // 🔥 real cards distributed here
      }
    });

    // 2. Pass player input to Playroom.
    this.input.on("pointerdown", (pointer) => {
      const dir = pointer.x < this.scale.width / 2 ? "left" : "right";
      myPlayer().setState("dir", { x: dir });
    });
    this.input.on("pointerup", () => myPlayer().setState("dir", undefined));

    /* ─── TURN TEXT ─────────────────────────────────────────────── */
    this.turnText = this.add.text(810, 550, "", {
      fontSize: 22,
      fontFamily: 'Georgia, "Goudy Bookletter 1911", Times, serif',
      align: "justify",
      color: "#fff",
    });

    const updateTurnUI = () => {
      const current = getState("turnPlayerId");
      if (!current) return;
      const mine = myPlayer()?.id;
      this.turnText.setText(current === mine ? "Your Turn" : "Opponent Turn");

      // toggle button visibility
      this.endBtn.setVisible(current === mine);
    };

    // run every 100 ms (cheap and simple)
    this.time.addEvent({ delay: 100, loop: true, callback: updateTurnUI });

    /* ─── END TURN BUTTON ───────────────────────────────────────── */
    this.endBtn = this.ui.createEndTurnButton();
    // this.endBtn = this.createEndTurnButton();
    // this.endBtn.setVisible(false); // hidden until it's your turn

    if (isHost()) {
      this.reqTimer = setInterval(this.processRequests, 50); // 20Hz
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        clearInterval(this.reqTimer);
      });
    }

    this.lastMyHp = -1;
    this.lastOppHp = -1;
    this.myHpText = this.add
      .text(0, 0, "", { fontSize: 18, color: "#fff" })
      .setOrigin(1, 0.5);
    this.myManaText = this.add
      .text(0, 0, "", { fontSize: 18, color: "#fff" })
      .setOrigin(1, 0.5);
    this.oppHpText = this.add
      .text(0, 0, "", { fontSize: 18, color: "#fff" })
      .setOrigin(1, 0.5);
    this.oppManaText = this.add
      .text(0, 0, "", { fontSize: 18, color: "#fff" })
      .setOrigin(1, 0.5);

    this.time.delayedCall(0, () => {
      console.log("[Multiplayer] calling initAttackSelection()");
      this.initAttackSelection();
    });
    // this.initAttackSelection();
  }

  addPlayer(playerState) {
    // pick row: me at bottom, others at top
    const isMe = playerState.id === me().id;
    const startX = isMe ? LEFT_X : RIGHT_X;
    const startY = isMe ? BOTTOM_Y : TOP_Y;
    const color = isMe ? 0xff0000 : 0x0000ff;

    const rect = this.add
      .rectangle(startX, startY, AVATAR_W, AVATAR_H, color)
      .setOrigin(0.5);

    this.physics.add.existing(rect);
    rect.body.setCollideWorldBounds(true);

    /* store a mirror flag so update() knows whether to flip X */
    this.players.push({
      sprite: rect,
      state: playerState,
      mirror: !isMe, // true for opponent row
    });

    /* cleanup on quit */
    playerState.onQuit(() => {
      rect.destroy();
      this.players = this.players.filter((p) => p.state !== playerState);
    });
  }

  dealOpeningHands() {
    if (this.dealt) return;

    // need TWO players
    if (this.roster.length < 2) {
      console.warn("Only one player in room, delaying dealOpeningHands()");
      return; // just wait — it will be called again when the 2nd joins
    }

    this.dealt = true;

    // identify host & guest PlayerState objects
    const hostPS = me();
    const guestPS = this.roster.find((p) => p.id !== hostPS.id);

    /* 1. shuffle & split */
    // const hostDeck = new Deck([...CARDS]).shuffle(); // copy, then shuffle
    // const guestDeck = new Deck([...CARDS]).shuffle(); // copy, then shuffle
    const hostDeck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle(); // 5 * DECK_COPIES = 40 cards
    const guestDeck = new Deck(buildDeck(CARDS, DECK_COPIES)).shuffle();

    /* 2. local logic */
    const hostLogic = new PlayerState(hostDeck);
    const guestLogic = new PlayerState(guestDeck);

    this.logicById.set(hostPS.id, hostLogic);
    this.logicById.set(guestPS.id, guestLogic);

    const opening = Math.min(
      START_HAND_SIZE,
      hostDeck.size(),
      guestDeck.size()
    );
    for (let i = 0; i < opening; i++) {
      // draw 5 each now
      hostLogic.startTurn();
      guestLogic.startTurn();
    }

    /* 3. publish */
    hostPS.setState(
      "hand",
      hostLogic.hand.map((c) => c.uid),
      true
    );
    guestPS.setState(
      "hand",
      guestLogic.hand.map((c) => c.uid),
      true
    );

    hostPS.setState("handReady", true, true);
    guestPS.setState("handReady", true, true);

    setState("turnPlayerId", hostPS.id, true);
    setState("phase", "main", true);

    hostPS.setState("hp", HEALTH_POINTS, true);
    guestPS.setState("hp", HEALTH_POINTS, true);

    hostPS.setState("mana", MANA_POINTS, true);
    guestPS.setState("mana", MANA_POINTS, true);

    hostPS.setState("maxMana", MANA_POINTS, true);
    guestPS.setState("maxMana", MANA_POINTS, true);
  }

  renderHand(ids) {
    console.log("[Multiplayer] renderHand()", ids);
    this.myHand.clear(true, true); // delete old

    ids.forEach((uid, idx) => {
      const baseId = uid.split("#")[0];
      const card = new PlaceholderCard(
        this,
        baseId,
        this.screenMiddle + idx * 85,
        MY_START_HAND_Y_POSITION,
        uid
      );
      this.myHand.add(card);

      card.on("pointerup", () => {
        // later: only allow if it's your turn, enough mana, etc.
        myPlayer().setState("request", { play: uid });
        console.log("requesting to play", uid);
      });
    });
  }

  renderOppHand(ids) {
    this.oppHand.clear(true, true);

    ids.forEach((_, idx) => {
      // Use PlaceholderCard but hide the ID to keep it secret
      const card = new PlaceholderCard(
        this,
        "🌒",
        this.screenMiddle + idx * 85,
        OPP_START_HAND_Y_POSITION
      );
      this.oppHand.add(card);
      // No pointer listeners – you can’t interact with opponent hand
    });
  }

  renderBoard(playerId, ids) {
    if (!playerId || !ids) return;
    if (playerId === myPlayer()?.id && this.myBoard) {
      this.myBoard.render(ids);
    } else if (
      this.oppState &&
      playerId === this.oppState.id &&
      this.oppBoard
    ) {
      this.oppBoard.render(ids);
    }
  }

  processRequests = () => {
    if (!isHost()) return;
    for (const p of this.roster) {
      const req = p.getState("request");
      if (!req) continue;

      /* ---- PLAY CARD ---- */
      // if (req.play) {
      //   const hand = p.getState("hand") || [];
      //   const board = p.getState("board") || [];
      //   const uid = req.play;
      //   const idx = hand.indexOf(req.play);
      //   const card = CARDS.find((c) => c.id === req.play);
      //   const cost = card?.cost ?? 0;
      //   const mana = p.getState("mana") ?? 0;

      //   if (getState("turnPlayerId") !== p.id) {
      //     p.setState("request", null);
      //     continue;
      //   }
      //   if (mana < cost) {
      //     p.setState("reject", { reason: "mana", card: req.play }, true);
      //     p.setState("request", null);
      //     continue;
      //   }

      //   p.setState("mana", mana - cost, true);

      //   if (idx !== -1) {
      //     hand.splice(idx, 1);
      //     board.push(req.play);
      //     p.setState("hand", hand, true);
      //     p.setState("board", board, true);

      //     const cardData = CARDS.find((c) => c.id === req.play);
      //     if (cardData?.type === "creature") {
      //       const bs = p.getState("boardState") || {};
      //       bs[req.play] = cardData.health; // initial HP
      //       p.setState("boardState", bs, true);
      //     }
      //   }

      //   p.setState("request", null);
      //   continue;
      // }

      if (req.play) {
        const hand = p.getState("hand") || [];
        const board = p.getState("board") || [];

        const uid = req.play; // now a uid like "005#17"
        const idx = hand.indexOf(uid);
        if (idx === -1) {
          p.setState("request", null);
          continue;
        }

        const baseId = uid.split("#")[0];
        const card = CARDS.find((c) => c.id === baseId);
        const cost = card?.cost ?? 0;
        const mana = p.getState("mana") ?? 0;

        if (getState("turnPlayerId") !== p.id) {
          p.setState("request", null);
          continue;
        }
        if (mana < cost) {
          p.setState("reject", { reason: "mana", card: uid }, true);
          p.setState("request", null);
          continue;
        }

        p.setState("mana", mana - cost, true);

        hand.splice(idx, 1);
        board.push(uid);

        p.setState("hand", hand, true);
        p.setState("board", board, true);

        if (card?.type === "creature") {
          const bs = p.getState("boardState") || {};
          bs[uid] = card.health; // key by uid
          p.setState("boardState", bs, true);
        }

        p.setState("request", null);
        continue;
      }

      /* ---- ATTACK ---- */
      // if (req.attack) {
      //   const { src, dst } = req.attack;

      //   // basic validation
      //   if (getState("turnPlayerId") !== p.id) {
      //     p.setState("request", null);
      //     continue;
      //   }

      //   const myBoard = p.getState("board") || [];
      //   if (!myBoard.includes(src)) {
      //     p.setState("request", null);
      //     continue;
      //   }

      //   const foe = this.roster.find((r) => r.id !== p.id);
      //   const foeBoard = foe.getState("board") || [];

      //   // check target exists
      //   if (dst !== "player" && !foeBoard.includes(dst)) {
      //     p.setState("request", null);
      //     continue;
      //   }

      //   /* ---------------------------------
      //    * apply damage
      //    * --------------------------------*/
      //   const srcCard = CARDS.find((c) => c.id === src);
      //   const dmg = srcCard.attack ?? 0;

      //   if (dst === "player") {
      //     const hp = foe.getState("hp") ?? 0;
      //     foe.setState("hp", Math.max(0, hp - dmg), true);
      //   } else {
      //     const dstCard = CARDS.find((c) => c.id === dst);
      //     // creature‑vs‑creature: deal damage both ways
      //     this.applyCreatureDamage(src, dst, p, foe, srcCard, dstCard);
      //   }

      //   p.setState("request", null);
      //   continue;
      // }

      if (req.attack) {
        const { src, dst } = req.attack; // both uids or dst === "player"

        if (getState("turnPlayerId") !== p.id) {
          p.setState("request", null);
          continue;
        }

        const myBoard = p.getState("board") || [];
        if (!myBoard.includes(src)) {
          p.setState("request", null);
          continue;
        }

        const foe = this.roster.find((r) => r.id !== p.id);
        const foeBoard = foe.getState("board") || [];
        if (dst !== "player" && !foeBoard.includes(dst)) {
          p.setState("request", null);
          continue;
        }

        const srcBase = src.split("#")[0];
        const srcData = CARDS.find((c) => c.id === srcBase);

        if (!srcData) {
          p.setState("request", null);
          continue;
        }

        if (srcData.type === "spell") {
          // resolve spell
          this.resolveSpellAttack(p, foe, src, dst, srcData);
        } else {
          // creature attack
          const dstBase = dst === "player" ? null : dst.split("#")[0];
          if (dst === "player") {
            const dmg = srcData.attack ?? 0;
            const hp = foe.getState("hp") ?? 0;
            foe.setState("hp", Math.max(0, hp - dmg), true);
          } else {
            const dstData = CARDS.find((c) => c.id === dstBase);
            this.applyCreatureDamage(src, dst, p, foe, srcData, dstData);
          }
        }

        p.setState("request", null);
        continue;
      }

      /* ---- END TURN ---- */
      if (req.endTurn) {
        p.setState("request", null);
        const current = getState("turnPlayerId");
        if (current !== p.id) continue;
        const next = this.roster.find((x) => x.id !== p.id);
        setState("turnPlayerId", next.id, true);
        this.startTurn(next);
      }
    }
  };

  startTurn = (pState) => {
    // 1) mana stuff
    const curMax = pState.getState("maxMana") ?? 0;
    const newMax = Math.min(curMax + 1, MANA_POINTS);
    pState.setState("maxMana", newMax, true);
    pState.setState("mana", newMax, true);

    // 2) draw one card
    const logic = this.logicById.get(pState.id);
    if (!logic) {
      console.warn("No logic for player", pState.id);
      return;
    }

    const drawn = logic.deck.draw();
    console.log("Drawn card", drawn);
    if (drawn) {
      const hand = pState.getState("hand") || [];
      if (hand.length < 5) {
        hand.push(drawn.uid);
        pState.setState("hand", hand, true);
      } else {
        // optional: burn the card or put it back
        console.log("Hand full, burned card", drawn.uid);
      }
    }
  };

  update() {
    const ps = myPlayer();
    if (!ps) return;

    const myHand = ps.getState("hand") || [];
    const hs = JSON.stringify(myHand);
    if (hs !== this.lastMyHandStr) {
      console.log("my hand changed");
      this.lastMyHandStr = hs;
      this.renderHand(myHand);
    }

    // if (ps.getState("handReady") && !this.handDrawn) {
    //   this.handDrawn = true;
    //   this.renderHand(ps.getState("hand"));
    // }

    if (this.oppState && this.oppState.getState("handReady")) {
      const oppHand = this.oppState.getState("hand") || [];
      const s = JSON.stringify(oppHand);
      if (s !== this.lastOppHandStr) {
        // hand size changed
        this.lastOppHandStr = s;
        if (oppHand.length === 0) return;
        this.renderOppHand(oppHand);
      }
    }

    if (this.oppState) {
      const oppBoard = this.oppState.getState("board") || [];
      const so = JSON.stringify(oppBoard);
      if (so !== this.lastOppBoardStr) {
        this.lastOppBoardStr = so;
        this.renderBoard(this.oppState.id, oppBoard);
      }
    }

    const myBoard = ps.getState("board") || [];
    const sm = JSON.stringify(myBoard);
    if (sm !== this.lastMyBoardStr) {
      this.lastMyBoardStr = sm;
      this.renderBoard(ps.id, myBoard);
    }

    // MY bars
    const myHp = ps.getState("hp") ?? 0;
    if (myHp !== this.lastMyHp) {
      this.lastMyHp = myHp;
      const hpPos = this.ui.drawHpBar(
        this.screenMiddle - HP_MANA_BAR_START_X_TUNER,
        700,
        myHp,
        HEALTH_POINTS,
        true
      );
      this.myHpText.setText(`HP ${myHp}`).setPosition(hpPos.left - 8, hpPos.cy);
    }

    // OPP bars
    if (this.oppState) {
      const oppHp = this.oppState.getState("hp") ?? 0;
      if (oppHp !== this.lastOppHp) {
        this.lastOppHp = oppHp;
        const hpPos = this.ui.drawHpBar(
          this.screenMiddle - HP_MANA_BAR_START_X_TUNER,
          60,
          oppHp,
          HEALTH_POINTS,
          false
        );
        this.oppHpText
          .setText(`HP ${oppHp}`)
          .setPosition(hpPos.left - 8, hpPos.cy);
      }
    }

    /* ---- MY MANA ---- */
    const myMana = ps.getState("mana") ?? 0;
    if (myMana !== this.lastMyMana) {
      this.lastMyMana = myMana;
      const mpPos = this.ui.drawManaBar(
        this.screenMiddle - HP_MANA_BAR_START_X_TUNER,
        720,
        myMana,
        MANA_POINTS,
        true
      );
      this.myManaText
        .setText(`MANA ${myMana}`)
        .setPosition(mpPos.left - 8, mpPos.cy);
    }

    /* ---- OPP MANA ---- */
    if (this.oppState) {
      const oppMana = this.oppState.getState("mana") ?? 0;
      if (oppMana !== this.lastOppMana) {
        this.lastOppMana = oppMana;
        const mpPos = this.ui.drawManaBar(
          this.screenMiddle - HP_MANA_BAR_START_X_TUNER,
          80,
          oppMana,
          MANA_POINTS,
          false
        );
        this.oppManaText
          .setText(`MANA ${oppMana}`)
          .setPosition(mpPos.left - 8, mpPos.cy);
      }
    }

    /* ---- REJECTS ---- */
    const rej = ps.getState("reject");
    if (rej) {
      if (rej.reason === "mana") {
        this.ui.flashManaBar(this.screenMiddle, 720); // visual cue
        this.ui.toast("Not enough mana!");
        // this.shakeCardInHand(rej.card);
      }
      ps.setState("reject", null); // clear it
    }

    // ---- BOARD STATE (HP) CHANGES ----
    const myBS = ps.getState("boardState") || {};
    const myBSS = JSON.stringify(myBS);
    if (myBSS !== this.lastMyBoardStateStr) {
      this.lastMyBoardStateStr = myBSS;
      // this.updateHpTexts(this.myBoard, myBS, true); // true = it's me
      this.myBoard.updateHpTexts(myBS);
    }

    if (this.oppState) {
      const oppBS = this.oppState.getState("boardState") || {};
      const oppBSS = JSON.stringify(oppBS);
      if (oppBSS !== this.lastOppBoardStateStr) {
        this.lastOppBoardStateStr = oppBSS;
        // this.updateHpTexts(this.oppBoard, oppBS, false);
        this.oppBoard.updateHpTexts(oppBS);
      }
    }
  }

  /** -----------------------------------------------------------------
   *  Two–click attack selection
   *    1. click one of *your* creatures  → marks it as the attacker
   *    2. click an enemy creature/player → sends the attack request
   * ----------------------------------------------------------------*/
  initAttackSelection() {
    console.log("[Multiplayer] initAttackSelection() entered");
    /** Card that was chosen as the attacker (or null) */
    this.pendingAttacker = null;

    this.input.on("gameobjectup", (pointer, obj) => {
      // Accept either the container or a child promoted via input; climb to parent with isCard if needed
      let card = obj;
      if (!(card && card.isCard)) {
        // if a child was clicked, try its parent container
        if (card?.parentContainer && card.parentContainer.isCard) {
          card = card.parentContainer;
        } else {
          return;
        }
      }

      /* -------------------- FIRST CLICK -------------------- */
      if (!this.pendingAttacker) {
        const myTurn = getState("turnPlayerId") === myPlayer().id;
        const onMyBoard = this.myBoard?.contains(card);
        // logs to verify path
        console.log("[click-first]", { myTurn, onMyBoard, card: card.cardId });

        if (!myTurn || !onMyBoard) return;

        this.pendingAttacker = card;
        card.highlight(true);
        this.ui.toast("Choose a target");
        return;
      }

      /* ------------------- SECOND CLICK -------------------- */
      const clickedMyBoard = this.myBoard?.contains(card);
      const atkBaseId = this.pendingAttacker.cardId; // base id
      const atkData = CARDS_BY_ID[atkBaseId];
      const isCreature = atkData?.type === "creature";
      const isHealSpell = atkData?.type === "spell" && (atkData.heal ?? 0) > 0;
      const isDamageSpell =
        atkData?.type === "spell" && (atkData.damage ?? 0) > 0;

      console.log("[click-second]", {
        clickedMyBoard,
        atkBaseId,
        isHealSpell,
        isDamageSpell,
      });

      if (clickedMyBoard) {
        // You clicked your own side
        if (isHealSpell) {
          // ✅ allowed: heal friendly creature (or later: 'player')
          this.sendAttackRequest(this.pendingAttacker.uid, card.uid);
          this.pendingAttacker.highlight(false);
          this.pendingAttacker = null;
          return;
        }
        // creatures & damage spells cannot target friendly board
        this.ui.toast("Cannot target your own card.");
        return;
      }

      // You clicked opponent side
      if (isHealSpell) {
        this.ui.toast("Heal can only target friendly units.");
        return;
      }

      // creatures and damage spells can hit enemy units
      this.sendAttackRequest(this.pendingAttacker.uid, card.uid ?? "player");
      this.pendingAttacker.highlight(false);
      this.pendingAttacker = null;
    });
    /* -------- Click on empty space  →  cancel selection ------ */
    this.input.on(
      "pointerdown",
      (pointer, objs) => {
        if (objs.length === 0 && this.pendingAttacker) {
          this.pendingAttacker.highlight(false);
          this.pendingAttacker = null;
          this.ui.toast("Attack cancelled");
        }
      },
      this
    );
  }

  sendAttackRequest(srcId, dstId) {
    console.log("ATTACK →", srcId, "→", dstId);
    myPlayer().setState("request", {
      attack: { src: srcId, dst: dstId }, // dst == "player" for face‑hit
    });
  }

  applyCreatureDamage(srcUid, dstUid, atkPS, defPS, srcData, dstData) {
    const atkBoard = atkPS.getState("boardState") || {};
    const defBoard = defPS.getState("boardState") || {};

    const newDstHp =
      (defBoard[dstUid] ?? dstData.health) - (srcData.attack ?? 0);
    const newSrcHp =
      (atkBoard[srcUid] ?? srcData.health) - (dstData.attack ?? 0);

    if (newDstHp <= 0) {
      const arr = defPS.getState("board") || [];
      defPS.setState(
        "board",
        arr.filter((uid) => uid !== dstUid),
        true
      );
      delete defBoard[dstUid];
    } else {
      defBoard[dstUid] = newDstHp;
    }

    if (newSrcHp <= 0) {
      const arr = atkPS.getState("board") || [];
      atkPS.setState(
        "board",
        arr.filter((uid) => uid !== srcUid),
        true
      );
      delete atkBoard[srcUid];
    } else {
      atkBoard[srcUid] = newSrcHp;
    }

    atkPS.setState("boardState", atkBoard, true);
    defPS.setState("boardState", defBoard, true);
  }

  resolveSpellAttack(atkPS, defPS, srcUid, dstUidOrPlayer, spellData) {
    const board = atkPS.getState("board") || [];
    const atkBoardState = atkPS.getState("boardState") || {};
    const defBoardState = defPS.getState("boardState") || {};

    const damage = spellData.damage ?? 0;
    const heal = spellData.heal ?? 0;

    if (damage > 0) {
      if (dstUidOrPlayer === "player") {
        const hp = defPS.getState("hp") ?? 0;
        defPS.setState("hp", Math.max(0, hp - damage), true);
      } else {
        const dstUid = dstUidOrPlayer;
        const dstBase = dstUid.split("#")[0];
        const dstData = CARDS.find((c) => c.id === dstBase);

        if (dstData?.type === "creature") {
          const newHp = (defBoardState[dstUid] ?? dstData.health) - damage;
          if (newHp <= 0) {
            const arr = defPS.getState("board") || [];
            defPS.setState(
              "board",
              arr.filter((u) => u !== dstUid),
              true
            );
            delete defBoardState[dstUid];
          } else {
            defBoardState[dstUid] = newHp;
          }
          defPS.setState("boardState", defBoardState, true);
        } else {
          // spell targeting a spell: usually no effect — decide your rule
        }
      }
    }

    if (heal > 0) {
      // heal self or ally. Pick a rule; here's: heal your own target if uid, else heal player
      if (dstUidOrPlayer === "player") {
        const hp = atkPS.getState("hp") ?? 0;
        atkPS.setState("hp", Math.min(HEALTH_POINTS, hp + heal), true);
      } else {
        const dstUid = dstUidOrPlayer;
        const dstBase = dstUid.split("#")[0];
        const dstData = CARDS.find((c) => c.id === dstBase);
        if (dstData?.type === "creature") {
          const cur = atkBoardState[dstUid] ?? dstData.health;
          const newHp = Math.min(dstData.health, cur + heal);
          atkBoardState[dstUid] = newHp;
          atkPS.setState("boardState", atkBoardState, true);
        }
      }
    }

    // one-shot spell is consumed
    const newBoard = board.filter((u) => u !== srcUid);
    atkPS.setState("board", newBoard, true);
  }
}
