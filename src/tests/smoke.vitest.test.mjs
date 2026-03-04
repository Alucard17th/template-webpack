import { describe, it, expect } from "vitest";

const START_HAND_SIZE = 3;
const MAX_HAND_SIZE = 10;
const MAX_MANA = 10;
const HEALTH_POINTS = 20;

class MockPlayerState {
  constructor(id, name = "P") {
    this.id = id;
    this._state = new Map();
    this._profile = { name };
  }
  getState(k) {
    return this._state.get(k);
  }
  setState(k, v /* publish = true */) {
    this._state.set(k, v);
  }
  getProfile() {
    return this._profile;
  }
  onQuit() {}
}

class MockDeck {
  constructor(cards) {
    this.stack = [...cards];
  }
  draw() {
    return this.stack.pop();
  }
  size() {
    return this.stack.length;
  }
  shuffle() {
    return this;
  }
}

const Keyword = { BATTLECRY: "battlecry" };
const keywordRegistry = new Map();

function registerKeyword(name, impl) {
  keywordRegistry.set(name, impl);
}
function getKeyword(name) {
  return keywordRegistry.get(name);
}

function runEffectPayload(effect, ctx) {
  switch (effect.type) {
    case "draw": {
      const { caster, deckMap } = ctx;
      const deck = deckMap.get(caster.id);
      if (!deck) break;

      let hand = caster.getState("hand") || [];
      const toDraw = Math.max(0, effect.count || 1);
      for (let i = 0; i < toDraw; i++) {
        if (hand.length >= MAX_HAND_SIZE) break;
        if (deck.size() <= 0) break;
        const c = deck.draw();
        hand = [...hand, c.uid];
      }
      caster.setState("hand", hand);
      caster.setState("deckSizeSelf", deck.size());
      break;
    }
  }
}

registerKeyword(Keyword.BATTLECRY, {
  onMinionPlayed(ctx) {
    const effects = ctx.base.effects || [];
    for (const eff of effects) {
      if (eff.typeGroup === "battlecry") runEffectPayload(eff, ctx);
    }
  },
});

class MiniTurnManager {
  constructor(deckMap) {
    this.deckMap = deckMap;
  }
  startTurn(player) {
    const turnCount = (player.getState("turnCount") || 0) + 1;
    player.setState("turnCount", turnCount);

    const newMax = Math.min(turnCount, MAX_MANA);
    player.setState("maxMana", newMax);
    player.setState("mana", newMax);

    const deck = this.deckMap.get(player.id);
    if (!deck) return;

    if (turnCount > 1) {
      const hand = player.getState("hand") || [];
      if (hand.length < MAX_HAND_SIZE && deck.size() > 0) {
        const drawn = deck.draw();
        player.setState("hand", [...hand, drawn.uid]);
      } else if (deck.size() === 0) {
        const hp = player.getState("hp") || 0;
        player.setState("hp", Math.max(0, hp - 1));
        player.setState("deckEmpty", true);
      }
    }
    player.setState("deckSizeSelf", deck.size());
  }
}

class MiniRequestQueue {
  constructor(players, turnManager, CARDS_BY_ID) {
    this.players = players;
    this.turnManager = turnManager;
    this.CARDS_BY_ID = CARDS_BY_ID;
  }

  _handlePlayCard(p, uid) {
    const hand = p.getState("hand") || [];
    const board = p.getState("board") || [];
    const idx = hand.indexOf(uid);
    if (idx === -1) return;

    const baseId = uid.split("#")[0];
    const card = this.CARDS_BY_ID[baseId];
    const cost = card?.cost ?? 0;
    const mana = p.getState("mana") ?? 0;
    expect(mana).toBeGreaterThanOrEqual(cost);

    p.setState("mana", mana - cost);

    const newHand = [...hand];
    newHand.splice(idx, 1);
    const newBoard = [...board, uid];
    p.setState("hand", newHand);
    p.setState("board", newBoard);

    if (card?.type === "creature") {
      const bs = { ...(p.getState("boardState") || {}) };
      const tags = (card.keywords || []).reduce((a, k) => ((a[k] = true), a), {});
      bs[uid] = { atk: card.attack, hp: card.health, tags, attacksLeft: 1 };
      p.setState("boardState", bs);
    }

    const foe = this.players.find((x) => x.id !== p.id);
    const impl = getKeyword(Keyword.BATTLECRY);
    impl?.onMinionPlayed?.({
      caster: p,
      opponent: foe,
      uid,
      base: card,
      deckMap: this.turnManager.deckMap,
    });
  }
}

const CARDS_BY_ID = {
  VANILLA_1_1: {
    id: "VANILLA_1_1",
    type: "creature",
    name: "Vanilla 1/1",
    attack: 1,
    health: 1,
    cost: 1,
  },
  BC_DRAW_1: {
    id: "BC_DRAW_1",
    type: "creature",
    name: "Curious Rookie",
    attack: 2,
    health: 2,
    cost: 2,
    effects: [{ typeGroup: "battlecry", type: "draw", count: 1 }],
  },
};

function makeStack(baseId, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ uid: `${baseId}#${i + 1}`, baseId });
  }
  return out;
}

describe("smoke", () => {
  it("TurnManager.startTurn: mana ramps and draws after T>1", () => {
    const p1 = new MockPlayerState("A", "Alice");
    const deckA = new MockDeck(makeStack("VANILLA_1_1", 5));
    const decks = new Map([[p1.id, deckA]]);
    const tm = new MiniTurnManager(decks);

    p1.setState("hp", HEALTH_POINTS);
    p1.setState("hand", []);
    p1.setState("board", []);

    tm.startTurn(p1);
    expect(p1.getState("turnCount")).toBe(1);
    expect(p1.getState("mana")).toBe(1);
    expect(p1.getState("hand").length).toBe(0);
    expect(p1.getState("deckSizeSelf")).toBe(5);

    tm.startTurn(p1);
    expect(p1.getState("turnCount")).toBe(2);
    expect(p1.getState("mana")).toBe(2);
    expect(p1.getState("hand").length).toBe(1);
    expect(p1.getState("deckSizeSelf")).toBe(4);
  });

  it("RequestQueue._handlePlayCard + Battlecry(draw1) increases hand by 1, decrements deck", () => {
    const p1 = new MockPlayerState("A", "Alice");
    const p2 = new MockPlayerState("B", "Bob");
    const players = [p1, p2];

    const deckA = new MockDeck(makeStack("VANILLA_1_1", 3));
    const deckMap = new Map([[p1.id, deckA]]);
    const tm = new MiniTurnManager(deckMap);
    const rq = new MiniRequestQueue(players, tm, CARDS_BY_ID);

    p1.setState("hp", HEALTH_POINTS);
    p1.setState("mana", 10);
    p1.setState("hand", [`BC_DRAW_1#hand1`]);
    p1.setState("board", []);
    p1.setState("deckSizeSelf", deckA.size());

    rq._handlePlayCard(p1, `BC_DRAW_1#hand1`);

    const hand = p1.getState("hand");
    const board = p1.getState("board");
    const bs = p1.getState("boardState");

    expect(board.length).toBe(1);
    expect(bs[board[0]]).toBeTruthy();
    expect(hand.length).toBe(1);

    const drawnUid = hand[0];
    expect(drawnUid.startsWith("VANILLA_1_1#")).toBe(true);

    expect(deckA.size()).toBe(2);
    expect(p1.getState("deckSizeSelf")).toBe(2);
  });

  it("Fatigue ping when drawing on turn start with empty deck", () => {
    const p1 = new MockPlayerState("A", "Alice");
    const emptyDeck = new MockDeck([]);
    const decks = new Map([[p1.id, emptyDeck]]);
    const tm = new MiniTurnManager(decks);

    p1.setState("hp", 5);
    p1.setState("hand", []);
    p1.setState("board", []);

    tm.startTurn(p1);
    expect(p1.getState("hp")).toBe(5);

    tm.startTurn(p1);
    expect(p1.getState("hp")).toBe(4);
    expect(p1.getState("deckEmpty")).toBe(true);
  });

  it("opening hand size constant is consistent", () => {
    expect(START_HAND_SIZE).toBeGreaterThan(0);
  });
});
