import { resolveWithRegistry } from "./SpellRegistry.js";
/**
 * Creature‑vs‑creature combat.  Updates both players’ boardState + board list.
 */
export function applyCreatureDamage(
  srcUid,
  dstUid,
  atkPS,
  defPS,
  srcData,
  dstData
) {
  const atkBS = { ...(atkPS.getState("boardState") || {}) };
  const defBS = { ...(defPS.getState("boardState") || {}) };

  // ✅ Get current stats or fallback to base card values
  const srcStats = atkBS[srcUid] || { atk: srcData.attack, hp: srcData.health };
  const dstStats = defBS[dstUid] || { atk: dstData.attack, hp: dstData.health };

  const newDstHp = dstStats.hp - srcStats.atk;
  const newSrcHp = srcStats.hp - dstStats.atk;

  // ✅ Update defender
  if (newDstHp <= 0) {
    const board = defPS.getState("board") || [];
    defPS.setState(
      "board",
      board.filter((id) => id !== dstUid),
      true
    );
    delete defBS[dstUid];
  } else {
    defBS[dstUid] = { ...dstStats, hp: newDstHp };
  }

  // ✅ Update attacker
  if (newSrcHp <= 0) {
    const board = atkPS.getState("board") || [];
    atkPS.setState(
      "board",
      board.filter((id) => id !== srcUid),
      true
    );
    delete atkBS[srcUid];
  } else {
    atkBS[srcUid] = { ...srcStats, hp: newSrcHp };
  }

  atkPS.setState("boardState", atkBS, true);
  defPS.setState("boardState", defBS, true);
}

/**
 * Generic spell resolver (damage or heal).
 *   - srcUid : uid of the spell card itself
 *   - dst    : uid of target creature *or* the string `"player"`
 */
export function resolveSpell(
  cardData,
  srcUid,
  dstUid,        // "player" or target creature uid
  srcPS,         // caster PlayerState
  dstPS,         // opponent PlayerState (for face dmg / enemy targets)
  CARDS_BY_ID,
  deckMap        // needed for draw
) {
  return resolveWithRegistry({
    card: cardData,
    srcUid,
    dst: dstUid,
    caster: srcPS,
    opponent: dstPS,
    CARDS_BY_ID,
    deckMap,
    log: (msg) => {
      // you can pipe this into your scene log if you like:
      // this.turnManager.scene?.addLog?.(`[SPELL] ${msg}`);
      // For now:
      console.log("COMBAT resolveSpell [SPELL]: ", msg);
    },
  });
}
