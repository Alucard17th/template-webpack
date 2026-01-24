import { MAX_MANA, HEALTH_POINTS } from "./constants.js";
import { applyCreatureDamage, resolveSpell } from "./Combat.js";
import { TurnManager } from "./TurnManager.js";
import { getState, setState } from "playroomkit";
import { emit } from "../core/events.js";
import { getLegalMinionTargets, defenderHasAnyCreature } from "./targeting.js";
/**
 * Central authority that **hosts** run every TICK_MS.
 *   scene code should just forward `player.getState('request')` here.
 */
export class RequestQueue {
  /**
   * @param {Array<PlayerState>} players       -> the current roster
   * @param {TurnManager}        turnManager   -> injected dependency
   * @param {Object}             CARDS_BY_ID   -> lookup table
   */
  constructor(players, turnManager, CARDS_BY_ID, logFn) {
    this.players = players;
    this.turnManager = turnManager;
    this.CARDS_BY_ID = CARDS_BY_ID;
    this.logFn = logFn;
  }

  log(message) {
    if (typeof this.logFn === "function") this.logFn(message);

    // ✅ broadcast log entry to everyone
    const logs = getState("logs") || [];
    logs.push(message);
    setState("logs", logs.slice(-20), true); // keep last 20
  }

  /** Call once per tick on the host. */
  process() {
    // Early‑out if a winner is already declared (the scene should set gameOver flag)
    if (this._gameIsOver()) return;

    for (const p of this.players) {
      const req = p.getState("request");
      if (!req) continue;

      if (req.play) this._handlePlayCard(p, req.play);
      if (req.attack) this._handleAttack(p, req.attack);
      if (req.endTurn) this._handleEndTurn(p);
      // finally clear
      p.setState("request", null);

      // ↳ HP may have changed ‑> check victory right after each request
      this._checkGameOver();
    }
  }

  _handlePlayCard(p, uid) {
    const hand = p.getState("hand") || [];
    const board = p.getState("board") || [];
    const idx = hand.indexOf(uid);
    if (idx === -1) return;

    const baseId = uid.split("#")[0];
    const card = this.CARDS_BY_ID[baseId];

    const cost = card?.cost ?? 0;
    const mana = p.getState("mana") ?? 0;
    if (mana < cost) {
      p.setState("reject", { reason: "mana", card: uid }, true);
      return;
    }

    // Subtract mana and update states
    p.setState("mana", mana - cost, true);
    hand.splice(idx, 1);
    p.setState("hand", hand, true);

    // ✅ Broadcast animEvent to both clients
    setState(
      "animEvent",
      {
        type: "cardPlayed",
        playerId: p.id,
        uid: uid,
      },
      true
    );

    // ✅ Set boardState if creature
    if (card?.type === "creature") {
      const bs = p.getState("boardState") || {};
      // const tags = {};
      // if (card.keywords?.includes("taunt")) tags.taunt = true;
      // if (card.keywords?.includes("charge")) tags.charge = true;
      // if (card.keywords?.includes("divineShield")) tags.divineShield = true;
      // if (card.keywords?.includes("windfury")) tags.windfury = true;
      const tags = (card.keywords || []).reduce(
        (a, k) => ((a[k] = true), a),
        {}
      );
      bs[uid] = { atk: card.attack, hp: card.health, tags, attacksLeft: 1 };
      p.setState("boardState", bs, true);

      // 🔔 Emit event for systems that care (battlecry, aura, triggers)
      emit("minionPlayed", {
        caster: p,
        opponent: this.players.find((x) => x.id !== p.id),
        uid,
        base: card,
        deckMap: this.turnManager.deckMap,
      });
    }

    // ✅ Add to graveyard if spell
    // ✅ SPELLS -------------------------------------------------------
    if (card.type === "spell") {
      // (A) Instant spells (no target required)
      if (!this._needsTarget(card)) {
        // 1. resolve immediately against the *player* who cast it
        resolveSpell(
          card,
          uid, // src uid
          "player", // dst is always self
          p, // src player state
          p, // dst player state (same player)
          this.CARDS_BY_ID,
          this.turnManager.deckMap
        );

        // 2. send to graveyard
        const gy = p.getState("graveyard") || [];
        gy.push(uid);
        p.setState("graveyard", gy, true);

        // 3. log + animation (optional)
        this.log(`${p.getProfile()?.name || "Player"} played ${card.name}.`);
        setState(
          "animEvent",
          { type: "cardPlayed", playerId: p.id, uid },
          true
        );
        return; // ⬅️  finished – never touches the board
      }

      // (B) Targeted spells fall through to the existing logic below
    }

    // CREATURE  or  TARGETED-SPELL branch
    board.push(uid);
    p.setState("board", board, true);

    this.log(
      `${p.getProfile()?.name || "Player"} played ${card?.name || "a card"}`
    );
  }

  // _handleAttack(p, { src, dst }) {
  //   /** ------------------------------------------------------------
  //    *  0.  Fast guards & common state
  //    * ----------------------------------------------------------- */
  //   const board = p.getState("board") || [];
  //   if (!board.includes(src)) return; // bad id

  //   const opponent = this._getOpponent(p);
  //   const oppBoard = opponent?.getState("board") || [];

  //   const myBS = p.getState("boardState") || {};
  //   const oppBS = opponent?.getState("boardState") || {};

  //   const already = (p.getState("hasAttacked") || {})[src];
  //   if (already) return; // one action / turn

  //   const baseId = src.split("#")[0];
  //   const srcCard = this.CARDS_BY_ID[baseId];

  //   /** ------------------------------------------------------------
  //    *  1.  SPELL branch  ➜  resolveSpell()
  //    * ----------------------------------------------------------- */
  //   if (srcCard.type === "spell") {
  //     // 1-a : validate target id
  //     if (dst !== "player" && !board.includes(dst) && !oppBoard.includes(dst))
  //       return;

  //     if (
  //       !this._isValidSpellTarget(srcCard, dst, p, opponent, this.CARDS_BY_ID)
  //     ) {
  //       // optional feedback toast
  //       p.setState("reject", { reason: "badTarget" }, true);
  //       return; // DO NOT consume the spell
  //     }

  //     // 1-b : apply the spell effect
  //     resolveSpell(
  //       srcCard,
  //       src,
  //       dst,
  //       p,
  //       opponent,
  //       this.CARDS_BY_ID,
  //       this.turnManager.deckMap
  //     );

  //     // 1-c : move spell from board to graveyard
  //     p.setState(
  //       "board",
  //       board.filter((id) => id !== src),
  //       true
  //     );
  //     const gy = p.getState("graveyard") || [];
  //     gy.push(src);
  //     p.setState("graveyard", gy, true);

  //     this._flagAsAttacked(p, src);

  //     // 1-d : broadcast animation
  //     setState(
  //       "animEvent",
  //       { type: "cardAttack", playerId: p.id, src, dst },
  //       true
  //     );
  //     return; // SPELL handled
  //   }

  //   /** ------------------------------------------------------------
  //    *  2.  CREATURE branch
  //    * ----------------------------------------------------------- */
  //   const attackerStats = myBS[src];
  //   if (!attackerStats) return; // should exist

  //   /* ── 2-a  attacking an enemy creature ────────────────────── */
  //   if (oppBoard.includes(dst)) {
  //     const defenderBase = dst.split("#")[0];
  //     const defenderCard = this.CARDS_BY_ID[defenderBase];

  //     applyCreatureDamage(src, dst, p, opponent, srcCard, defenderCard);

  //     this._flagAsAttacked(p, src);
  //   } else if (dst === "player") {
  //     /* ── 2-b  attacking the opponent’s face ───────────────────── */
  //     const oppHasCreature = oppBoard.some((uid) => {
  //       const bid = uid.split("#")[0];
  //       return this.CARDS_BY_ID[bid]?.type === "creature";
  //     });

  //     if (oppHasCreature) {
  //       p.setState("reject", { reason: "protectedFace" }, true);
  //       return;
  //     }

  //     const hp = opponent.getState("hp") ?? 0;
  //     opponent.setState("hp", hp - attackerStats.atk, true);
  //     this._flagAsAttacked(p, src);
  //   }

  //   /* ── 2-c  sync + animation ───────────────────────────────── */
  //   // boardState objects may have changed inside helpers
  //   opponent.setState("boardState", opponent.getState("boardState"), true);
  //   p.setState("boardState", p.getState("boardState"), true);

  //   setState(
  //     "animEvent",
  //     { type: "cardAttack", playerId: p.id, src, dst },
  //     true
  //   );
  // }

  /* =========================
   * Refactored _handleAttack
   * ========================= */
  _handleAttack(p, { src, dst }) {
    /** ------------------------------------------------------------
     *  0) Fast guards & common state
     * ----------------------------------------------------------- */
    const board = p.getState("board") || [];
    if (!board.includes(src)) return; // bad id

    const opponent = this._getOpponent(p);
    const oppBoard = opponent?.getState("board") || [];

    const myBS = p.getState("boardState") || {};
    const oppBS = opponent?.getState("boardState") || {};

    const already = (p.getState("hasAttacked") || {})[src];
    if (already) return; // one action / turn

    const baseId = src.split("#")[0];
    const srcCard = this.CARDS_BY_ID[baseId];

    /** ------------------------------------------------------------
     *  1) SPELL branch  ➜  resolveSpell()
     * ----------------------------------------------------------- */
    if (srcCard.type === "spell") {
      // 1-a : validate target id
      if (dst !== "player" && !board.includes(dst) && !oppBoard.includes(dst))
        return;

      if (
        !this._isValidSpellTarget(srcCard, dst, p, opponent, this.CARDS_BY_ID)
      ) {
        // optional feedback toast
        p.setState("reject", { reason: "badTarget" }, true);
        return; // DO NOT consume the spell
      }

      // 1-b : apply the spell effect
      resolveSpell(
        srcCard,
        src,
        dst,
        p,
        opponent,
        this.CARDS_BY_ID,
        this.turnManager.deckMap
      );

      // 1-c : move spell from board to graveyard
      p.setState(
        "board",
        board.filter((id) => id !== src),
        true
      );
      const gy = p.getState("graveyard") || [];
      gy.push(src);
      p.setState("graveyard", gy, true);

      this._flagAsAttacked(p, src);

      // 1-d : broadcast animation
      setState(
        "animEvent",
        { type: "cardAttack", playerId: p.id, src, dst },
        true
      );
      return; // SPELL handled
    }

    /** ------------------------------------------------------------
     *  2) CREATURE branch
     * ----------------------------------------------------------- */
    const attackerStats = myBS[src];
    if (!attackerStats) return; // should exist

    /* ── 2-a  attacking an enemy creature ────────────────────── */
    if (oppBoard.includes(dst)) {
      // TAUNT gate: if any taunts exist on defender board, you must hit one of them
      const legal = getLegalMinionTargets(opponent);
      if (!legal.includes(dst)) {
        p.setState("reject", { reason: "mustHitTaunt" }, true);
        return;
      }

      const defenderBase = dst.split("#")[0];
      const defenderCard = this.CARDS_BY_ID[defenderBase];

      applyCreatureDamage(src, dst, p, opponent, srcCard, defenderCard);
      this._flagAsAttacked(p, src);
    } else if (dst === "player") {
      /* ── 2-b  attacking the opponent’s face (strict rule) ───── */
      // Face is blocked whenever defender has ANY creature.
      if (defenderHasAnyCreature(opponent, this.CARDS_BY_ID)) {
        p.setState("reject", { reason: "protectedFace" }, true);
        return;
      }

      const hp = opponent.getState("hp") ?? 0;
      opponent.setState("hp", hp - attackerStats.atk, true);
      this._flagAsAttacked(p, src);
    } else {
      // Unknown target: ignore
      return;
    }

    /* ── 2-c  sync + animation ───────────────────────────────── */
    // boardState objects may have changed inside helpers
    opponent.setState("boardState", opponent.getState("boardState"), true);
    p.setState("boardState", p.getState("boardState"), true);

    setState(
      "animEvent",
      { type: "cardAttack", playerId: p.id, src, dst },
      true
    );
  }

  _handleEndTurn(p) {
    const next = this.players.find((x) => x.id !== p.id);
    if (!next) return;
    setState("turnPlayerId", next.id, true);
    this.turnManager.startTurn(next);
  }

  _getOpponent(p) {
    return this.players.find((player) => player.id !== p.id);
  }

  _flagAsAttacked(p, uid) {
    const map = p.getState("hasAttacked") || {};
    map[uid] = true;
    p.setState("hasAttacked", map, true);
  }

  /** -----------------------------------------------------------------
   *  Spell-target validation
   *    returns true  = OK to resolveSpell()
   *            false = reject + keep spell on board
   * ----------------------------------------------------------------*/
  _isValidSpellTarget(srcCardData, dst, player, opponent, CARDS_BY_ID) {
    // Face is always valid
    if (dst === "player") return true;

    // Resolve which side & get card data
    const allBoards = [
      ...(player.getState("board") || []),
      ...(opponent?.getState("board") || []),
    ];
    if (!allBoards.includes(dst)) return false; // not on any board

    const dstBase = dst.split("#")[0];
    const dstData = CARDS_BY_ID[dstBase];

    // --- Rules by spell type ------------------------------------
    if (srcCardData.damage) return dstData.type === "creature"; // Fireball
    if (srcCardData.heal) return dstData.type === "creature"; // Heal
    if (srcCardData.boostAttack)
      return (
        dstData.type === "creature" && player.getState("board").includes(dst)
      ); // Power Boost (friendly)
    // Mana Surge & other self-only spells
    if (srcCardData.boostMana) return dst === "player";

    return false; // fallback
  }

  _needsTarget(card) {
    // Spells that *modify* something on the board must be targeted.
    // Everything else (draw, boostMana, etc.) resolves instantly.
    return !!(card.damage || card.heal || card.boostAttack || card.boostMana);
  }

  _removeSpellCard(playerState, uid) {
    const board = playerState.getState("board") || [];
    playerState.setState(
      "board",
      board.filter((id) => id !== uid),
      true
    );

    const bs = playerState.getState("boardState") || {};
    delete bs[uid];
    playerState.setState("boardState", bs, true);
  }

  _gameIsOver() {
    return !!getState && getState("gameOver");
  }

  /* ======================================================================
   *  Called after *every* state‑changing action.  If exactly one player
   *  still has HP > 0, broadcast the winner and freeze gameplay.
   * ====================================================================*/
  _checkGameOver() {
    // only host runs this; scene ignores if already declared
    if (this._gameIsOver()) return;

    const alive = this.players.filter((p) => (p.getState("hp") ?? 0) > 0);
    if (alive.length === 1) {
      const winner = alive[0];
      setState("gameOver", { winnerId: winner.id }, true); // broadcast
      console.log("[GAME OVER] winner →", winner.id);
    }
  }
}
