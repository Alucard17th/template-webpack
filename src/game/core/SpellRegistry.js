// spellRegistry.js
// Central registry for spell effects. Plain JavaScript.
// Works with your PlayerState (getState/setState), boardState maps, and your Deck via deckMap.

import { HEALTH_POINTS, MAX_MANA, MAX_HAND_SIZE } from "./constants.js";
import { emit } from "./events.js";

/* ---------- small helpers ---------- */

const bid = (uid) => String(uid).split("#")[0];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function getBoard(ps) {
  return ps.getState("board") || [];
}
function setBoard(ps, board) {
  ps.setState("board", board, true);
}
function getBS(ps) {
  return ps.getState("boardState") || {};
}
function setBS(ps, bs) {
  ps.setState("boardState", bs, true);
}
function owns(ps, uid) {
  return getBoard(ps).includes(uid);
}

function readCreature(ps, uid, CARDS_BY_ID) {
  const bs = getBS(ps);
  const cur = bs[uid];
  if (cur) return { ...cur };
  const base = CARDS_BY_ID[bid(uid)];
  return { atk: base?.attack ?? 0, hp: base?.health ?? 0 };
}
function writeCreatureOrKill(ps, uid, nextStats) {
  if (nextStats.hp <= 0) {
    const board = getBoard(ps).filter((id) => id !== uid);
    setBoard(ps, board);
    const bs = getBS(ps);
    if (bs[uid]) {
      delete bs[uid];
      setBS(ps, bs);
    }
    return { removed: true };
  }
  const bs = getBS(ps);
  bs[uid] = nextStats;
  setBS(ps, bs);
  return { removed: false };
}

/* ---------- registry core ---------- */

const handlers = Object.create(null);

export function registerSpell(name, fn) {
  handlers[name] = fn;
}

/**
 * Registry resolver.
 * ctx = {
 *   card, srcUid, dst, caster, opponent, CARDS_BY_ID, deckMap, log: fn
 * }
 */
export function resolveWithRegistry(ctx) {
  const effect = ctx.card?.effect;
  if (effect && handlers[effect]) {
    return handlers[effect](ctx);
  }
  // Fallback to legacy behavior (no effect key)
  return legacyAdapter(ctx);
}

/* ---------- built-in handlers ---------- */

/** Gain mana for caster. Uses card.boostMana (or card.amount). */
registerSpell("boost_mana", ({ card, caster, log }) => {
  const gain = Number(card.boostMana ?? card.amount ?? 0);
  if (!gain) return;
  const cur = caster.getState("mana") ?? 0;
  const max = caster.getState("maxMana") ?? MAX_MANA;
  const next = clamp(cur + gain, 0, max); // respect current maxMana
  caster.setState("mana", next, true);
  log?.(`Mana +${gain} (now ${next}/${max}).`);
});

/** Heal: player (dst === "player") or friendly creature. Uses card.heal/amount. */
registerSpell("heal", ({ card, dst, caster, CARDS_BY_ID, log }) => {
  const amount = Number(card.heal ?? card.amount ?? 0);
  if (!amount) return;

  if (dst === "player") {
    const cur = caster.getState("hp") ?? 0;
    const next = clamp(cur + amount, 0, HEALTH_POINTS);
    caster.setState("hp", next, true);
    log?.(`Healed player +${amount} (HP ${cur} → ${next}).`);
    return;
  }

  if (!owns(caster, dst)) return; // friendly only
  const stats = readCreature(caster, dst, CARDS_BY_ID);
  const base = CARDS_BY_ID[bid(dst)];
  const maxHp = base?.health ?? stats.hp;
  const next = { ...stats, hp: clamp(stats.hp + amount, 0, maxHp) };
  writeCreatureOrKill(caster, dst, next);
  log?.(`Healed ${dst} +${amount} (→ ${next.hp}/${maxHp}).`);
});

/** Damage: opponent face (dst === "player") or target creature. Uses card.damage/amount. */
registerSpell("damage", ({
  card,
  dst,
  caster,
  opponent,
  CARDS_BY_ID,
  deckMap,
  log,
}) => {
  const amount = Number(card.damage ?? card.amount ?? 0);
  if (!amount) return;

  if (dst === "player") {
    const cur = opponent.getState("hp") ?? 0;
    const next = clamp(cur - amount, 0, HEALTH_POINTS);
    opponent.setState("hp", next, true);
    log?.(`Dealt ${amount} to face (HP ${cur} → ${next}).`);
    return;
  }

  // otherwise a creature; prefer enemy first
  const owner = owns(opponent, dst) ? opponent : owns(caster, dst) ? caster : null;
  if (!owner) return;

  const stats = readCreature(owner, dst, CARDS_BY_ID);
  const next = { ...stats, hp: stats.hp - amount };
  const { removed } = writeCreatureOrKill(owner, dst, next);

  if (removed) {
    const gy = owner.getState("graveyard") || [];
    gy.push(dst);
    owner.setState("graveyard", gy, true);

    const base = CARDS_BY_ID[bid(dst)];
    const other = owner === caster ? opponent : caster;
    emit("minionDied", {
      ownerPS: owner,
      opponentPS: other,
      uid: dst,
      base,
      deckMap,
    });
  }
  log?.(
    removed
      ? `Dealt ${amount} to ${dst} (destroyed).`
      : `Dealt ${amount} to ${dst} (HP ${stats.hp} → ${next.hp}).`
  );
});

/** Buff attack: friendly creature only. Uses card.boostAttack/amount. */
registerSpell("boost_attack", ({ card, dst, caster, CARDS_BY_ID, log }) => {
  const gain = Number(card.boostAttack ?? card.amount ?? 0);
  if (!gain || dst === "player" || !owns(caster, dst)) return;

  const stats = readCreature(caster, dst, CARDS_BY_ID);
  const next = { ...stats, atk: stats.atk + gain };
  writeCreatureOrKill(caster, dst, next);
  log?.(`Buffed ${dst} +${gain} ATK (ATK ${stats.atk} → ${next.atk}).`);
});

/** Draw N cards for caster. Uses card.draw/amount and deckMap. */
registerSpell("draw", ({ card, caster, deckMap, log }) => {
  const n = Number(card.draw ?? card.amount ?? 0);
  if (!n || !deckMap) return;

  const deck = deckMap.get(caster.id);
  if (!deck) return;

  let drawn = 0;
  for (let i = 0; i < n; i++) {
    const hand = caster.getState("hand") || [];
    if (hand.length >= MAX_HAND_SIZE) {
      caster.setState("toast", "Your hand is already full!", true);
      break;
    }
    if (deck.size() <= 0) break;
    const newCard = deck.draw();
    hand.push(newCard.uid);
    caster.setState("hand", hand, true);
    drawn++;
  }

  // keep displayed deck size in sync if you use deckSizeSelf
  caster.setState("deckSizeSelf", deck.size(), true);

  if (drawn > 0) log?.(`Drew ${drawn} card(s).`);
});

/* ---------- legacy adapter (no card.effect) ---------- */
// Mirrors your current resolveSpell behavior if cards only have legacy fields.
function legacyAdapter(ctx) {
  const { card } = ctx;

  if (card.boostMana) return handlers["boost_mana"](ctx);
  if (card.heal) return handlers["heal"](ctx);
  if (card.damage) return handlers["damage"](ctx);
  if (card.boostAttack) return handlers["boost_attack"](ctx);
  if (card.draw) return handlers["draw"](ctx);

  ctx.log?.("No effect to resolve.");
}
