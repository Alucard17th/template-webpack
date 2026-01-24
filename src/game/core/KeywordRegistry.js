// KeywordRegistry.js
import { on, emit } from "./events.js";
import { MAX_HAND_SIZE, MAX_MANA, HEALTH_POINTS } from "./constants.js";

// Helpers
function getBS(ps) { return ps.getState("boardState") || {}; }
function setBS(ps, bs) { ps.setState("boardState", bs, true); }

// ---- Simple resolvers for common keywords ----
const Keyword = {
  // Static board rules (checked by your RequestQueue / UI):
  TAUNT: "taunt",            // affects target legality
  CHARGE: "charge",          // can attack the turn it's played
  WINDFURY: "windfury",      // 2 attacks per turn
  DIVINE_SHIELD: "divineShield",

  // Triggers:
  BATTLECRY: "battlecry",
  DEATHRATTLE: "deathrattle",
  START_OF_TURN: "startTurn",
  END_OF_TURN: "endTurn",
  AURA: "aura",              // ongoing global/local buff
};

// Registered behaviors (by keyword name)
const registry = new Map();
// keyword -> function(ctx) or object of handlers, depending on type
export function registerKeyword(name, impl) { registry.set(name, impl); }
export function getKeyword(name) { return registry.get(name); }

// Utility: read card’s keywords/effects from CARDS data
export function getCardKeywords(cardData) {
  // You can store keywords in cardData.keywords = ['taunt', 'deathrattle', ...]
  // and richer payloads in cardData.effects = [{type:'battlecry', draw:1}, ...]
  return {
    keywords: cardData.keywords || [],
    effects: cardData.effects || [],
  };
}

/* =========================
 * Built-in keyword handlers
 * ========================= */

// TAUNT: affects target legality
registerKeyword(Keyword.TAUNT, {}); // static rule, enforced by targeting

// DIVINE SHIELD: consumed on first damage
registerKeyword(Keyword.DIVINE_SHIELD, {
  onIncomingDamage({ targetPS, targetUid, amount }) {
    const bs = getBS(targetPS);
    const st = bs[targetUid];
    if (st?.tags?.divineShield && amount > 0) {
      // consume shield and prevent damage
      bs[targetUid] = { ...st, tags: { ...st.tags, divineShield: false } };
      setBS(targetPS, bs);
      return { canceled: true };
    }
    return { canceled: false };
  },
});

// WINDFURY: per-turn extra attacks
registerKeyword(Keyword.WINDFURY, {
  onTurnStart({ player }) {
    // reset counters for that player's minions
    const bs = getBS(player);
    let changed = false;
    for (const [uid, st] of Object.entries(bs)) {
      if (st.tags?.windfury) {
        const maxAttacks = 2;
        const already = st.attacksLeft ?? 1;
        if (already !== maxAttacks) {
          bs[uid] = { ...st, attacksLeft: maxAttacks };
          changed = true;
        }
      } else {
        // normal minions: ensure 1 attack by default
        if (st.attacksLeft !== 1) {
          bs[uid] = { ...st, attacksLeft: 1 };
          changed = true;
        }
      }
    }
    if (changed) setBS(player, bs);
  },
});

// BATTLECRY / DEATHRATTLE generic runner
function runEffectPayload(effect, ctx) {
  // Example payloads:
  // { type:'draw', count:1 }
  // { type:'healFace', amount:2 }
  // { type:'dealFace', amount:3, enemy:true }
  // Extend as you need.
  const { caster, opponent, deckMap } = ctx;

  switch (effect.type) {
    case "draw": {
      const deck = deckMap.get(caster.id);
      if (!deck) break;
      const hand = caster.getState("hand") || [];
      if (hand.length >= MAX_HAND_SIZE) break;
      if (deck.size() > 0) {
        const c = deck.draw();
        hand.push(c.uid);
        caster.setState("hand", hand, true);
        caster.setState("deckSizeSelf", deck.size(), true);
      }
      break;
    }
    case "healFace": {
      const ps = effect.enemy ? opponent : caster;
      const hp = ps.getState("hp") ?? 0;
      ps.setState("hp", Math.min(HEALTH_POINTS, hp + (effect.amount||0)), true);
      break;
    }
    case "dealFace": {
      const ps = effect.enemy ? opponent : caster;
      const hp = ps.getState("hp") ?? 0;
      ps.setState("hp", Math.max(0, hp - (effect.amount||0)), true);
      break;
    }
    // add more: buff friendly minion, summon tokens, etc.
  }
}

registerKeyword(Keyword.BATTLECRY, {
  onMinionPlayed(ctx) {
    // ctx: { caster, opponent, uid, base, deckMap }
    const { effects } = getCardKeywords(ctx.base);
    for (const eff of effects) {
      if (eff.typeGroup === "battlecry") runEffectPayload(eff, ctx);
    }
  },
});

registerKeyword(Keyword.DEATHRATTLE, {
  onMinionDied(ctx) {
    // ctx: { ownerPS, opponentPS, uid, base, deckMap }
    const { effects } = getCardKeywords(ctx.base);
    for (const eff of effects) {
      if (eff.typeGroup === "deathrattle") runEffectPayload(eff, {
        caster: ctx.ownerPS,
        opponent: ctx.opponentPS,
        deckMap: ctx.deckMap,
      });
    }
  },
});

// START/END OF TURN
registerKeyword(Keyword.START_OF_TURN, {
  onTurnStart(ctx) {
    // scan board for startTurn effects
    const bs = getBS(ctx.player);
    for (const [uid, st] of Object.entries(bs)) {
      const baseId = uid.split("#")[0];
      const card = ctx.CARDS_BY_ID[baseId];
      const { effects } = getCardKeywords(card);
      for (const eff of effects) {
        if (eff.typeGroup === "startTurn") {
          runEffectPayload(eff, { caster: ctx.player, opponent: ctx.foe, deckMap: ctx.deckMap });
        }
      }
    }
  },
});

export { Keyword };
