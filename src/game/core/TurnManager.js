import { MAX_MANA, MAX_HAND_SIZE } from "./constants.js";
import { getParticipants } from "playroomkit";
import { emit } from "./events.js";

/**
 * Pure turn-cycle helper.
 * All "player" arguments are assumed to expose:
 *   - id
 *   - getState(key)
 *   - setState(key, value, publishImmediately=true)
 */
export class TurnManager {
  /**
   * @param {Phaser.Scene}    scene    – multiplayer scene (to poke UI)
   * @param {Map<string,Deck>} deckMap – playerId → Deck instance
   */
  constructor(scene, deckMap) {
    this.scene = scene;
    this.deckMap = deckMap;
    this.localTurn = new Map(); // playerId → integer (client-side convenience)
  }

  /** Host only – call when a new turn starts for `player`. */
  startTurn(player) {
    const turnCount = (player.getState("turnCount") || 0) + 1;
    player.setState("turnCount", turnCount, true);

    const newMax = Math.min(turnCount, MAX_MANA);
    player.setState("maxMana", newMax, true);
    player.setState("mana", newMax, true);

    const reset = {};
    (player.getState("board") || []).forEach((uid) => (reset[uid] = false));
    player.setState("hasAttacked", reset, true);

    const deck = this.deckMap.get(player.id);
    if (!deck) return;

    if (turnCount > 1) {
      const hand = player.getState("hand") || [];
      if (hand.length < MAX_HAND_SIZE && deck.stack.length > 0) {
        const drawn = deck.draw();
        hand.push(drawn.uid);
        player.setState("hand", hand, true);
      } else if (deck.stack.length === 0) {
        const hp = player.getState("hp") || 0;
        player.setState("hp", Math.max(0, hp - 1), true);
        player.setState("deckEmpty", true, true);
      }
    }

    // ✅ Sync deckSizeSelf for *all* players every turn
    getParticipants().forEach((ps) => {
      const d = this.deckMap.get(ps.id);
      if (d) ps.setState("deckSizeSelf", d.size(), true);
    });

    this.scene?._updateDeckCounters?.();

    emit("turnStart", {
      player,
      foe: [...this.deckMap.keys()].map((id) => id) && null, // you already have access to foe via the scene/players list
      CARDS_BY_ID: this.scene?.CARDS_BY_ID || undefined,
      deckMap: this.deckMap,
    });
  }
}
