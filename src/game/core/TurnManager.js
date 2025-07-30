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
  }

  /** Host only – call when a new turn starts for `player`. */
  startTurn(player) {
    const curTurn = player.getState("turnCount") || 0;
    player.setState("turnCount", curTurn + 1, true);
    // 1️⃣  Refresh / grow mana
    const newMax = Math.min((player.getState("maxMana") || 0) + 1, MAX_MANA);
    player.setState("maxMana", newMax, true);
    player.setState("mana", newMax, true);

    // 2️⃣  Reset “hasAttacked” flags for every creature on that board
    const board = player.getState("board") || [];
    const reset = {};
    board.forEach((uid) => (reset[uid] = false));
    player.setState("hasAttacked", reset, true);

    // 3️⃣  Draw a card
    const deck = this.deckMap.get(player.id);
    if (!deck) return; // should not happen
    const drawn = deck.draw();
    if (!drawn) return; // empty deck

    const hand = player.getState("hand") || [];
    if (hand.length < MAX_HAND_SIZE) {
      hand.push(drawn.uid);
      player.setState("hand", hand, true);
    } /* else: hand is full → burn card (Hearthstone‑style) */
  }
}
