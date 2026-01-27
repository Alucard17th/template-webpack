export const CHARACTERS = [
  {
    id: "char-1",
    name: "Char 1",
    imageKey: "char_1",
    imagePath: "characters/char-1.jpg",
    passive: {
      name: "Passive (Placeholder)",
      description: "Placeholder passive ability.",
    },
    quotes: {
      idle: ["…", "Let’s begin."],
      myTurn: ["My move.", "Time to strike."],
      oppTurn: ["I’m watching.", "Interesting."],
      manaLow: ["I need mana…", "Not enough power."],
    },
  },
  {
    id: "char-2",
    name: "Char 2",
    imageKey: "char_2",
    imagePath: "characters/char-2.jpg",
    passive: {
      name: "Passive (Placeholder)",
      description: "Placeholder passive ability.",
    },
    quotes: {
      idle: ["Ready when you are.", "…"],
      myTurn: ["Let’s go!", "Watch this!"],
      oppTurn: ["Your turn, huh?", "Go on."],
      manaLow: ["Running dry…", "Need more mana!"],
    },
  },
  {
    id: "char-3",
    name: "Char 3",
    imageKey: "char_3",
    imagePath: "characters/char-3.jpg",
    passive: {
      name: "Passive (Placeholder)",
      description: "Placeholder passive ability.",
    },
    quotes: {
      idle: ["Silence…", "Focus."],
      myTurn: ["I decide the tempo.", "Now."],
      oppTurn: ["I can wait.", "Show me."],
      manaLow: ["My mana…", "This is bad."],
    },
  },
  {
    id: "char-4",
    name: "Char 4",
    imageKey: "char_4",
    imagePath: "characters/char-4.jpg",
    passive: {
      name: "Passive (Placeholder)",
      description: "Placeholder passive ability.",
    },
    quotes: {
      idle: ["Heh.", "Let’s have fun."],
      myTurn: ["All in.", "No holding back."],
      oppTurn: ["Try me.", "Don’t blink."],
      manaLow: ["Out of juice…", "Need mana."],
    },
  },
  {
    id: "char-5",
    name: "Char 5",
    imageKey: "char_5",
    imagePath: "characters/char-5.jpg",
    passive: {
      name: "Passive (Placeholder)",
      description: "Placeholder passive ability.",
    },
    quotes: {
      idle: ["Stay sharp.", "We fight."],
      myTurn: ["Forward!", "Now we push."],
      oppTurn: ["I won’t fall.", "Come."],
      manaLow: ["Mana is low…", "Careful."],
    },
  },
  {
    id: "char-6",
    name: "Char 6",
    imageKey: "char_6",
    imagePath: "characters/char-6.jpg",
    passive: {
      name: "Passive (Placeholder)",
      description: "Placeholder passive ability.",
    },
    quotes: {
      idle: ["Another duel.", "Let’s settle this."],
      myTurn: ["My blade first.", "I’m ready."],
      oppTurn: ["I’ll endure.", "Your move."],
      manaLow: ["Not enough mana…", "I’m drained."],
    },
  },
];

export const CHARACTERS_BY_ID = Object.fromEntries(
  CHARACTERS.map((c) => [c.id, c])
);
