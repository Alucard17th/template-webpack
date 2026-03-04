// tests/smoke.test.js
// Run: node tests/smoke.test.js

import test from "node:test";
import assert from "node:assert/strict";

/* ============================================================
 * Minimal shared constants (tweak to match your game)
 * ============================================================ */
const START_HAND_SIZE = 3;
const MAX_HAND_SIZE = 10;
const MAX_MANA = 10;
const HEALTH_POINTS = 20;

/* ============================================================
 * Mock PlayerState (playroomkit-like)
 * ============================================================ */
class MockPlayerState {
  constructor(id, name = "P") {
    this.id = id;
    this._state = new Map();
    this._profile = { name };
  }
  getState(k) { return this._state.get(k); }
  setState(k, v /*, publish = true */) { this._state.set(k, v); }
  getProfile() { return this._profile; }
  onQuit() {} // noop
}

/* ============================================================
 * Mock Deck
 * ============================================================ */
class MockDeck {
  constructor(cards) {
    // cards = array of {uid, baseId}
    this.stack = [...cards]; // top = end
  }
  draw() { return this.stack.pop(); }
  size() { return this.stack.length; }
  shuffle() { return this; } // noop for tests
}

/* ============================================================
 * Keyword Registry (super tiny)
 * - Implements BATTLECRY: draw X
 * ============================================================ */
const Keyword = { BATTLECRY: "battlecry" };
const keywordRegistry = new Map();

function registerKeyword(name, impl) { keywordRegistry.set(name, impl); }
function getKeyword(name) { return keywordRegistry.get(name); }

// minimal runner for battlecry payloads
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

// hook battlecry on “minionPlayed”
registerKeyword(Keyword.BATTLECRY, {
  onMinionPlayed(ctx) {
    // ctx: { caster, opponent, uid, base, deckMap }
    const effects = ctx.base.effects || [];
    for (const eff of effects) {
      if (eff.typeGroup === "battlecry") runEffectPayload(eff, ctx);
    }
  },
});

/* ============================================================
 * Minimal TurnManager (host-only startTurn)
 *  - +1 turnCount
 *  - refill mana to min(turnCount, MAX_MANA)
 *  - draw 1 card after the first turn if hand not full and deck not empty
 * ============================================================ */
class MiniTurnManager {
  constructor(deckMap) { this.deckMap = deckMap; }
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
        player.setState("hp", Math.max(0, hp - 1)); // fatigue ping
        player.setState("deckEmpty", true);
      }
    }
    player.setState("deckSizeSelf", deck.size());
  }
}

/* ============================================================
 * Minimal RequestQueue._handlePlayCard (just enough for test)
 *  - pay mana
 *  - move from hand -> board
 *  - seed boardState
 *  - trigger BATTLECRY hooks
 * ============================================================ */
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
    assert.ok(mana >= cost, "not enough mana in test");

    p.setState("mana", mana - cost);

    // move card
    const newHand = [...hand];
    newHand.splice(idx, 1);
    const newBoard = [...board, uid];
    p.setState("hand", newHand);
    p.setState("board", newBoard);

    // seed boardState if creature
    if (card?.type === "creature") {
      const bs = { ...(p.getState("boardState") || {}) };
      const tags = (card.keywords || []).reduce((a,k)=> (a[k]=true, a), {});
      bs[uid] = { atk: card.attack, hp: card.health, tags, attacksLeft: 1 };
      p.setState("boardState", bs);
    }

    // fire battlecry hook if any
    const foe = this.players.find(x => x.id !== p.id);
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

/* ============================================================
 * Test cards
 * ============================================================ */
const CARDS_BY_ID = {
  // a vanilla creature for filler
  VANILLA_1_1: { id:"VANILLA_1_1", type:"creature", name:"Vanilla 1/1", attack:1, health:1, cost:1 },
  // a battlecry: draw 1 minion
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

/* ============================================================
 * Helpers to seed decks with identifiable UIDs
 * ============================================================ */
function makeStack(baseId, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ uid: `${baseId}#${i+1}`, baseId });
  }
  return out;
}

/* ============================================================
 * TESTS
 * ============================================================ */
test("TurnManager.startTurn: mana ramps and draws after T>1", () => {
  const p1 = new MockPlayerState("A", "Alice");
  const deckA = new MockDeck(makeStack("VANILLA_1_1", 5));
  const decks = new Map([[p1.id, deckA]]);
  const tm = new MiniTurnManager(decks);

  // initial
  p1.setState("hp", HEALTH_POINTS);
  p1.setState("hand", []);
  p1.setState("board", []);

  // T1
  tm.startTurn(p1);
  assert.equal(p1.getState("turnCount"), 1);
  assert.equal(p1.getState("mana"), 1);
  assert.equal(p1.getState("hand").length, 0);
  assert.equal(p1.getState("deckSizeSelf"), 5);

  // T2
  tm.startTurn(p1);
  assert.equal(p1.getState("turnCount"), 2);
  assert.equal(p1.getState("mana"), 2);
  assert.equal(p1.getState("hand").length, 1, "should draw 1 after first turn");
  assert.equal(p1.getState("deckSizeSelf"), 4);
});

test("RequestQueue._handlePlayCard + Battlecry(draw1) increases hand by 1, decrements deck", () => {
  const p1 = new MockPlayerState("A", "Alice");
  const p2 = new MockPlayerState("B", "Bob");
  const players = [p1, p2];

  // Deck for p1 with 3 vanilla cards behind the one in hand to draw
  const deckA = new MockDeck(makeStack("VANILLA_1_1", 3));
  const deckMap = new Map([[p1.id, deckA]]);
  const tm = new MiniTurnManager(deckMap);
  const rq = new MiniRequestQueue(players, tm, CARDS_BY_ID);

  // seed p1
  p1.setState("hp", HEALTH_POINTS);
  p1.setState("mana", 10);
  p1.setState("hand", [`BC_DRAW_1#hand1`]); // the battlecry minion in hand
  p1.setState("board", []);
  p1.setState("deckSizeSelf", deckA.size());

  // ACT: play the BC minion
  rq._handlePlayCard(p1, `BC_DRAW_1#hand1`);

  // EXPECT:
  const hand = p1.getState("hand");
  const board = p1.getState("board");
  const bs = p1.getState("boardState");

  assert.equal(board.length, 1, "minion is on board");
  assert.ok(bs[board[0]], "boardState seeded");
  assert.equal(hand.length, 1, "hand back to 1 (spent bc minion, drew 1)");

  // The drawn card must be from deck VANILLA_1_1:
  const drawnUid = hand[0];
  assert.ok(drawnUid.startsWith("VANILLA_1_1#"), "drew from deck");

  // deck decreased by 1
  assert.equal(deckA.size(), 2, "deck should be 2 after drawing 1 of 3");
  assert.equal(p1.getState("deckSizeSelf"), 2, "deckSizeSelf mirrored");
});

test("Fatigue ping when drawing on turn start with empty deck", () => {
  const p1 = new MockPlayerState("A", "Alice");
  const emptyDeck = new MockDeck([]); // empty
  const decks = new Map([[p1.id, emptyDeck]]);
  const tm = new MiniTurnManager(decks);

  p1.setState("hp", 5);
  p1.setState("hand", []);
  p1.setState("board", []);

  // T1
  tm.startTurn(p1);
  assert.equal(p1.getState("hp"), 5);

  // T2 tries to draw but deck is empty -> hp -1
  tm.startTurn(p1);
  assert.equal(p1.getState("hp"), 4, "fatigue dealt 1 damage");
  assert.equal(p1.getState("deckEmpty"), true);
});
