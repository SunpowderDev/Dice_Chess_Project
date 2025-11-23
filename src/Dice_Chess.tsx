import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  loadLevelConfig,
  type TerrainConfigCell,
  type NamedPiece,
  type LevelConfig,
  type VictoryCondition,
} from "./levelConfig";
import StoryCard from "./StoryCard";
import { preloadStoryCardImages, preloadAllStoryCardImages } from "./imagePreloader";
import { MainMenu } from "./MainMenu";
import { MusicManager, type MusicManagerHandle } from "./MusicManager";
import type {
  PieceType,
  Color,
  PieceColor,
  Equip,
  Piece,
  Board,
  StoryCard as StoryCardType,
  StoryEvent,
  Phase,
  TerrainCell,
  Terrain,
  ObstacleType,
  Obstacle,
  MarketAction,
  CampaignState,
  MoveRecord,
  KilledPiece,
  KingDefeatType,
  OutcomeData,
  TutorialType,
  Difficulty,
} from "./types";
import {
  S,
  W,
  B,
  RAD,
  VAL,
  ITEM_COSTS,
  TIMING,
  GL,
  PHRASES,
  NAMED_PHRASES,
  SWING_PHRASES,
  ITEM_DESCRIPTIONS,
  PIECE_NAMES,
} from "./constants";
import { Market } from "./Market";
import { VictoryPopup } from "./VictoryPopup";
import { TutorialPopup, getTutorialContent } from "./TutorialPopup";
import {
  checkAllObjectives,
  calculateObjectiveBonus,
  formatObjectiveDescription,
  type ObjectiveTracking,
} from "./ObjectiveManager";
import "./styles.css";

// --- Error Boundary & Tooltip Components ---

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ErrorBoundary({ children }: { children: React.ReactNode }) {
  const [err, setErr] = useState<Error | null>(null);
  if (err) {
    return (
      <div style={{ color: "white", padding: 16 }}>
        <h2>Something went wrong.</h2>
        <pre>{String(err.stack || err.message || err)}</pre>
      </div>
    );
  }
  return (
    <React.Suspense
      fallback={<div style={{ color: "white", padding: 16 }}>Loading…</div>}
    >
      <BoundaryInner onError={setErr}>{children}</BoundaryInner>
    </React.Suspense>
  );
}

function BoundaryInner({
  children,
  onError,
}: {
  children: React.ReactNode;
  onError: (e: Error) => void;
}) {
  // Capture render errors
  try {
    return <>{children}</>;
  } catch (e: any) {
    onError(e);
    return null;
  }
}

function TooltipLayer({
  tip,
}: {
  tip: { text: string; x: number; y: number } | null;
}) {
  if (!tip) return null;
  return createPortal(
    <div
      className="tooltip"
      role="tooltip"
      aria-hidden="true"
      style={{
        position: "fixed",
        left: tip.x,
        top: tip.y,
        zIndex: 9999,
        pointerEvents: "none", // <- crucial
      }}
    >
      {tip.text}
    </div>,
    document.body
  );
}

function useGlobalMousePos(enabled: boolean) {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    if (!enabled) return;
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX + 16, y: e.clientY + 16 }); // slight offset so cursor doesn't cover it
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [enabled]);
  return pos;
}

// --- Game Constants & Types ---
/* Dice Chess 7×7 — Slim
 * Keeps: brown board, black/white chips (high-contrast black pawns), fog on top rank, hover % odds,
 * support rings, King check aura, dice badges with base+mods then total bump, "King Captured", New Game.
 * Items: 🗡️ Sword, 🛡️ Shield, 🐎 Mount, 🔥 Torch, 🏹 Bow, 🪄 Staff, 🔮 Crystal Ball, 🎭 Disguise
 */

// --- Sound Engine ---
const sfx = {
  muted: false,
  audioContext: new (window.AudioContext ||
    (window as any).webkitAudioContext)(),

  _play(
    freq: number,
    vol: number,
    duration: number,
    type: OscillatorType = "sine"
  ) {
    if (this.muted) return;
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.connect(gain);
    gain.connect(this.audioContext.destination);

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);
    gain.gain.setValueAtTime(vol, this.audioContext.currentTime);

    gain.gain.exponentialRampToValueAtTime(
      0.00001,
      this.audioContext.currentTime + duration
    );
    osc.start(this.audioContext.currentTime);
    osc.stop(this.audioContext.currentTime + duration);
  },

  purchase() {
    this._play(880, 0.1, 0.1);
    setTimeout(() => this._play(1046, 0.1, 0.15), 100);
  },
  deploy() {
    this._play(220, 0.3, 0.15, "square");
  },
  equip() {
    this._play(1200, 0.2, 0.1, "triangle");
    setTimeout(() => this._play(1800, 0.2, 0.1, "triangle"), 50);
  },
  move() {
    this._play(660, 0.25, 0.1, "triangle");
  },
  capture() {
    this._play(150, 0.4, 0.2, "sawtooth");
  },
  combatLose() {
    this._play(220, 0.4, 0.25, "sawtooth");
    setTimeout(() => this._play(110, 0.5, 0.35, "sawtooth"), 120);
  },
  convert() {
    this._play(523, 0.1, 0.1);
    setTimeout(() => this._play(659, 0.1, 0.1), 100);
    setTimeout(() => this._play(784, 0.1, 0.15), 200);
  },
  reveal() {
    this._play(300, 0.2, 0.05, "sawtooth");
    setTimeout(() => this._play(600, 0.3, 0.2, "sawtooth"), 50);
  },
  crystalBall() {
    this._play(400, 0.2, 0.3);
    setTimeout(() => this._play(800, 0.2, 0.3), 50);
  },
  spear() {
    this._play(300, 0.3, 0.2, "sawtooth");
  },
  bowBreak() {
    this._play(100, 0.5, 0.15, "square");
  },
  rockDestroy() {
    this._play(80, 0.6, 0.3, "sawtooth");
  },
  prayer() {
    this._play(600, 0.3, 0.2, "triangle");
    setTimeout(() => this._play(900, 0.3, 0.3, "triangle"), 100);
  },
  winCheckmate() {
    this._play(523, 0.2, 0.1);
    setTimeout(() => this._play(659, 0.2, 0.1), 120);
    setTimeout(() => this._play(784, 0.25, 0.15), 240);
    setTimeout(() => this._play(1046, 0.3, 0.5), 360);
  },
  loseCheckmate() {
    this._play(440, 0.4, 0.25, "sawtooth");
    setTimeout(() => this._play(220, 0.5, 0.35, "sawtooth"), 200);
    setTimeout(() => this._play(110, 0.6, 0.8, "sawtooth"), 400);
  },
  cashOut() {
    this._play(800, 0.2, 0.1, "triangle");
    setTimeout(() => this._play(1000, 0.2, 0.1, "triangle"), 80);
    setTimeout(() => this._play(1200, 0.25, 0.15, "triangle"), 160);
  },
  unlock() {
    this._play(523, 0.3, 0.15, "triangle");
    setTimeout(() => this._play(659, 0.3, 0.15, "triangle"), 120);
    setTimeout(() => this._play(784, 0.4, 0.2, "triangle"), 240);
    setTimeout(() => this._play(1046, 0.5, 0.3, "triangle"), 360);
  },
};

// --- RNG Helpers ---
function xmur3(s: string) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
const rngFrom = (seed: string) => {
  const f = xmur3(seed);
  return sfc32(f(), f(), f(), f());
};
const rand = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

// --- Utils ---
const inb = (x: number, y: number) => x >= 0 && x < S && y >= 0 && y < S;
const inBounds = (x: number, y: number, size: number) =>
  x >= 0 && x < size && y >= 0 && y < size;
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const manhattan = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const cloneB = (b: Board) => b.map((r) => r.map((p) => (p ? { ...p } : null)));
const isKingPiece = (piece: Piece | null | undefined) =>
  !!piece && (piece.type === "K" || piece.originalType === "K");

// Campaign utility functions
function serializePiece(p: Piece): {
  id: string;
  type: PieceType;
  color: PieceColor;
  equip?: Equip;
  originalType?: PieceType;
  name?: string;
  kills?: number;
  isPreconfigured?: boolean;
  isExhausted?: boolean;
  speechLines?: string[];
} {
  return {
    id: p.id,
    type: p.type,
    color: p.color,
    equip: p.equip,
    originalType: p.originalType,
    name: p.name,
    kills: p.kills,
    isPreconfigured: p.isPreconfigured,
    isExhausted: p.isExhausted,
    speechLines: p.speechLines,
  };
}

function deserializePiece(s: {
  id: string;
  type: PieceType;
  color: PieceColor;
  equip?: Equip;
  originalType?: PieceType;
  name?: string;
  kills?: number;
  isPreconfigured?: boolean;
  isExhausted?: boolean;
  speechLines?: string[];
}): Piece {
  return {
    id: s.id,
    type: s.type,
    color: s.color,
    equip: s.equip,
    originalType: s.originalType,
    name: s.name,
    kills: s.kills,
    isPreconfigured: s.isPreconfigured,
    isExhausted: s.isExhausted,
    speechLines: s.speechLines,
    stunnedForTurns: undefined, // Reset transient combat state
  };
}

function placeRoster(B: Board, O: Obstacle, roster: Piece[], boardSize: number) {
  const slots: Array<{ x: number; y: number }> = [];
  // rows 0..1 first, then row 2
  for (let y of [0, 1, 2]) {
    for (let x = 0; x < boardSize; x++) slots.push({ x, y });
  }

  // Sort roster to prioritize King placement
  const sortedRoster = roster.slice().sort((a, b) => {
    if (a.type === "K") return -1; // King gets highest priority
    if (b.type === "K") return 1;
    return 0; // Keep other pieces in original order
  });

  // Try to place the King in the most central available square (defaulting to row 0)
  const kingIndex = sortedRoster.findIndex((piece) => piece.type === "K");
  if (kingIndex !== -1) {
    const king = sortedRoster[kingIndex];
    const center = (boardSize - 1) / 2;
    const xCandidates = Array.from({ length: boardSize }, (_, x) => x).sort((a, b) => {
      const diff = Math.abs(a - center) - Math.abs(b - center);
      return diff !== 0 ? diff : a - b;
    });
    let placedKing = false;
    for (const y of [0, 1, 2]) {
      if (placedKing) break;
      for (const x of xCandidates) {
        const obstacleRow = O[y];
        if (obstacleRow && obstacleRow[x] !== "none") continue;
        if (!B[y]) B[y] = [];
        if (B[y][x]) continue;
        B[y][x] = { ...king };
        sortedRoster.splice(kingIndex, 1);
        placedKing = true;
        break;
      }
    }
  }

  // Place pieces in available slots, avoiding obstacles
  let pieceIndex = 0;
  for (let i = 0; i < slots.length && pieceIndex < sortedRoster.length; i++) {
    const { x, y } = slots[i];
    // Check if position is empty (not occupied by obstacle or other piece)
    if (!B[y]?.[x] && O[y]?.[x] === "none") {
      B[y][x] = { ...sortedRoster[pieceIndex] }; // clone to avoid accidental mutation
      pieceIndex++;
    }
  }
}
const FILES = "abcdefghijkl"; // Support boards up to 12x12
const getChessNotation = (
  from: { x: number; y: number },
  to: { x: number; y: number },
  piece: Piece,
  isCapture: boolean
) => {
  let notation = "";
  // The glyph is now handled in MoveCell, so we only need the coordinates part of the notation.
  if (piece.type === "P" && isCapture) {
    notation += FILES[from.x];
  }
  if (isCapture) {
    notation += "x";
  }
  notation += FILES[to.x];
  notation += to.y + 1; // y=0 is rank 1
  return notation;
};

// ---- Stun / Curse helpers ----
function applyStunAround(
  b: Board,
  pos: { x: number; y: number },
  currentTurn: Color
) {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = pos.x + dx,
        ny = pos.y + dy;
      if (!inb(nx, ny)) continue;
      const adj = b[ny]?.[nx]; // Safe navigation
      if (adj) {
        const cur = adj.stunnedForTurns ?? 0;
        // Unified stun rule: A stunned piece is stunned from the moment it triggers
        // until the START of their next-next turn. This is always 2 turns.
        const turns = 2;
        adj.stunnedForTurns = Math.max(cur, turns);
      }
    }
  }
}
/** Call this EXACTLY when a piece is removed from the board. */
function onPieceDeath(
  b: Board,
  piece: Piece | null,
  pos: { x: number; y: number },
  turn: Color,
  onPlayerPieceLost?: (piece: Piece) => void
) {
  if (!piece) return;
  if (piece.color === "w" && onPlayerPieceLost) {
    onPlayerPieceLost(piece);
  }
  if (piece.equip === "curse") {
    applyStunAround(b, pos, turn);
  }
}

// Helper function to track King defeats for ransom
function trackKingDefeat(
  defeatedKing: Piece,
  defeatType: KingDefeatType,
  setKilledEnemies: React.Dispatch<React.SetStateAction<KilledPiece[]>>
) {
  // Only track if it's the enemy (black) king
  if (defeatedKing.color === B) {
    setKilledEnemies((prev) => [...prev, { piece: defeatedKing, defeatType }]);
  }
}

type KillRecordContext = {
  killerPiece?: Piece | null;
  killerPosition?: { x: number; y: number } | null;
  terrain?: Terrain;
};

// Helper function to check and unlock items, and track killed enemies for ransom
function checkUnlockItem(
  killedPiece: Piece | null,
  killerColor: Color,
  setUnlocked: React.Dispatch<
    React.SetStateAction<Exclude<Equip, undefined>[]>
  >,
  setCampaign: React.Dispatch<React.SetStateAction<CampaignState>>,
  campaign: CampaignState,
  setKilledEnemies: React.Dispatch<React.SetStateAction<KilledPiece[]>>,
  setMarketPoints?: React.Dispatch<React.SetStateAction<number>>,
  setUnspentGold?: React.Dispatch<React.SetStateAction<number>>,
  defeatType?: KingDefeatType,
  context?: KillRecordContext
) {
  // Track killed enemies for ransom
  if (killedPiece && killerColor === W && (killedPiece.color as string) === B) {
    const killerPiece = context?.killerPiece || null;
    const terrainGrid = context?.terrain;
    const killerPosition = context?.killerPosition;
    let killerTerrain: TerrainCell | undefined;
    const targetStunned =
      !!(killedPiece && killedPiece.stunnedForTurns !== undefined && killedPiece.stunnedForTurns > 0);

    if (terrainGrid && killerPosition) {
      const row = terrainGrid[killerPosition.y];
      if (row) {
        killerTerrain = row[killerPosition.x] ?? undefined;
      }
    }

    setKilledEnemies((prev) => [
      ...prev,
      {
        piece: killedPiece,
        defeatType,
        killerType: killerPiece?.type,
        killerName: killerPiece?.name,
        killerId: killerPiece?.id,
        killerTerrain,
        targetStunned,
      },
    ]);
  }

  // Only process if white (player) killed black (enemy)
  if (!killedPiece || killerColor !== W || (killedPiece.color as string) !== B)
    return;

  // Check if the killed piece has an item
  if (killedPiece.equip && killedPiece.equip !== undefined) {
    const item = killedPiece.equip;

    // Handle purse special case - gives gold but is not unlockable
    if (item === "purse") {
      sfx.cashOut();
      // Note: Purse gold is added during ransom calculation, not immediately
      return; // Don't unlock purse
    }

    // Ensure unlockedItems exists, default to empty array
    const unlockedItems = campaign.unlockedItems || [];

    // Check if this item is already unlocked
    if (unlockedItems.indexOf(item) === -1) {
      // Unlock this item
      setCampaign((prev) => ({
        ...prev,
        unlockedItems: [...(prev.unlockedItems || []), item],
      }));
      setUnlocked((prev) => [...prev, item]);
      sfx.unlock();
    }
  }
}
/** Decrement stun for the side that just finished its turn. */
function decrementStunFor(side: Color, b: Board, boardSize: number = S) {
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.color === side) {
        if (p.stunnedForTurns && p.stunnedForTurns > 0) {
          p.stunnedForTurns -= 1;
          // Clear exhausted flag when stun wears off
          if (p.stunnedForTurns === 0) {
            p.isExhausted = false;
          }
        }
        // Decrement shadow turns (for Bell of Names protection visual)
        if (p.shadowForTurns && p.shadowForTurns > 0) {
          p.shadowForTurns -= 1;
        }
      }
    }
  }
}

const isProtectedByBanner = (
  b: Board,
  pieceColor: PieceColor,
  pos: { x: number; y: number },
  boardSize: number = S
) => {
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.color === pieceColor && p.equip === "banner") {
        if (cheb(pos, { x, y }) <= 1 && !(pos.x === x && pos.y === y)) {
          return true;
        }
      }
    }
  }
  return false;
};

const equipIcon = (e: Equip) =>
  e === "sword"
    ? "🗡️"
    : e === "shield"
    ? "🛡️"
    : e === "lance"
    ? "🐎"
    : e === "torch"
    ? "🔥"
    : e === "bow"
    ? "🏹"
    : e === "staff"
    ? "🪄"
    : e === "crystal_ball"
    ? "🔮"
    : e === "disguise"
    ? "🎭"
    : e === "scythe"
    ? "🪓"
    : e === "banner"
    ? "⚜️"
    : e === "curse"
    ? "🎃"
    : e === "skull"
    ? "💀"
    : e === "purse"
    ? "💰"
    : "";

// --- Army Generation ---
function specPool(totalGold: number, allowedPieceTypes?: PieceType[]) {
  const o: Array<{ q: number; r: number; b: number; n: number; p: number }> =
    [];

  // Default to all piece types if none specified
  const allowed = allowedPieceTypes && allowedPieceTypes.length > 0 
    ? new Set(allowedPieceTypes)
    : new Set<PieceType>(["Q", "R", "B", "N", "P"]);

  // Piece gold values (matching VAL constant)
  const Q_COST = 80;
  const R_COST = 50;
  const B_COST = 30;
  const N_COST = 35;
  const P_COST = 10;

  // Determine max counts for each piece type (only if allowed)
  const maxQ = allowed.has("Q") ? 1 : 0;
  const maxR = allowed.has("R") ? 3 : 0;
  const maxB = allowed.has("B") ? 3 : 0;
  const maxN = allowed.has("N") ? 3 : 0;

  for (let q = 0; q <= maxQ; q++) {
    for (let r = 0; r <= maxR; r++) {
      for (let b = 0; b <= maxB; b++) {
        for (let n = 0; n <= maxN; n++) {
          const back = q + r + b + n;
          if (back > 6) continue; // Max 6 back rank pieces (excluding King)

          const goldSpent = q * Q_COST + r * R_COST + b * B_COST + n * N_COST;
          const remainingGold = totalGold - goldSpent;

          // Calculate how many pawns we can afford (only if pawns are allowed)
          const maxPawns = allowed.has("P") ? Math.floor(remainingGold / P_COST) : 0;
          const p = maxPawns;

          // No minimum pawn requirement - generate all valid combinations
          if (remainingGold >= 0) {
            // Generate specs even with 0 pawns if we have back rank pieces or if pawns aren't allowed
            if (back > 0 || (allowed.has("P") && p >= 0)) {
              o.push({ q, r, b, n, p });
            }
          }
        }
      }
    }
  }

  return o;
}

function build(
  color: Color,
  r: () => number,
  initialGold: number = 200,
  isPlayer: boolean = false,
  availableItems?: Exclude<Equip, undefined>[], // Optional override for available items
  boardSize: number = S,
  namedPieces?: NamedPiece[], // Optional named pieces with equipment
  kingName?: string, // Optional custom king name
  board?: Board, // Optional board to check available slots
  backRankRow?: number, // Which row is the back rank
  frontRankRow?: number, // Which row is the front rank
  skipKing?: boolean, // Optional flag to skip creating the King (for king_escaped only mode)
  guaranteedItems?: Exclude<Equip, undefined>[], // Items that MUST be equipped (from story events)
  allowedPieceTypes?: PieceType[], // Optional: which piece types can be randomly generated
  guaranteedPieces?: Array<{ type: PieceType; equip?: Equip }>, // Optional: guaranteed pieces that must spawn (don't consume gold)
  equipmentGold?: number, // Optional: gold specifically for equipment randomization (if not set, uses a default allocation)
  obstacles?: Obstacle, // Optional: obstacles grid to check which slots are blocked
  pawnBudget?: number // Optional: percentage (0.0-1.0) of gold to allocate for pawns before generating other pieces
) {
  const EQ: Exclude<Equip, undefined>[] = availableItems ?? [
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
  ];
  const EQ_FOR_PAWNS = EQ.filter((item) => item !== "disguise");
  const EQ_FOR_BACK_RANK = EQ.filter((item) => item !== "disguise"); // Kings cannot be disguised

  const id = (t: string) =>
    `${color}${t}-${Math.random().toString(36).slice(2, 8)}`;

  // Step 1: Count available slots if board is provided
  // We need to count slots that are empty on the board AND don't have obstacles
  let availableBackSlots = boardSize;
  let availableFrontSlots = boardSize;

  if (board && backRankRow !== undefined && frontRankRow !== undefined) {
    // Count actual empty slots (no pieces AND no obstacles)
    availableBackSlots = 0;
    availableFrontSlots = 0;
    const blockedBackSlots: number[] = [];
    const blockedFrontSlots: number[] = [];
    for (let x = 0; x < boardSize; x++) {
      const backHasObstacle = obstacles && obstacles[backRankRow]?.[x] && obstacles[backRankRow][x] !== "none";
      const frontHasObstacle = obstacles && obstacles[frontRankRow]?.[x] && obstacles[frontRankRow][x] !== "none";
      const backHasPiece = board[backRankRow]?.[x] !== null && board[backRankRow]?.[x] !== undefined;
      const frontHasPiece = board[frontRankRow]?.[x] !== null && board[frontRankRow]?.[x] !== undefined;
      
      if (board[backRankRow]?.[x] === null && !backHasObstacle) {
        availableBackSlots++;
      } else if (backHasObstacle || backHasPiece) {
        blockedBackSlots.push(x);
      }
      
      if (board[frontRankRow]?.[x] === null && !frontHasObstacle) {
        availableFrontSlots++;
      } else if (frontHasObstacle || frontHasPiece) {
        blockedFrontSlots.push(x);
      }
    }
    
    // Debug logging for slot calculation
    if (color === B) {
      // console.log("[Difficulty Debug] Slot calculation:", {
      //   backRankRow,
      //   frontRankRow,
      //   boardSize,
      //   availableBackSlots,
      //   availableFrontSlots,
      //   blockedBackSlots,
      //   blockedFrontSlots,
      //   backRankObstacles: Array.from({length: boardSize}, (_, i) => obstacles?.[backRankRow]?.[i]),
      //   frontRankObstacles: Array.from({length: boardSize}, (_, i) => obstacles?.[frontRankRow]?.[i]),
      //   backRankPieces: Array.from({length: boardSize}, (_, i) => board?.[backRankRow]?.[i] ? board[backRankRow][i]?.type : null),
      //   frontRankPieces: Array.from({length: boardSize}, (_, i) => board?.[frontRankRow]?.[i] ? board[frontRankRow][i]?.type : null)
      // });
    }
  }

  // Step 2: Create named pieces first (they don't consume gold budget and have priority placement)
  const namedBackRankPieces: Piece[] = [];
  const namedFrontRankPieces: Piece[] = [];
  let kingFromNamedPieces: Piece | null = null;

  if (namedPieces && namedPieces.length > 0) {
    for (const namedPiece of namedPieces) {
      // If this is a King and we're not skipping King creation, handle it specially
      if (namedPiece.type === "K" && !skipKing) {
        kingFromNamedPieces = {
          id: id(namedPiece.type),
          type: namedPiece.type,
          color,
          name: namedPiece.name,
          equip: namedPiece.equip,
          isPreconfigured: true, // Mark as preconfigured for gold background
          speechLines: namedPiece.speechLines, // Store custom speech lines
        };
      } else {
        const piece: Piece = {
          id: id(namedPiece.type),
          type: namedPiece.type,
          color,
          name: namedPiece.name,
          equip: namedPiece.equip,
          isPreconfigured: true, // Mark as preconfigured for gold background
          speechLines: namedPiece.speechLines, // Store custom speech lines
        };

        if (namedPiece.type === "P") {
          namedFrontRankPieces.push(piece);
        } else {
          namedBackRankPieces.push(piece);
        }
      }
    }
  }

  // Step 3: Create King FIRST (with optional name), unless skipKing is true
  const back: Piece[] = [];
  let kingCreated = false;
  
  if (!skipKing) {
    // If King was defined in namedPieces, use that; otherwise create a basic King
    if (kingFromNamedPieces) {
      back.push(kingFromNamedPieces);
    } else {
      const king: Piece = { id: `${color}-K`, type: "K", color };
      if (kingName) {
        king.name = kingName;
        king.isPreconfigured = true; // Mark king as preconfigured if named
      }
      back.push(king);
    }
    kingCreated = true;
  }

  // Add named back rank pieces IMMEDIATELY after King (guaranteed placement)
  back.push(...namedBackRankPieces);

  // Step 3.5: Add guaranteed pieces (don't consume gold budget)
  const guaranteedBackRankPieces: Piece[] = [];
  const guaranteedFrontRankPieces: Piece[] = [];
  let overflowPawnsCount = 0; // Track how many pawns will overflow to back rank
  
  if (guaranteedPieces && guaranteedPieces.length > 0) {
    for (const gp of guaranteedPieces) {
      // Skip creating a King if one was already created (from namedPieces or regular king creation)
      if (gp.type === "K" && kingCreated) {
        continue; // Skip this guaranteed King since we already have one
      }
      
      const piece: Piece = {
        id: id(gp.type),
        type: gp.type,
        color,
        equip: gp.equip,
      };
      if (gp.type === "P") {
        guaranteedFrontRankPieces.push(piece);
      } else {
        guaranteedBackRankPieces.push(piece);
      }
    }
    
    // Calculate how many guaranteed pawns will overflow to back rank
    // This happens when guaranteed pawns + named pawns exceed available front slots
    const totalFrontRankPieces = namedFrontRankPieces.length + guaranteedFrontRankPieces.length;
    if (totalFrontRankPieces > availableFrontSlots) {
      overflowPawnsCount = totalFrontRankPieces - availableFrontSlots;
    }
  }
  
  // Add guaranteed back rank pieces
  back.push(...guaranteedBackRankPieces);

  // Step 4: Calculate how many slots remain for random pieces (accounting for actual board space)
  // Account for overflow pawns that will be placed in back rank
  const remainingBackSlots =
    availableBackSlots - (kingCreated ? 1 : 0) - namedBackRankPieces.length - guaranteedBackRankPieces.length - overflowPawnsCount;

  // Step 5: Generate army spec based on remaining slots and gold
  const allowed = allowedPieceTypes && allowedPieceTypes.length > 0 
    ? new Set(allowedPieceTypes)
    : new Set<PieceType>(["Q", "R", "B", "N", "P"]);
  
  let s: { q: number; r: number; b: number; n: number; p: number };
  
  // If pawnBudget is specified, allocate gold for pawns first, then generate back-rank pieces
  if (pawnBudget !== undefined && pawnBudget > 0 && allowed.has("P")) {
    const P_COST = 10;
    const pawnGold = Math.floor(initialGold * pawnBudget);
    const backRankGold = initialGold - pawnGold;
    
    // Calculate how many pawns we can afford with the pawn budget
    const pawnCount = Math.floor(pawnGold / P_COST);
    
    // Generate back-rank pieces with remaining gold (exclude pawns from allowed types)
    const backRankAllowed = Array.from(allowed).filter(t => t !== "P") as PieceType[];
    const BACK_SPECS = specPool(backRankGold, backRankAllowed);
    const backSpec = BACK_SPECS.length > 0 ? rand(r, BACK_SPECS) : { q: 0, r: 0, b: 0, n: 0, p: 0 };
    
    s = {
      q: backSpec.q,
      r: backSpec.r,
      b: backSpec.b,
      n: backSpec.n,
      p: pawnCount
    };
  } else {
    // Original behavior: generate all pieces together
    const SPECS = specPool(initialGold, allowedPieceTypes);
    // Fallback to minimal army spec if specPool returns empty (when gold is too low)
    const defaultSpec = { q: 0, r: 0, b: 0, n: 0, p: 0 };
    s = SPECS.length > 0 ? rand(r, SPECS) : defaultSpec;
    
    // Debug logging for spec generation
    if (color === B) {
      // console.log("[Difficulty Debug] Spec generation:", {
      //   initialGold,
      //   allowedPieceTypes,
      //   specsGenerated: SPECS.length,
      //   selectedSpec: s,
      //   specsArray: SPECS
      // });
    }
  }

  // Add randomly generated pieces (only up to remaining back rank slots and only if allowed)
  let addedPieces = 0;
  if (s && s.q && allowed.has("Q") && addedPieces < remainingBackSlots) {
    back.push({ id: id("Q"), type: "Q", color });
    addedPieces++;
  }
  if (s) {
    for (let i = 0; i < s.r && allowed.has("R") && addedPieces < remainingBackSlots; i++) {
      back.push({ id: id("R"), type: "R", color });
      addedPieces++;
    }
    for (let i = 0; i < s.b && allowed.has("B") && addedPieces < remainingBackSlots; i++) {
      back.push({ id: id("B"), type: "B", color });
      addedPieces++;
    }
    for (let i = 0; i < s.n && allowed.has("N") && addedPieces < remainingBackSlots; i++) {
      back.push({ id: id("N"), type: "N", color });
      addedPieces++;
    }
  }

  // Place back rank pieces on the board (including overflow pawns from guaranteed pieces)
  const br = Array(boardSize).fill(null) as (Piece | null)[];
  
  // Add overflow pawns to back rank before placing
  if (overflowPawnsCount > 0) {
    const overflowPawns = guaranteedFrontRankPieces.splice(-overflowPawnsCount);
    back.push(...overflowPawns);
  }
  
  const idx = Array.from({ length: boardSize }, (_, i) => i).sort(
    () => r() - 0.5
  );
  back.forEach((p, i) => {
    br[idx[i]] = p;
  });

  // Step 6: Create front rank with named pawns FIRST (priority), then generated pawns
  const fr = Array(boardSize).fill(null) as (Piece | null)[];
  const slots = Array.from({ length: boardSize }, (_, i) => i).sort(
    () => r() - 0.5
  );

  // Calculate equipment budget - use equipmentGold if provided, otherwise use a default allocation
  const equipmentBudget = equipmentGold ?? (isPlayer ? 20 : 40); // Default: 20 for player, 40 for enemy
  let remainingEquipmentGold = equipmentBudget;
  
  // Guaranteed items (from story events) don't consume the randomization budget
  // They are always equipped regardless of the equipment gold setting
  
  // Get available items for randomization (use passed parameter or default)
  const EQ_AVAILABLE = availableItems && availableItems.length > 0 ? availableItems : EQ;
  const EQ_FOR_PAWNS_AVAILABLE = EQ_AVAILABLE.filter(item => EQ_FOR_PAWNS.includes(item as any));
  const EQ_FOR_BACK_RANK_AVAILABLE = EQ_AVAILABLE.filter(item => EQ_FOR_BACK_RANK.includes(item as any));
  
  // Get average item cost from available items for budget calculations
  const availableItemCosts = EQ_AVAILABLE.map(item => ITEM_COSTS[item as keyof typeof ITEM_COSTS] || 10);
  const averageItemCost = availableItemCosts.length > 0 
    ? availableItemCosts.reduce((a, b) => a + b, 0) / availableItemCosts.length
    : 10;
  
  // Calculate how many pieces can be equipped based on remaining budget
  const maxPawnItemsToEquip = Math.floor(remainingEquipmentGold / averageItemCost);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const maxBackItemsToEquip = Math.floor(remainingEquipmentGold / averageItemCost);
  
  // Place named pawns FIRST (guaranteed placement)
  for (let i = 0; i < namedFrontRankPieces.length; i++) {
    if (i < boardSize) {
      fr[slots[i]] = namedFrontRankPieces[i];
    }
  }
  
  // Place guaranteed pawns AFTER named pawns
  // Note: overflow pawns have already been moved to back rank
  for (let i = 0; i < guaranteedFrontRankPieces.length; i++) {
    const slotIndex = namedFrontRankPieces.length + i;
    if (slotIndex < availableFrontSlots && slots[slotIndex] !== undefined) {
      fr[slots[slotIndex]] = guaranteedFrontRankPieces[i];
    }
  }

  // Calculate how many slots remain for random pawns (accounting for actual board space)
  // Only generate pawns if they are in the allowed piece types
  const remainingPawnSlots =
    Math.min(availableFrontSlots, boardSize) - namedFrontRankPieces.length - guaranteedFrontRankPieces.length;
  const actualPawnsToGenerate = allowed.has("P") 
    ? Math.min(s?.p || 0, remainingPawnSlots)
    : 0;
  
  // Debug logging for pawn generation
  if (color === B) {
    // console.log("[Difficulty Debug] Pawn generation:", {
    //   availableFrontSlots,
    //   boardSize,
    //   namedFrontRankPiecesCount: namedFrontRankPieces.length,
    //   guaranteedFrontRankPiecesCount: guaranteedFrontRankPieces.length,
    //   remainingPawnSlots,
    //   specPawns: s?.p || 0,
    //   actualPawnsToGenerate,
    //   allowedHasP: allowed.has("P")
    // });
  }

  // Generate random pawns (only up to remaining slots and only if allowed)
  if (actualPawnsToGenerate > 0) {
    for (let i = 0; i < actualPawnsToGenerate; i++) {
      const slotIndex = namedFrontRankPieces.length + guaranteedFrontRankPieces.length + i;
      const k = slots[slotIndex];
      fr[k] = { id: id("P"), type: "P", color };
    }
  }
  
  // Step 5a: Equip random items to ALL unequipped pawns (both guaranteed and random, in front AND back ranks)
  // This ensures guaranteed pawns can also get random equipment, even if they overflow to back rank
  const allUnequippedPawns: Piece[] = [];
  fr.forEach((p) => {
    if (p && p.type === "P" && !p.equip) {
      allUnequippedPawns.push(p);
    }
  });
  // Also check back rank for pawns (can happen when front rank is full)
  br.forEach((p) => {
    if (p && p.type === "P" && !p.equip) {
      allUnequippedPawns.push(p);
    }
  });
  
  if (allUnequippedPawns.length > 0 && remainingEquipmentGold > 0 && EQ_FOR_PAWNS_AVAILABLE.length > 0) {
    // Calculate how many pawns to equip based on budget
    const pawnsToEquipCount = Math.min(maxPawnItemsToEquip, allUnequippedPawns.length);
    
    // Randomly select which pawns to equip
    const pawnIndicesToEquip = Array.from({ length: allUnequippedPawns.length }, (_, i) => i)
      .sort(() => r() - 0.5)
      .slice(0, pawnsToEquipCount);
    
    for (const idx of pawnIndicesToEquip) {
      if (remainingEquipmentGold <= 0) break;
      
      const randomItem = EQ_FOR_PAWNS_AVAILABLE[Math.floor(r() * EQ_FOR_PAWNS_AVAILABLE.length)] as Equip;
      const itemCost = ITEM_COSTS[randomItem as keyof typeof ITEM_COSTS] || 10;
      
      if (remainingEquipmentGold >= itemCost) {
        allUnequippedPawns[idx].equip = randomItem;
        remainingEquipmentGold -= itemCost;
      }
    }
  }

  // Step 5b: Equip random back rank pieces (but don't override named piece equipment)
  const nonKingBackRank = br.filter((x) => x && x.type !== "K") as Piece[];
  const unequippedBackRank = nonKingBackRank.filter((p) => !p.equip);
  
  // Select which back rank pieces to equip based on remaining equipment budget
  const backItemsToEquipCount = Math.min(
    Math.floor(remainingEquipmentGold / averageItemCost),
    unequippedBackRank.length
  );
  const piecesToEquip = unequippedBackRank
    .sort(() => r() - 0.5)
    .slice(0, backItemsToEquipCount);

  piecesToEquip.forEach((p) => {
    // Select item from available items that fits the budget
    if (remainingEquipmentGold <= 0 || EQ_FOR_BACK_RANK_AVAILABLE.length === 0) return;
    
    // Ensure King doesn't get disguise
    let equip: Equip;
    let itemCost = 0;
    let attempts = 0;
    do {
      equip = EQ_FOR_BACK_RANK_AVAILABLE[
        Math.floor(r() * EQ_FOR_BACK_RANK_AVAILABLE.length)
      ] as Equip;
      itemCost = ITEM_COSTS[equip as keyof typeof ITEM_COSTS] || 10;
      attempts++;
    } while ((p.type === "K" && equip === "disguise") || (remainingEquipmentGold < itemCost && attempts < 10));
    
    // Only equip if we have budget for it
    if (remainingEquipmentGold >= itemCost && equip) {
      if (equip === "disguise" && p.type !== "P") {
        p.originalType = p.type;
        p.type = "P";
      }
      p.equip = equip;
      remainingEquipmentGold -= itemCost;
    }
  });

  // Step 6: Equip guaranteed items (from story events) to unequipped pieces
  // Note: These items have already been accounted for in the equipment budget
  if (guaranteedItems && guaranteedItems.length > 0) {
    // Collect all unequipped pieces (front and back rank)
    const allPieces: Piece[] = [];
    br.forEach(p => { if (p && !p.equip) allPieces.push(p); });
    fr.forEach(p => { if (p && !p.equip) allPieces.push(p); });
    
    // Shuffle and assign guaranteed items
    allPieces.sort(() => r() - 0.5);
    
    for (let i = 0; i < Math.min(guaranteedItems.length, allPieces.length); i++) {
      const item = guaranteedItems[i];
      allPieces[i].equip = item;
      
      // Handle disguise special case
      if (item === "disguise" && allPieces[i].type !== "P") {
        allPieces[i].originalType = allPieces[i].type;
        allPieces[i].type = "P";
      }
    }
  }

  return { back: br, front: fr };
}

// --- Terrain Generation ---
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emptyT = (): Terrain =>
  Array.from({ length: S }, () => Array(S).fill("none")) as Terrain;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const emptyTerrain = (size: number): Terrain =>
  Array.from({ length: size }, () => Array(size).fill("none")) as Terrain;

const emptyObstacles = (size: number): Obstacle =>
  Array.from({ length: size }, () => Array(size).fill("none")) as Obstacle;

// Parse terrain notation like "W(Rock)" into terrain and obstacle parts
function parseTerrainCell(cell: string): { terrain: string; obstacle: ObstacleType } {
  const match = cell.match(/^([FW_n]+)\((.*)\)$/);
  if (match) {
    return { terrain: match[1], obstacle: match[2].toLowerCase() as ObstacleType };
  }
  return { terrain: cell, obstacle: "none" };
}

// Updated placeFeatures function for clustered water and configurable terrain with obstacles
function placeFeatures(
  B: Board,
  T: Terrain,
  O: Obstacle, // Obstacles grid
  r: () => number,
  boardSize: number,
  terrainMatrix?: TerrainConfigCell[][],
  skipTerrainRow?: number, // Row index where water/forest should not be placed (for escape row)
  randomTerrainPool?: { rock?: number; forest?: number; water?: number } // Configuration for random terrain placement
) {
  const occupied = new Set<string>(); // Keep track of obstacles, forests, and water tiles
  const waterCoords: { x: number; y: number }[] = []; // Store coordinates of placed water tiles

  // Helper to place terrain, obstacles, and update occupied set
  const placeFeature = (
    terrainType: TerrainCell, 
    obstacleType: ObstacleType, 
    x: number, 
    y: number
  ) => {
    // Skip water and forest on the escape row (but allow obstacles)
    if ((terrainType === "water" || terrainType === "forest") && skipTerrainRow !== undefined && y === skipTerrainRow) {
      return; // Don't place water/forest on escape row
    }
    
    // Place terrain
    T[y][x] = terrainType;
    if (terrainType === "water") {
      waterCoords.push({ x, y });
    }
    
    // Place obstacle
    O[y][x] = obstacleType;
    
    // Mark as occupied if there's an obstacle
    if (obstacleType !== "none") {
      occupied.add(`${x},${y}`);
    }
  };

  // Helper to get valid empty neighbor coordinates
  const getValidNeighbors = (
    x: number,
    y: number
  ): { x: number; y: number }[] => {
    const neighbors: { x: number; y: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue; // Skip self
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny, boardSize) && !occupied.has(`${nx},${ny}`)) {
          neighbors.push({ x: nx, y: ny });
        }
      }
    }
    return neighbors;
  };

  // --- Placement Logic ---

  // If a terrain matrix is provided, use it for initial placement
  const randomCells: { x: number; y: number }[] = [];

  if (terrainMatrix && terrainMatrix.length === boardSize) {
    // Process matrix: terrainMatrix[0] = board row 0 (white's back rank, bottom visual)
    // Board rendering flips y-axis: board[0] displays at bottom, board[boardSize-1] at top
    // So: white starts at board[0,1] (bottom), black starts at board[boardSize-1, boardSize-2] (top)
    for (let y = 0; y < boardSize; y++) {
      const row = terrainMatrix[y];
      if (row && row.length === boardSize) {
        for (let x = 0; x < boardSize; x++) {
          const cell = row[x];
          const { terrain, obstacle } = parseTerrainCell(cell);
          
          // Handle terrain placement
          if (terrain === "F" && !(skipTerrainRow !== undefined && y === skipTerrainRow)) {
            placeFeature("forest", obstacle, x, y);
          } else if (terrain === "W" && !(skipTerrainRow !== undefined && y === skipTerrainRow)) {
            placeFeature("water", obstacle, x, y);
          } else if (terrain === "_") {
            // Explicitly empty terrain
            placeFeature("none", obstacle, x, y);
          } else if (terrain === "n") {
            // Random cell - save for random generation
            randomCells.push({ x, y });
            // If there's an obstacle specified with random terrain, place it now
            if (obstacle !== "none") {
              O[y][x] = obstacle;
              occupied.add(`${x},${y}`);
            }
          } else {
            // Default to none if unrecognized
            placeFeature("none", obstacle, x, y);
          }
        }
      }
    }

    // Now apply random generation to cells marked as "n"
    if (randomCells.length > 0) {
      // Use custom terrain pool if provided, otherwise use defaults
      const rockCount = randomTerrainPool?.rock ?? 1;
      const forestCount = randomTerrainPool?.forest ?? 2;
      const waterCount = randomTerrainPool?.water ?? 3;

      // Track available cells for placement (initially all random cells)
      const availableCells = new Set<string>();
      randomCells.forEach(cell => {
        if (!occupied.has(`${cell.x},${cell.y}`)) {
          availableCells.add(`${cell.x},${cell.y}`);
        }
      });

      // Helper to get a random available cell from the set
      const getRandomAvailableCell = (): { x: number; y: number } | null => {
        const cells = Array.from(availableCells).map(key => {
          const [x, y] = key.split(',').map(Number);
          return { x, y };
        });
        if (cells.length === 0) return null;
        return cells[Math.floor(r() * cells.length)];
      };

      // Helper to remove a cell from available cells
      const removeAvailableCell = (x: number, y: number) => {
        availableCells.delete(`${x},${y}`);
      };

      // Place rock obstacles
      for (let i = 0; i < rockCount && availableCells.size > 0; i++) {
        const cell = getRandomAvailableCell();
        if (cell && !occupied.has(`${cell.x},${cell.y}`)) {
          placeFeature("none", "rock", cell.x, cell.y);
          removeAvailableCell(cell.x, cell.y);
        }
      }

      // Place forests
      for (let i = 0; i < forestCount && availableCells.size > 0; i++) {
        const cell = getRandomAvailableCell();
        if (cell && !occupied.has(`${cell.x},${cell.y}`)) {
          placeFeature("forest", "none", cell.x, cell.y);
          removeAvailableCell(cell.x, cell.y);
        }
      }

      // Place water tiles with clustering behavior
      const CLUSTER_CHANCE = 0.75;
      for (let i = 0; i < waterCount && availableCells.size > 0; i++) {
        let waterPlaced = false;

        // Attempt clustered placement first (if not the first water tile and chance allows)
        if (waterCoords.length > 0 && r() < CLUSTER_CHANCE) {
          // Get all neighbors of existing water tiles that are still available in random cells
          const allNeighbors: { x: number; y: number }[] = [];
          waterCoords.forEach((coord) => {
            const neighbors = getValidNeighbors(coord.x, coord.y);
            neighbors.forEach(neighbor => {
              const key = `${neighbor.x},${neighbor.y}`;
              // Check if this neighbor is available (in random cells pool) and doesn't have terrain yet
              if (availableCells.has(key) && !occupied.has(key) && T[neighbor.y]?.[neighbor.x] === "none") {
                allNeighbors.push(neighbor);
              }
            });
          });

          // Remove duplicates
          const uniqueNeighbors = Array.from(
            new Map(allNeighbors.map(n => [`${n.x},${n.y}`, n])).values()
          );

          if (uniqueNeighbors.length > 0) {
            const neighbor = uniqueNeighbors[Math.floor(r() * uniqueNeighbors.length)];
            placeFeature("water", "none", neighbor.x, neighbor.y);
            removeAvailableCell(neighbor.x, neighbor.y);
            waterPlaced = true;
          }
        }

        // If clustered placement failed or wasn't attempted, place randomly
        if (!waterPlaced) {
          const cell = getRandomAvailableCell();
          if (cell && !occupied.has(`${cell.x},${cell.y}`)) {
            placeFeature("water", "none", cell.x, cell.y);
            removeAvailableCell(cell.x, cell.y);
            waterPlaced = true;
          }
        }

        if (!waterPlaced && availableCells.size > 0) {
          console.warn("Could not place water tile despite available cells.");
        }
      }
    }

    // Exit early if terrain matrix was used
    return;
  }

  // --- Default Random Generation (if no terrain matrix provided) ---

  // Place 1 rock obstacle randomly
  let rockPlaced = false;
  let rockTries = 0;
  while (!rockPlaced && rockTries < 50) {
    const rx = Math.floor(r() * boardSize);
    const ry = Math.floor(r() * boardSize);
    if (!occupied.has(`${rx},${ry}`)) {
      placeFeature("none", "rock", rx, ry);
      rockPlaced = true;
    }
    rockTries++;
  }

  // Place 4 forests randomly
  for (let i = 0; i < 4; i++) {
    let forestPlaced = false;
    let forestTries = 0;
    while (!forestPlaced && forestTries < 50) {
      const fx = Math.floor(r() * boardSize);
      const fy = Math.floor(r() * boardSize);
      if (!occupied.has(`${fx},${fy}`)) {
        placeFeature("forest", "none", fx, fy);
        forestPlaced = true;
      }
      forestTries++;
    }
  }

  // Place 6 water tiles with clustering
  const CLUSTER_CHANCE = 0.75;
  for (let i = 0; i < 6; i++) {
    let waterPlaced = false;
    let placementTries = 0;

    // Attempt clustered placement first (if not the first water tile and chance allows)
    if (waterCoords.length > 0 && r() < CLUSTER_CHANCE) {
      const allNeighbors: { x: number; y: number }[] = [];
      waterCoords.forEach((coord) => {
        allNeighbors.push(...getValidNeighbors(coord.x, coord.y));
      });

      if (allNeighbors.length > 0) {
        const neighbor = rand(r, allNeighbors);
        placeFeature("water", "none", neighbor.x, neighbor.y);
        waterPlaced = true;
      }
    }

    // If clustered placement failed or wasn't attempted, place randomly
    while (!waterPlaced && placementTries < 50) {
      const wx = Math.floor(r() * boardSize);
      const wy = Math.floor(r() * boardSize);
      if (inBounds(wx, wy, boardSize) && !occupied.has(`${wx},${wy}`)) {
        // Ensure in bounds before placing
        placeFeature("water", "none", wx, wy);
        waterPlaced = true;
      }
      placementTries++;
    }

    if (!waterPlaced) {
      console.warn("Could not place water tile after 50 attempts.");
    }
  }
}

// --- Move Logic ---
function moves(
  b: Board,
  T: Terrain,
  O: Obstacle,
  x: number,
  y: number,
  boardSize: number = S
) {
  const p = b[y]?.[x]; // Safe navigation
  if (!p || (p.stunnedForTurns && p.stunnedForTurns > 0)) return [];
  const col = p.color;
  const dir = col === W ? 1 : -1;
  const out: { x: number; y: number }[] = [];
  const slide = (dx: number, dy: number) => {
    let nx = x + dx,
      ny = y + dy;
  while (inBounds(nx, ny, boardSize)) {
      const t = b[ny]?.[nx]; // Safe navigation
      const obstacle = O[ny]?.[nx]; // Check for obstacles
      if (obstacle !== "none") {
        // Obstacle blocks movement and can be attacked
        out.push({ x: nx, y: ny });
        break;
      }
      if (t) {
        if (t.color !== col) out.push({ x: nx, y: ny });
        break;
      } else out.push({ x: nx, y: ny });
      nx += dx;
      ny += dy;
    }
  };
  switch (p.type) {
    case "K":
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          if (dx || dy) {
            const nx = x + dx,
              ny = y + dy;
            if (!inBounds(nx, ny, boardSize)) continue;
            const t = b[ny]?.[nx]; // Safe navigation
            const obstacle = O[ny]?.[nx]; // Check for obstacles
            // Can move to empty squares or attack enemies/obstacles
            if (obstacle !== "none" || !t || t.color !== col) out.push({ x: nx, y: ny });
          }
      break;
    case "Q":
      slide(1, 0);
      slide(-1, 0);
      slide(0, 1);
      slide(0, -1);
      slide(1, 1);
      slide(-1, -1);
      slide(1, -1);
      slide(-1, 1);
      break;
    case "R":
      slide(1, 0);
      slide(-1, 0);
      slide(0, 1);
      slide(0, -1);
      break;
    case "B":
      slide(1, 1);
      slide(-1, -1);
      slide(1, -1);
      slide(-1, 1);
      break;
    case "N":
      [
        [1, 2],
        [2, 1],
        [-1, 2],
        [-2, 1],
        [1, -2],
        [2, -1],
        [-1, -2],
        [-2, -1],
      ].forEach(([dx, dy]) => {
        const nx = x + dx,
          ny = y + dy;
        if (!inBounds(nx, ny, boardSize)) return;
        const t = b[ny]?.[nx]; // Safe navigation
        const obstacle = O[ny]?.[nx]; // Check for obstacles
        // Can move to empty squares or attack enemies/obstacles
        if (obstacle !== "none" || !t || t.color !== col) out.push({ x: nx, y: ny });
      });
      break;
    case "P":
      {
        const ny = y + dir;
        const obstacle = O[ny]?.[x]; // Check for obstacle in front
        // Pawns can only move forward if no piece AND no obstacle
        if (inBounds(x, ny, boardSize) && !b[ny]?.[x] && obstacle === "none") out.push({ x, y: ny });
        for (const dx of [-1, 1]) {
          const cx = x + dx,
            cy = y + dir;
          if (!inBounds(cx, cy, boardSize)) continue;
          const t = b[cy]?.[cx]; // Safe navigation
          const diagObstacle = O[cy]?.[cx]; // Check for diagonal obstacle
          // Pawns can attack diagonally to capture pieces OR obstacles
          if ((t && t.color !== col) || (diagObstacle !== "none")) out.push({ x: cx, y: cy });
        }
      }
      break;
  }
  // Lance: one-time 2-square forward attack, cannot jump.
  if (p.equip === "lance") {
    const midY = y + dir;
    const targetY = y + 2 * dir;
    const midObstacle = O[midY]?.[x]; // Check for obstacle in path
    // Check if path is clear (no pieces AND no obstacles)
    if (inBounds(x, midY, boardSize) && !b[midY]?.[x] && midObstacle === "none") {
      // Safe navigation
      // Check if target is in bounds
      if (inBounds(x, targetY, boardSize)) {
        const targetPiece = b[targetY]?.[x]; // Safe navigation
        const targetObstacle = O[targetY]?.[x]; // Check for obstacle at target
        // Can attack enemy pieces OR obstacles
        if ((targetPiece && targetPiece.color !== col) || (targetObstacle !== "none")) {
          out.push({ x, y: targetY });
        }
      }
    }
  }
  // Crystal Ball: swap with adjacent ally or Courtier
  if (p.equip === "crystal_ball") {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (inBounds(nx, ny, boardSize)) {
          const targetPiece = b[ny]?.[nx]; // Safe navigation
          const targetObstacle = O[ny]?.[nx]; // Check for obstacle
          // Can swap with allied piece or Courtier
          if (
            (targetPiece && targetPiece.color === p.color) ||
            targetObstacle === "courtier"
          ) {
            out.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
  return out;
}

// Helper function to get King moves ignoring stun status (for checkmate detection)
function kingMovesIgnoringStun(
  b: Board,
  T: Terrain,
  O: Obstacle,
  x: number,
  y: number,
  boardSize: number = S
) {
  const p = b[y]?.[x]; // Safe navigation
  if (!p || p.type !== "K") return [];
  const col = p.color;
  const out: { x: number; y: number }[] = [];
  
  // Get all adjacent squares (King can move one square in any direction)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx || dy) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny, boardSize)) continue;
        const t = b[ny]?.[nx]; // Safe navigation
        const obstacle = O[ny]?.[nx]; // Check for obstacles
        // Can move to empty squares or attack enemies/obstacles
        if (obstacle !== "none" || !t || t.color !== col) {
          out.push({ x: nx, y: ny });
        }
      }
    }
  }
  return out;
}

// --- Threat helpers ---
const attacks = (
  b: Board,
  T: Terrain,
  O: Obstacle,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  boardSize: number = S
) => {
  const p = b[sy]?.[sx]; // Safe navigation
  if (!p || (p.stunnedForTurns && p.stunnedForTurns > 0)) return false;
  return moves(b, T, O, sx, sy, boardSize).some((s) => s.x === tx && s.y === ty);
};

function supportCount(
  b: Board,
  T: Terrain,
  O: Obstacle,
  a: Piece | null, // <- widen type
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S
) {
  if (!a) return 0; // <- guard
  let c = 0;
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      if (x === from.x && y === from.y) continue;
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== a.color) continue;
      if (attacks(b, T, O, x, y, to.x, to.y, boardSize)) c++;
    }
  return c;
}

const findK = (b: Board, c: Color, boardSize: number = S) => {
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.type === "K" && p.color === c) return { p, x, y };
    }
  return null;
};
const findPieceById = (b: Board, id: string, boardSize: number = S) => {
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (p && p.id === id) return { p, x, y };
    }
  return null;
};
const threatened = (
  b: Board,
  T: Terrain,
  O: Obstacle,
  sq: { x: number; y: number },
  by: Color,
  boardSize: number = S
) => {
  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== by) continue;
      if (attacks(b, T, O, x, y, sq.x, sq.y, boardSize)) return true;
    }
  return false;
};

// --- Fog (Torch extends sight) ---
const visibility = (b: Board, phase: Phase, boardSize: number = S, fogRows: number = 2, marketViewVisible: boolean = false, marketEnabled: boolean = true) => {
  const v: boolean[][] = Array.from({ length: boardSize }, () =>
    Array(boardSize).fill(true)
  );
  
  // Special fog logic when market is visible during market phase AND market is enabled
  // If market is disabled, always use normal fog rules
  if (phase === "market" && marketViewVisible && marketEnabled) {
    // Hide all rows except the bottom 2 deployment rows
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        // Only show the bottom 2 rows (y <= 1)
        if (v[y]) v[y][x] = y <= 1; // Safe check
      }
    }
    return v;
  }
  
  // Normal fog logic (for playing phase, when market is hidden, or when market is disabled)
  // Hide the last N rows (enemy back ranks) based on fogRows parameter
  for (let y = boardSize - fogRows; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (v[y]) v[y][x] = false; // Safe check - hide fogged rows
    }
  }

  for (let y = 0; y < boardSize; y++)
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== W) continue;
      const R = p.equip === "torch" ? 3 : RAD;
      for (let yy = 0; yy < boardSize; yy++)
        for (let xx = 0; xx < boardSize; xx++)
          if (v[yy] && manhattan({ x, y }, { x: xx, y: yy }) <= R) v[yy][xx] = true; // Safe check - using Manhattan distance so diagonals don't count
      if (v[y]) v[y][x] = true; // Safe check
    }
  return v;
};

// --- Dice + mods ---
const d6 = (r: () => number) => 1 + Math.floor(r() * 6);
type Mod = { value: number; kind?: "sword" | "shield" | "support" | "terrain" };
const sumMods = (mods: Mod[]) =>
  mods.reduce(
    (acc, { value, kind }) => {
      // Ensure kind defaults to something if undefined, though terrain/water needs specific handling
      const k = (kind || "shield") as
        | "sword"
        | "shield"
        | "support"
        | "terrain";
      acc[k] = (acc[k] || 0) + value;
      return acc;
    },
    // Initialize all possible kinds including 'water' although we won't sum water directly here
    { sword: 0, shield: 0, support: 0, terrain: 0 } as Record<
      "sword" | "shield" | "support" | "terrain",
      number
    >
  );

// Updated resolve function for water terrain and Scythe defense
function resolve(
  r: () => number,
  a: Piece, // Attacker
  d: Piece, // Defender
  b: Board,
  T: Terrain,
  O: Obstacle,
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S,
  adv: boolean, // Advantage flag (usually for attacker King or special items)
  currentLevel?: number // Optional current level for tutorial mechanics
) {
  const terrainAtTarget = T[to.y]?.[to.x]; // Safe navigation
  const isTorchAdvantage = a.equip === "torch" && terrainAtTarget === "forest";
  const isVeteranAttacker = (a.kills || 0) >= 5;
  const isVeteranDefender = (d.kills || 0) >= 5;
  const useAdv = a.type === "K" || adv || isTorchAdvantage || isVeteranAttacker;

  // Tutorial mechanic: Force first combat die roll in level 1 to be won by white
  const tutorialUsed = localStorage.getItem("dicechess_first_combat_tutorial_used") === "true";
  const isFirstCombatTutorial = 
    !tutorialUsed && 
    currentLevel === 1 && 
    (a.color === W || d.color === W); // White is either attacking or defending

  // --- Attacker Roll ---
  let rollsA = [d6(r)];
  if (useAdv) rollsA.push(d6(r));
  let A = useAdv ? Math.max(...rollsA) : rollsA[0];
  let aForced = false;

  // Scythe effect for ATTACKER (skip if tutorial is active)
  if (!isFirstCombatTutorial && a.equip === "scythe" && d.type === "P") {
    A = 6;
    rollsA = [6]; // Update rolls array for UI
    aForced = true;
  }

  // --- Defender Roll ---
  let rollsD = [d6(r)];
  // Veterans also roll with advantage when defending
  if (isVeteranDefender) {
    rollsD.push(d6(r));
  }
  let D = isVeteranDefender ? Math.max(...rollsD) : rollsD[0];
  let dForced = false;

  // Stun effect for DEFENDER (overrides veteran advantage, skip if tutorial is active)
  if (!isFirstCombatTutorial && d.stunnedForTurns && d.stunnedForTurns > 0) {
    rollsD = [1];
    D = 1;
    dForced = true;
  }
  // Scythe effect for DEFENDER (overrides veteran advantage, skip if tutorial is active)
  else if (!isFirstCombatTutorial && d.equip === "scythe" && a.type === "P") {
    D = 6;
    rollsD = [6]; // Update rolls array for UI
    dForced = true;
  }

  // Tutorial: Force white to win on first combat in level 1 (applied after other effects to take precedence)
  if (isFirstCombatTutorial) {
    // Mark tutorial as used immediately to prevent it from triggering again
    localStorage.setItem("dicechess_first_combat_tutorial_used", "true");
    if (a.color === W) {
      // White is attacking: give white high roll, black low roll
      A = 6;
      rollsA = [6];
      if (useAdv) rollsA = [6, 6]; // If advantage, both dice are 6
      aForced = true;
      D = 1;
      rollsD = [1];
      if (isVeteranDefender) rollsD = [1, 1]; // If veteran, both dice are 1
      dForced = true;
    } else {
      // Black is attacking white: give black low roll, white high roll
      A = 1;
      rollsA = [1];
      if (useAdv) rollsA = [1, 1]; // If advantage, both dice are 1
      aForced = true;
      D = 6;
      rollsD = [6];
      if (isVeteranDefender) rollsD = [6, 6]; // If veteran, both dice are 6
      dForced = true;
    }
  }

  // --- Modifiers ---
  const am: Mod[] = [],
    dm: Mod[] = [];

  // Attacker mods
  if (a.equip === "sword") am.push({ value: 1, kind: "sword" });
  const sup = supportCount(b, T, O, a, from, to, boardSize);
  if (sup > 0) am.push({ value: sup, kind: "support" });

  // Defender mods
  const hasShield =
    d.equip === "shield" || isProtectedByBanner(b, d.color, to, boardSize);
  if (hasShield) dm.push({ value: 1, kind: "shield" });

  // Apply terrain modifiers for defense
  if (terrainAtTarget === "forest") {
    dm.push({ value: 1, kind: "terrain" });
  } else if (terrainAtTarget === "water") {
    dm.push({ value: -1, kind: "terrain" }); // Negative modifier for water
  }

  // --- Totals & Result ---
  const at = A + am.reduce((s, m) => s + m.value, 0);
  const dt = D + dm.reduce((s, m) => s + m.value, 0);
  return {
    a: { base: A, total: at, mods: am, rolls: rollsA, forced: aForced },
    d: { base: D, total: dt, mods: dm, rolls: rollsD, forced: dForced },
    win: at >= dt, // Attacker wins on tie or higher
    adv: useAdv || isVeteranAttacker, // Include veteran attacker advantage
    defAdv: isVeteranDefender, // Track defender advantage
  };
}

// Helper function to check if the Bell of Names exists on the board
function bellOfNamesExists(obstacles: Obstacle, boardSize: number): boolean {
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (obstacles[y]?.[x] === "bell") {
        return true;
      }
    }
  }
  return false;
}

function resolveObstacle(
  r: () => number,
  a: Piece,
  b: Board,
  T: Terrain,
  O: Obstacle,
  from: { x: number; y: number },
  to: { x: number; y: number },
  adv: boolean,
  boardSize: number = S
) {
  const obstacleType = O[to.y]?.[to.x];
  
  // Determine threshold based on obstacle type
  let threshold = 5; // Rock default
  if (obstacleType === "courtier") {
    threshold = 1; // Courtier is easier to destroy
  } else if (obstacleType === "gate") {
    threshold = 3; // Gate requires 3+ to break
  } else if (obstacleType === "bell") {
    threshold = 4; // Bell requires 4+ to break
  } else if (obstacleType === "column") {
    threshold = 6; // Column requires 6+ to break
  }
  
  const useAdv = a.type === "K" || adv;
  const rolls = [d6(r)];
  if (useAdv) rolls.push(d6(r));
  const A = useAdv ? Math.max(...rolls) : rolls[0];

  const am: Mod[] = [];
  if (a.equip === "sword") am.push({ value: 1, kind: "sword" });
  const sup = supportCount(b, T, O, a, from, to, boardSize);
  if (sup > 0) am.push({ value: sup, kind: "support" });
  const at = A + am.reduce((s, m) => s + m.value, 0);
  return {
    a: { base: A, total: at, mods: am, rolls },
    ok: at >= threshold,
    adv: useAdv,
  };
}

// --- Bot Logic ---
const val = (p: Piece) => (p.type === "K" ? 1000 : (VAL as any)[p.type] || 0);

// Calculate sell value (50% of piece + equipment value)
const getSellValue = (p: Piece): number => {
  const pieceValue = val(p);
  const equipmentValue = p.equip ? ITEM_COSTS[p.equip] || 0 : 0;
  return Math.floor((pieceValue + equipmentValue) * 0.5);
};
const tryMove = (
  b: Board,
  T: Terrain,
  from: { x: number; y: number },
  to: { x: number; y: number }
) => {
  // No longer need ROCK check since they're obstacles now, not pieces
  const nb = cloneB(b);
  const mv = nb[from.y]?.[from.x]; // Safe navigation
  if (!mv) return null;
  nb[to.y][to.x] = mv;
  nb[from.y][from.x] = null;
  return nb;
};
function bot(
  b: Board,
  T: Terrain,
  O: Obstacle,
  c: Color,
  r: () => number,
  boardSize: number = S,
  behavior: "aggressive" | "defensive" | "balanced" = "balanced"
) {
  const opp = c === W ? B : W;
  const ms: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    score: number;
  }[] = [];

  // Behavior modifiers
  const isAggressive = behavior === "aggressive";
  const isDefensive = behavior === "defensive";
  const isBalanced = behavior === "balanced";

  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const p = b[y]?.[x]; // Safe navigation
      if (!p || p.color !== c) continue;
      for (const t of moves(b, T, O, x, y, boardSize)) {
        const cap = b[t.y]?.[t.x]; // Safe navigation
        const targetObstacle = O[t.y]?.[t.x]; // Check for obstacle at target
        let sc = 0;
        if (cap) {
          // --- CAPTURE MOVE SCORING ---
          if (p.equip === "crystal_ball" && cap.color === p.color) {
            // Crystal Ball swap
            sc = 0.1; // Small positive score to encourage using item
          } else {
            const winProb =
              winPercent(b, T, O, p, cap, { x, y }, t, boardSize) / 100;
            const riskProb = 1 - winProb;

            let valueGain = val(cap);

            // AI LOGIC UPGRADE: Staff conversion is a huge gain
            if (p.equip === "staff") {
              // Winning converts the piece, so the value is gaining their piece without losing yours.
              valueGain = val(cap) + val(p);
            }

            // AI LOGIC UPGRADE: Attacking a skull piece is a trade at best
            if (cap.equip === "skull") {
              // If you win, you trade pieces. Net gain is their value minus your value.
              valueGain = val(cap) - val(p);
            }

            sc = winProb * valueGain - riskProb * val(p);

            // Behavior-specific adjustments for captures
            if (isAggressive) {
              // Aggressive: More willing to take risky trades (lower threshold)
              if (winProb >= 0.58) {
                sc += 5; // Bonus for 58%+ trades
              }
              // Extra bonus for attacking the enemy King - prioritize even with lower win%
              if (cap.type === "K") {
                // Give huge bonus even for risky king attacks
                if (winProb >= 0.4) {
                  sc += 80; // Massive bonus for 40%+ chance to kill king
                } else if (winProb >= 0.25) {
                  sc += 40; // Still pursue king even with 25%+ chance
                } else {
                  sc += 20; // Consider any king attack
                }
                // Extra bonus if the king is already threatened or isolated
                const kingAllies = supportCount(b, T, O, cap, t, t, boardSize);
                if (kingAllies === 0) {
                  sc += 30; // Isolated king is prime target
                }
              }
              // Slight bonus for any capture
              if (valueGain > 0) {
                sc += 2;
              }
            } else if (isDefensive) {
              // Defensive: Only take favorable trades
              if (winProb < 0.7) {
                sc -= 10; // Heavy penalty for risky trades
              }
              // Avoid trading valuable pieces
              if (val(p) >= 30 && riskProb > 0.2) {
                sc -= val(p) * 0.5;
              }
              // Extra caution: Check if this capture leaves the king vulnerable
              const afterCapture = tryMove(b, T, { x, y }, t);
              if (afterCapture) {
                const myKingAfter = findK(afterCapture, c, boardSize);
                if (myKingAfter) {
                  const kingThreatenedAfterCapture = threatened(
                    afterCapture,
                    T,
                    O,
                    { x: myKingAfter.x, y: myKingAfter.y },
                    opp,
                    boardSize
                  );
                  if (kingThreatenedAfterCapture) {
                    // Major penalty if this capture exposes our king
                    sc -= 30;
                  }
                  // Also check if we're removing a defender of the king
                  const myKingNow = findK(b, c, boardSize);
                  if (myKingNow) {
                    const distToKingBefore =
                      Math.abs(x - myKingNow.x) + Math.abs(y - myKingNow.y);
                    const distToKingAfter =
                      Math.abs(t.x - myKingNow.x) + Math.abs(t.y - myKingNow.y);
                    // Penalty for moving key defenders away from king
                    if (distToKingBefore <= 2 && distToKingAfter > 2) {
                      sc -= 15; // Don't leave king undefended
                    }
                  }
                }
              }
            } else if (isBalanced) {
              // Balanced: Favor good trades but consider position
              if (cap.type === "K" && winProb >= 0.65) {
                sc += 30; // Good bonus for likely king kills
              }
            }

            // AI LOGIC UPGRADE: Add incentive to use one-time Lance on good trades
            const dir = p.color === W ? 1 : -1;
            const isLanceMove =
              p.equip === "lance" && t.y === y + 2 * dir && t.x === x;
            if (isLanceMove && valueGain > 0) {
              sc += 5; // Bonus for using this powerful one-time item
            }
          }
        } else if (targetObstacle !== "none") {
          // --- CRYSTAL BALL SWAP WITH COURTIER SCORING ---
          if (p.equip === "crystal_ball" && targetObstacle === "courtier") {
            // Crystal Ball swap with Courtier - small positive score to encourage using item
            // This allows repositioning without destroying the Courtier
            sc = 0.1;
          } else {
            // --- OBSTACLE ATTACK SCORING ---
            // Black bot should NEVER attack the bell (it protects their king)
            if (targetObstacle === "bell" && c === B) {
              continue; // Skip bell attacks for black
            }
            const winProb =
              obstacleWinPercent(b, T, O, p, { x, y }, t, boardSize) / 100;
            sc = winProb * 1 - (1 - winProb) * 0.1; // Small penalty for failure
            
            // Defensive bots should avoid attacking rock obstacles
            if (isDefensive && targetObstacle === "rock") {
              sc -= 15; // Heavy penalty for defensive bots attacking rocks
            }
          }
        } else {
          // --- QUIET MOVE SCORING (AI LOGIC UPGRADE) ---
          const nb = tryMove(b, T, { x, y }, t);
          if (!nb) continue;

          sc = r() * 0.01; // Start with random tie-breaker

          // 1. Pawn Advancement (for black, a lower y-value is an advance)
          if (p.type === "P") {
            const advancementScore = (boardSize - 1 - t.y) * 0.2;
            sc += advancementScore;
            // Aggressive: Push pawns forward more aggressively
            if (isAggressive) {
              sc += advancementScore * 0.5;
            }
          }

          // 2. Piece Safety
          const isSafeNow = !threatened(nb, T, O, t, opp, boardSize);
          const wasThreatenedBefore = threatened(
            b,
            T,
            O,
            { x, y },
            opp,
            boardSize
          );
          if (!isSafeNow) {
            const hangingPenalty = val(p);
            sc -= hangingPenalty; // Heavy penalty for moving to a square where this piece can be captured
            // Defensive: Extra penalty for hanging pieces
            if (isDefensive) {
              sc -= hangingPenalty * 0.5;
            }
          } else if (wasThreatenedBefore) {
            sc += val(p) * 0.5; // Reward moving a threatened piece to safety
            // Defensive: Extra reward for saving threatened pieces
            if (isDefensive) {
              sc += val(p) * 0.3;
            }
          }

          // Balanced: Center control bonus (middle squares of the board)
          if (isBalanced) {
            const center = Math.floor(boardSize / 2);
            const distToCenter =
              Math.abs(t.x - center) + Math.abs(t.y - center);
            sc += (4 - distToCenter) * 0.5; // Higher score for moves closer to center
          }

          // Aggressive: Forward movement bonus
          if (isAggressive) {
            const direction = c === W ? 1 : -1;
            const forwardProgress = (t.y - y) * direction;
            if (forwardProgress > 0) {
              sc += forwardProgress * 1.5; // Bonus for moving toward enemy
            }

            // Aggressive: Prioritize threatening the enemy king
            const enemyKing = findK(nb, opp, boardSize);
            if (enemyKing) {
              const enemyKingPos = { x: enemyKing.x, y: enemyKing.y };
              // Check if this move puts the king in check
              const threateningKing = attacks(
                nb,
                T,
                O,
                t.x,
                t.y,
                enemyKingPos.x,
                enemyKingPos.y,
                boardSize
              );
              if (threateningKing) {
                sc += 35; // Big bonus for threatening the king
              }

              // Bonus for moving closer to the enemy king
              const distToKing =
                Math.abs(t.x - enemyKingPos.x) + Math.abs(t.y - enemyKingPos.y);
              const oldDistToKing =
                Math.abs(x - enemyKingPos.x) + Math.abs(y - enemyKingPos.y);
              if (distToKing < oldDistToKing) {
                sc += 3; // Reward for advancing toward the king
              }
              if (distToKing <= 3) {
                sc += (4 - distToKing) * 2; // Extra bonus for being near the king
              }
            }
          }

          // Defensive: King safety - keep king in back rank or protected
          if (isDefensive && p.type === "K") {
            const backRank = c === W ? 0 : boardSize - 1;
            if (t.y !== backRank) {
              sc -= 5; // Penalty for moving king away from back rank
            }
            // Bonus for king being surrounded by allies
            let adjacentAllies = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const neighbor = nb[t.y + dy]?.[t.x + dx];
                if (neighbor && neighbor.color === c) adjacentAllies++;
              }
            }
            sc += adjacentAllies * 2;
          }

          // Defensive: Proactive king defense - foresee opponent attacks
          if (isDefensive) {
            const myKing = findK(nb, c, boardSize);
            const myKingBefore = findK(b, c, boardSize);
            if (myKing) {
              const kingPos = { x: myKing.x, y: myKing.y };
              // Check if king is threatened after this move
              const kingThreatenedAfter = threatened(
                nb,
                T,
                O,
                kingPos,
                opp,
                boardSize
              );
              const kingThreatenedBefore = myKingBefore
                ? threatened(b, T, O, { x: myKingBefore.x, y: myKingBefore.y }, opp, boardSize)
                : false;

              if (kingThreatenedAfter && !kingThreatenedBefore) {
                // Severe penalty for moves that expose the king to attack
                sc -= 50;
              } else if (kingThreatenedBefore && !kingThreatenedAfter) {
                // Big reward for moves that remove king from danger
                sc += 40;
              }

              // Count how many enemy pieces can attack the king position after this move
              let enemyAttackers = 0;
              for (let yy = 0; yy < boardSize; yy++) {
                for (let xx = 0; xx < boardSize; xx++) {
                  const enemy = nb[yy]?.[xx];
                  if (enemy && enemy.color === opp) {
                    if (attacks(nb, T, O, xx, yy, kingPos.x, kingPos.y, boardSize)) {
                      enemyAttackers++;
                    }
                  }
                }
              }

              // Penalty for each enemy piece that can attack the king
              sc -= enemyAttackers * 8;

              // Reward for blocking enemy attacks to the king
              if (p.type !== "K") {
                // Check if this piece is now between an enemy attacker and the king
                let blocksAttack = false;
                for (let yy = 0; yy < boardSize; yy++) {
                  for (let xx = 0; xx < boardSize; xx++) {
                    const enemy = b[yy]?.[xx];
                    if (enemy && enemy.color === opp) {
                      const couldAttackBefore = attacks(
                        b,
                        T,
                        O,
                        xx,
                        yy,
                        kingPos.x,
                        kingPos.y,
                        boardSize
                      );
                      const canAttackAfter = attacks(
                        nb,
                        T,
                        O,
                        xx,
                        yy,
                        kingPos.x,
                        kingPos.y,
                        boardSize
                      );
                      if (couldAttackBefore && !canAttackAfter) {
                        blocksAttack = true;
                        break;
                      }
                    }
                  }
                  if (blocksAttack) break;
                }
                if (blocksAttack) {
                  sc += 25; // Reward for blocking attacks to the king
                }
              }

              // Reward for keeping defenders near the king
              if (p.type !== "K") {
                const distToKing =
                  Math.abs(t.x - kingPos.x) + Math.abs(t.y - kingPos.y);
                const oldDistToKing = myKingBefore
                  ? Math.abs(x - myKingBefore.x) + Math.abs(y - myKingBefore.y)
                  : 999;
                if (distToKing <= 2) {
                  sc += (3 - distToKing) * 3; // Stay close to king
                }
                if (distToKing < oldDistToKing) {
                  sc += 5; // Moving closer to king
                }
              }
            }
          }

          // 3. Item & Positional Synergy
          // Encourage moving pieces to be protected by a banner
          if (
            isProtectedByBanner(nb, p.color, t, boardSize) &&
            !isProtectedByBanner(b, p.color, { x, y }, boardSize)
          ) {
            sc += 3;
          }
          // Encourage banner carriers to move towards allies to protect them
          if (p.equip === "banner") {
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const ally = b[t.y + dy]?.[t.x + dx];
                if (ally && ally.color === p.color) sc += 1;
              }
            }
          }
        }
        ms.push({ from: { x, y }, to: t, score: sc });
      }
    }
  }
  if (!ms.length) return null;

  // Check logic
  const k = findK(b, c, boardSize);
  const inChk = k
    ? threatened(b, T, O, { x: k.x, y: k.y }, opp, boardSize)
    : false;
  if (inChk) {
    const ev = ms.filter((m) => {
      const nb = tryMove(b, T, m.from, m.to);
      if (!nb) return false;
      const k2 = findK(nb, c, boardSize);
      if (!k2) return false; // This move gets king captured, not an evasion
      return !threatened(nb, T, O, { x: k2.x, y: k2.y }, opp, boardSize);
    });
    if (ev.length) {
      const best = Math.max(...ev.map((m) => m.score));
      return rand(
        r,
        ev.filter((m) => m.score >= best - 0.5)
      );
    } else {
      // Before declaring checkmate, check if the King has any escape squares available
      // (ignoring stun status, since stun is temporary and doesn't mean checkmate)
      if (k) {
        const kingEscapeSquares = kingMovesIgnoringStun(b, T, O, k.x, k.y, boardSize);
        for (const escapeSquare of kingEscapeSquares) {
          const nb = tryMove(b, T, { x: k.x, y: k.y }, escapeSquare);
          if (!nb) continue;
          const k2 = findK(nb, c, boardSize);
          if (!k2) continue; // This move gets king captured, not an evasion
          if (!threatened(nb, T, O, { x: k2.x, y: k2.y }, opp, boardSize)) {
            // King has an escape square available, so it's not checkmate
            // Return null to indicate no moves can be made this turn (due to stun),
            // but don't declare checkmate
            return null;
          }
        }
      }
      // No escape squares available - this is truly checkmate
      return null; // This is checkmate
    }
  }

  // Behavior-specific move filtering
  let movePool = ms;

  if (isAggressive) {
    // Aggressive: Prioritize king attacks, even risky ones
    const enemyKing = findK(b, opp, boardSize);
    const kingAttackMoves = enemyKing
      ? ms.filter((m) => {
          const target = b[m.to.y]?.[m.to.x];
          return target && target.type === "K";
        })
      : [];
    
    // Debug: Log all moves with their scores
    console.log("🤖 Aggressive Bot - All moves:", ms.map(m => ({
      from: m.from,
      to: m.to,
      score: m.score.toFixed(2),
      target: b[m.to.y]?.[m.to.x]?.type || 'empty'
    })).sort((a, b) => parseFloat(b.score) - parseFloat(a.score)).slice(0, 10)); // Top 10
    
    if (kingAttackMoves.length > 0) {
      // If we have any king attack moves, strongly consider them
      // Include king attacks with score >= -20 (very permissive)
      movePool = kingAttackMoves.filter((m) => m.score >= -20);
      if (movePool.length === 0) movePool = kingAttackMoves; // Take any king attack
      console.log("🎯 King attack moves available:", kingAttackMoves.length);
    } else {
      // No king attacks available, consider all moves (score >= -5)
      movePool = ms.filter((m) => m.score >= -5);
      if (movePool.length === 0) movePool = ms; // Fallback
      console.log("⚔️ No king attacks, considering moves with score >= -5:", movePool.length);
    }
  } else if (isDefensive) {
    // Defensive: Only safe moves (score >= 5)
    const safeMoves = ms.filter((m) => m.score >= 5);
    movePool =
      safeMoves.length > 0 ? safeMoves : ms.filter((m) => m.score >= 0);
    if (movePool.length === 0) movePool = ms; // Fallback
  } else {
    // Balanced: Sensible moves (score >= 0)
    const sensibleMoves = ms.filter((m) => m.score >= 0);
    movePool = sensibleMoves.length > 0 ? sensibleMoves : ms;
  }

  const best = Math.max(...movePool.map((m) => m.score));

  // Behavior-specific best move selection tolerance
  let tolerance = 1;
  if (isAggressive) {
    tolerance = 3; // More random, less calculated
  } else if (isDefensive) {
    tolerance = 0.5; // Very precise, pick only best moves
  } else {
    tolerance = 1; // Balanced
  }

  const bestMoves = movePool.filter((m) => m.score >= best - tolerance);
  return rand(r, bestMoves);
}

// --- Odds helpers (used by Board) ---
const advPMF = (k: number) => (2 * k - 1) / 36;
function winPercent(
  BD: Board,
  TD: Terrain,
  OD: Obstacle,
  att: Piece,
  def: Piece,
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S
) {
  const aSup = supportCount(BD, TD, OD, att, from, to, boardSize);
  const aMod = (att.equip === "sword" ? 1 : 0) + aSup;
  // Adjusted defense modifier calculation for water
  const terrainMod =
    TD[to.y]?.[to.x] === "forest" ? 1 : TD[to.y]?.[to.x] === "water" ? -1 : 0; // Safe navigation
  const dMod =
    (def.equip === "shield" || isProtectedByBanner(BD, def.color, to, boardSize)
      ? 1
      : 0) + terrainMod;
  const dir = att.color === W ? 1 : -1;
  const lanceLungeUsed =
    att.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
  const isTorchAdvantage =
    att.equip === "torch" && TD[to.y]?.[to.x] === "forest"; // Safe navigation
  const useAdv = att.type === "K" || lanceLungeUsed || isTorchAdvantage;

  // Calculate Attacker's roll probability (considering Scythe)
  let aPMF = new Array(7).fill(0);
  if (att.equip === "scythe" && def.type === "P") {
    aPMF[6] = 1; // Always rolls 6
  } else if (useAdv) {
    for (let k = 1; k <= 6; k++) aPMF[k] = advPMF(k);
  } else {
    for (let k = 1; k <= 6; k++) aPMF[k] = 1 / 6;
  }

  // Calculate Defender's roll probability (considering Scythe and Stun)
  let dPMF = new Array(7).fill(0);
  if (def.stunnedForTurns && def.stunnedForTurns > 0) {
    dPMF[1] = 1; // Always rolls 1 if stunned
  } else if (def.equip === "scythe" && att.type === "P") {
    dPMF[6] = 1; // Always rolls 6 if defending vs Pawn with Scythe
  } else {
    for (let k = 1; k <= 6; k++) dPMF[k] = 1 / 6; // Standard roll otherwise
  }

  let p = 0;
  for (let a = 1; a <= 6; a++)
    for (let d = 1; d <= 6; d++) {
      if (a + aMod >= d + dMod) p += aPMF[a] * dPMF[d];
    }
  return Math.round(p * 100);
}
function obstacleWinPercent(
  BD: Board,
  TD: Terrain,
  OD: Obstacle,
  att: Piece,
  from: { x: number; y: number },
  to: { x: number; y: number },
  boardSize: number = S
) {
  const obstacleType = OD[to.y]?.[to.x];
  
  // Determine threshold based on obstacle type
  let threshold = 5; // Rock default
  if (obstacleType === "courtier") {
    threshold = 1; // Courtier is easier to destroy
  } else if (obstacleType === "gate") {
    threshold = 3; // Gate requires 3+ to break
  } else if (obstacleType === "bell") {
    threshold = 4; // Bell requires 4+ to break
  } else if (obstacleType === "column") {
    threshold = 6; // Column requires 6+ to break
  }
  
  const aSup = supportCount(BD, TD, OD, att, from, to, boardSize);
  const aMod = (att.equip === "sword" ? 1 : 0) + aSup;
  const dir = att.color === W ? 1 : -1;
  const lanceLungeUsed =
    att.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
  const useAdv = att.type === "K" || lanceLungeUsed;
  const target = threshold - aMod;
  if (target <= 1) return 100;
  if (target > 6) return 0;
  let p = 0;
  if (useAdv) {
    const probSingleLessThan = (target - 1) / 6;
    p = 1 - probSingleLessThan * probSingleLessThan;
  } else {
    p = (6 - (target - 1)) / 6;
  }
  return Math.round(p * 100);
}

// --- UI Components ---

const AnimatedSpeechBubble = ({ text }: { text: string }) => {
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    setCharCount(0);
    if (text) {
      // Strip markers to get the actual character count (without **)
      const cleanText = text.replace(/\*\*/g, "");
      let i = 0;
      const intervalId = setInterval(() => {
        i++;
        setCharCount(i);
        if (i >= cleanText.length) {
          clearInterval(intervalId);
        }
      }, 50);
      return () => clearInterval(intervalId);
    }
  }, [text]);

  // Parse text for **emphasized** sections and handle partial display
  const parseEmphasis = (str: string, displayedChars: number) => {
    const parts: Array<{ text: string; emphasized: boolean }> = [];
    const regex = /\*\*(.*?)\*\*/g;
    let lastIndex = 0;
    let match;
    let charsProcessed = 0;

    while ((match = regex.exec(str)) !== null) {
      // Add text before the match
      const beforeText = str.slice(lastIndex, match.index);
      if (beforeText.length > 0) {
        const visibleChars = Math.max(
          0,
          Math.min(beforeText.length, displayedChars - charsProcessed)
        );
        if (visibleChars > 0) {
          parts.push({
            text: beforeText.slice(0, visibleChars),
            emphasized: false,
          });
        }
        charsProcessed += beforeText.length;
      }

      // Add the emphasized text
      const emphasizedText = match[1];
      const visibleChars = Math.max(
        0,
        Math.min(emphasizedText.length, displayedChars - charsProcessed)
      );
      if (visibleChars > 0) {
        parts.push({
          text: emphasizedText.slice(0, visibleChars),
          emphasized: true,
        });
      }
      charsProcessed += emphasizedText.length;
      lastIndex = regex.lastIndex;

      if (charsProcessed >= displayedChars) break;
    }

    // Add remaining text
    if (lastIndex < str.length && charsProcessed < displayedChars) {
      const remainingText = str.slice(lastIndex);
      const visibleChars = Math.max(
        0,
        Math.min(remainingText.length, displayedChars - charsProcessed)
      );
      if (visibleChars > 0) {
        parts.push({
          text: remainingText.slice(0, visibleChars),
          emphasized: false,
        });
      }
    }

    return parts;
  };

  const parts = parseEmphasis(text, charCount);

  return (
    <>
      {parts.map((part, idx) =>
        part.emphasized ? (
          <span key={idx} className="speech-emphasis">
            {part.text.split("").map((char, charIdx) => (
              <span
                key={charIdx}
                className="speech-letter"
                style={{ animationDelay: `${charIdx * 0.1}s` }}
              >
                {char}
              </span>
            ))}
          </span>
        ) : (
          <span key={idx}>{part.text}</span>
        )
      )}
    </>
  );
};

/**
 * DiceD6 — a drop‑in, juicy 1d6 rolling animation.
 */
function DiceD6({
  rolling,
  result,
  size = 24,
  seed = 0,
}: {
  rolling: boolean;
  result: number | null; // 1..6 when known, otherwise null while computing
  size?: number;
  seed?: number; // optional: use fx id to vary animation subtly
}) {
  const [face, setFace] = useState<number>(result ?? 1);
  const [t, setT] = useState(rolling ? 0 : 1); // 0..1 animation progress
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const startRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);

  // Small deterministic RNG so both attacker/defender feel different but consistent
  const rng = useMemo(() => {
    let s = (seed || 0) + 1337;
    return () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5; // xorshift32
      return (s >>> 0) / 0xffffffff;
    };
  }, [seed]);

  // Pick a new face different from current
  const nextFace = (cur: number) => {
    let f = Math.floor(rng() * 6) + 1;
    if (f === cur) f = (f % 6) + 1;
    return f;
  };

  useEffect(() => {
    if (rolling) {
      // Start a new roll sequence
      runningRef.current = true;
      startRef.current = performance.now();
      lastTickRef.current = startRef.current;
      const spinMs = 950; // total roll duration

      const step = (now: number) => {
        if (!runningRef.current) return;
        const elapsed = now - startRef.current;
        const raw = Math.min(1, elapsed / spinMs);
        // Ease-out with a little overshoot to feel physical
        const eased = easeOutBack(raw);
        setT(eased);

        // Flip frequency decelerates: fast at start, slow at end
        // freq goes from ~40 flips/sec → ~5 flips/sec over time
        const flipsPerSec = lerp(40, 5, eased);
        const minDelta = 1000 / flipsPerSec;
        if (now - lastTickRef.current > minDelta) {
          setFace((cur) => nextFace(cur));
          lastTickRef.current = now;
        }

        if (elapsed < spinMs) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          // Snap to the final result if provided
          if (result && result >= 1 && result <= 6) setFace(result);
          runningRef.current = false;
          setT(1);
        }
      };

      rafRef.current = requestAnimationFrame(step);
      return () => {
        runningRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    } else {
      // Not rolling: ensure we show the final, if we have it
      if (result) setFace(result);
      setT(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolling, result]); // Added result to dependencies

  useEffect(() => {
    // When a new result arrives mid-roll, let the sequence finish; otherwise snap
    if (!rolling && result) setFace(result);
  }, [result, rolling]);

  // Pose transforms
  const spin = useMemo(() => {
    // A subtle tumbling motion in 3D-ish space
    const rotZ = lerp(540, 0, t) + rng() * 6; // degrees
    const rotX = lerp(35, 0, t);
    const rotY = lerp(25, 0, t);
    const bob = Math.sin(t * Math.PI) * (size / 6); // jump arc
    const squash =
      1 + (t < 1 ? Math.max(0, 0.14 - Math.abs(0.86 - t) * 0.4) : 0);
    return { rotZ, rotX, rotY, bob, squash };
  }, [t, size, rng]);

  // Slight jitter for hand-rolled feel
  const jitter = useMemo(
    () => (rolling ? (rng() - 0.5) * 0.6 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rolling, t]
  );

  const s = size;
  const pip = s * 0.12;
  const r = s * 0.18; // corner radius

  return (
    <div
      style={{
        width: s,
        height: s,
        perspective: 600,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        filter: `drop-shadow(0 ${Math.max(0, 5 - spin.bob * 0.2)}px ${Math.max(
          6,
          12 - spin.bob
        )}px rgba(0,0,0,${0.35 + (rolling ? 0.15 : 0)}))`,
      }}
      aria-label={rolling ? "Rolling d6" : `d6: ${face}`}
    >
      <div
        style={{
          width: s,
          height: s,
          transform: `translateY(${-spin.bob}px) rotateX(${
            spin.rotX
          }deg) rotateY(${spin.rotY}deg) rotate(${
            spin.rotZ + jitter
          }deg) scale(${spin.squash}, ${1 / spin.squash})`,
          transition: rolling ? "none" : "transform 120ms ease-out",
        }}
      >
        <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
          {/* Die body */}
          <rect
            x={0}
            y={0}
            width={s}
            height={s}
            rx={r}
            ry={r}
            fill="white"
            stroke="#111"
            strokeWidth={s * 0.03}
          />
          {/* Bevel */}
          <rect
            x={s * 0.02}
            y={s * 0.02}
            width={s * 0.96}
            height={s * 0.96}
            rx={r * 0.75}
            ry={r * 0.75}
            fill="#f3f3f3"
          />
          {/* Pips */}
          {renderPips(face, s, pip)}
        </svg>
      </div>
    </div>
  );
}

function renderPips(n: number, s: number, pip: number) {
  const dot = (cx: number, cy: number) => (
    <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={pip} fill="#111" />
  );
  const m = s / 2;
  const g = s / 4; // grid step
  const TL = [g, g],
    TR = [s - g, g],
    BL = [g, s - g],
    BR = [s - g, s - g],
    ML = [g, m],
    MR = [s - g, m];
  const mid = [m, m];
  switch (n) {
    case 1:
      return [dot(mid[0], mid[1])];
    case 2:
      return [dot(TL[0], TL[1]), dot(BR[0], BR[1])];
    case 3:
      return [dot(TL[0], TL[1]), dot(mid[0], mid[1]), dot(BR[0], BR[1])];
    case 4:
      return [
        dot(TL[0], TL[1]),
        dot(TR[0], TR[1]),
        dot(BL[0], BL[1]),
        dot(BR[0], BR[1]),
      ];
    case 5:
      return [
        dot(TL[0], TL[1]),
        dot(TR[0], TR[1]),
        dot(mid[0], mid[1]),
        dot(BL[0], BL[1]),
        dot(BR[0], BR[1]),
      ];
    case 6:
      return [
        dot(TL[0], TL[1]),
        dot(TR[0], TR[1]),
        dot(ML[0], ML[1]),
        dot(MR[0], MR[1]),
        dot(BL[0], BL[1]),
        dot(BR[0], BR[1]),
      ];
    default:
      return [dot(mid[0], mid[1])];
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

// --- Board Component ---
// Updated to render water tiles and terrain glyphs/tooltips
function BoardComponent({
  board,
  T,
  obstacles,
  V,
  sel,
  legal,
  click,
  fx,
  phase,
  dispA,
  dispD,
  bumpA,
  bumpD,
  wChk,
  bChk,
  speechBubble,
  marketAction,
  rerollState,
  rerollTarget,
  combatId,
  destroyedPieceIds,
  failedAttackId,
  showBoardTooltips,
  showTooltip,
  hideTooltip,
  drag,
  startDrag,
  lastMove,
  moveAnim,
  sellPiece,
  sellButtonPos,
  setSellButtonPos,
  boardSize,
  victoryConditions,
  setSpeechBubble,
  currentLevelConfig,
  kingEscapeGuideActive,
  kingEscapeGuideOpacity,
}: {
  board: Board;
  T: Terrain;
  obstacles: Obstacle;
  V: boolean[][];
  sel: { x: number; y: number } | null;
  legal: { x: number; y: number }[];
  click: (x: number, y: number) => void;
  fx: any;
  phase: Phase;
  dispA: number | null;
  dispD: number | null;
  bumpA: boolean;
  bumpD: boolean;
  wChk: boolean;
  bChk: boolean;
  speechBubble: { text: string; id: number; targetId: string } | null;
  marketAction: MarketAction;
  rerollState: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    kind: "piece" | "obstacle";
    obstacleType?: ObstacleType;
  } | null;
  rerollTarget: "attacker" | "defender" | null;
  combatId: number;
  destroyedPieceIds: string[];
  failedAttackId: string | null;
  showBoardTooltips: boolean;
  showTooltip: (text: string) => void;
  hideTooltip: () => void;
  drag: any;
  startDrag: (e: React.MouseEvent, x: number, y: number) => void;
  lastMove: {
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null;
  moveAnim: any;
  sellPiece: (x: number, y: number) => void;
  sellButtonPos: { x: number; y: number } | null;
  setSellButtonPos: (pos: { x: number; y: number } | null) => void;
  boardSize: number;
  victoryConditions: string[];
  setSpeechBubble: (bubble: { text: string; id: number; targetId: string } | null) => void;
  currentLevelConfig: any;
  kingEscapeGuideActive: boolean;
  kingEscapeGuideOpacity: number;
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [chipPositions, setChipPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const boardContainerRef = React.useRef<HTMLDivElement>(null);
  const isL = useCallback(
    (x: number, y: number) => legal.some((s) => s.x === x && s.y === y),
    [legal]
  );

  // Memoize sums calculations to avoid recomputing on every render
  const sumsA = useMemo(
    () =>
      fx ? sumMods(fx.a.mods) : { sword: 0, shield: 0, support: 0, terrain: 0 },
    [fx]
  );
  const sumsD = useMemo(
    () =>
      fx && fx.kind === "piece"
        ? sumMods(fx.d.mods)
        : { sword: 0, shield: 0, support: 0, terrain: 0 },
    [fx]
  );

  // Collect supporting pieces for visual connection lines
  const supportingPieces = useMemo(() => {
    if (!hover || !sel || !board[sel.y]?.[sel.x]) return [];
    
    const hoveredAttackTarget =
      isL(hover.x, hover.y) &&
      (board[hover.y]?.[hover.x] || obstacles[hover.y]?.[hover.x] !== "none");
    
    if (!hoveredAttackTarget) return [];
    
    const selectedPiece = board[sel.y]?.[sel.x];
    if (!selectedPiece) return [];
    
    const supporting: { x: number; y: number }[] = [];
    
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const p = board[y]?.[x];
        if (
          p &&
          p.id !== selectedPiece.id &&
          p.color === selectedPiece.color &&
          attacks(board, T, obstacles, x, y, hover.x, hover.y, boardSize)
        ) {
          supporting.push({ x, y });
        }
      }
    }
    
    return supporting;
  }, [hover, sel, board, T, obstacles, boardSize, isL]);

  // Calculate chip positions mathematically from grid layout
  // This avoids measurement issues during animations/transforms
  useEffect(() => {
    if (!hover || !sel || supportingPieces.length === 0) {
      setChipPositions((prev) => prev.size === 0 ? prev : new Map());
      return;
    }

    const positions = new Map<string, { x: number; y: number }>();
    const tileSize = 88; // Each tile is 88px × 88px
    const labelOffset = 24; // Horizontal offset for rank labels
    const halfTile = tileSize / 2; // Center of a tile

    // Calculate supporting piece positions
    supportingPieces.forEach((support) => {
      const visualY = boardSize - 1 - support.y;
      const centerX = labelOffset + support.x * tileSize + halfTile;
      const centerY = visualY * tileSize + halfTile;
      
      positions.set(`support-${support.x}-${support.y}`, {
        x: centerX,
        y: centerY,
      });
    });

    // Calculate target position
    const visualY = boardSize - 1 - hover.y;
    const centerX = labelOffset + hover.x * tileSize + halfTile;
    const centerY = visualY * tileSize + halfTile;
    
    positions.set(`target-${hover.x}-${hover.y}`, {
      x: centerX,
      y: centerY,
    });

    setChipPositions((prev) => {
      // Check if positions have changed to avoid unnecessary re-renders
      if (prev.size !== positions.size) return positions;
      for (const [key, value] of positions.entries()) {
        const prevValue = prev.get(key);
        if (!prevValue || prevValue.x !== value.x || prevValue.y !== value.y) {
          return positions;
        }
      }
      return prev; // No change, return previous to avoid re-render
    });
  }, [hover, sel, supportingPieces, boardSize]);

  const kingEscapeGuideLinePoints = useMemo(() => {
    if (!kingEscapeGuideActive) return null;
    if (!victoryConditions.includes("king_escaped")) return null;

    let kingPos: { x: number; y: number } | null = null;
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const piece = board[y]?.[x];
        if (piece && piece.type === "K" && piece.color === W) {
          kingPos = { x, y };
          break;
        }
      }
      if (kingPos) break;
    }

    if (!kingPos) return null;

    const targetY = boardSize - 1;
    if (kingPos.y === targetY) return null;

    const tileSize = 88;
    const labelOffset = 24;
    const halfTile = tileSize / 2;

    const kingVisualY = boardSize - 1 - kingPos.y;
    const targetVisualY = boardSize - 1 - targetY;

    const centerX = labelOffset + kingPos.x * tileSize + halfTile;
    const kingCenterY = kingVisualY * tileSize + halfTile;
    const targetCenterY = targetVisualY * tileSize + halfTile;

    return {
      x1: centerX,
      y1: kingCenterY,
      x2: centerX,
      y2: targetCenterY,
    };
  }, [kingEscapeGuideActive, victoryConditions, board, boardSize]);

  // Generate file labels (A-L for boards up to 12x12)
  const files = "ABCDEFGHIJKL";

  // Find speech bubble target - can be a piece or an obstacle (courtier)
  let speechBubbleTarget: { p: Piece; x: number; y: number } | null = null;
  let speechBubbleObstaclePos: { x: number; y: number } | null = null;
  
  if (speechBubble) {
    // Check if it's an obstacle target (format: "courtier-x-y")
    if (speechBubble.targetId.startsWith("courtier-")) {
      const match = speechBubble.targetId.match(/courtier-(\d+)-(\d+)/);
      if (match) {
        const x = parseInt(match[1], 10);
        const y = parseInt(match[2], 10);
        if (inBounds(x, y, boardSize) && obstacles[y]?.[x] === "courtier") {
          speechBubbleObstaclePos = { x, y };
          // Create a dummy piece for rendering purposes (speech bubble expects a piece)
          speechBubbleTarget = {
            p: { id: speechBubble.targetId, type: "P", color: "b" } as Piece,
            x,
            y
          };
        }
      }
    } else {
      // Regular piece target
      speechBubbleTarget = findPieceById(board, speechBubble.targetId, boardSize);
    }
  }

  const showRerollPopup = phase === "awaiting_reroll" && rerollState;
  const rerollTargetPos =
    showRerollPopup && rerollState // Add check for rerollState
      ? board[rerollState.from.y]?.[rerollState.from.x]?.color === W // Safe navigation
        ? rerollState.from
        : rerollState.to // Corrected: should be 'to' for defender
      : null;

  // Format victory condition names
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const formatVictoryCondition = (condition: string) => {
    switch (condition) {
      case "king_beheaded":
        return "Regicide";
      case "king_captured":
        return "King Captured (Checkmate)";
      case "king_dishonored":
        return "King Dishonored";
      case "king_escaped":
        return "King Crossing";
      default:
        return condition;
    }
  };

  // Get victory condition description
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getVictoryConditionDescription = (condition: string) => {
    // Check for level-specific description first
    if (currentLevelConfig?.victoryConditionDescriptions?.[condition as keyof typeof currentLevelConfig.victoryConditionDescriptions]) {
      return currentLevelConfig.victoryConditionDescriptions[condition as keyof typeof currentLevelConfig.victoryConditionDescriptions];
    }
    // Default descriptions
    switch (condition) {
      case "king_beheaded":
        return "Kill the enemy King in combat";
      case "king_captured":
        return "Checkmate the enemy King";
      case "king_dishonored":
        return "Let the enemy King attack you and fail";
      case "king_escaped":
        return "Bring your King to the golden squares";
      default:
        return "";
    }
  };

  // All possible victory conditions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const allVictoryConditions = ["king_captured", "king_beheaded", "king_dishonored", "king_escaped"];

  return (
    <div className="inline-block relative" ref={boardContainerRef}>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `24px repeat(${boardSize},88px)`,
          gridTemplateRows: `repeat(${boardSize},88px) 24px`,
        }}
      >
        {/* File Labels */}
        {Array.from({ length: boardSize }, (_, x) => (
          <div
            key={"b" + x}
            className="text-sm font-bold text-white/90 flex items-center justify-center"
            style={{ gridColumn: x + 2, gridRow: boardSize + 1 }}
          >
            {files[x]}
          </div>
        ))}
        {/* Rank Labels */}
        {Array.from({ length: boardSize }, (_, r) => (
          <div
            key={"l" + r}
            className="text-sm font-bold text-white/90 flex items-center justify-center"
            style={{ gridColumn: 1, gridRow: r + 1 }}
          >
            {boardSize - r}
          </div>
        ))}

        {/* The Board Grid */}
        <div
          style={{
            gridColumn: `2 / span ${boardSize}`,
            gridRow: `1 / span ${boardSize}`,
            display: "block",
          }}
        >
          <div
            className="grid"
            style={{ gridTemplateColumns: `repeat(${boardSize},88px)` }}
          >
            {Array.from({ length: boardSize * boardSize }, (_, i) => {
              const x = i % boardSize,
                y = boardSize - 1 - Math.floor(i / boardSize);
              const p = board[y]?.[x]; // Safe navigation
              const currentObstacle = obstacles[y]?.[x]; // Get obstacle at this position
              const hasObstacle = currentObstacle !== "none";
              const light = (x + y) % 2 === 0;
              const isSel = !!sel && sel.x === x && sel.y === y;
              const isMove = isL(x, y);
              const inFog = !V[y]?.[x]; // Safe navigation
              const show =
                !!p && (p.color === W || !inFog);
              const targetPiece = board[y]?.[x]; // Safe navigation for target piece
              const targetObstacle = obstacles[y]?.[x]; // Safe navigation for target obstacle
              const willCap =
                isMove && !!targetPiece;
              const isObstacleAttack = isMove && targetObstacle !== "none" && !targetPiece; // Attacking an obstacle
              const currentTerrain = T[y]?.[x]; // Safe navigation
              const forest = currentTerrain === "forest";
              const water = currentTerrain === "water"; // Check for water

              const attacker = sel ? board[sel.y]?.[sel.x] : null; // Safe navigation

              let obstaclePct: number | undefined;
              if (isObstacleAttack && sel && attacker) {
                const a = attacker as Piece;
                obstaclePct = obstacleWinPercent(board, T, obstacles, a, sel, { x, y }, boardSize);
              }

              const atk = fx && fx.from.x === x && fx.from.y === y;
              const def = fx && fx.to.x === x && fx.to.y === y;

              // Check king aura safely
              const kingAura =
                p &&
                p.type === "K" &&
                ((p.color === W && wChk) || (p.color === B && bChk));

              // Get obstacle glyph
              const getObstacleGlyph = (obstacleType: ObstacleType): string | null => {
                if (obstacleType === "rock") return GL.ROCK.n;
                if (obstacleType === "courtier") return GL.COURTIER.n;
                if (obstacleType === "column") return GL.COLUMN.n;
                if (obstacleType === "gate") return GL.GATE.n;
                if (obstacleType === "bell") return GL.BELL.n;
                return null;
              };

              const isCrystalBallSwap =
                isMove &&
                attacker?.equip === "crystal_ball" &&
                ((p && p.color === attacker.color) || targetObstacle === "courtier");
              
              // Check if this piece or Courtier is a valid Crystal Ball swap target
              const isCrystalBallSwapTarget =
                sel &&
                attacker?.equip === "crystal_ball" &&
                isMove &&
                ((p && p.color === attacker.color) || targetObstacle === "courtier");

              const showPct =
                !!sel &&
                !!attacker && // <- guard
                isMove &&
                !!targetPiece && // Check if there's a target piece
                !isCrystalBallSwap;

              let pct: number | undefined;
              if (showPct && attacker && targetPiece) {
                // Ensure attacker and targetPiece exist
                const a = attacker as Piece;
                let d = targetPiece as Piece;
                
                // FOG OF WAR FIX: If the defender is in fog, strip their equipment
                // so win percentage doesn't reveal hidden information
                const inFog = !V[y]?.[x];
                if (inFog && d.equip) {
                  // Create a copy of the defender without equipment for win% calculation
                  d = { ...d, equip: undefined };
                }
                
                pct = winPercent(board, T, obstacles, a, d, sel!, { x, y }, boardSize);
              }

              let sup = 0;
              if (isMove && attacker) {
                if (targetPiece && targetPiece.color !== attacker.color) {
                  // Check targetPiece exists before checking color
                  sup = supportCount(
                    board,
                    T,
                    obstacles,
                    attacker,
                    sel!,
                    { x, y },
                    boardSize
                  );
                }
              }

              const isAttack = willCap || isObstacleAttack;
              const currentPct = isObstacleAttack ? obstaclePct : pct;
              const ringClass =
                sup > 0
                  ? "sup"
                  : currentPct != null && currentPct < 50
                  ? "warn"
                  : "cap";

              const hoveredAttackTarget =
                hover &&
                sel &&
                isL(hover.x, hover.y) &&
                (board[hover.y]?.[hover.x] || obstacles[hover.y]?.[hover.x] !== "none"); // Check piece or obstacle
              const isSupporting =
                p &&
                sel &&
                board[sel.y]?.[sel.x] && // Safe navigation
                p.id !== board[sel.y][sel.x]?.id &&
                p.color === board[sel.y][sel.x]?.color &&
                hoveredAttackTarget &&
                hover && // Ensure hover exists before accessing hover.x/y
                attacks(board, T, obstacles, x, y, hover.x, hover.y, boardSize);

              const showSpeechBubble =
                speechBubble &&
                ((speechBubbleTarget &&
                  speechBubbleTarget.x === x &&
                  speechBubbleTarget.y === y) ||
                 (speechBubbleObstaclePos &&
                  speechBubbleObstaclePos.x === x &&
                  speechBubbleObstaclePos.y === y &&
                  obstacles[y]?.[x] === "courtier"));
              const isMarketPlacement =
                marketAction?.type === "piece" && y <= 1 && !p && obstacles[y]?.[x] === "none";
              const isMarketEquipTarget =
                marketAction?.type === "item" &&
                p?.color === W &&
                !p?.equip;
              
              // Check if this is a valid move or swap target during market phase
              const isMarketMoveTarget = 
                phase === "market" &&
                !marketAction &&
                sel &&
                sel.y <= 1 &&
                y <= 1 &&
                !p &&
                obstacles[y]?.[x] === "none";
              
              const isMarketSwapTarget =
                phase === "market" &&
                !marketAction &&
                sel &&
                sel.y <= 1 &&
                y <= 1 &&
                p?.color === W &&
                !(sel.x === x && sel.y === y);

              const isRerollTarget =
                rerollTargetPos &&
                rerollTargetPos.x === x &&
                rerollTargetPos.y === y;

              const isHovered = hover && hover.x === x && hover.y === y;
              const isPlayerDisguisedPiece =
                p?.equip === "disguise" && p.color === W && p.originalType;
              const showAsOriginalOnHover = isHovered && isPlayerDisguisedPiece;

              const isDestroyed = p && destroyedPieceIds.includes(p.id);
              const hasFailedAttack = p && p.id === failedAttackId;
              
              // Check if this is the escape row (top row) and king_escaped is enabled
              const isEscapeRow = victoryConditions.includes("king_escaped") && y === boardSize - 1;
              const isBannerProtected =
                p &&
                p.equip !== "shield" &&
                isProtectedByBanner(board, p.color, { x, y });

              const isLastMoveFrom =
                lastMove && lastMove.from.x === x && lastMove.from.y === y;
              const isLastMoveTo =
                lastMove && lastMove.to.x === x && lastMove.to.y === y;

              const isAnimating = moveAnim && moveAnim.id === p?.id;
              const isDragging = drag && drag.id === p?.id;
              const isOriginHidden = isAnimating || isDragging;

              const isTargetHidden =
                moveAnim && moveAnim.to.x === x && moveAnim.to.y === y;

              const getPieceSymbol = (piece: Piece | null) => {
                // Allow null
                if (!piece) return null;
                let typeToShow = piece.type;
                if (showAsOriginalOnHover && piece.originalType) {
                  typeToShow = piece.originalType;
                }

                const colorKey = piece.color as "w" | "b";
                // Check if GL has the type and color before accessing
                // Also ensure typeToShow is a valid key for GL
                const pieceGlyphSet = GL[typeToShow as keyof typeof GL];
                if (pieceGlyphSet && colorKey in pieceGlyphSet) {
                  return pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet];
                }
                return "?"; // Fallback symbol
              };

              // Determine terrain glyph and tooltip text
              let terrainGlyph = null;
              let terrainTooltip = "";
              if (p && currentTerrain === "water") {
                terrainGlyph = "💦";
                terrainTooltip = "💧 -1 to defense rolls";
              } else if (p && currentTerrain === "forest") {
                terrainGlyph = "🌲";
                terrainTooltip = "🌲 +1 to defense rolls";
              }

              return (
                <button
                  key={x + "-" + y}
                  onMouseDown={(e) => startDrag(e, x, y)}
                  onMouseEnter={() => {
                    setHover({ x, y });
                    if (
                      phase === "market" &&
                      currentLevelConfig?.marketEnabled !== false &&
                      board[y]?.[x]?.color === W &&
                      board[y]?.[x]?.type !== "K"
                    ) {
                      setSellButtonPos({ x, y });
                    }
                  }}
                  onMouseLeave={(e) => {
                    const rt = (e as React.MouseEvent)
                      .relatedTarget as HTMLElement | null;
                    // Only clear hover; keep sellButtonPos unless we truly left board/overlay
                    setHover(null);
                    hideTooltip();
                    if (
                      !rt ||
                      !(rt instanceof HTMLElement) ||
                      !rt.closest(".sell-button-overlay")
                    ) {
                      // pointer not going into the overlay → clear it
                      setSellButtonPos(null);
                    }
                  }}
                  onClick={() => click(x, y)}
                  className={`tile ${light ? "tL" : "tD"} ${isEscapeRow ? "escape-row" : ""}`}
                >
                  {(isLastMoveFrom || isLastMoveTo) &&
                    V[y]?.[x] && ( // Safe navigation
                      <div className="last-move" />
                    )}
                  {/* --- Visual Layers (Rendered Bottom-to-Top) --- */}
                  {isMarketPlacement && (
                    <div className="market-placement-overlay" />
                  )}
                  
                  {/* Market move/swap indicator */}
                  {isMarketMoveTarget && (
                    <span className="ind">
                      <span className="dot" style={{ background: "#34d399" }} />
                    </span>
                  )}
                  
                  {/* Market swap indicator for allied pieces */}
                  {isMarketSwapTarget && (
                    <span className="ind">
                      <span className="ring" style={{ 
                        boxShadow: "0 0 32px 8px rgba(34, 197, 94, 0.7), 0 0 0 4px rgba(34, 197, 94, 0.35) inset",
                        background: "radial-gradient(circle, rgba(34, 197, 94, 0.22) 0 55%, transparent 60%)"
                      }}></span>
                    </span>
                  )}

                  {/* 1. Terrain Layer */}
                  {forest && !isEscapeRow && (
                    <span
                      className="forest"
                      style={{ position: "absolute", inset: 0, zIndex: 1 }}
                    />
                  )}
                  {/* Render water tile */}
                  {water && !isEscapeRow && <span className="water" />}

                  {/* 1.5. Obstacle Layer */}
                  {hasObstacle && !inFog && (
                    <span
                      className="obstacle-container"
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none"
                      }}
                    >
                      <span 
                        className={`obstacle-chip ${currentObstacle}`} 
                        id={`courtier-${x}-${y}`}
                        style={
                          isCrystalBallSwapTarget && targetObstacle === "courtier"
                            ? {
                                boxShadow: "0 0 32px 8px rgba(192, 132, 252, 0.7), 0 0 0 4px rgba(192, 132, 252, 0.35) inset",
                                background: "radial-gradient(circle, rgba(192, 132, 252, 0.22) 0 55%, transparent 60%)"
                              }
                            : undefined
                        }
                      >
                        {getObstacleGlyph(currentObstacle)}
                      </span>
                    </span>
                  )}

                  {/* 2. Move Indicator Layer */}
                  {isMove && !isAttack && (
                    <span className="ind">
                      <span className="dot" />
                    </span>
                  )}
                  {isAttack && (
                    <span className="ind">
                      <span className={`ring ${ringClass}`}></span>
                    </span>
                  )}

                  {/* 3. Odds Preview Layer */}
                  <div className="odds-container">
                    {isAttack && sup > 0 && (
                      <span className="supB-odds">+{sup}</span>
                    )}
                    {(showPct || isObstacleAttack) && ( // Combined condition for odds display
                      <span
                        className={`pct ${
                          isObstacleAttack
                            ? "pct-rock" // Specific style for obstacle attack
                            : currentPct != null && currentPct < 50
                            ? "text-orange-400" // Warning for low odds
                            : sup > 0
                            ? "pctS" // Support style
                            : "pctG" // Good odds style
                        }`}
                      >
                        {currentPct}% {/* Display either obstacle or piece odds */}
                      </span>
                    )}
                  </div>

                  {/* 4. Piece Layer */}
                  {show &&
                    !isOriginHidden &&
                    !isTargetHidden &&
                    p && ( // Ensure p exists
                      <span
                        className={`piece-container ${
                          atk && !hasFailedAttack ? "pbmp" : ""
                        } ${def || hasFailedAttack ? "hit" : ""} ${
                          isSupporting ? "supporting-piece" : ""
                        } ${isMarketEquipTarget ? "market-equip-target" : ""} ${
                          isDestroyed ? "destroyed" : ""
                        } ${
                          phase === "market" &&
                          p.color === W &&
                          (isHovered ||
                            (sellButtonPos &&
                              sellButtonPos.x === x &&
                              sellButtonPos.y === y))
                            ? "hover-scale"
                            : ""
                        } ${isSel ? "selected-piece" : ""}`}
                      >
                      <span
                        data-chip-x={x}
                        data-chip-y={y}
                        data-piece-container="true"
                        className={`chip ${
                          p.color === W ? "pw" : p.color === "b" ? "pb" : "pn"
                        } ${
                          p.stunnedForTurns && p.stunnedForTurns > 0
                            ? "stunned-piece"
                            : ""
                        } ${p.shadowForTurns && p.shadowForTurns > 0 ? "shadow-piece" : ""}`}
                        style={
                          isCrystalBallSwapTarget && p && p.color === attacker?.color
                            ? {
                                boxShadow: "0 8px 18px rgba(0, 0, 0, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.25), 0 0 32px 8px rgba(192, 132, 252, 0.7), 0 0 0 4px rgba(192, 132, 252, 0.35) inset"
                              }
                            : undefined
                        }
                      >
                        {getPieceSymbol(p)}
                      </span>
                        {p.name && (
                          <span
                            className={`piece-name${
                              p.isPreconfigured ? " preconfigured" : ""
                            }`}
                            onMouseEnter={(e) => {
                              if (
                                e.currentTarget.scrollWidth >
                                e.currentTarget.clientWidth
                              ) {
                                showTooltip(p.name!);
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            {p.name}
                          </span>
                        )}
                        {!showAsOriginalOnHover &&
                          p.equip &&
                          (p.equip !== "disguise" || p.color === W) && (
                            <span
                              className="equip-icon"
                              onMouseEnter={(e) => {
                                if (showBoardTooltips && p && p.equip) {
                                  showTooltip(ITEM_DESCRIPTIONS[p.equip]);
                                  e.stopPropagation();
                                }
                              }}
                              onMouseLeave={hideTooltip}
                            >
                              {equipIcon(p.equip)}
                            </span>
                          )}
                        {isBannerProtected && (
                          <span
                            className="banner-shield-icon"
                            onMouseEnter={(e) => {
                              if (showBoardTooltips) {
                                showTooltip(
                                  "🛡️ Shield: +1 to defense rolls (from Banner)."
                                );
                                e.stopPropagation();
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            🛡️
                          </span>
                        )}
                        {/* Veteran Badge */}
                        {p && (p.kills || 0) >= 5 && (
                          <span
                            className="veteran-badge"
                            onMouseEnter={(e) => {
                              if (showBoardTooltips) {
                                showTooltip(
                                  "🎖️ Veteran: This unit has killed 5+ enemy units and always rolls with advantage in combat."
                                );
                                e.stopPropagation();
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            🎖️
                          </span>
                        )}
                        {/* Terrain Glyph and Tooltip */}
                        {terrainGlyph && (
                          <span
                            className="terrain-glyph"
                            onMouseEnter={(e) => {
                              if (showBoardTooltips) {
                                showTooltip(terrainTooltip);
                                e.stopPropagation();
                              }
                            }}
                            onMouseLeave={hideTooltip}
                          >
                            {terrainGlyph}
                          </span>
                        )}
                        {kingAura && <span className="check" />}
                      </span>
                    )}
                  {showSpeechBubble &&
                    speechBubble && ( // Ensure target and speechBubble exist
                      <div
                        key={speechBubble.id}
                        className={`speech-bubble ${
                          speechBubbleObstaclePos
                            ? "black-king-bubble" // Courtiers use black bubble style
                            : speechBubbleTarget && speechBubbleTarget.p.color === "w"
                            ? "white-king-bubble"
                            : "black-king-bubble"
                        }`}
                      >
                        <AnimatedSpeechBubble text={speechBubble.text} />
                      </div>
                    )}

                  {/* 5. Stun Layer (under fog) */}
                  {p && p.stunnedForTurns !== undefined && p.stunnedForTurns > 0 && (
                    <>
                      {p.isExhausted ? (
                        <span
                          className="exhausted-glyph"
                          onMouseEnter={(e) => {
                            if (showBoardTooltips) {
                              showTooltip(
                                "😴 Exhausted: This piece repeated the same move 3 times and is stunned for 1 turn."
                              );
                              e.stopPropagation();
                            }
                          }}
                          onMouseLeave={hideTooltip}
                        >
                          😴
                        </span>
                      ) : (
                        <span className="stun-glyph">🌀</span>
                      )}
                    </>
                  )}

                  {/* 5.5. Bell of Names Protection Indicator */}
                  {p && p.type === "K" && p.color === B && p.name === "Morcant" && bellOfNamesExists(obstacles, boardSize) && !inFog && (
                    <span
                      className="bell-glyph"
                      onMouseEnter={(e) => {
                        if (showBoardTooltips) {
                          showTooltip(
                            "🔔 Protected by the Bell of Names: Morcant cannot die until the Bell of Names is destroyed."
                          );
                          e.stopPropagation();
                        }
                      }}
                      onMouseLeave={hideTooltip}
                    >
                      🔔
                    </span>
                  )}

                  {/* 6. Fog Layer */}
                  {inFog && <div className="fog" />}

                  {/* Dice badges (Highest Layer) */}
                  {fx && atk && !isRerollTarget && (
                    <span
                      className={`badge ${
                        fx.kind === "piece"
                          ? fx.win
                            ? "ok"
                            : "bad"
                          : fx.ok
                          ? "ok"
                          : "bad"
                      }`}
                    >
                      {phase === "base" || phase === "mods" ? (
                        <span className="expr">
                          <span className="term">
                            {fx.a.rolls.map((roll: number, i: number) => (
                              <div key={i}>
                                <DiceD6
                                  rolling={
                                    phase === "base" &&
                                    rerollTarget !== "defender" &&
                                    !fx.a?.forced
                                  }
                                  result={roll}
                                  size={24}
                                  seed={(fx.id ?? 0) + i}
                                />
                              </div>
                            ))}
                            {phase !== "base" && <strong>{fx.a.base}</strong>}
                          </span>
                          {sumsA.support > 0 && (
                            <>
                              <span className="plus">+</span>
                              <span className="term">
                                <strong>{sumsA.support}</strong> 👥
                              </span>
                            </>
                          )}
                          {sumsA.sword > 0 && (
                            <>
                              <span className="plus">+</span>
                              <span className="term">
                                <strong>{sumsA.sword}</strong> 🗡️
                              </span>
                            </>
                          )}
                        </span>
                      ) : (
                        <span className={`${bumpA ? "pbmp" : ""}`}>
                          <strong>{dispA ?? fx.a.total}</strong>
                        </span>
                      )}
                    </span>
                  )}
                  {fx && def && !isRerollTarget && fx.kind === "piece" && (
                    <span className={`badge ${fx.win ? "bad" : "ok"}`}>
                      {phase === "base" || phase === "mods" ? (
                        <span className="expr">
                          <span className="term">
                            {fx.d.rolls && fx.d.rolls.length > 1 ? (
                              // Display all rolls if defender has advantage
                              <span className="flex items-center gap-0.5">
                                {fx.d.rolls.map((roll: number, idx: number) => (
                                  <DiceD6
                                    key={idx}
                                    rolling={
                                      phase === "base" &&
                                      rerollTarget !== "attacker" &&
                                      !fx.d?.forced
                                    }
                                    result={roll}
                                    size={24}
                                    seed={(fx?.id ?? 0) + 5 + idx}
                                  />
                                ))}
                              </span>
                            ) : (
                              <DiceD6
                                rolling={
                                  phase === "base" &&
                                  rerollTarget !== "attacker" &&
                                  !(fx.kind === "piece" && fx.d?.forced)
                                }
                                result={fx?.d?.base ?? null}
                                size={24}
                                seed={(fx?.id ?? 0) + 5}
                              />
                            )}
                            {phase !== "base" && <strong>{fx.d.base}</strong>}
                          </span>
                          {sumsD.shield > 0 && (
                            <>
                              <span className="plus">+</span>
                              <span className="term">
                                <strong>{sumsD.shield}</strong> 🛡️
                              </span>
                            </>
                          )}
                          {/* Display terrain modifier text only if it's not zero */}
                          {/* Add safe navigation for fx.to */}
                          {/* Add key prop */}
                          {sumsD.terrain !== 0 &&
                            fx.to &&
                            T[fx.to.y]?.[fx.to.x] && (
                              <React.Fragment key="terrain-mod">
                                <span className="plus">
                                  {sumsD.terrain > 0 ? "+" : "-"}
                                </span>
                                <span className="term">
                                  <strong>{Math.abs(sumsD.terrain)}</strong>
                                  {/* Safe navigation added */}
                                  {T[fx.to.y]?.[fx.to.x] === "forest"
                                    ? "🌲"
                                    : T[fx.to.y]?.[fx.to.x] === "water"
                                    ? "💧"
                                    : "?"}{" "}
                                  {/* Show icon based on terrain */}
                                </span>
                              </React.Fragment>
                            )}
                        </span>
                      ) : (
                        <span className={`${bumpD ? "pbmp" : ""}`}>
                          <strong>{dispD ?? fx.d.total}</strong>
                        </span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {kingEscapeGuideLinePoints && boardContainerRef.current && (
        <svg
          width={boardContainerRef.current.offsetWidth}
          height={boardContainerRef.current.offsetHeight}
          style={{
            position: "absolute",
            top: "0px",
            left: "0px",
            pointerEvents: "none",
            zIndex: 2,
            overflow: "visible",
          }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <line
            x1={kingEscapeGuideLinePoints.x1}
            y1={kingEscapeGuideLinePoints.y1}
            x2={kingEscapeGuideLinePoints.x2}
            y2={kingEscapeGuideLinePoints.y2}
            stroke="#facc15"
            strokeWidth="21"
            strokeOpacity={kingEscapeGuideOpacity}
            strokeLinecap="round"
            strokeLinejoin="round"
            shapeRendering="geometricPrecision"
            style={{ transition: "stroke-opacity 0.8s ease-in-out" }}
          />
        </svg>
      )}

      {/* Supporting Attack Lines - Blue lines connecting supporting pieces to target */}
      {hover &&
        sel &&
        supportingPieces.length > 0 &&
        isL(hover.x, hover.y) &&
        (board[hover.y]?.[hover.x] || obstacles[hover.y]?.[hover.x] !== "none") &&
        chipPositions.size > 0 &&
        boardContainerRef.current && (
          <svg
            width={boardContainerRef.current.offsetWidth}
            height={boardContainerRef.current.offsetHeight}
            style={{
              position: "absolute",
              top: "0px",
              left: "0px",
              pointerEvents: "none",
              zIndex: 2, // Below chips (z-index 3+) but above tiles
              overflow: "visible",
            }}
            xmlns="http://www.w3.org/2000/svg"
          >
            {supportingPieces.map((support, idx) => {
              const supportPos = chipPositions.get(`support-${support.x}-${support.y}`);
              const targetPos = chipPositions.get(`target-${hover.x}-${hover.y}`);
              
              if (!supportPos || !targetPos) return null;
              
              // SVG strokes are centered on the path by default
              // The stroke width extends equally on both sides of the path (10.5px each side for 21px stroke)
              return (
                <line
                  key={`support-line-${support.x}-${support.y}-${idx}`}
                  x1={supportPos.x}
                  y1={supportPos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke="#3b82f6"
                  strokeWidth="21"
                  strokeOpacity="0.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  shapeRendering="geometricPrecision"
                />
              );
            })}
          </svg>
        )}

      {/* Sell Button Overlay - Only show during market phase when not deploying an item/piece and market is enabled */}
      {phase === "market" &&
        currentLevelConfig?.marketEnabled !== false &&
        !marketAction &&
        sellButtonPos &&
        board[sellButtonPos.y]?.[sellButtonPos.x]?.color === W &&
        board[sellButtonPos.y]?.[sellButtonPos.x]?.type !== "K" &&
        board[sellButtonPos.y]?.[sellButtonPos.x]?.equip !== "curse" && (
          <div
            className="sell-button-overlay"
            style={{
              position: "absolute",
              top: `${12 + (boardSize - 1 - sellButtonPos.y) * 88 - 22}px`, // Position above the piece square
              left: `${12 + 24 + sellButtonPos.x * 88 + 88 / 2 - 32}px`, // Center horizontally (button width ~40px)
              zIndex: 1000,
            }}
            onMouseLeave={(e) => {
              const rt = (e as React.MouseEvent)
                .relatedTarget as HTMLElement | null;
              if (!rt || !(rt instanceof HTMLElement) || !rt.closest(".tile")) {
                // If we didn't go back to a tile, dismiss
                setSellButtonPos(null);
              }
            }}
          >
            <button
              className="sell-button"
              onClick={(e) => {
                e.stopPropagation();
                sellPiece(sellButtonPos.x, sellButtonPos.y);
              }}
            >
              SELL
            </button>
          </div>
        )}
    </div>
  );
}

function NameInputComponent({
  position,
  onConfirm,
  onCancel,
}: {
  position: { top: number; left: number };
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onCancel]);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    onConfirm(name.trim() || "Unit"); // Default name if empty
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 bg-black/50 z-[240]"
        onClick={onCancel}
      ></div>
      <div
        className="fixed z-[250]"
        style={{
          top: position.top,
          left: position.left,
          transform: "translate(-50%, 8px)",
        }}
      >
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 p-2 bg-stone-900 rounded-lg shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Unit Name..."
            maxLength={12}
            className="bg-stone-950 text-white rounded px-2 py-1 text-sm w-32"
          />
          <button
            type="submit"
            className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            OK
          </button>
        </form>
      </div>
    </>,
    document.body
  );
}

// --- Settings Dropdown Component ---
function SettingsDropdown({
  showRules,
  setShowRules,
  muted,
  setMuted,
  musicMuted,
  setMusicMuted,
  fastMode,
  setFastMode,
  showBoardTooltips,
  setShowBoardTooltips,
  enableTutorialPopups,
  setEnableTutorialPopups,
  setCampaign,
  handleTryAgain,
  win,
}: {
  showRules: boolean;
  setShowRules: (value: boolean | ((prev: boolean) => boolean)) => void;
  muted: boolean;
  setMuted: (value: boolean | ((prev: boolean) => boolean)) => void;
  musicMuted: boolean;
  setMusicMuted: (value: boolean | ((prev: boolean) => boolean)) => void;
  fastMode: boolean;
  setFastMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  showBoardTooltips: boolean;
  setShowBoardTooltips: (value: boolean | ((prev: boolean) => boolean)) => void;
  enableTutorialPopups: boolean;
  setEnableTutorialPopups: (value: boolean | ((prev: boolean) => boolean)) => void;
  setCampaign: React.Dispatch<React.SetStateAction<CampaignState>>;
  handleTryAgain: () => void;
  win: Color | null;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 rounded-xl bg-consistent-dark-brown hover:bg-amber-950 text-white font-bold text-lg shadow-lg flex items-center justify-center gap-2"
        title="Settings"
      >
        <span className="text-2xl">⚙️</span>
        <span>Settings</span>
      </button>
      
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute top-full left-0 right-0 mt-2 bg-stone-900 rounded-xl shadow-2xl border-2 border-amber-900 overflow-hidden z-50">
            <div className="flex flex-col">
              <button
                onClick={() => {
                  setShowRules((s) => !s);
                  setIsOpen(false);
                }}
                className="px-4 py-3 text-left hover:bg-amber-950 border-b border-amber-900"
              >
                <span className="text-lg mr-2">📖</span>
                Game Rules
              </button>
              
              <button
                onClick={() => {
                  setMuted((m) => !m);
                }}
                className="px-4 py-3 text-left hover:bg-amber-950 border-b border-amber-900 flex items-center justify-between"
              >
                <span>
                  <span className="text-lg mr-2">{muted ? "🔇" : "🔊"}</span>
                  Sound Effects
                </span>
                <span className={`px-2 py-1 rounded text-xs ${muted ? "bg-amber-900" : "bg-emerald-600"}`}>
                  {muted ? "OFF" : "ON"}
                </span>
              </button>
              
              <button
                onClick={() => {
                  setMusicMuted((m) => !m);
                }}
                className="px-4 py-3 text-left hover:bg-amber-950 border-b border-amber-900 flex items-center justify-between"
              >
                <span>
                  <span className="text-lg mr-2">{musicMuted ? "🔇" : "🎵"}</span>
                  Music
                </span>
                <span className={`px-2 py-1 rounded text-xs ${musicMuted ? "bg-amber-900" : "bg-emerald-600"}`}>
                  {musicMuted ? "OFF" : "ON"}
                </span>
              </button>
              
              <button
                onClick={() => {
                  setFastMode((f) => !f);
                }}
                className="px-4 py-3 text-left hover:bg-amber-950 border-b border-amber-900 flex items-center justify-between"
              >
                <span>
                  <span className="text-lg mr-2">⚡</span>
                  Speed
                </span>
                <span className={`px-2 py-1 rounded text-xs ${fastMode ? "bg-emerald-600" : "bg-amber-900"}`}>
                  {fastMode ? "FAST" : "NORMAL"}
                </span>
              </button>
              
              <button
                onClick={() => {
                  setShowBoardTooltips((s) => !s);
                }}
                className="px-4 py-3 text-left hover:bg-amber-950 border-b border-amber-900 flex items-center justify-between"
              >
                <span>
                  <span className="text-lg mr-2">ℹ️</span>
                  Tooltips
                </span>
                <span className={`px-2 py-1 rounded text-xs ${showBoardTooltips ? "bg-blue-600" : "bg-amber-900"}`}>
                  {showBoardTooltips ? "ON" : "OFF"}
                </span>
              </button>
              
              <button
                onClick={() => {
                  const newValue = !enableTutorialPopups;
                  setEnableTutorialPopups(newValue);
                  // Save to localStorage
                  localStorage.setItem("dicechess_tutorial_popups_enabled", String(newValue));
                  // If enabling, clear tutorialsSeen so they trigger again
                  if (newValue) {
                    // Clear tutorial-related localStorage flags
                    localStorage.removeItem("dicechess_first_combat_tutorial_used");
                    setCampaign(prev => ({
                      ...prev,
                      tutorialsSeen: [],
                    }));
                  }
                }}
                className="px-4 py-3 text-left hover:bg-amber-950 border-b border-amber-900 flex items-center justify-between"
              >
                <span>
                  <span className="text-lg mr-2">📚</span>
                  Tutorial Popups
                </span>
                <span className={`px-2 py-1 rounded text-xs ${enableTutorialPopups ? "bg-emerald-600" : "bg-amber-900"}`}>
                  {enableTutorialPopups ? "ON" : "OFF"}
                </span>
              </button>
              
              {!win && (
                <button
                  onClick={() => {
                    handleTryAgain();
                    setIsOpen(false);
                  }}
                  className="px-4 py-3 text-left bg-red-600 hover:bg-red-700"
                >
                  <span className="text-lg mr-2">🔄</span>
                  Restart Game
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Main App Component ---
export default function App() {
  const [showIntro, setShowIntro] = useState(true);
  const [isRetryingLevel, setIsRetryingLevel] = useState(false);
  
  const [seed, setSeed] = useState(() => new Date().toISOString());
  const [muted, setMuted] = useState(false);
  const [musicMuted, setMusicMuted] = useState(false);
  const [fastMode, setFastMode] = useState(false);
  const musicManagerRef = useRef<MusicManagerHandle>(null);
  const [showBoardTooltips, setShowBoardTooltips] = useState(true);
  const [enableTutorialPopups, setEnableTutorialPopups] = useState(() => {
    const saved = localStorage.getItem("dicechess_tutorial_popups_enabled");
    return saved !== null ? saved === "true" : true; // Default to enabled
  });
  const [needsReinit, setNeedsReinit] = useState(false); // Track when board needs re-initialization
  
  // ========== DEV TOOLS - COMMENT OUT BEFORE RELEASE ==========
  const [showDevPanel, setShowDevPanel] = useState(false); // Hidden by default
  
  // Keyboard shortcut: Press Ctrl+D (Windows/Linux) or Cmd+D (Mac) to toggle dev panel
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check for Ctrl+D (Windows/Linux) or Cmd+D (Mac)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        // Only toggle if not typing in an input field
        if (!(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
          e.preventDefault(); // Prevent browser default (bookmark dialog)
          setShowDevPanel((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);
  // ============================================================
  
  // Clear saved game data on initial app load (when intro popup is shown)
  useEffect(() => {
    if (showIntro) {
      localStorage.removeItem("dicechess_campaign_v1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount

  // Preload all story card images when app first loads
  useEffect(() => {
    preloadAllStoryCardImages().catch((err) => {
      console.warn("Failed to preload some story card images:", err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only once on mount
  const [lastMove, setLastMove] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);
  const [moveAnim, setMoveAnim] = useState<null | {
    id: string;
    from: { x: number; y: number };
    to: { x: number; y: number };
    glyph: string;
    color: "w" | "b";
    equip?: Equip;
  }>(null);
  const [drag, setDrag] = useState<null | {
    id: string;
    from: { x: number; y: number };
    glyph: string;
    color: "w" | "b";
    equip?: Equip;
    clientX: number;
    clientY: number;
    offsetX: number;
    offsetY: number;
  }>(null);

  const rngRef = useRef<() => number>(() => Math.random());
  const combatIdRef = useRef(0);
  // Track recently said sentences per piece to avoid repetition
  const recentSpeechRef = useRef<Map<string, string[]>>(new Map());
  const [Bstate, setB] = useState<Board>(
    () => Array.from({ length: 5 }, () => Array(5).fill(null)) as Board // Start with 5x5 for level 1
  );
  const [Tstate, setT] = useState<Terrain>(() => emptyTerrain(5)); // Start with 5x5 for level 1
  const [obstacles, setObstacles] = useState<Obstacle>(() => emptyObstacles(5)); // Obstacles grid
  const [turn, setTurn] = useState<Color>(W);
  const [sel, setSel] = useState<{ x: number; y: number } | null>(null);
  const [legal, setLegal] = useState<{ x: number; y: number }[]>([]);
  const [win, setWin] = useState<Color | null>(null);
  const [phrase, setPhrase] = useState<string | null>(null);
  const [fx, setFx] = useState<any>(null); // {kind:'piece'|'obstacle',from,to,a,d?,win?,ok?,obstacleType?:ObstacleType}
  const [phase, setPhase] = useState<Phase>("market");
  const [dispA, setDispA] = useState<number | null>(null);
  const [dispD, setDispD] = useState<number | null>(null);
  const [bumpA, setBumpA] = useState(false);
  const [bumpD, setBumpD] = useState(false);
  const [speechBubble, setSpeechBubble] = useState<{
    text: string;
    id: number;
    targetId: string;
  } | null>(null);
  const [marketPoints, setMarketPoints] = useState(100);
  const [showMarketConfirm, setShowMarketConfirm] = useState(false);
  const startBattleBtnRef = useRef<HTMLButtonElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  // Story Card state
  const [currentStoryCard, setCurrentStoryCard] =
    useState<StoryCardType | null>(null);
  const currentStoryCardRef = useRef<StoryCardType | null>(null);
  const [storyCardQueue, setStoryCardQueue] = useState<StoryCardType[]>([]);
  const [storyOutcome, setStoryOutcome] = useState<{
    outcomes: OutcomeData[];
    nextCard?: StoryCardType;
    lastCard?: StoryCardType;
  } | null>(null);
  const [showTransition, setShowTransition] = useState(false);
  const [showDifficultyTransition, setShowDifficultyTransition] = useState(false);
  const [difficultyTransitionLine, setDifficultyTransitionLine] = useState<0 | 1 | 'fade1' | 'fade2'>(0);
  const [difficultyTransitionText, setDifficultyTransitionText] = useState("");
  const difficultyTransitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const difficultyTransitionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const difficultyTransitionAudioCtxRef = useRef<AudioContext | null>(null);

  const ensureDifficultyAudioContext = () => {
    if (!difficultyTransitionAudioCtxRef.current) {
      const Ctx: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (Ctx) {
        difficultyTransitionAudioCtxRef.current = new Ctx();
      }
    }
    return difficultyTransitionAudioCtxRef.current;
  };

  const playDifficultyTextBlip = () => {
    try {
      const ctx = ensureDifficultyAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = "square";
      osc.frequency.value = 380; // medieval-ish
      filter.type = "lowpass";
      filter.frequency.value = 1200;
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch (e) {}
  };

  const playBattleTrumpet = () => {
    try {
      const Ctx: any =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      const makeHorn = (freq: number) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "square";
        o.frequency.setValueAtTime(freq, now);
        g.gain.setValueAtTime(0.6, now);
        o.connect(g);
        g.connect(gain);
        o.start(now);
        o.stop(now + 1.2);
      };
      makeHorn(330);
      makeHorn(392);
      makeHorn(523.25);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1200;
      gain.connect(lp);
      lp.connect(ctx.destination);
    } catch (e) {}
  };

  const [prayerDice, setPrayerDice] = useState(2); // Will be updated from campaign state
  const [rerollState, setRerollState] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
    kind: "piece" | "obstacle";
    loserPos: { x: number; y: number };
    obstacleType?: ObstacleType;
  } | null>(null);
  const [rerollPopupPosition, setRerollPopupPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [rerollTarget, setRerollTarget] = useState<
    "attacker" | "defender" | null
  >(null);

  const [disguisePopupState, setDisguisePopupState] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [disguisePopupPosition, setDisguisePopupPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [namingState, setNamingState] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);
  const [nameInputPosition, setNameInputPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [destroyedPieceIds, setDestroyedPieceIds] = useState<string[]>([]);
  const [failedAttackId, setFailedAttackId] = useState<string | null>(null);
  const [moveHistory, setMoveHistory] = useState<MoveRecord[]>([]);
  const [showRules, setShowRules] = useState(false);
  const [showRulesItemInfo, setShowRulesItemInfo] = useState(false);

  // Track recent moves per piece for exhaustion detection
  const [pieceMovesHistory, setPieceMovesHistory] = useState<
    Map<
      string,
      Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>
    >
  >(new Map());

  // Helper function to detect exhaustion (repetitive moves)
  function checkExhaustion(
    pieceId: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
    board: Board
  ): boolean {
    // Get or create move history for this piece
    const history = pieceMovesHistory.get(pieceId) || [];

    // Add current move
    const newHistory = [...history, { from, to }];

    // Keep only last 6 moves (enough to detect 3 repetitions)
    const recentMoves = newHistory.slice(-6);

    // Check if the last 6 moves form a repetitive pattern (A->B, B->A, A->B)
    if (recentMoves.length >= 6) {
      // Check for pattern: from1->to1, to1->from1, from1->to1, to1->from1, from1->to1, to1->from1
      const isRepetitive =
        recentMoves[0].from.x === recentMoves[2].from.x &&
        recentMoves[0].from.y === recentMoves[2].from.y &&
        recentMoves[0].to.x === recentMoves[2].to.x &&
        recentMoves[0].to.y === recentMoves[2].to.y &&
        recentMoves[1].from.x === recentMoves[3].from.x &&
        recentMoves[1].from.y === recentMoves[3].from.y &&
        recentMoves[1].to.x === recentMoves[3].to.x &&
        recentMoves[1].to.y === recentMoves[3].to.y &&
        recentMoves[2].from.x === recentMoves[4].from.x &&
        recentMoves[2].from.y === recentMoves[4].from.y &&
        recentMoves[2].to.x === recentMoves[4].to.x &&
        recentMoves[2].to.y === recentMoves[4].to.y &&
        recentMoves[3].from.x === recentMoves[5].from.x &&
        recentMoves[3].from.y === recentMoves[5].from.y &&
        recentMoves[3].to.x === recentMoves[5].to.x &&
        recentMoves[3].to.y === recentMoves[5].to.y;

      if (isRepetitive) {
        // Apply exhaustion stun (2 turns - unified stun rule)
        // This ensures the piece is stunned until the START of its next-next turn
        const piece = board[to.y]?.[to.x];
        if (piece && piece.id === pieceId) {
          piece.stunnedForTurns = 2;
          piece.isExhausted = true;
        }
        // Reset history after exhaustion
        setPieceMovesHistory((prev) => {
          const newMap = new Map(prev);
          newMap.delete(pieceId);
          return newMap;
        });
        return true;
      }
    }

    // Update history
    setPieceMovesHistory((prev) => {
      const newMap = new Map(prev);
      newMap.set(pieceId, recentMoves);
      return newMap;
    });

    return false;
  }

  // Add state for unspent gold
  const [unspentGold, setUnspentGold] = useState(0);
  // State for the currently active market action
  const [marketAction, setMarketAction] = useState<MarketAction>(null);

  // Market view visibility state - true = market visible, false = battlefield view
  // Start with market visible (true) by default
  const [marketViewVisible, setMarketViewVisible] = useState(true);

  // Sell button state
  const [sellButtonPos, setSellButtonPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Campaign state for carryover roster
  const [campaign, setCampaign] = useState<CampaignState>(() => {
    const saved = localStorage.getItem("dicechess_campaign_v1");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only restore difficulty if it was explicitly saved in campaign state
        // Don't read from localStorage directly - difficulty must be set via selection card
        return {
          level: parsed.level || 1,
          whiteRoster: parsed.whiteRoster || [],
          prayerDice: parsed.prayerDice || 2,
          unlockedItems:
            parsed.unlockedItems && Array.isArray(parsed.unlockedItems)
              ? parsed.unlockedItems
              : [],
          freeUnits: new Map(parsed.freeUnits || []),
          freeItems: new Map(parsed.freeItems || []),
          tutorialsSeen:
            parsed.tutorialsSeen && Array.isArray(parsed.tutorialsSeen)
              ? parsed.tutorialsSeen
              : [],
          difficulty: parsed.difficulty || undefined, // Only use saved difficulty, not localStorage
        };
      } catch (e) {
        console.warn("Failed to parse saved campaign state:", e);
      }
    }
    return {
      level: 1,
      whiteRoster: [],
      prayerDice: 2,
      unlockedItems: [],
      freeUnits: new Map(),
      freeItems: new Map(),
      tutorialsSeen: [],
      difficulty: undefined, // Always start fresh - no difficulty until selection card
    };
  });

  // Current level configuration (loaded asynchronously)
  const [currentLevelConfig, setCurrentLevelConfig] =
    useState<LevelConfig | null>(null);

  // Load level configuration when campaign level changes
  useEffect(() => {
    loadLevelConfig(campaign.level).then((config) => {
      setCurrentLevelConfig(config);
      // Preload all story card images for this level
      if (config.storyCards && config.storyCards.length > 0) {
        preloadStoryCardImages(config.storyCards).catch((err) => {
          console.warn("Failed to preload some story card images:", err);
        });
      }
    });
  }, [campaign.level]);

  // Get current board size from level configuration
  const currentBoardSize = currentLevelConfig?.boardSize ?? 7;

  // Track items unlocked in this level
  const [thisLevelUnlockedItems, setThisLevelUnlockedItems] = useState<
    Exclude<Equip, undefined>[]
  >([]);

  // Track enemy pieces killed this level for ransom
  const [killedEnemyPieces, setKilledEnemyPieces] = useState<KilledPiece[]>([]);

  // Track Courtiers destroyed this level
  const [destroyedCourtiers, setDestroyedCourtiers] = useState<number>(0);

  // Track player pieces lost this level
  const [playerPiecesLost, setPlayerPiecesLost] = useState<Piece[]>([]);

  // Optional Objectives System - imported dynamically
  const [objectiveStates, setObjectiveStates] = useState<
    import("./types").ObjectiveState[]
  >([]);
  const [activeObjectiveIds, setActiveObjectiveIds] = useState<string[]>([]); // IDs of objectives active for this level
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [newlyCompletedObjectives, setNewlyCompletedObjectives] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [newlyFailedObjectives, setNewlyFailedObjectives] = useState<string[]>([]);
  const [lastVictoryInfo, setLastVictoryInfo] = useState<{
    pieceType: PieceType;
    originalType?: PieceType;
    condition?: VictoryCondition;
  } | null>(null);

  const handlePlayerPieceLost = useCallback((piece: Piece) => {
    if (piece.color !== "w") return;
    setPlayerPiecesLost((prev) => {
      if (prev.some((p) => p.id === piece.id)) {
        return prev;
      }
      return [...prev, piece];
    });
  }, []);

  // State to save resources before starting a level (for level retry)
  const [levelStartSnapshot, setLevelStartSnapshot] = useState<{
    level: number;
    gold: number;
    whiteRoster: Piece[];
    prayerDice: number;
    unlockedItems: Exclude<Equip, undefined>[];
    freeUnits: Map<PieceType, number>;
    freeItems: Map<Exclude<Equip, undefined>, number>;
    tutorialsSeen: TutorialType[];
    difficulty?: Difficulty;
  } | null>(null);
  
  // Create snapshot if we're in a level but don't have one (e.g., loaded from save or refreshed)
  useEffect(() => {
    // Only create snapshot if:
    // 1. We don't have a snapshot yet OR the snapshot is for a different level
    // 2. We're past the intro (game has started)
    // 3. We're in market or playing phase (actually in a level)
    // 4. We have a campaign level >= 1
    const needsSnapshot = (!levelStartSnapshot || levelStartSnapshot.level !== campaign.level) 
      && !showIntro 
      && (phase === "market" || phase === "playing") 
      && campaign.level >= 1;
      
    if (needsSnapshot) {
      setLevelStartSnapshot({
        level: campaign.level,
        gold: unspentGold,
        whiteRoster: [...campaign.whiteRoster],
        prayerDice: campaign.prayerDice,
        unlockedItems: [...campaign.unlockedItems],
        freeUnits: new Map(campaign.freeUnits),
        freeItems: new Map(campaign.freeItems),
        tutorialsSeen: [...campaign.tutorialsSeen],
        difficulty: campaign.difficulty,
      });
    }
  }, [levelStartSnapshot, showIntro, phase, campaign, unspentGold]);

  // Tutorial state - just track which tutorial is showing
  const [currentTutorial, setCurrentTutorial] = useState<TutorialType | null>(null);
  const [tutorialPosition, setTutorialPosition] = useState<{ top: number; left: number } | null>(null);
  const [pausedForTutorial, setPausedForTutorial] = useState(false);
  // Use ref to track pause state for setTimeout checks
  const pausedForTutorialRef = useRef(false);
  // Store pending move history to add after tutorial closes
  const pendingMoveHistoryRef = useRef<MoveRecord | null>(null);
  // Store pending action to execute after tutorial closes
  const pendingActionRef = useRef<{ from: { x: number; y: number }; to: { x: number; y: number }; isBot: boolean; isDragMove: boolean } | null>(null);
  const [kingEscapeTutorialTriggered, setKingEscapeTutorialTriggered] = useState(false);
  const [kingEscapeGuideLineVisible, setKingEscapeGuideLineVisible] = useState(false);
  const [kingEscapeGuideLineOpacity, setKingEscapeGuideLineOpacity] = useState(0);
  const kingEscapeGuideLineFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kingEscapeGuideLineHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Keep ref in sync with state
  useEffect(() => {
    pausedForTutorialRef.current = pausedForTutorial;
  }, [pausedForTutorial]);

  // Close tutorial if tutorials are disabled
  useEffect(() => {
    if (!enableTutorialPopups && currentTutorial) {
      setCurrentTutorial(null);
      setTutorialPosition(null);
      setPausedForTutorial(false);
    }
  }, [enableTutorialPopups, currentTutorial]);

  // Helper function to get board center position
  const getBoardCenterPosition = useCallback((): { top: number; left: number } | null => {
    if (!boardRef.current) return null;
    
    const boardRect = boardRef.current.getBoundingClientRect();
    return {
      top: boardRect.top + boardRect.height / 2,
      left: boardRect.left + boardRect.width / 2,
    };
  }, []);

  // Helper function to calculate position above a board square (deprecated - kept for compatibility)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getBoardSquarePosition = useCallback((x: number, y: number): { top: number; left: number } | null => {
    if (!boardRef.current) return null;
    
    const boardRect = boardRef.current.getBoundingClientRect();
    // Board square size (88px based on CSS)
    const tileSize = 88;
    // Calculate position of the square's center
    const squareLeft = boardRect.left + (x * tileSize) + (tileSize / 2);
    const squareTop = boardRect.top + (y * tileSize);
    
    // Position popup above the square (offset by popup height)
    const popupHeight = 400; // Approximate height of tutorial popup
    const top = squareTop - popupHeight - 20; // 20px gap above square
    
    return {
      left: squareLeft,
      top: Math.max(20, top), // Ensure popup doesn't go off top of screen
    };
  }, []);

  // Helper function to get button position for tutorial popup
  const getButtonPosition = useCallback((selector: string): { top: number; left: number } | null => {
    const button = document.querySelector(`[${selector}]`);
    if (!button) return null;
    
    const rect = button.getBoundingClientRect();
    return {
      top: rect.top + rect.height / 2,
      left: rect.left + rect.width / 2,
    };
  }, []);

  // Helper function to get position above a button (for popups that should appear above)
  const getButtonPositionAbove = useCallback((selector: string): { top: number; left: number } | null => {
    const button = document.querySelector(`[${selector}]`);
    if (!button) return null;
    
    const rect = button.getBoundingClientRect();
    const popupHeight = 400; // Approximate height of tutorial popup
    return {
      top: rect.top - popupHeight - 20, // Position above button with 20px gap
      left: rect.left + rect.width / 2,
    };
  }, []);

  // Helper function to get Market component center position
  const getMarketCenterPosition = useCallback((): { top: number; left: number } | null => {
    const marketRoot = document.querySelector('[data-market-root]');
    if (!marketRoot) return null;
    
    const rect = marketRoot.getBoundingClientRect();
    return {
      top: rect.top + rect.height / 2,
      left: rect.left + rect.width / 2,
    };
  }, []);

  // Helper function to show a tutorial if not already seen
  // Returns true if tutorial was shown, false otherwise
  // skipSeenCheck: if true, shows tutorial even if already seen (for chaining tutorials)
  // positionAbove: if true, positions popup above the target element instead of at its center
  const showTutorial = useCallback((type: TutorialType, triggerSquare?: { x: number; y: number }, selector?: string, skipSeenCheck: boolean = false, positionAbove: boolean = false): boolean => {
    // Only show if tutorials are enabled
    if (!enableTutorialPopups) return false;
    if (!skipSeenCheck && campaign.tutorialsSeen.includes(type)) {
      return false;
    }
    
    // Calculate position based on tutorial type and parameters
    let position: { top: number; left: number } | null = null;
    
    // Special handling for market tutorials
    if (type === "market_buy_pawn") {
      // Center the popup in the Market component
      position = getMarketCenterPosition();
    } else if (type === "market_view_battlefield") {
      // Position above the VIEW BATTLEFIELD button
      if (selector) {
        position = positionAbove ? getButtonPositionAbove(selector) : getButtonPosition(selector);
      }
    } else {
      // For all board-related tutorials (single_combat, supporting_units, king_advantage, etc.),
      // center them on the board for simplicity and consistency
      position = getBoardCenterPosition();
    }
    
    // Fallback to center of screen if position calculation fails
    if (!position) {
      position = {
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
      };
    }
    
    setTutorialPosition(position);
    setCurrentTutorial(type);
    setPausedForTutorial(true);
    pausedForTutorialRef.current = true;
    
    return true;
  }, [campaign.tutorialsSeen, enableTutorialPopups, getBoardCenterPosition, getButtonPosition, getButtonPositionAbove, getMarketCenterPosition]);

  const clearKingEscapeGuideLineTimeouts = useCallback(() => {
    if (kingEscapeGuideLineFadeTimeoutRef.current) {
      clearTimeout(kingEscapeGuideLineFadeTimeoutRef.current);
      kingEscapeGuideLineFadeTimeoutRef.current = null;
    }
    if (kingEscapeGuideLineHideTimeoutRef.current) {
      clearTimeout(kingEscapeGuideLineHideTimeoutRef.current);
      kingEscapeGuideLineHideTimeoutRef.current = null;
    }
  }, []);

  const triggerKingEscapeGuideLine = useCallback(() => {
    clearKingEscapeGuideLineTimeouts();
    setKingEscapeGuideLineVisible(true);
    setKingEscapeGuideLineOpacity(0);

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        setKingEscapeGuideLineOpacity(0.85);
      });
    } else {
      setKingEscapeGuideLineOpacity(0.85);
    }

    kingEscapeGuideLineFadeTimeoutRef.current = setTimeout(() => {
      setKingEscapeGuideLineOpacity(0);
      kingEscapeGuideLineHideTimeoutRef.current = setTimeout(() => {
        setKingEscapeGuideLineVisible(false);
      }, 800);
    }, 5000);
  }, [clearKingEscapeGuideLineTimeouts]);

  // Helper function to close tutorial and mark as seen
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const closeTutorial = useCallback(() => {
    if (currentTutorial) {
      const closedTutorial = currentTutorial;
      const updatedTutorialsSeen = [...campaign.tutorialsSeen, closedTutorial];
      
      setCampaign(prev => ({
        ...prev,
        tutorialsSeen: updatedTutorialsSeen,
      }));
      setCurrentTutorial(null);
      setTutorialPosition(null);
      setPausedForTutorial(false);
      pausedForTutorialRef.current = false;
      
      // Add any pending move history after tutorial closes
      if (pendingMoveHistoryRef.current) {
        const pendingMove = pendingMoveHistoryRef.current;
        pendingMoveHistoryRef.current = null;
        setMoveHistory((hist) => [...hist, pendingMove]);
      }
      
      // Execute any pending action after tutorial closes
      if (pendingActionRef.current) {
        const pendingAction = pendingActionRef.current;
        pendingActionRef.current = null;
        console.log("✅ Tutorial closed - re-triggering stored move:", pendingAction);
        console.log("⏰ Scheduling move re-trigger in 100ms...");
        // Small delay to ensure UI has updated after tutorial closes
        setTimeout(() => {
          console.log("🎬 Re-triggering move NOW:", pendingAction);
          // Note: perform is a function declaration defined below, so it's safe to call here
          perform(pendingAction.from, pendingAction.to, pendingAction.isBot, pendingAction.isDragMove);
        }, 100);
      }
      
      // If we just closed the first market tutorial, show the second one
      if (closedTutorial === "market_buy_pawn" && 
          enableTutorialPopups &&
          !updatedTutorialsSeen.includes("market_view_battlefield") &&
          phase === "market") {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          // Position above the VIEW BATTLEFIELD button
          showTutorial("market_view_battlefield", undefined, "data-view-battlefield", true, true);
        }, 300);
      }
      if (closedTutorial === "king_escape_hint") {
        triggerKingEscapeGuideLine();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTutorial, campaign.tutorialsSeen, enableTutorialPopups, phase, showTutorial, triggerKingEscapeGuideLine]);

  useEffect(() => {
    return () => {
      clearKingEscapeGuideLineTimeouts();
    };
  }, [clearKingEscapeGuideLineTimeouts]);

  useEffect(() => {
    clearKingEscapeGuideLineTimeouts();
    setKingEscapeTutorialTriggered(false);
    setKingEscapeGuideLineVisible(false);
    setKingEscapeGuideLineOpacity(0);
  }, [campaign.level, clearKingEscapeGuideLineTimeouts]);

  useEffect(() => {
    if (
      campaign.level === 1 &&
      phase === "playing" &&
      !kingEscapeTutorialTriggered &&
      !pausedForTutorial &&
      !currentTutorial &&
      enableTutorialPopups &&
      !campaign.tutorialsSeen.includes("king_escape_hint")
    ) {
      const shown = showTutorial("king_escape_hint");
      if (shown) {
        setKingEscapeTutorialTriggered(true);
      }
    }
  }, [
    campaign.level,
    phase,
    kingEscapeTutorialTriggered,
    pausedForTutorial,
    currentTutorial,
    enableTutorialPopups,
    campaign.tutorialsSeen,
    showTutorial,
  ]);

  // Tutorial: Exhausted Units - trigger when first exhausted piece detected
  useEffect(() => {
    if (enableTutorialPopups && !campaign.tutorialsSeen.includes("exhausted_units") && !pausedForTutorial && phase === "playing") {
      for (let y = 0; y < currentBoardSize; y++) {
        for (let x = 0; x < currentBoardSize; x++) {
          const piece = Bstate[y]?.[x];
          if (piece && piece.isExhausted && piece.stunnedForTurns && piece.stunnedForTurns > 0) {
            showTutorial("exhausted_units", { x, y });
            return;
          }
        }
      }
    }
  }, [Bstate, campaign.tutorialsSeen, pausedForTutorial, phase, currentBoardSize, showTutorial, enableTutorialPopups]);

  // Tutorial: Stunned Units - trigger when first stunned piece detected (non-exhausted)
  useEffect(() => {
    if (enableTutorialPopups && !campaign.tutorialsSeen.includes("stunned_units") && !pausedForTutorial && phase === "playing") {
      for (let y = 0; y < currentBoardSize; y++) {
        for (let x = 0; x < currentBoardSize; x++) {
          const piece = Bstate[y]?.[x];
          // Only show stunned tutorial if not exhausted (exhausted has its own tutorial)
          if (piece && piece.stunnedForTurns && piece.stunnedForTurns > 0 && !piece.isExhausted) {
            showTutorial("stunned_units", { x, y });
            return;
          }
        }
      }
    }
  }, [Bstate, campaign.tutorialsSeen, pausedForTutorial, phase, currentBoardSize, showTutorial, enableTutorialPopups]);

  // Tutorial: Veterans - trigger when first veteran is created
  useEffect(() => {
    if (enableTutorialPopups && !campaign.tutorialsSeen.includes("veterans") && !pausedForTutorial && phase === "playing") {
      for (let y = 0; y < currentBoardSize; y++) {
        for (let x = 0; x < currentBoardSize; x++) {
          const piece = Bstate[y]?.[x];
          if (piece && (piece.kills || 0) >= 5) {
            showTutorial("veterans", { x, y });
            return;
          }
        }
      }
    }
  }, [Bstate, campaign.tutorialsSeen, pausedForTutorial, phase, currentBoardSize, showTutorial, enableTutorialPopups]);

  // Tutorial: Prayer Die - trigger when Prayer Die popup first appears
  useEffect(() => {
    if (enableTutorialPopups && 
        phase === "awaiting_reroll" && 
        rerollState &&
        !campaign.tutorialsSeen.includes("prayer_dice") && 
        !pausedForTutorial &&
        !currentTutorial) {
      // Show immediately - the tutorial will appear before the Roll Failed popup
      showTutorial("prayer_dice");
    }
  }, [phase, rerollState, campaign.tutorialsSeen, pausedForTutorial, currentTutorial, enableTutorialPopups, showTutorial]);

  // Tutorial: Market Buy Pawn - trigger when Market first opens in level 2
  useEffect(() => {
    if (enableTutorialPopups && 
        campaign.level === 2 && 
        phase === "market" && 
        marketViewVisible &&
        !campaign.tutorialsSeen.includes("market_buy_pawn") && 
        !pausedForTutorial &&
        !currentTutorial) {
      // Small delay to ensure Market UI is rendered
      const timer = setTimeout(() => {
        // Center the popup in the Market component (no arrow)
        showTutorial("market_buy_pawn");
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [campaign.level, phase, marketViewVisible, campaign.tutorialsSeen, pausedForTutorial, currentTutorial, enableTutorialPopups, showTutorial]);

  // Track if we should show the initial victory message or main content
  const [showVictoryDetails, setShowVictoryDetails] = useState(false);

  // Auto-transition from phrase to details after 2 seconds (only for wins)
  useEffect(() => {
    if (win === W && phrase && !showVictoryDetails) {
      const timer = setTimeout(() => {
        setShowVictoryDetails(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
    // For losses, show details immediately
    if (win === B) {
      setShowVictoryDetails(true);
    }
  }, [win, phrase, showVictoryDetails]);

  // Save campaign state to localStorage whenever it changes
  useEffect(() => {
    const serialized = {
      ...campaign,
      freeUnits: Array.from(campaign.freeUnits.entries()),
      freeItems: Array.from(campaign.freeItems.entries()),
    };
    localStorage.setItem("dicechess_campaign_v1", JSON.stringify(serialized));
  }, [campaign]);

  // Sync prayer dice state with campaign state
  useEffect(() => {
    setPrayerDice(campaign.prayerDice);
  }, [campaign.prayerDice]);

  const TMG = fastMode ? TIMING.fast : TIMING.normal;
  const PIECE_MOVE_MS = 150;
  const PIECE_MOVE_EASE = "ease-out";

  // --- Tooltip state ---
  const [tooltipText, setTooltipText] = useState<string | null>(null);
  const mousePos = useGlobalMousePos(!!tooltipText);
  const tooltip = tooltipText
    ? { text: tooltipText, x: mousePos.x, y: mousePos.y }
    : null;

  const showTooltip = (text: string) => {
    setTooltipText(text);
  };

  const hideTooltip = () => {
    setTooltipText(null);
  };

  // Moved check calculations before the effect that uses them
  const kW = useMemo(
    () => findK(Bstate, W, currentBoardSize),
    [Bstate, currentBoardSize]
  );
  const kB = useMemo(
    () => findK(Bstate, B, currentBoardSize),
    [Bstate, currentBoardSize]
  );
  const wChk = useMemo(
    () =>
      kW
        ? threatened(Bstate, Tstate, obstacles, { x: kW.x, y: kW.y }, B, currentBoardSize)
        : false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Bstate, Tstate, obstacles, kW]
  );
  const bChk = useMemo(
    () =>
      kB
        ? threatened(Bstate, Tstate, obstacles, { x: kB.x, y: kB.y }, W, currentBoardSize)
        : false,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [Bstate, Tstate, obstacles, kB]
  );

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (drag) {
        setDrag((d) =>
          d ? { ...d, clientX: e.clientX, clientY: e.clientY } : null
        );
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (drag && boardRef.current) {
        const boardRect = boardRef.current.getBoundingClientRect();
        const x = Math.floor((e.clientX - boardRect.left - 12 - 24) / 88);
        const y =
          currentBoardSize -
          1 -
          Math.floor((e.clientY - boardRect.top - 12) / 88);

        // Handle market phase drag-and-drop
        if (phase === "market" && !marketAction) {
          const B1 = cloneB(Bstate);
          const draggedPiece = B1[drag.from.y]?.[drag.from.x];
          const targetPiece = B1[y]?.[x];
          
          // Check if drop is valid (within deployment zone)
          if (x >= 0 && x < currentBoardSize && y >= 0 && y <= 1 && drag.from.y <= 1 && draggedPiece) {
            // Check if dropping on another white piece (swap) or empty square (move)
            if (targetPiece && targetPiece.color === W && !(drag.from.x === x && drag.from.y === y)) {
              // Swap pieces
              sfx.move();
              B1[drag.from.y][drag.from.x] = targetPiece;
              B1[y][x] = draggedPiece;
              setB(B1);
              setSel(null);
              setDrag(null);
              return;
            } else if (!targetPiece && obstacles[y]?.[x] === "none") {
              // Move to empty square
              sfx.move();
              B1[y][x] = draggedPiece;
              B1[drag.from.y][drag.from.x] = null;
              setB(B1);
              setSel(null);
              setDrag(null);
              return;
            }
          }
          // Invalid drop in market phase - just clear drag and selection
          setDrag(null);
          setSel(null);
          return;
        }

        // Handle playing phase drag-and-drop (existing logic)
        const isLegal = legal.some((m) => m.x === x && m.y === y);
        if (isLegal) {
          setSel(null);
          setLegal([]);
          perform(drag.from, { x, y }, false, true);
          setDrag(null); // Clear drag state after performing move
          return; // Prevent setDrag(null) below
        }
      }
      setDrag(null); // Clear drag on illegal move or drop outside
    };

    const onBlur = () => {
      setDrag(null); // Clear drag if window loses focus
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("blur", onBlur); // Also clear drag if window loses focus
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, legal, Bstate, Tstate, phase, marketAction, obstacles, currentBoardSize]); // Added dependencies for market phase and perform closure

  // useEffect now depends on seed *and* level, init is passed unspentGold
  useEffect(() => {
    if (currentLevelConfig) {
      init(seed, campaign.level, unspentGold, currentLevelConfig);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, campaign.level, unspentGold, currentLevelConfig]);

  // Keep ref in sync with state
  useEffect(() => {
    currentStoryCardRef.current = currentStoryCard;
  }, [currentStoryCard]);

  // Show story cards immediately when advancing to next level (skip intro popup)
  useEffect(() => {
    // Only show story cards if:
    // 1. We have story cards in the queue
    // 2. No current story card is showing
    // 3. Intro popup is not showing
    if (storyCardQueue.length > 0 && !currentStoryCard && !showIntro) {
      setCurrentStoryCard(storyCardQueue[0]);
      setIsRetryingLevel(false);
    }
  }, [storyCardQueue, currentStoryCard, showIntro]);

  useEffect(() => {
    sfx.muted = muted;
  }, [muted]);

  // Bot Turn Logic - Removed bChk from dependency array
  useEffect(() => {
    if (!win && turn === B && phase === "playing") {
      // Calculate speech bubble typing delay using the ref to avoid re-triggering when bubble clears
      let speechDelay = 0;
      if (speechBubbleRef.current && speechBubbleRef.current.text) {
        // Strip ** markers to get actual character count
        const cleanText = speechBubbleRef.current.text.replace(/\*\*/g, "");
        // 50ms per character + 500ms extra to let player read the completed bubble
        speechDelay = cleanText.length * 50 + 500;
      }

      const totalDelay = TMG.botThink + speechDelay;

      const t = setTimeout(() => {
        // Calculate bChk inside the effect if needed for immediate logic, or rely on the state update triggering re-render
        const isBlackInCheck = kB
          ? threatened(
              Bstate,
              Tstate,
              obstacles,
              { x: kB.x, y: kB.y },
              W,
              currentBoardSize
            )
          : false;

        const botBehavior = currentLevelConfig?.botBehavior || "balanced";

        const m = bot(
          Bstate,
          Tstate,
          obstacles,
          B,
          rngRef.current,
          currentBoardSize,
          botBehavior
        );
        
        console.log("=== BOT TURN CHECK ===");
        console.log("Bot found move:", !!m);
        
        if (!m) {
          // Check if king_escaped is enabled
          const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
          const kingEscapedEnabled = victoryConditions.includes("king_escaped");
          
          console.log("Victory conditions:", victoryConditions);
          console.log("King escaped enabled:", kingEscapedEnabled);
          console.log("Black in check:", isBlackInCheck);
          console.log("Black king exists (kB):", !!kB);
          
          // Check if all black pieces are dead
          let allBlackPiecesDead = true;
          let blackPieceCount = 0;
          for (let y = 0; y < currentBoardSize; y++) {
            for (let x = 0; x < currentBoardSize; x++) {
              const piece = Bstate[y]?.[x];
              if (piece && piece.color === B) {
                allBlackPiecesDead = false;
                blackPieceCount++;
              }
            }
          }
          
          console.log("All black pieces dead:", allBlackPiecesDead);
          console.log("Black piece count:", blackPieceCount);
          
          // REMOVED: All enemies wiped bonus logic to see what naturally happens
          
          // If black is in check and has no moves → check if it's checkmate
          if (isBlackInCheck) {
            // Before declaring checkmate, check if the King has any escape squares available
            // (ignoring stun status, since stun is temporary and doesn't mean checkmate)
            let hasEscapeSquare = false;
            if (kB) {
              const kingEscapeSquares = kingMovesIgnoringStun(
                Bstate,
                Tstate,
                obstacles,
                kB.x,
                kB.y,
                currentBoardSize
              );
              for (const escapeSquare of kingEscapeSquares) {
                const nb = tryMove(Bstate, Tstate, { x: kB.x, y: kB.y }, escapeSquare);
                if (!nb) continue;
                const k2 = findK(nb, B, currentBoardSize);
                if (!k2) continue; // This move gets king captured, not an evasion
                if (!threatened(nb, Tstate, obstacles, { x: k2.x, y: k2.y }, W, currentBoardSize)) {
                  // King has an escape square available, so it's not checkmate
                  hasEscapeSquare = true;
                  break;
                }
              }
            }
            
            if (!hasEscapeSquare) {
              // No escape squares available - this is truly checkmate
              console.log(">>> TAKING PATH: Black in check with no moves - checkmate");
              sfx.winCheckmate();
              setWin(W); // Player wins if bot has no moves and is in check
              const deliveringPiece =
                lastMove ? Bstate[lastMove.to.y]?.[lastMove.to.x] : null;
              handleLevelCompletion(W, Bstate, {
                deliverer: deliveringPiece,
                condition: "king_captured",
              });
              setPhrase("King captured! Checkmate!");
              
              // Track King defeat for ransom
              if (kB) {
                setKilledEnemyPieces((prev) => [
                  ...prev,
                  { piece: kB.p, defeatType: "checkmate" },
                ]);
              }

              // Add '#' for checkmate
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMoveEntry = newHistory[newHistory.length - 1];
                if (lastMoveEntry) {
                  lastMoveEntry.notation += "#";
                }
                return newHistory;
              });
              return;
            } else {
              // King has escape squares but is stunned - skip turn, not checkmate
              console.log(">>> TAKING PATH: Black in check but King has escape squares (stunned) - skipping turn");
              setPhrase("Black skipped turn (King stunned)");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) {
                  // Only add skip notation if it's not already there
                  if (!lastMove.notation.includes("(skip)")) {
                    lastMove.notation += " (skip)";
                  }
                }
                return newHistory;
              });
              // Switch turn back to white after skipping
              console.log("Setting turn back to WHITE after skip (King stunned in check)");
              setTurn(W);
              return;
            }
          }
          
          // If black is NOT in check and has no moves → skip turn (continue game)
          console.log(">>> TAKING PATH: Black has no moves (not in check) - skipping turn");
          console.log("This will skip black's turn and continue the game");
          console.log("Black pieces remaining:", blackPieceCount);
          console.log("This path should only happen if black has pieces but can't move them");
          
          setPhrase("Black skipped turn (no moves)");
          setMoveHistory((hist) => {
            const newHistory = [...hist];
            const lastMove = newHistory[newHistory.length - 1];
            if (lastMove) {
              // Only add skip notation if it's not already there
              if (!lastMove.notation.includes("(Skip)") && !lastMove.notation.includes("(Black skipped)")) {
                lastMove.notation += " (Skip)";
              }
            }
            return newHistory;
          });
          // Skip black's turn and continue with white
          console.log("Setting turn back to WHITE after skip");
          setTurn(W);
          return;
        }
        
        console.log(">>> Bot making move from", m.from, "to", m.to);
        perform(m.from, m.to, true);
      }, totalDelay);
      return () => clearTimeout(t);
    }
    // Dependencies now only include things that should trigger the bot's turn
    // Note: speechBubble is NOT in deps - we use speechBubbleRef to check it without re-triggering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, Bstate, Tstate, win, phase, TMG.botThink, kB]);

  const vis = useMemo(
    () => visibility(Bstate, phase, currentBoardSize, currentLevelConfig?.fogRows ?? 2, marketViewVisible, currentLevelConfig?.marketEnabled !== false),
    [Bstate, phase, currentBoardSize, currentLevelConfig, marketViewVisible]
  );

  const startDrag = (e: React.MouseEvent, x: number, y: number) => {
    const p = Bstate[y]?.[x]; // Safe navigation
    
    // Check if we're in market phase with a white piece in deployment zone
    const isMarketDrag = phase === "market" && !marketAction && p?.color === W && y <= 1;
    
    // Check if we're in playing phase with valid piece
    const isPlayingDrag = phase === "playing" && p?.color === turn && p.color === W && 
                          !(p.stunnedForTurns && p.stunnedForTurns > 0) && !moveAnim && !fx;
    
    if (!p || (!isMarketDrag && !isPlayingDrag))
      return;

    e.preventDefault(); // 👈 avoid click artifacts while dragging

    const tileEl = (e.target as HTMLElement).closest(".tile");
    if (!tileEl) return;
    const tileRect = tileEl.getBoundingClientRect();
    const offsetX = e.clientX - tileRect.left;
    const offsetY = e.clientY - tileRect.top;

    // Select piece so you get legal highlights & odds preview
    click(x, y);

    const colorKey = p.color as "w" | "b";
    // Check if GL has the type before accessing colorKey
    const pieceGlyphSet = GL[p.type as keyof typeof GL];
    const glyph =
      pieceGlyphSet && colorKey in pieceGlyphSet ? pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet] : "?";

    setDrag({
      id: p.id,
      from: { x, y },
      glyph: glyph,
      color: colorKey,
      equip: p.equip,
      clientX: e.clientX,
      clientY: e.clientY,
      offsetX,
      offsetY,
    });
  };

  // Combat Animation Logic
  useEffect(() => {
    if (!fx) {
      if (
        phase !== "market" &&
        phase !== "playing" &&
        phase !== "awaiting_reroll" &&
        phase !== "awaiting_disguise_choice"
      ) {
        setPhase("playing");
      }
      return;
    }

    if (!fx.isReroll) {
      setRerollTarget(null);
    }

    setPhase("base");

    if (rerollTarget === "attacker") {
      if (fx.kind === "piece") setDispD(fx.d.total);
    } else if (rerollTarget === "defender") {
      setDispA(fx.a.total);
    } else {
      setDispA(null);
      setDispD(null);
    }

    const rollDuration = TMG.roll;
    const lingerDuration = TMG.linger;
    const modsDuration = TMG.mods;
    const totalDuration = TMG.total;

    const hasM =
      (fx.a.mods?.length || 0) > 0 ||
      (fx.kind === "piece" && (fx.d.mods?.length || 0) > 0);

    const t1 = setTimeout(() => {
      setDispA(fx.a.base);
      if (fx.kind === "piece") setDispD(fx.d.base);
      setPhase(hasM ? "mods" : "total");
    }, rollDuration + lingerDuration);

    const t2 = setTimeout(
      () => setPhase("total"),
      rollDuration + lingerDuration + (hasM ? modsDuration : 0)
    );
    const t3 = setTimeout(
      () => setPhase("winner"),
      rollDuration + lingerDuration + (hasM ? modsDuration : 0) + totalDuration
    );

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx, TMG]);

  useEffect(() => {
    if (!fx || (phase !== "total" && phase !== "winner")) return;
    const tick = (
      s: number | null, // Allow null start value
      e: number,
      set: (n: number | null) => void,
      bump: (v: boolean) => void
    ) => {
      // If start value is null (e.g., from previous state), use the base value from fx
      const startVal = s ?? (set === setDispA ? fx.a.base : fx.d?.base ?? 0);
      if (startVal === null || typeof startVal === "undefined") return () => {}; // Safety check and return cleanup

      if (startVal === e) {
        bump(true);
        const tm = setTimeout(() => bump(false), 320);
        return () => clearTimeout(tm);
      }
      let v = startVal;
      const id = setInterval(() => {
        v += v < e ? 1 : -1;
        set(v);
        if (v === e) {
          clearInterval(id);
          bump(true);
          setTimeout(() => bump(false), 320);
        }
      }, 65);
      return () => clearInterval(id);
    };

    let c1 = () => {},
      c2 = () => {}; // Initialize cleanup functions

    if (rerollTarget !== "defender") {
      c1 = tick(dispA, fx.a.total, setDispA, setBumpA); // Pass current dispA
    } else {
      setBumpA(true);
      const tm = setTimeout(() => setBumpA(false), 320);
      c1 = () => clearTimeout(tm);
    }

    if (fx.kind === "piece") {
      if (rerollTarget !== "attacker") {
        c2 = tick(dispD, fx.d.total, setDispD, setBumpD); // Pass current dispD
      } else {
        setBumpD(true);
        const tm = setTimeout(() => setBumpD(false), 320);
        c2 = () => clearTimeout(tm);
      }
    }

    return () => {
      c1(); // Always call cleanup
      c2(); // Always call cleanup
    };
  }, [phase, fx, rerollTarget, dispA, dispD]); // Added rerollTarget, dispA, dispD dependencies

  useEffect(() => {
    if (speechBubble) {
      const timer = setTimeout(() => {
        setSpeechBubble(null);
      }, TMG.bubble); // Bubble visible for 3.5 seconds
      return () => clearTimeout(timer);
    }
  }, [speechBubble, TMG.bubble]);

  // Ref to track speech bubble state for timer closure
  const speechBubbleRef = useRef(speechBubble);
  useEffect(() => {
    speechBubbleRef.current = speechBubble;
  }, [speechBubble]);

  // Courtier speech timer - triggers independently from piece speech
  useEffect(() => {
    if (
      phase !== "playing" ||
      !currentLevelConfig?.courtierSpeechLines ||
      currentLevelConfig.courtierSpeechLines.length === 0 ||
      win
    ) {
      return; // Don't run during market, story, or after game ends
    }

    const speechChance = currentLevelConfig?.courtierSpeechChance ?? 0.3;
    const intervalConfig = currentLevelConfig?.courtierSpeechInterval ?? { min: 2000, max: 5000 };
    
    // Calculate random interval (either a fixed number or random between min/max)
    const getRandomInterval = (): number => {
      if (typeof intervalConfig === "number") {
        return intervalConfig;
      } else {
        const min = intervalConfig.min ?? 2000;
        const max = intervalConfig.max ?? 5000;
        return min + Math.random() * (max - min);
      }
    };

    let timeoutId: NodeJS.Timeout | null = null;
    let isActive = true;

    const scheduleNextCheck = () => {
      if (!isActive) return;
      
      const interval = getRandomInterval();
      timeoutId = setTimeout(() => {
        // Check if we're still in playing phase and should continue
        if (phase !== "playing" || win || !currentLevelConfig?.courtierSpeechLines) {
          isActive = false;
          return;
        }

        // Only trigger if there's no active speech bubble (don't interrupt piece speech)
        if (!speechBubbleRef.current) {
          const speakingCourtiers: { x: number; y: number; line: string }[] = [];
          obstacles.forEach((row, y) => {
            row.forEach((obs, x) => {
              if (obs === "courtier" && Math.random() < speechChance) {
                const randomLine = currentLevelConfig.courtierSpeechLines![Math.floor(Math.random() * currentLevelConfig.courtierSpeechLines!.length)];
                speakingCourtiers.push({ x, y, line: randomLine });
              }
            });
          });
          
          // Show speech bubbles for all courtiers that rolled successfully
          // Queue them sequentially so they appear one after another
          if (speakingCourtiers.length > 0) {
            speakingCourtiers.forEach((courtier, idx) => {
              setTimeout(() => {
                // Double-check there's still no piece speech bubble before showing
                if (!speechBubbleRef.current) {
                  setSpeechBubble({
                    text: courtier.line,
                    id: Date.now() + idx,
                    targetId: `courtier-${courtier.x}-${courtier.y}`
                  });
                  setTimeout(() => setSpeechBubble(null), 2000);
                }
              }, idx * 2500); // Stagger by 2.5 seconds each
            });
          }
        }
        
        // Schedule next check
        scheduleNextCheck();
      }, interval);
    };

    // Start the first check
    scheduleNextCheck();

    return () => {
      isActive = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [phase, currentLevelConfig, obstacles, win]);

  // safety: hide tooltip whenever we leave Market or start an action
  useEffect(() => {
    if (phase !== "market") hideTooltip();
  }, [phase]);
  useEffect(() => {
    if (marketAction) hideTooltip();
  }, [marketAction]);

  useEffect(() => {
    if (phase === "awaiting_reroll" && rerollState && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const top = boardRect.top + boardRect.height / 2;
      const left = boardRect.left + boardRect.width / 2;
      setRerollPopupPosition({ top, left });
    } else {
      setRerollPopupPosition(null);
    }
  }, [phase, rerollState]);

  useEffect(() => {
    if (
      phase === "awaiting_disguise_choice" &&
      disguisePopupState &&
      boardRef.current
    ) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const { x, y } = disguisePopupState;
      const visualY = currentBoardSize - 1 - y;
      const top = boardRect.top + 12 + visualY * 88 + 88 / 2;
      const left = boardRect.left + 12 + 24 + x * 88 + 88 / 2;
      setDisguisePopupPosition({ top, left });
    } else {
      setDisguisePopupPosition(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, disguisePopupState]);

  useEffect(() => {
    if (namingState && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const { x, y } = namingState;
      const visualY = currentBoardSize - 1 - y;
      const top = boardRect.top + 12 + visualY * 88 + 60; // Position at the feet of the piece
      const left = boardRect.left + 12 + 24 + x * 88 + 44;
      setNameInputPosition({ top, left });
    } else {
      setNameInputPosition(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namingState]);

  useEffect(() => {
    // When the game starts, always clear any pending market action.
    if (phase === "playing") {
      setMarketAction(null);
    }
  }, [phase]);

  // Campaign level completion handler
function handleLevelCompletion(
    winner: Color,
    board: Board,
    options?: { deliverer?: Piece | null; condition?: VictoryCondition }
  ) {
    if (winner === W && options?.deliverer) {
      const deliverer = options.deliverer;
      setLastVictoryInfo({
        pieceType: deliverer.originalType ?? deliverer.type,
        originalType: deliverer.originalType,
        condition: options.condition,
      });
    } else {
      setLastVictoryInfo(null);
    }
    if (winner === W) {
      // Player won - compute survivors and update campaign state
      const survivors: Piece[] = [];
      for (let y = 0; y < currentBoardSize; y++) {
        for (let x = 0; x < currentBoardSize; x++) {
          const piece = board[y][x];
          if (piece && piece.color === W) {
            survivors.push(serializePiece(piece));
          }
        }
      }

      setCampaign((prev) => ({
        ...prev,
        level: prev.level, // Don't increment level yet - let victory screen show first
        whiteRoster: survivors,
        prayerDice: prev.prayerDice, // Keep current prayer dice count
        unlockedItems: prev.unlockedItems || [], // Preserve unlocked items
        freeUnits: prev.freeUnits || new Map(), // Preserve free units
        freeItems: prev.freeItems || new Map(), // Preserve free items
        tutorialsSeen: prev.tutorialsSeen || [],
      }));

      // Check objectives one final time on victory
      setTimeout(() => {
        checkObjectives({ allowCompletion: true });
      }, 100);
    }
    // If player lost, don't update campaign state (they'll restart from current level)
  }

  // Sell piece function
  function sellPiece(x: number, y: number) {
    const piece = Bstate[y]?.[x];
    if (!piece || piece.color !== W || phase !== "market" || piece.type === "K" || piece.equip === "curse" || currentLevelConfig?.marketEnabled === false)
      return; // Prevent selling King, Curse-equipped units, or when market is disabled

    const sellValue = getSellValue(piece);
    setMarketPoints((prev) => prev + sellValue);

    // Play cash out sound
    sfx.cashOut();

    // Remove the piece from the board
    const newBoard = cloneB(Bstate);
    newBoard[y][x] = null;
    setB(newBoard);

    // Hide sell button
    setSellButtonPos(null);

    // Update campaign roster if this piece was in it
    setCampaign((prev) => ({
      ...prev,
      whiteRoster: prev.whiteRoster.filter((p) => p.id !== piece.id),
    }));
  }

  // init now accepts currentLevel and currentUnspentGold
  // Helper function to place pieces on a row, avoiding obstacles
  function placePiecesAvoidingObstacles(
    board: Board,
    obstacles: Obstacle,
    pieces: (Piece | null)[],
    row: number,
    boardSize: number
  ) {
    // First pass: place pieces in their intended positions if not blocked by obstacles or other pieces
    for (let x = 0; x < boardSize; x++) {
      if (pieces[x] && board[row]?.[x] === null && obstacles[row]?.[x] === "none") {
        board[row][x] = pieces[x];
        pieces[x] = null; // Mark as placed
      }
    }

    // Second pass: find alternative positions for pieces that couldn't be placed
    const unplacedPieces = pieces.filter((p) => p !== null) as Piece[];

    // Sort unplaced pieces to prioritize King placement (and named/preconfigured pieces)
    unplacedPieces.sort((a, b) => {
      if (a.type === "K") return -1; // King gets highest priority
      if (b.type === "K") return 1;
      if (a.isPreconfigured && !b.isPreconfigured) return -1; // Preconfigured pieces next
      if (!a.isPreconfigured && b.isPreconfigured) return 1;
      return 0; // Keep other pieces in original order
    });

    // Count available slots on the row (no pieces AND no obstacles)
    let availableSlots = 0;
    for (let x = 0; x < boardSize; x++) {
      if (board[row]?.[x] === null && obstacles[row]?.[x] === "none") availableSlots++;
    }

    // If we have preconfigured pieces that need placement but not enough slots,
    // make room by temporarily removing non-preconfigured pieces from the board
    const preconfiguredToPlace = unplacedPieces.filter(p => p.isPreconfigured || p.type === "K");
    if (preconfiguredToPlace.length > 0 && availableSlots < preconfiguredToPlace.length) {
      // Collect non-preconfigured pieces that we can temporarily remove
      const removablePieces: { piece: Piece; x: number }[] = [];
      for (let x = 0; x < boardSize; x++) {
        const piece = board[row]?.[x];
        if (piece && !piece.isPreconfigured && piece.type !== "K" && obstacles[row]?.[x] === "none") {
          removablePieces.push({ piece, x });
        }
      }
      
      // Remove enough pieces to make room for all preconfigured pieces
      const piecesToRemove = Math.min(
        removablePieces.length,
        preconfiguredToPlace.length - availableSlots
      );
      for (let i = 0; i < piecesToRemove; i++) {
        board[row][removablePieces[i].x] = null;
        availableSlots++;
      }
    }

    // If we have more unplaced pieces than slots, we need to sacrifice lower-priority pieces
    const piecesToPlace = unplacedPieces.slice(0, availableSlots);

    // Place pieces in available slots (King and preconfigured pieces will be placed first due to sorting)
    for (const piece of piecesToPlace) {
      for (let x = 0; x < boardSize; x++) {
        if (board[row]?.[x] === null && obstacles[row]?.[x] === "none") {
          board[row][x] = piece;
          break; // Move to next piece
        }
      }
    }
  }

  // Handle intro popup completion
  function handleIntroComplete() {
    setShowIntro(false);

    // Check if there are story cards to show
    if (storyCardQueue.length > 0) {
      setCurrentStoryCard(storyCardQueue[0]);
    }
    // If no story cards, game proceeds to market normally
  }

  // Handle story outcome acknowledgment
  function handleOutcomeAcknowledged() {
    const nextCard = storyOutcome?.nextCard;
    setStoryOutcome(null);

    // If there's a next card, show it; otherwise show transition then go to market or playing
    if (nextCard) {
      setCurrentStoryCard(nextCard);
    } else {
      setShowTransition(true);
      // Hide story card first
      setCurrentStoryCard(null);
      setStoryCardQueue([]);

      // Since banners start covering the screen, we can change phase immediately
      // The transition will reveal it when banners slide out
      // Go to market phase or skip to playing if market disabled
      const marketEnabled = currentLevelConfig?.marketEnabled !== false;
      setPhase(marketEnabled ? "market" : "playing");
      setMarketViewVisible(marketEnabled); // Start with market visible by default only if enabled

      // TRIGGER: If market is disabled, battle starts immediately - trigger level music
      if (!marketEnabled) {
        musicManagerRef.current?.playLevelMusic(campaign.level);
      }
      // If market is enabled, music will trigger when user clicks "Start Battle" button

      // Medieval transition sound via WebAudio (match 2.5s animation)
      try {
        const Ctx: any =
          (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctx) {
          const ctx = new Ctx();
          const now = ctx.currentTime;
          const horn = ctx.createOscillator();
          const g1 = ctx.createGain();
          horn.type = "sawtooth";
          horn.frequency.setValueAtTime(420, now);
          g1.gain.setValueAtTime(0.0001, now);
          g1.gain.exponentialRampToValueAtTime(0.2, now + 0.05);
          g1.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
          horn.connect(g1);
          g1.connect(ctx.destination);
          horn.start(now);
          horn.stop(now + 2.4);
        }
      } catch (e) {}

      // After full animation completes (2.5s), hide transition to reveal market screen
      setTimeout(() => {
        setShowTransition(false);
      }, 2500);
    }
  }

  // Handle story card choice events
  const handleStoryEvents = useCallback(
    (events: StoryEvent[]) => {
      const outcomes: OutcomeData[] = [];
      let nextCard: StoryCardType | undefined = undefined;
      let shouldStartBattle = false;
      
      // Accumulate all campaign changes to apply in one batch
      let campaignUpdates: Partial<CampaignState & { pendingEnemyPawns: number; pendingEnemyItemAssignments: Array<{ item: string; count: number }>; pendingEquipmentAssignments: Array<{ pieceName: string; pieceType: PieceType; equip: Exclude<Equip, undefined> }>; pendingPieceSpawns: Array<{ pieceType: PieceType; color: "w" | "b"; x: number; y: number; equip?: Equip }>; pendingObjectiveFlags: string[] }> = {};
      
      // Track free units to combine consecutive events of the same type
      let pendingFreeUnit: { pieceType: PieceType; count: number } | null = null;

      for (const event of events) {
        switch (event.type) {
          case "next_card":
            // Find the next card - first check in storyCardQueue (for end-of-story cards), then in level config
            nextCard = storyCardQueue.find(
              (card) => card.id === event.cardId
            ) || currentLevelConfig?.storyCards?.find(
              (card) => card.id === event.cardId
            );
            break;

          case "reset_to_title":
            // TRIGGER: Stop music when resetting to title
            musicManagerRef.current?.stopMusic();
            
            // Reset all progress and return to title screen
            setShowVictoryDetails(false);
            setWin(null);
            setKilledEnemyPieces([]);
            setPlayerPiecesLost([]);
            setThisLevelUnlockedItems([]);
            setCurrentStoryCard(null);
            setStoryCardQueue([]);
            setStoryOutcome(null);
            setPhase("market");
            setMarketViewVisible(true);
            setMarketPoints(0);
            setUnspentGold(0);
            setCampaign({
              level: 1,
              whiteRoster: [],
              prayerDice: 2,
              unlockedItems: [],
              freeUnits: new Map(),
              freeItems: new Map(),
              tutorialsSeen: [],
              difficulty: undefined,
            });
            // Clear tutorial-related and difficulty localStorage flags
            localStorage.removeItem("dicechess_first_combat_tutorial_used");
            localStorage.removeItem("dicechess_difficulty");
            // Return to title screen
            setShowIntro(true);
            // Trigger fresh init
            setSeed(new Date().toISOString() + "-newgame");
            return; // Exit early, no need to process other events

          case "give_gold":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            setMarketPoints((prev) => prev + event.amount);
            outcomes.push({
              message: `+${event.amount} Gold`,
              glyph: "💰",
              color: "text-yellow-100",
              bgColor: "bg-yellow-900",
              borderColor: "border-yellow-500",
            });
            break;

          case "remove_gold":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            setMarketPoints((prev) => Math.max(0, prev - event.amount));
            outcomes.push({
              message: `-${event.amount} Gold`,
              glyph: "💸",
              color: "text-red-100",
              bgColor: "bg-red-900",
              borderColor: "border-red-500",
            });
            break;

          case "give_prayer_die":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.prayerDice = (campaignUpdates.prayerDice ?? campaign.prayerDice) + 1;
            setPrayerDice((prev) => prev + 1);
            outcomes.push({
              message: "+1 Prayer Die",
              glyph: "🙏",
              color: "text-purple-100",
              bgColor: "bg-purple-900",
              borderColor: "border-purple-500",
            });
            break;

          case "remove_prayer_die":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.prayerDice = Math.max(0, (campaignUpdates.prayerDice ?? campaign.prayerDice) - 1);
            setPrayerDice((prev) => Math.max(0, prev - 1));
            outcomes.push({
              message: "-1 Prayer Die",
              glyph: "🙏",
              color: "text-purple-100",
              bgColor: "bg-purple-900",
              borderColor: "border-purple-500",
            });
            break;

          case "unlock_item":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.unlockedItems = [
              ...(campaignUpdates.unlockedItems ?? campaign.unlockedItems),
              event.item
            ];
            outcomes.push({
              message: `Unlocked ${event.item}!`,
              glyph: equipIcon(event.item) || "🔓",
              color: "text-orange-100",
              bgColor: "bg-orange-900",
              borderColor: "border-orange-500",
            });
            break;

          case "give_free_unit":
            {
              const newFreeUnits = new Map(campaignUpdates.freeUnits ?? campaign.freeUnits);
              const currentCount = newFreeUnits.get(event.pieceType) || 0;
              newFreeUnits.set(event.pieceType, currentCount + 1);
              campaignUpdates.freeUnits = newFreeUnits;
              
              // Accumulate consecutive free units of the same type
              if (pendingFreeUnit && pendingFreeUnit.pieceType === event.pieceType) {
                pendingFreeUnit.count++;
              } else {
                // If there's a pending unit of a different type, flush it first
                if (pendingFreeUnit) {
                  outcomes.push({
                    message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                    glyph: "🍀",
                    color: "text-green-100",
                    bgColor: "bg-green-900",
                    borderColor: "border-green-500",
                  });
                }
                pendingFreeUnit = { pieceType: event.pieceType, count: 1 };
              }
            }
            break;

          case "give_free_item":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            {
              const count = event.count ?? 1;
              const newFreeItems = new Map(campaignUpdates.freeItems ?? campaign.freeItems);
              const currentCount = newFreeItems.get(event.item) || 0;
              newFreeItems.set(event.item, currentCount + count);
              campaignUpdates.freeItems = newFreeItems;
              const itemIcon = equipIcon(event.item);
              const capitalizedItemName = event.item.charAt(0).toUpperCase() + event.item.slice(1);
              outcomes.push({
                message: `x${count} ${itemIcon} Free ${capitalizedItemName}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
            }
            break;

          case "increase_prayer_cost":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            campaignUpdates.prayerDiceCost = 100;
            outcomes.push({
              message: "Prayer Dice now cost 100g",
              glyph: "💎",
              color: "text-purple-100",
              bgColor: "bg-purple-900",
              borderColor: "border-purple-500",
            });
            break;

          case "attach_item_to_units":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            
            // Determine if we're targeting player or enemy
            const targetColor = event.target === "player" ? W : B;
            
            // If targeting player and they're not on the board yet (story phase),
            // attach items to the roster instead
            if (event.target === "player" && campaign.whiteRoster && campaign.whiteRoster.length > 0) {
              // Count how many player pieces are currently on the board
              let playerPiecesOnBoard = 0;
              for (let y = 0; y < currentBoardSize; y++) {
                for (let x = 0; x < currentBoardSize; x++) {
                  if (Bstate[y]?.[x]?.color === W) {
                    playerPiecesOnBoard++;
                  }
                }
              }
              
              // If no player pieces on board, we're in story phase - modify roster
              if (playerPiecesOnBoard === 0) {
                const updatedRoster = [...campaign.whiteRoster];
                // Randomly select pieces from roster to attach items to
                const indicesToModify = updatedRoster
                  .map((_, idx) => idx)
                  .sort(() => rngRef.current() - 0.5)
                  .slice(0, Math.min(event.count, updatedRoster.length));
                
                indicesToModify.forEach((idx) => {
                  updatedRoster[idx] = { ...updatedRoster[idx], equip: event.item };
                });
                
                campaignUpdates.whiteRoster = updatedRoster;
                
                const itemEmoji = equipIcon(event.item);
                const isNegativeItem = event.item === "curse" || event.item === "skull";
                const itemName = event.item === "curse" ? "Cursed" : event.item.charAt(0).toUpperCase() + event.item.slice(1);
                const glyphEmoji = event.item === "curse" ? itemEmoji : (event.item === "skull" ? "💀" : "✨");
                outcomes.push({
                  message: `${event.count} of your units are ${itemName}!`,
                  glyph: glyphEmoji,
                  color: isNegativeItem ? "text-red-100" : "text-blue-100",
                  bgColor: isNegativeItem ? "bg-red-900" : "bg-blue-900",
                  borderColor: isNegativeItem ? "border-red-500" : "border-blue-500",
                });
                break;
              }
            }
            
            // Otherwise, use the existing board-based logic (for enemy or in-battle player targeting)
            const targetPieces: { x: number; y: number; piece: Piece }[] = [];
            
            // Find all pieces of the target color on the board
            for (let y = 0; y < currentBoardSize; y++) {
              for (let x = 0; x < currentBoardSize; x++) {
                const piece = Bstate[y]?.[x];
                if (piece && piece.color === targetColor) {
                  targetPieces.push({ x, y, piece });
                }
              }
            }

            // Randomly select pieces to attach items to
            const piecesToModify = targetPieces
              .sort(() => rngRef.current() - 0.5)
              .slice(0, Math.min(event.count, targetPieces.length));

            // Attach the item to selected pieces
            const newBoard = Bstate.map(row => row.slice()) as Board;
            piecesToModify.forEach(({ x, y, piece }) => {
              if (newBoard[y]?.[x]) {
                newBoard[y][x] = { ...piece, equip: event.item };
              }
            });
            setB(newBoard);

            const itemEmoji = equipIcon(event.item);
            const isNegativeItem = event.item === "curse" || event.item === "skull";
            const itemName = event.item === "curse" ? "Cursed" : event.item.charAt(0).toUpperCase() + event.item.slice(1);
            // Use item emoji for curse, skull emoji for skull item, or sparkle for others
            const glyphEmoji = event.item === "curse" ? itemEmoji : (event.item === "skull" ? "💀" : "✨");
            outcomes.push({
              message: event.target === "player"
                ? `${event.count} of your units are ${itemName}!`
                : `${event.count} enemy units are ${itemName}!`,
              glyph: glyphEmoji,
              color: isNegativeItem ? "text-red-100" : "text-blue-100",
              bgColor: isNegativeItem ? "bg-red-900" : "bg-blue-900",
              borderColor: isNegativeItem ? "border-red-500" : "border-blue-500",
            });
            break;

          case "spawn_enemy_pawns":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            // Store the count to spawn when battle starts
            campaignUpdates.pendingEnemyPawns = 
              (campaignUpdates.pendingEnemyPawns ?? ((campaign as any).pendingEnemyPawns || 0)) + event.count;
            outcomes.push({
              message: "Extra enemies added",
              glyph: "⚔️",
              color: "text-red-100",
              bgColor: "bg-red-900",
              borderColor: "border-red-500",
            });
            break;

          case "assign_item_to_enemy":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            // Store to process after board is initialized
            campaignUpdates.pendingEnemyItemAssignments = [
              ...(campaignUpdates.pendingEnemyItemAssignments ?? ((campaign as any).pendingEnemyItemAssignments || [])),
              { item: event.item, count: event.count }
            ];
            outcomes.push({
              message: `Enemy equips ${event.count} ${event.item === "bow" ? "🏹" : "💰"}`,
              glyph: event.item === "bow" ? "🏹" : "💰",
              color: "text-orange-100",
              bgColor: "bg-orange-900",
              borderColor: "border-orange-500",
            });
            break;

          case "give_item":
          case "give_unit":
            // Flush pending free unit before other events
            if (pendingFreeUnit) {
              outcomes.push({
                message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
              pendingFreeUnit = null;
            }
            // These will be handled when the battle starts (adds to initial boards)
            outcomes.push({
              message: event.type === "give_item" 
                ? `Item granted to ${event.target}` 
                : `Unit granted to ${event.target}`,
              glyph: "⚔️",
              color: "text-amber-100",
              bgColor: "bg-amber-900",
              borderColor: "border-amber-600",
            });
            break;

          case "equip_item_to_named_piece":
            {
              // Store equipment assignment to apply during init
              if (!campaignUpdates.pendingEquipmentAssignments) {
                campaignUpdates.pendingEquipmentAssignments = [];
              }
              campaignUpdates.pendingEquipmentAssignments.push({
                pieceName: event.pieceName,
                pieceType: event.pieceType,
                equip: event.item,
              });
              
              // Show outcome message
              const itemEmoji = equipIcon(event.item);
              const capitalizedItemName = event.item.charAt(0).toUpperCase() + event.item.slice(1);
              outcomes.push({
                message: `x1 ${itemEmoji} ${event.pieceName} ${capitalizedItemName}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
            }
            break;

          case "spawn_piece_at_position":
            {
              // Store piece spawn to apply during battle initialization
              if (!campaignUpdates.pendingPieceSpawns) {
                campaignUpdates.pendingPieceSpawns = [];
              }
              campaignUpdates.pendingPieceSpawns.push({
                pieceType: event.pieceType,
                color: event.color,
                x: event.x,
                y: event.y,
                equip: event.equip,
              });
              
              // Show outcome message
              const equipEmoji = event.equip ? equipIcon(event.equip) : "";
              const equipName = event.equip ? event.equip.charAt(0).toUpperCase() + event.equip.slice(1) : "";
              const equipText = event.equip ? ` with ${equipEmoji} ${equipName}` : "";
              outcomes.push({
                message: `x1 Scout${equipText}`,
                glyph: "🍀",
                color: "text-green-100",
                bgColor: "bg-green-900",
                borderColor: "border-green-500",
              });
            }
            break;

          case "set_difficulty":
            // Set difficulty level for the campaign
            campaignUpdates.difficulty = event.difficulty;
            campaignUpdates.pendingDifficultyReinit = true;
            setNeedsReinit(true);
            // Store in localStorage for persistence
            localStorage.setItem("dicechess_difficulty", event.difficulty);
            break;

          case "show_difficulty_transition":
            // Hide current story card and show automatic transition
            setCurrentStoryCard(null);
            setShowDifficultyTransition(true);
            setDifficultyTransitionLine(0);
            setDifficultyTransitionText("");
            // TRIGGER: Start main menu music
            musicManagerRef.current?.playMainMenuMusic();
            // Find the first real story card (skip difficulty-selection)
            const firstRealCard = currentLevelConfig?.storyCards?.find(
              (card) => card.id !== "difficulty-selection"
            );
            if (firstRealCard) {
              // After transition completes (allowing time for both lines + fades), show the first real story card
              setTimeout(() => {
                setShowDifficultyTransition(false);
                setDifficultyTransitionLine(0);
                setDifficultyTransitionText("");
                setCurrentStoryCard(firstRealCard);
              }, 8500); // ~8.5 seconds total: line1 animation + longer pause + fade + line2 animation + longer pause + fade + spiral
            }
            break;

          case "set_objective_flag": {
            const existingFlags =
              campaignUpdates.pendingObjectiveFlags ??
              ((campaign as any).pendingObjectiveFlags
                ? [...((campaign as any).pendingObjectiveFlags as string[])]
                : []);
            if (!existingFlags.includes(event.flag)) {
              existingFlags.push(event.flag);
            }
            campaignUpdates.pendingObjectiveFlags = existingFlags;
            break;
          }

          case "start_battle":
            shouldStartBattle = true;
            break;
        }
      }
      
      // Flush any pending free unit at the end
      if (pendingFreeUnit) {
        outcomes.push({
          message: `${pendingFreeUnit.count} Free ${PIECE_NAMES[pendingFreeUnit.pieceType]}${pendingFreeUnit.count > 1 ? 's' : ''}`,
          glyph: "🍀",
          color: "text-green-100",
          bgColor: "bg-green-900",
          borderColor: "border-green-500",
        });
      }
      
      // Apply all campaign updates in one batch to avoid race conditions
      if (Object.keys(campaignUpdates).length > 0) {
        setCampaign((prev) => ({ ...prev, ...campaignUpdates }));
      }

      // If there are outcomes, show them
      if (outcomes.length > 0) {
        // If there's a nextCard, that's the card we want to display WITH outcomes
        // We set it as lastCard so it's displayed, and set nextCard to undefined
        // since we've already "arrived" at that card
        const cardToDisplay = nextCard || currentStoryCardRef.current;
        
        // Hide current card
        setCurrentStoryCard(null);
        
        setStoryOutcome({
          outcomes,
          nextCard: undefined, // Already showing the destination card, no further transition needed
          lastCard: cardToDisplay || undefined,
        });
      } else {
        // No outcome to show, proceed immediately
        if (nextCard) {
          // Directly transition to next card without clearing
          setCurrentStoryCard(nextCard);
        } else if (shouldStartBattle) {
          // Save snapshot of resources before starting the level (for level retry)
          setLevelStartSnapshot({
            level: campaign.level,
            gold: unspentGold,
            whiteRoster: [...campaign.whiteRoster],
            prayerDice: campaign.prayerDice,
            unlockedItems: [...campaign.unlockedItems],
            freeUnits: new Map(campaign.freeUnits),
            freeItems: new Map(campaign.freeItems),
            tutorialsSeen: [...campaign.tutorialsSeen],
            difficulty: campaign.difficulty,
          });
          
          // Clear card and go to market or skip to playing if market disabled
          setCurrentStoryCard(null);
          setStoryCardQueue([]);
          // Go to market phase or skip to playing if market disabled
          const marketEnabled = currentLevelConfig?.marketEnabled !== false;
          setPhase(marketEnabled ? "market" : "playing");
          setMarketViewVisible(marketEnabled); // Start with market visible by default only if enabled
          
          // TRIGGER: If market is disabled, battle starts immediately - trigger level music
          if (!marketEnabled) {
            musicManagerRef.current?.playLevelMusic(campaign.level);
          }
          // If market is enabled, music will trigger when user clicks "Start Battle" button
        }
      }
      
      // If battle should start, trigger re-init to process pending events
      if (shouldStartBattle) {
        setNeedsReinit(true);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaign.level, currentLevelConfig, Bstate, currentBoardSize, storyCardQueue, campaign, setMarketPoints, setPrayerDice, setCampaign, setB, rngRef]
  );
  
  // Re-initialize board when pending events need to be processed
  useEffect(() => {
    if (needsReinit && currentLevelConfig) {
      // Only call init if there are actually pending events in the campaign state
      // This ensures we wait for the campaign state to be updated before initializing
      const hasPendingEvents =
        (campaign as any).pendingEnemyPawns ||
        (campaign as any).pendingEnemyItemAssignments ||
        (campaign as any).pendingEquipmentAssignments ||
        (campaign as any).pendingPieceSpawns ||
        (campaign as any).pendingObjectiveFlags ||
        (campaign as any).pendingDifficultyReinit;
      if (hasPendingEvents) {
        init(seed, campaign.level, unspentGold, currentLevelConfig, {
          preserveStoryState: true,
        });
        setNeedsReinit(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsReinit, campaign, currentLevelConfig, seed, unspentGold]);

  // Animate difficulty transition text sequentially (line 1 -> fade -> line 2 -> fade)
  useEffect(() => {
    if (!showDifficultyTransition) {
      // Clear any existing interval and timeout when transition is hidden
      if (difficultyTransitionIntervalRef.current) {
        clearInterval(difficultyTransitionIntervalRef.current);
        difficultyTransitionIntervalRef.current = null;
      }
      if (difficultyTransitionTimeoutRef.current) {
        clearTimeout(difficultyTransitionTimeoutRef.current);
        difficultyTransitionTimeoutRef.current = null;
      }
      return;
    }

    // Only start animation when transition first appears and we're at the initial state
    if (difficultyTransitionLine !== 0 || difficultyTransitionText !== "") {
      return;
    }

    const line1 = "Murky Kingdoms' Highkeep.";
    const line2 = "Year of the See, 1165.";

    // Clear any existing interval
    if (difficultyTransitionIntervalRef.current) {
      clearInterval(difficultyTransitionIntervalRef.current);
      difficultyTransitionIntervalRef.current = null;
    }

    // Animate line 1
    let currentIndex = 0;
    const animateLine1 = () => {
      const interval = setInterval(() => {
        if (currentIndex < line1.length) {
          setDifficultyTransitionText(line1.substring(0, currentIndex + 1));
          currentIndex++;
          
          // Play sound every 3 characters
          if (currentIndex % 3 === 0) {
            playDifficultyTextBlip();
          }
        } else {
          clearInterval(interval);
          difficultyTransitionIntervalRef.current = null;
          // After line 1 completes, wait longer before fading it
          setTimeout(() => {
            setDifficultyTransitionLine('fade1');
            // After fade completes, start line 2
            setTimeout(() => {
              setDifficultyTransitionLine(1);
              setDifficultyTransitionText("");
              // Animate line 2
              let currentIndex2 = 0;
              const animateLine2 = () => {
                const interval2 = setInterval(() => {
                  if (currentIndex2 < line2.length) {
                    setDifficultyTransitionText(line2.substring(0, currentIndex2 + 1));
                    currentIndex2++;
                    
                    // Play sound every 3 characters
                    if (currentIndex2 % 3 === 0) {
                      playDifficultyTextBlip();
                    }
                  } else {
                    clearInterval(interval2);
                    difficultyTransitionIntervalRef.current = null;
                    // After line 2 completes, wait longer before fading it
                    setTimeout(() => {
                      setDifficultyTransitionLine('fade2');
                    }, 2000); // Longer pause before fade
                  }
                }, 30); // 30ms per character
                difficultyTransitionIntervalRef.current = interval2;
              };
              animateLine2();
            }, 500); // Fade duration
          }, 2000); // Longer pause before fade (was 800)
        }
      }, 30); // 30ms per character
      difficultyTransitionIntervalRef.current = interval;
    };

    // Add 2-second delay before starting the animation
    difficultyTransitionTimeoutRef.current = setTimeout(() => {
      animateLine1();
      difficultyTransitionTimeoutRef.current = null;
    }, 2000);

    return () => {
      if (difficultyTransitionIntervalRef.current) {
        clearInterval(difficultyTransitionIntervalRef.current);
        difficultyTransitionIntervalRef.current = null;
      }
      if (difficultyTransitionTimeoutRef.current) {
        clearTimeout(difficultyTransitionTimeoutRef.current);
        difficultyTransitionTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDifficultyTransition]); // Only depend on showDifficultyTransition

  // Helper function to check and update objectives
  const checkObjectives = useCallback(
    (options?: { allowCompletion?: boolean }) => {
    if (!currentLevelConfig?.optionalObjectives || currentLevelConfig.optionalObjectives.length === 0 || activeObjectiveIds.length === 0) {
      return;
    }
    
    // Filter to only active objectives
    const activeObjectives = currentLevelConfig.optionalObjectives.filter(
      obj => activeObjectiveIds.includes(obj.id)
    );

    // Build tracking data from current game state
    const tracking: ObjectiveTracking = {
      turnNumber: moveHistory.length,
      whiteTurnCount: moveHistory.reduce(
        (count, record) => (record.color === W ? count + 1 : count),
        0
      ),
      playerPiecesLost,
      enemyPiecesKilled: killedEnemyPieces,
      pieceConversions: 0, // Will be tracked via combat logic (staff conversions)
      courtiersDestroyed: destroyedCourtiers,
      itemsUsed: new Set(), // Will need to track this separately
      kingPosition: null,
      kingDisguiseActive: false,
      victoryDelivererType: lastVictoryInfo?.pieceType,
      victoryDelivererOriginalType: lastVictoryInfo?.originalType,
      victoryCondition: lastVictoryInfo?.condition,
      difficulty: campaign.difficulty,
    };

    // Find white king position (handles disguised kings via originalType)
    outer: for (let y = 0; y < Bstate.length; y++) {
      for (let x = 0; x < Bstate[y].length; x++) {
        const piece = Bstate[y][x];
        if (!piece || piece.color !== "w") continue;
        const isKing = isKingPiece(piece);
        if (isKing) {
          tracking.kingPosition = { x, y };
          tracking.kingDisguiseActive = piece.equip === "disguise";
          break outer;
        }
      }
    }

    // Check objectives and get newly completed/failed ones
    const { newlyCompleted, newlyFailed } = checkAllObjectives(
      activeObjectives,
      objectiveStates,
      tracking,
      Bstate,
      options
    );

    // If any objectives were newly completed, show notification and play sound
    if (newlyCompleted.length > 0) {
      setNewlyCompletedObjectives(prev => [...prev, ...newlyCompleted]);
      // Play success sound
      if (!muted) {
        sfx.purchase(); // Reuse purchase sound for now
      }
      // Force update objective states
      setObjectiveStates([...objectiveStates]);
    }
    
    // If any objectives were newly failed, show notification and play sound
    if (newlyFailed.length > 0) {
      setNewlyFailedObjectives(prev => [...prev, ...newlyFailed]);
      // Play failure sound
      if (!muted) {
        sfx.combatLose(); // Reuse combat lose sound for failures
      }
      // Force update objective states
      setObjectiveStates([...objectiveStates]);
    }
  },
  [currentLevelConfig, activeObjectiveIds, objectiveStates, killedEnemyPieces, destroyedCourtiers, playerPiecesLost, campaign.difficulty, Bstate, moveHistory, muted, lastVictoryInfo]
  );

  // Check objectives whenever a turn completes (after board state settles)
  useEffect(() => {
    if (phase === "playing" && !win) {
      // Small delay to let board state settle after animations
      const timer = setTimeout(() => {
        checkObjectives();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [turn, checkObjectives, phase, win]);

  function init(
    s: string,
    currentLevel: number,
    currentUnspentGold: number,
    levelConfig: LevelConfig,
    options?: { preserveStoryState?: boolean }
  ) {
    const preserveStoryState = options?.preserveStoryState ?? false;
    const r = rngFrom(s + currentLevel); // Use level in seed for variation
    rngRef.current = r;

    // Get level configuration first to get board size
    const boardSize = levelConfig.boardSize;

    const B0 = Array.from({ length: boardSize }, () =>
      Array(boardSize).fill(null)
    ) as Board;
    const T0 = emptyTerrain(boardSize);
    const O0 = emptyObstacles(boardSize);
    const pendingObjectiveFlags: string[] =
      ((campaign as any).pendingObjectiveFlags as string[] | undefined) ?? [];
    const objectiveFlagSet = new Set(pendingObjectiveFlags);

    // Check if king_escaped is enabled - if so, skip terrain on escape row (top row)
    const victoryConditions = levelConfig.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
    const kingEscapedEnabled = victoryConditions.includes("king_escaped");
    const escapeRow = kingEscapedEnabled ? boardSize - 1 : undefined;

    placeFeatures(B0, T0, O0, r, boardSize, levelConfig.terrainMatrix, escapeRow, levelConfig.randomTerrainPool);

    // Use level configuration - separate gold pools if specified
    // If specific gold pools aren't set, fall back to legacy enemyArmyGold/playerArmyGold, or default to 0
    let enemyPieceGold = levelConfig.enemyPieceGold ?? levelConfig.enemyArmyGold ?? 0;
    let playerPieceGold = levelConfig.playerPieceGold ?? levelConfig.playerArmyGold ?? 0;
    let enemyEquipmentGold = levelConfig.enemyEquipmentGold ?? levelConfig.enemyArmyGold ?? 0;
    let playerEquipmentGold = levelConfig.playerEquipmentGold ?? levelConfig.playerArmyGold ?? 0;

    // Apply difficulty-specific gold overrides if difficulty is set and settings exist
    // IMPORTANT: Only use campaign.difficulty (set by difficulty selection card), NOT localStorage
    // This ensures difficulty is only applied after the player explicitly chooses it
    // For level 1, always require explicit selection (don't use localStorage fallback)
    const currentDifficulty = campaign.difficulty;
    
    // Debug logging (can be removed later)
    // Difficulty debug removed
    // Difficulty debug removed
    
    if (currentDifficulty && levelConfig.difficultySettings?.[currentDifficulty]) {
      const diffSettings = levelConfig.difficultySettings[currentDifficulty]!;
      if (diffSettings.enemyPieceGold !== undefined) enemyPieceGold = diffSettings.enemyPieceGold;
      if (diffSettings.playerPieceGold !== undefined) playerPieceGold = diffSettings.playerPieceGold;
      if (diffSettings.enemyEquipmentGold !== undefined) enemyEquipmentGold = diffSettings.enemyEquipmentGold;
      if (diffSettings.playerEquipmentGold !== undefined) playerEquipmentGold = diffSettings.playerEquipmentGold;
      
      // Difficulty debug removed
    } else {
      // Difficulty debug removed
    }

    // Campaign logic: handle white army based on level and survivors
    if (campaign.level <= 1 || campaign.whiteRoster.length === 0) {
      // Level 1 or no survivors: generate fresh white army (use playerPieceGold from config)
      // Convert string array to object array if needed for backward compatibility
      const rawGuaranteedWhite = levelConfig.guaranteedPieces?.white || [];
      const guaranteedWhitePieces = rawGuaranteedWhite.map(item => 
        typeof item === 'string' ? { type: item as PieceType } : item
      );
      const w = build(
        W,
        r,
        playerPieceGold,
        true,
        levelConfig.availableItems.whiteRandomization,
        boardSize,
        levelConfig.namedWhitePieces,
        levelConfig.whiteKingName,
        B0, // Pass board to count available slots
        0, // White back rank
        1, // White front rank
        false, // Don't skip King for white
        [], // No guaranteed items for white
        levelConfig.randomizationPieces?.white, // Allowed piece types for white randomization
        guaranteedWhitePieces, // Guaranteed pieces for white
        playerEquipmentGold, // Equipment gold for white
        O0, // Obstacles grid to check blocked slots
        levelConfig.playerPawnBudget // Pawn budget percentage for white
      );
      // Place white pieces, avoiding obstacles
      placePiecesAvoidingObstacles(B0, O0, w.back, 0, boardSize);
      placePiecesAvoidingObstacles(B0, O0, w.front, 1, boardSize);
      // After placing, update campaign.whiteRoster with all current white pieces
      const allWhitePieces: Piece[] = [];
      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          const piece = B0[y][x];
          if (piece && piece.color === W) {
            allWhitePieces.push(piece);
          }
        }
      }
      setCampaign((prev) => ({ ...prev, whiteRoster: allWhitePieces }));
    } else {
      // Level 2+: Hybrid approach - place survivors, then add guaranteed pieces, then random pieces
      
      // Step 1: Place carried over survivors first
      const deserializedRoster = campaign.whiteRoster.map(deserializePiece);
      placeRoster(B0, O0, deserializedRoster, boardSize);
      
      // Step 1.5: Update speech lines and properties of existing roster pieces from namedWhitePieces
      // This allows level designers to add new speech lines without creating duplicate pieces
      if (levelConfig.namedWhitePieces && levelConfig.namedWhitePieces.length > 0) {
        for (const namedPiece of levelConfig.namedWhitePieces) {
          // Find matching piece on the board (by name and type)
          let foundMatch = false;
          for (let y = 0; y < boardSize && !foundMatch; y++) {
            for (let x = 0; x < boardSize && !foundMatch; x++) {
              const boardPiece = B0[y][x];
              if (
                boardPiece &&
                boardPiece.color === W &&
                boardPiece.name === namedPiece.name &&
                (boardPiece.type === namedPiece.type ||
                  boardPiece.originalType === namedPiece.type)
              ) {
                // Found a match - update its properties
                if (namedPiece.speechLines) {
                  boardPiece.speechLines = namedPiece.speechLines;
                }
                if (namedPiece.equip && !boardPiece.equip) {
                  // Only add equipment if the piece doesn't already have any
                  boardPiece.equip = namedPiece.equip;
                }
                foundMatch = true;
              }
            }
          }
        }
      }
      
      // Step 1.6: Apply pending equipment assignments from story events
      const pendingEquipmentAssignments = (campaign as any).pendingEquipmentAssignments || [];
      if (pendingEquipmentAssignments.length > 0) {
        for (const assignment of pendingEquipmentAssignments) {
          // Find the target piece on the board
          for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
              const boardPiece = B0[y][x];
              if (boardPiece && 
                  boardPiece.color === W && 
                  boardPiece.type === assignment.pieceType && 
                  boardPiece.name === assignment.pieceName) {
                // Found the target piece - equip the item
                if (assignment.equip === "disguise") {
                  if (boardPiece.type !== "P") {
                    boardPiece.originalType = boardPiece.type;
                    boardPiece.type = "P";
                  }
                  boardPiece.equip = assignment.equip;
                } else {
                  boardPiece.equip = assignment.equip;
                }
              }
            }
          }
        }
      }
      
      // Step 1.7: Spawn pieces at specific positions from story events
      const pendingPieceSpawns = (campaign as any).pendingPieceSpawns || [];
      if (pendingPieceSpawns.length > 0) {
        for (const spawn of pendingPieceSpawns) {
          // Create the piece and place it at the specified position
          if (spawn.y >= 0 && spawn.y < boardSize && spawn.x >= 0 && spawn.x < boardSize) {
            const color = spawn.color === "w" ? W : B;
            const newPiece: Piece = {
              id: `${spawn.color}${spawn.pieceType}-${Math.random().toString(36).slice(2, 8)}`,
              type: spawn.pieceType,
              color: color,
              equip: spawn.equip,
            };
            B0[spawn.y][spawn.x] = newPiece;
          }
        }
      }
      
      // Step 2: Filter out namedWhitePieces that already exist in roster (to avoid duplicates)
      const namedPiecesToAdd =
        levelConfig.namedWhitePieces?.filter((namedPiece) => {
          // Check if this named piece already exists on the board
          for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
              const boardPiece = B0[y][x];
              if (
                boardPiece &&
                boardPiece.color === W &&
                boardPiece.name === namedPiece.name &&
                (boardPiece.type === namedPiece.type ||
                  boardPiece.originalType === namedPiece.type)
              ) {
                return false; // Already exists, don't add
              }
            }
          }
          return true; // Doesn't exist, add it
        }) || [];
      
      // Step 3: Add guaranteed pieces from level config (if any)
      // Get guaranteed pieces - check difficulty-specific override first, then fall back to base config
      let rawGuaranteedWhite = levelConfig.guaranteedPieces?.white || [];
      if (currentDifficulty && levelConfig.difficultySettings?.[currentDifficulty]?.guaranteedPieces?.white) {
        // Use difficulty-specific guaranteed pieces if available
        const diffSettings = levelConfig.difficultySettings[currentDifficulty];
        if (diffSettings?.guaranteedPieces?.white) {
          rawGuaranteedWhite = diffSettings.guaranteedPieces.white;
        }
      }
      const guaranteedWhitePieces = rawGuaranteedWhite.map(item => 
        typeof item === 'string' ? { type: item as PieceType } : item
      );
      
      if (guaranteedWhitePieces.length > 0 || playerPieceGold > 0 || namedPiecesToAdd.length > 0) {
        // Generate guaranteed pieces and random pieces with remaining budget
        const w = build(
          W,
          r,
          playerPieceGold, // Use full playerPieceGold for random generation
          true,
          levelConfig.availableItems.whiteRandomization,
          boardSize,
          namedPiecesToAdd, // Only add named pieces that don't already exist
          undefined, // No custom king name (King already exists from survivors)
          B0, // Pass board to count available slots
          0, // White back rank
          1, // White front rank
          true, // Skip King generation (King already exists from survivors)
          [], // No guaranteed items for white
          levelConfig.randomizationPieces?.white, // Allowed piece types for white randomization
          guaranteedWhitePieces, // Guaranteed pieces to add
          playerEquipmentGold, // Equipment gold for white
          O0, // Obstacles grid to check blocked slots
          levelConfig.playerPawnBudget // Pawn budget percentage for white
        );
        
        // Place the new pieces (back rank and front rank)
        placePiecesAvoidingObstacles(B0, O0, w.back, 0, boardSize);
        placePiecesAvoidingObstacles(B0, O0, w.front, 1, boardSize);
      }
      
      // Update campaign roster with all current white pieces (survivors + new pieces)
      const allWhitePieces: Piece[] = [];
      for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
          const piece = B0[y][x];
          if (piece && piece.color === W) {
            allWhitePieces.push(piece);
          }
        }
      }
      setCampaign((prev) => ({ ...prev, whiteRoster: allWhitePieces }));
    }

    // Black army: always generate fresh each level
    // Check if king_escaped is the ONLY victory condition
    const kingEscapedOnly = victoryConditions.length === 1 && victoryConditions[0] === "king_escaped";
    
    // Check for pending items to add to black item pool (from story events)
    const pendingAssignments = (campaign as any).pendingEnemyItemAssignments || [];
    let blackItemPool = [...(levelConfig.availableItems.blackRandomization || [])];
    
    // Extract guaranteed items that MUST be equipped
    const guaranteedItems: Exclude<Equip, undefined>[] = [];
    for (const assignment of pendingAssignments) {
      for (let i = 0; i < assignment.count; i++) {
        guaranteedItems.push(assignment.item);
      }
    }
    
    // Difficulty debug removed
    // Difficulty debug removed
    // Difficulty debug removed
    
    // Check for pending pawns (from story events) - add them to guaranteed pieces
    const pendingPawns = (campaign as any).pendingEnemyPawns || 0;
    // Difficulty debug removed
    
    // Get guaranteed pieces - check difficulty-specific override first, then fall back to base config
    let rawGuaranteedBlack = levelConfig.guaranteedPieces?.black || [];
    if (currentDifficulty && levelConfig.difficultySettings?.[currentDifficulty]?.guaranteedPieces?.black) {
      // Use difficulty-specific guaranteed pieces if available
      const diffSettings = levelConfig.difficultySettings[currentDifficulty];
      if (diffSettings?.guaranteedPieces?.black) {
        rawGuaranteedBlack = diffSettings.guaranteedPieces.black;
        // Difficulty debug removed
      }
    }
    
    // Convert string array to object array if needed for backward compatibility
    const guaranteedBlackPieces = rawGuaranteedBlack.map(item => 
      typeof item === 'string' ? { type: item as PieceType } : item
    );
    
    // Add pending pawns from story events as guaranteed pieces
    for (let i = 0; i < pendingPawns; i++) {
      guaranteedBlackPieces.push({ type: "P" });
    }
    
    // Difficulty debug removed
    
    // console.log("[Difficulty Debug] Calling build with:", {
    //   enemyPieceGold,
    //   enemyEquipmentGold,
    //   guaranteedItemsCount: guaranteedItems.length,
    //   guaranteedPiecesCount: guaranteedBlackPieces.length,
    //   randomizationPieces: levelConfig.randomizationPieces?.black
    // });
    
    const bl = build(
      B,
      r,
      enemyPieceGold,
      false,
      blackItemPool, // Regular randomization pool
      boardSize,
      levelConfig.namedBlackPieces,
      undefined, // No custom king name for black (optional for future)
      B0, // Pass board to count available slots
      boardSize - 1, // Black back rank
      boardSize - 2, // Black front rank
      kingEscapedOnly, // Pass flag to skip black King
      guaranteedItems, // Guaranteed items that MUST be equipped
      levelConfig.randomizationPieces?.black, // Allowed piece types for black randomization
      guaranteedBlackPieces, // Guaranteed pieces for black (including pending pawns)
      enemyEquipmentGold, // Equipment gold for black
      O0, // Obstacles grid to check blocked slots
      levelConfig.enemyPawnBudget // Pawn budget percentage for black
    );
    
    // Difficulty debug removed
    // Difficulty debug removed
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const totalEquipped = [...bl.back, ...bl.front].filter(p => p && p.equip).length;
    // Difficulty debug removed
    
    // Place black pieces, avoiding obstacles
    placePiecesAvoidingObstacles(B0, O0, bl.back, boardSize - 1, boardSize);
    placePiecesAvoidingObstacles(B0, O0, bl.front, boardSize - 2, boardSize);

    // Clear pending events after processing
    setCampaign((prev) => {
      const newCampaign = { ...prev };
      delete (newCampaign as any).pendingEnemyPawns;
      delete (newCampaign as any).pendingEnemyItemAssignments;
      delete (newCampaign as any).pendingEquipmentAssignments;
      delete (newCampaign as any).pendingPieceSpawns;
      delete (newCampaign as any).pendingObjectiveFlags;
      delete (newCampaign as any).pendingDifficultyReinit;
      return newCampaign;
    });
    
    setB(B0);
    setT(T0);
    setObstacles(O0);
    setTurn(W);
    setSel(null);
    setLegal([]);
    setWin(null);
    setPhrase(null);
    setFx(null);

    // Don't show story cards yet - wait for intro popup to be dismissed
    // Story cards will be shown after intro via handleIntroComplete
    if (!preserveStoryState) {
      setCurrentStoryCard(null);
      const storyCards = levelConfig.storyCards || [];
      setStoryCardQueue(storyCards);
      // Preload all story card images (in case they weren't preloaded earlier)
      if (storyCards.length > 0) {
        preloadStoryCardImages(storyCards).catch((err) => {
          console.warn("Failed to preload some story card images:", err);
        });
      }
    }
    // Default phase: market or playing (skip market if disabled)
    const marketEnabled = levelConfig.marketEnabled !== false;
    setPhase(marketEnabled ? "market" : "playing");
    setMarketViewVisible(marketEnabled); // Start with market visible by default only if enabled

    // Set starting gold with carry-over (level-specific starting gold + unspent gold from previous level)
    setMarketPoints(levelConfig.startingGold + currentUnspentGold);
    setMarketAction(null);
    // Prayer dice are now managed by campaign state - don't reset them here
    setPrayerDice(campaign.prayerDice); // Set prayer dice from campaign state
    setRerollState(null);
    setDisguisePopupState(null);
    setDestroyedPieceIds([]);
    setFailedAttackId(null);
    setLastMove(null);
    setMoveHistory([]);
    setThisLevelUnlockedItems([]); // Reset unlocked items for new level
    setKilledEnemyPieces([]); // Reset killed enemies for new level
    setPlayerPiecesLost([]);
    setDestroyedCourtiers(0); // Reset Courtiers counter for new level
    setShowVictoryDetails(false); // Reset victory details for new level
    setLastVictoryInfo(null);
    
    // Initialize optional objectives for this level
    if (levelConfig.optionalObjectives && levelConfig.optionalObjectives.length > 0) {
      const eligibleObjectives = levelConfig.optionalObjectives.filter((objective) => {
        if (objective.requiredFlags && objective.requiredFlags.length > 0) {
          return objective.requiredFlags.every((flag) => objectiveFlagSet.has(flag));
        }
        return true;
      });

      if (eligibleObjectives.length > 0) {
        // Randomly select 1 or 2 objectives from the eligible pool
        const desiredCount = r() < 0.5 ? 1 : 2; // 50% chance for 1 or 2 objectives
        const numToSelect = Math.min(desiredCount, eligibleObjectives.length);
        const shuffled = [...eligibleObjectives].sort(() => r() - 0.5);
        const selectedObjectives = shuffled.slice(0, numToSelect);
        const selectedIds = selectedObjectives.map((obj) => obj.id);

        setActiveObjectiveIds(selectedIds);

        const initialStates = selectedObjectives.map((obj) => ({
          objectiveId: obj.id,
          isCompleted: false,
          isFailed: false,
          progress: obj.progress ? { ...obj.progress } : undefined,
          completedOnTurn: undefined,
          failedOnTurn: undefined,
        }));
        setObjectiveStates(initialStates);
      } else {
        setActiveObjectiveIds([]);
        setObjectiveStates([]);
      }
    } else {
      setActiveObjectiveIds([]);
      setObjectiveStates([]);
    }
    setNewlyCompletedObjectives([]);
    setNewlyFailedObjectives([]);
    setPlayerPiecesLost([]);
  }

  function click(x: number, y: number) {
    if (drag) return;
    if (phase === "market") {
      const B1 = cloneB(Bstate);
      let actionCompleted = false;

      if (marketAction?.type === "piece") {
        if (y <= 1 && !B1[y]?.[x] && obstacles[y]?.[x] === "none") {
          // Safe navigation
          // Valid placement (no piece and no obstacle)
          sfx.deploy();
          const newPieceId = `${W}${marketAction.name}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;
          B1[y][x] = {
            id: newPieceId,
            type: marketAction.name as PieceType,
            color: W,
          };
          setB(B1);
          
          // Deduct gold or consume free unit
          if (marketAction.isFree) {
            // Consume the free unit
            setCampaign((prev) => {
              const newFreeUnits = new Map(prev.freeUnits);
              const currentCount = newFreeUnits.get(marketAction.name as PieceType) || 0;
              if (currentCount > 1) {
                newFreeUnits.set(marketAction.name as PieceType, currentCount - 1);
              } else {
                newFreeUnits.delete(marketAction.name as PieceType);
              }
              return { ...prev, freeUnits: newFreeUnits };
            });
          } else {
            setMarketPoints(
              prev => prev - (VAL[marketAction.name as keyof typeof VAL] || 10)
            );
          }
          
          actionCompleted = true;
          setNamingState({ id: newPieceId, x, y });
          setMarketAction(null); // Clear action to prevent multiple placements
        }
      } else if (marketAction?.type === "item") {
        const piece = B1[y]?.[x]; // Safe navigation
        // Check if the piece exists, is white, doesn't have an equip, and is NOT a King trying to get Disguise
        if (
          piece &&
          piece.color === W &&
          !piece.equip &&
          !(piece.type === "K" && marketAction.name === "disguise")
        ) {
          sfx.equip();
          if (
            marketAction.name === "disguise" &&
            piece.type !== "P" // Already checked King above
          ) {
            piece.originalType = piece.type;
            piece.type = "P";
            piece.equip = marketAction.name;
          } else {
            // Handle non-disguise items or disguise for pawns
            piece.equip = marketAction.name;
          }
          setB(B1);
          
          // Deduct gold or consume free item
          if (marketAction.isFree) {
            // Consume the free item
            setCampaign((prev) => {
              const newFreeItems = new Map(prev.freeItems);
              const currentCount = newFreeItems.get(marketAction.name) || 0;
              if (currentCount > 1) {
                newFreeItems.set(marketAction.name, currentCount - 1);
              } else {
                newFreeItems.delete(marketAction.name);
              }
              return { ...prev, freeItems: newFreeItems };
            });
          } else {
            setMarketPoints(prev => prev - ITEM_COSTS[marketAction.name]);
          }
          
          actionCompleted = true;
        }
      }

      if (actionCompleted) {
        setMarketAction(null);
      } else if (marketAction) {
        // If an action was selected but the click was invalid, cancel the action.
        setMarketAction(null);
      } else {
        // No market action - handle piece selection and movement/swapping
        const clickedPiece = B1[y]?.[x];
        
        if (sel) {
          // A piece is already selected
          const selectedPiece = B1[sel.y]?.[sel.x];
          
          if (!selectedPiece) {
            // Selected piece no longer exists, clear selection
            setSel(null);
            return;
          }
          
          // Check if clicking on another white piece (swap) or empty square (move)
          if (clickedPiece && clickedPiece.color === W) {
            // Swap the two white pieces
            if (y <= 1 && sel.y <= 1) {
              sfx.move();
              B1[sel.y][sel.x] = clickedPiece;
              B1[y][x] = selectedPiece;
              setB(B1);
              setSel(null);
            } else {
              // Can't swap - one piece is outside deployment zone
              setSel(null);
            }
          } else if (!clickedPiece && y <= 1 && obstacles[y]?.[x] === "none") {
            // Move piece to empty square in deployment zone
            if (sel.y <= 1) {
              sfx.move();
              B1[y][x] = selectedPiece;
              B1[sel.y][sel.x] = null;
              setB(B1);
              setSel(null);
            } else {
              // Can't move - selected piece is outside deployment zone
              setSel(null);
            }
          } else {
            // Invalid move, clear selection
            setSel(null);
          }
        } else {
          // No piece selected - try to select a white piece in deployment zone
          if (clickedPiece && clickedPiece.color === W && y <= 1) {
            setSel({ x, y });
          }
        }
      }
      return;
    }

    if (
      fx ||
      win ||
      phase === "awaiting_reroll" ||
      phase === "awaiting_disguise_choice"
    )
      return;
    const p = Bstate[y]?.[x]; // Safe navigation
    if (sel && legal.some((s) => s.x === x && s.y === y)) {
      perform(sel, { x, y }, false);
      setSel(null);
      setLegal([]);
      return;
    }
    if (
      !p ||
      p.color !== turn ||
      p.color !== W ||
      (p.stunnedForTurns && p.stunnedForTurns > 0)
    ) {
      setSel(null);
      setLegal([]);
      return;
    }

    if (p.equip === "disguise") {
      setPhase("awaiting_disguise_choice");
      setDisguisePopupState({ x, y });
      return;
    }

    setSel({ x, y });
    setLegal(moves(Bstate, Tstate, obstacles, x, y, currentBoardSize));
  }

  const handleNameConfirm = (name: string) => {
    if (!namingState) return;
    const { id } = namingState;

    setB((currentBoard) => {
      const newBoard = cloneB(currentBoard);
      const pieceLocation = findPieceById(newBoard, id, currentBoardSize);
      if (pieceLocation) {
        const piece = newBoard[pieceLocation.y]?.[pieceLocation.x]; // Safe navigation
        if (piece) {
          piece.name = name;
        }
      }
      return newBoard;
    });
    setNamingState(null);
  };

  const handleNameCancel = () => {
    setNamingState(null);
  };

  function perform(
    from: { x: number; y: number },
    to: { x: number; y: number },
    isBot: boolean,
    isDragMove = false
  ) {
    console.log("=== PERFORM CALLED ===");
    console.log("[PERFORM] Move requested:", { from, to, isBot, currentBoardSize });
    console.log("[PERFORM] Current turn:", turn);
    console.log("[PERFORM] Win state:", win);
    console.log("[PERFORM] Phase:", phase);
    
    // Count pieces on board
    let whiteCount = 0, blackCount = 0;
    for (let y = 0; y < currentBoardSize; y++) {
      for (let x = 0; x < currentBoardSize; x++) {
        const piece = Bstate[y]?.[x];
        if (piece) {
          if (piece.color === W) whiteCount++;
          else if (piece.color === B) blackCount++;
        }
      }
    }
    console.log("[PERFORM] Pieces on board - White:", whiteCount, "Black:", blackCount);
    
    setDrag(null);
    if (fx || win || moveAnim) return;
    // Block new actions while tutorial is showing (but allow bot moves to complete)
    // Use ref instead of state to avoid race conditions when re-triggering moves
    if (!isBot && pausedForTutorialRef.current) {
      console.log("⛔ Move blocked: tutorial is showing");
      return;
    }
    const p = Bstate[from.y]?.[from.x]; // Safe navigation
    console.log("[PERFORM] Piece at from:", p);
    if (!p) return;
    const t = Bstate[to.y]?.[to.x]; // Safe navigation

    const currentCombatId = ++combatIdRef.current;
    const nextTurn = isBot ? W : B;

    const turnNumber = Math.floor(moveHistory.length / 2) + 1;

    // Crystal Ball Swap with piece
    if (p.equip === "crystal_ball" && t && t.color === p.color) {
      sfx.crystalBall();
      const B1 = cloneB(Bstate);
      const userPiece = { ...p, equip: undefined };
      const targetPiece = { ...t };
      B1[to.y][to.x] = userPiece;
      B1[from.y][from.x] = targetPiece;

      // Check for exhaustion
      checkExhaustion(p.id, from, to, B1);

      // Pawn promotion check for crystal ball swaps
      // White promotes at top (boardSize-1), Black promotes at bottom (0)
      if (userPiece.type === "P") {
        const shouldPromote = 
          (userPiece.color === W && to.y === currentBoardSize - 1) ||
          (userPiece.color === B && to.y === 0);
        console.log("[SWAP-PROMOTION-CHECK]", { piece: "user", color: userPiece.color, toY: to.y, boardSize: currentBoardSize, shouldPromote, config: currentLevelConfig?.pawnPromotionType });
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED-SWAP]", { color: userPiece.color === W ? "white" : "black", to: promotionType });
          B1[to.y][to.x] = { ...userPiece, type: promotionType };
        }
      }
      if (targetPiece.type === "P") {
        const shouldPromote = 
          (targetPiece.color === W && from.y === currentBoardSize - 1) ||
          (targetPiece.color === B && from.y === 0);
        console.log("[SWAP-PROMOTION-CHECK]", { piece: "target", color: targetPiece.color, fromY: from.y, boardSize: currentBoardSize, shouldPromote, config: currentLevelConfig?.pawnPromotionType });
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED-SWAP]", { color: targetPiece.color === W ? "white" : "black", to: promotionType });
          B1[from.y][from.x] = { ...targetPiece, type: promotionType };
        }
      }

      setB(B1);
      setLastMove({ from, to });
      decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
      setTurn(nextTurn);
      setPhase("playing");
      
      const notation = getChessNotation(from, to, p, false);
      setMoveHistory((hist) => [
        ...hist,
        {
          turnNumber,
          color: p.color as Color,
          notation: `${notation} (swap)`,
          piece: { type: p.type, color: p.color as Color },
          inFog: !vis[to.y]?.[to.x], // Safe navigation
        },
      ]);
      return;
    }

    // Crystal Ball Swap with Courtier
    const targetObstacle = obstacles[to.y]?.[to.x];
    if (p.equip === "crystal_ball" && targetObstacle === "courtier" && !t) {
      sfx.crystalBall();
      const B1 = cloneB(Bstate);
      const userPiece = { ...p, equip: undefined };
      B1[to.y][to.x] = userPiece;
      B1[from.y][from.x] = null;

      // Swap the Courtier to the piece's original position
      const O1 = obstacles.map((row) => [...row]); // Clone obstacles
      O1[to.y][to.x] = "none"; // Remove Courtier from target
      O1[from.y][from.x] = "courtier"; // Place Courtier at original position

      // Check for exhaustion
      checkExhaustion(p.id, from, to, B1);

      // Pawn promotion check for crystal ball swaps with Courtiers
      if (userPiece.type === "P") {
        const shouldPromote = 
          (userPiece.color === W && to.y === currentBoardSize - 1) ||
          (userPiece.color === B && to.y === 0);
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          B1[to.y][to.x] = { ...userPiece, type: promotionType };
        }
      }

      setB(B1);
      setObstacles(O1);
      setLastMove({ from, to });
      decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
      setTurn(nextTurn);
      setPhase("playing");
      
      const notation = getChessNotation(from, to, p, false);
      setMoveHistory((hist) => [
        ...hist,
        {
          turnNumber,
          color: p.color as Color,
          notation: `${notation} (swap with courtier)`,
          piece: { type: p.type, color: p.color as Color },
          inFog: !vis[to.y]?.[to.x], // Safe navigation
        },
      ]);
      return;
    }

    // Check for obstacle attack
    if (targetObstacle !== "none" && !t) {
      const dir = p.color === W ? 1 : -1;
      const lanceLungeUsed =
        p.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
      if (lanceLungeUsed) sfx.spear();

      const out = resolveObstacle(
        rngRef.current,
        p,
        Bstate,
        Tstate,
        obstacles,
        from,
        to,
        lanceLungeUsed,
        currentBoardSize
      );
      setFx({
        kind: "obstacle",
        from,
        to,
        a: out.a,
        ok: out.ok,
        id: currentCombatId,
        adv: out.adv,
        obstacleType: targetObstacle, // Store actual obstacle type
      });

      const notation = getChessNotation(from, to, p, true);
      const winPct = obstacleWinPercent(
        Bstate,
        Tstate,
        obstacles,
        p,
        from,
        to,
        currentBoardSize
      );
      const sup = supportCount(Bstate, Tstate, obstacles, p, from, to, currentBoardSize);
      const moveRec: MoveRecord = {
        turnNumber,
        color: p.color as Color,
        notation,
        piece: { type: p.type, color: p.color as Color },
        combat: {
          isSupported: sup > 0,
          winPercent: winPct,
          attackerRolls: out.a.rolls,
          defenderRolls: null, // Explicitly null for obstacle combat
          obstacleType: targetObstacle, // Store obstacle type for display
        },
        inFog: !vis[to.y]?.[to.x], // Safe navigation
      };
      setMoveHistory((hist) => [...hist, moveRec]);

      const delay =
        TMG.roll +
        TMG.linger +
        (out.a.mods?.length ? TMG.mods : 0) +
        TMG.total +
        TMG.winnerHold;

      setTimeout(() => {
        if (combatIdRef.current !== currentCombatId) return;

        if (!out.ok && p.color === W && prayerDice > 0) {
          // Check if prayer_dice tutorial should show - if so, show it BEFORE entering awaiting_reroll
          // This prevents the Roll Failed popup from flashing before the tutorial
          if (!campaign.tutorialsSeen.includes("prayer_dice") && !pausedForTutorial && enableTutorialPopups) {
            showTutorial("prayer_dice");
          }
          
          setPhase("awaiting_reroll");
          setRerollState({ from, to, kind: "obstacle", loserPos: from, obstacleType: targetObstacle });
          return;
        }

        if (!out.ok) {
          sfx.combatLose();
          setFailedAttackId(p.id);
          setTimeout(() => setFailedAttackId(null), 400);
        }
        finishRockCombat(out.ok, lanceLungeUsed, from, to);
      }, delay);
      return;
    }

    // Piece vs piece
    if (t) {
      // Check for tutorials BEFORE executing combat
      let tutorialShown = false;
      
      // Check if this is the first rigged combat in level 1 (tutorial combat)
      const tutorialUsed = localStorage.getItem("dicechess_first_combat_tutorial_used") === "true";
      const isFirstCombatTutorial = 
        !tutorialUsed && 
        campaign.level === 1 && 
        (p.color === W || t.color === W); // White is either attacking or defending
      
      // Check if white is involved in this combat (either attacking or defending)
      const whiteInvolved = p.color === W || t.color === W;
      
      // Show tutorials if:
      // 1. It's a player move (white attacking), OR
      // 2. It's the first combat tutorial (rigged combat in level 1), OR
      // 3. White is defending and single_combat tutorial hasn't been seen yet
      const shouldShowTutorials = 
        (!isBot || isFirstCombatTutorial || (whiteInvolved && !campaign.tutorialsSeen.includes("single_combat"))) &&
        !pausedForTutorial && 
        t.color !== p.color;
      
      if (shouldShowTutorials) {
        // Tutorial: Single Combat (first combat involving white - either attacking or defending)
        // Show on the first rigged combat OR first combat where white is involved
        if (!campaign.tutorialsSeen.includes("single_combat")) {
          tutorialShown = showTutorial("single_combat", to) || tutorialShown;
        }
        
        // Tutorial: King Advantage (first King attack - only when white is attacking)
        if (p.type === "K" && p.color === W) {
          tutorialShown = showTutorial("king_advantage", to) || tutorialShown;
        }

        // Tutorial: Supporting Units (first supported attack - only when white is attacking)
        if (p.color === W) {
          const sup = supportCount(Bstate, Tstate, obstacles, p, from, to, currentBoardSize);
          if (sup > 0) {
            tutorialShown = showTutorial("supporting_units", to) || tutorialShown;
          }
        }
      }
      
      // If a tutorial was shown, store this action to execute after tutorial closes
      if (tutorialShown) {
        console.log("📚 Tutorial shown - storing move to re-trigger after tutorial closes:", { from, to, isBot });
        pendingActionRef.current = { from, to, isBot, isDragMove };
        console.log("⏸️ Returning early from perform() - move will execute after tutorial closes");
        return;
      }

      const dir = p.color === W ? 1 : -1;
      const lanceLungeUsed =
        p.equip === "lance" && to.y === from.y + 2 * dir && to.x === from.x;
      
      if (lanceLungeUsed) sfx.spear();
      const out = resolve(
        rngRef.current,
        p,
        t,
        Bstate,
        Tstate,
        obstacles,
        from,
        to,
        currentBoardSize,
        lanceLungeUsed,
        campaign.level // Pass current level for tutorial mechanics
      );
      setFx({
        kind: "piece",
        from,
        to,
        a: out.a,
        d: out.d,
        win: out.win,
        id: currentCombatId,
        adv: out.adv,
      });

      const notation = getChessNotation(from, to, p, true);
      
      // FOG OF WAR FIX: Calculate win% as the player saw it (without hidden equipment)
      const defenderInFog = !vis[to.y]?.[to.x];
      let defenderForWinPct = t;
      if (defenderInFog && t.equip) {
        // Strip equipment if defender was in fog
        defenderForWinPct = { ...t, equip: undefined };
      }
      const winPct = winPercent(
        Bstate,
        Tstate,
        obstacles,
        p,
        defenderForWinPct,
        from,
        to,
        currentBoardSize
      );
      
      const sup = supportCount(Bstate, Tstate, obstacles, p, from, to, currentBoardSize);
      const moveRec: MoveRecord = {
        turnNumber,
        color: p.color as Color,
        notation,
        piece: { type: p.type, color: p.color as Color },
        combat: {
          isSupported: sup > 0,
          winPercent: winPct,
          attackerRolls: out.a.rolls, // Store initial rolls
          defenderRolls: out.d.rolls, // Store initial rolls
        },
        inFog: defenderInFog, // Safe navigation
      };
      // If tutorial is showing, defer move history update to prevent flickering
      if (pausedForTutorialRef.current) {
        pendingMoveHistoryRef.current = moveRec;
      } else {
        setMoveHistory((hist) => [...hist, moveRec]);
      }

      const delay =
        TMG.roll +
        TMG.linger +
        (out.a.mods?.length || out.d.mods?.length ? TMG.mods : 0) +
        TMG.total +
        TMG.winnerHold;

      const continueCombat = () => {
        if (combatIdRef.current !== currentCombatId) return;
        // Check if still paused - if so, wait and check again
        if (pausedForTutorialRef.current) {
          setTimeout(continueCombat, 100);
          return;
        }

        const playerLost =
          (p.color === W && !out.win) || (t.color === W && out.win);

        const forcedAttacker = !!out.a.forced;
        const forcedDefender = !!out.d.forced;
        const forcedForPlayer =
          (p.color === "w" && forcedAttacker) ||
          (t.color === "w" && forcedDefender);

        if (playerLost && prayerDice > 0 && !forcedForPlayer) {
          const loserPos = p.color === W ? from : to;
          
          // Check if prayer_dice tutorial should show - if so, show it BEFORE entering awaiting_reroll
          // This prevents the Roll Failed popup from flashing before the tutorial
          if (!campaign.tutorialsSeen.includes("prayer_dice") && !pausedForTutorial && enableTutorialPopups) {
            showTutorial("prayer_dice");
          }
          
          setPhase("awaiting_reroll");
          setRerollState({ from, to, kind: "piece", loserPos });
          return;
        }

        const loser = out.win ? t : p;
        const winner = out.win ? p : t;

        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches;

        const postAnimation = () => {
          if (loser?.id) {
            let idsToDestroy = [loser.id];
            if (loser.equip === "skull" && winner) {
              idsToDestroy.push(winner.id);
            }
            setDestroyedPieceIds(idsToDestroy);
          }
          if (!out.win) {
            setFailedAttackId(p.id);
            setTimeout(() => setFailedAttackId(null), 400);
          }
          setTimeout(() => {
            finishPieceCombat(out, lanceLungeUsed, from, to);
          }, 400);
        };

        if (out.win && !prefersReducedMotion) {
          setDestroyedPieceIds([t.id]);
          setTimeout(() => {
            const colorKey = p.color as "w" | "b";
            // Check if GL has the type before accessing colorKey
            const pieceGlyphSet = GL[p.type as keyof typeof GL];
            const glyph =
              pieceGlyphSet && colorKey in pieceGlyphSet
                ? pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet]
                : "?";

            setMoveAnim({
              id: p.id,
              from,
              to,
              glyph: glyph,
              color: colorKey,
              equip: p.equip,
            });
            setTimeout(() => {
              finishPieceCombat(out, lanceLungeUsed, from, to);
              setMoveAnim(null);
            }, PIECE_MOVE_MS);
          }, 150);
        } else {
          postAnimation();
        }
      };
      
      setTimeout(continueCombat, delay);
      return;
    }

    // Quiet move
    const notation = getChessNotation(from, to, p, false);
    const moveRec: MoveRecord = {
      turnNumber,
      color: p.color as Color,
      notation,
      piece: { type: p.type, color: p.color as Color },
      inFog: !vis[to.y]?.[to.x], // Safe navigation
    };
    setMoveHistory((hist) => [...hist, moveRec]);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const commitQuietMove = () => {
      sfx.move();
      const B1 = cloneB(Bstate);
      const moved: Piece = { ...p };
      B1[to.y][to.x] = moved;
      B1[from.y][from.x] = null;

      // Check for exhaustion after the move
      checkExhaustion(p.id, from, to, B1);

      // Pawn promotion check for normal moves
      // White promotes at top (boardSize-1), Black promotes at bottom (0)
      const pieceAtDestination = B1[to.y]?.[to.x];
      if (pieceAtDestination && pieceAtDestination.type === "P") {
        const isWhitePawn = pieceAtDestination.color === W;
        const isBlackPawn = pieceAtDestination.color === B;
        const atTopRow = to.y === currentBoardSize - 1;
        const atBottomRow = to.y === 0;
        const shouldPromote = 
          (isWhitePawn && atTopRow) ||
          (isBlackPawn && atBottomRow);
        
        if (isBlackPawn) {
          console.log("[BLACK-PAWN-CHECK]", {
            color: pieceAtDestination.color,
            toY: to.y,
            boardSize: currentBoardSize,
            atBottomRow,
            shouldPromote
          });
        }
        
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED]", { color: pieceAtDestination.color === W ? "white" : "black", to: promotionType });
          B1[to.y][to.x] = { ...pieceAtDestination, type: promotionType };
        }
      }

      // Check for King Crossing victory condition
      const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
      if (victoryConditions.includes("king_escaped") && isKingPiece(moved) && moved.color === W && to.y === currentBoardSize - 1) {
        sfx.winCheckmate();
        setB(B1);
        setWin(W);
        handleLevelCompletion(W, B1, { deliverer: moved, condition: "king_escaped" });
        setPhrase("King Crossing!");
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMoveEntry = newHistory[newHistory.length - 1];
          if (lastMoveEntry) lastMoveEntry.notation += " (Escaped!)";
          return newHistory;
        });
        setPhase("playing");
        return;
      }

      setB(B1);
      setLastMove({ from, to });
      decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
      setTurn(nextTurn);
      setPhase("playing");
    };

    const moveIsInFog = !(vis[from.y]?.[from.x] || vis[to.y]?.[to.x]); // Safe navigation

    if (prefersReducedMotion || isDragMove || moveIsInFog) {
      commitQuietMove();
    } else {
      const colorKey = p.color as "w" | "b";
      // Check if GL has the type before accessing colorKey
      const pieceGlyphSet = GL[p.type as keyof typeof GL];
      const glyph =
        pieceGlyphSet && colorKey in pieceGlyphSet
          ? pieceGlyphSet[colorKey as keyof typeof pieceGlyphSet]
          : "?";

      setMoveAnim({
        id: p.id,
        from,
        to,
        glyph: glyph,
        color: colorKey,
        equip: p.equip,
      });

      setTimeout(() => {
        commitQuietMove();
        setMoveAnim(null);
      }, PIECE_MOVE_MS);
    }
  }

  function finishRockCombat(
    isSuccess: boolean,
    lanceLungeUsed: boolean,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    if (isSuccess) sfx.rockDestroy();
    const B1 = cloneB(Bstate);
    const O1 = obstacles.map(row => [...row]); // Clone obstacles
    const mv = B1[from.y]?.[from.x]; // Safe navigation
    if (!mv) {
      setFx(null);
      setPhase("playing");
      return;
    }

    const attackerState = lanceLungeUsed
      ? { ...mv, equip: undefined }
      : { ...mv };

    if (isSuccess) {
      // Check if we're destroying the Bell of Names
      const wasBellDestroyed = O1[to.y][to.x] === "bell";
      
      // Track Courtiers destroyed by player
      const destroyedType = O1[to.y][to.x];
      if (destroyedType === "courtier" && mv.color === W) {
        setDestroyedCourtiers((prev) => prev + 1);
      }
      
      B1[to.y][to.x] = attackerState;
      B1[from.y][from.x] = null;
      O1[to.y][to.x] = "none"; // Remove the obstacle
      setObstacles(O1); // Update obstacles state
      setLastMove({ from, to }); // Set last move only on success
      
      // Special message when the bell is destroyed
      if (wasBellDestroyed) {
        setSpeechBubble({ 
          text: "**The bell shatters! Morcant is now vulnerable!**", 
          id: Date.now(), 
          targetId: "bell_destroyed" 
        });
      }

      // Check for exhaustion
      if (mv) checkExhaustion(mv.id, from, to, B1);

      // Pawn promotion check after destroying obstacle
      // White promotes at top (boardSize-1), Black promotes at bottom (0)
      const pieceAtDestination = B1[to.y]?.[to.x];
      if (pieceAtDestination && pieceAtDestination.type === "P") {
        const shouldPromote = 
          (pieceAtDestination.color === W && to.y === currentBoardSize - 1) ||
          (pieceAtDestination.color === B && to.y === 0);
        console.log("[OBSTACLE-PROMOTION-CHECK]", { 
          color: pieceAtDestination.color, 
          toY: to.y, 
          boardSize: currentBoardSize, 
          shouldPromote,
          config: currentLevelConfig?.pawnPromotionType 
        });
        if (shouldPromote) {
          let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
          // Safeguard: never promote to Pawn or King
          if (promotionType === "P" || promotionType === "K") promotionType = "Q";
          console.log("[PAWN-PROMOTED-OBSTACLE]", { color: pieceAtDestination.color === W ? "white" : "black", to: promotionType });
          B1[to.y][to.x] = { ...pieceAtDestination, type: promotionType };
        }
      }

      // Check for King Crossing victory condition
      const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
      if (victoryConditions.includes("king_escaped") && isKingPiece(mv) && mv.color === W && to.y === currentBoardSize - 1) {
        sfx.winCheckmate();
        setB(B1);
        setWin(W);
        handleLevelCompletion(W, B1, { deliverer: mv, condition: "king_escaped" });
        setPhrase("King Crossing!");
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMoveEntry = newHistory[newHistory.length - 1];
          if (lastMoveEntry) lastMoveEntry.notation += " (Escaped!)";
          return newHistory;
        });
        setFx(null);
        setRerollState(null);
        setPhase("playing");
        return;
      }
    } else {
      B1[from.y][from.x] = attackerState;
      setLastMove(null); // No move occurred visually
    }
    setB(B1);
    decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
    setTurn(turn === W ? B : W);
    setFx(null);
    setRerollState(null);
    setPhase("playing");
  }

  function finishPieceCombat(
    out: any,
    lanceLungeUsed: boolean,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    let B1 = cloneB(Bstate);
    const mv = B1[from.y]?.[from.x]; // Safe navigation
    const tg = B1[to.y]?.[to.x]; // Safe navigation

    // Safety: if either missing, bail cleanly
    if (!mv || !tg) {
      setFx(null);
      setRerollState(null);
      setPhase("playing");
      return;
    }

    if (out.win) {
      // Attacker wins → defender dies (unless Staff converts)
      // Compute the post-move attacker state (Spear breaks)
      const moved: Piece = { ...mv };
      if (lanceLungeUsed) moved.equip = undefined;

      if (mv.equip === "staff") {
        // Convert defender instead of killing them
        sfx.convert();
        const conv: Piece = { ...tg, color: mv.color };
        B1[to.y][to.x] = conv;
        B1[from.y][from.x] = { ...moved, equip: undefined };
        
        // Pawn promotion check after staff conversion (attacker stays at from position)
        // White promotes at top (boardSize-1), Black promotes at bottom (0)
        const attackerAtFrom = B1[from.y]?.[from.x];
        if (attackerAtFrom && attackerAtFrom.type === "P") {
          const shouldPromote = 
            (attackerAtFrom.color === W && from.y === currentBoardSize - 1) ||
            (attackerAtFrom.color === B && from.y === 0);
          console.log("[STAFF-PROMOTION-CHECK]", { color: attackerAtFrom.color, fromY: from.y, boardSize: currentBoardSize, shouldPromote, config: currentLevelConfig?.pawnPromotionType });
          if (shouldPromote) {
            let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
            // Safeguard: never promote to Pawn or King
            if (promotionType === "P" || promotionType === "K") promotionType = "Q";
            console.log("[PAWN-PROMOTED-STAFF]", { color: attackerAtFrom.color === W ? "white" : "black", to: promotionType });
            B1[from.y][from.x] = { ...attackerAtFrom, type: promotionType };
          }
        }
        
        // Check if we unlocked an item (converted piece = "killed" for unlock purposes)
        checkUnlockItem(
          tg,
          mv.color as Color,
          setThisLevelUnlockedItems,
          setCampaign,
          campaign,
          setKilledEnemyPieces,
          setMarketPoints,
          setUnspentGold,
          tg.type === "K" ? "beheaded" : undefined,
          { killerPiece: mv, killerPosition: from, terrain: Tstate }
        );
        // If defender was a King, check victory conditions
        if (tg.type === "K") {
          // Check for Bell of Names protection (protects black king only)
          if (tg.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
            // Black king is protected by the Bell of Names - conversion fails
            const bellPhrase = "The Bell of Names shields Morcant!";
            setPhrase(bellPhrase);
            setSpeechBubble({ 
              text: "**The bell protects me!**", 
              id: Date.now(), 
              targetId: tg.id 
            });
            
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${bellPhrase})`;
              return newHistory;
            });
            
            // Apply shadow visual effect to the king for 1 turn
            const B1 = cloneB(Bstate);
            const shadowKing = B1[to.y]?.[to.x];
            if (shadowKing) {
              shadowKing.shadowForTurns = 1;
            }
            // Staff is still consumed, but conversion fails
            B1[from.y][from.x] = { ...mv, equip: undefined };
            setB(B1);
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
          
          // Check victory conditions - only declare victory if king_beheaded is allowed
          const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
          if (victoryConditions.includes("king_beheaded")) {
            // No death → no stun
            if (mv.color === W) {
              sfx.winCheckmate();
            } else {
              sfx.loseCheckmate();
            }
            setB(B1);
            setWin(mv.color as Color);
            handleLevelCompletion(mv.color as Color, B1, {
              deliverer: mv,
              condition: "king_beheaded",
            });
            const endPhrase = "Regicide!";
            setPhrase(endPhrase);
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${endPhrase})`;
              return newHistory;
            });
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          } else {
            // King beheaded but it's not a valid victory condition
            // If the enemy king died, player loses (can't achieve checkmate anymore)
            if (tg.color === B) {
              // Enemy king killed - player loses
              B1[to.y][to.x] = null;
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("You killed the King! Victory condition failed!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Victory condition failed!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            } else {
              // Player's own king was converted - this shouldn't happen, but continue
              B1[to.y][to.x] = null;
              setB(B1);
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
          }
        }
      } else {
        // Normal capture path
        if (tg.equip === "skull") {
          // Both die
          sfx.combatLose(); // Play sound for attacker dying to skull
          const deadDefender = B1[to.y][to.x];
          const deadAttacker = B1[from.y][from.x];
          
          // Check for Bell of Names protection (protects black king only)
          if (deadDefender?.type === "K" && deadDefender.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
            // Black king is protected by the Bell of Names - only attacker dies
            B1[from.y][from.x] = null;
            onPieceDeath(B1, deadAttacker, from, turn, handlePlayerPieceLost); // 🎃 attacker's death
            
            // Track killed attacker for ransom (defender's color is the killer)
            checkUnlockItem(
              deadAttacker,
              deadDefender.color as Color,
              setThisLevelUnlockedItems,
              setCampaign,
              campaign,
              setKilledEnemyPieces,
              setMarketPoints,
              setUnspentGold,
          deadAttacker?.type === "K" ? "beheaded" : undefined,
          { killerPiece: deadDefender ?? null, killerPosition: to, terrain: Tstate }
            );
            
            // Check if the attacker that died is the white King - always a loss
            if (deadAttacker?.type === "K" && deadAttacker.color === W) {
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("Your King has fallen!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Your King has fallen!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
            
            const bellPhrase = "The Bell of Names shields Morcant!";
            setPhrase(bellPhrase);
            setSpeechBubble({ 
              text: "**The bell protects me!**", 
              id: Date.now(), 
              targetId: tg.id 
            });
            
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${bellPhrase})`;
              return newHistory;
            });
            
            // Apply shadow visual effect to the king for 1 turn
            const shadowKing = B1[to.y]?.[to.x];
            if (shadowKing) {
              shadowKing.shadowForTurns = 1;
            }
            
            setB(B1);
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
          
          B1[to.y][to.x] = null;
          B1[from.y][from.x] = null;
          onPieceDeath(B1, deadDefender, to, turn, handlePlayerPieceLost); // 🎃 defender's death
          onPieceDeath(B1, deadAttacker, from, turn, handlePlayerPieceLost); // 🎃 attacker's death
          // Check if we unlocked an item from defender
          checkUnlockItem(
            deadDefender,
            mv.color as Color,
            setThisLevelUnlockedItems,
            setCampaign,
            campaign,
            setKilledEnemyPieces,
            setMarketPoints,
            setUnspentGold,
          deadDefender?.type === "K" ? "beheaded" : undefined,
          { killerPiece: mv, killerPosition: from, terrain: Tstate }
          );
          
          // Check if we unlocked an item from attacker (when both die)
          checkUnlockItem(
            deadAttacker,
            tg.color as Color,
            setThisLevelUnlockedItems,
            setCampaign,
            campaign,
            setKilledEnemyPieces,
            setMarketPoints,
            setUnspentGold,
            deadAttacker?.type === "K" ? "beheaded" : undefined
          );

          // Both pieces die, so award a "kill" to both if they had any kills
          // (attacker doesn't get credit since they also die)

          // Early king checks after stuns
          if (deadAttacker?.type === "K") {
            console.log("=== KING DIED IN SKULL COMBAT (ATTACKER) ===");
            console.log("Dead attacker color:", deadAttacker.color);
            console.log("Is player king:", deadAttacker.color === W);
            
            // Check victory conditions - only declare victory if king_dishonored is allowed (for enemy king)
            // If player's king dies, it's always a loss regardless of victory conditions
            const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
            const isPlayerKing = deadAttacker.color === W;
            
            console.log("Victory conditions:", victoryConditions);
            console.log("Should end game:", isPlayerKing || victoryConditions.includes("king_dishonored"));
            
            if (isPlayerKing || victoryConditions.includes("king_dishonored")) {
              console.log(">>> ENDING GAME - King died in skull combat");
              // Player king died (always loss) OR enemy king died dishonored (check victory condition)
              if (tg.color === B) sfx.loseCheckmate();
              else sfx.winCheckmate();
              setB(B1);
              setWin(tg.color as Color);
              handleLevelCompletion(tg.color as Color, B1, {
                deliverer: tg.color === W ? tg : undefined,
                condition: "king_dishonored",
              });
              const endPhrase = isPlayerKing ? "King's soul is forfeit!" : "King dishonored!";
              setPhrase(endPhrase);
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += ` (${endPhrase})`;
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            } else {
              // Enemy king died dishonored but it's not a valid victory condition
              // Player loses because they can't achieve checkmate anymore
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("You killed the King! Victory condition failed!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Victory condition failed!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
          }
          if (deadDefender?.type === "K") {
            // Check victory conditions - only declare victory if king_beheaded is allowed
            const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
            if (victoryConditions.includes("king_beheaded")) {
              if (mv.color === W) sfx.winCheckmate();
              else sfx.loseCheckmate();
              setB(B1);
              setWin(mv.color as Color);
              handleLevelCompletion(mv.color as Color, B1, {
                deliverer: mv,
                condition: "king_beheaded",
              });
              const endPhrase = "Regicide!";
              setPhrase(endPhrase);
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += ` (${endPhrase})`;
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            } else {
              // King beheaded but it's not a valid victory condition
              // If the enemy king died, player loses (can't achieve checkmate anymore)
              if (deadDefender?.color === B) {
                // Enemy king killed - player loses
                setB(B1);
                sfx.loseCheckmate();
                setWin(B);
                handleLevelCompletion(B, B1);
                setPhrase("You killed the King! Victory condition failed!");
                setMoveHistory((hist) => {
                  const newHistory = [...hist];
                  const lastMove = newHistory[newHistory.length - 1];
                  if (lastMove) lastMove.notation += " (Victory condition failed!)";
                  return newHistory;
                });
                setFx(null);
                setRerollState(null);
                setPhase("playing");
                return;
              } else {
                // Player's king died - this is ALWAYS a loss regardless of victory conditions
                setB(B1);
                sfx.loseCheckmate();
                setWin(B);
                handleLevelCompletion(B, B1);
                setPhrase("Your King has fallen!");
                setMoveHistory((hist) => {
                  const newHistory = [...hist];
                  const lastMove = newHistory[newHistory.length - 1];
                  if (lastMove) lastMove.notation += " (Your King has fallen!)";
                  return newHistory;
                });
                setFx(null);
                setRerollState(null);
                setPhase("playing");
                return;
              }
            }
          }
        } else {
          // Defender actually dies here
          if (tg.type !== "K") {
            sfx.capture();
          }
          onPieceDeath(B1, tg, to, turn, handlePlayerPieceLost); // 🎃 if defender had Curse
          // Check if we unlocked an item
          checkUnlockItem(
            tg,
            mv.color as Color,
            setThisLevelUnlockedItems,
            setCampaign,
            campaign,
            setKilledEnemyPieces,
            setMarketPoints,
            setUnspentGold,
          tg.type === "K" ? "beheaded" : undefined,
          { killerPiece: mv, killerPosition: from, terrain: Tstate }
          );

          // Award kill to attacker (track for veteran status)
          const newKills = (moved.kills || 0) + 1;
          moved.kills = newKills;

          B1[to.y][to.x] = moved;
          B1[from.y][from.x] = null;

          // Check for exhaustion
          checkExhaustion(mv.id, from, to, B1);

          // Pawn promotion check after combat win (must happen before early returns for king kills)
          const pieceAtDestination = B1[to.y]?.[to.x];
          if (pieceAtDestination && pieceAtDestination.type === "P") {
            const shouldPromote = 
              (pieceAtDestination.color === W && to.y === currentBoardSize - 1) ||
              (pieceAtDestination.color === B && to.y === 0);
            if (shouldPromote) {
              let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
              // Safeguard: never promote to Pawn or King
              if (promotionType === "P" || promotionType === "K") promotionType = "Q";
              B1[to.y][to.x] = { ...pieceAtDestination, type: promotionType };
            }
          }

          if (tg.type === "K") {
            // Check for Bell of Names protection (protects black king only)
            if (tg.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
              // Black king is protected by the Bell of Names - he cannot be killed
              // The attacker's attack fails completely (as if blocked)
              const bellPhrase = "The Bell of Names shields Morcant!";
              setPhrase(bellPhrase);
              setSpeechBubble({ 
                text: "**The bell protects me!**", 
                id: Date.now(), 
                targetId: tg.id 
              });
              
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += ` (${bellPhrase})`;
                return newHistory;
              });
              
              // Apply shadow visual effect to the king for 1 turn
              const B1 = cloneB(Bstate);
              const shadowKing = B1[to.y]?.[to.x];
              if (shadowKing) {
                shadowKing.shadowForTurns = 1;
                setB(B1);
              } else {
                setB(Bstate); // Fallback if king not found
              }
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
            
            // Check victory conditions - only declare victory if king_beheaded is allowed
            const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
            if (victoryConditions.includes("king_beheaded")) {
              if (moved.color === W) {
                sfx.winCheckmate();
              } else {
                sfx.loseCheckmate();
              }
              setB(B1);
              setWin(moved.color as Color);
              handleLevelCompletion(moved.color as Color, B1, {
                deliverer: moved,
                condition: "king_beheaded",
              });
              const endPhrase = "Regicide!";
              setPhrase(endPhrase);
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += ` (${endPhrase})`;
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            } else {
              // King beheaded but it's not a valid victory condition
              // If the enemy king died, player loses (can't achieve checkmate anymore)
              if (tg.color === B) {
                // Enemy king killed - player loses
                setB(B1);
                sfx.loseCheckmate();
                setWin(B);
                handleLevelCompletion(B, B1);
                setPhrase("You killed the King! Victory condition failed!");
                setMoveHistory((hist) => {
                  const newHistory = [...hist];
                  const lastMove = newHistory[newHistory.length - 1];
                  if (lastMove) lastMove.notation += " (Victory condition failed!)";
                  return newHistory;
                });
                setFx(null);
                setRerollState(null);
                setPhase("playing");
                return;
              } else {
                // Player's own king was killed - this is ALWAYS a loss regardless of victory conditions
                setB(B1);
                sfx.loseCheckmate();
                setWin(B);
                handleLevelCompletion(B, B1);
                setPhrase("Your King has fallen!");
                setMoveHistory((hist) => {
                  const newHistory = [...hist];
                  const lastMove = newHistory[newHistory.length - 1];
                  if (lastMove) lastMove.notation += " (Your King has fallen!)";
                  return newHistory;
                });
                setFx(null);
                setRerollState(null);
                setPhase("playing");
                return;
              }
            }
          }

          // Check for King Crossing victory condition
          const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
      if (victoryConditions.includes("king_escaped") && isKingPiece(moved) && moved.color === W && to.y === currentBoardSize - 1) {
        sfx.winCheckmate();
        setB(B1);
        setWin(W);
        handleLevelCompletion(W, B1, { deliverer: moved, condition: "king_escaped" });
        setPhrase("King Crossing!");
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMoveEntry = newHistory[newHistory.length - 1];
          if (lastMoveEntry) lastMoveEntry.notation += " (Escaped!)";
          return newHistory;
        });
        setFx(null);
        setRerollState(null);
        setPhase("playing");
        return;
      }
        }

        setLastMove({ from, to });
      }
      // (end attacker win)
    } else {
      // Attacker loses → attacker dies unless Bow saves them
      const attackerState = lanceLungeUsed
        ? { ...mv, equip: undefined }
        : { ...mv };

      if (attackerState.equip === "bow") {
        // Bow breaks — no death => no stun
        sfx.bowBreak();
        B1[from.y][from.x] = { ...attackerState, equip: undefined };
        setLastMove(null); // No move occurred visually
      } else {
        // Attacker actually dies here
        if (mv.type !== "K") {
          sfx.combatLose();
        }
        const deadAttacker = B1[from.y][from.x];
        B1[from.y][from.x] = null;
        onPieceDeath(B1, deadAttacker, from, turn, handlePlayerPieceLost); // 🎃 attacker's death
        
        // Track killed attacker for ransom (defender's color is the killer)
        checkUnlockItem(
          deadAttacker,
          tg.color as Color,
          setThisLevelUnlockedItems,
          setCampaign,
          campaign,
          setKilledEnemyPieces,
          setMarketPoints,
          setUnspentGold,
          deadAttacker?.type === "K" ? "beheaded" : undefined,
          { killerPiece: tg ?? null, killerPosition: to, terrain: Tstate }
        );

        if (attackerState.equip === "skull") {
          // Kill defender too
          const deadDefender = B1[to.y][to.x];
          
          // Check for Bell of Names protection (protects black king only)
          if (deadDefender?.type === "K" && deadDefender.color === B && bellOfNamesExists(obstacles, currentBoardSize)) {
            // Black king is protected by the Bell of Names - skull fails to kill him
            
            // Check if the attacker that died is the white King - always a loss
            if (deadAttacker?.type === "K" && deadAttacker.color === W) {
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("Your King has fallen!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Your King has fallen!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
            
            const bellPhrase = "The Bell of Names shields Morcant!";
            setPhrase(bellPhrase);
            setSpeechBubble({ 
              text: "**The bell protects me!**", 
              id: Date.now(), 
              targetId: tg.id 
            });
            
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += ` (${bellPhrase})`;
              return newHistory;
            });
            
            // Apply shadow visual effect to the king for 1 turn
            const shadowKing = B1[to.y]?.[to.x];
            if (shadowKing) {
              shadowKing.shadowForTurns = 1;
            }
            
            setB(B1);
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          }
          
          sfx.combatLose(); // Play sound for defender dying to attacker's skull
          B1[to.y][to.x] = null;
          onPieceDeath(B1, deadDefender, to, turn, handlePlayerPieceLost); // 🎃 defender's death
          // Check if we unlocked an item from defender
          checkUnlockItem(
            deadDefender,
            mv.color as Color,
            setThisLevelUnlockedItems,
            setCampaign,
            campaign,
            setKilledEnemyPieces,
            setMarketPoints,
            setUnspentGold,
            deadDefender?.type === "K" ? "beheaded" : undefined,
            { killerPiece: mv, killerPosition: from, terrain: Tstate }
          );

          // Defender died (to skull), award kill to dead attacker's kill count
          // Note: attacker is dead so this won't be visible, but helps with consistency
          
          // Check if defender king died - need to check victory conditions
          if (deadDefender?.type === "K") {
            const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
            if (victoryConditions.includes("king_beheaded")) {
              if (mv.color === W) {
                sfx.winCheckmate();
              } else {
                sfx.loseCheckmate();
              }
              setB(B1);
              setWin(mv.color as Color); // Attacker's color wins
              handleLevelCompletion(mv.color as Color, B1, {
                deliverer: mv,
                condition: "king_beheaded",
              });
              setPhrase("Regicide!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Regicide!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            } else {
              // King beheaded but it's not a valid victory condition
              // If the enemy king died, player loses (can't achieve checkmate anymore)
              if (deadDefender?.color === B) {
                // Enemy king killed - player loses
                setB(B1);
                sfx.loseCheckmate();
                setWin(B);
                handleLevelCompletion(B, B1);
                setPhrase("You killed the King! Victory condition failed!");
                setMoveHistory((hist) => {
                  const newHistory = [...hist];
                  const lastMove = newHistory[newHistory.length - 1];
                  if (lastMove) lastMove.notation += " (Victory condition failed!)";
                  return newHistory;
                });
                setFx(null);
                setRerollState(null);
                setPhase("playing");
                return;
              } else {
                // Player's king died - this is ALWAYS a loss regardless of victory conditions
                setB(B1);
                sfx.loseCheckmate();
                setWin(B);
                handleLevelCompletion(B, B1);
                setPhrase("Your King has fallen!");
                setMoveHistory((hist) => {
                  const newHistory = [...hist];
                  const lastMove = newHistory[newHistory.length - 1];
                  if (lastMove) lastMove.notation += " (Your King has fallen!)";
                  return newHistory;
                });
                setFx(null);
                setRerollState(null);
                setPhase("playing");
                return;
              }
            }
          }
        }

        // Early king checks after stuns
        if (tg.type === "K" && B1[to.y]?.[to.x] === null) {
          // Safe navigation
          // if defender also died
          const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
          if (victoryConditions.includes("king_beheaded")) {
            if (mv.color === W) {
              sfx.winCheckmate();
            } else {
              sfx.loseCheckmate();
            }
            setB(B1);
            setWin(mv.color as Color); // Attacker's color wins
            handleLevelCompletion(mv.color as Color, B1, {
              deliverer: mv,
              condition: "king_beheaded",
            });
            setPhrase("King's soul is forfeit!");
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove) lastMove.notation += " (King's soul is forfeit!)";
              return newHistory;
            });
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          } else {
            // King beheaded but it's not a valid victory condition
            // Check if defender king died (enemy king)
            if (tg.type === "K" && B1[to.y]?.[to.x] === null && tg.color === B) {
              // Enemy king killed - player loses
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("You killed the King! Victory condition failed!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Victory condition failed!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            } else {
              // Player's king died - this is ALWAYS a loss regardless of victory conditions
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("Your King has fallen!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Your King has fallen!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
          }
        }
        if (deadAttacker?.type === "K") {
          console.log("=== KING DIED AS ATTACKER (BOW FAILED) ===");
          console.log("Dead attacker color:", deadAttacker.color);
          console.log("Is player king:", deadAttacker.color === W);
          
          // Attacker king died - check if player's king or enemy king
          const isPlayerKing = deadAttacker.color === W;
          const victoryConditions = currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"];
          
          console.log("Victory conditions:", victoryConditions);
          console.log("Should end game:", isPlayerKing || victoryConditions.includes("king_dishonored"));
          
          // If player's king died, it's always a loss regardless of victory conditions
          // If enemy king died dishonored, check if king_dishonored is a valid victory condition
          if (isPlayerKing || victoryConditions.includes("king_dishonored")) {
            console.log(">>> ENDING GAME - King died as attacker");
            const endPhrase = "King dishonored!";
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const winner = mv.color === W ? B : W;

            // Track King defeat for ransom if it's the enemy king (black) that died
            if (deadAttacker.color === W) {
              // Player king died, so black wins - but we don't track white king defeats for ransom
            } else if (deadAttacker.color === B) {
              // Black king died attacking, track for ransom
              trackKingDefeat(deadAttacker, "dishonored", setKilledEnemyPieces);
            }

            // Set phrase and move history BEFORE handleLevelCompletion
            setPhrase(endPhrase);
            setMoveHistory((hist) => {
              const newHistory = [...hist];
              const lastMove = newHistory[newHistory.length - 1];
              if (lastMove && !lastMove.notation.includes(endPhrase)) {
                lastMove.notation += ` (${endPhrase})`;
              }
              return newHistory;
            });

            if (mv.color === W) {
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
            } else {
              sfx.winCheckmate();
              setWin(W);
          handleLevelCompletion(W, B1, {
            deliverer: tg?.color === W ? tg : undefined,
            condition: "king_dishonored",
          });
            }

            setB(B1);
            setFx(null);
            setRerollState(null);
            setPhase("playing");
            return;
          } else {
            // Enemy king died dishonored but it's not a valid victory condition
            // Track the defeat for gold purposes even if not a victory
            if (deadAttacker.color === B) {
              trackKingDefeat(deadAttacker, "dishonored", setKilledEnemyPieces);
              // Enemy king killed - player loses (can't achieve checkmate anymore)
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("You killed the King! Victory condition failed!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove && !lastMove.notation.includes("Victory condition failed")) {
                  lastMove.notation += " (Victory condition failed!)";
                }
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            } else {
              // Player's king died - this is ALWAYS a loss regardless of victory conditions
              setB(B1);
              sfx.loseCheckmate();
              setWin(B);
              handleLevelCompletion(B, B1);
              setPhrase("Your King has fallen!");
              setMoveHistory((hist) => {
                const newHistory = [...hist];
                const lastMove = newHistory[newHistory.length - 1];
                if (lastMove) lastMove.notation += " (Your King has fallen!)";
                return newHistory;
              });
              setFx(null);
              setRerollState(null);
              setPhase("playing");
              return;
            }
          }
        }
        setLastMove(null); // No move occurred visually
      }
      // (end attacker lose)
    }

    // Pawn promotion (check both positions - winner might be at 'to' or 'from')
    // White promotes at top (boardSize-1), Black promotes at bottom (0)
    const winnerFinalPos = out.win ? to : from;
    const winnerFinalPiece = B1[winnerFinalPos.y]?.[winnerFinalPos.x];
    if (winnerFinalPiece?.type === "P") {
      const shouldPromoteWinner = 
        (winnerFinalPiece.color === W && winnerFinalPos.y === currentBoardSize - 1) ||
        (winnerFinalPiece.color === B && winnerFinalPos.y === 0);
      console.log("[COMBAT-PROMOTION-CHECK]", { 
        piece: "winner", 
        color: winnerFinalPiece.color, 
        posY: winnerFinalPos.y, 
        boardSize: currentBoardSize, 
        shouldPromote: shouldPromoteWinner,
        config: currentLevelConfig?.pawnPromotionType
      });
      if (shouldPromoteWinner) {
        let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
        // Safeguard: never promote to Pawn or King
        if (promotionType === "P" || promotionType === "K") promotionType = "Q";
        console.log("[PAWN-PROMOTED-COMBAT]", { color: winnerFinalPiece.color === W ? "white" : "black", to: promotionType });
        B1[winnerFinalPos.y][winnerFinalPos.x] = { ...winnerFinalPiece, type: promotionType };
      }
    }
    
    // Also check if loser ended up at promotion square (shouldn't happen, but just in case)
    const loserFinalPos = out.win ? from : to;
    const loserFinalPiece = B1[loserFinalPos.y]?.[loserFinalPos.x];
    if (loserFinalPiece?.type === "P") {
      const shouldPromoteLoser = 
        (loserFinalPiece.color === W && loserFinalPos.y === currentBoardSize - 1) ||
        (loserFinalPiece.color === B && loserFinalPos.y === 0);
      console.log("[COMBAT-PROMOTION-CHECK]", { 
        piece: "loser", 
        color: loserFinalPiece.color, 
        posY: loserFinalPos.y, 
        boardSize: currentBoardSize, 
        shouldPromote: shouldPromoteLoser,
        config: currentLevelConfig?.pawnPromotionType
      });
      if (shouldPromoteLoser) {
        let promotionType: PieceType = currentLevelConfig?.pawnPromotionType || "Q";
        // Safeguard: never promote to Pawn or King
        if (promotionType === "P" || promotionType === "K") promotionType = "Q";
        console.log("[PAWN-PROMOTED-COMBAT]", { color: loserFinalPiece.color === W ? "white" : "black", to: promotionType });
        B1[loserFinalPos.y][loserFinalPos.x] = { ...loserFinalPiece, type: promotionType };
      }
    }

    // Helper function to select a random sentence avoiding recently used ones
    const randWithoutRecent = <T extends string>(
      r: () => number,
      array: T[],
      pieceId: string
    ): T => {
      const recent = recentSpeechRef.current.get(pieceId) || [];
      const available = array.filter((item) => !recent.includes(item));
      
      // If all sentences have been used, reset and use all of them
      const candidates = available.length > 0 ? available : array;
      const selected = candidates[Math.floor(r() * candidates.length)];
      
      // Track this sentence as recently used
      // If we've used all sentences, keep only the last (array.length - 1) to ensure we can still avoid repeats
      // Otherwise, just add to the list
      let newRecent: string[];
      if (recent.length >= array.length - 1) {
        // We've used most/all sentences, keep only the last (array.length - 1) unique sentences
        // Remove the selected one if it's already in recent, then add it at the end
        const filtered = recent.filter((item) => item !== selected);
        newRecent = [...filtered, selected].slice(-(array.length - 1));
      } else {
        // Still have unused sentences, just add to the list
        newRecent = [...recent, selected];
      }
      recentSpeechRef.current.set(pieceId, newRecent);
      
      return selected;
    };

    // Flavor text: Decide on the speech bubble content in one atomic step to prevent potential flickering.
    const getSpeechBubbleContent = () => {
      const winner = out.win ? mv : tg;
      const loser = out.win ? tg : mv;
      const winnerColor = winner.color as Color;
      const loserColor = loser.color as Color;
      const swingValue = val(loser);
      // Safe navigation for winnerFinalPiece
      const winnerFinalPiece =
        B1[winner === mv ? to.y : from.y]?.[winner === mv ? to.x : from.x];
      const winnerFinalId = winnerFinalPiece?.id ?? winner.id; // Use ID of piece on board, or original if gone (trade)

      // Priority 1: High-impact swing move
      if (swingValue >= 40 && rngRef.current() < 0.75) {
        const king = findK(B1, winnerColor);
        const kingVisible =
          king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
        const targetId = king && kingVisible ? king.p.id : winnerFinalId;
        const text = randWithoutRecent(rngRef.current, SWING_PHRASES[winnerColor], targetId);
        return { text, targetId };
      }

      // Priority 2: A named unit was involved (ALWAYS triggers)
      if (winner.name || loser.name) {
        // Check if winner is a featured piece with custom speech lines
        if (
          winner.isPreconfigured &&
          winner.speechLines &&
          winner.speechLines.length > 0
        ) {
          const text = randWithoutRecent(rngRef.current, winner.speechLines, winnerFinalId);
          return { text, targetId: winnerFinalId };
        }

        // Check if loser is a featured piece with custom speech lines (for defeat quotes)
        if (
          !out.win &&
          loser.isPreconfigured &&
          loser.speechLines &&
          loser.speechLines.length > 0
        ) {
          const loserFinalPiece =
            B1[loser === mv ? from.y : to.y]?.[loser === mv ? from.x : to.x];
          const loserFinalId = loserFinalPiece?.id ?? loser.id;
          const text = randWithoutRecent(rngRef.current, loser.speechLines, loserFinalId);
          return { text, targetId: loserFinalId };
        }

        const shouldTaunt = loser.name && rngRef.current() < 0.5; // 50% chance for winner to taunt loser if loser has a name

        if (shouldTaunt) {
          // Winner taunts the named loser
          const king = findK(B1, winnerColor);
          const kingVisible =
            king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
          const targetId = king && kingVisible ? king.p.id : winnerFinalId; // Speaker is the winner or their king
          const text = randWithoutRecent(
            rngRef.current,
            NAMED_PHRASES[winnerColor].taunt,
            targetId
          ).replace("[UnitName]", loser.name!);
          return { text, targetId };
        } else if (winner.name) {
          // Winner praises themself
          const text = randWithoutRecent(
            rngRef.current,
            NAMED_PHRASES[winnerColor].win,
            winnerFinalId
          ).replace("[UnitName]", winner.name);
          return { text, targetId: winnerFinalId }; // Speaker is the winner (final piece)
        } else if (loser.name) {
          // Ensure loser name exists before proceeding
          // This case handles when only the loser is named and we didn't taunt
          // Find the winner's king or the winner piece to speak
          const king = findK(B1, winnerColor);
          const kingVisible =
            king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
          const speakerId = king && kingVisible ? king.p.id : winnerFinalId;
          const text = randWithoutRecent(
            rngRef.current,
            NAMED_PHRASES[loserColor].lose, // Use loser's lament phrase
            speakerId
          ).replace("[UnitName]", loser.name!); // Referencing the loser by name
          return { text, targetId: speakerId }; // Winner/King speaks the lament
        }
      }

      // Priority 3: Generic phrase (50% chance if no swing and no named units)
      if (rngRef.current() < 0.5) {
        const king = findK(B1, winnerColor);
        const kingVisible =
          king && visibility(B1, "playing", currentBoardSize, currentLevelConfig?.fogRows ?? 2)[king.y]?.[king.x]; // Safe navigation
        const targetId = king && kingVisible ? king.p.id : winnerFinalId;
        const text = randWithoutRecent(rngRef.current, PHRASES[winnerColor].win, targetId);
        return { text, targetId };
      }

      return null; // No speech bubble this time
    };

    const speechContent = getSpeechBubbleContent();
    if (speechContent) {
      setSpeechBubble({ ...speechContent, id: Math.random() });
    }

    setB(B1);
    decrementStunFor(turn, B1, currentBoardSize); // tick down the mover's stun at END of their turn
    
    console.log("=== FINISH PIECE COMBAT ===");
    console.log("Current turn:", turn);
    console.log("Switching turn to:", turn === W ? "BLACK" : "WHITE");
    
    setTurn(turn === W ? B : W);
    setFx(null);
    setRerollState(null);
    setDestroyedPieceIds([]);
    setPhase("playing");
  }

  const handleStartBattle = () => {
    // TRIGGER: Start level music when battle actually begins
    musicManagerRef.current?.playLevelMusic(campaign.level);
    
    // Start battle immediately - no confirmation needed (confirmation happens on COMPLETE DEPLOYMENT)
    setPhase("playing");
    setMarketViewVisible(true); // Reset to market visible for next market phase
  };

  // Shared rules content component
  const RulesContent = ({ 
    showItemInfo, 
    setShowItemInfo,
    className = "bg-stone-950/95 rounded-2xl p-6 max-h-[80vh] overflow-y-auto",
    headingClass = "text-lg"
  }: { 
    showItemInfo: boolean; 
    setShowItemInfo: (val: boolean | ((prev: boolean) => boolean)) => void;
    className?: string;
    headingClass?: string;
  }) => {
    const itemOrder: (keyof typeof ITEM_DESCRIPTIONS)[] = [
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
    ];

    return (
      <div className={className}>
        <div className={`font-semibold mb-2 ${headingClass}`}>Combat</div>
        <ul className="ml-5 list-disc space-y-1 text-sm mb-4">
          <li>Pieces roll 1d6. Attacker wins on ≥ roll.</li>
          <li>
            Support: +1 for each friendly piece also attacking the square.
          </li>
          <li>
            King always attacks with Advantage (roll 2, keep highest).
          </li>
          <li>Stunned pieces always roll 1.</li>
          <li>
            🎖️ Veterans: Units that kill 5+ enemy units always roll with
            advantage (both attacking and defending).
          </li>
        </ul>
        <div className={`font-semibold mt-3 mb-1 ${headingClass}`}>Terrain</div>
        <ul className="ml-5 list-disc space-y-1 text-sm mb-4">
          <li>Forest (🌲): Defender gets +1 to their roll.</li>
          <li>Water (💧): Defender gets -1 to their roll.</li>
          <li>Rock (🪨): Blocks movement. Destroy with a roll of 5+.</li>
        </ul>
        <div className={`font-semibold mt-3 mb-1 flex justify-between items-center ${headingClass}`}>
          Items
          <button
            onClick={() => setShowItemInfo((s) => !s)}
            className="px-2 py-1 text-xs bg-amber-950 hover:bg-amber-900 rounded"
          >
            {showItemInfo ? "Hide" : "Show"}
          </button>
        </div>
        {showItemInfo && (
          <ul className="ml-5 list-disc space-y-1 text-sm mb-4">
            {itemOrder.map((key) => (
              <li key={key}>{ITEM_DESCRIPTIONS[key]}</li>
            ))}
          </ul>
        )}
        <div className={`font-semibold mt-3 mb-1 ${headingClass}`}>Blessings</div>
        <ul className="ml-5 list-disc space-y-1 text-sm">
          <li>{ITEM_DESCRIPTIONS["prayer_die"]}</li>
        </ul>
      </div>
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const GameInfo = () => {
    const [showItemInfo, setShowItemInfo] = useState(false);

    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Game Info</h1>
        {showRules && (
          <RulesContent 
            showItemInfo={showItemInfo} 
            setShowItemInfo={setShowItemInfo}
            className="bg-stone-950/70 rounded-2xl p-3"
            headingClass=""
          />
        )}
      </div>
    );
  };

  const MoveHistoryLog = ({
    history,
    phase,
    turn,
    win,
    phrase,
  }: {
    history: MoveRecord[];
    phase: Phase;
    turn: Color;
    win: Color | null;
    phrase: string | null;
  }) => {
    const logRef = useRef<HTMLDivElement>(null);
    const prevHistoryLengthRef = useRef<number>(0);

    useEffect(() => {
      if (logRef.current) {
        const currentLength = history.length;
        const prevLength = prevHistoryLengthRef.current;
        
        // Only auto-scroll when history length actually increased (new moves added)
        // This prevents scroll resets when speech bubbles cause re-renders
        if (currentLength > prevLength) {
          logRef.current.scrollTop = logRef.current.scrollHeight;
        }
        
        prevHistoryLengthRef.current = currentLength;
      }
    }, [history]);

    const movePairs: { turn: number; w?: MoveRecord; b?: MoveRecord }[] = [];
    // Filter out any null/undefined entries before processing
    history.filter((move): move is MoveRecord => move != null).forEach((move) => {
      let pair = movePairs.find((p) => p.turn === move.turnNumber);
      if (!pair) {
        pair = { turn: move.turnNumber };
        movePairs.push(pair);
      }
      if (move.color === "w") pair.w = move;
      else pair.b = move;
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const lastTurnNumber =
      movePairs.length > 0 ? movePairs[movePairs.length - 1].turn : 0;

    // Polyfill findLastIndex if it's not present (for environments < ES2023)
    function findLastIndex<T>(
      arr: T[],
      predicate: (value: T, index: number, obj: T[]) => boolean
    ): number {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (predicate(arr[i], i, arr)) return i;
      }
      return -1;
    }

    const lastWhiteMoveIndex = findLastIndex(history, (m) => m != null && m.color === "w");
    const lastBlackMoveIndex = findLastIndex(history, (m) => m != null && m.color === "b");

    return (
      <div className="mt-4 bg-consistent-dark-brown rounded-2xl p-3" style={{
        width: '296px'
      }}>
        {/* Your Turn indicator at top */}
        <div className="mb-2 w-full flex justify-center">
          <div
            className={`px-3 py-1 rounded-full font-semibold text-sm ${
              win
                ? "bg-gray-200 text-black"
                : turn === W
                ? "bg-white text-black"
                : "bg-gray-700 text-white"
            }`}
          >
            {win
              ? `Winner: ${win === W ? "White" : "Black"}${phrase ? " — " + phrase : ""}`
              : turn === W
              ? "Your Turn — White"
              : "Bot Turn — Black"}
          </div>
        </div>
        <div ref={logRef} className="max-h-96 overflow-y-auto pr-2">
          {movePairs.map((pair, index) => {
            const isLastWhiteAnimating =
              phase === "base" &&
              !!pair.w &&
              history[lastWhiteMoveIndex]?.turnNumber === pair.turn &&
              history[lastBlackMoveIndex]?.turnNumber !== pair.turn;
            const isLastBlackAnimating =
              phase === "base" &&
              !!pair.b &&
              history[lastBlackMoveIndex]?.turnNumber === pair.turn;

            return (
              <div
                key={pair.turn}
                className="grid grid-cols-[2rem_1fr_1fr] gap-x-2 items-start border-b border-amber-900 py-1.5"
              >
                <div className="text-sm text-amber-200 pt-1">{pair.turn}.</div>
                <MoveCell move={pair.w} isAnimating={isLastWhiteAnimating} />
                <MoveCell move={pair.b} isAnimating={isLastBlackAnimating} />
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const MoveCell = ({
    move,
    isAnimating,
  }: {
    move?: MoveRecord;
    isAnimating: boolean;
  }) => {
    if (!move) return <div />;

    // Ensure move.piece exists and type is valid before accessing GL
    const pieceType = move.piece?.type;
    const pieceColor = move.piece?.color as "w" | "b";
    const glyphSet = GL[pieceType as keyof typeof GL];
    const glyph = glyphSet && pieceColor in glyphSet ? glyphSet[pieceColor as keyof typeof glyphSet] : "?";

    const showGlyph = move.piece.type !== "P";

    const pctColorClass = move.combat
      ? move.combat.isSupported
        ? "text-blue-400"
        : move.combat.winPercent < 50
        ? "text-orange-400"
        : "text-green-400"
      : "";

    return (
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="font-bold text-white text-base flex items-center shrink-0"
          title={move.piece ? `${PIECE_NAMES[move.piece.type]}` : ""} // Check if move.piece exists
        >
          {showGlyph && (
            <span
              className="text-xl mr-0.5"
              style={{
                fontFamily:
                  '"Noto Sans Symbols 2", "Segoe UI Symbol", "DejaVu Sans", system-ui, sans-serif',
              }}
            >
              {glyph}
            </span>
          )}
          {/* Show fog icon only for opponent's moves ending in fog */}
          <span>{move.inFog && move.color === B ? "🌫️" : move.notation}</span>
        </div>
        {move.combat && (
          <div className="flex items-center gap-1.5">
            <span className={`text-xs font-semibold ${pctColorClass}`}>
              {move.combat.winPercent}%
            </span>
            <div className="flex items-center gap-1 ok px-1.5 py-0.5 rounded-md">
              {move.combat.attackerRolls.map((roll, i) => (
                <DiceD6 key={i} rolling={isAnimating} result={roll} size={16} />
              ))}
            </div>
            {move.rerolledBy === "attacker" && (
              <span className="text-sm">🙏</span>
            )}
            {
              move.combat.defenderRolls === null ? ( // Obstacle combat check
                <div className="flex items-center gap-1">
                  <span className="text-xs text-amber-300">vs</span>
                  <span
                    className="text-xl"
                    style={{
                      fontFamily:
                        '"Noto Sans Symbols 2", "Segoe UI Symbol", "DejaVu Sans", system-ui, sans-serif',
                    }}
                  >
                    {(() => {
                      const obstacleType = move.combat?.obstacleType || "rock";
                      if (obstacleType === "rock") return GL.ROCK.n;
                      if (obstacleType === "courtier") return GL.COURTIER.n;
                      if (obstacleType === "column") return GL.COLUMN.n;
                      if (obstacleType === "gate") return GL.GATE.n;
                      if (obstacleType === "bell") return GL.BELL.n;
                      return GL.ROCK.n; // Fallback
                    })()}
                  </span>
                </div>
              ) : move.combat.defenderRolls ? ( // Piece combat
                <>
                  <span className="text-xs text-amber-300">vs</span>
                  <div className="flex items-center gap-1 bad px-1.5 py-0.5 rounded-md">
                    {move.combat.defenderRolls.map((roll, i) => (
                      <DiceD6
                        key={i}
                        rolling={isAnimating}
                        result={roll}
                        size={16}
                      />
                    ))}
                  </div>
                  {move.rerolledBy === "defender" && (
                    <span className="text-sm">🙏</span>
                  )}
                </>
              ) : null /* Handles cases where defenderRolls might be undefined just in case */
            }
          </div>
        )}
      </div>
    );
  };



  const [modalPosition, setModalPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const [winModalPosition, setWinModalPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (showMarketConfirm && startBattleBtnRef.current) {
      const buttonRect = startBattleBtnRef.current.getBoundingClientRect();
      // Calculate center of the button
      const top = buttonRect.top + buttonRect.height / 2;
      const left = buttonRect.left + buttonRect.width / 2;
      setModalPosition({ top, left });
    } else {
      setModalPosition(null);
    }
  }, [showMarketConfirm, phase]); // Re-calculate if showMarketConfirm or phase changes

  useEffect(() => {
    if (win && boardRef.current) {
      const boardRect = boardRef.current.getBoundingClientRect();
      const top = boardRect.top + boardRect.height / 2;
      const left = boardRect.left + boardRect.width / 2;
      setWinModalPosition({ top, left });
    } else {
      setWinModalPosition(null);
    }
  }, [win]);

  const handleReroll = (useReroll: boolean) => {
    if (!rerollState) return;

    const { from, to, kind } = rerollState;
    const p = Bstate[from.y]?.[from.x]; // Safe navigation
    if (!p) return;

    if (useReroll) {
      setPrayerDice(prayerDice - 1);
      // Update campaign state
      setCampaign((prev) => ({ ...prev, prayerDice: prev.prayerDice - 1 }));
      sfx.prayer();

      const isPlayerAttacking = p.color === W;

      // Both dice will be rerolled, so set reroll target to null to animate both
      setRerollTarget(null);

      if (kind === "obstacle") {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const obstacleType = rerollState?.obstacleType || obstacles[to.y]?.[to.x] || "rock";
        const lanceLungeUsed =
          p.equip === "lance" &&
          to.y === from.y + (p.color === W ? 1 : -1) * 2 &&
          to.x === from.x;
        const out = resolveObstacle(
          rngRef.current,
          p,
          Bstate,
          Tstate,
          obstacles,
          from,
          to,
          lanceLungeUsed,
          currentBoardSize
        );

        // Update history AFTER getting new rolls
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMove = newHistory[newHistory.length - 1];
          if (lastMove && lastMove.combat) {
            lastMove.combat.attackerRolls = out.a.rolls; // Update with NEW rolls
            lastMove.rerolledBy = "attacker";
          }
          return newHistory;
        });

        setFx({ ...fx, a: out.a, ok: out.ok, adv: out.adv, isReroll: true });

        // Update display value to show the new roll
        setDispA(out.a.total);

        setTimeout(
          () => finishRockCombat(out.ok, lanceLungeUsed, from, to),
          TMG.rerollFinish
        );
      } else {
        // 'piece'
        const t = Bstate[to.y]?.[to.x]; // Safe navigation
        if (!t) return;
        const lanceLungeUsed =
          p.equip === "lance" &&
          to.y === from.y + (p.color === W ? 1 : -1) * 2 &&
          to.x === from.x;

        // Reroll BOTH attacker and defender dice
        let newA: number, newD: number, newRollsA: number[], newRollsD: number[];

        const attackerHadAdvantage =
          fx?.kind === "piece" &&
          Array.isArray(fx.a?.rolls) &&
          fx.a.rolls.length > 1;
        const defenderHadAdvantage =
          fx?.kind === "piece" &&
          Array.isArray(fx.d?.rolls) &&
          fx.d.rolls.length > 1;

        // Reroll attacker's dice
        const useAdvA = attackerHadAdvantage || p.type === "K" || lanceLungeUsed;
        newRollsA = [d6(rngRef.current)];
        if (useAdvA) newRollsA.push(d6(rngRef.current));
        newA = useAdvA ? Math.max(...newRollsA) : newRollsA[0];

        // Reroll defender's dice (preserve veteran advantage if present)
        newRollsD = [d6(rngRef.current)];
        if (defenderHadAdvantage) newRollsD.push(d6(rngRef.current));
        newD = defenderHadAdvantage ? Math.max(...newRollsD) : newRollsD[0];

        // Update history AFTER getting new rolls (both attacker and defender rerolled)
        setMoveHistory((hist) => {
          const newHistory = [...hist];
          const lastMove = newHistory[newHistory.length - 1];
          if (lastMove && lastMove.combat) {
            lastMove.combat.attackerRolls = newRollsA; // Update with NEW rolls
            lastMove.combat.defenderRolls = newRollsD; // Update with NEW rolls
            lastMove.rerolledBy = isPlayerAttacking ? "attacker" : "defender";
          }
          return newHistory;
        });

        // Update both attacker and defender fx since both are rerolled
        const newFxA = {
          ...fx.a,
          base: newA,
          total: newA + fx.a.mods.reduce((s: number, m: any) => s + m.value, 0),
          rolls: newRollsA,
        };
        const newFxD = {
          ...fx.d,
          base: newD,
          total: newD + fx.d.mods.reduce((s: number, m: any) => s + m.value, 0),
          rolls: newRollsD,
        };
        const newWin = newFxA.total >= newFxD.total;

        setFx({ ...fx, a: newFxA, d: newFxD, win: newWin, adv: useAdvA, isReroll: true });

        // Update display values to trigger animation for both dice
        // The rerolled dice will show the new value, the other will bump/settle
        setDispA(newFxA.total);
        setDispD(newFxD.total);

        setTimeout(() => {
          const loser = newWin
            ? isPlayerAttacking
              ? t
              : p
            : isPlayerAttacking
            ? p
            : t;
          const winner = newWin
            ? isPlayerAttacking
              ? p
              : t
            : isPlayerAttacking
            ? t
            : p;

          if (loser) {
            let idsToDestroy = [loser.id];
            if (newWin && loser.equip === "skull" && winner) {
              idsToDestroy.push(winner.id);
            }
            setDestroyedPieceIds(idsToDestroy);
          }
          if (newWin) {
            sfx.capture();
          } else {
            sfx.combatLose();
          }

          setTimeout(() => {
            finishPieceCombat({ win: newWin }, lanceLungeUsed, from, to);
          }, 400);
        }, TMG.rerollFinish);
      }
    } else {
      // Player chose not to reroll
      const lanceLungeUsed =
        p.equip === "lance" &&
        to.y === from.y + (p.color === W ? 1 : -1) * 2 &&
        to.x === from.x;
      if (kind === "obstacle") {
        finishRockCombat(fx.ok, lanceLungeUsed, from, to);
      } else {
        const loser = fx.win ? Bstate[to.y]?.[to.x] : Bstate[from.y]?.[from.x]; // Safe navigation
        const winner = fx.win ? Bstate[from.y]?.[from.x] : Bstate[to.y]?.[to.x]; // Safe navigation
        if (loser) {
          let idsToDestroy = [loser.id];
          if (fx.win && loser.equip === "skull" && winner) {
            idsToDestroy.push(winner.id);
          }
          setDestroyedPieceIds(idsToDestroy);
          if (loser.color === W) {
            sfx.combatLose();
          } // Play sound only if player lost
          // Skull death sound is handled in finishPieceCombat now
          setTimeout(() => {
            finishPieceCombat(fx, lanceLungeUsed, from, to);
          }, 400);
        } else {
          // Should not happen in piece vs piece, but just in case
          finishPieceCombat(fx, lanceLungeUsed, from, to);
        }
      }
    }
    setRerollState(null);
    setPhase("playing");
  };

  const handleDisguiseChoice = (breakDisguise: boolean) => {
    if (!disguisePopupState) return;

    const { x, y } = disguisePopupState;
    const B1 = cloneB(Bstate);
    const p = B1[y]?.[x]; // Safe navigation

    if (!p || !p.originalType) return;

    if (breakDisguise) {
      sfx.reveal();
      p.type = p.originalType;
      p.originalType = undefined;
      p.equip = undefined;
      setB(B1);
      setSel({ x, y });
      // We need to calculate moves based on the *newly revealed* piece on the new board state
      setLegal(moves(B1, Tstate, obstacles, x, y, currentBoardSize));
    } else {
      setSel({ x, y });
      setLegal(moves(B1, Tstate, obstacles, x, y, currentBoardSize));
    }

    setDisguisePopupState(null);
    setPhase("playing");
  };

  const disguisedPiece = disguisePopupState
    ? Bstate[disguisePopupState.y]?.[disguisePopupState.x] // Safe navigation
    : null;
  const originalPieceType = disguisedPiece?.originalType;

  // --- Roguelike handlers ---
  const handleTryAgain = () => {
    // TRIGGER: Stop music when resetting game
    musicManagerRef.current?.stopMusic();
    
    // Fully reset run and return to Intro popup
    // Clear localStorage to remove all saved data
    localStorage.removeItem("dicechess_campaign_v1");
    
    setIsRetryingLevel(false);
    setShowIntro(true);
    setShowTransition(false);
    setCurrentStoryCard(null);
    setStoryCardQueue([]);
    setStoryOutcome(null);
    setPhase("market");
    setMarketViewVisible(true); // Reset to market visible when entering market phase
    setWin(null);
    setMarketPoints(0);
    setUnspentGold(0);
    setKilledEnemyPieces([]);
    setPlayerPiecesLost([]);
    setThisLevelUnlockedItems([]);
    setObjectiveStates([]);
    setActiveObjectiveIds([]);
    setNewlyCompletedObjectives([]);
    setNewlyFailedObjectives([]);
    setLastVictoryInfo(null);
    setCampaign({
      level: 1,
      whiteRoster: [],
      prayerDice: 2,
      unlockedItems: [],
      freeUnits: new Map(),
      freeItems: new Map(),
      tutorialsSeen: [],
    });
    // Clear tutorial-related localStorage flags for new game
    localStorage.removeItem("dicechess_first_combat_tutorial_used");
    // Trigger fresh init
    setSeed(new Date().toISOString() + "-newgame");
  };

  const handleRetryLevel = () => {
    if (!levelStartSnapshot) {
      handleTryAgain();
      return;
    }

    setIsRetryingLevel(true);
    localStorage.setItem(
      "dicechess_campaign_v1",
      JSON.stringify({
        ...levelStartSnapshot,
        freeUnits: Array.from(levelStartSnapshot.freeUnits.entries()),
        freeItems: Array.from(levelStartSnapshot.freeItems.entries()),
      })
    );

    setShowIntro(false);
    setShowTransition(false);
    setStoryOutcome(null);
    setCurrentStoryCard(null);
    setStoryCardQueue([]);
    setWin(null);
    setKilledEnemyPieces([]);
    setThisLevelUnlockedItems([]);
    setDestroyedCourtiers(0);
    setObjectiveStates([]);
    setActiveObjectiveIds([]);
    setNewlyCompletedObjectives([]);
    setNewlyFailedObjectives([]);
    setLastVictoryInfo(null);
    setMarketPoints(0);
    setShowVictoryDetails(false);
    setUnspentGold(levelStartSnapshot.gold);

    loadLevelConfig(levelStartSnapshot.level).then((config) => {
      setCurrentLevelConfig(config);
      // Preload all story card images for this level
      if (config.storyCards && config.storyCards.length > 0) {
        preloadStoryCardImages(config.storyCards).catch((err) => {
          console.warn("Failed to preload some story card images:", err);
        });
      }
      setCampaign({
        level: levelStartSnapshot.level,
        whiteRoster: [...levelStartSnapshot.whiteRoster],
        prayerDice: levelStartSnapshot.prayerDice,
        unlockedItems: [...levelStartSnapshot.unlockedItems],
        freeUnits: new Map(levelStartSnapshot.freeUnits),
        freeItems: new Map(levelStartSnapshot.freeItems),
        tutorialsSeen: [...levelStartSnapshot.tutorialsSeen],
        difficulty: levelStartSnapshot.difficulty,
      });
      setSeed(new Date().toISOString() + "-retry");
    });
  };

  // Comprehensive reset function for dev tools - resets everything to fresh state
  const handleResetEverything = () => {
    // TRIGGER: Stop music when resetting everything (dev tool)
    musicManagerRef.current?.stopMusic();
    
    // Clear all localStorage items
    localStorage.removeItem("dicechess_campaign_v1");
    localStorage.removeItem("dicechess_first_combat_tutorial_used");
    localStorage.removeItem("dicechess_tutorial_popups_enabled");
    
    // Reset all game state
    setIsRetryingLevel(false);
    setShowTransition(false);
    setShowIntro(true);
    setCurrentStoryCard(null);
    setStoryCardQueue([]);
    setStoryOutcome(null);
    setPhase("market");
    setMarketViewVisible(true);
    setWin(null);
    setMarketPoints(100); // Reset to starting gold
    setUnspentGold(0);
    setKilledEnemyPieces([]);
    setThisLevelUnlockedItems([]);
    setObjectiveStates([]);
    setActiveObjectiveIds([]);
    setNewlyCompletedObjectives([]);
    setNewlyFailedObjectives([]);
    setLastVictoryInfo(null);
    setCampaign({
      level: 1,
      whiteRoster: [],
      prayerDice: 2,
      unlockedItems: [],
      freeUnits: new Map(),
      freeItems: new Map(),
      tutorialsSeen: [],
    });
    
    // Reset tutorial settings to default (enabled)
    setEnableTutorialPopups(true);
    
    // Reset other UI state
    setShowVictoryDetails(false);
    setShowDevPanel(false);
    
    // Trigger fresh init
    setSeed(new Date().toISOString() + "-newgame");
  };

  // Function to show end-of-demo cards (used by both handleNextLevel and dev tools)
  const showEndOfDemoCards = () => {
    // Create End-of-Story story cards
    const endOfStoryCard: StoryCardType = {
      id: "end_of_story",
      bodyText: "The King's enemies are **scattered**, his dominion restored.",
      image: `${process.env.PUBLIC_URL}/demo_end_EdranWins.png`,
      leftChoice: {
        text: "Sounds too good to be true...!",
        events: [{ type: "next_card", cardId: "middle_card" }],
        overlayColor: "rgba(101, 67, 33, 0.85)",
      },
      rightChoice: {
        text: "Peace at last!",
        events: [{ type: "next_card", cardId: "middle_card" }],
        overlayColor: "rgba(101, 67, 33, 0.85)",
      },
    };

    const middleCard: StoryCardType = {
      id: "middle_card",
      bodyText: "But with the Bell of Names destroyed... deep within the vaults beneath the castle, **something** stirs... calling out.. **Eoohhmeerr**.",
      image: `${process.env.PUBLIC_URL}/demo_end_horror.png`,
      leftChoice: {
        text: "...maybe Morcant was onto something.",
        events: [{ type: "next_card", cardId: "thanks_for_playing" }],
        overlayColor: "rgba(101, 67, 33, 0.85)",
      },
      rightChoice: {
        text: "...Dad?!",
        events: [{ type: "next_card", cardId: "thanks_for_playing" }],
        overlayColor: "rgba(101, 67, 33, 0.85)",
      },
    };

    const thanksForPlayingCard: StoryCardType = {
      id: "thanks_for_playing",
      bodyText: "Thank **you** for playing this demo!",
      image: `${process.env.PUBLIC_URL}/demo_end_sunpowder.png`,
      leftChoice: {
        text: "It was mid",
        events: [{ type: "reset_to_title" }],
        overlayColor: "rgba(147, 51, 234, 0.85)",
      },
      rightChoice: {
        text: "I enjoyed it!",
        events: [{ type: "reset_to_title" }],
      },
    };

    // Clear victory popup and queue the end-of-story cards
    setShowVictoryDetails(false);
    setWin(null);
    setKilledEnemyPieces([]);
    setThisLevelUnlockedItems([]);
    
    // Queue the story cards
    const endCards = [endOfStoryCard, middleCard, thanksForPlayingCard];
    setStoryCardQueue(endCards);
    // Preload images for end-of-story cards
    preloadStoryCardImages(endCards).catch((err) => {
      console.warn("Failed to preload some end-of-story card images:", err);
    });
    // Show the first card immediately
    setCurrentStoryCard(endOfStoryCard);
    
    // TRIGGER: Start end game music
    musicManagerRef.current?.playEndGameMusic();
  };

  const handleNextLevel = () => {
    // Check if this is level 5 - if so, show end-of-story cards instead of progressing
    if (campaign.level === 5) {
      showEndOfDemoCards();
      return;
    }

    // Normal level progression (for levels 1-4)
    // Calculate ransom gold (35% of regular pieces and items, excluding Kings)
    // Count purses separately (25g each, not subject to ransom %)
    const purseCount = killedEnemyPieces.filter((kp) => kp.piece.equip === "purse").length;
    const purseGold = purseCount * 25;

    const regularValue = killedEnemyPieces.reduce((sum, killedPiece) => {
      const piece = killedPiece.piece;

      // Skip Kings - they get full value, not ransom percentage
      if (piece.type === "K") return sum;

      // Regular piece values
      const pieceValue = VAL[piece.type as keyof typeof VAL] || 0;

      let itemValue = 0;
      if (piece.equip) {
        if (piece.equip !== "purse") {
          itemValue = ITEM_COSTS[piece.equip as keyof typeof ITEM_COSTS] || 0;
        }
      }
      return sum + pieceValue + itemValue;
    }, 0);
    const ransomGold = Math.floor(regularValue * 0.35);

    // Calculate King gold (full value, not ransom percentage)
    const kingGold = killedEnemyPieces.reduce((sum, killedPiece) => {
      const piece = killedPiece.piece;
      if (piece.type === "K" && killedPiece.defeatType) {
        switch (killedPiece.defeatType) {
          case "beheaded":
            return sum + 20;
          case "dishonored":
            return sum + 10;
          case "checkmate":
            return sum + 40;
        }
      }
      return sum;
    }, 0);

    // Calculate objective bonus gold (only for active objectives)
    const activeObjectives = currentLevelConfig?.optionalObjectives?.filter(
      obj => activeObjectiveIds.includes(obj.id)
    ) || [];
    const objectiveBonus = calculateObjectiveBonus(
      activeObjectives,
      objectiveStates,
      campaign.difficulty
    );

    const totalGoldEarned = ransomGold + purseGold + kingGold + objectiveBonus;

    // Total gold to carry over = current unspent + ransom + king gold + objective bonus
    const totalGoldToCarry = marketPoints + totalGoldEarned;

    setUnspentGold(totalGoldToCarry); // Carry over all gold to next level
    setShowVictoryDetails(false); // Reset for next level
    setWin(null); // Clear win state
    setKilledEnemyPieces([]); // Clear killed pieces for next level
    setThisLevelUnlockedItems([]); // Clear unlocked items for next level
    setObjectiveStates([]); // Clear objectives for next level
    setActiveObjectiveIds([]); // Clear active objectives
    setNewlyCompletedObjectives([]); // Clear completed objectives
    setNewlyFailedObjectives([]); // Clear failed objectives
    setPlayerPiecesLost([]);
    setLastVictoryInfo(null);
    
    // TRIGGER: Stop music when transitioning to next level's story cards
    musicManagerRef.current?.stopMusic();
    
    const nextLevel = campaign.level + 1;
    setCampaign((prev) => ({
      ...prev,
      level: nextLevel,
      unlockedItems: prev.unlockedItems || [], // Preserve unlocked items
    }));
    // Generate a new seed that incorporates the level to ensure variation
    setSeed(new Date().toISOString() + `-level-${nextLevel}`);
    // useEffect watching seed AND campaign.level will call init with the correct (new) level and the saved unspentGold
    // init will load story cards into storyCardQueue, and we'll show the first one immediately
  };

  return (
    <div className="min-h-screen text-white p-6 flex items-center justify-center relative">
      <MusicManager
        ref={musicManagerRef}
        musicMuted={musicMuted}
      />
      {showIntro && !isRetryingLevel && <MainMenu onEnter={handleIntroComplete} />}
      {showDifficultyTransition && (
        <div className="difficulty-transition-overlay">
          <div className="difficulty-transition-spiral" />
          <div className="difficulty-transition-text-container">
            {(difficultyTransitionLine === 0 || difficultyTransitionLine === 'fade1') && (
              <div className={`difficulty-transition-line difficulty-transition-line-1 ${difficultyTransitionLine === 'fade1' ? 'fading' : ''}`}>
                {difficultyTransitionLine === 0 ? difficultyTransitionText : "Murky Kingdoms' Highkeep."}
              </div>
            )}
            {(difficultyTransitionLine === 1 || difficultyTransitionLine === 'fade2') && (
              <div className={`difficulty-transition-line difficulty-transition-line-2 ${difficultyTransitionLine === 'fade2' ? 'fading' : ''}`}>
                {difficultyTransitionLine === 1 ? difficultyTransitionText : "Year of the See, 1165."}
              </div>
            )}
          </div>
        </div>
      )}
      {showTransition && (
        <div className="transition-overlay">
          <div className="transition-banner left" />
          <div className="transition-banner right" />
          <div className="transition-seal">
            <div className="transition-text">To Arms!</div>
          </div>
        </div>
      )}

      {/* Game Rules Modal */}
      {showRules && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[2000] p-4"
          onClick={(e) => {
            // Close modal when clicking the backdrop
            if (e.target === e.currentTarget) {
              setShowRules(false);
            }
          }}
        >
          <div className="relative w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowRules(false)}
              className="absolute top-4 right-4 text-white hover:text-gray-300 text-2xl font-bold bg-stone-900 rounded-full w-8 h-8 flex items-center justify-center z-10"
              aria-label="Close Game Rules"
            >
              ×
            </button>
            <div className="bg-stone-950 rounded-2xl p-6 max-h-[85vh] overflow-y-auto border-2 border-amber-900">
              <h2 className="text-3xl font-bold mb-6 text-center">Game Rules</h2>
              <RulesContent 
                showItemInfo={showRulesItemInfo}
                setShowItemInfo={setShowRulesItemInfo}
              />
            </div>
          </div>
        </div>
      )}

      {/* Story Card System - only show if intro is dismissed and transition is not active */}
      {!showIntro && !showDifficultyTransition && (currentStoryCard || storyOutcome) && (
        <StoryCard
          card={
            currentStoryCard ||
            storyOutcome?.lastCard || {
              id: "temp",
              bodyText: "",
              leftChoice: { text: "", events: [] },
              rightChoice: { text: "", events: [] },
            }
          }
          onChoice={handleStoryEvents}
          outcomeMode={
            storyOutcome
              ? {
                  outcomes: storyOutcome.outcomes,
                  onContinue: handleOutcomeAcknowledged,
                }
              : undefined
          }
          enableIdleAnimation={campaign.level === 1}
        />
      )}

      <div style={{ display: (showIntro || showTransition || showDifficultyTransition || currentStoryCard || storyOutcome) ? "none" : "block" }}>
        <div className="max-w-[2000px] mx-auto flex gap-8 justify-center flex-wrap md:flex-nowrap">
          <div className="order-1 w-full max-w-lg">
            {/* Market removed from here - now positioned over the board */}
          </div>

          {/* Quest Panel Column - Left side of board, always visible */}
          <div className="order-2 w-80 flex-shrink-0 self-start" style={{ marginTop: '84px' }}>
            <div className="sticky top-4 flex flex-col gap-4">
              {/* Quest Panel with perspective - aligned with chessboard */}
              <div className="stand">
                <div className="bg-gradient-to-b from-amber-900/40 via-stone-950/90 to-stone-950/95 rounded-lg shadow-2xl border-4 border-amber-700/50 backdrop-blur-sm overflow-hidden">
                {/* Decorative Top Border */}
                <div className="h-2 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600"></div>
                
                {/* Quest Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-amber-800/30 to-amber-900/30 border-b-2 border-amber-700/40">
                  <h2 className="text-2xl font-bold text-center text-amber-200 tracking-wide" style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                    ⚔️ QUEST ⚔️
                  </h2>
                </div>
                
                {/* Quest Narration */}
                <div className="px-6 py-4 bg-gradient-to-b from-stone-950/50 to-stone-950/70">
                  <p className="text-amber-100 text-sm leading-relaxed text-center italic" style={{ fontFamily: 'serif' }}>
                    {currentLevelConfig?.questNarration || "Secure victory through cunning and valor."}
                  </p>
                </div>
                
                {/* Divider */}
                <div className="h-px bg-gradient-to-r from-transparent via-amber-600 to-transparent mx-6"></div>
                
                {/* Victory Conditions */}
                <div className="px-6 py-4">
                  <h3 className="text-amber-300 font-bold text-center mb-3 tracking-wider" style={{ fontFamily: 'serif' }}>
                    Victory Conditions
                  </h3>
                  <div className="flex flex-col gap-2 text-sm text-white">
                    {(currentLevelConfig?.displayedVictoryConditions || currentLevelConfig?.victoryConditions || []).map((condition: string, idx: number) => {
                      const formatVictoryCondition = (condition: string) => {
                        switch (condition) {
                          case "king_beheaded":
                            return "Regicide";
                          case "king_captured":
                            return "King Captured (Checkmate)";
                          case "king_dishonored":
                            return "King Dishonored";
                          case "king_escaped":
                            return "King Crossing";
                          default:
                            return condition;
                        }
                      };
                      const getDescription = (condition: string) => {
                        // Check for level-specific description first
                        if (currentLevelConfig?.victoryConditionDescriptions?.[condition as keyof typeof currentLevelConfig.victoryConditionDescriptions]) {
                          return currentLevelConfig.victoryConditionDescriptions[condition as keyof typeof currentLevelConfig.victoryConditionDescriptions];
                        }
                        // Default descriptions
                        switch (condition) {
                          case "king_beheaded":
                            return "Capture the enemy King in combat";
                          case "king_captured":
                            return "Checkmate the enemy King";
                          case "king_dishonored":
                            return "Capture the enemy King with a Staff";
                          case "king_escaped":
                            return "Bring your King to the golden squares";
                          default:
                            return "";
                        }
                      };
                      const description = getDescription(condition);
                      const isConditionFulfilled = win === W && lastVictoryInfo?.condition === condition;
                      return (
                        <div key={idx} className="flex flex-col gap-1 bg-black/20 rounded p-2 border border-amber-700/30">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-lg quest-objective-text ${isConditionFulfilled ? "text-emerald-400" : "text-amber-400"}`}
                              aria-hidden="true"
                            >
                              {isConditionFulfilled ? "✓" : "○"}
                            </span>
                            <span className="font-semibold text-amber-100 quest-objective-text">
                              {formatVictoryCondition(condition)}
                            </span>
                          </div>
                          {description && (
                            <span className="text-gray-300 italic text-xs ml-6 quest-objective-text">
                              {description}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Optional Objectives Section */}
                {currentLevelConfig?.optionalObjectives && activeObjectiveIds.length > 0 && (
                  <>
                    {/* Divider */}
                    <div className="h-px bg-gradient-to-r from-transparent via-amber-600/50 to-transparent mx-6"></div>
                    
                    <div className="px-6 py-4">
                      <h3 className="text-amber-300 font-bold text-center mb-3 tracking-wider" style={{ fontFamily: 'serif' }}>
                        Optional Objectives
                      </h3>
                      <div className="flex flex-col gap-2 text-sm text-white">
                        {currentLevelConfig.optionalObjectives
                          .filter(obj => activeObjectiveIds.includes(obj.id))
                          .map((objective, idx) => {
                          const objectiveState = objectiveStates.find(s => s.objectiveId === objective.id);
                          const isCompleted = objectiveState?.isCompleted || false;
                          const isFailed = objectiveState?.isFailed || false;
                          
                          // Format description with dynamic parameters and progress
                          const displayDescription = formatObjectiveDescription(
                            objective,
                            objectiveState,
                            { difficulty: campaign.difficulty }
                          );
                          
                          // Get reward based on difficulty
                          const reward = campaign.difficulty && objective.rewardByDifficulty?.[campaign.difficulty] !== undefined
                            ? objective.rewardByDifficulty[campaign.difficulty]
                            : objective.reward;
                          
                          const frameClasses = isCompleted
                            ? "bg-blue-900/20 border-blue-500/40"
                            : isFailed
                            ? "bg-red-900/20 border-red-500/40"
                            : "bg-black/20 border-amber-700/30";

                          return (
                            <div 
                              key={idx} 
                              className={`flex flex-col gap-1 rounded p-2 border transition-all duration-300 ${frameClasses}`}
                              style={{
                                animation: isCompleted
                                  ? 'objective-complete 0.5s ease-out'
                                  : isFailed
                                  ? 'objective-failed 0.5s ease-out'
                                  : 'none'
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                <span 
                                  className={`text-lg transition-all duration-300 ${
                                    isCompleted
                                      ? 'text-blue-400'
                                      : isFailed
                                      ? 'text-red-400'
                                      : 'text-orange-500'
                                  }`}
                                >
                                  {isCompleted ? '✓' : isFailed ? '✗' : '○'}
                                </span>
                                  <span
                                    className={`font-semibold quest-objective-text ${
                                      isCompleted
                                        ? 'text-blue-200'
                                        : isFailed
                                        ? 'text-red-200 line-through'
                                        : 'text-amber-100'
                                    }`}
                                  >
                                    {displayDescription}
                                  </span>
                                </div>
                                <span
                                  className={`text-xs font-semibold quest-objective-reward ${
                                    isFailed ? 'text-red-200 line-through' : 'text-yellow-300'
                                  }`}
                                >
                                  +{reward}g
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                
                {/* Start Battle Button */}
                {phase === "market" && currentLevelConfig?.marketEnabled !== false && (
                  <div className="px-6 pb-6">
                    <button
                      ref={startBattleBtnRef}
                      onClick={() => {
                        // Check for unspent gold and show confirmation if needed
                        const marketEnabled = currentLevelConfig?.marketEnabled !== false;
                        // Only show popup if market is enabled AND there's more than 20g unspent
                        if (marketPoints > 20 && marketEnabled) {
                          setShowMarketConfirm(true);
                        } else {
                          playBattleTrumpet();
                          handleStartBattle();
                        }
                      }}
                      className="w-full px-8 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xl shadow-lg relative overflow-hidden"
                      style={{
                        animation: 'pulse-glow 2s ease-in-out infinite',
                        boxShadow: '0 0 20px rgba(16, 185, 129, 0.5), 0 0 40px rgba(16, 185, 129, 0.3)',
                      }}
                    >
                      <span className="relative z-10">START BATTLE</span>
                    </button>
                  </div>
                )}
                
                {/* Decorative Bottom Border */}
                <div className="h-2 bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600"></div>
                </div>
              </div>

              {/* Settings Dropdown - Below Quest Panel */}
              <SettingsDropdown
                showRules={showRules}
                setShowRules={setShowRules}
                muted={muted}
                setMuted={setMuted}
                musicMuted={musicMuted}
                setMusicMuted={setMusicMuted}
                fastMode={fastMode}
                setFastMode={setFastMode}
                showBoardTooltips={showBoardTooltips}
                setShowBoardTooltips={setShowBoardTooltips}
                enableTutorialPopups={enableTutorialPopups}
                setEnableTutorialPopups={setEnableTutorialPopups}
                setCampaign={setCampaign}
                handleTryAgain={handleTryAgain}
                win={win}
              />
            </div>
          </div>

          <div className="order-3 flex flex-col items-center">
            {/* Chapter title and player resources above chessboard */}
            <div className="w-full flex justify-between items-center mb-2 px-4" style={{ maxWidth: '100%' }}>
              {/* Chapter title - left aligned */}
              <div className="text-2xl font-bold text-white" style={{ fontFamily: 'serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                {currentLevelConfig?.name || `Level ${campaign.level}`}
              </div>
              {/* Player resources - right aligned */}
              <div className="flex items-center gap-3 font-bold text-2xl">
                <span>🙏</span>
                <span className="text-purple-400">x{prayerDice}</span>
                <span>💰</span>
                <span className="text-amber-400">{marketPoints}g</span>
              </div>
            </div>
            <div className="stand" ref={boardRef} style={{ position: 'relative' }}>
              <BoardComponent
                board={Bstate}
                T={Tstate}
                obstacles={obstacles}
                V={vis}
                sel={sel}
                legal={legal}
                click={click}
                fx={fx}
                phase={phase}
                dispA={dispA}
                dispD={dispD}
                bumpA={bumpA}
                bumpD={bumpD}
                wChk={wChk}
                bChk={bChk}
                speechBubble={speechBubble}
                marketAction={marketAction}
                rerollState={rerollState}
                rerollTarget={rerollTarget}
                combatId={combatIdRef.current}
                destroyedPieceIds={destroyedPieceIds}
                failedAttackId={failedAttackId}
                showBoardTooltips={showBoardTooltips}
                showTooltip={showTooltip}
                hideTooltip={hideTooltip}
                drag={drag}
                startDrag={startDrag}
                lastMove={lastMove}
                moveAnim={moveAnim}
                sellPiece={sellPiece}
                sellButtonPos={sellButtonPos}
                setSellButtonPos={setSellButtonPos}
                boardSize={currentBoardSize}
                victoryConditions={currentLevelConfig?.victoryConditions || ["king_beheaded", "king_captured", "king_dishonored"]}
                setSpeechBubble={setSpeechBubble}
                currentLevelConfig={currentLevelConfig}
                kingEscapeGuideActive={kingEscapeGuideLineVisible}
                kingEscapeGuideOpacity={kingEscapeGuideLineOpacity}
              />
              
              {/* Market Overlay - positioned over the board during market phase */}
              {phase === "market" && currentLevelConfig?.marketEnabled !== false && (
                <>
                  {marketViewVisible && (
                    <div className="market-overlay" style={{
                      position: 'absolute',
                      top: '0',
                      left: '0',
                      right: '0',
                      bottom: '176px', // Leave space for bottom 2 rows (2 * 88px)
                      zIndex: 100,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '20px',
                      pointerEvents: 'none'
                    }}>
                      <div style={{ pointerEvents: 'auto', maxWidth: '500px', width: '100%' }}>
                        <Market
                          showTooltip={showTooltip}
                          hideTooltip={hideTooltip}
                          levelConfig={currentLevelConfig}
                          campaign={campaign}
                          marketPoints={marketPoints}
                          setMarketPoints={setMarketPoints}
                          setMarketAction={setMarketAction}
                          setPrayerDice={setPrayerDice}
                          setCampaign={setCampaign}
                          sfx={sfx}
                          setMarketViewVisible={setMarketViewVisible}
                        />
                      </div>
                    </div>
                  )}
                  
                </>
              )}
            </div>
            
            {/* Market View / Battlefield View Buttons - Under chessboard */}
            {phase === "market" && currentLevelConfig?.marketEnabled !== false && (
              <div className="mt-4 flex justify-center w-full">
                {marketViewVisible ? (
                  <button
                    data-view-battlefield="true"
                    onClick={() => setMarketViewVisible(false)}
                    className="px-4 py-3 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold text-lg shadow-lg transition-colors"
                  >
                    👁️ VIEW BATTLEFIELD
                  </button>
                ) : (
                  <button
                    onClick={() => setMarketViewVisible(true)}
                    className="px-4 py-3 rounded-lg bg-amber-700 hover:bg-amber-600 text-white font-bold text-lg shadow-lg transition-colors"
                  >
                    👁️ MARKET VIEW
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Move History Column - Right side */}
          {phase !== "market" && (
            <div className="order-4 w-96 flex-shrink-0 self-start" style={{ marginTop: '70px' }}>
              <div className="sticky top-4" style={{
                transform: 'perspective(900px) rotateX(3deg)',
                transformOrigin: 'center top'
              }}>
                <MoveHistoryLog history={moveHistory} phase={phase} turn={turn} win={win} phrase={phrase} />
              </div>
            </div>
          )}
        </div>

        {showMarketConfirm && modalPosition && (
          <TutorialPopup
            message="You have unspent gold!"
            subMessage="Are you sure you want to start the battle?"
            onCancel={() => setShowMarketConfirm(false)}
            onConfirm={() => {
              setShowMarketConfirm(false);
              playBattleTrumpet();
              handleStartBattle();
            }}
            cancelText="GO BACK"
            confirmText="START BATTLE"
            position={modalPosition}
          />
        )}

        {/* Mechanic Tutorial Popups */}
        {currentTutorial && tutorialPosition && (() => {
          const content = getTutorialContent(currentTutorial);
          // Market tutorials use button positioning, all board tutorials are centered
          const isMarketButtonTutorial = currentTutorial === "market_view_battlefield";
          // All board-related tutorials (single_combat, supporting_units, king_advantage, etc.) are centered
          const shouldCenter = !isMarketButtonTutorial;
          return (
            <TutorialPopup
              message={content.title}
              subMessage={content.body}
              onConfirm={closeTutorial}
              confirmText="ONWARD"
              imageBanner={content.imageBanner}
              position={shouldCenter ? undefined : tutorialPosition}
              centered={shouldCenter}
            />
          );
        })()}

        {/* Updated Win/Loss Modal */}
        <VictoryPopup
          win={win}
          showVictoryDetails={showVictoryDetails}
          phrase={phrase}
          thisLevelUnlockedItems={thisLevelUnlockedItems}
          killedEnemyPieces={killedEnemyPieces}
          destroyedCourtiers={destroyedCourtiers}
          handleNextLevel={handleNextLevel}
          handleTryAgain={handleTryAgain}
          handleRetryLevel={handleRetryLevel}
          winModalPosition={winModalPosition}
          currentLevelConfig={currentLevelConfig}
          objectiveStates={objectiveStates}
          activeObjectiveIds={activeObjectiveIds}
          difficulty={campaign.difficulty}
        />

        {phase === "awaiting_reroll" && rerollState && rerollPopupPosition && !pausedForTutorial && (
          <div
            className="fixed inset-0 bg-black/70 z-[2000]"
            onClick={() => handleReroll(false)}
          >
            <div
              className="bg-stone-950/90 backdrop-blur rounded-2xl shadow-2xl text-white text-center absolute border-2 border-amber-900/50 overflow-hidden"
              style={{
                top: `${rerollPopupPosition.top}px`,
                left: `${rerollPopupPosition.left}px`,
                transform: "translate(-50%, -50%)",
                zIndex: 2100,
                fontFamily: 'Georgia, serif',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 2px rgba(212, 175, 55, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-full overflow-hidden">
                <img src={`${process.env.PUBLIC_URL}/popup_PrayerDice.png`} alt="Prayer Die" className="w-full h-auto object-contain block" />
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold mb-3 text-amber-200" style={{ fontFamily: 'Georgia, serif', textShadow: '2px 2px 4px rgba(0,0,0,0.8)' }}>
                  Roll Failed!
                </h3>
                <p className="mb-5 text-gray-200 italic" style={{ fontFamily: 'Georgia, serif' }}>
                  Pray to the Eye for divine intervention?
                  <br />
                  <span className="text-purple-400 font-semibold">(🙏 x{prayerDice} remaining)</span>
                </p>
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => handleReroll(false)}
                    className="px-6 py-2.5 rounded-lg bg-amber-900/80 hover:bg-amber-800/90 font-bold border border-amber-700/50 transition-colors"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => handleReroll(true)}
                    className="px-6 py-2.5 rounded-lg bg-purple-400 hover:bg-purple-300 text-purple-950 font-bold border border-purple-500/50 transition-colors shadow-lg"
                    style={{ fontFamily: 'Georgia, serif', boxShadow: '0 4px 12px rgba(167, 139, 250, 0.4)' }}
                  >
                    Pray 🙏
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {phase === "awaiting_disguise_choice" &&
          disguisePopupState &&
          disguisePopupPosition && (
            <div
              className="fixed inset-0 bg-black/60 z-50"
              onClick={() => {
                setDisguisePopupState(null);
                setPhase("playing");
              }}
            >
              <div
                className="bg-stone-900 rounded-2xl p-5 shadow-lg text-white text-center absolute"
                style={{
                  top: `${disguisePopupPosition.top}px`,
                  left: `${disguisePopupPosition.left}px`,
                  transform: "translate(-50%, -110%)",
                  zIndex: 100,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-bold mb-3">Break Disguise?</h3>
                <div className="flex justify-center gap-4 mt-4">
                  <button
                    onClick={() => handleDisguiseChoice(false)}
                    className="px-5 py-2 rounded-lg bg-amber-900 hover:bg-amber-800 font-bold"
                  >
                    Move as Pawn
                  </button>
                  {originalPieceType && PIECE_NAMES[originalPieceType as keyof typeof PIECE_NAMES] && (
                    <button
                      onClick={() => handleDisguiseChoice(true)}
                      className="px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 font-bold"
                    >
                      Reveal {PIECE_NAMES[originalPieceType as keyof typeof PIECE_NAMES]} (
                      {/* Ensure originalPieceType is a valid key before accessing GL */}
                      {(() => {
                        const glyphSet = GL[originalPieceType as keyof typeof GL];
                        return glyphSet && W in glyphSet ? glyphSet[W as keyof typeof glyphSet] : "?";
                      })()})
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        {moveAnim &&
          (() => {
            if (!boardRef.current) return null;
            const boardRect = boardRef.current.getBoundingClientRect();
            const fromVisualY = currentBoardSize - 1 - moveAnim.from.y;
            const fromPos = {
              left: boardRect.left + 12 + 24 + moveAnim.from.x * 88,
              top: boardRect.top + 12 + fromVisualY * 88,
            };
            const toVisualY = currentBoardSize - 1 - moveAnim.to.y;
            const toPos = {
              left: boardRect.left + 12 + 24 + moveAnim.to.x * 88 + 6,
              top: boardRect.top + 12 + toVisualY * 88 + 2,
            };
            const dx = toPos.left - fromPos.left;
            const dy = toPos.top - fromPos.top;

            return createPortal(
              <div
                className="moving-piece"
                style={{
                  position: "fixed",
                  top: fromPos.top,
                  left: fromPos.left,
                  transform: `translate3d(${dx}px, ${dy}px, 0)`,
                  transition: `transform ${PIECE_MOVE_MS}ms ${PIECE_MOVE_EASE}`,
                  pointerEvents: "none",
                  zIndex: 80,
                  width: "88px",
                  height: "88px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  className={`chip ${moveAnim.color === "w" ? "pw" : "pb"}`}
                >
                  {moveAnim.glyph}
                </span>
                {moveAnim.equip && (
                  <span className="equip-icon">
                    {equipIcon(moveAnim.equip)}
                  </span>
                )}
              </div>,
              document.body
            );
          })()}
        {drag &&
          createPortal(
            <div
              style={{
                position: "fixed",
                left: drag.clientX - drag.offsetX,
                top: drag.clientY - drag.offsetY,
                pointerEvents: "none",
                zIndex: 80,
                width: "88px",
                height: "88px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: "scale(1.1)",
                transformOrigin: `${drag.offsetX}px ${drag.offsetY}px`,
              }}
            >
              <span className={`chip ${drag.color === "w" ? "pw" : "pb"}`}>
                {drag.glyph}
              </span>
              {drag.equip && (
                <span className="equip-icon">{equipIcon(drag.equip)}</span>
              )}
            </div>,
            document.body
          )}
      </div>

      <TooltipLayer tip={tooltip} />
      {namingState && nameInputPosition && (
        <NameInputComponent
          position={nameInputPosition}
          onConfirm={handleNameConfirm}
          onCancel={handleNameCancel}
        />
      )}
      
      {/* ========== DEV TOOLS - COMMENT OUT BEFORE RELEASE ========== */}
      {showDevPanel && (
        <div
          style={{
            position: "fixed",
            top: 10,
            right: 10,
            zIndex: 10000,
            background: "rgba(0, 0, 0, 0.9)",
            color: "#00ff00",
            padding: "12px",
            borderRadius: "8px",
            fontFamily: "monospace",
            fontSize: "12px",
            border: "2px solid #00ff00",
            minWidth: "180px",
          }}
        >
          <div style={{ marginBottom: "8px", fontWeight: "bold", fontSize: "14px" }}>
            🛠️ DEV TOOLS <span style={{ fontSize: "10px", opacity: 0.6 }}>(Ctrl/Cmd+D)</span>
          </div>
          <div style={{ marginBottom: "8px", fontSize: "11px", opacity: 0.8 }}>
            Current Level: <strong>{campaign.level}</strong>
          </div>
          <div style={{ marginBottom: "8px", fontSize: "10px", opacity: 0.6 }}>
            Jump to Level:
          </div>
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                onClick={() => {
                  setCampaign((prev) => ({
                    ...prev,
                    level,
                    whiteRoster: [], // Reset roster when jumping levels
                  }));
                  setShowIntro(true); // Show intro popup which leads to story cards
                  setWin(null);
                  // Let init() handle phase setting - don't override it here
                  // Generate new seed to trigger re-init
                  setSeed(new Date().toISOString() + `-level-${level}`);
                }}
                style={{
                  background: campaign.level === level ? "#00ff00" : "#222",
                  color: campaign.level === level ? "#000" : "#00ff00",
                  border: "1px solid #00ff00",
                  padding: "6px 12px",
                  cursor: "pointer",
                  borderRadius: "4px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                  fontWeight: "bold",
                  transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                  if (campaign.level !== level) {
                    e.currentTarget.style.background = "#333";
                  }
                }}
                onMouseLeave={(e) => {
                  if (campaign.level !== level) {
                    e.currentTarget.style.background = "#222";
                  }
                }}
              >
                Level {level}
              </button>
            ))}
          </div>
          <div style={{ marginBottom: "8px", fontSize: "10px", opacity: 0.6 }}>
            Quick Actions:
          </div>
          <button
            onClick={() => {
              showEndOfDemoCards();
              setShowDevPanel(false);
            }}
            style={{
              background: "#9932cc",
              color: "#fff",
              border: "1px solid #9932cc",
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
              fontWeight: "bold",
              width: "100%",
              marginBottom: "8px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#ba55d3";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#9932cc";
            }}
          >
            End
          </button>
          <button
            onClick={() => {
              handleResetEverything();
            }}
            style={{
              background: "#ff6b00",
              color: "#fff",
              border: "1px solid #ff6b00",
              padding: "6px 12px",
              cursor: "pointer",
              borderRadius: "4px",
              fontFamily: "monospace",
              fontSize: "12px",
              fontWeight: "bold",
              width: "100%",
              marginBottom: "8px",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#ff8800";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#ff6b00";
            }}
          >
            Reset Everything
          </button>
          <button
            onClick={() => setShowDevPanel(false)}
            style={{
              background: "#ff0000",
              color: "#fff",
              border: "none",
              padding: "6px 10px",
              cursor: "pointer",
              borderRadius: "4px",
              fontSize: "11px",
              width: "100%",
              fontWeight: "bold",
            }}
          >
            Hide Panel
          </button>
        </div>
      )}
      {/* ============================================================ */}
    </div>
  );
}
