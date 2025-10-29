// Level configuration for Dice Chess
import type { StoryCard } from "./types";

export type EquipType = "sword" | "shield" | "lance" | "torch" | "bow" | "staff" | "crystal_ball" | "disguise" | "scythe" | "banner" | "curse" | "skull" | "purse";
export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";

// Terrain cell types: R=rock, F=forest, W=water, _=none/empty, n=random
export type TerrainConfigCell = "R" | "F" | "W" | "_" | "n";

export interface NamedPiece {
  type: PieceType;
  name: string;
  equip?: EquipType;
  speechLines?: string[]; // Custom speech lines for this featured piece
}

export type BotBehavior = "aggressive" | "defensive" | "balanced";

export interface LevelConfig {
  level: number;
  name: string;
  boardSize: number;
  startingGold: number;
  enemyArmyGold: number;
  playerArmyGold: number;
  // Optional: Fixed terrain matrix. If not provided, uses random generation
  // Each row represents a board row (from white's side to black's side)
  // R=rock, F=forest, W=water, _=empty, n=random
  terrainMatrix?: TerrainConfigCell[][];
  // Optional: Custom name for white king
  whiteKingName?: string;
  // Optional: Named white pieces with specific equipment (spawned with priority)
  namedWhitePieces?: NamedPiece[];
  // Optional: Named black pieces with specific equipment
  namedBlackPieces?: NamedPiece[];
  // Bot AI behavior for this level
  botBehavior?: BotBehavior; // Defaults to "balanced" if not specified
  // Story cards for this level (shown before market)
  storyCards?: StoryCard[];
  // Items available for randomization (black and white) and purchase (white only)
  availableItems: {
    blackRandomization: EquipType[];
    whiteRandomization: EquipType[];
    whitePurchase: EquipType[];
  };
}

// Define all available equipment
const ALL_ITEMS: EquipType[] = [
  "sword",
  "shield",
  "lance",
  "torch",
  "bow",
  "staff",
  "crystal_ball",
  "disguise",
  "scythe",
  "banner",
  "curse",
  "skull",
  "purse"
];

// White-side items exclude Purse (black-only drop)
const WHITE_ITEMS: EquipType[] = ALL_ITEMS.filter((item) => item !== "purse");

// Define level configurations
export const levelConfigs: LevelConfig[] = [
  {
    level: 1,
    name: "First Steps",
    boardSize: 5,
    startingGold: 100,
    enemyArmyGold: 200,
    playerArmyGold: 170,
    botBehavior: "aggressive",
    whiteKingName: "Arthur",
    namedWhitePieces: [
      { 
        type: "N", 
        name: "Sir Galahad", 
        equip: "sword",
        speechLines: [
          "For **honor** and **glory**!",
          "My blade is **true**!",
          "Stand fast, companions!"
        ]
      }
    ],
    namedBlackPieces: [
      { 
        type: "R", 
        name: "Count Weasel", 
        equip: "bow",
        speechLines: [
          "You'll **never** catch me!",
          "**Hehehehe**!",
          "Too slow, fool!",
          "My arrows **never** miss!"
        ]
      }
    ],
    storyCards: [
      {
        id: "level1-intro",
        character: {
          type: "R",
          color: "b",
          equip: "bow",
          name: "Count Weasel"
        },
        bodyText: "You're governing like a loser.",
        // For images: Place PNG/SVG in public folder, then use: image: "/yourimage.png"
        // Or use external URL: image: "https://..."
        leftChoice: {
          text: "Pardon me?",
          events: [
            { type: "give_gold", amount: 20 },
            { type: "start_battle" }
          ]
        },
        rightChoice: {
          text: "Challenge accepted!",
          events: [
            { type: "give_prayer_die" },
            { type: "start_battle" }
          ]
        }
      }
    ],
    availableItems: {
      blackRandomization: ["sword", "shield", "lance"],
      whiteRandomization: ["sword", "shield"],
      whitePurchase: ["sword", "shield"]
    }
  },
  {
    level: 2,
    name: "Rising Threat",
    boardSize: 6,
    startingGold: 0,
    enemyArmyGold: 270,
    playerArmyGold: 0, // Survivors carry over
    botBehavior: "defensive",
    terrainMatrix: [
      ["R", "R", "W", "_", "n", "n"],
      ["R", "n", "W", "_", "W", "n"],
      ["n", "W", "_", "_", "W", "n"],
      ["n", "W", "_", "W", "n", "n"],
      ["n", "W", "_", "W", "n", "n"],
      ["n", "n", "_", "n", "n", "n"]
    ],
    availableItems: {
      blackRandomization: ["bow", "torch", "purse"],
      whiteRandomization: ["sword", "shield"],
      whitePurchase: ["sword", "shield"]
    }
  },
  {
    level: 3,
    name: "Tactical Mastery",
    boardSize: 7,
    startingGold: 0,
    enemyArmyGold: 340,
    playerArmyGold: 0, // Survivors carry over
    botBehavior: "balanced",
    availableItems: {
      blackRandomization: ["sword", "shield", "torch", "staff", "crystal_ball", "purse"],
      whiteRandomization: ["sword", "shield", "torch", "crystal_ball"],
      whitePurchase: ["sword", "shield"]
    }
  },
  {
    level: 4,
    name: "Dark Forces",
    boardSize: 8,
    startingGold: 0,
    enemyArmyGold: 410,
    playerArmyGold: 0, // Survivors carry over
    availableItems: {
      blackRandomization: ["sword", "shield", "lance", "torch", "bow", "scythe", "curse", "purse"],
      whiteRandomization: ["sword", "shield", "torch", "bow", "lance", "staff", "crystal_ball", "banner"],
      whitePurchase: ["sword", "shield", "torch", "bow", "lance", "staff", "crystal_ball", "banner", "disguise"]
    }
  },
  {
    level: 5,
    name: "Elite Challenge",
    boardSize: 9,
    startingGold: 0,
    enemyArmyGold: 480,
    playerArmyGold: 0, // Survivors carry over
    availableItems: {
      blackRandomization: ALL_ITEMS,
      whiteRandomization: WHITE_ITEMS,
      whitePurchase: WHITE_ITEMS
    }
  }
];

// Helper function to get level configuration
export function getLevelConfig(level: number): LevelConfig {
  let config: LevelConfig | undefined = undefined;
  for (let i = 0; i < levelConfigs.length; i++) {
    if (levelConfigs[i].level === level) {
      config = levelConfigs[i];
      break;
    }
  }
  if (!config) {
    // If level doesn't exist, return a scaled version of the last level
    const lastLevel = levelConfigs[levelConfigs.length - 1];
    const levelDiff = level - lastLevel.level;
      return {
        level,
        name: `Level ${level}`,
        boardSize: Math.min(lastLevel.boardSize + Math.floor(levelDiff / 2), 12), // Cap at 12x12
        startingGold: lastLevel.startingGold,
        enemyArmyGold: lastLevel.enemyArmyGold + levelDiff * 70, // Scale up by 70 gold per level
        playerArmyGold: lastLevel.playerArmyGold,
        availableItems: lastLevel.availableItems
      };
  }
  return config;
}