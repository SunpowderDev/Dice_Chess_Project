export const S = 7;
export const W = "w" as const;
export const B = "b" as const;
export const N = "n" as const; // Neutral color for rocks
export const RAD = 2;

export const VAL = { Q: 80, R: 50, B: 30, N: 35, P: 10 } as const;

export const PIECE_COSTS = {
  Q: 80,
  R: 50,
  B: 30,
  N: 35,
  P: 10,
  K: 0, // King cannot be purchased
} as const;

export const ITEM_COSTS = {
  sword: 10,
  shield: 10,
  lance: 15,
  torch: 5,
  bow: 15,
  staff: 20,
  crystal_ball: 5,
  prayer_die: 70,
  disguise: 15,
  scythe: 50,
  banner: 30,
  curse: 20,
  skull: 40,
  purse: 0, // Not purchasable, black-only item
} as const;

// Animation timing presets
export const TIMING = {
  normal: {
    roll: 950,
    linger: 400,
    mods: 300,
    total: 300,
    winnerHold: 400,
    botThink: 300,
    bubble: 3500,
    rerollFinish: 1500,
  },
  fast: {
    roll: 450,
    linger: 150,
    mods: 150,
    total: 150,
    winnerHold: 200,
    botThink: 100,
    bubble: 1600,
    rerollFinish: 650,
  },
} as const;

// Use white-outline glyphs for BOTH colors
export const GL = {
  K: { w: "\u2654", b: "\u265A" }, // ♔♚
  Q: { w: "\u2655", b: "\u265B" }, // ♕♛
  R: { w: "\u2656", b: "\u265C" }, // ♖♜
  B: { w: "\u2657", b: "\u265D" }, // ♗♝
  N: { w: "\u2658", b: "\u265E" }, // ♘♞
  P: { w: "\u2659", b: "\u265F" }, // ♙♟ (black pawn glyph)
  ROCK: { n: "🪨" },
} as const;

export const PHRASES = {
  w: {
    win: [
      "Have at thee, ye muckworm!",
      "A fine blow!",
      "Quite tidy.",
      "Off with thee!",
      "The scoundrel falls!",
      "For glory!",
      "Ho! Take that, thou addle-pated hedgepig!",
      "Begone!",
      "One hates to brag.",
      "See ya in hell, ye lubber!",
    ],
    lose: [
      "Fie and fiddlesticks!",
      "Cursed luck!",
      "A pox on thy brood, knave!",
      "Treachery!",
      "The knave got lucky!",
      "Touché",
      "Mustn't grumble, but I shall.",
      "Most unsporting for me.",
      "Most irregular.",
      "The cur got lucky, mark me!",
      "You goatish skainsmate!",
      "Ya foul bogsnot.",
    ],
  },
  b: {
    win: [
      "Magnifique!",
      "Out you go, imbécile.",
      "Précis, implacable, élégant.",
      "Get rekt, mon gars.",
      "Quelle victoire !",
      "Superbe!",
      "Formidable!",
      "C'est fini pour toi",
      "Retourne chez maman!",
      "Quelle gifle!",
      "Voilà l'art royal!",
    ],
    lose: [
      "Merde alors",
      "La fortune m'abandonne.",
      "Hélas, quelle inconvenance.",
      "Zut alors!",
      "Sacrebleu!",
      "Impossible!",
      "Mon Dieu!",
      "Quelle audace—je vous salue.",
      "L'élégance survit à la défaite.",
      "Bordel, ça pique.",
    ],
  },
};

export const NAMED_PHRASES = {
  w: {
    win: [
      "Triumph for [UnitName].",
      "[UnitName] smites and stands.",
      "Glory to [UnitName].",
      "[UnitName] breaks them.",
      "The day is [UnitName]'s.",
      "[UnitName] carries the field.",
      "Routed by [UnitName].",
      "[UnitName] proves stout.",
      "Make way for [UnitName].",
      "[UnitName] wins the hour.",
      "None stand 'gainst [UnitName].",
      "[UnitName] hews a path.",
      "Honor crowns [UnitName].",
      "[UnitName] will not yield.",
      "[UnitName] strikes true.",
      "Another for [UnitName].",
      "Onward, [UnitName].",
      "Steel sang, and [UnitName] kept the tune.",
      "[UnitName], rabblescatter",
      "The day is [UnitName]'s; let none gainsay it.",
    ],
    lose: [
      "A pox on thee! [UnitName] has fallen!",
      "[UnitName] fought bravely.",
      "Cursed luck! Farewell, [UnitName].",
      "Fie! They got [UnitName]!",
      "Silence for [UnitName].",
      "[UnitName] pays the price.",
      "Darkness takes [UnitName].",
      "[UnitName] is spent.",
      "Earth claims [UnitName].",
      "Thus ends [UnitName]; remember it well.",
      "[UnitName] hath breathed their last.",
      "Lo, [UnitName] is laid low.",
      "The earth drinketh the blood of [UnitName].",
      "Ashes claim [UnitName]; the tale is told.",
      "Here lieth [UnitName], undone by fate.",
      "[UnitName] went bold; death went bolder.",
    ],
    taunt: [
      "Begone, [UnitName]!",
      "And so falls [UnitName]!",
      "A poor showing from [UnitName].",
      "Was that thy best, [UnitName]?",
      "Too slow by half, [UnitName].",
      "Your boast ends here, [UnitName].",
      "Rest that empty helm, [UnitName].",
      "Thus much for thee, [UnitName].",
      "Fame dodged you, [UnitName].",
      "Mind the worms, [UnitName].",
      "Your legend was brief, [UnitName].",
      "Taste mud, [UnitName].",
      "Down you go, [UnitName].",
      "Bested and best left, [UnitName].",
      "Hold that pose, [UnitName].",
      "Grave manners, [UnitName].",
      "I'll send flowers to your sister, [UnitName].",
    ],
  },
  b: {
    win: [
      "Magnifique, [UnitName]!",
      "[UnitName] sends their regards.",
      "A flawless victory for [UnitName]!",
      "C'est fini! [UnitName] triumphs!",
      "[UnitName] ne pardonne pas.",
      "[UnitName] est inarrêtable.",
      "[UnitName] c'est une menace!",
    ],
    lose: [
      "Merde! [UnitName] is lost!",
      "Hélas, [UnitName]...",
      "Impossible ! Ils ont vaincu [UnitName]!",
      "[UnitName] sera vengé!",
      "Repos pour [UnitName].",
      "[UnitName] perd le jour.",
      "Fin pour [UnitName].",
      "Putain. [UnitName] tombe.",
    ],
    taunt: [
      "Adieu, [UnitName].",
      "C'est un triste jour pour être, [UnitName]!",
      "Misérable, [UnitName]!",
      "Au revoir, [UnitName]!",
      "À genoux, [UnitName] !",
    ],
  },
};

export const SWING_PHRASES = {
  w: [
    "A turning of the tides!",
    "A jolly good blunder.",
    "A most satisfactory conclusion, yes?",
    "Capital manoeuvre, if I may say.",
    "Thou shalt not recover from this mighty blow!",
    "A pivotal moment!",
    "Press the advantage!",
    "A most encouraging gift.",
  ],
  b: [
    "Parbleu—la perfection a parlé.",
    "La position respire!",
    "Le vent tourne!",
    "Un coup dévastateur!",
    "C'est le début de la fin!",
    "Grosse swing—tenez bon, les gars!",
    "Un moment charnière!",
  ],
};

export const ITEM_DESCRIPTIONS = {
  sword: "🗡️ Sword: +1 to attack rolls.",
  shield: "🛡️ Shield: +1 to defense rolls.",
  lance:
    "⚔️ Lance: One-time 2-square forward attack with Advantage; breaks on use.",
  scythe: "Scythe: Always rolls a 6 against pawns.",
  banner: "⚜️ Banner: Friendly pieces within 1 square gain a Shield bonus.",
  curse: "🎃 Curse: When this piece dies, stuns adjacent pieces for 1 turn.",
  skull: "💀 Skull: When this piece dies, the attacker dies with it.",
  torch:
    "🔥 Torch: Piece sees 3 squares away (normally 2) and gains Advantage when attacking into a Forest.",
  bow: "🏹 Bow: Survive your first failed attack; bow breaks.",
  staff: "🪄 Staff: On a win, convert the defender to your side; staff breaks.",
  crystal_ball:
    "🔮 Crystal Ball: One-time swap with an adjacent friendly piece.",
  prayer_die:
    "🙏 Prayer Die: Consume to reroll one of your failed attack or defense rolls.",
  disguise:
    "🎭 Disguise: Piece appears and moves as a Pawn. You can break the disguise on your turn to reveal the original piece.",
  purse: "💰 Purse: When killed, grants 25 gold.",
};

export const PIECE_DESCRIPTIONS = {
  K: "♔ King: The leader of your army. Moves one square in any direction. Attacks with Advantage (roll 2 dice, keep highest). If captured, you lose.",
  Q: "♕ Queen: Moves any number of squares along a rank, file, or diagonal.",
  R: "♖ Rook: Moves any number of squares along a rank or file.",
  B: "♗ Bishop: Moves any number of squares diagonally.",
  N: '♘ Knight: Moves in an "L" shape: two squares in a cardinal direction, then one square perpendicular.',
  P: "♙ Pawn: Moves one square forward. Captures one square diagonally forward.",
};

export const PIECE_NAMES = {
  K: "King",
  Q: "Queen",
  R: "Rook",
  B: "Bishop",
  N: "Knight",
  P: "Pawn",
} as const;

