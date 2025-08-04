import { HEALTH_POINTS, MAX_MANA } from "./constants.js";

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
  dstUid,
  srcPS,
  dstPS,
  CARDS_BY_ID
) {
  // Heal Spell → Target Player or Creature
  if (cardData.heal) {
    if (dstUid === "player") {
      const hp = srcPS.getState("hp") ?? 0;
      srcPS.setState("hp", Math.min(HEALTH_POINTS, hp + cardData.heal), true);
    } else {
      const bs = srcPS.getState("boardState") || {};
      const dstCard = CARDS_BY_ID[dstUid.split("#")[0]];
      const current = bs[dstUid] || { atk: dstCard.attack, hp: dstCard.health };
      bs[dstUid] = { ...current, hp: current.hp + cardData.heal };
      srcPS.setState("boardState", bs, true);
    }
    return;
  }

  // Damage Spell → Target Player or Creature
  if (cardData.damage) {
    if (dstUid === "player") {
      const hp = dstPS.getState("hp") ?? 0;
      dstPS.setState("hp", Math.max(0, hp - cardData.damage), true);
    } else {
      const bs = dstPS.getState("boardState") || {};
      const dstCard = CARDS_BY_ID[dstUid.split("#")[0]];
      const current = bs[dstUid] || { atk: dstCard.attack, hp: dstCard.health };
      const newHp = Math.max(0, current.hp - cardData.damage);

      if (newHp <= 0) {
        // ✅ Remove dead card from board
        const board = dstPS.getState("board") || [];
        dstPS.setState(
          "board",
          board.filter((id) => id !== dstUid),
          true
        );
        delete bs[dstUid];
      } else {
        bs[dstUid] = { ...current, hp: newHp };
      }

      dstPS.setState("boardState", bs, true);
    }
    return;
  }

  // Attack Boost Spell → Only Creature
  if (cardData.boostAttack) {
    const bs = srcPS.getState("boardState") || {};
    const dstCard = CARDS_BY_ID[dstUid.split("#")[0]];
    const current = bs[dstUid] || { atk: dstCard.attack, hp: dstCard.health };
    bs[dstUid] = { ...current, atk: current.atk + cardData.boostAttack };
    srcPS.setState("boardState", bs, true);
    return;
  }

  // ✅ Mana Boost Spell → Always Target Player
  if (cardData.boostMana) {
    const currentMana = srcPS.getState("mana") ?? 0;
    const newMana = Math.min(MAX_MANA, currentMana + cardData.boostMana);
    srcPS.setState("mana", newMana, true);
    return;
  }
}
