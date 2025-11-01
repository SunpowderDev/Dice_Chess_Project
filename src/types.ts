export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P";
export type Color = "w" | "b";
export type PieceColor = Color | "n";

export type Equip =
  | "sword"
  | "shield"
  | "lance"
  | "torch"
  | "bow"
  | "staff"
  | "crystal_ball"
  | "disguise"
  | "scythe"
  | "banner"
  | "curse"
  | "skull"
  | "purse"
  | undefined;

export interface Piece {
  id: string;
  type: PieceType;
  color: PieceColor;
  equip?: Equip;
  originalType?: Piece["type"];
  stunnedForTurns?: number;
  shadowForTurns?: number; // Shadow visual indicator (for Bell of Names protection)
  name?: string;
  kills?: number; // Track enemy kills for veteran status
  isPreconfigured?: boolean; // True if named via level config (shows gold background)
  isExhausted?: boolean; // True if stunned due to repetitive moves
  speechLines?: string[]; // Custom speech lines for featured pieces
}

export type Board = (Piece | null)[][];

export type Phase =
  | "idle"
  | "base"
  | "mods"
  | "total"
  | "winner"
  | "market"
  | "playing"
  | "awaiting_reroll"
  | "awaiting_disguise_choice";

export type GameStatus = "story" | "market" | "battle" | "lost" | "won";

export type MoveRecord = {
  turnNumber: number;
  color: Color;
  notation: string;
  piece: {
    type: PieceType;
    color: Color;
  };
  rerolledBy?: "attacker" | "defender";
  combat?: {
    isSupported?: boolean;
    winPercent: number;
    attackerRolls: number[];
    defenderRolls: number[] | null;
    obstacleType?: ObstacleType; // Type of obstacle if defenderRolls is null
  };
  inFog?: boolean;
};

export type TerrainCell = "none" | "forest" | "water";
export type Terrain = TerrainCell[][];

export type ObstacleType = "rock" | "courtier" | "column" | "gate" | "bell" | "none";
export type Obstacle = ObstacleType[][];

export type MarketAction =
  | { type: "piece"; name: Piece["type"]; isFree?: boolean }
  | { type: "item"; name: Exclude<Equip, undefined>; isFree?: boolean }
  | { type: "prayer" }
  | null;

export type KingDefeatType = "beheaded" | "dishonored" | "checkmate";

export type KilledPiece = {
  piece: Piece;
  defeatType?: KingDefeatType; // Only for Kings
};

export type CampaignState = {
  level: number;
  whiteRoster: Piece[]; // persisted across levels
  prayerDice: number; // prayer dice count
  unlockedItems: Exclude<Equip, undefined>[]; // items unlocked during campaign
  freeUnits: Map<PieceType, number>; // free units available to deploy (pieceType -> count)
  freeItems: Map<Exclude<Equip, undefined>, number>; // free items available to deploy (item -> count)
  prayerDiceCost?: number; // custom prayer dice cost (if increased by story event)
};

// Story Card System Types
export type StoryEvent =
  | { type: "next_card"; cardId: string }
  | { type: "give_gold"; amount: number }
  | { type: "remove_gold"; amount: number }
  | { type: "give_item"; item: Exclude<Equip, undefined>; target: "player" | "enemy" }
  | { type: "give_unit"; pieceType: PieceType; equip?: Equip; target: "player" | "enemy" }
  | { type: "give_prayer_die" }
  | { type: "remove_prayer_die" }
  | { type: "unlock_item"; item: Exclude<Equip, undefined> }
  | { type: "give_free_unit"; pieceType: PieceType; equip?: Equip }
  | { type: "give_free_item"; item: Exclude<Equip, undefined>; count?: number }
  | { type: "attach_item_to_units"; item: Exclude<Equip, undefined>; target: "player" | "enemy"; count: number }
  | { type: "spawn_enemy_pawns"; count: number }
  | { type: "assign_item_to_enemy"; item: Exclude<Equip, undefined>; count: number }
  | { type: "increase_prayer_cost" }
  | { type: "start_battle" };

// Outcome display data with visual information
export type OutcomeData = {
  message: string;
  glyph: string; // emoji/icon to display
  color: string; // text color class
  bgColor: string; // background color class
  borderColor: string; // border color class
};

export type StoryChoice = {
  text: string;
  events: StoryEvent[];
  overlayColor?: string; // Optional overlay color (CSS color value, e.g., "rgba(147, 51, 234, 0.8)" or "#9333ea")
};

export type StoryCard = {
  id: string;
  character?: {
    type: PieceType;
    color: PieceColor;
    equip?: Equip;
    name: string;
  };
  bodyText: string;
  image?: string; // URL or path to image (can be in /public folder)
  leftChoice: StoryChoice;
  rightChoice: StoryChoice;
};

