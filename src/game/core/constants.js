// constants.js
// All the magic numbers for the ruleset.
// Change them here – every other core file imports from this module.

export const HEALTH_POINTS = 10;
export const STARTING_MANA = 7;
export const MAX_MANA = 10;
export const START_HAND_SIZE = 5;
export const MAX_HAND_SIZE = 5;
export const DECK_COPIES = 3; // how many copies of each card when building a deck
export const TICK_MS = 50; // host request‑processing tick

export const CARD_HEIGHT = 150;
export const CARD_WIDTH = 100;

export const MY_HAND_Y = 985;
export const OPP_HAND_Y = 80;

// ------------------------------------
//  Colour palette for EVERY card-UI bit
// ------------------------------------
export const CARD_COLORS = {
  base:           0x723c05,   // light wood
  frame:          0x2e1802,   // dark wood
  shadow:         0x000000,
  gradientTop:    0xeeeeee,
  gradientBottom: 0x999999,
  nameBg:         0x000000,
  nameText:       0xffffff,
  costFill:       0x0080ff,
  costStroke:     0xffffff,
  atkHpBg:        0x000000,
  atkText:        0xffffff,
  hpText:         0xffffff,
  spellText:      0xffe066,
  selectOutline:  0xffff00,
  attackOutline:  0x00ff66,
  hexNameText:    '#ffffff',
  hexCostText:    '#ffffff',
  hexHpText:      '#ffffff',
  hexAtkText:     '#ffffff',
  hexSpellText:   '#ffffff',
};
