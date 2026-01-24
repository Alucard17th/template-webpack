// Returns enemy minion UIDs that are legal to target
export function getLegalMinionTargets(defenderPS) {
  const bs = defenderPS.getState("boardState") || {};
  const all = Object.keys(bs);
  const taunts = all.filter((uid) => !!bs[uid]?.tags?.taunt);
  return taunts.length ? taunts : all;
}

// True if you can go face (only when no taunts exist)
export function canHitFace(defenderPS) {
  const bs = defenderPS.getState("boardState") || {};
  return !Object.values(bs).some((st) => !!st?.tags?.taunt);
}

export function defenderHasAnyCreature(defenderPS, CARDS_BY_ID) {
  const oppBoard = defenderPS.getState("board") || [];
  return oppBoard.some((uid) => {
    const bid = uid.split("#")[0];
    return CARDS_BY_ID[bid]?.type === "creature";
  });
}
