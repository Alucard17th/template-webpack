export const CARDS = [
  {
    id: "001",
    frame: "001_goblin",
    type: "creature",
    name: "Goblin",
    attack: 2,
    health: 1,
    cost: 1,
  },
  {
    id: "002",
    frame: "002_fireball",
    type: "spell",
    name: "Fireball",
    damage: 3,
    cost: 2,
  },
  {
    id: "003",
    frame: "003_orc",
    type: "creature",
    name: "Orc",
    attack: 3,
    health: 3,
    cost: 3,
  },
  {
    id: "004",
    frame: "004_heal",
    type: "spell",
    name: "Healing Touch",
    heal: 3,
    cost: 2,
  },
  {
    id: "005",
    frame: "005_dragon",
    type: "creature",
    name: "Dragon",
    attack: 7,
    health: 6,
    cost: 7,
  },
  {
    id: "006",
    frame: "006_battle_roar",
    type: "spell",
    name: "Power Boost",
    cost: 2,
    boostAttack: 2, // amount of attack to add
    description: "Increase the attack of a friendly creature by 3."
  },
  {
  id: "007",
  frame: "007_mana_surge",
  name: "Mana Surge",
  type: "spell",
  cost: 2,
  boostMana: 2, // ✅ custom property
  description: "Increase your max mana by 2 this turn."
}
];
export const CARDS_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
