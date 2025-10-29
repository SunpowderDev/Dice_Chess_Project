export type PieceType = "K" | "Q" | "R" | "B" | "N" | "P" | "ROCK";
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
  };
  inFog?: boolean;
};

export type TerrainCell = "none" | "forest" | "water";
export type Terrain = TerrainCell[][];

export type MarketAction =
  | { type: "piece"; name: Piece["type"] }
  | { type: "item"; name: Exclude<Equip, undefined> }
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
};

// Story Card System Types
export type StoryEvent =
  | { type: "next_card"; cardId: string }
  | { type: "give_gold"; amount: number }
  | { type: "remove_gold"; amount: number }
  | { type: "give_item"; item: Exclude<Equip, undefined>; target: "player" | "enemy" }
  | { type: "give_unit"; pieceType: PieceType; equip?: Equip; target: "player" | "enemy" }
  | { type: "give_prayer_die" }
  | { type: "start_battle" };

export type StoryChoice = {
  text: string;
  events: StoryEvent[];
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

