import { resolveWithRegistry } from "./SpellRegistry.js";
import { getKeyword, Keyword } from "./KeywordRegistry.js";
import { emit } from "./events.js";

/**
 * Creature‑vs‑creature combat.  Updates both players’ boardState + board list.
 */
// export function applyCreatureDamage(
//   srcUid,
//   dstUid,
//   atkPS,
//   defPS,
//   srcData,
//   dstData
// ) {
//   const atkBS = { ...(atkPS.getState("boardState") || {}) };
//   const defBS = { ...(defPS.getState("boardState") || {}) };

//   // ✅ Get current stats or fallback to base card values
//   const srcStats = atkBS[srcUid] || { atk: srcData.attack, hp: srcData.health };
//   const dstStats = defBS[dstUid] || { atk: dstData.attack, hp: dstData.health };

//   const newDstHp = dstStats.hp - srcStats.atk;
//   const newSrcHp = srcStats.hp - dstStats.atk;

//   // ✅ Update defender
//   if (newDstHp <= 0) {
//     const board = defPS.getState("board") || [];
//     defPS.setState(
//       "board",
//       board.filter((id) => id !== dstUid),
//       true
//     );
//     delete defBS[dstUid];
//   } else {
//     defBS[dstUid] = { ...dstStats, hp: newDstHp };
//   }

//   // ✅ Update attacker
//   if (newSrcHp <= 0) {
//     const board = atkPS.getState("board") || [];
//     atkPS.setState(
//       "board",
//       board.filter((id) => id !== srcUid),
//       true
//     );
//     delete atkBS[srcUid];
//   } else {
//     atkBS[srcUid] = { ...srcStats, hp: newSrcHp };
//   }

//   atkPS.setState("boardState", atkBS, true);
//   defPS.setState("boardState", defBS, true);
// }

export function applyCreatureDamage(srcUid, dstUid, atkPS, defPS, srcData, dstData) {
  const atkBS = { ...(atkPS.getState("boardState") || {}) };
  const defBS = { ...(defPS.getState("boardState") || {}) };

  const srcStats = atkBS[srcUid] || { atk: srcData.attack, hp: srcData.health };
  const dstStats = defBS[dstUid] || { atk: dstData.attack, hp: dstData.health };

  // Divine Shield check on defender
  const ds = getKeyword(Keyword.DIVINE_SHIELD);
  const shield = ds?.onIncomingDamage?.({ targetPS: defPS, targetUid: dstUid, amount: srcStats.atk });
  const dstTakesDamage = !(shield && shield.canceled);

  const newDstHp = dstTakesDamage ? (dstStats.hp - srcStats.atk) : dstStats.hp;

  // Attacker takes retaliate
  const as = getKeyword(Keyword.DIVINE_SHIELD);
  const shieldA = as?.onIncomingDamage?.({ targetPS: atkPS, targetUid: srcUid, amount: dstStats.atk });
  const srcTakesDamage = !(shieldA && shieldA.canceled);
  const newSrcHp = srcTakesDamage ? (srcStats.hp - dstStats.atk) : srcStats.hp;

  let defenderDied = false, attackerDied = false;

  if (newDstHp <= 0) {
    const board = defPS.getState("board") || [];
    defPS.setState("board", board.filter((id) => id !== dstUid), true);
    delete defBS[dstUid];
    defenderDied = true;
  } else {
    defBS[dstUid] = { ...dstStats, hp: newDstHp };
  }

  if (newSrcHp <= 0) {
    const board = atkPS.getState("board") || [];
    atkPS.setState("board", board.filter((id) => id !== srcUid), true);
    delete atkBS[srcUid];
    attackerDied = true;
  } else {
    // decrement attacksLeft for the attacker (handles Windfury/normal)
    const attacksLeft = (srcStats.attacksLeft ?? 1) - 1;
    atkBS[srcUid] = { ...srcStats, hp: newSrcHp, attacksLeft: Math.max(0, attacksLeft) };
  }

  atkPS.setState("boardState", atkBS, true);
  defPS.setState("boardState", defBS, true);

  // Emit deathrattles
  if (defenderDied) emit("minionDied", { ownerPS: defPS, opponentPS: atkPS, uid: dstUid, base: dstData, deckMap: null });
  if (attackerDied) emit("minionDied", { ownerPS: atkPS, opponentPS: defPS, uid: srcUid, base: srcData, deckMap: null });
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
