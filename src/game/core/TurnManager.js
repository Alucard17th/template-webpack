import { MAX_MANA, MAX_HAND_SIZE } from "./constants.js";

/**
 * Pure turn‑cycle helper.
 * All "player" arguments are assumed to expose:
 *   - id
 *   - getState(key)
 *   - setState(key, value, publishImmediately=true)
 */
export class TurnManager {
  /**
   * @param {Map<string, Deck>} deckMap  playerId → Deck instance
   */
  constructor(deckMap) {
    this.deckMap = deckMap;
    this.localTurn = new Map();      // playerId → integer

  }

  /** Host only – call when a new turn starts for `player`. */
  /** Host only – call when a new turn starts for `player`. */
  startTurn(player) {
    // 1. advance per-player turn counter
    const turnCount = (player.getState("turnCount") || 0) + 1;
    player.setState("turnCount", turnCount, true);

    // 2. refill / grow mana (cap at MAX_MANA)
    const newMax = Math.min(turnCount, MAX_MANA);
    player.setState("maxMana", newMax, true);
    player.setState("mana", newMax, true);

    // 3. reset attacks
    const reset = {};
    (player.getState("board") || []).forEach((uid) => (reset[uid] = false));
    player.setState("hasAttacked", reset, true);

    // 4. draw a card (if hand not full)
    const deck = this.deckMap.get(player.id);
    if (!deck) return;
    const drawn = deck.draw();
    if (drawn) {
      const hand = player.getState("hand") || [];
      if (hand.length < MAX_HAND_SIZE) {
        hand.push(drawn.uid);
        player.setState("hand", hand, true);
      }
    }

    console.log(
      "[TurnManager] startTurn()",
      player.id,
      "Turn",
      turnCount,
      "→ mana",
      newMax
    );
  }
}
