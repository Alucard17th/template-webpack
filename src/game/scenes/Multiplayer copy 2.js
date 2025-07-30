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
const TOP_Y = 1080 - AVATAR_H;
const LEFT_X = 0 + AVATAR_W;
const RIGHT_X = 1920 - AVATAR_W;

const MANA_POINTS = 10;
const HEALTH_POINTS = 10;
const HP_BAR_W = 360;
const HP_BAR_H = 15;

const START_HAND_SIZE = 5;
const MY_START_HAND_Y_POSITION = 985;
const OPP_START_HAND_Y_POSITION = 80;
const HP_MANA_BAR_START_X_TUNER = 240;

const DECK_COPIES = 8;

const TURN_TEXT_Y = 1720;

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

  preload() {
    // load every card image
    CARDS.forEach((c) => {
      const key = c.frame; // e.g., "001_goblin"
      const url = `/assets/cards/${key}.png`; // served from /public
      if (!this.textures.exists(key)) {
        this.load.image(key, url);
      }
    });

    // this.load.once("complete", () => {
    //   console.log(
    //     "[preload] loaded card textures:",
    //     CARDS.map((c) => c.frame)
    //   );
    // });
  }

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

    this.createFaceZones();
    // 1. Handle players joining and quitting.
    onPlayerJoin((ps) => {
      this.addPlayer(ps); // keep your sprite code

      console.log(ps.state.profile);

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
    this.turnText = this.add.text(TURN_TEXT_Y, 550, "", {
      fontSize: 22,
      fontFamily: 'Georgia, "Goudy Bookletter 1911", Times, serif',
      align: "justify",
      color: "#fff",
    });

    const updateTurnUI = () => {
      const current = getState("turnPlayerId");
      if (!current) return;
      const mine = myPlayer()?.id;
      const myTurn = current === mine;

      this.turnText.setText(myTurn ? "Your Turn" : "Opponent Turn");
      this.endBtn.setVisible(myTurn);

      // quick clear of green outlines; update() will re-apply correct ones
      this.myBoard?.clearAttackable();
      this.oppBoard?.clearAttackable();
    };

    // run every 100 ms (cheap and simple)
    this.time.addEvent({ delay: 100, loop: true, callback: updateTurnUI });

    /* ─── END TURN BUTTON ───────────────────────────────────────── */
    this.endBtn = this.ui.createEndTurnButton(TURN_TEXT_Y + 50);

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
  }

  addPlayer(playerState) {
    const isMe = playerState.id === me().id;
    const startX = isMe ? LEFT_X : RIGHT_X - AVATAR_W / 2;
    const startY = isMe ? BOTTOM_Y : TOP_Y;

    const profile = playerState.state?.profile ?? {};
    const name = profile.name || (isMe ? "You" : "Opponent");
    const ringColor = hexToInt(profile.color || "#ffffff");
    const photo = profile.photo;
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
  }

  createFaceZones() {
    const w = this.scale.width;
    const padX = 80; // keep away from edges
    const zoneW = w - padX * 2;
    const zoneH = 140; // height of the clickable band

    const startX = LEFT_X;

    // Opponent face zone near the top
    const oppY = 60; // adjust to taste
    this.oppFaceZone = this.add
      .zone(startX, oppY, AVATAR_W * 1.8, AVATAR_H * 1.8)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.oppFaceZone.isFace = true;
    this.oppFaceZone.owner = "opponent";

    // Player face zone near the bottom (for self‑heal)
    const myY = this.scale.height - 100;
    this.myFaceZone = this.add
      .zone(w / 2, myY, zoneW, zoneH)
      .setOrigin(0.5)
      .setInteractive();
    this.myFaceZone.isFace = true;
    this.myFaceZone.owner = "me";

    // optional: very light debug outlines
    const g = this.add.graphics().setDepth(9999);
    g.lineStyle(1, 0xff0000, 0.4).strokeRectShape(this.oppFaceZone.getBounds());
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
        this.screenMiddle + idx * 110,
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
    if (getState("gameOver")) return;

    for (const p of this.roster) {
      const req = p.getState("request");
      if (!req) continue;

      /* ---- PLAY CARD ---- */
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
      if (req.attack) {
        const { src, dst } = req.attack; // uids or dst === "player"
        const turnOk = getState("turnPlayerId") === p.id;
        if (!turnOk) {
          console.log("[attack] rejected: not your turn");
          p.setState("request", null);
          continue;
        }

        const myBoard = p.getState("board") || [];
        const foe = this.roster.find((r) => r.id !== p.id);
        const foeBoard = foe.getState("board") || [];

        if (!myBoard.includes(src)) {
          console.log("[attack] rejected: src not on my board", src, myBoard);
          p.setState("request", null);
          continue;
        }

        /* ---------- one‑attack‑per‑turn gate ---------- */
        {
          const acted = p.getState("hasAttacked") || {};
          if (acted[src]) {
            p.setState("reject", { reason: "exhausted", src }, true);
            p.setState("request", null);
            continue;
          }
        }
        /* --------------------------------------------- */

        const srcBase = src.split("#")[0];
        const srcData = CARDS.find((c) => c.id === srcBase);
        if (!srcData) {
          console.log("[attack] rejected: unknown src card", srcBase);
          p.setState("request", null);
          continue;
        }

        const isCreature = srcData.type === "creature";
        const isHealSpell = srcData.type === "spell" && (srcData.heal ?? 0) > 0;
        const isDamageSpell =
          srcData.type === "spell" && (srcData.damage ?? 0) > 0;

        if (dst === "player") {
          if (isHealSpell) {
            // self-heal (attacker’s player)
            const hp = p.getState("hp") ?? 0;
            p.setState(
              "hp",
              Math.min(HEALTH_POINTS, hp + (srcData.heal ?? 0)),
              true
            );
          } else {
            // damage to opponent face ONLY if they have no creatures
            const foeBoard = foe.getState("board") || [];
            if (foeBoard.length > 0) {
              // reject: taunt-like rule — creatures present, face is protected
              p.setState("reject", { reason: "protectedFace" }, true);
              p.setState("request", null);
              continue;
            }
            const dmg = isCreature ? srcData.attack ?? 0 : srcData.damage ?? 0;
            const hp = foe.getState("hp") ?? 0;
            foe.setState("hp", Math.max(0, hp - dmg), true);
            this.time.delayedCall(0, () => this.checkGameOver());
          }

          // mark as used
          const acted = p.getState("hasAttacked") || {};
          acted[src] = true;
          p.setState("hasAttacked", acted, true);

          p.setState("request", null);
          continue;
        } else {
          const targetOnMySide = myBoard.includes(dst);
          const targetOnFoeSide = foeBoard.includes(dst);

          if (isHealSpell) {
            if (!targetOnMySide) {
              console.log("[attack] rejected: heal must target friendly", {
                dst,
                myBoard,
              });
              p.setState("request", null);
              continue;
            }
            console.log("[attack] HEAL → friendly unit", { src, dst });
            this.resolveSpellAttack(p, foe, src, dst, srcData);

            // mark as used
            const acted = p.getState("hasAttacked") || {};
            acted[src] = true;
            p.setState("hasAttacked", acted, true);

            p.setState("request", null);
            continue;
          }

          if (!targetOnFoeSide) {
            console.log("[attack] rejected: offensive must target enemy", {
              dst,
              foeBoard,
            });
            p.setState("request", null);
            continue;
          }

          console.log("[attack] src/dst", src, dst);
          if (isCreature) {
            const dstBase = dst.split("#")[0];
            const dstData = CARDS.find((c) => c.id === dstBase);
            this.applyCreatureDamage(src, dst, p, foe, srcData, dstData);
          } else if (isDamageSpell) {
            this.resolveSpellAttack(p, foe, src, dst, srcData);
          }

          // mark as used
          const acted = p.getState("hasAttacked") || {};
          acted[src] = true;
          p.setState("hasAttacked", acted, true);

          p.setState("request", null);
          continue;
        }
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

    const boardUids = pState.getState("board") || [];
    const reset = {};
    for (const uid of boardUids) reset[uid] = false;
    pState.setState("hasAttacked", reset, true);

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

    const myTurn = getState("turnPlayerId") === myPlayer().id;
    const actedMap = ps.getState("hasAttacked") || {};
    this.myBoard?.setAttackable(actedMap, myTurn);

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

      const oppActed = this.oppState.getState("hasAttacked") || {};
      const oppTurn = getState("turnPlayerId") === this.oppState.id;
      this.oppBoard?.setAttackable(oppActed, oppTurn);
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
        965,
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
        985,
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

    // --------------------------------------------------
    //  Show end‑of‑game overlay once, when it appears
    // --------------------------------------------------
    if (!this.gameOverShown && getState("gameOver")) {
      this.gameOverShown = true;

      const winnerId = getState("gameOver").winnerId;
      const iWon = winnerId === myPlayer().id;
      const msg = iWon ? "YOU WIN!" : "YOU LOSE";

      const overlay = this.add
        .rectangle(
          this.scale.width / 2,
          this.scale.height / 2,
          600,
          240,
          0x000000,
          0.8
        )
        .setOrigin(0.5)
        .setDepth(200000);

      const text = this.add
        .text(this.scale.width / 2, this.scale.height / 2, msg, {
          fontSize: 72,
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(200001);

      // optional: stop pointer events completely
      this.input.enabled = false;
    }

    if (getState("gameOver")) return;

    /* ---- REJECTS ---- */
    const rej = ps.getState("reject");
    if (rej) {
      if (rej.reason === "mana") {
        this.ui.flashManaBar(); // visual cue
        this.ui.toast("Not enough mana!");
        // this.shakeCardInHand(rej.card);
      } else if (rej.reason === "exhausted") {
        this.ui.toast("That card already attacked this turn.");
      } else if (rej.reason === "protectedFace") {
        this.ui.toast("You must clear enemy creatures before attacking face.");
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
      let card = obj;

      // Allow face zones
      if (obj?.isFace) {
        // if first click not chosen yet, ignore
        if (!this.pendingAttacker) return;

        const atkData = CARDS_BY_ID[this.pendingAttacker.cardId];
        const isHealSpell =
          atkData?.type === "spell" && (atkData.heal ?? 0) > 0;
        const isDamageOrCreature = !isHealSpell;

        if (obj.owner === "me") {
          // clicking my face: allow only HEAL spells
          if (!isHealSpell) {
            this.ui.toast("You can only heal your own player.");
            return;
          }
          this.sendAttackRequest(this.pendingAttacker.uid, "player");
          this.pendingAttacker.highlight(false);
          this.pendingAttacker = null;
          return;
        }

        if (obj.owner === "opponent") {
          // clicking opponent face
          if (!isDamageOrCreature) {
            this.ui.toast("Healing the enemy isn't allowed.");
            return;
          }
          // We *try* to hit face; host will enforce "no creatures on foe board"
          this.sendAttackRequest(this.pendingAttacker.uid, "player");
          this.pendingAttacker.highlight(false);
          this.pendingAttacker = null;
          return;
        }

        return;
      }

      // ----- existing card-selection logic -----
      if (!(card && card.isCard)) {
        if (card?.parentContainer && card.parentContainer.isCard) {
          card = card.parentContainer;
        } else {
          return;
        }
      }

      // FIRST CLICK
      if (!this.pendingAttacker) {
        const myTurn = getState("turnPlayerId") === myPlayer().id;
        const onMyBoard = this.myBoard?.contains(card);
        if (!myTurn || !onMyBoard) return;

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

      // SECOND CLICK on a card (your previous logic)
      const clickedMyBoard = this.myBoard?.contains(card);
      const atkBaseId = this.pendingAttacker.cardId;
      const atkData = CARDS_BY_ID[atkBaseId];
      const isCreature = atkData?.type === "creature";
      const isHealSpell = atkData?.type === "spell" && (atkData.heal ?? 0) > 0;

      if (clickedMyBoard) {
        if (isHealSpell) {
          this.sendAttackRequest(this.pendingAttacker.uid, card.uid);
          this.pendingAttacker.highlight(false);
          this.pendingAttacker = null;
          return;
        }
        this.ui.toast("Cannot target your own card.");
        return;
      }

      if (isHealSpell) {
        this.ui.toast("Heal can only target friendly units.");
        return;
      }

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
    console.log(
      "resolveSpellAttack()",
      atkPS,
      defPS,
      srcUid,
      dstUidOrPlayer,
      spellData
    );
    const board = atkPS.getState("board") || [];
    const atkBoardState = atkPS.getState("boardState") || {};
    const defBoardState = defPS.getState("boardState") || {};

    const damage = spellData.damage ?? 0;
    const heal = spellData.heal ?? 0;

    if (damage > 0) {
      if (dstUidOrPlayer === "player") {
        const hp = defPS.getState("hp") ?? 0;
        defPS.setState("hp", Math.max(0, hp - damage), true);
        this.checkGameOver();
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

          console.log("healing creature", dstUid, "from", cur, "to", newHp);
        }
      }
    }

    // one-shot spell is consumed
    const newBoard = board.filter((u) => u !== srcUid);
    atkPS.setState("board", newBoard, true);
  }

  checkGameOver() {
    if (!isHost()) return;

    // who is alive?
    const alive = this.roster.filter((p) => (p.getState("hp") ?? 0) > 0);

    if (alive.length === 1) {
      const winner = alive[0];
      setState("gameOver", { winnerId: winner.id }, true); // broadcast
      console.log("[GAME OVER] winner →", winner);
    }
  }
}
