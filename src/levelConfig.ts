// Level configuration for Dice Chess
import type { StoryCard } from "./types";

export type EquipType = "sword" | "shield" | "lance" | "torch" | "bow" | "staff" | "crystal_ball" | "disguise" | "scythe" | "banner" | "curse" | "skull" | "purse";
export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";

// Terrain cell types with optional obstacles in parentheses
// Examples: "F", "W", "_", "n", "W(Rock)", "F(Rock)", "_(Rock)"
// Terrain: F=forest, W=water, _=none/empty, n=random
// Obstacles: Rock (can be placed on any terrain)
export type TerrainConfigCell = string; // Flexible to support "W(Rock)" style notation

export interface NamedPiece {
  type: PieceType;
  name: string;
  equip?: EquipType;
  speechLines?: string[]; // Custom speech lines for this featured piece
}

export type BotBehavior = "aggressive" | "defensive" | "balanced";
export type VictoryCondition = "king_beheaded" | "king_captured" | "king_dishonored" | "king_escaped";

export interface LevelConfig {
  level: number;
  name: string;
  boardSize: number;
  startingGold: number;
  enemyArmyGold?: number; // DEPRECATED: Legacy field - falls back to this if enemyPieceGold/enemyEquipmentGold not specified. Use enemyPieceGold and enemyEquipmentGold for better control.
  playerArmyGold?: number; // DEPRECATED: Legacy field - falls back to this if playerPieceGold/playerEquipmentGold not specified. Use playerPieceGold and playerEquipmentGold for better control.
  // Optional: Separate gold pools for pieces and equipment (more control)
  enemyPieceGold?: number; // Gold specifically for enemy pieces (if not set, uses enemyArmyGold as fallback)
  enemyEquipmentGold?: number; // Gold specifically for enemy equipment randomization - controls how many pieces get equipment (if not set, uses enemyArmyGold as fallback)
  playerPieceGold?: number; // Gold specifically for player pieces (if not set, uses playerArmyGold as fallback)
  playerEquipmentGold?: number; // Gold specifically for player equipment randomization - controls how many pieces get equipment (if not set, uses playerArmyGold as fallback)
  // Optional: Difficulty-specific gold overrides (if provided, these override the base values above)
  difficultySettings?: {
    easy?: {
      enemyPieceGold?: number;
      enemyEquipmentGold?: number;
      playerPieceGold?: number;
      playerEquipmentGold?: number;
      guaranteedPieces?: {
        black?: Array<{ type: PieceType; equip?: EquipType }>;
        white?: Array<{ type: PieceType; equip?: EquipType }>;
      };
    };
    hard?: {
      enemyPieceGold?: number;
      enemyEquipmentGold?: number;
      playerPieceGold?: number;
      playerEquipmentGold?: number;
      guaranteedPieces?: {
        black?: Array<{ type: PieceType; equip?: EquipType }>;
        white?: Array<{ type: PieceType; equip?: EquipType }>;
      };
    };
  }
  // Optional: Pawn budget allocation (0.0 to 1.0) - percentage of piece gold to spend on pawns before generating other pieces
  enemyPawnBudget?: number; // Percentage of enemyPieceGold to allocate for pawns (e.g., 0.3 = 30% for pawns, 70% for back-rank pieces)
  playerPawnBudget?: number; // Percentage of playerPieceGold to allocate for pawns (e.g., 0.3 = 30% for pawns, 70% for back-rank pieces)
  // Optional: Guaranteed pieces that must spawn (don't consume gold budget)
  guaranteedPieces?: {
    black?: Array<{ type: PieceType; equip?: EquipType }>; // Pieces that must spawn for black
    white?: Array<{ type: PieceType; equip?: EquipType }>; // Pieces that must spawn for white
  };
  // Optional: Fixed terrain matrix. If not provided, uses random generation
  // Each row represents a board row (from white's side to black's side)
  // F=forest, W=water, _=empty, n=random
  // Obstacles can be added with parentheses: "W(Rock)", "F(Rock)", "_(Rock)"
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
  // Victory conditions for this level (defaults to all three if not specified)
  victoryConditions?: VictoryCondition[];
  // Victory conditions to display in the QUEST panel (defaults to all victoryConditions if not specified)
  // This allows hiding some conditions from the UI while still allowing them in gameplay
  displayedVictoryConditions?: VictoryCondition[];
  // Pawn promotion type (defaults to "Q" if not specified)
  pawnPromotionType?: PieceType;
  // Speech lines for courtier obstacles
  courtierSpeechLines?: string[];
  // Chance for each courtier to speak when the timer triggers (0.0 to 1.0, defaults to 0.3)
  courtierSpeechChance?: number;
  // Interval range in milliseconds between courtier speech checks (defaults to [2000, 5000])
  // Each check uses a random value between min and max for more natural timing
  courtierSpeechInterval?: number | { min: number; max: number };
  // Whether the market is available for this level (defaults to true)
  marketEnabled?: boolean;
  // Which pieces are available for purchase in the market (defaults to all except King: ["Q", "R", "B", "N", "P"])
  availablePieces?: PieceType[];
  // Which pieces are available for randomization when generating armies (defaults to all pieces: ["Q", "R", "B", "N", "P"])
  randomizationPieces?: {
    black?: PieceType[]; // Piece types that can be randomly generated for black army
    white?: PieceType[]; // Piece types that can be randomly generated for white army
  };
  // Number of enemy rows initially hidden by fog (defaults to 2 if not specified)
  // Controls how many rows from the enemy back rank are fogged at the start
  fogRows?: number;
  // Random terrain pool configuration for cells marked as "n" in terrainMatrix
  // Specifies how many of each terrain type/obstacle should be randomly placed
  // Example: { "rock": 2, "forest": 6, "water": 8 }
  randomTerrainPool?: {
    rock?: number;    // Number of rock obstacles to place
    forest?: number;  // Number of forest tiles to place
    water?: number;   // Number of water tiles to place
  };
  // Quest narration text displayed in the quest panel
  questNarration?: string;
  // Custom descriptions for victory conditions (overrides defaults)
  // Maps condition name to description text
  victoryConditionDescriptions?: Partial<Record<VictoryCondition, string>>;
}

// Define all available equipment (for fallback scaling)
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

// Cache for loaded level configs to avoid redundant fetches
const configCache = new Map<number, LevelConfig>();

/**
 * Loads a level configuration from a JSON file in /public/levels/
 * @param level - The level number to load
 * @returns Promise resolving to the level configuration
 */
export async function loadLevelConfig(level: number): Promise<LevelConfig> {
  // ALWAYS reload during development - skip cache
  // if (configCache.has(level)) {
  //   return configCache.get(level)!;
  // }

  try {
    const response = await fetch(`/levels/level${level}.json?t=${Date.now()}`, {
      cache: "no-cache" // Ensure fresh data during development
    });

    if (!response.ok) {
      throw new Error(`Failed to load level ${level}: ${response.statusText}`);
    }

    const config: LevelConfig = await response.json();
    
    // Validate the config has required fields
    if (!config.level || !config.name || !config.boardSize) {
      throw new Error(`Invalid level config for level ${level}`);
    }

    // Don't cache during development to allow hot reloading
    // configCache.set(level, config);
    
    return config;
  } catch (error) {
    console.warn(`Failed to load level ${level} from JSON, using fallback`, error);
    
    // If level doesn't exist, return a scaled fallback based on level 5
    const fallbackConfig: LevelConfig = {
      level,
      name: `Level ${level}`,
      boardSize: Math.min(9 + Math.floor((level - 5) / 2), 12), // Cap at 12x12
      startingGold: 0,
      enemyArmyGold: 480 + (level - 5) * 70, // Scale up by 70 gold per level
      playerArmyGold: 0,
      botBehavior: "balanced",
      availableItems: {
        blackRandomization: ALL_ITEMS,
        whiteRandomization: WHITE_ITEMS,
        whitePurchase: WHITE_ITEMS
      },
      marketEnabled: true,
      availablePieces: ["Q", "R", "B", "N", "P"]
    };

    // Cache the fallback
    configCache.set(level, fallbackConfig);
    
    return fallbackConfig;
  }
}

/**
 * Synchronous version for backward compatibility - uses cache only
 * @deprecated Use loadLevelConfig instead for proper async loading
 */
export function getLevelConfig(level: number): LevelConfig {
  const cached = configCache.get(level);
  if (cached) {
    return cached;
  }
  
  // Return a minimal fallback if not cached
  console.warn(`getLevelConfig called for level ${level} before it was loaded. Use loadLevelConfig instead.`);
  return {
    level,
    name: `Level ${level}`,
    boardSize: 8,
    startingGold: 0,
    enemyArmyGold: 300,
    playerArmyGold: 0,
    availableItems: {
      blackRandomization: ALL_ITEMS,
      whiteRandomization: WHITE_ITEMS,
      whitePurchase: WHITE_ITEMS
    },
    marketEnabled: true,
    availablePieces: ["Q", "R", "B", "N", "P"]
  };
}

/**
 * Preload a level configuration into cache
 * Useful for loading the next level in the background
 */
export function preloadLevelConfig(level: number): void {
  loadLevelConfig(level).catch(err => {
    console.warn(`Failed to preload level ${level}:`, err);
  });
}

/**
 * Clear the configuration cache
 * Useful for development/hot reload
 */
export function clearConfigCache(): void {
  configCache.clear();
}
