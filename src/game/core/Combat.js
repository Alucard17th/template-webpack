import { HEALTH_POINTS } from "./constants.js";
import { dropOne } from "./utils.js";

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

  /* ─── calculate new HP ───────────────────────────── */
  const newDstHp = (defBS[dstUid] ?? dstData.health) - (srcData.attack ?? 0);
  const newSrcHp = (atkBS[srcUid] ?? srcData.health) - (dstData.attack ?? 0);

  /* ─── defender dies? ─────────────────────────────── */
  if (newDstHp <= 0) {
    const board = defPS.getState("board") || [];
    defPS.setState("board", dropOne(board, dstUid), true);
    delete defBS[dstUid];
  } else {
    defBS[dstUid] = newDstHp;
  }

  /* ─── attacker dies? ─────────────────────────────── */
  if (newSrcHp <= 0) {
    const board = atkPS.getState("board") || [];
    atkPS.setState("board", dropOne(board, srcUid), true);
    delete atkBS[srcUid];
  } else {
    atkBS[srcUid] = newSrcHp;
  }

  /* ─── broadcast fresh objects so Playroom detects change ─── */
  atkPS.setState("boardState", atkBS, true);
  defPS.setState("boardState", defBS, true);
}

/**
 * Generic spell resolver (damage or heal).
 *   - srcUid : uid of the spell card itself
 *   - dst    : uid of target creature *or* the string `"player"`
 */
export function resolveSpell(
  spellData,
  srcUid,
  dst,
  atkPS,
  defPS,
  CARDS_BY_ID
) {
  const damage = spellData.damage ?? 0;
  const heal = spellData.heal ?? 0;

  const consumeSpellCard = () => {
    const board = atkPS.getState("board") || [];
    atkPS.setState("board", dropOne(board, srcUid), true);
  };

  // ---------- DAMAGE ----------
  if (damage > 0) {
    if (dst === "player") {
      const hp = defPS.getState("hp") ?? 0;
      defPS.setState("hp", Math.max(0, hp - damage), true);

      if (typeof atkPS?.hostCheckGameOver === "function") {
        atkPS.hostCheckGameOver();
      }
    } else {
      const defBoardState = defPS.getState("boardState") || {};
      const targetBase = dst.split("#")[0];
      const targetData = CARDS_BY_ID[targetBase];

      const newHp = (defBoardState[dst] ?? targetData.health) - damage;
      if (newHp <= 0) {
        const board = defPS.getState("board") || [];
        defPS.setState("board", dropOne(board, dst), true);
        delete defBoardState[dst];
      } else {
        defBoardState[dst] = newHp;
      }
      defPS.setState("boardState", defBoardState, true);
    }
  }

  // ---------- HEAL ----------
  if (heal > 0) {
    if (dst === "player") {
      const hp = atkPS.getState("hp") ?? 0;
      atkPS.setState("hp", Math.min(HEALTH_POINTS, hp + heal), true);
    } else {
      const atkBoardState = atkPS.getState("boardState") || {};
      const targetBase = dst.split("#")[0];
      const targetData = CARDS_BY_ID[targetBase];

      const cur = atkBoardState[dst] ?? targetData.health;
      const newHp = Math.min(targetData.health, cur + heal);
      atkBoardState[dst] = newHp;
      atkPS.setState("boardState", atkBoardState, true);
    }
  }

  consumeSpellCard();
}
