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
export type VictoryCondition = "king_beheaded" | "king_captured" | "king_dishonored" | "king_escaped";

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
  // Victory conditions for this level (defaults to all three if not specified)
  victoryConditions?: VictoryCondition[];
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
  // Check cache first
  if (configCache.has(level)) {
    return configCache.get(level)!;
  }

  try {
    const response = await fetch(`/levels/level${level}.json`, {
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

    // Cache the loaded config
    configCache.set(level, config);
    
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
      }
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
    }
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
