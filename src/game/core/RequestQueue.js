import { MAX_MANA, HEALTH_POINTS } from "./constants.js";
import { applyCreatureDamage, resolveSpell } from "./Combat.js";
import { TurnManager } from "./TurnManager.js";

import { getState, setState, getParticipants } from "playroomkit";

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
    board.push(uid);
    p.setState("hand", hand, true);
    p.setState("board", board, true);

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
      bs[uid] = { atk: card.attack, hp: card.health };
      p.setState("boardState", bs, true);
    }

    // ✅ Add to graveyard if spell
    if (card?.type === "spell") {
      const graveyard = p.getState("graveyard") || [];
      graveyard.push(uid);
      p.setState("graveyard", graveyard, true);
    }

    this.log(
      `${p.getProfile()?.name || "Player"} played ${card?.name || "a card"}`
    );
  }

  _handleAttack(p, { src, dst }) {
    const srcBoard = p.getState("board") || [];
    if (!srcBoard.includes(src)) return;

    const opponent = this._getOpponent(p);
    const oppBoard = opponent?.getState("board") || [];
    const myBoardState = p.getState("boardState") || {};
    const oppBoardState = opponent?.getState("boardState") || {};

    const attacker = myBoardState[src];
    if (!attacker || attacker.attacked) return;

    // If attacking a card
    if (oppBoard.includes(dst)) {
      const defender = oppBoardState[dst];
      if (!defender) return;

      attacker.attacked = true;
      this._flagAsAttacked(p, src);

      defender.hp -= attacker.atk;
      attacker.hp -= defender.atk;

      if (defender.hp <= 0) {
        const i = oppBoard.indexOf(dst);
        oppBoard.splice(i, 1);
        delete oppBoardState[dst];

        // ✅ Add to graveyard
        const oppGraveyard = opponent.getState("graveyard") || [];
        oppGraveyard.push(dst);
        opponent.setState("graveyard", oppGraveyard, true);
      }

      if (attacker.hp <= 0) {
        const i = srcBoard.indexOf(src);
        srcBoard.splice(i, 1);
        delete myBoardState[src];

        // ✅ Add to graveyard
        const myGraveyard = p.getState("graveyard") || [];
        myGraveyard.push(src);
        p.setState("graveyard", myGraveyard, true);
      }

      // ✅ Sync board states
      opponent.setState("board", oppBoard, true);
      opponent.setState("boardState", oppBoardState, true);
      p.setState("board", srcBoard, true);
      p.setState("boardState", myBoardState, true);

      // ✅ Broadcast animation event
      setState(
        "animEvent",
        {
          type: "cardAttack",
          playerId: p.id,
          src,
          dst,
        },
        true
      );
    }

    // Attacking player directly
    if (dst === "player") {
      const hp = opponent?.getState("hp") ?? 0;
      attacker.attacked = true;
      this._flagAsAttacked(p, src); 
      opponent?.setState("hp", hp - attacker.atk, true);
      p.setState("boardState", myBoardState, true);

      // ✅ Broadcast animation event
      setState(
        "animEvent",
        {
          type: "cardAttack",
          playerId: p.id,
          src,
          dst,
        },
        true
      );
    }
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
