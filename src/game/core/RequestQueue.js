import { MAX_MANA, HEALTH_POINTS } from "./constants.js";
import { applyCreatureDamage, resolveSpell } from "./Combat.js";
import { TurnManager } from "./TurnManager.js";

import { getState, setState } from "playroomkit";

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

  // ---------- internal helpers ----------

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
    p.setState("mana", mana - cost, true);

    hand.splice(idx, 1);
    board.push(uid);
    p.setState("hand", hand, true);
    p.setState("board", board, true);

    // if creature → init hp
    if (card?.type === "creature") {
      const bs = p.getState("boardState") || {};
      bs[uid] = card.health;
      p.setState("boardState", bs, true);
    }

    this.log(
      `${p.getProfile()?.name || "Player"} played ${card?.name || "a card"}`
    );
  }

  _handleAttack(p, { src, dst }) {
    const firstPlayerId = getState("firstPlayerId");
    const turnCount = p.getState("turnCount") || 0;

    if (p.id === firstPlayerId && turnCount === 1) {
      p.setState("reject", { reason: "firstTurn" }, true);
      return;
    }

    const foe = this.players.find((x) => x.id !== p.id);
    if (!foe) return;

    const srcData = this.CARDS_BY_ID[src.split("#")[0]];
    if (!srcData) return;

    const isCreature = srcData.type === "creature";
    const isHealSpell = srcData.type === "spell" && (srcData.heal ?? 0) > 0;
    const isDamageSpell = srcData.type === "spell" && (srcData.damage ?? 0) > 0;

    const attackerName = p.getProfile()?.name || "Player";
    const defenderName = foe.getProfile()?.name || "Opponent";
    const attackerCardName = srcData?.name || "Unknown Card";

    // ✅ Face attacks FIRST (no defenderCardName needed)
    if (dst === "player") {
      if (isHealSpell) {
        const hp = p.getState("hp") ?? 0;
        p.setState("hp", Math.min(HEALTH_POINTS, hp + srcData.heal), true);
        this.log(`${attackerName} healed themselves with ${attackerCardName}`);
      } else {
        if ((foe.getState("board") || []).length > 0) {
          p.setState("reject", { reason: "protectedFace" }, true);
          return;
        }
        const damage = isCreature ? srcData.attack : srcData.damage;
        foe.setState(
          "hp",
          Math.max(0, (foe.getState("hp") || 0) - damage),
          true
        );
        this.log(
          `${attackerName} attacked ${defenderName} directly with ${attackerCardName}`
        );
      }
      this._checkGameOver();
      this._flagAsAttacked(p, src);
      return;
    }

    // ✅ Only here we need dstData & defenderCardName
    const dstData = this.CARDS_BY_ID[dst.split("#")[0]];
    if (!dstData) return;
    const defenderCardName = dstData?.name || "Unknown Target";

    // Creature ↔ Creature
    if (isCreature) {
      applyCreatureDamage(src, dst, p, foe, srcData, dstData);
      this.log(
        `${attackerName}'s ${attackerCardName} attacked ${defenderName}'s ${defenderCardName}`
      );
      this._flagAsAttacked(p, src);
      return;
    }

    // Spell at creature
    if (isHealSpell || isDamageSpell) {
      resolveSpell(srcData, src, dst, p, foe, this.CARDS_BY_ID);
      this.log(
        `${attackerName} cast ${attackerCardName} on ${defenderName}'s ${defenderCardName}`
      );
      this._checkGameOver();
      this._flagAsAttacked(p, src);
    }
  }

  _handleEndTurn(p) {
    const next = this.players.find((x) => x.id !== p.id);
    if (!next) return;
    setState("turnPlayerId", next.id, true);
    this.turnManager.startTurn(next);
  }

  _flagAsAttacked(p, uid) {
    const map = p.getState("hasAttacked") || {};
    map[uid] = true;
    p.setState("hasAttacked", map, true);
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
